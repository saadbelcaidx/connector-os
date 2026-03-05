import type { IntentCard, IntentConfidence } from './types';
import type { DMCBCanonical } from './dmcbAiExtract';

/**
 * Convert confidence number to bucket.
 */
function confidenceToBucket(x: number): IntentConfidence {
  if (x >= 0.7) return 'high';
  if (x >= 0.4) return 'medium';
  return 'low';
}

/**
 * Build IntentCard from AI-extracted canonical.
 * Pure reader — no AI calls. Canonical comes from runDMCB batch extraction.
 */
export function synthesizeIntent(canonical: DMCBCanonical | undefined): IntentCard {
  if (!canonical) {
    return {
      who: '',
      wants: '',
      why_now: '',
      constraints: [],
      proof: '',
      confidence: 'low',
    };
  }

  return {
    who: canonical.who || '',
    wants: canonical.role === 'supply'
      ? (canonical.offers || canonical.wants || '')
      : (canonical.wants || ''),
    why_now: canonical.why_now || '',
    constraints: canonical.constraints || [],
    proof: canonical.proof || '',
    confidence: confidenceToBucket(canonical.confidence ?? 0),
  };
}
