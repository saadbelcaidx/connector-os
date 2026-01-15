/**
 * INTRO DOCTRINE — SSM-Style Deterministic Templates
 *
 * Fill-in-the-blank templates. No AI. No retries. No garbage.
 *
 * INPUTS: firstName, company, companyDescription, mode
 * OUTPUT: Plain text intro
 */

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
  demandICP?: string;  // For supply side: describes who the demand is
}

// =============================================================================
// MODE TEMPLATES — Pain framing per vertical
// =============================================================================

const MODE_TEMPLATES: Record<ConnectorMode, {
  demandPain: string;
  supplyVerb: string;
  supplyNoun: string;
}> = {
  recruiting: {
    demandPain: 'who lose months on leadership hires because recruiters don\'t really understand the space',
    supplyVerb: 'place',
    supplyNoun: 'roles',
  },
  biotech_licensing: {
    demandPain: 'who lose months in licensing because pharma BD teams don\'t really grasp the science or timing',
    supplyVerb: 'work on',
    supplyNoun: 'deals',
  },
  wealth_management: {
    demandPain: 'who leave millions on the table with generic advisors who don\'t understand concentrated stock or tax-efficient diversification',
    supplyVerb: 'work with',
    supplyNoun: 'clients',
  },
  real_estate_capital: {
    demandPain: 'who lose deals when capital partners underwrite too conservatively or don\'t get the thesis',
    supplyVerb: 'fund',
    supplyNoun: 'deals',
  },
  logistics: {
    demandPain: 'who hit growth walls when 3PLs can\'t keep up with speed or returns volume',
    supplyVerb: 'work with',
    supplyNoun: 'clients',
  },
  crypto: {
    demandPain: 'who lose months to licensing because consultants don\'t really understand custody or state-by-state requirements',
    supplyVerb: 'advise',
    supplyNoun: 'clients',
  },
  enterprise_partnerships: {
    demandPain: 'who lose quarters on integrations because partners underestimate workflows and buying cycles',
    supplyVerb: 'take on',
    supplyNoun: 'projects',
  },
  b2b_general: {
    demandPain: 'who lose time when providers don\'t really understand the space',
    supplyVerb: 'work with',
    supplyNoun: 'clients',
  },
};

// =============================================================================
// DESCRIPTION EXTRACTOR — Pull key phrase from company description
// =============================================================================

function extractDescriptionPhrase(description: string | undefined): string {
  if (!description || description.trim().length < 10) {
    return '';
  }

  const clean = description.trim();

  // If description is short enough, use it directly
  if (clean.length <= 80) {
    // Remove trailing period if present
    return clean.replace(/\.$/, '').toLowerCase();
  }

  // Take first sentence or first 80 chars
  const firstSentence = clean.split(/[.!?]/)[0];
  if (firstSentence && firstSentence.length <= 80) {
    return firstSentence.toLowerCase();
  }

  // Truncate to first 80 chars at word boundary
  const truncated = clean.substring(0, 80).replace(/\s+\S*$/, '');
  return truncated.toLowerCase();
}

// =============================================================================
// DEMAND INTRO — To companies with need
// Pattern: "Noticed [company] is [description] — I know [similar people] [pain]"
// =============================================================================

function generateDemandIntro(ctx: IntroContext, mode: ConnectorMode): string {
  const { firstName, company, companyDescription } = ctx;
  const template = MODE_TEMPLATES[mode];
  const name = firstName || 'there';

  const descPhrase = extractDescriptionPhrase(companyDescription);

  if (descPhrase) {
    return `Hey ${name} —

Noticed ${company} is ${descPhrase} — I know companies in similar situations ${template.demandPain}.

I can connect you directly if useful.`;
  }

  // Fallback without description
  return `Hey ${name} —

I know companies like ${company} ${template.demandPain}.

I can connect you directly if useful.`;
}

// =============================================================================
// SUPPLY INTRO — To providers
// Pattern: "I'm in touch with [demand ICP] dealing with [pain] — looks like your space"
// =============================================================================

function generateSupplyIntro(ctx: IntroContext, mode: ConnectorMode): string {
  const { firstName, company, demandICP, companyDescription } = ctx;
  const template = MODE_TEMPLATES[mode];
  const name = firstName || 'there';

  // Use demandICP if provided, otherwise extract from description
  const icpPhrase = demandICP || extractDescriptionPhrase(companyDescription);

  if (icpPhrase) {
    return `Hey ${name} —

I'm in touch with ${icpPhrase} — looks like the type of ${template.supplyNoun} you guys ${template.supplyVerb}.

I can connect you directly if useful. Would that be helpful?`;
  }

  // Fallback without ICP description
  return `Hey ${name} —

I'm in touch with a company that looks like the type of ${template.supplyNoun} you guys ${template.supplyVerb}.

I can connect you directly if useful. Would that be helpful?`;
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
