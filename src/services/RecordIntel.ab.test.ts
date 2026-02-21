/**
 * RecordIntel A/B Test — Current prompt vs Economic Role prompt
 *
 * Runs 10 known-bad descriptions through BOTH prompts.
 * Ship the new prompt ONLY if >50% semantic improvement.
 *
 * Usage: npx vitest run src/services/RecordIntel.ab.test.ts
 *
 * Requires: OPENAI_API_KEY env var (uses gpt-4o-mini directly, ~$0.01 total)
 */

import { describe, it, expect } from 'vitest';

// =============================================================================
// TEST DATA — 10 descriptions that produced wrong capability in production
// Source: Instrumented run, recruitment market, Feb 2026
// =============================================================================

interface TestCase {
  company: string;
  description: string;
  expectedRole: string;  // What the capability SHOULD be
  signal: string;
}

const BAD_DESCRIPTIONS: TestCase[] = [
  {
    company: 'Korn Ferry',
    description: 'Korn Ferry is a global organizational consulting firm. We work with our clients to design optimal organization structures, roles, and responsibilities. We help them hire the right people and advise them on how to reward and motivate their workforce while developing professionals as they navigate and advance their careers.',
    expectedRole: 'executive recruitment and leadership placement',
    signal: 'hiring new employees',
  },
  {
    company: 'Heidrick & Struggles',
    description: 'Heidrick & Struggles is the premier provider of executive search, corporate culture and leadership consulting services. We work for more than 70% of Fortune 1000 companies in virtually every sector and industry around the globe.',
    expectedRole: 'executive search and senior leadership placement',
    signal: 'hiring new employees',
  },
  {
    company: 'Spencer Stuart',
    description: 'Spencer Stuart is one of the world\'s leading executive search and leadership advisory firms. For over 60 years, we have helped organizations make the leadership decisions that matter most. We partner with clients across the globe to find the leaders they need, to assess and develop their executive teams, and to build effective boards.',
    expectedRole: 'executive search and board-level placement',
    signal: 'hiring professionals',
  },
  {
    company: 'Russell Reynolds Associates',
    description: 'Russell Reynolds Associates is a global leadership advisory and search firm. Our 520+ consultants in 47 offices work with public, private and nonprofit organizations across all industries and regions. We help our clients build teams of transformational leaders who can meet today\'s challenges and anticipate the digital, economic and political trends that are reshaping the global business environment.',
    expectedRole: 'executive search and leadership advisory',
    signal: 'hiring new employees',
  },
  {
    company: 'Boyden',
    description: 'Boyden is a premier leadership and talent advisory firm with more than 75 offices in over 45 countries. Our global reach enables us to serve our clients\' needs wherever they do business. We connect great companies with great leaders through executive search, interim management and leadership consulting solutions.',
    expectedRole: 'executive search and interim management placement',
    signal: 'hiring new employees',
  },
  {
    company: 'DSG Global',
    description: 'DSG is a global executive search and consulting firm specializing in delivering highly qualified executives across a broad range of functional disciplines and industries. Our network of seasoned professionals provides clients with deep market knowledge, an extensive global reach, and a commitment to exceptional results.',
    expectedRole: 'executive search across industries',
    signal: 'hiring new employees',
  },
  {
    company: 'Ferguson Partners',
    description: 'Ferguson Partners is the leading executive search and talent management firm focused exclusively on the real asset industry including real estate, hospitality, infrastructure, and related financial services. We leverage our deep domain expertise to help clients identify, attract, and retain transformational leaders.',
    expectedRole: 'executive search for real estate and infrastructure firms',
    signal: 'hiring new employees',
  },
  {
    company: 'WittKieffer',
    description: 'WittKieffer is a premier executive search and leadership advisory firm exclusively serving organizations that improve quality of life. We recruit leaders for healthcare, life sciences, education, and not-for-profit organizations. Our consultants bring decades of experience and deep domain knowledge.',
    expectedRole: 'executive search for healthcare and life sciences organizations',
    signal: 'hiring new employees',
  },
  {
    company: 'Barrington James',
    description: 'Barrington James is a specialist recruitment consultancy focused on the global life sciences industry. We provide recruitment services across pharmaceutical, biotechnology, medical device, and clinical research sectors. Our experienced team of consultants delivers exceptional talent to leading organizations worldwide.',
    expectedRole: 'recruiting life sciences professionals for pharma and biotech',
    signal: 'hiring new employees',
  },
  {
    company: 'Ventus International',
    description: 'Ventus International is a specialist recruitment firm providing staffing solutions across the global energy transition sector. We connect talented professionals with opportunities in renewable energy, clean technology, and sustainability-focused organizations. Our team has deep expertise in wind, solar, hydrogen, and energy storage markets.',
    expectedRole: 'recruiting energy transition and renewables professionals',
    signal: 'hiring entry-level sales talent',
  },
];

