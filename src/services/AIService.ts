/**
 * AI SERVICE — PHASE 4 CANONICALIZED
 *
 * This file is now a thin consumer of introDoctrine.ts.
 * NO prompts defined here. NO templates defined here. NO examples defined here.
 *
 * All intro generation flows through canonical doctrine.
 */

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
// TYPES
// =============================================================================

export type AIProvider = 'azure' | 'openai' | 'anthropic';

export interface AIConfig {
  enabled: boolean;
  provider: AIProvider;
  model: string;
  apiKey: string;
  endpoint?: string;       // Azure only
  deployment?: string;     // Azure only
}

// Intro Source Metadata — Phase 1 (transparent fallback)
export type IntroSource = 'ai' | 'fallback';
export type FallbackReason = 'AI_NOT_CONFIGURED' | 'RATE_LIMITED' | 'VALIDATION_FAILED' | 'AI_ERROR';

export interface IntroResult {
  intro: string;
  source: IntroSource;
  fallbackReason?: FallbackReason;
  attempts?: number;
}

export interface IntroArgs {
  type: 'demand' | 'supply';
  signalDetail: string;
  context: {
    firstName: string;
    company: string;
    contactName?: string;
    contactTitle?: string;
    preSignalContext?: string;
    matchReason?: string;  // PHASE-1 FIX: Neutral "why this match" (e.g., "Industry match")
    // COS (Connector Overlap Statement) — relational copy
    connectorOverlap?: string;  // e.g., "I connect payments teams working closely with advisory firms..."
    supplyRole?: string;        // e.g., "payments product teams"
  };
  connectorMode?: ConnectorMode | null;
  jobSignal?: {
    hasJobPostingUrl?: boolean;
    hasScrapedJobTitle?: boolean;
    openRolesCount?: number;
  };
}

// =============================================================================
// GATE
// =============================================================================

export function AI_ENABLED(cfg: AIConfig | null): boolean {
  return Boolean(cfg?.enabled && cfg?.apiKey && cfg?.model);
}

// =============================================================================
// GREETING HELPER (kept for external use)
// =============================================================================

export function humanGreeting(firstName?: string): { greeting: string; hasName: boolean } {
  const name = firstName?.trim();
  if (name && name.toLowerCase() !== 'there' && name.length > 1) {
    return { greeting: `Hey ${name}`, hasName: true };
  }
  return { greeting: "Hi! Figured I'd reach out", hasName: false };
}

// =============================================================================
// PHASE 4: CANONICAL FALLBACK — routes through introDoctrine
// =============================================================================

function canonicalFallback(args: IntroArgs): string {
  const ctx: IntroContext = {
    firstName: args.context.firstName || 'there',
    company: args.context.company || 'a company',
    contactTitle: args.context.contactTitle,
    preSignalContext: args.context.preSignalContext,
    hasWellfoundData: hasJobEvidence(args.jobSignal),
    // COS (Connector Overlap Statement) — relational copy
    connectorOverlap: args.context.connectorOverlap,
    supplyRole: args.context.supplyRole,
  };

  return composeIntro({
    side: args.type as IntroSide,
    mode: (args.connectorMode as ConnectorMode) || 'b2b_general',
    ctx,
  });
}

// =============================================================================
// SINGLE ENTRY POINT — Returns IntroResult with source metadata
// =============================================================================

export async function generateIntro(
  args: IntroArgs,
  cfg: AIConfig | null,
  userId: string = 'guest'
): Promise<IntroResult> {
  // Gate 1: AI not configured
  if (!AI_ENABLED(cfg)) {
    return {
      intro: canonicalFallback(args),
      source: 'fallback',
      fallbackReason: 'AI_NOT_CONFIGURED',
    };
  }

  // Gate 2: Rate limit
  const limit = userId === 'guest' ? AI_LIMITS.guest : AI_LIMITS.paid;
  if (!allowAICall(userId, limit)) {
    return {
      intro: canonicalFallback(args),
      source: 'fallback',
      fallbackReason: 'RATE_LIMITED',
    };
  }

  // Try AI, fallback on any error
  try {
    const result = await callAIProvider(cfg!, args);

    // PHASE 4: Validate AI output against doctrine
    const ctx: IntroContext = {
      firstName: args.context.firstName || 'there',
      company: args.context.company || 'a company',
      contactTitle: args.context.contactTitle,
      preSignalContext: args.context.preSignalContext,
      hasWellfoundData: hasJobEvidence(args.jobSignal),
      // COS (Connector Overlap Statement) — relational copy
      connectorOverlap: args.context.connectorOverlap,
      supplyRole: args.context.supplyRole,
    };

    const validation = validateIntro(result, ctx);
    if (!validation.valid) {
      console.warn('[AIService] AI output violated doctrine:', validation);
      return {
        intro: canonicalFallback(args),
        source: 'fallback',
        fallbackReason: 'VALIDATION_FAILED',
      };
    }

    return {
      intro: result,
      source: 'ai',
    };
  } catch (e) {
    console.error('[AIService] AI call failed:', e);
    return {
      intro: canonicalFallback(args),
      source: 'fallback',
      fallbackReason: 'AI_ERROR',
    };
  }
}

