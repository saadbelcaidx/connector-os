/**
 * GATE
 *
 * Validates required fields before intro composition.
 * Strict: if ANY required element missing => DROP.
 *
 * No probe. No fallback. Pass or drop.
 */

import type { DemandRecord } from '../schemas/DemandRecord';
import type { Edge } from '../schemas/Edge';
import type { Counterparty, DropResult, DropReason } from '../schemas/IntroOutput';

// =============================================================================
// TYPES
// =============================================================================

export interface GatePassResult {
  ok: true;
}

export type GateResult = DropResult | GatePassResult;

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Simple email validation (contains @).
 */
function isValidEmail(email: string | undefined | null): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }
  return email.includes('@') && email.length > 3;
}

/**
 * Check if string is non-empty.
 */
function isNonEmpty(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

/**
 * Validate all required fields for intro generation.
 *
 * @param demand - DemandRecord to validate
 * @param edge - Detected edge (or null if none)
 * @param counterparty - Matched counterparty (or null if none)
 * @returns GatePassResult if valid, DropResult if invalid
 */
export function validateGate(
  demand: DemandRecord,
  edge: Edge | null,
  counterparty: Counterparty | null
): GateResult {
  // ==========================================================================
  // CHECK 1: Edge must exist
  // ==========================================================================
  if (!edge) {
    return {
      dropped: true,
      reason: 'NO_EDGE',
      details: { demand: demand.company },
    };
  }

  // ==========================================================================
  // CHECK 2: Counterparty must exist
  // ==========================================================================
  if (!counterparty) {
    return {
      dropped: true,
      reason: 'NO_COUNTERPARTY',
      details: { demand: demand.company, edge: edge.type },
    };
  }

  // ==========================================================================
  // CHECK 3: Fit reason must exist
  // ==========================================================================
  if (!isNonEmpty(counterparty.fitReason)) {
    return {
      dropped: true,
      reason: 'NO_FIT_REASON',
      details: {
        demand: demand.company,
        supply: counterparty.company,
      },
    };
  }

  // ==========================================================================
  // CHECK 4: Required demand fields
  // ==========================================================================
  if (!isNonEmpty(demand.company)) {
    return {
      dropped: true,
      reason: 'MISSING_REQUIRED_FIELDS',
      details: { field: 'demand.company' },
    };
  }

  if (!isNonEmpty(demand.contact)) {
    return {
      dropped: true,
      reason: 'MISSING_REQUIRED_FIELDS',
      details: { field: 'demand.contact' },
    };
  }

  // ==========================================================================
  // CHECK 5: Required counterparty fields
  // ==========================================================================
  if (!isNonEmpty(counterparty.company)) {
    return {
      dropped: true,
      reason: 'MISSING_REQUIRED_FIELDS',
      details: { field: 'counterparty.company' },
    };
  }

  if (!isNonEmpty(counterparty.contact)) {
    return {
      dropped: true,
      reason: 'MISSING_REQUIRED_FIELDS',
      details: { field: 'counterparty.contact' },
    };
  }

  // ==========================================================================
  // CHECK 6: Email validity
  // ==========================================================================
  if (!isValidEmail(demand.email)) {
    return {
      dropped: true,
      reason: 'INVALID_EMAIL',
      details: { field: 'demand.email', value: demand.email },
    };
  }

  if (!isValidEmail(counterparty.email)) {
    return {
      dropped: true,
      reason: 'INVALID_EMAIL',
      details: { field: 'counterparty.email', value: counterparty.email },
    };
  }

  // ==========================================================================
  // ALL CHECKS PASSED
  // ==========================================================================
  return { ok: true };
}

/**
 * Type guard for GatePassResult.
 */
export function isGatePass(result: GateResult): result is GatePassResult {
  return 'ok' in result && result.ok === true;
}

/**
 * Type guard for DropResult.
 */
export function isGateDrop(result: GateResult): result is DropResult {
  return 'dropped' in result && result.dropped === true;
}
