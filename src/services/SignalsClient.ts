import { supabase } from '../lib/supabase';
import { processJobsDatasetForPressure } from './PressureWiringService';
export { supabase };

// =============================================================================
// UNIVERSAL SAFE STRING HANDLERS - Use these EVERYWHERE, never call .toLowerCase() directly
// =============================================================================

/**
 * Universal safe lowercase - handles ANY input type
 * ALWAYS use this instead of .toLowerCase()
 */
export function safeLower(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.toLowerCase();
  if (typeof v === "number" || typeof v === "boolean") return String(v).toLowerCase();
  if (Array.isArray(v)) return v.map(x => safeLower(x)).filter(Boolean).join(" ").trim();
  if (typeof v === "object") {
    const o = v as any;
    return safeLower(o.name ?? o.title ?? o.value ?? o.label ?? "");
  }
  return "";
}

/**
 * Universal safe text extraction - returns string without lowercasing
 * ALWAYS use this when extracting text from unknown values
 */
export function safeText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(x => safeText(x)).filter(Boolean).join(" ").trim();
  if (typeof v === "object") {
    const o = v as any;
    return safeText(o.name ?? o.title ?? o.value ?? o.label ?? "");
  }
  return "";
}

// =============================================================================
// CSV DATA SUPPORT
// =============================================================================

const CSV_DEMAND_KEY = 'csv_demand_data';
const CSV_SUPPLY_KEY = 'csv_supply_data';

/**
 * Get CSV data from localStorage if available
 * Returns null if no CSV data exists
 */
export function getCsvData(type: 'demand' | 'supply'): any[] | null {
  try {
    const key = type === 'demand' ? CSV_DEMAND_KEY : CSV_SUPPLY_KEY;
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    const data = JSON.parse(stored);
    if (!Array.isArray(data) || data.length === 0) return null;
    console.log(`[CSV] Found ${data.length} ${type} records in localStorage`);
    return data;
  } catch {
    return null;
  }
}

/**
 * Check if CSV data is available for a given type
 */
export function hasCsvData(type: 'demand' | 'supply'): boolean {
  return getCsvData(type) !== null;
}

// =============================================================================
// CRUNCHBASE DETECTION & EXTRACTION (ISOLATED PATH)
// =============================================================================

/**
 * STRICT Crunchbase record detection.
 *
 * Returns true ONLY if:
 * 1. record.link is a string containing 'crunchbase.com/organization/'
 * 2. record has org-level structure (name exists, no job/contact fields)
 * 3. record has at least one Crunchbase-unique funding field (POSITIVE identifier)
 *
 * HARDENED: Detects by POSITIVE identifiers, not "missing fields".
 * - Tolerates empty job_title (null or '') — Crunchbase may have this key
 * - Requires funding fields to prevent false positives from future scrapers
 */
export function isCrunchbaseRecord(record: any): boolean {
  if (!record || typeof record !== 'object') return false;

  // STRICT fingerprint #1: Link must be Crunchbase organization permalink
  const hasOrgLink =
    typeof record.link === 'string' &&
    record.link.includes('crunchbase.com/organization/');

  if (!hasOrgLink) return false;

  // STRICT fingerprint #2: Must have org-level structure
  // Tolerate empty job_title (null or '') — Crunchbase may include this key
  const hasOrgStructure =
    typeof record.name === 'string' &&
    record.name.length > 0 &&
    (record.job_title == null || record.job_title === '') &&  // Allow null/empty
    !record.job_id &&         // Wellfound has job_id
    !record.first_name;       // B2B contacts have first_name

  if (!hasOrgStructure) return false;

  // STRICT fingerprint #3: Must have Crunchbase-unique funding fields (POSITIVE identifier)
  // This prevents future scrapers with link+name from being misclassified
  const hasCrunchFunding =
    !!record.last_funding_at ||
    !!record.last_equity_funding_type ||
    !!record.last_equity_funding_total ||
    !!record.last_funding_type ||
    !!record.last_funding_total;

  return hasCrunchFunding;
}

/**
 * Extract Crunchbase org fields into the SAME shape as extractJobLikeFields().
 *
 * This is PURE INGESTION — no signals created here.
 * Flow.tsx will create FUNDING_RECENT signals downstream.
 *
 * Returns object with identical keys to extractJobLikeFields() output:
 * - companyName, companyUrl, title, locationText, industry, description, techStack, existingContact, raw
 * Plus: schemaId for downstream routing
 */
export function extractCrunchbaseSignals(record: any): {
  companyName: string;
  companyUrl: string;
  domain: string;  // Hostname extracted from companyUrl (e.g., 'acme.com')
  title: string;
  locationText: string;
  industry: string;
  description: string;
  techStack: string[];
  existingContact?: {
    email?: string;
    name?: string;
    title?: string;
    linkedin?: string;
  };
  raw: any;
  // Crunchbase-specific: schemaId for downstream detection
  schemaId: 'crunchbase-orgs';
  // Crunchbase-specific: funding metadata (passed through to Flow.tsx)
  fundingDate: string | null;
  fundingType: string | null;
  fundingAmount: number | null;
} {
  // Company name — direct field
  const companyName = safeText(record.name) || 'Unknown Company';

  // Company URL — nested under website.value
  const companyUrl = safeText(record.website?.value || record.website || '');

  // Domain — extract hostname from URL (e.g., 'https://acme.com/about' → 'acme.com')
  let domain = '';
  if (companyUrl) {
    try {
      // Remove protocol and extract hostname
      domain = companyUrl
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('/')[0]
        .split('?')[0]
        .toLowerCase()
        .trim();
    } catch {
      domain = '';
    }
  }

  // Title — empty for org-level records (no job title)
  const title = '';

  // Location — from location_identifiers[].value array
  const locations = record.location_identifiers || [];
  const locationText = Array.isArray(locations)
    ? locations.map((loc: any) => safeText(loc?.value || loc)).filter(Boolean).join(', ')
    : '';

  // Industry — from categories[].value or category_groups[].value
  const categories = record.categories || record.category_groups || [];
  const industry = Array.isArray(categories)
    ? categories.map((cat: any) => safeText(cat?.value || cat)).filter(Boolean).join(', ')
    : '';

  // Description — short_description field
  const description = safeText(record.short_description || '');

  // Tech stack — not available in Crunchbase org data
  const techStack: string[] = [];

  // Existing contact — Crunchbase orgs don't have contacts (needs enrichment)
  const existingContact = undefined;

  // Funding metadata — passed through for Flow.tsx signal creation
  const fundingDate = safeText(record.last_funding_at) || null;
  const fundingType = safeText(record.last_equity_funding_type || record.last_funding_type) || null;
  const fundingAmount = record.last_equity_funding_total?.value_usd
    || record.last_funding_total?.value_usd
    || null;

  return {
    companyName,
    companyUrl,
    domain,
    title,
    locationText,
    industry,
    description,
    techStack,
    existingContact,
    raw: record,
    // Crunchbase-specific
    schemaId: 'crunchbase-orgs',
    fundingDate,
    fundingType,
    fundingAmount,
  };
}

