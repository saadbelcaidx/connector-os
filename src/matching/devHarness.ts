/**
 * DEV HARNESS
 *
 * Manual test script for the matching pipeline.
 * Run with: npx ts-node src/matching/devHarness.ts
 *
 * Tests:
 * 1. EdgeDetector returns null when no signals
 * 2. Matcher returns null when no named contact or score < 0.7
 * 3. Composer never emits banned phrases
 * 4. Pipeline returns DROP when any gate fails
 * 5. Pipeline returns COMPOSE for valid Sage/Hightower example
 */

import type { DemandRecord, Signal } from '../schemas/DemandRecord';
import type { SupplyRecord } from '../schemas/SupplyRecord';
import type { PipelineResult } from '../schemas/IntroOutput';

import { detectEdge } from './EdgeDetector';
import { findCounterparty } from './Matcher';
import { composeIntros, validateNoBannedPhrases } from './Composer';
import { runMatchingPipeline, getPipelineStats } from './pipeline';

// =============================================================================
// TEST DATA
// =============================================================================

// Demand: Sage Financial (RIA with succession/growth signals)
const sageDemand: DemandRecord = {
  domain: 'sagefinancial.com',
  company: 'Sage Financial Group',
  contact: 'Hollis Day',
  email: 'hollis@sagefinancial.com',
  title: 'Owner',
  industry: 'wealth management',
  signals: [
    { type: 'INC_5000', value: 'true', source: 'inc5000' },
    { type: 'GROWTH', value: 'revenue_growth', source: 'metadata' },
  ],
  metadata: {
    revenueGrowth: true,
    revenue: '17.5M',
    services: 'fee-only wealth management family office',
    profileTags: 'ria fee-only wealth acquisition platform',
    needsTags: 'acquisition platform transition m&a',
    location: 'PA',
  },
};

// Demand: No signals (should DROP)
const noSignalsDemand: DemandRecord = {
  domain: 'acme.com',
  company: 'Acme Corp',
  contact: 'John Smith',
  email: 'john@acme.com',
  title: 'Manager',
  industry: 'Technology',
  signals: [],
  metadata: {},
};

// Demand: Invalid email (should DROP) - uses wealth tags to match Hightower
const invalidEmailDemand: DemandRecord = {
  domain: 'badmail.com',
  company: 'BadMail Wealth',
  contact: 'Jane Doe',
  email: 'not-an-email',
  title: 'Owner',
  industry: 'wealth management',
  signals: [{ type: 'INC_5000', value: 'true', source: 'inc5000' }],
  metadata: {
    revenueGrowth: true,
    revenue: '20M',
    needsTags: 'acquisition platform transition',
    profileTags: 'ria fee-only wealth',
  },
};

// Supply: Hightower (RIA acquirer)
const hightowerSupply: SupplyRecord = {
  domain: 'hightoweradvisors.com',
  company: 'Hightower Advisors',
  contact: 'Mike Johnson',
  email: 'mike.johnson@hightoweradvisors.com',
  title: 'M&A Director',
  capability: 'RIA acquisition platform transitions wealth management',
  targetProfile: 'fee-only RIA wealth management ria',
  metadata: {
    targetRevenueRange: '10-50',
    targetRegions: 'nationwide PA',
    services: 'acquisition m&a platform transition',
    specialization: 'wealth management acquisition',
  },
};

// Supply: No contact (should not match)
const noContactSupply: SupplyRecord = {
  domain: 'anonymous.com',
  company: 'Anonymous Corp',
  contact: '',
  email: '',
  title: 'Unknown',
  capability: 'Unknown services',
  targetProfile: 'Unknown',
  metadata: {},
};

