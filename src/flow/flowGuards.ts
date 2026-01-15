/**
 * FLOW GUARDS — Zero Silent Failures
 *
 * Every early return must set a visible reason.
 * This module provides:
 * - guard(condition, uxBlock): boolean — soft check, sets error if false
 * - fail(uxBlock): never — hard abort, throws FlowAbort
 * - FlowAbort class — caught by pipeline wrapper
 *
 * DOCTRINE: No guard may fail silently in a user-click path.
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * FlowBlock — Structured error/warning for pipeline guards.
 * Named to avoid collision with Explainability.ts UXBlock.
 */
export interface FlowBlock {
  code: string;           // Stable string for testing (e.g., 'NO_SETTINGS')
  title: string;          // Human-readable title (e.g., 'Settings missing')
  detail: string;         // One sentence explanation
  next_step: string;      // One action the user can take
  correlationId?: string; // runId for tracing
  severity?: 'info' | 'warning' | 'error';
}

export type FlowBlockSetter = (block: FlowBlock | null) => void;

// =============================================================================
// FLOW ABORT — Controlled pipeline termination
// =============================================================================

export class FlowAbort extends Error {
  public readonly uxBlock: FlowBlock;

  constructor(uxBlock: FlowBlock) {
    super(`[FlowAbort] ${uxBlock.code}: ${uxBlock.title}`);
    this.name = 'FlowAbort';
    this.uxBlock = uxBlock;
  }
}

// =============================================================================
// GUARD FUNCTIONS
// =============================================================================

/**
 * Soft guard — returns false if condition fails, sets FlowBlock.
 * Use when you want to handle the failure yourself.
 *
 * @example
 * if (!guard(settings, BLOCKS.NO_SETTINGS, setFlowBlock)) return;
 */
export function guard(
  condition: unknown,
  uxBlock: FlowBlock,
  setFlowBlock: FlowBlockSetter
): boolean {
  if (!condition) {
    setFlowBlock(uxBlock);
    console.log(`[FlowGuard] BLOCKED code=${uxBlock.code} title="${uxBlock.title}"`);
    return false;
  }
  return true;
}

/**
 * Hard abort — throws FlowAbort, must be caught by pipeline wrapper.
 * Use when you want to stop execution immediately.
 *
 * @example
 * if (!settings) fail(BLOCKS.NO_SETTINGS);
 */
export function fail(uxBlock: FlowBlock): never {
  console.log(`[FlowGuard] ABORT code=${uxBlock.code} title="${uxBlock.title}"`);
  throw new FlowAbort(uxBlock);
}

/**
 * Assert guard — throws FlowAbort if condition is falsy.
 * Combines condition check + abort in one call.
 *
 * @example
 * assertGuard(settings, BLOCKS.NO_SETTINGS);
 */
export function assertGuard(condition: unknown, uxBlock: FlowBlock): asserts condition {
  if (!condition) {
    fail(uxBlock);
  }
}

// =============================================================================
// PREDEFINED UXBLOCKS — Canonical error definitions
// =============================================================================

