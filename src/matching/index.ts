/**
 * MATCHING BRAIN — The Product
 *
 * This is where ALL the intelligence goes.
 *
 * Input: Demand records + Supply records
 * Output: Matched pairs with confidence scores
 *
 * Supply aggregation: Each supplier gets ONE email,
 * mentioning their best demand match, implying more.
 */

import { NormalizedRecord } from '../schemas';
import type { ConnectorMode } from '../services/SupplyFilterBuilder';
import { validateMatch } from './buyerSellerTypes';
import {
  SEMANTIC_MATCHING_ENABLED,
  expandSemanticSignals,
  extractTokens,
  computeSemanticOverlap
} from './semantic';
import {
  SEMANTIC_V2_ENABLED,
  preloadSemanticBundle,
  computeSemanticOverlapV2,
  isBundleLoaded
} from './semanticV2';

// Preload ConceptNet bundle on module load (if V2 enabled)
preloadSemanticBundle();

// =============================================================================
// TYPE SAFETY UTILITIES
// =============================================================================

/**
 * Safely convert any value to string for .replace() and other string operations.
 * Prevents "e.replace is not a function" errors when fields are numbers/objects/null.
 */
function toStringSafe(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  // Arrays/objects - stringify
  try { return JSON.stringify(v); } catch { return String(v); }
}

/**
 * Log non-string field once (for debugging data issues).
 * Uses a Set to avoid spamming logs.
 */
const loggedNonStrings = new Set<string>();
function logNonStringOnce(fieldName: string, value: unknown): void {
  const key = `${fieldName}:${typeof value}`;
  if (!loggedNonStrings.has(key)) {
    loggedNonStrings.add(key);
    console.warn('[MATCH] non-string field detected', {
      fieldName,
      type: typeof value,
      sample: typeof value === 'object' ? JSON.stringify(value)?.slice(0, 100) : value
    });
  }
}

// =============================================================================
// TYPES
// =============================================================================

/**
 * Confidence tier for match quality display.
 * TikTok-style: Show confidence, never block.
 */
export type ConfidenceTier = 'strong' | 'good' | 'open';

/**
 * Need profile extracted from demand signals.
 */
export interface NeedProfile {
  category: 'engineering' | 'sales' | 'marketing' | 'recruiting' | 'finance' | 'operations' | 'growth' | 'general';
  specifics: string[];     // e.g., ["ML", "backend", "senior"]
  confidence: number;      // 0-1
  source: string;          // What data it came from
}

/**
 * Capability profile extracted from supply data.
 */
export interface CapabilityProfile {
  category: 'engineering' | 'sales' | 'marketing' | 'recruiting' | 'finance' | 'operations' | 'growth' | 'general';
  specifics: string[];     // e.g., ["tech recruiting", "startups"]
  confidence: number;      // 0-1
  source: string;          // What data it came from
}

/**
 * Neutral narrative for "why this match"
 * Used for match context without timing claims.
 */
export interface MatchNarrative {
  demandType: string;      // e.g., "fintech company", "clinical-stage biotech"
  supplyType: string;      // e.g., "engineering recruiter", "pharma BD"
  why: string;             // First matching reason
  neutral: true;           // Enforces no timing claims
}

export interface Match {
  demand: NormalizedRecord;
  supply: NormalizedRecord;
  score: number;  // 0-100
  reasons: string[];
  narrative?: MatchNarrative;  // PHASE-1 FIX: Optional neutral "why this match"
  buyerSellerValid?: boolean;  // Supply Truth Constraint: buyer-seller overlap validated

  // NEW: TikTok-style confidence
  tier: ConfidenceTier;
  tierReason: string;           // Human-readable: "Hiring engineers → Tech recruiter"
  needProfile?: NeedProfile;
  capabilityProfile?: CapabilityProfile;
}

export interface SupplyAggregate {
  supply: NormalizedRecord;
  matches: Match[];
  bestMatch: Match;
  totalMatches: number;
}

export interface MatchingResult {
  // Demand side: one email per demand company
  demandMatches: Match[];

  // Supply side: one email per supplier (aggregated)
  supplyAggregates: SupplyAggregate[];

  // Stats
  stats: {
    totalDemand: number;
    totalSupply: number;
    totalMatches: number;
    avgScore: number;
  };
}

// =============================================================================
// MAIN MATCHING FUNCTION
// =============================================================================

/**
 * Match demand records to supply records.
 *
 * Returns:
 * - demandMatches: Each demand paired with best supply
 * - supplyAggregates: Each supply with ALL their matches (for one email)
 *
 * NOTE: This is now ASYNC with yielding to prevent UI freeze on large datasets.
 */
