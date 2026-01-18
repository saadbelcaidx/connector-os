/**
 * BIZGRAPH Manual Core — Code-Owned Business Relationships
 *
 * EXACT SPECIFICATION: These mappings are non-negotiable.
 * NOT user-configurable. Changes require code review.
 *
 * Tiers:
 * - TIER 1: HR / Recruiting (must-have)
 * - TIER 2: Sales Development (must-have)
 * - TIER 3: Tech Leadership (must-have)
 * - TIER 4: Modern Industries (must-have)
 * - TIER 5: Context Disambiguation (false positive prevention)
 */

import {
  type TagType,
  type Domain,
  type EdgeRelation,
  type BizGraphConcept,
  type BizGraphEdge,
  generateConceptId,
  canonicalizeLabel,
} from './schema';

// =============================================================================
// MANUAL CORE CONCEPT DEFINITIONS
// =============================================================================

interface ManualCoreConcept {
  tag: TagType;
  domain: Domain;
  labels: string[];  // First is canonical, rest are aliases
}

// -----------------------------------------------------------------------------
// TIER 1: HR / RECRUITING
// -----------------------------------------------------------------------------

const TIER_1_HR_RECRUITING: ManualCoreConcept[] = [
  {
    tag: 'service',
    domain: 'hr',
    labels: ['recruiting', 'recruitment', 'recruit', 'recruits'],
  },
  {
    tag: 'service',
    domain: 'hr',
    labels: ['staffing', 'staff augmentation'],
  },
  {
    tag: 'service',
    domain: 'hr',
    labels: ['talent acquisition', 'ta'],
  },
  {
    tag: 'intent',
    domain: 'hr',
    labels: ['hiring', 'hire'],
  },
  {
    tag: 'function',
    domain: 'hr',
    labels: ['technical recruiting', 'tech recruiting'],
  },
  {
    tag: 'function',
    domain: 'hr',
    labels: ['engineering hiring', 'engineering hires'],
  },
  {
    tag: 'activity',
    domain: 'hr',
    labels: ['team building', 'building teams'],
  },
  {
    tag: 'role',
    domain: 'hr',
    labels: ['recruiter', 'talent recruiter'],
  },
  {
    tag: 'role',
    domain: 'hr',
    labels: ['talent acquisition specialist', 'ta specialist'],
  },
];

// -----------------------------------------------------------------------------
// TIER 2: SALES DEVELOPMENT
// -----------------------------------------------------------------------------

const TIER_2_SALES_DEVELOPMENT: ManualCoreConcept[] = [
  {
    tag: 'service',
    domain: 'sales',
    labels: ['inside sales', 'inside sales services'],
  },
  {
    tag: 'function',
    domain: 'sales',
    labels: ['sales development', 'sales dev'],
  },
  {
    tag: 'activity',
    domain: 'sales',
    labels: ['outbound sales', 'outbound'],
  },
  {
    tag: 'role',
    domain: 'sales',
    labels: ['sdr', 'sales development rep', 'sales development representative'],
  },
  {
    tag: 'role',
    domain: 'sales',
    labels: ['bdr', 'business development rep', 'business development representative'],
  },
  {
    tag: 'function',
    domain: 'sales',
    labels: ['lead generation', 'lead gen', 'leadgen'],
  },
  {
    tag: 'activity',
    domain: 'sales',
    labels: ['cold email outreach', 'cold outreach', 'cold email'],
  },
];

// -----------------------------------------------------------------------------
// TIER 3: TECH LEADERSHIP
// -----------------------------------------------------------------------------

const TIER_3_TECH_LEADERSHIP: ManualCoreConcept[] = [
  {
    tag: 'role',
    domain: 'tech',
    labels: ['vp engineering', 'vice president of engineering', 'vp of engineering'],
  },
  {
    tag: 'role',
    domain: 'tech',
    labels: ['head of engineering', 'engineering head'],
  },
  {
    tag: 'role',
    domain: 'tech',
    labels: ['engineering director', 'director of engineering'],
  },
];

// -----------------------------------------------------------------------------
// TIER 4: MODERN INDUSTRIES
// -----------------------------------------------------------------------------

const TIER_4_MODERN_INDUSTRIES: ManualCoreConcept[] = [
  {
    tag: 'industry',
    domain: 'finance',
    labels: ['fintech', 'financial technology', 'fin tech'],
  },
  {
    tag: 'industry',
    domain: 'finance',
    labels: ['payments', 'payment processing', 'payment technology'],
  },
  {
    tag: 'industry',
    domain: 'finance',
    labels: ['banking technology', 'banking tech', 'banktech'],
  },
  {
    tag: 'industry',
    domain: 'finance',
    labels: ['regtech', 'regulatory technology', 'reg tech'],
  },
  {
    tag: 'function',
    domain: 'finance',
    labels: ['compliance', 'regulatory compliance'],
  },
  {
    tag: 'industry',
    domain: 'tech',
    labels: ['web3', 'web 3', 'web3.0'],
  },
  {
    tag: 'industry',
    domain: 'tech',
    labels: ['blockchain', 'distributed ledger'],
  },
  {
    tag: 'industry',
    domain: 'tech',
    labels: ['crypto', 'cryptocurrency', 'cryptocurrencies'],
  },
  {
    tag: 'activity',
    domain: 'tech',
    labels: ['decentralized systems', 'decentralization', 'defi'],
  },
];

// -----------------------------------------------------------------------------
// TIER 5: CONTEXT DISAMBIGUATION
// -----------------------------------------------------------------------------

const TIER_5_DISAMBIGUATION: ManualCoreConcept[] = [
  {
    tag: 'function',
    domain: 'tech',
    labels: ['ai safety', 'ai alignment', 'alignment research'],
  },
  {
    tag: 'function',
    domain: 'sales',
    labels: ['ai sales', 'ai sales team'],
  },
  {
    tag: 'function',
    domain: 'general',
    labels: ['sales'],
  },
  {
    tag: 'function',
    domain: 'tech',
    labels: ['research', 'r&d'],
  },
  {
    tag: 'industry',
    domain: 'tech',
    labels: ['artificial intelligence', 'ai', 'machine learning'],
  },
];

