/**
 * NihService.ts — NIH Reporter API Integration
 *
 * ARCHITECTURAL INVARIANT:
 * This service outputs NormalizedRecord[] — the SAME type used everywhere.
 * No special cases. No NIH-specific logic past this file.
 *
 * NIH Reporter API is FREE. No auth required. 1 req/sec rate limit.
 */

import type { NormalizedRecord, SignalMeta, DomainSource } from '../schemas';
import { simpleHash } from '../enrichment/recordKey';

// =============================================================================
// CONSTANTS
// =============================================================================

// NIH Reporter has no CORS support — must proxy server-side
const NIH_PROXY_URL = 'https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/nih-proxy';

// NIH Institute → Therapeutic Area mapping
const NIH_INSTITUTE_MAP: Record<string, string> = {
  NCI: 'Oncology',
  NIAID: 'Infectious Disease / Immunology',
  NHLBI: 'Cardiovascular',
  NINDS: 'Neurology',
  NIA: 'Aging / Neurodegeneration',
  NIDDK: 'Metabolic / Diabetes',
  NIMH: 'Mental Health / CNS',
  NICHD: 'Pediatrics / Reproductive',
  NIEHS: 'Environmental Health',
  NIDA: 'Addiction',
  NIAAA: 'Alcohol Research',
  NIGMS: 'General Medical Sciences',
  NCATS: 'Translational Sciences',
  NLM: 'Library / Informatics',
  NHGRI: 'Genomics',
  NIBIB: 'Biomedical Imaging',
  NCCIH: 'Complementary Medicine',
  NIDCD: 'Hearing / Communication',
  NIDCR: 'Dental / Craniofacial',
  NEI: 'Ophthalmology',
  NIAMS: 'Musculoskeletal',
  NIMHD: 'Health Disparities',
  NINR: 'Nursing Research',
};

// Known org → domain mappings (for enrichment accuracy)
const KNOWN_DOMAINS: Record<string, string> = {
  'stanford university': 'stanford.edu',
  'harvard university': 'harvard.edu',
  'massachusetts institute of technology': 'mit.edu',
  'mit': 'mit.edu',
  'yale university': 'yale.edu',
  'columbia university': 'columbia.edu',
  'columbia university health sciences': 'columbia.edu',
  'university of california': 'universityofcalifornia.edu',
  'university of california los angeles': 'ucla.edu',
  'university of california san francisco': 'ucsf.edu',
  'university of california berkeley': 'berkeley.edu',
  'university of pennsylvania': 'upenn.edu',
  'johns hopkins university': 'jhu.edu',
  'duke university': 'duke.edu',
  'university of michigan': 'umich.edu',
  'university of washington': 'washington.edu',
  'university of chicago': 'uchicago.edu',
  'northwestern university': 'northwestern.edu',
  'vanderbilt university': 'vanderbilt.edu',
  'vanderbilt university medical center': 'vumc.org',
  'emory university': 'emory.edu',
  'university of pittsburgh': 'pitt.edu',
  'university of north carolina': 'unc.edu',
  'university of texas': 'utexas.edu',
  'baylor college of medicine': 'bcm.edu',
  'mayo clinic': 'mayo.edu',
  'cleveland clinic': 'clevelandclinic.org',
  'fred hutchinson cancer research center': 'fredhutch.org',
  'memorial sloan kettering': 'mskcc.org',
  'md anderson cancer center': 'mdanderson.org',
  'dana-farber cancer institute': 'dfci.harvard.edu',
  'scripps research': 'scripps.edu',
  'broad institute': 'broadinstitute.org',
  'salk institute': 'salk.edu',
  'research triangle institute': 'rti.org',
};

// =============================================================================
// TYPES
// =============================================================================

export interface NihFetchOptions {
  daysBack?: number;
  minAmount?: number;
  maxAmount?: number;
  limit?: number;
  keywords?: string[];
  nihInstitute?: string; // Filter by specific institute (NCI, NIAID, etc.)
}

export interface NihFetchResult {
  records: NormalizedRecord[];
  totalFound: number;
  error?: string;
}

// =============================================================================
// DOMAIN INFERENCE
// =============================================================================

/**
 * Infer domain from organization name.
 * Uses known mappings first, then attempts pattern-based inference.
 */
