/**
 * MCP ENHANCEMENT LAYER — Phase 18 + Phase 19 + Phase 23 + Phase 24
 *
 * Async, non-blocking enrichment of deterministic evaluations.
 * MCP is enhancement-only — never source of truth.
 *
 * Rules:
 *  - Never reorder, delete, or recreate evaluations
 *  - NEVER overwrite deterministic fields (match_score, readiness, status, ordering)
 *  - If MCP fails → return originals unchanged (swallow errors)
 *  - Preserve existing ai if new result has error
 *  - Send only synthesized data (no raw records)
 *  - Phase 24: return per-item errors for station diagnosis; warn once per code per session
 */

import { supabase } from '../lib/supabase';
import type { Evaluation, EvaluationAI } from './Evaluation';

// AI config passed from Flow.tsx (same shape as ai-proxy)
export interface MCPAIConfig {
  provider: 'openai' | 'azure' | 'anthropic';
  apiKey: string;
  model?: string;
  endpoint?: string;    // Azure only
  deployment?: string;  // Azure only
}

// Phase 24: return evaluations + any per-item errors for station diagnosis
export interface EnhanceResult {
  evaluations: Evaluation[];
  mcpErrors: string[];
}

// Request item shape — Phase 23 contract (richer than Phase 19)
interface MCPEvaluationInput {
  id: string;
  demand_record_key: string;
  supply_record_key: string;
  match_score: number;
  readiness: string;
  why_match: string;
  suggested_framing: string;
}

// Per-item response from edge function (Phase 23 contract)
interface MCPItemResult {
  id: string;
  ai?: EvaluationAI;
  error?: string;
}

// Full response shape
interface MCPEnhanceResponse {
  results: MCPItemResult[];
}

// Phase 24: warn once per code per session (zero spam)
const warnedCodes = new Set<string>();

function warnOnce(code: string, detail: string): void {
  if (warnedCodes.has(code)) return;
  warnedCodes.add(code);
  console.warn(`[MCP] ${code}: ${detail}`);
}

export async function enhanceEvaluations(
  evaluations: Evaluation[],
  aiConfig: MCPAIConfig | null,
): Promise<EnhanceResult> {
  if (evaluations.length === 0) return { evaluations, mcpErrors: [] };
  if (!aiConfig) return { evaluations, mcpErrors: [] };

  // Build batch payload — Phase 23 enriched input
  const items: MCPEvaluationInput[] = evaluations.map(ev => ({
    id: ev.id,
    demand_record_key: ev.demand_record_key,
    supply_record_key: ev.supply_record_key,
    match_score: ev.scores.match_score,
    readiness: ev.scores.readiness,
    why_match: ev.reasoning.why_match,
    suggested_framing: ev.suggested_framing,
  }));

  // Build AI config block for edge function
  const ai: Record<string, unknown> = {
    provider: aiConfig.provider,
    model: aiConfig.model,
  };
  if (aiConfig.provider === 'openai') {
    ai.openaiApiKey = aiConfig.apiKey;
  } else if (aiConfig.provider === 'azure') {
    ai.azureApiKey = aiConfig.apiKey;
    ai.azureEndpoint = aiConfig.endpoint;
    ai.azureDeployment = aiConfig.deployment;
  } else if (aiConfig.provider === 'anthropic') {
    ai.anthropicApiKey = aiConfig.apiKey;
  }

  try {
    const { data, error } = await supabase.functions.invoke('mcp-enhance', {
      body: { items, ai },
    });

    if (error || !data?.results) {
      warnOnce('NETWORK', error?.message || 'no results');
      return { evaluations, mcpErrors: [] };
    }

    const response = data as MCPEnhanceResponse;

    // Build lookup by id + collect errors
    const aiByID = new Map<string, EvaluationAI>();
    const mcpErrors: string[] = [];
    for (const r of response.results) {
      if (r.ai && !r.error) {
        aiByID.set(r.id, r.ai);
      } else if (r.error) {
        mcpErrors.push(r.error);
        const code = r.error.split(':')[0]?.trim() || 'UNKNOWN';
        warnOnce(code, r.error);
      }
    }

    // Safe merge: NEVER overwrite deterministic fields. Only attach ai.
    // Preserve existing ai if new result has error (don't wipe previous enrichment).
    const nowISO = new Date().toISOString();
    const merged = evaluations.map(ev => {
      const newAI = aiByID.get(ev.id);
      if (!newAI) return ev; // No new AI → keep existing (including existing ev.ai)
      return {
        ...ev,
        ai: { ...ev.ai, ...newAI, at: newAI.at || nowISO },
      };
    });

    return { evaluations: merged, mcpErrors };
  } catch (err) {
    warnOnce('EXCEPTION', err instanceof Error ? err.message : 'Unknown');
    return { evaluations, mcpErrors: [] };
  }
}
