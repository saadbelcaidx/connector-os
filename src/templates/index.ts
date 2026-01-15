/**
 * TEMPLATES — PHASE 3 CANONICAL WRAPPERS
 *
 * All intro generation now routes through introDoctrine.ts.
 * These are thin wrappers that preserve function signatures for backwards compatibility.
 *
 * NO string templates allowed in this file.
 * NO timing defaults allowed in this file.
 */

import { NormalizedRecord } from '../schemas';
import { composeIntro, IntroContext, ConnectorMode } from '../copy/introDoctrine';

// =============================================================================
// DEMAND TEMPLATE — Routes to canonical doctrine
// =============================================================================

/**
 * Intro to DEMAND side (company hiring).
 * PHASE 3: Now routes through introDoctrine.composeIntro()
 *
 * demandType gates pain injection (e.g., crypto pain only for crypto_platform/fintech_platform/exchange)
 */
export function generateDemandIntro(
  record: NormalizedRecord & {
    connectorMode?: ConnectorMode;
    preSignalContext?: string;
    demandType?: { type?: string } | string;  // Gates pain injection
  }
): string {
  const firstName = record.firstName || record.fullName?.split(' ')[0] || 'there';
  const company = record.company || 'your company';

  const ctx: IntroContext = {
    firstName,
    company,
    companyDescription: record.companyDescription || undefined,
    demandType: record.demandType,  // For pain gating
    preSignalContext: record.preSignalContext,
  };

  return composeIntro({
    side: 'demand',
    mode: record.connectorMode || 'b2b_general',
    ctx,
  });
}

// =============================================================================
// SUPPLY TEMPLATE — Routes to canonical doctrine
// =============================================================================

/**
 * Intro to SUPPLY side (recruiter/agency).
 * PHASE 3: Now routes through introDoctrine.composeIntro()
 *
 * demandType comes from narrative.supplyRole or mode fallback.
 * NEVER from contact title or signal.
 */
export function generateSupplyIntro(
  provider: NormalizedRecord & { connectorMode?: ConnectorMode; preSignalContext?: string },
  bestDemandMatch: NormalizedRecord,
  demandType?: string  // From narrative.supplyRole - NOT from title/signal
): string {
  const firstName = provider.firstName || provider.fullName?.split(' ')[0] || 'there';
  const company = bestDemandMatch.company || 'a company';

  const ctx: IntroContext = {
    firstName,
    company,
    // demandType from COS (narrative.supplyRole) or undefined for mode fallback
    demandType: demandType || undefined,
    preSignalContext: provider.preSignalContext,
  };

  return composeIntro({
    side: 'supply',
    mode: provider.connectorMode || 'b2b_general',
    ctx,
  });
}

// =============================================================================
// HELPERS — Validation only (no generation logic)
// =============================================================================

/**
 * Check if an intro is valid.
 */
export function isValidIntro(intro: string): boolean {
  if (!intro || intro.length < 20) return false;
  const lower = intro.toLowerCase();
  // Accept both "hey" and "hi" starters
  if (!lower.startsWith('hey') && !lower.startsWith('hi')) return false;
  if (!intro.includes('?')) return false;
  return true;
}
