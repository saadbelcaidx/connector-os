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
  newsFilter?: string[];
  industryFilter?: string[];
  jobListingFilter?: string[];
  fundingFilter?: string[];
  revenueFilter?: string[];
  showOneLeadPerCompany?: boolean;
}

export interface SearchResult {
  records: NormalizedRecord[];
  totalFound: number;
  redactedCount: number;
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
  domain?: string;
  website?: string;
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
        newsFilter: options.newsFilter,
        industryFilter: options.industryFilter,
        jobListingFilter: options.jobListingFilter,
        fundingFilter: options.fundingFilter,
        revenueFilter: options.revenueFilter,
        showOneLeadPerCompany: options.showOneLeadPerCompany,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.log(`[Markets] Search failed: ${response.status}`);
      return { records: [], totalFound: 0, redactedCount: 0, error: err.error || 'Search failed' };
    }

    const data = await response.json();
    const leads: SearchLead[] = data.data || [];

    console.log(`[Markets] Found ${leads.length} leads, total=${data.total_count}, redacted=${data.redacted_count}`);

    // Build signal label from filters
    const signalLabel = buildSignalLabel(options);

    // Normalize leads to NormalizedRecord[]
    const records = leads.map(lead => normalizeToRecord(lead, null, signalLabel));

    return {
      records,
      totalFound: data.total_count || 0,
      redactedCount: data.redacted_count || 0,
    };
  } catch (err: any) {
    console.log(`[Markets] Search error: ${err.message}`);
    return { records: [], totalFound: 0, redactedCount: 0, error: err.message };
  }
}

// =============================================================================
// COMPANY ENRICHMENT (BATCH)
// =============================================================================

export async function enrichCompanies(companyIds: number[]): Promise<Map<number, CompanyIntel>> {
  const result = new Map<number, CompanyIntel>();
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
        result.set(Number(id), company as CompanyIntel);
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

  if (options.newsFilter?.length) {
    const signalNames: Record<string, string> = {
      hires: 'Hiring',
      receives_financing: 'Funding raised',
      increases_headcount_by: 'Headcount growth',
      launches: 'Product launch',
      partners_with: 'New partnership',
      acquires: 'Acquisition',
    };
    parts.push(...options.newsFilter.map(f => signalNames[f] || f));
  }

  if (options.jobListingFilter?.length) {
    parts.push(options.jobListingFilter.join(', '));
  }

  return parts.join(' — ') || 'Market signal';
}

function extractDomain(company: CompanyIntel | null): string {
  if (!company) return '';
  if (company.domain) return company.domain.replace(/^www\./, '');
  if (company.website) {
    return company.website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
  return '';
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
  signalLabel: string
): NormalizedRecord {
  const firstName = lead.firstName || '';
  const lastName = lead.lastName || '';
  const fullName = lead.fullName || `${firstName} ${lastName}`.trim();
  const companyName = lead.companyName || company?.name || '';
  const domain = extractDomain(company);
  const location = parseLocation(lead.location);

  // Company intel extras
  const industry = company?.industries?.[0]?.name || null;
  const description = company?.description ? company.description.slice(0, 200) : null;
  const funding = company?.funding?.[0]?.amount
    ? `${company.funding[0].amount} ${company.funding[0].type || ''}`.trim()
    : null;

  // Signal meta
  const signalMeta: SignalMeta = {
    kind: 'GROWTH',
    label: signalLabel,
    source: 'Market Intelligence',
  };

  // Record key
  const disambiguator = simpleHash(JSON.stringify({
    n: fullName, c: companyName, t: lead.jobTitle, cid: lead.companyId,
  }));
  const recordKey = `market:${companyName}:${fullName}:${disambiguator}`.toLowerCase().replace(/\s+/g, '_');

  return {
    recordKey,

    // Contact
    firstName,
    lastName,
    fullName,
    email: null, // Preview doesn't include emails — enrichment finds them
    emailSource: 'csv' as const,
    emailVerified: false,
    verifiedBy: null,
    verifiedAt: null,
    title: lead.jobTitle || '',
    linkedin: lead.linkedIn || null,
    headline: null,
    seniorityLevel: null,

    // Company
    company: companyName,
    domain,
    domainSource: domain ? 'explicit' : 'none',
    industry,
    size: company?.employee_count ? String(company.employee_count) : null,
    companyDescription: description,
    companyFunding: funding,
    companyRevenue: null,
    companyFoundedYear: null,
    companyLinkedin: null,

    // Signal
    signalMeta,
    signal: signalLabel,
    signalDetail: signalLabel,

    // Location
    city: location.city || (company?.locations?.[0]?.inferred_location?.locality || null),
    state: location.state || (company?.locations?.[0]?.inferred_location?.admin_district || null),
    country: location.country || (company?.locations?.[0]?.inferred_location?.country_region || null),

    // Meta
    schemaId: 'csv',
    raw: { lead, company },
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
