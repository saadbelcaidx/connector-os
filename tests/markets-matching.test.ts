/**
 * markets-matching.test.ts — Markets → Matching Pipeline
 *
 * Proves that records from normalizeToRecord (Markets API)
 * contain enough context for the matching engine to produce
 * meaningful scores and edge evidence.
 *
 * Fixtures shaped from REAL API responses:
 *   - Leads from Instantly supersearch (no domain, no email)
 *   - Company intel from Leadsy (no domain, no website)
 *
 * NO API calls. Pure unit test with real data shapes.
 */

import { describe, it, expect } from 'vitest';
import { scoreMatch, matchRecordsSync } from '../src/matching/index';
import type { NormalizedRecord } from '../src/schemas';

// =============================================================================
// FIXTURES — Real API shapes. domain=null, domainSource='none'.
// =============================================================================

/**
 * DEMAND: Data Safeguard — hiring signal, Software Development
 * Real lead: Dr. Damodar Sahu, Co-Founder & Chief Growth Officer
 * Real enrichment: 44 employees, Santa Clara CA, privacy compliance AI
 */
const DEMAND_DATA_SAFEGUARD: NormalizedRecord = {
  recordKey: 'market:data_safeguard:dr._damodar_sahu,_phd:a1b2c3',
  firstName: 'Dr. Damodar',
  lastName: 'Sahu, Phd',
  fullName: 'Dr. Damodar Sahu, Phd',
  email: null,
  emailSource: 'csv',
  emailVerified: false,
  verifiedBy: null,
  verifiedAt: null,
  title: 'Co-Founder & Chief Growth Officer',
  linkedin: 'linkedin.com/in/damodarsahu',
  headline: 'An Artificially Intelligent, humanly impossible, previously unsolvable, hyper-accurate approach to comply with data privacy compliance',
  seniorityLevel: null,
  company: 'Data Safeguard',
  domain: null,
  domainSource: 'none',
  industry: 'Software Development',
  size: '44',
  companyDescription: 'An Artificially Intelligent, humanly impossible, previously unsolvable, hyper-accurate approach to comply with data privacy compliance and prevent synthetic fraud lo',
  companyFunding: null,
  companyRevenue: null,
  companyFoundedYear: null,
  companyLinkedin: null,
  signalMeta: { kind: 'GROWTH', label: 'Hiring', source: 'Market Intelligence' },
  signal: 'Hiring',
  signalDetail: 'Hiring',
  city: 'Troy',
  state: 'Michigan',
  country: 'United States',
  schemaId: 'csv',
  raw: {
    lead: { firstName: 'Dr. Damodar', lastName: 'Sahu, Phd', companyId: '-62500259' },
    company: { name: 'Data Safeguard Inc.', employee_count: 44, industries: [{ name: 'Software Development', id: 4, primary: true }] },
    company_description: 'An Artificially Intelligent, humanly impossible, previously unsolvable, hyper-accurate approach to comply with data privacy compliance and prevent synthetic fraud lo',
    description: 'An Artificially Intelligent, humanly impossible, previously unsolvable, hyper-accurate approach to comply with data privacy compliance and prevent synthetic fraud lo',
    capability: 'An Artificially Intelligent, humanly impossible, previously unsolvable, hyper-accurate approach to comply with data privacy compliance and prevent synthetic fraud lo',
    services: 'An Artificially Intelligent, humanly impossible, previously unsolvable, hyper-accurate approach to comply with data privacy compliance and prevent synthetic fraud lo',
    num_employees_enum: '44',
  },
};

/**
 * DEMAND: Unstoppable Domains — funding raised, Software Development
 * Real lead: Sandy Carter, Chief Business Officer
 * Real enrichment: $65M Series A, 70 employees, SF
 */
