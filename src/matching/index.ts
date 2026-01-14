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
 * PHASE-1 FIX: Neutral narrative for "why this match"
 * Used in intro generation to explain relevance without timing claims.
 */
export interface MatchNarrative {
  demandType: string;      // e.g., "fintech company", "clinical-stage biotech"
  supplyType: string;      // e.g., "engineering recruiter", "pharma BD"
  why: string;             // First matching reason
  neutral: true;           // Enforces no timing claims
  // COS (Connector Overlap Statement) — relational copy
  demandValue: string;     // e.g., "advisory firms focused on long-term, personalized planning"
  supplyRole: string;      // e.g., "payments teams"
  overlap: string;         // e.g., "I connect payments teams working closely with advisory firms..."
}

export interface Match {
  demand: NormalizedRecord;
  supply: NormalizedRecord;
  score: number;  // 0-100
  reasons: string[];
  narrative?: MatchNarrative;  // PHASE-1 FIX: Optional neutral "why this match"
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
  onProgress?: (current: number, total: number) => void
): Promise<MatchingResult> {

  const totalComparisons = demand.length * supply.length;
  console.log(`[matchRecords] ENTER: ${demand.length} demand × ${supply.length} supply = ${totalComparisons} comparisons`);
  const startTime = performance.now();

  const allMatches: Match[] = [];
  let comparisonCount = 0;
  const YIELD_EVERY = 500; // Yield to event loop every N comparisons

  // Score every demand-supply pair with yielding
  for (const d of demand) {
    for (const s of supply) {
      const { score, reasons, narrative } = scoreMatch(d, s);

      if (score > 0) {
        allMatches.push({ demand: d, supply: s, score, reasons, narrative });
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

  console.log(`[matchRecords] Scoring complete: ${comparisonCount} comparisons, ${allMatches.length} matches with score > 0`);

  // Sort by score descending
  allMatches.sort((a, b) => b.score - a.score);

  // DEMAND SIDE: Each demand gets their best supply match
  const demandMatches = getBestMatchPerDemand(allMatches);

  // SUPPLY SIDE: Aggregate all matches per supplier
  const supplyAggregates = aggregateBySupply(allMatches);

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
  supply: NormalizedRecord[]
): MatchingResult {

  const allMatches: Match[] = [];

  // Score every demand-supply pair
  for (const d of demand) {
    for (const s of supply) {
      const { score, reasons, narrative } = scoreMatch(d, s);

      if (score > 0) {
        allMatches.push({ demand: d, supply: s, score, reasons, narrative });
      }
    }
  }

  // Sort by score descending
  allMatches.sort((a, b) => b.score - a.score);

  // DEMAND SIDE: Each demand gets their best supply match
  const demandMatches = getBestMatchPerDemand(allMatches);

  // SUPPLY SIDE: Aggregate all matches per supplier
  const supplyAggregates = aggregateBySupply(allMatches);

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
// SCORING
// =============================================================================

/**
 * PHASE-1 FIX: Build neutral narrative for "why this match"
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

  // ==========================================================================
  // COS (Connector Overlap Statement) — Deterministic relational copy
  // ==========================================================================

  // Extract demandValue from description (deterministic, non-AI)
  const demandValue = extractDemandValue(demand);

  // Extract supplyRole from title (deterministic, non-AI)
  const supplyRole = extractSupplyRole(supply);

  // Construct overlap sentence
  const overlap = `I connect ${supplyRole} working closely with ${demandValue}.`;

  return {
    demandType,
    supplyType,
    why,
    neutral: true,
    demandValue,
    supplyRole,
    overlap,
  };
}

/**
 * COS: Extract demand value from description (deterministic, non-AI)
 * Looks for keywords that indicate company philosophy/focus.
 */
function extractDemandValue(demand: NormalizedRecord): string {
  const desc = toStringSafe(demand.companyDescription).toLowerCase();
  const industry = toStringSafe(
    Array.isArray(demand.industry) ? demand.industry[0] : demand.industry
  ).toLowerCase();

  // Financial services / wealth management
  if (/wealth|financial planning|advisory|cfp|fiduciary/.test(desc) || /wealth|financial/.test(industry)) {
    if (/personalized|client.first|client experience|boutique/.test(desc)) {
      return 'advisory firms focused on long-term, personalized planning';
    }
    if (/trust|estate|insurance/.test(desc)) {
      return 'advisory firms offering comprehensive planning and trust services';
    }
    return 'financial advisory firms';
  }

  // Tech / SaaS
  if (/saas|software|platform|tech|startup/.test(desc) || /software|technology/.test(industry)) {
    if (/enterprise|b2b/.test(desc)) {
      return 'enterprise software companies';
    }
    if (/scale|growth|series/.test(desc)) {
      return 'growth-stage tech companies';
    }
    return 'technology companies';
  }

  // Healthcare / Biotech
  if (/biotech|pharma|clinical|therapeutic|life science/.test(desc) || /biotech|pharma|healthcare/.test(industry)) {
    if (/clinical.stage|pipeline/.test(desc)) {
      return 'clinical-stage biotech companies';
    }
    return 'healthcare and life sciences companies';
  }

  // Payments / Fintech
  if (/payment|fintech|merchant|acquiring|processing/.test(desc) || /fintech|payments/.test(industry)) {
    return 'payments and financial infrastructure companies';
  }

  // Real estate
  if (/real estate|property|cre|commercial/.test(desc) || /real estate/.test(industry)) {
    return 'real estate and property companies';
  }

  // Manufacturing / Industrial
  if (/manufacturing|industrial|supply chain|logistics/.test(desc) || /manufacturing/.test(industry)) {
    return 'manufacturing and industrial companies';
  }

  // Generic fallback using industry
  if (industry && industry.length > 2) {
    return `${industry} companies`;
  }

  return 'companies in this space';
}

/**
 * COS: Extract supply role from title (deterministic, non-AI)
 * Maps title keywords to connector-friendly role categories.
 */
function extractSupplyRole(supply: NormalizedRecord): string {
  const title = toStringSafe(supply.title).toLowerCase();
  const industry = toStringSafe(
    Array.isArray(supply.industry) ? supply.industry[0] : supply.industry
  ).toLowerCase();

  // Product / Payments teams
  if (/product owner|product manager|product lead/.test(title)) {
    if (/payment|merchant|acquiring/.test(title) || /payment|fintech/.test(industry)) {
      return 'payments product teams';
    }
    return 'product teams';
  }

  // Partnership / BD teams
  if (/partner|bd|business development|alliance/.test(title)) {
    if (/payment|merchant|fintech/.test(industry)) {
      return 'payments partnership teams';
    }
    return 'partnership teams';
  }

  // Recruiting / Talent
  if (/recruit|staffing|talent|headhunt/.test(title)) {
    if (/tech|engineer|software/.test(title) || /technology/.test(industry)) {
      return 'technical recruiting teams';
    }
    if (/finance|accounting/.test(title)) {
      return 'finance recruiting specialists';
    }
    if (/executive|c.suite|leadership/.test(title)) {
      return 'executive search teams';
    }
    return 'recruiting teams';
  }

  // Consulting / Advisory
  if (/consultant|advisor|advisory/.test(title)) {
    return 'consulting teams';
  }

  // Agency
  if (/agency|creative|marketing/.test(title)) {
    return 'agency teams';
  }

  // Sales / Revenue
  if (/sales|account executive|revenue/.test(title)) {
    return 'sales teams';
  }

  // Engineering / Technical
  if (/engineer|developer|architect/.test(title)) {
    return 'engineering teams';
  }

  // Finance / Operations
  if (/finance|cfo|controller|fp&a/.test(title)) {
    return 'finance teams';
  }

  // Generic fallback using industry
  if (industry && industry.length > 2) {
    return `${industry} teams`;
  }

  return 'teams in this space';
}

/**
 * Score a demand-supply pair.
 *
 * Factors:
 * - Industry match
 * - Signal relevance
 * - Size compatibility
 * - (Future: historical success patterns)
 */
function scoreMatch(
  demand: NormalizedRecord,
  supply: NormalizedRecord
): { score: number; reasons: string[]; narrative?: MatchNarrative } {

  let score = 0;
  const reasons: string[] = [];

  // Industry match (30 points)
  const industryScore = scoreIndustry(demand.industry, supply.industry);
  score += industryScore;
  if (industryScore > 20) {
    reasons.push('Industry match');
  }

  // Signal relevance (40 points)
  const signalScore = scoreSignal(demand.signal, supply.title, supply.industry);
  score += signalScore;
  if (signalScore > 25) {
    reasons.push('Signal alignment');
  }

  // Size compatibility (20 points)
  const sizeScore = scoreSize(demand.size, supply.size);
  score += sizeScore;
  if (sizeScore > 10) {
    reasons.push('Size fit');
  }

  // Base relevance (10 points if any match)
  if (score > 0) {
    score += 10;
    reasons.push('Base relevance');
  }

  // PHASE-1 FIX: Build neutral narrative for intro context
  const narrative = score > 0 ? buildNarrative(demand, supply, reasons) : undefined;

  return { score: Math.min(score, 100), reasons, narrative };
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
 * Get best match for each demand company.
 */
function getBestMatchPerDemand(matches: Match[]): Match[] {
  const seen = new Set<string>();
  const result: Match[] = [];

  for (const match of matches) {
    const key = match.demand.domain;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(match);
    }
  }

  return result;
}

/**
 * Aggregate all matches by supply.
 * Each supplier gets ONE entry with all their matches.
 */
function aggregateBySupply(matches: Match[]): SupplyAggregate[] {
  const bySupply = new Map<string, Match[]>();

  for (const match of matches) {
    const key = match.supply.domain;
    if (!bySupply.has(key)) {
      bySupply.set(key, []);
    }
    bySupply.get(key)!.push(match);
  }

  const aggregates: SupplyAggregate[] = [];

  for (const [domain, supplierMatches] of bySupply) {
    // Sort by score, best first
    supplierMatches.sort((a, b) => b.score - a.score);

    // totalMatches counts unique demand companies, not raw match pairs
    const uniqueDemandDomains = new Set(
      supplierMatches.map(m => m.demand.domain).filter(Boolean)
    );

    aggregates.push({
      supply: supplierMatches[0].supply,
      matches: supplierMatches,
      bestMatch: supplierMatches[0],
      totalMatches: uniqueDemandDomains.size,
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
