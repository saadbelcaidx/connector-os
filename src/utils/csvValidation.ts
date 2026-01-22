/**
 * csvValidation.ts — Pure CSV Validation Functions
 *
 * CSV PHASE 1: Pre-flight validation engine
 *
 * INVARIANT: Every function is PURE (no side effects, no mutation).
 * PRIVACY: No emails logged, no full records in exports.
 *
 * Tier Rules:
 * 1. Column Names (HARD STOP) — must match template headers
 * 2. Required Fields (HARD STOP per row) — empty required = error
 * 3. Domain Validation — >20% invalid = HARD STOP
 * 4. Duplicate Detection (WARNING ONLY) — hash: name + company + domain
 */

import Papa from 'papaparse';

// =============================================================================
// TYPES (LOCAL ONLY — NOT EXPORTED)
// =============================================================================

interface ErrorRow {
  rowIndex: number;
  field: string;
  reason: string;
  originalValue: string;
  humanMessage: string;     // User-friendly message
  suggestion: string;       // How to fix
  example?: string;         // Example value
}

interface WarningRow {
  rowIndex: number;
  field: string;
  reason: string;
  originalValue: string;
}

interface ValidationResult {
  status: 'valid' | 'invalid';
  errors: ErrorRow[];
  warnings: WarningRow[];
  stats: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    warningRows: number;
  };
}

interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

type CsvSide = 'demand' | 'supply';

// =============================================================================
// CONSTANTS
// =============================================================================

const REQUIRED_COLUMNS: Record<CsvSide, string[]> = {
  demand: ['Company Name', 'Signal'],
  supply: ['Company Name', 'Signal'],
};

// =============================================================================
// HUMAN-READABLE ERROR HELPERS
// =============================================================================

const FIELD_NAMES: Record<string, string> = {
  'Full Name': 'contact name',
  'Company Name': 'company name',
  'Domain': 'company website',
  'Signal': 'signal',
  'Title': 'job title',
  'Service Description': 'service description',
  'Email': 'email address',
  'LinkedIn URL': 'LinkedIn URL',
};

const FIELD_SUGGESTIONS: Record<string, string> = {
  'Full Name': "Add the person's full name like 'John Doe'",
  'Company Name': "Add the company name like 'Acme Inc'",
  'Domain': "Add the company website like 'acme.com' (without http://)",
  'Signal': "Add the signal like 'Hiring: 3 engineers' or 'Raised Series A'",
  'Title': "Add the job title like 'VP of Sales'",
  'Service Description': "Add a brief description of services offered",
  'Email': "Add a valid email address like 'john@acme.com'",
  'LinkedIn URL': "Add the LinkedIn profile URL",
};

const FIELD_EXAMPLES: Record<string, string> = {
  'Full Name': 'John Doe',
  'Company Name': 'Stripe',
  'Domain': 'stripe.com',
  'Signal': 'Hiring: 3 Account Executives',
  'Title': 'VP of Sales',
  'Service Description': 'Tech recruitment for SaaS companies',
  'Email': 'john.doe@stripe.com',
  'LinkedIn URL': 'https://linkedin.com/in/johndoe',
};

function getHumanMessage(field: string, reason: string, rowIndex: number): string {
  const humanField = FIELD_NAMES[field] || field.toLowerCase();

  if (reason.includes('Missing required column')) {
    return `Missing column: "${field}" — add this column to your CSV`;
  }
  if (reason.includes('Duplicate column')) {
    return `Duplicate column: "${field}" — remove the duplicate`;
  }
  if (reason.includes('is empty')) {
    return `Row ${rowIndex}: Missing ${humanField}`;
  }
  if (reason.includes('IP addresses')) {
    return `Row ${rowIndex}: Use a domain name, not an IP address`;
  }
  if (reason.includes('Invalid domain')) {
    return `Row ${rowIndex}: Invalid ${humanField} format`;
  }
  if (reason.includes('20%')) {
    return 'Too many invalid domains — please fix and re-upload';
  }
  return `Row ${rowIndex}: Issue with ${humanField}`;
}

function getSuggestion(field: string, reason: string): string {
  if (reason.includes('Missing required column')) {
    return `Add a column named "${field}" to your CSV`;
  }
  if (reason.includes('Duplicate column')) {
    return 'Remove duplicate column headers from your CSV';
  }
  if (reason.includes('IP addresses')) {
    return "Use a domain like 'acme.com' instead of an IP address";
  }
  if (reason.includes('20%')) {
    return 'Check that domains are formatted correctly (e.g., acme.com)';
  }
  return FIELD_SUGGESTIONS[field] || `Please provide a valid ${field.toLowerCase()}`;
}

