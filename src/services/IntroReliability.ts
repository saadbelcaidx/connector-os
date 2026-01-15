/**
 * INTRO RELIABILITY — Gateway to Edge-Based Intro Generation
 *
 * This module's job:
 * - DTO transformation (IntroRequest → Match)
 * - Logging
 * - Metrics
 * - Failure reporting
 *
 * NOT copy decisions. Copy lives in src/edge/.
 */

import { composeIntroWithEdge, validateEdge } from '../edge';
import type { IntroSide, IntroContext, Match, EdgeInput, IntroResult } from '../edge';

// =============================================================================
// TYPES
// =============================================================================

// Legacy context from Flow.tsx (backwards compatible)
export interface LegacyIntroContext {
  firstName: string;
  company: string;
  companyDescription?: string;
  preSignalContext?: string;
  demandType?: string;
}

export interface IntroRequest {
  side: IntroSide;
  mode: string;
  ctx: LegacyIntroContext;  // Accept legacy format, transform internally
  // Edge data (required for CONNECT intros, optional for PROBE)
  edge?: EdgeInput | null;
  // Match context for symmetrical intros
  demandDomain?: string;
  demandSummary?: { category: string; who_they_serve: string; what_they_do: string } | null;
  supplyDomain?: string;
  supplySummary?: { category: string; who_they_serve: string; what_they_do: string } | null;
}

export interface IntroOutput {
  intro: string;
  type: 'connect' | 'probe' | 'none';
  validation: 'valid' | 'invalid' | 'probe_only';
  reason?: string;
}

// =============================================================================
// DTO TRANSFORMATION
// =============================================================================

/**
 * Transform legacy ctx (from Flow.tsx) to edge module's IntroContext.
 *
 * INVARIANT: Never use companyDescription verbatim.
 * Summary is null → edge module uses mode-specific neutral fallback.
 */
function transformContext(legacy: LegacyIntroContext): IntroContext {
  // DO NOT use companyDescription — it leaks raw marketing copy
  // The edge module will use NEUTRAL_SUMMARY ("is a team in this space")
  return {
    firstName: legacy.firstName || 'there',
    company: legacy.company || 'a company',
    summary: null,  // Intentionally null — forces safe fallback
  };
}

function buildMatch(request: IntroRequest): Match {
  return {
    mode: request.mode || 'b2b_broad',
    demand: {
      domain: request.demandDomain || 'unknown',
      summary: request.demandSummary || null,
    },
    supply: {
      domain: request.supplyDomain || 'unknown',
      summary: request.supplySummary || null,
    },
    edge: request.edge || null,
  };
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Generate intro via edge system (deterministic, no AI).
 *
 * Returns:
 * - type: 'connect' | 'probe' | 'none'
 * - intro: string | null
 * - validation: explains why
 */
export function generateIntroReliable(request: IntroRequest): IntroOutput {
  const match = buildMatch(request);
  const ctx = transformContext(request.ctx);  // Transform legacy → edge format
  const result = composeIntroWithEdge(request.side, match, ctx);

  // LOGGING
  console.log(`[IntroReliability] side=${request.side} mode=${request.mode} validation=${result.validation} type=${result.type}`);

  if (result.type === 'none') {
    console.log(`[IntroReliability] No intro generated: ${result.reason || 'validation failed'}`);
  }

  return {
    intro: result.intro || '',
    type: result.type,
    validation: result.validation,
    reason: result.reason,
  };
}

/**
 * Generate intro (async signature for backwards compat).
 */
export async function generateIntroWithAI(
  request: IntroRequest,
  _config: unknown = null,
  _userId: string = 'guest'
): Promise<IntroOutput> {
  return generateIntroReliable(request);
}

// =============================================================================
// BATCH API
// =============================================================================

export interface BatchIntroRequest {
  items: Array<{
    id: string;
    request: IntroRequest;
  }>;
  config?: unknown;
  userId?: string;
}

export interface BatchIntroResult {
  results: Map<string, string>;
  metadata: Map<string, { type: string; validation: string }>;
}

/**
 * Generate batch intros (deterministic).
 */
export function generateBatchIntrosReliable(batch: BatchIntroRequest): BatchIntroResult {
  const results = new Map<string, string>();
  const metadata = new Map<string, { type: string; validation: string }>();

  for (const item of batch.items) {
    const output = generateIntroReliable(item.request);
    results.set(item.id, output.intro);
    metadata.set(item.id, { type: output.type, validation: output.validation });
  }

  return { results, metadata };
}

/**
 * Generate batch intros (async signature for backwards compat).
 */
export async function generateBatchIntrosWithAI(
  batch: BatchIntroRequest,
  onProgress?: (current: number, total: number) => void
): Promise<BatchIntroResult> {
  const results = new Map<string, string>();
  const metadata = new Map<string, { type: string; validation: string }>();
  const total = batch.items.length;

  for (let i = 0; i < batch.items.length; i++) {
    const item = batch.items[i];
    const output = generateIntroReliable(item.request);
    results.set(item.id, output.intro);
    metadata.set(item.id, { type: output.type, validation: output.validation });
    onProgress?.(i + 1, total);
  }

  return { results, metadata };
}

// =============================================================================
// VALIDATION HELPERS (for external use)
// =============================================================================

export { validateEdge, IntroSide, IntroContext, Match, EdgeInput };
