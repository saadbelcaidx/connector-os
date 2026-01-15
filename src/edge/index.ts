/**
 * EDGE MODULE — Entry point
 *
 * NO INTRO WITHOUT EDGE.
 */

export { EDGE_TAXONOMY, getTaxonomy, isEdgeValidForMode } from './edgeTaxonomy';
export type { EdgeTaxonomy, EdgeType } from './edgeTaxonomy';

export { validateEdge, canGenerateIntro, canGenerateConnectIntro } from './validateEdge';
export type { EdgeValidationResult, CompanySummary, EdgeInput, Match, MatchSide } from './validateEdge';

export { BANNED_WITHOUT_EDGE, containsBannedPhrase, getEdgePhrase, EDGE_PHRASES, PROBE_RULES, CONNECT_RULES } from './copyRules';

export { composeIntroWithEdge } from './composeIntroWithEdge';
export type { IntroSide, IntroResult, IntroContext } from './composeIntroWithEdge';
