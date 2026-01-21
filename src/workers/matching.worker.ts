/**
 * MATCHING WEB WORKER — Off-main-thread computation
 *
 * STRIPE-LEVEL: CPU-bound matching runs here, not on main thread.
 * - No DOM access (workers can't touch DOM)
 * - No setTimeout/yield hacks (workers aren't throttled)
 * - Pure synchronous computation at full CPU speed
 * - Progress reported via postMessage (every 1%)
 * - Background tab safe (workers not subject to timer throttling)
 *
 * Message Protocol:
 * IN:  { type: 'start', demand, supply, mode }
 * OUT: { type: 'progress', completed, total }
 * OUT: { type: 'result', result }
 * OUT: { type: 'error', error }
 */

import { matchRecordsWorkerCore, MatchingResult } from '../matching';
import type { NormalizedRecord } from '../schemas';
import type { ConnectorMode } from '../services/SupplyFilterBuilder';

// Message types
interface StartMessage {
  type: 'start';
  demand: NormalizedRecord[];
  supply: NormalizedRecord[];
  mode?: ConnectorMode;
}

interface ProgressMessage {
  type: 'progress';
  completed: number;
  total: number;
}

interface ResultMessage {
  type: 'result';
  result: MatchingResult;
}

interface ErrorMessage {
  type: 'error';
  error: string;
}

export type WorkerOutMessage = ProgressMessage | ResultMessage | ErrorMessage;

// Worker entry point
self.onmessage = (e: MessageEvent<StartMessage>) => {
  if (e.data.type !== 'start') {
    self.postMessage({ type: 'error', error: 'Unknown message type' } as ErrorMessage);
    return;
  }

  const { demand, supply, mode } = e.data;

  console.log(`[MatchingWorker] START: ${demand.length} demand × ${supply.length} supply`);
  const startTime = performance.now();

  try {
    // Run matching with progress callback
    const result = matchRecordsWorkerCore(
      demand,
      supply,
      mode,
      (completed, total) => {
        // Post progress to main thread
        self.postMessage({ type: 'progress', completed, total } as ProgressMessage);
      }
    );

    const elapsed = Math.round(performance.now() - startTime);
    console.log(`[MatchingWorker] COMPLETE: ${elapsed}ms, ${result.demandMatches.length} matches`);

    // Post final result
    self.postMessage({ type: 'result', result } as ResultMessage);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[MatchingWorker] ERROR:`, errorMessage);
    self.postMessage({ type: 'error', error: errorMessage } as ErrorMessage);
  }
};

// Signal ready
console.log('[MatchingWorker] Initialized and ready');
