/**
 * PUBLIC DATABASE CLIENT — ClinicalTrials.gov + FDA
 *
 * Fetches demand signals from public government databases.
 * Maps to NormalizedRecord for Flow integration.
 *
 * ROUTING RULE (per user.txt):
 * - IF email exists in record → SKIP enrichment → Use native email
 * - IF email missing → Route to enrichment → Use domain inference as hint
 *
 * Sources:
 * 1. ClinicalTrials.gov — 93% have native emails, RECRUITING status = active demand
 * 2. FDA Drug Approvals — 0% have emails, APPROVAL = milestone signal, requires enrichment
 */

import { NormalizedRecord } from '../schemas';

const SUPABASE_URL = 'https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1';

// =============================================================================
// TYPES
// =============================================================================

export interface ClinicalTrialStudy {
  protocolSection: {
    identificationModule?: {
      nctId?: string;
      briefTitle?: string;
      officialTitle?: string;
    };
    statusModule?: {
      overallStatus?: string;
      startDateStruct?: { date?: string };
    };
    sponsorCollaboratorsModule?: {
      leadSponsor?: {
        name?: string;
        class?: string; // INDUSTRY, NIH, OTHER, etc.
      };
    };
    contactsLocationsModule?: {
      centralContacts?: Array<{
        name?: string;
        email?: string;
        phone?: string;
        role?: string;
      }>;
      overallOfficials?: Array<{
        name?: string;
        affiliation?: string;
        role?: string;
      }>;
    };
    conditionsModule?: {
      conditions?: string[];
    };
  };
}

export interface FDADrugApproval {
  sponsor_name?: string;
  application_number?: string;
  openfda?: {
    manufacturer_name?: string[];
    brand_name?: string[];
    generic_name?: string[];
  };
  submissions?: Array<{
    submission_type?: string;
    submission_status?: string;
    submission_status_date?: string;
  }>;
  products?: Array<{
    brand_name?: string;
    active_ingredients?: Array<{
      name?: string;
    }>;
  }>;
}

export interface PublicDatabaseResult {
  source: 'clinicaltrials' | 'fda';
  records: NormalizedRecord[];
  total: number;
  nextPageToken?: string;
  hasMore: boolean;
}

// =============================================================================
// DOMAIN INFERENCE — Extract domain from email or company name
// =============================================================================

const PHARMA_DOMAIN_MAP: Record<string, string> = {
  'astrazeneca': 'astrazeneca.com',
  'novartis': 'novartis.com',
  'pfizer': 'pfizer.com',
  'roche': 'roche.com',
  'merck': 'merck.com',
  'johnson & johnson': 'jnj.com',
  'j&j': 'jnj.com',
  'abbvie': 'abbvie.com',
  'bristol-myers squibb': 'bms.com',
  'bms': 'bms.com',
  'eli lilly': 'lilly.com',
  'lilly': 'lilly.com',
  'sanofi': 'sanofi.com',
  'gsk': 'gsk.com',
  'glaxosmithkline': 'gsk.com',
  'amgen': 'amgen.com',
  'gilead': 'gilead.com',
  'regeneron': 'regeneron.com',
  'biogen': 'biogen.com',
  'vertex': 'vrtx.com',
  'moderna': 'modernatx.com',
  'biontech': 'biontech.com',
  'takeda': 'takeda.com',
  'boehringer ingelheim': 'boehringer-ingelheim.com',
  'teva': 'teva.com',
  'allergan': 'allergan.com',
  'celgene': 'celgene.com',
  'alexion': 'alexion.com',
  'incyte': 'incyte.com',
  'jazz': 'jazzpharma.com',
  'biomarin': 'biomarin.com',
  'alkermes': 'alkermes.com',
  'united therapeutics': 'unither.com',
  'exact sciences': 'exactsciences.com',
  'seagen': 'seagen.com',
  'seattle genetics': 'seagen.com',
};

/**
 * Extract domain from email address.
 */
function domainFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const match = email.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Infer domain from company name for known pharma companies.
 */
