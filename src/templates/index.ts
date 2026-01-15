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
 */
export function generateDemandIntro(record: NormalizedRecord & { connectorMode?: ConnectorMode; preSignalContext?: string }): string {
  const firstName = record.firstName || record.fullName?.split(' ')[0] || 'there';
  const company = record.company || 'your company';

  const ctx: IntroContext = {
    firstName,
    company,
    companyDescription: record.companyDescription || undefined,
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
 */
export function generateSupplyIntro(
  provider: NormalizedRecord & { connectorMode?: ConnectorMode; preSignalContext?: string },
  bestDemandMatch: NormalizedRecord
): string {
  const firstName = provider.firstName || provider.fullName?.split(' ')[0] || 'there';
  const company = bestDemandMatch.company || 'a company';

  // Build demandICP from demand match data (who the demand company is)
  const demandICP = buildDemandICP(bestDemandMatch);

  const ctx: IntroContext = {
    firstName,
    company,
    // Pass demand company description so supply knows who they're being connected to
    companyDescription: bestDemandMatch.companyDescription,
    demandICP,
    preSignalContext: provider.preSignalContext,
  };

  return composeIntro({
    side: 'supply',
    mode: provider.connectorMode || 'b2b_general',
    ctx,
  });
}

/**
 * Build a short ICP phrase from demand match data.
 * Examples: "a biotech scaling their BD team", "a fintech building out payments"
 */
function buildDemandICP(demand: NormalizedRecord): string | undefined {
  const parts: string[] = [];

  // Start with industry if available
  const industry = Array.isArray(demand.industry) ? demand.industry[0] : demand.industry;
  if (industry) {
    parts.push(`a ${industry.toLowerCase()}`);
  } else if (demand.company) {
    parts.push(demand.company);
  }

  // Add activity hint from signal or description
  if (demand.signalDetail) {
    // e.g., "hiring engineers" → "scaling their engineering team"
    const signal = demand.signalDetail.toLowerCase();
    if (signal.includes('hiring') || signal.includes('scaling')) {
      parts.push('scaling their team');
    } else if (signal.includes('funding') || signal.includes('raised')) {
      parts.push('in growth mode');
    }
  }

  return parts.length > 0 ? parts.join(' ') : undefined;
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
