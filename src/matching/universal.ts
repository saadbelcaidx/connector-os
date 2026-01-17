/**
 * UNIVERSAL MATCHING BRAIN
 *
 * Stripe-level design for matching ANY signal type to ANY capability.
 * No hardcoded categories. Pure keyword extraction + semantic overlap.
 *
 * DOCTRINE:
 * - Demand = Entity with a NEED (funding, scaling, hiring, expanding, etc.)
 * - Supply = Entity that FULFILLS needs (consultants, agencies, recruiters, capital, etc.)
 * - Match = Need keywords ∩ Capability keywords + Stage fit + Vertical fit
 *
 * PERFORMANCE:
 * - Zero AI at match time (N×M comparisons must be O(1) per pair)
 * - All extraction is deterministic keyword matching
 * - Billions of signals, milliseconds per match
 */

import { NormalizedRecord, SignalKind } from '../schemas';
import { TIER_THRESHOLDS, getTierFromScore, assertRecordKey, type TierName } from './doctrine';

// =============================================================================
// COMPANY STAGE
// =============================================================================

export type CompanyStage =
  | 'pre_seed'
  | 'seed'
  | 'series_a'
  | 'series_b'
  | 'series_c'
  | 'series_d_plus'
  | 'growth'
  | 'public'
  | 'unknown';

// =============================================================================
// UNIVERSAL PROFILES
// =============================================================================

/**
 * What does this entity NEED?
 * Derived from signal + context, never hardcoded.
 */
export interface UniversalNeedProfile {
  // Human-readable summary
  summary: string;              // "Series B fintech founder scaling payments platform"

  // Extracted keywords (for matching)
  keywords: string[];           // ["fintech", "payments", "scaling", "series-b"]

  // Context
  stage: CompanyStage;
  vertical: string;             // Primary industry
  verticals: string[];          // All detected industries
  employeeCount: number | null;

  // Inferred needs based on signal type + stage + vertical
  inferredNeeds: string[];      // ["growth", "advisory", "talent"]

  // Metadata
  confidence: number;           // 0-1
  source: string;               // Debug: which fields produced this
}

/**
 * What does this entity PROVIDE?
 */
export interface UniversalCapabilityProfile {
  // Human-readable summary
  summary: string;              // "Growth marketing agency for B2B fintech"

  // Extracted keywords (for matching)
  keywords: string[];           // ["growth", "marketing", "fintech", "b2b"]

  // Who they serve
  servesStages: CompanyStage[];
  servesVerticals: string[];
  servesEmployeeRange: [number, number] | null;  // [min, max]

  // What they provide
  services: string[];           // ["growth", "marketing", "demand-gen"]

  // Metadata
  confidence: number;
  source: string;
}

/**
 * Universal match result
 */
export interface UniversalMatch {
  score: number;                // 0-100
  tier: TierName;               // 'strong' | 'good' | 'exploratory' (from doctrine)
  tierReason: string;           // "Series B fintech founder → Growth consultant"

  breakdown: {
    keywordScore: number;       // 0-30: keyword overlap
    stageScore: number;         // 0-25: stage fit
    verticalScore: number;      // 0-25: industry fit
    needServiceScore: number;   // 0-20: inferred need → provided service
  };

  reasons: string[];
  needProfile: UniversalNeedProfile;
  capabilityProfile: UniversalCapabilityProfile;
}

// =============================================================================
// KEYWORD DICTIONARIES
// =============================================================================

/**
 * Vertical/Industry keywords - lowercase, deduplicated
 */
