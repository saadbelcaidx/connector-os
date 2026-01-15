/**
 * MATCHING PIPELINE
 *
 * Orchestrates the full matching flow:
 * DEMAND → EdgeDetector → Gate → Matcher → Gate → Composer → IntroOutput
 *
 * Entry point: runMatchingPipeline()
 *
 * RULES:
 * - No probe outputs
 * - Strict gating: no edge/counterparty/fitReason => drop
 * - Banned phrases cause drop
 */

import type { DemandRecord } from '../schemas/DemandRecord';
import type { SupplyRecord } from '../schemas/SupplyRecord';
import type {
  PipelineResult,
  DropResult,
  ComposeResult,
  IntroOutput,
} from '../schemas/IntroOutput';

import { detectEdge } from './EdgeDetector';
import { findCounterparty } from './Matcher';
import { composeIntros, validateNoBannedPhrases } from './Composer';
import { validateGate, isGatePass } from './Gate';

// =============================================================================
// MAIN EXPORT
// =============================================================================

/**
 * Run the matching pipeline for a single demand record.
 *
 * @param demand - DemandRecord to process
 * @param supplyPool - Array of supply records to match against
 * @returns PipelineResult (ComposeResult or DropResult)
 */
export function runMatchingPipeline(
  demand: DemandRecord,
  supplyPool: SupplyRecord[]
): PipelineResult {
  // ==========================================================================
  // STEP 1: EDGE DETECTION
  // ==========================================================================
  const edge = detectEdge(demand);

  // Early gate check: must have edge
  const earlyGate = validateGate(demand, edge, null);
  if (!isGatePass(earlyGate)) {
    // If no edge, return drop (NO_EDGE or MISSING_REQUIRED_FIELDS)
    if ('dropped' in earlyGate && earlyGate.reason === 'NO_COUNTERPARTY') {
      // Expected at this stage - continue to matcher
    } else if ('dropped' in earlyGate) {
      return earlyGate as DropResult;
    }
  }

  // If no edge detected, drop immediately
  if (!edge) {
    return {
      dropped: true,
      reason: 'NO_EDGE',
      details: { demand: demand.company },
    };
  }

  // ==========================================================================
  // STEP 2: MATCH TO COUNTERPARTY
  // ==========================================================================
  const matchResult = findCounterparty(demand, edge, supplyPool);

  if (!matchResult) {
    return {
      dropped: true,
      reason: 'NO_COUNTERPARTY',
      details: {
        demand: demand.company,
        edge: edge.type,
        supplyPoolSize: supplyPool.length,
      },
    };
  }

  const { counterparty, supplyRecord } = matchResult;

  // ==========================================================================
  // STEP 3: FULL GATE VALIDATION
  // ==========================================================================
  const gateResult = validateGate(demand, edge, counterparty);

  if (!isGatePass(gateResult)) {
    return gateResult as DropResult;
  }

  // ==========================================================================
  // STEP 4: COMPOSE INTROS
  // ==========================================================================
  let demandBody: string;
  let supplyBody: string;

  try {
    const composed = composeIntros(
      demand,
      edge,
      counterparty,
      supplyRecord
    );
    demandBody = composed.demandBody;
    supplyBody = composed.supplyBody;
  } catch (error) {
    // Composer threw due to banned phrase
    return {
      dropped: true,
      reason: 'MISSING_REQUIRED_FIELDS',
      details: {
        error: error instanceof Error ? error.message : 'Composer error',
      },
    };
  }

  // ==========================================================================
  // STEP 5: FINAL VALIDATION (banned phrases)
  // ==========================================================================
  if (!validateNoBannedPhrases(demandBody) || !validateNoBannedPhrases(supplyBody)) {
    return {
      dropped: true,
      reason: 'MISSING_REQUIRED_FIELDS',
      details: { error: 'Banned phrase detected in output' },
    };
  }

  // ==========================================================================
  // STEP 6: BUILD OUTPUT
  // ==========================================================================
  const output: IntroOutput = {
    demandIntro: {
      to: demand.email,
      body: demandBody,
    },
    supplyIntro: {
      to: counterparty.email,
      body: supplyBody,
    },
    payload: {
      demand,
      supply: supplyRecord,
      edge,
      fitReason: counterparty.fitReason,
    },
  };

  return {
    dropped: false,
    output,
  } as ComposeResult;
}

/**
 * Run pipeline for multiple demand records.
 *
 * @param demands - Array of DemandRecords
 * @param supplyPool - Array of SupplyRecords
 * @param onProgress - Optional progress callback
 * @returns Array of PipelineResults
 */
export async function runBatchPipeline(
  demands: DemandRecord[],
  supplyPool: SupplyRecord[],
  onProgress?: (current: number, total: number) => void
): Promise<PipelineResult[]> {
  const results: PipelineResult[] = [];
  const total = demands.length;

  for (let i = 0; i < demands.length; i++) {
    const result = runMatchingPipeline(demands[i], supplyPool);
    results.push(result);

    // Report progress
    if (onProgress) {
      onProgress(i + 1, total);
    }

    // Yield to event loop every 50 records
    if (i > 0 && i % 50 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return results;
}

/**
 * Filter results to only composed (non-dropped) outputs.
 */
export function getComposedResults(results: PipelineResult[]): ComposeResult[] {
  return results.filter((r): r is ComposeResult => !r.dropped);
}

/**
 * Filter results to only dropped outputs.
 */
export function getDroppedResults(results: PipelineResult[]): DropResult[] {
  return results.filter((r): r is DropResult => r.dropped);
}

/**
 * Get summary stats from pipeline results.
 */
export function getPipelineStats(results: PipelineResult[]): {
  total: number;
  composed: number;
  dropped: number;
  dropReasons: Record<string, number>;
} {
  const composed = getComposedResults(results);
  const dropped = getDroppedResults(results);

  const dropReasons: Record<string, number> = {};
  for (const drop of dropped) {
    const reason = drop.reason;
    dropReasons[reason] = (dropReasons[reason] || 0) + 1;
  }

  return {
    total: results.length,
    composed: composed.length,
    dropped: dropped.length,
    dropReasons,
  };
}
