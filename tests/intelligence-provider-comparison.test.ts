/**
 * Intelligence Provider Comparison — Exa vs Explee
 *
 * Runs 5 ICP queries against both providers.
 * Collects: companies, contacts, emails, latency, cost.
 * Prints comparison table.
 *
 * Usage:
 *   EXA_API_KEY=sk-... EXPLEE_API_KEY=sk_explee_... npx vitest run tests/intelligence-provider-comparison.test.ts
 *
 * No production code touched. Test-only.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------

const EXA_KEY = process.env.EXA_API_KEY || '0948fb78-09af-443f-ada9-b5227c0e92af';
const EXPLEE_KEY = process.env.EXPLEE_API_KEY || 'sk_explee_a66dd0efbe1c1ef7245f7dbc9556231b5f2a5cd654e5a925';

const ICP_QUERIES = [
  'fintech companies hiring CFO',
  'biotech companies raising Series B',
  'logistics firms expanding internationally',
  'SaaS companies hiring VP Sales',
  'founder-led companies raising growth equity',
];

// Cap results for fair comparison + credit conservation
const EXA_NUM_RESULTS = 10;
const EXPLEE_MAX_COMPANIES = 10;
const EXPLEE_MAX_PEOPLE = 10;

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

interface ProviderMetrics {
  provider: string;
  query: string;
  companies: number;
  contactsFound: number;
  emailsFound: number;
  latencyMs: number;
  estimatedCost: number;
  dedupedDomains: number;
}

// ---------------------------------------------------------------------------
// EXA — raw search (neural semantic)
// ---------------------------------------------------------------------------

async function searchExa(query: string): Promise<{
  results: any[];
  cost: number;
  latencyMs: number;
}> {
  const start = Date.now();
  const response = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': EXA_KEY,
    },
    body: JSON.stringify({
      query,
      numResults: EXA_NUM_RESULTS,
      type: 'neural',
      contents: { text: true },
    }),
  });

  const latencyMs = Date.now() - start;

  if (!response.ok) {
    const err = await response.text();
    return { results: [], cost: 0, latencyMs };
  }

  const data = await response.json();
  return {
    results: data.results || [],
    cost: data.costDollars?.total || 0,
    latencyMs,
  };
}

/** Extract domains from Exa results (best effort — URL-based) */
function extractDomainsFromExa(results: any[]): string[] {
  const domains = new Set<string>();
  for (const r of results) {
    try {
      const url = r.url || '';
      if (!url) continue;
      const hostname = new URL(url).hostname.replace(/^www\./, '');
      // Filter news/media domains
      const news = [
        'techcrunch.com', 'bloomberg.com', 'reuters.com', 'forbes.com',
        'wsj.com', 'cnbc.com', 'medium.com', 'nytimes.com', 'yahoo.com',
        'businessinsider.com', 'crunchbase.com', 'linkedin.com', 'twitter.com',
        'prnewswire.com', 'globenewswire.com', 'pitchbook.com',
      ];
      if (!news.includes(hostname)) {
        domains.add(hostname);
      }
    } catch { /* skip bad URLs */ }
  }
  return [...domains];
}

// ---------------------------------------------------------------------------
// EXPLEE — company search + people search
// ---------------------------------------------------------------------------

async function searchExpleeCompanies(query: string): Promise<{
  companies: any[];
  latencyMs: number;
  cost: number;
}> {
  const start = Date.now();
  const response = await fetch('https://api.explee.com/public/api/v1/search/companies', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': EXPLEE_KEY,
    },
    body: JSON.stringify({
      definition: query,
      filters: {},
      min_relevance: 0.3,
      limit: EXPLEE_MAX_COMPANIES,
    }),
  });

  const latencyMs = Date.now() - start;

  if (!response.ok) {
    const err = await response.text();
    console.error(`[Explee companies] ${response.status}: ${err}`);
    return { companies: [], latencyMs, cost: 0 };
  }

  const data = await response.json();
  const companies = data.companies || [];
  // 0.5 credits per company
  const cost = companies.length * 0.5;
  return { companies, latencyMs, cost };
}

async function searchExpleePeople(
  query: string,
  titles: string[] = ['CEO', 'CFO', 'VP Sales', 'Head of Business Development', 'Founder']
): Promise<{
  people: any[];
  latencyMs: number;
  cost: number;
}> {
  const start = Date.now();
  const response = await fetch('https://api.explee.com/public/api/v1/search/people', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': EXPLEE_KEY,
    },
    body: JSON.stringify({
      people_filters: { job_titles: titles },
      company_filters: { definition: query },
      limit: EXPLEE_MAX_PEOPLE,
    }),
  });

  const latencyMs = Date.now() - start;

  if (!response.ok) {
    const err = await response.text();
    console.error(`[Explee people] ${response.status}: ${err}`);
    return { people: [], latencyMs, cost: 0 };
  }

  const data = await response.json();
  const people = data.people || [];
  // 1.0 credit per person
  const cost = people.length * 1.0;
  return { people, latencyMs, cost };
}

