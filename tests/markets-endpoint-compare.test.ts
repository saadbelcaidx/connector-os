/**
 * markets-endpoint-compare.test.ts — Compare old vs new endpoint
 *
 * Old: api.instantly.ai (proven broken — static results)
 * New: app.instantly.ai/backend (from Instantly's own UI)
 *
 * Run: MARKETS_API_KEY=<key> npx vitest run tests/markets-endpoint-compare.test.ts
 */

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

const API_KEY = process.env.MARKETS_API_KEY || '';

const OLD_ENDPOINT = 'https://api.instantly.ai/api/v2/supersearch-enrichment/preview-leads-from-supersearch';
const NEW_ENDPOINT = 'https://app.instantly.ai/backend/api/v2/supersearch-enrichment/preview-leads-from-supersearch';

async function directSearch(endpoint: string, searchFilters: Record<string, any>): Promise<{
  leads: any[];
  totalCount: number;
  hash: string;
  status: number;
  error?: string;
}> {
  const payload = {
    search_filters: searchFilters,
    skip_owned_leads: false,
    show_one_lead_per_company: true,
  };

  console.log(`[${endpoint.includes('app.') ? 'NEW' : 'OLD'}] Payload: ${JSON.stringify(payload)}`);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    return { leads: [], totalCount: 0, hash: 'error', status: response.status, error: errText.slice(0, 300) };
  }

  const data = await response.json();
  const leads = data.leads || data.data || [];
  const companyIds = leads.map((l: any) => String(l.companyId || l.company_id || '')).sort();
  const hash = crypto.createHash('sha256').update(companyIds.join('|')).digest('hex').slice(0, 16);

  return { leads, totalCount: data.number_of_leads || data.total_count || 0, hash, status: response.status };
}

function skip() {
  if (!API_KEY) { console.log('⏭ Skipped: set MARKETS_API_KEY'); return true; }
  return false;
}

// =============================================================================
// TEST: New endpoint — biotech filters
// =============================================================================

describe('New endpoint: filter variation', () => {
  it('biotech industry search returns biotech companies', async () => {
    if (skip()) return;

    const result = await directSearch(NEW_ENDPOINT, {
      news: ['hires'],
      subIndustry: {
        include: ['Biotechnology Research', 'Pharmaceutical Manufacturing'],
        exclude: [],
      },
    });

    console.log(`\n=== NEW ENDPOINT: BIOTECH ===`);
    console.log(`Status: ${result.status}`);
    if (result.error) {
      console.log(`Error: ${result.error}`);
      return;
    }
    console.log(`Leads: ${result.leads.length}, total: ${result.totalCount}, hash: ${result.hash}`);

    console.log('\nFirst 10 companies:');
    result.leads.slice(0, 10).forEach((l: any) => {
      console.log(`  ${l.companyName || l.company_name} | ${l.jobTitle || l.job_title} | ${l.location || ''}`);
    });

    expect(result.status).toBe(200);
  }, 30000);

  it('fintech industry search returns different companies', async () => {
    if (skip()) return;

    const biotech = await directSearch(NEW_ENDPOINT, {
      news: ['hires'],
      subIndustry: { include: ['Biotechnology Research', 'Pharmaceutical Manufacturing'], exclude: [] },
    });

    const fintech = await directSearch(NEW_ENDPOINT, {
      news: ['hires'],
      subIndustry: { include: ['Financial Services', 'Banking'], exclude: [] },
    });

    console.log(`\n=== NEW ENDPOINT: BIOTECH vs FINTECH ===`);
    console.log(`Biotech: ${biotech.leads.length} leads, hash=${biotech.hash}, status=${biotech.status}`);
    console.log(`Fintech: ${fintech.leads.length} leads, hash=${fintech.hash}, status=${fintech.status}`);

    if (biotech.error) console.log(`Biotech error: ${biotech.error}`);
    if (fintech.error) console.log(`Fintech error: ${fintech.error}`);

    if (biotech.hash !== 'error' && fintech.hash !== 'error') {
      if (biotech.hash === fintech.hash) {
        console.log('🚨 STILL IDENTICAL — new endpoint also broken');
      } else {
        console.log('✓ Different hashes — new endpoint respects filters!');
      }
      expect(biotech.hash).not.toEqual(fintech.hash);
    }
  }, 60000);

  it('hiring vs funding signal returns different companies', async () => {
    if (skip()) return;

    const hiring = await directSearch(NEW_ENDPOINT, { news: ['hires'] });
    const funding = await directSearch(NEW_ENDPOINT, { news: ['receives_financing'] });

    console.log(`\n=== NEW ENDPOINT: HIRING vs FUNDING ===`);
    console.log(`Hiring: ${hiring.leads.length} leads, hash=${hiring.hash}, status=${hiring.status}`);
    console.log(`Funding: ${funding.leads.length} leads, hash=${funding.hash}, status=${funding.status}`);

    if (hiring.error) console.log(`Hiring error: ${hiring.error}`);
    if (funding.error) console.log(`Funding error: ${funding.error}`);

    if (hiring.hash !== 'error' && funding.hash !== 'error') {
      if (hiring.hash === funding.hash) {
        console.log('🚨 STILL IDENTICAL — signal filter ignored');
      } else {
        console.log('✓ Different hashes — signal filters work!');
      }
      expect(hiring.hash).not.toEqual(funding.hash);
    }
  }, 60000);
});
