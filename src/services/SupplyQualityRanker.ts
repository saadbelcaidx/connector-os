/**
 * SupplyQualityRanker.ts
 *
 * DETERMINISTIC SUPPLY RANKING v0
 *
 * Ranks supply providers for a given demand based on pressure signals.
 * NO AI. NO HEURISTICS OUTSIDE SIMPLE SCORING.
 *
 * Ranking Inputs:
 * 1. Specialization match (exact roleType > adjacent > generic)
 * 2. Size alignment (agency size vs pressure volume)
 * 3. Pressure fit (volume keywords for high confidence)
 * 4. Recency/activity (if metadata available)
 *
 * Output:
 * - qualityScore: number (0-100)
 * - rankingReason: string[] (explainable reasons)
 */

import type { SupplyCompany } from './SupplySignalsClient';
import type { PressureDetectionResult } from '../pressure/PressureDetector';
import type { RoleType } from '../pressure/InversionTable';
import type { HireCategory } from './CompanyRoleClassifier';

// ============================================================================
// TYPES
// ============================================================================

export interface RankedSupplyCompany extends SupplyCompany {
  qualityScore: number;
  rankingReason: string[];
}

export interface RankingContext {
  pressureDetection: PressureDetectionResult;
  demandCategory?: HireCategory;
}

// ============================================================================
// ADJACENCY MAP
// Role types that are "adjacent" (related but not exact match)
// ============================================================================

const ROLE_ADJACENCY: Record<RoleType, RoleType[]> = {
  engineering: ['operations'],  // Eng often works with ops
  sales: ['marketing'],         // Sales & marketing overlap
  marketing: ['sales'],         // Marketing & sales overlap
  operations: ['engineering', 'finance'],  // Ops bridges eng and finance
  finance: ['operations', 'compliance'],   // Finance relates to ops and compliance
  compliance: ['finance'],      // Compliance often paired with finance
  unknown: []
};

// ============================================================================
// VOLUME KEYWORDS
// Keywords that indicate high-volume/large-scale agencies
// ============================================================================

const VOLUME_KEYWORDS = [
  'enterprise', 'global', 'nationwide', 'international', 'fortune 500',
  'large scale', 'high volume', 'bulk', 'mass hiring', 'volume hiring',
  'thousands', 'hundreds', 'team of', 'established', 'leading'
];

// ============================================================================
// BOUTIQUE KEYWORDS
// Keywords that indicate boutique/specialized agencies
// ============================================================================

const BOUTIQUE_KEYWORDS = [
  'boutique', 'specialized', 'niche', 'focused', 'dedicated',
  'expert', 'premium', 'curated', 'selective', 'personalized',
  'bespoke', 'tailored', 'exclusive'
];

// ============================================================================
// ACTIVITY KEYWORDS
// Keywords that indicate recent activity/placements
// ============================================================================

const ACTIVITY_KEYWORDS = [
  'recent', 'active', 'current', 'ongoing', 'latest',
  'placed', 'placement', 'hired', 'filled', 'closed'
];

// ============================================================================
// SCORING FUNCTIONS
// ============================================================================

/**
 * Score specialization match (0-40 points)
 * Exact match = 40, Adjacent = 20, Generic/Unknown = 5
 */
function scoreSpecializationMatch(
  supplyCategory: HireCategory,
  demandRoleType: RoleType
): { score: number; reason: string | null } {
  // Map roleType to expected supply category
  const roleToCategory: Record<RoleType, HireCategory> = {
    engineering: 'engineering',
    sales: 'sales',
    marketing: 'marketing',
    operations: 'operations',
    finance: 'finance',
    compliance: 'finance',  // Compliance maps to finance in HireCategory
    unknown: 'unknown'
  };

  const expectedCategory = roleToCategory[demandRoleType];

  // Exact match
  if (supplyCategory === expectedCategory && supplyCategory !== 'unknown') {
    return { score: 40, reason: `Exact specialization match (${supplyCategory})` };
  }

  // Adjacent match
  const adjacentRoles = ROLE_ADJACENCY[demandRoleType] || [];
  for (const adjRole of adjacentRoles) {
    const adjCategory = roleToCategory[adjRole];
    if (supplyCategory === adjCategory && supplyCategory !== 'unknown') {
      return { score: 20, reason: `Adjacent specialization (${supplyCategory})` };
    }
  }

  // Generic/Unknown
  if (supplyCategory === 'unknown') {
    return { score: 5, reason: null };  // No reason for generic
  }

  // Mismatched but known category
  return { score: 10, reason: null };
}

/**
 * Score size alignment (0-25 points)
 * High pressure favors larger teams, low pressure allows boutique
 */
