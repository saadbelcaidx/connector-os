/**
 * Router Integration Test — Apollo people_enrich flow
 *
 * Tests the ID-based enrich flow with real domains from Demo CSVs.
 * Limited to 5 records to conserve API credits.
 *
 * Run: npx vitest run src/enrichment/router.integration.test.ts
 */

import { describe, it, expect } from 'vitest';
import { classifyInputs, routeEnrichment, RouterConfig } from './router';

// Test data from Demand DEMO.csv (5 records)
const DEMAND_DOMAINS = [
  { domain: 'soundviewre.com', company: 'NEWMAN, NICHOLAS DRAKE' },
  { domain: 'pmmgmt.com', company: 'PM MGMT, LP' },
  { domain: 'reflexive.xyz', company: 'REFLEXIVE CAPITAL MANAGEMENT LP' },
  { domain: 'envoyequitypartners.com', company: 'ENVOY EQUITY PARTNERS LP' },
  { domain: 'avantecap.com', company: 'AVANTE CAPITAL PARTNERS LP' },
];

// Test data from Supply DEMO.csv (5 records)
const SUPPLY_DOMAINS = [
  { domain: 'devoeandcompany.com', company: 'DeVoe & Company' },
  { domain: 'echelon-partners.com', company: 'Echelon Partners' },
  { domain: 'skyview.com', company: 'SkyView Partners' },
  { domain: 'parksuttonadvisors.com', company: 'Park Sutton Advisors' },
  { domain: 'fptransitions.com', company: 'FP Transitions' },
];

// Partial name test cases (the bug we're fixing)
const PARTIAL_NAME_CASES = [
  { domain: 'roserock.co', person_name: 'Miles' },
  { domain: 'avantecap.com', person_name: 'Ivelisse' },
  { domain: 'example.com', person_name: 'John' },
];

describe('classifyInputs — partial name handling', () => {
  it('routes single-word names to FIND_COMPANY_CONTACT, not FIND_PERSON', () => {
    for (const testCase of PARTIAL_NAME_CASES) {
      const action = classifyInputs({
        domain: testCase.domain,
        person_name: testCase.person_name,
      });

      expect(action).toBe('FIND_COMPANY_CONTACT');
      console.log(`✓ ${testCase.person_name} @ ${testCase.domain} → ${action}`);
    }
  });

  it('routes full names to FIND_PERSON', () => {
    const fullNameCases = [
      { domain: 'stripe.com', person_name: 'Patrick Collison' },
      { domain: 'apple.com', person_name: 'Tim Cook' },
    ];

    for (const testCase of fullNameCases) {
      const action = classifyInputs({
        domain: testCase.domain,
        person_name: testCase.person_name,
      });

      expect(action).toBe('FIND_PERSON');
      console.log(`✓ ${testCase.person_name} @ ${testCase.domain} → ${action}`);
    }
  });

  it('routes domain-only to FIND_COMPANY_CONTACT', () => {
    for (const testCase of DEMAND_DOMAINS) {
      const action = classifyInputs({
        domain: testCase.domain,
      });

      expect(action).toBe('FIND_COMPANY_CONTACT');
    }
  });
});

// Integration tests against real APIs (only run if API keys provided)
const SUPABASE_URL = 'https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1';
const ANYMAIL_API_KEY = process.env.ANYMAIL_API_KEY || '';
const APOLLO_API_KEY = process.env.APOLLO_API_KEY || '';

describe.skipIf(!APOLLO_API_KEY)('Apollo people_enrich integration', () => {
  const config: RouterConfig = {
    supabaseFunctionsUrl: SUPABASE_URL,
    apolloApiKey: APOLLO_API_KEY,
    anymailApiKey: ANYMAIL_API_KEY,
    timeoutMs: 30000,
  };

  it('finds decision maker at demand domain using ID-based enrich', async () => {
    // Test with ONE domain to conserve credits
    const testDomain = DEMAND_DOMAINS[0];

    console.log(`\n[Test] Finding decision maker at ${testDomain.domain}...`);

    const result = await routeEnrichment({
      domain: testDomain.domain,
    }, config);

    console.log(`[Test] Result:`, {
      action: result.action,
      outcome: result.outcome,
      email: result.email,
      name: `${result.firstName} ${result.lastName}`,
      title: result.title,
      source: result.source,
    });

    expect(result.action).toBe('FIND_COMPANY_CONTACT');
    expect(['ENRICHED', 'NO_CANDIDATES', 'NOT_FOUND']).toContain(result.outcome);
  }, 60000);

  it('handles partial name without 400 error', async () => {
    // The bug case — should NOT hit Anymail find_person with partial name
    const testCase = { domain: 'avantecap.com', person_name: 'Ivelisse' };

    console.log(`\n[Test] Testing partial name: ${testCase.person_name} @ ${testCase.domain}...`);

    const result = await routeEnrichment({
      domain: testCase.domain,
      fullName: testCase.person_name,
    }, config);

    console.log(`[Test] Result:`, {
      action: result.action,
      outcome: result.outcome,
      email: result.email,
      source: result.source,
    });

    // Should be FIND_COMPANY_CONTACT, not FIND_PERSON
    expect(result.action).toBe('FIND_COMPANY_CONTACT');
    // Should NOT error with 400 — should either find or not find
    expect(result.outcome).not.toBe('ERROR');
  }, 60000);
});

describe.skipIf(!ANYMAIL_API_KEY)('Anymail find_decision_maker fallback', () => {
  const config: RouterConfig = {
    supabaseFunctionsUrl: SUPABASE_URL,
    anymailApiKey: ANYMAIL_API_KEY,
    timeoutMs: 30000,
  };

  it('finds decision maker via Anymail when Apollo not configured', async () => {
    const testDomain = SUPPLY_DOMAINS[0];

    console.log(`\n[Test] Finding decision maker at ${testDomain.domain} via Anymail...`);

    const result = await routeEnrichment({
      domain: testDomain.domain,
    }, config);

    console.log(`[Test] Result:`, {
      action: result.action,
      outcome: result.outcome,
      email: result.email,
      name: `${result.firstName} ${result.lastName}`,
      source: result.source,
    });

    expect(result.action).toBe('FIND_COMPANY_CONTACT');
  }, 60000);
});
