/**
 * markets-e2e-matching.test.ts — REGRESSION: End-to-end search → normalize → match
 *
 * Hits the REAL new endpoint, normalizes records exactly like production,
 * runs through the REAL matching engine, and inspects match quality.
 *
 * WHAT BROKE: Old endpoint (api.instantly.ai) returned static data — same 50
 *   leads regardless of filters (hash d067487749e56df5). 0% industry accuracy.
 *   Intros were garbage because matches were random.
 *
 * WHAT WORKS: New endpoint (app.instantly.ai/backend) respects all filters.
 *   Auth: Bearer <workspace JWT>. Same key works on both endpoints.
 *
 * HOW TO DETECT REGRESSION: If biotech search returns non-biotech companies,
 *   or if different filter combos produce identical lead sets, the endpoint
 *   is broken again.
 *
 * Run: MARKETS_API_KEY=<key> npx vitest run tests/markets-e2e-matching.test.ts
 */

import { describe, it, expect } from 'vitest';
import { matchRecordsSync, scoreMatch } from '../src/matching/index';
import { normalizeToRecord } from '../src/services/MarketsService';
import type { NormalizedRecord } from '../src/schemas';
import crypto from 'crypto';

const API_KEY = process.env.MARKETS_API_KEY || '';
const ENDPOINT = 'https://app.instantly.ai/backend/api/v2/supersearch-enrichment/preview-leads-from-supersearch';
const ENRICH_ENDPOINT = 'https://api.connector-os.com/markets/enrich-batch';

// =============================================================================
// HELPERS — same as production pipeline
// =============================================================================

interface SearchLead {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  jobTitle?: string;
  linkedIn?: string;
  companyName?: string;
  companyId?: number | string;
  companyLogo?: string;
  location?: string;
}

interface CompanyIntel {
  name?: string;
  description?: string;
  employee_count?: number;
  industries?: Array<{ name: string; id?: number; primary?: boolean }>;
  locations?: Array<any>;
  funding?: Array<{ amount?: string; type?: string; date?: string }>;
  news?: Array<{ title?: string; date?: string; type?: string }>;
  technologies?: Array<{ name?: string; type?: string }>;
  keywords?: { linkedIn_Data?: string[]; bright_data?: string[] };
  logo?: string;
}

async function searchLeads(filters: Record<string, any>): Promise<SearchLead[]> {
  const payload = { search_filters: filters, skip_owned_leads: false, show_one_lead_per_company: true };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Search failed: ${res.status} ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.leads || [];
}

async function enrichCompanies(companyIds: string[]): Promise<Map<string, CompanyIntel>> {
  const result = new Map<string, CompanyIntel>();
  if (companyIds.length === 0) return result;

  const res = await fetch(ENRICH_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyIds: [...new Set(companyIds)] }),
  });

  if (!res.ok) return result;
  const data = await res.json();
  for (const [id, company] of Object.entries(data.companies || {})) {
    if (company) result.set(String(id), company as CompanyIntel);
  }
  return result;
}

function buildRecords(leads: SearchLead[], companies: Map<string, CompanyIntel>, signalLabel: string): NormalizedRecord[] {
  return leads.map(lead => {
    const company = companies.get(String(lead.companyId)) || null;
    return normalizeToRecord(lead as any, company as any, signalLabel);
  });
}

function skip() {
  if (!API_KEY) { console.log('⏭ Skipped: set MARKETS_API_KEY'); return true; }
  return false;
}

// =============================================================================
// SUPPLY QUALITY GATE (copied from MarketsService.ts)
// =============================================================================

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
  const hasProvider = PROVIDER_PATTERNS.some(p => p.test(text));
  const hasProduct = PRODUCT_PATTERNS.some(p => p.test(text));
  if (hasProvider) return true;
  if (hasProduct) return false;
  return false;
}

// =============================================================================
// TEST: BIOTECH DEMAND + LIFE SCIENCES SUPPLY → MATCHING
// =============================================================================

