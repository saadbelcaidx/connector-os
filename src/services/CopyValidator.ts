/**
 * CopyValidator.ts
 *
 * VALIDATES COPY AGAINST MODE + EVIDENCE
 *
 * AI may:
 * - Rewrite tone
 * - Shorten
 * - Improve clarity
 *
 * AI may NOT:
 * - Introduce claims
 * - Change intent
 * - Cross lanes (demand ↔ supply)
 *
 * Validation errors BLOCK SEND with explicit reasons.
 */

import {
  type ConnectorMode,
  type VocabularyProfile,
  getModeContract,
  getForbiddenVocabulary,
  MODE_REGISTRY_VERSION,
} from './ConnectorModeRegistry';

import {
  type EvidenceSet,
  validateText,
  sanitizeText,
  emptyEvidenceSet,
} from './EvidenceGate';

// =============================================================================
// PRESIGNAL ENFORCEMENT (PRODUCTION BLOCKER)
// =============================================================================

/**
 * Presignal status - computed once per entity
 */
export type PreSignalStatus = 'present' | 'missing';

/**
 * Activity and timing words that REQUIRE presignal evidence.
 * These cannot be derived from company descriptions.
 */
export const ACTIVITY_TIMING_WORDS = [
  'hiring',
  'scaling',
  'growing',
  'expanding',
  'ramping up',
  'building out',
  'bringing on',
  'looking for',
  'seeking',
  'recently',
  'now',
  'currently',
  'just',
  'active',
  'exciting phase',
] as const;

/**
 * Neutral vocabulary allowed when no presignal exists
 */
export const NEUTRAL_VOCABULARY_ALLOWLIST = [
  'relevant',
  'exploring',
  'worth a conversation',
  'could be useful',
  'open to an intro',
  'might be interesting',
  'potentially helpful',
] as const;

/**
 * Minimum presignal length to be considered valid
 */
const MIN_PRESIGNAL_LENGTH = 20;

/**
 * Check if presignal exists and is valid
 */
export function hasPresignal(presignalContext: string | undefined | null): boolean {
  return typeof presignalContext === 'string' && presignalContext.trim().length >= MIN_PRESIGNAL_LENGTH;
}

/**
 * Check if text contains activity or timing language
 */
export function containsActivityTimingLanguage(text: string): { found: boolean; words: string[] } {
  const textLower = text.toLowerCase();
  const found: string[] = [];

  for (const word of ACTIVITY_TIMING_WORDS) {
    if (textLower.includes(word.toLowerCase())) {
      found.push(word);
    }
  }

  return { found: found.length > 0, words: found };
}

/**
 * Get presignal status for an entity
 */
export function getPresignalStatus(presignalContext: string | undefined | null): PreSignalStatus {
  return hasPresignal(presignalContext) ? 'present' : 'missing';
}

/**
 * Check if intro uses only neutral vocabulary (allowed when no presignal)
 */
export function isNeutralIntro(text: string): boolean {
  const activityCheck = containsActivityTimingLanguage(text);
  return !activityCheck.found;
}

/**
 * Attempt to neutralize an intro by removing activity/timing language.
 * Returns null if the intro cannot be safely neutralized (too much activity language).
 *
 * NOTE: This is a best-effort transformation. The result should still be validated.
 */
export function neutralizeIntro(text: string): { neutralized: string | null; changes: string[] } {
  const activityCheck = containsActivityTimingLanguage(text);

  if (!activityCheck.found) {
    // Already neutral
    return { neutralized: text, changes: [] };
  }

  let result = text;
  const changes: string[] = [];

  // Replace activity words with neutral alternatives
  const REPLACEMENTS: Record<string, string> = {
    'hiring': 'building their team',
    'scaling': 'growing',
    'growing': 'evolving',
    'expanding': 'evolving',
    'recently': '',
    'now': '',
    'currently': '',
    'just': '',
    'active': 'open',
    'exciting phase': 'interesting position',
    'ramping up': 'building',
    'building out': 'developing',
    'bringing on': 'adding',
    'looking for': 'exploring options for',
    'seeking': 'exploring',
  };

  for (const word of activityCheck.words) {
    const replacement = REPLACEMENTS[word.toLowerCase()];
    if (replacement !== undefined) {
      const regex = new RegExp(word, 'gi');
      result = result.replace(regex, replacement);
      changes.push(`"${word}" → "${replacement || '(removed)'}"`);
    }
  }

  // Clean up double spaces
  result = result.replace(/\s{2,}/g, ' ').trim();

  // Re-check if still has activity language
  const recheck = containsActivityTimingLanguage(result);
  if (recheck.found) {
    // Could not fully neutralize — block instead
    return { neutralized: null, changes };
  }

  return { neutralized: result, changes };
}

