/**
 * BUYER-SELLER TYPE EXTRACTION & VALIDATION
 *
 * SUPPLY TRUTH CONSTRAINT:
 * - Connector copy can only claim what supply actually does today
 * - Connector matching = buyer-seller overlap, NOT industry overlap
 * - If supply doesn't explicitly sell to demand type → no match
 *
 * DOCTRINE:
 * - Deterministic string scan only (description/industry/title)
 * - If no tokens match → confidence:'low' and default to mode generic type
 * - Custom mode bypasses validation (user responsibility)
 */

import type { ConnectorMode } from '../services/SupplyFilterBuilder';

// =============================================================================
// TYPES
// =============================================================================

export interface BuyerTypeResult {
  type: string;           // e.g., "fintech_product_teams", "wealth_advisors"
  confidence: 'high' | 'medium' | 'low';
  tokens: string[];       // Matched tokens
}

export interface DemandTypeResult {
  type: string;           // e.g., "crypto_platform", "ria_firm"
  confidence: 'high' | 'medium' | 'low';
  tokens: string[];       // Matched tokens
}

export interface OverlapValidation {
  valid: boolean;
  reason?: string;        // e.g., "BUYER_SELLER_MISMATCH"
}

// =============================================================================
// TOKEN DICTIONARIES PER MODE
// Per locked audit: ship minimal dictionaries first, iterate via feedback
// =============================================================================

interface ModeTokens {
  // Supply buyer tokens - WHO does supply sell to?
  supplyBuyerTokens: string[];
  // Demand type tokens - WHAT is demand?
  demandTypeTokens: string[];
  // Disallowed peer types - supply cannot be this type
  disallowedPeerTokens: string[];
  // Default buyer type if no tokens match
  defaultBuyerType: string;
  // Default demand type if no tokens match
  defaultDemandType: string;
}

