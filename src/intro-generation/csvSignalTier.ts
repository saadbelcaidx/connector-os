/**
 * csvSignalTier.ts — CSV Signal Quality Classification
 *
 * CSV Phase 3: Deterministic tier classification based on available CSV fields.
 *
 * TIER DEFINITIONS:
 * - T0: UNROUTABLE — Missing domain, email, AND linkedin (filtered in CSV-1)
 * - T1: BASIC — Required fields only (fullName, company, domain, title)
 * - T2: STANDARD — BASIC + LinkedIn OR Email
 * - T3: RICH — STANDARD + Company Description (≥40 chars)
 *
 * INVARIANT: Every CSV record gets exactly one deterministic tier.
 * INVARIANT: Never returns T0 (those are filtered in CSV Phase 1).
 */

import type { NormalizedRecord } from '../schemas';

// =============================================================================
// TYPES
// =============================================================================

export type CsvSignalTier = 'T1' | 'T2' | 'T3';

export interface TierClassification {
  tier: CsvSignalTier;
  reasons: string[];
}

// =============================================================================
// TIER CLASSIFICATION
// =============================================================================

/**
 * Classify a CSV record into a signal tier.
 *
 * @param record - NormalizedRecord from CSV normalization
 * @returns CsvSignalTier ('T1' | 'T2' | 'T3')
 *
 * RULES:
 * - Never returns T0 (filtered earlier in CSV Phase 1)
 * - No side effects
 * - No enrichment calls
 * - CSV-only (guard on dataSource === 'csv')
 */
export function classifyCsvSignalTier(record: NormalizedRecord): CsvSignalTier {
  // Guard: Only process CSV records
  const dataSource = record.raw?._dataSource;
  if (dataSource !== 'csv') {
    // Non-CSV records default to T1 (safest)
    return 'T1';
  }

  // Check for T3: RICH
  // Requires: Company Description present (≥40 chars)
  const hasRichDescription = Boolean(
    record.companyDescription &&
    record.companyDescription.trim().length >= 40
  );

  // Check for T2: STANDARD
  // Requires: LinkedIn URL OR Email
  const hasLinkedIn = Boolean(record.linkedin && record.linkedin.trim());
  const hasEmail = Boolean(record.email && record.email.trim());
  const hasContactInfo = hasLinkedIn || hasEmail;

  // Tier determination (highest to lowest)
  if (hasContactInfo && hasRichDescription) {
    return 'T3'; // RICH
  }

  if (hasContactInfo) {
    return 'T2'; // STANDARD
  }

  // Default: T1 (BASIC)
  // Has required fields only: fullName, company, domain, title
  return 'T1';
}

/**
 * Classify with detailed reasons (for debugging/UI).
 *
 * @param record - NormalizedRecord from CSV normalization
 * @returns TierClassification with tier and reasons
 */
export function classifyCsvSignalTierWithReasons(
  record: NormalizedRecord
): TierClassification {
  const reasons: string[] = [];

  // Guard: Only process CSV records
  const dataSource = record.raw?._dataSource;
  if (dataSource !== 'csv') {
    return {
      tier: 'T1',
      reasons: ['Non-CSV record, defaulting to BASIC'],
    };
  }

  // Check fields
  const hasLinkedIn = Boolean(record.linkedin && record.linkedin.trim());
  const hasEmail = Boolean(record.email && record.email.trim());
  const hasContactInfo = hasLinkedIn || hasEmail;
  const descriptionLength = record.companyDescription?.trim().length || 0;
  const hasRichDescription = descriptionLength >= 40;

  // Build reasons
  if (hasLinkedIn) reasons.push('Has LinkedIn URL');
  if (hasEmail) reasons.push('Has email');
  if (hasRichDescription) {
    reasons.push(`Has company description (${descriptionLength} chars)`);
  }

  // Tier determination
  if (hasContactInfo && hasRichDescription) {
    return { tier: 'T3', reasons };
  }

  if (hasContactInfo) {
    return { tier: 'T2', reasons };
  }

  // T1: BASIC
  if (reasons.length === 0) {
    reasons.push('Required fields only (fullName, company, domain, title)');
  }
  return { tier: 'T1', reasons };
}

/**
 * Check if a record is from CSV upload.
 */
export function isCsvRecord(record: NormalizedRecord): boolean {
  return record.raw?._dataSource === 'csv';
}

/**
 * Get tier label for display.
 */
export function getTierLabel(tier: CsvSignalTier): string {
  switch (tier) {
    case 'T1':
      return 'BASIC';
    case 'T2':
      return 'STANDARD';
    case 'T3':
      return 'RICH';
  }
}
