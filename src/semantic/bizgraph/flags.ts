/**
 * BIZGRAPH Feature Flags
 *
 * Controls BIZGRAPH semantic matching.
 * Default: OFF (require explicit opt-in)
 */

/**
 * Enable BIZGRAPH semantic matching.
 * Set via environment variable: VITE_BIZGRAPH_SEMANTIC_MATCHING=true
 */
export const BIZGRAPH_ENABLED: boolean =
  typeof import.meta !== 'undefined' &&
  import.meta.env?.VITE_BIZGRAPH_SEMANTIC_MATCHING === 'true';

/**
 * Log flag state on load (for debugging).
 */
if (typeof window !== 'undefined') {
  console.log(`[BIZGRAPH] Feature flag: ${BIZGRAPH_ENABLED ? 'ENABLED' : 'DISABLED'}`);
}
