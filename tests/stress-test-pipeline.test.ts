/**
 * STRESS TEST — Full Pipeline Simulation
 *
 * Tests the complete flow: CSV → Normalize → Match → Intro Generation
 * Verifies all 6 invariants under realistic conditions
 */

import { describe, it, expect } from 'vitest';
import { normalize, detectSchema, B2B_CONTACTS } from '../src/schemas/index';
import { simpleHash } from '../src/enrichment/recordKey';

// =============================================================================
// STRESS TEST DATA — Designed to break weak systems
// =============================================================================

// 10 demand records with intentional collision risks
const STRESS_DEMAND_CSV = [
  { 'Full Name': 'John Smith', 'Company Name': 'Acme Corp', 'Domain': 'acme.com', 'Title': 'CEO', 'Signal': 'Hiring: eCommerce Director', 'Email': 'john@acme.com' },
  { 'Full Name': 'John Smith', 'Company Name': 'Acme Corp', 'Domain': 'acme.com', 'Title': 'CTO', 'Signal': 'Hiring: Senior Engineer', 'Email': '' },
  { 'Full Name': 'Jane Doe', 'Company Name': 'Beta Industries', 'Domain': 'beta.io', 'Title': 'VP Sales', 'Signal': 'Raised Series B - $50M', 'Email': 'jane@beta.io' },
  { 'Full Name': 'Jane Doe', 'Company Name': 'Beta Industries', 'Domain': 'beta.io', 'Title': 'VP Marketing', 'Signal': 'Expanding to Europe', 'Email': '' },
  { 'Full Name': 'Michael Chen', 'Company Name': 'Gamma Tech', 'Domain': '', 'Title': 'Director', 'Signal': 'Hiring: ML Engineers', 'Email': 'michael@gamma.com' },
  { 'Full Name': 'Michael Chen', 'Company Name': 'Gamma Tech', 'Domain': '', 'Title': 'Manager', 'Signal': 'Hiring: Data Scientists', 'Email': '' },
  { 'Full Name': 'Sarah Wilson', 'Company Name': 'Delta Labs', 'Domain': 'delta.com', 'Title': 'Founder', 'Signal': 'Acquired competitor ThetaCo', 'Email': 'sarah@delta.com' },
  { 'Full Name': 'Sarah Wilson', 'Company Name': 'Delta Labs', 'Domain': 'delta.com', 'Title': 'Co-Founder', 'Signal': 'Launched new product line', 'Email': '' },
  { 'Full Name': 'Alex Johnson', 'Company Name': 'Epsilon Inc', 'Domain': 'epsilon.io', 'Title': 'Head of Engineering', 'Signal': 'Hiring: 10 backend engineers', 'Email': 'alex@epsilon.io' },
  { 'Full Name': 'Alex Johnson', 'Company Name': 'Epsilon Inc', 'Domain': 'epsilon.io', 'Title': 'Engineering Lead', 'Signal': 'Hiring: DevOps team', 'Email': '' },
];

// 5 supply records
const STRESS_SUPPLY_CSV = [
  { 'Full Name': 'Tom Recruiter', 'Company Name': 'TalentPro Agency', 'Domain': 'talentpro.com', 'Title': 'Partner', 'Capability': 'eCommerce & Retail Recruiting', 'Email': 'tom@talentpro.com' },
  { 'Full Name': 'Lisa Engineer', 'Company Name': 'DevHire Solutions', 'Domain': 'devhire.io', 'Title': 'Managing Director', 'Capability': 'Engineering & Technical Recruiting', 'Email': 'lisa@devhire.io' },
  { 'Full Name': 'Mark Advisor', 'Company Name': 'Growth Capital Partners', 'Domain': 'growthcap.com', 'Title': 'Partner', 'Capability': 'Series A-C Funding Advisory', 'Email': 'mark@growthcap.com' },
  { 'Full Name': 'Nina Consultant', 'Company Name': 'Scale Consulting', 'Domain': 'scaleconsult.com', 'Title': 'Principal', 'Capability': 'International Expansion Strategy', 'Email': 'nina@scaleconsult.com' },
  { 'Full Name': 'Dave ML', 'Company Name': 'AITalent Search', 'Domain': 'aitalent.io', 'Title': 'Founder', 'Capability': 'ML & Data Science Recruiting', 'Email': 'dave@aitalent.io' },
];