// -----------------------------------------------------------------------------
// TIER 6: GROWTH / FUNDING SIGNALS → MARKETING SERVICES
// Pattern: Signal → indicates → Need → fulfills → Service
// -----------------------------------------------------------------------------

const TIER_6_GROWTH_SIGNALS: ManualCoreConcept[] = [
  // === SIGNALS (what we detect in demand) ===
  {
    tag: 'signal',
    domain: 'marketing',
    labels: ['funding raised', 'raised funding', 'raised capital', 'secured funding'],
  },
  {
    tag: 'signal',
    domain: 'marketing',
    labels: ['series a', 'series b', 'series c', 'series d'],
  },
  {
    tag: 'signal',
    domain: 'marketing',
    labels: ['seed round', 'seed funding', 'pre-seed'],
  },
  {
    tag: 'signal',
    domain: 'marketing',
    labels: ['scaling', 'rapid growth', 'hypergrowth', 'fast growing'],
  },
  {
    tag: 'signal',
    domain: 'marketing',
    labels: ['expanding team', 'team expansion', 'growing team'],
  },
  {
    tag: 'signal',
    domain: 'marketing',
    labels: ['market expansion', 'entering new market', 'geographic expansion'],
  },

  // === NEEDS (what the signal indicates) ===
  {
    tag: 'need',
    domain: 'marketing',
    labels: ['growth marketing', 'growth marketing need', 'marketing growth'],
  },
  {
    tag: 'need',
    domain: 'marketing',
    labels: ['demand generation', 'demand gen', 'demandgen'],
  },
  {
    tag: 'need',
    domain: 'marketing',
    labels: ['lead generation', 'lead gen need', 'leads generation'],
  },
  {
    tag: 'need',
    domain: 'marketing',
    labels: ['customer acquisition', 'acquiring customers', 'customer growth'],
  },
  {
    tag: 'need',
    domain: 'marketing',
    labels: ['brand awareness', 'brand building', 'brand growth'],
  },
  {
    tag: 'need',
    domain: 'marketing',
    labels: ['pipeline generation', 'pipeline growth', 'building pipeline'],
  },

  // === SERVICES (who fulfills the need) ===
  {
    tag: 'service',
    domain: 'marketing',
    labels: ['growth marketing agency', 'growth agency', 'growth marketing firm'],
  },
  {
    tag: 'service',
    domain: 'marketing',
    labels: ['demand gen agency', 'demand generation agency', 'demandgen firm'],
  },
  {
    tag: 'service',
    domain: 'marketing',
    labels: ['lead gen agency', 'lead generation agency', 'leadgen service'],
  },
  {
    tag: 'service',
    domain: 'marketing',
    labels: ['marketing consulting', 'marketing consultant', 'marketing advisor'],
  },
  {
    tag: 'service',
    domain: 'marketing',
    labels: ['digital marketing agency', 'digital agency', 'performance marketing'],
  },
  {
    tag: 'service',
    domain: 'marketing',
    labels: ['content marketing agency', 'content agency', 'content marketing firm'],
  },
  {
    tag: 'role',
    domain: 'marketing',
    labels: ['fractional cmo', 'fractional chief marketing officer', 'part-time cmo'],
  },
];

// -----------------------------------------------------------------------------
// TIER 7: COMPLIANCE / REGULATORY SIGNALS → LEGAL SERVICES
// Pattern: Signal → indicates → Need → fulfills → Service
// -----------------------------------------------------------------------------

const TIER_7_COMPLIANCE_SIGNALS: ManualCoreConcept[] = [
  // === SIGNALS (regulatory/compliance triggers) ===
  {
    tag: 'signal',
    domain: 'legal',
    labels: ['gdpr', 'gdpr compliance', 'gdpr requirement'],
  },
  {
    tag: 'signal',
    domain: 'legal',
    labels: ['ccpa', 'ccpa compliance', 'california privacy'],
  },
  {
    tag: 'signal',
    domain: 'legal',
    labels: ['privacy regulation', 'data privacy', 'privacy law'],
  },
  {
    tag: 'signal',
    domain: 'legal',
    labels: ['regulatory audit', 'compliance audit', 'audit requirement'],
  },
  {
    tag: 'signal',
    domain: 'legal',
    labels: ['licensing requirement', 'license application', 'regulatory approval'],
  },
  {
    tag: 'signal',
    domain: 'legal',
    labels: ['soc2', 'soc 2', 'soc2 compliance', 'soc 2 certification'],
  },
  {
    tag: 'signal',
    domain: 'legal',
    labels: ['hipaa', 'hipaa compliance', 'healthcare compliance'],
  },
  {
    tag: 'signal',
    domain: 'legal',
    labels: ['pci dss', 'pci compliance', 'payment compliance'],
  },

  // === NEEDS (what the signal indicates) ===
  {
    tag: 'need',
    domain: 'legal',
    labels: ['privacy compliance', 'privacy compliance need', 'data protection compliance'],
  },
  {
    tag: 'need',
    domain: 'legal',
    labels: ['regulatory compliance', 'compliance requirement', 'regulatory need'],
  },
  {
    tag: 'need',
    domain: 'legal',
    labels: ['legal advisory', 'legal guidance', 'legal counsel need'],
  },
  {
    tag: 'need',
    domain: 'legal',
    labels: ['contract review', 'legal review', 'agreement review'],
  },
  {
    tag: 'need',
    domain: 'legal',
    labels: ['compliance preparation', 'audit preparation', 'certification prep'],
  },

  // === SERVICES (who fulfills the need) ===
  {
    tag: 'service',
    domain: 'legal',
    labels: ['privacy law firm', 'privacy attorney', 'data privacy lawyer'],
  },
  {
    tag: 'service',
    domain: 'legal',
    labels: ['compliance consultant', 'compliance consulting', 'compliance advisory'],
  },
  {
    tag: 'service',
    domain: 'legal',
    labels: ['regulatory advisor', 'regulatory consulting', 'regulatory affairs firm'],
  },
  {
    tag: 'service',
    domain: 'legal',
    labels: ['corporate law firm', 'corporate attorney', 'business lawyer'],
  },
  {
    tag: 'service',
    domain: 'legal',
    labels: ['legal consulting', 'legal consultant', 'legal services firm'],
  },
  {
    tag: 'role',
    domain: 'legal',
    labels: ['fractional gc', 'fractional general counsel', 'part-time gc'],
  },
];

