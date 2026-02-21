/**
 * INTRO AI — 3-Block Invariant Template Generation
 *
 * AI fills 1 variable (signalObservation). Code assembles the email from 3 blocks.
 * No free-form writing. Template IS the guardrail.
 *
 * DEMAND: Block 1 (observation) + Block 2 (relevance frame) + Block 3 (connection)
 * SUPPLY: Block 1 (observation) + Block 2 (relevance frame) + Block 3 (action)
 *
 * Block-2 uses deterministic hash rotation (4 variants) to avoid fingerprinting at volume.
 */

import type { DemandRecord } from '../schemas/DemandRecord';
import type { SupplyRecord } from '../schemas/SupplyRecord';
import type { Edge } from '../schemas/Edge';
import { getPackIntroPhrase, getPackDecisionCategory } from '../constants/marketPresets';

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
  // Strip honorific prefixes: Dr., Mr., Mrs., Ms., Prof.
  const stripped = trimmed.replace(/^(Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Prof\.?)\s+/i, '');
  return stripped.split(/\s+/)[0] || trimmed;
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
// BLOCK-2 ROTATION — Deterministic hash, no randomness
// =============================================================================

const BLOCK2_VARIANTS = [
  (x: string) => `Sometimes teams doing this start thinking about ${x}.`,
  (x: string) => `Teams in a similar spot often start exploring ${x}.`,
  (x: string) => `This usually opens up a conversation around ${x}.`,
  (x: string) => `That kind of move tends to bring up ${x}.`,
];

/** djb2 string hash — deterministic, fast, good distribution */
function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return hash;
}

/** Select Block-2 variant via deterministic hash. Same company+pack = same phrasing always. */
function selectBlock2(decisionCategory: string, companyDomain: string, packId: string): string {
  const idx = Math.abs(djb2Hash(companyDomain + '|' + packId)) % BLOCK2_VARIANTS.length;
  return BLOCK2_VARIANTS[idx](decisionCategory);
}

// =============================================================================
// SIGNAL OBSERVATION PROMPT — shared by both demand + supply
// =============================================================================

function buildSignalObservationPrompt(
  demand: DemandRecord,
  edge: Edge,
): string {
  const demandIndustry = demand.industry || 'unknown';
  const demandDesc = (demand.metadata.companyDescription || demand.metadata.description || '').slice(0, 200) || 'n/a';

  return `Fill 1 variable. JSON only.

TEMPLATE: "saw you're [signalObservation]"

CONTEXT:
Industry: ${demandIndustry}
Description: ${demandDesc}

SIGNAL: ${edge.evidence || 'active in market'}

RULES:
[signalObservation]: what the company is doing (present continuous). 3-8 words. No word "role". NEVER say "hiring new employees" — too generic. Use the industry/description to make it specific: "scaling the consulting team", "building out the engineering org", "expanding operations". Must read naturally after "saw you're". Examples: "scaling the engineering team", "building out the sales org", "expanding into new markets", "growing the clinical team".

{"signalObservation": "..."}`;
}

// =============================================================================
// DEMAND VARIABLE PROMPT — LEGACY FALLBACK (non-pack records only)
// =============================================================================

function buildDemandVarsPromptLegacy(
  demand: DemandRecord,
  supply: SupplyRecord,
  edge: Edge,
): string {
  const demandIndustry = demand.industry || 'unknown';
  const demandDesc = (demand.metadata.companyDescription || demand.metadata.description || '').slice(0, 200) || 'n/a';
  const supplyDesc = (supply.metadata?.companyDescription || supply.metadata?.description || '').slice(0, 400);

  return `Fill 2 variables. JSON only.

TEMPLATE: "Saw [COMPANY] [signalObservation]. I'm connected to [whoTheyAre] — want an intro?"

DEMAND CONTEXT:
Industry: ${demandIndustry}
Description: ${demandDesc}

SUPPLY: ${supply.capability || 'business services'}${supplyDesc ? ` — ${supplyDesc}` : ''}
SIGNAL: ${edge.evidence || 'active in market'}

RULES:

[signalObservation]: what the company is doing (present continuous). 3-8 words. No word "role". NEVER say "hiring new employees" — too generic. Examples: "scaling the engineering team", "building out the sales org".

[whoTheyAre]:
Describe what the supplier ENABLES companies with this SIGNAL to achieve faster or better.
MUST be a team/firm/group of people (not product/software).
No "a/an". No "solutions/optimize/leverage/software/platform/tool".

{"signalObservation": "...", "whoTheyAre": "..."}`;
}

// =============================================================================
// ASSEMBLE FINAL EMAILS (deterministic — AI never touches these)
// =============================================================================

/**
 * 3-Block Demand Intro:
 *   Block 1: "Hey {name} — saw you're {signalObservation}."
 *   Block 2: "{relevance frame with decisionCategory}" (hash-rotated)
 *   Block 3: "I know someone at {supplyCompany} who works in that area.\n\nHappy to connect if useful."
 */
function assembleDemandIntro(
  firstName: string,
  signalObservation: string,
  block2: string,
): string {
  const name = (!firstName || firstName === 'there' || firstName === 'Decision')
    ? 'there' : firstName;

  return `Hey ${name} — saw you're ${signalObservation}.\n\n${block2}\n\nI know someone at a firm that works in that area.\n\nHappy to connect if useful.`;
}

/**
 * 3-Block Supply Intro:
 *   Block 1: "Hey {name} —\n\nI'm seeing {plurality} {signalObservation} right now."
 *   Block 2: "{relevance frame with decisionCategory}" (hash-rotated)
 *   Block 3: "Want me to connect you?"
 */
