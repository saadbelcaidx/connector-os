/**
 * Intro Builder — Context Bridge
 *
 * Maps Station V5 data (CanonicalInfo + MatchResult + EnrichmentResult)
 * into PairContext shape the engine needs.
 */

import type { PairContext } from './types';
import type { MatchResult, CanonicalInfo } from '../hooks/useMCPJob';
import type { Situation } from './situation';
import { SITUATION_FALLBACKS } from './situation';
import { extractFirstName } from './engine';

// =============================================================================
// BUILD PAIR CONTEXT
// =============================================================================

export function buildPairContext(
  match: MatchResult,
  canonicals: Map<string, CanonicalInfo>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supplyEnrichResult?: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  demandEnrichResult?: any,
  situation?: Situation,
): PairContext {
  const demandCanon = canonicals.get(match.demandKey);
  const supplyCanon = canonicals.get(match.supplyKey);

  const demandEntityType = demandCanon?.entityType || 'organization';
  const supplyEntityType = supplyCanon?.entityType || 'organization';

  return {
    demand: {
      company: demandCanon?.company || match.demandKey,
      wants: demandCanon?.wants || '',
      offers: demandCanon?.offers || '',
      who: demandCanon?.who || '',
      whyNow: demandCanon?.whyNow || '',
      industry: demandCanon?.industry || null,
      title: demandCanon?.title || null,
      domain: demandCanon?.domain || null,
      keywords: demandCanon?.keywords || [],
      entityType: demandEntityType,
      // Hierarchy: enrichment (verified contact) → upstream who (person entity) → "there"
      firstName: demandEnrichResult?.firstName || (demandEntityType === 'person' ? extractFirstName(demandCanon?.who || '') : '') || 'there',
      lastName: demandEnrichResult?.lastName || '',
      email: demandEnrichResult?.email || null,
    },
    supply: {
      company: supplyCanon?.company || match.supplyKey,
      wants: supplyCanon?.wants || '',
      offers: supplyCanon?.offers || '',
      who: supplyCanon?.who || '',
      whyNow: supplyCanon?.whyNow || '',
      industry: supplyCanon?.industry || null,
      title: supplyCanon?.title || null,
      domain: supplyCanon?.domain || null,
      keywords: supplyCanon?.keywords || [],
      entityType: supplyEntityType,
      // Hierarchy: enrichment (verified contact) → upstream who (person entity) → "there"
      firstName: supplyEnrichResult?.firstName || (supplyEntityType === 'person' ? extractFirstName(supplyCanon?.who || '') : '') || 'there',
      lastName: supplyEnrichResult?.lastName || '',
      email: supplyEnrichResult?.email || null,
      contactTitle: supplyEnrichResult?.title || supplyCanon?.title || undefined,
      city: supplyEnrichResult?.city || undefined,
      state: supplyEnrichResult?.state || undefined,
      linkedinUrl: supplyEnrichResult?.linkedinUrl || null,
    },
    match: {
      combined: match.scores.combined,
      fit: match.scores.fit,
      timing: match.scores.timing,
      classification: match.classification,
      framing: match.framing || '',
      reasoning: match.reasoning || '',
    },
    situation: situation || { ...SITUATION_FALLBACKS },
  };
}

// =============================================================================
// ENRICHMENT HELPERS
// =============================================================================

function sideIsEnriched(side: any): boolean {
  return side && typeof side === 'object' && side.outcome === 'ENRICHED' && side.email;
}

/** Get pairs that have at least one enriched side (supply or demand with email) */
export function getEnrichedPairs(
  matches: MatchResult[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enrichResults: Map<string, any>,
): MatchResult[] {
  return matches.filter(m => {
    const r = enrichResults.get(m.evalId);
    if (!r || typeof r !== 'object') return false;
    return sideIsEnriched(r.supply) || sideIsEnriched(r.demand);
  });
}

/** Get pairs where the DEMAND side has an enriched email.
 *  In fulfillment mode, supply IS the client — no cold email needed for supply.
 *  Only demand contacts need enriched emails to receive outreach. */
export function getDemandEnrichedPairs(
  matches: MatchResult[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enrichResults: Map<string, any>,
): MatchResult[] {
  return matches.filter(m => {
    const r = enrichResults.get(m.evalId);
    if (!r || typeof r !== 'object') return false;
    return sideIsEnriched(r.demand);
  });
}

/** Count enrichment status across all matches — per side */
export function countEnrichmentStatus(
  matches: MatchResult[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enrichResults: Map<string, any>,
): { supplyEnriched: number; demandEnriched: number; eitherEnriched: number; total: number } {
  let supplyEnriched = 0;
  let demandEnriched = 0;
  let eitherEnriched = 0;
  for (const m of matches) {
    const r = enrichResults.get(m.evalId);
    if (r && typeof r === 'object') {
      const s = sideIsEnriched(r.supply);
      const d = sideIsEnriched(r.demand);
      if (s) supplyEnriched++;
      if (d) demandEnriched++;
      if (s || d) eitherEnriched++;
    }
  }
  return { supplyEnriched, demandEnriched, eitherEnriched, total: matches.length };
}
