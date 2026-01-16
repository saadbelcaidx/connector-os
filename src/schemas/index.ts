/**
 * SCHEMAS — The Constitution
 *
 * Two scrapers. Known fields. No guessing.
 *
 * "If schemas aren't locked, everything above lies."
 */

// =============================================================================
// TYPES
// =============================================================================

export interface SchemaField {
  path: string;  // dot notation for nested fields
  required?: boolean;
}

export interface Schema {
  id: string;
  name: string;
  description: string;
  recommendation: string;  // What we recommend (user-facing)
  icon: string;  // Lucide icon name
  affiliateUrl: string;
  sides: ('demand' | 'supply')[];
  hasContacts: boolean;

  // Fields that uniquely identify this schema
  fingerprint: string[];

  // Field mappings to common shape
  fields: {
    // Contact
    firstName: string | null;
    lastName: string | null;
    fullName: string | null;
    email: string | null;
    title: string | null;
    linkedin: string | null;

    // Company
    company: string;
    domain: string;
    industry: string | null;
    size: string | null;

    // Signal
    signal: string;
    signalDetail: string | null;
  };
}

/**
 * Domain source confidence levels:
 * - explicit: Domain field exists in raw data (website, company_domain, etc.)
 * - trusted_inferred: Derived from trusted source (crunchbase permalink, verified org website)
 * - none: No domain available — record should skip email enrichment
 *
 * CRITICAL: We NEVER guess domain from company name. "Acme Corp" → "acmecorp.com" is wrong too often.
 * Wrong domain = wrong person = wasted credits + bad intros + spam risk.
 */
export type DomainSource = 'explicit' | 'trusted_inferred' | 'none';

export interface NormalizedRecord {
  // Contact
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  title: string;
  linkedin: string | null;
  headline: string | null;
  seniorityLevel: string | null;

  // Company
  company: string;
  domain: string;
  domainSource: DomainSource;  // PHILEMON: Track where domain came from
  industry: string | string[] | null;
  size: string | string[] | null;
  companyDescription: string | null;
  companyFunding: string | null;
  companyRevenue: string | null;
  companyFoundedYear: string | null;
  companyLinkedin: string | null;

  // Signal
  signal: string;
  signalDetail: string | null;

  // Location
  city: string | null;
  state: string | null;
  country: string | null;

  // Meta
  schemaId: string;
  raw: any;
}

// =============================================================================
// SCHEMA: B2B Contacts (Leads Finder)
// =============================================================================

export const B2B_CONTACTS: Schema = {
  id: 'b2b-contacts',
  name: 'B2B Contacts',
  description: 'People with emails at companies',
  recommendation: 'Best for supply — contacts with verified emails',
  icon: 'Users',
  affiliateUrl: 'https://apify.com/code_crafter/leads-finder',
  sides: ['demand', 'supply'],
  hasContacts: true,

  // Unique fingerprint
  fingerprint: ['first_name', 'company_domain', 'seniority_level'],

  fields: {
    // Contact
    firstName: 'first_name',
    lastName: 'last_name',
    fullName: 'full_name',
    email: 'email',
    title: 'job_title',
    linkedin: 'linkedin',

    // Company
    company: 'company_name',
    domain: 'company_domain',
    industry: 'industry',
    size: 'company_size',

    // Signal — event-only, no enrichment in signalDetail
    signal: 'job_title',
    signalDetail: null, // headline is enrichment, not event
  },
};

// =============================================================================
// SCHEMA: Startup Jobs (Wellfound)
// =============================================================================

export const STARTUP_JOBS: Schema = {
  id: 'startup-jobs',
  name: 'Startup Jobs',
  description: 'Job listings from startups',
  recommendation: 'Best for demand — hiring signals from startups',
  icon: 'Briefcase',
  affiliateUrl: 'https://apify.com/radeance/wellfound-job-listings-scraper',
  sides: ['demand'],
  hasContacts: false,

  // Unique fingerprint
  fingerprint: ['job_id', 'job_title', 'job_url'],

  fields: {
    // Contact - none, needs enrichment
    firstName: null,
    lastName: null,
    fullName: null,
    email: null,
    title: null,
    linkedin: null,

    // Company (nested)
    company: 'company.name',
    domain: 'company.url',
    industry: 'company.category',
    size: 'company.team_members',

    // Signal — event-only, no enrichment in signalDetail
    signal: 'job_title',
    signalDetail: null, // job_description is enrichment, not event
  },
};