const VERTICAL_KEYWORDS: Record<string, string[]> = {
  fintech: ['fintech', 'payments', 'banking', 'financial services', 'crypto', 'defi', 'blockchain', 'lending', 'neobank', 'insurtech', 'wealthtech', 'regtech'],
  saas: ['saas', 'software', 'platform', 'cloud', 'subscription', 'b2b software', 'enterprise software', 'api'],
  biotech: ['biotech', 'pharma', 'pharmaceutical', 'clinical', 'therapeutics', 'drug discovery', 'life sciences', 'medical device', 'healthcare'],
  healthcare: ['healthcare', 'health tech', 'digital health', 'telehealth', 'medical', 'patient', 'hospital', 'clinical'],
  ecommerce: ['ecommerce', 'e-commerce', 'retail', 'dtc', 'direct to consumer', 'marketplace', 'shopify', 'amazon'],
  ai: ['ai', 'artificial intelligence', 'machine learning', 'ml', 'deep learning', 'nlp', 'computer vision', 'generative ai'],
  cybersecurity: ['cybersecurity', 'security', 'infosec', 'identity', 'authentication', 'zero trust', 'soc', 'threat'],
  real_estate: ['real estate', 'proptech', 'property', 'cre', 'commercial real estate', 'residential', 'construction'],
  logistics: ['logistics', 'supply chain', 'shipping', 'freight', 'fulfillment', '3pl', 'warehouse', 'last mile'],
  media: ['media', 'entertainment', 'streaming', 'content', 'gaming', 'creator', 'publishing'],
  education: ['education', 'edtech', 'learning', 'training', 'lms', 'upskilling', 'bootcamp'],
  climate: ['climate', 'cleantech', 'sustainability', 'renewable', 'energy', 'carbon', 'green'],
  food: ['food', 'foodtech', 'restaurant', 'delivery', 'cpg', 'beverage', 'agriculture', 'agtech'],
  hr: ['hr', 'human resources', 'people', 'workforce', 'talent', 'recruiting', 'payroll', 'benefits'],
  legal: ['legal', 'legaltech', 'law', 'compliance', 'contract', 'regulatory'],
  manufacturing: ['manufacturing', 'industrial', 'factory', 'production', 'robotics', 'automation'],
};

/**
 * Stage detection keywords
 * NOTE: Order matters for detection - check specific stages before generic terms
 */
const STAGE_KEYWORDS: Record<CompanyStage, string[]> = {
  pre_seed: ['pre-seed', 'preseed', 'idea stage', 'mvp', 'prototype'],
  seed: ['seed', 'seed stage', 'seed round', 'angel', 'early stage', 'bootstrapped'],
  series_a: ['series a', 'series-a', 'a round', 'early growth'],
  series_b: ['series b', 'series-b', 'b round', 'growth stage', '20-500 employees', '150 employees'],
  series_c: ['series c', 'series-c', 'c round', 'late stage', 'expansion stage', 'raised series c'],
  series_d_plus: ['series d', 'series e', 'series f', 'pre-ipo'],
  growth: ['hypergrowth', 'rapid growth', 'high growth', 'high-growth'],
  public: ['public', 'ipo', 'nasdaq', 'nyse', 'publicly traded', 'fortune 500'],
  unknown: [],
};

/**
 * Service/Capability keywords - what providers OFFER
 */
const SERVICE_KEYWORDS: Record<string, string[]> = {
  growth: ['growth', 'scale', 'scaling', 'expansion', 'gtm', 'go-to-market', 'growth strategy'],
  marketing: ['marketing', 'demand gen', 'demand generation', 'brand', 'content', 'seo', 'paid media', 'performance marketing', 'digital marketing'],
  sales: ['sales', 'revenue', 'pipeline', 'sales enablement', 'outbound', 'inbound', 'closing'],
  advisory: ['advisory', 'consulting', 'strategy', 'fractional', 'interim', 'strategic advisory', 'board'],
  talent: ['recruiting', 'talent', 'hiring', 'staffing', 'headhunting', 'executive search', 'talent acquisition'],
  capital: ['capital', 'investment', 'funding', 'venture', 'private equity', 'debt', 'financing'],
  wealth: ['wealth', 'family office', 'hnw', 'uhnw', 'asset management', 'wealth management', 'private wealth'],
  legal: ['legal', 'compliance', 'regulatory', 'contracts', 'ip', 'corporate law'],
  finance: ['finance', 'cfo', 'accounting', 'bookkeeping', 'fp&a', 'tax', 'audit'],
  operations: ['operations', 'ops', 'coo', 'process', 'efficiency', 'automation'],
  technology: ['development', 'engineering', 'dev shop', 'software development', 'app development', 'technical'],
  product: ['product', 'product management', 'ux', 'design', 'user research'],
  partnerships: ['partnerships', 'alliances', 'channel', 'business development', 'bd'],
  international: ['international', 'global', 'expansion', 'localization', 'cross-border'],
};