export async function matchRecords(
  demand: NormalizedRecord[],
  supply: NormalizedRecord[],
  onProgress?: (current: number, total: number) => void,
  mode?: ConnectorMode  // Optional: for buyer-seller validation
): Promise<MatchingResult> {

  const totalComparisons = demand.length * supply.length;
  console.log(`[matchRecords] ENTER: ${demand.length} demand × ${supply.length} supply = ${totalComparisons} comparisons, mode=${mode || 'none'}`);
  const startTime = performance.now();

  const allMatches: Match[] = [];
  let comparisonCount = 0;
  let buyerSellerFiltered = 0;  // Track mismatches
  const YIELD_EVERY = 500; // Yield to event loop every N comparisons

  // Score every demand-supply pair with yielding
  for (const d of demand) {
    for (const s of supply) {
      const {
        score, reasons, narrative, buyerSellerValid,
        tier, tierReason, needProfile, capabilityProfile
      } = scoreMatch(d, s, mode);

      // SUPPLY TRUTH CONSTRAINT: If buyer-seller mismatch, skip this pair
      if (buyerSellerValid === false) {
        buyerSellerFiltered++;
        // Do not add to matches - mismatch filtered out
        comparisonCount++;
        continue;
      }

      if (score > 0) {
        allMatches.push({
          demand: d,
          supply: s,
          score,
          reasons,
          narrative,
          buyerSellerValid,
          tier,
          tierReason,
          needProfile,
          capabilityProfile,
        });
      }

      comparisonCount++;

      // Yield to event loop periodically to prevent UI freeze
      if (comparisonCount % YIELD_EVERY === 0) {
        onProgress?.(comparisonCount, totalComparisons);
        // Yield via setTimeout(0) to let React update
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  }

  console.log(`[matchRecords] Scoring complete: ${comparisonCount} comparisons, ${allMatches.length} matches with score > 0, ${buyerSellerFiltered} buyer-seller mismatches filtered`);

  // Sort by score descending
  allMatches.sort((a, b) => b.score - a.score);

  // DEMAND SIDE: Distribute demand across supply using round-robin
  // (Replaces winner-takes-all getBestMatchPerDemand)
  const demandMatches = distributeMatchesRoundRobin(allMatches, {
    maxCandidatesPerDemand: 3
  });

  // SUPPLY SIDE: Aggregate matches per supplier (from demandMatches, not allMatches)
  // DOCTRINE: Only supplies that appear in demandMatches should be in supplyAggregates.
  // This ensures supplyIntros (populated from demandMatches) aligns with supplyAggregates.
  const supplyAggregates = aggregateBySupply(demandMatches);

  // Calculate stats
  const scores = allMatches.map(m => m.score);
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  const elapsed = Math.round(performance.now() - startTime);
  console.log(`[matchRecords] EXIT: ${elapsed}ms, demandMatches=${demandMatches.length}, supplyAggregates=${supplyAggregates.length}`);

  return {
    demandMatches,
    supplyAggregates,
    stats: {
      totalDemand: demand.length,
      totalSupply: supply.length,
      totalMatches: allMatches.length,
      avgScore,
    },
  };
}

/**
 * Synchronous version for small datasets (< 1000 comparisons)
 * Use matchRecords for larger datasets.
 */
export function matchRecordsSync(
  demand: NormalizedRecord[],
  supply: NormalizedRecord[],
  mode?: ConnectorMode  // Optional: for buyer-seller validation
): MatchingResult {

  const allMatches: Match[] = [];
  let buyerSellerFiltered = 0;

  // Score every demand-supply pair
  for (const d of demand) {
    for (const s of supply) {
      const {
        score, reasons, narrative, buyerSellerValid,
        tier, tierReason, needProfile, capabilityProfile
      } = scoreMatch(d, s, mode);

      // SUPPLY TRUTH CONSTRAINT: If buyer-seller mismatch, skip
      if (buyerSellerValid === false) {
        buyerSellerFiltered++;
        continue;
      }

      if (score > 0) {
        allMatches.push({
          demand: d,
          supply: s,
          score,
          reasons,
          narrative,
          buyerSellerValid,
          tier,
          tierReason,
          needProfile,
          capabilityProfile,
        });
      }
    }
  }

  if (buyerSellerFiltered > 0) {
    console.log(`[matchRecordsSync] ${buyerSellerFiltered} buyer-seller mismatches filtered`);
  }

  // Sort by score descending
  allMatches.sort((a, b) => b.score - a.score);

  // DEMAND SIDE: Distribute demand across supply using round-robin
  // (Replaces winner-takes-all getBestMatchPerDemand)
  const demandMatches = distributeMatchesRoundRobin(allMatches, {
    maxCandidatesPerDemand: 3
  });

  // SUPPLY SIDE: Aggregate matches per supplier (from demandMatches, not allMatches)
  // DOCTRINE: Only supplies that appear in demandMatches should be in supplyAggregates.
  // This ensures supplyIntros (populated from demandMatches) aligns with supplyAggregates.
  const supplyAggregates = aggregateBySupply(demandMatches);

  // Calculate stats
  const scores = allMatches.map(m => m.score);
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  return {
    demandMatches,
    supplyAggregates,
    stats: {
      totalDemand: demand.length,
      totalSupply: supply.length,
      totalMatches: allMatches.length,
      avgScore,
    },
  };
}

// =============================================================================
// NEED & CAPABILITY EXTRACTION (TikTok-style algorithm foundation)
// =============================================================================

type CategoryType = NeedProfile['category'];

/**
 * Extract NEED from demand signals.
 * What does this company actually need?
 *
 * Sources (in priority order):
 * 1. Job title/signal (strongest - explicit need)
 * 2. Funding signal (general growth need)
 * 3. Company description (inferred need)
 */
function extractNeedFromDemand(demand: NormalizedRecord): NeedProfile {
  const signal = toStringSafe(demand.signal).toLowerCase();
  const title = toStringSafe(demand.title).toLowerCase();
  const description = toStringSafe(demand.companyDescription).toLowerCase();
  const funding = toStringSafe(demand.companyFunding).toLowerCase();

  // Check job title/signal first (strongest signal)
  const combined = `${signal} ${title}`;

  // Engineering need
  if (/engineer|developer|software|tech|cto|devops|backend|frontend|fullstack|ml|ai\b|data scientist/.test(combined)) {
    const specifics: string[] = [];
    if (/senior|staff|lead|principal/.test(combined)) specifics.push('senior');
    if (/ml|machine learning|ai\b/.test(combined)) specifics.push('ML/AI');
    if (/backend|server/.test(combined)) specifics.push('backend');
    if (/frontend|react|ui/.test(combined)) specifics.push('frontend');
    if (/fullstack|full-stack/.test(combined)) specifics.push('fullstack');
    if (/devops|infra|platform/.test(combined)) specifics.push('infrastructure');

    return {
      category: 'engineering',
      specifics,
      confidence: 0.9,
      source: 'job_signal'
    };
  }

  // Sales need
  if (/sales|account executive|ae\b|sdr|bdr|revenue|business development|closer/.test(combined)) {
    const specifics: string[] = [];
    if (/vp|head|director/.test(combined)) specifics.push('leadership');
    if (/enterprise/.test(combined)) specifics.push('enterprise');
    if (/smb|small/.test(combined)) specifics.push('SMB');

    return {
      category: 'sales',
      specifics,
      confidence: 0.9,
      source: 'job_signal'
    };
  }

  // Marketing need
  if (/marketing|growth|brand|content|seo|paid|demand gen|cmg|gtm/.test(combined)) {
    const specifics: string[] = [];
    if (/head|vp|director/.test(combined)) specifics.push('leadership');
    if (/content/.test(combined)) specifics.push('content');
    if (/paid|performance/.test(combined)) specifics.push('paid');
    if (/brand/.test(combined)) specifics.push('brand');

    return {
      category: 'marketing',
      specifics,
      confidence: 0.9,
      source: 'job_signal'
    };
  }

  // Finance need
  if (/finance|cfo|accounting|controller|fp&a|bookkeep/.test(combined)) {
    return {
      category: 'finance',
      specifics: [],
      confidence: 0.9,
      source: 'job_signal'
    };
  }

  // Operations need
  if (/operations|ops|coo|chief operating|supply chain|logistics/.test(combined)) {
    return {
      category: 'operations',
      specifics: [],
      confidence: 0.9,
      source: 'job_signal'
    };
  }

  // Recruiting/HR need
  if (/recruiter|talent|hr\b|human resources|people ops/.test(combined)) {
    return {
      category: 'recruiting',
      specifics: [],
      confidence: 0.9,
      source: 'job_signal'
    };
  }

  // Funding signal = general growth need (matches many capabilities)
  if (funding || /raised|funding|series|seed|round/.test(combined + ' ' + description)) {
    return {
      category: 'growth',
      specifics: ['post-funding', 'scaling'],
      confidence: 0.7,
      source: 'funding_signal'
    };
  }

  // No clear signal - general/exploratory
  return {
    category: 'general',
    specifics: [],
    confidence: 0.3,
    source: 'none'
  };
}

/**
 * Extract CAPABILITY from supply data.
 * What does this provider actually do?
 *
 * Sources (in priority order):
 * 1. Company description (strongest)
 * 2. Job title of contact
 * 3. Company name
 * 4. Industry field
 */
function extractCapabilityFromSupply(supply: NormalizedRecord): CapabilityProfile {
  const description = toStringSafe(supply.companyDescription).toLowerCase();
  const title = toStringSafe(supply.title).toLowerCase();
  const company = toStringSafe(supply.company).toLowerCase();
  const industry = toStringSafe(
    Array.isArray(supply.industry) ? supply.industry[0] : supply.industry
  ).toLowerCase();

  const combined = `${description} ${title} ${company} ${industry}`;

  // Recruiting capability
  if (/recruit|staffing|talent|headhunt|placement|hiring/.test(combined)) {
    const specifics: string[] = [];
    if (/tech|engineer|software/.test(combined)) specifics.push('tech');
    if (/executive|c-suite|leadership/.test(combined)) specifics.push('executive');
    if (/sales/.test(combined)) specifics.push('sales');
    if (/marketing/.test(combined)) specifics.push('marketing');
    if (/finance/.test(combined)) specifics.push('finance');

    const confidence = description.includes('recruit') ? 0.95 :
      title.includes('recruit') ? 0.85 : 0.7;

    return {
      category: 'recruiting',
      specifics,
      confidence,
      source: description.includes('recruit') ? 'description' :
        title.includes('recruit') ? 'title' : 'company_name'
    };
  }

  // Marketing capability
  if (/marketing|agency|growth|brand|advertising|pr\b|communications|creative|media|seo|paid/.test(combined)) {
    const specifics: string[] = [];
    if (/startup|series|venture/.test(combined)) specifics.push('startups');
    if (/enterprise|b2b/.test(combined)) specifics.push('enterprise');
    if (/content/.test(combined)) specifics.push('content');
    if (/paid|performance/.test(combined)) specifics.push('performance');
    if (/brand/.test(combined)) specifics.push('brand');

    const confidence = description.includes('marketing') || description.includes('agency') ? 0.9 :
      company.includes('marketing') ? 0.8 : 0.6;

    return {
      category: 'marketing',
      specifics,
      confidence,
      source: description ? 'description' : 'company_name'
    };
  }

  // Engineering/Dev capability
  if (/software|development|engineering|dev shop|tech|app|web|mobile|saas/.test(combined) &&
    !/recruit/.test(combined)) {
    const specifics: string[] = [];
    if (/startup/.test(combined)) specifics.push('startups');
    if (/enterprise/.test(combined)) specifics.push('enterprise');
    if (/mobile|ios|android/.test(combined)) specifics.push('mobile');
    if (/web|frontend/.test(combined)) specifics.push('web');

    return {
      category: 'engineering',
      specifics,
      confidence: 0.7,
      source: 'description'
    };
  }

  // Sales capability
  if (/sales training|sales enablement|revenue|business development|lead gen/.test(combined)) {
    return {
      category: 'sales',
      specifics: [],
      confidence: 0.7,
      source: 'description'
    };
  }

  // Finance capability
  if (/cfo|fractional|accounting|bookkeep|finance/.test(combined) && !/recruit/.test(combined)) {
    return {
      category: 'finance',
      specifics: [],
      confidence: 0.7,
      source: 'description'
    };
  }

  // Operations capability
  if (/operations|consulting|strategy|advisory/.test(combined)) {
    return {
      category: 'operations',
      specifics: [],
      confidence: 0.5,
      source: 'description'
    };
  }

  // Growth - general consultants/agencies
  if (/consultant|advisor|partner|agency/.test(combined)) {
    return {
      category: 'growth',
      specifics: [],
      confidence: 0.4,
      source: 'title'
    };
  }

  // Unknown capability
  return {
    category: 'general',
    specifics: [],
    confidence: 0.2,
    source: 'none'
  };
}

/**
 * Calculate alignment score between need and capability.
 * Returns 0-50 points based on how well they match.
 */
function scoreAlignment(need: NeedProfile, capability: CapabilityProfile): number {
  // Direct category match = strong alignment
  if (need.category === capability.category) {
    return 50;
  }

  // Growth need matches most capabilities (funding = needs everything)
  if (need.category === 'growth') {
    // Better match for marketing/recruiting (common post-funding needs)
    if (capability.category === 'marketing' || capability.category === 'recruiting') {
      return 40;
    }
    // Still decent match for others
    if (capability.category !== 'general') {
      return 30;
    }
    return 20;
  }

  // Recruiting capability can serve many needs (they find the people)
  if (capability.category === 'recruiting') {
    if (['engineering', 'sales', 'marketing', 'finance', 'operations'].includes(need.category)) {
      return 35;
    }
  }

  // Cross-functional matches
  const crossMatches: Record<string, string[]> = {
    'engineering': ['recruiting', 'operations'],
    'sales': ['marketing', 'recruiting'],
    'marketing': ['sales', 'growth'],
    'finance': ['operations', 'recruiting'],
  };

  if (crossMatches[need.category]?.includes(capability.category)) {
    return 25;
  }

  // General matches general
  if (need.category === 'general' || capability.category === 'general') {
    return 15;
  }

  // Poor alignment
  return 10;
}

/**
 * Determine confidence tier based on score and profiles.
 */
function determineTier(
  score: number,
  need: NeedProfile,
  capability: CapabilityProfile,
  demandSignalLabel?: string  // From signalMeta.label — truth from normalization
): { tier: ConfidenceTier; tierReason: string } {
  // Build human-readable reason — use signalMeta.label if available
  const needLabel = demandSignalLabel || (
    need.category === 'growth' ? 'Raised funding' :
    need.category === 'general' ? 'Active company' :
    need.category  // Just use category, no "Hiring" prefix
  );

  const capLabel = capability.category === 'general' ? 'Provider' :
    capability.category === 'recruiting' ? 'Recruiter' :
      capability.category === 'marketing' ? 'Marketing agency' :
        capability.category === 'engineering' ? 'Dev shop' :
          capability.category === 'sales' ? 'Sales consultant' :
            capability.category === 'finance' ? 'Finance consultant' :
              capability.category === 'growth' ? 'Growth partner' :
                'Consultant';

  const tierReason = `${needLabel} → ${capLabel}`;

  // Determine tier based on score and confidence
  const combinedConfidence = (need.confidence + capability.confidence) / 2;

  if (score >= 70 && combinedConfidence >= 0.7) {
    return { tier: 'strong', tierReason };
  }

  if (score >= 45 || (score >= 30 && combinedConfidence >= 0.5)) {
    return { tier: 'good', tierReason };
  }

  return { tier: 'open', tierReason };
}

// =============================================================================
// SCORING
// =============================================================================

/**
 * Build neutral narrative for "why this match"
 * Uses industry + title, NOT signals or timing.
 */
function buildNarrative(
  demand: NormalizedRecord,
  supply: NormalizedRecord,
  reasons: string[]
): MatchNarrative {
  // Extract demand type from industry (fallback: "company")
  const dIndustryRaw = Array.isArray(demand.industry) ? demand.industry[0] : demand.industry;
  const demandType = dIndustryRaw
    ? `${toStringSafe(dIndustryRaw).toLowerCase()} company`
    : 'company';

  // Extract supply type from title (fallback: "provider")
  const supplyTitle = toStringSafe(supply.title).toLowerCase();
  let supplyType = 'provider';
  if (/recruit|staffing|talent/.test(supplyTitle)) {
    supplyType = 'recruiter';
  } else if (/consultant|advisory/.test(supplyTitle)) {
    supplyType = 'consultant';
  } else if (/agency|partner/.test(supplyTitle)) {
    supplyType = 'agency';
  } else if (/bd|business development|licensing/.test(supplyTitle)) {
    supplyType = 'BD team';
  } else if (supplyTitle) {
    supplyType = supplyTitle.slice(0, 30); // Use raw title if specific
  }

  // First reason as "why" (fallback: generic)
  const why = reasons[0] || 'Overlap detected';

  return {
    demandType,
    supplyType,
    why,
    neutral: true,
  };
}


/**
 * Score breakdown - logged for future learning replacement.
 * Each component can be weighted/replaced by ML model.
 */
export interface ScoreBreakdown {
  // Heuristic scores (Option A)
  industryScore: number;
  signalScore: number;
  sizeScore: number;
  alignmentScore: number;
  baseScore: number;

  // Profiles for future learning (Option B)
  needProfile: NeedProfile;
  capabilityProfile: CapabilityProfile;

  // Final
  totalScore: number;
  tier: ConfidenceTier;
  tierReason: string;
}

// Log scores for future analysis (Option B preparation)
const SCORE_LOG_ENABLED = true;
const scoreLog: ScoreBreakdown[] = [];

/**
 * Get score log for analysis (future learning)
 */
export function getScoreLog(): ScoreBreakdown[] {
  return scoreLog;
}

/**
 * Clear score log (call between runs)
 */
export function clearScoreLog(): void {
  scoreLog.length = 0;
}

/**
 * Score a demand-supply pair.
 *
 * ARCHITECTURE FOR LEARNING:
 * - Every score component is logged separately
 * - Profiles are extracted and stored
 * - Future: Replace heuristic weights with learned weights
 *
 * Factors:
 * - Industry match (heuristic)
 * - Signal relevance (heuristic)
 * - Size compatibility (heuristic)
 * - Need-Capability alignment (NEW - the core intelligence)
 * - Buyer-seller overlap (mode-specific validation)
 */
export function scoreMatch(
  demand: NormalizedRecord,
  supply: NormalizedRecord,
  mode?: ConnectorMode
): {
  score: number;
  reasons: string[];
  narrative?: MatchNarrative;
  buyerSellerValid?: boolean;
  tier: ConfidenceTier;
  tierReason: string;
  needProfile: NeedProfile;
  capabilityProfile: CapabilityProfile;
} {

  const reasons: string[] = [];

  // ==========================================================================
  // STEP 1: Extract profiles (foundation for learning)
  // ==========================================================================
  const needProfile = extractNeedFromDemand(demand);
  const capabilityProfile = extractCapabilityFromSupply(supply);

  // ==========================================================================
  // STEP 2: Heuristic scoring (replaceable by learning)
  // ==========================================================================

  // Industry match (0-30 points)
  const industryScore = scoreIndustry(demand.industry, supply.industry);
  if (industryScore > 20) {
    reasons.push('Industry match');
  }

  // Signal relevance (0-40 points) - LEGACY, being replaced by alignment
  const signalScore = scoreSignal(demand.signal, supply.title, supply.industry);
  if (signalScore > 25) {
    reasons.push('Signal alignment');
  }

  // Size compatibility (0-20 points)
  const sizeScore = scoreSize(demand.size, supply.size);
  if (sizeScore > 10) {
    reasons.push('Size fit');
  }

  // ==========================================================================
  // STEP 3: Need-Capability alignment (THE CORE INTELLIGENCE)
  // This is what TikTok-style learning will optimize
  // ==========================================================================
  const alignmentScore = scoreAlignment(needProfile, capabilityProfile);
  if (alignmentScore >= 40) {
    reasons.push(`${needProfile.category} need → ${capabilityProfile.category} capability`);
  } else if (alignmentScore >= 25) {
    reasons.push('Cross-functional fit');
  }

  // ==========================================================================
  // STEP 4: Semantic expansion & overlap (MATCH-1)
  // Purely additive - expands tokens before computing overlap bonus
  // ==========================================================================
  let semanticBonus = 0;

  if (SEMANTIC_MATCHING_ENABLED) {
    // Build demand text from all relevant fields
    const demandText = [
      toStringSafe(demand.signal),
      toStringSafe(demand.title),
      toStringSafe(demand.companyDescription),
      toStringSafe(demand.industry)
    ].join(' ');

    // Build supply text from all relevant fields
    const supplyText = [
      toStringSafe(supply.title),
      toStringSafe(supply.companyDescription),
      toStringSafe(supply.company),
      toStringSafe(supply.industry)
    ].join(' ');

    // Extract and expand tokens
    const demandTokens = extractTokens(demandText);
    const supplyTokens = extractTokens(supplyText);

    const expandedDemand = expandSemanticSignals(demandTokens, {
      side: 'demand',
      text: demandText
    });

    const expandedSupply = expandSemanticSignals(supplyTokens, {
      side: 'supply',
      text: supplyText
    });

    // Compute semantic overlap
    const { overlapCount, matchedTokens } = computeSemanticOverlap(
      expandedDemand.expanded,
      expandedSupply.expanded
    );

    // Bonus based on semantic overlap (max 30 points)
    // Key insight: recruiting/hiring overlap now possible via expansion
    if (overlapCount >= 5) {
      semanticBonus = 30;
      reasons.push(`Semantic match: ${matchedTokens.slice(0, 3).join(', ')}`);
    } else if (overlapCount >= 3) {
      semanticBonus = 20;
      reasons.push('Semantic overlap');
    } else if (overlapCount >= 1) {
      semanticBonus = 10;
    }
  }

  // ==========================================================================
  // STEP 4B: SemanticV2 (ConceptNet-powered) - MATCH-2
  // Uses pre-built knowledge graph for universal niche-agnostic expansion
  // ==========================================================================
  if (SEMANTIC_V2_ENABLED && isBundleLoaded()) {
    const demandText = [
      toStringSafe(demand.signal),
      toStringSafe(demand.title),
      toStringSafe(demand.companyDescription),
    ].join(' ');

    const supplyText = [
      toStringSafe(supply.title),
      toStringSafe(supply.companyDescription),
      toStringSafe(supply.company),
    ].join(' ');

    const demandTokens = demandText.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
    const supplyTokens = supplyText.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);

    const v2Overlap = computeSemanticOverlapV2(demandTokens, supplyTokens, {
      maxDepth: 1,
      maxExpansionsPerTerm: 5,
      useGuardrails: true,
    });

    // V2 bonus (additive to V1, but capped)
    if (v2Overlap.score >= 60) {
      const v2Bonus = Math.min(15, 30 - semanticBonus); // Cap total semantic bonus at 30
      semanticBonus += v2Bonus;
      if (v2Bonus > 0) {
        reasons.push(`ConceptNet: ${v2Overlap.matchedTerms.slice(0, 2).join(', ')}`);
      }
    } else if (v2Overlap.score >= 30 && semanticBonus < 20) {
      semanticBonus += 10;
      reasons.push('Semantic graph connection');
    }
  }

  // ==========================================================================
  // STEP 5: Calculate total score
  // WEIGHTS: Can be replaced by learned weights in Option B
  // ==========================================================================
  const WEIGHTS = {
    industry: 0.15,      // 15% - less important than alignment
    signal: 0.15,        // 15% - legacy, will reduce
    size: 0.10,          // 10% - minor factor
    alignment: 0.50,     // 50% - THE MAIN FACTOR
    base: 0.10,          // 10% - everyone gets some score
  };

  const baseScore = 10; // Everyone gets 10 points base

  let totalScore =
    (industryScore * WEIGHTS.industry) +
    (signalScore * WEIGHTS.signal) +
    (sizeScore * WEIGHTS.size) +
    (alignmentScore * WEIGHTS.alignment) +
    (baseScore * WEIGHTS.base) +
    semanticBonus;  // MATCH-1: Semantic expansion bonus

  // Normalize to 0-100 (cap at 100)
  totalScore = Math.min(100, Math.round(totalScore));

  // ==========================================================================
  // STEP 6: Buyer-seller validation (mode-specific, tags don't kill)
  // ==========================================================================
  let buyerSellerValid: boolean | undefined;

  if (mode && mode !== 'custom') {
    const validation = validateMatch(
      {
        companyDescription: supply.companyDescription,
        industry: supply.industry,
        title: supply.title,
      },
      {
        companyDescription: demand.companyDescription,
        industry: demand.industry,
        signal: demand.signal,
      },
      mode
    );

    buyerSellerValid = validation.valid;

    // TAG, DON'T KILL — mismatch becomes soft warning, not blocker
    if (!validation.valid) {
      reasons.push('Soft match — may need positioning');
    }
  }

  // ==========================================================================
  // STEP 7: Determine confidence tier
  // ==========================================================================
  const { tier, tierReason } = determineTier(totalScore, needProfile, capabilityProfile, demand.signalMeta?.label);

  // Ensure minimum score of 1 (never zero - graceful degradation)
  if (totalScore === 0) {
    totalScore = 1;
    reasons.push('Exploratory match');
  }

  // Build narrative
  const narrative = buildNarrative(demand, supply, reasons);

  // ==========================================================================
  // STEP 7: Log for future learning (Option B preparation)
  // ==========================================================================
  if (SCORE_LOG_ENABLED) {
    const breakdown: ScoreBreakdown = {
      industryScore,
      signalScore,
      sizeScore,
      alignmentScore,
      baseScore,
      needProfile,
      capabilityProfile,
      totalScore,
      tier,
      tierReason,
    };

    // Keep log bounded (last 10000 scores)
    if (scoreLog.length > 10000) {
      scoreLog.shift();
    }
    scoreLog.push(breakdown);
  }

  return {
    score: Math.min(totalScore, 100),
    reasons,
    narrative,
    buyerSellerValid,
    tier,
    tierReason,
    needProfile,
    capabilityProfile,
  };
}

/**
 * Score industry alignment.
 */
function scoreIndustry(demandIndustry: unknown, supplyIndustry: unknown): number {
  if (!demandIndustry || !supplyIndustry) return 10; // Base score

  // Handle arrays (from scraper JSON) + safe coercion for non-string values
  const dRaw = Array.isArray(demandIndustry) ? demandIndustry[0] : demandIndustry;
  const sRaw = Array.isArray(supplyIndustry) ? supplyIndustry[0] : supplyIndustry;

  const d = toStringSafe(dRaw).toLowerCase();
  const s = toStringSafe(sRaw).toLowerCase();

  // Exact match
  if (d === s) return 30;

  // Partial match (contains)
  if (d.includes(s) || s.includes(d)) return 20;

  // Related industries
  const relatedGroups = [
    ['software', 'tech', 'technology', 'saas', 'it'],
    ['finance', 'fintech', 'banking', 'financial services'],
    ['healthcare', 'health', 'medical', 'biotech', 'pharma'],
    ['staffing', 'recruiting', 'hr', 'talent', 'human resources'],
    ['marketing', 'advertising', 'media', 'digital marketing'],
    ['sales', 'business development', 'revenue'],
  ];

  for (const group of relatedGroups) {
    const dInGroup = group.some(term => d.includes(term));
    const sInGroup = group.some(term => s.includes(term));
    if (dInGroup && sInGroup) return 15;
  }

  return 5; // Different industries
}

/**
 * Score signal relevance to supply.
 */
function scoreSignal(demandSignal: unknown, supplyTitle: unknown, supplyIndustry: unknown): number {
  if (!demandSignal) return 5;

  // Safe coercion before string operations
  const signal = toStringSafe(demandSignal).toLowerCase();
  const title = toStringSafe(supplyTitle).toLowerCase();
  const industry = toStringSafe(supplyIndustry).toLowerCase();

  // Signal type detection
  const isEngineering = /engineer|developer|software|tech|cto/.test(signal);
  const isSales = /sales|account|revenue|sdr|bdr/.test(signal);
  const isMarketing = /marketing|growth|brand|content/.test(signal);
  const isRecruiting = /recruiter|talent|hr|hiring/.test(signal);
  const isFinance = /finance|cfo|accounting|controller/.test(signal);
  const isProduct = /product|pm|ux|design/.test(signal);

  // Check if supply serves this signal type
  const supplyServesEngineering = /engineer|developer|tech|software/.test(title + industry);
  const supplyServesSales = /sales|revenue|business/.test(title + industry);
  const supplyServesMarketing = /marketing|growth|brand/.test(title + industry);
  const supplyServesRecruiting = /recruit|staffing|talent|hr/.test(title + industry);
  const supplyServesFinance = /finance|accounting|cfo/.test(title + industry);
  const supplyServesProduct = /product|design|ux/.test(title + industry);

  // Match signal type to supply specialty
  if (isEngineering && supplyServesEngineering) return 40;
  if (isSales && supplyServesSales) return 40;
  if (isMarketing && supplyServesMarketing) return 40;
  if (isRecruiting && supplyServesRecruiting) return 40;
  if (isFinance && supplyServesFinance) return 40;
  if (isProduct && supplyServesProduct) return 40;

  // Partial match
  if (supplyServesRecruiting) return 25; // Recruiters can serve many signals

  return 10; // Base
}

/**
 * Score size compatibility.
 */
function scoreSize(demandSize: unknown, supplySize: unknown): number {
  // For now, simple scoring. Future: more nuanced.
  if (!demandSize || !supplySize) return 10;

  // Handle arrays (from scraper JSON) - extract first element
  const dSizeRaw = Array.isArray(demandSize) ? demandSize[0] : demandSize;
  const sSizeRaw = Array.isArray(supplySize) ? supplySize[0] : supplySize;

  // Parse sizes (parseSize handles type coercion via toStringSafe)
  const dSize = parseSize(dSizeRaw);
  const sSize = parseSize(sSizeRaw);

  // Small suppliers often serve small-medium demand
  // Large suppliers often serve medium-large demand
  const ratio = dSize / Math.max(sSize, 1);

  if (ratio >= 0.5 && ratio <= 5) return 20; // Good fit
  if (ratio >= 0.2 && ratio <= 10) return 15; // Reasonable fit
  return 5; // Poor fit
}

function parseSize(size: unknown): number {
  // Log non-string fields once for debugging
  if (size !== null && size !== undefined && typeof size !== 'string') {
    logNonStringOnce('size', size);
  }
  // Safe coercion before .replace()
  const num = parseInt(toStringSafe(size).replace(/[^0-9]/g, ''), 10);
  return isNaN(num) ? 50 : num; // Default to 50 if can't parse
}

// =============================================================================
// AGGREGATION
// =============================================================================

/**
 * Get stable demand record key.
 * DOCTRINE: Use recordKey from normalization — single source of truth.
 * recordKey is guaranteed non-null by normalize() function.
 * Falls back to raw identifiers only if recordKey missing (legacy data).
 */
function getDemandKey(demand: NormalizedRecord): string {
  // Priority 0: Use recordKey from normalization (canonical)
  if (demand.recordKey) {
    return demand.recordKey;
  }
  // Fallback for legacy records without recordKey
  return (
    demand.raw?.identifier ||
    demand.raw?.uuid ||
    demand.fullName ||
    `${demand.company || ''}-${demand.title || ''}`
  );
}

/**
 * Get best match for each demand company.
 * @deprecated Use distributeMatchesRoundRobin for better supply distribution
 */
function getBestMatchPerDemand(matches: Match[]): Match[] {
  const seen = new Set<string>();
  const result: Match[] = [];

  for (const match of matches) {
    const key = getDemandKey(match.demand);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(match);
    }
  }

  return result;
}

