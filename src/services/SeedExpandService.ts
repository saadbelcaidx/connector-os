/**
 * SEED EXPAND SERVICE
 *
 * Input: LinkedIn URL (founder/company)
 * Output: NormalizedRecord[] (same shape as Apify datasets)
 *
 * This is an INPUT PRODUCER only. It does NOT modify Flow.
 * Flow receives companies and proceeds unchanged.
 *
 * Pipeline: Seed URL → Enrich → Expand → Filter → Score → NormalizedRecord[]
 */

import type { NormalizedRecord } from '../schemas';

// =============================================================================
// TYPES
// =============================================================================

export interface SeedExpandConfig {
  apolloApiKey: string;
}

export interface SeedInput {
  linkedinUrl?: string;
  companyDomain?: string;
  companyName?: string;
}

export interface ExpandedCompany {
  domain: string;
  name: string;
  industry: string | null;
  size: string | null;
  funding: string | null;
  foundedYear: string | null;
  description: string | null;
  // Scoring factors
  fundingStage: string | null;
  employeeCount: number | null;
}

export interface SeedExpandResult {
  success: boolean;
  seed: ExpandedCompany | null;
  expanded: NormalizedRecord[];
  error?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const APOLLO_PROXY_URL = `${SUPABASE_URL}/functions/v1/apollo-enrichment`;

// Funding stages we want (Series A/B territory)
const TARGET_FUNDING_STAGES = [
  'series_a',
  'series_b',
  'series_c',
  'seed',
  'series_unknown',
];

// Exclude these (too early or too late)
const EXCLUDED_FUNDING_STAGES = [
  'pre_seed',
  'angel',
  'public',
  'acquired',
  'ipo',
];

// Employee count ranges for similar companies
const MIN_EMPLOYEES = 10;
const MAX_EMPLOYEES = 1000;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Extract domain from LinkedIn URL
 * linkedin.com/company/medra-inc → medra-inc
 * linkedin.com/in/michelle-lee → need company lookup
 */
function extractFromLinkedIn(url: string): { type: 'company' | 'person'; slug: string } | null {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const path = parsed.pathname;

    // Company page: /company/slug
    const companyMatch = path.match(/\/company\/([^\/]+)/);
    if (companyMatch) {
      return { type: 'company', slug: companyMatch[1] };
    }

    // Person page: /in/slug
    const personMatch = path.match(/\/in\/([^\/]+)/);
    if (personMatch) {
      return { type: 'person', slug: personMatch[1] };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Clean domain string
 */
function cleanDomain(input: string | undefined | null): string {
  if (!input) return '';
  return input
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
    .trim()
    .toLowerCase();
}

/**
 * Normalize employee count to string range
 */
function normalizeSize(count: number | string | null): string | null {
  if (!count) return null;

  const num = typeof count === 'number' ? count : parseInt(String(count), 10);
  if (isNaN(num)) return null;

  if (num < 11) return '1-10';
  if (num < 51) return '11-50';
  if (num < 201) return '51-200';
  if (num < 501) return '201-500';
  return '500+';
}

/**
 * Extract funding stage from various Apollo funding formats
 */
function extractFundingStage(org: any): string | null {
  // Check various Apollo funding fields
  const funding = org.funding_stage || org.latest_funding_stage || org.current_funding_stage;
  if (funding) return funding.toLowerCase();

  // Infer from funding amount if available
  const amount = org.total_funding || org.estimated_annual_revenue;
  if (amount) {
    const numericAmount = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/[^0-9.]/g, ''));
    if (!isNaN(numericAmount)) {
      if (numericAmount < 1000000) return 'seed';
      if (numericAmount < 10000000) return 'series_a';
      if (numericAmount < 50000000) return 'series_b';
      return 'series_c';
    }
  }

  return null;
}

/**
 * Check if funding stage is in our target range
 */
function isTargetFundingStage(stage: string | null): boolean {
  if (!stage) return true; // Unknown = include (will score lower)
  const normalized = stage.toLowerCase().replace(/\s+/g, '_');
  return TARGET_FUNDING_STAGES.some(t => normalized.includes(t)) &&
         !EXCLUDED_FUNDING_STAGES.some(t => normalized.includes(t));
}

/**
 * Score a company (0-100)
 * Higher = more valuable target
 */
function scoreCompany(company: ExpandedCompany): number {
  let score = 50; // Base score

  // Capital recency (funding stage)
  const stage = company.fundingStage?.toLowerCase() || '';
  if (stage.includes('series_a')) score += 25;
  else if (stage.includes('series_b')) score += 30;
  else if (stage.includes('series_c')) score += 20;
  else if (stage.includes('seed')) score += 15;

  // Company size (sweet spot: 20-200)
  const employees = company.employeeCount || 0;
  if (employees >= 20 && employees <= 200) score += 20;
  else if (employees >= 10 && employees <= 500) score += 10;

  // Has description (signal of legitimacy)
  if (company.description) score += 5;

  // Cap at 100
  return Math.min(100, Math.max(0, score));
}

// =============================================================================
// APOLLO API CALLS
// =============================================================================

/**
 * Discover a company via LinkedIn URL using Apollo's mixed_companies/search
 * This is DISCOVERY only - not enrichment. Uses fuzzy matching like Apollo UI.
 */
async function discoverCompanyByLinkedIn(linkedinUrl: string, config: SeedExpandConfig): Promise<ExpandedCompany | null> {
  try {
    // Extract company name from LinkedIn URL slug
    // e.g., https://www.linkedin.com/company/medra-ai/ -> "medra ai"
    const companyMatch = linkedinUrl.match(/\/company\/([^\/]+)/);
    if (!companyMatch) {
      console.error('[SeedExpand] Invalid LinkedIn company URL format:', linkedinUrl);
      return null;
    }
    const companySlug = companyMatch[1].replace(/-/g, ' ');
    console.log('[SeedExpand] Discovering company via mixed_companies_search:', companySlug);

    const response = await fetch(APOLLO_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'mixed_companies_search',
        apiKey: config.apolloApiKey,
        q: companySlug,
        page: 1,
        per_page: 5,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[SeedExpand] mixed_companies_search failed:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    const accounts = data.accounts || [];

    if (accounts.length === 0) {
      console.log('[SeedExpand] No company found for:', companySlug);
      return null;
    }

    // Take top result (best match)
    const org = accounts[0];
    console.log('[SeedExpand] Discovered company:', org.name, org.domain);

    return {
      domain: cleanDomain(org.domain || org.website_url || ''),
      name: org.name || 'Unknown',
      industry: org.industry || null,
      size: normalizeSize(org.estimated_num_employees),
      funding: org.total_funding_printed || org.total_funding || null,
      foundedYear: org.founded_year ? String(org.founded_year) : null,
      description: org.short_description || org.description || null,
      fundingStage: extractFundingStage(org),
      employeeCount: org.estimated_num_employees || null,
    };
  } catch (err) {
    console.error('[SeedExpand] discoverCompanyByLinkedIn error:', err);
    return null;
  }
}

/**
 * Enrich a single company domain via Apollo
 */
async function enrichCompany(domain: string, config: SeedExpandConfig): Promise<ExpandedCompany | null> {
  try {
    const response = await fetch(APOLLO_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'org_enrich',
        apiKey: config.apolloApiKey,
        domain: cleanDomain(domain),
      }),
    });

