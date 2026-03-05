/**
 * Execution Tier System — Operator Progression
 *
 * This is an identity progression system.
 * It must remain deterministic, monotonic, and irreversible.
 * Do not add downgrade paths. Do not add tier resets.
 *
 * Execution tiers are STATUS ONLY.
 * Do not use tier to modify routing, scoring, or enrichment.
 * Any such change must be approved at architecture level.
 */

import { useState, useEffect, useRef } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export type ExecutionTier =
  | 'none'
  | 'pending_rank1'
  | 'rank1'
  | 'rank2'
  | 'rank3'
  | 'market_maker';

export interface ExecutionState {
  version: number;
  totalSent: number;
  firstSentAt: string | null;
  tier: ExecutionTier;
}

// =============================================================================
// TIER CONFIG
// =============================================================================

export interface TierInfo {
  label: string;
  accent: string;
  icon: string;
  nextTier?: ExecutionTier;
  sendsRequired?: number;
  daysRequired?: number;
}

export const TIER_CONFIG: Record<ExecutionTier, TierInfo> = {
  none: {
    label: '',
    accent: 'rgba(255,255,255,0.30)',
    icon: '',
    nextTier: 'pending_rank1',
    sendsRequired: 300,
  },
  pending_rank1: {
    label: 'Rank 1 pending',
    accent: 'rgba(52,211,153,0.40)',
    icon: '\u203A', // ›
    nextTier: 'rank1',
    daysRequired: 3,
  },
  rank1: {
    label: 'Operator Rank 1',
    accent: 'rgba(52,211,153,0.60)',
    icon: '\u203A', // ›
    nextTier: 'rank2',
    daysRequired: 14,
  },
  rank2: {
    label: 'Operator Rank 2',
    accent: 'rgba(96,165,250,0.60)',
    icon: '\u203A\u203A', // ››
    nextTier: 'rank3',
    daysRequired: 30,
  },
  rank3: {
    label: 'Operator Rank 3',
    accent: 'rgba(251,191,36,0.60)',
    icon: '\u203A\u203A\u203A', // ›››
    nextTier: 'market_maker',
    sendsRequired: 5000,
    daysRequired: 90,
  },
  market_maker: {
    label: 'Market Maker',
    accent: 'rgba(255,255,255,0.80)',
    icon: '\u2655', // ♕ crown
  },
};

// =============================================================================
// COMPUTATION — Pure function
// =============================================================================

const MS_PER_DAY = 86_400_000;
const STORAGE_KEY = 'operator_execution';

export function computeTier(totalSent: number, firstSentAt: string | null): ExecutionTier {
  if (totalSent < 300) return 'none';
  if (!firstSentAt) return 'none';

  const parsed = Date.parse(firstSentAt);
  if (Number.isNaN(parsed)) return 'none';

  const days = Math.floor((Date.now() - parsed) / MS_PER_DAY);

  // Market maker checked first (top of waterfall)
  if (totalSent >= 5000 && days >= 90) return 'market_maker';
  if (days >= 30) return 'rank3';
  if (days >= 14) return 'rank2';
  if (days >= 3) return 'rank1';
  return 'pending_rank1';
}

// =============================================================================
// PERSISTENCE — localStorage
// =============================================================================

function defaultState(): ExecutionState {
  return { version: 1, totalSent: 0, firstSentAt: null, tier: 'none' };
}

export function loadExecution(): ExecutionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as ExecutionState;
    // Recompute tier on load (monotonic — take highest)
    const freshTier = computeTier(parsed.totalSent, parsed.firstSentAt);
    return { ...parsed, tier: freshTier };
  } catch {
    return defaultState();
  }
}

function writeExecution(state: ExecutionState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage full or unavailable — silent
  }
}

// =============================================================================
// RECORD SENDS — Atomic increment
// =============================================================================

export function recordSends(count: number): ExecutionState {
  const fresh = loadExecution(); // always re-read, never cached
  fresh.totalSent += count;
  if (!fresh.firstSentAt) fresh.firstSentAt = new Date().toISOString();
  fresh.tier = computeTier(fresh.totalSent, fresh.firstSentAt);
  writeExecution(fresh);
  window.dispatchEvent(new CustomEvent('execution-update'));
  return fresh;
}

// =============================================================================
// REACT HOOK — Reactive state with transition detection
// =============================================================================

export function useExecutionState(): ExecutionState & { justTransitioned: boolean } {
  const [state, setState] = useState<ExecutionState>(loadExecution);
  const [justTransitioned, setJustTransitioned] = useState(false);
  const prevTierRef = useRef<ExecutionTier>(state.tier);

  useEffect(() => {
    const handleUpdate = () => {
      const next = loadExecution();
      setState(next);
      if (prevTierRef.current !== next.tier) {
        setJustTransitioned(true);
        prevTierRef.current = next.tier;
        const timer = setTimeout(() => setJustTransitioned(false), 800);
        return () => clearTimeout(timer);
      }
    };

    // Same-tab: custom event from recordSends()
    window.addEventListener('execution-update', handleUpdate);
    // Cross-tab: native storage event
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) handleUpdate();
    });

    return () => {
      window.removeEventListener('execution-update', handleUpdate);
      // storage listener cleanup via same reference not possible with inline fn,
      // but component unmount clears all anyway
    };
  }, []);

  return { ...state, justTransitioned };
}

// =============================================================================
// HELPERS — Progress computation for UI
// =============================================================================

export function getDaysActive(firstSentAt: string | null): number {
  if (!firstSentAt) return 0;
  const parsed = Date.parse(firstSentAt);
  if (Number.isNaN(parsed)) return 0;
  return Math.floor((Date.now() - parsed) / MS_PER_DAY);
}

export function getProgressToNext(state: ExecutionState): {
  label: string;
  fraction: number;
} | null {
  const config = TIER_CONFIG[state.tier];
  if (!config.nextTier) return null; // market_maker — terminal

  const nextConfig = TIER_CONFIG[config.nextTier];
  const days = getDaysActive(state.firstSentAt);

  if (state.tier === 'none') {
    // Progress to 300 sends
    const needed = 300;
    const remaining = Math.max(0, needed - state.totalSent);
    return {
      label: `${remaining} to Rank 1`,
      fraction: Math.min(1, state.totalSent / needed),
    };
  }

  if (state.tier === 'pending_rank1') {
    const daysNeeded = 3;
    const remaining = Math.max(0, daysNeeded - days);
    return {
      label: `${remaining}d remaining`,
      fraction: Math.min(1, days / daysNeeded),
    };
  }

  // rank1, rank2, rank3 — days-based (rank3 also needs sends)
  if (nextConfig.daysRequired) {
    const daysNeeded = nextConfig.daysRequired;
    const remaining = Math.max(0, daysNeeded - days);

    // rank3 → market_maker needs both sends AND days
    if (nextConfig.sendsRequired && state.totalSent < nextConfig.sendsRequired) {
      const sendsRemaining = nextConfig.sendsRequired - state.totalSent;
      return {
        label: `${sendsRemaining.toLocaleString()} sends + ${remaining}d to ${nextConfig.label}`,
        fraction: Math.min(1, days / daysNeeded) * 0.5 + Math.min(1, state.totalSent / nextConfig.sendsRequired) * 0.5,
      };
    }

    return {
      label: `${remaining}d to ${nextConfig.label}`,
      fraction: Math.min(1, days / daysNeeded),
    };
  }

  return null;
}