/**
 * Distribute demand across supply using round-robin allocation.
 *
 * DOCTRINE: Preserves scoring order while ensuring fair distribution.
 * - Each demand gets one supply (from its top K candidates)
 * - Supplies are selected based on lowest current usage
 * - Deterministic: same input → same output
 * - No mutation of original match objects
 *
 * @param matches - All matches, pre-sorted by score descending
 * @param options.maxCandidatesPerDemand - Top K supplies to consider per demand (default: 3)
 */
function distributeMatchesRoundRobin(
  matches: Match[],
  options?: { maxCandidatesPerDemand: number }
): Match[] {
  const K = options?.maxCandidatesPerDemand ?? 3;

  // Step 1: Group matches by demandKey
  const matchesByDemand = new Map<string, Match[]>();
  const demandOrder: string[] = []; // Preserve demand order for determinism

  for (const match of matches) {
    const demandKey = getDemandKey(match.demand);
    if (!matchesByDemand.has(demandKey)) {
      matchesByDemand.set(demandKey, []);
      demandOrder.push(demandKey);
    }
    matchesByDemand.get(demandKey)!.push(match);
  }

  // Step 2: For each demand, keep top K candidates (matches already sorted by score)
  const candidatesByDemand = new Map<string, Match[]>();
  for (const [demandKey, demandMatches] of matchesByDemand) {
    // Clamp K to available candidates
    const topK = demandMatches.slice(0, Math.min(K, demandMatches.length));
    candidatesByDemand.set(demandKey, topK);
  }

  // Step 3: Track supply usage for round-robin distribution
  const supplyUsage = new Map<string, number>();

  // Step 4: Assign each demand to least-used eligible supply
  const result: Match[] = [];

  for (const demandKey of demandOrder) {
    const candidates = candidatesByDemand.get(demandKey);
    if (!candidates || candidates.length === 0) continue;

    // Find candidate with lowest supply usage (greedy round-robin)
    let bestCandidate: Match | null = null;
    let minUsage = Infinity;

    for (const candidate of candidates) {
      const supplyKey = getSupplyKey(candidate.supply);
      const usage = supplyUsage.get(supplyKey) ?? 0;

      // Pick least-used supply; tie-break by score (first in list = highest score)
      if (usage < minUsage) {
        minUsage = usage;
        bestCandidate = candidate;
      }
    }

    if (bestCandidate) {
      result.push(bestCandidate);
      const supplyKey = getSupplyKey(bestCandidate.supply);
      supplyUsage.set(supplyKey, (supplyUsage.get(supplyKey) ?? 0) + 1);
    }
  }

  // Log distribution stats
  const uniqueSupplies = supplyUsage.size;
  const maxUsage = Math.max(...supplyUsage.values(), 0);
  const minUsageVal = Math.min(...supplyUsage.values(), 0);
  console.log(`[distributeMatchesRoundRobin] ${result.length} matches across ${uniqueSupplies} supplies (usage range: ${minUsageVal}-${maxUsage})`);

  return result;
}

