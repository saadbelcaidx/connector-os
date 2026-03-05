/**
 * EVALUATION PRIMITIVE — Type Definitions
 *
 * The structured match assessment between a demand signal and supply party.
 * Sits between matching output and Station routing.
 *
 * Doctrine: MCP proposes. Infrastructure disposes.
 * V1: Deterministic derivation from Match + Edge. No AI.
 */

// =============================================================================
// ENUMS / UNIONS
// =============================================================================

export type EvaluationReadiness = 'READY' | 'WARMING' | 'NOT_YET';

export type EvaluationStatus =
  | 'proposed'
  | 'reviewed'
  | 'approved'
  | 'skipped'
  | 'consumed'
  | 'scored';

// =============================================================================
// SUB-OBJECTS
// =============================================================================

export interface EvaluationScores {
  match_score: number;       // 0-100, from matchRecords()
  edge_confidence: number;   // 0-1, from EdgeDetector or buildWhy()
  readiness: EvaluationReadiness;
}

export interface EvaluationReasoning {
  why_match: string;         // 2-4 lines, derived from Edge.evidence + match tier
  edge_type: string;         // SCALING, HIRING_PRESSURE, MATCH_QUALITY, etc.
  tier: 'A' | 'B' | 'C';
  tier_reason: string;       // From Match.tierReason (human-readable)
  risks: string[];           // V1: empty array (placeholder for MCP)
}

// =============================================================================
// OUTCOME — Post-send tracking (V1: manual operator input)
// =============================================================================

export type EvaluationOutcomeStatus =
  | 'replied'
  | 'no_response'
  | 'meeting_booked'
  | 'declined';

export interface EvaluationOutcome {
  status: EvaluationOutcomeStatus;
  note?: string;
  at: string;  // ISO timestamp
}

// =============================================================================
// MCP ENHANCEMENT — Additive AI fields (Phase 18)
// =============================================================================

export interface EvaluationAI {
  why_match_ai?: string;          // 1-3 lines, human-readable
  framing_ai?: string;            // 1-2 lines, pasteable
  risks_ai?: string[];            // 0-3 short bullets
  confidence_ai?: number;         // 0-1
  model?: string;
  provider?: 'openai' | 'azure' | 'anthropic';
  at?: string;                    // ISO timestamp
  // Phase 18 legacy (kept for backwards compat)
  reasoning_ai?: string;
  confidence_delta?: number;
}

// =============================================================================
// EVALUATION — The Primitive
// =============================================================================

export interface Evaluation {
  id: string;
  demand_record_key: string;
  supply_record_key: string;
  scores: EvaluationScores;
  reasoning: EvaluationReasoning;
  suggested_framing: string;
  status: EvaluationStatus;
  created_at: string;
  updated_at: string;
  outcome?: EvaluationOutcome;
  ai?: EvaluationAI;
}
