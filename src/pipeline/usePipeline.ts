/**
 * usePipeline Hook
 *
 * Stage 5: Pipeline is the system - no feature flags.
 * Orchestrates the pipeline run.
 */

import { useState, useCallback, useRef } from 'react';
import type {
  RawInput,
  PipelineItem,
  PipelineStage,
  PipelineMetrics,
  MatchResult,
  CacheEntry,
  ValidationResult,
  EnrichmentResult,
  Intro,
  SendResult,
  PipelineDependencies,
} from './contract';
import { runPipeline, getMetrics } from './orchestrator';
import { normalizeInput } from './adapter';

// =============================================================================
// Stage 5: Feature flags removed - pipeline is the system
// =============================================================================

// =============================================================================
// HOOK STATE
// =============================================================================

export interface UsePipelineState {
  stage: PipelineStage | 'idle';
  items: PipelineItem[];
  metrics: PipelineMetrics;
  processing: boolean;
  error: string | null;
}

export interface UsePipelineActions {
  start: (
    demandData: unknown[],
    supplyData: unknown[],
    deps: PipelineDependencies
  ) => Promise<void>;
  reset: () => void;
}

// =============================================================================
// HOOK
// =============================================================================

export function usePipeline(): [UsePipelineState, UsePipelineActions] {
  const [stage, setStage] = useState<PipelineStage | 'idle'>('idle');
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [metrics, setMetrics] = useState<PipelineMetrics>(getMetrics());
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef(false);

  const start = useCallback(async (
    demandData: unknown[],
    supplyData: unknown[],
    deps: PipelineDependencies
  ) => {
    console.log('[Pipeline] Running pipeline');
    setProcessing(true);
    setError(null);
    setStage('input');
    abortRef.current = false;

    try {
      // Normalize inputs
      const demand = normalizeInput(demandData, 'apify', 'demand');
      const supply = normalizeInput(supplyData, 'apify', 'supply');

      console.log('[Pipeline] Normalized:', demand.length, 'demand,', supply.length, 'supply');

      // Run pipeline with progress callback
      const result = await runPipeline(demand, supply, {
        ...deps,
        onProgress: (currentStage, currentItems) => {
          if (abortRef.current) return;
          setStage(currentStage);
          setItems([...currentItems]);
          setMetrics(getMetrics());
        },
      });

      setItems(result);
      setMetrics(getMetrics());
      setStage('send');
    } catch (err) {
      console.error('[Pipeline] Error:', err);
      setError(err instanceof Error ? err.message : 'Pipeline failed');
    } finally {
      setProcessing(false);
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current = true;
    setStage('idle');
    setItems([]);
    setMetrics(getMetrics());
    setProcessing(false);
    setError(null);
  }, []);

  return [
    { stage, items, metrics, processing, error },
    { start, reset },
  ];
}

// =============================================================================
// DEPENDENCY FACTORIES (connect to existing services)
// =============================================================================

/**
 * Create match function using AI.
 */
export function createMatchFn(aiConfig: unknown) {
  return async (d: RawInput, s: RawInput): Promise<MatchResult | null> => {
    // TODO: Wire to existing AI matching service
    // For now, simple domain-based matching
    if (!d.domain || !s.domain) return null;

    // Placeholder - will be replaced with AI matching
    return {
      demandId: d.id,
      supplyId: s.id,
      confidence: 0.8,
      reason: `${d.companyName || d.domain} needs → ${s.companyName || s.domain} provides`,
    };
  };
}

/**
 * Create cache lookup function.
 */
export function createCacheFn(supabase: unknown, userId: string | null) {
  return async (domain: string): Promise<CacheEntry | null> => {
    // TODO: Wire to Supabase cache table
    return null;
  };
}

/**
 * Create validation function using Anymail.
 */
export function createValidateFn(anymailKey: string | null) {
  return async (email: string): Promise<ValidationResult> => {
    // TODO: Wire to Anymail validation
    return {
      email,
      valid: true,
      status: 'unknown',
    };
  };
}

/**
 * Create enrichment function using Apollo + Anymail fallback.
 */
export function createEnrichFn(apolloKey: string | null, anymailKey: string | null) {
  return async (domain: string, name?: string): Promise<EnrichmentResult> => {
    // TODO: Wire to Apollo enrichment service
    // TODO: Wire to Anymail fallback
    return {
      success: false,
      source: 'apollo',
      endpoint: 'person',
    };
  };
}

/**
 * Create store function for cache persistence.
 */
export function createStoreFn(supabase: unknown, userId: string | null) {
  return async (entry: CacheEntry): Promise<void> => {
    // TODO: Wire to Supabase cache table
  };
}

/**
 * Create intro generation function.
 */
export function createIntroFn(aiConfig: unknown) {
  return async (demand: RawInput, supply: RawInput, match: MatchResult): Promise<Intro> => {
    // TODO: Wire to existing antifragile intro generator
    return {
      demandId: demand.id,
      supplyId: supply.id,
      demandIntro: `Intro for ${demand.companyName}`,
      supplyIntro: `Intro for ${supply.companyName}`,
      matchContext: match.reason,
    };
  };
}

/**
 * Create send function for Instantly.
 */
export function createSendFn(instantlyKey: string | null, demandCampaignId: string | null, supplyCampaignId: string | null) {
  return async (item: PipelineItem): Promise<SendResult> => {
    // TODO: Wire to Instantly service
    return {
      demandId: item.demand.id,
      supplyId: item.supply.id,
      demandSent: false,
      supplySent: false,
      error: 'Not implemented',
    };
  };
}