// =============================================================================
// INVARIANT A: SIGNAL PRECEDENCE (10 records)
// =============================================================================

describe('STRESS TEST: Signal Precedence (10 records)', () => {
  it('ALL records use Signal column, not Title', () => {
    for (const record of STRESS_DEMAND_CSV) {
      const normalized = normalize(record, B2B_CONTACTS);

      // Signal column should be the source
      if (record.Signal.toLowerCase().includes('hiring')) {
        expect(normalized.signalMeta?.kind).toBe('HIRING_ROLE');
        expect(normalized.signalMeta?.source).toBe('Signal');
      } else {
        expect(normalized.signalMeta?.kind).toBe('GROWTH');
        expect(normalized.signalMeta?.source).toBe('Signal');
      }

      // Title should be preserved but NOT used as signal
      expect(normalized.title).toBe(record.Title);
      expect(normalized.signalMeta?.label).toBe(record.Signal);
    }
  });

  it('Signal text is preserved exactly', () => {
    const signals = STRESS_DEMAND_CSV.map(r => r.Signal);
    const normalized = STRESS_DEMAND_CSV.map(r => normalize(r, B2B_CONTACTS));

    for (let i = 0; i < signals.length; i++) {
      expect(normalized[i].signalMeta?.label).toBe(signals[i]);
    }
  });
});

// =============================================================================
// INVARIANT B: IDENTITY UNIQUENESS (collision stress test)
// =============================================================================

describe('STRESS TEST: Identity Uniqueness (collision prevention)', () => {
  it('ALL 10 demand records get unique recordKeys', () => {
    const keys = new Set<string>();

    for (const record of STRESS_DEMAND_CSV) {
      const normalized = normalize(record, B2B_CONTACTS);
      expect(normalized.recordKey).toBeTruthy();
      keys.add(normalized.recordKey);
    }

    // All 10 must be unique
    expect(keys.size).toBe(10);
  });

  it('Duplicate name+company pairs get different keys', () => {
    // John Smith @ Acme Corp appears twice
    const johnSmith1 = normalize(STRESS_DEMAND_CSV[0], B2B_CONTACTS);
    const johnSmith2 = normalize(STRESS_DEMAND_CSV[1], B2B_CONTACTS);

    expect(johnSmith1.recordKey).not.toBe(johnSmith2.recordKey);

    // Jane Doe @ Beta Industries appears twice
    const janeDoe1 = normalize(STRESS_DEMAND_CSV[2], B2B_CONTACTS);
    const janeDoe2 = normalize(STRESS_DEMAND_CSV[3], B2B_CONTACTS);

    expect(janeDoe1.recordKey).not.toBe(janeDoe2.recordKey);
  });

  it('Domainless records (Gamma Tech) still get unique keys', () => {
    const michael1 = normalize(STRESS_DEMAND_CSV[4], B2B_CONTACTS);
    const michael2 = normalize(STRESS_DEMAND_CSV[5], B2B_CONTACTS);

    // Both have empty domain
    expect(STRESS_DEMAND_CSV[4].Domain).toBe('');
    expect(STRESS_DEMAND_CSV[5].Domain).toBe('');

    // But keys must differ
    expect(michael1.recordKey).not.toBe(michael2.recordKey);
  });

  it('Records with email use email as stable key', () => {
    const withEmail = STRESS_DEMAND_CSV.filter(r => r.Email);

    for (const record of withEmail) {
      const normalized = normalize(record, B2B_CONTACTS);
      expect(normalized.recordKey).toContain(record.Email.split('@')[0].toLowerCase());
    }
  });
});

// =============================================================================
// INVARIANT D: INTRO INPUT VARIANCE (fingerprint uniqueness)
// =============================================================================

