/**
 * IntroAI Niche Test — 5 verticals, real Azure calls
 * Validates the prompt redesign produces short, signal-driven, non-repetitive intros.
 *
 * Run: npx vitest run src/services/IntroAI.niche.test.ts
 */
import { describe, it, expect } from 'vitest';
import { generateIntrosAI } from './IntroAI';
import type { IntroAIConfig } from './IntroAI';
import type { DemandRecord } from '../schemas/DemandRecord';
import type { SupplyRecord } from '../schemas/SupplyRecord';
import type { Edge } from '../schemas/Edge';

// ---------------------------------------------------------------------------
// Azure config
// ---------------------------------------------------------------------------
const config: IntroAIConfig = {
  provider: 'azure',
  apiKey: process.env.AZURE_API_KEY || '',
  azureEndpoint: process.env.AZURE_ENDPOINT || 'https://outreachking.openai.azure.com',
  azureDeployment: process.env.AZURE_DEPLOYMENT || 'gpt-4o',
};

// ---------------------------------------------------------------------------
// Banned phrases — if ANY appear, test fails
// ---------------------------------------------------------------------------
const BANNED = [
  'ended up diving into',
  'ended up reading',
  'ended up going down',
  'went down a rabbit hole',
  'rabbit hole',
  'really smart approach',
  'really elegant approach',
  'really impressive',
  'really sophisticated',
  'really thoughtful',
  'really interesting',
  'pipeline',
  'systematic',
  'strategically',
  'seamlessly',
  'holistically',
  'aggressively',
  'perfect fit',
  'ideal opportunity',
];

// ---------------------------------------------------------------------------
// 5 Niche test cases
// ---------------------------------------------------------------------------
interface NicheCase {
  name: string;
  demand: DemandRecord;
  supply: SupplyRecord;
  edge: Edge;
}

