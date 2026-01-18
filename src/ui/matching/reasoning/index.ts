/**
 * MATCH REASONING — Human Reasoning Layer Exports
 *
 * Provides surgical ⓘ icon with operator-grade match explanations.
 */

// Main component
export { MatchReasoningPopover } from './MatchReasoningPopover';
export type { MatchReasoningPopoverProps } from './MatchReasoningPopover';

// Translation utilities
export {
  translateToOperatorLanguage,
  detectMatchPattern,
  extractRoutingTag,
  formatConfidence,
  getTierDisplayInfo,
  MatchPattern,
} from './translator';

export type {
  ReasoningLines,
  TierDisplayInfo,
} from './translator';