function getExample(field: string): string | undefined {
  return FIELD_EXAMPLES[field];
}

function createError(
  rowIndex: number,
  field: string,
  reason: string,
  originalValue: string
): ErrorRow {
  return {
    rowIndex,
    field,
    reason,
    originalValue,
    humanMessage: getHumanMessage(field, reason, rowIndex),
    suggestion: getSuggestion(field, reason),
    example: getExample(field),
  };
}

// =============================================================================
// PARSING
// =============================================================================

/**
 * Parse CSV text into headers and rows.
 * Uses Papa Parse for proper handling of:
 * - Multiline quoted fields
 * - BOM removal
 * - Various line endings
 * - Escaped quotes
 */
export function parseCsv(text: string): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
    transform: (value) => value.trim(),
  });

  if (result.errors.length > 0) {
    console.warn('[parseCsv] Parse warnings:', result.errors);
  }

  const headers = result.meta.fields || [];
  const rows = result.data;

  return { headers, rows };
}

// =============================================================================
// TIER 1: COLUMN VALIDATION
// =============================================================================

/**
 * Validate CSV columns against required headers.
 * Returns errors if required columns are missing or duplicated.
 */
export function validateCsvColumns(headers: string[], side: CsvSide): ErrorRow[] {
  const errors: ErrorRow[] = [];
  const required = REQUIRED_COLUMNS[side];

  // Check for missing required columns
  for (const col of required) {
    if (!headers.includes(col)) {
      errors.push(createError(0, col, `Missing required column: "${col}"`, ''));
    }
  }

  // Check for duplicate headers
  const seen = new Set<string>();
  for (const header of headers) {
    if (seen.has(header)) {
      errors.push(createError(0, header, `Duplicate column header: "${header}"`, header));
    }
    seen.add(header);
  }

  return errors;
}

// =============================================================================
// TIER 2: REQUIRED FIELDS VALIDATION
// =============================================================================

/**
 * Validate required fields in each row.
 * Returns errors for rows with empty required fields.
 */
export function validateCsvRequiredFields(rows: Record<string, string>[], side: CsvSide): ErrorRow[] {
  const errors: ErrorRow[] = [];
  const required = REQUIRED_COLUMNS[side];

  rows.forEach((row, idx) => {
    for (const field of required) {
      const value = row[field]?.trim() || '';
      if (!value) {
        errors.push(createError(
          idx + 2, // +2 for header row and 0-indexing
          field,
          `Required field "${field}" is empty`,
          ''
        ));
      }
    }
  });

  return errors;
}

// =============================================================================
// TIER 3: DOMAIN VALIDATION
// =============================================================================

/**
 * Validate domain values (WARN ONLY — domain is optional).
 * - Strip protocol, www, path/query/hash
 * - Lowercase
 * - Flag IP addresses and invalid formats as warnings
 * - NEVER blocks upload
 */
