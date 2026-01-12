/**
 * EvidenceGate.ts
 *
 * UNIVERSAL CLAIM GATING
 *
 * Claims require proof. If evidence is missing, language is FORBIDDEN.
 * This prevents "hiring" style embarrassment across ALL niches.
 *
 * PRINCIPLES:
 * - No evidence = no claim
 * - Claims are forbidden, not rewritten
 * - Explicit error messages
 */

import {
  type ConnectorMode,
  type EvidenceType,
  type EvidenceRule,
  getEvidenceRules,
  getForbiddenVocabulary,
} from './ConnectorModeRegistry';

// =============================================================================
// TYPES
// =============================================================================

export interface EvidenceSet {
  job_signal: boolean;
  funding_signal: boolean;
  tech_signal: boolean;
  partnership_signal: boolean;
  crypto_signal: boolean;
}

export interface ClaimValidation {
  allowed: boolean;
  violations: {
    claim: string;
    requiredEvidence: EvidenceType;
    errorMessage: string;
  }[];
}

export interface TextValidation {
  valid: boolean;
  errors: string[];
  forbiddenWordsFound: string[];
  ungatableClaimsFound: string[];
}

// =============================================================================
// EVIDENCE SET BUILDER
// =============================================================================

/**
 * Build evidence set from record data
 */
export function buildEvidenceSet(record: {
  jobPostingUrl?: string;
  jobTitle?: string;
  openRolesCount?: number;
  funding?: string;
  fundingRound?: string;
  techStack?: string[];
  partnershipSignal?: boolean;
}): EvidenceSet {
  return {
    job_signal: Boolean(
      record.jobPostingUrl ||
      record.jobTitle ||
      (record.openRolesCount && record.openRolesCount > 0)
    ),
    funding_signal: Boolean(
      record.funding ||
      record.fundingRound
    ),
    tech_signal: Boolean(
      record.techStack && record.techStack.length > 0
    ),
    partnership_signal: Boolean(record.partnershipSignal),
  };
}

/**
 * Create empty evidence set (all false)
 */
export function emptyEvidenceSet(): EvidenceSet {
  return {
    job_signal: false,
    funding_signal: false,
    tech_signal: false,
    partnership_signal: false,
    crypto_signal: false,
  };
}

// =============================================================================
// CLAIM VALIDATION
// =============================================================================

/**
 * Check if a specific claim is allowed given evidence
 */
