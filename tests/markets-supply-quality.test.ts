/**
 * markets-supply-quality.test.ts — Live API stress test
 *
 * Hits the real backend with biotech filters, builds demand + supply,
 * then inspects what the supply quality gate keeps vs drops.
 *
 * Run: MARKETS_API_KEY=<your-key> npx vitest run tests/markets-supply-quality.test.ts
 *
 * This test uses REAL API credits. Keep it manual (not in CI).
 */

import { describe, it, expect } from 'vitest';

const API_BASE = 'https://api.connector-os.com';
const API_KEY = process.env.MARKETS_API_KEY || '';

// =============================================================================
// SUPPLY QUALITY GATE (copied from MarketsService.ts for isolation)
// =============================================================================

const PROVIDER_PATTERNS = [
  /\bconsult/i,
  /\bagency\b/i,
  /\bagencies\b/i,
  /\bservices?\b/i,
  /\brecruit/i,
  /\bstaffing\b/i,
  /\boutsourc/i,
  /\bsolutions?\s+provider/i,
  /\bsystems?\s+integrat/i,
  /\badvisor/i,
  /\bmanaged\s+services/i,
  /\bimplementation/i,
  /\bsupport\s+services/i,
  /\bvendor\b/i,
  /\bpartner\b/i,
  /\bplacement/i,
  /\btalent\s+(acquisition|search|sourcing)/i,
  /\bexecutive\s+search/i,
  /\bprofessional\s+services/i,
  /\bbpo\b/i,
  /\bfirm\b/i,
];

const PRODUCT_PATTERNS = [
  /\bplatform\b/i,
  /\bsaas\b/i,
  /\bsoftware\s+company/i,
  /\bmanufactur/i,
  /\bconsumer\s+brand/i,
  /\be-?commerce\s+(company|brand|retailer)/i,
  /\bdevelops?\s+(software|apps?|products?)/i,
  /\bbuilds?\s+(software|apps?|products?)/i,
];

interface LeadRecord {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  jobTitle?: string;
  companyName?: string;
  companyId?: number | string;
  location?: string;
}

interface CompanyIntel {
  name?: string;
  description?: string;
  employee_count?: number;
  industries?: Array<{ name: string; id?: number; primary?: boolean }>;
  [key: string]: any;
}

