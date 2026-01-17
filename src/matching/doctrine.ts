/**
 * MATCHING DOCTRINE — NON-NEGOTIABLE INVARIANTS
 *
 * These are safety locks. Violating any of them is a system failure.
 *
 * FROZEN: Do not modify thresholds or weaken assertions.
 */

// =============================================================================
// A. RECORD KEY INVARIANT
// =============================================================================

/**
 * Assert recordKey exists and is valid.
 * Call this before ANY operation that uses recordKey.
 *
 * RULE: If recordKey is missing → throw, don't proceed.
 *
 * This prevents:
 * - Maps keyed by domain (domain is optional metadata, not identity)
 * - React keys from nullable fields
 * - Enrichment keyed by domain
 * - Silent collapses when data is incomplete
 */
export function assertRecordKey(recordKey: string | undefined | null, context: string): asserts recordKey is string {
  if (!recordKey || recordKey.trim() === '') {
    throw new Error(`[DOCTRINE VIOLATION] Missing recordKey in ${context}. recordKey is mandatory.`);
  }
  if (recordKey === 'undefined' || recordKey === 'null' || recordKey.includes('[object Object]')) {
    throw new Error(`[DOCTRINE VIOLATION] Invalid recordKey "${recordKey}" in ${context}. recordKey must be a valid identifier.`);
  }
}

/**
 * Validate recordKey without throwing (for conditional checks)
 */
export function isValidRecordKey(recordKey: string | undefined | null): recordKey is string {
  if (!recordKey || recordKey.trim() === '') return false;
  if (recordKey === 'undefined' || recordKey === 'null') return false;
  if (recordKey.includes('[object Object]')) return false;
  return true;
}

// =============================================================================
// B. TIER THRESHOLDS — EXPLICIT CONSTANTS
// =============================================================================

/**
 * Tier thresholds are FROZEN. Do not modify.
 *
 * These define match quality universally:
 * - STRONG: High confidence, actionable immediately
 * - GOOD: Solid match, worth pursuing
 * - EXPLORATORY: Weak signal, needs validation
 *
 * UI and product must NEVER redefine these implicitly.
 */
export const TIER_THRESHOLDS = {
  /** Score >= 70 = Strong match */
  STRONG: 70,
  /** Score >= 55 = Good match */
  GOOD: 55,
  /** Score >= 40 = Exploratory match */
  EXPLORATORY: 40,
  /** Score < 40 = Below threshold (still included but flagged) */
  MINIMUM: 0,
} as const;

export type TierName = 'strong' | 'good' | 'exploratory';

/**
 * Get tier name from score. Uses frozen thresholds.
 */
export function getTierFromScore(score: number): TierName {
  if (score >= TIER_THRESHOLDS.STRONG) return 'strong';
  if (score >= TIER_THRESHOLDS.GOOD) return 'good';
  return 'exploratory';
}

/**
 * Get tier display info for UI
 */
export function getTierDisplay(tier: TierName): {
  label: string;
  description: string;
  color: string;
  bgColor: string;
} {
  switch (tier) {
    case 'strong':
      return {
        label: 'Strong',
        description: 'High confidence match. Actionable immediately.',
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-500/10',
      };
    case 'good':
      return {
        label: 'Good',
        description: 'Solid match. Worth pursuing.',
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/10',
      };
    case 'exploratory':
      return {
        label: 'Exploratory',
        description: 'Weak signal. Needs validation before action.',
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/10',
      };
  }
}

// =============================================================================
// C. MATCH STATS — REQUIRED FOR UI
// =============================================================================

/**
 * Match statistics that UI MUST display.
 *
 * RULE: UI must never aggregate by "match count" alone.
 * Always show: total scanned, tier breakdown, exploratory warning.
 */
export interface MatchStats {
  /** Total demand records scanned */
  totalDemandScanned: number;
  /** Total supply records scanned */
  totalSupplyScanned: number;
  /** Total comparisons made (demand × supply) */
  totalComparisons: number;
  /** Matches by tier */
  tierBreakdown: {
    strong: number;
    good: number;
    exploratory: number;
  };
  /** Average score across all matches */
  averageScore: number;
  /** Percentage of matches that are actionable (strong + good) */
  actionablePercent: number;
}

/**
 * Calculate match stats from results.
 * UI MUST display this breakdown, not just total count.
 */
export function calculateMatchStats(
  matches: Array<{ score: number }>,
  totalDemand: number,
  totalSupply: number
): MatchStats {
  const tierBreakdown = {
    strong: 0,
    good: 0,
    exploratory: 0,
  };

  let totalScore = 0;

  for (const match of matches) {
    totalScore += match.score;
    const tier = getTierFromScore(match.score);
    tierBreakdown[tier]++;
  }

  const actionable = tierBreakdown.strong + tierBreakdown.good;
  const actionablePercent = matches.length > 0
    ? Math.round((actionable / matches.length) * 100)
    : 0;

  return {
    totalDemandScanned: totalDemand,
    totalSupplyScanned: totalSupply,
    totalComparisons: totalDemand * totalSupply,
    tierBreakdown,
    averageScore: matches.length > 0 ? Math.round(totalScore / matches.length) : 0,
    actionablePercent,
  };
}

/**
 * Format stats for display.
 * Returns human-readable summary.
 */
export function formatMatchStats(stats: MatchStats): string {
  const { tierBreakdown, totalDemandScanned, totalSupplyScanned, actionablePercent } = stats;

  return [
    `Scanned: ${totalDemandScanned} demand × ${totalSupplyScanned} supply`,
    `Strong: ${tierBreakdown.strong} | Good: ${tierBreakdown.good} | Exploratory: ${tierBreakdown.exploratory}`,
    `Actionable: ${actionablePercent}%`,
    tierBreakdown.exploratory > 0 ? '⚠ Exploratory matches need validation before action' : '',
  ].filter(Boolean).join('\n');
}

// =============================================================================
// DOCTRINE SUMMARY
// =============================================================================

/**
 * FROZEN DOCTRINE — DO NOT MODIFY
 *
 * A. recordKey is MANDATORY
 *    - No Maps keyed by domain
 *    - No React keys from nullable fields
 *    - No enrichment keyed by domain
 *    - Missing recordKey = throw error
 *
 * B. Tier thresholds are FROZEN
 *    - STRONG >= 70
 *    - GOOD >= 55
 *    - EXPLORATORY >= 40
 *    - UI/product cannot redefine
 *
 * C. UI must show tier breakdown
 *    - Never show "match count" alone
 *    - Always show: scanned, tiers, actionable %
 *    - Always warn: exploratory ≠ ready
 *
 * This doctrine makes Connector OS a universal introduction engine
 * driven by real-world signals, not brittle assumptions.
 */
export const DOCTRINE_VERSION = '1.0.0';
