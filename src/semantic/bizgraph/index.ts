/**
 * BIZGRAPH — Business Domain Semantic Graph
 *
 * Public API for semantic expansion.
 */

// Feature flag
export { BIZGRAPH_ENABLED } from './flags';

// Schema types
export {
  type TagType,
  type Domain,
  type EdgeRelation,
  type BizGraphConcept,
  type BizGraphEdge,
  type BizGraphBundle,
  type ExpansionEvidence,
  type ExpansionResult,
  canonicalizeLabel,
  generateConceptId,
} from './schema';

// Loader
export {
  type BizGraph,
  getBizGraph,
  getCachedBizGraph,
  isBizGraphLoaded,
  preloadBizGraph,
  clearBizGraphCache,
} from './loader';

// Expander
export {
  type ExpansionContext,
  tokenizeBusinessText,
  expandBusinessSignals,
  expandBusinessSignalsSync,
  expandBusinessText,
  hasConceptMatch,
  getMatchingLabels,
  getConceptInfo,
} from './expand';

// Manual core (for testing/debugging)
export {
  MANUAL_CORE_CONCEPTS,
  MANUAL_CORE_EDGE_DEFS,
  buildManualCoreConcepts,
  buildLabelIndex,
  buildManualCoreEdges,
  getRequiredEdgeAssertions,
  isExpansionBlocked,
  getDisambiguationCluster,
  DISAMBIGUATION_CLUSTERS,
} from './manualCore';