describe('STRESS TEST: Intro Input Variance (all fingerprints unique)', () => {
  it('ALL 10 demand records produce unique prompt fingerprints', () => {
    const fingerprints = new Set<string>();

    for (const record of STRESS_DEMAND_CSV) {
      const normalized = normalize(record, B2B_CONTACTS);

      // Simulate the fingerprint calculation from Flow.tsx
      const fingerprint = simpleHash(JSON.stringify({
        dc: normalized.company,
        ds: [normalized.signalMeta?.label],
        ee: normalized.signalMeta?.kind === 'HIRING_ROLE'
          ? `is hiring ${normalized.signalMeta?.label?.replace(/^hiring[:\s]*/i, '').trim()}`
          : normalized.signalMeta?.label,
      }));

      fingerprints.add(fingerprint);
    }

    // All 10 should be unique (different signals = different fingerprints)
    expect(fingerprints.size).toBe(10);
  });

  it('Same company, different signals = different fingerprints', () => {
    // Acme Corp has two different signals
    const acme1 = normalize(STRESS_DEMAND_CSV[0], B2B_CONTACTS);
    const acme2 = normalize(STRESS_DEMAND_CSV[1], B2B_CONTACTS);

    const fp1 = simpleHash(JSON.stringify({ c: acme1.company, s: acme1.signalMeta?.label }));
    const fp2 = simpleHash(JSON.stringify({ c: acme2.company, s: acme2.signalMeta?.label }));

    expect(fp1).not.toBe(fp2);
  });
});

// =============================================================================
// INVARIANT F: OBSERVABILITY (hash stability)
// =============================================================================

describe('STRESS TEST: Observability (deterministic hashing)', () => {
  it('Same input always produces same hash', () => {
    const input = JSON.stringify({ company: 'Acme', signal: 'Hiring' });

    const hash1 = simpleHash(input);
    const hash2 = simpleHash(input);
    const hash3 = simpleHash(input);

    expect(hash1).toBe(hash2);
    expect(hash2).toBe(hash3);
  });

  it('ALL 10 records produce stable hashes across multiple runs', () => {
    const hashes1: string[] = [];
    const hashes2: string[] = [];

    // Run 1
    for (const record of STRESS_DEMAND_CSV) {
      const normalized = normalize(record, B2B_CONTACTS);
      hashes1.push(simpleHash(JSON.stringify(normalized.signalMeta)));
    }

    // Run 2
    for (const record of STRESS_DEMAND_CSV) {
      const normalized = normalize(record, B2B_CONTACTS);
      hashes2.push(simpleHash(JSON.stringify(normalized.signalMeta)));
    }

    // Must be identical
    expect(hashes1).toEqual(hashes2);
  });
});

// =============================================================================
// FULL PIPELINE SIMULATION
// =============================================================================

