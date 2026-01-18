/**
 * BIZGRAPH Runtime Loader
 *
 * Loads the gzipped bundle at runtime.
 * Memory-conscious: parse once, cache in module singleton.
 *
 * Features:
 * - Browser-compatible (uses fetch + DecompressionStream)
 * - Falls back to mini bundle if full bundle not available
 * - Precomputes label→ID index for fast lookups
 */

import {
  type BizGraphBundle,
  type BizGraphConcept,
  type BizGraphEdge,
  type LabelIndex,
  type EdgeIndex,
  canonicalizeLabel,
} from './schema';

// =============================================================================
// BUNDLE PATHS
// =============================================================================

const MINI_BUNDLE_PATH = '/semantic/bizgraph-mini-v1.json.gz';
const FULL_BUNDLE_PATH = '/semantic/bizgraph-full-v1.json.gz';

// =============================================================================
// RUNTIME GRAPH STRUCTURE
// =============================================================================

export interface BizGraph {
  /** Raw bundle data */
  bundle: BizGraphBundle;
  /** Fast label → concept ID lookup */
  labelToId: Map<string, string>;
  /** Fast concept ID → all labels lookup */
  idToLabels: Map<string, string[]>;
  /** Fast outgoing edge lookup */
  outgoing: Map<string, BizGraphEdge[]>;
  /** Fast incoming edge lookup */
  incoming: Map<string, BizGraphEdge[]>;
}

// =============================================================================
// MODULE SINGLETON
// =============================================================================

let cachedGraph: BizGraph | null = null;
let loadPromise: Promise<BizGraph> | null = null;

// =============================================================================
// LOADER FUNCTIONS
// =============================================================================

/**
 * Load and decompress bundle from URL.
 * Uses DecompressionStream API if available, falls back to Response.json().
 */
async function loadBundle(path: string): Promise<BizGraphBundle | null> {
  try {
    const response = await fetch(path);
    if (!response.ok) {
      console.warn(`[BizGraph] Failed to load ${path}: ${response.status}`);
      return null;
    }

    // Try DecompressionStream for gzipped content
    if (typeof DecompressionStream !== 'undefined' && path.endsWith('.gz')) {
      const ds = new DecompressionStream('gzip');
      const decompressedStream = response.body!.pipeThrough(ds);
      const decompressedResponse = new Response(decompressedStream);
      return await decompressedResponse.json();
    }

    // Fallback: assume JSON if gzip not supported
    return await response.json();
  } catch (err) {
    console.warn(`[BizGraph] Error loading ${path}:`, err);
    return null;
  }
}

/**
 * Build runtime indexes from bundle.
 */
function buildIndexes(bundle: BizGraphBundle): {
  labelToId: Map<string, string>;
  idToLabels: Map<string, string[]>;
  outgoing: Map<string, BizGraphEdge[]>;
  incoming: Map<string, BizGraphEdge[]>;
} {
  const labelToId = new Map<string, string>();
  const idToLabels = new Map<string, string[]>();
  const outgoing = new Map<string, BizGraphEdge[]>();
  const incoming = new Map<string, BizGraphEdge[]>();

  // Build label indexes
  for (const [id, concept] of Object.entries(bundle.concepts)) {
    const allLabels: string[] = [];

    // Primary labels
    for (const label of concept.l) {
      labelToId.set(label, id);
      allLabels.push(label);
    }

    // Aliases
    for (const alias of concept.a) {
      if (!labelToId.has(alias)) {
        labelToId.set(alias, id);
      }
      allLabels.push(alias);
    }

    idToLabels.set(id, allLabels);
  }

  // Build edge indexes
  for (const edge of bundle.edges) {
    const [fromId, , toId] = edge;

    // Outgoing
    if (!outgoing.has(fromId)) {
      outgoing.set(fromId, []);
    }
    outgoing.get(fromId)!.push(edge);

    // Incoming
    if (!incoming.has(toId)) {
      incoming.set(toId, []);
    }
    incoming.get(toId)!.push(edge);
  }

  return { labelToId, idToLabels, outgoing, incoming };
}

/**
 * Get the BizGraph singleton.
 * Loads bundle on first call, returns cached instance after.
 */
export async function getBizGraph(): Promise<BizGraph | null> {
  // Return cached if available
  if (cachedGraph) {
    return cachedGraph;
  }

  // Return in-progress load if exists
  if (loadPromise) {
    return loadPromise;
  }

  // Start loading
  loadPromise = (async () => {
    const startTime = performance.now();

    // Try full bundle first, fall back to mini
    let bundle = await loadBundle(FULL_BUNDLE_PATH);
    if (!bundle) {
      console.log('[BizGraph] Full bundle not found, loading mini bundle...');
      bundle = await loadBundle(MINI_BUNDLE_PATH);
    }

    if (!bundle) {
      console.error('[BizGraph] No bundle available');
      return null;
    }

    // Build indexes
    const indexes = buildIndexes(bundle);

    cachedGraph = {
      bundle,
      ...indexes,
    };

    const loadTime = performance.now() - startTime;
    console.log(
      `[BizGraph] Loaded: ${bundle.meta.concept_count} concepts, ` +
      `${bundle.meta.edge_count} edges, ${bundle.meta.label_count} labels ` +
      `(${loadTime.toFixed(0)}ms)`
    );

    return cachedGraph;
  })();

  return loadPromise;
}

/**
 * Check if BizGraph is loaded.
 */
export function isBizGraphLoaded(): boolean {
  return cachedGraph !== null;
}

/**
 * Get cached graph without loading (returns null if not loaded).
 */
export function getCachedBizGraph(): BizGraph | null {
  return cachedGraph;
}

/**
 * Preload the BizGraph (call early in app lifecycle).
 */
export function preloadBizGraph(): void {
  getBizGraph().catch((err) => {
    console.warn('[BizGraph] Preload failed:', err);
  });
}

/**
 * Clear the cached graph (for testing).
 */
export function clearBizGraphCache(): void {
  cachedGraph = null;
  loadPromise = null;
}