// -----------------------------------------------------------------------------
// TIER 8: PRODUCT / LAUNCH SIGNALS → GTM SERVICES
// Pattern: Signal → indicates → Need → fulfills → Service
// -----------------------------------------------------------------------------

const TIER_8_PRODUCT_SIGNALS: ManualCoreConcept[] = [
  // === SIGNALS (product/launch triggers) ===
  {
    tag: 'signal',
    domain: 'product',
    labels: ['product launch', 'launching product', 'new product launch'],
  },
  {
    tag: 'signal',
    domain: 'product',
    labels: ['beta launch', 'beta release', 'public beta'],
  },
  {
    tag: 'signal',
    domain: 'product',
    labels: ['product announcement', 'new feature', 'feature release'],
  },
  {
    tag: 'signal',
    domain: 'product',
    labels: ['rebranding', 'rebrand', 'brand refresh', 'new brand'],
  },
  {
    tag: 'signal',
    domain: 'product',
    labels: ['market entry', 'new market', 'market launch'],
  },
  {
    tag: 'signal',
    domain: 'product',
    labels: ['pivoting', 'pivot', 'strategic pivot', 'business pivot'],
  },

  // === NEEDS (what the signal indicates) ===
  {
    tag: 'need',
    domain: 'product',
    labels: ['go-to-market strategy', 'gtm strategy', 'gtm planning'],
  },
  {
    tag: 'need',
    domain: 'product',
    labels: ['product marketing', 'product marketing need', 'pmm'],
  },
  {
    tag: 'need',
    domain: 'product',
    labels: ['launch strategy', 'launch planning', 'product launch strategy'],
  },
  {
    tag: 'need',
    domain: 'product',
    labels: ['brand strategy', 'brand development', 'brand positioning'],
  },
  {
    tag: 'need',
    domain: 'product',
    labels: ['market positioning', 'positioning strategy', 'competitive positioning'],
  },
  {
    tag: 'need',
    domain: 'product',
    labels: ['messaging strategy', 'product messaging', 'value proposition'],
  },

  // === SERVICES (who fulfills the need) ===
  {
    tag: 'service',
    domain: 'product',
    labels: ['gtm consultant', 'go-to-market consultant', 'gtm advisor'],
  },
  {
    tag: 'service',
    domain: 'product',
    labels: ['product marketing agency', 'product marketing consultant', 'pmm agency'],
  },
  {
    tag: 'service',
    domain: 'product',
    labels: ['brand agency', 'branding agency', 'brand consultant'],
  },
  {
    tag: 'service',
    domain: 'product',
    labels: ['launch advisor', 'launch consultant', 'product launch agency'],
  },
  {
    tag: 'service',
    domain: 'product',
    labels: ['positioning consultant', 'messaging consultant', 'strategic consultant'],
  },
  {
    tag: 'role',
    domain: 'product',
    labels: ['fractional cpo', 'fractional chief product officer', 'part-time cpo'],
  },
];

// -----------------------------------------------------------------------------
// TIER 9: TECHNICAL / ENGINEERING SIGNALS → ENGINEERING SERVICES
// Pattern: Signal → indicates → Need → fulfills → Service
// -----------------------------------------------------------------------------

const TIER_9_TECHNICAL_SIGNALS: ManualCoreConcept[] = [
  // === SIGNALS (technical triggers) ===
  {
    tag: 'signal',
    domain: 'tech',
    labels: ['technical debt', 'tech debt', 'legacy code'],
  },
  {
    tag: 'signal',
    domain: 'tech',
    labels: ['modernization', 'system modernization', 'platform modernization'],
  },
  {
    tag: 'signal',
    domain: 'tech',
    labels: ['migration', 'cloud migration', 'platform migration'],
  },
  {
    tag: 'signal',
    domain: 'tech',
    labels: ['scalability issues', 'scaling problems', 'performance issues'],
  },
  {
    tag: 'signal',
    domain: 'tech',
    labels: ['architecture review', 'tech review', 'system assessment'],
  },

  // === SECURITY SIGNALS ===
  {
    tag: 'signal',
    domain: 'security',
    labels: ['security incident', 'breach', 'data breach'],
  },
  {
    tag: 'signal',
    domain: 'security',
    labels: ['vulnerability', 'security vulnerability', 'security risk'],
  },
  {
    tag: 'signal',
    domain: 'security',
    labels: ['penetration test', 'pentest', 'security assessment'],
  },
  {
    tag: 'signal',
    domain: 'security',
    labels: ['security audit', 'infosec audit', 'cybersecurity audit'],
  },

  // === NEEDS (what the signal indicates) ===
  {
    tag: 'need',
    domain: 'tech',
    labels: ['engineering consulting', 'technical consulting', 'tech advisory'],
  },
  {
    tag: 'need',
    domain: 'tech',
    labels: ['architecture consulting', 'system architecture', 'solution architecture'],
  },
  {
    tag: 'need',
    domain: 'tech',
    labels: ['technical advisory', 'cto advisory', 'tech leadership'],
  },
  {
    tag: 'need',
    domain: 'tech',
    labels: ['platform engineering', 'infrastructure consulting', 'devops consulting'],
  },
  {
    tag: 'need',
    domain: 'security',
    labels: ['security consulting', 'cybersecurity', 'infosec consulting'],
  },
  {
    tag: 'need',
    domain: 'security',
    labels: ['security assessment', 'vulnerability assessment', 'risk assessment'],
  },

  // === SERVICES (who fulfills the need) ===
  {
    tag: 'service',
    domain: 'tech',
    labels: ['engineering consultant', 'technical consultant', 'tech consulting firm'],
  },
  {
    tag: 'service',
    domain: 'tech',
    labels: ['architecture consultant', 'solution architect', 'enterprise architect'],
  },
  {
    tag: 'service',
    domain: 'tech',
    labels: ['cto advisor', 'cto consultant', 'technical advisor'],
  },
  {
    tag: 'service',
    domain: 'tech',
    labels: ['devops consulting', 'devops agency', 'platform consulting'],
  },
  {
    tag: 'service',
    domain: 'security',
    labels: ['security consultant', 'cybersecurity firm', 'infosec consultant'],
  },
  {
    tag: 'service',
    domain: 'security',
    labels: ['penetration testing firm', 'pentest service', 'ethical hacking'],
  },
  {
    tag: 'role',
    domain: 'tech',
    labels: ['fractional cto', 'fractional chief technology officer', 'part-time cto'],
  },
  {
    tag: 'role',
    domain: 'security',
    labels: ['fractional ciso', 'fractional chief information security officer', 'virtual ciso'],
  },
];

