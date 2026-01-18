/**
 * csvIntroTemplates.ts — CSV Intro Generation Templates
 *
 * CSV Phase 3: Honest, scoped intro templates that never imply unavailable signals.
 *
 * TEMPLATE TIERS:
 * - T1 (BASIC): No personalization claims, conservative
 * - T2 (STANDARD): Light personalization (LinkedIn/email presence acknowledged)
 * - T3 (RICH): Uses company description only, no external claims
 *
 * HARD CONSTRAINTS:
 * - No hallucinated facts
 * - No funding claims
 * - No "hiring", "scaling", "recent raise"
 * - No fake personalization
 *
 * INVARIANT: CSV intros are honest, scoped, and never imply unavailable signals.
 */

import type { NormalizedRecord } from '../schemas';
import type { CsvSignalTier } from './csvSignalTier';

// =============================================================================
// TYPES
// =============================================================================

export interface CsvIntroParams {
  demand: NormalizedRecord;
  supply: NormalizedRecord;
  tier: CsvSignalTier;
}

export interface CsvIntroResult {
  demandIntro: string;
  supplyIntro: string;
  tier: CsvSignalTier;
  tierLabel: string;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Extract first name from fullName.
 */
function getFirstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[0] || 'there';
}

/**
 * Extract service description from supply record.
 * Falls back to title if no service description.
 */
function getServiceDescription(supply: NormalizedRecord): string {
  // Check raw for Service Description field from CSV
  const serviceDesc = supply.raw?.['Service Description'];
  if (serviceDesc && serviceDesc.trim()) {
    return serviceDesc.trim();
  }
  // Fallback to title
  if (supply.title && supply.title.trim()) {
    return supply.title.trim();
  }
  return 'specialized services';
}

/**
 * Extract a theme from company description (first clause/sentence).
 * Returns null if description is too short or unavailable.
 */
function extractDescriptionTheme(description: string | null): string | null {
  if (!description || description.trim().length < 40) {
    return null;
  }

  const cleaned = description.trim();

  // Try to extract first meaningful clause (up to comma, dash, or period)
  const firstClause = cleaned.split(/[,\.\-—]/)[0].trim();

  // If first clause is reasonable length, use it
  if (firstClause.length >= 10 && firstClause.length <= 80) {
    return firstClause.toLowerCase();
  }

  // Otherwise, truncate intelligently at word boundary
  if (cleaned.length > 80) {
    const truncated = cleaned.substring(0, 80);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 40) {
      return truncated.substring(0, lastSpace).toLowerCase();
    }
  }

  return cleaned.substring(0, 60).toLowerCase();
}

/**
 * Clean company name (strip legal suffixes).
 */
function cleanCompanyName(name: string): string {
  return name
    .replace(/\s*(LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|Co\.?|Company|PLLC|LP|LLP)\.?\s*$/i, '')
    .trim();
}

// =============================================================================
// TEMPLATE GENERATORS
// =============================================================================

/**
 * Generate T1 (BASIC) intro — No personalization, conservative.
 *
 * Pattern:
 * "I noticed you're a [Title] at [Company].
 * We help companies with [Service].
 * Thought it might be worth an intro."
 */
function generateT1Intro(params: CsvIntroParams): CsvIntroResult {
  const { demand, supply } = params;

  const demandFirstName = getFirstName(demand.fullName);
  const supplyFirstName = getFirstName(supply.fullName);
  const demandCompany = cleanCompanyName(demand.company);
  const supplyCompany = cleanCompanyName(supply.company);
  const demandTitle = demand.title || 'professional';
  const service = getServiceDescription(supply);

  // Demand intro (to the company with the need)
  const demandIntro = `Hey ${demandFirstName} —

I noticed you're a ${demandTitle} at ${demandCompany}.

I know a team at ${supplyCompany} that helps with ${service}.

Thought it might be worth an intro if relevant.`;

  // Supply intro (to the service provider)
  const supplyIntro = `Hey ${supplyFirstName} —

I came across ${demandCompany} — ${demandFirstName} is a ${demandTitle} there.

Given what you do with ${service}, thought it might be a fit.

Worth an intro?`;

  return {
    demandIntro,
    supplyIntro,
    tier: 'T1',
    tierLabel: 'BASIC',
  };
}