    if (!response.ok) {
      console.error('[SeedExpand] org_enrich failed:', response.status);
      return null;
    }

    const data = await response.json();
    const org = data.organization;

    if (!org) {
      console.log('[SeedExpand] No organization found for domain:', domain);
      return null;
    }

    return {
      domain: cleanDomain(org.primary_domain || org.website_url || domain),
      name: org.name || 'Unknown',
      industry: org.industry || null,
      size: normalizeSize(org.estimated_num_employees),
      funding: org.total_funding_printed || org.total_funding || null,
      foundedYear: org.founded_year ? String(org.founded_year) : null,
      description: org.short_description || org.description || null,
      fundingStage: extractFundingStage(org),
      employeeCount: org.estimated_num_employees || null,
    };
  } catch (err) {
    console.error('[SeedExpand] enrichCompany error:', err);
    return null;
  }
}

/**
 * Search for similar companies via Apollo mixed_companies/search
 * Best-effort only - failure does not block the run
 */
async function searchSimilarCompanies(
  seed: ExpandedCompany,
  config: SeedExpandConfig,
  limit: number = 15
): Promise<ExpandedCompany[]> {
  try {
    // Use industry as search query (simpler, more forgiving)
    // mixed_companies/search accepts fuzzy text queries
    const searchQuery = seed.industry || seed.name || '';
    if (!searchQuery) {
      console.warn('[SeedExpand] No search query available for expansion');
      return [];
    }

    console.log('[SeedExpand] Searching similar companies with query:', searchQuery);

    const response = await fetch(APOLLO_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'mixed_companies_search',
        apiKey: config.apolloApiKey,
        q: searchQuery,
        page: 1,
        per_page: Math.min(limit * 2, 25),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn('[SeedExpand] Expansion search failed (non-blocking):', response.status, errText);
      return [];
    }

    const data = await response.json();
    const accounts = data.accounts || [];

    console.log(`[SeedExpand] Found ${accounts.length} potential similar companies`);

    // Transform to ExpandedCompany, excluding seed
    const expanded: ExpandedCompany[] = accounts
      .filter((org: any) => {
        const orgDomain = cleanDomain(org.domain || org.website_url || '');
        return orgDomain && orgDomain !== seed.domain; // Exclude seed
      })
      .map((org: any) => ({
        domain: cleanDomain(org.domain || org.website_url || ''),
        name: org.name || 'Unknown',
        industry: org.industry || null,
        size: normalizeSize(org.estimated_num_employees),
        funding: org.total_funding_printed || org.total_funding || null,
        foundedYear: org.founded_year ? String(org.founded_year) : null,
        description: org.short_description || org.description || null,
        fundingStage: extractFundingStage(org),
        employeeCount: org.estimated_num_employees || null,
      }));

    // Filter: must have domain, in target funding range
    return expanded
      .filter(c => c.domain && c.domain.length > 0)
      .filter(c => isTargetFundingStage(c.fundingStage))
      .slice(0, limit);

  } catch (err) {
    console.warn('[SeedExpand] Expansion search error (non-blocking):', err);
    return [];
  }
}

