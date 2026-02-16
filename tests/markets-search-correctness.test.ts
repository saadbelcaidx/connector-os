/**
 * markets-search-correctness.test.ts — REGRESSION: Upstream search correctness
 *
 * WHAT BROKE: Old endpoint (api.instantly.ai) returned static data — same 50
 *   leads regardless of filters. Hash d067487749e56df5 every time.
 *
 * PROVES: different filters → different lead sets.
 * If company ID hashes are identical across different filters, backend is broken.
 *
 * HOW TO DETECT REGRESSION: All 5 tests fail simultaneously. If even one hash
 *   comparison shows identical results for different filters, the endpoint
 *   has reverted to the broken public API.
 *
 * Run: MARKETS_API_KEY=<key> npx vitest run tests/markets-search-correctness.test.ts
 */

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

const API_BASE = 'https://api.connector-os.com';
const API_KEY = process.env.MARKETS_API_KEY || '';

// =============================================================================
// HELPERS
// =============================================================================

async function rawSearch(filters: Record<string, any>): Promise<{
  leads: any[];
  totalCount: number;
  companyIds: string[];
  companyNames: string[];
  industries: string[];
  hash: string;
  payload: Record<string, any>;
}> {
  const payload = {
    apiKey: API_KEY,
    showOneLeadPerCompany: true,
    ...filters,
  };

  const response = await fetch(`${API_BASE}/markets/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Search failed: ${response.status} ${err.error || ''}`);
  }

  const data = await response.json();
  const leads = data.data || [];

  const companyIds = leads.map((l: any) => String(l.companyId || '')).sort();
  const companyNames = leads.map((l: any) => l.companyName || '');
  const industries: string[] = []; // filled after enrich

  // Hash of sorted company IDs — identical hash = identical results
  const hash = crypto.createHash('sha256').update(companyIds.join('|')).digest('hex').slice(0, 16);

  return { leads, totalCount: data.total_count || 0, companyIds, companyNames, industries, hash, payload };
}

