/**
 * InversionTable.ts
 *
 * THE INTELLIGENCE MOAT OF CONNECTOR OS
 *
 * This is NOT industry-based classification.
 * This is PRESSURE-based inversion.
 *
 * CONCEPT:
 * - We observe a primitive (e.g., "engineering" hiring pressure)
 * - We derive WHO monetizes that pressure (the counterparty)
 * - This mapping is deterministic, not probabilistic
 *
 * WHY THIS MATTERS:
 * - Traditional matching = "find similar companies"
 * - Pressure inversion = "find who PROFITS from this signal"
 *
 * This table codifies institutional knowledge about:
 * - Which suppliers solve which hiring pressures
 * - How to route demand to the correct supply category
 *
 * NO AI. NO HEURISTICS. NO SIDE EFFECTS.
 * Pure, deterministic, extensible mapping.
 */

// ============================================================================
// INPUT: ROLE TYPES (Observed Primitives)
// These come from job posts, funding signals, hiring activity, etc.
// ============================================================================

export type RoleType =
  | 'engineering'
  | 'sales'
  | 'marketing'
  | 'operations'
  | 'finance'
  | 'compliance'
  | 'unknown';

// ============================================================================
// OUTPUT: COUNTERPARTY CATEGORIES (Derived Supply Types)
// These represent WHO can monetize the observed pressure
// ============================================================================

export type CounterpartyCategory =
  | 'tech_recruitment'
  | 'sales_recruitment'
  | 'marketing_recruitment'
  | 'executive_search'
  | 'compliance_consulting'
  | 'cloud_consulting'
  | 'unknown';

// ============================================================================
// THE INVERSION MAP
// Explicit, deterministic mapping from pressure to counterparty
// ============================================================================

const INVERSION_MAP: Record<RoleType, CounterpartyCategory> = {
  // HIRING PRESSURE → RECRUITERS
  engineering: 'tech_recruitment',
  sales: 'sales_recruitment',
  marketing: 'marketing_recruitment',
  operations: 'executive_search',
  finance: 'executive_search',
  compliance: 'compliance_consulting',

  // FALLBACK
  unknown: 'unknown'
};

// ============================================================================
// PRIMARY FUNCTION
// ============================================================================

/**
 * Invert a role type (observed pressure) to a counterparty category (supply type)
 *
 * This is the core intelligence function.
 * It answers: "Given this hiring pressure, who should we route to?"
 *
 * @param roleType - The observed role/hiring pressure primitive
 * @returns The counterparty category that monetizes this pressure
 */
export function invertRoleTypeToCounterparty(
  roleType: RoleType
): CounterpartyCategory {
  return INVERSION_MAP[roleType] ?? 'unknown';
}