/**
 * Generate T2 (STANDARD) intro — Light personalization.
 *
 * Pattern:
 * "I came across your profile while looking into [Company].
 * We help teams with [Service], and this felt potentially relevant."
 */
function generateT2Intro(params: CsvIntroParams): CsvIntroResult {
  const { demand, supply } = params;

  const demandFirstName = getFirstName(demand.fullName);
  const supplyFirstName = getFirstName(supply.fullName);
  const demandCompany = cleanCompanyName(demand.company);
  const supplyCompany = cleanCompanyName(supply.company);
  const demandTitle = demand.title || 'professional';
  const service = getServiceDescription(supply);

  // Demand intro
  const demandIntro = `Hey ${demandFirstName} —

I came across your profile while looking into ${demandCompany}.

I'm connected to ${supplyCompany} — they help teams with ${service}.

This felt potentially relevant. Worth an intro?`;

  // Supply intro
  const supplyIntro = `Hey ${supplyFirstName} —

I came across ${demandFirstName} at ${demandCompany} while researching the space.

They're a ${demandTitle} — given what you do, thought there might be a fit.

Worth a look?`;

  return {
    demandIntro,
    supplyIntro,
    tier: 'T2',
    tierLabel: 'STANDARD',
  };
}

/**
 * Generate T3 (RICH) intro — Uses company description.
 *
 * Pattern:
 * "Seeing what [Company] is doing around [Company Description theme],
 * we often help teams with [Service] in similar situations."
 */
function generateT3Intro(params: CsvIntroParams): CsvIntroResult {
  const { demand, supply } = params;

  const demandFirstName = getFirstName(demand.fullName);
  const supplyFirstName = getFirstName(supply.fullName);
  const demandCompany = cleanCompanyName(demand.company);
  const supplyCompany = cleanCompanyName(supply.company);
  const demandTitle = demand.title || 'professional';
  const service = getServiceDescription(supply);

  // Extract theme from company description
  const theme = extractDescriptionTheme(demand.companyDescription);

  // Demand intro
  let demandIntro: string;
  if (theme) {
    demandIntro = `Hey ${demandFirstName} —

Seeing what ${demandCompany} is doing around ${theme} — I know a team that often helps companies in similar situations.

${supplyCompany} specializes in ${service}.

Worth an intro?`;
  } else {
    // Fallback if theme extraction fails
    demandIntro = `Hey ${demandFirstName} —

I've been looking into ${demandCompany} — came across your profile as ${demandTitle}.

I'm connected to ${supplyCompany} who helps with ${service}. This felt like a fit.

Worth an intro?`;
  }

  // Supply intro
  let supplyIntro: string;
  if (theme) {
    supplyIntro = `Hey ${supplyFirstName} —

${demandCompany} is doing interesting work around ${theme}.

${demandFirstName} is their ${demandTitle} — given what you do with ${service}, thought there might be a fit.

Worth a look?`;
  } else {
    supplyIntro = `Hey ${supplyFirstName} —

I've been researching ${demandCompany} — they're in your wheelhouse.

${demandFirstName} is a ${demandTitle} there. Given what you do, thought it might be worth an intro.

Worth a look?`;
  }

  return {
    demandIntro,
    supplyIntro,
    tier: 'T3',
    tierLabel: 'RICH',
  };
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

/**
 * Generate CSV intro based on signal tier.
 *
 * @param params - { demand, supply, tier }
 * @returns CsvIntroResult with both intros and tier info
 *
 * INVARIANT: Intros are honest and never imply unavailable signals.
 */
export function generateCsvIntro(params: CsvIntroParams): CsvIntroResult {
  const { tier } = params;

  switch (tier) {
    case 'T3':
      return generateT3Intro(params);
    case 'T2':
      return generateT2Intro(params);
    case 'T1':
    default:
      return generateT1Intro(params);
  }
}

/**
 * Generate demand-side intro only.
 */
export function generateCsvDemandIntro(params: CsvIntroParams): string {
  return generateCsvIntro(params).demandIntro;
}

/**
 * Generate supply-side intro only.
 */
export function generateCsvSupplyIntro(params: CsvIntroParams): string {
  return generateCsvIntro(params).supplyIntro;
}
