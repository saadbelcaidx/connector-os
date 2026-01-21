/**
 * CSV Matching Diagnostic Test
 *
 * Simulates real matching between:
 * - Supply: Client's recruiter CSV
 * - Demand: Wellfound job dataset
 *
 * Diagnoses why matches might be scoring low.
 */

import { describe, it, expect } from 'vitest';
import { scoreMatch, matchRecordsSync } from '../src/matching/index';
import { NormalizedRecord } from '../src/schemas';

// =============================================================================
// ACTUAL WELLFOUND DATA (from H3gFQ9BTJS5EuDzcE)
// =============================================================================

const WELLFOUND_DEMAND: NormalizedRecord[] = [
  {
    recordKey: 'wellfound:3766160',
    firstName: '',
    lastName: '',
    fullName: '',
    email: null,
    title: 'Director of Operations',
    linkedin: null,
    headline: null,
    seniorityLevel: 'Director',
    company: 'Besty AI',
    domain: 'getbesty.ai',
    industry: ['Real Estate', 'Artificial Intelligence'],
    size: '11-50',
    companyDescription: 'AI-native operating system for the $1T+ short-term-rental and hotel industry',
    companyFunding: 'Seed',
    companyRevenue: null,
    location: 'New York City',
    signal: 'Director of Operations',
    signalMeta: { label: 'hiring', postedAt: '2026-01-18' },
    raw: { job_title: 'Director of Operations' }
  },
  {
    recordKey: 'wellfound:3762269',
    firstName: '',
    lastName: '',
    fullName: '',
    email: null,
    title: 'Inside Sales Representative (Portuguese)',
    linkedin: null,
    headline: null,
    seniorityLevel: null,
    company: 'Botpress',
    domain: 'botpress.com',
    industry: ['SaaS', 'Enterprise Software', 'Artificial Intelligence'],
    size: '51-200',
    companyDescription: 'The most widely-used platform for sophisticated AI agents',
    companyFunding: 'Series A',
    companyRevenue: null,
    location: 'Montreal',
    signal: 'Inside Sales Representative',
    signalMeta: { label: 'hiring', postedAt: '2026-01-17' },
    raw: { job_title: 'Inside Sales Representative (Portuguese)' }
  },
  {
    recordKey: 'wellfound:mock3',
    firstName: '',
    lastName: '',
    fullName: '',
    email: null,
    title: 'Senior Software Engineer',
    linkedin: null,
    headline: null,
    seniorityLevel: 'Senior',
    company: 'DataCorp AI',
    domain: 'datacorpai.com',
    industry: ['Artificial Intelligence', 'Data Infrastructure'],
    size: '11-50',
    companyDescription: 'AI-powered data pipeline automation platform',
    companyFunding: 'Seed',
    companyRevenue: null,
    location: 'San Francisco',
    signal: 'Senior Software Engineer',
    signalMeta: { label: 'hiring', postedAt: '2026-01-16' },
    raw: { job_title: 'Senior Software Engineer' }
  }
];

// =============================================================================
// SUPPLY SCENARIOS - Testing different CSV quality levels
// =============================================================================

// SCENARIO A: Well-populated recruiter CSV (should score HIGH)
const SUPPLY_GOOD: NormalizedRecord[] = [
  {
    recordKey: 'csv:supply:good1',
    firstName: 'Sarah',
    lastName: 'Johnson',
    fullName: 'Sarah Johnson',
    email: 'sarah@eliterecruit.com',
    title: 'Managing Partner',
    linkedin: 'https://linkedin.com/in/sarahjohnson',
    headline: 'Tech Executive Recruiter',
    seniorityLevel: 'Partner',
    company: 'Elite Tech Recruiters',
    domain: 'eliterecruit.com',
    industry: 'Staffing & Recruiting',
    size: '11-50',
    companyDescription: 'Executive recruiting firm specializing in tech leadership and engineering talent for AI startups and scale-ups',
    companyFunding: null,
    companyRevenue: null,
    location: 'New York, NY',
    raw: {}
  },
  {
    recordKey: 'csv:supply:good2',
    firstName: 'Mike',
    lastName: 'Chen',
    fullName: 'Mike Chen',
    email: 'mike@salestalent.io',
    title: 'Founder',
    linkedin: 'https://linkedin.com/in/mikechen',
    headline: 'Sales Recruiting Expert',
    seniorityLevel: 'Owner',
    company: 'Sales Talent Partners',
    domain: 'salestalent.io',
    industry: 'Staffing & Recruiting',
    size: '1-10',
    companyDescription: 'Boutique recruiting agency placing sales and revenue leaders at high-growth SaaS companies',
    companyFunding: null,
    companyRevenue: null,
    location: 'San Francisco, CA',
    raw: {}
  }
];