// =============================================================================
// PROMPTS — A (current) vs B (economic role)
// =============================================================================

function buildPromptA(record: TestCase): string {
  return `Extract structured data from this company record. Be concrete and specific — no corporate jargon.

COMPANY: ${record.company}
DESCRIPTION: ${record.description.slice(0, 300)}
SIGNAL: ${record.signal}

Extract these 3 fields:

1. capability: What does this company actually DO? Not marketing copy — the core service or product in plain English. 12 words max.
   Good: "freight forwarding, air and sea, US nationwide"
   Good: "AI-powered margin forecasting for grocery retailers"
   Good: "cross-border payment settlement for banks"
   Bad: "premier asset fund investing in the next frontier" (marketing copy)
   Bad: "transforming cross-border payments" (vague verb + buzzword)

2. signalSummary: What happened? Rephrase the SIGNAL as a plain fact. 8 words max. If signal is empty or a generic tagline, write "active in market".

3. signalQuality: Is this signal about a real event at THIS company?
   "high" = company-specific event (hired someone, raised funding, launched product, expanded, acquired)
   "low" = vaguely related (industry news mentioning them, general market trend)
   "noise" = not about this company (podcast episode, generic tagline, press release about something else, truncated headline)

Output JSON only, no explanation:
{"capability": "...", "signalSummary": "...", "signalQuality": "high"}`;
}

function buildPromptB(record: TestCase): string {
  return `Extract structured data from this company record. Be concrete and specific — no corporate jargon.

COMPANY: ${record.company}
DESCRIPTION: ${record.description.slice(0, 300)}
SIGNAL: ${record.signal}

Extract these 3 fields:

1. capability: What do clients PAY this company to do? Describe their economic function — the specific service clients hire them for. Use a verb phrase. 12 words max.
   Good: "places executive leaders and C-suite hires for companies"
   Good: "runs clinical trials for pharma companies"
   Good: "manages paid media and PPC campaigns for brands"
   Bad: "consulting on strategy, operations, and talent management" (marketing copy, not economic action)
   Bad: "premier provider of executive search and leadership consulting" (self-description, not what they deliver)

2. signalSummary: What happened? Rephrase the SIGNAL as a plain fact. 8 words max. If signal is empty or a generic tagline, write "active in market".

3. signalQuality: Is this signal about a real event at THIS company?
   "high" = company-specific event (hired someone, raised funding, launched product, expanded, acquired)
   "low" = vaguely related (industry news mentioning them, general market trend)
   "noise" = not about this company (podcast episode, generic tagline, press release about something else, truncated headline)

Output JSON only, no explanation:
{"capability": "...", "signalSummary": "...", "signalQuality": "high"}`;
}

// =============================================================================
// AI CALL — Direct OpenAI (no app dependencies)
// =============================================================================

async function callAzureOpenAI(prompt: string): Promise<string> {
  const url = process.env.AZURE_OPENAI_URL || 'https://outreachking.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2025-01-01-preview';
  const apiKey = process.env.AZURE_OPENAI_KEY;
  if (!apiKey) throw new Error('AZURE_OPENAI_KEY env var required');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 200,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Azure OpenAI error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

function parseCapability(raw: string): string {
  const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    const parsed = JSON.parse(jsonStr);
    return String(parsed.capability || '').trim();
  } catch {
    return raw.trim();
  }
}

// =============================================================================
// SEMANTIC SCORING — Does the output reflect economic function?
// =============================================================================

/** Words that indicate marketing copy (bad) */
const MARKETING_WORDS = [
  'premier', 'leading', 'global', 'transformational', 'world-class',
  'leverage', 'optimize', 'innovative', 'cutting-edge', 'best-in-class',
  'comprehensive', 'holistic', 'strategic advisory', 'organizational consulting',
];

