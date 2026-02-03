/**
 * MATCHING LOGIC — Deno-Compatible (Edge Functions)
 *
 * Simplified, self-contained matching for widget-simulate edge function.
 * Based on src/matching/index.ts but without external dependencies.
 *
 * ARCHITECTURE:
 * - Pure functions, no side effects
 * - No external imports (Deno-compatible)
 * - Synchronous only (edge functions don't need async matching)
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Simplified normalized record for widget matching.
 * Subset of full NormalizedRecord from schemas.
 */
export interface WidgetRecord {
  company: string;
  domain?: string;
  title?: string;
  industry?: string;
  description?: string;
  size?: string | number;
  signal?: string;
  funding?: string;
  techStack?: string[];
}

export type ConfidenceTier = 'strong' | 'good' | 'open';

export interface NeedProfile {
  category: string;
  specifics: string[];
  confidence: number;
}

export interface CapabilityProfile {
  category: string;
  specifics: string[];
  confidence: number;
}

export interface WidgetMatch {
  demand: WidgetRecord;
  supply: WidgetRecord;
  score: number;
  tier: ConfidenceTier;
  tierLabel: string;    // "Strong alignment", "Good alignment", "Potential alignment"
  reasons: string[];
  needProfile: NeedProfile;
  capabilityProfile: CapabilityProfile;
}