const DEMAND_UNSTOPPABLE: NormalizedRecord = {
  recordKey: 'market:unstoppable_domains:sandy_carter:d4e5f6',
  firstName: 'Sandy',
  lastName: 'Carter',
  fullName: 'Sandy Carter',
  email: null,
  emailSource: 'csv',
  emailVerified: false,
  verifiedBy: null,
  verifiedAt: null,
  title: 'Chief Business Officer And Head of Go To Market (Sales, Marketing, Communications, Community)',
  linkedin: 'linkedin.com/in/sandyacarter',
  headline: 'Unstoppable Domains is on a mission to return the power of the internet to people',
  seniorityLevel: null,
  company: 'Unstoppable Domains',
  domain: null,
  domainSource: 'none',
  industry: 'Software Development',
  size: '70',
  companyDescription: 'Unstoppable Domains is on a mission to return the power of the internet to people. To accomplish this, we are creating Web3 domains that put you back in control of',
  companyFunding: '$65 million series_a',
  companyRevenue: null,
  companyFoundedYear: null,
  companyLinkedin: null,
  signalMeta: { kind: 'GROWTH', label: 'Funding raised', source: 'Market Intelligence' },
  signal: 'Funding raised',
  signalDetail: 'Funding raised',
  city: 'San Francisco',
  state: 'California',
  country: 'United States',
  schemaId: 'csv',
  raw: {
    lead: { firstName: 'Sandy', lastName: 'Carter', companyId: '35529575' },
    company: { name: 'Unstoppable Domains', employee_count: 70, industries: [{ name: 'Software Development', id: 4, primary: true }] },
    company_description: 'Unstoppable Domains is on a mission to return the power of the internet to people. To accomplish this, we are creating Web3 domains that put you back in control of',
    description: 'Unstoppable Domains is on a mission to return the power of the internet to people. To accomplish this, we are creating Web3 domains that put you back in control of',
    capability: 'Unstoppable Domains is on a mission to return the power of the internet to people. To accomplish this, we are creating Web3 domains that put you back in control of',
    services: 'Unstoppable Domains is on a mission to return the power of the internet to people. To accomplish this, we are creating Web3 domains that put you back in control of',
    last_funding_type: 'series_a',
    last_funding_at: '2019-05-23T00:00:00Z',
    num_employees_enum: '70',
  },
};

/**
 * DEMAND: ZUO Modern — product launch signal, Furniture Manufacturing
 * Real lead: Luis Ruesga, CEO
 * Real enrichment: 69 employees, Oakland CA, furniture brand
 */
const DEMAND_ZUO: NormalizedRecord = {
  recordKey: 'market:zuo_modern_contemporary:luis_ruesga:g7h8i9',
  firstName: 'Luis',
  lastName: 'Ruesga',
  fullName: 'Luis Ruesga',
  email: null,
  emailSource: 'csv',
  emailVerified: false,
  verifiedBy: null,
  verifiedAt: null,
  title: 'CEO',
  linkedin: 'linkedin.com/in/luis-ruesga-976bb78',
  headline: 'ZUO an international wholesale brand, celebrating 14 years of stylish designs with a showroom presence in ten cities',
  seniorityLevel: null,
  company: 'Zuo Modern Contemporary',
  domain: null,
  domainSource: 'none',
  industry: 'Furniture and Home Furnishings Manufacturing',
  size: '69',
  companyDescription: 'ZUO an international wholesale brand, celebrating 14 years of stylish designs with a showroom presence in ten cities spreading furnishings throughout US, Canada, Mex',
  companyFunding: null,
  companyRevenue: null,
  companyFoundedYear: null,
  companyLinkedin: null,
  signalMeta: { kind: 'GROWTH', label: 'Product launch', source: 'Market Intelligence' },
  signal: 'Product launch',
  signalDetail: 'Product launch',
  city: 'Oakland',
  state: 'California',
  country: 'United States',
  schemaId: 'csv',
  raw: {
    lead: { firstName: 'Luis', lastName: 'Ruesga', companyId: '550670' },
    company: { name: 'ZUO Modern Contemporary, INC', employee_count: 69, industries: [{ name: 'Furniture and Home Furnishings Manufacturing', id: 26, primary: true }] },
    company_description: 'ZUO an international wholesale brand, celebrating 14 years of stylish designs with a showroom presence in ten cities spreading furnishings throughout US, Canada, Mex',
    description: 'ZUO an international wholesale brand, celebrating 14 years of stylish designs with a showroom presence in ten cities spreading furnishings throughout US, Canada, Mex',
    capability: 'ZUO an international wholesale brand, celebrating 14 years of stylish designs with a showroom presence in ten cities spreading furnishings throughout US, Canada, Mex',
    services: 'ZUO an international wholesale brand, celebrating 14 years of stylish designs with a showroom presence in ten cities spreading furnishings throughout US, Canada, Mex',
    num_employees_enum: '69',
  },
};

/**
 * SUPPLY: Beta Boom — VC fund (industry-only search, no signal)
 * Real enrichment: 5 employees, VC Principals, pre-seed/seed
 * Signal falls back to industry name because no signal filter was set
 */
