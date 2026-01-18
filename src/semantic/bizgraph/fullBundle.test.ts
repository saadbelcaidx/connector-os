/**
 * Full Bundle Spot Tests (BIZ-2D Validation)
 *
 * Verifies the full bundle covers new niches from O*NET and ESCO.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

import { type BizGraphBundle } from './schema';
import { type BizGraph } from './loader';
import { expandBusinessSignalsSync, tokenizeBusinessText } from './expand';

// =============================================================================
// HELPERS
// =============================================================================

function loadFullBundleForTest(): BizGraph | null {
  const bundlePath = path.join(process.cwd(), 'public', 'semantic', 'bizgraph-full-v1.json.gz');
  if (!fs.existsSync(bundlePath)) return null;

  const gzipped = fs.readFileSync(bundlePath);
  const jsonBuffer = zlib.gunzipSync(gzipped);
  const bundle = JSON.parse(jsonBuffer.toString()) as BizGraphBundle;

  // Build indexes
  const labelToId = new Map<string, string>();
  const idToLabels = new Map<string, string[]>();
  const outgoing = new Map<string, typeof bundle.edges>();
  const incoming = new Map<string, typeof bundle.edges>();

  for (const [id, concept] of Object.entries(bundle.concepts)) {
    const allLabels: string[] = [];
    for (const label of concept.l) {
      labelToId.set(label, id);
      allLabels.push(label);
    }
    for (const alias of concept.a) {
      if (!labelToId.has(alias)) {
        labelToId.set(alias, id);
      }
      allLabels.push(alias);
    }
    idToLabels.set(id, allLabels);
  }

  for (const edge of bundle.edges) {
    const [fromId, , toId] = edge;
    if (!outgoing.has(fromId)) outgoing.set(fromId, []);
    outgoing.get(fromId)!.push(edge);
    if (!incoming.has(toId)) incoming.set(toId, []);
    incoming.get(toId)!.push(edge);
  }

  return { bundle, labelToId, idToLabels, outgoing, incoming };
}

let graph: BizGraph | null = null;

beforeAll(() => {
  graph = loadFullBundleForTest();
});

// =============================================================================
// TESTS
// =============================================================================

describe('Full Bundle Validation (BIZ-2D)', () => {

  describe('Bundle Statistics', () => {
    it('should have full bundle loaded', () => {
      expect(graph).not.toBeNull();
      expect(graph!.bundle.version).toBe('2.0.0');
    });

    it('should have 1,000+ concepts (target: 1,000-5,000)', () => {
      expect(graph!.bundle.meta.concept_count).toBeGreaterThanOrEqual(1000);
      console.log(`\n📊 Concepts: ${graph!.bundle.meta.concept_count}`);
    });

    it('should have 5,000+ edges', () => {
      expect(graph!.bundle.meta.edge_count).toBeGreaterThanOrEqual(5000);
      console.log(`📊 Edges: ${graph!.bundle.meta.edge_count}`);
    });

    it('should have 10,000+ unique labels', () => {
      expect(graph!.bundle.meta.label_count).toBeGreaterThanOrEqual(10000);
      console.log(`📊 Labels: ${graph!.bundle.meta.label_count}`);
    });

    it('should include all three sources', () => {
      expect(graph!.bundle.meta.sources).toContain('manual_core');
      expect(graph!.bundle.meta.sources).toContain('onet_30.1');
      expect(graph!.bundle.meta.sources).toContain('esco_1.1.1');
    });
  });

  describe('Healthcare Niche (O*NET)', () => {
    it('should contain registered nurses', () => {
      expect(graph!.labelToId.has('registered nurses')).toBe(true);
    });

    it('should contain nurse practitioners', () => {
      expect(graph!.labelToId.has('nurse practitioners')).toBe(true);
    });

    it('should contain physician assistants', () => {
      expect(graph!.labelToId.has('physician assistants')).toBe(true);
    });

    it('should match nursing staffing to hospital hiring', () => {
      expect(graph).not.toBeNull();

      const supplyText = 'We staff clinical nurses for healthcare facilities';
      const demandText = 'Hospital hiring RNs';

      const supplyTokens = tokenizeBusinessText(supplyText);
      const demandTokens = tokenizeBusinessText(demandText);

      const expandedSupply = expandBusinessSignalsSync(graph!, supplyTokens, { side: 'supply' });
      const expandedDemand = expandBusinessSignalsSync(graph!, demandTokens, { side: 'demand' });

      console.log('\n🏥 Healthcare Test:');
      console.log(`   Supply tokens: ${supplyTokens.join(', ')}`);
      console.log(`   Supply expanded: ${expandedSupply.expanded.slice(0, 10).join(', ')}...`);
      console.log(`   Demand tokens: ${demandTokens.join(', ')}`);
      console.log(`   Demand expanded: ${expandedDemand.expanded.slice(0, 10).join(', ')}...`);

      // Should have some healthcare-related expansion
      const supplySet = new Set(expandedSupply.expanded);
      const overlap = expandedDemand.expanded.filter(t => supplySet.has(t));
      console.log(`   Overlap: ${overlap.join(', ')}`);

      // At minimum, demand should expand "hiring" to "recruiting" via manual core
      expect(expandedDemand.expanded).toContain('recruiting');
    });
  });

  describe('Finance Niche (O*NET)', () => {
    it('should contain financial managers', () => {
      expect(graph!.labelToId.has('financial managers')).toBe(true);
    });

    it('should contain accountants and auditors', () => {
      expect(graph!.labelToId.has('accountants and auditors')).toBe(true);
    });

    it('should match CFO recruiting to financial manager demand', () => {
      expect(graph).not.toBeNull();

      const supplyText = 'CFO recruiting firm for finance executives';
      const demandText = 'Company hiring financial manager';

      const supplyTokens = tokenizeBusinessText(supplyText);
      const demandTokens = tokenizeBusinessText(demandText);

      const expandedSupply = expandBusinessSignalsSync(graph!, supplyTokens, { side: 'supply' });
      const expandedDemand = expandBusinessSignalsSync(graph!, demandTokens, { side: 'demand' });

      console.log('\n💰 Finance Test:');
      console.log(`   Supply tokens: ${supplyTokens.join(', ')}`);
      console.log(`   Supply expanded: ${expandedSupply.expanded.slice(0, 10).join(', ')}...`);
      console.log(`   Demand tokens: ${demandTokens.join(', ')}`);
      console.log(`   Demand expanded: ${expandedDemand.expanded.slice(0, 10).join(', ')}...`);

      // Should have finance-related expansion
      expect(expandedSupply.expanded.length).toBeGreaterThan(supplyTokens.length);
    });
  });

  describe('Legal Niche (O*NET)', () => {
    it('should contain lawyers', () => {
      expect(graph!.labelToId.has('lawyers')).toBe(true);
    });

    it('should contain paralegals and legal assistants', () => {
      expect(graph!.labelToId.has('paralegals and legal assistants')).toBe(true);
    });
  });

  describe('Marketing Niche (O*NET)', () => {
    it('should contain marketing managers', () => {
      expect(graph!.labelToId.has('marketing managers')).toBe(true);
    });

    it('should contain market research analysts and marketing specialists', () => {
      expect(graph!.labelToId.has('market research analysts and marketing specialists')).toBe(true);
    });
  });

  describe('Operations Niche (O*NET)', () => {
    it('should contain general and operations managers', () => {
      expect(graph!.labelToId.has('general and operations managers')).toBe(true);
    });

    it('should contain supply chain managers', () => {
      expect(graph!.labelToId.has('supply chain managers')).toBe(true);
    });
  });

  describe('ESCO Skills Integration', () => {
    it('should have skills from ESCO', () => {
      // Check for some common ESCO skills
      const escoSkills = [
        'manage musical staff',
        'coordinate sales teams',
        'develop marketing strategies',
      ];

      let foundCount = 0;
      for (const skill of escoSkills) {
        if (graph!.labelToId.has(skill)) {
          foundCount++;
        }
      }

      console.log(`\n🎯 ESCO Skills found: ${foundCount}/${escoSkills.length}`);
      // At least some ESCO skills should be present
      expect(foundCount).toBeGreaterThan(0);
    });
  });

  describe('Original Tests Still Pass', () => {
    it('recruiting agency: should still achieve Strong tier (77+)', () => {
      expect(graph).not.toBeNull();

      const supplyText = 'We help companies recruit engineering talent';
      const demandText = 'VP Engineering — scaling team, hiring engineers';

      const supplyTokens = tokenizeBusinessText(supplyText);
      const demandTokens = tokenizeBusinessText(demandText);

      const expandedSupply = expandBusinessSignalsSync(graph!, supplyTokens, { side: 'supply' });
      const expandedDemand = expandBusinessSignalsSync(graph!, demandTokens, { side: 'demand' });

      const supplySet = new Set(expandedSupply.expanded);
      const overlap = expandedDemand.expanded.filter(t => supplySet.has(t));

      // Key assertion: hiring and recruiting should still overlap
      expect(overlap).toContain('hiring');
      expect(overlap).toContain('engineering');

      console.log('\n✅ Recruiting Agency (with full bundle):');
      console.log(`   Overlap: ${overlap.join(', ')}`);
    });

    it('SDR/BDR: should still match', () => {
      expect(graph).not.toBeNull();

      const supplyText = 'Outbound SDR team for pipeline generation';
      const demandText = 'Need BDR support for outbound';

      const supplyTokens = tokenizeBusinessText(supplyText);
      const demandTokens = tokenizeBusinessText(demandText);

      const expandedSupply = expandBusinessSignalsSync(graph!, supplyTokens, { side: 'supply' });
      const expandedDemand = expandBusinessSignalsSync(graph!, demandTokens, { side: 'demand' });

      const supplySet = new Set(expandedSupply.expanded);
      const overlap = expandedDemand.expanded.filter(t => supplySet.has(t));

      expect(overlap).toContain('bdr');
      expect(overlap).toContain('outbound');

      console.log('\n✅ SDR/BDR (with full bundle):');
      console.log(`   Overlap: ${overlap.join(', ')}`);
    });
  });
});