// =============================================================================
// TRANSFORM TO NORMALIZED RECORD
// =============================================================================

/**
 * Transform ExpandedCompany → NormalizedRecord
 * This MUST match the exact shape Flow expects
 */
function toNormalizedRecord(company: ExpandedCompany, score: number): NormalizedRecord {
  return {
    // Contact - empty, needs enrichment later
    firstName: '',
    lastName: '',
    fullName: '',
    email: null,
    title: '',
    linkedin: null,
    headline: null,
    seniorityLevel: null,

    // Company
    company: company.name,
    domain: company.domain,
    industry: company.industry,
    size: company.size,
    companyDescription: company.description,
    companyFunding: company.funding,
    companyRevenue: null,
    companyFoundedYear: company.foundedYear,
    companyLinkedin: null,

    // Signal - capital event indicator
    signal: company.fundingStage
      ? `${company.fundingStage.replace(/_/g, ' ')} company`
      : 'showing momentum',
    signalDetail: null,

    // Location - not available from org_search
    city: null,
    state: null,
    country: null,

    // Meta
    schemaId: 'seed-expand',
    raw: {
      ...company,
      _seedExpandScore: score,
      _source: 'seed-expand',
    },
  };
}

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

/**
 * Expand from a seed input to a list of similar companies
 *
 * @param input - LinkedIn URL, company domain, or company name
 * @param config - Apollo API key
 * @returns NormalizedRecord[] ready for Flow
 */