async function enrichCompanies(companyIds: string[]): Promise<Map<string, any>> {
  const result = new Map<string, any>();
  if (companyIds.length === 0) return result;

  const response = await fetch(`${API_BASE}/markets/enrich-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyIds: [...new Set(companyIds)] }),
  });

  if (!response.ok) return result;
  const data = await response.json();
  for (const [id, company] of Object.entries(data.companies || {})) {
    if (company) result.set(String(id), company);
  }
  return result;
}

function skip() {
  if (!API_KEY) {
    console.log('⏭ Skipped: set MARKETS_API_KEY env var');
    return true;
  }
  return false;
}

// =============================================================================
// TEST 1: Different industry filters → different results?
// =============================================================================

describe('Search correctness: industry filters', () => {
  it('biotech vs fintech → different company ID hashes', async () => {
    if (skip()) return;

    const biotech = await rawSearch({
      news: ['hires'],
      subIndustry: { include: ['Biotechnology Research', 'Pharmaceutical Manufacturing'], exclude: [] },
    });

    const fintech = await rawSearch({
      news: ['hires'],
      subIndustry: { include: ['Financial Services', 'Banking'], exclude: [] },
    });

    console.log('\n=== INDUSTRY FILTER VARIATION ===');
    console.log(`Biotech: ${biotech.leads.length} leads, hash=${biotech.hash}`);
    console.log(`Fintech: ${fintech.leads.length} leads, hash=${fintech.hash}`);

    // Log first 5 company names from each
    console.log('\nBiotech companies:');
    biotech.companyNames.slice(0, 10).forEach(n => console.log(`  - ${n}`));
    console.log('\nFintech companies:');
    fintech.companyNames.slice(0, 10).forEach(n => console.log(`  - ${n}`));

    // Check overlap
    const biotechSet = new Set(biotech.companyIds);
    const overlap = fintech.companyIds.filter(id => biotechSet.has(id));
    console.log(`\nOverlap: ${overlap.length}/${Math.min(biotech.companyIds.length, fintech.companyIds.length)} company IDs shared`);

    if (biotech.hash === fintech.hash) {
      console.log('\n🚨 IDENTICAL HASHES — backend is returning same data regardless of industry filter');
    } else {
      console.log('\n✓ Different hashes — industry filters are working');
    }

    expect(biotech.hash).not.toEqual(fintech.hash);
  }, 60000);
});

// =============================================================================
// TEST 2: Different signal filters → different results?
// =============================================================================

describe('Search correctness: signal filters', () => {
  it('hiring vs funding → different company ID hashes', async () => {
    if (skip()) return;

    const hiring = await rawSearch({
      news: ['hires'],
    });

    const funding = await rawSearch({
      news: ['receives_financing'],
    });

    console.log('\n=== SIGNAL FILTER VARIATION ===');
    console.log(`Hiring: ${hiring.leads.length} leads, hash=${hiring.hash}`);
    console.log(`Funding: ${funding.leads.length} leads, hash=${funding.hash}`);

    console.log('\nHiring companies:');
    hiring.companyNames.slice(0, 10).forEach(n => console.log(`  - ${n}`));
    console.log('\nFunding companies:');
    funding.companyNames.slice(0, 10).forEach(n => console.log(`  - ${n}`));

    const hiringSet = new Set(hiring.companyIds);
    const overlap = funding.companyIds.filter(id => hiringSet.has(id));
    console.log(`\nOverlap: ${overlap.length}/${Math.min(hiring.companyIds.length, funding.companyIds.length)} company IDs shared`);

    if (hiring.hash === funding.hash) {
      console.log('\n🚨 IDENTICAL HASHES — signal filter has no effect');
    } else {
      console.log('\n✓ Different hashes — signal filters are working');
    }

    expect(hiring.hash).not.toEqual(funding.hash);
  }, 60000);
});

// =============================================================================
// TEST 3: Different keywords → different results?
// =============================================================================

describe('Search correctness: keyword filters', () => {
  it('"biotech clinical" vs "fintech payments" → different results', async () => {
    if (skip()) return;

    const biotech = await rawSearch({
      keywordFilter: { include: 'biotech clinical trials pharma', exclude: '' },
    });

    const fintech = await rawSearch({
      keywordFilter: { include: 'fintech payments banking crypto', exclude: '' },
    });

    console.log('\n=== KEYWORD FILTER VARIATION ===');
    console.log(`Biotech keywords: ${biotech.leads.length} leads, hash=${biotech.hash}`);
    console.log(`Fintech keywords: ${fintech.leads.length} leads, hash=${fintech.hash}`);

    console.log('\nBiotech keyword companies:');
    biotech.companyNames.slice(0, 10).forEach(n => console.log(`  - ${n}`));
    console.log('\nFintech keyword companies:');
    fintech.companyNames.slice(0, 10).forEach(n => console.log(`  - ${n}`));

    const biotechSet = new Set(biotech.companyIds);
    const overlap = fintech.companyIds.filter(id => biotechSet.has(id));
    console.log(`\nOverlap: ${overlap.length}/${Math.min(biotech.companyIds.length, fintech.companyIds.length)} company IDs shared`);

    if (biotech.hash === fintech.hash) {
      console.log('\n🚨 IDENTICAL HASHES — keyword filter has no effect');
    } else {
      console.log('\n✓ Different hashes — keyword filters are working');
    }

    expect(biotech.hash).not.toEqual(fintech.hash);
  }, 60000);
});

// =============================================================================
// TEST 4: Verify enriched industries match requested filter
// =============================================================================

describe('Search correctness: industry accuracy', () => {
  it('biotech industry filter → enriched companies actually in biotech', async () => {
    if (skip()) return;

    const result = await rawSearch({
      news: ['hires'],
      subIndustry: { include: ['Biotechnology Research', 'Pharmaceutical Manufacturing'], exclude: [] },
    });

    // Enrich to get actual industries
    const companyIds = [...new Set(result.companyIds.filter(Boolean))];
    const companies = await enrichCompanies(companyIds);

    console.log('\n=== INDUSTRY ACCURACY CHECK ===');
    console.log(`Requested: Biotechnology Research, Pharmaceutical Manufacturing`);
    console.log(`Returned ${result.leads.length} leads, enriched ${companies.size} companies\n`);

    let biotechCount = 0;
    let otherCount = 0;
    const industryCounts: Record<string, number> = {};

    for (const lead of result.leads) {
      const company = companies.get(String(lead.companyId));
      const industry = company?.industries?.[0]?.name || '(unknown)';

      industryCounts[industry] = (industryCounts[industry] || 0) + 1;

      if (/biotech|pharma|medical|life.?science|clinical/i.test(industry)) {
        biotechCount++;
      } else {
        otherCount++;
      }
    }

    console.log('Industry distribution:');
    Object.entries(industryCounts)
      .sort(([, a], [, b]) => b - a)
      .forEach(([ind, count]) => console.log(`  ${count}x ${ind}`));

    const accuracy = result.leads.length > 0 ? Math.round(biotechCount / result.leads.length * 100) : 0;
    console.log(`\nBiotech accuracy: ${biotechCount}/${result.leads.length} (${accuracy}%)`);
    console.log(`Non-biotech: ${otherCount}/${result.leads.length}`);

    if (accuracy < 50) {
      console.log('\n🚨 Less than 50% of results match the requested industry — filter is not working');
    } else {
      console.log('\n✓ Majority of results match requested industry');
    }

    // At least 50% should be biotech/pharma/medical
    expect(accuracy).toBeGreaterThanOrEqual(50);
  }, 60000);
});

// =============================================================================
// TEST 5: Payload inspection — what exactly goes to the provider API?
// =============================================================================

describe('Search correctness: payload audit', () => {
  it('log full outbound payload for biotech search', async () => {
    if (skip()) return;

    const filters = {
      news: ['hires'],
      subIndustry: { include: ['Biotechnology Research', 'Pharmaceutical Manufacturing'], exclude: [] },
      jobListingFilter: ['scientist', 'clinical'],
    };

    console.log('\n=== OUTBOUND PAYLOAD AUDIT ===');
    console.log('Frontend sends to backend:');
    console.log(JSON.stringify({ apiKey: '***', showOneLeadPerCompany: true, ...filters }, null, 2));

    console.log('\nBackend should build search_filters:');
    const search_filters: Record<string, any> = {};
    if (filters.news?.length) search_filters.news = filters.news;
    if (filters.subIndustry) search_filters.subIndustry = filters.subIndustry;
    if (filters.jobListingFilter?.length) search_filters.jobListingFilter = filters.jobListingFilter;

    console.log(JSON.stringify({ search_filters, skip_owned_leads: false, show_one_lead_per_company: true }, null, 2));

    console.log('\nNote: Backend rotates TITLE_PACKS if no user title filter provided.');
    console.log('Each pack adds title.include to search_filters before calling Instantly API.');

    // Actually run the search and see what comes back
    const result = await rawSearch(filters);
    console.log(`\nResult: ${result.leads.length} leads, total=${result.totalCount}`);
    console.log('First 5:');
    result.leads.slice(0, 5).forEach((l: any) => {
      console.log(`  ${l.companyName} | ${l.jobTitle} | companyId=${l.companyId}`);
    });

    expect(result.leads.length).toBeGreaterThan(0);
  }, 60000);
});