// SCENARIO B: Sparse recruiter CSV (likely what user has - missing descriptions)
const SUPPLY_SPARSE: NormalizedRecord[] = [
  {
    recordKey: 'csv:supply:sparse1',
    firstName: 'Sarah',
    lastName: 'Johnson',
    fullName: 'Sarah Johnson',
    email: 'sarah@company.com',
    title: 'Recruiter',
    linkedin: null,
    headline: null,
    seniorityLevel: null,
    company: 'ABC Staffing',
    domain: 'abcstaffing.com',
    industry: null,  // MISSING
    size: null,
    companyDescription: null,  // MISSING - big problem!
    companyFunding: null,
    companyRevenue: null,
    location: 'New York',
    raw: {}
  },
  {
    recordKey: 'csv:supply:sparse2',
    firstName: 'Mike',
    lastName: 'Chen',
    fullName: 'Mike Chen',
    email: 'mike@xyz.com',
    title: 'CEO',  // Generic title, no "recruiter"
    linkedin: null,
    headline: null,
    seniorityLevel: null,
    company: 'XYZ Partners',  // No "recruiting" keyword
    domain: 'xyzpartners.com',
    industry: null,
    size: null,
    companyDescription: null,
    companyFunding: null,
    companyRevenue: null,
    location: 'SF',
    raw: {}
  }
];

// SCENARIO C: Minimal but has key recruiting keywords
const SUPPLY_MINIMAL_GOOD: NormalizedRecord[] = [
  {
    recordKey: 'csv:supply:min1',
    firstName: 'Sarah',
    lastName: 'Johnson',
    fullName: 'Sarah Johnson',
    email: 'sarah@techrecruit.com',
    title: 'Tech Recruiter',  // Has "recruiter" keyword!
    linkedin: null,
    headline: null,
    seniorityLevel: null,
    company: 'TechRecruit Inc',  // Has "recruit" keyword!
    domain: 'techrecruit.com',
    industry: 'Staffing',
    size: null,
    companyDescription: null,
    companyFunding: null,
    companyRevenue: null,
    location: 'NYC',
    raw: {}
  }
];

// =============================================================================
// TESTS
// =============================================================================

