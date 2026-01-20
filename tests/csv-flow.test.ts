/**
 * csv-flow.test.ts — Proves CSV Upload → Validate → Normalize works
 *
 * Uses member-style CSV data matching the templates.
 * No dedup, no DB, just pure validation + normalization.
 */

import { describe, it, expect } from 'vitest';
import { validateCsv } from '../src/utils/csvValidation';
import { normalizeCsvRecords } from '../src/normalization/csv';

// =============================================================================
// TEST DATA — Matches public/csv-template-demand.csv format
// =============================================================================

const MEMBER_DEMAND_CSV = `Full Name,Company Name,Domain,Title,LinkedIn URL,Email,Company Description,Signal
Jane Smith,Acme SaaS,acmesaas.com,VP of Sales,https://linkedin.com/in/janesmith,jane@acmesaas.com,B2B SaaS platform for inventory management. Series B. 150 employees.,Hiring 3 Account Executives
Mike Johnson,TechCorp,techcorp.io,CRO,,mike@techcorp.io,Developer tools company. $5M ARR. Growing 100% YoY.,Raised Series A $8M
Lisa Park,CloudBase,cloudbase.com,Head of Sales,,,Enterprise cloud infrastructure. 80 employees.,Posted 5 sales roles this month`;

const MEMBER_SUPPLY_CSV = `Full Name,Company Name,Domain,Service Description,LinkedIn URL,Email,Target Industries
Alex Brown,Certus Recruitment,certusrecruitment.com,"Tech recruitment agency placing GTM and IT roles for SaaS companies.",https://linkedin.com/in/alexbrown,,SaaS
Sarah Chen,GrowthOps Agency,growthops.io,"Revenue operations consulting for B2B SaaS.",,sarah@growthops.io,"SaaS, B2B"`;

// =============================================================================
// DEMAND CSV TESTS
// =============================================================================

describe('CSV Flow: Demand', () => {
  it('validates member-style demand CSV as valid', () => {
    const { result, rows } = validateCsv(MEMBER_DEMAND_CSV, 'demand');

    expect(result.status).toBe('valid');
    expect(result.errors).toHaveLength(0);
    expect(rows).toHaveLength(3);
    expect(result.stats.totalRows).toBe(3);
    expect(result.stats.validRows).toBe(3);
    expect(result.stats.invalidRows).toBe(0);
  });

  it('extracts all fields from demand CSV', () => {
    const { rows } = validateCsv(MEMBER_DEMAND_CSV, 'demand');

    // Check first row has all expected fields
    const jane = rows[0];
    expect(jane['Full Name']).toBe('Jane Smith');
    expect(jane['Company Name']).toBe('Acme SaaS');
    expect(jane['Domain']).toBe('acmesaas.com');
    expect(jane['Title']).toBe('VP of Sales');
    expect(jane['Email']).toBe('jane@acmesaas.com');
    expect(jane['Signal']).toBe('Hiring 3 Account Executives');
  });

  it('normalizes demand CSV to NormalizedRecord format', () => {
    const { rows } = validateCsv(MEMBER_DEMAND_CSV, 'demand');
    const { records } = normalizeCsvRecords({
      rows: rows as any,
      side: 'demand',
      uploadId: 'test-upload-001',
    });

    expect(records).toHaveLength(3);

    // Check first record normalization
    const first = records[0];
    expect(first.domain).toBe('acmesaas.com');
    expect(first.company).toBe('Acme SaaS');
    expect(first.recordKey).toContain('test-upload-001');
    expect(first.raw._side).toBe('demand');
    expect(first.raw._uploadId).toBe('test-upload-001');

    // Check contact fields (directly on record, not existingContact)
    expect(first.fullName).toBe('Jane Smith');
    expect(first.email).toBe('jane@acmesaas.com');
    expect(first.title).toBe('VP of Sales');
  });

  it('handles missing optional fields gracefully', () => {
    const { rows } = validateCsv(MEMBER_DEMAND_CSV, 'demand');
    const { records } = normalizeCsvRecords({
      rows: rows as any,
      side: 'demand',
      uploadId: 'test-upload-002',
    });

    // Lisa Park has no email or LinkedIn - should still normalize
    const lisa = records[2];
    expect(lisa.domain).toBe('cloudbase.com');
    expect(lisa.company).toBe('CloudBase');
    expect(lisa.fullName).toBe('Lisa Park');
    expect(lisa.email).toBeNull();
  });
});

