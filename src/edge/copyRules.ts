/**
 * COPY RULES — Probe vs Connect intro rules
 *
 * PROBE: No edge → ask permission, never claim counterpart
 * CONNECT: Edge present → state value, be symmetrical
 */

// =============================================================================
// BANNED PHRASES (GLOBAL)
// =============================================================================

/**
 * These phrases MUST NOT appear unless edge is validated
 */
export const BANNED_WITHOUT_EDGE = [
  "i'm in touch with",
  "i can connect you directly",
  "navigating compliance",
  "high-net-worth client",
  "teams who lose months",
  "licensing constraints",
  "custody requirements",
  "state-by-state",
] as const;

/**
 * Check if text contains any banned phrase
 */
export function containsBannedPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  return BANNED_WITHOUT_EDGE.some(phrase => lower.includes(phrase.toLowerCase()));
}

// =============================================================================
// PROBE RULES
// =============================================================================

/**
 * PROBE INTRO RULES
 * Used when: validateEdge() = 'probe_only'
 */
export const PROBE_RULES = {
  // MUST
  must: [
    'Ask permission',
    'Use mode defaultProbePhrase',
    'End with opt-out: "if not, no worries"',
  ],

  // MUST NOT
  mustNot: [
    '"i\'m in touch with"',
    '"i can connect you directly"',
    'Any specific counterparty claim',
    'Any pain statement',
    'Any edge-specific language',
  ],
} as const;

// =============================================================================
// CONNECT RULES
// =============================================================================

/**
 * CONNECT INTRO RULES
 * Used when: validateEdge() = 'valid'
 */
export const CONNECT_RULES = {
  // MUST
  must: [
    'State edge implicitly (not raw)',
    'Be symmetrical: demand mentions supply type, supply mentions demand type',
    'End with soft CTA: "worth an intro?"',
  ],

  // MUST NOT
  mustNot: [
    'Raw presignal text',
    'Raw companyDescription',
    'Overclaim specificity',
    'Mode-incompatible pain',
  ],
} as const;

// =============================================================================
// EDGE PHRASE MAPPING
// =============================================================================

/**
 * Map edge types to human-readable phrases for intros
 */
export const EDGE_PHRASES: Record<string, string> = {
  // Real Estate
  ACTIVE_DEAL: 'working on active deals',
  CAPITAL_RAISE: 'raising capital',
  ACQUISITION_TARGET: 'looking for acquisitions',
  DISPOSITION: 'looking to exit positions',
  REFINANCE: 'exploring refinance options',
  DEVELOPMENT_PIPELINE: 'building their development pipeline',

  // Crypto
  LICENSING_NEED: 'navigating licensing',
  CUSTODY_SETUP: 'setting up custody',
  COMPLIANCE_BUILD: 'building compliance infrastructure',
  EXCHANGE_LAUNCH: 'launching exchange operations',
  INSTITUTIONAL_ONBOARD: 'onboarding institutional clients',
  DEFI_INTEGRATION: 'integrating DeFi protocols',

  // Biotech
  LICENSING_OUT: 'looking to out-license',
  PARTNERSHIP_SEEK: 'seeking partnerships',
  CLINICAL_MILESTONE: 'hitting clinical milestones',
  REGULATORY_FILING: 'preparing regulatory filings',
  MANUFACTURING_NEED: 'scaling manufacturing',
  CO_DEVELOPMENT: 'seeking co-development partners',

  // Recruitment
  ACTIVE_SEARCH: 'actively hiring',
  TEAM_EXPANSION: 'expanding their team',
  LEADERSHIP_GAP: 'filling leadership gaps',
  REPLACEMENT_HIRE: 'backfilling key roles',
  NEW_FUNCTION: 'building new functions',
  SCALING_TEAM: 'scaling their team',

  // Wealth Management
  NEEDS_CLIENTS: 'looking for new clients',
  LIQUIDITY_EVENT: 'handling liquidity events',
  PRACTICE_EXPANSION: 'expanding their practice',
  CLIENT_TRANSITION: 'managing client transitions',
  AUM_GROWTH: 'growing AUM',
  SUCCESSION_PLANNING: 'planning succession',

  // Logistics
  CAPACITY_NEED: 'needing fulfillment capacity',
  FULFILLMENT_SCALE: 'scaling fulfillment',
  CARRIER_SEARCH: 'looking for carriers',
  WAREHOUSE_EXPANSION: 'expanding warehouse footprint',
  RETURNS_OVERFLOW: 'managing returns overflow',
  LAST_MILE_GAP: 'solving last-mile gaps',

  // B2B Broad
  VENDOR_SEARCH: 'evaluating vendors',
  PARTNERSHIP_INTEREST: 'exploring partnerships',
  SERVICE_NEED: 'looking for service providers',
  GROWTH_INITIATIVE: 'pursuing growth initiatives',
  TECH_EVALUATION: 'evaluating technology solutions',
};

/**
 * Get human-readable phrase for an edge type
 */
export function getEdgePhrase(edgeType: string): string {
  return EDGE_PHRASES[edgeType] || 'exploring opportunities';
}