/**
 * Enforce neutral mode for intro without presignal.
 * Returns the neutralized intro if possible, or an error if it cannot be neutralized.
 */
export function enforceNeutralMode(
  text: string,
  presignalContext: string | undefined | null
): {
  result: 'pass' | 'neutralized' | 'blocked';
  text: string | null;
  changes: string[];
  error?: string;
} {
  // If presignal exists, pass through unchanged
  if (hasPresignal(presignalContext)) {
    return { result: 'pass', text, changes: [] };
  }

  // Check if already neutral
  if (isNeutralIntro(text)) {
    return { result: 'pass', text, changes: [] };
  }

  // Attempt to neutralize
  const { neutralized, changes } = neutralizeIntro(text);

  if (neutralized === null) {
    return {
      result: 'blocked',
      text: null,
      changes,
      error: 'Intro contains too much activity/timing language to safely neutralize. Rewrite with neutral language.',
    };
  }

  return {
    result: 'neutralized',
    text: neutralized,
    changes,
  };
}

// =============================================================================
// STABLE ERROR CODES (for Explainability integration)
// =============================================================================

export const COPY_ERROR_CODES = {
  TOO_SHORT: 'COPY_TOO_SHORT',
  TOO_LONG: 'COPY_TOO_LONG',
  MISSING_GREETING: 'COPY_MISSING_GREETING',
  MISSING_PUNCTUATION: 'COPY_MISSING_PUNCTUATION',
  TOO_MANY_SENTENCES: 'COPY_TOO_MANY_SENTENCES',
  TOO_FEW_SENTENCES: 'COPY_TOO_FEW_SENTENCES',
  LANE_CROSSING_DEMAND_IN_SUPPLY: 'LANE_CROSSING_DEMAND_PHRASE_IN_SUPPLY',
  LANE_CROSSING_SUPPLY_IN_DEMAND: 'LANE_CROSSING_SUPPLY_PHRASE_IN_DEMAND',
  FORBIDDEN_WORD: 'COPY_FORBIDDEN_WORD',
  EVIDENCE_REQUIRED: 'COPY_EVIDENCE_REQUIRED',
  PRESIGNAL_REQUIRED: 'PRESIGNAL_REQUIRED',  // HARD BLOCK
} as const;

export type CopyErrorCode = typeof COPY_ERROR_CODES[keyof typeof COPY_ERROR_CODES];

// =============================================================================
// TYPES
// =============================================================================

export interface ValidationFailure {
  code: CopyErrorCode | string;
  message: string;
  explanation: string;  // User-facing sentence explanation
  howToFix: string;     // Actionable fix instruction
  meta?: {
    word?: string;
    phrase?: string;
    claim?: string;
    found?: string[];
    side?: 'demand' | 'supply';
    vocabularyProfile?: VocabularyProfile;
  };
}

export interface CopyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  // Structured failures for Explainability
  failures: ValidationFailure[];
  // Detailed breakdown
  forbiddenWordsFound: string[];
  ungatableClaimsFound: string[];
  structuralIssues: string[];
  // Metadata
  mode: ConnectorMode;
  side: 'demand' | 'supply';
  registryVersion: string;
}

export interface CopyValidationOptions {
  mode: ConnectorMode;
  side: 'demand' | 'supply';
  evidence: EvidenceSet;
  strictMode?: boolean;  // If true, warnings become errors
  presignal_context?: string;  // Operator-provided presignal (min 20 chars to be valid)
}

// =============================================================================
// VOCABULARY PROFILE RULES
// =============================================================================

/**
 * Vocabulary profile rules by strictness level
 * - strict: Strong forbidden terms, lane crossing = hard fail
 * - broad: No industry-specific claims, evidence-gated claims
 * - custom: Same as broad + extra confidence word blocks
 */
