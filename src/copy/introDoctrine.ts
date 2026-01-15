/**
 * INTRO DOCTRINE — SSM-Style Deterministic Templates
 *
 * Intros are ASSEMBLED, not generated.
 * Input → Normalize → Validate → Select Template → Fill Slots → Output
 *
 * NO OTHER PATH IS ALLOWED.
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
  demandType?: { type?: string } | string;
  preSignalContext?: string;
}

// =============================================================================
// NEUTRAL PAIN — Used when mode-specific pain is inappropriate
// =============================================================================

const NEUTRAL_PAIN = 'teams who run into friction when evaluating new partners in this space';

// =============================================================================
// ALLOWED PAIN TARGETS — Pain injection requires BOTH mode AND demandType match
// =============================================================================

const ALLOWED_PAIN_TARGETS: Record<ConnectorMode, string[]> = {
  recruiting: ['hiring_company', 'scaling_team', 'talent_search'],
  biotech_licensing: ['biotech', 'pharma', 'life_sciences', 'drug_development'],
  wealth_management: ['hnw_individual', 'family_office', 'wealth_client'],
  real_estate_capital: ['developer', 'sponsor', 'real_estate_investor'],
  logistics: ['ecommerce_brand', 'dtc_brand', 'fulfillment_seeker'],
  crypto: ['crypto_platform', 'fintech_platform', 'exchange', 'defi_protocol'],
  enterprise_partnerships: ['enterprise', 'saas_company', 'integration_seeker'],
  b2b_general: [],  // b2b_general always uses its pain (no gating)
};

// =============================================================================
// MODE TEMPLATES — Pain framing per vertical (MODE-LOCKED)
// =============================================================================

const MODE_TEMPLATES: Record<ConnectorMode, {
  demandPain: string;
  demandFallback: string;
  supplyFallback: string;
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
// PAIN SELECTION — Mode + demandType validation
// =============================================================================

function selectPain(mode: ConnectorMode, demandType?: { type?: string } | string): string {
  const template = MODE_TEMPLATES[mode] || MODE_TEMPLATES.b2b_general;
  const allowedTargets = ALLOWED_PAIN_TARGETS[mode] || [];

  // b2b_general has no gating — always uses its pain
  if (mode === 'b2b_general' || allowedTargets.length === 0) {
    return template.demandPain;
  }

  // Extract demandType value
  const demandTypeValue = typeof demandType === 'object' ? demandType?.type : demandType;

  // Check if demandType is in allowed targets
  if (demandTypeValue && allowedTargets.includes(demandTypeValue)) {
    return template.demandPain;
  }

  // demandType not in allowed targets → NEUTRAL_PAIN
  return NEUTRAL_PAIN;
}

// =============================================================================
// DEMAND INTRO — To companies with need
// =============================================================================

function generateDemandIntro(ctx: IntroContext, mode: ConnectorMode): string {
  const { firstName, company, companyDescription, demandType, preSignalContext } = ctx;
  const template = MODE_TEMPLATES[mode] || MODE_TEMPLATES.b2b_general;
  const name = firstName || 'there';

  // SELECT PAIN (gated by mode + demandType)
  const pain = selectPain(mode, demandType);

  // VALIDATE SUMMARY (returns null if invalid)
  const validatedSummary = cleanCompanySummary(companyDescription, company);

  // FALLBACK if null
  const demandSummary = validatedSummary !== null ? validatedSummary : template.demandFallback;

  // PRE-SIGNAL CONTEXT PATH
  if (preSignalContext && isSafeSlot(preSignalContext)) {
    return `Hey ${name} —

${preSignalContext.trim()}

I know ${pain}.

I can connect you directly if useful.`;
  }

  // STANDARD DEMAND INTRO
  return `Hey ${name} —

Noticed ${company} ${demandSummary} — I know ${pain}.

I can connect you directly if useful.`;
}

// =============================================================================
// SUPPLY INTRO — To providers
// =============================================================================

function generateSupplyIntro(ctx: IntroContext, mode: ConnectorMode): string {
  const { firstName, demandType, preSignalContext } = ctx;
  const template = MODE_TEMPLATES[mode] || MODE_TEMPLATES.b2b_general;
  const name = firstName || 'there';

  // Extract string value from demandType
  const demandTypeStr = typeof demandType === 'string' ? demandType : undefined;

  // VALIDATE demandType
  const safeDemandType = isSafeSlot(demandTypeStr) ? demandTypeStr : template.supplyFallback;

  // PRE-SIGNAL CONTEXT PATH
  if (preSignalContext && isSafeSlot(preSignalContext)) {
    return `Hey ${name} —

${preSignalContext.trim()}

I'm in touch with ${safeDemandType} — looks like the kind of teams you work with.

I can connect you directly if useful.`;
  }

  // STANDARD SUPPLY INTRO
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
// EXPORTS FOR TESTING
// =============================================================================

export { ALLOWED_PAIN_TARGETS, MODE_TEMPLATES, NEUTRAL_PAIN, selectPain };
