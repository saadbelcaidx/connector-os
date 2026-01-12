/**
 * Mode System Acceptance Tests
 *
 * Per implementation prompt requirements:
 * 1. IT Recruitment: using non-wellfound dataset should surface "unsupported source" error clearly
 * 2. Biotech: no "hiring" language without job evidence, NO phase gating
 * 3. B2B (Broad): accepts mixed industries but blocks claims without evidence
 * 4. Custom: start disabled until acknowledgement checked; copy uses safe neutral wording
 * 5. Enterprise partnerships is no longer "empty filter mode" (must have at least one enforceable rule)
 * 6. Crypto: accepts L1/exchange/tooling without differentiation, blocks fundraising without evidence
 * 7. All modes follow Broad ICP doctrine (no sub-niche controls)
 */

import { describe, it, expect } from 'vitest';
import {
  getModeContract,
  getAvailableModes,
  isValidMode,
  getPresignalExamples,
  VocabularyProfile,
} from '../src/services/ConnectorModeRegistry';
import {
  validateCopy,
  canSend,
  CopyValidationOptions,
} from '../src/services/CopyValidator';
import { emptyEvidenceSet, EvidenceSet } from '../src/services/EvidenceGate';

// =============================================================================
// TEST 1: IT Recruitment — Wellfound supported, LinkedIn Jobs not supported
// =============================================================================

describe('IT Recruitment Mode', () => {
  it('has correct label', () => {
    const contract = getModeContract('recruiting');
    expect(contract.label).toBe('IT Recruitment');
  });

  it('declares Wellfound as supported source', () => {
    const contract = getModeContract('recruiting');
    expect(contract.supportedSources).toContain('wellfound');
  });

  it('does NOT declare LinkedIn Jobs as supported source', () => {
    const contract = getModeContract('recruiting');
    expect(contract.supportedSources).not.toContain('linkedin-jobs');
  });

  it('has strict vocabulary profile', () => {
    const contract = getModeContract('recruiting');
    expect(contract.contracts.safeVocabularyProfile).toBe('strict');
  });

  it('does NOT require operator confirmation', () => {
    const contract = getModeContract('recruiting');
    expect(contract.contracts.requiresOperatorConfirmation).toBe(false);
  });

  it('has tooltip mentioning Wellfound', () => {
    const contract = getModeContract('recruiting');
    expect(contract.ui.tooltip.toLowerCase()).toContain('wellfound');
  });
});

// =============================================================================
// TEST 2: Biotech — no "hiring" language without job evidence
// =============================================================================

describe('Biotech Mode', () => {
  it('has correct label (Biotech, not Biotech Licensing)', () => {
    const contract = getModeContract('biotech_licensing');
    expect(contract.label).toBe('Biotech');
  });

  it('forbids recruiting vocabulary', () => {
    const contract = getModeContract('biotech_licensing');
    expect(contract.vocabulary.forbidden).toContain('hiring');
    expect(contract.vocabulary.forbidden).toContain('recruiting');
    expect(contract.vocabulary.forbidden).toContain('staffing');
  });

  it('blocks copy with "hiring" when no evidence', () => {
    const text = 'Hey John — noticed Acme Biotech is hiring engineers. Worth an intro?';
    const options: CopyValidationOptions = {
      mode: 'biotech_licensing',
      side: 'demand',
      evidence: emptyEvidenceSet(),
    };
    const result = validateCopy(text, options);
    expect(result.valid).toBe(false);
    expect(result.forbiddenWordsFound).toContain('hiring');
  });

  it('has strict vocabulary profile', () => {
    const contract = getModeContract('biotech_licensing');
    expect(contract.contracts.safeVocabularyProfile).toBe('strict');
  });
});

// =============================================================================
// TEST 3: B2B (Broad) — accepts mixed industries, blocks claims without evidence
// =============================================================================