const VOCABULARY_PROFILES: Record<VocabularyProfile, {
  forbiddenPhrases: string[];
  evidenceRequired: string[];
  laneCrossingHardFail: boolean;
}> = {
  strict: {
    // Strict modes have mode-specific forbidden terms (from contract)
    forbiddenPhrases: [],  // Comes from mode contract
    evidenceRequired: [],  // Comes from evidence rules
    laneCrossingHardFail: true,
  },
  broad: {
    // B2B (Broad) - no industry-specific claims
    forbiddenPhrases: [
      'hiring',
      'recruiting',
      'raised',
      'funded',
      'Series',
      'expanding',
      'partnered',
    ],
    evidenceRequired: ['hiring', 'raised', 'funded', 'Series', 'expanding', 'partnered'],
    laneCrossingHardFail: true,
  },
  custom: {
    // Custom - same as broad + extra confidence blocks
    forbiddenPhrases: [
      'hiring',
      'recruiting',
      'raised',
      'funded',
      'Series',
      'expanding',
      'partnered',
      'i saw',
      'noticed you\'re hiring',
      'you\'re raising',
      'you\'re expanding',
    ],
    evidenceRequired: ['hiring', 'raised', 'funded', 'Series', 'expanding', 'partnered'],
    laneCrossingHardFail: true,
  },
};

/**
 * Get forbidden phrases for a vocabulary profile
 */
export function getProfileForbiddenPhrases(profile: VocabularyProfile): string[] {
  return VOCABULARY_PROFILES[profile].forbiddenPhrases;
}

/**
 * Get evidence-required claims for a vocabulary profile
 */
export function getProfileEvidenceRequired(profile: VocabularyProfile): string[] {
  return VOCABULARY_PROFILES[profile].evidenceRequired;
}

// =============================================================================
// STRUCTURAL RULES
// =============================================================================

const STRUCTURAL_RULES = {
  minLength: 30,
  maxLength: 500,
  mustStartWith: ['hey', 'hi'],
  mustEndWith: ['?', '.', '!'],
  maxSentences: 4,
  minSentences: 2,
};

// =============================================================================
// LANE CROSSING DETECTION
// =============================================================================

const DEMAND_ONLY_PHRASES = [
  'I know someone who',
  'I can connect you',
  'worth an intro',
  'want an intro',
];

const SUPPLY_ONLY_PHRASES = [
  'got a lead',
  'got an opportunity',
  'got a biotech opportunity',
  'running point',
  'leading the deal',
  'I can intro you',
];

interface LaneCrossingResult {
  violations: string[];
  failures: ValidationFailure[];
}

function detectLaneCrossing(text: string, side: 'demand' | 'supply'): LaneCrossingResult {
  const violations: string[] = [];
  const failures: ValidationFailure[] = [];
  const textLower = text.toLowerCase();

  if (side === 'demand') {
    // Check for supply-only phrases in demand copy
    for (const phrase of SUPPLY_ONLY_PHRASES) {
      if (textLower.includes(phrase.toLowerCase())) {
        const message = `Demand copy contains supply-side phrase: "${phrase}"`;
        violations.push(message);
        failures.push({
          code: COPY_ERROR_CODES.LANE_CROSSING_SUPPLY_IN_DEMAND,
          message,
          explanation: `The phrase "${phrase}" is meant for supply outreach, not demand.`,
          howToFix: `Remove "${phrase}" and use demand-side language like "I know someone who can help" instead.`,
          meta: { phrase, side: 'demand' },
        });
      }
    }
  } else {
    // Check for demand-only phrases in supply copy
    for (const phrase of DEMAND_ONLY_PHRASES) {
      if (textLower.includes(phrase.toLowerCase())) {
        const message = `Supply copy contains demand-side phrase: "${phrase}"`;
        violations.push(message);
        failures.push({
          code: COPY_ERROR_CODES.LANE_CROSSING_DEMAND_IN_SUPPLY,
          message,
          explanation: `The phrase "${phrase}" is meant for demand outreach, not supply.`,
          howToFix: `Remove "${phrase}" and use supply-side language like "got a lead" instead.`,
          meta: { phrase, side: 'supply' },
        });
      }
    }
  }

  return { violations, failures };
}

// =============================================================================
// MAIN VALIDATOR
// =============================================================================

/**
 * Validate copy against mode + evidence.
 * Returns validation result with explicit errors.
 */