export async function expandFromSeed(
  input: SeedInput,
  config: SeedExpandConfig
): Promise<SeedExpandResult> {
  console.log('[SeedExpand] Starting expansion from:', input);

  // Validate config
  if (!config.apolloApiKey) {
    return {
      success: false,
      seed: null,
      expanded: [],
      error: 'Apollo API key required',
    };
  }

  // Step 1: Determine seed domain/company
  let seedDomain: string | null = null;
  let seedCompanyName: string | null = null;
  let linkedinCompanyUrl: string | null = null;

  if (input.linkedinUrl) {
    const parsed = extractFromLinkedIn(input.linkedinUrl);
    if (parsed?.type === 'company') {
      // Store full LinkedIn URL for direct Apollo lookup
      linkedinCompanyUrl = input.linkedinUrl.trim();
      // Also extract name as fallback
      seedCompanyName = parsed.slug.replace(/-/g, ' ');
      console.log('[SeedExpand] Detected LinkedIn company URL:', linkedinCompanyUrl);
    } else if (parsed?.type === 'person') {
      // Person URL - would need people lookup, for now require domain
      return {
        success: false,
        seed: null,
        expanded: [],
        error: 'Person LinkedIn URLs not yet supported. Please provide company LinkedIn URL or domain.',
      };
    }
  }

  if (input.companyDomain) {
    seedDomain = cleanDomain(input.companyDomain);
  }

  if (input.companyName) {
    seedCompanyName = input.companyName;
  }

  if (!seedDomain && !seedCompanyName && !linkedinCompanyUrl) {
    return {
      success: false,
      seed: null,
      expanded: [],
      error: 'Could not extract company from input. Provide a company LinkedIn URL or domain.',
    };
  }

  // Step 2: Enrich seed company
  let seed: ExpandedCompany | null = null;

  // Priority 1: LinkedIn company URL (discovery via mixed_companies_search)
  if (linkedinCompanyUrl) {
    console.log('[SeedExpand] Discovering company via LinkedIn URL...');
    seed = await discoverCompanyByLinkedIn(linkedinCompanyUrl, config);
  }

  // Priority 2: Domain lookup
  if (!seed && seedDomain) {
    console.log('[SeedExpand] Trying domain enrichment...');
    seed = await enrichCompany(seedDomain, config);
  }

  // Priority 3: Name search fallback (if we have a name from LinkedIn slug)
  if (!seed && seedCompanyName) {
    console.log('[SeedExpand] LinkedIn/domain enrichment failed, trying name search:', seedCompanyName);
    // For now, we need a domain - future: add org name search
    return {
      success: false,
      seed: null,
      expanded: [],
      error: `Could not find company "${seedCompanyName}". Try providing the company domain directly.`,
    };
  }

  if (!seed) {
    return {
      success: false,
      seed: null,
      expanded: [],
      error: 'Could not enrich seed company. Check the domain or try another company.',
    };
  }

  console.log('[SeedExpand] Seed enriched:', seed.name, seed.industry, seed.fundingStage);

  // Step 3: Find similar companies (best-effort, non-blocking)
  const similar = await searchSimilarCompanies(seed, config, 15);

  // Build result list: seed + similar companies
  const allCompanies: ExpandedCompany[] = [seed, ...similar];

  console.log(`[SeedExpand] Found ${similar.length} similar companies, total: ${allCompanies.length}`);

  // Step 4: Score and sort
  const scored = allCompanies.map(c => ({
    company: c,
    score: scoreCompany(c),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Step 5: Transform to NormalizedRecord
  const normalized = scored.map(({ company, score }) =>
    toNormalizedRecord(company, score)
  );

  console.log(`[SeedExpand] Returning ${normalized.length} NormalizedRecords (seed + ${similar.length} similar)`);

  return {
    success: true,
    seed,
    expanded: normalized,
  };
}

// =============================================================================
// STORAGE (localStorage - same pattern as Hub)
// =============================================================================

const SEED_EXPAND_DEMAND_KEY = 'seed_expand_demand';
const SEED_EXPAND_SUPPLY_KEY = 'seed_expand_supply';

/**
 * Store expanded companies for demand side
 */
export function storeSeedExpandDemand(records: NormalizedRecord[]): void {
  localStorage.setItem(SEED_EXPAND_DEMAND_KEY, JSON.stringify(records));
  console.log(`[SeedExpand] Stored ${records.length} demand records`);
}

/**
 * Store expanded companies for supply side
 */
export function storeSeedExpandSupply(records: NormalizedRecord[]): void {
  localStorage.setItem(SEED_EXPAND_SUPPLY_KEY, JSON.stringify(records));
  console.log(`[SeedExpand] Stored ${records.length} supply records`);
}

/**
 * Get stored demand records
 */
export function getSeedExpandDemand(): NormalizedRecord[] {
  const stored = localStorage.getItem(SEED_EXPAND_DEMAND_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Get stored supply records
 */
export function getSeedExpandSupply(): NormalizedRecord[] {
  const stored = localStorage.getItem(SEED_EXPAND_SUPPLY_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Check if seed expand has data ready
 */
export function hasSeedExpandData(): boolean {
  return getSeedExpandDemand().length > 0 || getSeedExpandSupply().length > 0;
}

/**
 * Clear seed expand storage
 */
export function clearSeedExpandData(): void {
  localStorage.removeItem(SEED_EXPAND_DEMAND_KEY);
  localStorage.removeItem(SEED_EXPAND_SUPPLY_KEY);
  console.log('[SeedExpand] Cleared storage');
}

/**
 * Check if coming from seed expand source
 */
export function isFromSeedExpand(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('source') === 'seed-expand';
}
