/**
 * IntroAI V2 — Live prompt test across 4 niches
 *
 * Calls Azure GPT-4o. Validates:
 * - Banned words never appear
 * - Structure matches required pattern
 * - No hedging, no editorializing, no advocacy
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
const azureConfig: IntroAIConfig = {
  provider: 'azure',
  apiKey: process.env.AZURE_OPENAI_KEY || '',
  azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT || 'https://outreachking.openai.azure.com',
  azureDeployment: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o',
};

// ---------------------------------------------------------------------------
// Banned words — union of all 3 prompt ban lists
// ---------------------------------------------------------------------------
const BANNED = [
  'probably', 'might', 'sounds like', 'would guess', 'seems like',
  'could be', 'may be', 'possibly', 'likely', 'perhaps', 'guessing',
  'exploring', 'BD partnerships', 'partnerships', 'pipeline',
  'systematic', 'repeatable', 'fuel', 'deploy', 'specialize',
  'specializes', 'strategic', 'effectively', 'efficiently',
  'seamlessly', 'holistically', 'aggressively', 'perfect fit',
  'ideal opportunity', 'significant revenue', 'got a few others',
  'others in that space', 'needs', 'requires', 'expertise',
  'aligns', 'alignment', 'deep experience', 'helps', 'helping',
  'address', 'addressing', 'solution', 'solutions', 'works in',
  'could help', 'worth connecting',
];

function checkBanned(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED.filter(w => lower.includes(w.toLowerCase()));
}

// ---------------------------------------------------------------------------
// 4 niches — niche-agnostic system
// ---------------------------------------------------------------------------

interface TestCase {
  name: string;
  demand: DemandRecord;
  supply: SupplyRecord;
  edge: Edge;
}

const CASES: TestCase[] = [
  {
    name: 'Pharma — Phase 3 trial recruiting',
    demand: {
      domain: 'chiesigroup.com',
      company: 'CHIESI FARMACEUTICI S.P.A.',
      contact: 'Mario Maruzzi',
      email: 'm.maruzzi@chiesigroup.com',
      title: '',
      industry: '',
      signals: [],
      metadata: {
        companyDescription: 'Phase 3 clinical trial to evaluate Oleogel-S10 gel for skin wounds from inherited epidermolysis bullosa (JEB/DEB) in the Japanese population. Multicenter, randomized study with 2 parts.',
      },
    },
    supply: {
      domain: 'psi-cro.com',
      company: 'Psi Cro',
      contact: 'Alex Houlbrook',
      email: 'alex.houlbrook@psi-cro.com',
      title: 'Director',
      capability: 'clinical trial operations for biotech companies',
      targetProfile: '',
      metadata: {},
    },
    edge: { type: 'MATCH_QUALITY', evidence: 'Phase 3 trial recruiting', confidence: 0.85 },
  },
  {
    name: 'SaaS — Series B scaling',
    demand: {
      domain: 'dataloop.ai',
      company: 'Dataloop AI',
      contact: 'Eran Shlomo',
      email: 'eran@dataloop.ai',
      title: 'CEO',
      industry: 'AI/ML',
      signals: [],
      metadata: {
        companyDescription: 'AI data management platform for unstructured data. Raised $33M Series B. Expanding enterprise sales team from 12 to 40 reps.',
        fundingUsd: 33000000,
        employeeEnum: '51-200',
      },
    },
    supply: {
      domain: 'revenueaccelerators.com',
      company: 'Revenue Accelerators',
      contact: 'Jake Morrison',
      email: 'jake@revenueaccelerators.com',
      title: 'Managing Partner',
      capability: 'enterprise sales hiring for post-Series B SaaS companies',
      targetProfile: '',
      metadata: {},
    },
    edge: { type: 'MATCH_QUALITY', evidence: 'Hiring: VP Sales, 8 Account Executives', confidence: 0.9 },
  },
  {
    name: 'Wealth — RIA crossing AUM threshold',
    demand: {
      domain: 'founderwealthadvisory.com',
      company: 'Founder Wealth Advisory',
      contact: 'David Chen',
      email: 'david@founderwealthadvisory.com',
      title: 'Managing Partner',
      industry: 'Financial Services',
      signals: [],
      metadata: {
        companyDescription: 'Registered Investment Advisory firm serving tech founders and startup executives. $1.1B AUM. 20 advisors across 3 offices.',
        employeeEnum: '11-50',
      },
    },
    supply: {
      domain: 'founderintros.com',
      company: 'Founder Intros',
      contact: 'Sarah Lin',
      email: 'sarah@founderintros.com',
      title: 'Founder',
      capability: 'warm introductions to HNW tech founders from the VC ecosystem',
      targetProfile: '',
      metadata: {},
    },
    edge: { type: 'MATCH_QUALITY', evidence: 'Crossed $1B AUM, adding advisors', confidence: 0.8 },
  },
  {
    name: 'Manufacturing — capacity expansion',
    demand: {
      domain: 'precisionaerospace.com',
      company: 'Precision Aerospace Components',
      contact: 'Tom Wheeler',
      email: 'tom@precisionaerospace.com',
      title: 'Operations Director',
      industry: 'Aerospace',
      signals: [],
      metadata: {
        companyDescription: 'AS9100-certified precision machining for aerospace and defense. 72 employees. Just completed $4.2M facility expansion adding 50% CNC capacity.',
        employeeEnum: '51-200',
      },
    },
    supply: {
      domain: 'aerosupplypartners.com',
      company: 'Aero Supply Partners',
      contact: 'Michael Torres',
      email: 'michael@aerosupplypartners.com',
      title: 'VP Business Development',
      capability: 'procurement introductions to tier 1 aerospace OEMs',
      targetProfile: '',
      metadata: {},
    },
    edge: { type: 'MATCH_QUALITY', evidence: 'Expanded CNC capacity 50%, hiring machinists', confidence: 0.88 },
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IntroAI V2 — Live prompt tests', () => {
  for (const tc of CASES) {
    describe(tc.name, () => {
      let demandIntro = '';
      let supplyIntro = '';

      it('generates without error', async () => {
        const result = await generateIntrosAI(azureConfig, tc.demand, tc.supply, tc.edge);
        demandIntro = result.demandIntro;
        supplyIntro = result.supplyIntro;
        expect(demandIntro).toBeTruthy();
        expect(supplyIntro).toBeTruthy();
        console.log(`\n--- ${tc.name} ---`);
        console.log('DEMAND:', demandIntro);
        console.log('SUPPLY:', supplyIntro);
      }, 60_000);

      it('demand intro — zero banned words', () => {
        const violations = checkBanned(demandIntro);
        if (violations.length) console.error('DEMAND BANNED:', violations, '\n', demandIntro);
        expect(violations).toEqual([]);
      });

      it('supply intro — zero banned words', () => {
        const violations = checkBanned(supplyIntro);
        if (violations.length) console.error('SUPPLY BANNED:', violations, '\n', supplyIntro);
        expect(violations).toEqual([]);
      });

      it('demand intro — 30-90 words', () => {
        const count = demandIntro.split(/\s+/).length;
        expect(count).toBeGreaterThanOrEqual(30);
        expect(count).toBeLessThanOrEqual(90);
      });

      it('supply intro — 30-100 words', () => {
        const count = supplyIntro.split(/\s+/).length;
        expect(count).toBeGreaterThanOrEqual(30);
        expect(count).toBeLessThanOrEqual(100);
      });

      it('demand intro — mentions demand company', () => {
        const name = tc.demand.company
          .replace(/,?\s*(llc|inc\.?|corp\.?|ltd\.?|co\.?|s\.p\.a\.?|l\.p\.)\s*$/i, '')
          .trim().split(/\s+/)[0].replace(/[^a-zA-Z]/g, '');
        expect(demandIntro.toLowerCase()).toContain(name.toLowerCase());
      });

      it('supply intro — mentions demand company', () => {
        const name = tc.demand.company
          .replace(/,?\s*(llc|inc\.?|corp\.?|ltd\.?|co\.?|s\.p\.a\.?|l\.p\.)\s*$/i, '')
          .trim().split(/\s+/)[0].replace(/[^a-zA-Z]/g, '');
        expect(supplyIntro.toLowerCase()).toContain(name.toLowerCase());
      });

      it('supply intro — neutral close, not "worth connecting"', () => {
        const lower = supplyIntro.toLowerCase().trim();
        expect(lower).not.toContain('worth connecting');
        expect(lower).toMatch(/let me know/);
      });
    });
  }
});
