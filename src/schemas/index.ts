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
// ALL SCHEMAS
// =============================================================================

export const SCHEMAS: Schema[] = [B2B_CONTACTS, STARTUP_JOBS];

// =============================================================================
// DETECTION
// =============================================================================

/**
 * Detect which schema a dataset belongs to.
 * Returns null if unknown (reject the dataset).
 */
export function detectSchema(sample: any): Schema | null {
  if (!sample || typeof sample !== 'object') {
    return null;
  }

  // Check B2B Contacts fingerprint
  if (
    'first_name' in sample &&
    'company_domain' in sample
  ) {
    return B2B_CONTACTS;
  }

  // Check Startup Jobs fingerprint
  if (
    'job_id' in sample &&
    'job_title' in sample &&
    'job_url' in sample
  ) {
    return STARTUP_JOBS;
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
 */
export function normalize(record: any, schema: Schema): NormalizedRecord {
  const { fields } = schema;

  // Extract domain, clean it
  let domain = getNestedValue(record, fields.domain) || '';
  domain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

  // Extract ALL fields from raw - schema-aware
  const isLeadsFinder = schema.id === 'b2b-contacts';
  const isWellfound = schema.id === 'startup-jobs';

  // Wellfound: Extract company nested fields
  const wellfoundCompany = isWellfound && record.company ? record.company : null;

  return {
    // Contact
    firstName: getNestedValue(record, fields.firstName) || '',
    lastName: getNestedValue(record, fields.lastName) || '',
    fullName: getNestedValue(record, fields.fullName) || '',
    email: getNestedValue(record, fields.email) || null,
    title: getNestedValue(record, fields.title) || '',
    linkedin: getNestedValue(record, fields.linkedin) || null,
    headline: isLeadsFinder ? (record.headline || null) : null,
    seniorityLevel: isLeadsFinder ? (record.seniority_level || null) : null,

    // Company - extract ALL available fields from both scrapers
    company: getNestedValue(record, fields.company) || '',
    domain,
    industry: getNestedValue(record, fields.industry) || null,
    size: getNestedValue(record, fields.size) || null,
    // Leads Finder company fields
    companyDescription: isLeadsFinder
      ? (record.company_description || null)
      : (wellfoundCompany?.description || wellfoundCompany?.tagline || null),
    companyFunding: isLeadsFinder
      ? (record.company_total_funding || record.company_total_funding_clean || null)
      : (wellfoundCompany?.total_funding || wellfoundCompany?.funding || null),
    companyRevenue: isLeadsFinder ? (record.company_annual_revenue || record.company_annual_revenue_clean || null) : null,
    companyFoundedYear: isLeadsFinder
      ? (record.company_founded_year || null)
      : (wellfoundCompany?.founded_year || wellfoundCompany?.year_founded || null),
    companyLinkedin: isLeadsFinder ? (record.company_linkedin || null) : null,

    // Signal — event-only, no enrichment fallback
    signal: getNestedValue(record, fields.signal) || '',
    signalDetail: getNestedValue(record, fields.signalDetail) || null, // No job_description fallback

    // Location - extract from both scrapers
    city: isLeadsFinder
      ? (record.city || record.company_city || null)
      : (wellfoundCompany?.city || wellfoundCompany?.location?.split(',')[0]?.trim() || null),
    state: isLeadsFinder ? (record.state || record.company_state || null) : null,
    country: isLeadsFinder
      ? (record.country || record.company_country || null)
      : (wellfoundCompany?.country || null),

    // Meta
    schemaId: schema.id,
    raw: record,
  };
}

/**
 * Normalize entire dataset.
 */
export function normalizeDataset(dataset: any[], schema: Schema): NormalizedRecord[] {
  return dataset.map(record => normalize(record, schema));
}
