/**
 * ranking.ts — Deterministic overlay ranking engine (V1 client-side)
 *
 * Pure functions only. No side effects. No React imports.
 * Doctrine: same inputs + same overlay = same rank order. Guaranteed.
 *
 * §6 of Fulfillment Overlay Architecture Plan
 *
 * rank_score = base_score
 *   + tierBoost[tier]
 *   + signalWeight[demand.signalKind]
 *   + titleMatch * titleHit
 *   + industryMatch * industryHit
 *   + domainPresent * (demand.domain?1:0)
 *   + emailPresent * (demand.email?1:0) + emailPresent*(supply.email?1:0)
 *   + recencyBoost
 */

import type { Match } from '../matching/index';
import type {
  OverlaySpec,
  OverlayFilters,
  OverlayWeights,
  OverlayExclusions,
} from '../types/station';

// =============================================================================
// PUBLIC INTERFACES
// =============================================================================

export interface RankExplanation {
  baseScore: number;
  tierBoost: number;
  signalWeightBoost: number;
  titleMatchBoost: number;
  industryMatchBoost: number;
  domainPresentBoost: number;
  emailPresentBoost: number;
  recencyBoost: number;
  // Gating
  gatingPass: boolean;
  gatingFailReason?: string;
  // Supply diversity
  supplyExhausted: boolean;
  supplyUsageCount: number;
  // Source metadata
  capabilitySource: 'pack_economicRole' | 'recordIntel' | 'fallback';
  signalSource: 'intel' | 'raw' | 'fallback';
}

export interface RankResult {
  included: boolean;
  excludedReason?: string;
  rankScore: number;
  explanation: RankExplanation;
}

export interface RankedMatchEntry {
  matchIndex: number;
  match: Match;
  result: RankResult;
}

// =============================================================================
// DEFAULT OVERLAY — spec §5.1 defaults
// =============================================================================

export function defaultOverlay(): OverlaySpec {
  return {
    filters: {
      include: {},
      exclude: {},
    },
    weights: {
      signalWeight: {
        hiring: 3,
        funding: 2,
        expansion: 1,
      },
      titleMatch: 4,
      industryMatch: 2,
      domainPresent: 1,
      emailPresent: 2,
      tierBoost: {
        strong: 5,
        good: 2,
        open: 0,
      },
      recencyDays: {
        '0_7': 3,
        '8_30': 1,
        '31_90': 0,
      },
    },
    exclusions: {
      supplyMaxUsagePerRun: 5,
      blockIfMissingDomainWhenOnlyConnectorAgent: false,
    },
    routing: {
      anonymizeDemandOnSupply: true,
      anonymizeSupplyOnDemand: true,
    },
  };
}

// =============================================================================
// GATING — §6.2 hard filters
// Returns null if passes, or a string reason if excluded.
// =============================================================================