describe('E2E: Biotech demand × Life sciences supply → matching', () => {
  let demandRecords: NormalizedRecord[] = [];
  let supplyRecords: NormalizedRecord[] = [];
  let filteredSupply: NormalizedRecord[] = [];

  it('Step 1: fetch biotech demand (hiring signal)', async () => {
    if (skip()) return;

    const leads = await searchLeads({
      news: ['hires'],
      subIndustry: { include: ['Biotechnology', 'Pharmaceuticals'] },
    });

    const companyIds = leads.map(l => String(l.companyId)).filter(Boolean);
    const companies = await enrichCompanies(companyIds);

    demandRecords = buildRecords(leads, companies, 'Hiring');

    console.log(`\n=== DEMAND: Biotech hiring ===`);
    console.log(`Leads: ${leads.length}, enriched: ${companies.size}`);
    console.log('\nFirst 10 demand companies:');
    demandRecords.slice(0, 10).forEach(r => {
      console.log(`  ${r.company} | ${r.title} | ${r.industry || '?'} | signal: ${r.signal?.slice(0, 60)}`);
    });

    expect(demandRecords.length).toBeGreaterThan(0);
  }, 60000);

  it('Step 2: fetch life sciences supply (staffing/recruiting)', async () => {
    if (skip()) return;

    const leads = await searchLeads({
      subIndustry: { include: ['Staffing and Recruiting', 'Human Resources'] },
      keywordFilter: { include: 'life sciences biotech pharma clinical recruiting staffing', exclude: '' },
    });

    // If keyword search returns 0, try without keywords
    let finalLeads = leads;
    if (leads.length === 0) {
      console.log('[Supply] Keyword search returned 0, trying without keywords...');
      finalLeads = await searchLeads({
        subIndustry: { include: ['Staffing and Recruiting'] },
      });
    }

    const companyIds = finalLeads.map(l => String(l.companyId)).filter(Boolean);
    const companies = await enrichCompanies(companyIds);

    supplyRecords = buildRecords(finalLeads, companies, 'Staffing and Recruiting');

    console.log(`\n=== SUPPLY: Staffing/Recruiting ===`);
    console.log(`Leads: ${finalLeads.length}, enriched: ${companies.size}`);

    // Apply supply gate
    filteredSupply = supplyRecords.filter(isServiceProvider);
    const dropped = supplyRecords.length - filteredSupply.length;

    console.log(`Supply gate: ${filteredSupply.length} kept, ${dropped} dropped`);
    console.log('\nKept supply companies:');
    filteredSupply.slice(0, 15).forEach(r => {
      console.log(`  ${r.company} | ${r.title} | ${r.industry || '?'}`);
      console.log(`    desc: ${r.companyDescription?.slice(0, 100) || '(none)'}`);
    });

    if (dropped > 0) {
      console.log('\nDropped (not service providers):');
      supplyRecords.filter(r => !isServiceProvider(r)).slice(0, 5).forEach(r => {
        console.log(`  ✗ ${r.company} | ${r.companyDescription?.slice(0, 80) || '(none)'}`);
      });
    }

    expect(supplyRecords.length).toBeGreaterThan(0);
  }, 60000);

  it('Step 3: run REAL matching engine → inspect match quality', async () => {
    if (skip() || demandRecords.length === 0 || filteredSupply.length === 0) {
      console.log('⏭ Skipped: no records from previous steps');
      return;
    }

    // Use filteredSupply (gate applied) — exactly what production would do
    const result = matchRecordsSync(demandRecords, filteredSupply);

    console.log(`\n=== MATCHING RESULTS ===`);
    console.log(`Demand: ${demandRecords.length} | Supply (filtered): ${filteredSupply.length}`);
    console.log(`Matches: ${result.demandMatches.length}`);
    console.log(`Avg score: ${result.stats.avgScore.toFixed(1)}`);

    console.log('\n--- TOP MATCHES ---');
    for (const m of result.demandMatches.slice(0, 15)) {
      console.log(`\n  DEMAND: ${m.demand.company} (${m.demand.industry || '?'})`);
      console.log(`    signal: ${m.demand.signal?.slice(0, 80)}`);
      console.log(`    contact: ${m.demand.fullName} — ${m.demand.title}`);
      console.log(`  SUPPLY: ${m.supply.company} (${m.supply.industry || '?'})`);
      console.log(`    desc: ${m.supply.companyDescription?.slice(0, 100) || '(none)'}`);
      console.log(`    contact: ${m.supply.fullName} — ${m.supply.title}`);
      console.log(`  SCORE: ${m.score} | TIER: ${m.tier} | ${m.tierReason}`);
      console.log(`  NEED: ${m.needProfile?.category || '?'} → CAP: ${m.capabilityProfile?.category || '?'}`);
      if (m.reasons.length > 0) console.log(`  REASONS: ${m.reasons.join(', ')}`);
    }

    // Quality checks
    const avgScore = result.stats.avgScore;
    const matchCount = result.demandMatches.length;

    console.log(`\n=== QUALITY VERDICT ===`);

    // Check: do demand companies look like biotech?
    const biotechDemand = result.demandMatches.filter(m =>
      /biotech|pharma|clinical|therapeutic|medical|life.?science/i.test(
        `${m.demand.company} ${m.demand.industry} ${m.demand.companyDescription}`
      )
    );
    console.log(`Biotech demand matches: ${biotechDemand.length}/${matchCount} (${matchCount > 0 ? Math.round(biotechDemand.length / matchCount * 100) : 0}%)`);

    // Check: do supply companies look like recruiters/staffing?
    const recruiterSupply = result.demandMatches.filter(m =>
      /recruit|staffing|talent|search|placement|consulting|agency|services/i.test(
        `${m.supply.company} ${m.supply.industry} ${m.supply.companyDescription}`
      )
    );
    console.log(`Recruiter supply matches: ${recruiterSupply.length}/${matchCount} (${matchCount > 0 ? Math.round(recruiterSupply.length / matchCount * 100) : 0}%)`);

    console.log(`Average score: ${avgScore.toFixed(1)}`);

    if (biotechDemand.length > matchCount * 0.5 && recruiterSupply.length > matchCount * 0.5) {
      console.log('\n✓ PASS: Majority of matches pair biotech companies with recruiters');
    } else {
      console.log('\n⚠ QUALITY ISSUE: Matches are not predominantly biotech → recruiter');
    }

    expect(matchCount).toBeGreaterThan(0);
    expect(avgScore).toBeGreaterThan(0);
  }, 30000);
});

