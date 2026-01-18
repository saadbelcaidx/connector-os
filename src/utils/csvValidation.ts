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

// =============================================================================
// TYPES (LOCAL ONLY — NOT EXPORTED)
// =============================================================================

interface ErrorRow {
  rowIndex: number;
  field: string;
  reason: string;
  originalValue: string;
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
  demand: ['Full Name', 'Company Name', 'Domain', 'Title'],
  supply: ['Full Name', 'Company Name', 'Domain', 'Service Description'],
};

// =============================================================================
// PARSING
// =============================================================================

/**
 * Parse CSV text into headers and rows.
 * Handles: BOM, \r\n vs \n, quoted fields with commas, empty rows.
 */
export function parseCsv(text: string): ParsedCsv {
  // Remove BOM if present
  let cleaned = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;

  // Normalize line endings
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const lines = cleaned.split('\n');
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  // Parse a single CSV line (handles quoted fields)
  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          current += '"';
          i++; // Skip escaped quote
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
    }
    result.push(current.trim());
    return result;
  };

  // Parse headers
  const headers = parseLine(lines[0]);

  // Parse data rows (skip empty lines)
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty rows

    const values = parseLine(line);
    const row: Record<string, string> = {};

    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });

    rows.push(row);
  }

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
      errors.push({
        rowIndex: 0,
        field: col,
        reason: `Missing required column: "${col}"`,
        originalValue: '',
      });
    }
  }

  // Check for duplicate headers
  const seen = new Set<string>();
  for (const header of headers) {
    if (seen.has(header)) {
      errors.push({
        rowIndex: 0,
        field: header,
        reason: `Duplicate column header: "${header}"`,
        originalValue: header,
      });
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
        errors.push({
          rowIndex: idx + 2, // +2 for header row and 0-indexing
          field,
          reason: `Required field "${field}" is empty`,
          originalValue: '',
        });
      }
    }
  });

  return errors;
}

// =============================================================================
// TIER 3: DOMAIN VALIDATION
// =============================================================================

/**
 * Normalize and validate domain values.
 * - Strip protocol, www, path/query/hash
 * - Lowercase
 * - Reject IP addresses
 * - Hard stop if >20% invalid
 */
export function validateCsvDomains(rows: Record<string, string>[]): { errors: ErrorRow[]; hardStop: boolean } {
  const errors: ErrorRow[] = [];
  const domainRegex = /^[a-z0-9]+([-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i;
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;

  let invalidCount = 0;

  rows.forEach((row, idx) => {
    let domain = row['Domain']?.trim() || '';
    if (!domain) return; // Empty domains handled by required field validation

    // Normalize domain
    try {
      // Remove protocol
      domain = domain.replace(/^https?:\/\//i, '');
      // Remove www.
      domain = domain.replace(/^www\./i, '');
      // Remove path/query/hash
      domain = domain.split('/')[0].split('?')[0].split('#')[0];
      // Lowercase
      domain = domain.toLowerCase();
    } catch {
      // Keep original if parsing fails
    }

    // Reject IP addresses
    if (ipRegex.test(domain)) {
      errors.push({
        rowIndex: idx + 2,
        field: 'Domain',
        reason: 'IP addresses are not allowed',
        originalValue: row['Domain'],
      });
      invalidCount++;
      return;
    }

    // Validate domain format
    if (!domainRegex.test(domain)) {
      errors.push({
        rowIndex: idx + 2,
        field: 'Domain',
        reason: 'Invalid domain format',
        originalValue: row['Domain'],
      });
      invalidCount++;
    }
  });

  // Hard stop if >20% invalid domains
  const invalidRatio = rows.length > 0 ? invalidCount / rows.length : 0;
  const hardStop = invalidRatio > 0.2;

  return { errors, hardStop };
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

  // Tier 3: Domain validation (HARD STOP if >20% invalid)
  const { errors: domainErrors, hardStop: domainHardStop } = validateCsvDomains(rows);
  allErrors.push(...domainErrors);

  if (domainHardStop) {
    allErrors.push({
      rowIndex: 0,
      field: 'Domain',
      reason: 'More than 20% of domains are invalid. Please fix and re-upload.',
      originalValue: '',
    });
  }

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