function applyGates(
  match: Match,
  filters: OverlayFilters,
  exclusions: OverlayExclusions,
): string | null {
  const { include, exclude } = filters;
  const demand = match.demand;
  const supply = match.supply;

  // --- §6.2 ConnectorAgent-only domain gate ---
  // When this flag is true, demand records without a domain cannot be enriched
  // and must be excluded from the ranked set.
  if (exclusions.blockIfMissingDomainWhenOnlyConnectorAgent && !demand.domain) {
    return `demand record missing domain (blockIfMissingDomain gate active)`;
  }

  // --- Exclude gates ---

  // Exclude by company name (demand or supply)
  if (exclude.companies?.length) {
    const excl = exclude.companies.map(c => c.toLowerCase());
    if (excl.includes(demand.company?.toLowerCase() ?? '')) {
      return `demand company "${demand.company}" is in exclusion list`;
    }
    if (excl.includes(supply.company?.toLowerCase() ?? '')) {
      return `supply company "${supply.company}" is in exclusion list`;
    }
  }

  // Exclude by industry (demand AND supply)
  if (exclude.industries?.length) {
    const exclInd = exclude.industries.map(i => i.toLowerCase());
    if (demand.industry && exclInd.includes(demand.industry.toLowerCase())) {
      return `demand industry "${demand.industry}" is excluded`;
    }
    if (supply.industry && exclInd.includes(supply.industry.toLowerCase())) {
      return `supply industry "${supply.industry}" is excluded`;
    }
  }

  // Exclude by title (demand side + supply side)
  if (exclude.titles?.length) {
    const exclTitles = exclude.titles.map(t => t.toLowerCase());
    const demandTitle = demand.title?.toLowerCase() ?? '';
    if (demandTitle && exclTitles.some(t => demandTitle.includes(t))) {
      return `demand title "${demand.title}" is excluded`;
    }
    // C2: supply-side title exclusion
    const supplyTitle = (supply as any).title?.toLowerCase() ?? '';
    if (supplyTitle && exclTitles.some(t => supplyTitle.includes(t))) {
      return `supply title "${(supply as any).title}" is excluded`;
    }
  }

  // Exclude by signal (demand side + supply side)
  if (exclude.signals?.length) {
    const exclSigs = exclude.signals.map(s => s.toLowerCase());
    const demandSignal = demand.signal?.toLowerCase() ?? '';
    if (demandSignal && exclSigs.some(s => demandSignal.includes(s))) {
      return `demand signal "${demand.signal}" is excluded`;
    }
    // C2: supply-side signal exclusion
    const supplySignal = (supply as any).signal?.toLowerCase() ?? '';
    if (supplySignal && exclSigs.some(s => supplySignal.includes(s))) {
      return `supply signal "${(supply as any).signal}" is excluded`;
    }
  }

  // --- Include gates (if specified, record must match at least one) ---

  // Industry include
  if (include.industries?.length) {
    const incInd = include.industries.map(i => i.toLowerCase());
    const demandInd = demand.industry?.toLowerCase() ?? '';
    const supplyInd = supply.industry?.toLowerCase() ?? '';
    const demandMatch = incInd.some(i => demandInd.includes(i) || i.includes(demandInd));
    const supplyMatch = incInd.some(i => supplyInd.includes(i) || i.includes(supplyInd));
    // Demand OR supply must match an included industry
    if (!demandMatch && !supplyMatch) {
      return `neither party matches included industries [${include.industries.join(', ')}]`;
    }
  }

  // Signal include
  if (include.signals?.length) {
    const incSigs = include.signals.map(s => s.toLowerCase());
    const demandSignal = demand.signal?.toLowerCase() ?? '';
    const sigKind = demand.signalMeta?.kind?.toLowerCase() ?? '';
    if (!incSigs.some(s => demandSignal.includes(s) || sigKind.includes(s))) {
      return `demand signal "${demand.signal}" not in included signals`;
    }
  }

  // Title include (demand side)
  // H7 fix: records with no title also fail the title include gate — remove the
  // `demandTitle &&` bypass that was silently passing title-less records.
  if (include.titles?.length) {
    const incTitles = include.titles.map(t => t.toLowerCase());
    const demandTitle = demand.title?.toLowerCase() ?? '';
    if (!incTitles.some(t => demandTitle.includes(t) || t.includes(demandTitle))) {
      return `demand title "${demand.title ?? '(none)'}" not in included titles`;
    }
  }

  // Employee range (demand company)
  if (include.employeeRange) {
    const [min, max] = include.employeeRange;
    if (min > 0 || max > 0) {
      const sizeRaw = demand.size;
      // size may be a string ("50"), a number, or a string[] — handle all
      const size = Array.isArray(sizeRaw)
        ? parseInt(sizeRaw[0] ?? '0', 10)
        : typeof sizeRaw === 'string'
          ? parseInt(sizeRaw, 10)
          : typeof sizeRaw === 'number'
            ? sizeRaw
            : 0;
      if (size > 0 && (size < min || (max > 0 && size > max))) {
        return `demand company size ${size} outside range [${min}, ${max}]`;
      }
    }
  }

  // C3: Geo include (best-effort — checks location/country fields if present)
  // Pass silently if no geo data is available on the record (cannot gate what we lack).
  if (include.geo?.length) {
    const incGeo = include.geo.map(g => g.toLowerCase());
    const demandLocation = (demand as any).location?.toLowerCase() ?? '';
    const demandCountry = (demand as any).country?.toLowerCase() ?? '';
    const rawGeo = (demand.raw as any)?.location?.toLowerCase()
      ?? (demand.raw as any)?.country?.toLowerCase()
      ?? '';
    const geoStr = [demandLocation, demandCountry, rawGeo]
      .filter(Boolean)
      .join(' ')
      .trim();
    // Only gate if we have geo data — no-op when absent (V1 records may not carry geo)
    if (geoStr && !incGeo.some(g => geoStr.includes(g))) {
      return `demand location "${geoStr}" not in included geo [${include.geo.join(', ')}]`;
    }
  }

  // C4: Revenue range include (best-effort — checks raw.revenue if present)
  // Pass silently if revenue data is absent on the record.
  if (include.revenueRange) {
    const [min, max] = include.revenueRange;
    if (min > 0 || max > 0) {
      const rawRevenue =
        (demand.raw as any)?.revenue
        ?? (demand as any).revenue
        ?? null;
      if (rawRevenue !== null) {
        const revenue = typeof rawRevenue === 'string'
          ? parseFloat(rawRevenue.replace(/[^0-9.]/g, ''))
          : typeof rawRevenue === 'number'
            ? rawRevenue
            : 0;
        if (revenue > 0 && (revenue < min || (max > 0 && revenue > max))) {
          return `demand company revenue ${revenue} outside range [${min}, ${max}]`;
        }
      }
      // If no revenue data, pass — cannot gate what we don't have
    }
  }

  return null; // passes all gates
}