/**
 * Get stable supply record key.
 * DOCTRINE: Use recordKey from normalization — single source of truth.
 * recordKey is guaranteed non-null by normalize() function.
 * Falls back to domain/raw identifiers only if recordKey missing (legacy data).
 *
 * FIX #1: Prevents data loss when multiple supply records have null domain
 * but same company+title — each gets unique key via recordKey.
 */
function getSupplyKey(supply: NormalizedRecord): string {
  // Priority 0: Use recordKey from normalization (canonical)
  if (supply.recordKey) {
    return supply.recordKey;
  }
  // Fallback for legacy records without recordKey
  return (
    supply.domain ||
    supply.raw?.identifier ||
    supply.raw?.uuid ||
    supply.fullName ||
    `${supply.company || ''}-${supply.title || ''}`
  );
}

/**
 * Aggregate all matches by supply.
 * Each supplier gets ONE entry with all their matches.
 */
function aggregateBySupply(matches: Match[]): SupplyAggregate[] {
  const bySupply = new Map<string, Match[]>();

  for (const match of matches) {
    const key = getSupplyKey(match.supply);
    if (!bySupply.has(key)) {
      bySupply.set(key, []);
    }
    bySupply.get(key)!.push(match);
  }

  const aggregates: SupplyAggregate[] = [];

  for (const [, supplierMatches] of bySupply) {
    // Sort by score, best first
    supplierMatches.sort((a, b) => b.score - a.score);

    // totalMatches counts unique demand records, not raw match pairs
    const uniqueDemandKeys = new Set(
      supplierMatches.map(m => getDemandKey(m.demand))
    );

    aggregates.push({
      supply: supplierMatches[0].supply,
      matches: supplierMatches,
      bestMatch: supplierMatches[0],
      totalMatches: uniqueDemandKeys.size,
    });
  }

  // Sort aggregates by total matches (more matches = more value)
  aggregates.sort((a, b) => b.totalMatches - a.totalMatches);

  return aggregates;
}