function inferDomainFromCompany(company: string | null | undefined): string | null {
  if (!company) return null;
  const normalized = company.toLowerCase().trim();

  // Direct lookup
  for (const [key, domain] of Object.entries(PHARMA_DOMAIN_MAP)) {
    if (normalized.includes(key)) {
      return domain;
    }
  }

  // University pattern: "University of X" → x.edu (simplified)
  const uniMatch = normalized.match(/university of (\w+)/);
  if (uniMatch) {
    return `${uniMatch[1]}.edu`;
  }

  return null;
}

/**
 * Check if email is from a generic provider (gmail, hotmail, etc.)
 */
function isGenericEmailProvider(email: string | null | undefined): boolean {
  if (!email) return false;
  const domain = domainFromEmail(email);
  if (!domain) return false;
  const generic = ['gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com', '163.com', 'qq.com', 'icloud.com', 'aol.com'];
  return generic.includes(domain);
}

// =============================================================================
// CLINICALTRIALS.GOV CLIENT
// =============================================================================

/**
 * Fetch clinical trials from ClinicalTrials.gov via proxy.
 *
 * @param status Filter by status (RECRUITING, COMPLETED, etc.)
 * @param pageSize Number of results per page (max 1000)
 * @param pageToken Token for next page (from previous response)
 */
export async function fetchClinicalTrials(options: {
  status?: string;
  condition?: string;
  pageSize?: number;
  pageToken?: string;
}): Promise<PublicDatabaseResult> {
  const { status = 'RECRUITING', condition, pageSize = 100, pageToken } = options;

  const body: Record<string, unknown> = {
    pageSize,
    'filter.overallStatus': status,
  };
  if (condition) body['query.cond'] = condition;
  if (pageToken) body.pageToken = pageToken;

  const response = await fetch(`${SUPABASE_URL}/clinicaltrials-proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`ClinicalTrials API error: ${error.error || response.status}`);
  }

  const data = await response.json();
  const studies: ClinicalTrialStudy[] = data.studies || [];

  // Map to NormalizedRecord
  const records: NormalizedRecord[] = studies.map(study => {
    const protocol = study.protocolSection || {};
    const id = protocol.identificationModule;
    const statusModule = protocol.statusModule;
    const sponsor = protocol.sponsorCollaboratorsModule?.leadSponsor;
    const contacts = protocol.contactsLocationsModule?.centralContacts || [];
    const conditions = protocol.conditionsModule?.conditions || [];

    // Get first contact with email
    const primaryContact = contacts.find(c => c.email) || contacts[0];
    const email = primaryContact?.email || null;
    const contactName = primaryContact?.name || null;

    // Extract domain from email or infer from sponsor
    const domain = domainFromEmail(email) || inferDomainFromCompany(sponsor?.name);

    // Parse contact name
    const nameParts = contactName?.split(' ') || [];
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Build signal from status + condition
    const signal = `${statusModule?.overallStatus || 'ACTIVE'}: ${conditions[0] || 'clinical trial'}`;

    return {
      // Identity
      company: sponsor?.name || 'Unknown Sponsor',
      domain: domain,

      // Contact (93% coverage from centralContacts)
      email: email,
      firstName,
      lastName,
      fullName: contactName,
      title: primaryContact?.role || 'Study Contact',

      // Signal
      signal,

      // Provenance
      emailSource: email ? 'clinicaltrials' : null,
      emailVerified: false, // ClinicalTrials emails are NOT verified
      verifiedBy: null,
      verifiedAt: null,

      // Metadata
      industry: 'Life Sciences',
      raw: {
        nctId: id?.nctId,
        briefTitle: id?.briefTitle,
        sponsorClass: sponsor?.class,
        conditions,
        source: 'clinicaltrials',
      },
    } as NormalizedRecord;
  });

  return {
    source: 'clinicaltrials',
    records,
    total: data.totalCount || records.length,
    nextPageToken: data.nextPageToken,
    hasMore: !!data.nextPageToken,
  };
}

// =============================================================================
// FDA DRUG APPROVALS CLIENT
// =============================================================================

/**
 * Fetch FDA drug approvals via proxy.
 *
 * @param limit Number of results (max 1000)
 * @param skip Offset for pagination
 * @param search Optional search query
 */
export async function fetchFDAApprovals(options: {
  limit?: number;
  skip?: number;
  search?: string;
}): Promise<PublicDatabaseResult> {
  const { limit = 100, skip = 0, search } = options;

  const body: Record<string, unknown> = { limit, skip };
  if (search) body.search = search;

  const response = await fetch(`${SUPABASE_URL}/fda-proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`FDA API error: ${error.error || response.status}`);
  }

  const data = await response.json();
  const approvals: FDADrugApproval[] = data.results || [];

  // Map to NormalizedRecord
  const records: NormalizedRecord[] = approvals.map(approval => {
    const sponsorName = approval.sponsor_name || approval.openfda?.manufacturer_name?.[0] || 'Unknown Sponsor';
    const domain = inferDomainFromCompany(sponsorName);
    const brandName = approval.openfda?.brand_name?.[0] || approval.products?.[0]?.brand_name;

    // Get latest submission
    const latestSubmission = approval.submissions?.sort((a, b) => {
      const dateA = a.submission_status_date || '';
      const dateB = b.submission_status_date || '';
      return dateB.localeCompare(dateA);
    })[0];

    // Build signal from approval type
    const signal = `FDA ${latestSubmission?.submission_type || 'APPROVAL'}: ${brandName || 'drug product'}`;

    return {
      // Identity
      company: sponsorName,
      domain: domain,

      // Contact (0% coverage — requires enrichment)
      email: null,
      firstName: '',
      lastName: '',
      fullName: null,
      title: '',

      // Signal
      signal,

      // Provenance
      emailSource: null,
      emailVerified: false,
      verifiedBy: null,
      verifiedAt: null,

      // Metadata
      industry: 'Pharmaceuticals',
      raw: {
        applicationNumber: approval.application_number,
        brandName,
        submissionType: latestSubmission?.submission_type,
        submissionDate: latestSubmission?.submission_status_date,
        source: 'fda',
      },
    } as NormalizedRecord;
  });

  return {
    source: 'fda',
    records,
    total: data.meta?.results?.total || records.length,
    hasMore: skip + limit < (data.meta?.results?.total || 0),
  };
}