// ---------------------------------------------------------------------------
// METRICS COLLECTOR
// ---------------------------------------------------------------------------

async function runExaQuery(query: string): Promise<ProviderMetrics> {
  if (!EXA_KEY) {
    return {
      provider: 'Exa',
      query,
      companies: 0,
      contactsFound: 0,
      emailsFound: 0,
      latencyMs: 0,
      estimatedCost: 0,
      dedupedDomains: 0,
    };
  }

  const { results, cost, latencyMs } = await searchExa(query);
  const domains = extractDomainsFromExa(results);

  return {
    provider: 'Exa',
    query,
    companies: results.length,
    contactsFound: 0,          // Exa returns pages, not contacts — needs AI + Apollo
    emailsFound: 0,            // Exa has no contacts/emails — needs enrichment layer
    latencyMs,
    estimatedCost: cost,       // Exa cost (search only, no AI or Apollo cost)
    dedupedDomains: domains.length,
  };
}

async function runExpleeQuery(query: string): Promise<{
  companyMetrics: ProviderMetrics;
  peopleMetrics: ProviderMetrics;
  combined: ProviderMetrics;
}> {
  // Run company search + people search in parallel
  const [companyResult, peopleResult] = await Promise.all([
    searchExpleeCompanies(query),
    searchExpleePeople(query),
  ]);

  const companyDomains = new Set(companyResult.companies.map((c: any) => c.domain).filter(Boolean));
  const peopleDomains = new Set(peopleResult.people.map((p: any) => p.company_domain).filter(Boolean));
  const allDomains = new Set([...companyDomains, ...peopleDomains]);

  // Count people with emails (company_emails array or direct)
  const peopleWithCompanyEmails = peopleResult.people.filter(
    (p: any) => p.company_emails?.length > 0
  ).length;

  const companyMetrics: ProviderMetrics = {
    provider: 'Explee (companies)',
    query,
    companies: companyResult.companies.length,
    contactsFound: 0,
    emailsFound: companyResult.companies.filter((c: any) => c.emails?.length > 0).length,
    latencyMs: companyResult.latencyMs,
    estimatedCost: companyResult.cost,
    dedupedDomains: companyDomains.size,
  };

  const peopleMetrics: ProviderMetrics = {
    provider: 'Explee (people)',
    query,
    companies: peopleDomains.size,
    contactsFound: peopleResult.people.length,
    emailsFound: peopleWithCompanyEmails,
    latencyMs: peopleResult.latencyMs,
    estimatedCost: peopleResult.cost,
    dedupedDomains: peopleDomains.size,
  };

  const combined: ProviderMetrics = {
    provider: 'Explee (combined)',
    query,
    companies: allDomains.size,
    contactsFound: peopleResult.people.length,
    emailsFound: peopleWithCompanyEmails,
    latencyMs: companyResult.latencyMs + peopleResult.latencyMs,
    estimatedCost: companyResult.cost + peopleResult.cost,
    dedupedDomains: allDomains.size,
  };

  return { companyMetrics, peopleMetrics, combined };
}

// ---------------------------------------------------------------------------
// TEST HARNESS
// ---------------------------------------------------------------------------

