/**
 * CsvUpload.test.ts — Tests for CSV column mapper + signal prefix
 *
 * Tests the pure helper functions:
 * - autoDetectMappings: fuzzy header matching
 * - applyMapping: column remapping + signal prefix
 * - serializeRowsToCsv: re-serialization for validateCsv
 *
 * Also tests the full pipeline: non-canonical CSV → mapping → validateCsv → pass
 */

import { describe, it, expect } from 'vitest';
import { autoDetectMappings, applyMapping, serializeRowsToCsv } from './CsvUpload';
import { validateCsv } from '../utils/csvValidation';
import { normalizeCsvRecords } from '../normalization/csv';

// =============================================================================
// autoDetectMappings
// =============================================================================

describe('autoDetectMappings', () => {
  it('should match exact canonical headers (case-insensitive)', () => {
    const headers = ['Company Name', 'Signal', 'Domain', 'Email'];
    const map = autoDetectMappings(headers);

    expect(map['Company Name']).toBe('Company Name');
    expect(map['Signal']).toBe('Signal');
    expect(map['Domain']).toBe('Domain');
    expect(map['Email']).toBe('Email');
  });

  it('should match lowercase canonical headers', () => {
    const headers = ['company name', 'signal', 'domain'];
    const map = autoDetectMappings(headers);

    expect(map['Company Name']).toBe('company name');
    expect(map['Signal']).toBe('signal');
    expect(map['Domain']).toBe('domain');
  });

  it('should match common aliases (Apollo/LinkedIn style)', () => {
    const headers = ['organization', 'job_title', 'company_url', 'email_address'];
    const map = autoDetectMappings(headers);

    expect(map['Company Name']).toBe('organization');
    expect(map['Signal']).toBe('job_title');
    expect(map['Domain']).toBe('company_url');
    expect(map['Email']).toBe('email_address');
  });

  it('should match underscore-style aliases', () => {
    const headers = ['company_name', 'hiring_signal', 'full_name', 'linkedin_url'];
    const map = autoDetectMappings(headers);

    expect(map['Company Name']).toBe('company_name');
    expect(map['Signal']).toBe('hiring_signal');
    expect(map['Full Name']).toBe('full_name');
    expect(map['LinkedIn URL']).toBe('linkedin_url');
  });

  it('should handle trimmed headers with whitespace', () => {
    // Papa Parse trims headers, so we test with pre-trimmed
    const headers = ['company', 'signal', 'url'];
    const map = autoDetectMappings(headers);

    expect(map['Company Name']).toBe('company');
    expect(map['Signal']).toBe('signal');
    expect(map['Domain']).toBe('url');
  });

  it('should not double-map the same header to two canonical fields', () => {
    // 'position' is an alias for Signal. Should NOT also map to Title.
    const headers = ['company', 'position'];
    const map = autoDetectMappings(headers);

    expect(map['Company Name']).toBe('company');
    expect(map['Signal']).toBe('position');
    expect(map['Title']).toBeUndefined();
  });

  it('should prioritize exact canonical match over alias match', () => {
    // 'Signal' exact match should win, even though 'signal' is also an alias
    const headers = ['Signal', 'company', 'title'];
    const map = autoDetectMappings(headers);

    expect(map['Signal']).toBe('Signal');
    expect(map['Company Name']).toBe('company');
    expect(map['Title']).toBe('title');
  });

  it('should return empty map for completely unknown headers', () => {
    const headers = ['foo', 'bar', 'baz', 'qux'];
    const map = autoDetectMappings(headers);

    expect(Object.keys(map).length).toBe(0);
  });

  it('should handle mixed known and unknown headers', () => {
    const headers = ['company', 'random_field', 'signal', 'another_field'];
    const map = autoDetectMappings(headers);

    expect(map['Company Name']).toBe('company');
    expect(map['Signal']).toBe('signal');
    expect(Object.keys(map).length).toBe(2);
  });

  it('should map "account name" to Company Name', () => {
    const headers = ['account name', 'trigger'];
    const map = autoDetectMappings(headers);

    expect(map['Company Name']).toBe('account name');
    expect(map['Signal']).toBe('trigger');
  });
});

// =============================================================================
// applyMapping
// =============================================================================