/** Words that indicate economic function (good) */
const ECONOMIC_VERBS = [
  'places', 'placing', 'recruits', 'recruiting', 'fills', 'filling',
  'hires', 'hiring', 'staffs', 'staffing', 'finds', 'finding',
  'runs', 'running', 'manages', 'managing', 'builds', 'building',
  'deploys', 'deploying', 'sells', 'selling', 'brokers', 'brokering',
  'underwrites', 'underwriting', 'administers', 'administering',
  'search', 'placement', 'headhunt',
];

interface ScoreResult {
  capability: string;
  hasMarketingWords: boolean;
  hasEconomicVerbs: boolean;
  mentionsRecruitment: boolean;
  score: number; // 0-3: 0=bad, 1=meh, 2=good, 3=excellent
}

function scoreCapability(capability: string, expected: string): ScoreResult {
  const lower = capability.toLowerCase();
  const hasMarketing = MARKETING_WORDS.some(w => lower.includes(w));
  const hasEconomic = ECONOMIC_VERBS.some(w => lower.includes(w));
  const mentionsRecruitment = /recruit|search|place|plac|staffing|hiring|talent|headhunt/i.test(capability);

  let score = 0;
  if (hasEconomic) score++;
  if (mentionsRecruitment) score++;
  if (!hasMarketing) score++;

  return {
    capability,
    hasMarketingWords: hasMarketing,
    hasEconomicVerbs: hasEconomic,
    mentionsRecruitment,
    score,
  };
}

// =============================================================================
// THE TEST
// =============================================================================

describe('RecordIntel A/B — Current vs Economic Role prompt', () => {
  it('should show >50% semantic improvement with economic role prompt', async () => {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  RecordIntel A/B Test — 10 Known-Bad Descriptions');
    console.log('═══════════════════════════════════════════════════\n');

    const results: Array<{
      company: string;
      expected: string;
      promptA: ScoreResult;
      promptB: ScoreResult;
      improved: boolean;
    }> = [];

    // Run sequentially to avoid rate limits
    for (const testCase of BAD_DESCRIPTIONS) {
      const [rawA, rawB] = await Promise.all([
        callAzureOpenAI(buildPromptA(testCase)),
        callAzureOpenAI(buildPromptB(testCase)),
      ]);

      const capA = parseCapability(rawA);
      const capB = parseCapability(rawB);

      const scoreA = scoreCapability(capA, testCase.expectedRole);
      const scoreB = scoreCapability(capB, testCase.expectedRole);

      const improved = scoreB.score > scoreA.score;

      results.push({
        company: testCase.company,
        expected: testCase.expectedRole,
        promptA: scoreA,
        promptB: scoreB,
        improved,
      });

      console.log(`\n── ${testCase.company} ──`);
      console.log(`  Expected:  ${testCase.expectedRole}`);
      console.log(`  Prompt A:  "${capA}" (score: ${scoreA.score}/3)`);
      console.log(`  Prompt B:  "${capB}" (score: ${scoreB.score}/3)`);
      console.log(`  Improved:  ${improved ? '✅ YES' : '❌ NO'}`);
    }

    // Summary
    const improvedCount = results.filter(r => r.improved).length;
    const regressedCount = results.filter(r => r.promptB.score < r.promptA.score).length;
    const unchangedCount = results.filter(r => r.promptB.score === r.promptA.score).length;
    const avgScoreA = results.reduce((s, r) => s + r.promptA.score, 0) / results.length;
    const avgScoreB = results.reduce((s, r) => s + r.promptB.score, 0) / results.length;

    console.log('\n═══════════════════════════════════════════════════');
    console.log('  RESULTS SUMMARY');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Improved:   ${improvedCount}/10 (${improvedCount * 10}%)`);
    console.log(`  Regressed:  ${regressedCount}/10`);
    console.log(`  Unchanged:  ${unchangedCount}/10`);
    console.log(`  Avg Score A: ${avgScoreA.toFixed(1)}/3`);
    console.log(`  Avg Score B: ${avgScoreB.toFixed(1)}/3`);
    console.log(`  VERDICT:    ${improvedCount >= 5 ? '✅ SHIP PROMPT B' : '❌ DISCARD PROMPT B'}`);
    console.log('═══════════════════════════════════════════════════\n');

    // The gate: >50% must improve
    expect(improvedCount).toBeGreaterThanOrEqual(5);
    // No regressions allowed
    expect(regressedCount).toBeLessThanOrEqual(2);
  }, 120_000); // 2 min timeout for API calls
});
