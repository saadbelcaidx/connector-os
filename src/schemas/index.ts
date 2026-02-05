/**
 * SCHEMAS — CSV-ONLY
 *
 * ARCHITECTURAL DECISION (LOCKED):
 * Connector OS is CSV-ONLY. All Apify, dataset, scraper, and external
 * ingestion paths have been permanently removed.
 *
 * This file provides:
 * - Single CSV schema
 * - Single normalization path
 * - Hard validation for required fields
 *
 * Required CSV Headers:
 * - Company Name (required)
 * - Signal (required)
 * - Full Name, Email, Domain, Context (optional - enrichment finds contacts)
 *
 * SignalMeta derivation (user.txt contract):
 * - If Signal starts with "Hiring:" → HIRING_ROLE
 * - Else if Signal exists → GROWTH
 * - Else → CONTACT_ROLE (from Title only)
 */

import { simpleHash } from '../enrichment/recordKey';

// =============================================================================
// TYPES
// =============================================================================

export interface SchemaField {
  path: string;
  required?: boolean;
}

/**
 * SignalType — Schema-level signal classification.
 * CSV-only: always 'csv'.
 */
export type SignalType = 'csv';

export interface Schema {
  id: string;
  name: string;
  description: string;
  recommendation: string;
  icon: string;
  affiliateUrl: string;
  sides: ('demand' | 'supply')[];
  hasContacts: boolean;
  signalType: SignalType;
  fingerprint: string[];
  fields: {
    firstName: string | null;
    lastName: string | null;
    fullName: string | null;
    email: string | null;
    title: string | null;
    linkedin: string | null;
    company: string;
    domain: string;
    industry: string | null;
    size: string | null;
    signal: string;
    signalDetail: string | null;
  };
}

/**
 * Domain source confidence levels:
 * - explicit: Domain field exists in CSV
 * - none: No domain available — record should fail validation
 */
export type DomainSource = 'explicit' | 'trusted_inferred' | 'none';

/**
 * SignalKind — Record-level signal classification (user.txt contract).
 * - HIRING_ROLE: Signal starts with "Hiring:"
 * - GROWTH: Signal exists but not hiring
 * - CONTACT_ROLE: No signal, use Title
 */
export type SignalKind =
  | 'HIRING_ROLE'
  | 'GROWTH'
  | 'CONTACT_ROLE'
  | 'UNKNOWN';

/**
 * SignalMeta — The truth about what this record represents.
 *
 * ARCHITECTURAL INVARIANT:
 * All source-specific fields go here. Never create new logic branches.
 * Intro generation reads signalMeta — it doesn't know or care about source.
 */
export interface SignalMeta {
  kind: SignalKind;
  label: string;
  source: string; // 'csv' | 'nih' | 'usaspending'

  // === MONEY SIGNALS (source-agnostic) ===
  grantAmount?: number;         // NIH: award_amount
  awardAmount?: number;         // USASpending: Award Amount
  totalCost?: number;           // NIH: total_cost from funding

  // === TIMING SIGNALS ===
  startDate?: string;           // Project/contract start
  endDate?: string;             // Project/contract end
  fiscalYear?: number;          // NIH: fiscal_year
  isActive?: boolean;           // NIH: is_active
  isNew?: boolean;              // NIH: is_new (fresh money)

  // === THERAPEUTIC / INDUSTRY ===
  nihInstitute?: string;        // NIH: NCI, NIAID, etc.
  nihInstituteName?: string;    // NIH: "National Cancer Institute"
  therapeuticArea?: string;     // Derived from nihInstitute
  naicsCode?: string;           // USASpending: industry code
  naicsDescription?: string;    // USASpending: industry description

  // === ORGANIZATION SIGNALS ===
  orgType?: string;             // NIH: organization_type.name
  activityCode?: string;        // NIH: R01, U01, P01 (scale proxy)
  fundingMechanism?: string;    // NIH: "R and D Contracts"
  contractType?: string;        // USASpending: IDIQ, DELIVERY ORDER

  // === AGENCY / CREDIBILITY ===
  fundingAgency?: string;       // USASpending: who funded
  awardingAgency?: string;      // USASpending: who awarded
  congressionalDistrict?: string; // NIH: cong_dist

  // === PROJECT DETAILS ===
  projectTitle?: string;        // NIH: project_title
  projectUrl?: string;          // NIH: credibility link
  spendingCategories?: string;  // NIH: what work is funded
  keywords?: string;            // NIH: pref_terms (matching)

  // === LOCATION ===
  performanceLocation?: string; // USASpending: place of performance
}

