/**
 * INTRO GENERATION END TEST — Deterministic verification for all 8 modes
 *
 * Tests both VALID and INVALID paths for each mode.
 * All assertions are mandatory. Any failure blocks merge.
 */

import { describe, it, expect } from 'vitest';
import {
  composeIntro,
  ConnectorMode,
  ALLOWED_PAIN_TARGETS,
  MODE_TEMPLATES,
  NEUTRAL_PAIN,
  NEUTRAL_SUMMARY_FALLBACK,
  selectPain,
} from '../src/copy/introDoctrine';
import { cleanCompanySummary } from '../src/matching/cleanCompanySummary';

// =============================================================================
// TEST DATA
// =============================================================================

const VALID_DESCRIPTIONS: Record<ConnectorMode, string> = {
  recruiting: 'helps companies build engineering teams',
  biotech_licensing: 'develops treatments for rare diseases',
  wealth_management: 'provides investment strategies for families',
  real_estate_capital: 'operates multifamily properties in Texas',
  logistics: 'runs fulfillment operations for brands',
  crypto: 'builds custody solutions for institutions',
  enterprise_partnerships: 'offers integration services for companies',
  b2b_general: 'provides consulting services for businesses',
};

const GARBAGE_DESCRIPTIONS = [
  "World's first AI-powered revolutionary platform 🚀",
  'We are committed to transforming the industry through innovative solutions',
  'The leading provider of next-gen cutting-edge technology #innovation',
  'Our mission is to empower businesses worldwide ✨',
  'Pioneering the future of...',
  '',
  'XYZ',
];

const MODES: ConnectorMode[] = [
  'recruiting',
  'biotech_licensing',
  'wealth_management',
  'real_estate_capital',
  'logistics',
  'crypto',
  'enterprise_partnerships',
  'b2b_general',
];

// =============================================================================
// HELPER ASSERTIONS
// =============================================================================

function assertIntroStructure(intro: string): void {
  // Must contain em dash (template structure)
  expect(intro.includes('—')).toBe(true);
  // Must be under 400 chars
  expect(intro.length).toBeLessThan(400);
  // Must start with Hey
  expect(intro.startsWith('Hey ')).toBe(true);
  // Must end with call to action
  expect(intro.includes('I can connect you directly if useful.')).toBe(true);
}