const MODE_TOKEN_DICTIONARIES: Record<ConnectorMode, ModeTokens> = {
  recruiting: {
    supplyBuyerTokens: [
      'hiring', 'talent acquisition', 'headcount', 'open roles', 'recruiting',
      'staffing', 'placement', 'executive search', 'hr', 'human resources',
    ],
    demandTypeTokens: [
      'hiring', 'growing team', 'scaling', 'open positions', 'headcount',
      'talent', 'recruiting', 'job posting',
    ],
    disallowedPeerTokens: [
      'staffing agency', 'recruitment firm', 'headhunter', 'talent agency',
    ],
    defaultBuyerType: 'hiring_teams',
    defaultDemandType: 'hiring_company',
  },

  biotech_licensing: {
    supplyBuyerTokens: [
      'pharma', 'biotech', 'licensing', 'bd', 'business development',
      'partnership', 'clinical', 'pipeline', 'therapeutic', 'molecule',
    ],
    demandTypeTokens: [
      'biotech', 'pharma', 'clinical stage', 'therapeutics', 'drug',
      'molecule', 'pipeline', 'fda', 'trial',
    ],
    disallowedPeerTokens: [
      'cro', 'contract research', 'clinical trial services',
    ],
    defaultBuyerType: 'pharma_bd_teams',
    defaultDemandType: 'biotech_company',
  },

  wealth_management: {
    supplyBuyerTokens: [
      'hnw', 'high net worth', 'uhnw', 'family office', 'wealth',
      'private client', 'affluent', 'investor', 'estate',
    ],
    demandTypeTokens: [
      'ria', 'wealth', 'advisory', 'financial planning', 'fiduciary',
      'cfp', 'family office', 'private wealth',
    ],
    disallowedPeerTokens: [
      'wealth advisor', 'ria', 'financial planner', 'cfp', 'wealth management firm',
    ],
    defaultBuyerType: 'hnw_individuals',
    defaultDemandType: 'wealth_advisory_firm',
  },

  real_estate_capital: {
    supplyBuyerTokens: [
      'developer', 'sponsor', 'operator', 'gp', 'real estate', 'property',
      'cre', 'commercial', 'multifamily', 'acquisition',
    ],
    demandTypeTokens: [
      'developer', 'sponsor', 'real estate', 'property', 'cre',
      'commercial', 'multifamily', 'development',
    ],
    disallowedPeerTokens: [
      'lender', 'debt fund', 'capital provider', 'equity fund',
    ],
    defaultBuyerType: 're_developers',
    defaultDemandType: 're_sponsor',
  },

  logistics: {
    supplyBuyerTokens: [
      'shipper', 'manufacturer', 'retailer', 'ecommerce', 'brand',
      'fulfillment', 'warehouse', 'distribution',
    ],
    demandTypeTokens: [
      'shipper', 'logistics', 'supply chain', '3pl', 'freight',
      'warehouse', 'fulfillment', 'distribution',
    ],
    disallowedPeerTokens: [
      '3pl', 'freight broker', 'logistics provider', 'warehouse operator',
    ],
    defaultBuyerType: 'shippers',
    defaultDemandType: 'logistics_company',
  },

  crypto: {
    supplyBuyerTokens: [
      'product', 'engineering', 'fintech', 'platform', 'exchange',
      'defi', 'protocol', 'web3', 'blockchain', 'crypto', 'payments',
      'compliance', 'kyc', 'aml',
    ],
    demandTypeTokens: [
      'crypto', 'blockchain', 'web3', 'defi', 'protocol', 'exchange',
      'token', 'nft', 'dao', 'fintech platform',
    ],
    disallowedPeerTokens: [
      // Wealth management should NOT match crypto supply
      'wealth', 'ria', 'financial advisor', 'wealth management',
      'family office', 'private wealth', 'investment advisor',
    ],
    defaultBuyerType: 'crypto_product_teams',
    defaultDemandType: 'crypto_platform',
  },

  enterprise_partnerships: {
    supplyBuyerTokens: [
      'enterprise', 'b2b', 'saas', 'platform', 'integration',
      'partnership', 'vendor', 'solution', 'software',
    ],
    demandTypeTokens: [
      'enterprise', 'b2b', 'saas', 'platform', 'software',
      'solution', 'vendor',
    ],
    disallowedPeerTokens: [
      'consultant', 'agency', 'implementation partner',
    ],
    defaultBuyerType: 'enterprise_teams',
    defaultDemandType: 'enterprise_company',
  },

  custom: {
    // Custom mode bypasses validation - empty dictionaries
    supplyBuyerTokens: [],
    demandTypeTokens: [],
    disallowedPeerTokens: [],
    defaultBuyerType: 'general',
    defaultDemandType: 'company',
  },
};

// =============================================================================
// EXTRACTION FUNCTIONS
// =============================================================================

/**
 * Extract supply buyer type from supply record.
 * Answers: "WHO does this supply sell to?"
 *
 * @param supply - Supply record with description/industry/title
 * @param mode - Connector mode for token dictionary
 * @returns Buyer type with confidence and matched tokens
 */
export function extractSupplyBuyerType(
  supply: { companyDescription?: string; industry?: string | string[]; title?: string },
  mode: ConnectorMode
): BuyerTypeResult {
  const tokens = MODE_TOKEN_DICTIONARIES[mode];
  if (!tokens) {
    return { type: 'unknown', confidence: 'low', tokens: [] };
  }

  // Build searchable text from supply fields
  const desc = (supply.companyDescription || '').toLowerCase();
  const industry = Array.isArray(supply.industry)
    ? supply.industry.join(' ').toLowerCase()
    : (supply.industry || '').toLowerCase();
  const title = (supply.title || '').toLowerCase();
  const combined = `${desc} ${industry} ${title}`;

  // Scan for buyer tokens
  const matchedTokens = tokens.supplyBuyerTokens.filter(token =>
    combined.includes(token.toLowerCase())
  );

  // Determine confidence
  let confidence: 'high' | 'medium' | 'low';
  if (matchedTokens.length >= 3) {
    confidence = 'high';
  } else if (matchedTokens.length >= 1) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  // Return type based on confidence
  const type = matchedTokens.length > 0
    ? inferBuyerTypeFromTokens(matchedTokens, mode)
    : tokens.defaultBuyerType;

  return { type, confidence, tokens: matchedTokens };
}