describe('applyMapping', () => {
  it('should remap columns using the provided map', () => {
    const rows = [
      { organization: 'Stripe', job_title: 'Senior Engineer', company_url: 'stripe.com' },
      { organization: 'Vercel', job_title: 'Staff Designer', company_url: 'vercel.com' },
    ];
    const map = { 'Company Name': 'organization', 'Signal': 'job_title', 'Domain': 'company_url' };

    const result = applyMapping(rows, map, '');

    expect(result[0]['Company Name']).toBe('Stripe');
    expect(result[0]['Signal']).toBe('Senior Engineer');
    expect(result[0]['Domain']).toBe('stripe.com');
    expect(result[1]['Company Name']).toBe('Vercel');
  });

  it('should prepend signal prefix when provided', () => {
    const rows = [
      { company: 'Acme', signal: 'VP Sales' },
      { company: 'Beta', signal: 'CTO' },
    ];
    const map = { 'Company Name': 'company', 'Signal': 'signal' };

    const result = applyMapping(rows, map, 'Hiring');

    expect(result[0]['Signal']).toBe('Hiring VP Sales');
    expect(result[1]['Signal']).toBe('Hiring CTO');
  });

  it('should not prefix when signal prefix is empty', () => {
    const rows = [{ company: 'Acme', signal: 'VP Sales' }];
    const map = { 'Company Name': 'company', 'Signal': 'signal' };

    const result = applyMapping(rows, map, '');

    expect(result[0]['Signal']).toBe('VP Sales');
  });

  it('should skip unmapped/skipped fields', () => {
    const rows = [{ company: 'Acme', signal: 'VP Sales', random: 'ignore me' }];
    const map = { 'Company Name': 'company', 'Signal': 'signal' };

    const result = applyMapping(rows, map, '');

    expect(result[0]['Company Name']).toBe('Acme');
    expect(result[0]['Signal']).toBe('VP Sales');
    expect(result[0]['random']).toBeUndefined();
    expect(Object.keys(result[0]).length).toBe(2);
  });

  it('should handle empty string mappings (skipped fields)', () => {
    const rows = [{ company: 'Acme', signal: 'VP Sales' }];
    const map = { 'Company Name': 'company', 'Signal': 'signal', 'Domain': '' };

    const result = applyMapping(rows, map, '');

    expect(result[0]['Domain']).toBeUndefined();
  });

  it('should handle rows where mapped column value is empty', () => {
    const rows = [
      { company: 'Acme', signal: 'VP Sales' },
      { company: '', signal: 'CTO' },
    ];
    const map = { 'Company Name': 'company', 'Signal': 'signal' };

    const result = applyMapping(rows, map, '');

    expect(result[0]['Company Name']).toBe('Acme');
    expect(result[1]['Company Name']).toBe('');
  });

  it('should not prefix when Signal value is empty', () => {
    const rows = [{ company: 'Acme', signal: '' }];
    const map = { 'Company Name': 'company', 'Signal': 'signal' };

    const result = applyMapping(rows, map, 'Hiring');

    // Signal is empty string, so prefix guard: `signalPrefix && mapped['Signal']`
    // '' is falsy, so prefix should NOT be applied
    expect(result[0]['Signal']).toBe('');
  });
});

// =============================================================================
// serializeRowsToCsv
// =============================================================================

describe('serializeRowsToCsv', () => {
  it('should serialize mapped rows back to CSV text', () => {
    const rows = [
      { 'Company Name': 'Stripe', 'Signal': 'Hiring: Engineer' },
      { 'Company Name': 'Vercel', 'Signal': 'Hiring: Designer' },
    ];

    const csv = serializeRowsToCsv(rows);

    expect(csv).toContain('Company Name');
    expect(csv).toContain('Signal');
    expect(csv).toContain('Stripe');
    expect(csv).toContain('Vercel');
  });

  it('should return empty string for empty array', () => {
    expect(serializeRowsToCsv([])).toBe('');
  });

  it('should include all keys from all rows', () => {
    const rows = [
      { 'Company Name': 'Stripe', 'Signal': 'Engineer' },
      { 'Company Name': 'Vercel', 'Signal': 'Designer', 'Domain': 'vercel.com' },
    ];

    const csv = serializeRowsToCsv(rows);

    expect(csv).toContain('Domain');
    expect(csv).toContain('vercel.com');
  });
});

// =============================================================================
// Full pipeline: non-canonical CSV → mapping → validateCsv → normalization
// =============================================================================

