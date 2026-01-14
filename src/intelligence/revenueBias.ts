/**
 * Revenue Bias Engine
 *
 * Deterministic "fastest to revenue" counterparty recommendation.
 * No AI. No timing claims. No drift.
 *
 * < 250 LOC total.
 */

// =============================================================================
// TYPES
// =============================================================================

export type CounterpartyIntent =
  | 'recruiting'
  | 'agencies_dev'
  | 'agencies_growth'
  | 'agencies_ops'
  | 'it_msp'
  | 'finance_cfo'
  | 'partners'
  | 'logistics'
  | 'biotech_licensing'
  | 'wealth'
  | 'enterprise_sales'
  | 'generic_b2b';

export type RoleCluster =
  | 'builders'
  | 'hiring'
  | 'growth'
  | 'ops'
  | 'security'
  | 'finance'
  | 'partnerships'
  | 'founders_exec'
  | 'unknown';

export type RevenueRecommendation = {
  recommendedIntent: CounterpartyIntent;
  tier: 'A' | 'B' | 'C';
  confidence: 'high' | 'medium' | 'low';
  why: string[];
  alternates: { intent: CounterpartyIntent; tier: 'A' | 'B' | 'C'; why: string[] }[];
};

export type DemandDatasetSignals = {
  roleTitleSamples: string[];
  roleCountsByTitle?: Record<string, number>;
  companyIndustrySamples?: string[];
  companyKeywordSamples?: string[];
  datasetName?: string;
  sourceType?: 'wellfound' | 'b2b_contacts' | 'unknown';
};

// =============================================================================
// HUMAN LABELS
// =============================================================================

export const INTENT_HUMAN_LABELS: Record<CounterpartyIntent, string> = {
  recruiting: 'Recruiters / Staffing firms',
  agencies_dev: 'Dev agencies',
  agencies_growth: 'Growth / paid acquisition agencies',
  agencies_ops: 'Ops automation / systems agencies',
  it_msp: 'IT / MSP providers',
  finance_cfo: 'Fractional CFO / finance operators',
  partners: 'Partnership / BD operators',
  logistics: '3PL / freight / logistics operators',
  biotech_licensing: 'Biotech licensing / BD operators',
  wealth: 'Wealth / advisory',
  enterprise_sales: 'Outbound / SDR / sales operators',
  generic_b2b: 'General B2B operators',
};

// =============================================================================
// ROLE CLUSTER DETECTION (DETERMINISTIC)
// =============================================================================

const CLUSTER_TOKENS: Record<RoleCluster, string[]> = {
  builders: ['engineer', 'developer', 'software', 'cto', 'vp engineering', 'head of engineering', 'platform', 'infra', 'ml engineer', 'data engineer', 'architect', 'devops', 'sre', 'backend', 'frontend'],
  hiring: ['recruiter', 'talent', 'people ops', 'hr', 'head of people', 'staffing', 'sourcer', 'recruiting', 'talent acquisition'],
  growth: ['marketing', 'growth', 'demand gen', 'paid', 'sdr', 'revops', 'sales ops', 'gtm', 'partnerships marketing', 'content', 'brand'],
  ops: ['operations', 'ops', 'supply chain', 'logistics', 'procurement', 'warehouse', 'fleet', 'transport', 'dispatch', 'coo'],
  security: ['security', 'ciso', 'secops', 'compliance', 'risk', 'iso 27001', 'soc 2', 'infosec'],
  finance: ['cfo', 'finance', 'controller', 'fp&a', 'treasury', 'accounting', 'bookkeeping'],
  partnerships: ['business development', 'bd', 'corporate development', 'partnerships', 'alliances', 'licensing', 'strategic partnerships'],
  founders_exec: ['founder', 'co-founder', 'ceo', 'president', 'managing partner', 'gm', 'general manager', 'owner'],
  unknown: [],
};

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
}

function matchAny(text: string, tokens: string[]): boolean {
  const normalized = normalize(text);
  return tokens.some(t => normalized.includes(t));
}

