/**
 * UsaSpendingService.ts — USASpending API Integration (Supply Side)
 *
 * ARCHITECTURAL INVARIANT:
 * This service outputs NormalizedRecord[] — the SAME type used everywhere.
 * No special cases. No USASpending-specific logic past this file.
 *
 * USASpending API is FREE. No auth required.
 */

import type { NormalizedRecord, SignalMeta, DomainSource } from '../schemas';
import { simpleHash } from '../enrichment/recordKey';

// =============================================================================
// CONSTANTS
// =============================================================================

const USASPENDING_API_URL = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';

// Known CRO/contractor → domain mappings
const KNOWN_CRO_DOMAINS: Record<string, string> = {
  'leidos biomedical research': 'leidos.com',
  'leidos': 'leidos.com',
  'ppd development': 'ppd.com',
  'ppd': 'ppd.com',
  'iqvia': 'iqvia.com',
  'labcorp drug development': 'labcorp.com',
  'labcorp': 'labcorp.com',
  'covance': 'covance.com',
  'parexel': 'parexel.com',
  'syneos health': 'syneoshealth.com',
  'icon plc': 'iconplc.com',
  'icon': 'iconplc.com',
  'pra health sciences': 'prahs.com',
  'charles river laboratories': 'criver.com',
  'wuxi apptec': 'wuxiapptec.com',
  'medpace': 'medpace.com',
  'pharmaceutical product development': 'ppd.com',
  'research triangle institute': 'rti.org',
  'rti international': 'rti.org',
  'booz allen hamilton': 'boozallen.com',
  'general dynamics': 'gd.com',
  'northrop grumman': 'northropgrumman.com',
  'lockheed martin': 'lockheedmartin.com',
  'raytheon': 'raytheon.com',
  'saic': 'saic.com',
  'maximus': 'maximus.com',
  'deloitte': 'deloitte.com',
  'accenture': 'accenture.com',
  'mckinsey': 'mckinsey.com',
  'boston consulting group': 'bcg.com',
  'kpmg': 'kpmg.com',
  'ernst & young': 'ey.com',
  'pwc': 'pwc.com',
  'pricewaterhousecoopers': 'pwc.com',
};

// =============================================================================
// TYPES
// =============================================================================

export interface UsaSpendingFetchOptions {
  fundingAgency?: string;       // e.g., "Department of Health and Human Services"
  minAmount?: number;
  maxAmount?: number;
  limit?: number;
  keywords?: string[];
  startDate?: string;           // YYYY-MM-DD
  endDate?: string;             // YYYY-MM-DD
}

export interface UsaSpendingFetchResult {
  records: NormalizedRecord[];
  totalFound: number;
  error?: string;
}

// =============================================================================
// DOMAIN INFERENCE
// =============================================================================

/**
 * Infer domain from contractor name.
 */
function inferDomain(companyName: string): string {
  if (!companyName) return '';

  const normalized = companyName.toLowerCase().trim();

  // Check known domains first
  if (KNOWN_CRO_DOMAINS[normalized]) {
    return KNOWN_CRO_DOMAINS[normalized];
  }

  // Check partial matches
  for (const [key, domain] of Object.entries(KNOWN_CRO_DOMAINS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return domain;
    }
  }

  // For unknown companies, return empty — enrichment will use SEARCH_COMPANY
  return '';
}

// =============================================================================
// SIGNAL CONSTRUCTION
// =============================================================================

/**
 * Build human-readable signal string from USASpending data.
 */
function buildSignalString(award: any): string {
  const parts: string[] = [];

  // Funding agency credibility
  const fundingAgency = award['Funding Agency'] || '';
  if (fundingAgency.includes('Health and Human Services') || fundingAgency.includes('HHS')) {
    parts.push('HHS contractor');
  } else if (fundingAgency.includes('Defense') || fundingAgency.includes('DoD')) {
    parts.push('DoD contractor');
  } else if (fundingAgency) {
    parts.push('Federal contractor');
  } else {
    parts.push('Government contractor');
  }

  // Amount
  const amount = award['Award Amount'];
  if (amount) {
    if (amount >= 1000000000) {
      parts.push(`$${(amount / 1000000000).toFixed(1)}B`);
    } else if (amount >= 1000000) {
      parts.push(`$${(amount / 1000000).toFixed(1)}M`);
    } else if (amount >= 1000) {
      parts.push(`$${(amount / 1000).toFixed(0)}K`);
    }
  }

  // Contract type
  const contractType = award['Contract Award Type'];
  if (contractType) {
    parts.push(contractType);
  }

  // NAICS description (service specificity)
  const naics = award['NAICS Description'];
  if (naics) {
    // Truncate if too long
    const shortNaics = naics.length > 30 ? naics.slice(0, 30) + '...' : naics;
    parts.push(shortNaics);
  }

  return parts.join(' | ');
}