describe('Full pipeline (mapping → validation → normalization)', () => {
  it('should process Apollo-style CSV through mapping into valid records', () => {
    const rawRows = [
      { organization: 'Stripe', job_title: 'Senior Engineer', company_url: 'stripe.com', email_address: 'john@stripe.com' },
      { organization: 'Vercel', job_title: 'Staff Designer', company_url: 'vercel.com', email_address: 'jane@vercel.com' },
      { organization: 'Linear', job_title: 'Backend Engineer', company_url: 'linear.app', email_address: '' },
    ];

    const headers = ['organization', 'job_title', 'company_url', 'email_address'];
    const detected = autoDetectMappings(headers);

    // Verify detection
    expect(detected['Company Name']).toBe('organization');
    expect(detected['Signal']).toBe('job_title');
    expect(detected['Domain']).toBe('company_url');
    expect(detected['Email']).toBe('email_address');

    // Apply mapping
    const mapped = applyMapping(rawRows, detected, '');

    expect(mapped[0]['Company Name']).toBe('Stripe');
    expect(mapped[0]['Signal']).toBe('Senior Engineer');

    // Serialize and validate
    const csvText = serializeRowsToCsv(mapped);
    const { result, rows } = validateCsv(csvText, 'demand');

    expect(result.status).toBe('valid');
    expect(rows.length).toBe(3);

    // Normalize
    const { records } = normalizeCsvRecords({
      rows: rows as any,
      side: 'demand',
      uploadId: 'test-pipeline',
    });

    expect(records.length).toBe(3);
    expect(records[0].company).toBe('Stripe');
    expect(records[0].signal).toBe('Senior Engineer');
    expect(records[0].domain).toBe('stripe.com');
  });

  it('should process CSV with signal prefix through full pipeline', () => {
    const rawRows = [
      { company: 'Acme Corp', role: 'VP Sales', website: 'acme.com' },
      { company: 'Beta Inc', role: 'CTO', website: 'beta.io' },
    ];

    const detected = autoDetectMappings(['company', 'role', 'website']);
    const mapped = applyMapping(rawRows, detected, 'Hiring');

    expect(mapped[0]['Signal']).toBe('Hiring VP Sales');
    expect(mapped[1]['Signal']).toBe('Hiring CTO');

    const csvText = serializeRowsToCsv(mapped);
    const { result, rows } = validateCsv(csvText, 'demand');

    expect(result.status).toBe('valid');

    const { records } = normalizeCsvRecords({
      rows: rows as any,
      side: 'demand',
      uploadId: 'test-prefix',
    });

    expect(records[0].signal).toBe('Hiring VP Sales');
    expect(records[1].signal).toBe('Hiring CTO');
  });

  it('should fail validation when required fields are empty after mapping', () => {
    const rawRows = [
      { org: 'Stripe', trigger: 'Engineer' },
      { org: '', trigger: 'Designer' },       // Empty Company Name
      { org: 'Linear', trigger: '' },          // Empty Signal
    ];

    const map = { 'Company Name': 'org', 'Signal': 'trigger' };
    const mapped = applyMapping(rawRows, map, '');
    const csvText = serializeRowsToCsv(mapped);
    const { result } = validateCsv(csvText, 'demand');

    expect(result.status).toBe('invalid');
    expect(result.errors.some(e => e.field === 'Company Name' && e.reason.includes('empty'))).toBe(true);
    expect(result.errors.some(e => e.field === 'Signal' && e.reason.includes('empty'))).toBe(true);
    expect(result.stats.invalidRows).toBe(2);
    expect(result.stats.validRows).toBe(1);
  });

  it('should handle canonical CSV identically (no mapping needed)', () => {
    const canonicalCsv = `Company Name,Signal,Domain
Stripe,Hiring: Engineer,stripe.com
Vercel,Hiring: Designer,vercel.com`;

    const { result, rows } = validateCsv(canonicalCsv, 'demand');

    expect(result.status).toBe('valid');
    expect(rows.length).toBe(2);

    const { records } = normalizeCsvRecords({
      rows: rows as any,
      side: 'demand',
      uploadId: 'test-canonical',
    });

    expect(records.length).toBe(2);
    expect(records[0].company).toBe('Stripe');
  });

  it('should work for supply side CSVs', () => {
    const rawRows = [
      { organization: 'TechRecruit', trigger: 'Staffing: Engineering', website: 'techrecruit.com' },
    ];

    const detected = autoDetectMappings(['organization', 'trigger', 'website']);
    const mapped = applyMapping(rawRows, detected, '');
    const csvText = serializeRowsToCsv(mapped);
    const { result, rows } = validateCsv(csvText, 'supply');

    expect(result.status).toBe('valid');

    const { records } = normalizeCsvRecords({
      rows: rows as any,
      side: 'supply',
      uploadId: 'test-supply',
    });

    expect(records.length).toBe(1);
    expect(records[0].company).toBe('TechRecruit');
  });
});

// =============================================================================
// Dropdown exclusion (usedColumns logic)
// =============================================================================

describe('Dropdown exclusion logic', () => {
  it('should not allow same header mapped to two fields', () => {
    // Simulate: 'position' maps to Signal via auto-detect
    const headers = ['company', 'position', 'email'];
    const map = autoDetectMappings(headers);

    // 'position' should be claimed by Signal
    expect(map['Signal']).toBe('position');

    // Title should NOT get 'position'
    expect(map['Title']).toBeUndefined();

    // Build usedColumns set (same logic as component)
    const usedColumns = new Set(Object.values(map).filter(v => v && v !== ''));
    expect(usedColumns.has('position')).toBe(true);
    expect(usedColumns.has('company')).toBe(true);
  });
});