// =============================================================================
// EXTENDED FIELDS FOR WELLFOUND (extracted in normalize)
// =============================================================================
// These fields exist in raw Wellfound data but aren't in schema.fields:
// - company.description / company.tagline
// - company.total_funding
// - company.company_stage
// - company.location
// - job_type (Full-time, Contract, etc.)
// - posted_date
// - compensation_range

// =============================================================================
// SCHEMA: Crunchbase Organizations (Funded Companies)
// =============================================================================

export const CRUNCHBASE_ORGS: Schema = {
  id: 'crunchbase-orgs',
  name: 'Crunchbase Organizations',
  description: 'Funded companies with recent funding events',
  recommendation: 'Best for demand — funding signals from funded startups',
  icon: 'Building2',
  affiliateUrl: 'https://apify.com/curious_coder/crunchbase-search-companies',
  sides: ['demand', 'supply'],  // Companies can be both buyers AND sellers
  hasContacts: false,  // Crunchbase has company data, not contact emails

  // Unique fingerprint: Crunchbase has 'link' (permalink) and funding fields
  fingerprint: ['link', 'name'],

  fields: {
    // Contact - none in Crunchbase orgs, needs enrichment
    firstName: null,
    lastName: null,
    fullName: null,
    email: null,
    title: null,
    linkedin: null,

    // Company
    company: 'name',
    domain: 'website.value',  // Nested: website.value contains URL
    industry: null,  // Will extract from categories in normalize
    size: 'num_employees_enum',

    // Signal — NOT used for Crunchbase (funding comes from metadata)
    signal: '',  // Empty - signals derived from funding metadata
    signalDetail: null,
  },
};

// =============================================================================
// SCHEMA: Crunchbase People (Supply-Intent, Requires Enrichment)
// =============================================================================

export const CRUNCHBASE_PEOPLE: Schema = {
  id: 'crunchbase-people',
  name: 'Crunchbase People',
  description: 'Decision makers from funded companies (requires enrichment)',
  recommendation: 'Supply-intent — becomes real supply after enrichment',
  icon: 'UserCircle',
  affiliateUrl: 'https://apify.com/curious_coder/crunchbase-search-companies',
  sides: ['supply'],  // SUPPLY-INTENT, not demand
  hasContacts: false,  // NO contacts until enriched — this is doctrine

  // Unique fingerprint: Crunchbase person page + person-specific fields
  fingerprint: ['primary_job_title', 'primary_organization'],

  fields: {
    // Contact - NO EMAIL in raw data (requires enrichment)
    firstName: 'first_name',
    lastName: 'last_name',
    fullName: null,  // Will derive from first_name + last_name
    email: null,  // NEVER present in raw — must enrich
    title: 'primary_job_title',
    linkedin: null,

    // Company (from primary_organization)
    company: 'primary_organization.value',
    domain: null,  // Must derive from primary_organization or enrich
    industry: null,
    size: null,

    // Signal — not applicable for supply-intent
    signal: 'primary_job_title',
    signalDetail: null,
  },
};

// =============================================================================
// ALL SCHEMAS
// =============================================================================

export const SCHEMAS: Schema[] = [B2B_CONTACTS, STARTUP_JOBS, CRUNCHBASE_ORGS, CRUNCHBASE_PEOPLE];

// =============================================================================
// DETECTION
// =============================================================================

/**
 * Detect which schema a dataset belongs to.
 * Returns null if unknown (reject the dataset).
 *
 * ORDER MATTERS: Check specific schemas first, then flexible ones.
 * Crunchbase → Startup Jobs → B2B Contacts (most flexible, last)
 */
