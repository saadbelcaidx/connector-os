/**
 * AI SERVICE — PHASE 4 CANONICALIZED
 *
 * This file is now a thin consumer of introDoctrine.ts.
 * NO prompts defined here. NO templates defined here. NO examples defined here.
 *
 * All intro generation flows through canonical doctrine.
 */

import { allowAICall, AI_LIMITS } from './aiRateLimit';
import { composeIntroWithEdge } from '../edge';
import type { IntroSide, IntroContext, Match } from '../edge';

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
  connectorMode?: string | null;
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
// PHASE 7: EDGE-BASED FALLBACK — routes through edge module
// =============================================================================

function mapToEdgeMode(mode?: string | null): string {
  if (!mode) return 'b2b_broad';
  const mapping: Record<string, string> = {
    'recruiting': 'recruitment',
    'biotech_licensing': 'biotech',
    'wealth_management': 'wealth_management',
    'real_estate_capital': 'real_estate',
    'enterprise_partnerships': 'b2b_broad',
    'logistics': 'logistics',
    'crypto': 'crypto',
    'b2b_general': 'b2b_broad',
  };
  return mapping[mode] || 'b2b_broad';
}

function canonicalFallback(args: IntroArgs): string {
  const ctx: IntroContext = {
    firstName: args.context.firstName || 'there',
    company: args.context.company || 'a company',
    summary: null, // No validated summary = neutral fallback
  };

  const match: Match = {
    mode: mapToEdgeMode(args.connectorMode),
    demand: { domain: 'unknown', summary: null },
    supply: { domain: 'unknown', summary: null },
    edge: null, // No edge = PROBE intro (safe, permission-asking)
  };

  const result = composeIntroWithEdge(args.type as IntroSide, match, ctx);
  return result.intro || '';
}

// =============================================================================
// SINGLE ENTRY POINT — Returns IntroResult with source metadata
// =============================================================================

export async function generateIntro(
  args: IntroArgs,
  cfg: AIConfig | null,
  userId: string = 'guest'
): Promise<IntroResult> {
  // DETERMINISTIC ONLY: No AI, just fill-in-the-blank templates
  return {
    intro: canonicalFallback(args),
    source: 'fallback',
    fallbackReason: 'AI_NOT_CONFIGURED',
  };
}

// =============================================================================
// PROVIDER ADAPTERS (kept for reply-brain and other AI features)
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
