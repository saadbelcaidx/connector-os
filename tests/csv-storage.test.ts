/**
 * CSV Storage Integration Test
 *
 * Tests the CSV Phase 2 storage flow:
 * 1. Settings.tsx stores normalized CSV to localStorage
 * 2. SignalsClient.ts retrieves it via getCsvData()
 * 3. Flow.tsx can use it for matching
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getCsvData, clearCsvData } from '../src/services/SignalsClient';

// =============================================================================
// MOCK DATA — Real-world structure from client CSV + Wellfound
// =============================================================================

// Supply CSV sample (client's recruiter CSV)
const SAMPLE_SUPPLY_CSV: any[] = [
  {
    recordKey: 'csv:supply:1',
    firstName: 'Sarah',
    lastName: 'Johnson',
    fullName: 'Sarah Johnson',
    email: 'sarah@recruiterfirm.com',
    title: 'Managing Partner',
    linkedin: 'https://linkedin.com/in/sarahjohnson',
    headline: 'Executive Recruiter | Tech & Finance',
    seniorityLevel: 'Partner',
    company: 'Elite Talent Partners',
    domain: 'recruiterfirm.com',
    industry: 'Staffing & Recruiting',
    size: '11-50',
    companyDescription: 'Executive search firm specializing in tech leadership',
    companyFunding: null,
    companyRevenue: null,
    location: 'New York, NY',
    raw: { _stableKey: 'csv_supply_sarah_recruiterfirm' }
  },
  {
    recordKey: 'csv:supply:2',
    firstName: 'Michael',
    lastName: 'Chen',
    fullName: 'Michael Chen',
    email: 'michael@techrecruit.io',
    title: 'Founder',
    linkedin: 'https://linkedin.com/in/michaelchen',
    headline: 'Tech Recruiting | Startups & Scale-ups',
    seniorityLevel: 'Owner',
    company: 'TechRecruit.io',
    domain: 'techrecruit.io',
    industry: 'Staffing & Recruiting',
    size: '1-10',
    companyDescription: 'Boutique recruiting for high-growth startups',
    companyFunding: null,
    companyRevenue: null,
    location: 'San Francisco, CA',
    raw: { _stableKey: 'csv_supply_michael_techrecruit' }
  }
];

// Demand sample (Wellfound-style normalized records)
const SAMPLE_DEMAND_WELLFOUND: any[] = [
  {
    recordKey: 'wellfound:job:123',
    firstName: 'Emily',
    lastName: 'Rodriguez',
    fullName: 'Emily Rodriguez',
    email: null, // Needs enrichment
    title: 'VP of Engineering',
    linkedin: null,
    headline: null,
    seniorityLevel: 'VP',
    company: 'Acme AI',
    domain: 'acmeai.com',
    industry: 'Artificial Intelligence',
    size: '51-200',
    companyDescription: 'AI-powered automation platform',
    companyFunding: 'Series B',
    companyRevenue: null,
    location: 'Austin, TX',
    raw: {
      job_title: 'Senior Software Engineer',
      posted_at: '2025-01-10',
      _wellfound_id: '123'
    }
  },
  {
    recordKey: 'wellfound:job:456',
    firstName: 'David',
    lastName: 'Kim',
    fullName: 'David Kim',
    email: null,
    title: 'CTO',
    linkedin: null,
    headline: null,
    seniorityLevel: 'C-Suite',
    company: 'DataFlow Labs',
    domain: 'dataflowlabs.io',
    industry: 'Data Infrastructure',
    size: '11-50',
    companyDescription: 'Real-time data pipeline platform',
    companyFunding: 'Seed',
    companyRevenue: null,
    location: 'Seattle, WA',
    raw: {
      job_title: 'Backend Engineer',
      posted_at: '2025-01-15',
      _wellfound_id: '456'
    }
  }
];

// =============================================================================
// TESTS
// =============================================================================

describe('CSV Storage Integration', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Storage Keys Contract', () => {
    it('uses correct key for demand: csv_normalized_demand', () => {
      // Simulate what Settings.tsx does
      localStorage.setItem('csv_normalized_demand', JSON.stringify(SAMPLE_DEMAND_WELLFOUND));

      // Verify SignalsClient can read it
      const retrieved = getCsvData('demand');
      expect(retrieved).not.toBeNull();
      expect(retrieved).toHaveLength(2);
    });

    it('uses correct key for supply: csv_normalized_supply', () => {
      localStorage.setItem('csv_normalized_supply', JSON.stringify(SAMPLE_SUPPLY_CSV));

      const retrieved = getCsvData('supply');
      expect(retrieved).not.toBeNull();
      expect(retrieved).toHaveLength(2);
    });

    it('returns null when no data stored', () => {
      expect(getCsvData('demand')).toBeNull();
      expect(getCsvData('supply')).toBeNull();
    });
  });

  describe('getCsvData()', () => {
    it('retrieves demand records with all fields intact', () => {
      localStorage.setItem('csv_normalized_demand', JSON.stringify(SAMPLE_DEMAND_WELLFOUND));

      const records = getCsvData('demand');
      expect(records).not.toBeNull();

      const first = records![0];
      expect(first.company).toBe('Acme AI');
      expect(first.domain).toBe('acmeai.com');
      expect(first.firstName).toBe('Emily');
      expect(first.title).toBe('VP of Engineering');
      expect(first.raw.job_title).toBe('Senior Software Engineer');
    });

    it('retrieves supply records with all fields intact', () => {
      localStorage.setItem('csv_normalized_supply', JSON.stringify(SAMPLE_SUPPLY_CSV));

      const records = getCsvData('supply');
      expect(records).not.toBeNull();

      const first = records![0];
      expect(first.company).toBe('Elite Talent Partners');
      expect(first.email).toBe('sarah@recruiterfirm.com');
      expect(first.title).toBe('Managing Partner');
    });

    it('handles corrupted JSON gracefully', () => {
      localStorage.setItem('csv_normalized_demand', 'not valid json{{{');

      const result = getCsvData('demand');
      expect(result).toBeNull(); // Fails safely
    });

    it('handles empty array', () => {
      localStorage.setItem('csv_normalized_demand', '[]');

      const result = getCsvData('demand');
      expect(result).toEqual([]);
    });
  });

  describe('clearCsvData()', () => {
    beforeEach(() => {
      localStorage.setItem('csv_normalized_demand', JSON.stringify(SAMPLE_DEMAND_WELLFOUND));
      localStorage.setItem('csv_normalized_supply', JSON.stringify(SAMPLE_SUPPLY_CSV));
    });

    it('clears demand only when side=demand', () => {
      clearCsvData('demand');

      expect(getCsvData('demand')).toBeNull();
      expect(getCsvData('supply')).not.toBeNull(); // Untouched
    });

    it('clears supply only when side=supply', () => {
      clearCsvData('supply');

      expect(getCsvData('demand')).not.toBeNull(); // Untouched
      expect(getCsvData('supply')).toBeNull();
    });

    it('clears both when no side specified', () => {
      clearCsvData();

      expect(getCsvData('demand')).toBeNull();
      expect(getCsvData('supply')).toBeNull();
    });
  });

  describe('Full Flow Simulation', () => {
    it('simulates Settings → localStorage → Flow retrieval', () => {
      // Step 1: Settings.tsx stores on upload complete (simulated)
      const settingsCallback = (records: any[]) => {
        localStorage.setItem('csv_normalized_supply', JSON.stringify(records));
      };
      settingsCallback(SAMPLE_SUPPLY_CSV);

      // Step 2: Flow.tsx reads via getCsvData
      const flowData = getCsvData('supply');

      // Step 3: Verify Flow can use the data
      expect(flowData).not.toBeNull();
      expect(flowData!.length).toBe(2);
      expect(flowData![0].email).toBe('sarah@recruiterfirm.com');
      expect(flowData![1].domain).toBe('techrecruit.io');
    });

    it('survives page refresh (localStorage persistence)', () => {
      // Store data
      localStorage.setItem('csv_normalized_demand', JSON.stringify(SAMPLE_DEMAND_WELLFOUND));

      // Simulate "refresh" by just re-reading
      const afterRefresh = getCsvData('demand');

      expect(afterRefresh).not.toBeNull();
      expect(afterRefresh![0].company).toBe('Acme AI');
    });

    it('demand and supply are isolated', () => {
      localStorage.setItem('csv_normalized_demand', JSON.stringify(SAMPLE_DEMAND_WELLFOUND));
      localStorage.setItem('csv_normalized_supply', JSON.stringify(SAMPLE_SUPPLY_CSV));

      const demand = getCsvData('demand');
      const supply = getCsvData('supply');

      // Verify isolation - different data
      expect(demand![0].company).toBe('Acme AI');
      expect(supply![0].company).toBe('Elite Talent Partners');

      // Verify no cross-contamination
      expect(demand).toHaveLength(2);
      expect(supply).toHaveLength(2);
    });

    it('re-upload replaces old data', () => {
      // First upload
      localStorage.setItem('csv_normalized_supply', JSON.stringify(SAMPLE_SUPPLY_CSV));
      expect(getCsvData('supply')![0].company).toBe('Elite Talent Partners');

      // Second upload (different data)
      const newUpload = [{
        ...SAMPLE_SUPPLY_CSV[0],
        company: 'New Firm LLC',
        email: 'new@newfirm.com'
      }];
      localStorage.setItem('csv_normalized_supply', JSON.stringify(newUpload));

      // Verify replacement
      const result = getCsvData('supply');
      expect(result).toHaveLength(1);
      expect(result![0].company).toBe('New Firm LLC');
    });
  });

  describe('Edge Cases', () => {
    it('handles records with null/undefined fields', () => {
      const sparseRecords = [{
        recordKey: 'sparse:1',
        firstName: 'John',
        lastName: null,
        fullName: 'John',
        email: null,
        title: '',
        linkedin: undefined,
        company: 'Unknown Co',
        domain: 'unknown.com'
      }];

      localStorage.setItem('csv_normalized_demand', JSON.stringify(sparseRecords));

      const result = getCsvData('demand');
      expect(result).not.toBeNull();
      expect(result![0].firstName).toBe('John');
      expect(result![0].email).toBeNull();
    });

    it('handles large datasets', () => {
      // Generate 500 records
      const largeDataset = Array.from({ length: 500 }, (_, i) => ({
        recordKey: `large:${i}`,
        firstName: `First${i}`,
        lastName: `Last${i}`,
        fullName: `First${i} Last${i}`,
        email: `email${i}@test.com`,
        company: `Company ${i}`,
        domain: `company${i}.com`
      }));

      localStorage.setItem('csv_normalized_supply', JSON.stringify(largeDataset));

      const result = getCsvData('supply');
      expect(result).toHaveLength(500);
      expect(result![499].firstName).toBe('First499');
    });
  });
});
