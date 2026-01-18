/**
 * csv.ts — CSV Normalization (Phase 2)
 *
 * Transforms validated CSV rows into NormalizedRecord[] with dual keys:
 * - recordKey: Runtime identity (csvu:{uploadId}:{side}:{rowIndex})
 * - stableKey: Cross-upload dedup identity (csvs:{side}:{hash(canonical)})
 *
 * INVARIANT: Every validated CSV row becomes exactly one NormalizedRecord with deterministic keys.
 *
 * CONSTRAINTS:
 * - No schema detection (CSV bypasses schema detection)
 * - No mutation of inputs
 * - No UUIDs in keys
 * - No emails in keys
 * - Privacy-safe (no PII in logs)
 */

import { NormalizedRecord, SignalMeta, DomainSource } from '../schemas';
import { simpleHash } from '../enrichment/recordKey';

// =============================================================================
// TYPES (LOCAL ONLY)
// =============================================================================

/** Validated CSV row from Phase 1 */
interface CsvValidatedRow {
  'Full Name': string;
  'Company Name': string;
  'Domain': string;
  'Title'?: string;
  'Service Description'?: string;
  'LinkedIn URL'?: string;
  'Email'?: string;
  'Company Description'?: string;
  'Notes'?: string;
  'Target Industries'?: string;
  [key: string]: string | undefined;
}

/** Side indicator */
type CsvSide = 'demand' | 'supply';

/** Result of CSV normalization */
export interface CsvNormalizationResult {
  records: NormalizedRecord[];
  stableKeys: string[];
}

// =============================================================================
// KEY COMPUTATION
// =============================================================================

/**
 * Compute recordKey for a CSV row.
 * Format: csvu:{uploadId}:{side}:{rowIndex}
 *
 * - No UUIDs
 * - No emails
 * - Deterministic for the upload session
 */
function computeRecordKey(uploadId: string, side: CsvSide, rowIndex: number): string {
  return `csvu:${uploadId}:${side}:${rowIndex}`;
}

/**
 * Compute stableKey for a CSV row.
 * Format: csvs:{side}:{hash(canonical)}
 *
 * Canonical string: fullName|company|domain (all lowercased, trimmed)
 * - Stable across uploads
 * - Used for cross-upload deduplication
 */
function computeStableKey(
  fullName: string,
  company: string,
  domain: string,
  side: CsvSide
): string {
  const canonical = [
    fullName.trim().toLowerCase(),
    company.trim().toLowerCase(),
    domain.trim().toLowerCase(),
  ].join('|');

  return `csvs:${side}:${simpleHash(canonical)}`;
}

/**
 * Clean domain: strip protocol, www, path/query/hash, lowercase.
 * Matches Phase 1 normalization.
 */
function cleanDomain(domain: string): string {
  let cleaned = domain.trim();
  // Remove protocol
  cleaned = cleaned.replace(/^https?:\/\//i, '');
  // Remove www.
  cleaned = cleaned.replace(/^www\./i, '');
  // Remove path/query/hash
  cleaned = cleaned.split('/')[0].split('?')[0].split('#')[0];
  // Lowercase
  return cleaned.toLowerCase();
}

/**
 * Parse full name into first and last name.
 */
function parseName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) {
    return { firstName: '', lastName: '' };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

// =============================================================================
// MAIN NORMALIZATION FUNCTION
// =============================================================================

/**
 * Normalize validated CSV rows into NormalizedRecord[].
 *
 * @param rows - Validated CSV rows from Phase 1
 * @param side - 'demand' or 'supply'
 * @param uploadId - Unique upload session ID (generated in Phase 1 UI)
 * @returns NormalizedRecord[] with recordKey and stableKey set
 *
 * INVARIANT: Pure function, no side effects, deterministic output.
 */
export function normalizeCsvRecords(params: {
  rows: CsvValidatedRow[];
  side: CsvSide;
  uploadId: string;
}): CsvNormalizationResult {
  const { rows, side, uploadId } = params;

  const records: NormalizedRecord[] = [];
  const stableKeys: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowIndex = i;

    // Extract fields from CSV row
    const fullName = row['Full Name'] || '';
    const company = row['Company Name'] || '';
    const rawDomain = row['Domain'] || '';
    const title = row['Title'] || row['Service Description'] || '';
    const email = row['Email'] || null;
    const linkedin = row['LinkedIn URL'] || null;
    const description = row['Company Description'] || row['Notes'] || null;

    // Clean domain (same logic as Phase 1)
    const domain = cleanDomain(rawDomain);

    // Parse name
    const { firstName, lastName } = parseName(fullName);

    // Compute keys
    const recordKey = computeRecordKey(uploadId, side, rowIndex);
    const stableKey = computeStableKey(fullName, company, domain, side);

    // Build signal meta
    const signalMeta: SignalMeta = {
      kind: side === 'demand' ? 'HIRING_ROLE' : 'CONTACT_ROLE',
      label: title || (side === 'demand' ? 'Decision maker' : 'Service provider'),
      source: 'csv',
    };

    // Determine domain source
    const domainSource: DomainSource = domain ? 'explicit' : 'none';

    // Build NormalizedRecord
    const record: NormalizedRecord = {
      // Identity
      recordKey,

      // Contact
      firstName,
      lastName,
      fullName,
      email,
      title,
      linkedin,
      headline: null,
      seniorityLevel: null,

      // Company
      company,
      domain,
      domainSource,
      industry: null,
      size: null,
      companyDescription: description,
      companyFunding: null,
      companyRevenue: null,
      companyFoundedYear: null,
      companyLinkedin: null,

      // Signal
      signalMeta,
      signal: title,
      signalDetail: null,

      // Location (not in CSV template)
      city: null,
      state: null,
      country: null,

      // Meta
      schemaId: 'csv-upload',
      raw: {
        ...row,
        _csv: true,
        _uploadId: uploadId,
        _side: side,
        _rowIndex: rowIndex,
        _stableKey: stableKey,
        _dataSource: 'csv',
      },
    };

    records.push(record);
    stableKeys.push(stableKey);
  }

  return { records, stableKeys };
}
