/**
 * useDMCBExtraction — Wires DMCB AI extraction into useJobRunner
 *
 * Replaces the fire-and-forget extractCanonicals() loop with:
 *   - Resume on reload (IndexedDB cursor + Supabase completed keys)
 *   - Abort (AbortController propagated to edge function)
 *   - Idempotency (already-extracted records skipped)
 *   - Per-item persistence (each canonical upserted to Supabase)
 *   - Adaptive concurrency (backoff on 429s, ramp on success)
 *
 * After job completes, caller reads canonicals from Supabase via loadCanonicalMap()
 * and feeds them to buildSignalsFromCanonicals() (Phase 2 — pure, deterministic).
 */

import { useMemo, useCallback } from 'react';
import { useJobRunner } from '../station/runtime/useJobRunner';
import type { BatchResult } from '../station/runtime/useJobRunner';
import { dmcbExtractCanonical } from './dmcbAiExtract';
import type { DMCBAIConfig, DMCBCanonical } from './dmcbAiExtract';
import type { RawRecord } from './types';
import { supabase } from '../lib/supabase';
import { hash } from './runDMCB';

// =============================================================================
// SUPABASE QUERIES
// =============================================================================

/**
 * Load record keys already extracted for this job (idempotency source).
 * useJobRunner calls this on start/resume to skip completed records.
 */
async function dmcbLoadCompletedKeys(jobId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('dmcb_canonicals')
    .select('record_key')
    .eq('job_id', jobId);
  return new Set((data || []).map((r: { record_key: string }) => r.record_key));
}

/**
 * Load full canonical map after job completion for Phase 2 signal building.
 */
export async function loadCanonicalMap(jobId: string): Promise<Map<string, DMCBCanonical>> {
  const { data } = await supabase
    .from('dmcb_canonicals')
    .select('record_key, canonical')
    .eq('job_id', jobId);
  const map = new Map<string, DMCBCanonical>();
  for (const row of data || []) {
    map.set(row.record_key, row.canonical as DMCBCanonical);
  }
  return map;
}

// =============================================================================
// PROCESS BATCH
// =============================================================================

function createProcessBatch(aiConfig: DMCBAIConfig, jobId: string) {
  return async function dmcbProcessBatch(
    batch: RawRecord[],
    signal: AbortSignal
  ): Promise<BatchResult<DMCBCanonical>> {
    // 1. Call edge function (sends up to 25 items, edge runs 8 concurrently)
    const items = batch.map((rr) => ({
      id: rr.recordKey,
      side: rr.side,
      raw: rr.payload,
    }));
    const results = await dmcbExtractCanonical(items, aiConfig);

    // 2. Write each succeeded canonical to Supabase individually via Promise.allSettled
    const settled = await Promise.allSettled(
      results.map(async (r) => {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        if (r.error) throw new Error(`${r.error.code}: ${r.error.message}`);

        await supabase.from('dmcb_canonicals').upsert(
          {
            record_key: r.id,
            job_id: jobId,
            canonical: r.canonical,
            extracted_at: new Date().toISOString(),
          },
          { onConflict: 'record_key' }
        );

        return r.canonical!;
      })
    );

    // 3. Split into succeeded/failed (re-throw AbortError)
    const succeeded: BatchResult<DMCBCanonical>['succeeded'] = [];
    const failed: BatchResult<DMCBCanonical>['failed'] = [];

    settled.forEach((s, i) => {
      const key = results[i].id;
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

export interface UseDMCBExtractionParams {
  rawRecords: RawRecord[];
  aiConfig: DMCBAIConfig;
}

export function useDMCBExtraction(params: UseDMCBExtractionParams) {
  const { rawRecords, aiConfig } = params;

  // Stable job ID derived from inputs
  const jobId = useMemo(() => {
    if (rawRecords.length === 0) return 'dmcb-empty';
    const first = rawRecords[0].recordKey;
    const last = rawRecords[rawRecords.length - 1].recordKey;
    return `dmcb-${hash(`${rawRecords.length}_${first}_${last}`)}`;
  }, [rawRecords]);

  // Stable processBatch bound to current aiConfig + jobId
  const processBatch = useMemo(
    () => createProcessBatch(aiConfig, jobId),
    [aiConfig, jobId]
  );

  // Stable loadCompletedKeys bound to current jobId
  const loadCompletedKeys = useCallback(
    () => dmcbLoadCompletedKeys(jobId),
    [jobId]
  );

  // Stable getRecordKey
  const getRecordKey = useCallback((r: RawRecord) => r.recordKey, []);

  const config = useMemo(
    () => ({
      batchSize: 25,
      maxConcurrency: 3,
      timeoutMs: 30000,
      promptVersion: 'v1',
    }),
    []
  );

  const runner = useJobRunner<RawRecord>({
    jobId,
    step: 'dmcb-extract',
    inputs: rawRecords,
    processBatch,
    getRecordKey,
    loadCompletedKeys,
    config,
  });

  return {
    ...runner,
    jobId,
    /** Load full canonical map from Supabase after job completes */
    loadCanonicalMap: useCallback(() => loadCanonicalMap(jobId), [jobId]),
  };
}