// =============================================================================
// SIGNAL KIND EXTRACTION — maps signal text to overlay weight keys
// =============================================================================

function extractSignalKind(match: Match): string {
  // signalMeta.kind is canonical (GROWTH, HIRING, FUNDING, etc.)
  const kind = match.demand.signalMeta?.kind?.toLowerCase() ?? '';
  if (kind) return kind;

  // Fallback: parse from signal label
  const sig = match.demand.signal?.toLowerCase() ?? '';
  if (sig.includes('hir') || sig.includes('job') || sig.includes('recruit')) return 'hiring';
  if (sig.includes('fund') || sig.includes('series') || sig.includes('rais')) return 'funding';
  if (sig.includes('expan') || sig.includes('growth') || sig.includes('launch')) return 'expansion';
  return 'growth';
}

// =============================================================================
// TITLE HIT — does demand title match any included title from overlay?
// H1 fix: accepts targets array directly — no mutation of the weights object.
// =============================================================================

function titleHit(match: Match, includedTitles: string[]): boolean {
  if (!includedTitles.length) return false;
  const demandTitle = match.demand.title?.toLowerCase() ?? '';
  if (!demandTitle) return false;
  return includedTitles.some(t => demandTitle.includes(t.toLowerCase()));
}

// =============================================================================
// INDUSTRY HIT — does demand or supply industry match any included industry?
// H1 fix: accepts targets array directly — no mutation of the weights object.
// =============================================================================

function industryHit(match: Match, includedIndustries: string[]): boolean {
  if (!includedIndustries.length) return false;
  const demandInd = match.demand.industry?.toLowerCase() ?? '';
  const supplyInd = match.supply.industry?.toLowerCase() ?? '';
  return includedIndustries.some(
    i => demandInd.includes(i.toLowerCase()) || supplyInd.includes(i.toLowerCase())
  );
}

