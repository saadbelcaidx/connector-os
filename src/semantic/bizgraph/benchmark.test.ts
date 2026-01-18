/**
 * BIZGRAPH Performance Benchmark Tests
 *
 * Tests:
 * 1. Bundle load time (<2s target)
 * 2. Expansion latency P50/P95/P99 (<5ms target)
 * 3. Memory footprint (<50MB target)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

import { type BizGraphBundle } from './schema';
import {
  expandBusinessSignalsSync,
  tokenizeBusinessText,
} from './expand';
import { type BizGraph } from './loader';

// =============================================================================
// BUNDLE LOADING (Node.js test version)
// =============================================================================

let graph: BizGraph | null = null;
let loadTimeMs = 0;
let memorySizeMB = 0;

function loadBundleForTest(): BizGraph | null {
  const bundlePath = path.join(process.cwd(), 'public', 'semantic', 'bizgraph-mini-v1.json.gz');

  if (!fs.existsSync(bundlePath)) {
    console.log('Bundle not found:', bundlePath);
    return null;
  }

  const startTime = performance.now();
  const startMemory = process.memoryUsage().heapUsed;

  const gzipped = fs.readFileSync(bundlePath);
  const jsonBuffer = zlib.gunzipSync(gzipped);
  const bundle = JSON.parse(jsonBuffer.toString()) as BizGraphBundle;

  // Build indexes (simulating loader behavior)
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

  loadTimeMs = performance.now() - startTime;
  memorySizeMB = (process.memoryUsage().heapUsed - startMemory) / (1024 * 1024);

  return { bundle, labelToId, idToLabels, outgoing, incoming };
}

// =============================================================================
// TESTS
// =============================================================================

describe('BIZGRAPH Performance Benchmarks', () => {
  beforeAll(() => {
    graph = loadBundleForTest();
  });

  describe('1. Bundle Load Performance', () => {
    it('should load bundle in under 2 seconds', () => {
      console.log(`\n📦 Bundle Load Time: ${loadTimeMs.toFixed(0)}ms`);
      expect(loadTimeMs).toBeLessThan(2000);
    });

    it('should have memory footprint under 50MB', () => {
      console.log(`💾 Memory Footprint: ${memorySizeMB.toFixed(2)}MB`);
      expect(memorySizeMB).toBeLessThan(50);
    });

    it('should load all concepts', () => {
      expect(graph).not.toBeNull();
      console.log(`✅ Loaded ${graph!.bundle.meta.concept_count} concepts`);
    });
  });

  describe('2. Expansion Latency', () => {
    it('should measure P50/P95/P99 latency for expansion', () => {
      if (!graph) {
        console.log('Skipping: bundle not loaded');
        return;
      }

      const latencies: number[] = [];
      const testTokens = [
        'recruiting', 'hiring', 'staffing', 'talent acquisition',
        'sdr', 'bdr', 'sales development', 'outbound sales',
        'fintech', 'blockchain', 'web3', 'crypto',
        'vp engineering', 'head of engineering',
      ];

      // Run 1000 expansions
      for (let i = 0; i < 100; i++) {
        for (const token of testTokens) {
          const start = performance.now();
          expandBusinessSignalsSync(graph, [token], { side: 'supply' });
          latencies.push(performance.now() - start);
        }
      }

      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];

      console.log(`\n⚡ Expansion Latency (${latencies.length} ops):`);
      console.log(`   P50: ${p50.toFixed(3)}ms`);
      console.log(`   P95: ${p95.toFixed(3)}ms`);
      console.log(`   P99: ${p99.toFixed(3)}ms`);

      expect(p50).toBeLessThan(2);   // Target: <2ms
      expect(p95).toBeLessThan(5);   // Target: <5ms
      expect(p99).toBeLessThan(10);  // Target: <10ms
    });

    it('should measure multi-token expansion latency', () => {
      if (!graph) return;

      const latencies: number[] = [];
      const testCases = [
        'We help companies recruit engineering talent',
        'VP Engineering — hiring engineers',
        'Outbound SDR team for pipeline generation',
        'Payments infrastructure consulting for fintechs',
        'Blockchain recruiting for web3 companies',
      ];

      for (let i = 0; i < 100; i++) {
        for (const text of testCases) {
          const tokens = tokenizeBusinessText(text);
          const start = performance.now();
          expandBusinessSignalsSync(graph, tokens, { side: 'supply' });
          latencies.push(performance.now() - start);
        }
      }

      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];

      console.log(`\n🔄 Multi-token Expansion Latency (${latencies.length} ops):`);
      console.log(`   P50: ${p50.toFixed(3)}ms`);
      console.log(`   P95: ${p95.toFixed(3)}ms`);

      expect(p50).toBeLessThan(5);
      expect(p95).toBeLessThan(10);
    });
  });

  describe('3. Key Expansion Tests', () => {
    it('recruiting should expand to hiring', () => {
      if (!graph) return;

      const result = expandBusinessSignalsSync(graph, ['recruiting'], { side: 'supply' });

      console.log(`\n📖 "recruiting" expansions: ${result.expanded.join(', ')}`);
      console.log(`   Evidence:`);
      result.evidence.forEach(e => {
        console.log(`   - ${e.from} → ${e.to} (${e.rel}, w=${e.w.toFixed(2)})`);
      });

      expect(result.expanded).toContain('recruiting');
      expect(result.expanded).toContain('hiring');
    });

    it('hiring should expand to recruiting', () => {
      if (!graph) return;

      const result = expandBusinessSignalsSync(graph, ['hiring'], { side: 'demand' });

      console.log(`\n📖 "hiring" expansions: ${result.expanded.join(', ')}`);

      expect(result.expanded).toContain('hiring');
      expect(result.expanded).toContain('recruiting');
    });

    it('sdr should expand to bdr', () => {
      if (!graph) return;

      const result = expandBusinessSignalsSync(graph, ['sdr'], { side: 'supply' });

      console.log(`\n📖 "sdr" expansions: ${result.expanded.join(', ')}`);

      expect(result.expanded).toContain('sdr');
      expect(result.expanded).toContain('bdr');
    });

    it('fintech should expand to payments', () => {
      if (!graph) return;

      const result = expandBusinessSignalsSync(graph, ['fintech'], { side: 'supply' });

      console.log(`\n📖 "fintech" expansions: ${result.expanded.join(', ')}`);

      // "financial technology" is an alias on same concept, not a target
      // Actual expansion targets are: banking technology, payments
      expect(result.expanded).toContain('fintech');
      expect(result.expanded).toContain('payments');
      expect(result.expanded).toContain('banking technology');
    });

    it('web3 should expand to blockchain', () => {
      if (!graph) return;

      const result = expandBusinessSignalsSync(graph, ['web3'], { side: 'supply' });

      console.log(`\n📖 "web3" expansions: ${result.expanded.join(', ')}`);

      expect(result.expanded).toContain('web3');
      expect(result.expanded).toContain('blockchain');
    });

    it('ai safety should NOT expand to sales (disambiguation)', () => {
      if (!graph) return;

      const result = expandBusinessSignalsSync(graph, ['ai safety'], { side: 'supply' });

      console.log(`\n📖 "ai safety" expansions: ${result.expanded.join(', ')}`);

      // "ai alignment" is an alias on same concept, not expansion target
      // The KEY test: ai safety must NOT expand to sales (disambiguation rule)
      expect(result.expanded).toContain('ai safety');
      expect(result.expanded).not.toContain('sales');
      expect(result.expanded).not.toContain('ai sales');
    });
  });

  describe('4. Recruiting Agency Test Case', () => {
    it('should match recruiting supply to hiring demand', () => {
      if (!graph) return;

      // Supply: recruiting agency
      const supplyText = 'We help companies recruit engineering talent';
      const supplyTokens = tokenizeBusinessText(supplyText);
      const supplyExpanded = expandBusinessSignalsSync(graph, supplyTokens, { side: 'supply' });

      // Demand: company hiring
      const demandText = 'VP Engineering — hiring engineers';
      const demandTokens = tokenizeBusinessText(demandText);
      const demandExpanded = expandBusinessSignalsSync(graph, demandTokens, { side: 'demand' });

      console.log(`\n🎯 Recruiting Agency Test:`);
      console.log(`   Supply text: "${supplyText}"`);
      console.log(`   Supply tokens: ${supplyTokens.join(', ')}`);
      console.log(`   Supply expanded: ${supplyExpanded.expanded.join(', ')}`);
      console.log(`   Demand text: "${demandText}"`);
      console.log(`   Demand tokens: ${demandTokens.join(', ')}`);
      console.log(`   Demand expanded: ${demandExpanded.expanded.join(', ')}`);

      // Check overlap
      const supplySet = new Set(supplyExpanded.expanded);
      const overlap = demandExpanded.expanded.filter(t => supplySet.has(t));

      console.log(`   Overlap: ${overlap.join(', ')}`);
      console.log(`   Evidence:`);
      [...supplyExpanded.evidence, ...demandExpanded.evidence].forEach(e => {
        console.log(`   - ${e.from} → ${e.to} (${e.rel})`);
      });

      // Must have semantic overlap
      expect(overlap.length).toBeGreaterThan(0);
      expect(overlap).toContain('hiring');
    });
  });
});
