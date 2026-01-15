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
 * Format capability string: sentence case, acronyms, conjunctions.
 * Formatting only — no meaning added.
 *
 * "ria acquisition platform transitions wealth management"
 * → "RIA acquisitions and platform transitions in wealth management"
 */
function formatCapability(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return '';

  // Known acronyms to uppercase
  const acronyms = new Set(['ria', 'm&a', 'cfo', 'ceo', 'hr', 'it', 'saas', 'b2b']);

  // Known domain words that signal "in [domain]" structure
  const domains = new Set(['wealth', 'financial', 'healthcare', 'tech', 'saas', 'legal']);

  // Split into tokens
  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 0) return '';

  // Format tokens
  const formatted: string[] = [];
  let insertedAnd = false;
  let insertedIn = false;

  for (let i = 0; i < tokens.length; i++) {
    let token = tokens[i];

    // Uppercase acronyms
    if (acronyms.has(token)) {
      token = token.toUpperCase();
    }
    // Sentence case first word
    else if (i === 0) {
      token = token.charAt(0).toUpperCase() + token.slice(1);
    }

    // Pluralize "acquisition" → "acquisitions", "transition" → "transitions"
    if (token === 'acquisition') token = 'acquisitions';
    if (token === 'transition') token = 'transitions';

    // Insert "and" before second major concept (after first noun phrase)
    if (!insertedAnd && i > 0 && (token === 'platform' || token === 'transitions')) {
      formatted.push('and');
      insertedAnd = true;
    }

    // Insert "in" before domain word
    if (!insertedIn && domains.has(tokens[i])) {
      formatted.push('in');
      insertedIn = true;
    }

    formatted.push(token);
  }

  return formatted.join(' ');
}

/**
 * Generate "what they do" line from supply data.
 * Only uses actual capability from SupplyRecord, no invented claims.
 */
function generateWhatTheyDo(supplyRecord: SupplyRecord): string {
  const capability = supplyRecord.capability || '';
  const formatted = formatCapability(capability);

  if (!formatted) {
    return '';
  }

  return `They focus on ${formatted}.`;
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
  // Template (exact structure required):
  // Hey [firstName] —
  //
  // [demand.company] [edge.evidence].
  // [demand.contact] is [demand.title].
  // [fitReason — capability only, no edge echo].
  //
  // Worth a look?

  // Extract capability-only fitReason (first sentence before edge evidence)
  // fitReason format: "Supply focuses on X. Demand shows Y." → take only first part
  // Then format the capability part for clean grammar
  const fitReasonParts = counterparty.fitReason.split('. ');
  const rawFitReason = fitReasonParts[0];

  // Extract and format capability from "Company focuses on X"
  const focusMatch = rawFitReason.match(/^(.+) focuses on (.+)$/);
  let capabilityFitReason: string;
  if (focusMatch) {
    const company = focusMatch[1];
    const capability = formatCapability(focusMatch[2]);
    capabilityFitReason = `${company} focuses on ${capability}.`;
  } else {
    capabilityFitReason = rawFitReason + '.';
  }

  const supplyLines = [
    `Hey ${supplyFirstName} —`,
    '',
    `${demand.company} ${edge.evidence}.`,
    `${demand.contact} is ${demand.title || 'the point of contact'}.`,
    capabilityFitReason,
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