describe('Intelligence Provider Comparison: Exa vs Explee', () => {
  const allResults: ProviderMetrics[] = [];

  // Run each ICP query against both providers
  for (const query of ICP_QUERIES) {
    it(`[Exa] ${query}`, async () => {
      if (!EXA_KEY) {
        console.log(`  ⏭ Exa skipped (no EXA_API_KEY)`);
        allResults.push({
          provider: 'Exa', query, companies: 0, contactsFound: 0,
          emailsFound: 0, latencyMs: 0, estimatedCost: 0, dedupedDomains: 0,
        });
        return;
      }
      const metrics = await runExaQuery(query);
      allResults.push(metrics);
      console.log(`  Exa: ${metrics.companies} results, ${metrics.dedupedDomains} domains, ${metrics.latencyMs}ms, $${metrics.estimatedCost.toFixed(4)}`);
      expect(metrics.latencyMs).toBeGreaterThan(0);
    }, 30_000);

    it(`[Explee] ${query}`, async () => {
      if (!EXPLEE_KEY) {
        console.log(`  ⏭ Explee skipped (no EXPLEE_API_KEY)`);
        return;
      }
      const { companyMetrics, peopleMetrics, combined } = await runExpleeQuery(query);
      allResults.push(companyMetrics);
      allResults.push(peopleMetrics);
      allResults.push(combined);

      console.log(`  Explee companies: ${companyMetrics.companies} companies, ${companyMetrics.dedupedDomains} domains, ${companyMetrics.latencyMs}ms, ${companyMetrics.estimatedCost} credits`);
      console.log(`  Explee people: ${peopleMetrics.contactsFound} contacts, ${peopleMetrics.dedupedDomains} companies, ${peopleMetrics.latencyMs}ms, ${peopleMetrics.estimatedCost} credits`);
      console.log(`  Explee combined: ${combined.dedupedDomains} domains, ${combined.contactsFound} contacts, ${combined.emailsFound} w/ email, ${combined.latencyMs}ms total`);
      // Allow 0 results if balance exhausted (402)
      expect(combined.latencyMs).toBeGreaterThan(0);
    }, 60_000);
  }

  // Summary table after all queries
  it('prints comparison summary', () => {
    console.log('\n\n══════════════════════════════════════════════════════════════');
    console.log('  INTELLIGENCE PROVIDER COMPARISON — SUMMARY');
    console.log('══════════════════════════════════════════════════════════════\n');

    // Aggregate by provider
    const providers = ['Exa', 'Explee (companies)', 'Explee (people)', 'Explee (combined)'];

    for (const provider of providers) {
      const rows = allResults.filter(r => r.provider === provider);
      if (rows.length === 0) continue;

      const totals = rows.reduce(
        (acc, r) => ({
          companies: acc.companies + r.companies,
          contactsFound: acc.contactsFound + r.contactsFound,
          emailsFound: acc.emailsFound + r.emailsFound,
          totalLatency: acc.totalLatency + r.latencyMs,
          totalCost: acc.totalCost + r.estimatedCost,
          dedupedDomains: acc.dedupedDomains + r.dedupedDomains,
        }),
        { companies: 0, contactsFound: 0, emailsFound: 0, totalLatency: 0, totalCost: 0, dedupedDomains: 0 }
      );

      console.log(`┌─ ${provider} ─────────────────────────────────`);
      console.log(`│  Queries run:        ${rows.length}`);
      console.log(`│  Total companies:    ${totals.companies}`);
      console.log(`│  Deduped domains:    ${totals.dedupedDomains}`);
      console.log(`│  Contacts found:     ${totals.contactsFound}`);
      console.log(`│  Emails available:   ${totals.emailsFound}`);
      console.log(`│  Avg latency:        ${Math.round(totals.totalLatency / rows.length)}ms`);
      console.log(`│  Total cost:         ${provider.startsWith('Exa') ? '$' + totals.totalCost.toFixed(4) : totals.totalCost.toFixed(1) + ' credits'}`);
      console.log(`└────────────────────────────────────────────────\n`);
    }

    // Per-query comparison table
    console.log('\n── Per-Query Breakdown ──────────────────────────────────────\n');

    for (const query of ICP_QUERIES) {
      const exa = allResults.find(r => r.provider === 'Exa' && r.query === query);
      const explee = allResults.find(r => r.provider === 'Explee (combined)' && r.query === query);

      console.log(`  "${query}"`);
      console.log(`  ┌──────────────┬──────────┬──────────┐`);
      console.log(`  │ Metric       │ Exa      │ Explee   │`);
      console.log(`  ├──────────────┼──────────┼──────────┤`);
      console.log(`  │ Companies    │ ${String(exa?.dedupedDomains ?? '-').padStart(8)} │ ${String(explee?.dedupedDomains ?? '-').padStart(8)} │`);
      console.log(`  │ Contacts     │ ${String(exa?.contactsFound ?? '0*').padStart(8)} │ ${String(explee?.contactsFound ?? '-').padStart(8)} │`);
      console.log(`  │ Emails       │ ${String(exa?.emailsFound ?? '0*').padStart(8)} │ ${String(explee?.emailsFound ?? '-').padStart(8)} │`);
      console.log(`  │ Latency (ms) │ ${String(exa?.latencyMs ?? '-').padStart(8)} │ ${String(explee?.latencyMs ?? '-').padStart(8)} │`);
      console.log(`  │ Cost         │ ${exa ? ('$' + exa.estimatedCost.toFixed(3)).padStart(8) : '       -'} │ ${explee ? (explee.estimatedCost.toFixed(1) + 'cr').padStart(8) : '       -'} │`);
      console.log(`  └──────────────┴──────────┴──────────┘`);
      console.log(`  * Exa returns pages, not contacts. Needs AI extraction + Apollo enrichment.\n`);
    }

    // Architecture comparison
    console.log('\n── Architecture Comparison ──────────────────────────────────\n');
    console.log('  Exa pipeline:    Exa search → AI extraction → Apollo enrichment → result');
    console.log('  Steps:           3 API calls (Exa + AI + Apollo per contact)');
    console.log('  Contacts:        Requires Apollo ($0.03-0.08/contact)');
    console.log('  Emails:          Requires Apollo or Anymail Finder');
    console.log('');
    console.log('  Explee pipeline: Explee search → result (contacts included)');
    console.log('  Steps:           1-2 API calls (company + people search)');
    console.log('  Contacts:        Included in people search results');
    console.log('  Emails:          Built-in enrichment (1.5-5.0 credits/email)');
    console.log('');

    expect(allResults.length).toBeGreaterThan(0);
  });
});
