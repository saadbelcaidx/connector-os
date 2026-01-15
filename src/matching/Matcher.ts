/**
 * MATCHER
 *
 * Finds a named counterparty from the supply pool that matches demand.
 * Returns null if no match with score >= 0.7 or if supply lacks named contact.
 *
 * RULES:
 * - Must return NAMED person (contact + email) or null
 * - Must compute factual fitReason from actual data only
 * - No category claims, no invented details
 * - Threshold: score >= 0.7
 */

import type { DemandRecord } from '../schemas/DemandRecord';
import type { SupplyRecord } from '../schemas/SupplyRecord';
import type { Edge } from '../schemas/Edge';
import type { Counterparty } from '../schemas/IntroOutput';

// =============================================================================
// SCORING WEIGHTS
// =============================================================================

const WEIGHTS = {
  SUPPLY_WANTS_DEMAND: 0.4,  // Supply wants what demand has
  DEMAND_NEEDS_SUPPLY: 0.4,  // Demand needs what supply provides
  CONTEXT_FIT: 0.2,          // Geography/size/stage fit
} as const;

const MATCH_THRESHOLD = 0.7;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Normalize string for comparison.
 */
function normalize(str: string | undefined | null): string {
  return (str || '').toLowerCase().trim();
}

/**
 * Tokenize a string into words.
 */
function tokenize(str: string): string[] {
  return normalize(str)
    .split(/[\s,.\-_/]+/)
    .filter(t => t.length > 2);
}

/**
 * Calculate overlap score between two sets of tokens.
 * Returns 0..1 based on Jaccard similarity.
 */
function overlapScore(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) {
    return 0;
  }

  const setB = new Set(tokensB);

  // Count unique tokens in A that exist in B
  const uniqueA: string[] = [];
  const seenA: Record<string, boolean> = {};
  for (let i = 0; i < tokensA.length; i++) {
    const token = tokensA[i];
    if (!seenA[token]) {
      seenA[token] = true;
      uniqueA.push(token);
    }
  }

  let intersection = 0;
  for (let i = 0; i < uniqueA.length; i++) {
    if (setB.has(uniqueA[i])) {
      intersection++;
    }
  }

  const union = uniqueA.length + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Check if string contains any of the keywords.
 */
function containsAny(str: string, keywords: string[]): boolean {
  const normalized = normalize(str);
  return keywords.some(kw => normalized.includes(normalize(kw)));
}

// =============================================================================
// SCORING FUNCTIONS
// =============================================================================

/**
 * Score: Does supply want what demand has?
 * Compares supply.targetProfile vs demand metadata/industry.
 */
function scoreSupplyWantsDemand(
  supply: SupplyRecord,
  demand: DemandRecord
): number {
  // Get supply target tokens
  const supplyTargetTokens = [
    ...tokenize(supply.targetProfile),
    ...tokenize(supply.capability),
  ];

  // Get demand profile tokens
  const demandProfileTokens = [
    ...tokenize(demand.industry),
    ...tokenize(demand.metadata.profileTags || ''),
    ...tokenize(demand.metadata.services || ''),
    ...tokenize(demand.metadata.revenueRange || ''),
  ];

  // Calculate overlap
  const overlap = overlapScore(supplyTargetTokens, demandProfileTokens);

  // Boost if explicit match keywords found
  const supplyTarget = normalize(supply.targetProfile);
  const demandIndustry = normalize(demand.industry);

  // Check for explicit industry alignment
  if (supplyTarget && demandIndustry) {
    if (supplyTarget.includes(demandIndustry) || demandIndustry.includes(supplyTarget)) {
      return Math.min(1, overlap + 0.3);
    }
  }

  return overlap;
}

/**
 * Score: Does demand need what supply provides?
 * Compares demand needs vs supply capability.
 */
function scoreDemandNeedsSupply(
  demand: DemandRecord,
  supply: SupplyRecord,
  edge: Edge
): number {
  // Get demand need tokens from signals and metadata
  const demandNeedTokens = [
    ...tokenize(demand.metadata.needsTags || ''),
    ...tokenize(edge.type),
    ...demand.signals.map(s => normalize(s.type)),
  ];

  // Get supply capability tokens
  const supplyCapabilityTokens = [
    ...tokenize(supply.capability),
    ...tokenize(supply.metadata.services || ''),
    ...tokenize(supply.metadata.specialization || ''),
  ];

  // Calculate overlap
  const overlap = overlapScore(demandNeedTokens, supplyCapabilityTokens);

  // Boost for edge-capability alignment
  const edgeType = normalize(edge.type);
  const capability = normalize(supply.capability);

  // HIRING edges + recruiting capability
  if (edgeType.includes('hiring') || edgeType.includes('leadership') || edgeType.includes('scaling')) {
    if (containsAny(capability, ['recruit', 'staffing', 'talent', 'hiring', 'search'])) {
      return Math.min(1, overlap + 0.4);
    }
  }

  // GROWTH edges + growth-focused capability
  if (edgeType.includes('growth') || edgeType.includes('expansion')) {
    if (containsAny(capability, ['growth', 'expansion', 'scale', 'acquisition'])) {
      return Math.min(1, overlap + 0.3);
    }
  }

  // SUCCESSION edges + M&A capability
  if (edgeType.includes('succession')) {
    if (containsAny(capability, ['acquisition', 'm&a', 'succession', 'exit', 'transition'])) {
      return Math.min(1, overlap + 0.4);
    }
  }

  return overlap;
}

/**
 * Score: Geography/size/stage fit.
 * Returns 0 if data not present.
 */
