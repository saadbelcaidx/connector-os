/**
 * applyOverlayV2 — V2 overlay filter engine (Client Lens Architecture)
 *
 * Three clean layers:
 *   Layer 1: Opportunity Quality (MCP) — scores.combined, UNTOUCHED
 *   Layer 2: Visibility (Hard Filters) — include/exclude: industry, title, company, signal group
 *   Layer 3: Client Relevance (Bounded Nudge) — directional ICP alignment, +0.05 max
 *
 * finalScore = scores.combined + min(relevanceNudge, 0.05)
 *
 * What's removed vs V1: lensHits, keyword phrase extraction, text blob matching,
 * tier boost, signalPreferences nudge.
 */

import type { MatchResult, CanonicalInfo } from '../hooks/useMCPJob';
import type { OverlaySpec, ClientProfile } from '../../types/station';

// =============================================================================
// TYPES
// =============================================================================

export interface OverlayV2Result {
  match: MatchResult;
  finalScore: number;       // scores.combined + bounded relevance nudge
  excluded: boolean;        // hard-filtered out by overlay
  excludeReason?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

/** Normalize for comparison — lowercase, trim, strip trailing 's' for basic plural. */
function norm(s: string): string {
  return s.toLowerCase().trim().replace(/s$/, '');
}

/** Check if a canonical field matches any filter value (bidirectional substring). */
function fieldMatches(field: string | null | undefined, values: string[]): boolean {
  if (!field || !values.length) return false;
  const f = norm(field);
  return values.some(v => f.includes(norm(v)) || norm(v).includes(f));
}

// =============================================================================
// MAIN
// =============================================================================

export function applyOverlayV2(
  matches: MatchResult[],
  canonicals: Map<string, CanonicalInfo>,
  overlay: OverlaySpec,
  profile?: ClientProfile,
  clientEconomicSide?: 'demand' | 'supply',
  clientKey?: string,
): OverlayV2Result[] {
  const f = overlay.filters;

  const results: OverlayV2Result[] = [];

  for (const match of matches) {
    // ── Layer 0: Pair Membership ──
    // When a client key is active, only pairs where the client IS one side survive.
    // Without this, market pairs (Talos × Tradebot) leak through when lens = TwinFocus.
    if (clientKey) {
      if (match.demandKey !== clientKey && match.supplyKey !== clientKey) {
        results.push({ match, finalScore: 0, excluded: true, excludeReason: 'not a client pair' });
        continue;
      }
    }

    const demandCanon = canonicals.get(match.demandKey);
    const supplyCanon = canonicals.get(match.supplyKey);

    // ── Missing canonical guard (Invariant 3) ──
    // During streaming race, unhydrated matches pass at raw MCP score.
    // useMemo re-runs once canonicals load.
    if (!demandCanon || !supplyCanon) {
      results.push({ match, finalScore: match.scores.combined, excluded: false });
      continue;
    }

    // ── Layer 2: Hard filters ──

    let excluded = false;
    let reason = '';

    // Exclude — companies
    if (!excluded && f.exclude.companies?.length) {
      if (fieldMatches(demandCanon.company, f.exclude.companies) ||
          fieldMatches(supplyCanon.company, f.exclude.companies)) {
        excluded = true;
        reason = 'excluded company';
      }
    }

    // Exclude — industries
    if (!excluded && f.exclude.industries?.length) {
      if (fieldMatches(demandCanon.industry, f.exclude.industries) ||
          fieldMatches(supplyCanon.industry, f.exclude.industries)) {
        excluded = true;
        reason = 'excluded industry';
      }
    }

    // Exclude — titles
    if (!excluded && f.exclude.titles?.length) {
      if (fieldMatches(demandCanon.title, f.exclude.titles) ||
          fieldMatches(supplyCanon.title, f.exclude.titles)) {
        excluded = true;
        reason = 'excluded title';
      }
    }

    // Exclude — signal groups
    if (!excluded && f.exclude.signalGroups?.length) {
      const dsg = demandCanon.signalGroup || 'unknown';
      if (f.exclude.signalGroups.includes(dsg)) {
        excluded = true;
        reason = 'excluded signal group';
      }
    }

    // Include — industries (if set, at least one side must match)
    // null field = unknown → filter inapplicable when NEITHER side has data
    if (!excluded && f.include.industries?.length) {
      if (demandCanon.industry || supplyCanon.industry) {
        const demandHit = fieldMatches(demandCanon.industry, f.include.industries);
        const supplyHit = fieldMatches(supplyCanon.industry, f.include.industries);
        if (!demandHit && !supplyHit) {
          excluded = true;
          reason = 'no industry match';
        }
      }
    }

    // Include — titles (if set, at least one side must match)
    // null field = unknown → filter inapplicable when NEITHER side has data
    if (!excluded && f.include.titles?.length) {
      if (demandCanon.title || supplyCanon.title) {
        const demandHit = fieldMatches(demandCanon.title, f.include.titles);
        const supplyHit = fieldMatches(supplyCanon.title, f.include.titles);
        if (!demandHit && !supplyHit) {
          excluded = true;
          reason = 'no title match';
        }
      }
    }

    // Include — signal groups (if set, demand signal group must be in list)
    // null/undefined signalGroup → normalized to 'unknown' for filter comparison.
    // If operator deselected "Unknown", unclassified matches are hidden.
    // Note: empty array [] means "none selected" — exclude everything.
    // undefined means "no filter" — show everything.
    if (!excluded && f.include.signalGroups) {
      const dsg = demandCanon.signalGroup || 'unknown';
      if (!f.include.signalGroups.includes(dsg)) {
        excluded = true;
        reason = 'signal group not included';
      }
    }

    if (excluded) {
      results.push({ match, finalScore: 0, excluded: true, excludeReason: reason });
      continue;
    }

    // ── Layer 3: Client Relevance (Bounded Nudge) ──
    // Check the OPPOSITE side from client's economic role.
    // If client is demand-side, ICP describes supply they want to reach → check supply canonical.
    // If client is supply-side → check demand canonical. Default: no nudge.
    let nudge = 0;

    if (profile && clientEconomicSide) {
      const targetCanon = clientEconomicSide === 'demand' ? supplyCanon : demandCanon;

      if (profile.icpTitles?.length && targetCanon.title) {
        if (fieldMatches(targetCanon.title, profile.icpTitles)) nudge += 0.02;
      }

      if (profile.icpIndustries?.length && targetCanon.industry) {
        if (fieldMatches(targetCanon.industry, profile.icpIndustries)) nudge += 0.02;
      }
    }

    const finalScore = match.scores.combined + Math.min(nudge, 0.05);

    results.push({ match, finalScore, excluded: false });
  }

  // Sort by finalScore descending (excluded stay at bottom)
  results.sort((a, b) => {
    if (a.excluded && !b.excluded) return 1;
    if (!a.excluded && b.excluded) return -1;
    return b.finalScore - a.finalScore;
  });

  return results;
}