/**
 * Build SignalMeta from USASpending data.
 */
function buildSignalMeta(award: any, signalLabel: string): SignalMeta {
  return {
    kind: 'GROWTH', // Federal contractors are established suppliers
    label: signalLabel,
    source: 'usaspending',

    // Money signals
    awardAmount: award['Award Amount'] || undefined,
    totalCost: award['Total Outlays'] || undefined,

    // Timing
    startDate: award['Start Date'] || undefined,
    endDate: award['End Date'] || undefined,

    // Industry
    naicsCode: award['NAICS Code'] || undefined,
    naicsDescription: award['NAICS Description'] || undefined,

    // Contract details
    contractType: award['Contract Award Type'] || undefined,

    // Agency credibility
    fundingAgency: award['Funding Agency'] || undefined,
    awardingAgency: award['Awarding Agency'] || undefined,

    // Location
    performanceLocation: award['Place of Performance'] || undefined,
  } as SignalMeta;
}

// =============================================================================
// RECORD NORMALIZATION
// =============================================================================

/**
 * Convert USASpending award to NormalizedRecord.
 * This is the ONLY place USASpending-specific logic exists.
 */
function normalizeUsaSpendingAward(award: any): NormalizedRecord {
  // Company
  const company = award['Recipient Name'] || '';

  // Location
  const location = award['Recipient Location'] || {};
  const city = location.city_name || null;
  const state = location.state_code || null;
  const country = location.country_name || location.location_country_code || null;

  // Domain inference
  const domain = inferDomain(company);
  const domainSource: DomainSource = domain ? 'trusted_inferred' : 'none';

  // Signal
  const signalLabel = buildSignalString(award);
  const signalMeta = buildSignalMeta(award, signalLabel);

  // Company description from contract description
  const description = award['Description'] || '';
  const companyDescription = description.slice(0, 500).replace(/\n/g, ' ').trim() || null;

  // Record key (stable identifier)
  const awardId = award['Award ID'] || award['generated_internal_id'] || '';
  const keyBase = `usaspending:${awardId}:${company}`;
  const recordKey = `usaspending:${simpleHash(keyBase)}`;

  // Industry from NAICS
  const industry = award['NAICS Description'] || null;

  return {
    recordKey,

    // Contact — USASpending has NO contacts, needs FIND_COMPANY_CONTACT
    firstName: '',
    lastName: '',
    fullName: '',
    email: null,
    title: '',
    linkedin: null,
    headline: null,
    seniorityLevel: null,

    // Company
    company,
    domain,
    domainSource,
    industry,
    size: null,
    companyDescription,
    companyFunding: signalMeta.awardAmount ? `$${signalMeta.awardAmount.toLocaleString()}` : null,
    companyRevenue: null,
    companyFoundedYear: null,
    companyLinkedin: null,

    // Signal
    signalMeta,
    signal: signalLabel,
    signalDetail: description.slice(0, 200) || null,

    // Location
    city,
    state,
    country,

    // Meta
    schemaId: 'csv', // Use csv schema — no special cases
    raw: {
      awardId,
      recipientUei: award['Recipient UEI'] || award['recipient_uei'],
      recipientDuns: award['Recipient DUNS Number'],
      recipientId: award['recipient_id'],
      parentCompany: award['Recipient Parent Name'],
      internalId: award['generated_internal_id'],
      lastModified: award['Last Modified Date'],
      fundingSubAgency: award['Funding Sub Agency'],
      awardingSubAgency: award['Awarding Sub Agency'],
      pscCode: award['PSC Code'],
      pscDescription: award['PSC Description'],
      performanceState: award['primary_place_of_performance_state_code'],
      performanceCountry: award['primary_place_of_performance_country_code'],
      sourceApi: 'usaspending',
    },
  };
}

// =============================================================================
// API FETCHING
// =============================================================================

/**
 * Build USASpending API query payload.
 */