export function validateCsvDomains(rows: Record<string, string>[]): { warnings: WarningRow[]; stats: { missing: number; invalid: number } } {
  const warnings: WarningRow[] = [];
  const domainRegex = /^[a-z0-9]+([-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i;
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;

  let missingCount = 0;
  let invalidCount = 0;

  rows.forEach((row, idx) => {
    let domain = row['Domain']?.trim() || '';

    // Track missing domains (for UX messaging about enrichment)
    if (!domain) {
      missingCount++;
      return;
    }

    // Normalize domain
    try {
      domain = domain.replace(/^https?:\/\//i, '');
      domain = domain.replace(/^www\./i, '');
      domain = domain.split('/')[0].split('?')[0].split('#')[0];
      domain = domain.toLowerCase();
    } catch {
      // Keep original if parsing fails
    }

    // Flag IP addresses as warning
    if (ipRegex.test(domain)) {
      warnings.push({
        rowIndex: idx + 2,
        field: 'Domain',
        reason: 'IP address (use domain name for enrichment)',
        originalValue: row['Domain'],
      });
      invalidCount++;
      return;
    }

    // Flag invalid format as warning
    if (!domainRegex.test(domain)) {
      warnings.push({
        rowIndex: idx + 2,
        field: 'Domain',
        reason: 'Invalid format (enrichment may fail)',
        originalValue: row['Domain'],
      });
      invalidCount++;
    }
  });

  return { warnings, stats: { missing: missingCount, invalid: invalidCount } };
}

// =============================================================================
// TIER 4: DUPLICATE DETECTION
// =============================================================================

/**
 * Detect duplicate rows within the uploaded file.
 * Hash: name + company + domain (lowercased)
 * Returns warnings (duplicates are allowed but warned).
 */
export function detectCsvDuplicates(rows: Record<string, string>[]): WarningRow[] {
  const warnings: WarningRow[] = [];
  const seen = new Map<string, number>(); // hash -> first row index

  rows.forEach((row, idx) => {
    const name = (row['Full Name'] || '').toLowerCase().trim();
    const company = (row['Company Name'] || '').toLowerCase().trim();
    const domain = (row['Domain'] || '').toLowerCase().trim();

    const hash = `${name}|${company}|${domain}`;

    if (seen.has(hash)) {
      warnings.push({
        rowIndex: idx + 2,
        field: 'Full Name + Company Name + Domain',
        reason: `Duplicate of row ${seen.get(hash)}`,
        originalValue: `${row['Full Name']} at ${row['Company Name']}`,
      });
    } else {
      seen.set(hash, idx + 2);
    }
  });

  return warnings;
}

// =============================================================================
// COMBINED VALIDATION
// =============================================================================

/**
 * Run all validations and return combined result.
 */
export function validateCsv(text: string, side: CsvSide): { result: ValidationResult; rows: Record<string, string>[] } {
  const { headers, rows } = parseCsv(text);

  const allErrors: ErrorRow[] = [];
  const allWarnings: WarningRow[] = [];

  // Tier 1: Column validation (HARD STOP)
  const columnErrors = validateCsvColumns(headers, side);
  allErrors.push(...columnErrors);

  // If column errors, stop here (can't validate rows without proper columns)
  if (columnErrors.length > 0) {
    return {
      result: {
        status: 'invalid',
        errors: allErrors,
        warnings: [],
        stats: {
          totalRows: rows.length,
          validRows: 0,
          invalidRows: rows.length,
          warningRows: 0,
        },
      },
      rows: [],
    };
  }

  // Tier 2: Required fields validation (HARD STOP per row)
  const fieldErrors = validateCsvRequiredFields(rows, side);
  allErrors.push(...fieldErrors);

  // Tier 3: Domain validation (WARN ONLY — domain is optional per CSV contract)
  const { warnings: domainWarnings } = validateCsvDomains(rows);
  allWarnings.push(...domainWarnings);

  // Tier 4: Duplicate detection (WARNING ONLY)
  const duplicateWarnings = detectCsvDuplicates(rows);
  allWarnings.push(...duplicateWarnings);

  // Count rows with errors
  const rowsWithErrors = new Set(allErrors.map(e => e.rowIndex).filter(i => i > 0));
  const rowsWithWarnings = new Set(allWarnings.map(w => w.rowIndex));

  const invalidRows = rowsWithErrors.size;
  const warningRows = [...rowsWithWarnings].filter(r => !rowsWithErrors.has(r)).length;
  const validRows = rows.length - invalidRows;

  return {
    result: {
      status: allErrors.length > 0 ? 'invalid' : 'valid',
      errors: allErrors,
      warnings: allWarnings,
      stats: {
        totalRows: rows.length,
        validRows,
        invalidRows,
        warningRows,
      },
    },
    rows,
  };
}

// =============================================================================
// CSV GENERATION (errors.csv, warnings.csv)
// =============================================================================

/**
 * Generate errors.csv content.
 * Columns: rowIndex, field, reason, originalValue
 * Privacy: No emails, no full records.
 */
export function generateErrorsCsv(errors: ErrorRow[]): string {
  const header = 'rowIndex,field,reason,originalValue';
  const rows = errors.map(e => {
    // Escape fields for CSV
    const escape = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
    return `${e.rowIndex},${escape(e.field)},${escape(e.reason)},${escape(e.originalValue)}`;
  });
  return [header, ...rows].join('\n');
}

/**
 * Generate warnings.csv content.
 * Columns: rowIndex, field, reason, originalValue
 * Privacy: No emails, no full records.
 */
export function generateWarningsCsv(warnings: WarningRow[]): string {
  const header = 'rowIndex,field,reason,originalValue';
  const rows = warnings.map(w => {
    const escape = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
    return `${w.rowIndex},${escape(w.field)},${escape(w.reason)},${escape(w.originalValue)}`;
  });
  return [header, ...rows].join('\n');
}
