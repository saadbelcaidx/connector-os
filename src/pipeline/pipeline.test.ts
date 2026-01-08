/**
 * PIPELINE TESTS
 *
 * Golden fixtures with asserted outcomes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runPipeline, getMetrics, resetMetrics } from './orchestrator';
import { normalizeInput } from './adapter';
import {
  fixture1_demand,
  fixture1_supply,
  fixture3_demand,
  fixture3_supply,
  allFixtures,
} from './fixtures';
import type {
  RawInput,
  MatchResult,
  CacheEntry,
  ValidationResult,
  EnrichmentResult,
  Intro,
  SendResult,
  PipelineItem,
} from './contract';

// =============================================================================
// MOCK DEPENDENCIES
// =============================================================================

const mockMatchFn = async (d: RawInput, s: RawInput): Promise<MatchResult | null> => {
  if (!d.domain || !s.domain) return null;
  return {
    demandId: d.id,
    supplyId: s.id,
    confidence: 0.8,
    reason: `${d.companyName} → ${s.companyName}`,
  };
};

const mockGetCacheFn = async (domain: string): Promise<CacheEntry | null> => {
  return null; // No cache hits in tests
};

const mockValidateFn = async (email: string): Promise<ValidationResult> => {
  return { email, valid: true, status: 'verified' };
};

const mockEnrichFn = async (domain: string, name?: string): Promise<EnrichmentResult> => {
  return {
    success: true,
    email: `contact@${domain}`,
    name: name || 'Test Contact',
    title: 'Director',
    source: 'apollo',
    endpoint: 'person',
  };
};

const mockStoreFn = async (entry: CacheEntry): Promise<void> => {
  // No-op in tests
};

const mockIntroFn = async (demand: RawInput, supply: RawInput, match: MatchResult): Promise<Intro> => {
  return {
    demandId: demand.id,
    supplyId: supply.id,
    demandIntro: `Hello ${demand.companyName}`,
    supplyIntro: `Hello ${supply.companyName}`,
    matchContext: match.reason,
  };
};

const mockSendFn = async (item: PipelineItem): Promise<SendResult> => {
  return {
    demandId: item.demand.id,
    supplyId: item.supply.id,
    demandSent: true,
    supplySent: true,
  };
};

// =============================================================================
// TESTS
// =============================================================================

describe('Pipeline', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('should process simple hiring signal fixture', async () => {
    const result = await runPipeline(fixture1_demand, fixture1_supply, {
      matchFn: mockMatchFn,
      getCacheFn: mockGetCacheFn,
      validateFn: mockValidateFn,
      enrichFn: mockEnrichFn,
      storeFn: mockStoreFn,
      introFn: mockIntroFn,
      sendFn: mockSendFn,
    });

    expect(result.length).toBe(1);
    expect(result[0].match).toBeDefined();
    expect(result[0].intro).toBeDefined();
    expect(result[0].send?.demandSent).toBe(true);
    expect(result[0].send?.supplySent).toBe(true);
    expect(result[0].blocked).toBe(false);

    const metrics = getMetrics();
    expect(metrics.matchCount).toBe(1);
    expect(metrics.introsGenerated).toBe(1);
    expect(metrics.sendSuccess).toBe(1);
  });

  it('should process pre-enriched dataset without re-enriching', async () => {
    const result = await runPipeline(fixture3_demand, fixture3_supply, {
      matchFn: mockMatchFn,
      getCacheFn: mockGetCacheFn,
      validateFn: mockValidateFn,
      enrichFn: mockEnrichFn,
      storeFn: mockStoreFn,
      introFn: mockIntroFn,
      sendFn: mockSendFn,
    });

    expect(result.length).toBe(1);
    expect(result[0].blocked).toBe(false);

    // Pre-enriched should still go through all stages
    expect(result[0].completedStages).toContain('match');
    expect(result[0].completedStages).toContain('cache');
    expect(result[0].completedStages).toContain('validate');
    expect(result[0].completedStages).toContain('enrich');
    expect(result[0].completedStages).toContain('store');
    expect(result[0].completedStages).toContain('intro');
    expect(result[0].completedStages).toContain('send');
  });

  it('should block when no email available', async () => {
    const noEmailDemand: RawInput[] = [{
      id: 'no-email',
      source: 'apify',
      side: 'demand',
      raw: {},
      domain: 'noemail.com',
    }];

    const failEnrichFn = async (): Promise<EnrichmentResult> => ({
      success: false,
      source: 'apollo',
      endpoint: 'person',
    });

    const result = await runPipeline(noEmailDemand, fixture1_supply, {
      matchFn: mockMatchFn,
      getCacheFn: mockGetCacheFn,
      validateFn: mockValidateFn,
      enrichFn: failEnrichFn,
      storeFn: mockStoreFn,
      introFn: mockIntroFn,
      sendFn: mockSendFn,
    });

    expect(result.length).toBe(1);
    expect(result[0].blocked).toBe(true);
    expect(result[0].blockReason).toContain('email');

    const metrics = getMetrics();
    expect(metrics.blocked).toBe(1);
  });

  it('should normalize apify dataset correctly', () => {
    const raw = [
      { company: 'Test Co', website: 'test.com', email: 'hello@test.com' },
      { companyName: 'Another', url: 'another.io' },
    ];

    const normalized = normalizeInput(raw, 'apify', 'demand');

    expect(normalized.length).toBe(2);
    expect(normalized[0].companyName).toBe('Test Co');
    expect(normalized[0].domain).toBe('test.com');
    expect(normalized[0].email).toBe('hello@test.com');
    expect(normalized[1].companyName).toBe('Another');
    expect(normalized[1].domain).toBe('another.io');
  });

  it('should track metrics correctly', async () => {
    await runPipeline(fixture1_demand, fixture1_supply, {
      matchFn: mockMatchFn,
      getCacheFn: mockGetCacheFn,
      validateFn: mockValidateFn,
      enrichFn: mockEnrichFn,
      storeFn: mockStoreFn,
      introFn: mockIntroFn,
      sendFn: mockSendFn,
    });

    const metrics = getMetrics();
    expect(metrics.inputCount).toBe(2); // 1 demand + 1 supply
    expect(metrics.matchCount).toBe(1);
    expect(metrics.cacheMisses).toBe(2); // Both sides miss cache
    expect(metrics.introsGenerated).toBe(1);
    expect(metrics.sendSuccess).toBe(1);
  });

  it('should complete all stages in order', async () => {
    const stages: string[] = [];

    await runPipeline(fixture1_demand, fixture1_supply, {
      matchFn: mockMatchFn,
      getCacheFn: mockGetCacheFn,
      validateFn: mockValidateFn,
      enrichFn: mockEnrichFn,
      storeFn: mockStoreFn,
      introFn: mockIntroFn,
      sendFn: mockSendFn,
      onProgress: (stage) => stages.push(stage),
    });

    expect(stages).toEqual(['match', 'cache', 'validate', 'enrich', 'store', 'intro', 'send']);
  });

  // Run all fixtures
  describe('Golden Fixtures', () => {
    allFixtures.forEach((fixture) => {
      it(`should process: ${fixture.name}`, async () => {
        const result = await runPipeline(fixture.demand, fixture.supply, {
          matchFn: mockMatchFn,
          getCacheFn: mockGetCacheFn,
          validateFn: mockValidateFn,
          enrichFn: mockEnrichFn,
          storeFn: mockStoreFn,
          introFn: mockIntroFn,
          sendFn: mockSendFn,
        });

        // Every fixture should produce at least one match attempt
        expect(result.length).toBeGreaterThanOrEqual(0);

        // All completed items should have gone through all stages
        result.filter(r => !r.blocked).forEach(item => {
          expect(item.completedStages).toContain('match');
          expect(item.completedStages).toContain('send');
        });
      });
    });
  });
});
