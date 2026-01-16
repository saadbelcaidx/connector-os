/**
 * PHILEMON — Ground Truth UI State System
 *
 * This file defines the UI state machine and truth counters.
 * It reads from existing computed values — NO NEW LOGIC.
 *
 * NON-NEGOTIABLE:
 * - Does NOT change edge detection
 * - Does NOT change scoring
 * - Does NOT change routing
 * - Does NOT change enrichment logic
 * - Does NOT change signal extraction
 *
 * Only derives UI state from existing values.
 */

import { FEATURES } from '../config/features';
import { isSuccessfulEnrichment, EnrichmentResult } from '../enrichment';

// =============================================================================
// UI STATE ENUM — Mutually exclusive, machine-verifiable
// =============================================================================

export type UiState =
  | 'NO_DATASETS'
  | 'DEMAND_ONLY'
  | 'SUPPLY_ONLY'
  | 'DEMAND_AND_SUPPLY'
  | 'EDGE_PREFLIGHT'
  | 'NO_MATCHES'
  | 'MATCHES_FOUND'
  | 'ENRICHMENT_BLOCKED'
  | 'ENRICHMENT_PARTIAL'
  | 'ENRICHMENT_COMPLETE'
  | 'ENRICHMENT_EMPTY'
  | 'SENDABLE_READY'
  | 'SENDABLE_EMPTY';

// =============================================================================
// TRUTH COUNTERS — Read-only, derived from existing state
// =============================================================================

export interface TruthCounters {
  demandCount: number;
  supplyCount: number;
  matchCount: number;
  edgeCount: number;
  enrichedCount: number;
  sendableCount: number;
}

export interface DeriveStateInput {
  // Dataset presence
  hasDemandDataset: boolean;
  hasSupplyDataset: boolean;

  // Record counts
  demandRecordCount: number;
  supplyRecordCount: number;

  // Matching results
  matchCount: number;
  edgeCount: number;

  // Enrichment state
  enrichmentStarted: boolean;
  enrichmentFinished: boolean;
  enrichedDemandCount: number;
  enrichedSupplyCount: number;

  // Sendable state
  sendableCount: number;

  // API keys
  hasAnyApiKey: boolean;
}

// =============================================================================
// DERIVE UI STATE — Pure function, reads only
// =============================================================================

export function deriveUiState(input: DeriveStateInput): UiState {
  const {
    hasDemandDataset,
    hasSupplyDataset,
    matchCount,
    edgeCount,
    enrichmentStarted,
    enrichmentFinished,
    enrichedDemandCount,
    sendableCount,
    hasAnyApiKey,
  } = input;

  // 1. No datasets
  if (!hasDemandDataset && !hasSupplyDataset) {
    return 'NO_DATASETS';
  }

  // 2. Partial datasets
  if (hasDemandDataset && !hasSupplyDataset) {
    return 'DEMAND_ONLY';
  }
  if (!hasDemandDataset && hasSupplyDataset) {
    return 'SUPPLY_ONLY';
  }

  // 3. Both datasets loaded but no matching yet
  if (edgeCount === 0 && !enrichmentStarted) {
    if (matchCount === 0) {
      return 'DEMAND_AND_SUPPLY';
    }
  }

  // 4. Edge preflight done, no matches
  if (edgeCount === 0 && matchCount === 0) {
    return 'NO_MATCHES';
  }

  // 5. Matches found, not enriched yet
  if (edgeCount > 0 && !enrichmentStarted) {
    return 'MATCHES_FOUND';
  }

  // 6. Enrichment blocked (no API keys)
  if (edgeCount > 0 && !hasAnyApiKey && !enrichmentStarted) {
    return 'ENRICHMENT_BLOCKED';
  }

  // 7. Enrichment states
  if (enrichmentFinished) {
    const totalEnriched = enrichedDemandCount;

    if (totalEnriched === 0) {
      return 'ENRICHMENT_EMPTY';
    }

    if (totalEnriched > 0 && totalEnriched < matchCount) {
      return 'ENRICHMENT_PARTIAL';
    }

    if (totalEnriched >= matchCount) {
      return 'ENRICHMENT_COMPLETE';
    }
  }

  // 8. Sendable states
  if (sendableCount > 0) {
    return 'SENDABLE_READY';
  }

  if (enrichmentFinished && sendableCount === 0) {
    return 'SENDABLE_EMPTY';
  }

  // Default: matches found (pre-enrichment)
  return 'MATCHES_FOUND';
}

// =============================================================================
// DERIVE TRUTH COUNTERS — Pure function, reads only
// =============================================================================

export function deriveTruthCounters(input: DeriveStateInput): TruthCounters {
  return {
    demandCount: input.demandRecordCount,
    supplyCount: input.supplyRecordCount,
    matchCount: input.matchCount,
    edgeCount: input.edgeCount,
    enrichedCount: input.enrichedDemandCount + input.enrichedSupplyCount,
    sendableCount: input.sendableCount,
  };
}

// =============================================================================
// STATE SNAPSHOT LOGGING — Debug visibility
// =============================================================================

export function logStateSnapshot(
  stage: string,
  flowStep: string,
  counters: TruthCounters,
  uiState: UiState
): void {
  if (!FEATURES.PHILEMON_MODE) return;

  console.log(
    `[PHILEMON] STATE_SNAPSHOT stage=${stage} step=${flowStep} ` +
    `UI_STATE=${uiState} ` +
    `demandCount=${counters.demandCount} ` +
    `supplyCount=${counters.supplyCount} ` +
    `matchCount=${counters.matchCount} ` +
    `edgeCount=${counters.edgeCount} ` +
    `enrichedCount=${counters.enrichedCount} ` +
    `sendableCount=${counters.sendableCount}`
  );
}

// =============================================================================
// HELPER: Build input from Flow state
// =============================================================================

export function buildDeriveInput(
  demandSchema: any,
  supplySchema: any,
  demandRecords: any[],
  supplyRecords: any[],
  matchingResult: any,
  detectedEdges: Map<string, any>,
  enrichedDemand: Map<string, any>,
  enrichedSupply: Map<string, any>,
  enrichmentStarted: boolean,
  enrichmentFinished: boolean,
  hasAnyApiKey: boolean,
  introsGenerated: number
): DeriveStateInput {
  // Count enriched with emails (use outcome, not boolean)
  const enrichedDemandCount = Array.from(enrichedDemand.values()).filter(
    (e: EnrichmentResult | undefined) => e && isSuccessfulEnrichment(e) && e.email
  ).length;

  const enrichedSupplyCount = Array.from(enrichedSupply.values()).filter(
    (e: EnrichmentResult | undefined) => e && isSuccessfulEnrichment(e) && e.email
  ).length;

  return {
    hasDemandDataset: !!demandSchema,
    hasSupplyDataset: !!supplySchema,
    demandRecordCount: demandRecords.length,
    supplyRecordCount: supplyRecords.length,
    matchCount: matchingResult?.demandMatches?.length || 0,
    edgeCount: detectedEdges.size,
    enrichmentStarted,
    enrichmentFinished,
    enrichedDemandCount,
    enrichedSupplyCount,
    sendableCount: introsGenerated,
    hasAnyApiKey,
  };
}