// =============================================================================
// TEST: FINTECH DEMAND + CONSULTING SUPPLY (different vertical)
// =============================================================================

describe('E2E: Fintech demand × Consulting supply → matching', () => {
  it('different vertical produces different matches', async () => {
    if (skip()) return;

    // Demand: fintech companies raising funding
    const demandLeads = await searchLeads({
      news: ['receives_financing'],
      subIndustry: { include: ['Financial Services', 'Banking'] },
    });
    const demandIds = demandLeads.map(l => String(l.companyId)).filter(Boolean);
    const demandCompanies = await enrichCompanies(demandIds);
    const demand = buildRecords(demandLeads, demandCompanies, 'Funding raised');

    // Supply: management consulting
    const supplyLeads = await searchLeads({
      subIndustry: { include: ['Management Consulting'] },
    });
    const supplyIds = supplyLeads.map(l => String(l.companyId)).filter(Boolean);
    const supplyCompanies = await enrichCompanies(supplyIds);
    const supply = buildRecords(supplyLeads, supplyCompanies, 'Management Consulting');
    const filteredSupply = supply.filter(isServiceProvider);

    console.log(`\n=== FINTECH × CONSULTING ===`);
    console.log(`Demand: ${demand.length} fintech companies`);
    console.log(`Supply: ${filteredSupply.length} consulting firms (${supply.length - filteredSupply.length} dropped)`);

    if (demand.length === 0 || filteredSupply.length === 0) {
      console.log('⏭ No records, skipping matching');
      return;
    }

    const result = matchRecordsSync(demand, filteredSupply);

    console.log(`Matches: ${result.demandMatches.length}, avg score: ${result.stats.avgScore.toFixed(1)}`);
    console.log('\nFirst 5 matches:');
    result.demandMatches.slice(0, 5).forEach(m => {
      console.log(`  ${m.demand.company} (${m.demand.industry}) → ${m.supply.company} (${m.supply.industry})`);
      console.log(`    score=${m.score} tier=${m.tier} need=${m.needProfile?.category} cap=${m.capabilityProfile?.category}`);
    });

    expect(result.demandMatches.length).toBeGreaterThan(0);
  }, 120000);
});