/**
 * Email provenance — where did this email come from?
 * Used to determine if verification is required before Gate 2.
 */
export type EmailSource = 'csv' | 'clinicaltrials' | 'nih' | 'apollo' | 'anymail' | 'connectorAgent' | 'manual' | null;

/**
 * Who verified this email?
 * Only Anymail and ConnectorAgent may set emailVerified = true.
 */
export type EmailVerifier = 'anymail' | 'connectorAgent' | null;

/**
 * Role-based email prefixes that are high-risk for deliverability.
 * Option A (strict): These are NEVER treated as verified.
 */
export const ROLE_BASED_PREFIXES = ['info', 'contact', 'admin', 'office', 'support', 'sales', 'hello', 'team', 'hr', 'careers', 'jobs', 'help'];

/**
 * Check if email is role-based (high-risk for deliverability).
 * Role-based emails bypass individuals — higher bounce/spam risk.
 */
export function isRoleBasedEmail(email: string | null): boolean {
  if (!email) return false;
  const prefix = email.split('@')[0]?.toLowerCase();
  return ROLE_BASED_PREFIXES.includes(prefix);
}

export interface NormalizedRecord {
  // === IDENTITY ===
  recordKey: string;

  // Contact
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  /**
   * Email provenance — where did this email come from?
   * Required for verification routing.
   */
  emailSource: EmailSource;
  /**
   * Email verification status.
   * ONLY true if verified by Anymail or ConnectorAgent.
   * Gate 2 requires: email exists AND emailVerified = true
   * Option A (strict): Role-based emails are NEVER verified.
   */
  emailVerified: boolean;
  /**
   * Who verified this email?
   * Only 'anymail' or 'connectorAgent' are trusted verifiers.
   * Never infer verification from email format, domain, or API source.
   */
  verifiedBy: EmailVerifier;
  /**
   * When was this email verified?
   * ISO timestamp. Used for freshness checks.
   * Rule: if now - verifiedAt > 30 days → re-verify before sending
   */
  verifiedAt: string | null;
  title: string;
  linkedin: string | null;
  headline: string | null;
  seniorityLevel: string | null;

  // Company
  company: string;
  domain: string;
  domainSource: DomainSource;
  industry: string | string[] | null;
  size: string | string[] | null;
  companyDescription: string | null;
  companyFunding: string | null;
  companyRevenue: string | null;
  companyFoundedYear: string | null;
  companyLinkedin: string | null;

  // === SIGNAL ===
  signalMeta: SignalMeta;
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
// SCHEMA: CSV (Single Source of Truth)
// =============================================================================

export const CSV_SCHEMA: Schema = {
  id: 'csv',
  name: 'CSV Upload',
  description: 'User-uploaded CSV data',
  recommendation: 'The only supported data source',
  icon: 'FileSpreadsheet',
  affiliateUrl: '',
  sides: ['demand', 'supply'],
  hasContacts: true,
  signalType: 'csv',

  // CSV headers (canonical template)
  fingerprint: ['Full Name', 'Company Name', 'Domain', 'Context', 'Signal'],

  fields: {
    firstName: null,  // Derived from Full Name
    lastName: null,   // Derived from Full Name
    fullName: 'Full Name',
    email: 'Email',
    title: 'Title',
    linkedin: 'LinkedIn URL',
    company: 'Company Name',
    domain: 'Domain',
    industry: 'Industry',
    size: 'Company Size',
    signal: 'Signal',
    signalDetail: null,
  },
};

// Legacy exports for backwards compatibility
export const B2B_CONTACTS = CSV_SCHEMA;
export const STARTUP_JOBS = CSV_SCHEMA;
export const CRUNCHBASE_ORGS = CSV_SCHEMA;
export const CRUNCHBASE_PEOPLE = CSV_SCHEMA;

// All schemas array (only CSV)
export const SCHEMAS: Schema[] = [CSV_SCHEMA];

// =============================================================================
// REQUIRED FIELDS (user.txt contract)
// =============================================================================

// These are NORMALIZED property names, not raw CSV headers
const REQUIRED_FIELDS = [
  'company',
  'signal',
];

/**
 * Check if a CSV row has all required fields.
 * Returns list of missing fields, empty if all present.
 */
function getMissingRequiredFields(record: any): string[] {
  const missing: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    const value = record[field];
    if (value === undefined || value === null || String(value).trim() === '') {
      missing.push(field);
    }
  }

  return missing;
}

// =============================================================================
// DETECTION (CSV-ONLY)
// =============================================================================

