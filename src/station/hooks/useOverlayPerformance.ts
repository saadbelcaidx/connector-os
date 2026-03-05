/**
 * useOverlayPerformance — fetch overlay performance data on mount.
 *
 * Returns performance snapshot for a specific client or all clients.
 * Accepts optional activation windows from ClientOverlay array for
 * time-bounded performance filtering.
 */

import { useState, useEffect } from 'react';
import type { PerformanceSnapshot, ActivationWindow } from '../../services/OverlayPerformanceService';
import { buildPerformanceSnapshot, getOverlayPerformance } from '../../services/OverlayPerformanceService';
import type { OverlayVersionPerformance } from '../../services/OverlayPerformanceService';

interface UseOverlayPerformanceOptions {
  operatorId: string | null;
  clientId?: string;
  clientName?: string;
  hashes?: string[];
  activationWindows?: Record<string, ActivationWindow>;
}

interface UseOverlayPerformanceResult {
  snapshot: PerformanceSnapshot | null;
  allPerformance: OverlayVersionPerformance[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useOverlayPerformance(opts: UseOverlayPerformanceOptions): UseOverlayPerformanceResult {
  const { operatorId, clientId, clientName, hashes, activationWindows } = opts;
  const [snapshot, setSnapshot] = useState<PerformanceSnapshot | null>(null);
  const [allPerformance, setAllPerformance] = useState<OverlayVersionPerformance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    if (!operatorId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // Always fetch all performance for the client
        const all = await getOverlayPerformance(operatorId, clientId);
        if (cancelled) return;
        setAllPerformance(all);

        // Build snapshot if hashes provided
        if (clientId && clientName && hashes && hashes.length > 0) {
          const snap = await buildPerformanceSnapshot(
            operatorId, clientId, clientName, hashes, activationWindows
          );
          if (cancelled) return;
          setSnapshot(snap);
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [operatorId, clientId, clientName, fetchKey,
      // Stable deps: serialize hashes/windows to avoid infinite loop
      hashes ? hashes.join(',') : '',
      activationWindows ? JSON.stringify(activationWindows) : '']);

  return {
    snapshot,
    allPerformance,
    loading,
    error,
    refetch: () => setFetchKey(k => k + 1),
  };
}