// -----------------------------------------------------------------------------
// TIER 10: OPERATIONS / SCALING SIGNALS → OPS SERVICES
// Pattern: Signal → indicates → Need → fulfills → Service
// -----------------------------------------------------------------------------

const TIER_10_OPS_SIGNALS: ManualCoreConcept[] = [
  // === SIGNALS (operations triggers) ===
  {
    tag: 'signal',
    domain: 'ops',
    labels: ['operational challenges', 'ops challenges', 'process bottleneck'],
  },
  {
    tag: 'signal',
    domain: 'ops',
    labels: ['scaling operations', 'ops scaling', 'operational scaling'],
  },
  {
    tag: 'signal',
    domain: 'ops',
    labels: ['process inefficiency', 'workflow issues', 'operational inefficiency'],
  },
  {
    tag: 'signal',
    domain: 'ops',
    labels: ['supply chain issues', 'logistics challenges', 'fulfillment problems'],
  },
  {
    tag: 'signal',
    domain: 'ops',
    labels: ['cost optimization', 'cost reduction', 'expense management'],
  },

  // === NEEDS (what the signal indicates) ===
  {
    tag: 'need',
    domain: 'ops',
    labels: ['operations consulting', 'ops consulting', 'operational advisory'],
  },
  {
    tag: 'need',
    domain: 'ops',
    labels: ['process optimization', 'workflow optimization', 'operational efficiency'],
  },
  {
    tag: 'need',
    domain: 'ops',
    labels: ['scaling advisory', 'growth operations', 'scale operations'],
  },
  {
    tag: 'need',
    domain: 'ops',
    labels: ['supply chain consulting', 'logistics consulting', 'fulfillment consulting'],
  },

  // === SERVICES (who fulfills the need) ===
  {
    tag: 'service',
    domain: 'ops',
    labels: ['operations consultant', 'ops consultant', 'operational advisor'],
  },
  {
    tag: 'service',
    domain: 'ops',
    labels: ['management consulting', 'management consultant', 'strategy consulting'],
  },
  {
    tag: 'service',
    domain: 'ops',
    labels: ['process consultant', 'workflow consultant', 'efficiency consultant'],
  },
  {
    tag: 'service',
    domain: 'ops',
    labels: ['supply chain consultant', 'logistics consultant', 'fulfillment consultant'],
  },
  {
    tag: 'role',
    domain: 'ops',
    labels: ['fractional coo', 'fractional chief operating officer', 'part-time coo'],
  },
];

// =============================================================================
// COMBINE ALL CONCEPTS
// =============================================================================

export const MANUAL_CORE_CONCEPTS: ManualCoreConcept[] = [
  ...TIER_1_HR_RECRUITING,
  ...TIER_2_SALES_DEVELOPMENT,
  ...TIER_3_TECH_LEADERSHIP,
  ...TIER_4_MODERN_INDUSTRIES,
  ...TIER_5_DISAMBIGUATION,
  ...TIER_6_GROWTH_SIGNALS,
  ...TIER_7_COMPLIANCE_SIGNALS,
  ...TIER_8_PRODUCT_SIGNALS,
  ...TIER_9_TECHNICAL_SIGNALS,
  ...TIER_10_OPS_SIGNALS,
];

// =============================================================================
// MANUAL CORE EDGE DEFINITIONS
// =============================================================================

interface ManualCoreEdgeDef {
  from: string;      // Canonical label of source concept
  rel: EdgeRelation;
  to: string;        // Canonical label of target concept
  weight: number;
}

// -----------------------------------------------------------------------------
// TIER 1 EDGES: HR / RECRUITING
// -----------------------------------------------------------------------------

const TIER_1_EDGES: ManualCoreEdgeDef[] = [
  // Equivalences
  { from: 'recruiting', rel: 'equivalent', to: 'hiring', weight: 1.0 },
  { from: 'recruiting', rel: 'equivalent', to: 'staffing', weight: 1.0 },
  { from: 'recruiting', rel: 'equivalent', to: 'talent acquisition', weight: 1.0 },

  // Fulfills relationships
  { from: 'recruiting', rel: 'fulfills', to: 'hiring', weight: 0.95 },
  { from: 'staffing', rel: 'fulfills', to: 'hiring', weight: 0.95 },
  { from: 'talent acquisition', rel: 'fulfills', to: 'hiring', weight: 0.95 },

  // Specialization
  { from: 'technical recruiting', rel: 'specializes', to: 'recruiting', weight: 0.9 },

  // Related
  { from: 'engineering hiring', rel: 'related', to: 'hiring', weight: 0.9 },
  { from: 'technical recruiting', rel: 'related', to: 'engineering hiring', weight: 0.9 },
  { from: 'recruiter', rel: 'related', to: 'recruiting', weight: 0.8 },
  { from: 'talent acquisition specialist', rel: 'related', to: 'talent acquisition', weight: 0.8 },
  { from: 'team building', rel: 'related', to: 'hiring', weight: 0.6 },
];