function classifyCompany(description: string): { isProvider: boolean; matchedProvider: string | null; matchedProduct: string | null } {
  const hasProvider = PROVIDER_PATTERNS.find(p => p.test(description));
  const hasProduct = PRODUCT_PATTERNS.find(p => p.test(description));

  return {
    isProvider: !!hasProvider || (!hasProduct && false),
    matchedProvider: hasProvider ? hasProvider.source : null,
    matchedProduct: hasProduct ? hasProduct.source : null,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

async function searchMarkets(filters: Record<string, any>): Promise<{ leads: LeadRecord[]; totalCount: number }> {
  const response = await fetch(`${API_BASE}/markets/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: API_KEY, showOneLeadPerCompany: true, ...filters }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Search failed: ${response.status} ${err.error || ''}`);
  }

  const data = await response.json();
  return { leads: data.data || [], totalCount: data.total_count || 0 };
}

async function enrichCompanies(companyIds: string[]): Promise<Map<string, CompanyIntel>> {
  const result = new Map<string, CompanyIntel>();
  if (companyIds.length === 0) return result;

  const response = await fetch(`${API_BASE}/markets/enrich-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyIds }),
  });

  if (!response.ok) return result;

  const data = await response.json();
  for (const [id, company] of Object.entries(data.companies || {})) {
    if (company) result.set(String(id), company as CompanyIntel);
  }
  return result;
}

// =============================================================================
// TEST: BIOTECH DEMAND — companies hiring in biotech/pharma
// =============================================================================

describe('Markets Live API: Biotech Demand', () => {
  it('search biotech hiring → returns companies with relevant signals', async () => {
    if (!API_KEY) {
      console.log('⏭ Skipped: set MARKETS_API_KEY env var');
      return;
    }

    const { leads, totalCount } = await searchMarkets({
      news: ['hires'],
      subIndustry: {
        include: ['Biotechnology Research', 'Pharmaceutical Manufacturing', 'Medical Equipment Manufacturing'],
        exclude: [],
      },
    });

    console.log(`\n=== BIOTECH DEMAND SEARCH ===`);
    console.log(`Total found: ${totalCount}, returned: ${leads.length}`);

    // Enrich companies for descriptions
    const companyIds = [...new Set(leads.map(l => String(l.companyId)).filter(Boolean))];
    const companies = await enrichCompanies(companyIds);

    console.log(`Enriched: ${companies.size}/${companyIds.length} companies\n`);

    console.log('--- DEMAND RECORDS ---');
    for (const lead of leads.slice(0, 15)) {
      const company = companies.get(String(lead.companyId));
      const desc = company?.description?.slice(0, 100) || '(no description)';
      const industry = company?.industries?.[0]?.name || '(no industry)';
      console.log(`  ${lead.companyName} | ${lead.jobTitle} | ${industry}`);
      console.log(`    desc: ${desc}`);
      console.log('');
    }

    expect(leads.length).toBeGreaterThan(0);
  }, 30000);
});

// =============================================================================
// TEST: BIOTECH SUPPLY — recruiting/staffing/CRO companies
// =============================================================================

describe('Markets Live API: Biotech Supply', () => {
  it('search life sciences recruiting → filter through supply gate', async () => {
    if (!API_KEY) {
      console.log('⏭ Skipped: set MARKETS_API_KEY env var');
      return;
    }

    const { leads, totalCount } = await searchMarkets({
      keywordFilter: {
        include: 'recruiting staffing life sciences pharma biotech CRO clinical',
        exclude: '',
      },
      subIndustry: {
        include: ['Staffing and Recruiting', 'Human Resources Services'],
        exclude: [],
      },
    });

    console.log(`\n=== BIOTECH SUPPLY SEARCH ===`);
    console.log(`Total found: ${totalCount}, returned: ${leads.length}`);

    // Enrich companies for descriptions
    const companyIds = [...new Set(leads.map(l => String(l.companyId)).filter(Boolean))];
    const companies = await enrichCompanies(companyIds);

    console.log(`Enriched: ${companies.size}/${companyIds.length} companies\n`);

    // Run supply gate on each
    let kept = 0;
    let dropped = 0;
    const keptRecords: string[] = [];
    const droppedRecords: string[] = [];

    console.log('--- SUPPLY GATE RESULTS ---');
    for (const lead of leads) {
      const company = companies.get(String(lead.companyId));
      const desc = company?.description || '';
      const industry = company?.industries?.[0]?.name || '';
      const text = `${desc} ${industry}`;

      const { isProvider, matchedProvider, matchedProduct } = classifyCompany(text);

      const label = `${lead.companyName} | ${lead.jobTitle} | ${industry}`;

      if (isProvider || (text.trim().length >= 10 && PROVIDER_PATTERNS.some(p => p.test(text)))) {
        kept++;
        keptRecords.push(label);
        console.log(`  ✓ KEEP: ${label}`);
        console.log(`    matched: ${matchedProvider}`);
        console.log(`    desc: ${desc.slice(0, 120)}`);
      } else {
        dropped++;
        droppedRecords.push(label);
        console.log(`  ✗ DROP: ${label}`);
        console.log(`    product: ${matchedProduct || 'none'} | no provider signal`);
        console.log(`    desc: ${desc.slice(0, 120) || '(empty)'}`);
      }
      console.log('');
    }

    console.log(`\n=== SUPPLY GATE SUMMARY ===`);
    console.log(`Kept: ${kept}/${leads.length} (${Math.round(kept / leads.length * 100)}%)`);
    console.log(`Dropped: ${dropped}/${leads.length} (${Math.round(dropped / leads.length * 100)}%)`);

    // We expect the supply search to return mostly providers
    // If <50% pass, the search filters need work
    if (kept < leads.length * 0.5) {
      console.log('\n⚠ WARNING: Less than 50% of supply results are actual providers.');
      console.log('The search filters may need to be more specific.');
    }

    expect(leads.length).toBeGreaterThan(0);
  }, 30000);
});

// =============================================================================
// TEST: GENERIC SUPPLY — what happens with bad filters (the failure case)
// =============================================================================

describe('Markets Live API: Generic Supply (failure case)', () => {
  it('search "IT recruitment" broadly → see what gate catches', async () => {
    if (!API_KEY) {
      console.log('⏭ Skipped: set MARKETS_API_KEY env var');
      return;
    }

    const { leads, totalCount } = await searchMarkets({
      keywordFilter: {
        include: 'recruitment IT',
        exclude: '',
      },
    });

    console.log(`\n=== GENERIC "recruitment IT" SEARCH (failure case) ===`);
    console.log(`Total found: ${totalCount}, returned: ${leads.length}`);

    const companyIds = [...new Set(leads.map(l => String(l.companyId)).filter(Boolean))];
    const companies = await enrichCompanies(companyIds);

    let kept = 0;
    let dropped = 0;

    for (const lead of leads) {
      const company = companies.get(String(lead.companyId));
      const desc = company?.description || '';
      const industry = company?.industries?.[0]?.name || '';
      const text = `${desc} ${industry}`;

      const hasProvider = PROVIDER_PATTERNS.some(p => p.test(text));
      const hasProduct = PRODUCT_PATTERNS.some(p => p.test(text));
      const noDesc = text.trim().length < 10;

      if (hasProvider) {
        kept++;
      } else {
        dropped++;
        if (noDesc) {
          console.log(`  ✗ ${lead.companyName}: no description`);
        } else if (hasProduct) {
          console.log(`  ✗ ${lead.companyName}: product company — "${desc.slice(0, 80)}"`);
        } else {
          console.log(`  ✗ ${lead.companyName}: no provider signal — "${desc.slice(0, 80)}"`);
        }
      }
    }

    console.log(`\n=== GENERIC SUPPLY GATE ===`);
    console.log(`Kept: ${kept}/${leads.length}`);
    console.log(`Dropped: ${dropped}/${leads.length}`);
    console.log(`This is the scenario that was producing bad matches before the filter.`);

    expect(leads.length).toBeGreaterThan(0);
  }, 30000);
});