function inferDomain(orgName: string): string {
  if (!orgName) return '';

  const normalized = orgName.toLowerCase().trim();

  // Check known domains first
  if (KNOWN_DOMAINS[normalized]) {
    return KNOWN_DOMAINS[normalized];
  }

  // Check partial matches
  for (const [key, domain] of Object.entries(KNOWN_DOMAINS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return domain;
    }
  }

  // Pattern-based inference for universities
  const uniMatch = normalized.match(/university of ([a-z]+)/);
  if (uniMatch) {
    const state = uniMatch[1];
    // Common state abbreviations
    const stateMap: Record<string, string> = {
      alabama: 'ua.edu',
      arizona: 'arizona.edu',
      arkansas: 'uark.edu',
      colorado: 'colorado.edu',
      connecticut: 'uconn.edu',
      florida: 'ufl.edu',
      georgia: 'uga.edu',
      hawaii: 'hawaii.edu',
      idaho: 'uidaho.edu',
      illinois: 'illinois.edu',
      indiana: 'indiana.edu',
      iowa: 'uiowa.edu',
      kansas: 'ku.edu',
      kentucky: 'uky.edu',
      louisiana: 'lsu.edu',
      maine: 'maine.edu',
      maryland: 'umd.edu',
      massachusetts: 'umass.edu',
      minnesota: 'umn.edu',
      mississippi: 'olemiss.edu',
      missouri: 'missouri.edu',
      montana: 'umt.edu',
      nebraska: 'unl.edu',
      nevada: 'unr.edu',
      'new hampshire': 'unh.edu',
      'new mexico': 'unm.edu',
      'north carolina': 'unc.edu',
      'north dakota': 'und.edu',
      ohio: 'ohio.edu',
      oklahoma: 'ou.edu',
      oregon: 'uoregon.edu',
      pennsylvania: 'upenn.edu',
      'rhode island': 'uri.edu',
      'south carolina': 'sc.edu',
      'south dakota': 'usd.edu',
      tennessee: 'utk.edu',
      texas: 'utexas.edu',
      utah: 'utah.edu',
      vermont: 'uvm.edu',
      virginia: 'virginia.edu',
      washington: 'washington.edu',
      'west virginia': 'wvu.edu',
      wisconsin: 'wisc.edu',
      wyoming: 'uwyo.edu',
    };
    if (stateMap[state]) {
      return stateMap[state];
    }
  }

  // For unknown orgs, return empty — enrichment will use SEARCH_COMPANY
  return '';
}

// =============================================================================
// SIGNAL CONSTRUCTION
// =============================================================================

/**
 * Build human-readable signal string from NIH grant data.
 */
function buildSignalString(grant: any): string {
  const parts: string[] = [];

  // Fresh funding indicator
  const startDate = grant.project_start_date;
  if (startDate) {
    const start = new Date(startDate);
    const daysAgo = (Date.now() - start.getTime()) / (1000 * 60 * 60 * 24);
    if (daysAgo <= 60) {
      parts.push('Fresh NIH funding');
    } else if (grant.is_new) {
      parts.push('New NIH grant');
    } else {
      parts.push('NIH funded');
    }
  } else {
    parts.push('NIH funded');
  }

  // NIH Institute (therapeutic area authority)
  const institute = grant.agency_ic_admin?.abbreviation;
  if (institute) {
    parts.push(institute);
  }

  // Amount
  const amount = grant.award_amount;
  if (amount) {
    if (amount >= 1000000) {
      parts.push(`$${(amount / 1000000).toFixed(1)}M`);
    } else {
      parts.push(`$${(amount / 1000).toFixed(0)}K`);
    }
  }

  // Activity code (scale proxy)
  const activityCode = grant.activity_code;
  if (activityCode) {
    parts.push(activityCode);
  }

  // Org type (outsource likelihood)
  const orgType = grant.organization_type?.name;
  if (orgType && !orgType.includes('Higher Education')) {
    // Highlight non-academic orgs (higher outsource likelihood)
    if (orgType.includes('Small Business')) {
      parts.push('Small Business');
    } else if (!orgType.includes('Hospital')) {
      parts.push('Commercial');
    }
  }

  return parts.join(' | ');
}