// =============================================================================
// CRUNCHBASE PEOPLE DETECTION & EXTRACTION (SUPPLY-INTENT, ISOLATED PATH)
// =============================================================================

/**
 * STRICT Crunchbase People record detection.
 *
 * Returns true ONLY if:
 * 1. record.link is a string containing 'crunchbase.com/person/'
 * 2. record has person-specific fields (primary_job_title, primary_organization)
 * 3. record does NOT have an email (supply-intent, requires enrichment)
 *
 * DOCTRINE: Crunchbase People is supply-INTENT, not actual supply.
 * It becomes real supply only after successful enrichment.
 */
export function isCrunchbasePeopleRecord(record: any): boolean {
  if (!record || typeof record !== 'object') return false;

  // MANDATED: Detection based on Crunchbase-native structure, NOT record.link
  // Do NOT require: record.link, fabricated URLs, enrichment, email
  return (
    record.type === 'person' &&
    record.identifier?.entity_def_id === 'person' &&
    typeof record.name === 'string' &&
    record.name.length > 0
  );
}

/**
 * Extract Crunchbase People fields into the SAME shape as extractJobLikeFields().
 *
 * CRITICAL: Does NOT fabricate email. Supply-intent only.
 * Flow guards will block routing until enrichment provides email.
 *
 * Returns object with:
 * - fullName, title (primary_job_title), companyName (primary_organization.value)
 * - companyUrl (derived if possible), locationText
 * - schemaId: 'crunchbase-people'
 * - metadata.requiresEnrichment: true
 */
export function extractCrunchbasePeopleSignals(record: any): {
  companyName: string;
  companyUrl: string;
  domain: string;
  title: string;
  locationText: string;
  industry: string;
  description: string;
  techStack: string[];
  existingContact?: {
    email?: string;
    name?: string;
    title?: string;
    linkedin?: string;
  };
  raw: any;
  schemaId: 'crunchbase-people';
  fullName: string;
  metadata: {
    requiresEnrichment: true;
    crunchbasePermalink: string;
  };
} {
  // Full name — from first_name + last_name or name field
  const firstName = safeText(record.first_name || '');
  const lastName = safeText(record.last_name || '');
  const fullName = firstName && lastName
    ? `${firstName} ${lastName}`
    : safeText(record.name || 'Unknown Person');

  // Title — from primary_job_title
  const title = safeText(record.primary_job_title || '');

  // Company name — from primary_organization.value
  const companyName = safeText(
    record.primary_organization?.value ||
    record.primary_organization?.name ||
    record.primary_organization ||
    ''
  );

  // Company URL — derive from primary_organization if available
  const orgPermalink = safeText(record.primary_organization?.permalink || '');
  const companyUrl = orgPermalink
    ? `https://www.crunchbase.com/organization/${orgPermalink}`
    : '';

  // Domain — cannot derive without company URL, leave empty for enrichment
  const domain = '';

  // Location — from location_identifiers or location fields
  const locations = record.location_identifiers || [];
  const locationText = Array.isArray(locations)
    ? locations.map((loc: any) => safeText(loc?.value || loc)).filter(Boolean).join(', ')
    : safeText(record.location || '');

  // Industry — not available at person level
  const industry = '';

  // Description — not available at person level
  const description = '';

  // Tech stack — not available
  const techStack: string[] = [];

  // Existing contact — NO EMAIL (this is the doctrine)
  // Supply-intent requires enrichment before becoming real supply
  const existingContact = {
    name: fullName,
    title: title,
    // email: undefined — DO NOT FABRICATE
  };

  // Crunchbase permalink — derive from identifier.permalink if record.link is missing
  const crunchbasePermalink =
    record.link ??
    (record.identifier?.permalink
      ? `https://www.crunchbase.com/person/${record.identifier.permalink}`
      : '');

  return {
    companyName,
    companyUrl,
    domain,
    title,
    locationText,
    industry,
    description,
    techStack,
    existingContact,
    raw: record,
    schemaId: 'crunchbase-people',
    fullName,
    metadata: {
      requiresEnrichment: true,
      crunchbasePermalink,
    },
  };
}

// =============================================================================
// CRUNCHBASE INGESTION TEST (INLINE HARNESS)
// =============================================================================

/**
 * Inline test harness for Crunchbase ingestion.
 * Run with: import { runCrunchbaseIngestionTest } from './SignalsClient'; runCrunchbaseIngestionTest();
 */
export function runCrunchbaseIngestionTest(): void {
  console.log('\n=== CRUNCHBASE INGESTION TEST ===\n');

  // Test record: Crunchbase org
  const crunchbaseRecord = {
    name: 'Acme AI',
    link: 'https://www.crunchbase.com/organization/acme-ai',
    website: { value: 'https://acme-ai.com' },
    last_funding_at: '2024-12-01',
    last_equity_funding_type: 'Series A',
    last_equity_funding_total: { value_usd: 10000000 },
    categories: [{ value: 'Artificial Intelligence' }, { value: 'Machine Learning' }],
    location_identifiers: [{ value: 'San Francisco' }, { value: 'California' }, { value: 'United States' }],
    short_description: 'AI-powered automation platform',
  };

  // Test record: Wellfound job (should NOT match)
  const wellfoundRecord = {
    job_id: '12345',
    job_title: 'Senior Engineer',
    company: { name: 'TechCorp', url: 'https://techcorp.com' },
    job_url: 'https://wellfound.com/jobs/12345',
  };

  // Test record: LeadsFinder contact (should NOT match)
  const leadsFinderRecord = {
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@company.com',
    company_name: 'Company Inc',
    company_domain: 'company.com',
    job_title: 'CEO',
  };

  // Test 1: Crunchbase detection
  const isCrunchbase = isCrunchbaseRecord(crunchbaseRecord);
  console.log(`✓ isCrunchbaseRecord(crunchbaseRecord): ${isCrunchbase === true ? 'PASS' : 'FAIL'} (expected: true, got: ${isCrunchbase})`);

  // Test 2: Wellfound should NOT be detected as Crunchbase
  const isWellfoundCrunchbase = isCrunchbaseRecord(wellfoundRecord);
  console.log(`✓ isCrunchbaseRecord(wellfoundRecord): ${isWellfoundCrunchbase === false ? 'PASS' : 'FAIL'} (expected: false, got: ${isWellfoundCrunchbase})`);

  // Test 3: LeadsFinder should NOT be detected as Crunchbase
  const isLeadsFinderCrunchbase = isCrunchbaseRecord(leadsFinderRecord);
  console.log(`✓ isCrunchbaseRecord(leadsFinderRecord): ${isLeadsFinderCrunchbase === false ? 'PASS' : 'FAIL'} (expected: false, got: ${isLeadsFinderCrunchbase})`);

  // Test 4: Crunchbase extraction
  const extracted = extractCrunchbaseSignals(crunchbaseRecord);
  console.log(`✓ schemaId: ${extracted.schemaId === 'crunchbase-orgs' ? 'PASS' : 'FAIL'} (expected: 'crunchbase-orgs', got: '${extracted.schemaId}')`);
  console.log(`✓ companyName: ${extracted.companyName === 'Acme AI' ? 'PASS' : 'FAIL'} (expected: 'Acme AI', got: '${extracted.companyName}')`);
  console.log(`✓ companyUrl: ${extracted.companyUrl === 'https://acme-ai.com' ? 'PASS' : 'FAIL'} (expected: 'https://acme-ai.com', got: '${extracted.companyUrl}')`);
  console.log(`✓ fundingDate: ${extracted.fundingDate === '2024-12-01' ? 'PASS' : 'FAIL'} (expected: '2024-12-01', got: '${extracted.fundingDate}')`);
  console.log(`✓ fundingType: ${extracted.fundingType === 'Series A' ? 'PASS' : 'FAIL'} (expected: 'Series A', got: '${extracted.fundingType}')`);
  console.log(`✓ industry includes AI: ${extracted.industry.includes('Artificial Intelligence') ? 'PASS' : 'FAIL'}`);
  console.log(`✓ locationText includes SF: ${extracted.locationText.includes('San Francisco') ? 'PASS' : 'FAIL'}`);

  // Test 5: Title is empty (org-level, no job)
  console.log(`✓ title is empty: ${extracted.title === '' ? 'PASS' : 'FAIL'} (expected: '', got: '${extracted.title}')`);

  console.log('\n=== CRUNCHBASE INGESTION TEST COMPLETE ===\n');
}