function assertNoGarbage(intro: string): void {
  // No emojis
  expect(/[🚀💡✨🔥⚡️🎯💪🏆]/.test(intro)).toBe(false);
  // No hashtags
  expect(intro.includes('#')).toBe(false);
  // No marketing slogans
  expect(/world'?s first/i.test(intro)).toBe(false);
  expect(/revolutionary/i.test(intro)).toBe(false);
  expect(/cutting.?edge/i.test(intro)).toBe(false);
}

// =============================================================================
// CLEAN COMPANY SUMMARY TESTS
// =============================================================================

describe('cleanCompanySummary validator', () => {
  it('returns null for empty input', () => {
    expect(cleanCompanySummary('')).toBeNull();
    expect(cleanCompanySummary(undefined)).toBeNull();
  });

  it('returns null for garbage patterns', () => {
    for (const garbage of GARBAGE_DESCRIPTIONS) {
      const result = cleanCompanySummary(garbage);
      expect(result).toBeNull();
    }
  });

  it('returns cleaned string for valid descriptions', () => {
    const valid = 'helps companies build engineering teams';
    const result = cleanCompanySummary(valid);
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
  });

  it('strips company name from description', () => {
    const result = cleanCompanySummary('Acme Corp builds widgets for businesses', 'Acme Corp');
    expect(result).not.toBeNull();
    expect(result?.includes('Acme Corp')).toBe(false);
  });

  it('rejects descriptions without verbs', () => {
    const noVerb = 'enterprise software solutions platform';
    expect(cleanCompanySummary(noVerb)).toBeNull();
  });

  it('rejects truncated descriptions', () => {
    expect(cleanCompanySummary('This is a company that...')).toBeNull();
    expect(cleanCompanySummary('Leading provider of…')).toBeNull();
  });
});

// =============================================================================
// SELECT PAIN TESTS
// =============================================================================

describe('selectPain function', () => {
  it('returns mode pain when demandType matches allowed targets', () => {
    expect(selectPain('crypto', 'crypto_platform')).toBe(MODE_TEMPLATES.crypto.demandPain);
    expect(selectPain('recruiting', 'hiring_company')).toBe(MODE_TEMPLATES.recruiting.demandPain);
    expect(selectPain('biotech_licensing', 'pharma')).toBe(MODE_TEMPLATES.biotech_licensing.demandPain);
  });

  it('returns NEUTRAL_PAIN when demandType does not match', () => {
    expect(selectPain('crypto', 'saas_company')).toBe(NEUTRAL_PAIN);
    expect(selectPain('recruiting', 'crypto_platform')).toBe(NEUTRAL_PAIN);
    expect(selectPain('biotech_licensing', 'developer')).toBe(NEUTRAL_PAIN);
  });

  it('returns mode pain for b2b_general regardless of demandType', () => {
    expect(selectPain('b2b_general', undefined)).toBe(MODE_TEMPLATES.b2b_general.demandPain);
    expect(selectPain('b2b_general', 'random_type')).toBe(MODE_TEMPLATES.b2b_general.demandPain);
  });

  it('handles object demandType', () => {
    expect(selectPain('crypto', { type: 'crypto_platform' })).toBe(MODE_TEMPLATES.crypto.demandPain);
    expect(selectPain('crypto', { type: 'not_crypto' })).toBe(NEUTRAL_PAIN);
  });
});

// =============================================================================
// DEMAND INTRO TESTS — ALL 8 MODES
// =============================================================================

describe('Demand Intro Generation', () => {
  for (const mode of MODES) {
    describe(`Mode: ${mode}`, () => {
      const validDemandType = ALLOWED_PAIN_TARGETS[mode][0] || 'generic';
      const invalidDemandType = 'completely_unrelated_type';

      // -----------------------------------------------------------------------
      // A) VALID PATH TEST
      // -----------------------------------------------------------------------
      it('VALID PATH: uses mode pain with valid demandType', () => {
        const intro = composeIntro({
          side: 'demand',
          mode,
          ctx: {
            firstName: 'John',
            company: 'TestCo',
            companyDescription: VALID_DESCRIPTIONS[mode],
            demandType: validDemandType,
          },
        });

        // Structure assertions
        assertIntroStructure(intro);
        assertNoGarbage(intro);

        // Pain assertion (b2b_general always uses its pain)
        if (mode === 'b2b_general' || ALLOWED_PAIN_TARGETS[mode].length === 0) {
          expect(intro.includes(MODE_TEMPLATES[mode].demandPain)).toBe(true);
        } else {
          expect(intro.includes(MODE_TEMPLATES[mode].demandPain)).toBe(true);
        }

        // Must not contain NEUTRAL_PAIN
        if (mode !== 'b2b_general' && ALLOWED_PAIN_TARGETS[mode].length > 0) {
          expect(intro.includes(NEUTRAL_PAIN)).toBe(false);
        }

        // Deterministic output check
        const intro2 = composeIntro({
          side: 'demand',
          mode,
          ctx: {
            firstName: 'John',
            company: 'TestCo',
            companyDescription: VALID_DESCRIPTIONS[mode],
            demandType: validDemandType,
          },
        });
        expect(intro).toBe(intro2);
      });

      // -----------------------------------------------------------------------
      // B) INVALID / FALLBACK PATH TEST
      // -----------------------------------------------------------------------
      it('INVALID PATH: uses NEUTRAL_PAIN and fallback with invalid demandType + garbage description', () => {
        const garbageDesc = GARBAGE_DESCRIPTIONS[0];

        const intro = composeIntro({
          side: 'demand',
          mode,
          ctx: {
            firstName: 'Jane',
            company: 'GarbageCo',
            companyDescription: garbageDesc,
            demandType: invalidDemandType,
          },
        });

        // Structure assertions
        assertIntroStructure(intro);
        assertNoGarbage(intro);

        // cleanCompanySummary must return null for garbage
        expect(cleanCompanySummary(garbageDesc)).toBeNull();

        // NEUTRAL fallback must be used (same for ALL modes)
        expect(intro.includes(NEUTRAL_SUMMARY_FALLBACK)).toBe(true);

        // Pain assertion
        if (mode === 'b2b_general' || ALLOWED_PAIN_TARGETS[mode].length === 0) {
          // b2b_general uses its own pain
          expect(intro.includes(MODE_TEMPLATES[mode].demandPain)).toBe(true);
        } else {
          // Other modes use NEUTRAL_PAIN when demandType doesn't match
          expect(intro.includes(NEUTRAL_PAIN)).toBe(true);
        }

        // Deterministic output check
        const intro2 = composeIntro({
          side: 'demand',
          mode,
          ctx: {
            firstName: 'Jane',
            company: 'GarbageCo',
            companyDescription: garbageDesc,
            demandType: invalidDemandType,
          },
        });
        expect(intro).toBe(intro2);
      });
    });
  }
});

// =============================================================================
// SUPPLY INTRO TESTS — ALL 8 MODES
// =============================================================================

describe('Supply Intro Generation', () => {
  for (const mode of MODES) {
    describe(`Mode: ${mode}`, () => {
      it('uses demandType when valid', () => {
        const intro = composeIntro({
          side: 'supply',
          mode,
          ctx: {
            firstName: 'Sarah',
            company: 'SupplyCo',
            demandType: 'a biotech scaling their team',
          },
        });

        assertIntroStructure(intro);
        expect(intro.includes('a biotech scaling their team')).toBe(true);
      });

      it('uses supplyFallback when demandType is invalid', () => {
        const intro = composeIntro({
          side: 'supply',
          mode,
          ctx: {
            firstName: 'Mike',
            company: 'SupplyCo',
            demandType: undefined,
          },
        });

        assertIntroStructure(intro);
        expect(intro.includes(MODE_TEMPLATES[mode].supplyFallback)).toBe(true);
      });

      it('is deterministic', () => {
        const intro1 = composeIntro({
          side: 'supply',
          mode,
          ctx: {
            firstName: 'Alex',
            company: 'TestCo',
            demandType: 'a tech company',
          },
        });
        const intro2 = composeIntro({
          side: 'supply',
          mode,
          ctx: {
            firstName: 'Alex',
            company: 'TestCo',
            demandType: 'a tech company',
          },
        });
        expect(intro1).toBe(intro2);
      });
    });
  }
});

// =============================================================================
// SNAPSHOT TESTS — Exact output verification
// =============================================================================

describe('Snapshot Tests', () => {
  it('recruiting valid path snapshot', () => {
    const intro = composeIntro({
      side: 'demand',
      mode: 'recruiting',
      ctx: {
        firstName: 'John',
        company: 'Acme',
        companyDescription: 'helps companies build engineering teams',
        demandType: 'hiring_company',
      },
    });

    expect(intro).toMatchInlineSnapshot(`
      "Hey John —

      Noticed Acme helps companies build engineering teams — I know teams who lose months on leadership hires because recruiters don't really understand the space.

      I can connect you directly if useful."
    `);
  });

  it('crypto invalid path snapshot (NEUTRAL_PAIN + NEUTRAL_FALLBACK)', () => {
    const intro = composeIntro({
      side: 'demand',
      mode: 'crypto',
      ctx: {
        firstName: 'Jane',
        company: 'RevOpsCo',
        companyDescription: "World's first RevOps AI Agent 🚀",
        demandType: 'saas_company', // NOT a crypto type
      },
    });

    // MUST use NEUTRAL fallback, NOT "is navigating compliance"
    expect(intro).toMatchInlineSnapshot(`
      "Hey Jane —

      Noticed RevOpsCo is a team in this space — I know teams who run into friction when evaluating new partners in this space.

      I can connect you directly if useful."
    `);
  });

  it('b2b_general fallback snapshot', () => {
    const intro = composeIntro({
      side: 'demand',
      mode: 'b2b_general',
      ctx: {
        firstName: 'Bob',
        company: 'GenericCo',
        companyDescription: '',
        demandType: undefined,
      },
    });

    // MUST use NEUTRAL fallback
    expect(intro).toMatchInlineSnapshot(`
      "Hey Bob —

      Noticed GenericCo is a team in this space — I know teams who lose time when providers don't really understand the space.

      I can connect you directly if useful."
    `);
  });
});

// =============================================================================
// MANDATORY ASSERTIONS
// =============================================================================

describe('Mandatory Assertions', () => {
  it('intro never includes raw companyDescription when garbage', () => {
    for (const garbage of GARBAGE_DESCRIPTIONS) {
      if (!garbage) continue;

      const intro = composeIntro({
        side: 'demand',
        mode: 'b2b_general',
        ctx: {
          firstName: 'Test',
          company: 'TestCo',
          companyDescription: garbage,
        },
      });

      expect(intro.includes(garbage)).toBe(false);
    }
  });

  it('all intros contain em dash structure', () => {
    for (const mode of MODES) {
      const intro = composeIntro({
        side: 'demand',
        mode,
        ctx: {
          firstName: 'Test',
          company: 'TestCo',
          companyDescription: 'provides software services',
        },
      });
      expect(intro.includes('—')).toBe(true);
    }
  });

  it('all intros are under 400 characters', () => {
    for (const mode of MODES) {
      const intro = composeIntro({
        side: 'demand',
        mode,
        ctx: {
          firstName: 'Test',
          company: 'TestCo',
          companyDescription: VALID_DESCRIPTIONS[mode],
          demandType: ALLOWED_PAIN_TARGETS[mode][0],
        },
      });
      expect(intro.length).toBeLessThan(400);
    }
  });
});
