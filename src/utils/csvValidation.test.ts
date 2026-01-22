/**
 * csvValidation.test.ts — Tests for CSV validation with real user data
 *
 * Tests the new contract from user.txt:
 * - Required: Company Name, Signal
 * - Optional: Full Name, Email, Domain, Context
 */

import { describe, it, expect } from 'vitest';
import { validateCsv, parseCsv } from './csvValidation';
import { normalizeCsvRecords } from '../normalization/csv';

// Real user CSV data from Desktop/Demand - Demand.csv
const USER_DEMAND_CSV = `Full Name,Company Name,Domain,Email,Context,Signal
,CACI,,,"Job Title: Senior Software Engineer",Hiring: Senior Software Engineer - Machine Learning & Cloud Technologies
,The MITRE Corporation,,,"Why choose between doing meaningful work",Hiring: Entry Level - Software Engineering or Computer Science
,"Visionist, Inc.",www.visionistinc.com,,"Description Active Top Secret",Hiring: Full Stack Software Engineer with Security Clearance
,Northrop Grumman,www.northropgrumman.com,,"Expand your horizons",Hiring: Python Software Engineer - Level 3
,Cisco,www.cisco.com,,"Please note this posting",Hiring: Software Engineer Backend/Platform Systems I (Intern)
,CVS Health,www.cvshealth.com,,"We're building a world of health",Hiring: Sr Software Development Engineer - Full Stack
,Disney Entertainment and ESPN Product & Technology,,,"Technology is at the heart",Hiring: Sr Software Engineer - Swift
,Walmart,corporate.walmart.com,,"Position Summary",Hiring: Front End Software Engineer - Senior Level
,"Strategic Business Systems, Inc",,,"Strategic Business Systems",Hiring: Software Developer (Secret Clearance or Higher)
,AeroVironment,,,"Worker Type Regular",Hiring: Robotics Software Engineer`;

describe('CSV Validation (user.txt contract)', () => {
  describe('Required fields: Company Name + Signal', () => {
    it('should pass validation when Company Name and Signal are present (Domain optional)', () => {
      const { result, rows } = validateCsv(USER_DEMAND_CSV, 'demand');

      console.log('Validation result:', result.status);
      console.log('Total rows:', result.stats.totalRows);
      console.log('Valid rows:', result.stats.validRows);
      console.log('Invalid rows:', result.stats.invalidRows);

      if (result.errors.length > 0) {
        console.log('Errors:', result.errors.slice(0, 5));
      }

      expect(result.status).toBe('valid');
      expect(rows.length).toBe(10);
    });

    it('should parse all 10 rows from user CSV', () => {
      const { headers, rows } = parseCsv(USER_DEMAND_CSV);

      expect(headers).toContain('Full Name');
      expect(headers).toContain('Company Name');
      expect(headers).toContain('Domain');
      expect(headers).toContain('Signal');
      expect(rows.length).toBe(10);
    });

    it('should allow empty Full Name (enrichment finds contacts)', () => {
      const { result } = validateCsv(USER_DEMAND_CSV, 'demand');

      // No errors for empty Full Name
      const fullNameErrors = result.errors.filter(e => e.field === 'Full Name');
      expect(fullNameErrors.length).toBe(0);
    });

    it('should allow empty Domain (optional accelerator)', () => {
      const { result } = validateCsv(USER_DEMAND_CSV, 'demand');

      // No errors for empty Domain
      const domainErrors = result.errors.filter(e => e.field === 'Domain');
      expect(domainErrors.length).toBe(0);
    });

    it('should allow empty Email (optional)', () => {
      const { result } = validateCsv(USER_DEMAND_CSV, 'demand');

      // No errors for empty Email
      const emailErrors = result.errors.filter(e => e.field === 'Email');
      expect(emailErrors.length).toBe(0);
    });
  });

  describe('Normalization (single pass)', () => {
    it('should normalize CSV to NormalizedRecord[]', () => {
      const { rows } = validateCsv(USER_DEMAND_CSV, 'demand');

      const { records } = normalizeCsvRecords({
        rows: rows as any,
        side: 'demand',
        uploadId: 'test-123',
      });

      expect(records.length).toBe(10);

      // Check first record
      const first = records[0];
      expect(first.company).toBe('CACI');
      expect(first.signal).toBe('Hiring: Senior Software Engineer - Machine Learning & Cloud Technologies');
      expect(first.fullName).toBe(''); // Empty is OK
      expect(first.domain).toBe(''); // Empty is OK
      expect(first.signalMeta.kind).toBe('HIRING_ROLE');
    });

    it('should preserve domain when present', () => {
      const { rows } = validateCsv(USER_DEMAND_CSV, 'demand');

      const { records } = normalizeCsvRecords({
        rows: rows as any,
        side: 'demand',
        uploadId: 'test-123',
      });

      // Visionist has domain
      const visionist = records.find(r => r.company.includes('Visionist'));
      expect(visionist?.domain).toBe('visionistinc.com');

      // Cisco has domain
      const cisco = records.find(r => r.company === 'Cisco');
      expect(cisco?.domain).toBe('cisco.com');
    });

    it('should classify hiring signals correctly', () => {
      const { rows } = validateCsv(USER_DEMAND_CSV, 'demand');

      const { records } = normalizeCsvRecords({
        rows: rows as any,
        side: 'demand',
        uploadId: 'test-123',
      });

      // All signals start with "Hiring:" so should be HIRING_ROLE
      for (const record of records) {
        expect(record.signalMeta.kind).toBe('HIRING_ROLE');
        expect(record.signal).toMatch(/^Hiring:/);
      }
    });
  });

  describe('Edge cases', () => {
    it('should reject CSV missing Company Name column', () => {
      const badCsv = `Full Name,Domain,Signal
John Doe,acme.com,Hiring: Engineer`;

      const { result } = validateCsv(badCsv, 'demand');

      expect(result.status).toBe('invalid');
      expect(result.errors.some(e => e.field === 'Company Name')).toBe(true);
    });

    it('should reject CSV missing Signal column', () => {
      const badCsv = `Full Name,Company Name,Domain
John Doe,Acme Inc,acme.com`;

      const { result } = validateCsv(badCsv, 'demand');

      expect(result.status).toBe('invalid');
      expect(result.errors.some(e => e.field === 'Signal')).toBe(true);
    });

    it('should reject rows with empty Company Name', () => {
      const badCsv = `Full Name,Company Name,Domain,Signal
John Doe,,acme.com,Hiring: Engineer`;

      const { result } = validateCsv(badCsv, 'demand');

      expect(result.status).toBe('invalid');
      expect(result.errors.some(e =>
        e.field === 'Company Name' && e.reason.includes('empty')
      )).toBe(true);
    });

    it('should reject rows with empty Signal', () => {
      const badCsv = `Full Name,Company Name,Domain,Signal
John Doe,Acme Inc,acme.com,`;

      const { result } = validateCsv(badCsv, 'demand');

      expect(result.status).toBe('invalid');
      expect(result.errors.some(e =>
        e.field === 'Signal' && e.reason.includes('empty')
      )).toBe(true);
    });
  });
});