// -----------------------------------------------------------------------------
// TIER 2 EDGES: SALES DEVELOPMENT
// -----------------------------------------------------------------------------

const TIER_2_EDGES: ManualCoreEdgeDef[] = [
  // Equivalences
  { from: 'sdr', rel: 'equivalent', to: 'bdr', weight: 0.95 },

  // Related
  { from: 'inside sales', rel: 'related', to: 'sales development', weight: 0.9 },
  { from: 'sales development', rel: 'related', to: 'outbound sales', weight: 0.9 },
  { from: 'outbound sales', rel: 'related', to: 'cold email outreach', weight: 0.8 },
  { from: 'lead generation', rel: 'related', to: 'outbound sales', weight: 0.7 },

  // Fulfills
  { from: 'sales development', rel: 'fulfills', to: 'lead generation', weight: 0.7 },
];

// -----------------------------------------------------------------------------
// TIER 3 EDGES: TECH LEADERSHIP
// -----------------------------------------------------------------------------

const TIER_3_EDGES: ManualCoreEdgeDef[] = [
  { from: 'vp engineering', rel: 'equivalent', to: 'head of engineering', weight: 0.95 },
  { from: 'head of engineering', rel: 'equivalent', to: 'engineering director', weight: 0.9 },
  { from: 'engineering director', rel: 'equivalent', to: 'director of engineering', weight: 1.0 },
];

// -----------------------------------------------------------------------------
// TIER 4 EDGES: MODERN INDUSTRIES
// -----------------------------------------------------------------------------

const TIER_4_EDGES: ManualCoreEdgeDef[] = [
  { from: 'fintech', rel: 'equivalent', to: 'financial technology', weight: 1.0 },
  { from: 'fintech', rel: 'related', to: 'payments', weight: 0.9 },
  { from: 'fintech', rel: 'related', to: 'banking technology', weight: 0.8 },
  { from: 'regtech', rel: 'equivalent', to: 'regulatory technology', weight: 1.0 },
  { from: 'regtech', rel: 'related', to: 'compliance', weight: 0.9 },
  { from: 'web3', rel: 'equivalent', to: 'blockchain', weight: 0.95 },
  { from: 'blockchain', rel: 'related', to: 'crypto', weight: 0.9 },
  { from: 'web3', rel: 'related', to: 'decentralized systems', weight: 0.8 },
];

// -----------------------------------------------------------------------------
// TIER 5 EDGES: DISAMBIGUATION
// -----------------------------------------------------------------------------

const TIER_5_EDGES: ManualCoreEdgeDef[] = [
  { from: 'ai safety', rel: 'equivalent', to: 'ai alignment', weight: 1.0 },
  { from: 'ai safety', rel: 'related', to: 'research', weight: 0.7 },
  { from: 'ai sales', rel: 'related', to: 'sales', weight: 0.7 },
];

// -----------------------------------------------------------------------------
// TIER 6 EDGES: GROWTH/FUNDING SIGNALS → MARKETING SERVICES
// Pattern: Signal → indicates → Need → fulfills ← Service
// -----------------------------------------------------------------------------

const TIER_6_EDGES: ManualCoreEdgeDef[] = [
  // Signal → indicates → Need
  { from: 'funding raised', rel: 'indicates', to: 'growth marketing', weight: 0.95 },
  { from: 'funding raised', rel: 'indicates', to: 'demand generation', weight: 0.95 },
  { from: 'funding raised', rel: 'indicates', to: 'customer acquisition', weight: 0.90 },
  { from: 'series a', rel: 'indicates', to: 'growth marketing', weight: 0.95 },
  { from: 'series a', rel: 'indicates', to: 'lead generation', weight: 0.90 },
  { from: 'seed round', rel: 'indicates', to: 'growth marketing', weight: 0.90 },
  { from: 'scaling', rel: 'indicates', to: 'demand generation', weight: 0.90 },
  { from: 'scaling', rel: 'indicates', to: 'pipeline generation', weight: 0.85 },
  { from: 'expanding team', rel: 'indicates', to: 'growth marketing', weight: 0.85 },
  { from: 'market expansion', rel: 'indicates', to: 'brand awareness', weight: 0.90 },
  { from: 'market expansion', rel: 'indicates', to: 'customer acquisition', weight: 0.90 },

  // Need ← fulfills ← Service
  { from: 'growth marketing agency', rel: 'fulfills', to: 'growth marketing', weight: 0.95 },
  { from: 'growth marketing agency', rel: 'fulfills', to: 'demand generation', weight: 0.90 },
  { from: 'demand gen agency', rel: 'fulfills', to: 'demand generation', weight: 0.95 },
  { from: 'demand gen agency', rel: 'fulfills', to: 'lead generation', weight: 0.90 },
  { from: 'lead gen agency', rel: 'fulfills', to: 'lead generation', weight: 0.95 },
  { from: 'lead gen agency', rel: 'fulfills', to: 'pipeline generation', weight: 0.90 },
  { from: 'marketing consulting', rel: 'fulfills', to: 'growth marketing', weight: 0.90 },
  { from: 'marketing consulting', rel: 'fulfills', to: 'brand awareness', weight: 0.85 },
  { from: 'digital marketing agency', rel: 'fulfills', to: 'customer acquisition', weight: 0.90 },
  { from: 'digital marketing agency', rel: 'fulfills', to: 'demand generation', weight: 0.85 },
  { from: 'content marketing agency', rel: 'fulfills', to: 'brand awareness', weight: 0.90 },
  { from: 'fractional cmo', rel: 'fulfills', to: 'growth marketing', weight: 0.90 },

  // Related equivalences
  { from: 'series a', rel: 'equivalent', to: 'series b', weight: 0.95 },
  { from: 'series b', rel: 'equivalent', to: 'series c', weight: 0.95 },
  { from: 'demand generation', rel: 'equivalent', to: 'demand gen', weight: 1.0 },
  { from: 'lead generation', rel: 'equivalent', to: 'lead gen need', weight: 1.0 },
];

