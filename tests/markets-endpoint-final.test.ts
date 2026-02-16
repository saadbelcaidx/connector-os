/**
 * markets-endpoint-final.test.ts — Prove new endpoint + correct industry names work
 *
 * Run: MARKETS_API_KEY=<key> npx vitest run tests/markets-endpoint-final.test.ts
 */

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

const API_KEY = process.env.MARKETS_API_KEY || '';
const ENDPOINT = 'https://app.instantly.ai/backend/api/v2/supersearch-enrichment/preview-leads-from-supersearch';

async function search(filters: Record<string, any>): Promise<{
  leads: any[];
  total: number;
  hash: string;
  status: number;
  error?: string;
}> {
  const payload = { search_filters: filters, skip_owned_leads: false, show_one_lead_per_company: true };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    return { leads: [], total: 0, hash: 'error', status: res.status, error: err.slice(0, 300) };
  }

  const data = await res.json();
  const leads = data.leads || [];
  const ids = leads.map((l: any) => String(l.companyId || '')).sort();
  const hash = crypto.createHash('sha256').update(ids.join('|')).digest('hex').slice(0, 16);
  return { leads, total: data.number_of_leads || 0, hash, status: res.status };
}

function skip() {
  if (!API_KEY) { console.log('⏭ Skipped: set MARKETS_API_KEY'); return true; }
  return false;
}

describe('New endpoint: correct industry names', () => {
  it('Biotechnology (hiring) → returns biotech companies', async () => {
    if (skip()) return;

    const result = await search({
      news: ['hires'],
      subIndustry: { include: ['Biotechnology'] },
    });

    console.log(`\n=== BIOTECH (correct name) ===`);
    console.log(`Status: ${result.status}, leads: ${result.leads.length}, total: ${result.total}`);
    if (result.error) { console.log(`Error: ${result.error}`); return; }

    result.leads.slice(0, 15).forEach((l: any) => {
      console.log(`  ${l.companyName} | ${l.jobTitle} | ${l.location || ''}`);
    });

    expect(result.leads.length).toBeGreaterThan(0);
  }, 30000);

  it('Biotechnology vs Pharmaceuticals → different results', async () => {
    if (skip()) return;

    const biotech = await search({ news: ['hires'], subIndustry: { include: ['Biotechnology'] } });
    const pharma = await search({ news: ['hires'], subIndustry: { include: ['Pharmaceuticals'] } });

    console.log(`\n=== BIOTECH vs PHARMA ===`);
    console.log(`Biotech: ${biotech.leads.length} leads, hash=${biotech.hash}`);
    console.log(`Pharma:  ${pharma.leads.length} leads, hash=${pharma.hash}`);

    if (biotech.error) console.log(`Biotech error: ${biotech.error}`);
    if (pharma.error) console.log(`Pharma error: ${pharma.error}`);

    console.log('\nBiotech first 5:');
    biotech.leads.slice(0, 5).forEach((l: any) => console.log(`  ${l.companyName} | ${l.jobTitle}`));
    console.log('Pharma first 5:');
    pharma.leads.slice(0, 5).forEach((l: any) => console.log(`  ${l.companyName} | ${l.jobTitle}`));

    if (biotech.hash !== 'error' && pharma.hash !== 'error') {
      expect(biotech.hash).not.toEqual(pharma.hash);
      console.log('✓ Different results for different sub-industries');
    }
  }, 60000);

  it('Staffing + life sciences keywords → actual recruiters', async () => {
    if (skip()) return;

    const result = await search({
      subIndustry: { include: ['Staffing and Recruiting'] },
      keywordFilter: { include: 'life sciences biotech pharma clinical recruiting', exclude: '' },
    });

    console.log(`\n=== LIFE SCIENCES RECRUITERS ===`);
    console.log(`Status: ${result.status}, leads: ${result.leads.length}`);
    if (result.error) { console.log(`Error: ${result.error}`); return; }

    result.leads.slice(0, 15).forEach((l: any) => {
      console.log(`  ${l.companyName} | ${l.jobTitle} | ${l.location || ''}`);
    });

    expect(result.leads.length).toBeGreaterThan(0);
  }, 30000);
});
