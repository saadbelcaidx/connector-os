/**
 * Intro Builder — Barrel Export
 */

export type { TemplateVariable, IntroTemplate, PairContext, GeneratedIntro, ComposedDraft } from './types';

export {
  extractPlaceholders,
  buildAIPrompt,
  parseAndFallback,
  interpolate,
  resolveVariables,
  generateIntrosBatch,
  cleanCompanyName,
  extractFirstName,
  aOrAn,
} from './engine';

export { PRESET_TEMPLATES } from './presets';

export type { Situation } from './situation';
export { deriveSituationBatch, SITUATION_FALLBACKS } from './situation';

export {
  loadCustomTemplates,
  saveTemplate,
  deleteTemplate,
  duplicateTemplate,
  getAllTemplates,
} from './storage';

export {
  buildPairContext,
  getEnrichedPairs,
  countEnrichmentStatus,
} from './context';

export {
  buildMatchContext,
  buildComposePrompt,
  parseComposedDrafts,
  generateComposedIntros,
  buildGroupedComposePrompt,
  parseGroupedResponse,
  generateGroupedIntros,
} from './composeEngine';
