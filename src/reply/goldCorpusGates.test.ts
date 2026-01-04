/**
 * Gold Corpus Gates - DIRECT KNOWING Cosmic Level
 *
 * CI gates for critical stage categories with stricter requirements.
 *
 * GOLD SETS:
 * - gold_interest: INTEREST stage replies (>=99% correct, no discovery questions)
 * - gold_pricing: PRICING stage replies (>=99% correct, zero money words, must have call CTA)
 * - gold_negative: NEGATIVE stage replies (>=99% correct, must NOT have call CTA)
 *
 * These gates BLOCK deployment if regressions are detected.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const EDGE_URL = process.env.REPLY_BRAIN_URL || 'https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/reply-brain';

// CI Gate thresholds (stricter than general corpus)
const GOLD_STAGE_ACCURACY_THRESHOLD = 0.99; // 99% minimum

// Money words that MUST NOT appear in PRICING replies
const PRICING_FORBIDDEN_WORDS = [
  /\$\d+/i,
  /\bfree\b/i,
  /\bcommission\b/i,
  /\bpercentage\b|\b\d+%/i,
  /\bretainer\b/i,
  /\bfee\b/i,
  /rev\s?share/i,
];

// Call CTA patterns that MUST appear in PRICING/INTEREST, MUST NOT in NEGATIVE
const CALL_CTA_PATTERNS = [
  /\bcall\b/i,
  /\bweek\b/i,
  /10-?15/i,
  /\bschedule\b/i,
  /\bcalendar\b/i,
  /\bgrab time\b/i,
];

// Discovery question patterns (must NOT appear in INTEREST)
const DISCOVERY_QUESTION_PATTERNS = [
  /what.*(looking for|need|want)/i,
  /how can (i|we) help/i,
  /tell me more/i,
  /what brings you/i,
];

interface GoldCorpusItem {
  inbound: string;
  outbound?: string;
  expected_stage: string;
  thread?: Array<{ role: 'me' | 'them'; content: string }>;
  gold_set: 'interest' | 'pricing' | 'negative';
}

interface GoldTestResult {
  item: GoldCorpusItem;
  actualStage: string;
  stageCorrect: boolean;
  reply: string;
  hasForbiddenWord: boolean;
  hasCallCta: boolean;
  hasDiscoveryQuestion: boolean;
  violations: string[];
  pass: boolean;
}

async function testGoldItem(item: GoldCorpusItem): Promise<GoldTestResult> {
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
  const reply = data.reply || '';
  const actualStage = data.stage || 'UNKNOWN';

  // Stage correctness
  const stageCorrect = actualStage === item.expected_stage;

  // Check for forbidden pricing words
  const hasForbiddenWord = PRICING_FORBIDDEN_WORDS.some(p => p.test(reply));

  // Check for call CTA
  const hasCallCta = CALL_CTA_PATTERNS.some(p => p.test(reply));

  // Check for discovery questions
  const hasDiscoveryQuestion = DISCOVERY_QUESTION_PATTERNS.some(p => p.test(reply));

  // Collect violations
  const violations: string[] = [];

  if (!stageCorrect) {
    violations.push(`Stage mismatch: expected ${item.expected_stage}, got ${actualStage}`);
  }

  switch (item.gold_set) {
    case 'interest':
      if (hasDiscoveryQuestion) {
        violations.push('INTEREST reply contains discovery question');
      }
      break;
    case 'pricing':
      if (hasForbiddenWord) {
        violations.push('PRICING reply contains money words');
      }
      if (!hasCallCta) {
        violations.push('PRICING reply missing call CTA');
      }
      break;
    case 'negative':
      if (hasCallCta) {
        violations.push('NEGATIVE reply contains call CTA (should not)');
      }
      break;
  }

  return {
    item,
    actualStage,
    stageCorrect,
    reply,
    hasForbiddenWord,
    hasCallCta,
    hasDiscoveryQuestion,
    violations,
    pass: violations.length === 0,
  };
}

function loadGoldCorpus(): GoldCorpusItem[] {
  // Try to load from gold corpus files
  const goldSets: GoldCorpusItem[] = [];

  const goldPaths = [
    { path: 'gold_interest.jsonl', set: 'interest' as const },
    { path: 'gold_pricing.jsonl', set: 'pricing' as const },
    { path: 'gold_negative.jsonl', set: 'negative' as const },
  ];

  for (const { path, set } of goldPaths) {
    const fullPath = join(__dirname, '../../supabase/functions/reply-brain/corpus', path);
    if (existsSync(fullPath)) {
      const content = readFileSync(fullPath, 'utf-8');
      const items = content
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const item = JSON.parse(line);
          return { ...item, gold_set: set };
        });
      goldSets.push(...items);
    }
  }

  // If no gold files exist, use synthetic test cases
  if (goldSets.length === 0) {
    console.log('[gold-corpus] No gold files found, using synthetic test cases');
    return getSyntheticGoldCases();
  }

  return goldSets;
}

// IDENTITY-specific test cases (CANONICAL FIX)
interface IdentityTestCase {
  inbound: string;
  mustNotContain: RegExp[];
  mustContain: RegExp[];
}

const IDENTITY_TEST_CASES: IdentityTestCase[] = [
  {
    inbound: 'how do you work',
    mustNotContain: [/are you looking for/i, /providers or services/i, /clarify/i, /\?.*\?/],
    mustContain: [/call|10-?15/i],
  },
  {
    inbound: "what's the catch?",
    mustNotContain: [/are you looking for/i, /clarify/i, /which side/i],
    mustContain: [/call|10-?15/i],
  },
  {
    inbound: 'explain how this works',
    mustNotContain: [/are you (a |the )?buyer/i, /on behalf of/i],
    mustContain: [/connector|independently|neutral|middle/i],
  },
];

// Synthetic test cases for initial bootstrap
function getSyntheticGoldCases(): GoldCorpusItem[] {
  return [
    // INTEREST cases
    {
      inbound: 'Yeah this could be interesting, happy to chat',
      outbound: 'Hey Mike, noticed you are scaling the sales team. We help with pipeline.',
      expected_stage: 'INTEREST',
      gold_set: 'interest',
    },
    {
      inbound: 'Sure, let me know what times work',
      outbound: 'Hey, saw the job post for AEs. We have candidates.',
      expected_stage: 'INTEREST',
      gold_set: 'interest',
    },
    {
      inbound: 'Sounds good, send over some times',
      outbound: 'Hi Sarah, noticed the growth. Want to connect you with someone.',
      expected_stage: 'INTEREST',
      gold_set: 'interest',
    },

    // PRICING cases
    {
      inbound: 'What are your fees?',
      outbound: 'Hey, we help with recruiting.',
      expected_stage: 'PRICING',
      gold_set: 'pricing',
    },
    {
      inbound: 'How much does this cost?',
      outbound: 'Hi, we connect companies with talent.',
      expected_stage: 'PRICING',
      gold_set: 'pricing',
    },
    {
      inbound: 'What is the pricing model?',
      outbound: 'Hey John, noticed you need SDRs.',
      expected_stage: 'PRICING',
      gold_set: 'pricing',
    },

    // NEGATIVE cases
    {
      inbound: 'Not interested, please remove me',
      outbound: 'Hey, we help with sales hiring.',
      expected_stage: 'NEGATIVE',
      gold_set: 'negative',
    },
    {
      inbound: 'No thanks, we are not looking',
      outbound: 'Hi, noticed the job post.',
      expected_stage: 'NEGATIVE',
      gold_set: 'negative',
    },
    {
      inbound: 'Please unsubscribe me from this list',
      outbound: 'Hey, we have candidates for you.',
      expected_stage: 'NEGATIVE',
      gold_set: 'negative',
    },
  ];
}

describe('Gold Corpus CI Gates', () => {
  const goldCorpus = loadGoldCorpus();

  const interestCases = goldCorpus.filter(c => c.gold_set === 'interest');
  const pricingCases = goldCorpus.filter(c => c.gold_set === 'pricing');
  const negativeCases = goldCorpus.filter(c => c.gold_set === 'negative');

  describe('INTEREST Gold Set', () => {
    it('should classify INTEREST correctly with >= 99% accuracy', async () => {
      if (interestCases.length === 0) {
        console.log('[gold-corpus] Skipping INTEREST: no cases');
        return;
      }

      const results = await Promise.all(interestCases.map(testGoldItem));
      const correct = results.filter(r => r.stageCorrect).length;
      const accuracy = correct / results.length;

      console.log(`[gold-corpus] INTEREST: ${correct}/${results.length} = ${(accuracy * 100).toFixed(1)}%`);

      // Log failures
      const failures = results.filter(r => !r.stageCorrect);
      for (const f of failures) {
        console.log(`  FAIL: "${f.item.inbound.slice(0, 50)}..." -> ${f.actualStage}`);
      }

      expect(accuracy).toBeGreaterThanOrEqual(GOLD_STAGE_ACCURACY_THRESHOLD);
    });

    it('should NOT include discovery questions in INTEREST replies', async () => {
      if (interestCases.length === 0) return;

      const results = await Promise.all(interestCases.map(testGoldItem));
      const withDiscovery = results.filter(r => r.hasDiscoveryQuestion);

      if (withDiscovery.length > 0) {
        console.log(`[gold-corpus] INTEREST with discovery questions: ${withDiscovery.length}`);
        for (const r of withDiscovery) {
          console.log(`  "${r.reply.slice(0, 80)}..."`);
        }
      }

      expect(withDiscovery.length).toBe(0);
    });
  });

  describe('PRICING Gold Set', () => {
    it('should classify PRICING correctly with >= 99% accuracy', async () => {
      if (pricingCases.length === 0) {
        console.log('[gold-corpus] Skipping PRICING: no cases');
        return;
      }

      const results = await Promise.all(pricingCases.map(testGoldItem));
      const correct = results.filter(r => r.stageCorrect).length;
      const accuracy = correct / results.length;

      console.log(`[gold-corpus] PRICING: ${correct}/${results.length} = ${(accuracy * 100).toFixed(1)}%`);

      expect(accuracy).toBeGreaterThanOrEqual(GOLD_STAGE_ACCURACY_THRESHOLD);
    });

    it('should contain ZERO money words in PRICING replies', async () => {
      if (pricingCases.length === 0) return;

      const results = await Promise.all(pricingCases.map(testGoldItem));
      const withMoney = results.filter(r => r.hasForbiddenWord);

      if (withMoney.length > 0) {
        console.log(`[gold-corpus] PRICING with money words: ${withMoney.length}`);
        for (const r of withMoney) {
          console.log(`  "${r.reply.slice(0, 80)}..."`);
        }
      }

      expect(withMoney.length).toBe(0);
    });

    it('should contain call CTA in PRICING replies', async () => {
      if (pricingCases.length === 0) return;

      const results = await Promise.all(pricingCases.map(testGoldItem));
      const withoutCta = results.filter(r => !r.hasCallCta);

      if (withoutCta.length > 0) {
        console.log(`[gold-corpus] PRICING without call CTA: ${withoutCta.length}`);
        for (const r of withoutCta) {
          console.log(`  "${r.reply.slice(0, 80)}..."`);
        }
      }

      expect(withoutCta.length).toBe(0);
    });
  });

  describe('NEGATIVE Gold Set', () => {
    it('should classify NEGATIVE correctly with >= 99% accuracy', async () => {
      if (negativeCases.length === 0) {
        console.log('[gold-corpus] Skipping NEGATIVE: no cases');
        return;
      }

      const results = await Promise.all(negativeCases.map(testGoldItem));
      const correct = results.filter(r => r.stageCorrect).length;
      const accuracy = correct / results.length;

      console.log(`[gold-corpus] NEGATIVE: ${correct}/${results.length} = ${(accuracy * 100).toFixed(1)}%`);

      expect(accuracy).toBeGreaterThanOrEqual(GOLD_STAGE_ACCURACY_THRESHOLD);
    });

    it('should NOT contain call CTA in NEGATIVE replies', async () => {
      if (negativeCases.length === 0) return;

      const results = await Promise.all(negativeCases.map(testGoldItem));
      const withCta = results.filter(r => r.hasCallCta);

      if (withCta.length > 0) {
        console.log(`[gold-corpus] NEGATIVE with call CTA: ${withCta.length}`);
        for (const r of withCta) {
          console.log(`  "${r.reply.slice(0, 80)}..."`);
        }
      }

      expect(withCta.length).toBe(0);
    });
  });

  describe('IDENTITY Canonical Fix', () => {
    it('should classify "how do you work" as IDENTITY (not CONFUSION/UNKNOWN)', async () => {
      for (const testCase of IDENTITY_TEST_CASES) {
        const response = await fetch(EDGE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pastedReply: testCase.inbound,
            initialMessage: 'Hey, noticed your job post. We help with recruiting.',
          }),
        });

        const data = await response.json();
        console.log(`[identity-test] "${testCase.inbound}" -> stage=${data.stage}`);

        // Must be IDENTITY, never CONFUSION or UNKNOWN
        expect(data.stage).toBe('IDENTITY');

        // Check reply content
        const reply = data.reply || '';

        // Must NOT contain clarifying questions
        for (const pattern of testCase.mustNotContain) {
          expect(pattern.test(reply)).toBe(false);
        }

        // Must contain call CTA or identity language
        const hasRequired = testCase.mustContain.some(p => p.test(reply));
        expect(hasRequired).toBe(true);
      }
    });

    it('should have NO clarifying questions in IDENTITY replies', async () => {
      const clarifyingPatterns = [
        /are you looking for/i,
        /providers or services/i,
        /are you (a |the )?(buyer|seller|provider)/i,
        /on behalf of/i,
        /which side/i,
      ];

      for (const testCase of IDENTITY_TEST_CASES) {
        const response = await fetch(EDGE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pastedReply: testCase.inbound,
            initialMessage: 'Hey, we help with sales hiring.',
          }),
        });

        const data = await response.json();
        const reply = data.reply || '';

        for (const pattern of clarifyingPatterns) {
          if (pattern.test(reply)) {
            console.log(`[identity-test] FAIL: "${testCase.inbound}" contains "${pattern.source}"`);
            console.log(`  Reply: "${reply.slice(0, 100)}..."`);
          }
          expect(pattern.test(reply)).toBe(false);
        }
      }
    });
  });

  describe('Summary Gate', () => {
    it('should pass all gold corpus gates', async () => {
      const allResults = await Promise.all(goldCorpus.map(testGoldItem));
      const passing = allResults.filter(r => r.pass);
      const failing = allResults.filter(r => !r.pass);

      console.log(`[gold-corpus] Overall: ${passing.length}/${allResults.length} passing`);

      if (failing.length > 0) {
        console.log('[gold-corpus] Failures:');
        for (const f of failing) {
          console.log(`  ${f.item.gold_set.toUpperCase()}: "${f.item.inbound.slice(0, 40)}..."`);
          for (const v of f.violations) {
            console.log(`    - ${v}`);
          }
        }
      }

      // Allow a small margin for edge cases
      const passRate = passing.length / allResults.length;
      expect(passRate).toBeGreaterThanOrEqual(0.95);
    });
  });
});
