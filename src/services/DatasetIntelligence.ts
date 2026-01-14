/**
 * Dataset Intelligence Service
 *
 * CANONICAL ANALYZER BEHAVIOR:
 * 1. Detect primary niche (broad only): biotech, wealth, real estate, recruiting, crypto, B2B
 * 2. Apply SAFE DEFAULT counterparty mapping (recruiters NEVER default unless niche=recruiting)
 * 3. Generate filters from default intent
 * 4. Surface intent selector for override
 */

import { callAI, type AIConfig } from './AIService';

// =============================================================================
// TYPES
// =============================================================================

export interface DatasetHealth {
  totalContacts: number;
  withEmail: number;
  emailCoverage: number;
  industries: string[];
  topIndustry: string;
  roles: string[];
  decisionMakerPercent: number;
  datasetType: 'demand' | 'supply' | 'unknown';
  niche: DetectedNiche;
  sampleCompanies: { name: string; industry: string }[];
  enrichmentEstimate: {
    recordsNeedingEnrichment: number;
    creditsRequired: number;
    estimatedCost: number;
  };
  // Counterparty intent (first-class)
  defaultIntent: CounterpartyIntent;
  // Role cluster detection (money-first fallback)
  roleCluster?: RoleCluster;
  roleClusterConfidence?: number;
}

export interface CounterpartyFilters {
  description: string;
  jobTitlesInclude: string[];
  jobTitlesExclude: string[];
  industriesInclude: string[];
  keywordsInclude: string[];
  keywordsExclude: string[];
  linkedInSearchUrl?: string;
}

export interface MatchPrediction {
  demandContacts: number;
  demandWithEmail: number;
  supplyContacts: number;
  supplyWithEmail: number;
  matchRate: number;
  matchQuality: 'excellent' | 'good' | 'partial' | 'poor';
  introsPossible: number;
  enrichmentNeeded: number;
  estimatedCost: number;
  reasoning: string;
}

// =============================================================================
// CANONICAL TYPES (NON-NEGOTIABLE)
// =============================================================================

/**
 * Detected niche - BROAD ONLY, no sub-niches
 */
export type DetectedNiche =
  | 'biotech'
  | 'wealth'
  | 'real_estate'
  | 'recruiting'
  | 'crypto'
  | 'b2b';

/**
 * Counterparty intent - FIRST-CLASS, must be stored/displayed/editable/logged
 */
export type CounterpartyIntent =
  | 'partners'      // BD / Licensing / Corp Dev
  | 'recruiters'    // Staffing / Exec Search
  | 'investors'     // VC / PE / Family Office
  | 'advisory'      // Wealth / Advisory Firms
  | 'capital'       // Real Estate Capital / Operators
  | 'funds'         // Crypto Funds / Infra / Market Makers
  | 'custom';

/**
 * SAFE DEFAULT MAPPING (THIS TABLE IS LAW)
 * Recruiters are NEVER the default unless niche is explicitly recruiting.
 */
export const NICHE_TO_DEFAULT_INTENT: Record<DetectedNiche, CounterpartyIntent> = {
  biotech: 'partners',      // Pharma BD / Corp Dev
  wealth: 'advisory',       // Advisory / Wealth Firms
  real_estate: 'capital',   // Capital / Operators
  recruiting: 'recruiters', // ONLY case where recruiters are default
  crypto: 'funds',          // Funds / Infra / Market Makers
  b2b: 'partners',          // BD / Corp Dev
};

/**
 * User-facing labels for intents
 */
export const INTENT_LABELS: Record<CounterpartyIntent, string> = {
  partners: 'Partners (BD / Licensing)',
  recruiters: 'Recruiters (Staffing / Search)',
  investors: 'Investors (VC / PE)',
  advisory: 'Advisory / Wealth Firms',
  capital: 'Capital / Operators',
  funds: 'Funds / Infra / Market Makers',
  custom: 'Custom',
};

/**
 * User-facing labels for niches
 */