describe('B2B (Broad) Mode', () => {
  it('has correct label', () => {
    const contract = getModeContract('enterprise_partnerships');
    expect(contract.label).toBe('B2B (Broad)');
  });

  it('has broad vocabulary profile', () => {
    const contract = getModeContract('enterprise_partnerships');
    expect(contract.contracts.safeVocabularyProfile).toBe('broad');
  });

  it('allows all demand industries (empty allowedIndustries)', () => {
    const contract = getModeContract('enterprise_partnerships');
    expect(contract.demand.allowedIndustries.length).toBe(0);
  });

  it('forbids staffing/recruiting on supply side', () => {
    const contract = getModeContract('enterprise_partnerships');
    expect(contract.supply.forbiddenIndustries).toContain('Staffing and Recruiting');
    expect(contract.supply.forbiddenIndustries).toContain('Executive Search');
  });

  it('requires B2B decision maker titles on supply', () => {
    const contract = getModeContract('enterprise_partnerships');
    expect(contract.supply.defaultTitles.length).toBeGreaterThan(0);
    expect(contract.supply.defaultTitles).toContain('Founder');
    expect(contract.supply.defaultTitles).toContain('CEO');
    expect(contract.supply.defaultTitles).toContain('VP Business Development');
  });

  it('blocks "hiring" claims without evidence', () => {
    const text = 'Hey John — noticed Acme is hiring. Worth an intro?';
    const options: CopyValidationOptions = {
      mode: 'enterprise_partnerships',
      side: 'demand',
      evidence: emptyEvidenceSet(),
    };
    const result = validateCopy(text, options);
    expect(result.valid).toBe(false);
    expect(result.forbiddenWordsFound).toContain('hiring');
  });

  it('blocks "raised" claims without evidence', () => {
    const text = 'Hey John — noticed Acme raised Series B. Worth connecting?';
    const options: CopyValidationOptions = {
      mode: 'enterprise_partnerships',
      side: 'demand',
      evidence: emptyEvidenceSet(),
    };
    const result = validateCopy(text, options);
    expect(result.valid).toBe(false);
    expect(result.forbiddenWordsFound.some(w => w.toLowerCase().includes('raised') || w.toLowerCase().includes('series'))).toBe(true);
  });

  it('has deterministic filters (no longer SEV-1)', () => {
    const contract = getModeContract('enterprise_partnerships');
    expect(contract.contracts.deterministicFilters).toBe(true);
  });
});

// =============================================================================
// TEST 4: Custom — requires acknowledgement, safe neutral wording
// =============================================================================

describe('Custom Mode', () => {
  it('has correct label', () => {
    const contract = getModeContract('custom');
    expect(contract.label).toBe('Custom');
  });

  it('requires operator confirmation (safety interlock)', () => {
    const contract = getModeContract('custom');
    expect(contract.contracts.requiresOperatorConfirmation).toBe(true);
  });

  it('has custom vocabulary profile', () => {
    const contract = getModeContract('custom');
    expect(contract.contracts.safeVocabularyProfile).toBe('custom');
  });

  it('does NOT have deterministic filters', () => {
    const contract = getModeContract('custom');
    expect(contract.contracts.deterministicFilters).toBe(false);
  });

  it('forbids confident claim words', () => {
    const contract = getModeContract('custom');
    expect(contract.vocabulary.forbidden).toContain('hiring');
    expect(contract.vocabulary.forbidden).toContain('raised');
    expect(contract.vocabulary.forbidden).toContain('i saw');
  });

  it('blocks overconfident copy', () => {
    const text = "Hey John — I saw you're hiring engineers. Want an intro?";
    const options: CopyValidationOptions = {
      mode: 'custom',
      side: 'demand',
      evidence: emptyEvidenceSet(),
    };
    const result = validateCopy(text, options);
    expect(result.valid).toBe(false);
  });

  it('copy templates use neutral language', () => {
    const contract = getModeContract('custom');
    // Should not contain confident claims
    expect(contract.copyTemplates.demand).not.toContain('hiring');
    expect(contract.copyTemplates.demand).not.toContain('raised');
    // Should use neutral language
    expect(contract.copyTemplates.demand).toContain('activity');
  });
});

// =============================================================================
// TEST 5: Enterprise partnerships is no longer "empty filter mode"
// =============================================================================

describe('Enterprise Partnerships Contract Enforcement', () => {
  it('has at least one enforceable demand filter', () => {
    const contract = getModeContract('enterprise_partnerships');
    // Must have forbidden industries OR required fields
    const hasDemandGuardrails =
      contract.demand.forbiddenIndustries.length > 0 ||
      contract.demand.requiredFields.length > 0;
    expect(hasDemandGuardrails).toBe(true);
  });

  it('has at least one enforceable supply filter', () => {
    const contract = getModeContract('enterprise_partnerships');
    // Must have forbidden industries OR default titles
    const hasSupplyGuardrails =
      contract.supply.forbiddenIndustries.length > 0 ||
      contract.supply.defaultTitles.length > 0;
    expect(hasSupplyGuardrails).toBe(true);
  });

  it('has deterministic filters marked true', () => {
    const contract = getModeContract('enterprise_partnerships');
    expect(contract.contracts.deterministicFilters).toBe(true);
  });

  it('forbids obvious lane-confusion industries on demand', () => {
    const contract = getModeContract('enterprise_partnerships');
    expect(contract.demand.forbiddenIndustries).toContain('Staffing and Recruiting');
  });

  it('forbids obvious lane-confusion industries on supply', () => {
    const contract = getModeContract('enterprise_partnerships');
    expect(contract.supply.forbiddenIndustries.length).toBeGreaterThan(3);
    expect(contract.supply.forbiddenIndustries).toContain('Staffing and Recruiting');
    expect(contract.supply.forbiddenIndustries).toContain('Executive Search');
  });
});

