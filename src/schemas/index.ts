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

/**
 * SignalType — Schema-level signal classification (user.txt contract).
 * This is the TYPE of signal the schema represents, not the instance.
 * - 'hiring': Job postings (Wellfound)
 * - 'person': People/founders (Crunchbase People)
 * - 'company': Organizations with funding/activity (Crunchbase Orgs)
 * - 'contact': B2B contacts with emails (Leads Finder)
 */
export type SignalType = 'hiring' | 'person' | 'company' | 'contact';

export interface Schema {
  id: string;
  name: string;
  description: string;
  recommendation: string;  // What we recommend (user-facing)
  icon: string;  // Lucide icon name
  affiliateUrl: string;
  sides: ('demand' | 'supply')[];
  hasContacts: boolean;

  // === SIGNAL TYPE (user.txt contract) ===
  signalType: SignalType;  // What type of signal this schema represents

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

/**
 * SignalKind — Record-level signal classification.
 * Schema can provide defaultKind, but normalization emits truth per row.
 * This replaces the broken "assume everything is hiring" pattern.
 */
export type SignalKind =
  | 'HIRING_ROLE'    // Job posting — "Hiring Senior Engineer"
  | 'PERSON_ROLE'    // Person/founder — "CTO at Stripe"
  | 'FUNDING'        // Funding event — "Raised Series B"
  | 'ACQUISITION'    // M&A — "Acquired by Google"
  | 'CONTACT_ROLE'   // B2B contact — "VP Sales"
  | 'GROWTH'         // Growth signal — "Expanding to Europe"
  | 'UNKNOWN';       // Fallback — no assumptions

/**
 * SignalMeta — The truth about what this record represents.
 * UI renders label only. No prefixes. No string concatenation.
 * Normalization tells the truth once. UI stays dumb.
 */
export interface SignalMeta {
  kind: SignalKind;
  label: string;    // Final human-readable truth: "CTO at Stripe", "Hiring 5 engineers"
  source: string;   // Which field produced this: "primary_job_title", "job_title", etc.
}

export interface NormalizedRecord {
  // === IDENTITY (stable, non-null, never domain-based) ===
  recordKey: string;  // Stable key: "cb_person:uuid", "job:wellfound:123", "contact:email"

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

  // === SIGNAL (record-level truth, not schema assumption) ===
  signalMeta: SignalMeta;  // The truth about what this record represents
  // Legacy fields (deprecated — use signalMeta.label instead)
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
  signalType: 'contact',  // B2B contacts with emails

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
  signalType: 'hiring',  // Job postings — the ONLY true hiring signal

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
    size: 'company.size',  // "11-50", "51-200", etc.

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
  signalType: 'company',  // Organizations with funding/activity

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
  signalType: 'person',  // People/founders — NOT hiring

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
  // Also supports CSV field names: "Full Name", "Email", "Domain", etc.
  // =========================================================================
  const hasPersonName = 'first_name' in sample || 'firstName' in sample ||
                        'full_name' in sample || 'fullName' in sample ||
                        'Full Name' in sample || 'Name' in sample;
  const hasEmail = 'email' in sample || 'Email' in sample ||
                   'personal_email' in sample || 'personalEmail' in sample ||
                   'work_email' in sample || 'workEmail' in sample ||
                   'contact_email' in sample || 'contactEmail' in sample;
  const hasDomain = 'company_domain' in sample || 'domain' in sample || 'companyDomain' in sample ||
                    'Domain' in sample || 'Website' in sample;
  const hasCompany = 'company' in sample || 'company_name' in sample || 'companyName' in sample ||
                     'organization' in sample || 'Company Name' in sample || 'Company' in sample;
  const hasJobTitle = 'job_title' in sample || 'title' in sample || 'position' in sample ||
                      'Title' in sample || 'Position' in sample || 'Role' in sample;

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
    // Check all possible domain field names including CSV formats
    const d = record.company_domain || record.domain || record.Domain ||
              record.companyDomain || record.company_url || record.website ||
              record.Website || record.company_website || '';
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
  // Supports both API formats (snake_case, camelCase) and CSV formats ("Full Name", "Email")
  const b2bFirstName = isLeadsFinder
    ? (record.first_name || record.firstName || record['First Name'] || record.name?.split(' ')[0] || record['Full Name']?.split(' ')[0] || '')
    : (getNestedValue(record, fields.firstName) || '');
  const b2bLastName = isLeadsFinder
    ? (record.last_name || record.lastName || record['Last Name'] || record.name?.split(' ').slice(1).join(' ') || record['Full Name']?.split(' ').slice(1).join(' ') || '')
    : (getNestedValue(record, fields.lastName) || '');
  const b2bFullName = isLeadsFinder
    ? (record.full_name || record.fullName || record['Full Name'] || record.name || record.Name || `${b2bFirstName} ${b2bLastName}`.trim() || '')
    : (getNestedValue(record, fields.fullName) || '');
  // Email extraction — check ALL possible email field names (different Leads Finder variants + CSV use different names)
  // MUST match SignalsClient.extractJobLikeFields() to avoid silent email loss
  const b2bEmail = isLeadsFinder
    ? (record.email || record.Email || record.personal_email || record.personalEmail || record.work_email || record.workEmail || record.contact_email || record.contactEmail || record.business_email || record.existingContact?.email || null)
    : (record.existingContact?.email || getNestedValue(record, fields.email) || null);
  const b2bTitle = isLeadsFinder
    ? (record.job_title || record.title || record.Title || record.position || record.Position || record.role || record.Role || '')
    : (getNestedValue(record, fields.title) || '');
  const b2bLinkedin = isLeadsFinder
    ? (record.linkedin || record['LinkedIn URL'] || record.linkedin_url || record.linkedinUrl || record.person_linkedin_url || null)
    : (getNestedValue(record, fields.linkedin) || null);
  const b2bCompany = isLeadsFinder
    ? (record.company_name || record['Company Name'] || record.company || record.Company || record.companyName || record.organization || '')
    : (getNestedValue(record, fields.company) || '');

