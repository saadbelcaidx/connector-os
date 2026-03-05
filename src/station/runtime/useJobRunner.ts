/**
 * useJobRunner — Durable, abortable, resumable client-side batch job runner
 *
 * Generic over input type. Caller provides processBatch (writes to Supabase)
 * and loadCompletedKeys (queries Supabase for idempotency).
 *
 * IndexedDB = orchestration cursor only. Supabase = system truth.
 * Loss of IndexedDB never loses data.
 */

import { useState, useCallback, useRef } from 'react';
import { loadJob, updateJob, type JobState, type JobStatus } from '../../core/jobStorage';

// =============================================================================
// TYPES
// =============================================================================

export interface BatchResultEntry<TResult = unknown> {
  key: string;
  result: TResult;
}

export interface BatchResultFailure {
  key: string;
  reason: string;
}

export interface BatchResult<TResult = unknown> {
  succeeded: BatchResultEntry<TResult>[];
  failed: BatchResultFailure[];
}

export interface JobProgress {
  total: number;
  processed: number;
  accepted: number;
  rejected: number;
  failed: number;
  concurrency: number;
}

export interface UseJobRunnerParams<TInput> {
  jobId: string;
  step: string;
  inputs: TInput[];
  processBatch: (batch: TInput[], signal: AbortSignal) => Promise<BatchResult<unknown>>;
  getRecordKey: (input: TInput) => string;
  loadCompletedKeys: () => Promise<Set<string>>;
  config: {
    batchSize: number;
    maxConcurrency: number;
    timeoutMs: number;
    promptVersion: string;
  };
}

export interface UseJobRunnerReturn {
  start: () => void;
  pause: () => void;
  abort: () => void;
  resume: () => void;
  status: JobStatus;
  progress: JobProgress;
}

// =============================================================================
// HELPERS
// =============================================================================

function computeInputsHash<TInput>(
  inputs: TInput[],
  getRecordKey: (input: TInput) => string
): string {
  if (inputs.length === 0) return '0__';
  return `${inputs.length}_${getRecordKey(inputs[0])}_${getRecordKey(inputs[inputs.length - 1])}`;
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  signal: AbortSignal
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Timeout'));
      }
    }, ms);

    const onAbort = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      }
    };
    signal.addEventListener('abort', onAbort, { once: true });

    promise.then(
      (val) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          resolve(val);
        }
      },
      (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          reject(err);
        }
      }
    );
  });
}

function createEmptyJobState(
  jobId: string,
  step: string,
  inputsHash: string,
  total: number,
  config: UseJobRunnerParams<unknown>['config']
): JobState {
  return {
    jobId,
    createdAt: Date.now(),
    status: 'idle',
    cursor: { step, nextIndex: 0 },
    stats: { total, processed: 0, accepted: 0, rejected: 0, failed: 0 },
    config: {
      batchSize: config.batchSize,
      maxConcurrency: config.maxConcurrency,
      timeoutMs: config.timeoutMs,
      promptVersion: config.promptVersion,
    },
    inputsHash,
  };
}

// =============================================================================
// HOOK
// =============================================================================