// =============================================================================
// TEST 6: Crypto — Broad Web3, no sub-niche differentiation
// =============================================================================

describe('Crypto Mode', () => {
  it('has correct label', () => {
    const contract = getModeContract('crypto');
    expect(contract.label).toBe('Crypto');
  });

  it('has broad vocabulary profile', () => {
    const contract = getModeContract('crypto');
    expect(contract.contracts.safeVocabularyProfile).toBe('broad');
  });

  it('accepts L1 protocol, exchange, tooling WITHOUT differentiation', () => {
    // Crypto mode should not differentiate between:
    // - L1 protocols (Ethereum, Solana)
    // - Exchanges (Coinbase, Binance)
    // - Tooling companies (Alchemy, Infura)
    // All are just "Blockchain" or "Cryptocurrency" companies
    const contract = getModeContract('crypto');

    // No sub-segment industries like 'Layer 2', 'DEX', 'CEX', 'Protocol'
    const hasSubNicheIndustries = contract.demand.allowedIndustries.some(i =>
      /layer\s*[12]/i.test(i) ||
      /DEX|CEX|exchange/i.test(i) ||
      /protocol/i.test(i) ||
      /infrastructure/i.test(i) ||
      /tooling/i.test(i)
    );
    expect(hasSubNicheIndustries).toBe(false);

    // Only broad categories
    expect(contract.demand.allowedIndustries).toContain('Blockchain');
    expect(contract.demand.allowedIndustries).toContain('Cryptocurrency');
    expect(contract.demand.allowedIndustries).toContain('Web3');
  });

  it('forbids fundraise/token claims without evidence', () => {
    const contract = getModeContract('crypto');
    expect(contract.vocabulary.forbidden).toContain('fundraise');
    expect(contract.vocabulary.forbidden).toContain('token launch');
    expect(contract.vocabulary.forbidden).toContain('listing');
    expect(contract.vocabulary.forbidden).toContain('TGE');
  });

  it('blocks copy with "fundraising" when no evidence', () => {
    const text = 'Hey John — noticed Acme Protocol is fundraising. Worth connecting?';
    const options: CopyValidationOptions = {
      mode: 'crypto',
      side: 'demand',
      evidence: emptyEvidenceSet(),
    };
    const result = validateCopy(text, options);
    expect(result.valid).toBe(false);
    expect(result.forbiddenWordsFound).toContain('fundraising');
  });

  it('blocks copy with "token launch" when no evidence', () => {
    const text = 'Hey John — heard about the token launch at Acme. Any interest?';
    const options: CopyValidationOptions = {
      mode: 'crypto',
      side: 'demand',
      evidence: emptyEvidenceSet(),
    };
    const result = validateCopy(text, options);
    expect(result.valid).toBe(false);
    expect(result.forbiddenWordsFound.some(w => w.toLowerCase().includes('token launch'))).toBe(true);
  });

  it('forbids staffing/consulting/marketing agencies', () => {
    const contract = getModeContract('crypto');
    expect(contract.demand.forbiddenIndustries).toContain('Marketing Agency');
    expect(contract.demand.forbiddenIndustries).toContain('Staffing and Recruiting');
    expect(contract.demand.forbiddenIndustries).toContain('Consulting');
  });

  it('has deterministic filters', () => {
    const contract = getModeContract('crypto');
    expect(contract.contracts.deterministicFilters).toBe(true);
  });

  it('has tooltip mentioning broad design and evidence', () => {
    const contract = getModeContract('crypto');
    const tooltip = contract.ui.tooltip.toLowerCase();
    expect(tooltip).toContain('broad');
    expect(tooltip).toContain('evidence');
  });
});

// =============================================================================
// TEST 7: Broad ICP Doctrine Compliance (ALL MODES)
// =============================================================================