/**
 * Inferred needs based on signal type + stage
 * What does someone at this stage typically need?
 */
const INFERRED_NEEDS: Partial<Record<SignalKind, Partial<Record<CompanyStage, string[]>>>> = {
  'PERSON_ROLE': {
    pre_seed: ['capital', 'advisory', 'technology', 'marketing'],
    seed: ['capital', 'advisory', 'talent', 'technology', 'marketing', 'growth'],
    series_a: ['growth', 'marketing', 'talent', 'sales', 'advisory'],
    series_b: ['growth', 'marketing', 'talent', 'advisory', 'sales', 'operations', 'international'],
    series_c: ['growth', 'advisory', 'talent', 'international', 'operations', 'marketing'],
    series_d_plus: ['advisory', 'talent', 'operations', 'international', 'marketing'],
    growth: ['advisory', 'wealth', 'operations', 'talent', 'marketing'],
    public: ['advisory', 'wealth', 'legal', 'finance'],
    unknown: ['advisory', 'growth', 'marketing', 'talent'],
  },
  'FUNDING': {
    pre_seed: ['technology', 'advisory'],
    seed: ['talent', 'technology', 'marketing'],
    series_a: ['growth', 'marketing', 'talent', 'sales'],
    series_b: ['growth', 'marketing', 'talent', 'sales', 'operations'],
    series_c: ['growth', 'operations', 'international', 'talent'],
    series_d_plus: ['operations', 'international', 'advisory'],
    growth: ['operations', 'advisory', 'international'],
    public: ['advisory', 'legal'],
    unknown: ['growth', 'talent'],
  },
  'HIRING_ROLE': {
    // Hiring = explicit talent need
    pre_seed: ['talent'],
    seed: ['talent'],
    series_a: ['talent'],
    series_b: ['talent'],
    series_c: ['talent'],
    series_d_plus: ['talent'],
    growth: ['talent'],
    public: ['talent'],
    unknown: ['talent'],
  },
  'GROWTH': {
    pre_seed: ['capital', 'advisory'],
    seed: ['capital', 'growth', 'marketing'],
    series_a: ['growth', 'marketing', 'sales', 'talent'],
    series_b: ['growth', 'marketing', 'sales', 'operations'],
    series_c: ['operations', 'international', 'advisory'],
    series_d_plus: ['operations', 'international'],
    growth: ['operations', 'advisory'],
    public: ['advisory'],
    unknown: ['growth'],
  },
  'ACQUISITION': {
    // Post-acquisition = integration, operations
    pre_seed: ['advisory'],
    seed: ['advisory', 'operations'],
    series_a: ['operations', 'talent', 'advisory'],
    series_b: ['operations', 'talent', 'advisory'],
    series_c: ['operations', 'advisory'],
    series_d_plus: ['operations', 'advisory'],
    growth: ['operations', 'advisory'],
    public: ['advisory', 'legal'],
    unknown: ['advisory', 'operations'],
  },
  'CONTACT_ROLE': {
    // B2B contact = they're a provider, minimal inferred needs
    unknown: [],
  },
  'UNKNOWN': {
    unknown: ['advisory'],
  },
};

// =============================================================================
// EXTRACTION FUNCTIONS
// =============================================================================

/**
 * Extract all keywords from text
 */
function extractKeywords(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const keywords: Set<string> = new Set();

  // Extract vertical keywords
  for (const [vertical, terms] of Object.entries(VERTICAL_KEYWORDS)) {
    for (const term of terms) {
      if (lower.includes(term)) {
        keywords.add(vertical);
        keywords.add(term);
      }
    }
  }

  // Extract service keywords
  for (const [service, terms] of Object.entries(SERVICE_KEYWORDS)) {
    for (const term of terms) {
      if (lower.includes(term)) {
        keywords.add(service);
        keywords.add(term);
      }
    }
  }

  // Extract stage keywords
  for (const [stage, terms] of Object.entries(STAGE_KEYWORDS)) {
    for (const term of terms) {
      if (lower.includes(term)) {
        keywords.add(stage);
      }
    }
  }

  return Array.from(keywords);
}