export function deriveRoleCluster(titles: string[]): { cluster: RoleCluster; confidence: 'high' | 'medium' | 'low'; scores: Record<RoleCluster, number> } {
  const scores: Record<RoleCluster, number> = {
    builders: 0, hiring: 0, growth: 0, ops: 0, security: 0, finance: 0, partnerships: 0, founders_exec: 0, unknown: 0,
  };

  for (const title of titles) {
    for (const [cluster, tokens] of Object.entries(CLUSTER_TOKENS)) {
      if (cluster === 'unknown') continue;
      if (matchAny(title, tokens)) {
        scores[cluster as RoleCluster]++;
      }
    }
  }

  const sorted = Object.entries(scores)
    .filter(([k]) => k !== 'unknown')
    .sort((a, b) => b[1] - a[1]);

  const topScore = sorted[0]?.[1] || 0;
  const secondScore = sorted[1]?.[1] || 0;

  // Confidence model
  let confidence: 'high' | 'medium' | 'low';
  if (topScore >= 8 && topScore >= 2 * secondScore) {
    confidence = 'high';
  } else if (topScore >= 4 && topScore > secondScore) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  const cluster = topScore > 0 ? (sorted[0][0] as RoleCluster) : 'unknown';

  return { cluster, confidence, scores };
}

// =============================================================================
// REVENUE RANK TABLE (THE MONEY LAYER)
// =============================================================================

type IntentRank = { intent: CounterpartyIntent; tier: 'A' | 'B' | 'C'; why: string[] };

const CLUSTER_TO_INTENTS: Record<RoleCluster, IntentRank[]> = {
  builders: [
    { intent: 'agencies_dev', tier: 'A', why: ['High urgency for delivery', 'Clear buyer (CTO/Eng)', 'Fast budget approval'] },
    { intent: 'it_msp', tier: 'B', why: ['Immediate technical pain', 'Standardized offer'] },
    { intent: 'generic_b2b', tier: 'C', why: ['Compliance-driven spend', 'Longer cycles than dev delivery'] },
  ],
  hiring: [
    { intent: 'recruiting', tier: 'A', why: ['Direct budget owner', 'Fast decision cycles', 'Outcome is binary (candidates)'] },
    { intent: 'agencies_growth', tier: 'B', why: ['Often paired with hiring', 'Budget varies'] },
    { intent: 'generic_b2b', tier: 'C', why: ['Fallback if unclear'] },
  ],
  growth: [
    { intent: 'agencies_growth', tier: 'A', why: ['Revenue tied spend', 'Fast feedback loop'] },
    { intent: 'enterprise_sales', tier: 'B', why: ['Pipeline urgency', 'Slightly longer cycles'] },
    { intent: 'generic_b2b', tier: 'C', why: ['Fallback if unclear'] },
  ],
  ops: [
    { intent: 'logistics', tier: 'A', why: ['Hard ops pain = immediate', 'Clear ROI (time/cost)'] },
    { intent: 'agencies_ops', tier: 'B', why: ['Automation spend', 'Varies by company maturity'] },
    { intent: 'generic_b2b', tier: 'C', why: ['Fallback if unclear'] },
  ],
  security: [
    { intent: 'it_msp', tier: 'A', why: ['Compliance deadline spend', 'Clear mandate'] },
    { intent: 'agencies_dev', tier: 'B', why: ['Bundled security', 'Quick wedge'] },
    { intent: 'generic_b2b', tier: 'C', why: ['Fallback if unclear'] },
  ],
  finance: [
    { intent: 'finance_cfo', tier: 'A', why: ['Direct exec sponsor', 'High-value mandate'] },
    { intent: 'wealth', tier: 'B', why: ['Budget exists', 'Slower cycles'] },
    { intent: 'generic_b2b', tier: 'C', why: ['Fallback if unclear'] },
  ],
  partnerships: [
    { intent: 'partners', tier: 'A', why: ['Clear counterparty motion', 'High leverage intros'] },
    { intent: 'biotech_licensing', tier: 'B', why: ['Only if biotech evidence', 'Otherwise too narrow'] },
    { intent: 'enterprise_sales', tier: 'C', why: ['Partnership-led GTM overlap'] },
  ],
  founders_exec: [
    { intent: 'agencies_dev', tier: 'A', why: ['Fastest execution path', 'Founders buy delivery'] },
    { intent: 'agencies_growth', tier: 'B', why: ['Founder-led growth spend', 'Common priority'] },
    { intent: 'finance_cfo', tier: 'C', why: ['If finance language present'] },
  ],
  unknown: [
    { intent: 'generic_b2b', tier: 'A', why: ['Broad applicability'] },
    { intent: 'agencies_growth', tier: 'B', why: ['Often monetizes fastest'] },
    { intent: 'agencies_dev', tier: 'C', why: ['Technical fallback'] },
  ],
};

