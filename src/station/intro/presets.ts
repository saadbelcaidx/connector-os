/**
 * Intro Builder — Preset Templates + Situation Variable Definitions
 *
 * signalObservation is a backward-compat alias in engine.ts BUILTIN_RESOLVERS —
 * it resolves from ctx.situation.momentum, never from canonical entity data.
 * painTheySolve was removed; use {{bridge}} instead.
 *
 * Situation vars (momentum, bridge, opportunity) are derived by the
 * Situation layer (situation.ts) from evaluation framing + reasoning.
 */

import type { IntroTemplate } from './types';

// =============================================================================
// SITUATION VARIABLE REFERENCE (for documentation/tooling)
// =============================================================================

/** Situation variables available in templates. Resolved by the Situation layer. */
export const SITUATION_VAR_KEYS = ['momentum', 'bridge', 'opportunity'] as const;

/** Identity variables available in templates. Resolved from record data. */
export const IDENTITY_VAR_KEYS = [
  'supply.firstName', 'supply.company',
  'demand.firstName', 'demand.company',
  'article',
] as const;

// =============================================================================
// PRESET TEMPLATES — empty, operator builds their own
// =============================================================================

export const PRESET_TEMPLATES: IntroTemplate[] = [];