export function detectSchema(sample: any): Schema | null {
  if (!sample || typeof sample !== 'object') {
    return null;
  }

  // =========================================================================
  // 1. CRUNCHBASE ORGANIZATIONS (check FIRST — has 'link' with crunchbase.com)
  // =========================================================================
  if (
    'link' in sample &&
    'name' in sample &&
    (sample.link as string)?.includes('crunchbase.com')
  ) {
    return CRUNCHBASE_ORGS;
  }

  // =========================================================================
  // 2. CRUNCHBASE PEOPLE (check second — has type='person')
  // =========================================================================
  if (
    sample.type === 'person' &&
    sample.identifier?.entity_def_id === 'person' &&
    typeof sample.name === 'string' &&
    sample.name.length > 0
  ) {
    return CRUNCHBASE_PEOPLE;
  }

  // =========================================================================
  // 3. STARTUP JOBS (Wellfound — has job_id + job_title + job_url)
  // =========================================================================
  if (
    'job_id' in sample &&
    'job_title' in sample &&
    'job_url' in sample
  ) {
    return STARTUP_JOBS;
  }

  // =========================================================================
  // 4. B2B CONTACTS (most flexible — LAST to avoid false positives)
  // Requires PERSON-specific fields (first_name OR email), not just 'name'
  // =========================================================================
  const hasPersonName = 'first_name' in sample || 'firstName' in sample ||
                        'full_name' in sample || 'fullName' in sample;
  const hasEmail = 'email' in sample || 'work_email' in sample || 'contact_email' in sample;
  const hasDomain = 'company_domain' in sample || 'domain' in sample || 'companyDomain' in sample;
  const hasCompany = 'company' in sample || 'company_name' in sample || 'companyName' in sample || 'organization' in sample;
  const hasJobTitle = 'job_title' in sample || 'title' in sample || 'position' in sample;

  // B2B Contacts: has person-specific name OR email, plus company context
  if ((hasPersonName || hasEmail) && (hasDomain || hasCompany || hasJobTitle)) {
    return B2B_CONTACTS;
  }

  // Unknown schema
  return null;
}

/**
 * Validate a full dataset.
 * Returns schema if valid, null if rejected.
 */
export function validateDataset(dataset: any[]): {
  valid: boolean;
  schema: Schema | null;
  error?: string;
} {
  if (!Array.isArray(dataset) || dataset.length === 0) {
    return { valid: false, schema: null, error: 'Dataset is empty' };
  }

  const schema = detectSchema(dataset[0]);

  if (!schema) {
    return {
      valid: false,
      schema: null,
      error: 'Use our supported data source.',
    };
  }

  return { valid: true, schema };
}

/**
 * Validate a dataset for use as SUPPLY.
 * Checks: schema detected + schema.sides includes 'supply'.
 *
 * ALLOWLIST: The schema's `sides` property is the canonical supply allowlist.
 * - 'b2b-contacts': sides: ['demand', 'supply'] ✓
 * - 'crunchbase-people': sides: ['supply'] ✓
 * - 'startup-jobs': sides: ['demand'] ✗
 * - 'crunchbase-orgs': sides: ['demand'] ✗
 */
export function validateSupplyDataset(dataset: any[]): {
  valid: boolean;
  schema: Schema | null;
  error?: string;
} {
  // First, validate schema detection
  const baseValidation = validateDataset(dataset);
  if (!baseValidation.valid || !baseValidation.schema) {
    return baseValidation;
  }

  // Check supply allowlist via sides property
  if (!baseValidation.schema.sides.includes('supply')) {
    return {
      valid: false,
      schema: baseValidation.schema,
      error: `Schema '${baseValidation.schema.id}' is not allowed as supply. Only schemas with sides: ['supply'] are permitted.`,
    };
  }

  return { valid: true, schema: baseValidation.schema };
}

// =============================================================================
// NORMALIZATION
// =============================================================================

/**
 * Get nested value using dot notation.
 * "company.name" → obj.company.name
 */
function getNestedValue(obj: any, path: string | null): any {
  if (!path) return null;

  return path.split('.').reduce((acc, part) => {
    return acc && acc[part] !== undefined ? acc[part] : null;
  }, obj);
}

/**
 * Normalize a raw record to common shape.
 * Extracts ALL available fields from raw data - nothing left behind.
 *
 * PHILEMON: Domain source tracking for proof-based enrichment.
 * We NEVER guess domain from company name — wrong domain = wasted credits + spam.
 */
