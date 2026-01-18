/**
 * BIZGRAPH Semantic Expander
 *
 * Expands business tokens using the BizGraph for semantic matching.
 *
 * Features:
 * - Deterministic expansion (same input → same output)
 * - Auditable evidence trail
 * - Disambiguation rules (TIER 5)
 * - Respects edge weights and relation types
 */

import {
  type BizGraphEdge,
  type EdgeRelation,
  type ExpansionEvidence,
  type ExpansionResult,
  canonicalizeLabel,
} from './schema';

import { getBizGraph, getCachedBizGraph, type BizGraph } from './loader';
import { isExpansionBlocked, getDisambiguationCluster } from './manualCore';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Weight multipliers by relation type */
const RELATION_WEIGHTS: Record<EdgeRelation, number> = {
  equivalent: 1.0,
  specializes: 0.9,
  fulfills: 0.95,
  related: 0.7,
  role_variant: 0.85,
};

/** Maximum expansion depth (BFS levels) */
const MAX_DEPTH = 2;

/** Minimum effective weight to include in expansions */
const MIN_WEIGHT = 0.5;

/** Maximum expansions per token */
const MAX_EXPANSIONS_PER_TOKEN = 10;

// =============================================================================
// TOKENIZER
// =============================================================================

/**
 * Simple business text tokenizer.
 * Extracts meaningful tokens from business text.
 *
 * Rules:
 * - Lowercased
 * - Split on whitespace and common punctuation
 * - Keep hyphenated terms together
 * - Remove stopwords
 */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
  'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their',
  'we', 'us', 'our', 'you', 'your', 'i', 'me', 'my', 'he', 'she', 'him', 'her',
]);

export function tokenizeBusinessText(text: string): string[] {
  if (!text) return [];

  const tokens: string[] = [];
  const normalized = text.toLowerCase().trim();

  // Split on non-alphanumeric (keep hyphens for compound terms)
  const rawTokens = normalized.split(/[^a-z0-9-]+/).filter(Boolean);

  for (const token of rawTokens) {
    // Skip stopwords
    if (STOPWORDS.has(token)) continue;
    // Skip very short tokens
    if (token.length < 2) continue;
    tokens.push(token);
  }

  // Also extract multi-word phrases (bigrams, trigrams) for concept matching
  const words = normalized.split(/\s+/);
  for (let i = 0; i < words.length - 1; i++) {
    // Bigrams
    const bigram = words.slice(i, i + 2).join(' ');
    const cleanBigram = bigram.replace(/[^a-z0-9\s-]/g, '').trim();
    if (cleanBigram && cleanBigram.length > 3) {
      tokens.push(cleanBigram);
    }

    // Trigrams
    if (i < words.length - 2) {
      const trigram = words.slice(i, i + 3).join(' ');
      const cleanTrigram = trigram.replace(/[^a-z0-9\s-]/g, '').trim();
      if (cleanTrigram && cleanTrigram.length > 5) {
        tokens.push(cleanTrigram);
      }
    }
  }

  // Deduplicate
  return [...new Set(tokens)];
}

// =============================================================================
// CONTEXT
// =============================================================================

export interface ExpansionContext {
  /** Which side of the match: demand or supply */
  side: 'demand' | 'supply';
  /** Optional field hints for context */
  fieldHints?: {
    title?: string;
    description?: string;
  };
}

// =============================================================================
// EXPANSION ENGINE
// =============================================================================

/**
 * Expand a single token using BFS traversal of the graph.
 */