describe('Broad ICP Doctrine', () => {
  const allModes = ['recruiting', 'biotech_licensing', 'wealth_management', 'real_estate_capital', 'enterprise_partnerships', 'crypto', 'custom'] as const;

  describe('No phase/stage gating in any mode', () => {
    it('Biotech has NO phase gating', () => {
      const contract = getModeContract('biotech_licensing');

      // No evidence rules for phase/stage
      const hasPhaseRules = contract.evidenceRules.some(r =>
        /phase|stage|clinical|trial/i.test(r.claim)
      );
      expect(hasPhaseRules).toBe(false);

      // No phase references in presignals
      const demandExamples = contract.presignalExamples.demand.join(' ').toLowerCase();
      expect(demandExamples).not.toContain('phase ii');
      expect(demandExamples).not.toContain('phase iii');
      expect(demandExamples).not.toContain('clinical stage');
    });

    it('No mode has Series A/B/C gating', () => {
      for (const modeId of allModes) {
        const contract = getModeContract(modeId);
        // Series references should only be in forbidden vocabulary (evidence-gated)
        // NOT in presignals or examples as actual filters
        const presignals = [
          ...contract.presignalExamples.demand,
          ...contract.presignalExamples.supply,
        ].join(' ').toLowerCase();
        expect(presignals).not.toContain('series a');
        expect(presignals).not.toContain('series b');
        expect(presignals).not.toContain('series c');
      }
    });
  });

  describe('No AUM/threshold logic in Wealth mode', () => {
    it('Wealth Management has NO AUM thresholds', () => {
      const contract = getModeContract('wealth_management');
      const tooltip = contract.ui.tooltip.toLowerCase();
      const presignals = [
        ...contract.presignalExamples.demand,
        ...contract.presignalExamples.supply,
      ].join(' ').toLowerCase();

      // No dollar amounts
      expect(presignals).not.toMatch(/\$\d+/);
      expect(presignals).not.toContain('aum');
      expect(presignals).not.toContain('hnw');
      expect(presignals).not.toContain('uhnw');

      // Tooltip confirms broad design
      expect(tooltip).toContain('broad');
      expect(tooltip).not.toContain('hnw');
    });
  });

  describe('No commercial vs residential logic in Real Estate mode', () => {
    it('Real Estate allows residential (not excluded)', () => {
      const contract = getModeContract('real_estate_capital');

      // Residential Real Estate should NOT be forbidden
      const residentialForbidden = contract.supply.forbiddenIndustries.some(i =>
        i.toLowerCase().includes('residential')
      );
      expect(residentialForbidden).toBe(false);

      // Tooltip should NOT reference property types
      const tooltip = contract.ui.tooltip.toLowerCase();
      expect(tooltip).not.toContain('commercial');
      expect(tooltip).not.toContain('multifamily');
    });

    it('Real Estate presignals have no dollar amounts', () => {
      const contract = getModeContract('real_estate_capital');
      const presignals = [
        ...contract.presignalExamples.demand,
        ...contract.presignalExamples.supply,
      ].join(' ');

      // No dollar amounts
      expect(presignals).not.toMatch(/\$\d+/);
    });
  });

  describe('No sub-niche UI controls', () => {
    for (const modeId of allModes) {
      it(`${modeId} has no sub-niche filter options`, () => {
        const contract = getModeContract(modeId);

        // allowedIndustries should be broad categories, not sub-niches
        // Note: "Commercial Real Estate" IS a valid LinkedIn high-level industry, not a sub-niche
        const hasSubNiches = contract.demand.allowedIndustries.some(i => {
          const lower = i.toLowerCase();
          return (
            /layer\s*[12]/i.test(lower) ||  // crypto sub-niche
            /phase\s*(i|ii|iii)/i.test(lower) ||  // biotech sub-niche
            /multifamily/i.test(lower) ||  // RE sub-niche (property type)
            /office\s+space/i.test(lower) ||  // RE sub-niche (property type)
            /series\s*[abc]/i.test(lower) ||  // stage sub-niche
            /early\s+stage/i.test(lower) ||  // stage sub-niche
            /growth\s+stage/i.test(lower)  // stage sub-niche
          );
        });
        expect(hasSubNiches).toBe(false);
      });
    }
  });

  describe('Industries are high-level only', () => {
    it('Biotech uses high-level industries', () => {
      const contract = getModeContract('biotech_licensing');
      const industries = contract.demand.allowedIndustries;

      expect(industries).toContain('Biotechnology');
      expect(industries).toContain('Pharmaceuticals');
      expect(industries).toContain('Life Sciences');

      // NOT sub-niches
      expect(industries).not.toContain('Gene Therapy');
      expect(industries).not.toContain('Cell Therapy');
      expect(industries).not.toContain('Oncology');
    });

    it('Crypto uses high-level industries', () => {
      const contract = getModeContract('crypto');
      const industries = contract.demand.allowedIndustries;

      expect(industries).toContain('Blockchain');
      expect(industries).toContain('Web3');
      expect(industries).toContain('Cryptocurrency');

      // NOT sub-niches
      expect(industries).not.toContain('Layer 2');
      expect(industries).not.toContain('DEX');
      expect(industries).not.toContain('NFT');
      expect(industries).not.toContain('Gaming');
    });
  });

  describe('Titles are role families, not specialties', () => {
    for (const modeId of allModes) {
      it(`${modeId} uses role families`, () => {
        const contract = getModeContract(modeId);
        const titles = [
          ...contract.demand.defaultTitles,
          ...contract.supply.defaultTitles,
        ];

        // Should have role families
        const hasRoleFamilies = titles.some(t => {
          const lower = t.toLowerCase();
          return (
            lower.includes('founder') ||
            lower.includes('ceo') ||
            lower.includes('vp') ||
            lower.includes('director') ||
            lower.includes('head of')
          );
        });
        // Custom mode may have empty titles (user configured)
        if (modeId !== 'custom') {
          expect(hasRoleFamilies).toBe(true);
        }
      });
    }
  });
});