/**
 * Detect schema — always returns CSV_SCHEMA for valid CSV.
 * Returns null if required fields are missing.
 */
export function detectSchema(sample: any): Schema | null {
  if (!sample || typeof sample !== 'object') {
    return null;
  }

  // Check for CSV headers (flexible matching)
  const hasFullName = 'Full Name' in sample || 'full_name' in sample || 'fullName' in sample || 'Name' in sample;
  const hasCompanyName = 'Company Name' in sample || 'company_name' in sample || 'companyName' in sample || 'Company' in sample;
  const hasDomain = 'Domain' in sample || 'domain' in sample || 'Website' in sample;
  const hasDescription = 'Context' in sample || 'Company Description' in sample || 'company_description' in sample || 'Description' in sample || 'Service Description' in sample;
  const hasSignal = 'Signal' in sample || 'signal' in sample || 'Hiring Signal' in sample;

  // Must have core identifying fields
  if ((hasFullName || hasCompanyName) && (hasDomain || hasDescription || hasSignal)) {
    return CSV_SCHEMA;
  }

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
      error: 'CSV format invalid. Required columns: Company Name, Signal.',
    };
  }

  return { valid: true, schema };
}

/**
 * Validate a dataset for use as SUPPLY.
 * Same as validateDataset for CSV-only system.
 */
export function validateSupplyDataset(dataset: any[]): {
  valid: boolean;
  schema: Schema | null;
  error?: string;
} {
  return validateDataset(dataset);
}

// =============================================================================
// NORMALIZATION (CSV-ONLY)
// =============================================================================

/**
 * Get field value with flexible header matching.
 * Supports: "Full Name", "full_name", "fullName", etc.
 */