describe('CSV Matching Diagnostic', () => {

  describe('Individual Score Analysis', () => {

    it('GOOD supply vs engineering demand → should be STRONG tier', () => {
      const result = scoreMatch(WELLFOUND_DEMAND[2], SUPPLY_GOOD[0]); // Engineer need vs Tech recruiter

      console.log('\n=== GOOD SUPPLY vs ENGINEERING DEMAND ===');
      console.log('Demand:', WELLFOUND_DEMAND[2].company, '-', WELLFOUND_DEMAND[2].signal);
      console.log('Supply:', SUPPLY_GOOD[0].company, '-', SUPPLY_GOOD[0].title);
      console.log('Score:', result.score);
      console.log('Tier:', result.tier, '-', result.tierReason);
      console.log('Need Profile:', result.needProfile);
      console.log('Capability Profile:', result.capabilityProfile);
      console.log('Reasons:', result.reasons);

      expect(result.score).toBeGreaterThan(50);
      expect(result.tier).not.toBe('open');
    });

    it('GOOD supply vs sales demand → should be GOOD+ tier', () => {
      const result = scoreMatch(WELLFOUND_DEMAND[1], SUPPLY_GOOD[1]); // Sales need vs Sales recruiter

      console.log('\n=== GOOD SUPPLY vs SALES DEMAND ===');
      console.log('Demand:', WELLFOUND_DEMAND[1].company, '-', WELLFOUND_DEMAND[1].signal);
      console.log('Supply:', SUPPLY_GOOD[1].company, '-', SUPPLY_GOOD[1].title);
      console.log('Score:', result.score);
      console.log('Tier:', result.tier, '-', result.tierReason);
      console.log('Need Profile:', result.needProfile);
      console.log('Capability Profile:', result.capabilityProfile);

      expect(result.score).toBeGreaterThan(40);
    });

    it('SPARSE supply vs demand → likely OPEN tier (the bug)', () => {
      const result = scoreMatch(WELLFOUND_DEMAND[2], SUPPLY_SPARSE[0]);

      console.log('\n=== SPARSE SUPPLY vs DEMAND (THE BUG) ===');
      console.log('Demand:', WELLFOUND_DEMAND[2].company, '-', WELLFOUND_DEMAND[2].signal);
      console.log('Supply:', SUPPLY_SPARSE[0].company, '-', SUPPLY_SPARSE[0].title);
      console.log('Supply Description:', SUPPLY_SPARSE[0].companyDescription || 'NULL/MISSING');
      console.log('Score:', result.score);
      console.log('Tier:', result.tier, '-', result.tierReason);
      console.log('Need Profile:', result.needProfile);
      console.log('Capability Profile:', result.capabilityProfile);
      console.log('Reasons:', result.reasons);

      // This is the bug - sparse data = low score
      // The capability profile will be "general" due to missing description
    });

    it('SPARSE supply with wrong title → OPEN tier', () => {
      const result = scoreMatch(WELLFOUND_DEMAND[2], SUPPLY_SPARSE[1]);

      console.log('\n=== SPARSE SUPPLY WRONG TITLE ===');
      console.log('Demand:', WELLFOUND_DEMAND[2].company, '-', WELLFOUND_DEMAND[2].signal);
      console.log('Supply:', SUPPLY_SPARSE[1].company, '-', SUPPLY_SPARSE[1].title);
      console.log('Score:', result.score);
      console.log('Tier:', result.tier);
      console.log('Capability Profile:', result.capabilityProfile);

      // "CEO" at "XYZ Partners" without description → general capability
    });

    it('MINIMAL supply with keywords → should still detect recruiting', () => {
      const result = scoreMatch(WELLFOUND_DEMAND[2], SUPPLY_MINIMAL_GOOD[0]);

      console.log('\n=== MINIMAL SUPPLY WITH KEYWORDS ===');
      console.log('Demand:', WELLFOUND_DEMAND[2].company, '-', WELLFOUND_DEMAND[2].signal);
      console.log('Supply:', SUPPLY_MINIMAL_GOOD[0].company, '-', SUPPLY_MINIMAL_GOOD[0].title);
      console.log('Score:', result.score);
      console.log('Tier:', result.tier, '-', result.tierReason);
      console.log('Capability Profile:', result.capabilityProfile);

      // "Tech Recruiter" at "TechRecruit Inc" should detect recruiting capability
      expect(result.capabilityProfile.category).toBe('recruiting');
    });
  });

  describe('Full Matching Simulation', () => {

    it('GOOD supply CSV → multiple strong matches', () => {
      const result = matchRecordsSync(WELLFOUND_DEMAND, SUPPLY_GOOD);

      console.log('\n=== FULL MATCHING: GOOD SUPPLY ===');
      console.log('Total matches:', result.stats.totalMatches);
      console.log('Avg score:', result.stats.avgScore);
      console.log('Demand matches:', result.demandMatches.length);

      result.demandMatches.forEach(m => {
        console.log(`  ${m.demand.company} → ${m.supply.company}: ${m.score} (${m.tier})`);
      });

      expect(result.demandMatches.length).toBeGreaterThan(0);
      expect(result.stats.avgScore).toBeGreaterThan(30);
    });

    it('SPARSE supply CSV → low scores (user issue)', () => {
      const result = matchRecordsSync(WELLFOUND_DEMAND, SUPPLY_SPARSE);

      console.log('\n=== FULL MATCHING: SPARSE SUPPLY (USER ISSUE) ===');
      console.log('Total matches:', result.stats.totalMatches);
      console.log('Avg score:', result.stats.avgScore);
      console.log('Demand matches:', result.demandMatches.length);

      result.demandMatches.forEach(m => {
        console.log(`  ${m.demand.company} → ${m.supply.company}: ${m.score} (${m.tier}) - ${m.tierReason}`);
      });

      // Document the expected low scores
      // User's 1 "exploratory" match is likely this scenario
    });

    it('MINIMAL supply with keywords → reasonable matches', () => {
      const result = matchRecordsSync(WELLFOUND_DEMAND, SUPPLY_MINIMAL_GOOD);

      console.log('\n=== FULL MATCHING: MINIMAL WITH KEYWORDS ===');
      console.log('Total matches:', result.stats.totalMatches);
      console.log('Avg score:', result.stats.avgScore);

      result.demandMatches.forEach(m => {
        console.log(`  ${m.demand.company} → ${m.supply.company}: ${m.score} (${m.tier})`);
      });

      // Even minimal data with "recruit" keywords should score better
    });
  });

  describe('Diagnosis Summary', () => {

    it('prints diagnosis of the 1 exploratory match issue', () => {
      console.log('\n');
      console.log('='.repeat(60));
      console.log('DIAGNOSIS: Why only 1 exploratory match?');
      console.log('='.repeat(60));
      console.log('');
      console.log('The matching algorithm uses these fields from supply CSV:');
      console.log('  1. companyDescription (MOST IMPORTANT - 50% of alignment score)');
      console.log('  2. title (job title - needs "recruiter", "staffing", etc)');
      console.log('  3. company (company name - keywords like "recruit", "talent")');
      console.log('  4. industry (staffing, recruiting, etc)');
      console.log('');
      console.log('If your supply CSV is missing companyDescription or has generic');
      console.log('titles like "CEO" or "Founder" without recruiting keywords,');
      console.log('the capability profile defaults to "general" → low alignment → open tier.');
      console.log('');
      console.log('FIX OPTIONS:');
      console.log('  A) Add companyDescription to your supply CSV');
      console.log('  B) Ensure title OR company contains: recruit, staffing, talent, headhunt');
      console.log('  C) Set industry to "Staffing & Recruiting"');
      console.log('');
      console.log('MINIMUM VIABLE SUPPLY ROW:');
      console.log('  firstName, lastName, email, title="Tech Recruiter", company="ABC Recruiting"');
      console.log('  ^ This will detect recruiting capability even without description');
      console.log('='.repeat(60));

      expect(true).toBe(true); // Always pass - this is diagnostic output
    });
  });
});