function scoreSizeAlignment(
  supply: SupplyCompany,
  confidence: 'high' | 'medium' | 'low'
): { score: number; reason: string | null } {
  const text = [
    supply.name || '',
    supply.description || '',
    supply.specialty || ''
  ].join(' ').toLowerCase();

  const hasVolumeKeywords = VOLUME_KEYWORDS.some(kw => text.includes(kw));
  const hasBoutiqueKeywords = BOUTIQUE_KEYWORDS.some(kw => text.includes(kw));

  if (confidence === 'high') {
    // High pressure favors volume agencies
    if (hasVolumeKeywords) {
      return { score: 25, reason: 'High-volume agency matches high hiring pressure' };
    }
    if (hasBoutiqueKeywords) {
      return { score: 10, reason: null };  // Boutique less ideal for high volume
    }
    return { score: 15, reason: null };  // Neutral
  }

  if (confidence === 'low') {
    // Low pressure allows boutique agencies
    if (hasBoutiqueKeywords) {
      return { score: 25, reason: 'Boutique agency matches focused hiring need' };
    }
    if (hasVolumeKeywords) {
      return { score: 15, reason: null };  // Volume agencies still okay
    }
    return { score: 20, reason: null };  // Neutral slightly higher for low pressure
  }

  // Medium confidence - neutral scoring
  if (hasVolumeKeywords || hasBoutiqueKeywords) {
    return { score: 20, reason: null };
  }
  return { score: 15, reason: null };
}

/**
 * Score pressure fit based on classification confidence (0-20 points)
 */
function scorePressureFit(
  supply: SupplyCompany,
  pressureConfidence: 'high' | 'medium' | 'low'
): { score: number; reason: string | null } {
  const classificationConfidence = supply.classification?.confidence || 'low';

  // High pressure confidence + high classification confidence = best fit
  if (pressureConfidence === 'high' && classificationConfidence === 'high') {
    return { score: 20, reason: 'High-confidence match for high-pressure demand' };
  }

  // Matching confidence levels
  if (pressureConfidence === classificationConfidence) {
    return { score: 15, reason: null };
  }

  // One level difference
  const confOrder = { high: 3, medium: 2, low: 1 };
  const diff = Math.abs(confOrder[pressureConfidence] - confOrder[classificationConfidence]);
  if (diff === 1) {
    return { score: 10, reason: null };
  }

  // Large mismatch
  return { score: 5, reason: null };
}

/**
 * Score recency/activity (0-15 points)
 */
function scoreRecencyActivity(
  supply: SupplyCompany
): { score: number; reason: string | null } {
  const text = [
    supply.name || '',
    supply.description || '',
    supply.specialty || ''
  ].join(' ').toLowerCase();

  const hasActivityKeywords = ACTIVITY_KEYWORDS.some(kw => text.includes(kw));

  // Check for any date-like patterns indicating recent activity
  const hasRecentDate = /202[3-5]|last month|this year|recently/.test(text);

  if (hasActivityKeywords && hasRecentDate) {
    return { score: 15, reason: 'Recent placement activity detected' };
  }

  if (hasActivityKeywords || hasRecentDate) {
    return { score: 10, reason: null };
  }

  // No activity signals - neutral score
  return { score: 5, reason: null };
}

// ============================================================================
// MAIN RANKING FUNCTION
// ============================================================================

/**
 * Rank supply providers based on pressure detection signals.
 *
 * ONLY call this when pressureDetection.pressureDetected === true.
 * Returns same providers, sorted by qualityScore descending.
 *
 * @param supplies - Array of supply companies to rank
 * @param context - Ranking context with pressure detection info
 * @returns Ranked supply companies with scores and reasons
 */
export function rankSupplyProviders(
  supplies: SupplyCompany[],
  context: RankingContext
): RankedSupplyCompany[] {
  const { pressureDetection, demandCategory } = context;

  if (!pressureDetection.pressureDetected) {
    // Fallback: return as-is with neutral scores
    return supplies.map(s => ({
      ...s,
      qualityScore: 50,
      rankingReason: []
    }));
  }

  const roleType = pressureDetection.roleType;
  const confidence = pressureDetection.confidence;

  const ranked: RankedSupplyCompany[] = supplies.map(supply => {
    const reasons: string[] = [];
    let totalScore = 0;

    // 1. Specialization match (0-40)
    const specResult = scoreSpecializationMatch(
      supply.hireCategory,
      roleType
    );
    totalScore += specResult.score;
    if (specResult.reason) reasons.push(specResult.reason);

    // 2. Size alignment (0-25)
    const sizeResult = scoreSizeAlignment(supply, confidence);
    totalScore += sizeResult.score;
    if (sizeResult.reason) reasons.push(sizeResult.reason);

    // 3. Pressure fit (0-20)
    const pressureResult = scorePressureFit(supply, confidence);
    totalScore += pressureResult.score;
    if (pressureResult.reason) reasons.push(pressureResult.reason);

    // 4. Recency/activity (0-15)
    const recencyResult = scoreRecencyActivity(supply);
    totalScore += recencyResult.score;
    if (recencyResult.reason) reasons.push(recencyResult.reason);

    return {
      ...supply,
      qualityScore: totalScore,
      rankingReason: reasons
    };
  });

  // Sort by qualityScore descending
  ranked.sort((a, b) => b.qualityScore - a.qualityScore);

  return ranked;
}

/**
 * Get the top-ranked supply provider.
 * Returns null if no supplies provided.
 */
export function getTopRankedSupply(
  supplies: SupplyCompany[],
  context: RankingContext
): RankedSupplyCompany | null {
  if (supplies.length === 0) return null;

  const ranked = rankSupplyProviders(supplies, context);
  return ranked[0] || null;
}

/**
 * Check if a supply company is the top-ranked one.
 */
export function isTopRanked(
  supply: SupplyCompany,
  allSupplies: SupplyCompany[],
  context: RankingContext
): boolean {
  const top = getTopRankedSupply(allSupplies, context);
  return top?.domain === supply.domain;
}