// -----------------------------------------------------------------------------
// TIER 7 EDGES: COMPLIANCE/REGULATORY SIGNALS → LEGAL SERVICES
// -----------------------------------------------------------------------------

const TIER_7_EDGES: ManualCoreEdgeDef[] = [
  // Signal → indicates → Need
  { from: 'gdpr', rel: 'indicates', to: 'privacy compliance', weight: 0.95 },
  { from: 'ccpa', rel: 'indicates', to: 'privacy compliance', weight: 0.95 },
  { from: 'privacy regulation', rel: 'indicates', to: 'privacy compliance', weight: 0.95 },
  { from: 'regulatory audit', rel: 'indicates', to: 'compliance preparation', weight: 0.95 },
  { from: 'regulatory audit', rel: 'indicates', to: 'regulatory compliance', weight: 0.90 },
  { from: 'licensing requirement', rel: 'indicates', to: 'legal advisory', weight: 0.90 },
  { from: 'soc2', rel: 'indicates', to: 'compliance preparation', weight: 0.95 },
  { from: 'hipaa', rel: 'indicates', to: 'regulatory compliance', weight: 0.95 },
  { from: 'pci dss', rel: 'indicates', to: 'regulatory compliance', weight: 0.95 },

  // Need ← fulfills ← Service
  { from: 'privacy law firm', rel: 'fulfills', to: 'privacy compliance', weight: 0.95 },
  { from: 'privacy law firm', rel: 'fulfills', to: 'legal advisory', weight: 0.90 },
  { from: 'compliance consultant', rel: 'fulfills', to: 'regulatory compliance', weight: 0.95 },
  { from: 'compliance consultant', rel: 'fulfills', to: 'compliance preparation', weight: 0.95 },
  { from: 'regulatory advisor', rel: 'fulfills', to: 'regulatory compliance', weight: 0.95 },
  { from: 'corporate law firm', rel: 'fulfills', to: 'legal advisory', weight: 0.90 },
  { from: 'corporate law firm', rel: 'fulfills', to: 'contract review', weight: 0.90 },
  { from: 'legal consulting', rel: 'fulfills', to: 'legal advisory', weight: 0.95 },
  { from: 'fractional gc', rel: 'fulfills', to: 'legal advisory', weight: 0.90 },

  // Equivalences
  { from: 'gdpr', rel: 'equivalent', to: 'gdpr compliance', weight: 1.0 },
  { from: 'ccpa', rel: 'equivalent', to: 'ccpa compliance', weight: 1.0 },
  { from: 'soc2', rel: 'equivalent', to: 'soc 2', weight: 1.0 },
];

// -----------------------------------------------------------------------------
// TIER 8 EDGES: PRODUCT/LAUNCH SIGNALS → GTM SERVICES
// -----------------------------------------------------------------------------

const TIER_8_EDGES: ManualCoreEdgeDef[] = [
  // Signal → indicates → Need
  { from: 'product launch', rel: 'indicates', to: 'go-to-market strategy', weight: 0.95 },
  { from: 'product launch', rel: 'indicates', to: 'launch strategy', weight: 0.95 },
  { from: 'product launch', rel: 'indicates', to: 'product marketing', weight: 0.90 },
  { from: 'beta launch', rel: 'indicates', to: 'go-to-market strategy', weight: 0.90 },
  { from: 'beta launch', rel: 'indicates', to: 'product marketing', weight: 0.85 },
  { from: 'product announcement', rel: 'indicates', to: 'messaging strategy', weight: 0.90 },
  { from: 'rebranding', rel: 'indicates', to: 'brand strategy', weight: 0.95 },
  { from: 'rebranding', rel: 'indicates', to: 'market positioning', weight: 0.90 },
  { from: 'market entry', rel: 'indicates', to: 'go-to-market strategy', weight: 0.95 },
  { from: 'market entry', rel: 'indicates', to: 'market positioning', weight: 0.90 },
  { from: 'pivoting', rel: 'indicates', to: 'market positioning', weight: 0.90 },
  { from: 'pivoting', rel: 'indicates', to: 'messaging strategy', weight: 0.85 },

  // Need ← fulfills ← Service
  { from: 'gtm consultant', rel: 'fulfills', to: 'go-to-market strategy', weight: 0.95 },
  { from: 'gtm consultant', rel: 'fulfills', to: 'launch strategy', weight: 0.90 },
  { from: 'product marketing agency', rel: 'fulfills', to: 'product marketing', weight: 0.95 },
  { from: 'product marketing agency', rel: 'fulfills', to: 'messaging strategy', weight: 0.90 },
  { from: 'brand agency', rel: 'fulfills', to: 'brand strategy', weight: 0.95 },
  { from: 'brand agency', rel: 'fulfills', to: 'market positioning', weight: 0.85 },
  { from: 'launch advisor', rel: 'fulfills', to: 'launch strategy', weight: 0.95 },
  { from: 'positioning consultant', rel: 'fulfills', to: 'market positioning', weight: 0.95 },
  { from: 'positioning consultant', rel: 'fulfills', to: 'messaging strategy', weight: 0.90 },
  { from: 'fractional cpo', rel: 'fulfills', to: 'product marketing', weight: 0.85 },

  // Equivalences
  { from: 'go-to-market strategy', rel: 'equivalent', to: 'gtm strategy', weight: 1.0 },
  { from: 'product marketing', rel: 'equivalent', to: 'pmm', weight: 1.0 },
];

// -----------------------------------------------------------------------------
// TIER 9 EDGES: TECHNICAL/ENGINEERING SIGNALS → ENGINEERING SERVICES
// -----------------------------------------------------------------------------

