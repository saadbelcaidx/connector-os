/**
 * MarketsService.ts — Signal-based lead search
 *
 * Thin client calling api.connector-os.com/markets/*
 * Zero provider references. The backend proxies all calls.
 */

import { storeCsvData } from './SignalsClient';
import type { NormalizedRecord, SignalMeta } from '../schemas';
import { simpleHash } from '../enrichment/recordKey';

const API_BASE = import.meta.env.VITE_CONNECTOR_AGENT_API || 'https://api.connector-os.com';

// =============================================================================
// TYPES
// =============================================================================

export interface MarketSearchOptions {
  apiKey: string;
  news?: string[];
  subIndustry?: { include: string[]; exclude: string[] };
  jobListingFilter?: string[];
  title?: { include: string[]; exclude: string[] };
  employeeCount?: { op: string; min: number; max: number }[];
  fundingType?: string[];
  revenue?: string[];
  keywordFilter?: { include: string; exclude: string };
  locations?: { include: { place_id: string; label: string }[] };
  technologies?: string[];
  showOneLeadPerCompany?: boolean;
}

export interface SearchResult {
  records: NormalizedRecord[];
  totalFound: number;
  redactedCount: number;
  dailyRemaining?: number;
  error?: string;
}

interface SearchLead {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  jobTitle?: string;
  linkedIn?: string;
  companyName?: string;
  companyId?: number | string;
  companyLogo?: string;
  location?: string;
}

interface CompanyIntel {
  name?: string;
  description?: string;
  employee_count?: number;
  industries?: Array<{ name: string; id?: number; primary?: boolean }>;
  locations?: Array<{
    address?: string;
    is_primary?: boolean;
    inferred_location?: {
      locality?: string;
      admin_district?: string;
      country_region?: string;
      country_iso?: string;
    };
  }>;
  funding?: Array<{ amount?: string; type?: string; date?: string }>;
  news?: Array<{ title?: string; date?: string; type?: string }>;
  technologies?: Array<{ name?: string; type?: string }>;
  jobs?: Array<{ title?: string; location?: string; date?: string }>;
  keywords?: { linkedIn_Data?: string[]; bright_data?: string[] };
  logo?: string;
}

// =============================================================================
// SEARCH
// =============================================================================

export async function searchMarkets(options: MarketSearchOptions): Promise<SearchResult> {
  try {
    const response = await fetch(`${API_BASE}/markets/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: options.apiKey,
        news: options.news,
        subIndustry: options.subIndustry,
        jobListingFilter: options.jobListingFilter,
        title: options.title,
        employeeCount: options.employeeCount,
        fundingType: options.fundingType,
        revenue: options.revenue,
        keywordFilter: options.keywordFilter,
        locations: options.locations,
        technologies: options.technologies,
        showOneLeadPerCompany: options.showOneLeadPerCompany,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.log(`[Markets] Search failed: ${response.status}`);
      const rawError = err.error || 'Search failed';
      const translatedError = rawError.includes('Daily limit reached')
        ? 'Daily search limit reached (5,000 leads). Resets at midnight UTC.'
        : rawError;
      return { records: [], totalFound: 0, redactedCount: 0, error: translatedError };
    }

    const data = await response.json();
    const leads: SearchLead[] = data.data || [];

    console.log(`[Markets] Found ${leads.length} leads, total=${data.total_count}, redacted=${data.redacted_count}, remaining=${data.daily_remaining}`);

    // Build signal label from filters
    const signalLabel = buildSignalLabel(options);

    // Normalize leads to NormalizedRecord[]
    // Pass first subIndustry as fallback industry (when Leadsy enrichment returns nothing)
    const fallbackIndustry = options.subIndustry?.include?.[0] || null;
    const records = leads.map(lead => normalizeToRecord(lead, null, signalLabel, fallbackIndustry));

    return {
      records,
      totalFound: data.total_count || 0,
      redactedCount: data.redacted_count || 0,
      dailyRemaining: typeof data.daily_remaining === 'number' ? data.daily_remaining : undefined,
    };
  } catch (err: any) {
    console.log(`[Markets] Search error: ${err.message}`);
    return { records: [], totalFound: 0, redactedCount: 0, error: err.message };
  }
}

// =============================================================================
// COMPANY ENRICHMENT (BATCH)
// =============================================================================

export async function enrichCompanies(companyIds: string[]): Promise<Map<string, CompanyIntel>> {
  const result = new Map<string, CompanyIntel>();
  if (companyIds.length === 0) return result;

  try {
    const response = await fetch(`${API_BASE}/markets/enrich-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyIds }),
    });

    if (!response.ok) {
      console.log(`[Markets] Batch enrich failed: ${response.status}`);
      return result;
    }

    const data = await response.json();
    const companies = data.companies || {};

    for (const [id, company] of Object.entries(companies)) {
      if (company) {
        result.set(String(id), company as CompanyIntel);
      }
    }

    console.log(`[Markets] Enriched ${result.size}/${companyIds.length} companies`);
  } catch (err: any) {
    console.log(`[Markets] Batch enrich error: ${err.message}`);
  }

  return result;
}

