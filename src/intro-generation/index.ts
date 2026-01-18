/**
 * intro-generation/index.ts — Intro Generation Module
 *
 * CSV Phase 3: Unified intro generation with CSV-specific branch.
 *
 * ROUTING LOGIC:
 * - CSV records (dataSource === 'csv') → CSV templates
 * - Apify records → Existing Apify pipeline (unchanged)
 *
 * INVARIANT: CSV intros use CSV templates; Apify intros remain untouched.
 */

// CSV Intro Generation (Phase 3)
export {
  classifyCsvSignalTier,
  classifyCsvSignalTierWithReasons,
  isCsvRecord,
  getTierLabel,
} from './csvSignalTier';
export type { CsvSignalTier, TierClassification } from './csvSignalTier';

export {
  generateCsvIntro,
  generateCsvDemandIntro,
  generateCsvSupplyIntro,
} from './csvIntroTemplates';
export type { CsvIntroParams, CsvIntroResult } from './csvIntroTemplates';

// =============================================================================
// UNIFIED INTRO GENERATION (CSV BRANCH)
// =============================================================================

import type { NormalizedRecord } from '../schemas';
import { classifyCsvSignalTier, isCsvRecord } from './csvSignalTier';
import { generateCsvIntro } from './csvIntroTemplates';
import type { CsvIntroResult } from './csvIntroTemplates';

/**
 * Check if a record should use CSV intro generation.
 *
 * @param record - NormalizedRecord to check
 * @returns true if CSV intro path should be used
 */
export function shouldUseCsvIntro(record: NormalizedRecord): boolean {
  return isCsvRecord(record);
}

/**
 * Generate intro for CSV record pair.
 *
 * This is the main entry point for CSV intro generation.
 * For Apify records, use the existing Apify intro pipeline.
 *
 * @param demand - Demand-side NormalizedRecord
 * @param supply - Supply-side NormalizedRecord
 * @returns CsvIntroResult or null if not CSV records
 *
 * USAGE:
 * ```typescript
 * if (shouldUseCsvIntro(demand)) {
 *   const result = generateIntroForCsvPair(demand, supply);
 *   // Use result.demandIntro, result.supplyIntro
 * } else {
 *   // Use existing Apify intro pipeline
 * }
 * ```
 */
export function generateIntroForCsvPair(
  demand: NormalizedRecord,
  supply: NormalizedRecord
): CsvIntroResult | null {
  // Guard: Only process if demand is CSV record
  if (!isCsvRecord(demand)) {
    return null;
  }

  // Classify tier based on demand record
  const tier = classifyCsvSignalTier(demand);

  // Generate intros
  return generateCsvIntro({ demand, supply, tier });
}

/**
 * Get intro quality info for a CSV record without generating intros.
 *
 * Useful for displaying quality badges before generation.
 *
 * @param record - NormalizedRecord to analyze
 * @returns { tier, tierLabel } or null if not CSV
 */
export function getCsvIntroQuality(record: NormalizedRecord): {
  tier: 'T1' | 'T2' | 'T3';
  tierLabel: string;
} | null {
  if (!isCsvRecord(record)) {
    return null;
  }

  const tier = classifyCsvSignalTier(record);
  const tierLabel = tier === 'T1' ? 'BASIC' : tier === 'T2' ? 'STANDARD' : 'RICH';

  return { tier, tierLabel };
}

/**
 * Batch analyze CSV records for quality distribution.
 *
 * @param records - Array of NormalizedRecord
 * @returns { t1Count, t2Count, t3Count, hasBasicTier }
 */
export function analyzeCsvBatchQuality(records: NormalizedRecord[]): {
  t1Count: number;
  t2Count: number;
  t3Count: number;
  totalCsv: number;
  hasBasicTier: boolean;
} {
  let t1Count = 0;
  let t2Count = 0;
  let t3Count = 0;

  for (const record of records) {
    if (!isCsvRecord(record)) continue;

    const tier = classifyCsvSignalTier(record);
    switch (tier) {
      case 'T1':
        t1Count++;
        break;
      case 'T2':
        t2Count++;
        break;
      case 'T3':
        t3Count++;
        break;
    }
  }

  return {
    t1Count,
    t2Count,
    t3Count,
    totalCsv: t1Count + t2Count + t3Count,
    hasBasicTier: t1Count > 0,
  };
}
