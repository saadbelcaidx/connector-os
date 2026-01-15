/**
 * COMPOSER
 *
 * Generates intro text for demand and supply sides.
 * Enforces language rules: no banned phrases, named contacts only.
 *
 * LANGUAGE RULES:
 * - BANNED: "I work with", "My client", "We partner with"
 * - ALLOWED: "I'm connected to", "I'm in touch with", "I know"
 * - Must be verifiable statements only
 */

import type { DemandRecord } from '../schemas/DemandRecord';
import type { SupplyRecord } from '../schemas/SupplyRecord';
import type { Edge } from '../schemas/Edge';
import type { Counterparty } from '../schemas/IntroOutput';

// =============================================================================
// BANNED PHRASES
// =============================================================================

const BANNED_PHRASES = [
  'i work with',
  'my client',
  'we partner with',
  'our client',
  'our partner',
  'we work with',
] as const;

/**
 * Check if text contains any banned phrase.
 */
function containsBannedPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  return BANNED_PHRASES.some(phrase => lower.includes(phrase));
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Extract first name from full name.
 * Falls back to full contact name if no space found.
 */
function extractFirstName(fullName: string): string {
  const trimmed = (fullName || '').trim();
  if (!trimmed) {
    return 'there';
  }

  const parts = trimmed.split(/\s+/);
  return parts[0] || trimmed;
}

/**
 * Generate "what they do" line from supply data.
 * Only uses actual capability from SupplyRecord, no invented claims.
 */
function generateWhatTheyDo(supplyRecord: SupplyRecord): string {
  // Use capability directly from supply record
  const capability = supplyRecord.capability || '';
  const trimmed = capability.trim();

  if (!trimmed) {
    return '';
  }

  // Simple, factual statement based on capability
  return `They focus on ${trimmed.toLowerCase()}.`;
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

export interface ComposerOutput {
  demandBody: string;
  supplyBody: string;
}

/**
 * Compose intro text for both demand and supply sides.
 *
 * @param demand - DemandRecord
 * @param edge - Detected edge
 * @param counterparty - Named counterparty from supply
 * @param supplyRecord - Full supply record for capability extraction
 * @returns ComposerOutput with demandBody and supplyBody
 * @throws Error if composed text contains banned phrases
 */
export function composeIntros(
  demand: DemandRecord,
  edge: Edge,
  counterparty: Counterparty,
  supplyRecord: SupplyRecord
): ComposerOutput {
  // Extract first names
  const demandFirstName = extractFirstName(demand.contact);
  const supplyFirstName = extractFirstName(counterparty.contact);

  // Generate "what they do" line from supply record's capability
  const whatTheyDo = generateWhatTheyDo(supplyRecord);

  // ==========================================================================
  // DEMAND INTRO
  // ==========================================================================
  // Template:
  // Hey [firstName] —
  //
  // I'm connected to [counterparty.contact] at [counterparty.company].
  // [What they do/want].
  // [demand.company] [edge.evidence].
  //
  // Worth an intro?

  const demandLines = [
    `Hey ${demandFirstName} —`,
    '',
    `I'm connected to ${counterparty.contact} at ${counterparty.company}.`,
  ];

  if (whatTheyDo) {
    demandLines.push(whatTheyDo);
  }

  demandLines.push(`${demand.company} ${edge.evidence}.`);
  demandLines.push('');
  demandLines.push('Worth an intro?');

  const demandBody = demandLines.join('\n');

  // ==========================================================================
  // SUPPLY INTRO
  // ==========================================================================
  // Template:
  // Hey [firstName] —
  //
  // [demand.company] [edge.evidence].
  // [demand.contact] is [demand.title].
  // [fitReason].
  //
  // Worth a look?

  const supplyLines = [
    `Hey ${supplyFirstName} —`,
    '',
    `${demand.company} ${edge.evidence}.`,
    `${demand.contact} is ${demand.title || 'the point of contact'}.`,
    counterparty.fitReason,
    '',
    'Worth a look?',
  ];

  const supplyBody = supplyLines.join('\n');

  // ==========================================================================
  // VALIDATION: Check for banned phrases
  // ==========================================================================
  if (containsBannedPhrase(demandBody)) {
    throw new Error(`COMPOSER_ERROR: Demand intro contains banned phrase`);
  }

  if (containsBannedPhrase(supplyBody)) {
    throw new Error(`COMPOSER_ERROR: Supply intro contains banned phrase`);
  }

  return {
    demandBody,
    supplyBody,
  };
}

/**
 * Validate that text does not contain banned phrases.
 * Exported for use in Gate.
 */
export function validateNoBannedPhrases(text: string): boolean {
  return !containsBannedPhrase(text);
}