export function allowClaim(
  claim: string,
  evidence: EvidenceSet,
  mode: ConnectorMode
): { allowed: boolean; reason?: string } {
  const rules = getEvidenceRules(mode);
  const claimLower = claim.toLowerCase();

  for (const rule of rules) {
    if (claimLower.includes(rule.claim.toLowerCase())) {
      if (!evidence[rule.requiredEvidence]) {
        return {
          allowed: false,
          reason: rule.errorMessage,
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * Validate all claims in a text against evidence
 */
export function validateClaims(
  text: string,
  evidence: EvidenceSet,
  mode: ConnectorMode
): ClaimValidation {
  const rules = getEvidenceRules(mode);
  const textLower = text.toLowerCase();
  const violations: ClaimValidation['violations'] = [];

  for (const rule of rules) {
    // Check if claim appears in text
    if (textLower.includes(rule.claim.toLowerCase())) {
      // Check if required evidence exists
      if (!evidence[rule.requiredEvidence]) {
        violations.push({
          claim: rule.claim,
          requiredEvidence: rule.requiredEvidence,
          errorMessage: rule.errorMessage,
        });
      }
    }
  }

  return {
    allowed: violations.length === 0,
    violations,
  };
}

// =============================================================================
// TEXT VALIDATION (FULL)
// =============================================================================

/**
 * Full text validation: forbidden vocabulary + evidence-gated claims
 */
export function validateText(
  text: string,
  evidence: EvidenceSet,
  mode: ConnectorMode
): TextValidation {
  const errors: string[] = [];
  const forbiddenWordsFound: string[] = [];
  const ungatableClaimsFound: string[] = [];

  const textLower = text.toLowerCase();

  // 1. Check forbidden vocabulary for this mode
  const forbiddenVocab = getForbiddenVocabulary(mode);
  for (const forbidden of forbiddenVocab) {
    if (textLower.includes(forbidden.toLowerCase())) {
      forbiddenWordsFound.push(forbidden);
      errors.push(`Forbidden word "${forbidden}" in ${mode} mode`);
    }
  }

  // 2. Check evidence-gated claims
  const claimValidation = validateClaims(text, evidence, mode);
  if (!claimValidation.allowed) {
    for (const violation of claimValidation.violations) {
      ungatableClaimsFound.push(violation.claim);
      errors.push(violation.errorMessage);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    forbiddenWordsFound,
    ungatableClaimsFound,
  };
}

// =============================================================================
// SANITIZATION (REMOVE UNGATED CLAIMS)
// =============================================================================

/**
 * Sanitize text by removing/replacing ungated claims
 * Returns sanitized text + list of changes made
 */
export function sanitizeText(
  text: string,
  evidence: EvidenceSet,
  mode: ConnectorMode
): { sanitized: string; changes: string[] } {
  let sanitized = text;
  const changes: string[] = [];

  const rules = getEvidenceRules(mode);

  for (const rule of rules) {
    if (!evidence[rule.requiredEvidence]) {
      // Create regex for the claim (word boundary)
      const regex = new RegExp(`\\b${rule.claim}\\b`, 'gi');
      if (regex.test(sanitized)) {
        // Replace with safe alternative based on claim type
        const replacement = getSafeReplacement(rule.claim, rule.requiredEvidence);
        sanitized = sanitized.replace(regex, replacement);
        changes.push(`Replaced "${rule.claim}" with "${replacement}" (no ${rule.requiredEvidence})`);
      }
    }
  }

  // Also remove forbidden vocabulary
  const forbiddenVocab = getForbiddenVocabulary(mode);
  for (const forbidden of forbiddenVocab) {
    const regex = new RegExp(`\\b${forbidden}\\b`, 'gi');
    if (regex.test(sanitized)) {
      const replacement = getSafeReplacement(forbidden, 'job_signal');
      sanitized = sanitized.replace(regex, replacement);
      changes.push(`Replaced forbidden word "${forbidden}" with "${replacement}"`);
    }
  }

  return { sanitized, changes };
}

/**
 * Get safe replacement for a claim/word
 */
function getSafeReplacement(claim: string, evidenceType: EvidenceType): string {
  const claimLower = claim.toLowerCase();

  // Job-related claims
  if (evidenceType === 'job_signal') {
    if (claimLower === 'hiring') return 'scaling';
    if (claimLower === 'recruiting') return 'building';
    if (claimLower === 'role' || claimLower === 'position') return 'opportunity';
    if (claimLower === 'open position') return 'growth';
    if (claimLower === 'looking for') return 'expanding';
    if (claimLower === 'staffing') return 'growing';
    if (claimLower === 'talent') return 'team';
    if (claimLower === 'candidates') return 'people';
  }

  // Funding-related claims
  if (evidenceType === 'funding_signal') {
    if (claimLower === 'raised') return 'growing';
    if (claimLower === 'funded') return 'active';
    if (claimLower.includes('series')) return 'established';
  }

  // Tech-related claims
  if (evidenceType === 'tech_signal') {
    if (claimLower === 'uses') return 'works with';
    if (claimLower === 'stack') return 'platform';
  }

  // Default: remove the word
  return 'active';
}

// =============================================================================
// EVIDENCE SUMMARY (FOR UI)
// =============================================================================

/**
 * Get human-readable summary of available evidence
 */
export function getEvidenceSummary(evidence: EvidenceSet): string[] {
  const summary: string[] = [];

  if (evidence.job_signal) summary.push('Job posting evidence');
  if (evidence.funding_signal) summary.push('Funding evidence');
  if (evidence.tech_signal) summary.push('Tech stack evidence');
  if (evidence.partnership_signal) summary.push('Partnership evidence');
  if (evidence.crypto_signal) summary.push('Crypto/token evidence');

  if (summary.length === 0) {
    summary.push('No specific evidence (using safe language)');
  }

  return summary;
}

/**
 * Get list of claims that are ALLOWED given evidence
 */
export function getAllowedClaims(evidence: EvidenceSet, mode: ConnectorMode): string[] {
  const rules = getEvidenceRules(mode);
  const allowed: string[] = [];

  for (const rule of rules) {
    if (evidence[rule.requiredEvidence]) {
      allowed.push(rule.claim);
    }
  }

  return allowed;
}

/**
 * Get list of claims that are FORBIDDEN given evidence
 */
export function getForbiddenClaims(evidence: EvidenceSet, mode: ConnectorMode): string[] {
  const rules = getEvidenceRules(mode);
  const forbidden: string[] = [];

  for (const rule of rules) {
    if (!evidence[rule.requiredEvidence]) {
      forbidden.push(rule.claim);
    }
  }

  return forbidden;
}