// =============================================================================
// SUPPLY CSV TESTS
// =============================================================================

describe('CSV Flow: Supply', () => {
  it('validates member-style supply CSV as valid', () => {
    const { result, rows } = validateCsv(MEMBER_SUPPLY_CSV, 'supply');

    expect(result.status).toBe('valid');
    expect(result.errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(result.stats.totalRows).toBe(2);
    expect(result.stats.validRows).toBe(2);
  });

  it('normalizes supply CSV to NormalizedRecord format', () => {
    const { rows } = validateCsv(MEMBER_SUPPLY_CSV, 'supply');
    const { records } = normalizeCsvRecords({
      rows: rows as any,
      side: 'supply',
      uploadId: 'test-upload-003',
    });

    expect(records).toHaveLength(2);

    const alex = records[0];
    expect(alex.domain).toBe('certusrecruitment.com');
    expect(alex.company).toBe('Certus Recruitment');
    expect(alex.raw._side).toBe('supply');
    expect(alex.fullName).toBe('Alex Brown');
  });
});

// =============================================================================
// ERROR HANDLING TESTS
// =============================================================================

describe('CSV Flow: Error Handling', () => {
  it('rejects CSV with missing required Domain column', () => {
    const badCsv = `Full Name,Company Name,Title
Jane Smith,Acme SaaS,VP of Sales`;

    const { result } = validateCsv(badCsv, 'demand');

    expect(result.status).toBe('invalid');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.field.toLowerCase().includes('domain'))).toBe(true);
  });

  it('rejects CSV with invalid domain format', () => {
    const badDomainCsv = `Full Name,Company Name,Domain,Title,LinkedIn URL,Email,Company Description,Signal
Jane Smith,Acme SaaS,not-a-domain,VP of Sales,,,`;

    const { result } = validateCsv(badDomainCsv, 'demand');

    // Should have validation error for bad domain
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('handles empty CSV gracefully', () => {
    const emptyCsv = `Full Name,Company Name,Domain,Title,LinkedIn URL,Email,Company Description,Signal`;

    const { result, rows } = validateCsv(emptyCsv, 'demand');

    expect(rows).toHaveLength(0);
    expect(result.stats.totalRows).toBe(0);
  });
});

// =============================================================================
// FLOW INTEGRATION TEST — The Full Pipeline
// =============================================================================

describe('CSV Flow: Full Pipeline (Upload → Validate → Normalize)', () => {
  it('processes member CSV end-to-end without errors', () => {
    // Step 1: Validate (simulates what CsvUpload does)
    const { result, rows } = validateCsv(MEMBER_DEMAND_CSV, 'demand');
    expect(result.status).toBe('valid');

    // Step 2: Auto-proceed when valid (no dedup check needed)
    expect(result.status === 'valid' && rows.length > 0).toBe(true);

    // Step 3: Normalize
    const { records } = normalizeCsvRecords({
      rows: rows as any,
      side: 'demand',
      uploadId: crypto.randomUUID(),
    });

    // Step 4: Verify output is ready for Flow.tsx
    expect(records.length).toBe(3);
    records.forEach(record => {
      expect(record.domain).toBeTruthy();
      expect(record.company).toBeTruthy();
      expect(record.raw._side).toBe('demand');
      expect(record.recordKey).toBeTruthy();
    });

    // This is what gets stored to localStorage
    const serialized = JSON.stringify(records);
    expect(() => JSON.parse(serialized)).not.toThrow();
  });

  it('button condition: getCsvData returns truthy after normalization', () => {
    const { result, rows } = validateCsv(MEMBER_DEMAND_CSV, 'demand');
    const { records } = normalizeCsvRecords({
      rows: rows as any,
      side: 'demand',
      uploadId: 'test-btn-001',
    });

    // Simulates localStorage.setItem('csv_demand_data', JSON.stringify(records))
    const storedData = JSON.stringify(records);

    // Simulates getCsvData('demand') check
    const parsed = JSON.parse(storedData);
    const hasCsvData = parsed && parsed.length > 0;

    // This is what Flow.tsx button condition now checks:
    // disabled={!settings?.demandDatasetId && !getCsvData('demand')}
    // With CSV data, button should be ENABLED (not disabled)
    expect(hasCsvData).toBe(true);
  });
});