// =============================================================================
// RECENCY BOOST — based on runCreatedAt vs record ingestion
// V1: records don't carry timestamps, so recency defaults to 0 unless
// a future version passes signalMeta.date or similar.
// =============================================================================

function computeRecencyBoost(match: Match, weights: OverlayWeights, runCreatedAt?: string): number {
  const recencyConfig = weights.recencyDays;
  if (!recencyConfig || !runCreatedAt) return 0;

  // Try to find a date from signalMeta or raw
  const rawDate =
    (match.demand.signalMeta as any)?.date ??
    (match.demand.raw as any)?.date ??
    (match.demand.raw as any)?.published_at ??
    null;

  if (!rawDate) return 0;

  try {
    const signalDate = new Date(rawDate as string);
    const runDate = new Date(runCreatedAt);
    const diffDays = (runDate.getTime() - signalDate.getTime()) / (1000 * 60 * 60 * 24);

    if (diffDays <= 7) return recencyConfig['0_7'] ?? 0;
    if (diffDays <= 30) return recencyConfig['8_30'] ?? 0;
    if (diffDays <= 90) return recencyConfig['31_90'] ?? 0;
    return 0;
  } catch {
    return 0;
  }
}

// =============================================================================
// CAPABILITY SOURCE — §10 observability metadata
// =============================================================================

function detectCapabilitySource(match: Match): RankExplanation['capabilitySource'] {
  if (match.supply.packId) return 'pack_economicRole';
  if (match.supply.companyDescription || (match.supply as any).capability) return 'recordIntel';
  return 'fallback';
}

function detectSignalSource(match: Match): RankExplanation['signalSource'] {
  if (match.demand.signalMeta?.kind) return 'intel';
  if (match.demand.signal) return 'raw';
  return 'fallback';
}

// =============================================================================
// APPLY OVERLAY — core deterministic ranking function
//
// supplyUsage: mutable Map<supplyRecordKey, usageCount> — caller accumulates
// across ranked items for the diversity guard.
// =============================================================================

