/**
 * INTRO RELIABILITY CONTRACT
 *
 * Stripe-level infrastructure. AI is best-effort, never blocking.
 * Deterministic output is REQUIRED. AI enhancement is OPTIONAL.
 *
 * LAYERED EXECUTION:
 * - Layer 0: Deterministic base (always runs first, always succeeds)
 * - Layer 1: AI enhancement (best effort, non-blocking)
 *
 * User NEVER sees: rate limited, AI unavailable, fallback used, try again later
 */

import { AIConfig } from './AIService';
import { allowAICall, AI_LIMITS } from './aiRateLimit';
import {
  buildCanonicalPrompt,
  validateIntro,
  composeIntro,
  ConnectorMode,
  IntroSide,
  IntroContext,
} from '../copy/introDoctrine';

// =============================================================================
// TYPES (Internal Only)
// =============================================================================

export interface IntroRequest {
  side: IntroSide;
  mode: ConnectorMode;
  ctx: IntroContext;
}

// Public return type — NO source, NO fallbackReason, NO AI state
export interface IntroOutput {
  intro: string;
}

// Internal observability (NEVER exposed to UI)
interface InternalTelemetry {
  ai_attempted: boolean;
  ai_succeeded: boolean;
  ai_skipped_reason: 'RATE_LIMIT' | 'TIMEOUT' | 'VALIDATION' | 'ERROR' | 'NONE';
}

// Job queue entry
interface AIEnhancementJob {
  id: string;
  baseIntro: string;
  request: IntroRequest;
  config: AIConfig;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'SKIPPED';
  result?: string;
  telemetry: InternalTelemetry;
}

// =============================================================================
// JOB QUEUE (In-Memory, Non-Blocking)
// =============================================================================

const jobQueue: AIEnhancementJob[] = [];
let isProcessing = false;
const QUEUE_MAX_SIZE = 100;
const JOB_TIMEOUT_MS = 5000;

// =============================================================================
// LAYER 0 — DETERMINISTIC BASE (Always On)
// =============================================================================

/**
 * Build deterministic intro. ALWAYS succeeds. No AI. No external calls.
 * Uses canonical templates, mode-specific phrases, MatchNarrative fields ONLY.
 */
function buildDeterministicIntro(request: IntroRequest): string {
  // composeIntro is the existing canonical fallback — deterministic, no AI
  return composeIntro({
    side: request.side,
    mode: request.mode,
    ctx: request.ctx,
  });
}

// =============================================================================
// LAYER 1 — AI ENHANCEMENT (Best Effort)
// =============================================================================

/**
 * Try to enhance intro with AI. May fail silently.
 * Returns enhanced intro or null on ANY failure.
 */