/**
 * Build SignalMeta from NIH grant data.
 * All structured data goes here — never new logic branches.
 */
function buildSignalMeta(grant: any, signalLabel: string): SignalMeta {
  const therapeuticArea = NIH_INSTITUTE_MAP[grant.agency_ic_admin?.abbreviation] || '';

  return {
    kind: 'GROWTH', // NIH grants are growth signals
    label: signalLabel,
    source: 'nih',

    // NIH-specific fields (stored generically in signalMeta)
    grantAmount: grant.award_amount || undefined,
    nihInstitute: grant.agency_ic_admin?.abbreviation || undefined,
    nihInstituteName: grant.agency_ic_admin?.name || undefined,
    therapeuticArea: therapeuticArea || undefined,
    activityCode: grant.activity_code || undefined,
    orgType: grant.organization_type?.name || undefined,
    isActive: grant.is_active ?? undefined,
    isNew: grant.is_new ?? undefined,
    startDate: grant.project_start_date?.slice(0, 10) || undefined,
    endDate: grant.project_end_date?.slice(0, 10) || undefined,
    projectTitle: grant.project_title || undefined,
    projectUrl: grant.project_detail_url || undefined,
    spendingCategories: grant.spending_categories_desc || undefined,
    keywords: grant.pref_terms?.split(';').slice(0, 10).join(', ') || undefined,
    fiscalYear: grant.fiscal_year || undefined,
    congressionalDistrict: grant.cong_dist || undefined,
    fundingMechanism: grant.funding_mechanism || undefined,
  } as SignalMeta;
}

// =============================================================================
// RECORD NORMALIZATION
// =============================================================================

/**
 * Convert NIH grant to NormalizedRecord.
 * This is the ONLY place NIH-specific logic exists.
 */
function normalizeNihGrant(grant: any): NormalizedRecord {
  // Organization
  const org = grant.organization || {};
  const company = org.org_name || '';
  const city = org.org_city || null;
  const state = org.org_state || null;
  const country = org.org_country || null;

  // Domain inference
  const domain = inferDomain(company);
  const domainSource: DomainSource = domain ? 'trusted_inferred' : 'none';

  // Principal Investigator (primary contact)
  const piList = grant.principal_investigators || [];
  const primaryPi = piList.find((pi: any) => pi.is_contact_pi) || piList[0] || {};

  const firstName = (primaryPi.first_name || '').trim();
  const lastName = (primaryPi.last_name || '').trim();
  const fullName = (primaryPi.full_name || `${firstName} ${lastName}`).trim();

  // Signal
  const signalLabel = buildSignalString(grant);
  const signalMeta = buildSignalMeta(grant, signalLabel);

  // Company description from abstract (for T3 intros)
  const abstract = grant.abstract_text || '';
  const companyDescription = abstract.slice(0, 500).replace(/\n/g, ' ').trim() || null;

  // Record key (stable identifier)
  const keyBase = `nih:${grant.appl_id || ''}:${company}:${fullName}`;
  const recordKey = `nih:${simpleHash(keyBase)}`;

  // All additional PI names (for multi-contact strategy)
  const allPiNames = piList
    .map((pi: any) => (pi.full_name || '').trim())
    .filter(Boolean)
    .join('; ');

  return {
    recordKey,

    // Contact
    firstName,
    lastName,
    fullName,
    email: null, // Needs enrichment
    title: 'Principal Investigator',
    linkedin: null,
    headline: null,
    seniorityLevel: 'Executive',

    // Company
    company,
    domain,
    domainSource,
    industry: signalMeta.therapeuticArea || null,
    size: null,
    companyDescription,
    companyFunding: signalMeta.grantAmount ? `$${signalMeta.grantAmount.toLocaleString()}` : null,
    companyRevenue: null,
    companyFoundedYear: null,
    companyLinkedin: null,

    // Signal
    signalMeta,
    signal: signalLabel,
    signalDetail: signalMeta.projectTitle || null,

    // Location
    city,
    state,
    country,

    // Meta
    schemaId: 'csv', // Use csv schema — no special cases
    raw: {
      // Preserve everything for enrichment hints
      appl_id: grant.appl_id,
      project_num: grant.project_num,
      duns: org.primary_duns,
      uei: org.primary_uei,
      orgId: org.external_org_id,
      zipcode: org.org_zipcode,
      piProfileId: primaryPi.profile_id,
      isContactPi: primaryPi.is_contact_pi,
      allPiNames,
      piCount: piList.length,
      programOfficers: grant.program_officers,
      latitude: grant.geo_lat_lon?.lat,
      longitude: grant.geo_lat_lon?.lon,
      terms: grant.terms,
      dateAdded: grant.date_added,
      sourceApi: 'nih_reporter',
    },
  };
}

