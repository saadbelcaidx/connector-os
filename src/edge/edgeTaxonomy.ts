/**
 * EDGE TAXONOMY — Defines valid/forbidden edges per mode
 *
 * NO INTRO WITHOUT EDGE.
 * Each mode has explicit edge types, forbidden edges, and default probe phrasing.
 */

export type EdgeType = string;

export interface EdgeTaxonomy {
  validEdges: EdgeType[];
  forbiddenEdges: EdgeType[];
  defaultProbePhrase: string;
}

export const EDGE_TAXONOMY: Record<string, EdgeTaxonomy> = {

  real_estate: {
    validEdges: [
      'ACTIVE_DEAL',
      'CAPITAL_RAISE',
      'ACQUISITION_TARGET',
      'DISPOSITION',
      'REFINANCE',
      'DEVELOPMENT_PIPELINE',
    ],
    forbiddenEdges: ['HIRING', 'FUNDING_ROUND', 'LICENSING', 'CRYPTO', 'BIOTECH'],
    defaultProbePhrase: 'open to intros around active deals',
  },

  crypto: {
    validEdges: [
      'LICENSING_NEED',
      'CUSTODY_SETUP',
      'COMPLIANCE_BUILD',
      'EXCHANGE_LAUNCH',
      'INSTITUTIONAL_ONBOARD',
      'DEFI_INTEGRATION',
    ],
    forbiddenEdges: ['HIRING', 'WEALTH_CLIENT', 'REAL_ESTATE_DEAL', 'BIOTECH'],
    defaultProbePhrase: 'open to intros around compliance or infrastructure',
  },

  biotech: {
    validEdges: [
      'LICENSING_OUT',
      'PARTNERSHIP_SEEK',
      'CLINICAL_MILESTONE',
      'REGULATORY_FILING',
      'MANUFACTURING_NEED',
      'CO_DEVELOPMENT',
    ],
    forbiddenEdges: ['HIRING', 'CRYPTO', 'REAL_ESTATE', 'WEALTH_CLIENT'],
    defaultProbePhrase: 'open to intros around licensing or partnerships',
  },

  recruitment: {
    validEdges: [
      'ACTIVE_SEARCH',
      'TEAM_EXPANSION',
      'LEADERSHIP_GAP',
      'REPLACEMENT_HIRE',
      'NEW_FUNCTION',
      'SCALING_TEAM',
    ],
    forbiddenEdges: ['LICENSING', 'FUNDING', 'COMPLIANCE', 'CRYPTO', 'BIOTECH'],
    defaultProbePhrase: 'open to intros around hiring needs',
  },

  wealth_management: {
    validEdges: [
      'NEEDS_CLIENTS',
      'LIQUIDITY_EVENT',
      'PRACTICE_EXPANSION',
      'CLIENT_TRANSITION',
      'AUM_GROWTH',
      'SUCCESSION_PLANNING',
    ],
    forbiddenEdges: ['HIRING', 'CRYPTO', 'REAL_ESTATE_DEAL', 'BIOTECH'],
    defaultProbePhrase: 'open to intros around client acquisition',
  },

  logistics: {
    validEdges: [
      'CAPACITY_NEED',
      'FULFILLMENT_SCALE',
      'CARRIER_SEARCH',
      'WAREHOUSE_EXPANSION',
      'RETURNS_OVERFLOW',
      'LAST_MILE_GAP',
    ],
    forbiddenEdges: ['HIRING', 'LICENSING', 'WEALTH_CLIENT', 'CRYPTO', 'BIOTECH'],
    defaultProbePhrase: 'open to intros around fulfillment capacity',
  },

  b2b_broad: {
    validEdges: [
      'VENDOR_SEARCH',
      'PARTNERSHIP_INTEREST',
      'SERVICE_NEED',
      'GROWTH_INITIATIVE',
      'TECH_EVALUATION',
    ],
    forbiddenEdges: [], // No forbidden edges for broad mode
    defaultProbePhrase: 'open to intros around relevant partners',
  },

  custom: {
    validEdges: [], // User must define via presignal
    forbiddenEdges: [],
    defaultProbePhrase: 'open to relevant intros',
  },
};

/**
 * Get taxonomy for a mode, falling back to b2b_broad if unknown
 */
export function getTaxonomy(mode: string): EdgeTaxonomy {
  return EDGE_TAXONOMY[mode] || EDGE_TAXONOMY.b2b_broad;
}

/**
 * Check if an edge type is valid for a mode
 */
export function isEdgeValidForMode(edgeType: string, mode: string): boolean {
  const taxonomy = getTaxonomy(mode);

  // Forbidden edges are always rejected
  if (taxonomy.forbiddenEdges.includes(edgeType)) {
    return false;
  }

  // If mode has explicit valid edges, check membership
  if (taxonomy.validEdges.length > 0) {
    return taxonomy.validEdges.includes(edgeType);
  }

  // b2b_broad and custom accept any non-forbidden edge
  return true;
}
