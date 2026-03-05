/**
 * IntentStamp — Phase 33
 *
 * Pure function that attaches AI-extracted intent to NormalizedRecords.
 * Bridges SignalIntelligenceService extraction → record-level intent field.
 * No mutation. No persistence. No side effects.
 */

import type { NormalizedRecord, IntentStamp } from '../schemas';
import type { ExtractedNeed, ExtractedCapability } from './SignalIntelligenceService';

// =============================================================================
// CONFIDENCE MAPPING
// =============================================================================

const CONFIDENCE_MAP: Record<string, number> = {
  high: 0.9,
  medium: 0.6,
  low: 0.3,
};

const CONFIDENCE_THRESHOLD = 0.4;

// =============================================================================
// STAMP FUNCTION
// =============================================================================

/**
 * Attach AI-extracted intent to demand and supply records.
 *
 * Rules:
 * - Returns new arrays (no in-place mutation).
 * - Only sets intent if mapped confidence >= 0.4 (skips 'low').
 * - synthesized truncated to 220 chars.
 * - Never touches ontology fields or recordKey.
 */
export function stampIntentOnRecords(
  demand: NormalizedRecord[],
  supply: NormalizedRecord[],
  intelligence: {
    needsByKey: Map<string, ExtractedNeed>;
    capabilitiesByKey: Map<string, ExtractedCapability>;
  },
): { demand: NormalizedRecord[]; supply: NormalizedRecord[] } {
  const now = new Date().toISOString();

  const stampedDemand = demand.map(r => {
    const need = intelligence.needsByKey.get(r.domain);
    if (!need) return r;

    const numericConfidence = CONFIDENCE_MAP[need.confidence] ?? 0;
    if (numericConfidence < CONFIDENCE_THRESHOLD) return r;

    const synthesized = need.extractedNeed.slice(0, 220);
    if (!synthesized) return r;

    const intent: IntentStamp = {
      synthesized,
      category: need.needCategory || undefined,
      confidence: numericConfidence,
      at: now,
      source: 'signal_intelligence_v1',
    };

    return { ...r, intent };
  });

  const stampedSupply = supply.map(r => {
    const cap = intelligence.capabilitiesByKey.get(r.domain);
    if (!cap) return r;

    const numericConfidence = CONFIDENCE_MAP[cap.confidence] ?? 0;
    if (numericConfidence < CONFIDENCE_THRESHOLD) return r;

    const synthesized = cap.extractedCapability.slice(0, 220);
    if (!synthesized) return r;

    const intent: IntentStamp = {
      synthesized,
      category: cap.capabilityCategory || undefined,
      confidence: numericConfidence,
      at: now,
      source: 'signal_intelligence_v1',
    };

    return { ...r, intent };
  });

  return { demand: stampedDemand, supply: stampedSupply };
}

/**
 * Build keyed maps from extraction result arrays.
 * Keys by domain — first extraction per domain wins.
 */
export function buildIntentMaps(
  extractedNeeds: ExtractedNeed[],
  extractedCapabilities: ExtractedCapability[],
): {
  needsByKey: Map<string, ExtractedNeed>;
  capabilitiesByKey: Map<string, ExtractedCapability>;
} {
  const needsByKey = new Map<string, ExtractedNeed>();
  for (const need of extractedNeeds) {
    if (need.domain && !needsByKey.has(need.domain)) {
      needsByKey.set(need.domain, need);
    }
  }

  const capabilitiesByKey = new Map<string, ExtractedCapability>();
  for (const cap of extractedCapabilities) {
    if (cap.domain && !capabilitiesByKey.has(cap.domain)) {
      capabilitiesByKey.set(cap.domain, cap);
    }
  }

  return { needsByKey, capabilitiesByKey };
}
