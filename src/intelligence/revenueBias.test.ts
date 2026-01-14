/**
 * Revenue Bias Engine Tests
 *
 * Regression + Money + Trust tests as specified.
 */

import { describe, it, expect } from 'vitest';
import {
  deriveRoleCluster,
  recommendCounterpartyForRevenue,
  type DemandDatasetSignals,
  type RoleCluster,
  type CounterpartyIntent,
} from './revenueBias';

// Banned time-claim tokens
const BANNED_TOKENS = ['recent', 'currently', 'now', 'active', 'momentum', 'today', 'this week'];

function containsBannedTokens(text: string): boolean {
  const lower = text.toLowerCase();
  return BANNED_TOKENS.some(t => lower.includes(t));
}

describe('Revenue Bias Engine', () => {
  describe('deriveRoleCluster', () => {
    it('1) Software engineer list -> roleCluster=builders', () => {
      const titles = [
        'Software Engineer',
        'Senior Backend Developer',
        'ML Engineer',
        'DevOps Engineer',
        'Frontend Developer',
        'Data Engineer',
        'Platform Engineer',
        'SRE',
      ];
      const result = deriveRoleCluster(titles);
      expect(result.cluster).toBe('builders');
    });

    it('2) Recruiter list -> roleCluster=hiring', () => {
      const titles = [
        'Recruiter',
        'Talent Acquisition Manager',
        'HR Director',
        'Head of People',
        'Sourcer',
        'Recruiting Coordinator',
        'Talent Partner',
        'People Ops Manager',
      ];
      const result = deriveRoleCluster(titles);
      expect(result.cluster).toBe('hiring');
    });

    it('3) Ops/logistics titles -> roleCluster=ops', () => {
      const titles = [
        'Operations Manager',
        'Supply Chain Director',
        'Logistics Coordinator',
        'Procurement Lead',
        'Warehouse Manager',
        'Fleet Manager',
        'COO',
        'Transport Coordinator',
      ];
      const result = deriveRoleCluster(titles);
      expect(result.cluster).toBe('ops');
    });

    it('4) Security titles -> roleCluster=security', () => {
      const titles = [
        'CISO',
        'Security Engineer',
        'SecOps Manager',
        'Compliance Officer',
        'Risk Manager',
        'InfoSec Analyst',
        'SOC 2 Lead',
        'Security Architect',
      ];
      const result = deriveRoleCluster(titles);
      expect(result.cluster).toBe('security');
    });

    it('5) CFO/finance titles -> roleCluster=finance', () => {
      const titles = [
        'CFO',
        'Finance Director',
        'Controller',
        'FP&A Manager',
        'Treasury Analyst',
        'Accounting Manager',
        'Finance Lead',
        'Bookkeeper',
      ];
      const result = deriveRoleCluster(titles);
      expect(result.cluster).toBe('finance');
    });

    it('6) Partnerships/BD titles -> roleCluster=partnerships', () => {
      const titles = [
        'Business Development Manager',
        'Partnerships Lead',
        'Corporate Development',
        'Strategic Partnerships',
        'Alliances Manager',
        'BD Director',
        'Licensing Manager',
        'Partner Manager',
      ];
      const result = deriveRoleCluster(titles);
      expect(result.cluster).toBe('partnerships');
    });

    it('7) Founder/CEO titles -> roleCluster=founders_exec', () => {
      const titles = [
        'Founder',
        'Co-Founder',
        'CEO',
        'President',
        'Managing Partner',
        'General Manager',
        'Owner',
        'Founder & CEO',
      ];
      const result = deriveRoleCluster(titles);
      expect(result.cluster).toBe('founders_exec');
    });

    it('8) Unknown/mixed titles -> roleCluster=unknown or low confidence', () => {
      const titles = [
        'Consultant',
        'Advisor',
        'Specialist',
        'Analyst',
      ];
      const result = deriveRoleCluster(titles);
      // Either unknown or low confidence
      expect(result.confidence).toBe('low');
    });

    it('9) Confidence high when many matches', () => {
      const titles = Array(20).fill('Software Engineer');
      const result = deriveRoleCluster(titles);
      expect(result.confidence).toBe('high');
      expect(result.cluster).toBe('builders');
    });

    it('10) Confidence low when few matches', () => {
      const titles = ['Engineer', 'Random Title'];
      const result = deriveRoleCluster(titles);
      expect(result.confidence).toBe('low');
    });
  });

  describe('recommendCounterpartyForRevenue', () => {
    const makeSignals = (titles: string[], industries: string[] = [], keywords: string[] = []): DemandDatasetSignals => ({
      roleTitleSamples: titles,
      companyIndustrySamples: industries,
      companyKeywordSamples: keywords,
    });

    it('11) builders -> agencies_dev tier A', () => {
      const signals = makeSignals(['Software Engineer', 'Developer', 'CTO', 'Architect']);
      const result = recommendCounterpartyForRevenue('builders', signals, 'b2b', 'partners');
      expect(result.recommendedIntent).toBe('agencies_dev');
      expect(result.tier).toBe('A');
    });

    it('12) hiring -> recruiting tier A', () => {
      const signals = makeSignals(['Recruiter', 'Talent Manager', 'HR Director']);
      const result = recommendCounterpartyForRevenue('hiring', signals, 'b2b', 'partners');
      expect(result.recommendedIntent).toBe('recruiting');
      expect(result.tier).toBe('A');
    });

    it('13) ops -> logistics tier A', () => {
      const signals = makeSignals(['Operations Manager', 'Supply Chain', 'Logistics']);
      const result = recommendCounterpartyForRevenue('ops', signals, 'b2b', 'partners');
      expect(result.recommendedIntent).toBe('logistics');
      expect(result.tier).toBe('A');
    });

    it('14) security -> it_msp tier A', () => {
      const signals = makeSignals(['CISO', 'Security Engineer', 'SecOps']);
      const result = recommendCounterpartyForRevenue('security', signals, 'b2b', 'partners');
      expect(result.recommendedIntent).toBe('it_msp');
      expect(result.tier).toBe('A');
    });

    it('15) finance -> finance_cfo tier A', () => {
      const signals = makeSignals(['CFO', 'Controller', 'FP&A']);
      const result = recommendCounterpartyForRevenue('finance', signals, 'b2b', 'partners');
      expect(result.recommendedIntent).toBe('finance_cfo');
      expect(result.tier).toBe('A');
    });

    it('16) partnerships + biotech evidence -> can include biotech_licensing', () => {
      const signals = makeSignals(
        ['Head of Licensing', 'Corporate Development', 'VP Licensing'],
        ['Biotechnology', 'Pharmaceuticals'],
        ['licensing', 'clinical', 'pipeline']
      );
      const result = recommendCounterpartyForRevenue('partnerships', signals, 'biotech', 'partners');
      // Should have partners A, biotech_licensing B
      expect(result.recommendedIntent).toBe('partners');
      const hasBiotech = result.alternates.some(a => a.intent === 'biotech_licensing');
      expect(hasBiotech).toBe(true);
    });

    it('17) Non-biotech engineering list must NEVER output biotech_licensing', () => {
      const signals = makeSignals(
        ['Software Engineer', 'Developer', 'CTO'],
        ['Software', 'Technology'],
        ['saas', 'platform']
      );
      const result = recommendCounterpartyForRevenue('builders', signals, 'b2b', 'partners');
      expect(result.recommendedIntent).not.toBe('biotech_licensing');
      const hasBiotech = result.alternates.some(a => a.intent === 'biotech_licensing');
      expect(hasBiotech).toBe(false);
    });

    it('18) unknown -> uses defaultIntent', () => {
      const signals = makeSignals(['Consultant', 'Advisor']);
      const result = recommendCounterpartyForRevenue('unknown', signals, null, 'recruiting');
      expect(result.recommendedIntent).toBe('recruiting');
    });

    it('19) founders_exec -> agencies_dev tier A', () => {
      const signals = makeSignals(['Founder', 'CEO', 'Co-Founder']);
      const result = recommendCounterpartyForRevenue('founders_exec', signals, 'b2b', 'partners');
      expect(result.recommendedIntent).toBe('agencies_dev');
      expect(result.tier).toBe('A');
    });

    it('20) growth -> agencies_growth tier A', () => {
      const signals = makeSignals(['Marketing Manager', 'Growth Lead', 'Demand Gen']);
      const result = recommendCounterpartyForRevenue('growth', signals, 'b2b', 'partners');
      expect(result.recommendedIntent).toBe('agencies_growth');
      expect(result.tier).toBe('A');
    });

    it('21) No time-claim tokens in any why strings', () => {
      const clusters: RoleCluster[] = ['builders', 'hiring', 'growth', 'ops', 'security', 'finance', 'partnerships', 'founders_exec', 'unknown'];

      for (const cluster of clusters) {
        const signals = makeSignals(['Test Title']);
        const result = recommendCounterpartyForRevenue(cluster, signals, 'b2b', 'partners');

        // Check main why
        for (const bullet of result.why) {
          expect(containsBannedTokens(bullet)).toBe(false);
        }

        // Check alternates why
        for (const alt of result.alternates) {
          for (const bullet of alt.why) {
            expect(containsBannedTokens(bullet)).toBe(false);
          }
        }
      }
    });

    it('22) Always returns 2 alternates', () => {
      const signals = makeSignals(['Software Engineer']);
      const result = recommendCounterpartyForRevenue('builders', signals, 'b2b', 'partners');
      expect(result.alternates.length).toBe(2);
    });

    it('23) Biotech guard requires 2+ evidence pieces', () => {
      // Only 1 evidence (industry) - should NOT allow biotech_licensing
      const signals1 = makeSignals(
        ['Business Development'],
        ['Biotechnology'],
        [] // no keywords
      );
      const result1 = recommendCounterpartyForRevenue('partnerships', signals1, 'biotech', 'partners');
      const hasBiotech1 = result1.alternates.some(a => a.intent === 'biotech_licensing');
      expect(hasBiotech1).toBe(false);

      // 2+ evidence - should allow biotech_licensing
      const signals2 = makeSignals(
        ['Head of Licensing'],
        ['Biotechnology'],
        ['licensing']
      );
      const result2 = recommendCounterpartyForRevenue('partnerships', signals2, 'biotech', 'partners');
      const hasBiotech2 = result2.alternates.some(a => a.intent === 'biotech_licensing');
      expect(hasBiotech2).toBe(true);
    });
  });
});