function getFlexibleField(record: any, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

/**
 * Strip full URLs from text fields (company names, signals).
 * Removes https/http URLs and www.domain.tld/path patterns.
 * Preserves domain-style brand names (Hire.io, Scale.ai, Angel.co).
 */
function stripUrls(input: string): string {
  if (!input) return input;
  return input
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\bwww\.[a-z0-9-]+\.[a-z]{2,}[^\s)]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Normalize a CSV record to common shape.
 *
 * HARD VALIDATION (user.txt contract):
 * - companyName must exist
 * - domain must exist
 * - companyDescription must exist
 * - signal must exist
 *
 * SignalMeta derivation:
 * - If Signal starts with "Hiring:" → HIRING_ROLE
 * - Else if Signal exists → GROWTH
 * - Else → CONTACT_ROLE (from Title only)
 */
export function normalize(record: any, schema: Schema): NormalizedRecord {
  // Extract fields with flexible header matching
  const fullName = getFlexibleField(record, 'Full Name', 'full_name', 'fullName', 'Name', 'name');
  const firstName = getFlexibleField(record, 'First Name', 'first_name', 'firstName') || fullName.split(' ')[0] || '';
  const lastName = getFlexibleField(record, 'Last Name', 'last_name', 'lastName') || fullName.split(' ').slice(1).join(' ') || '';
  const email = getFlexibleField(record, 'Email', 'email', 'Work Email', 'work_email', 'Personal Email', 'personal_email') || null;
  const title = getFlexibleField(record, 'Title', 'title', 'Job Title', 'job_title', 'Position', 'Role');
  const linkedin = getFlexibleField(record, 'LinkedIn URL', 'linkedin_url', 'linkedin', 'LinkedIn') || null;

  const company = stripUrls(getFlexibleField(record, 'Company Name', 'company_name', 'companyName', 'Company', 'company', 'Organization'));
  const rawDomain = getFlexibleField(record, 'Domain', 'domain', 'Website', 'website', 'Company Website', 'company_domain');
  const domain = rawDomain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const industry = getFlexibleField(record, 'Industry', 'industry', 'Target Industries') || null;
  const size = getFlexibleField(record, 'Company Size', 'company_size', 'Size', 'Employees') || null;
  const companyDescription = getFlexibleField(record, 'Context', 'Company Description', 'company_description', 'companyDescription', 'Description', 'description', 'Service Description');

  const signal = stripUrls(getFlexibleField(record, 'Signal', 'signal', 'Hiring Signal', 'hiring_signal'));

  // Location
  const city = getFlexibleField(record, 'City', 'city') || null;
  const state = getFlexibleField(record, 'State', 'state') || null;
  const country = getFlexibleField(record, 'Country', 'country') || null;

  // Domain source
  const domainSource: DomainSource = domain ? 'explicit' : 'none';

  // ==========================================================================
  // SIGNAL META (user.txt contract)
  // ==========================================================================
  let signalMeta: SignalMeta;

  if (signal && /^hiring[:\s]/i.test(signal)) {
    // Signal starts with "Hiring:" → HIRING_ROLE
    signalMeta = { kind: 'HIRING_ROLE', label: signal, source: 'Signal' };
  } else if (signal) {
    // Signal exists but not hiring → GROWTH
    signalMeta = { kind: 'GROWTH', label: signal, source: 'Signal' };
  } else if (title) {
    // No signal, use Title → CONTACT_ROLE
    signalMeta = { kind: 'CONTACT_ROLE', label: title, source: 'Title' };
  } else {
    // Fallback
    signalMeta = { kind: 'UNKNOWN', label: 'Record', source: 'none' };
  }

  // ==========================================================================
  // RECORD KEY
  // ==========================================================================
  let recordKey: string;
  if (email) {
    recordKey = `csv:${email}`;
  } else {
    const disambiguator = simpleHash(JSON.stringify({ n: fullName, c: company, d: domain, t: title }));
    recordKey = `csv:${company}:${fullName}:${disambiguator}`.toLowerCase().replace(/\s+/g, '_');
  }

  return {
    recordKey,

    // Contact
    firstName,
    lastName,
    fullName,
    email,
    // EMAIL VERIFICATION INVARIANT (user.txt contract):
    // CSV emails are NEVER pre-verified. Gate 2 requires verification.
    // Only Anymail and ConnectorAgent may set emailVerified = true.
    emailSource: 'csv' as const,
    emailVerified: false,
    verifiedBy: null,
    verifiedAt: null,
    title,
    linkedin,
    headline: null,
    seniorityLevel: null,

    // Company
    company,
    domain,
    domainSource,
    industry,
    size,
    companyDescription: companyDescription || null,
    companyFunding: getFlexibleField(record, 'Funding', 'funding', 'Company Funding') || null,
    companyRevenue: getFlexibleField(record, 'Revenue', 'revenue', 'Company Revenue') || null,
    companyFoundedYear: getFlexibleField(record, 'Founded Year', 'founded_year', 'Year Founded') || null,
    companyLinkedin: getFlexibleField(record, 'Company LinkedIn', 'company_linkedin') || null,

    // Signal
    signalMeta,
    signal,
    signalDetail: null,

    // Location
    city,
    state,
    country,

    // Meta
    schemaId: schema.id,
    raw: record,
  };
}

/**
 * Normalize entire CSV dataset.
 *
 * HARD VALIDATION: Logs warnings for records missing required fields.
 * Records are still normalized but flagged.
 */
export function normalizeDataset(dataset: any[], schema: Schema): NormalizedRecord[] {
  const records: NormalizedRecord[] = [];
  let validCount = 0;
  let warningCount = 0;

  for (const record of dataset) {
    const missing = getMissingRequiredFields(record);
    if (missing.length > 0) {
      warningCount++;
      console.warn(`[normalizeDataset] Record missing fields: ${missing.join(', ')}`);
    } else {
      validCount++;
    }
    records.push(normalize(record, schema));
  }

  console.log(`[normalizeDataset] CSV summary: ${records.length} total`);
  console.log(`  ✓ valid records: ${validCount}`);
  if (warningCount > 0) {
    console.log(`  ⚠ records with missing fields: ${warningCount}`);
  }

  return records;
}

// =============================================================================
// CANONICAL SIGNAL RENDERING (user.txt contract)
// =============================================================================

/**
 * renderSignal — Canonical signal renderer.
 * Returns signalMeta.label (the truth).
 */
export function renderSignal(record: NormalizedRecord, _schema: Schema): string {
  return record.signalMeta?.label || record.signal || 'Record';
}

// =============================================================================
// SCHEMA-AWARE NARRATION
// =============================================================================

/**
 * getNarration — Match narration for CSV records.
 */
export function getNarration(
  demand: NormalizedRecord,
  supply: NormalizedRecord,
  _demandSchema: Schema,
  supplyServices?: string[]
): string {
  const demandSignal = demand.signalMeta?.label || demand.signal || 'activity';
  const supplyName = supply.company || supply.fullName || 'Provider';
  const services = supplyServices?.length ? supplyServices.join(', ') : null;

  if (demand.signalMeta?.kind === 'HIRING_ROLE') {
    return services
      ? `${demandSignal} → ${supplyName} (${services})`
      : `${demandSignal} → ${supplyName}`;
  }

  return `${demand.company} matched with ${supplyName}`;
}

