/**
 * useMCPEvaluation — Wires MCP pair evaluation into useJobRunner
 *
 * V2: Batched evaluation (100 pairs per prompt), BYOK routing.
 *
 * Pattern: same as useDMCBExtraction.
 *   - processBatch: build MCPEvaluationInput from CandidatePair[] → call mcp-enhance → upsert to mcp_evaluations
 *   - loadCompletedKeys: SELECT eval_id FROM mcp_evaluations WHERE job_id = ?
 *   - Resume, abort, idempotency come free from useJobRunner.
 */

import { useMemo, useCallback } from 'react';
import { useJobRunner } from '../station/runtime/useJobRunner';
import type { BatchResult } from '../station/runtime/useJobRunner';
import type { CandidatePair } from './topKRetrieval';
import type { DMCBAIConfig } from '../dmcb/dmcbAiExtract';
import { supabase } from '../lib/supabase';
import { simpleHash } from '../enrichment/recordKey';

// =============================================================================
// TYPES — MCP Enhance V2 edge function contract
// =============================================================================

interface MCPEvaluationInput {
  evalId: string;
  demand: {
    key: string;
    who: string;
    wants: string;
    why_now: string;
    constraints: string[];
    segment: string;
  };
  supply: {
    key: string;
    who: string;
    offers: string; // Rule 4: always "offers"
    segment: string;
  };
}

interface MCPEvalResult {
  evalId: string;
  scores: { fit: number; timing: number; combined: number };
  classification: 'PASS' | 'MARGINAL' | 'QUARANTINE' | 'HARD_DROP';
  readiness: 'READY' | 'WARMING' | 'NOT_YET';
  vetoed: boolean;
  veto_reason: string | null;
  risks: string[];
  framing: string;
  reasoning: string;
  error?: string;
}

interface MCPEnhanceResponse {
  results: MCPEvalResult[];
}

// =============================================================================
// AI CONFIG → EDGE FUNCTION FORMAT
// =============================================================================

function buildEdgeAIConfig(ai: DMCBAIConfig): Record<string, unknown> {
  const config: Record<string, unknown> = { provider: ai.provider, model: ai.model };
  if (ai.provider === 'openai') config.openaiApiKey = ai.openaiApiKey;
  else if (ai.provider === 'azure') {
    config.azureApiKey = ai.azureApiKey;
    config.azureEndpoint = ai.azureEndpoint;
    config.azureChatDeployment = ai.azureChatDeployment;
  } else if (ai.provider === 'anthropic') {
    config.anthropicApiKey = ai.anthropicApiKey;
  }
  return config;
}

// =============================================================================
// SUPABASE QUERIES
// =============================================================================

async function mcpLoadCompletedKeys(jobId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('mcp_evaluations')
    .select('eval_id')
    .eq('job_id', jobId);
  return new Set((data || []).map((r: { eval_id: string }) => r.eval_id));
}

// =============================================================================
// CALL EDGE FUNCTION (V2: batched, sends `pairs` not `items`)
// =============================================================================