const TIER_9_EDGES: ManualCoreEdgeDef[] = [
  // Signal → indicates → Need (Technical)
  { from: 'technical debt', rel: 'indicates', to: 'engineering consulting', weight: 0.95 },
  { from: 'technical debt', rel: 'indicates', to: 'architecture consulting', weight: 0.90 },
  { from: 'modernization', rel: 'indicates', to: 'engineering consulting', weight: 0.90 },
  { from: 'modernization', rel: 'indicates', to: 'architecture consulting', weight: 0.95 },
  { from: 'migration', rel: 'indicates', to: 'platform engineering', weight: 0.90 },
  { from: 'migration', rel: 'indicates', to: 'architecture consulting', weight: 0.85 },
  { from: 'scalability issues', rel: 'indicates', to: 'architecture consulting', weight: 0.95 },
  { from: 'scalability issues', rel: 'indicates', to: 'platform engineering', weight: 0.90 },
  { from: 'architecture review', rel: 'indicates', to: 'architecture consulting', weight: 0.95 },
  { from: 'architecture review', rel: 'indicates', to: 'technical advisory', weight: 0.90 },

  // Signal → indicates → Need (Security)
  { from: 'security incident', rel: 'indicates', to: 'security consulting', weight: 0.95 },
  { from: 'security incident', rel: 'indicates', to: 'security assessment', weight: 0.95 },
  { from: 'vulnerability', rel: 'indicates', to: 'security consulting', weight: 0.90 },
  { from: 'vulnerability', rel: 'indicates', to: 'security assessment', weight: 0.95 },
  { from: 'penetration test', rel: 'indicates', to: 'security assessment', weight: 0.95 },
  { from: 'security audit', rel: 'indicates', to: 'security consulting', weight: 0.95 },

  // Need ← fulfills ← Service (Technical)
  { from: 'engineering consultant', rel: 'fulfills', to: 'engineering consulting', weight: 0.95 },
  { from: 'engineering consultant', rel: 'fulfills', to: 'technical advisory', weight: 0.90 },
  { from: 'architecture consultant', rel: 'fulfills', to: 'architecture consulting', weight: 0.95 },
  { from: 'cto advisor', rel: 'fulfills', to: 'technical advisory', weight: 0.95 },
  { from: 'cto advisor', rel: 'fulfills', to: 'architecture consulting', weight: 0.85 },
  { from: 'devops consulting', rel: 'fulfills', to: 'platform engineering', weight: 0.95 },
  { from: 'fractional cto', rel: 'fulfills', to: 'technical advisory', weight: 0.90 },

  // Need ← fulfills ← Service (Security)
  { from: 'security consultant', rel: 'fulfills', to: 'security consulting', weight: 0.95 },
  { from: 'security consultant', rel: 'fulfills', to: 'security assessment', weight: 0.90 },
  { from: 'penetration testing firm', rel: 'fulfills', to: 'security assessment', weight: 0.95 },
  { from: 'fractional ciso', rel: 'fulfills', to: 'security consulting', weight: 0.90 },

  // Equivalences
  { from: 'technical debt', rel: 'equivalent', to: 'tech debt', weight: 1.0 },
  { from: 'penetration test', rel: 'equivalent', to: 'pentest', weight: 1.0 },
];

// -----------------------------------------------------------------------------
// TIER 10 EDGES: OPERATIONS/SCALING SIGNALS → OPS SERVICES
// -----------------------------------------------------------------------------

const TIER_10_EDGES: ManualCoreEdgeDef[] = [
  // Signal → indicates → Need
  { from: 'operational challenges', rel: 'indicates', to: 'operations consulting', weight: 0.95 },
  { from: 'operational challenges', rel: 'indicates', to: 'process optimization', weight: 0.90 },
  { from: 'scaling operations', rel: 'indicates', to: 'scaling advisory', weight: 0.95 },
  { from: 'scaling operations', rel: 'indicates', to: 'operations consulting', weight: 0.90 },
  { from: 'process inefficiency', rel: 'indicates', to: 'process optimization', weight: 0.95 },
  { from: 'supply chain issues', rel: 'indicates', to: 'supply chain consulting', weight: 0.95 },
  { from: 'cost optimization', rel: 'indicates', to: 'operations consulting', weight: 0.90 },
  { from: 'cost optimization', rel: 'indicates', to: 'process optimization', weight: 0.85 },

  // Need ← fulfills ← Service
  { from: 'operations consultant', rel: 'fulfills', to: 'operations consulting', weight: 0.95 },
  { from: 'operations consultant', rel: 'fulfills', to: 'scaling advisory', weight: 0.90 },
  { from: 'management consulting', rel: 'fulfills', to: 'operations consulting', weight: 0.90 },
  { from: 'management consulting', rel: 'fulfills', to: 'process optimization', weight: 0.85 },
  { from: 'process consultant', rel: 'fulfills', to: 'process optimization', weight: 0.95 },
  { from: 'supply chain consultant', rel: 'fulfills', to: 'supply chain consulting', weight: 0.95 },
  { from: 'fractional coo', rel: 'fulfills', to: 'operations consulting', weight: 0.90 },
  { from: 'fractional coo', rel: 'fulfills', to: 'scaling advisory', weight: 0.90 },

  // Equivalences
  { from: 'operations consulting', rel: 'equivalent', to: 'ops consulting', weight: 1.0 },
];

// =============================================================================
// COMBINE ALL EDGES
// =============================================================================

export const MANUAL_CORE_EDGE_DEFS: ManualCoreEdgeDef[] = [
  ...TIER_1_EDGES,
  ...TIER_2_EDGES,
  ...TIER_3_EDGES,
  ...TIER_4_EDGES,
  ...TIER_5_EDGES,
  ...TIER_6_EDGES,
  ...TIER_7_EDGES,
  ...TIER_8_EDGES,
  ...TIER_9_EDGES,
  ...TIER_10_EDGES,
];

// =============================================================================
// BUILD FUNCTIONS
// =============================================================================

/**
 * Build concepts map from manual core definitions.
 */