  // ==========================================================================
  // RECORD KEY — Stable identity, never domain-based, never empty
  // ==========================================================================
  const finalCompany = isCrunchbasePeople ? crunchbasePeopleCompany : b2bCompany;
  const finalFullName = isCrunchbasePeople ? crunchbasePeopleFullName : b2bFullName;

  let recordKey: string;
  if (isCrunchbasePeople) {
    // Crunchbase People: use identifier.value or uuid
    const cbId = record.identifier?.value || record.uuid || record.id;
    recordKey = cbId ? `cb_person:${cbId}` : `cb_person:${finalFullName}:${finalCompany}`.toLowerCase().replace(/\s+/g, '_');
  } else if (isCrunchbase) {
    // Crunchbase Orgs: use identifier.value or domain
    const cbId = record.identifier?.value || record.uuid || domain;
    recordKey = cbId ? `cb_org:${cbId}` : `cb_org:${finalCompany}`.toLowerCase().replace(/\s+/g, '_');
  } else if (isWellfound) {
    // Wellfound: use job ID or slug
    const jobId = record.id || record.slug || record.job_id;
    recordKey = jobId ? `job:wellfound:${jobId}` : `job:wellfound:${finalCompany}:${b2bTitle}`.toLowerCase().replace(/\s+/g, '_');
  } else if (isLeadsFinder) {
    // B2B Contacts: use email or apollo_id
    const contactId = b2bEmail || record.apollo_id || record.id;
    recordKey = contactId ? `contact:${contactId}` : `contact:${finalFullName}:${finalCompany}`.toLowerCase().replace(/\s+/g, '_');
  } else {
    // Fallback: hash of available fields
    recordKey = `record:${domain || finalCompany || finalFullName || 'unknown'}:${Date.now()}`.toLowerCase().replace(/\s+/g, '_');
  }

  // ==========================================================================
  // SIGNAL META — Record-level truth, UI renders label only
  // ==========================================================================
  let signalMeta: SignalMeta;

  // PRIORITY: Explicit Signal column (CSV with "Signal" header) > schema-mapped field
  // This handles cases where user's CSV has separate "Signal" column with hiring intent
  // e.g., CSV: Title="CEO", Signal="Hiring: eCommerce Director" → use Signal, not Title
  const explicitSignal = record.Signal || record.signal || record['Hiring Signal'] || record.hiring_signal || '';
  const rawSignal = explicitSignal || getNestedValue(record, fields.signal) || '';

  if (isCrunchbasePeople) {
    // People/Founders: "{title} at {company}" or "{title}" or "{name}"
    const personTitle = record.primary_job_title || b2bTitle || '';
    const personOrg = crunchbasePeopleCompany;
    const label = personTitle && personOrg
      ? `${personTitle} at ${personOrg}`
      : personTitle || crunchbasePeopleFullName || 'Person';
    signalMeta = { kind: 'PERSON_ROLE', label, source: 'primary_job_title' };
  } else if (isCrunchbase) {
    // Companies: Check for funding first, then growth, then generic
    const fundingAmount = record.last_funding_total?.value_usd || record.last_equity_funding_total?.value_usd;
    const fundingType = record.last_funding_type;
    if (fundingAmount || fundingType) {
      const fundingLabel = fundingType
        ? `Raised ${fundingType}${fundingAmount ? ` ($${(fundingAmount / 1000000).toFixed(1)}M)` : ''}`
        : `Raised funding`;
      signalMeta = { kind: 'FUNDING', label: fundingLabel, source: 'last_funding_type' };
    } else {
      signalMeta = { kind: 'GROWTH', label: `Active company`, source: 'schema' };
    }
  } else if (isWellfound) {
    // Job postings: "Hiring {role}"
    const jobTitle = record.title || record.job_title || b2bTitle || 'role';
    signalMeta = { kind: 'HIRING_ROLE', label: `Hiring ${jobTitle}`, source: 'job_title' };
  } else if (isLeadsFinder) {
    // B2B Contacts: Check for explicit hiring signal first, otherwise use title as role
    // This handles CSV with Signal column like "Hiring: eCommerce Director"
    const isHiringSignal = explicitSignal && /^hiring[:\s]/i.test(explicitSignal);

    if (isHiringSignal) {
      // Explicit hiring signal column — treat as hiring intent, not contact role
      signalMeta = { kind: 'HIRING_ROLE', label: explicitSignal, source: 'Signal' };
    } else if (explicitSignal) {
      // Explicit signal but not hiring pattern — use as growth signal
      signalMeta = { kind: 'GROWTH', label: explicitSignal, source: 'Signal' };
    } else {
      // No explicit signal — fall back to contact title as role
      const contactTitle = b2bTitle || 'Decision maker';
      signalMeta = { kind: 'CONTACT_ROLE', label: contactTitle, source: 'job_title' };
    }
  } else {
    // Unknown schema: Use raw signal or fallback
    signalMeta = { kind: 'UNKNOWN', label: rawSignal || 'Record', source: fields.signal || 'unknown' };
  }