/**
 * Extract demand type from demand record.
 * Answers: "WHAT is this demand entity?"
 *
 * @param demand - Demand record with description/industry/signal
 * @param mode - Connector mode for token dictionary
 * @returns Demand type with confidence and matched tokens
 */
export function extractDemandType(
  demand: { companyDescription?: string; industry?: string | string[]; signal?: string },
  mode: ConnectorMode
): DemandTypeResult {
  const tokens = MODE_TOKEN_DICTIONARIES[mode];
  if (!tokens) {
    return { type: 'unknown', confidence: 'low', tokens: [] };
  }

  // Build searchable text from demand fields
  const desc = (demand.companyDescription || '').toLowerCase();
  const industry = Array.isArray(demand.industry)
    ? demand.industry.join(' ').toLowerCase()
    : (demand.industry || '').toLowerCase();
  const signal = (demand.signal || '').toLowerCase();
  const combined = `${desc} ${industry} ${signal}`;

  // Scan for demand tokens
  const matchedTokens = tokens.demandTypeTokens.filter(token =>
    combined.includes(token.toLowerCase())
  );

  // Determine confidence
  let confidence: 'high' | 'medium' | 'low';
  if (matchedTokens.length >= 3) {
    confidence = 'high';
  } else if (matchedTokens.length >= 1) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  // Return type based on confidence
  const type = matchedTokens.length > 0
    ? inferDemandTypeFromTokens(matchedTokens, mode)
    : tokens.defaultDemandType;

  return { type, confidence, tokens: matchedTokens };
}

// =============================================================================
// VALIDATION FUNCTION
// =============================================================================

/**
 * Validate buyer-seller overlap.
 * Answers: "Does supply's buyer type overlap with demand type?"
 *
 * RULES:
 * 1. Custom mode always valid (user responsibility)
 * 2. If supply is a disallowed peer type → invalid
 * 3. If supply buyer type doesn't overlap demand type → invalid
 * 4. Otherwise → valid
 *
 * @param supplyBuyer - Extracted buyer type from supply
 * @param demandType - Extracted demand type
 * @param mode - Connector mode
 * @returns Validation result with reason if invalid
 */