/**
 * Detect primary vertical from text
 */
function detectVertical(text: string): string {
  if (!text) return 'general';
  const lower = text.toLowerCase();

  // Score each vertical
  const scores: Record<string, number> = {};
  for (const [vertical, terms] of Object.entries(VERTICAL_KEYWORDS)) {
    scores[vertical] = 0;
    for (const term of terms) {
      if (lower.includes(term)) {
        scores[vertical]++;
      }
    }
  }

  // Return highest scoring vertical
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return sorted[0][1] > 0 ? sorted[0][0] : 'general';
}

/**
 * Detect all verticals from text
 */
function detectVerticals(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const verticals: string[] = [];

  for (const [vertical, terms] of Object.entries(VERTICAL_KEYWORDS)) {
    for (const term of terms) {
      if (lower.includes(term)) {
        verticals.push(vertical);
        break;
      }
    }
  }

  return verticals.length > 0 ? verticals : ['general'];
}

/**
 * Detect company stage from various signals
 */
function detectStage(record: NormalizedRecord): CompanyStage {
  // Check funding field + description from multiple sources
  const funding = (record.companyFunding || '').toLowerCase();
  const description = (record.companyDescription || '').toLowerCase();
  const raw = record.raw || {};
  const rawDescription = (raw.description || raw.short_description || '').toLowerCase();
  const combined = `${funding} ${description} ${rawDescription}`;

  // Priority order: most specific first
  for (const stage of ['series_d_plus', 'series_c', 'series_b', 'series_a', 'seed', 'pre_seed', 'public', 'growth'] as CompanyStage[]) {
    for (const term of STAGE_KEYWORDS[stage]) {
      if (combined.includes(term)) {
        return stage;
      }
    }
  }

  // Infer from employee count
  const size = record.size;
  if (size) {
    const num = typeof size === 'number' ? size : parseInt(String(size).replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num)) {
      if (num < 10) return 'seed';
      if (num < 50) return 'series_a';
      if (num < 200) return 'series_b';
      if (num < 500) return 'series_c';
      if (num < 1000) return 'series_d_plus';
      return 'growth';
    }
  }

  return 'unknown';
}

/**
 * Extract employee count from various fields
 */
function extractEmployeeCount(record: NormalizedRecord): number | null {
  const size = record.size;
  if (!size) return null;

  if (typeof size === 'number') return size;

  const str = String(size);
  // Handle ranges like "20-500"
  const rangeMatch = str.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (rangeMatch) {
    return Math.round((parseInt(rangeMatch[1], 10) + parseInt(rangeMatch[2], 10)) / 2);
  }

  // Handle single numbers
  const num = parseInt(str.replace(/[^0-9]/g, ''), 10);
  return isNaN(num) ? null : num;
}

/**
 * Extract services from company description (for supply)
 */
function extractServices(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const services: string[] = [];

  for (const [service, terms] of Object.entries(SERVICE_KEYWORDS)) {
    for (const term of terms) {
      if (lower.includes(term)) {
        services.push(service);
        break;
      }
    }
  }

  return services;
}

/**
 * Build human-readable summary for demand
 */
function buildDemandSummary(record: NormalizedRecord, stage: CompanyStage, vertical: string): string {
  const parts: string[] = [];

  // Stage
  if (stage !== 'unknown') {
    parts.push(stage.replace(/_/g, ' ').replace('series ', 'Series '));
  }

  // Vertical
  if (vertical !== 'general') {
    parts.push(vertical);
  }

  // Role if available
  const role = record.signalMeta?.label || record.title;
  if (role) {
    parts.push(role);
  } else if (record.company) {
    parts.push(`at ${record.company}`);
  }

  return parts.join(' ') || 'Company';
}

/**
 * Build human-readable summary for supply
 */