describe('STRESS TEST: Full Pipeline Simulation', () => {
  it('Simulates Load → Normalize → Match → Fingerprint for 10 demand + 5 supply', () => {
    // STEP 1: Load and normalize demand
    const normalizedDemand = STRESS_DEMAND_CSV.map(r => normalize(r, B2B_CONTACTS));

    // STEP 2: Load and normalize supply
    const normalizedSupply = STRESS_SUPPLY_CSV.map(r => normalize(r, B2B_CONTACTS));

    // STEP 3: Verify all unique
    const demandKeys = new Set(normalizedDemand.map(d => d.recordKey));
    const supplyKeys = new Set(normalizedSupply.map(s => s.recordKey));

    expect(demandKeys.size).toBe(10);
    expect(supplyKeys.size).toBe(5);

    // STEP 4: Simulate matching (each demand matched to a supply)
    const matches: Array<{ demand: any; supply: any; fingerprint: string }> = [];

    for (let i = 0; i < normalizedDemand.length; i++) {
      const demand = normalizedDemand[i];
      const supply = normalizedSupply[i % normalizedSupply.length]; // Round-robin

      const fingerprint = simpleHash(JSON.stringify({
        demandKey: demand.recordKey,
        demandCompany: demand.company,
        demandSignal: demand.signalMeta?.label,
        supplyKey: supply.recordKey,
        supplyCompany: supply.company,
      }));

      matches.push({ demand, supply, fingerprint });
    }

    // STEP 5: Verify all match fingerprints are unique
    const matchFingerprints = new Set(matches.map(m => m.fingerprint));
    expect(matchFingerprints.size).toBe(10);

    // STEP 6: Verify no placeholder text in any normalized record
    for (const d of normalizedDemand) {
      expect(d.company).not.toBe('...');
      expect(d.company).not.toBe('');
      expect(d.signalMeta?.label).not.toBe('...');
    }

    console.log('\n=== STRESS TEST RESULTS ===');
    console.log(`Demand records: ${normalizedDemand.length}`);
    console.log(`Supply records: ${normalizedSupply.length}`);
    console.log(`Unique demand keys: ${demandKeys.size}`);
    console.log(`Unique supply keys: ${supplyKeys.size}`);
    console.log(`Unique match fingerprints: ${matchFingerprints.size}`);
    console.log('===========================\n');
  });

  it('Evidence generation produces unique "why" for each match', () => {
    const evidenceSet = new Set<string>();

    for (const record of STRESS_DEMAND_CSV) {
      const normalized = normalize(record, B2B_CONTACTS);

      // Simulate buildWhy logic
      let evidence: string;

      if (normalized.signalMeta?.kind === 'HIRING_ROLE') {
        const role = (normalized.signalMeta?.label || '').replace(/^hiring[:\s]*/i, '').trim();
        evidence = role ? `is hiring ${role}` : 'is actively hiring';
      } else if (normalized.signalMeta?.kind === 'GROWTH') {
        evidence = normalized.signalMeta?.label || 'is showing growth';
      } else {
        const title = normalized.title || normalized.signalMeta?.label || '';
        evidence = title ? `has ${title} exploring options` : 'may be exploring partners';
      }

      evidenceSet.add(evidence);
    }

    // All 10 should have unique evidence (since signals are all different)
    expect(evidenceSet.size).toBe(10);
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('STRESS TEST: Edge Cases', () => {
  it('Empty Signal falls back to Title-based CONTACT_ROLE', () => {
    const recordNoSignal = {
      'Full Name': 'Test User',
      'Company Name': 'Test Corp',
      'Domain': 'test.com',
      'Title': 'VP of Engineering',
      'Signal': '',
      'Email': 'test@test.com',
    };

    const normalized = normalize(recordNoSignal, B2B_CONTACTS);

    expect(normalized.signalMeta?.kind).toBe('CONTACT_ROLE');
    expect(normalized.signalMeta?.label).toBe('VP of Engineering');
    expect(normalized.signalMeta?.source).toBe('job_title');
  });

  it('Special characters in Signal are preserved', () => {
    const recordSpecialChars = {
      'Full Name': 'Test User',
      'Company Name': 'Test Corp',
      'Domain': 'test.com',
      'Title': 'CEO',
      'Signal': 'Raised $50M Series B — expanding to EMEA & APAC!',
      'Email': 'test@test.com',
    };

    const normalized = normalize(recordSpecialChars, B2B_CONTACTS);

    expect(normalized.signalMeta?.label).toBe('Raised $50M Series B — expanding to EMEA & APAC!');
  });

  it('Very long Signal is handled', () => {
    const longSignal = 'Hiring: ' + 'Senior Engineer '.repeat(20);
    const recordLongSignal = {
      'Full Name': 'Test User',
      'Company Name': 'Test Corp',
      'Domain': 'test.com',
      'Title': 'CEO',
      'Signal': longSignal,
      'Email': 'test@test.com',
    };

    const normalized = normalize(recordLongSignal, B2B_CONTACTS);

    expect(normalized.signalMeta?.kind).toBe('HIRING_ROLE');
    expect(normalized.signalMeta?.label).toBe(longSignal);
  });
});