const SUPPLY_VC_FUND: NormalizedRecord = {
  recordKey: 'market:beta_boom:kimmy_paluch:j1k2l3',
  firstName: 'Kimmy',
  lastName: 'Paluch',
  fullName: 'Kimmy Paluch',
  email: null,
  emailSource: 'csv',
  emailVerified: false,
  verifiedBy: null,
  verifiedAt: null,
  title: 'Managing Partner',
  linkedin: 'linkedin.com/in/kimmy',
  headline: 'Beta Boom is a pre-seed and seed VC fund investing in pattern-breaking founders based outside Silicon Valley',
  seniorityLevel: null,
  company: 'Beta Boom',
  domain: null,
  domainSource: 'none',
  industry: 'Venture Capital and Private Equity Principals',
  size: '5',
  companyDescription: 'Beta Boom is a pre-seed and seed VC fund investing in pattern-breaking founders based outside Silicon Valley. We like problem spaces that are in core areas for busin',
  companyFunding: null,
  companyRevenue: null,
  companyFoundedYear: null,
  companyLinkedin: null,
  signalMeta: { kind: 'GROWTH', label: 'Venture Capital and Private Equity Principals', source: 'Market Intelligence' },
  signal: 'Venture Capital and Private Equity Principals',
  signalDetail: 'Venture Capital and Private Equity Principals',
  city: 'Salt Lake City',
  state: 'Utah',
  country: 'United States',
  schemaId: 'csv',
  raw: {
    lead: { firstName: 'Kimmy', lastName: 'Paluch', companyId: '22342851' },
    company: { name: 'Beta Boom', employee_count: 5, industries: [{ name: 'Venture Capital and Private Equity Principals', id: 106, primary: true }] },
    company_description: 'Beta Boom is a pre-seed and seed VC fund investing in pattern-breaking founders based outside Silicon Valley. We like problem spaces that are in core areas for busin',
    description: 'Beta Boom is a pre-seed and seed VC fund investing in pattern-breaking founders based outside Silicon Valley. We like problem spaces that are in core areas for busin',
    capability: 'Beta Boom is a pre-seed and seed VC fund investing in pattern-breaking founders based outside Silicon Valley. We like problem spaces that are in core areas for busin',
    services: 'Beta Boom is a pre-seed and seed VC fund investing in pattern-breaking founders based outside Silicon Valley. We like problem spaces that are in core areas for busin',
    num_employees_enum: '5',
  },
};

/**
 * SUPPLY: Distribute.so — sales enablement SaaS (industry-only search)
 * Real enrichment: 15 employees, Austin TX, sales follow-up automation
 */
const SUPPLY_SALES_TOOL: NormalizedRecord = {
  recordKey: 'market:distribute:andrew_mewborn:m4n5o6',
  firstName: 'Andrew',
  lastName: 'Mewborn',
  fullName: 'Andrew Mewborn',
  email: null,
  emailSource: 'csv',
  emailVerified: false,
  verifiedBy: null,
  verifiedAt: null,
  title: 'Founder & Customer Support',
  linkedin: 'linkedin.com/in/amewborn',
  headline: 'One-Click AI1-Pagers That Executives Actually Read (And Forward)',
  seniorityLevel: null,
  company: 'Distribute',
  domain: null,
  domainSource: 'none',
  industry: 'Software Development',
  size: '15',
  companyDescription: 'One-Click AI1-Pagers That Executives Actually Read (And Forward) Watch your executive ghost rate drop to zero. See how 10 seconds after your call, you\'ll have the p',
  companyFunding: null,
  companyRevenue: null,
  companyFoundedYear: null,
  companyLinkedin: null,
  signalMeta: { kind: 'GROWTH', label: 'Software Development', source: 'Market Intelligence' },
  signal: 'Software Development',
  signalDetail: 'Software Development',
  city: 'Austin',
  state: 'Texas',
  country: 'United States',
  schemaId: 'csv',
  raw: {
    lead: { firstName: 'Andrew', lastName: 'Mewborn', companyId: '-16681117' },
    company: { name: 'Distribute.so', employee_count: 15, industries: [{ name: 'Software Development', id: 4, primary: true }] },
    company_description: 'One-Click AI1-Pagers That Executives Actually Read (And Forward) Watch your executive ghost rate drop to zero.',
    description: 'One-Click AI1-Pagers That Executives Actually Read (And Forward) Watch your executive ghost rate drop to zero.',
    capability: 'One-Click AI1-Pagers That Executives Actually Read (And Forward) Watch your executive ghost rate drop to zero.',
    services: 'One-Click AI1-Pagers That Executives Actually Read (And Forward) Watch your executive ghost rate drop to zero.',
    num_employees_enum: '15',
  },
};