// =============================================================================
// UNIVERSAL APIFY PAYLOAD NORMALIZERS
// =============================================================================

/**
 * Universal payload normalizer - handles ANY Apify/API response shape
 * Returns an array of items regardless of response structure
 */
export function normalizeToItems(payload: any): any[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  // Try common response shapes from various Apify actors
  const candidates = [
    payload.items,
    payload.data,
    payload.results,
    payload.dataset?.items,
    payload.dataset?.data,
    payload.response?.items,
    payload.response?.data,
    payload.jobs,
    payload.listings,
    payload.records,
    payload.rows,
  ];

  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }

  // If object but no obvious array, return [payload] as last resort
  if (typeof payload === "object" && Object.keys(payload).length > 0) {
    return [payload];
  }

  return [];
}

/**
 * Universal job field extractor - handles ANY job/company object shape from any Apify scraper
 * Works with: LinkedIn, Indeed, Wellfound, Glassdoor, ZipRecruiter, etc.
 */
/**
 * Detect if dataset is a curated contacts list vs a jobs/signals dataset.
 * Curated list = has email + first_name (contacts to reach out to)
 * Jobs list = has job_posted_date or apply_link (hiring signals)
 */
export function detectDatasetType(items: any[]): 'curated_list' | 'jobs_dataset' {
  if (!items || items.length === 0) return 'jobs_dataset';

  // Sample first 5 items
  const sample = items.slice(0, 5);

  let hasContactFields = 0;
  let hasJobFields = 0;

  for (const item of sample) {
    // Contact indicators
    if (item.email || item.personal_email) hasContactFields++;
    if (item.first_name || item.firstName) hasContactFields++;
    if (item.last_name || item.lastName) hasContactFields++;
    if (item.linkedin && !item.job_posted_date) hasContactFields++;

    // Job/signal indicators
    if (item.job_posted_date || item.postedDate || item.datePosted) hasJobFields++;
    if (item.apply_link || item.applyUrl || item.applicationUrl) hasJobFields++;
    if (item.salary || item.salaryRange) hasJobFields++;
    if (item.job_description && item.job_description.length > 200) hasJobFields++;
  }

  // If more contact indicators than job indicators, it's a curated list
  const isCurated = hasContactFields > hasJobFields && hasContactFields >= sample.length;

  console.log('[DatasetType] Detection:', { hasContactFields, hasJobFields, isCurated });

  return isCurated ? 'curated_list' : 'jobs_dataset';
}

export function extractJobLikeFields(item: any): {
  companyName: string;
  companyUrl: string;
  title: string;
  locationText: string;
  industry: string;
  description: string;
  techStack: string[];
  existingContact?: {
    email?: string;
    name?: string;
    title?: string;
    linkedin?: string;
  };
  raw: any;
} {
  if (!item || typeof item !== "object") {
    return { companyName: "", companyUrl: "", title: "", locationText: "", industry: "", description: "", techStack: [], raw: item };
  }

  // Company name candidates (order matters - most specific first)
  const companyName = safeText(
    item.company?.name ??
    item.companyName ??
    item.company_name ??
    item.employer_name ??
    item.employerName ??
    item.organization_name ??
    item.organizationName ??
    item.organization?.name ??
    item.company ??
    item.employer ??
    item.organization ??
    item.hiringOrganization?.name ??
    ""
  );

  // Company URL candidates
  const companyUrl = safeText(
    item.company?.url ??
    item.company?.website ??
    item.companyUrl ??
    item.company_url ??
    item.company_website ??
    item.companyWebsite ??
    item.employer_website ??
    item.employerWebsite ??
    item.website ??
    item.url ??
    item.hiringOrganization?.url ??
    ""
  );

  // Job title candidates
  const title = safeText(
    item.job_title ??
    item.jobTitle ??
    item.title ??
    item.position ??
    item.positionName ??
    item.role ??
    item.name ??
    ""
  );

  // Location candidates - handle arrays and strings
  const locationRaw =
    item.job_location ??
    item.jobLocation ??
    item.location ??
    item.locations ??
    item.city ??
    item.jobCity ??
    item.addressLocality ??
    "";

  const locationText = Array.isArray(locationRaw)
    ? locationRaw.map(l => safeText(l)).filter(Boolean).join(", ")
    : safeText(locationRaw);

  // Industry candidates
  const industry = safeText(
    item.industry ??
    item.company_industry ??
    item.companyIndustry ??
    item.sector ??
    item.category ??
    item.vertical ??
    item.company?.industry ??
    ""
  );

  // Description candidates
  const description = safeText(
    item.description ??
    item.company_description ??
    item.companyDescription ??
    item.about ??
    item.summary ??
    item.overview ??
    item.company?.description ??
    ""
  );

  // Tech stack candidates
  const techRaw = item.tech_stack ?? item.techStack ?? item.technologies ?? item.tech ?? item.stack ?? [];
  const techStack = Array.isArray(techRaw)
    ? techRaw.map(t => safeText(t)).filter(Boolean)
    : safeText(techRaw).split(',').map(t => t.trim()).filter(Boolean);

  // =================================================================
  // EXISTING CONTACT - Extract email/name if dataset already has them
  // This saves API calls by using pre-existing contact data
  // =================================================================
  const contactEmail = safeText(
    item.email ??
    item.personal_email ??
    item.personalEmail ??
    item.work_email ??
    item.workEmail ??
    item.contact_email ??
    item.contactEmail ??
    ""
  );

  const firstName = safeText(item.first_name ?? item.firstName ?? "");
  const lastName = safeText(item.last_name ?? item.lastName ?? "");
  const fullName = (firstName && lastName) ? `${firstName} ${lastName}` : (firstName || lastName || safeText(
    item.full_name ??
    item.fullName ??
    item.contact_name ??
    item.contactName ??
    item.name ??
    ""
  ));

  const contactTitle = safeText(
    item.contact_title ??
    item.contactTitle ??
    item.person_title ??
    item.personTitle ??
    ""
  );

  const linkedin = safeText(
    item.linkedin ??
    item.linkedin_url ??
    item.linkedinUrl ??
    item.person_linkedin_url ??
    item.personLinkedinUrl ??
    ""
  );

  // Only include existingContact if we have at least an email
  const existingContact = contactEmail ? {
    email: contactEmail,
    name: fullName || undefined,
    title: contactTitle || undefined,
    linkedin: linkedin || undefined,
  } : undefined;

  return {
    companyName: companyName.trim() || "Unknown Company",
    companyUrl: companyUrl.trim(),
    title: title.trim() || "Role",
    locationText: locationText.trim(),
    industry: industry.trim(),
    description: description.trim(),
    techStack,
    existingContact,
    raw: item
  };
}