function scoreContextFit(
  demand: DemandRecord,
  supply: SupplyRecord
): number {
  let score = 0;
  let factors = 0;

  // Geography fit
  const demandLocation = normalize(demand.metadata.location || demand.metadata.region || '');
  const supplyTargetRegions = normalize(supply.metadata.targetRegions || '');

  if (demandLocation && supplyTargetRegions) {
    factors++;
    if (supplyTargetRegions.includes(demandLocation) ||
        demandLocation.includes(supplyTargetRegions) ||
        supplyTargetRegions.includes('nationwide') ||
        supplyTargetRegions.includes('national') ||
        supplyTargetRegions.includes('all')) {
      score += 1;
    }
  }

  // Size/revenue fit
  const demandRevenue = demand.metadata.revenue || demand.metadata.aum;
  const supplyTargetRange = supply.metadata.targetRevenueRange;

  if (demandRevenue && supplyTargetRange) {
    factors++;
    // Simple check: if supply targets this range
    const demandRevenueStr = String(demandRevenue).toLowerCase();
    const targetRangeStr = String(supplyTargetRange).toLowerCase();

    // Parse revenue value
    const demandValue = parseRevenueValue(demandRevenueStr);
    const [minTarget, maxTarget] = parseRevenueRange(targetRangeStr);

    if (demandValue >= minTarget && demandValue <= maxTarget) {
      score += 1;
    }
  }

  // Stage fit
  const demandStage = normalize(demand.metadata.stage || '');
  const supplyTargetStages = normalize(supply.metadata.targetStages || '');

  if (demandStage && supplyTargetStages) {
    factors++;
    if (supplyTargetStages.includes(demandStage)) {
      score += 1;
    }
  }

  // Return average of matched factors, or 0 if no factors
  return factors > 0 ? score / factors : 0;
}

/**
 * Parse revenue string to numeric value (in millions).
 */
function parseRevenueValue(str: string): number {
  const cleaned = str.replace(/[^0-9.bmk]/gi, '');
  let value = parseFloat(cleaned) || 0;

  if (str.includes('b')) {
    value *= 1000;
  } else if (str.includes('k')) {
    value /= 1000;
  }
  // Default assumption: value is in millions

  return value;
}

/**
 * Parse revenue range string to [min, max] in millions.
 */
function parseRevenueRange(str: string): [number, number] {
  // Try to extract range like "10-50" or "10m-50m"
  const match = str.match(/(\d+(?:\.\d+)?)[^0-9]*-[^0-9]*(\d+(?:\.\d+)?)/);
  if (match) {
    let min = parseFloat(match[1]);
    let max = parseFloat(match[2]);

    // Handle billions
    if (str.includes('b')) {
      min *= 1000;
      max *= 1000;
    }

    return [min, max];
  }

  // If no range, return wide range
  return [0, Infinity];
}

// =============================================================================
// FIT REASON GENERATION
// =============================================================================

/**
 * Generate factual fit reason from actual data.
 * No invented details - only uses fields present in records.
 */
function generateFitReason(
  demand: DemandRecord,
  supply: SupplyRecord,
  edge: Edge
): string {
  const parts: string[] = [];

  // What supply does (from capability)
  const capability = supply.capability?.trim();
  if (capability) {
    parts.push(`${supply.company} focuses on ${capability}`);
  }

  // What demand has (from edge evidence)
  if (edge.evidence) {
    parts.push(`${demand.company} ${edge.evidence}`);
  }

  // If we have both, combine
  if (parts.length >= 2) {
    return `${parts[0]}. ${parts[1]}.`;
  }

  // Fallback to simple match statement
  if (parts.length === 1) {
    return parts[0] + '.';
  }

  // Minimal fallback (should rarely happen if data is present)
  return `${supply.company} aligns with ${demand.company}'s current needs.`;
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

export interface MatchResult {
  counterparty: Counterparty;
  supplyRecord: SupplyRecord;
  score: number;
}

/**
 * Find the best matching counterparty from supply pool.
 *
 * @param demand - DemandRecord to match
 * @param edge - Detected edge for this demand
 * @param supplyPool - Array of supply records to search
 * @returns MatchResult if match found with score >= 0.7, null otherwise
 */
export function findCounterparty(
  demand: DemandRecord,
  edge: Edge,
  supplyPool: SupplyRecord[]
): MatchResult | null {
  const candidates: Array<{
    supply: SupplyRecord;
    score: number;
    fitReason: string;
  }> = [];

  for (const supply of supplyPool) {
    // GATE: Must have named contact with email
    if (!supply.contact || !supply.contact.trim()) {
      continue;
    }
    if (!supply.email || !supply.email.trim()) {
      continue;
    }

    // Calculate scores
    const scoreA = scoreSupplyWantsDemand(supply, demand);
    const scoreB = scoreDemandNeedsSupply(demand, supply, edge);
    const scoreC = scoreContextFit(demand, supply);

    // Weighted total
    const totalScore =
      WEIGHTS.SUPPLY_WANTS_DEMAND * scoreA +
      WEIGHTS.DEMAND_NEEDS_SUPPLY * scoreB +
      WEIGHTS.CONTEXT_FIT * scoreC;

    // Only consider if above threshold
    if (totalScore >= MATCH_THRESHOLD) {
      const fitReason = generateFitReason(demand, supply, edge);
      candidates.push({
        supply,
        score: totalScore,
        fitReason,
      });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  // Sort by score descending, then by email for stability
  candidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.supply.email.localeCompare(b.supply.email);
  });

  // Return best match
  const best = candidates[0];

  return {
    counterparty: {
      company: best.supply.company,
      contact: best.supply.contact,
      email: best.supply.email,
      title: best.supply.title,
      fitReason: best.fitReason,
    },
    supplyRecord: best.supply,
    score: best.score,
  };
}