function buildQuery(options: UsaSpendingFetchOptions) {
  const {
    fundingAgency = 'Department of Health and Human Services',
    minAmount = 1000000,
    maxAmount = 100000000,
    limit = 500,
    keywords = [],
    startDate,
    endDate,
  } = options;

  // Default time period: last 2 years
  const now = new Date();
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  const filters: any = {
    award_type_codes: ['A', 'B', 'C', 'D'], // Contracts
    award_amounts: [
      {
        lower_bound: minAmount,
        upper_bound: maxAmount,
      },
    ],
    time_period: [
      {
        start_date: startDate || twoYearsAgo.toISOString().slice(0, 10),
        end_date: endDate || now.toISOString().slice(0, 10),
      },
    ],
  };

  // Agency filter
  if (fundingAgency) {
    filters.agencies = [
      {
        type: 'funding',
        tier: 'toptier',
        name: fundingAgency,
      },
    ];
  }

  // Keyword filter
  if (keywords.length > 0) {
    filters.keywords = keywords;
  }

  return {
    filters,
    fields: [
      'Award ID',
      'Recipient Name',
      'Recipient UEI',
      'Recipient DUNS Number',
      'recipient_id',
      'Recipient Parent Name',
      'Recipient Location',
      'Award Amount',
      'Total Outlays',
      'Description',
      'Start Date',
      'End Date',
      'Last Modified Date',
      'Contract Award Type',
      'Award Type',
      'Awarding Agency',
      'Awarding Sub Agency',
      'Funding Agency',
      'Funding Sub Agency',
      'NAICS Code',
      'NAICS Description',
      'PSC Code',
      'PSC Description',
      'Place of Performance',
      'primary_place_of_performance_state_code',
      'primary_place_of_performance_country_code',
      'generated_internal_id',
    ],
    limit: Math.min(limit, 100), // USASpending max per request
    sort: 'Award Amount',
    order: 'desc',
  };
}

/**
 * Fetch awards from USASpending API.
 * Handles pagination.
 */
async function fetchAwards(options: UsaSpendingFetchOptions): Promise<any[]> {
  const query = buildQuery(options);
  const targetCount = options.limit || 500;
  const allResults: any[] = [];
  const seenCompanies = new Set<string>(); // Dedupe by company

  let page = 1;

  while (allResults.length < targetCount) {
    try {
      const response = await fetch(USASPENDING_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...query,
          page,
          limit: Math.min(100, targetCount - allResults.length),
        }),
      });

      if (!response.ok) {
        console.error(`[UsaSpendingService] API error: ${response.status}`);
        const errorText = await response.text();
        console.error(`[UsaSpendingService] Error body: ${errorText.slice(0, 200)}`);
        break;
      }

      const data = await response.json();
      const results = data.results || [];

      if (results.length === 0) {
        break;
      }

      // Dedupe by company name (keep highest award amount)
      for (const result of results) {
        const companyKey = (result['Recipient Name'] || '').toLowerCase().trim();
        if (companyKey && !seenCompanies.has(companyKey)) {
          seenCompanies.add(companyKey);
          allResults.push(result);
        }
      }

      console.log(`[UsaSpendingService] Fetched ${allResults.length}/${targetCount} awards (page ${page})`);

      page++;

      // Small delay between requests
      if (allResults.length < targetCount) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error('[UsaSpendingService] Fetch error:', error);
      break;
    }
  }

  return allResults;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Fetch USASpending awards and return as NormalizedRecord[].
 *
 * INVARIANT: Output is NormalizedRecord[] — same type used everywhere.
 * These are SUPPLY records (CROs, contractors) — enrichment will use FIND_COMPANY_CONTACT.
 */
export async function fetchUsaSpendingSupply(options: UsaSpendingFetchOptions = {}): Promise<UsaSpendingFetchResult> {
  console.log('[UsaSpendingService] Fetching USASpending awards...', options);

  try {
    const awards = await fetchAwards(options);

    if (awards.length === 0) {
      return {
        records: [],
        totalFound: 0,
        error: 'No awards found matching criteria',
      };
    }

    // Normalize to NormalizedRecord[]
    const records = awards.map(normalizeUsaSpendingAward);

    console.log(`[UsaSpendingService] Normalized ${records.length} awards to NormalizedRecord[]`);

    return {
      records,
      totalFound: awards.length,
    };
  } catch (error) {
    console.error('[UsaSpendingService] Error:', error);
    return {
      records: [],
      totalFound: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Default HHS keywords for biotech CRO search.
 */
export const DEFAULT_CRO_KEYWORDS = [
  'clinical research',
  'clinical trial',
  'biomedical research',
  'pharmaceutical',
  'drug development',
  'regulatory',
  'laboratory services',
];

/**
 * Available funding agencies.
 */
export const FUNDING_AGENCIES = [
  { name: 'Department of Health and Human Services', code: 'HHS' },
  { name: 'Department of Defense', code: 'DoD' },
  { name: 'National Institutes of Health', code: 'NIH' },
  { name: 'Food and Drug Administration', code: 'FDA' },
  { name: 'Centers for Disease Control and Prevention', code: 'CDC' },
];
