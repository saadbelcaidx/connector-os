/**
 * CLEAN COMPANY SUMMARY — VALIDATOR (NOT FORMATTER)
 *
 * Returns string | null. Never repairs garbage.
 * If validation fails → return null → caller uses fallback.
 *
 * NO EXCEPTIONS.
 */

// =============================================================================
// REJECTION PATTERNS — Any match = null
// =============================================================================

const SLOGAN_PATTERNS = [
  /world'?s (first|leading|best|#1)/i,
  /leading (provider|platform|solution)/i,
  /revolutioniz/i,
  /transform(ing|ative)/i,
  /game.?chang/i,
  /disrupt/i,
  /next.?gen/i,
  /cutting.?edge/i,
  /state.?of.?the.?art/i,
  /best.?in.?class/i,
  /industry.?leading/i,
  /award.?winning/i,
  /innovative/i,
  /pioneering/i,
];

const SUPERLATIVE_PATTERNS = [
  /\b(best|greatest|fastest|smartest|most advanced)\b/i,
  /\b(ultimate|unparalleled|unmatched|unprecedented)\b/i,
  /\b(premier|elite|top-tier|world-class)\b/i,
];

const ASPIRATION_PATTERNS = [
  /our mission/i,
  /we believe/i,
  /our vision/i,
  /we strive/i,
  /committed to/i,
  /dedicated to/i,
  /passionate about/i,
  /empowering/i,
  /reimagin/i,
];

const GARBAGE_CHARS = /[#@🚀💡✨🔥⚡️🎯💪🏆]/;

const TRUNCATION_PATTERNS = [
  /\.{3,}$/,  // ends with ...
  /…$/,       // ends with ellipsis
  /\s—$/,     // ends with em dash
  /\s-$/,     // ends with hyphen
];

// =============================================================================
// VALIDATOR
// =============================================================================

/**
 * Validate and clean company summary.
 * Returns cleaned string if valid, null if rejected.
 *
 * @param description - Raw company description
 * @param companyName - Optional company name to check for repetition
 */
export function cleanCompanySummary(
  description?: string,
  companyName?: string
): string | null {
  if (!description) return null;

  // Extract first clause (before bullets, colons, newlines)
  let text = description
    .split(/[\n•\-–—:]/)[0]
    .replace(/\s+/g, ' ')
    .trim();

  // Too short = unusable
  if (text.length < 10) return null;

  // Too long = probably garbage
  if (text.length > 150) return null;

  // Check for slogans
  for (const pattern of SLOGAN_PATTERNS) {
    if (pattern.test(text)) return null;
  }

  // Check for superlatives
  for (const pattern of SUPERLATIVE_PATTERNS) {
    if (pattern.test(text)) return null;
  }

  // Check for aspirational language
  for (const pattern of ASPIRATION_PATTERNS) {
    if (pattern.test(text)) return null;
  }

  // Check for garbage characters (emojis, hashtags, mentions)
  if (GARBAGE_CHARS.test(text)) return null;

  // Check for truncation
  for (const pattern of TRUNCATION_PATTERNS) {
    if (pattern.test(text)) return null;
  }

  // Check for company name repetition (if provided)
  if (companyName && companyName.length > 2) {
    const namePattern = new RegExp(`\\b${escapeRegex(companyName)}\\b`, 'i');
    if (namePattern.test(text)) {
      // Remove company name and re-validate
      text = text.replace(namePattern, '').replace(/\s+/g, ' ').trim();
      if (text.length < 10) return null;
    }
  }

  // Check for verb-object structure (must have a verb)
  const hasVerb = /\b(is|are|was|were|builds?|provides?|offers?|creates?|develops?|delivers?|helps?|enables?|makes?|runs?|operates?|manages?|focuses|specializes?)\b/i.test(text);
  if (!hasVerb) return null;

  // Remove "is a/an" prefix for cleaner output
  text = text.replace(/^(is|are)\s+(a|an)\s+/i, '').trim();

  // Final length check
  if (text.length < 5 || text.length > 120) return null;

  return text;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * PRE-FLIGHT SLOT VALIDATION — Block malformed text
 * Used for demandType and preSignalContext validation
 */
export function isSafeSlot(value?: string): boolean {
  if (!value) return false;
  if (value.length < 3) return false;
  if (/[:\n•—]/.test(value)) return false;
  if (GARBAGE_CHARS.test(value)) return false;
  return true;
}