async function tryEnhanceWithAI(
  baseIntro: string,
  request: IntroRequest,
  config: AIConfig,
  userId: string
): Promise<{ intro: string | null; telemetry: InternalTelemetry }> {
  const telemetry: InternalTelemetry = {
    ai_attempted: false,
    ai_succeeded: false,
    ai_skipped_reason: 'NONE',
  };

  // Gate: AI not configured
  if (!config?.enabled || !config?.apiKey || !config?.model) {
    return { intro: null, telemetry };
  }

  // Gate: Rate limit
  const limit = userId === 'guest' ? AI_LIMITS.guest : AI_LIMITS.paid;
  if (!allowAICall(userId, limit)) {
    telemetry.ai_skipped_reason = 'RATE_LIMIT';
    return { intro: null, telemetry };
  }

  telemetry.ai_attempted = true;

  try {
    // Build prompt for AI enhancement
    const prompt = buildCanonicalPrompt({
      side: request.side,
      ctx: request.ctx,
      mode: request.mode,
    });

    // Call AI provider with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), JOB_TIMEOUT_MS);

    const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-proxy`;

    const body: Record<string, unknown> = {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 150,
      temperature: 0.7,
    };

    // Provider-specific config
    if (config.provider === 'azure') {
      body.provider = 'azure';
      body.azureEndpoint = config.endpoint;
      body.azureApiKey = config.apiKey;
      body.azureDeployment = config.deployment || config.model;
    } else if (config.provider === 'openai') {
      body.provider = 'openai';
      body.openaiApiKey = config.apiKey;
      body.model = config.model || 'gpt-4o-mini';
    } else if (config.provider === 'anthropic') {
      body.provider = 'anthropic';
      body.anthropicApiKey = config.apiKey;
      body.model = config.model || 'claude-3-haiku-20240307';
    }

    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      telemetry.ai_skipped_reason = 'ERROR';
      return { intro: null, telemetry };
    }

    const data = await response.json();
    const aiResult = (data.content || '').trim().replace(/^["']|["']$/g, '');

    // Empty or partial response
    if (!aiResult || aiResult.length < 10) {
      telemetry.ai_skipped_reason = 'ERROR';
      return { intro: null, telemetry };
    }

    // Validate against doctrine
    const validation = validateIntro(aiResult, request.ctx);
    if (!validation.valid) {
      telemetry.ai_skipped_reason = 'VALIDATION';
      return { intro: null, telemetry };
    }

    // STRUCTURAL GUARD: Ensure AI output has correct opening for side
    // Demand must NOT start with supply opening, supply must NOT start with demand opening
    const lowerIntro = aiResult.toLowerCase();
    const DEMAND_FORBIDDEN = 'quick check before i connect you';
    const SUPPLY_FORBIDDEN = 'quick relevance check';

    if (request.side === 'supply' && lowerIntro.includes(SUPPLY_FORBIDDEN)) {
      // Supply intro has demand opening - reject
      telemetry.ai_skipped_reason = 'VALIDATION';
      return { intro: null, telemetry };
    }
    if (request.side === 'demand' && lowerIntro.includes(DEMAND_FORBIDDEN)) {
      // Demand intro has supply opening - reject
      telemetry.ai_skipped_reason = 'VALIDATION';
      return { intro: null, telemetry };
    }

    telemetry.ai_succeeded = true;
    return { intro: aiResult, telemetry };

  } catch (error) {
    // Timeout or network error
    if (error instanceof Error && error.name === 'AbortError') {
      telemetry.ai_skipped_reason = 'TIMEOUT';
    } else {
      telemetry.ai_skipped_reason = 'ERROR';
    }
    return { intro: null, telemetry };
  }
}

// =============================================================================
// QUEUE PROCESSOR (Background Worker)
// =============================================================================

async function processQueue(config: AIConfig, userId: string): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  while (jobQueue.length > 0) {
    const job = jobQueue.shift();
    if (!job) break;

    job.status = 'PROCESSING';

    const { intro, telemetry } = await tryEnhanceWithAI(
      job.baseIntro,
      job.request,
      config,
      userId
    );

    job.telemetry = telemetry;

    if (intro) {
      job.result = intro;
      job.status = 'COMPLETED';
    } else {
      job.status = 'SKIPPED';
    }

    // Note: Results are available but NOT pushed back to UI
    // This is async enhancement — original Layer 0 was already returned
  }

  isProcessing = false;
}

// =============================================================================
// PUBLIC API — EXACT CODE SHAPE FROM SPEC
// =============================================================================

/**
 * Generate intro with reliability contract.
 *
 * ALWAYS returns a valid intro string.
 * NEVER returns null, undefined, or blocks.
 *
 * Layer 0 runs FIRST and is returned immediately.
 * Layer 1 (AI) is enqueued for best-effort enhancement.
 */
export function generateIntroReliable(
  request: IntroRequest,
  config: AIConfig | null,
  userId: string = 'guest'
): IntroOutput {
  let baseIntro: string;

  try {
    // Layer 0 — Deterministic Base (ALWAYS FIRST)
    baseIntro = buildDeterministicIntro(request);

    // Layer 1 — AI Enhancement (Best Effort, Non-Blocking)
    // Enqueue job, do NOT wait
    if (config?.enabled && config?.apiKey) {
      const job: AIEnhancementJob = {
        id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        baseIntro,
        request,
        config,
        status: 'PENDING',
        telemetry: {
          ai_attempted: false,
          ai_succeeded: false,
          ai_skipped_reason: 'NONE',
        },
      };

      // Capacity check
      if (jobQueue.length < QUEUE_MAX_SIZE) {
        jobQueue.push(job);
        // Fire and forget — do not await
        processQueue(config, userId);
      }
      // If capacity exceeded: job marked AI_SKIPPED implicitly (not enqueued)
    }

    // Return Layer 0 immediately
    return { intro: baseIntro };

  } catch {
    // Catch-all safety net
    // If even Layer 0 somehow fails, return minimal safe output
    return { intro: `Hey ${request.ctx.firstName || 'there'} — wanted to reach out about ${request.ctx.company || 'an opportunity'}.` };
  }
}

/**
 * Generate intro with SYNCHRONOUS AI attempt.
 * Use this when caller can afford to wait for AI.
 * Still follows reliability contract — Layer 0 first, AI enhances.
 *
 * EXACT CODE SHAPE FROM SPEC:
 * try {
 *   baseIntro = buildDeterministicIntro(context)
 *   aiIntro = tryEnhanceWithAI(baseIntro, context)
 *   if (aiIntro && validateIntro(aiIntro)) return aiIntro
 *   return baseIntro
 * } catch {
 *   return baseIntro
 * }
 */
export async function generateIntroWithAI(
  request: IntroRequest,
  config: AIConfig | null,
  userId: string = 'guest'
): Promise<IntroOutput> {
  let baseIntro: string;

  try {
    // Layer 0 — Deterministic Base (ALWAYS FIRST)
    baseIntro = buildDeterministicIntro(request);

    // Layer 1 — AI Enhancement (Best Effort)
    if (config?.enabled && config?.apiKey) {
      const { intro: aiIntro } = await tryEnhanceWithAI(baseIntro, request, config, userId);

      // validateIntro already called inside tryEnhanceWithAI
      if (aiIntro) {
        return { intro: aiIntro };
      }
    }

    // AI failed or not configured — return Layer 0
    return { intro: baseIntro };

  } catch {
    // Catch-all — return Layer 0
    return { intro: baseIntro! };
  }
}

// =============================================================================
// BATCH API — For Flow.tsx batch intro generation
// =============================================================================

export interface BatchIntroRequest {
  items: Array<{
    id: string;
    request: IntroRequest;
  }>;
  config: AIConfig | null;
  userId?: string;
}

export interface BatchIntroResult {
  results: Map<string, string>;
}

/**
 * Generate batch intros with reliability contract.
 * Returns Layer 0 for ALL items immediately.
 * AI enhancement runs async in background (best-effort).
 */
export function generateBatchIntrosReliable(batch: BatchIntroRequest): BatchIntroResult {
  const results = new Map<string, string>();

  for (const item of batch.items) {
    const output = generateIntroReliable(item.request, batch.config, batch.userId);
    results.set(item.id, output.intro);
  }

  return { results };
}

/**
 * Generate batch intros with synchronous AI (when caller can wait).
 * Still follows reliability contract.
 */
export async function generateBatchIntrosWithAI(
  batch: BatchIntroRequest,
  onProgress?: (current: number, total: number) => void
): Promise<BatchIntroResult> {
  const results = new Map<string, string>();
  const total = batch.items.length;

  for (let i = 0; i < batch.items.length; i++) {
    const item = batch.items[i];
    const output = await generateIntroWithAI(item.request, batch.config, batch.userId);
    results.set(item.id, output.intro);

    onProgress?.(i + 1, total);

    // Rate limit protection — 500ms between AI calls
    if (batch.config?.enabled && i < batch.items.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return { results };
}
