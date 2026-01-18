/**
 * BIZGRAPH Mini Bundle Tests
 *
 * Test assertions for all required business relationships.
 * These tests MUST pass before building the full bundle.
 *
 * Tests:
 * 1. Required edges exist with correct relations and weights
 * 2. Concept type tags are correct
 * 3. Label index completeness
 * 4. Disambiguation rules work
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

import {
  type BizGraphBundle,
  type BizGraphEdge,
  canonicalizeLabel,
} from './schema';

import {
  buildManualCoreConcepts,
  buildLabelIndex,
  buildManualCoreEdges,
  getRequiredEdgeAssertions,
  isExpansionBlocked,
  getDisambiguationCluster,
} from './manualCore';

// =============================================================================
// BUNDLE LOADING
// =============================================================================

let bundle: BizGraphBundle | null = null;
let concepts: ReturnType<typeof buildManualCoreConcepts>;
let labelIndex: ReturnType<typeof buildLabelIndex>;
let edges: BizGraphEdge[];

beforeAll(() => {
  // Build fresh from manual core for testing
  concepts = buildManualCoreConcepts();
  labelIndex = buildLabelIndex(concepts);
  edges = buildManualCoreEdges(labelIndex);

  // Also load the built bundle to verify consistency
  const bundlePath = path.join(process.cwd(), 'public', 'semantic', 'bizgraph-mini-v1.json.gz');
  if (fs.existsSync(bundlePath)) {
    const gzipped = fs.readFileSync(bundlePath);
    const jsonBuffer = zlib.gunzipSync(gzipped);
    bundle = JSON.parse(jsonBuffer.toString()) as BizGraphBundle;
  }
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function findEdge(
  fromLabel: string,
  rel: string,
  toLabel: string
): BizGraphEdge | undefined {
  const fromCanonical = canonicalizeLabel(fromLabel);
  const toCanonical = canonicalizeLabel(toLabel);
  const fromId = labelIndex.get(fromCanonical);
  const toId = labelIndex.get(toCanonical);

  if (!fromId || !toId) return undefined;

  return edges.find(
    (e) => e[0] === fromId && e[1] === rel && e[2] === toId
  );
}

function getConceptByLabel(label: string) {
  const canonical = canonicalizeLabel(label);
  const id = labelIndex.get(canonical);
  if (!id) return undefined;
  return concepts[id];
}

// =============================================================================
// TIER 1 TESTS: HR / RECRUITING
// =============================================================================

describe('TIER 1: HR / Recruiting', () => {
  describe('Required Equivalences', () => {
    it('recruiting ↔ hiring (equivalent, w=1.0)', () => {
      const edge = findEdge('recruiting', 'equivalent', 'hiring');
      expect(edge).toBeDefined();
      expect(edge![3]).toBeGreaterThanOrEqual(1.0);
    });

    it('recruiting ↔ staffing (equivalent, w=1.0)', () => {
      const edge = findEdge('recruiting', 'equivalent', 'staffing');
      expect(edge).toBeDefined();
      expect(edge![3]).toBeGreaterThanOrEqual(1.0);
    });

    it('recruiting ↔ talent acquisition (equivalent, w=1.0)', () => {
      const edge = findEdge('recruiting', 'equivalent', 'talent acquisition');
      expect(edge).toBeDefined();
      expect(edge![3]).toBeGreaterThanOrEqual(1.0);
    });

    it('hiring ↔ recruiting (bidirectional)', () => {
      const edge = findEdge('hiring', 'equivalent', 'recruiting');
      expect(edge).toBeDefined();
    });
  });

  describe('Required Fulfills Relations', () => {
    it('recruiting fulfills hiring (w=0.95)', () => {
      const edge = findEdge('recruiting', 'fulfills', 'hiring');
      expect(edge).toBeDefined();
      expect(edge![3]).toBeGreaterThanOrEqual(0.95);
    });

    it('staffing fulfills hiring (w=0.95)', () => {
      const edge = findEdge('staffing', 'fulfills', 'hiring');
      expect(edge).toBeDefined();
      expect(edge![3]).toBeGreaterThanOrEqual(0.95);
    });

    it('talent acquisition fulfills hiring (w=0.95)', () => {
      const edge = findEdge('talent acquisition', 'fulfills', 'hiring');
      expect(edge).toBeDefined();
      expect(edge![3]).toBeGreaterThanOrEqual(0.95);
    });
  });

  describe('Required Specializations', () => {
    it('technical recruiting specializes recruiting (w=0.9)', () => {
      const edge = findEdge('technical recruiting', 'specializes', 'recruiting');
      expect(edge).toBeDefined();
      expect(edge![3]).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe('Required Related', () => {
    it('engineering hiring related hiring (w=0.9)', () => {
      const edge = findEdge('engineering hiring', 'related', 'hiring');
      expect(edge).toBeDefined();
      expect(edge![3]).toBeGreaterThanOrEqual(0.9);
    });

    it('technical recruiting related engineering hiring (w=0.9)', () => {
      const edge = findEdge('technical recruiting', 'related', 'engineering hiring');
      expect(edge).toBeDefined();
      expect(edge![3]).toBeGreaterThanOrEqual(0.9);
    });

    it('recruiter related recruiting (w=0.8)', () => {
      const edge = findEdge('recruiter', 'related', 'recruiting');
      expect(edge).toBeDefined();
      expect(edge![3]).toBeGreaterThanOrEqual(0.8);
    });

    it('team building related hiring (w=0.6)', () => {
      const edge = findEdge('team building', 'related', 'hiring');
      expect(edge).toBeDefined();
      expect(edge![3]).toBeGreaterThanOrEqual(0.6);
    });
  });

  describe('Concept Type Tags', () => {
    it('recruiting is a service', () => {
      const concept = getConceptByLabel('recruiting');
      expect(concept).toBeDefined();
      expect(concept!.t).toBe('service');
    });

    it('hiring is an intent', () => {
      const concept = getConceptByLabel('hiring');
      expect(concept).toBeDefined();
      expect(concept!.t).toBe('intent');
    });

    it('technical recruiting is a function', () => {
      const concept = getConceptByLabel('technical recruiting');
      expect(concept).toBeDefined();
      expect(concept!.t).toBe('function');
    });

    it('recruiter is a role', () => {
      const concept = getConceptByLabel('recruiter');
      expect(concept).toBeDefined();
      expect(concept!.t).toBe('role');
    });

    it('team building is an activity', () => {
      const concept = getConceptByLabel('team building');
      expect(concept).toBeDefined();
      expect(concept!.t).toBe('activity');
    });
  });
});

// =============================================================================
// TIER 2 TESTS: SALES DEVELOPMENT
// =============================================================================

describe('TIER 2: Sales Development', () => {
  it('sdr ↔ bdr (equivalent, w=0.95)', () => {
    const edge = findEdge('sdr', 'equivalent', 'bdr');
    expect(edge).toBeDefined();
    expect(edge![3]).toBeGreaterThanOrEqual(0.95);
  });

  it('bdr ↔ sdr (bidirectional)', () => {
    const edge = findEdge('bdr', 'equivalent', 'sdr');
    expect(edge).toBeDefined();
  });

  it('inside sales related sales development (w=0.9)', () => {
    const edge = findEdge('inside sales', 'related', 'sales development');
    expect(edge).toBeDefined();
    expect(edge![3]).toBeGreaterThanOrEqual(0.9);
  });

  it('sales development related outbound sales (w=0.9)', () => {
    const edge = findEdge('sales development', 'related', 'outbound sales');
    expect(edge).toBeDefined();
    expect(edge![3]).toBeGreaterThanOrEqual(0.9);
  });

  it('outbound sales related cold email outreach (w=0.8)', () => {
    const edge = findEdge('outbound sales', 'related', 'cold email outreach');
    expect(edge).toBeDefined();
    expect(edge![3]).toBeGreaterThanOrEqual(0.8);
  });

  it('sales development fulfills lead generation (w=0.7)', () => {
    const edge = findEdge('sales development', 'fulfills', 'lead generation');
    expect(edge).toBeDefined();
    expect(edge![3]).toBeGreaterThanOrEqual(0.7);
  });

  describe('Alias Verification', () => {
    it('SDR labels include full forms', () => {
      const concept = getConceptByLabel('sdr');
      expect(concept).toBeDefined();
      expect(concept!.l).toContain('sdr');
      expect(concept!.l).toContain('sales development rep');
      expect(concept!.l).toContain('sales development representative');
    });

    it('BDR labels include full forms', () => {
      const concept = getConceptByLabel('bdr');
      expect(concept).toBeDefined();
      expect(concept!.l).toContain('bdr');
      expect(concept!.l).toContain('business development rep');
      expect(concept!.l).toContain('business development representative');
    });
  });
});

// =============================================================================
// TIER 3 TESTS: TECH LEADERSHIP
// =============================================================================

describe('TIER 3: Tech Leadership', () => {
  it('vp engineering ↔ head of engineering (equivalent, w=0.95)', () => {
    const edge = findEdge('vp engineering', 'equivalent', 'head of engineering');
    expect(edge).toBeDefined();
    expect(edge![3]).toBeGreaterThanOrEqual(0.95);
  });

  it('head of engineering ↔ engineering director (equivalent, w=0.9)', () => {
    const edge = findEdge('head of engineering', 'equivalent', 'engineering director');
    expect(edge).toBeDefined();
    expect(edge![3]).toBeGreaterThanOrEqual(0.9);
  });

  it('engineering director ↔ director of engineering (equivalent, w=1.0)', () => {
    const edge = findEdge('engineering director', 'equivalent', 'director of engineering');
    expect(edge).toBeDefined();
    expect(edge![3]).toBeGreaterThanOrEqual(1.0);
  });

  describe('Alias Verification', () => {
    it('VP Engineering labels include full forms', () => {
      const concept = getConceptByLabel('vp engineering');
      expect(concept).toBeDefined();
      expect(concept!.l).toContain('vp engineering');
      expect(concept!.l).toContain('vice president of engineering');
    });
  });
});

// =============================================================================
// TIER 4 TESTS: MODERN INDUSTRIES
// =============================================================================

describe('TIER 4: Modern Industries', () => {
  describe('FinTech', () => {
    it('fintech ↔ financial technology (equivalent, w=1.0)', () => {
      const edge = findEdge('fintech', 'equivalent', 'financial technology');
      expect(edge).toBeDefined();
      expect(edge![3]).toBeGreaterThanOrEqual(1.0);
    });

    it('fintech related payments (w=0.9)', () => {
      const edge = findEdge('fintech', 'related', 'payments');
      expect(edge).toBeDefined();
      expect(edge![3]).toBeGreaterThanOrEqual(0.9);
    });

    it('fintech related banking technology (w=0.8)', () => {
      const edge = findEdge('fintech', 'related', 'banking technology');
      expect(edge).toBeDefined();
      expect(edge![3]).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('RegTech', () => {
    it('regtech ↔ regulatory technology (equivalent, w=1.0)', () => {
      const edge = findEdge('regtech', 'equivalent', 'regulatory technology');
      expect(edge).toBeDefined();
      expect(edge![3]).toBeGreaterThanOrEqual(1.0);
    });

    it('regtech related compliance (w=0.9)', () => {
      const edge = findEdge('regtech', 'related', 'compliance');
      expect(edge).toBeDefined();
      expect(edge![3]).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe('Web3/Blockchain', () => {
    it('web3 ↔ blockchain (equivalent, w=0.95)', () => {
      const edge = findEdge('web3', 'equivalent', 'blockchain');
      expect(edge).toBeDefined();
      expect(edge![3]).toBeGreaterThanOrEqual(0.95);
    });

    it('blockchain related crypto (w=0.9)', () => {
      const edge = findEdge('blockchain', 'related', 'crypto');
      expect(edge).toBeDefined();
      expect(edge![3]).toBeGreaterThanOrEqual(0.9);
    });

    it('web3 related decentralized systems (w=0.8)', () => {
      const edge = findEdge('web3', 'related', 'decentralized systems');
      expect(edge).toBeDefined();
      expect(edge![3]).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('Alias Verification', () => {
    it('web3 labels include variants', () => {
      const concept = getConceptByLabel('web3');
      expect(concept).toBeDefined();
      expect(concept!.l).toContain('web3');
      expect(concept!.l).toContain('web 3');
    });

    it('crypto labels include full forms', () => {
      const concept = getConceptByLabel('crypto');
      expect(concept).toBeDefined();
      expect(concept!.l).toContain('crypto');
      expect(concept!.l).toContain('cryptocurrency');
      expect(concept!.l).toContain('cryptocurrencies');
    });
  });
});

// =============================================================================
// TIER 5 TESTS: DISAMBIGUATION
// =============================================================================

describe('TIER 5: Context Disambiguation', () => {
  describe('AI Safety Cluster', () => {
    it('ai safety ↔ ai alignment (equivalent, w=1.0)', () => {
      const edge = findEdge('ai safety', 'equivalent', 'ai alignment');
      expect(edge).toBeDefined();
      expect(edge![3]).toBeGreaterThanOrEqual(1.0);
    });

    it('ai safety related research (w=0.7)', () => {
      const edge = findEdge('ai safety', 'related', 'research');
      expect(edge).toBeDefined();
      expect(edge![3]).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe('AI Sales Cluster', () => {
    it('ai sales related sales (w=0.7)', () => {
      const edge = findEdge('ai sales', 'related', 'sales');
      expect(edge).toBeDefined();
      expect(edge![3]).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe('Disambiguation Rules', () => {
    it('ai safety cluster detected for "ai safety"', () => {
      const cluster = getDisambiguationCluster('ai safety');
      expect(cluster).toBe('ai_safety');
    });

    it('ai safety cluster detected for "alignment research"', () => {
      const cluster = getDisambiguationCluster('alignment research');
      expect(cluster).toBe('ai_safety');
    });

    it('ai sales cluster detected for "ai sales"', () => {
      const cluster = getDisambiguationCluster('ai sales');
      expect(cluster).toBe('ai_sales');
    });

    it('ai safety should NOT expand to sales', () => {
      expect(isExpansionBlocked('ai safety', 'sales')).toBe(true);
      expect(isExpansionBlocked('ai safety', 'ai sales')).toBe(true);
    });

    it('ai sales should NOT expand to ai safety', () => {
      expect(isExpansionBlocked('ai sales', 'ai safety')).toBe(true);
      expect(isExpansionBlocked('ai sales', 'alignment')).toBe(true);
    });

    it('recruiting should expand freely (no cluster)', () => {
      expect(isExpansionBlocked('recruiting', 'hiring')).toBe(false);
      expect(isExpansionBlocked('recruiting', 'staffing')).toBe(false);
    });
  });
});

// =============================================================================
// BUNDLE CONSISTENCY TESTS
// =============================================================================

describe('Bundle Consistency', () => {
  it('bundle exists on disk', () => {
    expect(bundle).not.toBeNull();
  });

  it('bundle version matches', () => {
    expect(bundle?.version).toBe('1.0.0');
  });

  it('bundle concept count matches', () => {
    expect(bundle?.meta.concept_count).toBe(Object.keys(concepts).length);
  });

  it('bundle edge count matches', () => {
    expect(bundle?.meta.edge_count).toBe(edges.length);
  });

  it('bundle label count matches', () => {
    expect(bundle?.meta.label_count).toBe(labelIndex.size);
  });

  it('bundle sources include manual_core', () => {
    expect(bundle?.meta.sources).toContain('manual_core');
  });
});

// =============================================================================
// COMPLETE EDGE ASSERTION TEST
// =============================================================================

describe('Complete Edge Assertions', () => {
  it('all required edges exist', () => {
    const required = getRequiredEdgeAssertions();
    const missing: string[] = [];
    const found: string[] = [];

    for (const req of required) {
      const edge = findEdge(req.from, req.rel, req.to);
      if (edge && edge[3] >= req.minWeight) {
        found.push(`${req.from} → ${req.rel} → ${req.to}`);
      } else {
        missing.push(`${req.from} → ${req.rel} → ${req.to} (minW: ${req.minWeight})`);
      }
    }

    console.log(`\n📋 Required Edges Found: ${found.length}/${required.length}`);
    if (missing.length > 0) {
      console.log('❌ Missing edges:', missing);
    }

    expect(missing.length).toBe(0);
    expect(found.length).toBe(required.length);
  });
});
