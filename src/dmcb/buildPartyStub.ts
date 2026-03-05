import type { PartyStub } from './types';
import type { DMCBCanonical } from './dmcbAiExtract';

/**
 * Build PartyStub from AI-extracted canonical.
 * Pure reader — no AI calls. Canonical comes from runDMCB batch extraction.
 */
export function buildPartyStub(canonical: DMCBCanonical | undefined): PartyStub {
  if (!canonical) {
    return { domain: null, company: null, confidence: 0 };
  }

  const domain = canonical.domain?.trim() || null;
  const company = canonical.company?.trim() || null;
  const confidence = canonical.confidence ?? (domain ? 0.9 : company ? 0.6 : 0);

  return { domain, company, confidence };
}
