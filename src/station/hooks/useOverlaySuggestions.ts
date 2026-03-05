/**
 * useOverlaySuggestions — fetches data and runs suggestion engine.
 *
 * Accepts FulfillmentClient as input:
 * - Returns empty when client.lockedManual === true
 * - Filters out dismissed suggestions whose cooldown hasn't expired (7 days)
 */

import { useState, useEffect, useMemo } from 'react';
import type { FulfillmentClient, OverlaySpec } from '../../types/station';
import type { SuggestionReport, OverlaySuggestion } from '../../telemetry/overlaySuggestions';
import { computeOverlaySuggestions } from '../../telemetry/overlaySuggestions';
import { getIntrosForOverlayAnalysis, getLearningByTier, getLearningByPairing } from '../../services/IntroductionsService';
import type { OverlayIntroRow, TierLearning, PairingLearning } from '../../services/IntroductionsService';

interface UseOverlaySuggestionsOptions {
  operatorId: string | null;
  client: FulfillmentClient | null;
  currentOverlay: OverlaySpec;
  overlayHash: string;
}

interface UseOverlaySuggestionsResult {
  report: SuggestionReport | null;
  suggestions: OverlaySuggestion[];
  loading: boolean;
}

export function useOverlaySuggestions(opts: UseOverlaySuggestionsOptions): UseOverlaySuggestionsResult {
  const { operatorId, client, currentOverlay, overlayHash } = opts;
  const [report, setReport] = useState<SuggestionReport | null>(null);
  const [loading, setLoading] = useState(false);

  const isLocked = client?.lockedManual === true;

  useEffect(() => {
    if (!operatorId || !client || isLocked || !overlayHash) {
      setReport(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const [intros, tierLearning, pairingLearning] = await Promise.all([
          getIntrosForOverlayAnalysis(operatorId, client.id),
          getLearningByTier(operatorId),
          getLearningByPairing(operatorId),
        ]);

        if (cancelled) return;

        const result = computeOverlaySuggestions({
          currentOverlay,
          overlayHash,
          intros,
          tierLearning,
          pairingLearning,
        });

        if (!cancelled) setReport(result);
      } catch (err) {
        console.error('[useOverlaySuggestions] Error:', err);
        if (!cancelled) setReport(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [operatorId, client?.id, isLocked, overlayHash]);

  // Filter dismissed suggestions
  const suggestions = useMemo(() => {
    if (!report || isLocked) return [];
    const dismissals = client?.suggestionDismissals || {};
    const now = Date.now();

    return report.suggestions.filter(s => {
      const dismissedUntil = dismissals[s.id];
      if (!dismissedUntil) return true;
      return new Date(dismissedUntil).getTime() < now;
    });
  }, [report, isLocked, client?.suggestionDismissals]);

  return { report, suggestions, loading };
}