// =============================================================================
// FILTERING
// =============================================================================

/**
 * Filter matches by minimum score.
 */
export function filterByScore(result: MatchingResult, minScore: number): MatchingResult {
  const filteredDemand = result.demandMatches.filter(m => m.score >= minScore);

  // Also filter internal matches in each aggregate and recalculate totalMatches
  const filteredAggregates = result.supplyAggregates
    .map(agg => {
      const filteredMatches = agg.matches.filter(m => m.score >= minScore);
      if (filteredMatches.length === 0) return null;
      return {
        ...agg,
        matches: filteredMatches,
        bestMatch: filteredMatches[0], // Already sorted by score
        totalMatches: filteredMatches.length,
      };
    })
    .filter((agg): agg is SupplyAggregate => agg !== null);

  return {
    demandMatches: filteredDemand,
    supplyAggregates: filteredAggregates,
    stats: result.stats,
  };
}

/**
 * Limit results.
 */
export function limitResults(result: MatchingResult, maxDemand: number, maxSupply: number): MatchingResult {
  return {
    demandMatches: result.demandMatches.slice(0, maxDemand),
    supplyAggregates: result.supplyAggregates.slice(0, maxSupply),
    stats: result.stats,
  };
}

// =============================================================================
// UNIVERSAL MATCHING (re-export)
// =============================================================================

export {
  scoreUniversalMatch,
  extractNeedProfile,
  extractCapabilityProfile,
  matchAllUniversal,
  getBestMatchPerDemand as getBestMatchPerDemandUniversal,
  aggregateBySupplyUniversal,
  type UniversalMatch,
  type UniversalNeedProfile,
  type UniversalCapabilityProfile,
  type UniversalMatchResult,
  type SupplyAggregateUniversal,
  type CompanyStage,
} from './universal';

// =============================================================================
// DOCTRINE (re-export)
// =============================================================================

export {
  TIER_THRESHOLDS,
  DOCTRINE_VERSION,
  getTierFromScore,
  getTierDisplay,
  assertRecordKey,
  isValidRecordKey,
  calculateMatchStats,
  formatMatchStats,
  type TierName,
  type MatchStats,
} from './doctrine';