// =============================================================================
// PROVIDER SWITCH
// =============================================================================

async function callAIProvider(cfg: AIConfig, args: IntroArgs): Promise<string> {
  // PHASE 4: Use canonical prompt from introDoctrine
  const ctx: IntroContext = {
    firstName: args.context.firstName || 'there',
    company: args.context.company || 'a company',
    contactTitle: args.context.contactTitle,
    preSignalContext: args.context.preSignalContext,
    hasWellfoundData: hasJobEvidence(args.jobSignal),
    // COS (Connector Overlap Statement) — relational copy
    connectorOverlap: args.context.connectorOverlap,
    supplyRole: args.context.supplyRole,
  };

  const prompt = buildCanonicalPrompt({
    side: args.type as IntroSide,
    ctx,
    mode: (args.connectorMode as ConnectorMode) || 'b2b_general',
  });

  switch (cfg.provider) {
    case 'azure':
      return callAzure(cfg, prompt);
    case 'openai':
      return callOpenAI(cfg, prompt);
    case 'anthropic':
      return callAnthropic(cfg, prompt);
    default:
      throw new Error('Unsupported provider');
  }
}

// =============================================================================
// HELPER: Job evidence check (for Wellfound factual claims)
// =============================================================================

function hasJobEvidence(jobSignal?: IntroArgs['jobSignal']): boolean {
  if (!jobSignal) return false;
  return Boolean(
    jobSignal.hasJobPostingUrl ||
    jobSignal.hasScrapedJobTitle ||
    (jobSignal.openRolesCount && jobSignal.openRolesCount > 0)
  );
}

// =============================================================================
// PROVIDER ADAPTERS (unchanged — just make API calls)
// =============================================================================

async function callAzure(cfg: AIConfig, prompt: string): Promise<string> {
  const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-proxy`;

  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'azure',
      azureEndpoint: cfg.endpoint,
      azureApiKey: cfg.apiKey,
      azureDeployment: cfg.deployment || cfg.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 150,
      temperature: 0.7,
    }),
  });

  if (!response.ok) throw new Error('Azure call failed');
  const data = await response.json();
  return data.content || '';
}

async function callOpenAI(cfg: AIConfig, prompt: string): Promise<string> {
  const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-proxy`;

  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'openai',
      openaiApiKey: cfg.apiKey,
      model: cfg.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 150,
      temperature: 0.7,
    }),
  });

  if (!response.ok) throw new Error('OpenAI call failed');
  const data = await response.json();
  return data.content || '';
}

async function callAnthropic(cfg: AIConfig, prompt: string): Promise<string> {
  const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-proxy`;

  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'anthropic',
      anthropicApiKey: cfg.apiKey,
      model: cfg.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 150,
      temperature: 0.7,
    }),
  });

  if (!response.ok) throw new Error('Anthropic call failed');
  const data = await response.json();
  return data.content || '';
}

// =============================================================================
// GENERIC AI CALL (for external use — DatasetIntelligence, etc.)
// =============================================================================

export async function callAI(cfg: AIConfig, prompt: string): Promise<string> {
  if (!AI_ENABLED(cfg)) {
    throw new Error('AI not configured');
  }

  const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-proxy`;

  let body: Record<string, unknown>;

  switch (cfg.provider) {
    case 'azure':
      body = {
        provider: 'azure',
        azureEndpoint: cfg.endpoint,
        azureApiKey: cfg.apiKey,
        azureDeployment: cfg.deployment || cfg.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.3,
      };
      break;
    case 'openai':
      body = {
        provider: 'openai',
        openaiApiKey: cfg.apiKey,
        model: cfg.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.3,
      };
      break;
    case 'anthropic':
      body = {
        provider: 'anthropic',
        anthropicApiKey: cfg.apiKey,
        model: cfg.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.3,
      };
      break;
    default:
      throw new Error('Unsupported provider');
  }

  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`AI call failed: ${response.status}`);
  const data = await response.json();
  return data.content || '';
}
