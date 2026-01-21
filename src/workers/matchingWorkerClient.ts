/**
 * MATCHING WORKER CLIENT — Main thread interface to Web Worker
 *
 * STRIPE-LEVEL: Matching computation runs off main thread.
 * - Spawns worker, sends inputs, receives progress/result
 * - Supports cancellation via worker.terminate()
 * - No zombie computations (worker terminated on cancel)
 * - Background tab safe (computation completes at full speed)
 *
 * Usage:
 *   const { result, cancel } = runMatchingInWorker(demand, supply, mode, onProgress);
 *   // To cancel: cancel();
 *   // Result is a promise that resolves with MatchingResult
 */

import type { MatchingResult } from '../matching';
import type { NormalizedRecord } from '../schemas';
import type { ConnectorMode } from '../services/SupplyFilterBuilder';

// Import worker using Vite's worker syntax
// @ts-ignore - Vite handles this import
import MatchingWorker from './matching.worker?worker';

export interface MatchingWorkerHandle {
  result: Promise<MatchingResult>;
  cancel: () => void;
}

/**
 * Run matching computation in a Web Worker.
 *
 * @param demand - Demand records to match
 * @param supply - Supply records to match against
 * @param mode - Optional connector mode for buyer-seller validation
 * @param onProgress - Progress callback (called with completed, total)
 * @returns Handle with result promise and cancel function
 */
export function runMatchingInWorker(
  demand: NormalizedRecord[],
  supply: NormalizedRecord[],
  mode: ConnectorMode | undefined,
  onProgress?: (completed: number, total: number) => void
): MatchingWorkerHandle {
  // Spawn new worker
  const worker = new MatchingWorker();

  let cancelled = false;

  const result = new Promise<MatchingResult>((resolve, reject) => {
    // Handle messages from worker
    worker.onmessage = (e: MessageEvent) => {
      if (cancelled) return;

      const msg = e.data;

      switch (msg.type) {
        case 'progress':
          onProgress?.(msg.completed, msg.total);
          break;

        case 'result':
          console.log('[MatchingWorkerClient] Received result');
          worker.terminate();
          resolve(msg.result);
          break;

        case 'error':
          console.error('[MatchingWorkerClient] Worker error:', msg.error);
          worker.terminate();
          reject(new Error(msg.error));
          break;

        default:
          console.warn('[MatchingWorkerClient] Unknown message type:', msg.type);
      }
    };

    // Handle worker errors
    worker.onerror = (e: ErrorEvent) => {
      if (cancelled) return;
      console.error('[MatchingWorkerClient] Worker error event:', e.message);
      worker.terminate();
      reject(new Error(e.message || 'Worker error'));
    };

    // Send start message
    console.log(`[MatchingWorkerClient] Starting worker with ${demand.length} demand × ${supply.length} supply`);
    worker.postMessage({
      type: 'start',
      demand,
      supply,
      mode,
    });
  });

  // Cancel function - terminates worker immediately
  const cancel = () => {
    if (!cancelled) {
      cancelled = true;
      console.log('[MatchingWorkerClient] Cancelling worker');
      worker.terminate();
    }
  };

  return { result, cancel };
}

/**
 * Check if Web Workers are supported in this environment.
 */
export function isWorkerSupported(): boolean {
  return typeof Worker !== 'undefined';
}