export function validateCopy(
  text: string,
  options: CopyValidationOptions
): CopyValidationResult {
  const { mode, side, evidence, strictMode = false, presignal_context } = options;
  const errors: string[] = [];
  const warnings: string[] = [];
  const structuralIssues: string[] = [];
  const failures: ValidationFailure[] = [];

  // Get vocabulary profile from mode contract
  const contract = getModeContract(mode);
  const vocabularyProfile = contract.contracts.safeVocabularyProfile;

  // ==========================================================================
  // PRESIGNAL HARD GATE (MANDATORY — executes first)
  // ==========================================================================
  // IF hasPresignal === false AND intro contains activity/timing language
  // THEN validation = BLOCKED with PRESIGNAL_REQUIRED error
  // This gate must execute BEFORE any intro is marked validated, queued, or sent.
  // ==========================================================================
  const presignalStatus = getPresignalStatus(presignal_context);
  const activityCheck = containsActivityTimingLanguage(text);

  if (presignalStatus === 'missing' && activityCheck.found) {
    const activityWords = activityCheck.words.join(', ');
    const msg = `Activity or timing claims require a presignal`;
    errors.push(msg);
    failures.push({
      code: COPY_ERROR_CODES.PRESIGNAL_REQUIRED,
      message: msg,
      explanation: `Your intro contains timing/activity language ("${activityWords}") but no presignal was provided. Presignals explain "why now" — without operator-provided timing data, the system cannot make timing claims.`,
      howToFix: `Either provide a presignal (min 20 chars) explaining the timing trigger, or rewrite the intro using only neutral language: "relevant", "exploring", "worth a conversation", "could be useful", "open to an intro".`,
      meta: {
        found: activityCheck.words,
        vocabularyProfile,
        side,
      },
    });

    // HARD BLOCK — return immediately, do not continue validation
    return {
      valid: false,
      errors,
      warnings,
      failures,
      forbiddenWordsFound: [],
      ungatableClaimsFound: [],
      structuralIssues: [],
      mode,
      side,
      registryVersion: MODE_REGISTRY_VERSION,
    };
  }

  // 1. Structural validation
  const trimmed = text.trim();

  if (trimmed.length < STRUCTURAL_RULES.minLength) {
    const msg = `Copy too short (${trimmed.length} chars, min ${STRUCTURAL_RULES.minLength})`;
    structuralIssues.push(msg);
    failures.push({
      code: COPY_ERROR_CODES.TOO_SHORT,
      message: msg,
      explanation: 'Your intro is too short to be effective.',
      howToFix: `Add more context to reach at least ${STRUCTURAL_RULES.minLength} characters.`,
      meta: { found: [String(trimmed.length)], vocabularyProfile },
    });
  }

  if (trimmed.length > STRUCTURAL_RULES.maxLength) {
    const msg = `Copy too long (${trimmed.length} chars, max ${STRUCTURAL_RULES.maxLength})`;
    structuralIssues.push(msg);
    failures.push({
      code: COPY_ERROR_CODES.TOO_LONG,
      message: msg,
      explanation: 'Your intro is too long and may lose the reader.',
      howToFix: `Shorten to under ${STRUCTURAL_RULES.maxLength} characters. Remove unnecessary words.`,
      meta: { found: [String(trimmed.length)], vocabularyProfile },
    });
  }

  const firstWord = trimmed.split(/\s+/)[0]?.toLowerCase() || '';
  if (!STRUCTURAL_RULES.mustStartWith.some(w => firstWord.startsWith(w))) {
    const msg = `Copy must start with greeting (Hey/Hi)`;
    structuralIssues.push(msg);
    failures.push({
      code: COPY_ERROR_CODES.MISSING_GREETING,
      message: msg,
      explanation: 'Intros must start with a personal greeting.',
      howToFix: 'Start with "Hey [Name]" or "Hi [Name]".',
      meta: { vocabularyProfile },
    });
  }

  const lastChar = trimmed.slice(-1);
  if (!STRUCTURAL_RULES.mustEndWith.includes(lastChar)) {
    warnings.push(`Copy should end with punctuation (? . !)`);
  }

  // Count sentences (rough approximation)
  const sentences = trimmed.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length > STRUCTURAL_RULES.maxSentences) {
    const msg = `Copy has ${sentences.length} sentences (recommended max ${STRUCTURAL_RULES.maxSentences})`;
    warnings.push(msg);
    failures.push({
      code: COPY_ERROR_CODES.TOO_MANY_SENTENCES,
      message: msg,
      explanation: 'Too many sentences can overwhelm the reader.',
      howToFix: `Keep to ${STRUCTURAL_RULES.maxSentences} sentences or fewer.`,
      meta: { vocabularyProfile },
    });
  }
  if (sentences.length < STRUCTURAL_RULES.minSentences) {
    const msg = `Copy has only ${sentences.length} sentence(s) (recommended min ${STRUCTURAL_RULES.minSentences})`;
    warnings.push(msg);
    failures.push({
      code: COPY_ERROR_CODES.TOO_FEW_SENTENCES,
      message: msg,
      explanation: 'One sentence is too abrupt.',
      howToFix: `Add at least ${STRUCTURAL_RULES.minSentences} sentences for context.`,
      meta: { vocabularyProfile },
    });
  }

  // 2. Lane crossing detection
  const laneCrossingResult = detectLaneCrossing(trimmed, side);
  for (const violation of laneCrossingResult.violations) {
    errors.push(violation);
  }
  failures.push(...laneCrossingResult.failures);

  // 3. Evidence-gated claims + forbidden vocabulary
  const textValidation = validateText(trimmed, evidence, mode);

  // 4. Collect all issues
  const forbiddenWordsFound = textValidation.forbiddenWordsFound;
  const ungatableClaimsFound = textValidation.ungatableClaimsFound;

  for (const error of textValidation.errors) {
    errors.push(error);
  }

  // Add forbidden word failures with user-friendly explanations
  for (const word of forbiddenWordsFound) {
    failures.push({
      code: `${COPY_ERROR_CODES.FORBIDDEN_WORD}_${word.toUpperCase()}`,
      message: `Forbidden word "${word}" found in copy`,
      explanation: `"${word}" is blocked in ${contract.label} mode to avoid wrong-lane messaging.`,
      howToFix: `Remove "${word}" or switch to a different mode if this term is essential.`,
      meta: { word, vocabularyProfile },
    });
  }

  // Add evidence-required failures with user-friendly explanations
  for (const claim of ungatableClaimsFound) {
    failures.push({
      code: `${COPY_ERROR_CODES.EVIDENCE_REQUIRED}_${claim.toUpperCase()}`,
      message: `Claim "${claim}" requires evidence`,
      explanation: `You cannot say "${claim}" without evidence (e.g., job posting, funding announcement).`,
      howToFix: `Remove "${claim}" or add evidence via the dataset field (job signal, funding signal).`,
      meta: { claim, vocabularyProfile },
    });
  }

  // 5. Structural issues become errors in strict mode
  if (strictMode) {
    for (const issue of structuralIssues) {
      errors.push(issue);
    }
    for (const warning of warnings) {
      errors.push(warning);
    }
  } else {
    // Add structural issues as warnings
    warnings.push(...structuralIssues);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    failures,
    forbiddenWordsFound,
    ungatableClaimsFound,
    structuralIssues,
    mode,
    side,
    registryVersion: MODE_REGISTRY_VERSION,
  };
}

