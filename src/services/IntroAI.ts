/**
 * INTRO AI — Variable-Fill Template Generation
 *
 * AI fills 2-3 tight variables. Code assembles the email. No free-form writing.
 * Based on proven operator template: 8 meetings/week, $2M/yr.
 *
 * SUPPLY: "Not sure how many people are on your waiting list, but I got a couple
 *          [dreamICP] who are looking for [painTheySolve]"
 *
 * DEMAND: "Saw {{company}} [signalEvent]. Know someone who might help—[whoTheyAre]"
 *
 * AI calls: 2 (parallel). No retries. No banned word lists. Template IS the guardrail.
 */

import type { DemandRecord } from '../schemas/DemandRecord';
import type { SupplyRecord } from '../schemas/SupplyRecord';
import type { Edge } from '../schemas/Edge';
import { getPackIntroPhrase } from '../constants/marketPresets';

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

/**
 * Strip leading gerund from painTheySolve.
 * Template: "looking for [painTheySolve]" — if AI returns "finding X",
 * result is "looking for finding X" (double gerund). Strip it.
 */
function stripLeadingGerund(s: string): string {
  return s.replace(/^(finding|getting|hiring|scaling|building|growing|filling|sourcing|securing|seeking|staffing|recruiting|identifying|locating|acquiring|obtaining|managing)\s+/i, '').trim();
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
  supply: SupplyRecord,
  edge: Edge,
  curatedAsNeed?: string,
): string {
  const desc = (demand.metadata.companyDescription || demand.metadata.description || '').slice(0, 400);
  const funding = demand.metadata.fundingUsd
    ? `$${(demand.metadata.fundingUsd / 1000000).toFixed(0)}M raised`
    : '';

  // If we have a curated asNeed, only ask AI for dreamICP (simpler prompt, less room to genericize)
  if (curatedAsNeed) {
    return `Fill 1 variable for a cold email. JSON only.

CONTEXT: You are writing TO a SUPPLY company (service provider).
The demand company is the buyer with the signal.

TEMPLATE: "I got a couple [dreamICP] who are looking for ${curatedAsNeed}"

DATA:
- Signal: ${edge.evidence || 'active in market'}
- Industry: ${demand.industry || 'general'}
- Description: ${desc}
${funding ? `- Funding: ${funding}\n` : ''}
RULES:
- [dreamICP]: plural noun phrase describing the demand company type + vertical. 3-6 words. No "decision-makers"/"stakeholders"/"organizations".
- If signal mentions facilities/new location/expansion, interpret as "team scaling" unless context says otherwise.
- Sound like how you'd talk at a bar, not a boardroom.

{"dreamICP": "..."}`;
  }

  return `Fill variables for a cold email. JSON only.

CONTEXT: You are writing TO a SUPPLY company (service provider).
The demand company is the buyer with the signal.
SUPPLY (who receives this email): ${supply.capability || 'service provider'}

TEMPLATE: "I got a couple [dreamICP] who are looking for [painTheySolve]"

DATA:
- Signal: ${edge.evidence || 'active in market'}
- Industry: ${demand.industry || 'general'}
- Description: ${desc}
${funding ? `- Funding: ${funding}\n` : ''}
RULES:
- [dreamICP]: plural noun phrase describing the demand company type + vertical. 3-6 words. No "decision-makers"/"stakeholders"/"organizations".
- [painTheySolve]: what demand companies need FROM this supply provider. Frame around the supply's capability — not a generic assumption. 3-8 words. No "optimize"/"leverage"/"streamline"/"solutions".
- DO NOT infer what the supply company does from description. Use ONLY the provided supply capability field above.
- If signal mentions facilities/new location/expansion, interpret as "team scaling" unless supply capability is explicitly facilities/real estate.
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
  curatedAsEntity?: string,
): string {
  const demandIndustry = demand.industry || 'unknown';
  const demandDesc = (demand.metadata.companyDescription || demand.metadata.description || '').slice(0, 200) || 'n/a';

  // If we have a curated asEntity, only ask AI for signalEvent
  if (curatedAsEntity) {
    return `Fill 1 variable. JSON only.

TEMPLATE: "Saw [COMPANY] [signalEvent]. Know someone who might help—${aOrAn(curatedAsEntity)} ${curatedAsEntity}"

DEMAND CONTEXT:
Industry: ${demandIndustry}
Description: ${demandDesc}

SIGNAL: ${edge.evidence || 'active in market'}

RULES:
[signalEvent]: what happened (present tense). 3-8 words. No word "role". NEVER say "hiring new employees" — too generic. Use the industry/description to make it specific: "is scaling their consulting team", "is building out their leadership bench", "is growing the team". If signal mentions expanding/facilities/new location, interpret as business growth. Examples: "is scaling their engineering team", "just raised Series B", "is building out their sales org".

{"signalEvent": "..."}`;
  }

  const supplyDesc = (supply.metadata?.companyDescription || supply.metadata?.description || '').slice(0, 400);

  return `Fill 2 variables. JSON only.

TEMPLATE: "Saw [COMPANY] [signalEvent]. I'm connected to [whoTheyAre] — want an intro?"

DEMAND CONTEXT:
Industry: ${demandIndustry}
Description: ${demandDesc}

SUPPLY: ${supply.capability || 'business services'}${supplyDesc ? ` — ${supplyDesc}` : ''}
SIGNAL: ${edge.evidence || 'active in market'}

RULES:

[signalEvent]: what happened (present tense). 3–8 words. No word "role". NEVER say "hiring new employees" — too generic. Use the industry/description to make it specific: "is scaling their consulting team", "is building out their leadership bench", "is growing the team". If signal mentions expanding/facilities/new location, interpret as business growth unless supply capability is explicitly facilities/real estate. Examples: "is scaling their engineering team", "just raised Series B", "is building out their sales org".

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

  return `Hey ${name}—\n\nNot sure how many people are on your waiting list, but I got a couple ${vars.dreamICP} who need ${vars.painTheySolve}\n\nLet me know`;
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
  return `Hey ${name}—\n\nSaw ${company} ${vars.signalEvent}. Know someone who might help—${article} ${vars.whoTheyAre}\n\nWorth a chat?`;
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

  // Resolve curated intro phrases — bypass AI for curated slots
  const packId = (supply.metadata as any)?.packId || null;
  const introPhrase = getPackIntroPhrase(packId);

  console.log('[IntroAI] introPhrase resolve:', {
    packId,
    hasCurated: !!introPhrase,
    asNeed: introPhrase?.asNeed?.slice(0, 60),
    asEntity: introPhrase?.asEntity?.slice(0, 60),
  });

  // Build prompts — curated phrases reduce what AI needs to fill
  const supplyPrompt = buildSupplyVarsPrompt(demand, supply, edge, introPhrase?.asNeed);
  const demandPrompt = buildDemandVarsPrompt(demand, supply, edge, introPhrase?.asEntity);

  console.log('[IntroAI] Filling template variables (2 parallel calls)...');
  const [supplyVarsRaw, demandVarsRaw] = await Promise.all([
    callAI(config, supplyPrompt),
    callAI(config, demandPrompt),
  ]);

  // Parse supply variables
  let supplyVars: { dreamICP: string; painTheySolve: string };
  try {
    const parsed = parseJSON(supplyVarsRaw);
    supplyVars = {
      dreamICP: parsed.dreamICP || '',
      // Use curated asNeed directly — AI never touches this slot for pack records
      painTheySolve: introPhrase?.asNeed || stripLeadingGerund(parsed.painTheySolve || ''),
    };
    console.log('[SUPPLY_VARS_OUT]', {
      dreamICP: supplyVars.dreamICP,
      painTheySolve: supplyVars.painTheySolve,
      source: introPhrase ? 'curated' : 'ai',
    });
  } catch {
    console.error('[IntroAI] Supply vars parse error:', supplyVarsRaw.slice(0, 200));
    supplyVars = {
      dreamICP: `${demand.industry || 'companies'} in your space`.toLowerCase(),
      painTheySolve: introPhrase?.asNeed || edge.evidence || 'what they need right now',
    };
    console.log('[SUPPLY_VARS_OUT]', {
      dreamICP: supplyVars.dreamICP,
      painTheySolve: supplyVars.painTheySolve,
      source: introPhrase ? 'curated_fallback' : 'fallback',
    });
  }

  // Parse demand variables
  let demandVars: { signalEvent: string; whoTheyAre: string };
  try {
    const parsed = parseJSON(demandVarsRaw);
    demandVars = {
      signalEvent: parsed.signalEvent || 'is making moves',
      // Use curated asEntity directly — AI never touches this slot for pack records
      whoTheyAre: introPhrase?.asEntity || stripLeadingArticle(parsed.whoTheyAre || ''),
    };
  } catch {
    console.error('[IntroAI] Demand vars parse error:', demandVarsRaw.slice(0, 200));
    demandVars = {
      signalEvent: 'is making moves',
      whoTheyAre: introPhrase?.asEntity || `${supply.capability || 'services'} firm`,
    };
  }
  console.log('[DEMAND_VARS_OUT]', {
    signalEvent: demandVars.signalEvent,
    whoTheyAre: demandVars.whoTheyAre,
    source: introPhrase ? 'curated' : 'ai',
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