// =============================================================================
// COMBINED FETCH — Fetch from multiple sources
// =============================================================================

export interface PublicDatabaseOptions {
  sources: ('clinicaltrials' | 'fda')[];
  clinicalTrialsOptions?: {
    status?: string;
    condition?: string;
    pageSize?: number;
  };
  fdaOptions?: {
    limit?: number;
    search?: string;
  };
}

/**
 * Fetch demand signals from multiple public databases.
 * Returns combined NormalizedRecords with source tracking.
 */
export async function fetchPublicDatabaseSignals(options: PublicDatabaseOptions): Promise<{
  records: NormalizedRecord[];
  bySource: Record<string, number>;
  withEmail: number;
  needEnrichment: number;
}> {
  const results: NormalizedRecord[] = [];
  const bySource: Record<string, number> = {};

  // Fetch in parallel
  const promises: Promise<PublicDatabaseResult>[] = [];

  if (options.sources.includes('clinicaltrials')) {
    promises.push(fetchClinicalTrials(options.clinicalTrialsOptions || {}));
  }

  if (options.sources.includes('fda')) {
    promises.push(fetchFDAApprovals(options.fdaOptions || {}));
  }

  const responses = await Promise.allSettled(promises);

  for (const response of responses) {
    if (response.status === 'fulfilled') {
      const result = response.value;
      results.push(...result.records);
      bySource[result.source] = result.records.length;
    } else {
      console.error('[PublicDatabaseClient] Fetch failed:', response.reason);
    }
  }

  // Count email coverage
  const withEmail = results.filter(r => r.email && !isGenericEmailProvider(r.email)).length;
  const needEnrichment = results.length - withEmail;

  console.log('[PublicDatabaseClient] Fetched', results.length, 'records', {
    bySource,
    withEmail,
    needEnrichment,
  });

  return {
    records: results,
    bySource,
    withEmail,
    needEnrichment,
  };
}