function assembleSupplyIntro(
  firstName: string,
  signalObservation: string,
  block2: string,
  matchCount: number,
): string {
  const name = (!firstName || firstName === 'there' || firstName === 'Contact')
    ? 'there' : firstName;
  const plurality = matchCount > 1 ? 'a few companies' : 'a company';

  return `Hey ${name} —\n\nI'm seeing ${plurality} ${signalObservation} right now.\n\n${block2}\n\nWant me to connect you if helpful?`;
}

/**
 * Legacy assembly for non-pack records (no decisionCategory available).
 * Falls back to old 2-variable template.
 */
function assembleDemandIntroLegacy(
  firstName: string,
  companyName: string,
  vars: { signalObservation: string; whoTheyAre: string },
): string {
  const name = (!firstName || firstName === 'there' || firstName === 'Decision')
    ? 'there' : firstName;
  const company = cleanCompanyName(companyName);
  const article = aOrAn(vars.whoTheyAre);
  return `Hey ${name} —\n\nSaw ${company} ${vars.signalObservation}. I'm connected to ${article} ${vars.whoTheyAre}.\n\nWorth a chat?`;
}

function assembleSupplyIntroLegacy(
  firstName: string,
  vars: { dreamICP: string; painTheySolve: string },
): string {
  const name = (!firstName || firstName === 'there' || firstName === 'Contact')
    ? 'there' : firstName;
  return `Hey ${name} —\n\nNot sure how many people are on your waiting list, but I got a couple ${vars.dreamICP} who need ${vars.painTheySolve}\n\nLet me know`;
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
 * Generate intros using 3-block invariant templates.
 *
 * Pack records: 1 AI call (signalObservation only). Everything else curated.
 * Non-pack records: 2 AI calls (legacy path).
 */
export async function generateIntrosAI(
  config: IntroAIConfig,
  demand: DemandRecord,
  supply: SupplyRecord,
  edge: Edge,
  matchCount?: number,
): Promise<GeneratedIntros> {
  const demandFirstName = extractFirstName(demand.contact);
  const supplyFirstName = extractFirstName(supply.contact);
  const packId = (supply.metadata as any)?.packId || null;
  const decisionCategory = getPackDecisionCategory(packId);

  // ── 3-BLOCK PATH (pack records with decisionCategory) ──
  if (decisionCategory) {
    console.log('[IntroAI] 3-block path:', { packId, decisionCategory });

    // Single AI call — only need signalObservation
    const prompt = buildSignalObservationPrompt(demand, edge);
    const raw = await callAI(config, prompt);

    let signalObservation: string;
    try {
      const parsed = parseJSON(raw);
      signalObservation = parsed.signalObservation || 'making moves';
    } catch {
      console.error('[IntroAI] signalObservation parse error:', raw.slice(0, 200));
      signalObservation = 'making moves';
    }

    // Block 2 — deterministic hash rotation
    const companyDomain = demand.domain || demand.company || '';
    const block2 = selectBlock2(decisionCategory, companyDomain, packId);

    console.log('[IntroAI] 3-block vars:', {
      signalObservation,
      decisionCategory,
      block2Variant: Math.abs(djb2Hash(companyDomain + '|' + packId)) % 4,
      supplyCompany: supply.company,
    });

    // Assemble — deterministic, no AI
    const demandIntro = assembleDemandIntro(
      demandFirstName,
      signalObservation,
      block2,
    );
    const supplyIntro = assembleSupplyIntro(
      supplyFirstName,
      signalObservation,
      block2,
      matchCount ?? 2,
    );

    return {
      demandIntro,
      supplyIntro,
      valueProps: {
        demandValueProp: `${signalObservation} → ${decisionCategory}`,
        supplyValueProp: `${decisionCategory} (3-block)`,
      },
    };
  }

  // ── LEGACY PATH (non-pack records, no decisionCategory) ──
  console.log('[IntroAI] Legacy path (no pack)');
  const introPhrase = getPackIntroPhrase(packId);

  const observationPrompt = buildSignalObservationPrompt(demand, edge);
  const legacyPrompt = buildDemandVarsPromptLegacy(demand, supply, edge);

  const [observationRaw, legacyRaw] = await Promise.all([
    callAI(config, observationPrompt),
    callAI(config, legacyPrompt),
  ]);

  // Parse signalObservation for supply
  let signalObs: string;
  try {
    signalObs = parseJSON(observationRaw).signalObservation || 'making moves';
  } catch {
    signalObs = 'making moves';
  }

  // Parse legacy demand vars
  let demandVars: { signalObservation: string; whoTheyAre: string };
  try {
    const parsed = parseJSON(legacyRaw);
    demandVars = {
      signalObservation: parsed.signalObservation || signalObs,
      whoTheyAre: introPhrase?.asEntity || stripLeadingArticle(parsed.whoTheyAre || ''),
    };
  } catch {
    demandVars = {
      signalObservation: signalObs,
      whoTheyAre: introPhrase?.asEntity || `${supply.capability || 'services'} firm`,
    };
  }

  // Supply legacy vars — use signalObservation + curated or AI
  const supplyVars = {
    dreamICP: `${demand.industry || 'companies'} in your space`.toLowerCase(),
    painTheySolve: introPhrase?.asNeed || edge.evidence || 'what they need right now',
  };

  const demandIntro = assembleDemandIntroLegacy(demandFirstName, demand.company, demandVars);
  const supplyIntro = assembleSupplyIntroLegacy(supplyFirstName, supplyVars);

  return {
    demandIntro,
    supplyIntro,
    valueProps: {
      demandValueProp: `${demandVars.signalObservation} → ${demandVars.whoTheyAre}`,
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
