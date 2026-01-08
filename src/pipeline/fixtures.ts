/**
 * GOLDEN TEST FIXTURES
 *
 * Small JSON samples with expected outcomes.
 * Used to verify pipeline produces correct results.
 */

import type { RawInput, MatchResult, CacheEntry } from './contract';

// =============================================================================
// FIXTURE 1: Simple hiring signal
// =============================================================================

export const fixture1_demand: RawInput[] = [
  {
    id: 'demand-1',
    source: 'apify',
    side: 'demand',
    raw: { company: 'Acme Corp', job_title: 'Senior Engineer', website: 'acme.com' },
    companyName: 'Acme Corp',
    domain: 'acme.com',
    signals: ['Senior Engineer'],
  },
];

export const fixture1_supply: RawInput[] = [
  {
    id: 'supply-1',
    source: 'apify',
    side: 'supply',
    raw: { name: 'Tech Recruiters Inc', domain: 'techrecruiters.com', specialty: 'engineering' },
    companyName: 'Tech Recruiters Inc',
    domain: 'techrecruiters.com',
  },
];

export const fixture1_expectedMatch: MatchResult = {
  demandId: 'demand-1',
  supplyId: 'supply-1',
  confidence: 0.8,
  reason: 'Acme Corp needs → Tech Recruiters Inc provides',
};

// =============================================================================
// FIXTURE 2: Wealth management (non-hiring niche)
// =============================================================================

export const fixture2_demand: RawInput[] = [
  {
    id: 'demand-2',
    source: 'apify',
    side: 'demand',
    raw: { name: 'John Smith', title: 'Founder', company: 'Smith Holdings', linkedin: 'linkedin.com/in/johnsmith' },
    name: 'John Smith',
    companyName: 'Smith Holdings',
    domain: 'smithholdings.com',
    title: 'Founder',
    signals: ['Founder', 'Multiple directorships'],
  },
];

export const fixture2_supply: RawInput[] = [
  {
    id: 'supply-2',
    source: 'apify',
    side: 'supply',
    raw: { name: 'Jane Advisor', title: 'Wealth Manager', company: 'Premier Wealth', email: 'jane@premierwealth.com' },
    name: 'Jane Advisor',
    companyName: 'Premier Wealth',
    domain: 'premierwealth.com',
    email: 'jane@premierwealth.com',
    title: 'Wealth Manager',
  },
];

// =============================================================================
// FIXTURE 3: Pre-enriched dataset (has emails already)
// =============================================================================

export const fixture3_demand: RawInput[] = [
  {
    id: 'demand-3',
    source: 'apify',
    side: 'demand',
    raw: { name: 'Alice CEO', email: 'alice@startup.io', company: 'Startup.io', title: 'CEO' },
    name: 'Alice CEO',
    email: 'alice@startup.io',
    companyName: 'Startup.io',
    domain: 'startup.io',
    title: 'CEO',
  },
];

export const fixture3_supply: RawInput[] = [
  {
    id: 'supply-3',
    source: 'apify',
    side: 'supply',
    raw: { name: 'Bob Consultant', email: 'bob@consulting.com', company: 'Consulting Co', title: 'Partner' },
    name: 'Bob Consultant',
    email: 'bob@consulting.com',
    companyName: 'Consulting Co',
    domain: 'consulting.com',
    title: 'Partner',
  },
];

// =============================================================================
// FIXTURE 4: Cache hit scenario
// =============================================================================

export const fixture4_cache: CacheEntry = {
  id: 'cache-1',
  domain: 'cached-company.com',
  email: 'contact@cached-company.com',
  name: 'Cached Contact',
  title: 'Director',
  validated: true,
  enrichedAt: '2024-01-01T00:00:00Z',
  source: 'apollo',
};

// =============================================================================
// FIXTURE 5: Missing email (requires enrichment)
// =============================================================================

export const fixture5_demand: RawInput[] = [
  {
    id: 'demand-5',
    source: 'apify',
    side: 'demand',
    raw: { company: 'No Email Inc', website: 'noemail.com' },
    companyName: 'No Email Inc',
    domain: 'noemail.com',
    // No email - must be enriched
  },
];

// =============================================================================
// FIXTURE 6: Invalid email (requires re-enrichment)
// =============================================================================

export const fixture6_demand: RawInput[] = [
  {
    id: 'demand-6',
    source: 'apify',
    side: 'demand',
    raw: { company: 'Bad Email Corp', email: 'invalid@bademail.com', website: 'bademail.com' },
    companyName: 'Bad Email Corp',
    domain: 'bademail.com',
    email: 'invalid@bademail.com', // Will fail validation
  },
];

// =============================================================================
// FIXTURE 7: Funding signal (VC niche)
// =============================================================================

export const fixture7_demand: RawInput[] = [
  {
    id: 'demand-7',
    source: 'apify',
    side: 'demand',
    raw: { company: 'Funded Startup', funding: 'Series A', amount: '$10M', website: 'fundedstartup.com' },
    companyName: 'Funded Startup',
    domain: 'fundedstartup.com',
    signals: ['Series A', '$10M'],
  },
];

export const fixture7_supply: RawInput[] = [
  {
    id: 'supply-7',
    source: 'apify',
    side: 'supply',
    raw: { name: 'VC Partner', title: 'Partner', company: 'Big VC Fund', email: 'partner@bigvc.com' },
    name: 'VC Partner',
    companyName: 'Big VC Fund',
    domain: 'bigvc.com',
    email: 'partner@bigvc.com',
    title: 'Partner',
  },
];

// =============================================================================
// FIXTURE 8: Real estate (property niche)
// =============================================================================

export const fixture8_demand: RawInput[] = [
  {
    id: 'demand-8',
    source: 'apify',
    side: 'demand',
    raw: { company: 'Property Seller LLC', listing: 'Commercial property for sale', website: 'propertyseller.com' },
    companyName: 'Property Seller LLC',
    domain: 'propertyseller.com',
    signals: ['Commercial property for sale'],
  },
];

export const fixture8_supply: RawInput[] = [
  {
    id: 'supply-8',
    source: 'apify',
    side: 'supply',
    raw: { name: 'Real Estate Agent', title: 'Broker', company: 'RE Agency', email: 'broker@reagency.com' },
    name: 'Real Estate Agent',
    companyName: 'RE Agency',
    domain: 'reagency.com',
    email: 'broker@reagency.com',
    title: 'Broker',
  },
];

// =============================================================================
// ALL FIXTURES
// =============================================================================

export const allFixtures = [
  { name: 'Simple hiring signal', demand: fixture1_demand, supply: fixture1_supply },
  { name: 'Wealth management', demand: fixture2_demand, supply: fixture2_supply },
  { name: 'Pre-enriched dataset', demand: fixture3_demand, supply: fixture3_supply },
  { name: 'Missing email', demand: fixture5_demand, supply: fixture1_supply },
  { name: 'Invalid email', demand: fixture6_demand, supply: fixture1_supply },
  { name: 'Funding signal (VC)', demand: fixture7_demand, supply: fixture7_supply },
  { name: 'Real estate', demand: fixture8_demand, supply: fixture8_supply },
];