export const BLOCKS = {
  // Settings / Configuration
  NO_SETTINGS: {
    code: 'NO_SETTINGS',
    title: 'Settings missing',
    detail: 'No settings configured for this account.',
    next_step: 'Go to Settings and configure your API keys.',
    severity: 'error' as const,
  },
  NO_APIFY_TOKEN: {
    code: 'NO_APIFY_TOKEN',
    title: 'Apify token missing',
    detail: 'Cannot fetch datasets without an Apify token.',
    next_step: 'Add your Apify token in Settings.',
    severity: 'error' as const,
  },
  NO_DEMAND_DATASET: {
    code: 'NO_DEMAND_DATASET',
    title: 'No demand dataset',
    detail: 'No demand dataset ID configured.',
    next_step: 'Add a demand dataset ID in Settings.',
    severity: 'error' as const,
  },
  NO_SUPPLY_DATASET: {
    code: 'NO_SUPPLY_DATASET',
    title: 'No supply dataset',
    detail: 'No supply dataset ID configured.',
    next_step: 'Add a supply dataset ID in Settings.',
    severity: 'error' as const,
  },

  // Data loading
  DATASET_FETCH_FAILED: (detail: string, correlationId?: string): FlowBlock => ({
    code: 'DATASET_FETCH_FAILED',
    title: 'Dataset fetch failed',
    detail,
    next_step: 'Check your dataset ID and Apify token, then retry.',
    correlationId,
    severity: 'error',
  }),
  DATASET_EMPTY: {
    code: 'DATASET_EMPTY',
    title: 'Dataset is empty',
    detail: 'The dataset returned no records.',
    next_step: 'Check if the dataset has data in Apify console.',
    severity: 'warning' as const,
  },
  SCHEMA_INVALID: (detail: string): FlowBlock => ({
    code: 'SCHEMA_INVALID',
    title: 'Schema not recognized',
    detail,
    next_step: 'Use a supported Apify scraper (Wellfound Jobs, LinkedIn Company Leads).',
    severity: 'error',
  }),

  // Matching
  NO_MATCHES: {
    code: 'NO_MATCHES',
    title: 'No matches found',
    detail: 'Matching completed but found no valid pairs.',
    next_step: 'Check if demand and supply datasets have compatible signals.',
    severity: 'warning' as const,
  },
  MATCHING_FAILED: (detail: string, correlationId?: string): FlowBlock => ({
    code: 'MATCHING_FAILED',
    title: 'Matching failed',
    detail,
    next_step: 'Check console for details and retry.',
    correlationId,
    severity: 'error',
  }),

  // Enrichment
  ENRICHMENT_FAILED: (detail: string, correlationId?: string): FlowBlock => ({
    code: 'ENRICHMENT_FAILED',
    title: 'Enrichment failed',
    detail,
    next_step: 'Check your API keys and retry.',
    correlationId,
    severity: 'error',
  }),
  NO_ENRICHMENT_KEYS: {
    code: 'NO_ENRICHMENT_KEYS',
    title: 'No enrichment API keys',
    detail: 'Cannot enrich without Apollo, Anymail, or Connector Agent keys.',
    next_step: 'Add at least one enrichment API key in Settings.',
    severity: 'error' as const,
  },

  // Intro generation
  INTRO_GENERATION_FAILED: (detail: string, correlationId?: string): FlowBlock => ({
    code: 'INTRO_GENERATION_FAILED',
    title: 'Intro generation failed',
    detail,
    next_step: 'Check your AI configuration and retry.',
    correlationId,
    severity: 'error',
  }),

  // Routing / Send
  NO_SENDER_CONFIG: {
    code: 'NO_SENDER_CONFIG',
    title: 'No sender configured',
    detail: 'Cannot route without Instantly or Plusvibe configuration.',
    next_step: 'Configure your sending provider in Settings.',
    severity: 'error' as const,
  },
  ROUTING_FAILED: (detail: string, correlationId?: string): FlowBlock => ({
    code: 'ROUTING_FAILED',
    title: 'Routing failed',
    detail,
    next_step: 'Check your campaign settings and retry.',
    correlationId,
    severity: 'error',
  }),

  // Export
  EXPORT_EMPTY: {
    code: 'EXPORT_EMPTY',
    title: 'Nothing to export',
    detail: 'No records meet export criteria (email + intro required).',
    next_step: 'Complete enrichment and intro generation first.',
    severity: 'warning' as const,
  },

  // Hub
  HUB_DISABLED: {
    code: 'HUB_DISABLED',
    title: 'Hub flow disabled',
    detail: 'Hub integration is not enabled for this session.',
    next_step: 'Start a new flow from the Hub.',
    severity: 'info' as const,
  },
  HUB_NO_CONTACTS: {
    code: 'HUB_NO_CONTACTS',
    title: 'No Hub contacts',
    detail: 'No contacts selected from the Hub.',
    next_step: 'Go to Hub and select contacts first.',
    severity: 'warning' as const,
  },
  HUB_ERROR: (detail: string): FlowBlock => ({
    code: 'HUB_ERROR',
    title: 'Hub data error',
    detail,
    next_step: 'Please try selecting contacts again from the Hub.',
    severity: 'error',
  }),
  HUB_MISSING_SIDE: {
    code: 'HUB_MISSING_SIDE',
    title: 'Hub requires both sides',
    detail: 'Hub requires both Demand and Supply contacts.',
    next_step: 'Go back to Hub and select contacts for both sides.',
    severity: 'warning' as const,
  },
  CONTRACT_VIOLATION: (detail: string): FlowBlock => ({
    code: 'CONTRACT_VIOLATION',
    title: 'Data validation failed',
    detail,
    next_step: 'Check console for details and ensure data format is correct.',
    severity: 'error',
  }),

  // Connector Mode
  MODE_NOT_SELECTED: {
    code: 'MODE_NOT_SELECTED',
    title: 'Connector mode not selected',
    detail: 'A connector mode must be selected to proceed.',
    next_step: 'Select a mode (Recruiting, Biotech Licensing, etc.).',
    severity: 'warning' as const,
  },
  CUSTOM_MODE_NOT_ACKNOWLEDGED: {
    code: 'CUSTOM_MODE_NOT_ACKNOWLEDGED',
    title: 'Custom mode not acknowledged',
    detail: 'Custom mode requires explicit acknowledgment.',
    next_step: 'Acknowledge the custom mode warning to proceed.',
    severity: 'warning' as const,
  },

  // Generic
  UNKNOWN_ERROR: (detail: string, correlationId?: string): FlowBlock => ({
    code: 'UNKNOWN_ERROR',
    title: 'Something went wrong',
    detail,
    next_step: 'Check console for details and retry.',
    correlationId,
    severity: 'error',
  }),
} as const;

// =============================================================================
// PIPELINE WRAPPER — Catch FlowAbort, surface unknown errors
// =============================================================================

/**
 * Wrap a pipeline action to catch FlowAbort and unknown errors.
 * Returns the result if successful, undefined if aborted.
 *
 * @example
 * const result = await wrapPipelineAction(
 *   () => loadDatasets(),
 *   setFlowBlock,
 *   runId
 * );
 * if (!result) return; // FlowAbort was thrown
 */
export async function wrapPipelineAction<T>(
  action: () => Promise<T>,
  setFlowBlock: FlowBlockSetter,
  correlationId?: string
): Promise<T | undefined> {
  try {
    return await action();
  } catch (e) {
    if (e instanceof FlowAbort) {
      setFlowBlock(e.uxBlock);
      return undefined;
    }
    // Unknown error — surface it
    const detail = e instanceof Error ? e.message : 'Unknown error';
    setFlowBlock(BLOCKS.UNKNOWN_ERROR(detail, correlationId));
    console.error('[FlowGuard] UNKNOWN_ERROR', e);
    return undefined;
  }
}

/**
 * Sync version of wrapPipelineAction.
 */
export function wrapPipelineActionSync<T>(
  action: () => T,
  setFlowBlock: FlowBlockSetter,
  correlationId?: string
): T | undefined {
  try {
    return action();
  } catch (e) {
    if (e instanceof FlowAbort) {
      setFlowBlock(e.uxBlock);
      return undefined;
    }
    const detail = e instanceof Error ? e.message : 'Unknown error';
    setFlowBlock(BLOCKS.UNKNOWN_ERROR(detail, correlationId));
    console.error('[FlowGuard] UNKNOWN_ERROR', e);
    return undefined;
  }
}