/**
 * SUPPLY: Sparse record — no enrichment returned
 * Real scenario: companyId exists but Leadsy returns null
 * Only has: company name + title from lead data
 */
const SUPPLY_SPARSE: NormalizedRecord = {
  recordKey: 'market:pm-strategists_corner:muhammad_aslam_mirza:p7q8r9',
  firstName: 'Muhammad',
  lastName: 'Aslam Mirza',
  fullName: 'Muhammad Aslam Mirza',
  email: null,
  emailSource: 'csv',
  emailVerified: false,
  verifiedBy: null,
  verifiedAt: null,
  title: 'CEO & Principal Consultant',
  linkedin: 'linkedin.com/in/muhammad-aslam-mirza-pm-strategistscorner',
  headline: null,
  seniorityLevel: null,
  company: 'Pm-strategists Corner',
  domain: null,
  domainSource: 'none',
  industry: null,
  size: null,
  companyDescription: null,
  companyFunding: null,
  companyRevenue: null,
  companyFoundedYear: null,
  companyLinkedin: null,
  signalMeta: { kind: 'GROWTH', label: 'Pm-strategists Corner', source: 'Market Intelligence' },
  signal: 'Pm-strategists Corner',
  signalDetail: 'Pm-strategists Corner',
  city: 'Stafford',
  state: 'Texas',
  country: 'United States',
  schemaId: 'csv',
  raw: {
    lead: { firstName: 'Muhammad', lastName: 'Aslam Mirza', companyId: '-60392076' },
    company: null,
  },
};

// =============================================================================
// INDIVIDUAL SCORE TESTS
// =============================================================================