// =============================================================================
// BIOTECH GUARD (PREVENT WRONG "BIOTECH EVERY TIME")
// =============================================================================

const BIOTECH_INDUSTRY_TOKENS = ['biotech', 'pharma', 'therapeutics', 'pharmaceutical', 'life science', 'clinical'];
const BIOTECH_KEYWORD_TOKENS = ['licensing', 'in-licensing', 'out-licensing', 'pipeline', 'clinical', 'preclinical', 'indication'];
const BIOTECH_TITLE_TOKENS = ['chief business officer', 'head of licensing', 'vp licensing', 'corporate development', 'alliances'];

function hasBiotechEvidence(signals: DemandDatasetSignals): boolean {
  let evidenceCount = 0;

  // Check industries
  const industries = (signals.companyIndustrySamples || []).join(' ').toLowerCase();
  if (BIOTECH_INDUSTRY_TOKENS.some(t => industries.includes(t))) evidenceCount++;

  // Check keywords
  const keywords = (signals.companyKeywordSamples || []).join(' ').toLowerCase();
  if (BIOTECH_KEYWORD_TOKENS.some(t => keywords.includes(t))) evidenceCount++;

  // Check titles
  const titles = signals.roleTitleSamples.join(' ').toLowerCase();
  if (BIOTECH_TITLE_TOKENS.some(t => titles.includes(t))) evidenceCount++;

  return evidenceCount >= 2;
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

export function recommendCounterpartyForRevenue(
  roleCluster: RoleCluster,
  demandSignals: DemandDatasetSignals,
  _detectedNiche: string | null,
  defaultIntent: CounterpartyIntent
): RevenueRecommendation {
  // Get ranked intents for this cluster
  let intents = [...CLUSTER_TO_INTENTS[roleCluster]];

  // Handle unknown cluster: use defaultIntent as tier A
  if (roleCluster === 'unknown') {
    intents = [
      { intent: defaultIntent, tier: 'A', why: ['Matches detected intent', 'Lowest risk'] },
      { intent: 'generic_b2b', tier: 'B', why: ['Broad applicability'] },
      { intent: 'agencies_growth', tier: 'C', why: ['Often monetizes fastest'] },
    ];
  }

  // BIOTECH GUARD: Remove biotech_licensing unless evidence exists
  const biotechAllowed = hasBiotechEvidence(demandSignals);
  if (!biotechAllowed) {
    intents = intents.filter(i => i.intent !== 'biotech_licensing');
    // Ensure we have 3 intents
    if (intents.length < 3) {
      intents.push({ intent: 'generic_b2b', tier: 'C', why: ['Fallback if unclear'] });
    }
  }

  // Derive confidence from role cluster detection
  const { confidence } = deriveRoleCluster(demandSignals.roleTitleSamples);

  const recommended = intents[0];
  const alternates = intents.slice(1, 3);

  return {
    recommendedIntent: recommended.intent,
    tier: recommended.tier,
    confidence,
    why: recommended.why,
    alternates: alternates.map(a => ({ intent: a.intent, tier: a.tier, why: a.why })),
  };
}