// =============================================================================
// LABEL CONSISTENCY TESTS
// =============================================================================

describe('Mode Labels', () => {
  it('all modes have new labels', () => {
    const modes = getAvailableModes();
    const labels = modes.map(m => m.label);

    expect(labels).toContain('IT Recruitment');
    expect(labels).toContain('Biotech');
    expect(labels).toContain('Wealth Management');
    expect(labels).toContain('Real Estate');
    expect(labels).toContain('B2B (Broad)');
    expect(labels).toContain('Custom');
  });

  it('OLD labels are NOT present', () => {
    const modes = getAvailableModes();
    const labels = modes.map(m => m.label);

    expect(labels).not.toContain('Recruiting');
    expect(labels).not.toContain('Biotech Licensing');
    expect(labels).not.toContain('Real Estate Capital');
    expect(labels).not.toContain('Enterprise Partnerships');
  });
});

// =============================================================================
// VOCABULARY PROFILE TESTS
// =============================================================================

describe('Vocabulary Profiles', () => {
  it('strict modes: IT Recruitment, Biotech, Wealth, Real Estate', () => {
    const strictModes = ['recruiting', 'biotech_licensing', 'wealth_management', 'real_estate_capital'];
    for (const mode of strictModes) {
      const contract = getModeContract(mode as any);
      expect(contract.contracts.safeVocabularyProfile).toBe('strict');
    }
  });

  it('broad mode: B2B (Broad)', () => {
    const contract = getModeContract('enterprise_partnerships');
    expect(contract.contracts.safeVocabularyProfile).toBe('broad');
  });

  it('custom mode: Custom', () => {
    const contract = getModeContract('custom');
    expect(contract.contracts.safeVocabularyProfile).toBe('custom');
  });
});

// =============================================================================
// UI FIELD PRESENCE TESTS
// =============================================================================

describe('UI Education Fields', () => {
  const allModes = ['recruiting', 'biotech_licensing', 'wealth_management', 'real_estate_capital', 'enterprise_partnerships', 'crypto', 'custom'] as const;

  for (const modeId of allModes) {
    describe(`${modeId}`, () => {
      it('has tooltip', () => {
        const contract = getModeContract(modeId);
        expect(contract.ui.tooltip).toBeTruthy();
        expect(contract.ui.tooltip.length).toBeGreaterThan(10);
      });

      it('has whatItDoes', () => {
        const contract = getModeContract(modeId);
        expect(contract.ui.whatItDoes).toBeTruthy();
      });

      it('has whatItBlocks', () => {
        const contract = getModeContract(modeId);
        expect(contract.ui.whatItBlocks).toBeTruthy();
      });

      it('has supportedSources', () => {
        const contract = getModeContract(modeId);
        expect(contract.supportedSources).toBeDefined();
        expect(Array.isArray(contract.supportedSources)).toBe(true);
      });
    });
  }
});