// =============================================================================
// INTERFACES
// =============================================================================

export interface JobSignalInsight {
  count: number;
  keyword: string;
  locationSummary: string;
  seniorityMix: string;
  remoteMix: string;
  salaryBand: string;
  companySummary: string;
  industryMatch: "high" | "medium" | "low";
  displaySummary: string;
  subtitle: string;
}

export interface SignalData {
  value: string;
  isLive: boolean;
  lastUpdated?: string;
  metadata?: JobSignalInsight;
  rawPayload?: any;
}

// =============================================================================
// PAGINATION
// =============================================================================

/**
 * Batch sizes for "load more" functionality
 * No default cap - users control their own datasets
 */
export const FETCH_LIMITS = {
  JOBS_BATCH: 50,         // Each "load more" batch
  SUPPLY_BATCH: 50,       // Each "load more" for supply
} as const;

export interface FetchOptions {
  limit?: number;
  offset?: number;
}

export interface SignalsConfig {
  apiKey: string;
  // Apify
  apifyToken?: string;  // Apify API token for authentication
  // Demand - Jobs (Apify)
  demandDatasetId?: string;  // Apify dataset ID for demand companies
  jobsApiUrl?: string;  // DEPRECATED: Full URL (backwards compat)
  jobRoleFilter?: string;
  jobIndustryFilter?: string;
  // Supply - Providers (Apify)
  supplyDatasetId?: string;  // Apify dataset ID for supply discovery
  supplyApiUrl?: string;  // DEPRECATED: Full URL (backwards compat)
  // Piloterr Funding
  piloterrApiKey?: string;
  fundingApiKey?: string;
  fundingDaysSince?: number;
  fundingInvestmentTypes?: string[];
  // Layoffs
  layoffsApiUrl?: string;
  layoffsApiKey?: string;
  // Hiring Velocity
  hiringApiUrl?: string;
  hiringApiKey?: string;
  // Tech/Tool Adoption
  techApiUrl?: string;
  techApiKey?: string;
}

const MOCK_DATA = {
  jobs: 'No jobs data - configure Apify dataset URL',
  jobsSubtitle: 'Add an Apify dataset URL in Settings to see live job signals',
  funding: 'No funding data - configure Piloterr API',
  layoffs: 'No layoffs data',
  hiringVelocity: 'No hiring velocity data',
  toolAdoption: 'No tech adoption data',
};

// =============================================================================
// CONFIG LOADER
// =============================================================================

export async function loadSignalsConfig(): Promise<SignalsConfig> {
  try {
    // Get authenticated user - required for RLS (defensive destructuring)
    const authResult = await supabase.auth.getUser();
    const user = authResult?.data?.user;

    // Guest mode: read from localStorage instead of DB
    if (!user?.id) {
      const cached = localStorage.getItem('guest_settings');
      console.log('[SignalsConfig] Guest mode, cached settings:', cached ? 'found' : 'NOT FOUND');
      if (cached) {
        const { settings } = JSON.parse(cached);
        console.log('[SignalsConfig] Guest dataset config:', {
          apifyToken: settings?.apifyToken ? 'SET' : 'MISSING',
          demandDatasetId: settings?.demandDatasetId || 'MISSING',
          supplyDatasetId: settings?.supplyDatasetId || 'MISSING',
        });
        return {
          apiKey: '',
          apifyToken: settings?.apifyToken || '',
          demandDatasetId: settings?.demandDatasetId || '',
          jobsApiUrl: '',
          jobRoleFilter: '',
          jobIndustryFilter: '',
          supplyDatasetId: settings?.supplyDatasetId || '',
          supplyApiUrl: '',
          piloterrApiKey: '',
          fundingApiKey: settings?.fundingApiKey || '',
          fundingDaysSince: 30,
          fundingInvestmentTypes: ['series_a', 'series_b'],
          layoffsApiUrl: settings?.layoffsQueryUrl || '',
          layoffsApiKey: settings?.layoffsApiKey || '',
          hiringApiUrl: settings?.hiringQueryUrl || '',
          hiringApiKey: settings?.hiringApiKey || '',
          techApiUrl: settings?.techQueryUrl || '',
          techApiKey: settings?.techApiKey || '',
        };
      }
      console.log('[SignalsConfig] Guest mode with NO cached settings - returning empty config');
    }

    const { data, error } = await supabase
      .from('operator_settings')
      .select('*')
      .eq('user_id', user?.id || '00000000-0000-0000-0000-000000000000')
      .maybeSingle();

    if (error) throw error;

    return {
      apiKey: data?.signals_api_key || '',
      // Apify
      apifyToken: data?.apify_token || '',
      // Demand - Jobs (Apify)
      demandDatasetId: data?.demand_dataset_id || '',
      jobsApiUrl: data?.jobs_api_url || '',  // DEPRECATED: backwards compat
      jobRoleFilter: data?.job_role_filter || '',
      jobIndustryFilter: data?.job_industry_filter || '',
      // Supply - Providers (Apify)
      supplyDatasetId: data?.supply_dataset_id || '',
      supplyApiUrl: data?.supply_api_url || '',  // DEPRECATED: backwards compat
      // Funding
      piloterrApiKey: data?.piloterr_api_key || '',
      fundingApiKey: data?.funding_api_key || data?.piloterr_api_key || '',
      fundingDaysSince: data?.funding_days_since || 30,
      fundingInvestmentTypes: data?.funding_investment_types || ['series_a', 'series_b'],
      // Other signals
      layoffsApiUrl: data?.layoffs_api_url || '',
      layoffsApiKey: data?.layoffs_api_key || '',
      hiringApiUrl: data?.hiring_api_url || '',
      hiringApiKey: data?.hiring_api_key || '',
      techApiUrl: data?.tech_api_url || '',
      techApiKey: data?.tech_api_key || '',
    };
  } catch (error) {
    console.error('Error loading signals config:', error);
    return {
      apiKey: '',
      apifyToken: '',
      demandDatasetId: '',
      jobsApiUrl: '',
      jobRoleFilter: '',
      jobIndustryFilter: '',
      supplyDatasetId: '',
      supplyApiUrl: '',
      piloterrApiKey: '',
      fundingApiKey: '',
      fundingDaysSince: 30,
      fundingInvestmentTypes: ['series_a', 'series_b'],
      layoffsApiUrl: '',
      layoffsApiKey: '',
      hiringApiUrl: '',
      hiringApiKey: '',
      techApiUrl: '',
      techApiKey: '',
    };
  }
}