async function callMCPEnhance(
  pairs: MCPEvaluationInput[],
  ai: DMCBAIConfig,
): Promise<MCPEvalResult[]> {
  const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp-enhance`;

  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairs, ai: buildEdgeAIConfig(ai) }),
    });

    if (!res.ok) {
      return pairs.map((p) => ({
        evalId: p.evalId,
        scores: { fit: 0, timing: 0, combined: 0 },
        classification: 'QUARANTINE' as const,
        readiness: 'NOT_YET' as const,
        vetoed: false,
        veto_reason: null,
        risks: [],
        framing: '',
        reasoning: '',
        error: `NETWORK: Edge function returned ${res.status}`,
      }));
    }

    const data: MCPEnhanceResponse = await res.json();
    if (!data.results || !Array.isArray(data.results)) {
      return pairs.map((p) => ({
        evalId: p.evalId,
        scores: { fit: 0, timing: 0, combined: 0 },
        classification: 'QUARANTINE' as const,
        readiness: 'NOT_YET' as const,
        vetoed: false,
        veto_reason: null,
        risks: [],
        framing: '',
        reasoning: '',
        error: 'BAD_JSON: Edge function returned invalid response',
      }));
    }

    return data.results;
  } catch (err) {
    return pairs.map((p) => ({
      evalId: p.evalId,
      scores: { fit: 0, timing: 0, combined: 0 },
      classification: 'QUARANTINE' as const,
      readiness: 'NOT_YET' as const,
      vetoed: false,
      veto_reason: null,
      risks: [],
      framing: '',
      reasoning: '',
      error: `NETWORK: ${(err as Error).message}`,
    }));
  }
}

// =============================================================================
// PROCESS BATCH (100 pairs → 1 AI call via edge function)
// =============================================================================

function createProcessBatch(aiConfig: DMCBAIConfig, jobId: string) {
  return async function mcpProcessBatch(
    batch: CandidatePair[],
    signal: AbortSignal,
  ): Promise<BatchResult<MCPEvalResult>> {
    // Build MCPEvaluationInput from CandidatePair
    const pairs: MCPEvaluationInput[] = batch.map((pair) => ({
      evalId: pair.evalId,
      demand: {
        key: pair.demandSignal.recordKey,
        who: pair.demandSignal.intent.who,
        wants: pair.demandSignal.intent.wants,
        why_now: pair.demandSignal.intent.why_now,
        constraints: pair.demandSignal.intent.constraints,
        segment: pair.demandSignal.segment,
      },
      supply: {
        key: pair.supplySignal.recordKey,
        who: pair.supplySignal.intent.who,
        offers: pair.supplySignal.intent.wants, // synthesizeIntent maps offers→wants for supply
        segment: pair.supplySignal.segment,
      },
    }));

    // Call edge function (single call for entire batch of 100)
    const results = await callMCPEnhance(pairs, aiConfig);

    // Upsert each result to Supabase
    const settled = await Promise.allSettled(
      results.map(async (r) => {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        if (r.error) throw new Error(r.error);

        const pair = batch.find((p) => p.evalId === r.evalId);

        await supabase.from('mcp_evaluations').upsert(
          {
            eval_id: r.evalId,
            job_id: jobId,
            demand_key: pair?.demandSignal.recordKey || '',
            supply_key: pair?.supplySignal.recordKey || '',
            scores: r.scores,
            classification: r.classification,
            readiness: r.readiness,
            vetoed: r.vetoed,
            veto_reason: r.veto_reason,
            risks: r.risks,
            framing: r.framing,
            reasoning: r.reasoning,
            evaluated_at: new Date().toISOString(),
          },
          { onConflict: 'eval_id,job_id' },
        );

        return r;
      }),
    );

    // Split into succeeded/failed
    const succeeded: BatchResult<MCPEvalResult>['succeeded'] = [];
    const failed: BatchResult<MCPEvalResult>['failed'] = [];

    settled.forEach((s, i) => {
      const key = results[i].evalId;
      if (s.status === 'fulfilled') {
        succeeded.push({ key, result: s.value });
      } else {
        if (s.reason?.name === 'AbortError') throw s.reason;
        failed.push({ key, reason: s.reason?.message || 'Unknown' });
      }
    });

    return { succeeded, failed };
  };
}

// =============================================================================
// HOOK
// =============================================================================

export interface UseMCPEvaluationParams {
  candidatePairs: CandidatePair[];
  aiConfig: DMCBAIConfig;
}

export function useMCPEvaluation(params: UseMCPEvaluationParams) {
  const { candidatePairs, aiConfig } = params;

  // Stable job ID derived from inputs
  const jobId = useMemo(() => {
    if (candidatePairs.length === 0) return 'mcp-eval-empty';
    const first = candidatePairs[0].evalId;
    const last = candidatePairs[candidatePairs.length - 1].evalId;
    return `mcp-eval-${simpleHash(`${candidatePairs.length}_${first}_${last}`)}`;
  }, [candidatePairs]);

  const processBatch = useMemo(
    () => createProcessBatch(aiConfig, jobId),
    [aiConfig, jobId],
  );

  const loadCompletedKeys = useCallback(
    () => mcpLoadCompletedKeys(jobId),
    [jobId],
  );

  const getRecordKey = useCallback((p: CandidatePair) => p.evalId, []);

  // V2 config: 100 pairs per prompt, concurrency 6
  const config = useMemo(
    () => ({
      batchSize: 100,
      maxConcurrency: 6,
      timeoutMs: 60000,
      promptVersion: 'v2',
    }),
    [],
  );

  const runner = useJobRunner<CandidatePair>({
    jobId,
    step: 'mcp-evaluate',
    inputs: candidatePairs,
    processBatch,
    getRecordKey,
    loadCompletedKeys,
    config,
  });

  return {
    ...runner,
    jobId,
  };
}
