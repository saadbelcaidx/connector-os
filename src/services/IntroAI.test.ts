/**
 * IntroAI — Funding Hallucination Bug Test
 *
 * Stripe doctrine: test before fix, observe the bug
 */

import { describe, it, expect } from 'vitest';

// Inline the prompt builder to test it (extracted from IntroAI.ts)
function buildStep2PromptExtract(fundingUsd: number | null | undefined): string {
  const fundingAmount = fundingUsd
    ? `$${(fundingUsd / 1000000).toFixed(0)}M`
    : null;

  // CURRENT BEHAVIOR (line 161)
  const currentBehavior = `- Funding: ${fundingAmount || 'raised funding'}`;

  return currentBehavior;
}

function buildStep2PromptFixed(fundingUsd: number | null | undefined): string {
  const fundingAmount = fundingUsd
    ? `$${(fundingUsd / 1000000).toFixed(0)}M`
    : null;

  // FIXED BEHAVIOR - only include if data exists
  const fixedBehavior = fundingAmount ? `- Funding: ${fundingAmount}` : '';

  return fixedBehavior;
}

describe('IntroAI Funding Bug', () => {
  it('CURRENT: hallucinates "raised funding" when no funding data', () => {
    const result = buildStep2PromptExtract(null);

    // This is the BUG - it says "raised funding" even with no data
    expect(result).toBe('- Funding: raised funding');
  });

  it('CURRENT: works correctly when funding exists', () => {
    const result = buildStep2PromptExtract(28000000); // $28M

    expect(result).toBe('- Funding: $28M');
  });

  it('FIXED: returns empty string when no funding data', () => {
    const result = buildStep2PromptFixed(null);

    // No hallucination - empty string
    expect(result).toBe('');
  });

  it('FIXED: works correctly when funding exists', () => {
    const result = buildStep2PromptFixed(28000000); // $28M

    expect(result).toBe('- Funding: $28M');
  });
});