function buildSupplySummary(record: NormalizedRecord, services: string[], verticals: string[]): string {
  const parts: string[] = [];

  // Services
  if (services.length > 0) {
    parts.push(services.slice(0, 2).join('/'));
  }

  // Verticals they serve
  if (verticals.length > 0 && verticals[0] !== 'general') {
    parts.push(`for ${verticals.slice(0, 2).join('/')}`);
  }

  // Company name as fallback
  if (parts.length === 0 && record.company) {
    return record.company;
  }

  return parts.join(' ') || 'Provider';
}

// =============================================================================
// PROFILE EXTRACTION
// =============================================================================

/**
 * Extract universal need profile from demand record
 *
 * SOURCES (priority order):
 * 1. companyDescription (if available)
 * 2. raw.description (Crunchbase People - about the person)
 * 3. raw.categories (Crunchbase - company verticals)
 * 4. signalMeta.label
 * 5. signal, title, company, funding
 */
export function extractNeedProfile(demand: NormalizedRecord): UniversalNeedProfile {
  // Pull from raw data if available (Crunchbase has rich data)
  const raw = demand.raw || {};
  const rawDescription = raw.description || raw.short_description || '';
  const rawCategories = Array.isArray(raw.categories)
    ? raw.categories.map((c: { value?: string } | string) => typeof c === 'object' ? c.value : c).join(' ')
    : '';

  const combined = [
    demand.companyDescription,
    rawDescription,
    rawCategories,
    demand.signalMeta?.label,
    demand.signal,
    demand.title,
    demand.company,
    demand.companyFunding,
  ].filter(Boolean).join(' ');

  const stage = detectStage(demand);
  const vertical = detectVertical(combined);
  const verticals = detectVerticals(combined);
  const keywords = extractKeywords(combined);
  const employeeCount = extractEmployeeCount(demand);

  // Get inferred needs from signal type + stage
  const signalKind = demand.signalMeta?.kind || 'UNKNOWN';
  const stageNeeds = INFERRED_NEEDS[signalKind]?.[stage] || INFERRED_NEEDS[signalKind]?.['unknown'] || ['advisory'];

  // Add vertical-specific needs
  const verticalNeeds: string[] = [];
  if (vertical === 'fintech' || vertical === 'saas') {
    verticalNeeds.push('growth', 'marketing');
  }
  if (vertical === 'biotech' || vertical === 'healthcare') {
    verticalNeeds.push('advisory', 'legal', 'capital');
  }

  const inferredNeeds = [...new Set([...stageNeeds, ...verticalNeeds])];

  return {
    summary: buildDemandSummary(demand, stage, vertical),
    keywords,
    stage,
    vertical,
    verticals,
    employeeCount,
    inferredNeeds,
    confidence: keywords.length > 3 ? 0.9 : keywords.length > 0 ? 0.6 : 0.3,
    source: `${demand.signalMeta?.source || 'raw'}+stage:${stage}`,
  };
}

/**
 * Extract universal capability profile from supply record
 *
 * SOURCES (priority order):
 * 1. companyDescription (Leads Finder has this)
 * 2. raw.company_description
 * 3. title, company, industry
 */