export interface WidgetMatchResult {
  matches: WidgetMatch[];
  stats: {
    totalDemand: number;
    totalSupply: number;
    totalMatches: number;
    avgScore: number;
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function toStringSafe(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

// =============================================================================
// NEED EXTRACTION
// =============================================================================

/**
 * Extract need from demand record.
 * What does this company need based on signals?
 */
export function extractNeed(demand: WidgetRecord): NeedProfile {
  const signal = toStringSafe(demand.signal).toLowerCase();
  const title = toStringSafe(demand.title).toLowerCase();
  const description = toStringSafe(demand.description).toLowerCase();
  const industry = toStringSafe(demand.industry).toLowerCase();
  const funding = toStringSafe(demand.funding).toLowerCase();

  const combined = `${signal} ${title} ${description} ${industry}`;

  // Hiring signals (job data)
  if (/engineer|developer|software|devops|backend|frontend/i.test(combined) && !/recruit/i.test(combined)) {
    const specifics: string[] = [];
    if (/senior|staff|lead/i.test(combined)) specifics.push('senior');
    if (/ml|machine learning|ai\b/i.test(combined)) specifics.push('ML/AI');
    return { category: 'engineering', specifics, confidence: 0.9 };
  }

  if (/\bsales\b|account executive|sdr|bdr|revenue/i.test(combined)) {
    return { category: 'sales', specifics: [], confidence: 0.9 };
  }

  if (/marketing|growth|brand|content|seo/i.test(combined)) {
    return { category: 'marketing', specifics: [], confidence: 0.9 };
  }

  if (/\bfinance\b|cfo|accounting|controller/i.test(combined)) {
    return { category: 'finance', specifics: [], confidence: 0.9 };
  }

  if (/operations|ops|coo|supply chain/i.test(combined)) {
    return { category: 'operations', specifics: [], confidence: 0.9 };
  }

  if (/recruiter|talent|hr|human resources/i.test(combined)) {
    return { category: 'recruiting', specifics: [], confidence: 0.9 };
  }

  // Industry signals
  if (/biotech|pharma|therapeutic|clinical|life science/i.test(combined)) {
    return { category: 'biotech', specifics: [], confidence: 0.85 };
  }

  if (/health|medical|hospital|patient/i.test(combined) && !/biotech|pharma/i.test(combined)) {
    return { category: 'healthcare', specifics: [], confidence: 0.8 };
  }

  if (/fintech|financial technology/i.test(combined)) {
    return { category: 'fintech', specifics: [], confidence: 0.8 };
  }

  if (/\bsoftware\b|saas|cloud|platform/i.test(combined) && !/biotech|fintech/i.test(combined)) {
    return { category: 'tech', specifics: [], confidence: 0.8 };
  }

  // Funding signal
  if (funding || /raised|funding|series|seed|round/i.test(combined)) {
    return { category: 'growth', specifics: ['post-funding'], confidence: 0.7 };
  }

  return { category: 'general', specifics: [], confidence: 0.4 };
}

// =============================================================================
// CAPABILITY EXTRACTION
// =============================================================================

/**
 * Extract capability from supply record.
 * What service does this provider offer?
 */
export function extractCapability(supply: WidgetRecord): CapabilityProfile {
  const description = toStringSafe(supply.description).toLowerCase();
  const title = toStringSafe(supply.title).toLowerCase();
  const company = toStringSafe(supply.company).toLowerCase();
  const industry = toStringSafe(supply.industry).toLowerCase();

  const combined = `${description} ${title} ${company} ${industry}`;

  // Recruiting/Staffing
  if (/recruit|staffing|talent acquisition|headhunt|placement/i.test(combined)) {
    const specifics: string[] = [];
    if (/engineer|software/i.test(combined)) specifics.push('tech');
    if (/executive|c-suite/i.test(combined)) specifics.push('executive');
    if (/sales/i.test(combined)) specifics.push('sales');
    return { category: 'recruiting', specifics, confidence: 0.9 };
  }

  // Marketing Agency
  if (/marketing agency|ad agency|advertising|creative agency|pr agency/i.test(combined)) {
    return { category: 'marketing', specifics: [], confidence: 0.9 };
  }

  // Dev Shop
  if (/dev shop|development agency|software agency|software consultancy/i.test(combined)) {
    return { category: 'engineering', specifics: [], confidence: 0.8 };
  }

  // Consulting
  if (/consulting|advisory|management consulting|strategy consulting/i.test(combined)) {
    return { category: 'consulting', specifics: [], confidence: 0.75 };
  }

  // Fractional exec
  if (/fractional|interim|outsourced cfo/i.test(combined)) {
    return { category: 'fractional', specifics: [], confidence: 0.8 };
  }

  // Industry-specific contacts
  if (/biotech|pharma|therapeutic/i.test(combined)) {
    return { category: 'biotech_contact', specifics: [], confidence: 0.7 };
  }

  if (/health|medical|hospital/i.test(combined) && !/biotech|pharma/i.test(combined)) {
    return { category: 'healthcare_contact', specifics: [], confidence: 0.65 };
  }

  if (/software|saas|cloud|platform/i.test(combined) && !/agency|consultancy/i.test(combined)) {
    return { category: 'tech_contact', specifics: [], confidence: 0.6 };
  }

  // BD/Executive
  if (/business development|licensing|partnerships/i.test(title)) {
    return { category: 'bd_professional', specifics: [], confidence: 0.7 };
  }

  if (/ceo|cto|cfo|founder|president|chief/i.test(title)) {
    return { category: 'executive', specifics: [], confidence: 0.5 };
  }

  return { category: 'general', specifics: [], confidence: 0.3 };
}

// =============================================================================
// ALIGNMENT SCORING
// =============================================================================

/**
 * Score alignment between need and capability.
 * Returns 0-50 points.
 */
function scoreAlignment(need: NeedProfile, capability: CapabilityProfile): number {
  const n = need.category;
  const c = capability.category;

  // Industry matches
  const industryMatches: Record<string, string[]> = {
    biotech: ['biotech_contact', 'bd_professional'],
    healthcare: ['healthcare_contact', 'biotech_contact'],
    tech: ['tech_contact', 'engineering'],
    fintech: ['finance_contact', 'tech_contact'],
  };

  if (industryMatches[n]) {
    if (industryMatches[n][0] === c) return 50;
    if (industryMatches[n].includes(c)) return 40;
  }

  // Service provider matches
  if (c === 'recruiting') {
    if (['engineering', 'sales', 'marketing', 'finance', 'operations', 'recruiting'].includes(n)) {
      return 45;
    }
  }

  if (c === 'engineering' && n === 'engineering') return 40;
  if (c === 'marketing' && n === 'marketing') return 50;

  if (c === 'consulting') {
    if (['operations', 'growth', 'finance'].includes(n)) return 35;
  }

  if (c === 'fractional') {
    if (['growth', 'finance', 'operations'].includes(n)) return 40;
  }

  // BD/exec connectors
  if (c === 'bd_professional') {
    if (['growth', 'biotech', 'healthcare', 'tech', 'fintech'].includes(n)) return 35;
    return 20;
  }

  if (c === 'executive') {
    if (n === 'growth') return 30;
    return 15;
  }

  // Growth need matches many capabilities
  if (n === 'growth') {
    if (c === 'marketing' || c === 'recruiting') return 40;
    if (c === 'consulting' || c === 'fractional') return 35;
    return 20;
  }

  // Cross-functional
  const crossMatches: Record<string, string[]> = {
    engineering: ['recruiting', 'consulting'],
    sales: ['marketing', 'recruiting'],
    marketing: ['sales', 'growth'],
    finance: ['consulting', 'fractional'],
  };

  if (crossMatches[n]?.includes(c)) return 25;

  return 10;
}

// =============================================================================
// SCORING
// =============================================================================

/**
 * Score a demand-supply pair.
 */
export function scoreMatch(
  demand: WidgetRecord,
  supply: WidgetRecord
): WidgetMatch {
  const reasons: string[] = [];

  // Extract profiles
  const needProfile = extractNeed(demand);
  const capabilityProfile = extractCapability(supply);

  // Alignment score (0-50)
  const alignmentScore = scoreAlignment(needProfile, capabilityProfile);
  if (alignmentScore >= 40) {
    reasons.push(`${needProfile.category} need → ${capabilityProfile.category} capability`);
  } else if (alignmentScore >= 25) {
    reasons.push('Cross-functional fit');
  }

  // Industry score (0-30)
  let industryScore = 10;
  const dIndustry = toStringSafe(demand.industry).toLowerCase();
  const sIndustry = toStringSafe(supply.industry).toLowerCase();

  if (dIndustry && sIndustry) {
    if (dIndustry === sIndustry) {
      industryScore = 30;
      reasons.push('Industry match');
    } else if (dIndustry.includes(sIndustry) || sIndustry.includes(dIndustry)) {
      industryScore = 20;
    }
  }

  // Tech stack alignment
  let techBonus = 0;
  if (demand.techStack && supply.techStack) {
    const dTech = new Set(demand.techStack.map(t => t.toLowerCase()));
    const overlap = supply.techStack.filter(t => dTech.has(t.toLowerCase()));
    if (overlap.length > 0) {
      techBonus = Math.min(20, overlap.length * 5);
      reasons.push(`Tech alignment: ${overlap.slice(0, 3).join(', ')}`);
    }
  }

  // Calculate total score
  const baseScore = 10;
  let totalScore =
    (alignmentScore * 0.5) +
    (industryScore * 0.2) +
    (baseScore * 0.1) +
    techBonus;

  totalScore = Math.min(100, Math.round(totalScore));

  // Determine tier
  const combinedConfidence = (needProfile.confidence + capabilityProfile.confidence) / 2;

  let tier: ConfidenceTier;
  let tierLabel: string;

  if (totalScore >= 70 && combinedConfidence >= 0.7) {
    tier = 'strong';
    tierLabel = 'Strong alignment';
  } else if (totalScore >= 45 || (totalScore >= 30 && combinedConfidence >= 0.5)) {
    tier = 'good';
    tierLabel = 'Good alignment';
  } else {
    tier = 'open';
    tierLabel = 'Potential alignment';
  }

  // Ensure minimum score
  if (totalScore === 0) {
    totalScore = 1;
    reasons.push('Exploratory match');
  }

  return {
    demand,
    supply,
    score: totalScore,
    tier,
    tierLabel,
    reasons: reasons.length > 0 ? reasons : ['Category overlap'],
    needProfile,
    capabilityProfile,
  };
}

// =============================================================================
// MAIN MATCHING
// =============================================================================

/**
 * Match demand records against supply pool.
 * Returns top matches sorted by score.
 */
export function matchRecords(
  demand: WidgetRecord[],
  supply: WidgetRecord[],
  options?: { maxMatches?: number }
): WidgetMatchResult {
  const maxMatches = options?.maxMatches ?? 5;
  const allMatches: WidgetMatch[] = [];

  // Score all pairs
  for (const d of demand) {
    for (const s of supply) {
      const match = scoreMatch(d, s);
      if (match.score > 0) {
        allMatches.push(match);
      }
    }
  }

  // Sort by score descending
  allMatches.sort((a, b) => b.score - a.score);

  // Take top matches (dedupe by supply company)
  const seenSupply = new Set<string>();
  const topMatches: WidgetMatch[] = [];

  for (const match of allMatches) {
    const supplyKey = match.supply.domain || match.supply.company;
    if (!seenSupply.has(supplyKey)) {
      seenSupply.add(supplyKey);
      topMatches.push(match);
      if (topMatches.length >= maxMatches) break;
    }
  }

  // Calculate stats
  const scores = topMatches.map(m => m.score);
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  return {
    matches: topMatches,
    stats: {
      totalDemand: demand.length,
      totalSupply: supply.length,
      totalMatches: topMatches.length,
      avgScore,
    },
  };
}

// =============================================================================
// REASON GENERATION (Enterprise Language)
// =============================================================================

/**
 * Generate enterprise-grade match reasons.
 * Uses JP Morgan style language.
 */
export function generateMatchReasons(
  signals: {
    hiring?: boolean | { count: number };
    funding?: { stage: string; amount: string };
    techStack?: string[];
    industry?: string;
  },
  supply: WidgetRecord
): string[] {
  const reasons: string[] = [];

  // Hiring signal
  if (signals.hiring) {
    const count = typeof signals.hiring === 'object' ? signals.hiring.count : undefined;
    reasons.push(`Active talent acquisition${count ? ` — ${count} open positions` : ''}`);
  }

  // Funding signal
  if (signals.funding) {
    reasons.push(`Recent ${signals.funding.stage} funding (${signals.funding.amount})`);
  }

  // Tech stack
  if (signals.techStack && signals.techStack.length > 0) {
    const techList = signals.techStack.slice(0, 3).join(', ');
    reasons.push(`Technology infrastructure alignment — ${techList}`);
  }

  // Industry
  if (signals.industry) {
    const supplyIndustry = toStringSafe(supply.industry).toLowerCase();
    if (supplyIndustry.includes(signals.industry.toLowerCase())) {
      reasons.push(`Industry alignment — ${signals.industry} specialization`);
    }
  }

  return reasons.slice(0, 3); // Max 3 reasons
}