export function applyOverlay(
  match: Match,
  overlay: OverlaySpec,
  supplyUsage: Map<string, number>,
  runCreatedAt?: string,
): RankResult {
  const w = overlay.weights;
  const supplyKey = match.supply.recordKey;

  // --- 1. Hard gate ---
  const gatingFailReason = applyGates(match, overlay.filters, overlay.exclusions);
  if (gatingFailReason) {
    return {
      included: false,
      excludedReason: gatingFailReason,
      rankScore: 0,
      explanation: {
        baseScore: match.score,
        tierBoost: 0,
        signalWeightBoost: 0,
        titleMatchBoost: 0,
        industryMatchBoost: 0,
        domainPresentBoost: 0,
        emailPresentBoost: 0,
        recencyBoost: 0,
        gatingPass: false,
        gatingFailReason,
        supplyExhausted: false,
        supplyUsageCount: supplyUsage.get(supplyKey) ?? 0,
        capabilitySource: detectCapabilitySource(match),
        signalSource: detectSignalSource(match),
      },
    };
  }

  // --- 2. Supply diversity guard (§6.4) ---
  const currentUsage = supplyUsage.get(supplyKey) ?? 0;
  const maxUsage = overlay.exclusions.supplyMaxUsagePerRun ?? 5;
  if (currentUsage >= maxUsage) {
    return {
      included: false,
      excludedReason: `supply_exhausted: "${match.supply.company}" used ${currentUsage}/${maxUsage} times in this ranked set`,
      rankScore: 0,
      explanation: {
        baseScore: match.score,
        tierBoost: 0,
        signalWeightBoost: 0,
        titleMatchBoost: 0,
        industryMatchBoost: 0,
        domainPresentBoost: 0,
        emailPresentBoost: 0,
        recencyBoost: 0,
        gatingPass: true,
        supplyExhausted: true,
        supplyUsageCount: currentUsage,
        capabilitySource: detectCapabilitySource(match),
        signalSource: detectSignalSource(match),
      },
    };
  }

  // --- 3. Score components ---
  const baseScore = match.score; // 0-100

  // Tier boost
  const tierBoostMap = w.tierBoost ?? { strong: 5, good: 2, open: 0 };
  const tierBoost = tierBoostMap[match.tier] ?? 0;

  // Signal weight
  const signalKind = extractSignalKind(match);
  const signalWeightMap = w.signalWeight ?? {};
  const signalWeightBoost = signalWeightMap[signalKind] ?? 0;

  // Title match — derive targets from overlay.filters; no weights-object mutation (H1 fix)
  const titleTargets = overlay.filters.include.titles ?? [];
  const titleMatchWeight = w.titleMatch ?? 0;
  const titleMatchBoost = titleHit(match, titleTargets) ? titleMatchWeight : 0;

  // Industry match — derive targets from overlay.filters; no weights-object mutation (H1 fix)
  const industryTargets = overlay.filters.include.industries ?? [];
  const industryMatchWeight = w.industryMatch ?? 0;
  const industryMatchBoost = industryHit(match, industryTargets) ? industryMatchWeight : 0;

  // Domain present
  const domainPresentWeight = w.domainPresent ?? 0;
  const domainPresentBoost = domainPresentWeight * (match.demand.domain ? 1 : 0);

  // Email present (both sides)
  const emailPresentWeight = w.emailPresent ?? 0;
  const demandEmailScore = match.demand.email ? emailPresentWeight : 0;
  const supplyEmailScore = match.supply.email ? emailPresentWeight : 0;
  const emailPresentBoost = demandEmailScore + supplyEmailScore;

  // Recency boost
  const recencyBoost = computeRecencyBoost(match, w, runCreatedAt);

  // --- 4. Final rank score ---
  const rankScore =
    baseScore +
    tierBoost +
    signalWeightBoost +
    titleMatchBoost +
    industryMatchBoost +
    domainPresentBoost +
    emailPresentBoost +
    recencyBoost;

  // --- 5. Accumulate supply usage (side effect — caller's Map is updated) ---
  supplyUsage.set(supplyKey, currentUsage + 1);

  return {
    included: true,
    rankScore,
    explanation: {
      baseScore,
      tierBoost,
      signalWeightBoost,
      titleMatchBoost,
      industryMatchBoost,
      domainPresentBoost,
      emailPresentBoost,
      recencyBoost,
      gatingPass: true,
      supplyExhausted: false,
      supplyUsageCount: currentUsage + 1,
      capabilitySource: detectCapabilitySource(match),
      signalSource: detectSignalSource(match),
    },
  };
}

// =============================================================================
// RANK ALL MATCHES — deterministic sort of full match list
//
// Returns all entries (included and excluded) sorted by:
//   1. included first
//   2. rankScore descending
//   3. matchIndex ascending (stable tie-break)
// =============================================================================

export function rankAllMatches(
  matches: Match[],
  overlay: OverlaySpec,
  runCreatedAt?: string,
): RankedMatchEntry[] {
  const supplyUsage = new Map<string, number>();

  // Apply overlay to every match, in original order (determines diversity guard order)
  const results: RankedMatchEntry[] = matches.map((match, matchIndex) => ({
    matchIndex,
    match,
    result: applyOverlay(match, overlay, supplyUsage, runCreatedAt),
  }));

  // Sort: included first → rankScore descending → index ascending
  results.sort((a, b) => {
    if (a.result.included !== b.result.included) {
      return a.result.included ? -1 : 1;
    }
    if (b.result.rankScore !== a.result.rankScore) {
      return b.result.rankScore - a.result.rankScore;
    }
    return a.matchIndex - b.matchIndex;
  });

  return results;
}
