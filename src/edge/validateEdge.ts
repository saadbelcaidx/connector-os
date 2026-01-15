/**
 * VALIDATE EDGE — Gate that stops garbage intros
 *
 * validateEdge(match) → 'valid' | 'invalid' | 'probe_only'
 *
 * NO EDGE → NO CONNECT INTRO.
 */

import { getTaxonomy, isEdgeValidForMode } from './edgeTaxonomy';

// =============================================================================
// TYPES
// =============================================================================

export type EdgeValidationResult = 'valid' | 'invalid' | 'probe_only';

export interface CompanySummary {
  category: string;
  who_they_serve: string;
  what_they_do: string;
}

export interface EdgeInput {
  edge_type: string | null;
  edge_confidence: number; // 0-1
  edge_evidence: string | null;
  applies_to_demand: boolean;
  applies_to_supply: boolean;
}

export interface MatchSide {
  domain: string;
  summary: CompanySummary | null;
}

export interface Match {
  mode: string;
  demand: MatchSide;
  supply: MatchSide;
  edge: EdgeInput | null;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const EDGE_CONFIDENCE_THRESHOLD = 0.6;

// =============================================================================
// VALIDATION FUNCTION
// =============================================================================

/**
 * Validate edge for a match.
 *
 * Returns:
 * - 'valid': Edge passes all checks → CONNECT intro allowed
 * - 'probe_only': Edge missing or weak → PROBE intro only
 * - 'invalid': Edge incompatible → NO intro
 */
export function validateEdge(match: Match): EdgeValidationResult {
  const taxonomy = getTaxonomy(match.mode);

  // -------------------------------------------------------------------------
  // NO EDGE → PROBE ONLY
  // -------------------------------------------------------------------------
  if (!match.edge || !match.edge.edge_type) {
    return 'probe_only';
  }

  const { edge } = match;

  // -------------------------------------------------------------------------
  // EDGE IN FORBIDDEN LIST → INVALID
  // -------------------------------------------------------------------------
  if (taxonomy.forbiddenEdges.includes(edge.edge_type)) {
    return 'invalid';
  }

  // -------------------------------------------------------------------------
  // EDGE NOT IN VALID LIST → INVALID (for strict modes)
  // -------------------------------------------------------------------------
  if (!isEdgeValidForMode(edge.edge_type, match.mode)) {
    return 'invalid';
  }

  // -------------------------------------------------------------------------
  // EDGE MUST APPLY TO BOTH SIDES → INVALID IF ONE-SIDED
  // -------------------------------------------------------------------------
  if (!edge.applies_to_demand || !edge.applies_to_supply) {
    return 'invalid';
  }

  // -------------------------------------------------------------------------
  // EDGE CONFIDENCE BELOW THRESHOLD → PROBE ONLY
  // -------------------------------------------------------------------------
  if (edge.edge_confidence < EDGE_CONFIDENCE_THRESHOLD) {
    return 'probe_only';
  }

  // -------------------------------------------------------------------------
  // COMPANY SUMMARY MISSING → PROBE ONLY
  // -------------------------------------------------------------------------
  if (!match.demand.summary || !match.supply.summary) {
    return 'probe_only';
  }

  // -------------------------------------------------------------------------
  // ALL CHECKS PASS → VALID
  // -------------------------------------------------------------------------
  return 'valid';
}

/**
 * Check if a match can generate any intro (probe or connect)
 */
export function canGenerateIntro(match: Match): boolean {
  const result = validateEdge(match);
  return result !== 'invalid';
}

/**
 * Check if a match can generate a CONNECT intro
 */
export function canGenerateConnectIntro(match: Match): boolean {
  return validateEdge(match) === 'valid';
}
