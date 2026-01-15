/**
 * TEMPLATES — DTO SHAPING ONLY
 *
 * This file does ONE job: shape DTOs for the edge module.
 * NO copy logic. NO phrases. NO templates.
 *
 * All intro composition happens in src/edge/composeIntroWithEdge.ts
 */

import { NormalizedRecord } from '../schemas';
import { composeIntroWithEdge } from '../edge';
import type { IntroContext, Match } from '../edge';

// =============================================================================
// DTO SHAPING — Extract firstName + company, route to edge
// =============================================================================

/**
 * Shape demand DTO and route to edge module.
 */
export function generateDemandIntro(
  record: NormalizedRecord & { connectorMode?: string }
): string {
  const firstName = record.firstName || record.fullName?.split(' ')[0] || 'there';
  const company = record.company || 'a company';

  const ctx: IntroContext = {
    firstName,
    company,
    summary: null,
  };

  const match: Match = {
    mode: record.connectorMode || 'b2b_broad',
    demand: { domain: 'unknown', summary: null },
    supply: { domain: 'unknown', summary: null },
    edge: null,
  };

  const result = composeIntroWithEdge('demand', match, ctx);
  return result.intro || '';
}

/**
 * Shape supply DTO and route to edge module.
 */
export function generateSupplyIntro(
  provider: NormalizedRecord & { connectorMode?: string },
  bestDemandMatch: NormalizedRecord
): string {
  const firstName = provider.firstName || provider.fullName?.split(' ')[0] || 'there';
  const company = bestDemandMatch.company || 'a company';

  const ctx: IntroContext = {
    firstName,
    company,
    summary: null,
  };

  const match: Match = {
    mode: provider.connectorMode || 'b2b_broad',
    demand: { domain: 'unknown', summary: null },
    supply: { domain: 'unknown', summary: null },
    edge: null,
  };

  const result = composeIntroWithEdge('supply', match, ctx);
  return result.intro || '';
}

// =============================================================================
// VALIDATION — Structural only
// =============================================================================

export function isValidIntro(intro: string): boolean {
  if (!intro || intro.length < 20) return false;
  const lower = intro.toLowerCase();
  if (!lower.startsWith('hey') && !lower.startsWith('hi')) return false;
  if (!intro.includes('?')) return false;
  return true;
}