  return {
    // === IDENTITY ===
    recordKey,

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
    company: finalCompany,
    domain,
    domainSource,  // PHILEMON: Track domain provenance for proof-based enrichment
    industry: isCrunchbase ? crunchbaseIndustry : (getNestedValue(record, fields.industry) || record['Target Industries'] || record.industry || record.Industry || null),
    size: getNestedValue(record, fields.size) || null,
    // Company description/funding - schema-aware (includes CSV "Service Description")
    companyDescription: isLeadsFinder
      ? (record.company_description || record['Service Description'] || record.description || record.Description || null)
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

    // === SIGNAL (record-level truth) ===
    signalMeta,
    // Legacy fields (deprecated — use signalMeta.label)
    signal: rawSignal,
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

// =============================================================================
// CANONICAL SIGNAL RENDERING (user.txt contract)
// =============================================================================

/**
 * renderSignal — Canonical signal renderer.
 *
 * ONE function for ALL signal rendering. No inline "Hiring ${...}" anywhere else.
 * UI calls this, never constructs signal strings manually.
 *
 * @param record - Normalized record
 * @param schema - Schema with signalType
 * @returns Human-readable signal string
 */
export function renderSignal(record: NormalizedRecord, schema: Schema): string {
  switch (schema.signalType) {
    case 'hiring':
      // Job postings: "Hiring {role}"
      return `Hiring ${record.signalMeta?.label || record.signal || 'role'}`;

    case 'person':
      // People/founders: "{title} at {company}" or just "{title}"
      const personLabel = record.signalMeta?.label || record.title || record.fullName;
      if (record.company && !personLabel?.includes(record.company)) {
        return `${personLabel} at ${record.company}`;
      }
      return personLabel || 'Decision maker';

    case 'company':
      // Organizations: funding or activity
      if (record.companyFunding) {
        const fundingNum = typeof record.companyFunding === 'number'
          ? record.companyFunding
          : parseFloat(String(record.companyFunding).replace(/[^0-9.]/g, ''));
        if (!isNaN(fundingNum) && fundingNum > 0) {
          return `Raised $${(fundingNum / 1000000).toFixed(1)}M`;
        }
        return `Raised funding`;
      }
      return record.signalMeta?.label || 'Company activity detected';

    case 'contact':
      // B2B contacts: use title
      return record.title || record.signalMeta?.label || 'Decision maker';

    default:
      // Fallback — never assume hiring
      return record.signalMeta?.label || record.signal || 'Record';
  }
}

// =============================================================================
// SCHEMA-AWARE NARRATION (user.txt contract)
// =============================================================================

/**
 * getNarration — Schema-aware match narration.
 *
 * Generates human-readable explanation of why demand matches supply.
 * NEVER hardcodes "Hiring" — uses signalType to determine narration.
 *
 * @param demand - Demand record
 * @param supply - Supply record
 * @param demandSchema - Demand schema (for signalType)
 * @param supplyServices - Optional services from capability profile
 * @returns Human-readable narration string
 */
export function getNarration(
  demand: NormalizedRecord,
  supply: NormalizedRecord,
  demandSchema: Schema,
  supplyServices?: string[]
): string {
  const demandSignal = renderSignal(demand, demandSchema);
  const supplyName = supply.company || supply.fullName || 'Provider';
  const services = supplyServices?.length ? supplyServices.join(', ') : null;

  switch (demandSchema.signalType) {
    case 'hiring':
      // Hiring → recruiter/agency
      return services
        ? `${demandSignal} → ${supplyName} (${services})`
        : `${demandSignal} → ${supplyName}`;

    case 'person':
      // Person exploring services
      return services
        ? `${demand.fullName || demand.company} exploring ${services}`
        : `${demand.fullName || demand.company} → ${supplyName}`;

    case 'company':
      // Company matched with provider
      return `${demand.company} matched with ${supplyName}`;

    case 'contact':
      // Contact-to-contact (rare, but possible)
      return `${demand.fullName || demand.company} → ${supplyName}`;

    default:
      // Fallback — generic
      return 'Potential strategic match';
  }
}

/**
 * getSchemaById — Get schema by ID.
 * Returns null if not found.
 */
export function getSchemaById(schemaId: string): Schema | null {
  return SCHEMAS.find(s => s.id === schemaId) || null;
}
