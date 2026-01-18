/**
 * MATCH-2: Universal Semantic Matching (ConceptNet-powered)
 *
 * Provides niche-agnostic semantic expansion using pre-built ConceptNet bundle.
 * Works for ANY industry without hardcoding.
 *
 * Architecture:
 * - MATCH-2A2: Bundle loader (loads gzipped bundle at runtime)
 * - MATCH-2B: Expansion engine (expands tokens using semantic graph)
 * - MATCH-2C: Guardrails (type tags prevent false positives)
 * - MATCH-2D: Integration (feature-flagged, A/B testable)
 */

// =============================================================================
// FEATURE FLAG
// =============================================================================

export const SEMANTIC_V2_ENABLED = false; // Enable after testing

// =============================================================================
// TYPES
// =============================================================================

interface SemanticBundle {
  version: string;
  buildDate: string;
  stats: {
    totalConcepts: number;
    totalEdges: number;
    avgEdgesPerConcept: number;
  };
  concepts: Record<string, {
    e: Array<[string, number, string]>;  // [target, weight, relation]
    t: string[];                          // type tags
  }>;
}

interface ExpansionResult {
  original: string;
  expansions: Array<{
    term: string;
    weight: number;
    relation: string;
    path: string[];
  }>;
  tags: string[];
}

interface SemanticOverlapResult {
  score: number;           // 0-100
  matchedTerms: string[];
  expansionDepth: number;
  confidence: number;      // 0-1
}

// =============================================================================
// MATCH-2A2: BUNDLE LOADER
// =============================================================================

let bundleCache: SemanticBundle | null = null;
let loadPromise: Promise<SemanticBundle | null> | null = null;

/**
 * Load the semantic bundle from public/semantic/.
 * Uses fetch + pako for browser-side gzip decompression.
 * Caches the result for subsequent calls.
 */
export async function loadSemanticBundle(): Promise<SemanticBundle | null> {
  // Return cached bundle if available
  if (bundleCache) {
    return bundleCache;
  }

  // Return existing promise if already loading
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    try {
      // Find the latest bundle file
      const bundlePath = '/semantic/semantic-v2026-01-18.json.gz';

      console.log('[SemanticV2] Loading bundle from:', bundlePath);
      const startTime = Date.now();

      const response = await fetch(bundlePath);
      if (!response.ok) {
        console.warn('[SemanticV2] Bundle not found:', response.status);
        return null;
      }

      // Get the gzipped data
      const gzippedData = await response.arrayBuffer();

      // Decompress using DecompressionStream (modern browsers)
      const decompressedStream = new Response(
        new Blob([gzippedData]).stream().pipeThrough(new DecompressionStream('gzip'))
      );
      const jsonText = await decompressedStream.text();

      // Parse JSON
      bundleCache = JSON.parse(jsonText) as SemanticBundle;

      const elapsed = Date.now() - startTime;
      console.log(`[SemanticV2] Bundle loaded in ${elapsed}ms:`, {
        concepts: bundleCache.stats.totalConcepts.toLocaleString(),
        edges: bundleCache.stats.totalEdges.toLocaleString(),
      });

      return bundleCache;
    } catch (err) {
      console.error('[SemanticV2] Failed to load bundle:', err);
      return null;
    }
  })();

  return loadPromise;
}

/**
 * Check if bundle is loaded and ready.
 */
export function isBundleLoaded(): boolean {
  return bundleCache !== null;
}

/**
 * Get bundle stats (for debugging/UI).
 */
export function getBundleStats(): SemanticBundle['stats'] | null {
  return bundleCache?.stats || null;
}

// =============================================================================
// MATCH-2B: EXPANSION ENGINE
// =============================================================================

/**
 * Expand a single term using the semantic graph.
 * Returns related terms with weights and relations.
 *
 * @param term - The term to expand
 * @param maxDepth - Maximum graph traversal depth (1 = direct, 2 = 2-hop)
 * @param maxExpansions - Maximum number of expansions to return
 */
