/**
 * AI SERVICE — Intro Generation Only
 *
 * Single entry point. Silent fallback. No retries.
 */

import { allowAICall, AI_LIMITS } from './aiRateLimit';

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

export interface IntroArgs {
  type: 'demand' | 'supply';
  signalDetail: string;
  context: {
    firstName: string;
    company: string;
    contactName?: string;
    contactTitle?: string;
  };
}

// =============================================================================
// GATE
// =============================================================================

export function AI_ENABLED(cfg: AIConfig | null): boolean {
  return Boolean(cfg?.enabled && cfg?.apiKey && cfg?.model);
}

// =============================================================================
// GREETING HELPER
// =============================================================================

/**
 * Human greeting - never "Hey there"
 */
export function humanGreeting(firstName?: string): { greeting: string; hasName: boolean } {
  const name = firstName?.trim();
  if (name && name.toLowerCase() !== 'there' && name.length > 1) {
    return { greeting: `Hey ${name}`, hasName: true };
  }
  return { greeting: "Hi! Figured I'd reach out", hasName: false };
}

// =============================================================================
// FALLBACK (AUTHORITATIVE)
// =============================================================================

function templateFallback({ type, signalDetail, context }: IntroArgs): string {
  const signal = signalDetail || 'showing momentum';
  const { greeting } = humanGreeting(context.firstName);

  if (type === 'demand') {
    return `${greeting} — ${context.company} is ${signal}. I know someone who does this. Want an intro?`;
  }

  // supply
  const contactPhrase = context.contactName && context.contactName !== 'the decision maker'
    ? `${context.contactName} is running point.`
    : '';
  return `${greeting} — got a lead. ${context.company} is ${signal}. ${contactPhrase} Worth a look?`.replace(/\s+/g, ' ').trim();
}

// =============================================================================
// SINGLE ENTRY POINT
// =============================================================================

export async function generateIntro(
  args: IntroArgs,
  cfg: AIConfig | null,
  userId: string = 'guest'
): Promise<string> {
  // Gate 1: AI not configured
  if (!AI_ENABLED(cfg)) {
    return templateFallback(args);
  }

  // Gate 2: Rate limit
  const limit = userId === 'guest' ? AI_LIMITS.guest : AI_LIMITS.paid;
  if (!allowAICall(userId, limit)) {
    return templateFallback(args);
  }

  // Try AI, fallback on any error
  try {
    return await callAIProvider(cfg!, args);
  } catch {
    return templateFallback(args);
  }
}

// =============================================================================
// PROVIDER SWITCH
// =============================================================================

async function callAIProvider(cfg: AIConfig, args: IntroArgs): Promise<string> {
  const prompt = buildIntroPrompt(args);

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
// PROMPT
// =============================================================================

function buildIntroPrompt(args: IntroArgs): string {
  const { type, signalDetail, context } = args;
  const signal = signalDetail || 'showing momentum';

  if (type === 'demand') {
    return `Write a 2-sentence intro for ${context.firstName} at ${context.company}.

Signal: ${signal}

FORMULA:
"Hey [Name] — [company] is [signal]. I know someone who does this. Want an intro?"

RULES:
- Exactly 2 sentences
- Never explain who the provider is
- Keep signal to 3-5 words

Output the intro only.`;
  }

  // supply
  const contactLine = context.contactName && context.contactName !== 'the decision maker'
    ? `Decision maker: ${context.contactName}${context.contactTitle ? `, ${context.contactTitle}` : ''}`
    : '';

  return `Write a 2-sentence intro offering ${context.firstName} a lead.

Lead: ${context.company} is ${signal}
${contactLine}

FORMULA:
"Hey [Name] — got a lead. [Company] is [signal]. [Contact] is running it. Interested?"

RULES:
- Exactly 2-3 sentences
- Start with "Hey [Name] — got a lead."
- End with "Interested?" or "Worth a look?"

Output the intro only.`;
}

// =============================================================================
// PROVIDER ADAPTERS
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
// GENERIC AI CALL (for external use)
// =============================================================================

/**
 * Generic AI call for any prompt. Used by DatasetIntelligence for niche detection.
 */
export async function callAI(cfg: AIConfig, prompt: string): Promise<string> {
  if (!AI_ENABLED(cfg)) {
    throw new Error('AI not configured');
  }

  const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-proxy`;

  let body: Record<string, any>;

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