// Demand: B2B Contact with Director title (source: signal) - should NOT trigger LEADERSHIP_GAP
const b2bContactDirector: DemandRecord = {
  domain: 'baird.com',
  company: 'Baird',
  contact: 'John Director',
  email: 'john@baird.com',
  title: 'Director - Business Owner Solutions',
  industry: 'Financial Services',
  signals: [
    // This simulates what B2B_CONTACTS would produce BEFORE the fix (wrong)
    // After fix: B2B_CONTACTS won't produce these signals at all
    { type: 'LEADERSHIP_OPEN', source: 'signal' },  // NOT job_posting → should be ignored
  ],
  metadata: {
    hasLeadershipRole: true,
    // Missing jobPostingProvenance → should be ignored
  },
};

// Demand: Job Posting with VP title (source: job_posting) - SHOULD trigger LEADERSHIP_GAP
const jobPostingVP: DemandRecord = {
  domain: 'techstartup.com',
  company: 'Tech Startup Inc',
  contact: '',  // Job postings don't have contacts
  email: '',
  title: '',
  industry: 'Technology',
  signals: [
    { type: 'VP_OPEN', source: 'job_posting' },  // Correct provenance
  ],
  metadata: {
    vpOpen: true,
    jobPostingProvenance: true,  // Key flag
  },
};

// Supply: Unrelated industry (low score)
const unrelatedSupply: SupplyRecord = {
  domain: 'pizzashop.com',
  company: 'Pizza Palace',
  contact: 'Mario Bros',
  email: 'mario@pizzashop.com',
  title: 'Owner',
  capability: 'Pizza delivery',
  targetProfile: 'hungry customers',
  metadata: {},
};

// =============================================================================
// TEST FUNCTIONS
// =============================================================================

function test(name: string, fn: () => boolean): void {
  try {
    const passed = fn();
    console.log(passed ? `✓ ${name}` : `✗ ${name}`);
  } catch (error) {
    console.log(`✗ ${name} (threw: ${error})`);
  }
}

// =============================================================================
// RUN TESTS
// =============================================================================

console.log('\n=== MATCHING PIPELINE DEV HARNESS ===\n');

// Test 1: EdgeDetector returns null when no signals
test('EdgeDetector returns null when no signals', () => {
  const edge = detectEdge(noSignalsDemand);
  return edge === null;
});

// Test 2: EdgeDetector detects GROWTH for Sage
test('EdgeDetector detects GROWTH edge for Sage', () => {
  const edge = detectEdge(sageDemand);
  return edge !== null && edge.type === 'GROWTH';
});

// Test 3: Matcher returns null when no named contact
test('Matcher returns null when supply has no contact', () => {
  const edge = detectEdge(sageDemand)!;
  const match = findCounterparty(sageDemand, edge, [noContactSupply]);
  return match === null;
});

// Test 4: Matcher returns null when score < 0.7 (unrelated supply)
test('Matcher returns null for unrelated supply (score < 0.7)', () => {
  const edge = detectEdge(sageDemand)!;
  const match = findCounterparty(sageDemand, edge, [unrelatedSupply]);
  return match === null;
});

// Test 5: Matcher finds Hightower for Sage
test('Matcher finds Hightower counterparty for Sage', () => {
  const edge = detectEdge(sageDemand)!;
  const match = findCounterparty(sageDemand, edge, [hightowerSupply, unrelatedSupply]);
  return match !== null && match.counterparty.company === 'Hightower Advisors';
});

// Test 6: Composer never emits banned phrases
test('Composer output contains no banned phrases', () => {
  const edge = detectEdge(sageDemand)!;
  const match = findCounterparty(sageDemand, edge, [hightowerSupply])!;
  const composed = composeIntros(sageDemand, edge, match.counterparty, match.supplyRecord);

  const noBannedDemand = validateNoBannedPhrases(composed.demandBody);
  const noBannedSupply = validateNoBannedPhrases(composed.supplyBody);

  return noBannedDemand && noBannedSupply;
});

// Test 7: Composer uses "I'm connected to" (allowed phrase)
test('Composer uses "I\'m connected to" (allowed)', () => {
  const edge = detectEdge(sageDemand)!;
  const match = findCounterparty(sageDemand, edge, [hightowerSupply])!;
  const composed = composeIntros(sageDemand, edge, match.counterparty, match.supplyRecord);

  return composed.demandBody.includes("I'm connected to");
});

