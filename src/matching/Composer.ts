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
 * Clean company name by removing legal suffixes.
 * "Demars Financial Group Llc" → "Demars Financial Group"
 */
function cleanCompanyName(name: string): string {
  if (!name) return name;

  // Suffixes to remove (case-insensitive)
  const suffixes = [
    /,?\s*(llc|l\.l\.c\.|inc\.?|inc|corp\.?|corporation|ltd\.?|limited|co\.?|company|pllc|p\.l\.l\.c\.|lp|l\.p\.|llp|l\.l\.p\.)\s*$/i
  ];

  let cleaned = name.trim();
  for (const suffix of suffixes) {
    cleaned = cleaned.replace(suffix, '').trim();
  }

  // Remove trailing comma if any
  cleaned = cleaned.replace(/,\s*$/, '').trim();

  return cleaned;
}

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
 * Extract primary title from potentially comma-separated titles.
 * "Vice President, Financial Advisor, Owner" → "Vice President"
 */
function extractPrimaryTitle(title: string): string {
  if (!title) return '';

  const trimmed = title.trim();

  // Split by comma and take first
  const parts = trimmed.split(',');
  return parts[0].trim();
}

/**
 * Format capability string: sentence case, acronyms only.
 * NO preposition insertion — caller controls prepositions.
 *
 * "ria acquisition platform transitions wealth management"
 * → "RIA acquisitions and platform transitions wealth management"
 */
function formatCapability(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return '';

  // Known acronyms to uppercase
  const acronyms = new Set(['ria', 'm&a', 'cfo', 'ceo', 'hr', 'it', 'saas', 'b2b']);

  // Split into tokens
  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 0) return '';

  // Format tokens
  const formatted: string[] = [];
  let insertedAnd = false;

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

    formatted.push(token);
  }

  return formatted.join(' ');
}

/**
 * Clean doubled prepositions from text.
 * "with in wealth" → "with wealth"
 * "in in wealth" → "in wealth"
 */
function cleanDoubledPrepositions(text: string): string {
  return text
    .replace(/\bwith in\b/gi, 'with')
    .replace(/\bin in\b/gi, 'in')
    .replace(/\bfor for\b/gi, 'for')
    .replace(/\bon on\b/gi, 'on');
}

/**
 * Check if text looks like a raw persona label (not a capability).
 * Personas describe WHO they target, not WHAT they do.
 */
function isPersonaLabel(text: string): boolean {
  const lower = text.toLowerCase();
  const personaPatterns = [
    'owner', 'founder', 'founding partner', 'ceo', 'cfo', 'cto',
    'partner', 'principal', 'director', 'vp ', 'vice president',
    'executive', 'c-level', 'c-suite', 'decision maker'
  ];
  return personaPatterns.some(p => lower.includes(p));
}

/**
 * Generate "what they do" line from supply data.
 * Only uses actual capability from SupplyRecord, no invented claims.
 *
 * RULE: Do not output raw persona labels as capabilities.
 * If capability is a persona (who they target), use neutral fallback.
 */
function generateWhatTheyDo(supplyRecord: SupplyRecord): string {
  const capability = supplyRecord.capability || '';

  // If empty, no line
  if (!capability.trim()) {
    return '';
  }

  // If it's a persona label, use neutral fallback
  if (isPersonaLabel(capability)) {
    return 'They work with firms like yours.';
  }

  const formatted = formatCapability(capability);
  if (!formatted) {
    return '';
  }

  return `They help with ${formatted}.`;
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

  // Clean company names (strip Llc, Inc, etc.)
  const demandCompany = cleanCompanyName(demand.company);
  const supplyCompany = cleanCompanyName(counterparty.company);

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
    `I'm connected to ${counterparty.contact} at ${supplyCompany}.`,
  ];

  if (whatTheyDo) {
    demandLines.push(whatTheyDo);
  }

  demandLines.push(`${demandCompany} ${edge.evidence}.`);
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

  // ==========================================================================
  // FIT REASON — Explain WHY they fit, not WHO supply is
  // ==========================================================================
  // RULE: Don't restate brand + persona. Explain the connection.
  // BAD:  "Lincoln Capital focuses on Owner/founding partner."
  // GOOD: "This fits your focus on owner-led firms."

  let fitReasonLine: string;

  // Check if we have actual capability (not persona)
  const capability = supplyRecord.capability || '';

  if (!capability.trim() || isPersonaLabel(capability)) {
    // No real capability or it's a persona — use neutral fit line
    fitReasonLine = 'Looks like a fit based on what you do.';
  } else {
    // Real capability — frame as why they fit
    const formatted = formatCapability(capability);
    fitReasonLine = `This aligns with your work in ${formatted}.`;
  }

  const supplyLines = [
    `Hey ${supplyFirstName} —`,
    '',
    `${demandCompany} ${edge.evidence}.`,
    `${demand.contact} is ${extractPrimaryTitle(demand.title) || 'the point of contact'}.`,
    fitReasonLine,
    '',
    'Worth a look?',
  ];

  const supplyBody = supplyLines.join('\n');

  // ==========================================================================
  // GRAMMAR CLEANUP: Remove doubled prepositions
  // ==========================================================================
  const cleanedDemandBody = cleanDoubledPrepositions(demandBody);
  const cleanedSupplyBody = cleanDoubledPrepositions(supplyBody);

  // ==========================================================================
  // VALIDATION: Check for banned phrases
  // ==========================================================================
  if (containsBannedPhrase(cleanedDemandBody)) {
    throw new Error(`COMPOSER_ERROR: Demand intro contains banned phrase`);
  }

  if (containsBannedPhrase(cleanedSupplyBody)) {
    throw new Error(`COMPOSER_ERROR: Supply intro contains banned phrase`);
  }

  // ==========================================================================
  // THREAD INTEGRITY: Both intros reference the SAME demand company
  // ==========================================================================
  // Demand intro: tells demand about supply → mentions demandCompany
  // Supply intro: tells supply about demand → mentions demandCompany
  // Both use the same `demand` record passed to this function.
  // No cross-leak possible within Composer — integrity maintained.

  return {
    demandBody: cleanedDemandBody,
    supplyBody: cleanedSupplyBody,
  };
}

/**
 * Validate that text does not contain banned phrases.
 * Exported for use in Gate.
 */
export function validateNoBannedPhrases(text: string): boolean {
  return !containsBannedPhrase(text);
}
