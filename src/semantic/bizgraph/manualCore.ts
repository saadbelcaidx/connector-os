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

// =============================================================================
// COMBINE ALL CONCEPTS
// =============================================================================

export const MANUAL_CORE_CONCEPTS: ManualCoreConcept[] = [
  ...TIER_1_HR_RECRUITING,
  ...TIER_2_SALES_DEVELOPMENT,
  ...TIER_3_TECH_LEADERSHIP,
  ...TIER_4_MODERN_INDUSTRIES,
  ...TIER_5_DISAMBIGUATION,
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

// =============================================================================
// COMBINE ALL EDGES
// =============================================================================

export const MANUAL_CORE_EDGE_DEFS: ManualCoreEdgeDef[] = [
  ...TIER_1_EDGES,
  ...TIER_2_EDGES,
  ...TIER_3_EDGES,
  ...TIER_4_EDGES,
  ...TIER_5_EDGES,
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