// Test 8: Pipeline returns DROP for no signals
test('Pipeline returns DROP for demand with no signals', () => {
  const result = runMatchingPipeline(noSignalsDemand, [hightowerSupply]);
  return result.dropped === true && result.reason === 'NO_EDGE';
});

// Test 9: Pipeline returns DROP for invalid email
test('Pipeline returns DROP for invalid email', () => {
  const result = runMatchingPipeline(invalidEmailDemand, [hightowerSupply]);
  return result.dropped === true && result.reason === 'INVALID_EMAIL';
});

// Test 10: Pipeline returns COMPOSE for Sage/Hightower
test('Pipeline returns COMPOSE for Sage/Hightower', () => {
  const result = runMatchingPipeline(sageDemand, [hightowerSupply]);
  return result.dropped === false;
});

// Test 11: Full output verification
test('Full Sage/Hightower output is correct', () => {
  const result = runMatchingPipeline(sageDemand, [hightowerSupply]);

  if (result.dropped) {
    console.log('  DROP reason:', result.reason);
    return false;
  }

  const { output } = result;

  // Check demand intro
  const demandOk =
    output.demandIntro.to === 'hollis@sagefinancial.com' &&
    output.demandIntro.body.includes('Hollis') &&
    output.demandIntro.body.includes('Mike Johnson') &&
    output.demandIntro.body.includes('Hightower') &&
    output.demandIntro.body.includes('Worth an intro?');

  // Check supply intro
  const supplyOk =
    output.supplyIntro.to === 'mike.johnson@hightoweradvisors.com' &&
    output.supplyIntro.body.includes('Mike') &&
    output.supplyIntro.body.includes('Sage Financial') &&
    output.supplyIntro.body.includes('Worth a look?');

  return demandOk && supplyOk;
});

// =============================================================================
// LEADERSHIP_GAP PROVENANCE TESTS (CRITICAL)
// =============================================================================

// Test 12: B2B Contact title should NOT trigger LEADERSHIP_GAP
test('B2B Contact Director title does NOT produce LEADERSHIP_GAP', () => {
  const edge = detectEdge(b2bContactDirector);
  // Edge should be null because LEADERSHIP_OPEN signal has source: 'signal', not 'job_posting'
  const hasLeadershipGap = edge !== null && edge.type === 'LEADERSHIP_GAP';
  return hasLeadershipGap === false;
});

// Test 13: Job Posting VP should trigger LEADERSHIP_GAP
test('Job Posting VP title DOES produce LEADERSHIP_GAP', () => {
  const edge = detectEdge(jobPostingVP);
  // Edge should be LEADERSHIP_GAP because VP_OPEN signal has source: 'job_posting'
  return edge !== null && edge.type === 'LEADERSHIP_GAP';
});

// =============================================================================
// PRINT SAMPLE OUTPUT
// =============================================================================

console.log('\n=== SAMPLE OUTPUT ===\n');

const sampleResult = runMatchingPipeline(sageDemand, [hightowerSupply]);

if (sampleResult.dropped) {
  console.log('DROPPED:', sampleResult.reason);
  console.log('Details:', sampleResult.details);
} else {
  console.log('--- DEMAND INTRO ---');
  console.log(sampleResult.output.demandIntro.body);
  console.log('\n--- SUPPLY INTRO ---');
  console.log(sampleResult.output.supplyIntro.body);
}

// =============================================================================
// BATCH TEST
// =============================================================================

console.log('\n=== BATCH STATS ===\n');

const batchDemands = [sageDemand, noSignalsDemand, invalidEmailDemand];
const batchResults = batchDemands.map(d => runMatchingPipeline(d, [hightowerSupply]));
const stats = getPipelineStats(batchResults);

console.log('Total:', stats.total);
console.log('Composed:', stats.composed);
console.log('Dropped:', stats.dropped);
console.log('Drop reasons:', stats.dropReasons);

console.log('\n=== DONE ===\n');
