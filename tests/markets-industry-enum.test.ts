/**
 * markets-industry-enum.test.ts — Validate all our industry names against the API
 *
 * Tests every subIndustry value from INDUSTRY_GROUPS against the new endpoint.
 * Any 400 = wrong enum value that needs fixing.
 *
 * Run: MARKETS_API_KEY=<key> npx vitest run tests/markets-industry-enum.test.ts
 */

import { describe, it, expect } from 'vitest';

const API_KEY = process.env.MARKETS_API_KEY || '';
const ENDPOINT = 'https://app.instantly.ai/backend/api/v2/supersearch-enrichment/preview-leads-from-supersearch';

// Our current INDUSTRY_GROUPS from PrebuiltIntelligence.tsx
const INDUSTRY_GROUPS: { category: string; subs: string[] }[] = [
  { category: 'Software & Internet', subs: ['Computer & Network Security', 'Computer Software', 'Information Technology and Services', 'Internet'] },
  { category: 'Business Services', subs: ['Business Supplies and Equipment', 'Facilities Services', 'Human Resources', 'Management Consulting', 'Outsourcing/Offshoring', 'Professional Training & Coaching', 'Staffing and Recruiting'] },
  { category: 'Financial Services', subs: ['Accounting', 'Banking', 'Capital Markets', 'Financial Services', 'Insurance', 'Investment Banking', 'Investment Management', 'Venture Capital & Private Equity'] },
  { category: 'Healthcare', subs: ['Alternative Medicine', 'Biotechnology', 'Health, Wellness and Fitness', 'Hospital & Health Care', 'Medical Devices', 'Medical Practice', 'Mental Health Care', 'Pharmaceuticals', 'Veterinary'] },
  { category: 'Manufacturing', subs: ['Automotive', 'Aviation & Aerospace', 'Chemicals', 'Electrical/Electronic Manufacturing', 'Furniture', 'Industrial Automation', 'Machinery', 'Mechanical or Industrial Engineering', 'Plastics', 'Railroad Manufacture', 'Shipbuilding', 'Textiles'] },
  { category: 'Education', subs: ['Education Management', 'E-Learning', 'Higher Education', 'Primary/Secondary Education', 'Research'] },
  { category: 'Media & Communications', subs: ['Broadcast Media', 'Entertainment', 'Media Production', 'Motion Pictures and Film', 'Music', 'Newspapers', 'Online Media', 'Publishing', 'Telecommunications'] },
  { category: 'Consumer Goods', subs: ['Apparel & Fashion', 'Consumer Electronics', 'Consumer Goods', 'Cosmetics', 'Food & Beverages', 'Food Production', 'Luxury Goods & Jewelry', 'Sporting Goods', 'Wine and Spirits'] },
  { category: 'Real Estate & Construction', subs: ['Architecture & Planning', 'Building Materials', 'Civil Engineering', 'Commercial Real Estate', 'Construction', 'Real Estate'] },
  { category: 'Energy & Utilities', subs: ['Electrical/Electronic Manufacturing', 'Mining & Metals', 'Oil & Energy', 'Renewables & Environment', 'Utilities'] },
  { category: 'Government & Nonprofit', subs: ['Civic & Social Organization', 'Government Administration', 'Government Relations', 'International Affairs', 'Nonprofit Organization Management', 'Political Organization', 'Public Policy'] },
  { category: 'Transportation & Logistics', subs: ['Airlines/Aviation', 'Import and Export', 'Logistics and Supply Chain', 'Maritime', 'Package/Freight Delivery', 'Transportation/Trucking/Railroad', 'Warehousing'] },
];

async function testSubIndustry(name: string): Promise<{ status: number; error?: string; count: number }> {
  const payload = {
    search_filters: { subIndustry: { include: [name] } },
    skip_owned_leads: false,
    show_one_lead_per_company: true,
  };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    return { status: res.status, error: err.slice(0, 200), count: 0 };
  }

  const data = await res.json();
  return { status: res.status, count: data.number_of_leads || 0 };
}

describe('Industry enum validation', () => {
  it('test all subIndustry values against API', async () => {
    if (!API_KEY) { console.log('⏭ Skipped'); return; }

    const allSubs = INDUSTRY_GROUPS.flatMap(g => g.subs.map(s => ({ category: g.category, sub: s })));
    // Dedupe (Electrical/Electronic Manufacturing appears twice)
    const unique = [...new Map(allSubs.map(s => [s.sub, s])).values()];

    const valid: string[] = [];
    const invalid: { sub: string; category: string; error: string }[] = [];

    console.log(`\nTesting ${unique.length} subIndustry values...\n`);

    for (const { category, sub } of unique) {
      const result = await testSubIndustry(sub);

      if (result.status === 200) {
        valid.push(sub);
        console.log(`  ✓ ${sub} (${result.count} leads)`);
      } else {
        invalid.push({ sub, category, error: result.error || '' });
        console.log(`  ✗ ${sub} [${category}] — ${result.status}`);
      }

      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 200));
    }

    console.log(`\n=== RESULTS ===`);
    console.log(`Valid: ${valid.length}/${unique.length}`);
    console.log(`Invalid: ${invalid.length}/${unique.length}`);

    if (invalid.length > 0) {
      console.log('\n--- INVALID VALUES (need fixing) ---');
      for (const { sub, category, error } of invalid) {
        console.log(`  "${sub}" [${category}]`);
      }
    }

    // All should be valid
    expect(invalid.length).toBe(0);
  }, 120000);
});