export function validateBuyerSellerOverlap(
  supplyBuyer: BuyerTypeResult,
  demandType: DemandTypeResult,
  mode: ConnectorMode,
  supply?: { companyDescription?: string; industry?: string | string[]; title?: string }
): OverlapValidation {
  // Rule 1: Custom mode bypasses validation
  if (mode === 'custom') {
    return { valid: true };
  }

  const tokens = MODE_TOKEN_DICTIONARIES[mode];
  if (!tokens) {
    return { valid: true }; // Unknown mode - allow
  }

  // Rule 2: Check if supply is a disallowed peer type
  if (supply && tokens.disallowedPeerTokens.length > 0) {
    const desc = (supply.companyDescription || '').toLowerCase();
    const industry = Array.isArray(supply.industry)
      ? supply.industry.join(' ').toLowerCase()
      : (supply.industry || '').toLowerCase();
    const title = (supply.title || '').toLowerCase();
    const combined = `${desc} ${industry} ${title}`;

    const isPeer = tokens.disallowedPeerTokens.some(peer =>
      combined.includes(peer.toLowerCase())
    );

    if (isPeer) {
      return {
        valid: false,
        reason: 'BUYER_SELLER_MISMATCH',
      };
    }
  }

  // Rule 3: Check buyer-seller overlap
  // Both must have at least low confidence for comparison
  if (supplyBuyer.confidence === 'low' && demandType.confidence === 'low') {
    // Both low confidence - allow but log
    return { valid: true };
  }

  // Mode-specific overlap rules
  const overlapValid = checkModeOverlap(supplyBuyer, demandType, mode);
  if (!overlapValid) {
    return {
      valid: false,
      reason: 'BUYER_SELLER_MISMATCH',
    };
  }

  return { valid: true };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Infer specific buyer type from matched tokens.
 */
function inferBuyerTypeFromTokens(matchedTokens: string[], mode: ConnectorMode): string {
  const tokenSet = new Set(matchedTokens.map(t => t.toLowerCase()));

  switch (mode) {
    case 'crypto':
      if (tokenSet.has('product') || tokenSet.has('engineering')) return 'crypto_product_teams';
      if (tokenSet.has('compliance') || tokenSet.has('kyc') || tokenSet.has('aml')) return 'compliance_teams';
      if (tokenSet.has('fintech') || tokenSet.has('platform')) return 'fintech_platforms';
      return 'crypto_product_teams';

    case 'wealth_management':
      if (tokenSet.has('hnw') || tokenSet.has('high net worth') || tokenSet.has('uhnw')) return 'hnw_individuals';
      if (tokenSet.has('family office')) return 'family_offices';
      return 'hnw_individuals';

    case 'recruiting':
      if (tokenSet.has('executive search')) return 'executive_hiring';
      if (tokenSet.has('talent acquisition')) return 'talent_teams';
      return 'hiring_teams';

    case 'biotech_licensing':
      if (tokenSet.has('bd') || tokenSet.has('business development')) return 'pharma_bd_teams';
      if (tokenSet.has('licensing')) return 'licensing_teams';
      return 'pharma_bd_teams';

    default:
      return MODE_TOKEN_DICTIONARIES[mode]?.defaultBuyerType || 'general';
  }
}

/**
 * Infer specific demand type from matched tokens.
 */
function inferDemandTypeFromTokens(matchedTokens: string[], mode: ConnectorMode): string {
  const tokenSet = new Set(matchedTokens.map(t => t.toLowerCase()));

  switch (mode) {
    case 'crypto':
      if (tokenSet.has('exchange')) return 'crypto_exchange';
      if (tokenSet.has('defi') || tokenSet.has('protocol')) return 'defi_protocol';
      if (tokenSet.has('nft')) return 'nft_platform';
      return 'crypto_platform';

    case 'wealth_management':
      if (tokenSet.has('ria')) return 'ria_firm';
      if (tokenSet.has('family office')) return 'family_office';
      return 'wealth_advisory_firm';

    case 'recruiting':
      if (tokenSet.has('scaling') || tokenSet.has('growing team')) return 'scaling_company';
      return 'hiring_company';

    default:
      return MODE_TOKEN_DICTIONARIES[mode]?.defaultDemandType || 'company';
  }
}

/**
 * Check mode-specific overlap rules.
 * Returns false if buyer-seller mismatch detected.
 */
function checkModeOverlap(
  supplyBuyer: BuyerTypeResult,
  demandType: DemandTypeResult,
  mode: ConnectorMode
): boolean {
  // Crypto mode: strict - supply must sell to crypto/fintech, not wealth
  if (mode === 'crypto') {
    const supplyTokens = supplyBuyer.tokens.map(t => t.toLowerCase());
    const hasWealthTokens = supplyTokens.some(t =>
      ['wealth', 'ria', 'advisor', 'family office', 'private wealth'].includes(t)
    );
    if (hasWealthTokens) {
      return false; // Wealth management supply cannot match crypto demand
    }
  }

  // Wealth management mode: supply must sell to HNW/families, not platforms
  if (mode === 'wealth_management') {
    const demandTokens = demandType.tokens.map(t => t.toLowerCase());
    const hasPlatformTokens = demandTokens.some(t =>
      ['crypto', 'blockchain', 'fintech platform', 'exchange'].includes(t)
    );
    if (hasPlatformTokens) {
      return false; // Platform demand cannot match wealth supply
    }
  }

  return true;
}

// =============================================================================
// CONVENIENCE EXPORT
// =============================================================================

/**
 * Full validation in one call.
 * Returns { valid: true } or { valid: false, reason: 'BUYER_SELLER_MISMATCH' }
 */
export function validateMatch(
  supply: { companyDescription?: string; industry?: string | string[]; title?: string },
  demand: { companyDescription?: string; industry?: string | string[]; signal?: string },
  mode: ConnectorMode
): OverlapValidation {
  // Custom mode bypasses
  if (mode === 'custom') {
    return { valid: true };
  }

  const supplyBuyer = extractSupplyBuyerType(supply, mode);
  const demandType = extractDemandType(demand, mode);

  return validateBuyerSellerOverlap(supplyBuyer, demandType, mode, supply);
}