// =============================================================================
// API FETCHING
// =============================================================================

/**
 * Build NIH API query payload.
 */
function buildQuery(options: NihFetchOptions) {
  const {
    daysBack = 90,
    minAmount = 500000,
    maxAmount = 100000000,
    limit = 500,
    keywords = [],
    nihInstitute,
  } = options;

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);

  const criteria: any = {
    award_amount_range: {
      min_amount: minAmount,
      max_amount: maxAmount,
    },
    project_start_date: {
      from_date: startDate.toISOString().slice(0, 10),
      to_date: endDate.toISOString().slice(0, 10),
    },
  };

  // Keyword search
  if (keywords.length > 0) {
    criteria.advanced_text_search = {
      operator: 'or',
      search_field: 'all',
      search_text: keywords.slice(0, 5).join(' '),
    };
  }

  // Filter by NIH Institute
  if (nihInstitute) {
    criteria.agencies = [{ abbreviation: nihInstitute }];
  }

  return {
    criteria,
    offset: 0,
    limit: Math.min(limit, 500),
    sort_field: 'award_amount',
    sort_order: 'desc',
  };
}

/**
 * Fetch grants from NIH Reporter API.
 * Handles pagination and rate limiting.
 */
async function fetchGrants(options: NihFetchOptions): Promise<any[]> {
  const query = buildQuery(options);
  const targetCount = options.limit || 500;
  const allResults: any[] = [];

  let offset = 0;

  while (allResults.length < targetCount) {
    query.offset = offset;
    query.limit = Math.min(500, targetCount - allResults.length);

    try {
      const response = await fetch(NIH_PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(query),
      });

      if (!response.ok) {
        console.error(`[NihService] API error: ${response.status}`);
        break;
      }

      const data = await response.json();
      const results = data.results || [];

      if (results.length === 0) {
        break;
      }

      allResults.push(...results);
      offset += results.length;

      console.log(`[NihService] Fetched ${allResults.length}/${targetCount} grants`);

      // Rate limit: 1 req/sec
      if (allResults.length < targetCount) {
        await new Promise((resolve) => setTimeout(resolve, 1100));
      }
    } catch (error) {
      console.error('[NihService] Fetch error:', error);
      break;
    }
  }

  return allResults;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Fetch NIH grants and return as NormalizedRecord[].
 *
 * INVARIANT: Output is NormalizedRecord[] — same type used everywhere.
 * No special handling needed by consumers.
 */
export async function fetchNihDemand(options: NihFetchOptions = {}): Promise<NihFetchResult> {
  console.log('[NihService] Fetching NIH grants...', options);

  try {
    const grants = await fetchGrants(options);

    if (grants.length === 0) {
      return {
        records: [],
        totalFound: 0,
        error: 'No grants found matching criteria',
      };
    }

    // Normalize to NormalizedRecord[]
    const records = grants.map(normalizeNihGrant);

    console.log(`[NihService] Normalized ${records.length} grants to NormalizedRecord[]`);

    return {
      records,
      totalFound: grants.length,
    };
  } catch (error) {
    console.error('[NihService] Error:', error);
    return {
      records: [],
      totalFound: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get available NIH Institutes for filtering.
 */
export function getNihInstitutes(): { code: string; name: string; therapeuticArea: string }[] {
  return Object.entries(NIH_INSTITUTE_MAP).map(([code, area]) => ({
    code,
    name: code, // Could expand with full names
    therapeuticArea: area,
  }));
}

/**
 * Default biotech keywords for NIH search.
 */
export const DEFAULT_NIH_KEYWORDS = [
  'oncology',
  'cancer',
  'gene therapy',
  'cell therapy',
  'immunotherapy',
  'rare disease',
  'neurology',
  'vaccine',
  'clinical trial',
  'drug discovery',
];