export function extractCapabilityProfile(supply: NormalizedRecord): UniversalCapabilityProfile {
  // Pull from raw data if available
  const raw = supply.raw || {};
  const rawDescription = raw.company_description || raw.description || '';

  const combined = [
    supply.companyDescription,
    rawDescription,
    supply.title,
    supply.company,
    Array.isArray(supply.industry) ? supply.industry.join(' ') : supply.industry,
  ].filter(Boolean).join(' ');

  const keywords = extractKeywords(combined);
  const services = extractServices(combined);
  const servesVerticals = detectVerticals(combined);

  // Infer stages they serve from description
  const servesStages: CompanyStage[] = [];
  const lower = combined.toLowerCase();

  if (/startup|early.?stage|seed|series.?a/i.test(lower)) {
    servesStages.push('seed', 'series_a');
  }
  if (/growth|scaling|series.?b|series.?c|scale-up/i.test(lower)) {
    servesStages.push('series_b', 'series_c', 'growth');
  }
  if (/enterprise|fortune|large|corporate/i.test(lower)) {
    servesStages.push('series_d_plus', 'growth', 'public');
  }
  if (/smb|small.?business|mid.?market/i.test(lower)) {
    servesStages.push('seed', 'series_a', 'series_b');
  }

  // Default: serve series_a to series_c (most common)
  if (servesStages.length === 0) {
    servesStages.push('series_a', 'series_b', 'series_c');
  }

  // Infer employee range they serve
  let servesEmployeeRange: [number, number] | null = null;
  if (/startup|early/i.test(lower)) {
    servesEmployeeRange = [1, 100];
  } else if (/growth|scaling/i.test(lower)) {
    servesEmployeeRange = [50, 500];
  } else if (/enterprise|large/i.test(lower)) {
    servesEmployeeRange = [200, 10000];
  }

  // Calculate confidence based on data quality
  let confidence = 0.2;
  if (services.length > 2) confidence = 0.9;
  else if (services.length > 0) confidence = 0.7;
  else if (keywords.length > 3) confidence = 0.6;
  else if (keywords.length > 0) confidence = 0.4;

  return {
    summary: buildSupplySummary(supply, services, servesVerticals),
    keywords,
    servesStages: [...new Set(servesStages)],
    servesVerticals,
    servesEmployeeRange,
    services,
    confidence,
    source: supply.companyDescription ? 'description' : supply.title ? 'title' : 'inferred',
  };
}

// =============================================================================
// MATCHING
// =============================================================================

/**
 * Compute keyword overlap between two sets
 */
function computeKeywordOverlap(a: string[], b: string[]): number {
  const setA = new Set(a.map(k => k.toLowerCase()));
  const setB = new Set(b.map(k => k.toLowerCase()));

  let overlap = 0;
  for (const k of setA) {
    if (setB.has(k)) overlap++;
  }

  return overlap;
}

/**
 * Check if two stages are adjacent
 */
function isAdjacentStage(stage: CompanyStage, servesStages: CompanyStage[]): boolean {
  const stageOrder: CompanyStage[] = ['pre_seed', 'seed', 'series_a', 'series_b', 'series_c', 'series_d_plus', 'growth', 'public'];
  const idx = stageOrder.indexOf(stage);

  for (const s of servesStages) {
    const sIdx = stageOrder.indexOf(s);
    if (Math.abs(idx - sIdx) <= 1) return true;
  }

  return false;
}

/**
 * Compute service-need overlap
 */
function computeServiceNeedOverlap(needs: string[], services: string[]): number {
  const needSet = new Set(needs.map(n => n.toLowerCase()));
  const serviceSet = new Set(services.map(s => s.toLowerCase()));

  let overlap = 0;
  for (const n of needSet) {
    if (serviceSet.has(n)) overlap++;
  }

  return overlap;
}

/**
 * Universal matching function
 *
 * Score breakdown:
 * - Keyword overlap: 0-30 points
 * - Stage fit: 0-25 points
 * - Vertical fit: 0-25 points
 * - Need-service fit: 0-20 points
 * Total: 0-100
 */
export function scoreUniversalMatch(
  demand: NormalizedRecord,
  supply: NormalizedRecord
): UniversalMatch {
  const need = extractNeedProfile(demand);
  const capability = extractCapabilityProfile(supply);

  // 1. KEYWORD OVERLAP (0-30 points)
  const keywordOverlap = computeKeywordOverlap(need.keywords, capability.keywords);
  const keywordScore = Math.min(keywordOverlap * 6, 30);

  // 2. STAGE FIT (0-25 points)
  let stageScore = 5; // Base
  if (capability.servesStages.includes(need.stage)) {
    stageScore = 25;
  } else if (isAdjacentStage(need.stage, capability.servesStages)) {
    stageScore = 15;
  } else if (need.stage === 'unknown') {
    stageScore = 12; // Unknown stage = medium score
  }

  // 3. VERTICAL FIT (0-25 points)
  let verticalScore = 8; // Base
  const verticalOverlap = need.verticals.some(v =>
    capability.servesVerticals.includes(v)
  );
  if (verticalOverlap) {
    verticalScore = 25;
  } else if (need.vertical === 'general' || capability.servesVerticals.includes('general')) {
    verticalScore = 15; // General = medium fit
  }

  // 4. NEED-SERVICE FIT (0-20 points)
  const serviceOverlap = computeServiceNeedOverlap(need.inferredNeeds, capability.services);
  const needServiceScore = Math.min(serviceOverlap * 7, 20);

  // TOTAL
  const total = Math.round(keywordScore + stageScore + verticalScore + needServiceScore);

  // TIER (using frozen doctrine thresholds)
  const tier = getTierFromScore(total);

  // BUILD TIER REASON - use actual context
  const tierReason = `${need.summary} → ${capability.summary}`;

  // BUILD REASONS
  const reasons: string[] = [];
  if (keywordScore >= 12) reasons.push(`Keyword match (${keywordOverlap})`);
  if (stageScore >= 20) reasons.push('Stage fit');
  if (verticalScore >= 20) reasons.push('Industry fit');
  if (needServiceScore >= 10) reasons.push(`Need-service fit (${serviceOverlap})`);
  if (reasons.length === 0) reasons.push('Exploratory match');

  return {
    score: Math.min(total, 100),
    tier,
    tierReason,
    breakdown: {
      keywordScore,
      stageScore,
      verticalScore,
      needServiceScore,
    },
    reasons,
    needProfile: need,
    capabilityProfile: capability,
  };
}