// =============================================================================
// APIFY URL BUILDER
// =============================================================================

/**
 * Build Apify dataset URL from ID + token
 * Backwards compatible - if already a full URL, returns as-is
 */
export function buildApifyUrl(datasetIdOrUrl: string, token?: string): string {
  const input = (datasetIdOrUrl || '').trim();
  if (!input) return '';

  // If already a full URL, return as-is (backwards compatible)
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return input;
  }

  // Construct URL from dataset ID
  const base = `https://api.apify.com/v2/datasets/${input}/items`;
  return token ? `${base}?token=${token}` : base;
}

// =============================================================================
// APIFY JOBS FETCHER (Universal - works with ANY Apify scraper)
// =============================================================================

/**
 * Build URL with pagination parameters for Apify
 * Apify datasets support: ?limit=N&offset=M
 */
function buildPaginatedUrl(baseUrl: string, options?: FetchOptions): string {
  const url = new URL(baseUrl);

  // Apify defaults to ~250 records if no limit specified - we want ALL records by default
  // Use a high limit to get everything unless explicitly paginating
  if (options?.limit) {
    url.searchParams.set('limit', String(options.limit));
  } else if (!options?.offset) {
    // No limit and no offset = fetch ALL (use very high number)
    url.searchParams.set('limit', '100000');
  }

  if (options?.offset) {
    url.searchParams.set('offset', String(options.offset));
  }
  return url.toString();
}

/**
 * Process CSV data through the same pipeline as Apify data
 * Reuses extractJobLikeFields and buildJobInsight
 */