export function expandTerm(
  term: string,
  maxDepth: number = 1,
  maxExpansions: number = 10
): ExpansionResult {
  const result: ExpansionResult = {
    original: term,
    expansions: [],
    tags: [],
  };

  if (!bundleCache) {
    return result;
  }

  const normalizedTerm = term.toLowerCase().trim();
  const concept = bundleCache.concepts[normalizedTerm];

  if (!concept) {
    return result;
  }

  // Get type tags for the original term
  result.tags = concept.t || [];

  // Collect expansions with BFS
  const visited = new Set<string>([normalizedTerm]);
  const queue: Array<{ term: string; depth: number; path: string[] }> = [
    { term: normalizedTerm, depth: 0, path: [normalizedTerm] }
  ];

  while (queue.length > 0 && result.expansions.length < maxExpansions) {
    const current = queue.shift()!;

    if (current.depth >= maxDepth) {
      continue;
    }

    const currentConcept = bundleCache.concepts[current.term];
    if (!currentConcept) {
      continue;
    }

    for (const [target, weight, relation] of currentConcept.e) {
      if (visited.has(target)) {
        continue;
      }

      visited.add(target);

      // Add to expansions
      result.expansions.push({
        term: target,
        weight: weight * Math.pow(0.7, current.depth), // Decay weight by depth
        relation: expandRelation(relation),
        path: [...current.path, target],
      });

      // Add to queue for deeper traversal
      if (current.depth + 1 < maxDepth) {
        queue.push({
          term: target,
          depth: current.depth + 1,
          path: [...current.path, target],
        });
      }

      if (result.expansions.length >= maxExpansions) {
        break;
      }
    }
  }

  // Sort by weight (highest first)
  result.expansions.sort((a, b) => b.weight - a.weight);

  return result;
}

/**
 * Expand relation code to full name.
 */
function expandRelation(code: string): string {
  const relations: Record<string, string> = {
    'S': 'Synonym',
    'R': 'RelatedTo',
    'I': 'IsA',
    'D': 'DerivedFrom',
    'F': 'FormOf',
    's': 'SimilarTo',
  };
  return relations[code] || code;
}

/**
 * Expand multiple terms and merge results.
 */
export function expandTerms(
  terms: string[],
  maxDepth: number = 1,
  maxExpansionsPerTerm: number = 5
): Map<string, ExpansionResult> {
  const results = new Map<string, ExpansionResult>();

  for (const term of terms) {
    const expansion = expandTerm(term, maxDepth, maxExpansionsPerTerm);
    if (expansion.expansions.length > 0 || expansion.tags.length > 0) {
      results.set(term, expansion);
    }
  }

  return results;
}

// =============================================================================
// MATCH-2C: GUARDRAILS (Type Tag Filtering)
// =============================================================================

/**
 * Check if two concepts are compatible based on type tags.
 * Prevents false positives like "recruiting office" (military) matching "recruiting agency" (HR).
 */
export function areTagsCompatible(tags1: string[], tags2: string[]): boolean {
  // If either has no tags, allow match (no guardrail info)
  if (tags1.length === 0 || tags2.length === 0) {
    return true;
  }

  // Extract domains and functions
  const domains1 = tags1.filter(t => t.startsWith('domain:'));
  const domains2 = tags2.filter(t => t.startsWith('domain:'));
  const functions1 = tags1.filter(t => t.startsWith('function:'));
  const functions2 = tags2.filter(t => t.startsWith('function:'));

  // If both have domain tags, at least one must overlap
  if (domains1.length > 0 && domains2.length > 0) {
    const domainOverlap = domains1.some(d => domains2.includes(d));
    if (!domainOverlap) {
      return false; // Domain mismatch = incompatible
    }
  }

  // If both have function tags, at least one must overlap
  if (functions1.length > 0 && functions2.length > 0) {
    const functionOverlap = functions1.some(f => functions2.includes(f));
    if (!functionOverlap) {
      return false; // Function mismatch = incompatible
    }
  }

  return true;
}

/**
 * Filter expansions to only include compatible terms.
 */
export function filterByTags(
  expansions: ExpansionResult['expansions'],
  sourceTags: string[]
): ExpansionResult['expansions'] {
  if (!bundleCache || sourceTags.length === 0) {
    return expansions;
  }

  return expansions.filter(exp => {
    const targetConcept = bundleCache!.concepts[exp.term];
    if (!targetConcept) {
      return true; // No info = allow
    }

    return areTagsCompatible(sourceTags, targetConcept.t || []);
  });
}

// =============================================================================
// MATCH-2D: SEMANTIC OVERLAP SCORING
// =============================================================================

/**
 * Compute semantic overlap between demand and supply token sets.
 * Uses graph-based expansion to find connections.
 *
 * @param demandTokens - Tokens from demand side
 * @param supplyTokens - Tokens from supply side
 * @param options - Configuration options
 */
