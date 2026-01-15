/**
 * INTRO RELIABILITY — Deterministic Templates Only
 *
 * No AI. No retries. Just fills templates from introDoctrine.
 */

import {
  composeIntro,
  ConnectorMode,
  IntroSide,
  IntroContext,
} from '../copy/introDoctrine';

// =============================================================================
// TYPES
// =============================================================================

export interface IntroRequest {
  side: IntroSide;
  mode: ConnectorMode;
  ctx: IntroContext;
}

export interface IntroOutput {
  intro: string;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Generate intro (deterministic, no AI).
 */
export function generateIntroReliable(request: IntroRequest): IntroOutput {
  const intro = composeIntro({
    side: request.side,
    mode: request.mode,
    ctx: request.ctx,
  });

  return { intro };
}

/**
 * Generate intro (same as above, async signature for backwards compat).
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
}

/**
 * Generate batch intros (deterministic).
 */
export function generateBatchIntrosReliable(batch: BatchIntroRequest): BatchIntroResult {
  const results = new Map<string, string>();

  for (const item of batch.items) {
    const output = generateIntroReliable(item.request);
    results.set(item.id, output.intro);
  }

  return { results };
}

/**
 * Generate batch intros (async signature for backwards compat).
 */
export async function generateBatchIntrosWithAI(
  batch: BatchIntroRequest,
  onProgress?: (current: number, total: number) => void
): Promise<BatchIntroResult> {
  const results = new Map<string, string>();
  const total = batch.items.length;

  for (let i = 0; i < batch.items.length; i++) {
    const item = batch.items[i];
    const output = generateIntroReliable(item.request);
    results.set(item.id, output.intro);
    onProgress?.(i + 1, total);
  }

  return { results };
}