/**
 * Validate and optionally sanitize copy.
 * Returns sanitized copy if possible, or null if unfixable.
 */
export function validateAndSanitize(
  text: string,
  options: CopyValidationOptions
): { copy: string | null; validation: CopyValidationResult; sanitized: boolean; changes: string[] } {
  const { mode, side, evidence } = options;

  // First validate
  const validation = validateCopy(text, options);

  if (validation.valid) {
    return {
      copy: text,
      validation,
      sanitized: false,
      changes: [],
    };
  }

  // Try to sanitize
  const { sanitized, changes } = sanitizeText(text, evidence, mode);

  // Re-validate sanitized text
  const sanitizedValidation = validateCopy(sanitized, options);

  if (sanitizedValidation.valid) {
    return {
      copy: sanitized,
      validation: sanitizedValidation,
      sanitized: true,
      changes,
    };
  }

  // Check if only structural/lane issues remain (unfixable by sanitization)
  const hasUnfixableErrors = sanitizedValidation.errors.some(err =>
    err.includes('lane') ||
    err.includes('too short') ||
    err.includes('too long') ||
    err.includes('greeting')
  );

  if (hasUnfixableErrors) {
    return {
      copy: null,
      validation: sanitizedValidation,
      sanitized: true,
      changes,
    };
  }

  // Return sanitized even if not perfect
  return {
    copy: sanitized,
    validation: sanitizedValidation,
    sanitized: true,
    changes,
  };
}