function expandToken(
  graph: BizGraph,
  token: string,
  context: ExpansionContext
): { expansions: string[]; evidence: ExpansionEvidence[] } {
  const canonical = canonicalizeLabel(token);
  const conceptId = graph.labelToId.get(canonical);

  // No concept found for this token
  if (!conceptId) {
    return { expansions: [], evidence: [] };
  }

  const expansions: string[] = [];
  const evidence: ExpansionEvidence[] = [];
  const visited = new Set<string>([conceptId]);

  // BFS queue: [conceptId, depth, accumulatedWeight, path]
  const queue: Array<[string, number, number, string[]]> = [[conceptId, 0, 1.0, [token]]];

  while (queue.length > 0) {
    const [currentId, depth, weight, path] = queue.shift()!;

    // Don't go beyond max depth
    if (depth >= MAX_DEPTH) continue;

    // Get outgoing edges
    const edges = graph.outgoing.get(currentId) || [];

    for (const edge of edges) {
      const [fromId, relation, toId, edgeWeight, source] = edge;
      const targetId = toId;

      // Skip already visited
      if (visited.has(targetId)) continue;

      // Calculate effective weight
      const relationMultiplier = RELATION_WEIGHTS[relation];
      const effectiveWeight = weight * edgeWeight * relationMultiplier;

      // Skip low-weight expansions
      if (effectiveWeight < MIN_WEIGHT) continue;

      // Get target labels
      const targetLabels = graph.idToLabels.get(targetId);
      if (!targetLabels || targetLabels.length === 0) continue;

      const targetPrimary = targetLabels[0];

      // Check disambiguation rules
      if (isExpansionBlocked(token, targetPrimary)) {
        continue;
      }

      // Check fulfills direction (supply service/function → demand intent/function)
      if (relation === 'fulfills') {
        const fromConcept = graph.bundle.concepts[fromId];
        const toConcept = graph.bundle.concepts[targetId];

        // Fulfills only works: supply side with service/function → demand intent/function
        if (context.side === 'supply') {
          if (!['service', 'function'].includes(fromConcept?.t || '')) continue;
          if (!['intent', 'function'].includes(toConcept?.t || '')) continue;
        } else {
          // Demand side: reverse direction (intent → service that fulfills)
          // Skip fulfills on demand side for now
          continue;
        }
      }

      visited.add(targetId);

      // Add expansion
      expansions.push(targetPrimary);

      // Record evidence
      evidence.push({
        from: path[path.length - 1],
        to: targetPrimary,
        rel: relation,
        w: effectiveWeight,
        source,
      });

      // Queue for further expansion
      if (depth + 1 < MAX_DEPTH && expansions.length < MAX_EXPANSIONS_PER_TOKEN) {
        queue.push([targetId, depth + 1, effectiveWeight, [...path, targetPrimary]]);
      }
    }
  }

  return { expansions, evidence };
}

/**
 * Expand business signals/tokens with semantic relationships.
 *
 * @param tokens - Input tokens to expand
 * @param context - Expansion context (side, field hints)
 * @returns Expanded tokens with evidence trail
 */
export async function expandBusinessSignals(
  tokens: string[],
  context: ExpansionContext
): Promise<ExpansionResult> {
  const graph = await getBizGraph();

  if (!graph) {
    return {
      original: tokens,
      expanded: tokens,
      evidence: [],
    };
  }

  return expandBusinessSignalsSync(graph, tokens, context);
}

/**
 * Synchronous version using cached graph.
 * Throws if graph not loaded.
 */
export function expandBusinessSignalsSync(
  graph: BizGraph,
  tokens: string[],
  context: ExpansionContext
): ExpansionResult {
  const expanded = new Set<string>(tokens);
  const allEvidence: ExpansionEvidence[] = [];

  for (const token of tokens) {
    const { expansions, evidence } = expandToken(graph, token, context);

    for (const exp of expansions) {
      expanded.add(exp);
    }

    allEvidence.push(...evidence);
  }

  return {
    original: tokens,
    expanded: [...expanded],
    evidence: allEvidence,
  };
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Expand text directly (tokenize + expand).
 */
export async function expandBusinessText(
  text: string,
  context: ExpansionContext
): Promise<ExpansionResult> {
  const tokens = tokenizeBusinessText(text);
  return expandBusinessSignals(tokens, context);
}

/**
 * Check if a token matches any concept in the graph.
 */
export function hasConceptMatch(token: string): boolean {
  const graph = getCachedBizGraph();
  if (!graph) return false;

  const canonical = canonicalizeLabel(token);
  return graph.labelToId.has(canonical);
}

/**
 * Get all labels that match a token (exact + aliases).
 */
export function getMatchingLabels(token: string): string[] {
  const graph = getCachedBizGraph();
  if (!graph) return [];

  const canonical = canonicalizeLabel(token);
  const conceptId = graph.labelToId.get(canonical);
  if (!conceptId) return [];

  return graph.idToLabels.get(conceptId) || [];
}

/**
 * Get concept info for a token.
 */
export function getConceptInfo(token: string): {
  id: string;
  type: string;
  domain: string;
  labels: string[];
} | null {
  const graph = getCachedBizGraph();
  if (!graph) return null;

  const canonical = canonicalizeLabel(token);
  const conceptId = graph.labelToId.get(canonical);
  if (!conceptId) return null;

  const concept = graph.bundle.concepts[conceptId];
  if (!concept) return null;

  return {
    id: conceptId,
    type: concept.t,
    domain: concept.d,
    labels: [...concept.l, ...concept.a],
  };
}
