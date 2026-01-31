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
 *
 * CSV-ONLY (user.txt contract):
 * - Uses evidence keywords to generate appropriate bridge language
 * - NO entity type inference — signalType branches removed
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
 * Clean company name by removing legal suffixes and normalizing ALL CAPS.
 * "REFLEXIVE CAPITAL MANAGEMENT LP" → "Reflexive Capital Management"
 * "Demars Financial Group Llc" → "Demars Financial Group"
 */
function cleanCompanyName(name: string): string {
  if (!name) return name;

  let cleaned = name.trim();

  // STEP 0: Convert ALL CAPS to Title Case
  const lettersOnly = cleaned.replace(/[^a-zA-Z]/g, '');
  const uppercaseCount = (lettersOnly.match(/[A-Z]/g) || []).length;
  const isAllCaps = lettersOnly.length > 3 && uppercaseCount / lettersOnly.length > 0.8;

  if (isAllCaps) {
    const acronyms = new Set(['LP', 'LLC', 'LLP', 'GP', 'INC', 'CORP', 'LTD', 'CO', 'USA', 'UK', 'NYC', 'LA', 'SF', 'AI', 'ML', 'IT', 'HR', 'VP', 'CEO', 'CFO', 'CTO', 'COO', 'RIA', 'AUM', 'PE', 'VC']);
    cleaned = cleaned
      .toLowerCase()
      .split(/(\s+)/)
      .map(word => {
        const upper = word.toUpperCase();
        if (acronyms.has(upper)) return upper;
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join('');
  }

  // Suffixes to remove (case-insensitive)
  const suffixes = [
    /,?\s*(llc|l\.l\.c\.|inc\.?|inc|corp\.?|corporation|ltd\.?|limited|co\.?|company|pllc|p\.l\.l\.c\.|lp|l\.p\.|llp|l\.l\.p\.)\s*$/i
  ];

  for (const suffix of suffixes) {
    cleaned = cleaned.replace(suffix, '').trim();
  }

  // Remove trailing comma if any
  cleaned = cleaned.replace(/,\s*$/, '').trim();

  return cleaned;
}

/**
 * Extract capability from company name when no explicit capability exists.
 * "All Star Incentive Marketing" → "marketing"
 * "Colab" → "" (no signal)
 */
function extractCapabilityFromCompanyName(companyName: string): string {
  const lower = (companyName || '').toLowerCase();

  // INVESTING / CAPITAL — distinct from sales
  if (/invest|capital|ventures|vc\b|fund\b|equity|asset/.test(lower)) {
    return 'investing';
  }
  if (/marketing|growth|brand|creative|media|advertising|pr\b|communications/.test(lower)) {
    return 'marketing';
  }
  if (/recruit|talent|staffing|hiring|headhunt|hr\b|people/.test(lower)) {
    return 'recruiting';
  }
  if (/tech|software|dev|engineering|labs|digital|app|web|cloud|data|ai\b|ml\b/.test(lower)) {
    return 'engineering';
  }
  // SALES — only actual sales indicators
  if (/sales|revenue|consulting|advisory/.test(lower)) {
    return 'sales';
  }
  if (/finance|accounting|cfo|bookkeep|tax/.test(lower)) {
    return 'finance';
  }
  if (/design|ux|ui|creative|studio/.test(lower)) {
    return 'design';
  }
  if (/legal|law|compliance|counsel/.test(lower)) {
    return 'legal';
  }

  return '';
}

/**
 * Detect what the supplier does from their capability string.
 */
function detectSupplyCategory(capability: string): string {
  const lower = (capability || '').toLowerCase();

  // INVESTING — distinct from sales/finance
  if (/invest|capital|venture|vc\b|fund|equity|asset|portfolio/i.test(lower)) {
    return 'investing';
  }
  if (/marketing|growth|gtm|demand gen|brand|content|seo|paid|advertising/i.test(lower)) {
    return 'marketing';
  }
  if (/recruit|talent|hiring|staffing|headhunt/i.test(lower)) {
    return 'recruiting';
  }
  if (/engineer|dev|software|tech|product|app|web|mobile/i.test(lower)) {
    return 'engineering';
  }
  if (/sales|revenue|bd|business development|account/i.test(lower)) {
    return 'sales';
  }
  if (/finance|cfo|accounting|bookkeeping|fractional/i.test(lower)) {
    return 'finance';
  }
  if (/hr|people|culture|org design/i.test(lower)) {
    return 'hr';
  }
  if (/design|creative|ux|ui|brand/i.test(lower)) {
    return 'design';
  }
  if (/legal|compliance|counsel/i.test(lower)) {
    return 'legal';
  }
  if (/ops|operations|strategy|consulting/i.test(lower)) {
    return 'operations';
  }

  return 'general';
}

/**
 * Build a bridge phrase that connects demand evidence to supply capability.
 *
 * PATTERN: Signal → Immediate Pressure → (implicit supply relevance)
 *
 * The bridge explains WHY the signal matters NOW, not just what happened.
 * This is what separates a connector from a spammer.
 *
 * CSV-ONLY (user.txt contract):
 * - Uses evidence keywords as PRIMARY routing
 * - NO entity type inference — signalType branches removed
 */
function buildBridge(evidence: string, capability: string): string {
  const evLower = evidence.toLowerCase();
  const supplyCategory = detectSupplyCategory(capability);

  // =========================================================================
  // CSV-ONLY: Evidence-based routing (no signalType branches)
  // =========================================================================

  // =========================================================================
  // FUNDING SIGNAL — Post-raise pressure is real and urgent
  // =========================================================================
  if (evLower.includes('funding') || evLower.includes('raised') || evLower.includes('series')) {
    switch (supplyCategory) {
      case 'marketing': return 'teams at this stage usually move fast on GTM experiments';
      case 'recruiting': return 'leadership is often pressure-testing external partners early';
      case 'engineering': return 'post-raise timelines usually compress — shipping speed matters';
      case 'sales': return 'boards expect pipeline acceleration after a raise';
      case 'finance': return 'investors usually want tighter financial ops post-close';
      case 'hr': return 'scaling headcount post-raise usually strains people ops';
      case 'design': return 'post-raise companies often rebrand or redesign fast';
      case 'legal': return 'new capital usually triggers compliance reviews';
      case 'operations': return 'post-raise growth usually exposes ops gaps quickly';
      default: return 'teams at this stage usually move fast on partners';
    }
  }

  // =========================================================================
  // HIRING ENGINEERS — Internal bandwidth is tight
  // =========================================================================
  if ((evLower.includes('hiring') || evLower.includes('engineer') || evLower.includes('developer')) &&
      (evLower.includes('engineer') || evLower.includes('developer') || evLower.includes('software') || evLower.includes('tech'))) {
    switch (supplyCategory) {
      case 'recruiting': return 'usually a sign internal bandwidth is tight';
      case 'engineering': return 'teams hiring devs often need extra capacity while ramping';
      case 'marketing': return 'eng hiring usually means product is ahead of GTM';
      case 'sales': return 'tech hiring often signals product-market fit — sales follows';
      default: return 'usually a sign internal bandwidth is tight';
    }
  }

  // =========================================================================
  // HIRING SALES — Pipeline needs to scale
  // =========================================================================
  if ((evLower.includes('hiring') || evLower.includes('sales') || evLower.includes('account')) &&
      (evLower.includes('sales') || evLower.includes('account executive') || evLower.includes('revenue') || evLower.includes('bdr'))) {
    switch (supplyCategory) {
      case 'recruiting': return 'often means pipeline needs to scale quickly';
      case 'sales': return 'sales hiring usually signals quota pressure';
      case 'marketing': return 'sales expansion usually needs marketing air cover';
      default: return 'often means pipeline needs to scale quickly';
    }
  }

  // =========================================================================
  // HIRING MARKETING — GTM is becoming priority
  // =========================================================================
  if ((evLower.includes('hiring') || evLower.includes('marketing') || evLower.includes('growth')) &&
      (evLower.includes('marketing') || evLower.includes('growth') || evLower.includes('brand') || evLower.includes('content'))) {
    switch (supplyCategory) {
      case 'marketing': return 'usually means demand gen is becoming a priority';
      case 'recruiting': return 'marketing hiring often precedes broader team expansion';
      default: return 'usually means brand or demand gen is becoming a priority';
    }
  }

  // =========================================================================
  // GENERAL HIRING SIGNAL — Scaling pain
  // =========================================================================
  if (evLower.includes('hiring') || evLower.includes('open roles') || evLower.includes('job')) {
    switch (supplyCategory) {
      case 'marketing': return 'hiring surges often mean GTM needs to catch up';
      case 'recruiting': return 'hiring at this pace usually strains internal recruiting';
      case 'engineering': return 'hiring pushes often mean product timelines are tight';
      case 'sales': return 'team growth usually signals revenue targets are climbing';
      case 'finance': return 'headcount growth usually complicates financial ops';
      case 'hr': return 'hiring velocity like this usually strains people ops';
      case 'operations': return 'rapid hiring usually exposes process gaps';
      default: return 'teams hiring this fast usually need outside help';
    }
  }

  // =========================================================================
  // INDUSTRY/SCALING SIGNAL — Competitive pressure
  // =========================================================================
  if (evLower.includes('scaling') || evLower.includes('growing in') || evLower.includes('expanding')) {
    switch (supplyCategory) {
      case 'marketing': return 'competitive markets tend to reward speed here';
      case 'recruiting': return 'growth at this pace usually requires specialist recruiters';
      case 'engineering': return 'scaling in competitive markets usually requires extra dev firepower';
      case 'sales': return 'market expansion usually requires sales infrastructure fast';
      default: return 'competitive markets tend to reward speed here';
    }
  }

  // =========================================================================
  // SOFT SIGNALS — Generic but still consequence-focused
  // =========================================================================
  switch (supplyCategory) {
    case 'marketing': return 'companies showing this momentum often explore GTM partners';
    case 'recruiting': return 'companies at this stage often explore outside recruiting help';
    case 'engineering': return 'companies showing activity often explore dev partnerships';
    case 'sales': return 'companies with this momentum often explore sales acceleration';
    case 'finance': return 'companies at this stage often bring in finance specialists';
    case 'hr': return 'companies scaling often bring in people ops help';
    default: return 'companies showing this momentum often explore outside partners';
  }
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
 * Sanitize evidence: if it looks like a job title/specialty, return generic fallback.
 * Stripe doctrine: never output garbage, fail gracefully.
 *
 * BAD: "Healthcare Provider - Nurse Practitioner, Psych/Mental Health"
 * GOOD: "is showing activity"
 */
function sanitizeEvidence(evidence: string): string {
  if (!evidence || !evidence.trim()) {
    return 'is showing activity';
  }

  const lower = evidence.toLowerCase();

  // Detect job title / specialty patterns (not real signals)
  const titlePatterns = [
    /\bprovider\b/i,
    /\bpractitioner\b/i,
    /\bspecialist\b/i,
    /\bnurse\b/i,
    /\bphysician\b/i,
    /\btherapist\b/i,
    /\bcounselor\b/i,
    /\bdoctor\b/i,
    /\bpsych\b/i,
    /\bmental health\b/i,
    /\bhealthcare\b/i,
    /\bmedical\b/i,
    /\bclinical\b/i,
    /\bcertified\b/i,
    /\blicensed\b/i,
    /\bregistered\b/i,
    /\bceo\b/i,
    /\bcfo\b/i,
    /\bcto\b/i,
    /\bowner\b/i,
    /\bfounder\b/i,
    /\bdirector\b/i,
    /\bmanager\b/i,
    /\bpresident\b/i,
    /\bvice president\b/i,
    /\bpartner\b/i,
  ];

  // If evidence matches title patterns, use fallback
  if (titlePatterns.some(p => p.test(lower))) {
    return 'is showing activity';
  }

  // If evidence is too short (< 5 chars) or doesn't start with a verb-like word, fix it
  const trimmed = evidence.trim();
  if (trimmed.length < 5) {
    return 'is showing activity';
  }

  // If evidence doesn't start with "is", "has", "raised", "hiring", etc., prepend "is"
  const startsWithVerb = /^(is|are|has|had|was|were|raised|hiring|expanding|scaling|growing|launched|announced|closed|secured|opened)/i.test(trimmed);
  if (!startsWithVerb) {
    // Check if it's a noun phrase that should have "is" prepended
    // But only if it's a reasonable signal phrase
    if (titlePatterns.some(p => p.test(lower))) {
      return 'is showing activity';
    }
  }

  return trimmed;
}

/**
 * Check if text looks like a raw persona label (not a capability).
 * Personas describe WHO they target, not WHAT they do.
 * Also catches job titles like "President of Company Name".
 */
function isPersonaLabel(text: string): boolean {
  const lower = text.toLowerCase();

  // Direct job title patterns
  const personaPatterns = [
    'owner', 'founder', 'founding partner', 'ceo', 'cfo', 'cto', 'coo', 'cmo',
    'partner', 'principal', 'director', 'vp ', 'vice president', 'president',
    'executive', 'c-level', 'c-suite', 'decision maker', 'managing director',
    'head of', 'chief', 'chairman', 'board member'
  ];

  // Check direct patterns
  if (personaPatterns.some(p => lower.includes(p))) {
    return true;
  }

  // Catch "Title of Company" pattern (e.g., "President of All Star Incentive Marketing")
  // This is a job title, not a capability
  if (/^[a-z\s]+ of [a-z\s]+$/i.test(text.trim()) && text.length > 20) {
    return true;
  }

  return false;
}

/**
 * Generate "what they do" line from supply data.
 * Only uses actual capability from SupplyRecord, no invented claims.
 *
 * RULE: Do not output raw persona labels as capabilities.
 * If capability is a persona (who they target), try company name extraction first.
 *
 * FALLBACK CHAIN:
 * 1. supplyRecord.capability (if not persona label)
 * 2. extractCapabilityFromCompanyName(company) (if capability is persona or empty)
 * 3. Neutral fallback: "They work with firms like yours."
 */
function generateWhatTheyDo(supplyRecord: SupplyRecord): string {
  const capability = supplyRecord.capability || '';

  // If capability exists and is NOT a persona label, use it
  if (capability.trim() && !isPersonaLabel(capability)) {
    const formatted = formatCapability(capability);
    if (formatted) {
      return `They help with ${formatted}.`;
    }
  }

  // Fallback: try extracting from company name
  // "All Star Incentive Marketing" → "marketing"
  const companyCapability = extractCapabilityFromCompanyName(supplyRecord.company || '');
  if (companyCapability) {
    return `They help with ${companyCapability}.`;
  }

  // Final fallback: neutral line
  return 'They work with firms like yours.';
}

/**
 * Build supply relevance phrase for demand intro.
 * Explains WHY supply is relevant to the signal, not just WHAT they do.
 *
 * CSV-ONLY (user.txt contract):
 * - Uses evidence keywords as PRIMARY routing
 * - NO entity type inference — signalType branches removed
 *
 * Returns a phrase that completes: "folks at [supply] who [relevance]"
 */
function buildSupplyRelevance(supplyCategory: string, evidence?: string): string {
  const evLower = (evidence || '').toLowerCase();

  // ==========================================================================
  // CSV-ONLY: Evidence-based relevance (no signalType branches)
  // ==========================================================================

  // FUNDING signals
  if (evLower.includes('funding') || evLower.includes('raised') || evLower.includes('series')) {
    switch (supplyCategory) {
      case 'investing': return 'work with companies at your stage';
      case 'marketing': return 'help post-raise companies scale GTM';
      case 'recruiting': return 'help post-raise companies build teams';
      case 'engineering': return 'help companies ship faster post-raise';
      case 'sales': return 'help companies accelerate pipeline after raises';
      case 'finance': return 'help companies tighten ops post-raise';
      default: return 'work with companies at your stage';
    }
  }

  // HIRING / LEADERSHIP signals
  if (evLower.includes('hiring') || evLower.includes('open') || evLower.includes('leadership')) {
    switch (supplyCategory) {
      case 'recruiting': return 'specialize in roles like this';
      case 'engineering': return 'augment teams during hiring ramps';
      case 'hr': return 'help scale people ops';
      default: return 'help companies in similar situations';
    }
  }

  // GROWTH signals
  if (evLower.includes('growth') || evLower.includes('scaling') || evLower.includes('expanding')) {
    switch (supplyCategory) {
      case 'marketing': return 'help fast-growing companies scale GTM';
      case 'sales': return 'help companies accelerate revenue';
      case 'operations': return 'help companies scale operations';
      case 'recruiting': return 'help fast-growing companies build teams';
      default: return 'work with companies scaling like this';
    }
  }

  // ==========================================================================
  // GENERAL FALLBACKS BY SUPPLY CATEGORY
  // ==========================================================================
  switch (supplyCategory) {
    case 'investing': return 'invest in companies like this';
    case 'marketing': return 'help companies like this grow';
    case 'recruiting': return 'help companies like this hire';
    case 'engineering': return 'help companies like this build';
    case 'sales': return 'help companies like this scale';
    case 'finance': return 'help companies like this with financial ops';
    case 'hr': return 'help companies like this with people ops';
    case 'design': return 'help companies like this with design';
    case 'legal': return 'help companies like this with compliance';
    case 'operations': return 'help companies like this with operations';
    default: return 'work with companies like this';
  }
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

  // ==========================================================================
  // SUPPLY RELEVANCE — What makes supply relevant to this signal
  // ==========================================================================
  const supplyCapability = supplyRecord.capability
    || extractCapabilityFromCompanyName(supplyRecord.company)
    || '';
  const supplyCategory = detectSupplyCategory(supplyCapability);
  const supplyRelevance = buildSupplyRelevance(supplyCategory, edge.evidence);

  // ==========================================================================
  // DEMAND INTRO — Signal-First Template
  // ==========================================================================
  // Template (signal-first, named counterparty):
  // Hey [firstName] —
  //
  // Noticed [company] [evidence] — I'm connected to [contact] at [supply] who [relevance].
  //
  // Worth an intro?

  // Sanitize evidence to prevent garbage output (Stripe doctrine)
  const safeEvidence = sanitizeEvidence(edge.evidence);

  const demandLines = [
    `Hey ${demandFirstName} —`,
    '',
    `Noticed ${demandCompany} ${safeEvidence} — I'm connected to ${counterparty.contact} at ${supplyCompany} who ${supplyRelevance}.`,
    '',
    'Worth an intro?',
  ];

  const demandBody = demandLines.join('\n');

  // ==========================================================================
  // SUPPLY INTRO — Signal-First Template
  // ==========================================================================
  // Template (signal-first, named contact):
  // Hey [firstName] —
  //
  // [demand.company] [evidence] — [contact] ([title]) is driving it.
  //
  // Worth a look?

  const demandTitle = extractPrimaryTitle(demand.title) || 'decision maker';

  const supplyLines = [
    `Hey ${supplyFirstName} —`,
    '',
    `${demandCompany} ${safeEvidence} — ${demand.contact} (${demandTitle}) is driving it.`,
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