export function normalize(record: any, schema: Schema): NormalizedRecord {
  const { fields } = schema;

  // Extract ALL fields from raw - schema-aware
  const isLeadsFinder = schema.id === 'b2b-contacts';
  const isWellfound = schema.id === 'startup-jobs';
  const isCrunchbase = schema.id === 'crunchbase-orgs';
  const isCrunchbasePeople = schema.id === 'crunchbase-people';

  // B2B Contacts: Flexible field extraction (different scrapers use different names)
  let rawDomain: string = '';
  if (isLeadsFinder) {
    const d = record.company_domain || record.domain || record.companyDomain ||
              record.company_url || record.website || record.company_website || '';
    rawDomain = typeof d === 'string' ? d : (d?.value || d?.url || String(d || ''));
  } else {
    const nested = getNestedValue(record, fields.domain);
    rawDomain = typeof nested === 'string' ? nested : (nested?.value || nested?.url || String(nested || ''));
  }
  let domain = rawDomain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

  // PHILEMON: Track domain source for proof-based enrichment
  let domainSource: DomainSource = 'none';

  // Wellfound: Extract company nested fields
  const wellfoundCompany = isWellfound && record.company ? record.company : null;

  // Crunchbase People: Extract person-specific fields
  let crunchbasePeopleFullName: string = '';
  let crunchbasePeopleCompany: string = '';
  if (isCrunchbasePeople) {
    const firstName = record.first_name || '';
    const lastName = record.last_name || '';
    crunchbasePeopleFullName = firstName && lastName
      ? `${firstName} ${lastName}`
      : record.name || 'Unknown Person';
    crunchbasePeopleCompany = record.primary_organization?.value ||
      record.primary_organization?.name ||
      (typeof record.primary_organization === 'string' ? record.primary_organization : '') ||
      '';
  }

  // Crunchbase (Orgs + People): Extract categories and location
  let crunchbaseIndustry: string | null = null;
  let crunchbaseCity: string | null = null;
  let crunchbaseCountry: string | null = null;
  if (isCrunchbase || isCrunchbasePeople) {
    // Categories from categories[].value or category_groups[].value
    const categories = record.categories || record.category_groups || [];
    if (Array.isArray(categories) && categories.length > 0) {
      crunchbaseIndustry = categories.map((c: any) => c.value || c).filter(Boolean).join(', ');
    }
    // Location from location_identifiers[].value
    const locations = record.location_identifiers || [];
    if (Array.isArray(locations) && locations.length > 0) {
      // First is usually city, last is usually country
      crunchbaseCity = locations[0]?.value || null;
      if (locations.length > 1) {
        crunchbaseCountry = locations[locations.length - 1]?.value || null;
      }
    }
  }

  // PHILEMON: Determine domain source (proof-based, never guess)
  if (domain) {
    // Domain came from explicit field in raw data
    domainSource = 'explicit';
  } else if (isCrunchbase && record.website?.value) {
    // Crunchbase orgs: website.value is a trusted source
    const cbWebsite = record.website.value;
    domain = cbWebsite.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    domainSource = 'trusted_inferred';
  } else if (isCrunchbasePeople && record.primary_organization?.permalink) {
    // Crunchbase people: Try to get domain from org's permalink → lookup
    // NOTE: We do NOT infer "companyname.com" from company name — that's risky
    // The record stays domainSource='none' and will skip enrichment
    domainSource = 'none';
  } else {
    // No proven domain source — record will skip email enrichment
    domainSource = 'none';
  }

  // Log domain source for debugging
  const derivedCompany = isCrunchbasePeople ? crunchbasePeopleCompany : (getNestedValue(record, fields.company) || '');
  if (domainSource === 'none' && derivedCompany) {
    console.log(`[normalize] SKIP_DOMAIN: ${derivedCompany} has no proven domain (will skip enrichment)`);
  }

  // B2B Contacts: Flexible field extraction for all fields
  const b2bFirstName = isLeadsFinder
    ? (record.first_name || record.firstName || record.name?.split(' ')[0] || '')
    : (getNestedValue(record, fields.firstName) || '');
  const b2bLastName = isLeadsFinder
    ? (record.last_name || record.lastName || record.name?.split(' ').slice(1).join(' ') || '')
    : (getNestedValue(record, fields.lastName) || '');
  const b2bFullName = isLeadsFinder
    ? (record.full_name || record.fullName || record.name || `${b2bFirstName} ${b2bLastName}`.trim() || '')
    : (getNestedValue(record, fields.fullName) || '');
  const b2bEmail = isLeadsFinder
    ? (record.email || record.work_email || record.contact_email || record.business_email || null)
    : (getNestedValue(record, fields.email) || null);
  const b2bTitle = isLeadsFinder
    ? (record.job_title || record.title || record.position || record.role || '')
    : (getNestedValue(record, fields.title) || '');
  const b2bLinkedin = isLeadsFinder
    ? (record.linkedin || record.linkedin_url || record.linkedinUrl || record.person_linkedin_url || null)
    : (getNestedValue(record, fields.linkedin) || null);
  const b2bCompany = isLeadsFinder
    ? (record.company_name || record.company || record.companyName || record.organization || '')
    : (getNestedValue(record, fields.company) || '');

  return {
    // Contact
    firstName: b2bFirstName,
    lastName: b2bLastName,
    fullName: isCrunchbasePeople ? crunchbasePeopleFullName : b2bFullName,
    email: b2bEmail,  // ALWAYS null for Crunchbase People (supply-intent)
    title: b2bTitle,
    linkedin: b2bLinkedin,
    headline: isLeadsFinder ? (record.headline || null) : null,
    seniorityLevel: isLeadsFinder ? (record.seniority_level || record.seniorityLevel || null) : null,

    // Company - extract ALL available fields from all scrapers
    company: isCrunchbasePeople ? crunchbasePeopleCompany : b2bCompany,
    domain,
    domainSource,  // PHILEMON: Track domain provenance for proof-based enrichment
    industry: isCrunchbase ? crunchbaseIndustry : (getNestedValue(record, fields.industry) || null),
    size: getNestedValue(record, fields.size) || null,
    // Company description/funding - schema-aware
    companyDescription: isLeadsFinder
      ? (record.company_description || null)
      : isCrunchbase
        ? (record.short_description || null)
        : (wellfoundCompany?.description || wellfoundCompany?.tagline || null),
    companyFunding: isLeadsFinder
      ? (record.company_total_funding || record.company_total_funding_clean || null)
      : isCrunchbase
        ? (record.last_funding_total?.value_usd || record.last_equity_funding_total?.value_usd || null)
        : (wellfoundCompany?.total_funding || wellfoundCompany?.funding || null),
    companyRevenue: isLeadsFinder
      ? (record.company_annual_revenue || record.company_annual_revenue_clean || null)
      : isCrunchbase
        ? (record.revenue_range || null)
        : null,
    companyFoundedYear: isLeadsFinder
      ? (record.company_founded_year || null)
      : (wellfoundCompany?.founded_year || wellfoundCompany?.year_founded || null),
    companyLinkedin: isLeadsFinder ? (record.company_linkedin || null) : null,

    // Signal — event-only, no enrichment fallback
    // Crunchbase: signal is empty, funding signals created in Flow.tsx from metadata
    signal: getNestedValue(record, fields.signal) || '',
    signalDetail: getNestedValue(record, fields.signalDetail) || null,

    // Location - extract from all scrapers
    city: isLeadsFinder
      ? (record.city || record.company_city || null)
      : (isCrunchbase || isCrunchbasePeople)
        ? crunchbaseCity
        : (wellfoundCompany?.city || wellfoundCompany?.location?.split(',')[0]?.trim() || null),
    state: isLeadsFinder ? (record.state || record.company_state || null) : null,
    country: isLeadsFinder
      ? (record.country || record.company_country || null)
      : (isCrunchbase || isCrunchbasePeople)
        ? crunchbaseCountry
        : (wellfoundCompany?.country || null),

    // Meta
    schemaId: schema.id,
    raw: record,
  };
}

/**
 * Normalize entire dataset.
 *
 * PHILEMON: Non-fatal batch processing with domain source tracking.
 * Records with domainSource='none' are kept but will skip enrichment.
 * Batch stays alive — we never throw.
 */
export function normalizeDataset(dataset: any[], schema: Schema): NormalizedRecord[] {
  const records = dataset.map(record => normalize(record, schema));

  // PHILEMON: Categorize by domain source (non-fatal logging)
  const explicit = records.filter(r => r.domainSource === 'explicit');
  const trustedInferred = records.filter(r => r.domainSource === 'trusted_inferred');
  const noDomain = records.filter(r => r.domainSource === 'none');

  console.log(`[normalizeDataset] Batch summary: ${records.length} total`);
  console.log(`  ✓ explicit domain: ${explicit.length}`);
  console.log(`  ✓ trusted_inferred: ${trustedInferred.length}`);
  console.log(`  ⚠ no domain (skip enrichment): ${noDomain.length}`);

  // Records with domainSource='none' will be skipped at enrichment time
  // We keep them in the batch for visibility (UI shows "needs domain")
  return records;
}