export const NICHE_LABELS: Record<DetectedNiche, string> = {
  biotech: 'Biotech',
  wealth: 'Wealth Management',
  real_estate: 'Real Estate',
  recruiting: 'IT Recruiting',
  crypto: 'Crypto',
  b2b: 'B2B (Broad)',
};

// =============================================================================
// ROLE CLUSTER DETECTION (MONEY-FIRST FALLBACK)
// =============================================================================

/**
 * Role cluster — what type of people are in this dataset?
 * Used as fallback when niche detection is weak.
 */
export type RoleCluster =
  | 'builders'   // engineers, devs, cto
  | 'hiring'     // hr, recruiters, talent
  | 'growth'     // marketing, growth, demand gen
  | 'money'      // finance, cfo, accounting
  | 'ops'        // operations, logistics, supply chain
  | 'partners'   // bd, partnerships, licensing
  | 'exec';      // founders, ceos, general execs

const ROLE_CLUSTER_PATTERNS: Record<RoleCluster, string[]> = {
  builders: ['engineer', 'developer', 'dev', 'cto', 'architect', 'software', 'infrastructure', 'devops', 'sre', 'backend', 'frontend', 'fullstack', 'data engineer', 'ml engineer', 'ai engineer'],
  hiring: ['hr', 'recruiter', 'talent', 'people ops', 'human resources', 'talent acquisition', 'recruiting'],
  growth: ['marketing', 'growth', 'demand gen', 'cmo', 'content', 'brand', 'digital marketing', 'seo', 'paid media', 'performance'],
  money: ['finance', 'cfo', 'accounting', 'controller', 'fp&a', 'treasury', 'tax', 'bookkeeping'],
  ops: ['operations', 'coo', 'logistics', 'supply chain', 'procurement', 'warehouse', '3pl', 'fulfillment'],
  partners: ['business development', 'bd', 'partnerships', 'licensing', 'alliances', 'corp dev', 'corporate development', 'm&a'],
  exec: ['founder', 'ceo', 'president', 'owner', 'managing director', 'principal', 'partner', 'chief executive'],
};

/**
 * Map role cluster → counterparty intent (money-first)
 * These are high-demand seller categories that always have buyers.
 */
const CLUSTER_TO_INTENT: Record<RoleCluster, CounterpartyIntent> = {
  builders: 'partners',     // dev agencies, devtools, cloud, security
  hiring: 'recruiters',     // staffing, exec search
  growth: 'partners',       // paid media, seo, outbound, crm
  money: 'advisory',        // fractional cfo, bookkeeping, tax
  ops: 'partners',          // 3pl, freight, erp implementers
  partners: 'partners',     // bd advisors, licensing brokers
  exec: 'investors',        // strategic advisory, fundraising, m&a
};