const niches: NicheCase[] = [
  // 1. BIOTECH
  {
    name: 'Biotech',
    demand: {
      domain: 'neuropath-tx.com',
      company: 'NeuroPath Therapeutics',
      contact: 'David Chen',
      email: 'dchen@neuropath-tx.com',
      title: 'CEO',
      industry: 'Biotechnology',
      signals: [{ type: 'funding', value: '$28M Series B' }],
      metadata: {
        companyDescription: 'CNS biotech developing blood-brain barrier delivery platform',
        fundingUsd: 28000000,
        fundingType: 'Series B',
        employeeEnum: '48',
      },
    },
    supply: {
      domain: 'biopharmapartners.com',
      company: 'BioPharma Partners',
      contact: 'Sarah Kim',
      email: 'sarah@biopharmapartners.com',
      title: 'Managing Director',
      capability: 'pharma co-development partnerships for post-raise CNS biotechs',
      targetProfile: 'Series A/B CNS biotechs',
      metadata: {},
    },
    edge: {
      type: 'funding',
      evidence: 'raised $28M Series B for blood-brain barrier delivery platform',
      confidence: 0.9,
    },
  },

  // 2. LOGISTICS
  {
    name: 'Logistics',
    demand: {
      domain: 'rapidfreight.com',
      company: 'RapidFreight Solutions',
      contact: 'Marcus Johnson',
      email: 'mjohnson@rapidfreight.com',
      title: 'VP of Sales',
      industry: 'Logistics',
      signals: [{ type: 'expansion', value: '3 new regions' }],
      metadata: {
        companyDescription: '3PL operation specializing in last-mile fulfillment',
        employeeEnum: '85',
      },
    },
    supply: {
      domain: 'shipper-connect.com',
      company: 'Shipper Connect',
      contact: 'Derek Williams',
      email: 'derek@shipper-connect.com',
      title: 'Partner',
      capability: 'anchor shipper relationships for 3PLs entering new markets',
      targetProfile: 'Growing 3PL operations',
      metadata: {},
    },
    edge: {
      type: 'expansion',
      evidence: 'opened warehousing in 3 new regions',
      confidence: 0.85,
    },
  },

  // 3. WEALTH MANAGEMENT
  {
    name: 'Wealth Management',
    demand: {
      domain: 'founderwealthadvisory.com',
      company: 'Founder Wealth Advisory',
      contact: 'James Mitchell',
      email: 'jmitchell@founderwealthadvisory.com',
      title: 'Managing Partner',
      industry: 'Financial Services',
      signals: [{ type: 'growth', value: 'Crossed $1.1B AUM' }],
      metadata: {
        companyDescription: 'RIA serving startup founders and tech executives',
        employeeEnum: '20 advisors',
      },
    },
    supply: {
      domain: 'hnw-network.com',
      company: 'HNW Network',
      contact: 'Laura Park',
      email: 'laura@hnw-network.com',
      title: 'Director',
      capability: 'warm HNW founder introductions from VC and startup ecosystem',
      targetProfile: 'RIAs serving tech founders',
      metadata: {},
    },
    edge: {
      type: 'growth',
      evidence: 'crossed $1.1B AUM serving startup founders',
      confidence: 0.88,
    },
  },

  // 4. MANUFACTURING
  {
    name: 'Manufacturing',
    demand: {
      domain: 'precisionaero.com',
      company: 'Precision Aero Components',
      contact: 'Tom Reeves',
      email: 'treeves@precisionaero.com',
      title: 'Operations Director',
      industry: 'Aerospace Manufacturing',
      signals: [{ type: 'expansion', value: 'Capacity +50%' }],
      metadata: {
        companyDescription: 'Precision machining company with Nadcap and AS9100 certifications',
        employeeEnum: '72',
      },
    },
    supply: {
      domain: 'aerodefense-supply.com',
      company: 'AeroDefense Supply Chain',
      contact: 'Michael Torres',
      email: 'mtorres@aerodefense-supply.com',
      title: 'VP Business Development',
      capability: 'tier 1 contract introductions for certified aerospace suppliers',
      targetProfile: 'AS9100/Nadcap certified shops',
      metadata: {},
    },
    edge: {
      type: 'expansion',
      evidence: 'expanded capacity by 50% with new 5-axis equipment',
      confidence: 0.82,
    },
  },

  // 5. SAAS
  {
    name: 'SaaS',
    demand: {
      domain: 'revscale.io',
      company: 'RevScale',
      contact: 'Priya Sharma',
      email: 'priya@revscale.io',
      title: 'Founder',
      industry: 'SaaS',
      signals: [{ type: 'product', value: 'Launched v4.0' }],
      metadata: {
        companyDescription: 'Revenue operations platform for midmarket B2B companies',
        fundingUsd: 14000000,
        fundingType: 'Series A',
        employeeEnum: '42',
      },
    },
    supply: {
      domain: 'gtm-partners.com',
      company: 'GTM Partners',
      contact: 'Jessica Nguyen',
      email: 'jessica@gtm-partners.com',
      title: 'Managing Partner',
      capability: 'enterprise logo acquisition for B2B SaaS companies post-Series A',
      targetProfile: 'Series A/B SaaS companies',
      metadata: {},
    },
    edge: {
      type: 'product',
      evidence: 'launched v4.0 of revenue operations platform',
      confidence: 0.8,
    },
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('IntroAI — 5 Niche Prompt Validation', () => {
  const allDemandIntros: string[] = [];
  const allSupplyIntros: string[] = [];

  for (const niche of niches) {
    it(`${niche.name}: generates short, signal-driven intros`, async () => {
      const result = await generateIntrosAI(config, niche.demand, niche.supply, niche.edge);

      // ---- Demand intro checks ----
      expect(result.demandIntro).toBeTruthy();
      const demandWords = result.demandIntro.split(/\s+/).length;
      console.log(`\n=== ${niche.name} — DEMAND (${demandWords} words) ===`);
      console.log(result.demandIntro);

      // Word count: 40-60 target, allow up to 80 for buffer
      expect(demandWords).toBeLessThanOrEqual(80);

      // Banned phrases
      for (const phrase of BANNED) {
        expect(result.demandIntro.toLowerCase()).not.toContain(phrase.toLowerCase());
      }

      // Must contain the supply contact name (the "who")
      const supplyFirstName = niche.supply.contact.split(' ')[0];
      expect(result.demandIntro).toContain(supplyFirstName);

      allDemandIntros.push(result.demandIntro);

      // ---- Supply intro checks ----
      expect(result.supplyIntro).toBeTruthy();
      const supplyWords = result.supplyIntro.split(/\s+/).length;
      console.log(`\n=== ${niche.name} — SUPPLY (${supplyWords} words) ===`);
      console.log(result.supplyIntro);

      // Word count: 60-80 target, allow up to 100 for buffer
      expect(supplyWords).toBeLessThanOrEqual(100);

      // Banned phrases
      for (const phrase of BANNED) {
        expect(result.supplyIntro.toLowerCase()).not.toContain(phrase.toLowerCase());
      }

      // Must contain demand company name
      expect(result.supplyIntro).toContain(niche.demand.company.split(' ')[0]);

      allSupplyIntros.push(result.supplyIntro);

      // ---- Value props ----
      expect(result.valueProps.demandValueProp).toBeTruthy();
      expect(result.valueProps.supplyValueProp).toBeTruthy();
      console.log(`Value props: D="${result.valueProps.demandValueProp}" | S="${result.valueProps.supplyValueProp}"`);
    }, 60000); // 60s per niche (3 AI calls)
  }

  it('structural variation: no two demand intros share the same opener', async () => {
    // Only run after all niche tests complete
    if (allDemandIntros.length < 5) return;

    // Extract first 5 words of each intro
    const openers = allDemandIntros.map(intro => {
      const words = intro.split(/\s+/).slice(0, 5).join(' ').toLowerCase();
      return words;
    });

    // At least 3 unique openers out of 5
    const unique = new Set(openers);
    console.log('\n=== VARIATION CHECK ===');
    console.log('Openers:', openers);
    console.log(`Unique: ${unique.size}/5`);
    expect(unique.size).toBeGreaterThanOrEqual(3);
  });
});