// =============================================================================
// NORMALIZATION
// =============================================================================

function buildSignalLabel(options: MarketSearchOptions): string {
  const parts: string[] = [];

  if (options.news?.length) {
    const signalNames: Record<string, string> = {
      hires: 'Hiring',
      receives_financing: 'Funding',
      launches: 'Launch',
      partners_with: 'Partnership',
      acquires: 'Acquisition',
      expands_offices_to: 'Expanding',
      goes_public: 'IPO',
      signs_new_client: 'New client',
      opens_new_location: 'New location',
    };
    parts.push(...options.news.map(f => signalNames[f] || f.replace(/_/g, ' ')));
  }

  if (options.jobListingFilter?.length) {
    parts.push(options.jobListingFilter.join(', '));
  }

  return parts.join(' — ') || 'Market signal';
}

function parseLocation(locationStr?: string): { city: string | null; state: string | null; country: string | null } {
  if (!locationStr) return { city: null, state: null, country: null };
  const parts = locationStr.split(',').map(p => p.trim());
  return {
    city: parts[0] || null,
    state: parts[1] || null,
    country: parts[2] || null,
  };
}

export function normalizeToRecord(
  lead: SearchLead,
  company: CompanyIntel | null,
  signalLabel: string,
  searchIndustry?: string | null
): NormalizedRecord {
  const firstName = lead.firstName || '';
  const lastName = lead.lastName || '';
  const fullName = lead.fullName || `${firstName} ${lastName}`.trim();
  const companyName = lead.companyName || company?.name || '';
  const location = parseLocation(lead.location);

  // Company intel — extract everything available
  const primaryIndustry = company?.industries?.[0]?.name || null;
  const allIndustries = company?.industries?.map(i => i.name).filter(Boolean) || [];
  const description = company?.description || null;
  const descriptionTrimmed = description ? description.slice(0, 200) : null;
  const funding = company?.funding?.[0]?.amount
    ? `${company.funding[0].amount} ${company.funding[0].type || ''}`.trim()
    : null;

  // Industry: never null if we have ANY data
  // Priority: enrichment industry → search filter industry → null
  const industry = primaryIndustry
    || (allIndustries.length > 0 ? allIndustries[0] : null)
    || searchIndustry
    || null;

  // Evidence fallback chain — priority order:
  // 1. news[0].title (real headline from Leadsy enrichment)
  // 2. jobs[0].title ("Hiring — <job title>")
  // 3. funding[0] ("Raised <amount> <type>")
  // 4. industry ("Growing in <industry>")
  // 5. signalLabel (last resort: "Hiring")
  let evidence: string = signalLabel;
  if (company?.news && company.news.length > 0 && company.news[0].title) {
    evidence = company.news[0].title;
  } else if (company?.jobs && company.jobs.length > 0 && company.jobs[0].title) {
    evidence = `Hiring — ${company.jobs[0].title}`;
  } else if (company?.funding && company.funding.length > 0 && company.funding[0].amount) {
    const f = company.funding[0];
    evidence = `Raised ${f.amount}${f.type ? ` ${f.type}` : ''}`;
  } else if (industry) {
    evidence = `Growing in ${industry}`;
  }

  // Signal meta — label carries evidence (buildWhy reads this for GROWTH kind)
  const signalMeta: SignalMeta = {
    kind: 'GROWTH',
    label: evidence,
    source: 'Market Intelligence',
  };

  // Headline: first sentence of description (supply capability signal)
  const headline = description
    ? description.split(/[.\n]/)[0].trim().slice(0, 120) || null
    : null;

  // Record key
  const disambiguator = simpleHash(JSON.stringify({
    n: fullName, c: companyName, t: lead.jobTitle, cid: lead.companyId,
  }));
  const recordKey = `market:${companyName}:${fullName}:${disambiguator}`.toLowerCase().replace(/\s+/g, '_');

  // Raw: lead (tiny, needed for company enrichment) + keys Flow reads
  // Do NOT store full company object — it bloats localStorage and causes QuotaExceededError
  const raw: Record<string, any> = {
    lead,  // Tiny: firstName, lastName, companyId, jobTitle, linkedIn
    // Keys Flow reads for intro metadata + regression guards
    company_description: descriptionTrimmed,
    description: descriptionTrimmed,
    capability: descriptionTrimmed,
    services: descriptionTrimmed,
  };

  // Funding metadata at keys Flow checks
  if (company?.funding?.[0]) {
    const f = company.funding[0];
    raw.last_funding_type = f.type || null;
    raw.last_funding_at = f.date || null;
  }
  if (company?.employee_count) {
    raw.num_employees_enum = String(company.employee_count);
  }

  return {
    recordKey,

    // Contact
    firstName,
    lastName,
    fullName,
    email: null, // Flow enriches via Apollo/Anymail
    emailSource: 'csv' as const,
    emailVerified: false,
    verifiedBy: null,
    verifiedAt: null,
    title: lead.jobTitle || '',
    linkedin: lead.linkedIn || null,
    headline,
    seniorityLevel: null,

    // Company — domain is null; Flow enriches by company name
    company: companyName,
    domain: null,
    domainSource: 'none',
    industry,
    size: company?.employee_count ? String(company.employee_count) : null,
    companyDescription: descriptionTrimmed,
    companyFunding: funding,
    companyRevenue: null,
    companyFoundedYear: null,
    companyLinkedin: null,

    // Signal — signal is stable label, signalDetail is evidence
    signalMeta,
    signal: signalLabel,
    signalDetail: evidence,

    // Location
    city: location.city || (company?.locations?.[0]?.inferred_location?.locality || null),
    state: location.state || (company?.locations?.[0]?.inferred_location?.admin_district || null),
    country: location.country || (company?.locations?.[0]?.inferred_location?.country_region || null),

    // Meta
    schemaId: 'csv',
    raw,
  };
}