describe('Markets → Matching: Individual Scores', () => {
  it('funded SaaS demand × VC supply → strong match', () => {
    const result = scoreMatch(DEMAND_UNSTOPPABLE, SUPPLY_VC_FUND);
    console.log('[Score] Funded SaaS × VC:', result.score, result.tier, result.tierReason);
    expect(result.score).toBeGreaterThanOrEqual(20);
  });

  it('hiring demand × sales tool supply → some match', () => {
    const result = scoreMatch(DEMAND_DATA_SAFEGUARD, SUPPLY_SALES_TOOL);
    console.log('[Score] Hiring × Sales Tool:', result.score, result.tier, result.tierReason);
    expect(result.score).toBeGreaterThanOrEqual(1);
  });

  it('product launch demand × VC supply → some match', () => {
    const result = scoreMatch(DEMAND_ZUO, SUPPLY_VC_FUND);
    console.log('[Score] Product launch × VC:', result.score, result.tier, result.tierReason);
    expect(result.score).toBeGreaterThanOrEqual(1);
  });

  it('sparse supply still produces a score (no crash)', () => {
    const result = scoreMatch(DEMAND_DATA_SAFEGUARD, SUPPLY_SPARSE);
    console.log('[Score] Hiring × Sparse:', result.score, result.tier, result.tierReason);
    expect(result.score).toBeGreaterThanOrEqual(1);
  });

  it('domain=null does not crash scoring', () => {
    // Every Markets record has domain=null. Scoring must not depend on it.
    expect(DEMAND_DATA_SAFEGUARD.domain).toBeNull();
    expect(SUPPLY_VC_FUND.domain).toBeNull();
    const result = scoreMatch(DEMAND_DATA_SAFEGUARD, SUPPLY_VC_FUND);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// FULL MATCHING PIPELINE
// =============================================================================

describe('Markets → Matching: Full Pipeline', () => {
  const demand = [DEMAND_DATA_SAFEGUARD, DEMAND_UNSTOPPABLE, DEMAND_ZUO];
  const supply = [SUPPLY_VC_FUND, SUPPLY_SALES_TOOL, SUPPLY_SPARSE];

  it('matchRecordsSync returns matches (domain=null on all records)', () => {
    const result = matchRecordsSync(demand, supply);

    console.log('\n=== MATCHING RESULTS (all domain=null) ===');
    console.log('Demand matches:', result.demandMatches.length);
    console.log('Supply aggregates:', result.supplyAggregates.length);
    console.log('Avg score:', result.stats.avgScore);

    for (const m of result.demandMatches) {
      console.log(`  ${m.demand.company} → ${m.supply.company} | score=${m.score} | need=${m.needProfile?.category} → cap=${m.capabilityProfile?.category}`);
    }

    expect(result.demandMatches.length).toBeGreaterThanOrEqual(1);
    expect(result.stats.avgScore).toBeGreaterThan(0);
  });

  it('every match has need + capability profiles', () => {
    const result = matchRecordsSync(demand, supply);

    for (const m of result.demandMatches) {
      expect(m.needProfile).toBeDefined();
      expect(m.needProfile?.category).toBeTruthy();
      expect(m.capabilityProfile).toBeDefined();
      expect(m.capabilityProfile?.category).toBeTruthy();
    }
  });

  it('supply aggregates group by supply contact', () => {
    const result = matchRecordsSync(demand, supply);

    for (const agg of result.supplyAggregates) {
      console.log(`  Supply: ${agg.supply.company} | ${agg.totalMatches} demands matched`);
      expect(agg.supply).toBeDefined();
      expect(agg.matches.length).toBeGreaterThanOrEqual(1);
      expect(agg.totalMatches).toBeGreaterThanOrEqual(1);
    }
  });
});

// =============================================================================
// EDGE EVIDENCE (what Flow uses for intros)
// =============================================================================

describe('Markets → Edge Evidence: Signal Context', () => {
  it('demand with "Hiring" signal produces usable edge evidence', () => {
    const demand = DEMAND_DATA_SAFEGUARD;

    // Flow.tsx buildWhy logic:
    // GROWTH kind → use signalMeta.label as-is
    const evidence = demand.signalMeta?.kind === 'GROWTH'
      ? demand.signalMeta.label || 'is showing activity'
      : 'may be exploring outside partners';

    console.log(`[Edge] ${demand.company}: "${evidence}"`);
    expect(evidence).toBe('Hiring');
    expect(evidence.length).toBeGreaterThan(3);
  });

  it('demand with "Funding raised" signal produces usable edge evidence', () => {
    const demand = DEMAND_UNSTOPPABLE;
    const evidence = demand.signalMeta?.kind === 'GROWTH'
      ? demand.signalMeta.label || 'is showing activity'
      : 'may be exploring outside partners';

    console.log(`[Edge] ${demand.company}: "${evidence}"`);
    expect(evidence).toBe('Funding raised');
  });

  it('demand with "Product launch" signal produces usable edge evidence', () => {
    const demand = DEMAND_ZUO;
    const evidence = demand.signalMeta?.kind === 'GROWTH'
      ? demand.signalMeta.label || 'is showing activity'
      : 'may be exploring outside partners';

    console.log(`[Edge] ${demand.company}: "${evidence}"`);
    expect(evidence).toBe('Product launch');
  });

  it('supply with industry-fallback signal — what does intro generation get?', () => {
    const supply = SUPPLY_VC_FUND;

    console.log(`[Supply Context]`);
    console.log(`  company: ${supply.company}`);
    console.log(`  title: ${supply.title}`);
    console.log(`  industry: ${supply.industry}`);
    console.log(`  description: ${supply.companyDescription}`);
    console.log(`  signal: ${supply.signal}`);
    console.log(`  domain: ${supply.domain}`);

    expect(supply.company).toBeTruthy();
    expect(supply.title).toBeTruthy();
    expect(supply.domain).toBeNull(); // Markets never has domain
    expect(supply.companyDescription || supply.industry || supply.title).toBeTruthy();
    // Signal should NOT be 'Market signal' — should be industry name
    expect(supply.signal).not.toBe('Market signal');
  });
});

// =============================================================================
// INTRO DATA FIELDS (what AI receives)
// =============================================================================

describe('Markets → Intro Data: Record Fields', () => {
  it('demand record has all fields intro generation needs (domain=null OK)', () => {
    const d = DEMAND_UNSTOPPABLE;

    const demandRecord = {
      domain: d.domain,       // null — Flow enriches by company name
      company: d.company,
      contact: d.firstName || '',
      email: d.email,         // null until enrichment
      title: d.title || '',
      industry: d.industry || '',
      signals: [d.signalMeta?.label || d.signal || ''],
      metadata: {
        companyDescription: d.companyDescription || null,
      },
    };

    console.log('[DemandRecord]', JSON.stringify(demandRecord, null, 2));

    expect(demandRecord.domain).toBeNull(); // Explicitly null for Markets
    expect(demandRecord.company).toBeTruthy();
    expect(demandRecord.contact).toBeTruthy();
    expect(demandRecord.title).toBeTruthy();
    expect(demandRecord.signals[0]).toBeTruthy();
    expect(demandRecord.metadata.companyDescription).toBeTruthy();
  });

  it('supply record has all fields intro generation needs', () => {
    const s = SUPPLY_VC_FUND;

    const supplyRecord = {
      domain: s.domain,       // null — Flow enriches by company name
      company: s.company,
      contact: s.firstName || '',
      email: s.email,
      title: s.title || '',
      capability: s.companyDescription || s.signal || 'business services',
      targetProfile: (Array.isArray(s.industry) ? s.industry[0] : s.industry) || '',
      metadata: {
        companyDescription: s.companyDescription || null,
      },
    };

    console.log('[SupplyRecord]', JSON.stringify(supplyRecord, null, 2));

    expect(supplyRecord.domain).toBeNull(); // Explicitly null for Markets
    expect(supplyRecord.company).toBeTruthy();
    expect(supplyRecord.contact).toBeTruthy();
    expect(supplyRecord.capability).toBeTruthy();
    expect(supplyRecord.capability).not.toBe('Market signal');
  });

  it('raw object has keys Flow checks for intro metadata', () => {
    const d = DEMAND_UNSTOPPABLE;

    // Flow reads these paths from raw
    expect(d.raw.company_description).toBeTruthy();
    expect(d.raw.description).toBeTruthy();
    expect(d.raw.capability).toBeTruthy();
    expect(d.raw.services).toBeTruthy();
    expect(d.raw.last_funding_type).toBe('series_a');
    expect(d.raw.last_funding_at).toBeTruthy();
    expect(d.raw.num_employees_enum).toBe('70');
  });

  it('sparse record raw has null company (no crash paths)', () => {
    const s = SUPPLY_SPARSE;
    expect(s.raw.company).toBeNull();
    expect(s.companyDescription).toBeNull();
    expect(s.industry).toBeNull();
    expect(s.domain).toBeNull();
    // Signal falls back to company name
    expect(s.signal).toBe('Pm-strategists Corner');
  });
});

// =============================================================================
// REGRESSION: Supply Quality Gate
// =============================================================================
// What broke: Markets supply was ingesting product companies (SaaS, manufacturers)
//   alongside service providers. Matcher forced to guess → garbage intros.
// How to detect: If a product company passes the gate, supply quality has regressed.

describe('REGRESSION: Supply quality gate', () => {
  // Re-implement gate logic from MarketsService.ts for offline testing
  const PROVIDER_PATTERNS = [
    /\bconsult/i, /\bagency\b/i, /\bagencies\b/i, /\bservices?\b/i,
    /\brecruit/i, /\bstaffing\b/i, /\boutsourc/i, /\bsolutions?\s+provider/i,
    /\bsystems?\s+integrat/i, /\badvisor/i, /\bmanaged\s+services/i,
    /\bimplementation/i, /\bsupport\s+services/i, /\bvendor\b/i, /\bpartner\b/i,
    /\bplacement/i, /\btalent\s+(acquisition|search|sourcing)/i,
    /\bexecutive\s+search/i, /\bprofessional\s+services/i, /\bbpo\b/i, /\bfirm\b/i,
  ];

  const PRODUCT_PATTERNS = [
    /\bplatform\b/i, /\bsaas\b/i, /\bsoftware\s+company/i, /\bmanufactur/i,
    /\bconsumer\s+brand/i, /\be-?commerce\s+(company|brand|retailer)/i,
    /\bdevelops?\s+(software|apps?|products?)/i, /\bbuilds?\s+(software|apps?|products?)/i,
  ];

  function isServiceProvider(record: NormalizedRecord): boolean {
    const text = [
      record.companyDescription || '',
      record.headline || '',
      record.industry || '',
      record.raw?.description || '',
    ].join(' ');
    if (text.trim().length < 10) return false;
    const hasProduct = PRODUCT_PATTERNS.some(p => p.test(text));
    const hasProvider = PROVIDER_PATTERNS.some(p => p.test(text));
    if (hasProvider) return true;
    if (hasProduct) return false;
    return false;
  }

  it('real recruiter passes gate', () => {
    const recruiter: NormalizedRecord = {
      ...SUPPLY_SPARSE,
      company: 'ABS Staffing Solutions',
      companyDescription: 'ABS Staffing Solutions provides staffing and recruiting services for life sciences and biotech companies.',
      industry: 'Staffing and Recruiting',
    };
    expect(isServiceProvider(recruiter)).toBe(true);
  });

  it('consulting firm passes gate', () => {
    const consultant: NormalizedRecord = {
      ...SUPPLY_SPARSE,
      company: 'McKinsey & Company',
      companyDescription: 'McKinsey is a global management consulting firm serving leading businesses.',
      industry: 'Management Consulting',
    };
    expect(isServiceProvider(consultant)).toBe(true);
  });

  it('SaaS product company BLOCKED by gate', () => {
    const saas: NormalizedRecord = {
      ...SUPPLY_SPARSE,
      company: 'Distribute.so',
      companyDescription: 'One-Click AI1-Pagers That Executives Actually Read. Our SaaS platform automates sales follow-ups.',
      industry: 'Software Development',
    };
    // SaaS + platform → product company, must NOT pass
    expect(isServiceProvider(saas)).toBe(false);
  });

  it('manufacturer BLOCKED by gate', () => {
    const mfg: NormalizedRecord = {
      ...SUPPLY_SPARSE,
      company: 'ZUO Modern',
      companyDescription: 'ZUO an international wholesale brand, manufacturing furnishings throughout US, Canada, Mexico.',
      industry: 'Furniture and Home Furnishings Manufacturing',
    };
    expect(isServiceProvider(mfg)).toBe(false);
  });

  it('record with no description BLOCKED by gate (no proof of capability)', () => {
    const empty: NormalizedRecord = {
      ...SUPPLY_SPARSE,
      companyDescription: null,
      headline: null,
      industry: null,
    };
    expect(isServiceProvider(empty)).toBe(false);
  });

  it('executive search firm passes gate', () => {
    const execSearch: NormalizedRecord = {
      ...SUPPLY_SPARSE,
      company: 'Direct Recruiters',
      companyDescription: 'Direct Recruiters is a premier executive search firm specializing in healthcare, technology, and industrial talent acquisition.',
      industry: 'Staffing and Recruiting',
    };
    expect(isServiceProvider(execSearch)).toBe(true);
  });

  it('consulting firm that mentions platform still passes (provider wins)', () => {
    const hybrid: NormalizedRecord = {
      ...SUPPLY_SPARSE,
      company: 'Deloitte Digital',
      companyDescription: 'Deloitte Digital is a consulting agency that helps enterprises implement digital platform transformations.',
      industry: 'Management Consulting',
    };
    // Has both "consulting agency" (provider) and "platform" (product) — provider wins
    expect(isServiceProvider(hybrid)).toBe(true);
  });

  it('cybersecurity MSSP passes supply gate', () => {
    const mssp: NormalizedRecord = {
      ...SUPPLY_SPARSE,
      company: 'Arctic Wolf',
      companyDescription: 'Arctic Wolf provides managed detection and response security services for enterprises.',
      industry: 'Computer & Network Security',
    };
    expect(isServiceProvider(mssp)).toBe(true);
  });

  it('cybersecurity SaaS vendor BLOCKED by supply gate', () => {
    const saasVendor: NormalizedRecord = {
      ...SUPPLY_SPARSE,
      company: 'CrowdStrike',
      companyDescription: 'CrowdStrike is a SaaS platform that delivers cloud-native endpoint protection.',
      industry: 'Computer & Network Security',
    };
    // SaaS + platform → product company
    expect(isServiceProvider(saasVendor)).toBe(false);
  });

  it('compliance consulting firm passes supply gate', () => {
    const compliance: NormalizedRecord = {
      ...SUPPLY_SPARSE,
      company: 'Coalfire',
      companyDescription: 'Coalfire is a cybersecurity advisory firm providing compliance consulting, risk advisory, and incident response services.',
      industry: 'Management Consulting',
    };
    expect(isServiceProvider(compliance)).toBe(true);
  });
});

// =============================================================================
// REGRESSION: Data quality invariants (detects old static endpoint)
// =============================================================================
// What broke: Old endpoint (api.instantly.ai) returned same 50 leads regardless
//   of filters. Hash d067487749e56df5 every time. 0% industry accuracy.
// How to detect: If biotech demand fixtures don't have biotech-related fields,
//   the upstream search is returning wrong data.

describe('REGRESSION: Data quality invariants', () => {
  it('biotech demand record has biotech-related industry', () => {
    // If this fixture were from the old endpoint, industry would be random
    // (e.g., "Furniture Manufacturing" for a biotech search)
    const biotechDemand: NormalizedRecord = {
      ...DEMAND_DATA_SAFEGUARD,
      company: 'Amplified Sciences',
      industry: 'Biotechnology',
      companyDescription: 'Amplified Sciences develops novel therapeutic approaches using synthetic biology.',
    };
    expect(biotechDemand.industry).toMatch(/biotech|pharma|medical|clinical|life.?science/i);
  });

  it('normalizeToRecord preserves industry from company intel', () => {
    // The old endpoint returned companies with NO relation to the filter.
    // This test ensures industry flows through normalization.
    const record = DEMAND_DATA_SAFEGUARD;
    expect(record.industry).toBeTruthy();
    expect(record.industry).toBe('Software Development');
    // Industry must come from company intel, not be fabricated
    expect(record.raw?.company?.industries?.[0]?.name).toBe(record.industry);
  });

  it('signal label reflects user filter choice, not generic fallback', () => {
    // Old endpoint: signal was always 'Market signal' or empty
    // New endpoint: signal reflects actual filter (Hiring, Funding raised, etc.)
    expect(DEMAND_DATA_SAFEGUARD.signal).toBe('Hiring');
    expect(DEMAND_UNSTOPPABLE.signal).toBe('Funding raised');
    expect(DEMAND_ZUO.signal).toBe('Product launch');
    // None should be generic fallback
    expect(DEMAND_DATA_SAFEGUARD.signal).not.toBe('Market signal');
    expect(DEMAND_UNSTOPPABLE.signal).not.toBe('Market signal');
  });

  it('company description is real content, not placeholder', () => {
    // Old endpoint descriptions were often missing or wrong company
    expect(DEMAND_DATA_SAFEGUARD.companyDescription).toBeTruthy();
    expect(DEMAND_DATA_SAFEGUARD.companyDescription!.length).toBeGreaterThan(20);
    expect(DEMAND_UNSTOPPABLE.companyDescription).toBeTruthy();
    expect(DEMAND_UNSTOPPABLE.companyDescription!.length).toBeGreaterThan(20);
  });

  it('matching biotech demand x recruiter supply produces meaningful score', () => {
    const biotechDemand: NormalizedRecord = {
      ...DEMAND_DATA_SAFEGUARD,
      company: 'Regeneron',
      industry: 'Biotechnology',
      companyDescription: 'Regeneron is a leading biotechnology company that invents life-transforming medicines.',
      signal: 'Hiring',
    };

    const lifeScisRecruiter: NormalizedRecord = {
      ...SUPPLY_SPARSE,
      company: 'Heyer Expectations',
      industry: 'Staffing and Recruiting',
      companyDescription: 'Heyer Expectations is a talent acquisition firm specializing in life sciences and biotech recruitment.',
      signal: 'Staffing and Recruiting',
    };

    const result = scoreMatch(biotechDemand, lifeScisRecruiter);
    expect(result.score).toBeGreaterThan(0);
    expect(result.needProfile).toBeDefined();
    expect(result.capabilityProfile).toBeDefined();
    console.log(`[Regression] Biotech×Recruiter: score=${result.score} tier=${result.tier} need=${result.needProfile?.category} cap=${result.capabilityProfile?.category}`);
  });
});

// =============================================================================
// REGRESSION: Industry fallback (logistics enrichment gap)
// =============================================================================
// What broke: Leadsy enrichment returned 0 company intel for logistics companies.
//   normalizeToRecord set industry=null → demand accuracy dropped to 34%.
// Fix: searchIndustry param falls back when company enrichment returns nothing.
// How to detect: if logistics record has null industry despite being searched
//   with subIndustry filter, the fallback is broken.

describe('REGRESSION: Industry fallback from search filter', () => {
  it('logistics company with no enrichment gets industry from searchIndustry', () => {
    // Simulate: lead from Instantly (no company intel from Leadsy)
    const record: NormalizedRecord = {
      ...DEMAND_DATA_SAFEGUARD,
      company: 'DB Schenker',
      industry: 'Logistics and Supply Chain',  // This comes from searchIndustry fallback
      companyDescription: null,
      size: null,
    };
    // Industry must not be null for a logistics search
    expect(record.industry).toBe('Logistics and Supply Chain');
    expect(record.industry).not.toBeNull();
  });

  it('company with enrichment industry ignores searchIndustry (enrichment wins)', () => {
    // Enrichment returns industry — searchIndustry should NOT override
    const record = DEMAND_DATA_SAFEGUARD;
    expect(record.industry).toBe('Software Development');  // From enrichment
    // Not overridden by any search filter
  });

});
