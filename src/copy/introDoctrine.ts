/**
 * INTRO DOCTRINE — SSM-Style Deterministic Templates
 *
 * Fill-in-the-blank templates. No AI. No retries. No garbage.
 *
 * INPUTS: firstName, company, companyDescription, mode
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
  demandType?: string;  // For supply side: describes who the demand is (from narrative.supplyRole or mode fallback)
  preSignalContext?: string;  // Operator-written context (e.g., "Saw your talk at the conference")
}

// =============================================================================
// MODE TEMPLATES — Pain framing per vertical (MODE-LOCKED)
// =============================================================================

const MODE_TEMPLATES: Record<ConnectorMode, {
  demandPain: string;
  supplyFallback: string;  // Fallback demand type if narrative.supplyRole missing
}> = {
  recruiting: {
    demandPain: 'teams who lose months on leadership hires because recruiters don\'t really understand the space',
    supplyFallback: 'a company scaling their team',
  },
  biotech_licensing: {
    demandPain: 'teams who lose months in licensing because pharma BD teams don\'t really grasp the science or timing',
    supplyFallback: 'a biotech in growth mode',
  },
  wealth_management: {
    demandPain: 'clients who leave millions on the table with generic advisors who don\'t understand concentrated stock or tax-efficient diversification',
    supplyFallback: 'a high-net-worth client',
  },
  real_estate_capital: {
    demandPain: 'sponsors who lose deals when capital partners underwrite too conservatively or don\'t get the thesis',
    supplyFallback: 'a developer looking for capital',
  },
  logistics: {
    demandPain: 'brands who hit growth walls when 3PLs can\'t keep up with speed or returns volume',
    supplyFallback: 'a brand scaling fulfillment',
  },
  crypto: {
    demandPain: 'teams who lose months to licensing because consultants don\'t really understand custody or state-by-state requirements',
    supplyFallback: 'a crypto company navigating compliance',
  },
  enterprise_partnerships: {
    demandPain: 'teams who lose quarters on integrations because partners underestimate workflows and buying cycles',
    supplyFallback: 'an enterprise looking for partners',
  },
  b2b_general: {
    demandPain: 'teams who lose time when providers don\'t really understand the space',
    supplyFallback: 'a company in growth mode',
  },
};

// =============================================================================
// DEMAND INTRO — To companies with need
// Template: "Noticed {{company}} {{companySummary}} — I know {{demandPain}}."
// =============================================================================

function generateDemandIntro(ctx: IntroContext, mode: ConnectorMode): string {
  const { firstName, company, companyDescription, preSignalContext } = ctx;
  const template = MODE_TEMPLATES[mode] || MODE_TEMPLATES.b2b_general;
  const name = firstName || 'there';

  // Sanitize company description
  const companySummary = cleanCompanySummary(companyDescription);

  // If operator provided pre-signal context, use it as the hook
  if (preSignalContext && isSafeSlot(preSignalContext)) {
    return `Hey ${name} —

${preSignalContext.trim()}

I know ${template.demandPain}.

I can connect you directly if useful.`;
  }

  // If we have a safe company summary, use it
  if (isSafeSlot(companySummary)) {
    return `Hey ${name} —

Noticed ${company} ${companySummary} — I know ${template.demandPain}.

I can connect you directly if useful.`;
  }

  // Fallback: static mode template (no slots)
  return `Hey ${name} —

I know ${template.demandPain}.

I can connect you directly if useful.`;
}

// =============================================================================
// SUPPLY INTRO — To providers
// Template: "I'm in touch with {{demandType}} — looks like the kind of teams you work with."
// =============================================================================

function generateSupplyIntro(ctx: IntroContext, mode: ConnectorMode): string {
  const { firstName, demandType, preSignalContext } = ctx;
  const template = MODE_TEMPLATES[mode] || MODE_TEMPLATES.b2b_general;
  const name = firstName || 'there';

  // Use demandType if provided and safe, otherwise use mode fallback
  const safeDemandType = isSafeSlot(demandType) ? demandType : template.supplyFallback;

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
