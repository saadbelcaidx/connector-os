/**
 * INTRO GENERATOR — Thin wrapper around introDoctrine
 *
 * No AI. No retries. Just fills templates.
 */

import {
  composeIntro,
  ConnectorMode,
  IntroSide,
  IntroContext,
} from '../copy/introDoctrine';

// =============================================================================
// TYPES
// =============================================================================

interface IntroResult {
  intro: string;
  validated: boolean;
}

interface DemandIntroInput {
  firstName: string;
  company: string;
  companyDescription?: string;
  connectorMode?: string;
}

interface SupplyIntroInput {
  firstName: string;
  company: string;
  companyDescription?: string;
  demandICP?: string;
  connectorMode?: string;
}

// =============================================================================
// DEMAND INTRO
// =============================================================================

export function generateDemandIntro(input: DemandIntroInput): IntroResult {
  const ctx: IntroContext = {
    firstName: input.firstName || 'there',
    company: input.company || 'your company',
    companyDescription: input.companyDescription,
  };

  const intro = composeIntro({
    side: 'demand',
    mode: (input.connectorMode as ConnectorMode) || 'b2b_general',
    ctx,
  });

  return { intro, validated: true };
}

// =============================================================================
// SUPPLY INTRO
// =============================================================================

export function generateSupplyIntro(input: SupplyIntroInput): IntroResult {
  const ctx: IntroContext = {
    firstName: input.firstName || 'there',
    company: input.company || 'a company',
    companyDescription: input.companyDescription,
    demandICP: input.demandICP,
  };

  const intro = composeIntro({
    side: 'supply',
    mode: (input.connectorMode as ConnectorMode) || 'b2b_general',
    ctx,
  });

  return { intro, validated: true };
}
