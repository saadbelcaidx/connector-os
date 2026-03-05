/**
 * BUILD EVALUATIONS — Pure Deterministic Builder
 *
 * Transforms Match[] + Edge map → Evaluation[]
 *
 * Rules:
 * - Pure function. No side effects. No async. No React.
 * - Deterministic: same inputs → same outputs (except timestamps).
 * - Uses derivation rules from Evaluation Primitive Spec exactly.
 * - All scores frozen at creation. Never recomputed downstream.
 */

import type { Match } from '../matching';
import type { Edge } from '../schemas/Edge';
import { recordKey } from '../enrichment/recordKey';
import { simpleHash } from '../enrichment/recordKey';
import type {
  Evaluation,
  EvaluationReadiness,
  EvaluationScores,
  EvaluationReasoning,
} from './Evaluation';

// =============================================================================
// READINESS THRESHOLDS
// =============================================================================

const READY_THRESHOLD = 0.7;
const WARMING_THRESHOLD = 0.4;

// =============================================================================
// TIER MAPPING
// =============================================================================

function mapTier(tier: string): 'A' | 'B' | 'C' {
  if (tier === 'strong') return 'A';
  if (tier === 'good') return 'B';
  return 'C';
}

// =============================================================================
// READINESS DERIVATION
// =============================================================================

function deriveReadiness(edgeConfidence: number): EvaluationReadiness {
  if (edgeConfidence >= READY_THRESHOLD) return 'READY';
  if (edgeConfidence >= WARMING_THRESHOLD) return 'WARMING';
  return 'NOT_YET';
}

// =============================================================================
// ID GENERATION (deterministic from pair keys)
// =============================================================================

function generateEvalId(demandKey: string, supplyKey: string, timestamp: string): string {
  const hash = simpleHash(`${demandKey}|${supplyKey}|${timestamp}`);
  return `eval_${hash}`;
}

// =============================================================================
// BUILDER
// =============================================================================

export function buildEvaluations(
  matches: Match[],
  edges: Map<string, Edge>
): Evaluation[] {
  const now = new Date().toISOString();
  const evaluations: Evaluation[] = [];

  for (const match of matches) {
    if (match.score <= 0) continue;

    const demandKey = recordKey(match.demand);
    const supplyKey = recordKey(match.supply);

    const edge: Edge | undefined = edges.get(demandKey);
    const edgeConfidence = edge
      ? Math.max(edge.confidence, match.score / 100)
      : match.score / 100;

    const scores: EvaluationScores = {
      match_score: match.score,
      edge_confidence: edgeConfidence,
      readiness: deriveReadiness(edgeConfidence),
    };

    const reasoning: EvaluationReasoning = {
      why_match: edge?.evidence || match.tierReason || '',
      edge_type: edge?.type || 'MATCH_QUALITY',
      tier: mapTier(match.tier),
      tier_reason: match.tierReason || '',
      risks: [],
    };

    const suggestedFraming = edge?.evidence || match.tierReason || '';

    const evaluation: Evaluation = {
      id: generateEvalId(demandKey, supplyKey, now),
      demand_record_key: demandKey,
      supply_record_key: supplyKey,
      scores,
      reasoning,
      suggested_framing: suggestedFraming,
      status: 'proposed',
      created_at: now,
      updated_at: now,
    };

    evaluations.push(evaluation);
  }

  return evaluations;
}
