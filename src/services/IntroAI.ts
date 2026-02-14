/**
 * INTRO AI — Variable-Fill Template Generation
 *
 * AI fills 2-3 tight variables. Code assembles the email. No free-form writing.
 * Based on proven operator template: 8 meetings/week, $2M/yr.
 *
 * SUPPLY: "Not sure how many people are on your waiting list, but I got a couple
 *          [dreamICP] who are looking for [painTheySolve]"
 *
 * DEMAND: "Saw {{company}} [signalEvent]. I'm connected to [whoTheyAre]"
 *
 * AI calls: 2 (parallel). No retries. No banned word lists. Template IS the guardrail.
 */

import type { DemandRecord } from '../schemas/DemandRecord';
import type { SupplyRecord } from '../schemas/SupplyRecord';
import type { Edge } from '../schemas/Edge';

// =============================================================================
// TYPES
// =============================================================================

export interface IntroAIConfig {
  provider: 'openai' | 'anthropic' | 'azure';
  apiKey: string;
  model?: string;
  azureEndpoint?: string;
  azureDeployment?: string;
  openaiApiKeyFallback?: string;
}

export interface ValueProps {
  demandValueProp: string;
  supplyValueProp: string;
}

export interface GeneratedIntros {
  demandIntro: string;
  supplyIntro: string;
  valueProps: ValueProps;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Clean company name: ALL CAPS → Title Case, remove legal suffixes.
 */
function cleanCompanyName(name: string): string {
  if (!name) return name;
  let cleaned = name.trim();

  const lettersOnly = cleaned.replace(/[^a-zA-Z]/g, '');
  const uppercaseCount = (lettersOnly.match(/[A-Z]/g) || []).length;
  const isAllCaps = lettersOnly.length > 3 && uppercaseCount / lettersOnly.length > 0.8;

  if (isAllCaps) {
    const acronyms = new Set(['LP', 'LLC', 'LLP', 'GP', 'INC', 'CORP', 'LTD', 'CO', 'USA', 'UK', 'NYC', 'LA', 'SF', 'AI', 'ML', 'IT', 'HR', 'VP', 'CEO', 'CFO', 'CTO', 'COO', 'RIA', 'AUM', 'PE', 'VC']);
    cleaned = cleaned
      .toLowerCase()
      .split(/(\s+)/)
      .map(word => {
        const upper = word.toUpperCase();
        if (acronyms.has(upper)) return upper;
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join('');
  }

  cleaned = cleaned.replace(/,?\s*(llc|l\.l\.c\.|inc\.?|corp\.?|corporation|ltd\.?|limited|co\.?|company|pllc|lp|l\.p\.|llp|l\.l\.p\.)\s*$/i, '').trim();
  return cleaned;
}

function extractFirstName(fullName: string): string {
  const trimmed = (fullName || '').trim();
  if (!trimmed) return 'there';
  return trimmed.split(/\s+/)[0] || trimmed;
}

/** "a" or "an" based on first character of the next word */
function aOrAn(word: string): string {
  if (!word) return 'a';
  return /^[aeiou]/i.test(word.trim()) ? 'an' : 'a';
}

/**
 * Strip leading articles ("a ", "an ", "the ") from AI-returned variables.
 * The template adds its own article via aOrAn() — double articles = grammar error.
 * Example: AI returns "a business consultancy" → stripped to "business consultancy"
 *          → template: "I'm connected to a business consultancy" (correct)
 */
function stripLeadingArticle(s: string): string {
  return s.replace(/^(a |an |the )/i, '').trim();
}

function parseJSON(raw: string): any {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

// =============================================================================
// SUPPLY VARIABLE PROMPT
// =============================================================================

function buildSupplyVarsPrompt(
  demand: DemandRecord,
  edge: Edge,
): string {
  const desc = (demand.metadata.companyDescription || demand.metadata.description || '').slice(0, 400);
  const funding = demand.metadata.fundingUsd
    ? `$${(demand.metadata.fundingUsd / 1000000).toFixed(0)}M raised`
    : '';

  return `Fill variables for a cold email. JSON only.

TEMPLATE: "I got a couple [dreamICP] who are looking for [painTheySolve]"

DATA:
- Signal: ${edge.evidence || 'active in market'}
- Industry: ${demand.industry || 'general'}
- Description: ${desc}
${funding ? `- Funding: ${funding}\n` : ''}
RULES:
- [dreamICP]: plural noun phrase describing the demand company type + vertical. 3-6 words. No "decision-makers"/"stakeholders"/"organizations".
- [painTheySolve]: what they need, from the signal data. Human language. 3-8 words. No "optimize"/"leverage"/"streamline"/"solutions".
- Both must sound like how you'd talk at a bar, not a boardroom.

{"dreamICP": "...", "painTheySolve": "..."}`;
}

// =============================================================================
// DEMAND VARIABLE PROMPT
// =============================================================================

function buildDemandVarsPrompt(
  demand: DemandRecord,
  supply: SupplyRecord,
  edge: Edge,
): string {
  const supplyDesc = (supply.metadata?.companyDescription || supply.metadata?.description || '').slice(0, 400);
  const demandIndustry = demand.industry || 'unknown';
  const demandDesc = (demand.metadata.companyDescription || demand.metadata.description || '').slice(0, 200) || 'n/a';

  return `Fill 2 variables. JSON only.

TEMPLATE: "Saw {{company}} [signalEvent]. I'm connected to [whoTheyAre] — want an intro?"

DEMAND CONTEXT:
Industry: ${demandIndustry}
Description: ${demandDesc}

SUPPLY: ${supply.capability || 'business services'}${supplyDesc ? ` — ${supplyDesc}` : ''}
SIGNAL: ${edge.evidence || 'active in market'}

RULES:

[signalEvent]: casual fragment completing "Saw {{company}}...". 3–8 words. No word "role". If signal says "hiring X", say "is hiring X" or "just posted for X".

[whoTheyAre]:
Describe what the supplier ENABLES companies with this SIGNAL to achieve faster or better.
Do NOT describe what the supplier is. Describe what they help the company accomplish.
MUST be a team/firm/group of people (not product/software).
Tie capability to the SIGNAL pressure — focus on speed, capacity, or execution improvement.
Prefer the more specific industry term if available in DEMAND CONTEXT.
No "a/an". No "solutions/optimize/leverage/software/platform/tool".
No generic restatement of SUPPLY.
No temporal padding: "during growth", "during hiring surges", "as companies scale".
No consultant language: "scaling", "digital transformation", "optimization".

Good: "recruiting team that helps fintech companies fill engineering roles faster"
Good: "engineering partner teams use when product demand outpaces hiring"
Good: "team companies use when internal recruiting can't keep up"
Bad: "technology firm specializing in digital automation"
Bad: "staffing company for growing businesses"

{"signalEvent": "...", "whoTheyAre": "..."}`;
}

// =============================================================================
// ASSEMBLE FINAL EMAILS (deterministic — AI never touches these)
// =============================================================================

function assembleSupplyIntro(
  firstName: string,
  vars: { dreamICP: string; painTheySolve: string },
): string {
  const name = (!firstName || firstName === 'there' || firstName === 'Contact')
    ? 'there' : firstName;

  return `Hey ${name}\n\nNot sure how many people are on your waiting list, but I got a couple ${vars.dreamICP} who are looking for ${vars.painTheySolve}\n\nWorth an intro?`;
}

function assembleDemandIntro(
  firstName: string,
  companyName: string,
  vars: { signalEvent: string; whoTheyAre: string },
): string {
  const name = (!firstName || firstName === 'there' || firstName === 'Decision')
    ? 'there' : firstName;
  const company = cleanCompanyName(companyName);
  const article = aOrAn(vars.whoTheyAre);

  return `Hey ${name}\n\nSaw ${company} ${vars.signalEvent}. I'm connected to ${article} ${vars.whoTheyAre}\n\nWant an intro?`;
}

// =============================================================================
// AI PROVIDER CALLS
// =============================================================================

async function callOpenAI(config: IntroAIConfig, prompt: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 200,
    }),
  });