export function useJobRunner<TInput>(
  params: UseJobRunnerParams<TInput>
): UseJobRunnerReturn {
  const { jobId, step, inputs, processBatch, getRecordKey, loadCompletedKeys, config } = params;

  const [status, setStatus] = useState<JobStatus>('idle');
  const [progress, setProgress] = useState<JobProgress>({
    total: inputs.length,
    processed: 0,
    accepted: 0,
    rejected: 0,
    failed: 0,
    concurrency: 0,
  });

  // Refs for mutable state that the run loop reads
  const abortControllerRef = useRef<AbortController | null>(null);
  const pauseRequestedRef = useRef(false);
  const isRunningRef = useRef(false);
  const jobStateRef = useRef<JobState | null>(null);
  const completedSetRef = useRef<Set<string>>(new Set());

  // Adaptive concurrency state
  const currentConcurrencyRef = useRef(2);
  const backoffMsRef = useRef(0);
  const consecutiveErrorsRef = useRef(0);

  const updateProgress = useCallback((stats: JobState['stats'], concurrency: number) => {
    setProgress({
      total: stats.total,
      processed: stats.processed,
      accepted: stats.accepted,
      rejected: stats.rejected,
      failed: stats.failed,
      concurrency,
    });
  }, []);

  const runLoop = useCallback(async (freshStart: boolean) => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    pauseRequestedRef.current = false;

    const ac = new AbortController();
    abortControllerRef.current = ac;

    const inputsHash = computeInputsHash(inputs, getRecordKey);

    // --- Load or create job state ---
    let jobState: JobState;
    if (freshStart) {
      jobState = createEmptyJobState(jobId, step, inputsHash, inputs.length, config);
    } else {
      const stored = await loadJob(jobId);
      if (stored && stored.inputsHash === inputsHash) {
        jobState = stored;
      } else {
        // Hash mismatch or no stored state — start fresh
        jobState = createEmptyJobState(jobId, step, inputsHash, inputs.length, config);
      }
    }

    jobState.status = 'running';
    jobState.stats.total = inputs.length;
    jobStateRef.current = jobState;
    updateJob(jobState);
    setStatus('running');
    updateProgress(jobState.stats, currentConcurrencyRef.current);

    // --- Load completed keys from Supabase (idempotency source) ---
    let completedSet: Set<string>;
    try {
      completedSet = await loadCompletedKeys();
    } catch (e) {
      console.error('[useJobRunner] Failed to load completed keys, starting with empty set:', e);
      completedSet = new Set();
    }
    completedSetRef.current = completedSet;

    // --- Filter inputs: skip already-completed ---
    const remaining = inputs.filter((input) => !completedSet.has(getRecordKey(input)));

    if (remaining.length === 0) {
      jobState.status = 'completed';
      jobState.stats.processed = inputs.length;
      updateJob(jobState);
      setStatus('completed');
      updateProgress(jobState.stats, 0);
      isRunningRef.current = false;
      console.log(`[useJobRunner] Job ${jobId}: All items already completed`);
      return;
    }

    // --- Slice into batches ---
    const batches: TInput[][] = [];
    for (let i = 0; i < remaining.length; i += config.batchSize) {
      batches.push(remaining.slice(i, i + config.batchSize));
    }

    console.log(`[useJobRunner] Job ${jobId}: ${remaining.length} items in ${batches.length} batches (${completedSet.size} already done)`);

    // --- Sliding concurrency window ---
    let batchIndex = 0;
    const inflight = new Set<Promise<void>>();

    const scheduleBatch = (): Promise<void> | null => {
      if (batchIndex >= batches.length) return null;
      if (pauseRequestedRef.current) return null;
      if (ac.signal.aborted) return null;

      const batch = batches[batchIndex];
      const currentBatchIdx = batchIndex;
      batchIndex++;

      const batchPromise = (async () => {
        // Backoff wait
        if (backoffMsRef.current > 0) {
          await new Promise((r) => setTimeout(r, backoffMsRef.current));
        }

        try {
          const result = await withTimeout(
            processBatch(batch, ac.signal),
            config.timeoutMs,
            ac.signal
          );

          // Success — update stats from settled results
          jobState.stats.processed += result.succeeded.length + result.failed.length;
          jobState.stats.accepted += result.succeeded.length;
          jobState.stats.failed += result.failed.length;
          jobState.cursor.nextIndex += config.batchSize;

          // Track completed keys locally (only succeeded)
          for (const entry of result.succeeded) {
            completedSetRef.current.add(entry.key);
          }

          // Checkpoint to IndexedDB
          updateJob(jobState);
          updateProgress(jobState.stats, currentConcurrencyRef.current);

          // Adaptive concurrency
          if (result.failed.length > 0) {
            // Back off on partial failures
            consecutiveErrorsRef.current++;
            currentConcurrencyRef.current = Math.max(1, Math.floor(currentConcurrencyRef.current / 2));
            const hasRateLimit = result.failed.some((f) => f.reason.includes('429'));
            if (hasRateLimit || consecutiveErrorsRef.current > 1) {
              backoffMsRef.current = Math.min(30000, (backoffMsRef.current || 2000) * 2);
            }
            console.log(`[useJobRunner] Batch ${currentBatchIdx + 1}/${batches.length} partial — ${result.succeeded.length} ok, ${result.failed.length} failed`);
          } else {
            // Ramp up on clean success
            consecutiveErrorsRef.current = 0;
            backoffMsRef.current = 0;
            currentConcurrencyRef.current = Math.min(currentConcurrencyRef.current + 1, config.maxConcurrency);
            console.log(`[useJobRunner] Batch ${currentBatchIdx + 1}/${batches.length} done — ${jobState.stats.processed}/${jobState.stats.total} processed`);
          }

        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            return;
          }

          // Unrecoverable error (network dead, auth expired) — count entire batch as failed
          jobState.stats.failed += batch.length;
          jobState.stats.processed += batch.length;
          jobState.cursor.nextIndex += config.batchSize;
          updateJob(jobState);
          updateProgress(jobState.stats, currentConcurrencyRef.current);

          consecutiveErrorsRef.current++;
          currentConcurrencyRef.current = Math.max(1, Math.floor(currentConcurrencyRef.current / 2));
          backoffMsRef.current = Math.min(30000, (backoffMsRef.current || 2000) * 2);

          console.warn(`[useJobRunner] Batch ${currentBatchIdx + 1} UNRECOVERABLE:`, err instanceof Error ? err.message : err);
        }
      })();

      return batchPromise;
    };

    // Main scheduling loop
    try {
      while (batchIndex < batches.length && !pauseRequestedRef.current && !ac.signal.aborted) {
        // Fill up to currentConcurrency
        while (
          inflight.size < currentConcurrencyRef.current &&
          batchIndex < batches.length &&
          !pauseRequestedRef.current &&
          !ac.signal.aborted
        ) {
          const p = scheduleBatch();
          if (!p) break;
          const tracked = p.finally(() => inflight.delete(tracked));
          inflight.add(tracked);
        }

        // Wait for at least one to complete before scheduling more
        if (inflight.size > 0) {
          await Promise.race(inflight);
        }
      }

      // Wait for all remaining inflight to drain
      if (inflight.size > 0) {
        await Promise.allSettled(inflight);
      }
    } catch (e) {
      console.error('[useJobRunner] Unrecoverable loop error:', e);
      jobState.status = 'failed';
      updateJob(jobState);
      setStatus('failed');
      updateProgress(jobState.stats, 0);
      isRunningRef.current = false;
      return;
    }

    // --- Determine final status ---
    if (ac.signal.aborted) {
      jobState.status = 'aborted';
    } else if (pauseRequestedRef.current) {
      jobState.status = 'paused';
    } else {
      jobState.status = 'completed';
    }

    updateJob(jobState);
    setStatus(jobState.status);
    updateProgress(jobState.stats, 0);
    isRunningRef.current = false;

    console.log(`[useJobRunner] Job ${jobId} finished with status: ${jobState.status}`);
  }, [jobId, step, inputs, processBatch, getRecordKey, loadCompletedKeys, config, updateProgress]);

  const start = useCallback(() => {
    // Reset adaptive concurrency for fresh start
    currentConcurrencyRef.current = 2;
    backoffMsRef.current = 0;
    consecutiveErrorsRef.current = 0;
    runLoop(true);
  }, [runLoop]);

  const resume = useCallback(() => {
    // Keep current adaptive concurrency on resume
    runLoop(false);
  }, [runLoop]);

  const pause = useCallback(() => {
    pauseRequestedRef.current = true;
    // Inflight batches will drain, then loop exits and persists "paused"
  }, []);

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    // Persist status immediately
    if (jobStateRef.current) {
      jobStateRef.current.status = 'aborted';
      updateJob(jobStateRef.current);
    }
    setStatus('aborted');
  }, []);

  return { start, pause, abort, resume, status, progress };
}