// =============================================================================
// BATCH VALIDATION
// =============================================================================

export interface BatchValidationResult {
  totalChecked: number;
  valid: number;
  invalid: number;
  sanitizable: number;
  failures: {
    index: number;
    domain: string;
    errors: string[];
  }[];
}

/**
 * Validate multiple copies at once.
 * Returns summary + list of failures.
 */
export function validateBatch(
  copies: { domain: string; text: string; evidence: EvidenceSet }[],
  mode: ConnectorMode,
  side: 'demand' | 'supply'
): BatchValidationResult {
  const failures: BatchValidationResult['failures'] = [];
  let valid = 0;
  let sanitizable = 0;

  for (let i = 0; i < copies.length; i++) {
    const { domain, text, evidence } = copies[i];

    const validation = validateCopy(text, { mode, side, evidence });

    if (validation.valid) {
      valid++;
    } else {
      // Check if sanitizable
      const result = validateAndSanitize(text, { mode, side, evidence });
      if (result.copy !== null) {
        sanitizable++;
      } else {
        failures.push({
          index: i,
          domain,
          errors: validation.errors,
        });
      }
    }
  }

  return {
    totalChecked: copies.length,
    valid,
    invalid: failures.length,
    sanitizable,
    failures,
  };
}

// =============================================================================
// PRE-SEND GATE
// =============================================================================

export interface CanSendResult {
  canSend: boolean;
  blockReason?: string;
  failures?: ValidationFailure[];
  validation?: CopyValidationResult;
}

/**
 * Final gate before sending. Returns true only if copy is safe to send.
 * This is the HARD FAIL point - no silent degradation.
 */
export function canSend(
  text: string,
  options: CopyValidationOptions
): CanSendResult {
  const validation = validateCopy(text, { ...options, strictMode: true });

  if (validation.valid) {
    return { canSend: true, validation };
  }

  // Build block reason from first 3 errors
  const topErrors = validation.errors.slice(0, 3);
  const blockReason = topErrors.join('; ');

  return {
    canSend: false,
    blockReason: `BLOCKED: ${blockReason}`,
    failures: validation.failures,
    validation,
  };
}

// =============================================================================
// QUICK CHECKS (for UI hints)
// =============================================================================

/**
 * Quick check if text contains forbidden words (for real-time UI feedback)
 */
export function hasForbiddenWords(text: string, mode: ConnectorMode): string[] {
  const forbidden = getForbiddenVocabulary(mode);
  const found: string[] = [];
  const textLower = text.toLowerCase();

  for (const word of forbidden) {
    if (textLower.includes(word.toLowerCase())) {
      found.push(word);
    }
  }

  return found;
}

/**
 * Quick check if text is likely too short/long (for real-time UI feedback)
 */
export function getLengthWarning(text: string): string | null {
  const len = text.trim().length;

  if (len < STRUCTURAL_RULES.minLength) {
    return `Too short (${len}/${STRUCTURAL_RULES.minLength} chars)`;
  }
  if (len > STRUCTURAL_RULES.maxLength) {
    return `Too long (${len}/${STRUCTURAL_RULES.maxLength} chars)`;
  }

  return null;
}

// =============================================================================
// USER-FACING BLOCK MESSAGE BUILDER
// =============================================================================

export interface UserFacingBlockMessage {
  code: string;
  title: string;
  explanation: string;
  howToFix: string;
}

/**
 * Format validation failures into user-facing block messages.
 * Use this for displaying "why blocked" in the UI.
 */
export function formatBlockMessages(failures: ValidationFailure[]): UserFacingBlockMessage[] {
  return failures.map(f => ({
    code: f.code,
    title: f.message,
    explanation: f.explanation,
    howToFix: f.howToFix,
  }));
}

/**
 * Get a summary of why copy was blocked (for toast/alert display)
 */
export function getBlockSummary(failures: ValidationFailure[]): string {
  if (failures.length === 0) return '';

  const first = failures[0];
  const remaining = failures.length - 1;

  if (remaining === 0) {
    return first.explanation;
  }

  return `${first.explanation} (+${remaining} more issues)`;
}