  if (!response.ok) throw new Error(`OpenAI error: ${response.status}`);
  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

async function callAnthropic(config: IntroAIConfig, prompt: string): Promise<string> {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

  const response = await fetch(`${supabaseUrl}/functions/v1/ai-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      provider: 'anthropic',
      anthropicApiKey: config.apiKey,
      model: config.model || 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic error: ${response.status} - ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  return data.content || '';
}

async function callAzure(config: IntroAIConfig, prompt: string): Promise<string> {
  if (!config.azureEndpoint || !config.azureDeployment) {
    throw new Error('Azure endpoint and deployment required');
  }

  const url = `${config.azureEndpoint}/openai/deployments/${config.azureDeployment}/chat/completions?api-version=2024-02-15-preview`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': config.apiKey,
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[IntroAI] Azure error body:', errorBody);

    if (response.status === 400 && errorBody.toLowerCase().includes('content_filter')) {
      console.error('[IntroAI] AZURE_CONTENT_FILTER_BLOCK detected');
      throw new Error('AZURE_CONTENT_FILTER_BLOCK');
    }

    throw new Error(`Azure error: ${response.status} - ${errorBody.slice(0, 200)}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

export async function callAI(config: IntroAIConfig, prompt: string): Promise<string> {
  switch (config.provider) {
    case 'openai':
      return callOpenAI(config, prompt);
    case 'anthropic':
      return callAnthropic(config, prompt);
    case 'azure':
      try {
        return await callAzure(config, prompt);
      } catch (err) {
        if (err instanceof Error && err.message === 'AZURE_CONTENT_FILTER_BLOCK') {
          if (!config.openaiApiKeyFallback) {
            console.error('[IntroAI] Azure content filter blocked, no OpenAI fallback key configured');
            throw new Error('AZURE_CONTENT_FILTER_BLOCK: Configure OpenAI API key in Settings as fallback');
          }
          console.log('[IntroAI] Azure content filter triggered, falling back to OpenAI');
          return await callOpenAI({
            provider: 'openai',
            apiKey: config.openaiApiKeyFallback,
            model: 'gpt-4o-mini',
          }, prompt);
        }
        throw err;
      }
    default:
      throw new Error(`Unknown AI provider: ${config.provider}`);
  }
}

// =============================================================================
// MAIN EXPORT: VARIABLE-FILL GENERATION
// =============================================================================

/**
 * Generate intros by filling template variables (2 parallel AI calls).
 *
 * Supply template: proven 8-meeting/week operator template.
 * Demand template: mirror — anonymous supplier, signal-driven.
 *
 * AI fills tight variables. Code assembles the email. No free-form writing.
 */
export async function generateIntrosAI(
  config: IntroAIConfig,
  demand: DemandRecord,
  supply: SupplyRecord,
  edge: Edge
): Promise<GeneratedIntros> {
  const demandFirstName = extractFirstName(demand.contact);
  const supplyFirstName = extractFirstName(supply.contact);

  // Two AI calls in parallel — they're independent
  console.log('[IntroAI] Filling template variables (2 parallel calls)...');
  const [supplyVarsRaw, demandVarsRaw] = await Promise.all([
    callAI(config, buildSupplyVarsPrompt(demand, edge)),
    callAI(config, buildDemandVarsPrompt(demand, supply, edge)),
  ]);

  // Parse supply variables
  let supplyVars: { dreamICP: string; painTheySolve: string };
  try {
    supplyVars = parseJSON(supplyVarsRaw);
  } catch {
    console.error('[IntroAI] Supply vars parse error:', supplyVarsRaw.slice(0, 200));
    supplyVars = {
      dreamICP: `${demand.industry || 'companies'} in your space`.toLowerCase(),
      painTheySolve: edge.evidence || 'what they need right now',
    };
  }

  // Parse demand variables
  let demandVars: { signalEvent: string; whoTheyAre: string };
  try {
    const parsed = parseJSON(demandVarsRaw);
    demandVars = {
      signalEvent: parsed.signalEvent || 'is making moves',
      whoTheyAre: stripLeadingArticle(parsed.whoTheyAre || ''),
    };
  } catch {
    console.error('[IntroAI] Demand vars parse error:', demandVarsRaw.slice(0, 200));
    demandVars = {
      signalEvent: 'is making moves',
      whoTheyAre: `${supply.capability || 'services'} firm`,
    };
  }

  console.log('[IntroAI] Variables filled:', {
    supply: supplyVars,
    demand: demandVars,
  });

  // Assemble emails — deterministic, no AI
  const supplyIntro = assembleSupplyIntro(supplyFirstName, supplyVars);
  const demandIntro = assembleDemandIntro(demandFirstName, demand.company, demandVars);

  return {
    demandIntro,
    supplyIntro,
    valueProps: {
      demandValueProp: `${demandVars.signalEvent} → ${demandVars.whoTheyAre}`,
      supplyValueProp: `${supplyVars.dreamICP} looking for ${supplyVars.painTheySolve}`,
    },
  };
}

// =============================================================================
// BATCH GENERATION
// =============================================================================

export interface BatchIntroItem {
  id: string;
  demand: DemandRecord;
  supply: SupplyRecord;
  edge: Edge;
}

export interface BatchIntroResult {
  id: string;
  demandIntro: string;
  supplyIntro: string;
  valueProps: ValueProps;
  error?: string;
  source: 'ai' | 'ai-fallback';
}

export async function generateIntrosBatch(
  config: IntroAIConfig,
  items: BatchIntroItem[],
  onProgress?: (current: number, total: number) => void
): Promise<BatchIntroResult[]> {
  const results: BatchIntroResult[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.(i + 1, items.length);

    try {
      const intros = await generateIntrosAI(config, item.demand, item.supply, item.edge);
      results.push({
        id: item.id,
        demandIntro: intros.demandIntro,
        supplyIntro: intros.supplyIntro,
        valueProps: intros.valueProps,
        source: 'ai',
      });
    } catch (e) {
      console.error(`[IntroAI] Failed for ${item.id}:`, e);
      results.push({
        id: item.id,
        demandIntro: '',
        supplyIntro: '',
        valueProps: { demandValueProp: '', supplyValueProp: '' },
        source: 'ai-fallback',
        error: e instanceof Error ? e.message : 'AI generation failed',
      });
    }
  }

  return results;
}

export async function generateIntrosBatchParallel(
  config: IntroAIConfig,
  items: BatchIntroItem[],
  concurrency: number = 5,
  onProgress?: (current: number, total: number) => void
): Promise<BatchIntroResult[]> {
  const results: BatchIntroResult[] = new Array(items.length);
  let completed = 0;

  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);

    const chunkResults = await Promise.all(
      chunk.map(async (item, idx) => {
        try {
          const intros = await generateIntrosAI(config, item.demand, item.supply, item.edge);
          return {
            index: i + idx,
            result: {
              id: item.id,
              demandIntro: intros.demandIntro,
              supplyIntro: intros.supplyIntro,
              valueProps: intros.valueProps,
              source: 'ai',
            } as BatchIntroResult,
          };
        } catch (e) {
          console.error(`[IntroAI] Failed for ${item.id}:`, e);
          return {
            index: i + idx,
            result: {
              id: item.id,
              demandIntro: '',
              supplyIntro: '',
              valueProps: { demandValueProp: '', supplyValueProp: '' },
              source: 'ai-fallback',
              error: e instanceof Error ? e.message : 'AI generation failed',
            } as BatchIntroResult,
          };
        }
      })
    );

    for (const { index, result } of chunkResults) {
      results[index] = result;
      completed++;
      onProgress?.(completed, items.length);
    }
  }

  return results;
}
