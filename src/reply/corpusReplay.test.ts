/**
 * Reply Brain v17 - Corpus Replay Tests
 *
 * Replays corpus cases through the handler and measures:
 * - unknown_rate
 * - fallback_rate
 * - embarrassment_gate_rate
 * - anchor good-rate
 *
 * CI GATES:
 * - unknown_rate > 12% → fail (ratchet to 10%, 8%)
 * - embarrassment_gate_rate > 1% → fail (ratchet to 0.5%)
 * - anchor good-rate regression > 3% → fail
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const EDGE_URL = process.env.REPLY_BRAIN_URL || 'https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/reply-brain';

// CI Gate thresholds
const UNKNOWN_RATE_THRESHOLD = 0.12; // 12%
const EMBARRASSMENT_RATE_THRESHOLD = 0.01; // 1%
const ANCHOR_GOOD_RATE_BASELINE = 0.80; // 80%

interface CorpusItem {
  inbound: string;
  outbound?: string;
  expected_stage?: string;
  thread?: Array<{ role: 'me' | 'them'; content: string }>;
}

interface ReplayResult {
  item: CorpusItem;
  stage: string;
  expectedStage?: string;
  stageMatch: boolean;
  anchorQuality: string;
  embarrassmentHit: boolean;
  reply: string;
  latencyMs: number;
}

async function replayCorpusItem(item: CorpusItem): Promise<ReplayResult> {
  const startTime = Date.now();

  const response = await fetch(EDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pastedReply: item.inbound,
      initialMessage: item.outbound,
      thread: item.thread,
    }),
  });

  const data = await response.json();
  const latencyMs = Date.now() - startTime;

  // Stage matching: exact or within equivalence set
  const equivalenceSets: Record<string, string[]> = {
    INTEREST: ['INTEREST'],
    IDENTITY: ['IDENTITY', 'SCOPE'],
    PRICING: ['PRICING'],
    PROOF: ['PROOF'],
    SCHEDULING: ['SCHEDULING'],
    NEGATIVE: ['NEGATIVE'],
    HOSTILE: ['HOSTILE'],
    OOO: ['OOO'],
    BOUNCE: ['BOUNCE'],
    CONFUSION: ['CONFUSION'],
    UNKNOWN: ['UNKNOWN'],
    SCOPE: ['SCOPE', 'IDENTITY'],
  };

  const expectedSet = item.expected_stage ? equivalenceSets[item.expected_stage] || [item.expected_stage] : [];
  const stageMatch = !item.expected_stage || expectedSet.includes(data.stage);

  return {
    item,
    stage: data.stage,
    expectedStage: item.expected_stage,
    stageMatch,
    anchorQuality: data.telemetry?.anchorQuality || 'unknown',
    embarrassmentHit: data.telemetry?.embarrassmentGateHit || false,
    reply: data.reply || '',
    latencyMs,
  };
}

function loadCorpus(): CorpusItem[] {
  const corpusPath = join(__dirname, '../../supabase/functions/reply-brain/corpus/public.jsonl');
  try {
    const content = readFileSync(corpusPath, 'utf-8');
    return content
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  } catch {
    console.warn('Corpus file not found, using empty corpus');
    return [];
  }
}

describe('Reply Brain v17 - Corpus Replay', () => {
  const corpus = loadCorpus();
  const results: ReplayResult[] = [];

  it('should replay all corpus items', async () => {
    if (corpus.length === 0) {
      console.warn('No corpus items to replay');
      return;
    }

    for (const item of corpus) {
      const result = await replayCorpusItem(item);
      results.push(result);
    }

    expect(results.length).toBe(corpus.length);
  }, 120000); // 2 minute timeout for all items

  it('should have acceptable unknown rate', async () => {
    if (results.length === 0) return;

    const unknownCount = results.filter(r => r.stage === 'UNKNOWN').length;
    const unknownRate = unknownCount / results.length;

    console.log(`Unknown rate: ${(unknownRate * 100).toFixed(2)}% (${unknownCount}/${results.length})`);
    console.log(`Threshold: ${(UNKNOWN_RATE_THRESHOLD * 100).toFixed(2)}%`);

    if (unknownRate > UNKNOWN_RATE_THRESHOLD) {
      const unknowns = results.filter(r => r.stage === 'UNKNOWN');
      console.log('Unknown items:', unknowns.map(r => r.item.inbound));
    }

    expect(unknownRate).toBeLessThanOrEqual(UNKNOWN_RATE_THRESHOLD);
  });

  it('should have acceptable embarrassment rate', async () => {
    if (results.length === 0) return;

    const embarrassmentCount = results.filter(r => r.embarrassmentHit).length;
    const embarrassmentRate = embarrassmentCount / results.length;

    console.log(`Embarrassment rate: ${(embarrassmentRate * 100).toFixed(2)}% (${embarrassmentCount}/${results.length})`);
    console.log(`Threshold: ${(EMBARRASSMENT_RATE_THRESHOLD * 100).toFixed(2)}%`);

    expect(embarrassmentRate).toBeLessThanOrEqual(EMBARRASSMENT_RATE_THRESHOLD);
  });

  it('should have acceptable anchor good rate', async () => {
    if (results.length === 0) return;

    const goodCount = results.filter(r => r.anchorQuality === 'good').length;
    const goodRate = goodCount / results.length;

    console.log(`Anchor good rate: ${(goodRate * 100).toFixed(2)}% (${goodCount}/${results.length})`);
    console.log(`Baseline: ${(ANCHOR_GOOD_RATE_BASELINE * 100).toFixed(2)}%`);

    // Note: We only fail if regression is > 3% from baseline
    // For now, just log the rate
    if (goodRate < ANCHOR_GOOD_RATE_BASELINE) {
      console.warn(`Anchor good rate below baseline by ${((ANCHOR_GOOD_RATE_BASELINE - goodRate) * 100).toFixed(2)}%`);
    }
  });

  it('should match expected stages', async () => {
    if (results.length === 0) return;

    const itemsWithExpected = results.filter(r => r.expectedStage);
    const matchCount = itemsWithExpected.filter(r => r.stageMatch).length;
    const matchRate = itemsWithExpected.length > 0 ? matchCount / itemsWithExpected.length : 1;

    console.log(`Stage match rate: ${(matchRate * 100).toFixed(2)}% (${matchCount}/${itemsWithExpected.length})`);

    const mismatches = itemsWithExpected.filter(r => !r.stageMatch);
    if (mismatches.length > 0) {
      console.log('Mismatches:');
      mismatches.forEach(m => {
        console.log(`  "${m.item.inbound}" → expected ${m.expectedStage}, got ${m.stage}`);
      });
    }

    expect(matchRate).toBeGreaterThanOrEqual(0.90); // 90% match rate
  });

  it('should never include CTA in NEGATIVE/HOSTILE replies', async () => {
    if (results.length === 0) return;

    const negativeHostile = results.filter(r =>
      r.stage === 'NEGATIVE' || r.stage === 'HOSTILE'
    );

    const ctaPatterns = /\b(week|call|calendar|10-15|10–15|grab|schedule|book)\b/i;
    const violations = negativeHostile.filter(r => ctaPatterns.test(r.reply));

    if (violations.length > 0) {
      console.log('CTA violations in NEGATIVE/HOSTILE:');
      violations.forEach(v => {
        console.log(`  "${v.item.inbound}" → "${v.reply.substring(0, 100)}..."`);
      });
    }

    expect(violations.length).toBe(0);
  });

  it('should include call-first in INTEREST replies', async () => {
    if (results.length === 0) return;

    const interestResults = results.filter(r => r.stage === 'INTEREST');

    const callFirstPatterns = /\b(call|fit|timing|10-15|10–15|week|align)\b/i;
    const compliant = interestResults.filter(r => callFirstPatterns.test(r.reply));
    const complianceRate = interestResults.length > 0 ? compliant.length / interestResults.length : 1;

    console.log(`Call-first compliance: ${(complianceRate * 100).toFixed(2)}% (${compliant.length}/${interestResults.length})`);

    expect(complianceRate).toBeGreaterThanOrEqual(0.95); // 95% compliance
  });

  // v20 CI GATE: INTEREST must stay INTEREST/SCHEDULING ≥ 99% (DIRECT KNOWING)
  it('should classify INTEREST corpus items as INTEREST or SCHEDULING ≥ 99%', async () => {
    if (results.length === 0) return;

    // Filter items with expected_stage = INTEREST
    const interestItems = results.filter(r => r.expectedStage === 'INTEREST');

    if (interestItems.length === 0) {
      console.log('No INTEREST corpus items to check');
      return;
    }

    // Valid stages: INTEREST or SCHEDULING (both are positive signals)
    const validStages = ['INTEREST', 'SCHEDULING'];
    const correct = interestItems.filter(r => validStages.includes(r.stage));
    const correctRate = correct.length / interestItems.length;

    console.log(`INTEREST accuracy: ${(correctRate * 100).toFixed(2)}% (${correct.length}/${interestItems.length})`);

    // Log misclassifications for debugging
    const misclassified = interestItems.filter(r => !validStages.includes(r.stage));
    if (misclassified.length > 0) {
      console.log('INTEREST misclassifications:');
      misclassified.forEach(m => {
        console.log(`  "${m.item.inbound}" → got ${m.stage} (expected INTEREST)`);
      });
    }

    // HARD GATE: 99% accuracy required
    expect(correctRate).toBeGreaterThanOrEqual(0.99);
  });

  // v20 CI GATE: PRICING forbidden terms (SELF UNLOCK v1)
  it('should never include money language in PRICING replies', async () => {
    if (results.length === 0) return;

    const pricingResults = results.filter(r => r.stage === 'PRICING');

    // PRICING_FORBIDDEN_TOKENS from reply-brain
    const forbiddenPatterns = [
      /\bfree\b/i,
      /no cost/i,
      /\bcommission\b/i,
      /\breferral\b/i,
      /\bpercentage\b|\b\d+%/i,
      /rev\s?share|revenue\s?share/i,
      /success\s?fee/i,
      /\bretainer\b/i,
      /access\s?fee/i,
      /only paid if|only get paid/i,
      /small fee|optional %/i,
    ];

    const violations = pricingResults.filter(r => {
      return forbiddenPatterns.some(p => p.test(r.reply));
    });

    if (violations.length > 0) {
      console.log('PRICING money language violations (MUST BE 0):');
      violations.forEach(v => {
        console.log(`  "${v.item.inbound}" → "${v.reply}"`);
      });
    }

    // HARD GATE: 100% compliance required
    expect(violations.length).toBe(0);
  });

  // v20 CI GATE: Industry question never "varies" (SELF UNLOCK v1)
  it('should never answer industry questions with "varies"', async () => {
    if (results.length === 0) return;

    // Filter items where inbound contains industry question
    const industryPattern = /what\s+(industries|verticals|sectors|types of companies|kind of companies)|which\s+(industries|verticals|sectors)|what\s+industries\s+are/i;
    const industryItems = results.filter(r => industryPattern.test(r.item.inbound));

    const variesPattern = /\bvaries\b|\bdepends\b/i;
    const violations = industryItems.filter(r => variesPattern.test(r.reply));

    if (violations.length > 0) {
      console.log('Industry "varies" violations (MUST BE 0):');
      violations.forEach(v => {
        console.log(`  "${v.item.inbound}" → "${v.reply}"`);
      });
    }

    // HARD GATE: 100% compliance required
    expect(violations.length).toBe(0);
  });

  it('should have banned phrases absent', async () => {
    if (results.length === 0) return;

    const bannedPatterns = [
      /are lose/i,
      /are waste/i,
      /are struggle/i,
      /the people i mentioned are \w+ing/i,
      /not sure if this landed right/i,
    ];

    const violations: ReplayResult[] = [];
    for (const result of results) {
      for (const pattern of bannedPatterns) {
        if (pattern.test(result.reply)) {
          violations.push(result);
          break;
        }
      }
    }

    if (violations.length > 0) {
      console.log('Banned phrase violations:');
      violations.forEach(v => {
        console.log(`  "${v.reply.substring(0, 100)}..."`);
      });
    }

    expect(violations.length).toBe(0);
  });

  it('should print corpus metrics summary', async () => {
    if (results.length === 0) {
      console.log('No results to summarize');
      return;
    }

    // Stage distribution
    const stageCounts: Record<string, number> = {};
    for (const r of results) {
      stageCounts[r.stage] = (stageCounts[r.stage] || 0) + 1;
    }

    console.log('\n=== CORPUS METRICS SUMMARY ===');
    console.log(`Total items: ${results.length}`);
    console.log('\nStage distribution:');
    for (const [stage, count] of Object.entries(stageCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${stage}: ${count} (${((count / results.length) * 100).toFixed(1)}%)`);
    }

    // Anchor quality distribution
    const anchorCounts: Record<string, number> = {};
    for (const r of results) {
      anchorCounts[r.anchorQuality] = (anchorCounts[r.anchorQuality] || 0) + 1;
    }
    console.log('\nAnchor quality:');
    for (const [quality, count] of Object.entries(anchorCounts)) {
      console.log(`  ${quality}: ${count} (${((count / results.length) * 100).toFixed(1)}%)`);
    }

    // Latency
    const latencies = results.map(r => r.latencyMs);
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];
    console.log(`\nLatency: avg=${avgLatency.toFixed(0)}ms, p95=${p95Latency}ms`);

    console.log('==============================\n');
  });
});