// =============================================================================
// CONVENIENCE: Store results as demand data
// =============================================================================

export function storeAsdemand(records: NormalizedRecord[]): void {
  if (records.length > 0) {
    storeCsvData('demand', records);
    console.log(`[Markets] Stored ${records.length} records as demand`);
  }
}

// =============================================================================
// SUPPLY QUALITY GATE
// =============================================================================

/**
 * Provider capability patterns — companies that DO things for others.
 * Consulting, staffing, agencies, advisory, implementation, etc.
 */
const PROVIDER_PATTERNS = [
  /\bconsult/i,
  /\bagency\b/i,
  /\bagencies\b/i,
  /\bservices?\b/i,
  /\brecruit/i,
  /\bstaffing\b/i,
  /\boutsourc/i,
  /\bsolutions?\s+provider/i,
  /\bsystems?\s+integrat/i,
  /\badvisor/i,
  /\bmanaged\s+services/i,
  /\bimplementation/i,
  /\bsupport\s+services/i,
  /\bvendor\b/i,
  /\bpartner\b/i,
  /\bplacement/i,
  /\btalent\s+(acquisition|search|sourcing)/i,
  /\bexecutive\s+search/i,
  /\bprofessional\s+services/i,
  /\bbpo\b/i,
  /\bfirm\b/i,
];

/**
 * Anti-patterns — companies that BUILD products, not provide services.
 * These look like demand (hiring for themselves), not supply.
 */
const PRODUCT_PATTERNS = [
  /\bplatform\b/i,
  /\bsaas\b/i,
  /\bsoftware\s+company/i,
  /\bmanufactur/i,
  /\bconsumer\s+brand/i,
  /\be-?commerce\s+(company|brand|retailer)/i,
  /\bdevelops?\s+(software|apps?|products?)/i,
  /\bbuilds?\s+(software|apps?|products?)/i,
];

/**
 * Determine if a record looks like a service provider (supply-worthy).
 * Checks companyDescription, headline, and industry.
 */
function isServiceProvider(record: NormalizedRecord): boolean {
  const text = [
    record.companyDescription || '',
    record.headline || '',
    record.industry || '',
    record.raw?.description || '',
  ].join(' ');

  // No description at all — can't confirm provider capability, drop
  if (text.trim().length < 10) return false;

  // Check for anti-patterns first — strong signal of product company
  const hasProductSignal = PRODUCT_PATTERNS.some(p => p.test(text));

  // Check for provider patterns
  const hasProviderSignal = PROVIDER_PATTERNS.some(p => p.test(text));

  // Provider signal wins unless product signal is also present
  if (hasProviderSignal && !hasProductSignal) return true;

  // Both present — provider signal still wins (many service companies mention platforms)
  if (hasProviderSignal && hasProductSignal) return true;

  // Product signal only — drop
  if (hasProductSignal) return false;

  // No signal either way — drop (can't confirm provider capability)
  return false;
}

/**
 * Store records as supply — only keeps companies with provider capability.
 * Returns the number of records that passed the filter.
 */
export function storeAsSupply(records: NormalizedRecord[]): number {
  if (records.length === 0) return 0;

  const qualified = records.filter(isServiceProvider);
  const dropped = records.length - qualified.length;

  if (qualified.length > 0) {
    storeCsvData('supply', qualified);
  }

  localStorage.setItem('supply_gate_stats', JSON.stringify({ kept: qualified.length, filtered: dropped, total: records.length }));
  console.log(`[Markets] Supply gate: ${qualified.length} providers kept, ${dropped} non-providers filtered out of ${records.length}`);
  return qualified.length;
}
