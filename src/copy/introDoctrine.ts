/**
 * INTRO DOCTRINE — SSM-Style Deterministic Templates
 *
 * Fill-in-the-blank templates. No AI. No retries. No garbage.
 *
 * INPUTS: firstName, company, companyDescription, mode, demandType
 * OUTPUT: Plain text intro
 */

import { cleanCompanySummary, isSafeSlot } from '../matching/cleanCompanySummary';

// =============================================================================
// TYPES
// =============================================================================

export type IntroSide = 'demand' | 'supply';

export type ConnectorMode =
  | 'recruiting'
  | 'biotech_licensing'
  | 'wealth_management'
  | 'real_estate_capital'
  | 'logistics'
  | 'crypto'
  | 'enterprise_partnerships'
  | 'b2b_general';

export interface IntroContext {
  firstName: string;
  company: string;
  companyDescription?: string;
  demandType?: { type?: string } | string;  // For demand: validates pain injection. For supply: describes who the demand is.
  preSignalContext?: string;  // Operator-written context (e.g., "Saw your talk at the conference")
}

// =============================================================================
// NEUTRAL PAIN — Used when mode-specific pain is inappropriate
// =============================================================================

const NEUTRAL_PAIN = 'teams who run into friction when evaluating new partners in this space';

// =============================================================================
// MODE TEMPLATES — Pain framing per vertical (MODE-LOCKED)
// =============================================================================

const MODE_TEMPLATES: Record<ConnectorMode, {
  demandPain: string;
  demandFallback: string;  // Fallback summary if cleanCompanySummary fails
  supplyFallback: string;  // Fallback demand type if narrative.supplyRole missing
}> = {
  recruiting: {
    demandPain: 'teams who lose months on leadership hires because recruiters don\'t really understand the space',
    demandFallback: 'is scaling their team',
    supplyFallback: 'a company scaling their team',
  },
  biotech_licensing: {
    demandPain: 'teams who lose months in licensing because pharma BD teams don\'t really grasp the science or timing',
    demandFallback: 'is advancing their pipeline',
    supplyFallback: 'a biotech in growth mode',
  },
  wealth_management: {
    demandPain: 'clients who leave millions on the table with generic advisors who don\'t understand concentrated stock or tax-efficient diversification',
    demandFallback: 'is evaluating wealth strategies',
    supplyFallback: 'a high-net-worth client',
  },
  real_estate_capital: {
    demandPain: 'sponsors who lose deals when capital partners underwrite too conservatively or don\'t get the thesis',
    demandFallback: 'is raising capital',
    supplyFallback: 'a developer looking for capital',
  },
  logistics: {
    demandPain: 'brands who hit growth walls when 3PLs can\'t keep up with speed or returns volume',
    demandFallback: 'is scaling fulfillment',
    supplyFallback: 'a brand scaling fulfillment',
  },
  crypto: {
    demandPain: 'teams who lose months to licensing because consultants don\'t really understand custody or state-by-state requirements',
    demandFallback: 'is navigating compliance',
    supplyFallback: 'a crypto company navigating compliance',
  },
  enterprise_partnerships: {
    demandPain: 'teams who lose quarters on integrations because partners underestimate workflows and buying cycles',
    demandFallback: 'is building partnerships',
    supplyFallback: 'an enterprise looking for partners',
  },
  b2b_general: {
    demandPain: 'teams who lose time when providers don\'t really understand the space',
    demandFallback: 'is in growth mode',
    supplyFallback: 'a company in growth mode',
  },
};

// =============================================================================
// DEMAND INTRO — To companies with need
// Template: "Noticed {{company}} {{demandSummary}} — I know {{pain}}."
// =============================================================================

/**
 * Helper to build neutral demand intro (used by safety assert)
 */
function buildNeutralDemandIntro(name: string, company: string, demandSummary: string): string {
  return `Hey ${name} —

Noticed ${company} ${demandSummary} — I know ${NEUTRAL_PAIN}.

I can connect you directly if useful.`;
}