function processCsvJobData(
  csvData: any[],
  config: SignalsConfig,
  providerNiche?: string
): SignalData & { hasMore?: boolean; totalAvailable?: number } {
  try {
    // Detect dataset type
    const datasetType = detectDatasetType(csvData);
    console.log('[Jobs][CSV] Dataset type:', datasetType);

    // Extract job fields from each CSV row
    const jobs = csvData.map(item => extractJobLikeFields(item));

    // Apply filters if configured
    let filteredJobs = jobs;

    if (config.jobRoleFilter && config.jobRoleFilter.trim()) {
      const filterKeywords = safeLower(config.jobRoleFilter).split(/[,\s]+/).filter(k => k.length > 0);
      filteredJobs = filteredJobs.filter(job => {
        const titleLower = safeLower(job.title);
        return filterKeywords.some(kw => titleLower.includes(kw));
      });
      if (filteredJobs.length === 0) filteredJobs = jobs;
    }

    if (config.jobIndustryFilter && config.jobIndustryFilter.trim()) {
      const filterKeywords = safeLower(config.jobIndustryFilter).split(/[,\s]+/).filter(k => k.length > 0);
      const beforeFilter = filteredJobs.length;
      filteredJobs = filteredJobs.filter(job => {
        const combined = safeLower(job.companyName) + ' ' + safeLower(job.title);
        return filterKeywords.some(kw => combined.includes(kw));
      });
      if (filteredJobs.length === 0) filteredJobs = jobs.slice(0, beforeFilter);
    }

    // Build insight from extracted data
    const insight = buildJobInsight(filteredJobs, providerNiche);

    console.log('[Jobs][CSV] Processed:', filteredJobs.length, 'records from CSV');

    // Transform to format MatchingEngineV3 expects
    const normalizedJobs = filteredJobs.map(job => ({
      company: { name: job.companyName, url: job.companyUrl },
      company_name: job.companyName,
      employer_name: job.companyName,
      job_title: job.title,
      title: job.title,
      location: job.locationText,
      industry: job.industry,
      description: job.description,
      tech_stack: job.techStack,
      existingContact: job.existingContact,
      raw: job.raw,
    }));

    return {
      value: `${filteredJobs.length} records from CSV`,
      isLive: true,
      lastUpdated: new Date().toISOString(),
      metadata: insight,
      rawPayload: { data: normalizedJobs, original: csvData, datasetType, source: 'csv' },
    };
  } catch (error) {
    console.error('[Jobs][CSV] Processing failed:', error);
    return {
      value: `CSV Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      isLive: false,
      rawPayload: null,
    };
  }
}

/**
 * Fetch jobs from ANY Apify dataset URL OR CSV upload
 * Handles any JSON structure - LinkedIn, Indeed, Wellfound, etc.
 * Priority: CSV data > Apify dataset
 */
export async function fetchJobSignals(
  config: SignalsConfig,
  providerNiche?: string,
  options?: FetchOptions
): Promise<SignalData & { hasMore?: boolean; totalAvailable?: number }> {
  // Check for CSV data first (takes priority over Apify)
  const csvData = getCsvData('demand');
  if (csvData && csvData.length > 0) {
    console.log('[Jobs][CSV] Using CSV data:', csvData.length, 'records');
    return processCsvJobData(csvData, config, providerNiche);
  }

  // Build URL from dataset ID + token, or use legacy URL
  const baseUrl = config.demandDatasetId
    ? buildApifyUrl(config.demandDatasetId, config.apifyToken)
    : config.jobsApiUrl;

  // Only apply limit/offset if explicitly specified
  const effectiveOptions: FetchOptions = {
    limit: options?.limit,
    offset: options?.offset ?? 0,
  };

  console.log('[Jobs][Apify] URL:', baseUrl || '(none)', 'Limit:', effectiveOptions.limit || 'all', 'Offset:', effectiveOptions.offset);

  if (!baseUrl || baseUrl.trim() === '') {
    console.log('[Jobs][Apify] No URL configured');
    return {
      value: MOCK_DATA.jobs,
      isLive: false,
      metadata: createMockJobMetadata(),
    };
  }

  try {
    const url = buildPaginatedUrl(baseUrl, effectiveOptions);
    console.log('[Jobs][Apify] Fetching:', url);

    let response;
    try {
      response = await fetch(url);
    } catch (fetchErr) {
      console.warn('[Jobs][Apify] Fetch failed (network error):', fetchErr);
      return {
        value: 'Network error fetching jobs',
        isLive: false,
        rawPayload: null,
      };
    }

    if (!response || !response.ok) {
      console.error(`[Jobs][Apify] HTTP ${response?.status || 'unknown'}`);
      return {
        value: `Error: HTTP ${response?.status || 'unknown'}`,
        isLive: false,
        rawPayload: null,
      };
    }

    // Defensive JSON parsing
    let rawData;
    try {
      rawData = await response.json();
    } catch (jsonErr) {
      console.warn('[Jobs][Apify] JSON parse failed:', jsonErr);
      return {
        value: 'Invalid JSON response from Apify',
        isLive: false,
        rawPayload: null,
      };
    }

    console.log('[Jobs][Apify] Response received, type:', typeof rawData);

    // Defensive normalization - never crash
    let items: any[] = [];
    try {
      items = normalizeToItems(rawData);
      if (!Array.isArray(items)) {
        console.warn('[Jobs][Apify] normalizeToItems returned non-array, using []');
        items = [];
      }
    } catch (normErr) {
      console.warn('[Jobs][Apify] Normalization failed:', normErr);
      items = [];
    }

    console.log('[Jobs][Apify] Normalized items:', items.length);

    // Detect dataset type (curated contacts list vs jobs/signals)
    const datasetType = detectDatasetType(items);
    console.log('[Jobs][Apify] Dataset type:', datasetType);

    // === PRESSURE DETECTION WIRING ===
    // Run ONCE after real job items exist - MUST NOT block or break job fetch
    if (items.length > 0) {
      try {
        console.log('[Pressure] ran with', items.length, 'jobs');
        const pressureResult = processJobsDatasetForPressure(items);
        console.log('[Jobs][Apify] Pressure detection:', {
          detected: pressureResult.detection.pressureDetected,
          roleType: pressureResult.detection.roleType,
          confidence: pressureResult.detection.confidence
        });

        // Fire-and-forget Supabase persist - ultra-defensive, never crashes
        (async () => {
          try {
            // Get authenticated user - required for RLS (ultra-defensive)
            let userId = 'default';
            try {
              const authResult = await supabase.auth.getUser();
              userId = authResult?.data?.user?.id || '00000000-0000-0000-0000-000000000000';
            } catch (authErr) {
              console.warn('[Pressure] Auth check failed, using default:', authErr);
            }

            // Wrap Supabase call in its own try-catch
            let updateResult;
            try {
              updateResult = await supabase
                .from('operator_settings')
                .update({
                  synthesized_filters: pressureResult.filters,
                  pressure_detection: pressureResult.detection,
                  updated_at: new Date().toISOString()
                })
                .eq('user_id', userId);
            } catch (updateErr) {
              console.warn('[Pressure] Supabase update threw:', updateErr);
              return;
            }

            // Defensive access to result
            const error = updateResult?.error;
            if (error) {
              console.warn('[Pressure] Failed to persist:', error?.message || String(error));
            } else {
              console.log('[Pressure] Persisted to Supabase for user:', userId);
            }
          } catch (e) {
            console.warn('[Pressure] Unexpected persistence error:', e);
          }
        })();
      } catch (pressureError) {
        console.warn('[Pressure] Detection failed (non-fatal):', pressureError);
      }
    }
    // === END PRESSURE DETECTION WIRING ===

    if (items.length === 0) {
      return {
        value: 'No jobs found in Apify dataset',
        isLive: true,
        lastUpdated: new Date().toISOString(),
        rawPayload: rawData,
      };
    }

    // Extract fields from each item — BRANCH BY SCHEMA
    // Priority order: Crunchbase People → Crunchbase Orgs → Job/Contact
    const jobs = items.map(item => {
      // Check Crunchbase People FIRST (person permalink + no email)
      if (isCrunchbasePeopleRecord(item)) {
        // Crunchbase person — supply-intent, requires enrichment
        return extractCrunchbasePeopleSignals(item);
      }
      // Check Crunchbase Orgs (org permalink + funding)
      if (isCrunchbaseRecord(item)) {
        // Crunchbase org record — use isolated extraction path
        return extractCrunchbaseSignals(item);
      }
      // Job/contact record — use existing extraction (unchanged)
      return extractJobLikeFields(item);
    });

    // Log schema distribution (detects misclassification, protects against future scrapers)
    const countCrunchbaseOrgs = jobs.filter((j: any) => j.schemaId === 'crunchbase-orgs').length;
    const countCrunchbasePeople = jobs.filter((j: any) => j.schemaId === 'crunchbase-people').length;
    const countContacts = jobs.filter((j: any) => !j.schemaId && j.existingContact?.email).length;
    const countJobs = jobs.length - countCrunchbaseOrgs - countCrunchbasePeople - countContacts;
    console.info('[Ingestion]', {
      ingestionSummary: {
        crunchbaseOrgs: countCrunchbaseOrgs,
        crunchbasePeople: countCrunchbasePeople,
        jobs: countJobs,
        contacts: countContacts,
        total: jobs.length,
      }
    });

    // Apply filters if configured
    let filteredJobs = jobs;

    if (config.jobRoleFilter && config.jobRoleFilter.trim()) {
      const filterKeywords = safeLower(config.jobRoleFilter).split(/[,\s]+/).filter(k => k.length > 0);
      filteredJobs = filteredJobs.filter(job => {
        const titleLower = safeLower(job.title);
        return filterKeywords.some(kw => titleLower.includes(kw));
      });
      // If filter removed all jobs, fall back to unfiltered
      if (filteredJobs.length === 0) filteredJobs = jobs;
    }

    if (config.jobIndustryFilter && config.jobIndustryFilter.trim()) {
      const filterKeywords = safeLower(config.jobIndustryFilter).split(/[,\s]+/).filter(k => k.length > 0);
      const beforeFilter = filteredJobs.length;
      filteredJobs = filteredJobs.filter(job => {
        const combined = safeLower(job.companyName) + ' ' + safeLower(job.title);
        return filterKeywords.some(kw => combined.includes(kw));
      });
      // If filter removed all jobs, fall back to previous
      if (filteredJobs.length === 0) filteredJobs = jobs.slice(0, beforeFilter);
    }

    // Build insight from extracted data
    const insight = buildJobInsight(filteredJobs, providerNiche);

    console.log('[Jobs][Apify] Processed:', filteredJobs.length, 'jobs from', insight.companySummary);

    // Transform to format MatchingEngineV3 expects
    // IMPORTANT: Include existingContact, industry, description, techStack - these save API calls
    // Crunchbase records also include: schemaId, fundingDate, fundingType, fundingAmount
    const normalizedJobs = filteredJobs.map((job: any) => ({
      company: { name: job.companyName, url: job.companyUrl },
      company_name: job.companyName,
      employer_name: job.companyName,
      job_title: job.title,
      title: job.title,
      location: job.locationText,
      industry: job.industry,
      description: job.description,
      tech_stack: job.techStack,
      // Pre-extracted contact from dataset - skip enrichment if available
      existingContact: job.existingContact,
      raw: job.raw,
      // Crunchbase-specific fields (only present for schemaId === 'crunchbase-orgs')
      ...(job.schemaId && { schemaId: job.schemaId }),
      ...(job.fundingDate && { fundingDate: job.fundingDate }),
      ...(job.fundingType && { fundingType: job.fundingType }),
      ...(job.fundingAmount && { fundingAmount: job.fundingAmount }),
    }));

    return {
      value: insight.displaySummary,
      isLive: true,
      lastUpdated: new Date().toISOString(),
      metadata: insight,
      rawPayload: { data: normalizedJobs, original: rawData, datasetType },
    };
  } catch (error) {
    console.error('[Jobs][Apify] Fetch failed:', error);
    return {
      value: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      isLive: false,
      rawPayload: null,
    };
  }
}

function createMockJobMetadata(): JobSignalInsight {
  return {
    count: 0,
    keyword: 'roles',
    locationSummary: '',
    seniorityMix: '',
    remoteMix: '',
    salaryBand: '',
    companySummary: '',
    industryMatch: 'low',
    displaySummary: MOCK_DATA.jobs,
    subtitle: MOCK_DATA.jobsSubtitle,
  };
}

function buildJobInsight(
  jobs: Array<{ companyName: string; companyUrl: string; title: string; locationText: string; raw: any }>,
  providerNiche?: string
): JobSignalInsight {
  const count = jobs.length;

  // Count companies
  const companyCounts: Record<string, number> = {};
  jobs.forEach(job => {
    const company = job.companyName || 'Unknown';
    companyCounts[company] = (companyCounts[company] || 0) + 1;
  });
  const companies = Object.entries(companyCounts).sort((a, b) => b[1] - a[1]);
  const companyCount = companies.length;
  const topCompanies = companies.slice(0, 5).map(c => c[0]);

  // Extract most common keyword from titles
  const keyword = extractKeywordFromTitles(jobs.map(j => j.title));

  // Build seniority mix
  const seniorityMix = calculateSeniorityMix(jobs.map(j => j.title));

  // Build remote mix
  const remoteMix = calculateRemoteMix(jobs);

  // Build location summary
  const locationSummary = buildLocationSummary(jobs.map(j => j.locationText));

  // Company summary
  const companySummary = companyCount === 1
    ? `at ${topCompanies[0]}`
    : companyCount <= 3
    ? `across ${companyCount} companies`
    : `across ${companyCount}+ companies`;

  // Industry match
  const industryMatch = determineIndustryMatch(jobs, providerNiche);

  // Display summary: "X companies hiring (Company1, Company2, ...)"
  const displaySummary = companyCount === 1
    ? `${count} roles at ${topCompanies[0]}`
    : `${companyCount} companies hiring (${topCompanies.join(', ')})`;

  // Subtitle
  const subtitleParts: string[] = [];
  if (seniorityMix) subtitleParts.push(seniorityMix);
  if (remoteMix) subtitleParts.push(remoteMix);
  if (companySummary) subtitleParts.push(companySummary);
  const subtitle = subtitleParts.slice(0, 3).join(' • ');

  return {
    count,
    keyword,
    locationSummary,
    seniorityMix,
    remoteMix,
    salaryBand: '',
    companySummary,
    industryMatch,
    displaySummary,
    subtitle,
  };
}

function extractKeywordFromTitles(titles: string[]): string {
  const excludedWords = ['jobs', 'in', 'the', 'senior', 'sr', 'jr', 'junior', 'mid', 'entry', 'level', 'lead', 'staff', 'principal', 'head', 'vp', 'director', 'manager', 'remote', 'onsite', 'on-site', 'hybrid', 'role', 'position'];
  const wordCounts: Record<string, number> = {};

  titles.forEach(title => {
    const words = safeLower(title).split(/[\s\-_]+/).filter(w => w.length > 2 && !excludedWords.includes(w));
    words.forEach(word => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });
  });

  const sorted = Object.entries(wordCounts).sort((a, b) => b[1] - a[1]);
  return sorted.length > 0 ? sorted[0][0] : 'roles';
}

function calculateSeniorityMix(titles: string[]): string {
  const buckets = { junior: 0, mid: 0, senior: 0, exec: 0 };

  titles.forEach(title => {
    const t = safeLower(title);
    if (/\b(junior|jr|intern|trainee|entry)\b/.test(t)) {
      buckets.junior++;
    } else if (/\b(head|vp|vice president|director|chief|cxo|cto|cfo|coo|ceo)\b/.test(t)) {
      buckets.exec++;
    } else if (/\b(senior|sr|lead|principal|staff)\b/.test(t)) {
      buckets.senior++;
    } else {
      buckets.mid++;
    }
  });

  const total = titles.length || 1;
  const percentages = {
    junior: Math.round((buckets.junior / total) * 100),
    mid: Math.round((buckets.mid / total) * 100),
    senior: Math.round((buckets.senior / total) * 100),
    exec: Math.round((buckets.exec / total) * 100),
  };

  const sorted = Object.entries(percentages).sort((a, b) => b[1] - a[1]);

  if (sorted[0][1] >= 70) {
    return `mostly ${sorted[0][0]} roles`;
  }
  if (sorted[0][1] > 0 && sorted[1][1] > 20) {
    return `mix of ${sorted[0][0]}/${sorted[1][0]}`;
  }
  return 'mixed levels';
}

function calculateRemoteMix(jobs: Array<{ title: string; raw: any }>): string {
  let remote = 0;
  let hybrid = 0;
  let onsite = 0;

  jobs.forEach(job => {
    const raw = job.raw || {};
    const isRemoteField = raw.is_remote || raw.isRemote || raw.job_is_remote || raw.remote || false;
    const title = safeLower(job.title);
    const location = safeLower(raw.location ?? raw.job_location ?? '');
    const combined = title + ' ' + location;

    if (isRemoteField || /\b(remote|work from home|wfh)\b/.test(combined)) {
      if (/\b(hybrid|flexible)\b/.test(combined)) {
        hybrid++;
      } else {
        remote++;
      }
    } else if (/\b(hybrid|flexible)\b/.test(combined)) {
      hybrid++;
    } else {
      onsite++;
    }
  });

  const total = jobs.length || 1;
  const remotePct = Math.round(((remote + hybrid * 0.5) / total) * 100);
  const onsitePct = 100 - remotePct;

  if (remotePct >= 60) return `${Math.round(remotePct / 10) * 10}% remote`;
  if (onsitePct >= 60) return `${Math.round(onsitePct / 10) * 10}% onsite`;
  return 'mix of remote/onsite';
}

function buildLocationSummary(locations: string[]): string {
  const locationCounts: Record<string, number> = {};

  locations.forEach(loc => {
    if (loc && loc.length > 0) {
      locationCounts[loc] = (locationCounts[loc] || 0) + 1;
    }
  });

  const sorted = Object.entries(locationCounts).sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) return '';
  if (sorted[0][1] >= locations.length * 0.3) {
    return `in ${sorted[0][0]}`;
  }
  return sorted.length > 3 ? 'multiple locations' : '';
}

function determineIndustryMatch(
  jobs: Array<{ companyName: string; title: string; raw: any }>,
  providerNiche?: string
): 'high' | 'medium' | 'low' {
  if (!providerNiche) return 'medium';

  const nicheLower = safeLower(providerNiche);
  let matchCount = 0;

  jobs.forEach(job => {
    const combined = safeLower(job.companyName) + ' ' + safeLower(job.title);
    const raw = job.raw || {};
    const industry = safeLower(raw.industry ?? raw.job_industry ?? raw.sector ?? '');
    const allText = combined + ' ' + industry;

    // Check for common industry keywords
    if (nicheLower.includes('saas') && /\b(saas|software|product|b2b)\b/.test(allText)) matchCount++;
    if (nicheLower.includes('logistics') && /\b(logistics|trucking|warehouse|transport|supply chain)\b/.test(allText)) matchCount++;
    if (nicheLower.includes('fintech') && /\b(fintech|finance|banking|financial)\b/.test(allText)) matchCount++;
    if (nicheLower.includes('health') && /\b(health|healthcare|healthtech|medical)\b/.test(allText)) matchCount++;
  });

  const matchRate = matchCount / (jobs.length || 1);
  if (matchRate >= 0.5) return 'high';
  if (matchRate >= 0.2) return 'medium';
  return 'low';
}

// =============================================================================
// FUNDING SIGNALS (Piloterr)
// =============================================================================

export async function fetchFundingSignals(config: SignalsConfig): Promise<SignalData & { fundingRounds?: any[] }> {
  const apiKey = config.fundingApiKey || config.piloterrApiKey || config.apiKey;

  console.log('[Funding][Piloterr] API Key:', apiKey ? 'yes' : 'no');

  if (!apiKey || apiKey.trim() === '') {
    console.log('[Funding][Piloterr] No API key configured');
    return {
      value: MOCK_DATA.funding,
      isLive: false,
      rawPayload: null,
    };
  }

  try {
    const { fetchPiloterrFunding, formatFundingSummary } = await import('./PiloterrFundingService');

    const result = await fetchPiloterrFunding(apiKey, {
      days_since_announcement: config.fundingDaysSince || 30,
      limit: 10,
    });

    if (!result.isLive || result.rounds.length === 0) {
      console.log('[Funding][Piloterr] No results');
      return {
        value: MOCK_DATA.funding,
        isLive: false,
        rawPayload: null,
      };
    }

    const summary = formatFundingSummary(result);
    console.log('[Funding][Piloterr] Summary:', summary);

    return {
      value: summary,
      isLive: true,
      lastUpdated: new Date().toISOString(),
      rawPayload: result.rounds,
      fundingRounds: result.rounds,
    };
  } catch (error) {
    console.error('[Funding][Piloterr] Fetch failed:', error);
    return {
      value: MOCK_DATA.funding,
      isLive: false,
      rawPayload: null,
    };
  }
}

// =============================================================================
// OTHER SIGNALS (Layoffs, Hiring Velocity, Tech)
// =============================================================================

async function callGenericApi(
  url: string | undefined,
  apiKey: string | undefined,
  mockValue: string,
  signalType: string
): Promise<{ value: string; isLive: boolean; rawPayload?: any }> {
  if (!url || url.trim() === '') {
    console.log(`[${signalType}] No URL configured`);
    return { value: mockValue, isLive: false, rawPayload: null };
  }

  try {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };

    if (apiKey && apiKey.trim() !== '') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      console.error(`[${signalType}] HTTP ${response.status}`);
      return { value: mockValue, isLive: false, rawPayload: null };
    }

    const data = await response.json();

    // Extract summary from response
    const value = safeText(data.summary ?? data.value ?? data.message) ||
                  (data.count ? `${data.count} records` : mockValue);

    return { value, isLive: true, rawPayload: data };
  } catch (error) {
    console.error(`[${signalType}] Fetch failed:`, error);
    return { value: mockValue, isLive: false, rawPayload: null };
  }
}

export async function fetchLayoffSignals(config: SignalsConfig): Promise<SignalData> {
  const result = await callGenericApi(
    config.layoffsApiUrl,
    config.layoffsApiKey || config.apiKey,
    MOCK_DATA.layoffs,
    'Layoffs'
  );

  return {
    value: result.value,
    isLive: result.isLive,
    lastUpdated: result.isLive ? new Date().toISOString() : undefined,
    rawPayload: result.rawPayload,
  };
}

export async function fetchHiringVelocitySignals(config: SignalsConfig): Promise<SignalData> {
  const result = await callGenericApi(
    config.hiringApiUrl,
    config.hiringApiKey || config.apiKey,
    MOCK_DATA.hiringVelocity,
    'Hiring'
  );

  return {
    value: result.value,
    isLive: result.isLive,
    lastUpdated: result.isLive ? new Date().toISOString() : undefined,
    rawPayload: result.rawPayload,
  };
}

export async function fetchToolAdoptionSignals(config: SignalsConfig): Promise<SignalData> {
  const result = await callGenericApi(
    config.techApiUrl,
    config.techApiKey || config.apiKey,
    MOCK_DATA.toolAdoption,
    'Tech'
  );

  return {
    value: result.value,
    isLive: result.isLive,
    lastUpdated: result.isLive ? new Date().toISOString() : undefined,
    rawPayload: result.rawPayload,
  };
}