// =============================================================================
// BATCH MATCHING (for N×M comparisons)
// =============================================================================

export interface UniversalMatchResult {
  demand: NormalizedRecord;
  supply: NormalizedRecord;
  match: UniversalMatch;
}

/**
 * Match all demand records to all supply records
 * Returns sorted by score descending
 */
export async function matchAllUniversal(
  demands: NormalizedRecord[],
  supplies: NormalizedRecord[],
  onProgress?: (current: number, total: number) => void
): Promise<UniversalMatchResult[]> {
  const total = demands.length * supplies.length;
  const results: UniversalMatchResult[] = [];
  let count = 0;

  const YIELD_EVERY = 500;

  for (const demand of demands) {
    for (const supply of supplies) {
      const match = scoreUniversalMatch(demand, supply);

      if (match.score > 0) {
        results.push({ demand, supply, match });
      }

      count++;
      if (count % YIELD_EVERY === 0) {
        onProgress?.(count, total);
        await new Promise(r => setTimeout(r, 0));
      }
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.match.score - a.match.score);

  return results;
}

/**
 * Get best supply match per demand
 *
 * DOCTRINE: Uses recordKey for deduplication. Throws if recordKey missing.
 */
export function getBestMatchPerDemand(results: UniversalMatchResult[]): UniversalMatchResult[] {
  const seen = new Set<string>();
  const best: UniversalMatchResult[] = [];

  for (const r of results) {
    // DOCTRINE: recordKey is mandatory
    assertRecordKey(r.demand.recordKey, 'getBestMatchPerDemand (demand)');
    const key = r.demand.recordKey;

    if (!seen.has(key)) {
      seen.add(key);
      best.push(r);
    }
  }

  return best;
}

/**
 * Aggregate matches by supply (for supply-side emails)
 */
export interface SupplyAggregateUniversal {
  supply: NormalizedRecord;
  matches: UniversalMatchResult[];
  bestMatch: UniversalMatchResult;
  totalMatches: number;
}

export function aggregateBySupplyUniversal(results: UniversalMatchResult[]): SupplyAggregateUniversal[] {
  const bySupply = new Map<string, UniversalMatchResult[]>();

  for (const r of results) {
    // DOCTRINE: recordKey is mandatory
    assertRecordKey(r.supply.recordKey, 'aggregateBySupplyUniversal (supply)');
    const key = r.supply.recordKey;

    if (!bySupply.has(key)) {
      bySupply.set(key, []);
    }
    bySupply.get(key)!.push(r);
  }

  const aggregates: SupplyAggregateUniversal[] = [];

  for (const [, matches] of bySupply) {
    matches.sort((a, b) => b.match.score - a.match.score);

    aggregates.push({
      supply: matches[0].supply,
      matches,
      bestMatch: matches[0],
      totalMatches: matches.length,
    });
  }

  aggregates.sort((a, b) => b.totalMatches - a.totalMatches);

  return aggregates;
}
