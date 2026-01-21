/**
 * useFlowProgressPoller — Frontend-only progress polling hook
 *
 * PERSIST-1C: Polls Flow.tsx state every 5s while a stage is running
 * and persists progress to FlowStateStore.
 *
 * NO network calls. Reads from Flow.tsx local state only.
 */

import { useEffect, useRef, useCallback } from 'react';
import { FlowStage, onStageProgress, StageSummary } from '../services/FlowStateStore';

export interface ProgressStatus {
  stage: FlowStage;
  progress: number;
  found?: number;
  total?: number;
}

export interface UseFlowProgressPollerParams {
  enabled: boolean;
  flowId: string | null;
  intervalMs?: number; // default 5000
  getStatus: () => ProgressStatus | null;
  onTick?: (status: ProgressStatus) => void;
}

/**
 * Hook that polls Flow.tsx state and persists progress to FlowStateStore
 *
 * Usage in Flow.tsx:
 * ```
 * useFlowProgressPoller({
 *   enabled: state.step === 'enriching',
 *   flowId: currentFlowId,
 *   getStatus: () => ({
 *     stage: 'enrichment',
 *     progress: Math.round((state.progress.current / state.progress.total) * 100),
 *     found: state.progress.current,
 *     total: state.progress.total,
 *   }),
 *   onTick: (status) => {
 *     // Optional: update UI label
 *   },
 * });
 * ```
 */
export function useFlowProgressPoller({
  enabled,
  flowId,
  intervalMs = 5000,
  getStatus,
  onTick,
}: UseFlowProgressPollerParams): void {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const getStatusRef = useRef(getStatus);
  const onTickRef = useRef(onTick);

  // Keep refs updated
  useEffect(() => {
    getStatusRef.current = getStatus;
    onTickRef.current = onTick;
  }, [getStatus, onTick]);

  const tick = useCallback(() => {
    if (!flowId) return;

    const status = getStatusRef.current();
    if (!status) return;

    // Build summary for persistence
    const summary: StageSummary = {};
    if (typeof status.found === 'number') summary.found = status.found;
    if (typeof status.total === 'number') summary.total = status.total;

    // Persist to FlowStateStore
    onStageProgress(flowId, status.stage, status.progress, summary);

    // Call onTick callback if provided
    if (onTickRef.current) {
      onTickRef.current(status);
    }

    console.log(`[Poller] ${status.stage}: ${status.progress}%`, summary);
  }, [flowId]);

  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Start polling if enabled
    if (enabled && flowId) {
      // Immediate tick
      tick();

      // Set up interval
      intervalRef.current = setInterval(tick, intervalMs);
      console.log(`[Poller] Started (flowId: ${flowId}, interval: ${intervalMs}ms)`);
    }

    // Cleanup on unmount or when disabled
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        console.log('[Poller] Stopped');
      }
    };
  }, [enabled, flowId, intervalMs, tick]);
}

export default useFlowProgressPoller;