function generateDemandIntro(ctx: IntroContext, mode: ConnectorMode): string {
  const { firstName, company, companyDescription, demandType, preSignalContext } = ctx;
  const template = MODE_TEMPLATES[mode] || MODE_TEMPLATES.b2b_general;
  const name = firstName || 'there';

  // ---------------------------------------------------------------------------
  // PATCH 1: HARD GATE PAIN BY DEMAND TYPE (not just mode)
  // ---------------------------------------------------------------------------
  const demandTypeValue = typeof demandType === 'object' ? demandType?.type : demandType;
  const isCryptoDemand =
    demandTypeValue === 'crypto_platform' ||
    demandTypeValue === 'fintech_platform' ||
    demandTypeValue === 'exchange';

  let pain: string;
  if (mode === 'crypto' && isCryptoDemand) {
    pain = template.demandPain;  // Crypto pain only for crypto demand
  } else if (mode === 'crypto') {
    pain = NEUTRAL_PAIN;  // Crypto mode but NOT crypto demand → neutral
  } else {
    pain = template.demandPain;  // Other modes use their pain
  }

  // ---------------------------------------------------------------------------
  // PATCH 2: FORCE CLEAN SUMMARY (no raw description ever)
  // ---------------------------------------------------------------------------
  const safeSummary = cleanCompanySummary(companyDescription);

  // HARD RULE: Discard if contains garbage patterns
  const isGarbage = !safeSummary ||
    safeSummary.length === 0 ||
    /World's first/i.test(safeSummary) ||
    safeSummary.includes(':') ||
    safeSummary.includes('•') ||
    !isSafeSlot(safeSummary);

  const demandSummary = isGarbage ? template.demandFallback : safeSummary;

  // If operator provided pre-signal context, use it as the hook
  if (preSignalContext && isSafeSlot(preSignalContext)) {
    const intro = `Hey ${name} —

${preSignalContext.trim()}

I know ${pain}.

I can connect you directly if useful.`;

    // PATCH 3: Safety assert for licensing pain leakage
    if (mode === 'crypto' && !isCryptoDemand && intro.includes('licens')) {
      return buildNeutralDemandIntro(name, company, demandSummary);
    }

    return intro;
  }

  // Standard demand intro with company summary
  const intro = `Hey ${name} —

Noticed ${company} ${demandSummary} — I know ${pain}.

I can connect you directly if useful.`;

  // ---------------------------------------------------------------------------
  // PATCH 3: SAFETY ASSERT (seatbelt, not primary logic)
  // ---------------------------------------------------------------------------
  if (mode === 'crypto' && !isCryptoDemand && intro.includes('licens')) {
    return buildNeutralDemandIntro(name, company, demandSummary);
  }

  return intro;
}

// =============================================================================
// SUPPLY INTRO — To providers
// Template: "I'm in touch with {{demandType}} — looks like the kind of teams you work with."
// =============================================================================

function generateSupplyIntro(ctx: IntroContext, mode: ConnectorMode): string {
  const { firstName, demandType, preSignalContext } = ctx;
  const template = MODE_TEMPLATES[mode] || MODE_TEMPLATES.b2b_general;
  const name = firstName || 'there';

  // Extract string value from demandType (can be object or string)
  const demandTypeStr = typeof demandType === 'string' ? demandType : undefined;

  // Use demandType if provided and safe, otherwise use mode fallback
  const safeDemandType = isSafeSlot(demandTypeStr) ? demandTypeStr : template.supplyFallback;

  // If operator provided pre-signal context, use it as the hook
  if (preSignalContext && isSafeSlot(preSignalContext)) {
    return `Hey ${name} —

${preSignalContext.trim()}

I'm in touch with ${safeDemandType} — looks like the kind of teams you work with.

I can connect you directly if useful.`;
  }

  // Standard supply intro
  return `Hey ${name} —

I'm in touch with ${safeDemandType} — looks like the kind of teams you work with.

I can connect you directly if useful.`;
}

// =============================================================================
// COMPOSE INTRO — Single entry point
// =============================================================================

export interface ComposeIntroArgs {
  side: IntroSide;
  mode?: ConnectorMode;
  ctx: IntroContext;
}

export function composeIntro(args: ComposeIntroArgs): string {
  const { side, mode = 'b2b_general', ctx } = args;

  if (side === 'demand') {
    return generateDemandIntro(ctx, mode);
  }

  return generateSupplyIntro(ctx, mode);
}

// =============================================================================
// VALIDATION — Always valid (deterministic templates can't fail)
// =============================================================================

export function validateIntro(): { valid: true } {
  return { valid: true };
}
