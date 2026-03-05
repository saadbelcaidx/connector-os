/**
 * OVERLAY SUGGESTIONS — Self-Tuning Fulfillment Engine
 *
 * Pure computation module (same pattern as calibrationDrift.ts).
 * Detects which overlay changes would improve performance.
 *
 * BASELINE: overall reply rate for THIS overlay_hash during its active window.
 * Not global. Not cross-overlay. Every comparison is intra-overlay.
 *
 * MINIMUM SIGNAL GUARDS (all sub-generators):
 * - Minimum intros for segment: >= 5
 * - Reply rate delta: >= 1.8x (segment vs intra-overlay baseline)
 * - Absolute reply delta: >= 5pp
 * Below any threshold = no suggestion. Silence > noise.
 */

import type { OverlaySpec } from '../types/station';
import type { OverlayIntroRow } from '../services/IntroductionsService';
import type { TierLearning, PairingLearning } from '../services/IntroductionsService';
import type { CalibrationDriftReport } from './calibrationDrift';

// ============================================================================
// TYPES
// ============================================================================

export interface OverlaySuggestion {
  id: string;
  category: 'signal' | 'industry' | 'title' | 'tier' | 'filter' | 'weight';
  severity: 'info' | 'warning' | 'opportunity';
  headline: string;
  detail: string;
  evidence: string[];
  proposedDiff?: Partial<OverlaySpec>;
}

export interface SuggestionReport {
  suggestions: OverlaySuggestion[];
  generatedAt: string;
  overlayHash: string;
  baselineReplyRate: number;
  totalIntros: number;
}

interface SuggestionInput {
  currentOverlay: OverlaySpec;
  overlayHash: string;
  intros: OverlayIntroRow[];
  tierLearning?: TierLearning[];
  pairingLearning?: PairingLearning[];
  calibration?: CalibrationDriftReport;
}

// ============================================================================
// GUARDS
// ============================================================================

const MIN_SAMPLES = 5;
const MIN_MULTIPLIER = 1.8;
const MIN_ABSOLUTE_DELTA_PP = 5;

const REPLIED_STATUSES = new Set(['replied', 'meeting', 'closed_won', 'closed_lost']);

function replyRate(intros: OverlayIntroRow[]): number {
  if (intros.length === 0) return 0;
  return intros.filter(i => REPLIED_STATUSES.has(i.status)).length / intros.length;
}

function passesGuards(segmentRate: number, segmentCount: number, baseline: number): boolean {
  if (segmentCount < MIN_SAMPLES) return false;
  if (baseline <= 0) return segmentRate >= MIN_ABSOLUTE_DELTA_PP / 100;
  const multiplier = segmentRate / baseline;
  if (multiplier < MIN_MULTIPLIER) return false;
  const absoluteDelta = (segmentRate - baseline) * 100;
  if (absoluteDelta < MIN_ABSOLUTE_DELTA_PP) return false;
  return true;
}

