/**
 * FilterSynthesizer.ts
 *
 * MULTI-VERTICAL FILTER SYNTHESIZER
 *
 * Converts pressure detection results into scraper-ready filter sets.
 *
 * Input:
 * - PressureDetectionResult (from PressureDetector)
 * - CounterpartyCategory (from InversionTable)
 * - Optional verticalHint
 *
 * Output:
 * - ScraperFilters with include/exclude lists and explanation
 *
 * NO AI. NO NETWORK CALLS. Deterministic pack-based synthesis.
 */

import type { CounterpartyCategory, RoleType } from './InversionTable';
import type { PressureDetectionResult } from './PressureDetector';
import { getFilterPack, VerticalHint, DEFAULT_COMPANY_SIZES } from './FilterPacks';

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface FilterSynthesisInput {
  detection: PressureDetectionResult;
  counterparty: CounterpartyCategory;
  verticalHint?: VerticalHint;
  geoInclude?: string[];
}

// ============================================================================
// OUTPUT TYPES
// ============================================================================

export interface ScraperFilters {
  jobTitlesInclude: string[];
  jobTitlesExclude: string[];
  industriesInclude: string[];
  industriesExclude: string[];
  companySizeInclude: string[];
  keywordsInclude: string[];
  keywordsExclude: string[];
  geoInclude?: string[];
  why: string;
}

// ============================================================================
// SAFE EMPTY RESULT
// ============================================================================

const SAFE_EMPTY_FILTERS: ScraperFilters = {
  jobTitlesInclude: [],
  jobTitlesExclude: [],
  industriesInclude: [],
  industriesExclude: [],
  companySizeInclude: [],
  keywordsInclude: [],
  keywordsExclude: [],
  why: 'No hiring pressure detected. No filters synthesized.'
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Humanize roleType for the 'why' field
 */
function humanizeRoleType(roleType: RoleType): string {
  const map: Record<RoleType, string> = {
    engineering: 'engineering/software',
    sales: 'sales/revenue',
    marketing: 'marketing/growth',
    operations: 'operations',
    finance: 'finance/accounting',
    compliance: 'compliance/regulatory',
    unknown: 'general'
  };
  return map[roleType] || 'general';
}

/**
 * Humanize counterparty for the 'why' field
 */
function humanizeCounterparty(counterparty: CounterpartyCategory): string {
  const map: Record<CounterpartyCategory, string> = {
    tech_recruitment: 'technical recruiters',
    sales_recruitment: 'sales recruiters',
    marketing_recruitment: 'marketing recruiters',
    executive_search: 'executive search firms',
    compliance_consulting: 'compliance consultants',
    cloud_consulting: 'cloud consultants',
    unknown: 'general service providers'
  };
  return map[counterparty] || 'service providers';
}

/**
 * Generate the 'why' explanation
 */
function generateWhy(
  roleType: RoleType,
  counterparty: CounterpartyCategory,
  confidence: 'high' | 'medium' | 'low'
): string {
  const roleHuman = humanizeRoleType(roleType);
  const counterpartyHuman = humanizeCounterparty(counterparty);
  const confidenceText = confidence === 'high' ? 'strong' : confidence === 'medium' ? 'moderate' : 'initial';

  return `Detected ${confidenceText} hiring pressure for ${roleHuman} roles. Filters target ${counterpartyHuman} who can monetize this demand.`;
}

// ============================================================================
// PRIMARY FUNCTION
// ============================================================================

/**
 * Synthesize scraper filters from pressure detection and counterparty
 *
 * Resolution:
 * 1. Check if pressure was detected (guardrail)
 * 2. Look up filter pack by counterparty + verticalHint
 * 3. Apply pack values
 * 4. Generate explanation
 *
 * @param input - FilterSynthesisInput with detection, counterparty, and options
 * @returns ScraperFilters ready for use by scrapers
 */
export function synthesizeFilters(input: FilterSynthesisInput): ScraperFilters {
  const {
    detection,
    counterparty,
    verticalHint = 'generic',
    geoInclude
  } = input;

  // GUARDRAIL: No pressure = safe empty result
  if (!detection.pressureDetected) {
    return SAFE_EMPTY_FILTERS;
  }

  // Look up the filter pack
  const pack = getFilterPack(counterparty, verticalHint);

  // Generate the 'why' explanation
  const why = generateWhy(detection.roleType, counterparty, detection.confidence);

  // Synthesize the final filters
  return {
    jobTitlesInclude: [...pack.jobTitlesInclude],
    jobTitlesExclude: [...pack.jobTitlesExclude],
    industriesInclude: [...pack.industriesInclude],
    industriesExclude: [...pack.industriesExclude],
    companySizeInclude: pack.companySizeInclude.length > 0
      ? [...pack.companySizeInclude]
      : [...DEFAULT_COMPANY_SIZES],
    keywordsInclude: [...pack.keywordsInclude],
    keywordsExclude: [...pack.keywordsExclude],
    geoInclude: geoInclude ? [...geoInclude] : undefined,
    why
  };
}

// ============================================================================
// RE-EXPORTS FOR CONVENIENCE
// ============================================================================

export type { VerticalHint } from './FilterPacks';
