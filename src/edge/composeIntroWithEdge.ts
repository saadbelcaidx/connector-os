/**
 * COMPOSE INTRO WITH EDGE — Main entry point for intro generation
 *
 * Flow:
 * 1. validateEdge(match)
 * 2. If invalid → no intro
 * 3. If probe_only → generateProbeIntro()
 * 4. If valid → generateConnectIntro()
 */

import { getTaxonomy } from './edgeTaxonomy';
import { validateEdge } from './validateEdge';
import type { Match, CompanySummary, EdgeValidationResult } from './validateEdge';
import { containsBannedPhrase, getEdgePhrase } from './copyRules';

// =============================================================================
// TYPES
// =============================================================================

export type IntroSide = 'demand' | 'supply';

export interface IntroResult {
  type: 'connect' | 'probe' | 'none';
  intro: string | null;
  validation: EdgeValidationResult;
  reason?: string;
}

export interface IntroContext {
  firstName: string;
  company: string;
  summary: CompanySummary | null;
}

// =============================================================================
// PROBE INTRO GENERATOR
// =============================================================================

function generateProbeIntro(
  side: IntroSide,
  mode: string,
  ctx: IntroContext
): string {
  const taxonomy = getTaxonomy(mode);
  const name = ctx.firstName || 'there';
  const company = ctx.company || 'your company';
  // Use mode-specific summary, NEVER raw company descriptions
  const summary = taxonomy.defaultSummary;

  // PROBE: Ask permission, never claim counterpart
  return `Hey ${name} —

Noticed ${company} ${summary} — quick check: ${taxonomy.defaultProbePhrase}?

If not, no worries.`;
}

// =============================================================================
// CONNECT INTRO GENERATOR
// =============================================================================

function generateConnectIntroDemand(
  mode: string,
  ctx: IntroContext,
  match: Match
): string {
  const taxonomy = getTaxonomy(mode);
  const name = ctx.firstName || 'there';
  const company = ctx.company || 'your company';
  // Use mode-specific summary, NEVER raw company descriptions
  const summary = taxonomy.defaultSummary;
  const edgePhrase = getEdgePhrase(match.edge!.edge_type!);
  const supplyCategory = match.supply.summary?.category || 'providers';

  // DEMAND SIDE: Mention supply type + edge
  return `Hey ${name} —

Noticed ${company} ${summary} — I know ${supplyCategory} who are ${edgePhrase}.

Worth an intro?`;
}

function generateConnectIntroSupply(
  mode: string,
  ctx: IntroContext,
  match: Match
): string {
  const name = ctx.firstName || 'there';
  const edgePhrase = getEdgePhrase(match.edge!.edge_type!);
  const demandCategory = match.demand.summary?.category || 'companies';

  // SUPPLY SIDE: Lead with edge, mention demand type
  return `Hey ${name} —

I'm in touch with ${demandCategory} ${edgePhrase}.

Worth an intro?`;
}

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

/**
 * Compose intro with edge validation
 *
 * @param side - 'demand' or 'supply'
 * @param match - The match object with mode, demand, supply, edge
 * @param ctx - Context for the intro recipient
 */
export function composeIntroWithEdge(
  side: IntroSide,
  match: Match,
  ctx: IntroContext
): IntroResult {
  // -------------------------------------------------------------------------
  // STEP 1: VALIDATE EDGE
  // -------------------------------------------------------------------------
  const validation = validateEdge(match);

  // -------------------------------------------------------------------------
  // STEP 2: INVALID → NO INTRO
  // -------------------------------------------------------------------------
  if (validation === 'invalid') {
    return {
      type: 'none',
      intro: null,
      validation,
      reason: 'Edge incompatible with mode or one-sided',
    };
  }

  // -------------------------------------------------------------------------
  // STEP 3: PROBE_ONLY → PROBE INTRO
  // -------------------------------------------------------------------------
  if (validation === 'probe_only') {
    const intro = generateProbeIntro(side, match.mode, ctx);

    // Safety check: probe must not contain banned phrases
    if (containsBannedPhrase(intro)) {
      return {
        type: 'none',
        intro: null,
        validation,
        reason: 'Probe contained banned phrase (system error)',
      };
    }

    return {
      type: 'probe',
      intro,
      validation,
    };
  }

  // -------------------------------------------------------------------------
  // STEP 4: VALID → CONNECT INTRO
  // -------------------------------------------------------------------------
  const intro = side === 'demand'
    ? generateConnectIntroDemand(match.mode, ctx, match)
    : generateConnectIntroSupply(match.mode, ctx, match);

  return {
    type: 'connect',
    intro,
    validation,
  };
}

// Re-exports handled by src/edge/index.ts