export function computeSemanticOverlapV2(
  demandTokens: string[],
  supplyTokens: string[],
  options: {
    maxDepth?: number;
    maxExpansionsPerTerm?: number;
    useGuardrails?: boolean;
  } = {}
): SemanticOverlapResult {
  const {
    maxDepth = 1,
    maxExpansionsPerTerm = 5,
    useGuardrails = true,
  } = options;

  const result: SemanticOverlapResult = {
    score: 0,
    matchedTerms: [],
    expansionDepth: 0,
    confidence: 0,
  };

  if (!bundleCache) {
    return result;
  }

  // Normalize tokens
  const normalizedDemand = new Set(demandTokens.map(t => t.toLowerCase().trim()));
  const normalizedSupply = new Set(supplyTokens.map(t => t.toLowerCase().trim()));

  // Check direct overlap first
  const directMatches: string[] = [];
  for (const token of normalizedDemand) {
    if (normalizedSupply.has(token)) {
      directMatches.push(token);
    }
  }

  if (directMatches.length > 0) {
    result.matchedTerms = directMatches;
    result.score = Math.min(100, directMatches.length * 20);
    result.expansionDepth = 0;
    result.confidence = 1.0;
    return result;
  }

  // Expand demand tokens
  const demandExpansions = expandTerms(
    Array.from(normalizedDemand),
    maxDepth,
    maxExpansionsPerTerm
  );

  // Build expanded demand set with weights
  const expandedDemand = new Map<string, { weight: number; source: string; tags: string[] }>();

  for (const [sourceTerm, expansion] of demandExpansions) {
    // Add source term
    expandedDemand.set(sourceTerm, {
      weight: 1.0,
      source: sourceTerm,
      tags: expansion.tags,
    });

    // Add expansions (with guardrails)
    let filteredExpansions = expansion.expansions;
    if (useGuardrails) {
      filteredExpansions = filterByTags(expansion.expansions, expansion.tags);
    }

    for (const exp of filteredExpansions) {
      const existing = expandedDemand.get(exp.term);
      if (!existing || existing.weight < exp.weight) {
        expandedDemand.set(exp.term, {
          weight: exp.weight,
          source: sourceTerm,
          tags: expansion.tags,
        });
      }
    }
  }

  // Find matches with supply
  const semanticMatches: Array<{ term: string; weight: number; source: string }> = [];

  for (const supplyToken of normalizedSupply) {
    const match = expandedDemand.get(supplyToken);
    if (match) {
      semanticMatches.push({
        term: supplyToken,
        weight: match.weight,
        source: match.source,
      });
    }

    // Also check if supply token expands to demand tokens
    const supplyExpansion = expandTerm(supplyToken, 1, maxExpansionsPerTerm);
    for (const exp of supplyExpansion.expansions) {
      if (normalizedDemand.has(exp.term)) {
        semanticMatches.push({
          term: exp.term,
          weight: exp.weight * 0.8, // Slightly lower for reverse match
          source: supplyToken,
        });
      }
    }
  }

  if (semanticMatches.length === 0) {
    return result;
  }

  // Calculate score based on matches
  const totalWeight = semanticMatches.reduce((sum, m) => sum + m.weight, 0);
  const avgWeight = totalWeight / semanticMatches.length;

  result.matchedTerms = [...new Set(semanticMatches.map(m => m.term))];
  result.score = Math.min(100, Math.round(semanticMatches.length * 15 * avgWeight));
  result.expansionDepth = 1;
  result.confidence = Math.min(1.0, avgWeight);

  return result;
}

// =============================================================================
// INTEGRATION API
// =============================================================================

/**
 * Get semantic bonus for a demand-supply match.
 * This is the main integration point for the matching engine.
 *
 * @param demandText - Text from demand side (signal, title, description)
 * @param supplyText - Text from supply side (title, description, company)
 * @returns Semantic bonus (0-30) and matched terms
 */
export async function getSemanticBonus(
  demandText: string,
  supplyText: string
): Promise<{ bonus: number; matchedTerms: string[]; reason: string }> {
  // Ensure bundle is loaded
  if (!bundleCache) {
    await loadSemanticBundle();
  }

  if (!bundleCache || !SEMANTIC_V2_ENABLED) {
    return { bonus: 0, matchedTerms: [], reason: '' };
  }

  // Tokenize
  const demandTokens = tokenize(demandText);
  const supplyTokens = tokenize(supplyText);

  // Compute overlap
  const overlap = computeSemanticOverlapV2(demandTokens, supplyTokens, {
    maxDepth: 1,
    maxExpansionsPerTerm: 5,
    useGuardrails: true,
  });

  // Convert score to bonus (0-30 range)
  let bonus = 0;
  let reason = '';

  if (overlap.score >= 60) {
    bonus = 30;
    reason = `Strong semantic match: ${overlap.matchedTerms.slice(0, 3).join(', ')}`;
  } else if (overlap.score >= 40) {
    bonus = 20;
    reason = `Semantic overlap: ${overlap.matchedTerms.slice(0, 2).join(', ')}`;
  } else if (overlap.score >= 20) {
    bonus = 10;
    reason = 'Semantic connection detected';
  }

  return {
    bonus,
    matchedTerms: overlap.matchedTerms,
    reason,
  };
}

/**
 * Simple tokenizer for matching text.
 */
function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

// =============================================================================
// PRELOAD HOOK
// =============================================================================

/**
 * Preload the bundle (call early in app lifecycle).
 */
export function preloadSemanticBundle(): void {
  if (SEMANTIC_V2_ENABLED) {
    loadSemanticBundle().catch(err => {
      console.warn('[SemanticV2] Preload failed:', err);
    });
  }
}
