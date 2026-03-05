/**
 * useEmbedding — Wires signal embedding into useJobRunner
 *
 * Platform infrastructure step. Embeds canonical signal intent text
 * using text-embedding-3-small via our platform key (NOT user's BYOK key).
 *
 * Text construction rules:
 *   - Demand: embed(wants + " " + why_now)
 *   - Supply: embed(offers — stored in intent.wants by synthesizeIntent)
 *   - NEVER embed context fields
 */

import { useMemo, useCallback } from 'react';
import { useJobRunner } from '../station/runtime/useJobRunner';
import type { BatchResult } from '../station/runtime/useJobRunner';
import type { CanonicalSignal } from '../dmcb/types';
import { supabase } from '../lib/supabase';

// =============================================================================
// TYPES
// =============================================================================

interface EmbedSignalInput {
  record_key: string;
  text: string;
}

interface EmbedResult {
  record_key: string;
  embedding: number[];
}

interface EmbedResponse {
  embeddings?: EmbedResult[];
  error?: string;
}

// =============================================================================
// TEXT CONSTRUCTION (Rule 1: wants + why_now for demand, offers for supply)
// =============================================================================

function buildEmbeddingText(signal: CanonicalSignal): string {
  if (signal.side === 'demand') {
    // Demand: wants + why_now
    const parts = [signal.intent.wants, signal.intent.why_now].filter(Boolean);
    return parts.join(' ').trim();
  } else {
    // Supply: offers (stored in intent.wants by synthesizeIntent)
    return (signal.intent.wants || '').trim();
  }
}

// =============================================================================
// CALL EDGE FUNCTION
// =============================================================================

async function callEmbedSignals(
  signals: EmbedSignalInput[],
  jobId: string,
  side: 'demand' | 'supply',
): Promise<EmbedResult[]> {
  const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/embed-signals`;

  const res = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signals, jobId, side }),
  });

  if (!res.ok) {
    throw new Error(`embed-signals returned ${res.status}`);
  }

  const data: EmbedResponse = await res.json();
  if (data.error) throw new Error(data.error);
  return data.embeddings || [];
}

// =============================================================================
// SUPABASE QUERIES
// =============================================================================

async function loadCompletedEmbeddingKeys(jobId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('signal_embeddings')
    .select('record_key')
    .eq('job_id', jobId);
  return new Set((data || []).map((r: { record_key: string }) => r.record_key));
}

// =============================================================================
// PROCESS BATCH
// =============================================================================

function createProcessBatch(jobId: string) {
  return async function embedProcessBatch(
    batch: CanonicalSignal[],
    signal: AbortSignal,
  ): Promise<BatchResult<EmbedResult>> {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    // Split by side (edge function expects uniform side per call)
    const demandSignals = batch.filter(s => s.side === 'demand');
    const supplySignals = batch.filter(s => s.side === 'supply');

    const allResults: EmbedResult[] = [];

    // Process demand
    if (demandSignals.length > 0) {
      const items = demandSignals.map(s => ({
        record_key: s.recordKey,
        text: buildEmbeddingText(s),
      }));
      const results = await callEmbedSignals(items, jobId, 'demand');
      allResults.push(...results);
    }

    // Process supply
    if (supplySignals.length > 0) {
      const items = supplySignals.map(s => ({
        record_key: s.recordKey,
        text: buildEmbeddingText(s),
      }));
      const results = await callEmbedSignals(items, jobId, 'supply');
      allResults.push(...results);
    }

    // Map results to succeeded/failed
    const succeeded: BatchResult<EmbedResult>['succeeded'] = [];
    const failed: BatchResult<EmbedResult>['failed'] = [];

    const resultKeys = new Set(allResults.map(r => r.record_key));
    for (const s of batch) {
      if (resultKeys.has(s.recordKey)) {
        const result = allResults.find(r => r.record_key === s.recordKey)!;
        succeeded.push({ key: s.recordKey, result });
      } else {
        failed.push({ key: s.recordKey, reason: 'No embedding returned' });
      }
    }

    return { succeeded, failed };
  };
}

// =============================================================================
// HOOK
// =============================================================================

export interface UseEmbeddingParams {
  signals: CanonicalSignal[];
  jobId: string;
}

export function useEmbedding(params: UseEmbeddingParams) {
  const { signals, jobId } = params;

  const embeddingJobId = useMemo(
    () => `embed-${jobId}`,
    [jobId],
  );

  const processBatch = useMemo(
    () => createProcessBatch(embeddingJobId),
    [embeddingJobId],
  );

  const loadCompletedKeys = useCallback(
    () => loadCompletedEmbeddingKeys(embeddingJobId),
    [embeddingJobId],
  );

  const getRecordKey = useCallback((s: CanonicalSignal) => s.recordKey, []);

  const config = useMemo(
    () => ({
      batchSize: 100,
      maxConcurrency: 4,
      timeoutMs: 30000,
      promptVersion: 'embed-v1',
    }),
    [],
  );

  const runner = useJobRunner<CanonicalSignal>({
    jobId: embeddingJobId,
    step: 'embed-signals',
    inputs: signals,
    processBatch,
    getRecordKey,
    loadCompletedKeys,
    config,
  });

  return {
    ...runner,
    jobId: embeddingJobId,
  };
}