export function buildManualCoreConcepts(): Record<string, BizGraphConcept> {
  const concepts: Record<string, BizGraphConcept> = {};

  for (const def of MANUAL_CORE_CONCEPTS) {
    const canonicalLabel = canonicalizeLabel(def.labels[0]);
    const id = generateConceptId(def.tag, def.domain, canonicalLabel);

    concepts[id] = {
      t: def.tag,
      d: def.domain,
      l: def.labels.map(canonicalizeLabel),
      a: def.labels.slice(1).map(canonicalizeLabel),
    };
  }

  return concepts;
}

/**
 * Build label-to-ID index from concepts.
 */
export function buildLabelIndex(concepts: Record<string, BizGraphConcept>): Map<string, string> {
  const index = new Map<string, string>();

  for (const [id, concept] of Object.entries(concepts)) {
    for (const label of concept.l) {
      index.set(label, id);
    }
    for (const alias of concept.a) {
      if (!index.has(alias)) {
        index.set(alias, id);
      }
    }
  }

  return index;
}

/**
 * Build edges array from manual core definitions.
 */
export function buildManualCoreEdges(labelIndex: Map<string, string>): BizGraphEdge[] {
  const edges: BizGraphEdge[] = [];

  for (const def of MANUAL_CORE_EDGE_DEFS) {
    const fromLabel = canonicalizeLabel(def.from);
    const toLabel = canonicalizeLabel(def.to);

    const fromId = labelIndex.get(fromLabel);
    const toId = labelIndex.get(toLabel);

    if (!fromId) {
      console.warn(`[ManualCore] Edge source not found: "${def.from}" (canonical: "${fromLabel}")`);
      continue;
    }
    if (!toId) {
      console.warn(`[ManualCore] Edge target not found: "${def.to}" (canonical: "${toLabel}")`);
      continue;
    }

    edges.push([fromId, def.rel, toId, def.weight, 'manual_core']);

    // Add reverse edge for equivalent relations
    if (def.rel === 'equivalent') {
      edges.push([toId, 'equivalent', fromId, def.weight, 'manual_core']);
    }
  }

  // Sort for determinism: by fromId, then rel, then toId
  edges.sort((a, b) => {
    if (a[0] !== b[0]) return a[0].localeCompare(b[0]);
    if (a[1] !== b[1]) return a[1].localeCompare(b[1]);
    return a[2].localeCompare(b[2]);
  });

  return edges;
}

// =============================================================================
// DISAMBIGUATION RULES (TIER 5)
// =============================================================================

/**
 * Disambiguation clusters for false positive prevention.
 * Key: cluster name
 * Value: { concepts: string[], blockedExpansions: string[] }
 */
export const DISAMBIGUATION_CLUSTERS = {
  ai_safety: {
    concepts: ['ai safety', 'ai alignment', 'alignment research'],
    blockedExpansions: ['sales', 'ai sales', 'revenue'],
  },
  ai_sales: {
    concepts: ['ai sales', 'ai sales team'],
    blockedExpansions: ['ai safety', 'ai alignment', 'research', 'alignment'],
  },
};

/**
 * Check if a token belongs to a disambiguation cluster.
 */
export function getDisambiguationCluster(token: string): keyof typeof DISAMBIGUATION_CLUSTERS | null {
  const canonical = canonicalizeLabel(token);

  for (const [clusterName, cluster] of Object.entries(DISAMBIGUATION_CLUSTERS)) {
    for (const concept of cluster.concepts) {
      if (canonical.includes(canonicalizeLabel(concept))) {
        return clusterName as keyof typeof DISAMBIGUATION_CLUSTERS;
      }
    }
  }

  return null;
}

/**
 * Check if an expansion should be blocked due to disambiguation rules.
 */
export function isExpansionBlocked(sourceToken: string, targetToken: string): boolean {
  const cluster = getDisambiguationCluster(sourceToken);
  if (!cluster) return false;

  const targetCanonical = canonicalizeLabel(targetToken);
  const blockedList = DISAMBIGUATION_CLUSTERS[cluster].blockedExpansions;

  for (const blocked of blockedList) {
    if (targetCanonical.includes(canonicalizeLabel(blocked))) {
      return true;
    }
  }

  return false;
}

// =============================================================================
// VALIDATION HELPERS (for tests)
// =============================================================================

/**
 * Get all required edge assertions for testing.
 */
export function getRequiredEdgeAssertions(): Array<{
  from: string;
  rel: EdgeRelation;
  to: string;
  minWeight: number;
}> {
  return [
    // Tier 1
    { from: 'recruiting', rel: 'equivalent', to: 'hiring', minWeight: 1.0 },
    { from: 'recruiting', rel: 'equivalent', to: 'staffing', minWeight: 1.0 },
    { from: 'recruiting', rel: 'equivalent', to: 'talent acquisition', minWeight: 1.0 },
    { from: 'recruiting', rel: 'fulfills', to: 'hiring', minWeight: 0.95 },
    { from: 'staffing', rel: 'fulfills', to: 'hiring', minWeight: 0.95 },
    { from: 'talent acquisition', rel: 'fulfills', to: 'hiring', minWeight: 0.95 },

    // Tier 2
    { from: 'sdr', rel: 'equivalent', to: 'bdr', minWeight: 0.95 },

    // Tier 3
    { from: 'vp engineering', rel: 'equivalent', to: 'head of engineering', minWeight: 0.95 },
    { from: 'head of engineering', rel: 'equivalent', to: 'engineering director', minWeight: 0.9 },

    // Tier 4
    { from: 'fintech', rel: 'equivalent', to: 'financial technology', minWeight: 1.0 },
    { from: 'fintech', rel: 'related', to: 'payments', minWeight: 0.9 },
    { from: 'regtech', rel: 'equivalent', to: 'regulatory technology', minWeight: 1.0 },
    { from: 'regtech', rel: 'related', to: 'compliance', minWeight: 0.9 },
    { from: 'web3', rel: 'equivalent', to: 'blockchain', minWeight: 0.95 },
    { from: 'blockchain', rel: 'related', to: 'crypto', minWeight: 0.9 },

    // Tier 5
    { from: 'ai safety', rel: 'equivalent', to: 'ai alignment', minWeight: 1.0 },
  ];
}