function hashId(category: string, ...keys: string[]): string {
  const raw = [category, ...keys].join(':');
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// ============================================================================
// SUB-GENERATORS
// ============================================================================

function suggestTitleShift(input: SuggestionInput, baseline: number): OverlaySuggestion[] {
  const results: OverlaySuggestion[] = [];
  const byTitle = new Map<string, OverlayIntroRow[]>();

  for (const intro of input.intros) {
    // Use both demand and supply titles
    for (const title of [intro.demandContactTitle, intro.supplyContactTitle]) {
      if (!title) continue;
      const normalized = title.trim();
      if (!normalized) continue;
      const group = byTitle.get(normalized) || [];
      group.push(intro);
      byTitle.set(normalized, group);
    }
  }

  for (const [title, intros] of byTitle) {
    const rate = replyRate(intros);
    if (!passesGuards(rate, intros.length, baseline)) continue;

    const multiplier = baseline > 0 ? (rate / baseline).toFixed(1) : '∞';
    const currentInclude = input.currentOverlay.filters?.include?.titles || [];
    const alreadyIncluded = currentInclude.some(t => t.toLowerCase() === title.toLowerCase());

    if (!alreadyIncluded) {
      results.push({
        id: hashId('title', title.toLowerCase()),
        category: 'title',
        severity: 'opportunity',
        headline: `${title} titles converting ${multiplier}x higher`,
        detail: `${title} contacts have a ${(rate * 100).toFixed(1)}% reply rate vs ${(baseline * 100).toFixed(1)}% baseline across ${intros.length} intros.`,
        evidence: [`${intros.length} intros`, `${(rate * 100).toFixed(1)}% reply rate`, `${multiplier}x vs baseline`],
        proposedDiff: {
          filters: {
            ...input.currentOverlay.filters,
            include: {
              ...input.currentOverlay.filters?.include,
              titles: [...currentInclude, title],
            },
          },
        } as Partial<OverlaySpec>,
      });
    }
  }

  return results;
}

function suggestIndustryShift(input: SuggestionInput, baseline: number): OverlaySuggestion[] {
  const results: OverlaySuggestion[] = [];
  const byIndustry = new Map<string, OverlayIntroRow[]>();

  for (const intro of input.intros) {
    // Use need and capability categories as industry proxies
    for (const cat of [intro.needCategory, intro.capabilityCategory]) {
      if (!cat) continue;
      const group = byIndustry.get(cat) || [];
      group.push(intro);
      byIndustry.set(cat, group);
    }
  }

  for (const [industry, intros] of byIndustry) {
    const rate = replyRate(intros);
    if (!passesGuards(rate, intros.length, baseline)) continue;

    const multiplier = baseline > 0 ? (rate / baseline).toFixed(1) : '∞';
    const currentInclude = input.currentOverlay.filters?.include?.industries || [];
    const alreadyIncluded = currentInclude.some(i => i.toLowerCase() === industry.toLowerCase());

    if (!alreadyIncluded) {
      results.push({
        id: hashId('industry', industry.toLowerCase()),
        category: 'industry',
        severity: 'opportunity',
        headline: `${industry} segment converting ${multiplier}x higher`,
        detail: `${industry} pairings have a ${(rate * 100).toFixed(1)}% reply rate vs ${(baseline * 100).toFixed(1)}% baseline across ${intros.length} intros.`,
        evidence: [`${intros.length} intros`, `${(rate * 100).toFixed(1)}% reply rate`, `${multiplier}x vs baseline`],
        proposedDiff: {
          filters: {
            ...input.currentOverlay.filters,
            include: {
              ...input.currentOverlay.filters?.include,
              industries: [...currentInclude, industry],
            },
          },
        } as Partial<OverlaySpec>,
      });
    }
  }

  return results;
}

function suggestTierReweight(input: SuggestionInput, baseline: number): OverlaySuggestion[] {
  const results: OverlaySuggestion[] = [];
  if (!input.tierLearning || input.tierLearning.length === 0) return results;

  const currentBoost = input.currentOverlay.weights?.tierBoost || {};
  const tierMap: Record<string, { key: keyof typeof currentBoost; label: string }> = {
    strong: { key: 'strong', label: 'strong' },
    good: { key: 'good', label: 'good' },
    open: { key: 'open', label: 'open' },
  };

  // Find tiers that outperform their current weight suggests
  for (const tier of input.tierLearning) {
    if (tier.totalSent < MIN_SAMPLES) continue;
    const mapping = tierMap[tier.tier];
    if (!mapping) continue;

    const tierReply = tier.replyRatePct / 100;

    // Check if a lower-weighted tier outperforms a higher-weighted tier
    for (const otherTier of input.tierLearning) {
      if (otherTier.tier === tier.tier) continue;
      if (otherTier.totalSent < MIN_SAMPLES) continue;

      const otherMapping = tierMap[otherTier.tier];
      if (!otherMapping) continue;

      const otherReply = otherTier.replyRatePct / 100;
      const currentWeight = currentBoost[mapping.key] ?? 1;
      const otherWeight = currentBoost[otherMapping.key] ?? 1;

      // Lower tier weight but higher reply rate?
      if (currentWeight < otherWeight && tierReply > otherReply && passesGuards(tierReply, tier.totalSent, baseline)) {
        const ratio = `${(tierReply / otherReply).toFixed(1)}:1`;
        const suggestedWeight = Math.round(Math.min(currentWeight * 1.3, 10) * 10) / 10;

        results.push({
          id: hashId('tier', tier.tier, otherTier.tier),
          category: 'tier',
          severity: 'warning',
          headline: `${tier.tier} outperforming ${otherTier.tier} ${ratio} on replies`,
          detail: `${tier.tier} tier has ${tier.replyRatePct}% reply rate vs ${otherTier.tier} at ${otherTier.replyRatePct}%, but ${tier.tier} weight (${currentWeight}) is lower than ${otherTier.tier} (${otherWeight}).`,
          evidence: [
            `${tier.tier}: ${tier.totalSent} sent, ${tier.replyRatePct}% reply`,
            `${otherTier.tier}: ${otherTier.totalSent} sent, ${otherTier.replyRatePct}% reply`,
          ],
          proposedDiff: {
            weights: {
              ...input.currentOverlay.weights,
              tierBoost: {
                ...currentBoost,
                [mapping.key]: suggestedWeight,
              },
            },
          } as Partial<OverlaySpec>,
        });
      }
    }
  }

  return results;
}

function suggestFromCalibration(input: SuggestionInput): OverlaySuggestion[] {
  const results: OverlaySuggestion[] = [];
  if (!input.calibration) return results;
  if (input.calibration.totalSamples < MIN_SAMPLES) return results;

  if (input.calibration.status === 'overconfident' && Math.abs(input.calibration.overallDrift) > 0.1) {
    results.push({
      id: hashId('calibration', 'overconfident'),
      category: 'weight',
      severity: 'warning',
      headline: `AI overconfident by ${(Math.abs(input.calibration.overallDrift) * 100).toFixed(0)}pp`,
      detail: `AI confidence exceeds actual reply rates. Consider tightening filters to improve signal quality.`,
      evidence: [
        `${input.calibration.totalSamples} calibration samples`,
        `Overall drift: ${(input.calibration.overallDrift * 100).toFixed(1)}pp`,
      ],
    });
  }

  if (input.calibration.status === 'underconfident' && Math.abs(input.calibration.overallDrift) > 0.1) {
    results.push({
      id: hashId('calibration', 'underconfident'),
      category: 'weight',
      severity: 'info',
      headline: `AI underconfident by ${(Math.abs(input.calibration.overallDrift) * 100).toFixed(0)}pp`,
      detail: `Actual reply rates exceed AI predictions. Your overlay is capturing high-quality signals the AI undervalues.`,
      evidence: [
        `${input.calibration.totalSamples} calibration samples`,
        `Overall drift: ${(input.calibration.overallDrift * 100).toFixed(1)}pp`,
      ],
    });
  }

  return results;
}

function suggestSignalWeight(input: SuggestionInput, baseline: number): OverlaySuggestion[] {
  const results: OverlaySuggestion[] = [];
  // Group intros by match tier as a proxy for signal strength
  const byTier = new Map<string, OverlayIntroRow[]>();

  for (const intro of input.intros) {
    if (!intro.matchTier) continue;
    const group = byTier.get(intro.matchTier) || [];
    group.push(intro);
    byTier.set(intro.matchTier, group);
  }

  const currentSW = input.currentOverlay.weights?.signalWeight || {};

  for (const [tier, intros] of byTier) {
    const rate = replyRate(intros);
    if (!passesGuards(rate, intros.length, baseline)) continue;

    const multiplier = baseline > 0 ? (rate / baseline).toFixed(1) : '∞';
    const currentWeight = currentSW[tier] ?? 1;
    const suggestedWeight = Math.round(Math.min(currentWeight * 1.3, 5) * 10) / 10;

    if (suggestedWeight > currentWeight) {
      results.push({
        id: hashId('signal', tier),
        category: 'signal',
        severity: 'opportunity',
        headline: `${tier} signal converting ${multiplier}x higher`,
        detail: `Matches with ${tier} signals have ${(rate * 100).toFixed(1)}% reply rate vs ${(baseline * 100).toFixed(1)}% baseline. Consider increasing signal weight.`,
        evidence: [`${intros.length} intros`, `${(rate * 100).toFixed(1)}% reply rate`],
        proposedDiff: {
          weights: {
            ...input.currentOverlay.weights,
            signalWeight: {
              ...currentSW,
              [tier]: suggestedWeight,
            },
          },
        } as Partial<OverlaySpec>,
      });
    }
  }

  return results;
}

// ============================================================================
// MAIN
// ============================================================================

export function computeOverlaySuggestions(input: SuggestionInput): SuggestionReport {
  const overlayIntros = input.intros.filter(i => i.overlayHash === input.overlayHash);
  const baseline = replyRate(overlayIntros);

  const suggestions: OverlaySuggestion[] = [
    ...suggestTitleShift({ ...input, intros: overlayIntros }, baseline),
    ...suggestIndustryShift({ ...input, intros: overlayIntros }, baseline),
    ...suggestTierReweight(input, baseline),
    ...suggestFromCalibration(input),
    ...suggestSignalWeight({ ...input, intros: overlayIntros }, baseline),
  ];

  return {
    suggestions,
    generatedAt: new Date().toISOString(),
    overlayHash: input.overlayHash,
    baselineReplyRate: baseline,
    totalIntros: overlayIntros.length,
  };
}
