/**
 * classifySignal — Deterministic signal classifier
 *
 * Two-tier approach:
 * 1. Pack context (exact): single-signal pack → known type, source='pack'
 * 2. Signal text (fallback): conservative regex, source='classified'
 *
 * Returns null when it can't classify — never guesses.
 */

import { NEWS_SIGNALS, SIGNAL_GROUPS } from '../constants/marketPresets';

// =============================================================================
// TYPES
// =============================================================================

export interface SignalClassification {
  signalType: string;   // NEWS_SIGNALS value: 'hires', 'receives_financing'
  signalGroup: string;  // SIGNAL_GROUPS category (lowercased): 'growth', 'capital'
  signalLabel: string;  // Human label: 'Hiring', 'Funding raised'
  source: 'pack' | 'classified';
}

// =============================================================================
// LOOKUP MAPS (built once from constants)
// =============================================================================

/** signal value → { label, group } */
const SIGNAL_LOOKUP = new Map<string, { label: string; group: string }>();

for (const sig of NEWS_SIGNALS) {
  // Find which group this signal belongs to
  let group = 'other';
  for (const g of SIGNAL_GROUPS) {
    if (g.signals.includes(sig.value)) {
      group = g.category.toLowerCase();
      break;
    }
  }
  SIGNAL_LOOKUP.set(sig.value, { label: sig.label, group });
}

/** Regex patterns for text-based classification. Conservative — only match clear indicators. */
const TEXT_PATTERNS: { pattern: RegExp; signalType: string }[] = [
  { pattern: /\bhir(ing|es|ed)\b/i, signalType: 'hires' },
  { pattern: /\bfund(ing|ed|raise)\b|\braised?\b.*\b(million|series|seed|round)\b|\breceiv(es?|ed|ing)\s+financ/i, signalType: 'receives_financing' },
  { pattern: /\blaunch(es|ed|ing)?\b/i, signalType: 'launches' },
  { pattern: /\bpartner(s|ed|ing|ship)?\s+(with|agreement)\b/i, signalType: 'partners_with' },
  { pattern: /\bacquir(es|ed|ing)\b|\bacquisition\b/i, signalType: 'acquires' },
  { pattern: /\bnew\s+client\b|\bsign(s|ed)\s+.*client\b/i, signalType: 'signs_new_client' },
  { pattern: /\bexpand(s|ed|ing)?\s+(offices?\s+)?to\b/i, signalType: 'expands_offices_to' },
  { pattern: /\bexpand(s|ed|ing)?\s+(offices?\s+)?in\b/i, signalType: 'expands_offices_in' },
  { pattern: /\bexpand(s|ed|ing)?\s+facilit/i, signalType: 'expands_facilities' },
  { pattern: /\bnew\s+location\b|\bopen(s|ed|ing)?\s+.*location\b/i, signalType: 'opens_new_location' },
  { pattern: /\bipo\b|\bgoes?\s+public\b/i, signalType: 'goes_public' },
  { pattern: /\binvest(s|ed|ing)?\s+(into|in)\b/i, signalType: 'invests_into' },
  { pattern: /\bintegrat(es|ed|ing)?\s+with\b/i, signalType: 'integrates_with' },
  { pattern: /\bdevelop(s|ing)\b|\bin\s+development\b/i, signalType: 'is_developing' },
  { pattern: /\baward\b|\brecogniz(ed|tion)\b/i, signalType: 'recognized_as' },
  { pattern: /\bmerg(es?|ed|er|ing)\s+with\b|\bmerger\b/i, signalType: 'merges_with' },
  { pattern: /\bsells?\s+assets?\b/i, signalType: 'sells_assets_to' },
  { pattern: /\b(depart(s|ed|ure)|leaves?|left)\b.*\b(ceo|cfo|cto|founder|executive|officer)\b/i, signalType: 'leaves' },
  { pattern: /\blayoff\b|\breduction\s+in\s+force\b|\bdecreas(es|ed|ing)?\s+headcount\b/i, signalType: 'decreases_headcount_by' },
  { pattern: /\blaw\s*suit\b|\bsues?\b|\bfil(es?|ed|ing)\s+suit\b|\blitigation\b/i, signalType: 'files_suit_against' },
  { pattern: /\bclos(es?|ed|ing)\s+(an?\s+)?offic/i, signalType: 'closes_offices_in' },
  { pattern: /\bissues?\s+with\b|\bproblem\b|\bcontroversy\b/i, signalType: 'has_issues_with' },
];

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Classify from pack context. Returns classification only when the pack has
 * exactly one signal type (deterministic). Otherwise returns null.
 */
export function classifyFromPack(packSignals: string[]): SignalClassification | null {
  if (!packSignals || packSignals.length !== 1) return null;

  const signalType = packSignals[0];
  const info = SIGNAL_LOOKUP.get(signalType);
  if (!info) return null;

  return {
    signalType,
    signalGroup: info.group,
    signalLabel: info.label,
    source: 'pack',
  };
}

/**
 * Classify from signal text. Conservative regex — returns null when unsure.
 * Only the first matching pattern wins (patterns ordered by specificity).
 */
export function classifySignal(signalText: string): SignalClassification | null {
  if (!signalText || signalText.trim().length < 3) return null;

  for (const { pattern, signalType } of TEXT_PATTERNS) {
    if (pattern.test(signalText)) {
      const info = SIGNAL_LOOKUP.get(signalType);
      if (!info) continue;
      return {
        signalType,
        signalGroup: info.group,
        signalLabel: info.label,
        source: 'classified',
      };
    }
  }

  return null;
}