function detectRoleCluster(items: any[]): { cluster: RoleCluster; confidence: number } {
  const titles = items.slice(0, 50).map(item =>
    (item.job_title || item.title || item.position || '').toLowerCase()
  ).filter(Boolean);

  if (titles.length === 0) {
    return { cluster: 'exec', confidence: 0 };
  }

  const scores: Record<RoleCluster, number> = {
    builders: 0,
    hiring: 0,
    growth: 0,
    money: 0,
    ops: 0,
    partners: 0,
    exec: 0,
  };

  for (const title of titles) {
    for (const [cluster, keywords] of Object.entries(ROLE_CLUSTER_PATTERNS)) {
      for (const kw of keywords) {
        if (title.includes(kw)) {
          scores[cluster as RoleCluster]++;
          break; // Only count once per title per cluster
        }
      }
    }
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const topScore = sorted[0]?.[1] || 0;
  const confidence = titles.length > 0 ? topScore / titles.length : 0;

  return {
    cluster: (sorted[0]?.[0] as RoleCluster) || 'exec',
    confidence: Math.min(1, confidence),
  };
}

// =============================================================================
// RUNTIME GUARDS (DEATH-LEVEL SAFETY)
// =============================================================================

/**
 * Normalize intent — ensures we never use a non-string or invalid intent.
 * Protects against JS passing wrong types through TS boundaries.
 */
function normalizeIntent(x: unknown): CounterpartyIntent | undefined {
  if (typeof x !== 'string') return undefined;
  if (x in INTENT_FILTERS) return x as CounterpartyIntent;
  return undefined;
}

// =============================================================================
// NICHE DETECTION (BROAD ONLY)
// =============================================================================

const NICHE_PATTERNS: Record<DetectedNiche, string[]> = {
  biotech: ['pharma', 'biotech', 'biotechnology', 'clinical', 'therapeutics', 'drug', 'fda', 'life science', 'medical device', 'pharmaceutical'],
  wealth: ['wealth', 'hnw', 'high net worth', 'family office', 'private banking', 'asset management', 'financial planning'],
  real_estate: ['real estate', 'property', 'cre', 'commercial real estate', 'reit', 'development', 'construction'],
  recruiting: ['recruiting', 'staffing', 'talent acquisition', 'headhunter', 'executive search', 'placement'],
  crypto: ['crypto', 'blockchain', 'web3', 'defi', 'token', 'nft', 'protocol', 'dao'],
  b2b: ['saas', 'software', 'enterprise', 'b2b', 'platform', 'tech', 'startup'],
};

function detectNiche(items: any[]): DetectedNiche {
  const textBlob = items.slice(0, 30).map(item => {
    return [
      item.job_title || item.title || item.position || '',
      item.company_name || item.companyName || item.company || '',
      item.description || item.job_description || item.company_description || '',
      item.industry || item.company_industry || '',
      item.keywords || '',
    ].join(' ');
  }).join(' ').toLowerCase();

  const scores: Record<DetectedNiche, number> = {
    biotech: 0,
    wealth: 0,
    real_estate: 0,
    recruiting: 0,
    crypto: 0,
    b2b: 0,
  };

  for (const [niche, keywords] of Object.entries(NICHE_PATTERNS)) {
    scores[niche as DetectedNiche] = keywords.reduce((score, kw) => {
      const matches = (textBlob.match(new RegExp(kw, 'gi')) || []).length;
      return score + matches;
    }, 0);
  }

  // Find highest scoring niche
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  // Require minimum score of 3 to detect, otherwise default to b2b
  if (sorted[0] && sorted[0][1] >= 3) {
    return sorted[0][0] as DetectedNiche;
  }

  return 'b2b';
}

// =============================================================================
// CANONICAL COUNTERPARTY FILTERS (BY INTENT, NOT BY NICHE)
// =============================================================================

const INTENT_FILTERS: Record<CounterpartyIntent, CounterpartyFilters> = {
  partners: {
    description: 'Pharma BD & Licensing Partners',
    jobTitlesInclude: [
      'chief business officer',
      'vp business development',
      'svp business development',
      'head of business development',
      'director business development',
      'vp corporate development',
      'head of licensing',
      'vp licensing',
      'director licensing',
      'vp strategic partnerships',
      'head of partnerships',
      'vp alliances',
    ],
    jobTitlesExclude: ['intern', 'coordinator', 'assistant', 'junior', 'associate', 'recruiter', 'talent', 'hr'],
    industriesInclude: ['pharmaceuticals', 'biotechnology', 'life sciences'],
    keywordsInclude: [
      'licensing', 'in-licensing', 'out-licensing', 'business development',
      'corporate development', 'strategic partnerships', 'alliances',
      'co-development', 'portfolio strategy', 'pipeline', 'M&A',
    ],
    keywordsExclude: [
      'staffing', 'recruiting', 'talent acquisition', 'executive search',
      'cro', 'cdmo', 'cmo', 'consulting', 'outsourcing', 'marketing agency',
      'software', 'saas',
    ],
  },

  recruiters: {
    description: 'Recruitment Agencies',
    jobTitlesInclude: [
      'partner', 'managing director', 'director', 'founder', 'ceo',
      'president', 'principal', 'vp recruiting', 'head of talent',
    ],
    jobTitlesExclude: ['intern', 'coordinator', 'assistant', 'junior', 'associate'],
    industriesInclude: ['staffing & recruiting', 'human resources', 'executive search'],
    keywordsInclude: [
      'recruiting', 'staffing', 'talent', 'executive search', 'placement',
      'headhunter', 'recruitment', 'hiring',
    ],
    keywordsExclude: ['internal', 'in-house', 'corporate hr'],
  },

  investors: {
    description: 'Investors (VC / PE)',
    jobTitlesInclude: [
      'partner', 'managing director', 'principal', 'director',
      'vp investments', 'investment director', 'general partner',
    ],
    jobTitlesExclude: ['intern', 'analyst', 'associate', 'assistant'],
    industriesInclude: ['venture capital & private equity', 'investment management', 'financial services'],
    keywordsInclude: [
      'venture capital', 'private equity', 'investment', 'portfolio',
      'fund', 'capital', 'growth equity', 'seed', 'series',
    ],
    keywordsExclude: ['recruiting', 'staffing', 'consulting'],
  },

  advisory: {
    description: 'Advisory / Wealth Firms',
    jobTitlesInclude: [
      'managing director', 'partner', 'wealth advisor', 'private banker',
      'relationship manager', 'family office', 'chief investment officer',
    ],
    jobTitlesExclude: ['intern', 'assistant', 'junior', 'trainee'],
    industriesInclude: ['financial services', 'investment management', 'banking'],
    keywordsInclude: [
      'wealth management', 'private banking', 'family office', 'hnw',
      'uhnw', 'asset management', 'financial planning',
    ],
    keywordsExclude: ['recruiting', 'staffing', 'retail banking'],
  },

  capital: {
    description: 'Real Estate Capital / Operators',
    jobTitlesInclude: [
      'managing director', 'partner', 'principal', 'director',
      'vp acquisitions', 'head of investments', 'cio',
    ],
    jobTitlesExclude: ['intern', 'assistant', 'junior', 'agent'],
    industriesInclude: ['real estate', 'commercial real estate', 'investment management'],
    keywordsInclude: [
      'real estate', 'cre', 'acquisitions', 'development', 'capital',
      'investments', 'property', 'reit', 'fund',
    ],
    keywordsExclude: ['recruiting', 'staffing', 'residential agent', 'rental'],
  },

  funds: {
    description: 'Crypto Funds / Infra / Market Makers',
    jobTitlesInclude: [
      'partner', 'managing director', 'founder', 'ceo', 'cio',
      'head of trading', 'portfolio manager', 'general partner',
    ],
    jobTitlesExclude: ['intern', 'assistant', 'junior', 'analyst'],
    industriesInclude: ['financial services', 'investment management', 'information technology & services'],
    keywordsInclude: [
      'crypto', 'blockchain', 'web3', 'defi', 'token', 'protocol',
      'trading', 'market maker', 'liquidity', 'fund',
    ],
    keywordsExclude: ['recruiting', 'staffing', 'consulting'],
  },

  custom: {
    description: 'Custom (User Defined)',
    jobTitlesInclude: ['partner', 'director', 'founder', 'ceo', 'vp', 'head of'],
    jobTitlesExclude: ['intern', 'assistant', 'junior'],
    industriesInclude: [],
    keywordsInclude: [],
    keywordsExclude: ['internal', 'in-house'],
  },
};

// =============================================================================
// DECISION MAKER PATTERNS
// =============================================================================

const DECISION_MAKER_PATTERNS = [
  /\b(ceo|cto|cfo|coo|cmo|cpo|cro)\b/i,
  /\b(founder|co-founder|cofounder)\b/i,
  /\b(president|owner)\b/i,
  /\b(partner|managing\s+director|md)\b/i,
  /\b(vp|vice\s+president)\b/i,
  /\b(director|head\s+of)\b/i,
  /\b(chief)\b/i,
  /\b(principal)\b/i,
];

const SUPPLY_INDICATORS = [
  'recruiting', 'staffing', 'talent', 'headhunter', 'search firm',
  'placement', 'consulting', 'agency', 'services', 'solutions',
];

// =============================================================================
// MAIN FUNCTIONS
// =============================================================================

/**
 * Analyze a dataset and return health metrics
 */
export async function analyzeDatasetHealth(
  items: any[],
  _aiConfig?: AIConfig | null
): Promise<DatasetHealth> {
  if (!items || items.length === 0) {
    return {
      totalContacts: 0,
      withEmail: 0,
      emailCoverage: 0,
      industries: [],
      topIndustry: 'Unknown',
      roles: [],
      decisionMakerPercent: 0,
      datasetType: 'unknown',
      niche: 'b2b',
      sampleCompanies: [],
      enrichmentEstimate: {
        recordsNeedingEnrichment: 0,
        creditsRequired: 0,
        estimatedCost: 0,
      },
      defaultIntent: 'partners',
    };
  }

  // Count emails
  const withEmail = items.filter(item =>
    item.email || item.personal_email || item.work_email
  ).length;

  // Extract industries
  const industryMap = new Map<string, number>();
  items.forEach(item => {
    const industry = item.industry || item.company_industry || '';
    if (industry) {
      industryMap.set(industry, (industryMap.get(industry) || 0) + 1);
    }
  });
  const industries = Array.from(industryMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([ind]) => ind);
  const topIndustry = industries[0] || 'Unknown';

  // Extract roles and count decision makers
  const roles: string[] = [];
  let decisionMakers = 0;
  items.forEach(item => {
    const title = item.job_title || item.title || item.position || '';
    if (title && !roles.includes(title)) {
      roles.push(title);
    }
    if (DECISION_MAKER_PATTERNS.some(p => p.test(title))) {
      decisionMakers++;
    }
  });

  // Detect if this is supply or demand
  let supplyScore = 0;
  let demandScore = 0;
  items.slice(0, 20).forEach(item => {
    const text = JSON.stringify(item).toLowerCase();
    SUPPLY_INDICATORS.forEach(indicator => {
      if (text.includes(indicator)) supplyScore++;
    });
    if (text.includes('product') || text.includes('platform') || text.includes('software')) {
      demandScore++;
    }
  });
  const datasetType = supplyScore > demandScore * 2 ? 'supply' : 'demand';

  // Sample companies
  const sampleCompanies = items.slice(0, 10).map(item => ({
    name: item.company_name || item.companyName || item.company || 'Unknown',
    industry: item.industry || item.company_industry || 'Unknown',
  }));

  // CANONICAL: Detect niche (broad only)
  const niche = detectNiche(items);

  // MONEY-FIRST: Detect role cluster (fallback when niche is weak)
  const { cluster: roleCluster, confidence: roleClusterConfidence } = detectRoleCluster(items);

  // CANONICAL: Apply safe default mapping
  // If niche detection is weak (b2b fallback) but roleCluster is confident, use cluster mapping
  let defaultIntent: CounterpartyIntent;
  if (niche === 'b2b' && roleClusterConfidence >= 0.3) {
    // Niche detection failed, use role cluster as fallback
    defaultIntent = CLUSTER_TO_INTENT[roleCluster];
    console.log('[DatasetIntelligence] Using roleCluster fallback:', { roleCluster, confidence: roleClusterConfidence, intent: defaultIntent });
  } else {
    defaultIntent = NICHE_TO_DEFAULT_INTENT[niche];
  }

  // Calculate enrichment cost
  const COST_PER_CREDIT = 0.024;
  const recordsNeedingEnrichment = items.length - withEmail;

  console.log('[DatasetIntelligence] Analysis complete:', {
    niche,
    roleCluster,
    roleClusterConfidence: roleClusterConfidence.toFixed(2),
    defaultIntent,
    totalContacts: items.length,
  });

  return {
    totalContacts: items.length,
    withEmail,
    emailCoverage: Math.round((withEmail / items.length) * 100),
    industries,
    topIndustry,
    roles: roles.slice(0, 20),
    decisionMakerPercent: Math.round((decisionMakers / items.length) * 100),
    datasetType,
    niche,
    sampleCompanies,
    enrichmentEstimate: {
      recordsNeedingEnrichment,
      creditsRequired: recordsNeedingEnrichment,
      estimatedCost: Math.round(recordsNeedingEnrichment * COST_PER_CREDIT * 100) / 100,
    },
    defaultIntent,
    roleCluster,
    roleClusterConfidence,
  };
}

/**
 * Generate counterparty filters based on intent (NOT niche guessing)
 *
 * RULE: Analyzer cannot output recruiter filters unless:
 *   detectedNiche === 'recruiting' || counterpartyIntent === 'recruiters'
 */
export async function generateCounterpartyFilters(
  demandHealth: DatasetHealth,
  intent?: CounterpartyIntent,
  _aiConfig?: AIConfig | null
): Promise<CounterpartyFilters> {
  // RUNTIME GUARD: Normalize intent to prevent wrong-type bugs
  const normalizedIntent = normalizeIntent(intent);

  // Use normalized intent → default from niche → partners (last resort)
  const effectiveIntent = normalizedIntent ?? demandHealth.defaultIntent ?? 'partners';

  // CANONICAL RULE: Never output recruiter filters unless explicitly recruiting
  if (effectiveIntent === 'recruiters' && demandHealth.niche !== 'recruiting') {
    console.log('[DatasetIntelligence] User explicitly selected recruiters for', demandHealth.niche);
  }

  // Get filters for intent
  const filters = INTENT_FILTERS[effectiveIntent];

  if (!filters) {
    // This should never happen with normalizeIntent, but log if it does
    console.warn('[DatasetIntelligence] Unknown intent after normalization:', {
      originalIntent: intent,
      normalizedIntent,
      effectiveIntent,
      niche: demandHealth.niche,
    });
    return INTENT_FILTERS[demandHealth.defaultIntent ?? 'partners'];
  }

  console.log('[DatasetIntelligence] Generated filters:', {
    niche: demandHealth.niche,
    intent: effectiveIntent,
    description: filters.description,
  });

  return filters;
}

/**
 * Get available intents for a detected niche
 * Returns all intents with the default pre-selected
 */
export function getAvailableIntents(niche: DetectedNiche): {
  intent: CounterpartyIntent;
  label: string;
  isDefault: boolean;
}[] {
  const defaultIntent = NICHE_TO_DEFAULT_INTENT[niche];

  return [
    { intent: 'partners', label: INTENT_LABELS.partners, isDefault: defaultIntent === 'partners' },
    { intent: 'recruiters', label: INTENT_LABELS.recruiters, isDefault: defaultIntent === 'recruiters' },
    { intent: 'investors', label: INTENT_LABELS.investors, isDefault: defaultIntent === 'investors' },
    { intent: 'advisory', label: INTENT_LABELS.advisory, isDefault: defaultIntent === 'advisory' },
    { intent: 'capital', label: INTENT_LABELS.capital, isDefault: defaultIntent === 'capital' },
    { intent: 'funds', label: INTENT_LABELS.funds, isDefault: defaultIntent === 'funds' },
    { intent: 'custom', label: INTENT_LABELS.custom, isDefault: false },
  ];
}

/**
 * Predict match quality
 */
export function predictMatch(
  demandHealth: DatasetHealth,
  supplyHealth: DatasetHealth
): MatchPrediction {
  const demandWithEmail = demandHealth.withEmail;
  const supplyWithEmail = supplyHealth.withEmail;

  let matchRate = 50;

  if (supplyHealth.datasetType === 'supply') {
    matchRate += 30;
  }

  matchRate = Math.min(100, matchRate);

  let matchQuality: 'excellent' | 'good' | 'partial' | 'poor';
  if (matchRate >= 80) matchQuality = 'excellent';
  else if (matchRate >= 60) matchQuality = 'good';
  else if (matchRate >= 40) matchQuality = 'partial';
  else matchQuality = 'poor';

  const introsPossible = Math.min(demandWithEmail, supplyWithEmail * 5);
  const enrichmentNeeded = (demandHealth.totalContacts - demandWithEmail) +
                          (supplyHealth.totalContacts - supplyWithEmail);
  const estimatedCost = (introsPossible * 0.015) + (enrichmentNeeded * 0.05);

  return {
    demandContacts: demandHealth.totalContacts,
    demandWithEmail,
    supplyContacts: supplyHealth.totalContacts,
    supplyWithEmail,
    matchRate,
    matchQuality,
    introsPossible,
    enrichmentNeeded,
    estimatedCost: Math.round(estimatedCost * 100) / 100,
    reasoning: `${NICHE_LABELS[demandHealth.niche]} → ${INTENT_LABELS[demandHealth.defaultIntent]}`,
  };
}

/**
 * Format filters for clipboard
 */
export function formatFiltersForScraper(filters: CounterpartyFilters): string {
  return `=== ${filters.description} ===

JOB TITLES (Include):
${filters.jobTitlesInclude.join(', ')}

JOB TITLES (Exclude):
${filters.jobTitlesExclude.join(', ')}

INDUSTRIES:
${filters.industriesInclude.join(', ')}

KEYWORDS (Include):
${filters.keywordsInclude.join(', ')}

KEYWORDS (Exclude):
${filters.keywordsExclude.join(', ')}
`;
}

// =============================================================================
// LEADS FINDER JSON FORMATTER
// =============================================================================

const LEADS_FINDER_INDUSTRIES: string[] = [
  "information technology & services", "staffing & recruiting", "pharmaceuticals",
  "biotechnology", "financial services", "real estate", "commercial real estate",
  "venture capital & private equity", "investment management", "banking",
  "management consulting", "marketing & advertising", "computer software",
];

function mapToLeadsFinderIndustry(industry: string): string | null {
  const normalized = industry.toLowerCase().replace(/ and /g, ' & ');
  if (LEADS_FINDER_INDUSTRIES.includes(normalized)) {
    return normalized;
  }

  const mappings: Record<string, string> = {
    'staffing and recruiting': 'staffing & recruiting',
    'human resources': 'staffing & recruiting',
    'executive search': 'staffing & recruiting',
    'biotech': 'biotechnology',
    'pharma': 'pharmaceuticals',
    'life sciences': 'biotechnology',
  };

  for (const [key, value] of Object.entries(mappings)) {
    if (industry.toLowerCase().includes(key)) {
      return value;
    }
  }

  return null;
}

/**
 * Format filters as Leads Finder JSON
 */
export function formatFiltersForLeadsFinder(filters: CounterpartyFilters): string {
  const mappedIndustries = filters.industriesInclude
    .map(mapToLeadsFinderIndustry)
    .filter((i): i is string => i !== null);

  const config: Record<string, any> = {};

  if (mappedIndustries.length > 0) {
    config.company_industry = mappedIndustries;
  }

  if (filters.keywordsInclude.length > 0) {
    config.company_keywords = filters.keywordsInclude.map(k => k.toLowerCase());
  }

  if (filters.keywordsExclude.length > 0) {
    config.company_not_keywords = filters.keywordsExclude.map(k => k.toLowerCase());
  }

  if (filters.jobTitlesInclude.length > 0) {
    config.contact_job_title = filters.jobTitlesInclude.map(t => t.toLowerCase());
  }

  config.email_status = ["validated"];
  // NOTE: fetch_count intentionally left unset — user controls via Settings

  return JSON.stringify(config, null, 2);
}
