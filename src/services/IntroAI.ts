/**
 * INTRO AI — 3-Step AI Generation (user.txt contract)
 *
 * STEP 1: Generate Value Proposition (WHY this match matters)
 * STEP 2: Generate Demand Intro (using value prop)
 * STEP 3: Generate Supply Intro (using value prop)
 *
 * NO hardcoded switch statements. NO "companies like this" garbage.
 * Pure AI generation using ALL available rich data.
 */

import type { DemandRecord } from '../schemas/DemandRecord';
import type { SupplyRecord } from '../schemas/SupplyRecord';
import type { Edge } from '../schemas/Edge';
import type { Counterparty } from '../schemas/IntroOutput';
import { composeIntros } from '../matching/Composer';

// =============================================================================
// TYPES
// =============================================================================

export interface IntroAIConfig {
  provider: 'openai' | 'anthropic' | 'azure';
  apiKey: string;
  model?: string;
  azureEndpoint?: string;
  azureDeployment?: string;
  // LAYER 3: Optional fallback key for when Azure content filter blocks
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
// HELPER: CLEAN COMPANY NAME
// =============================================================================

/**
 * Clean company name: ALL CAPS → Title Case, remove legal suffixes.
 * "REFLEXIVE CAPITAL MANAGEMENT LP" → "Reflexive Capital Management"
 */
function cleanCompanyName(name: string): string {
  if (!name) return name;

  let cleaned = name.trim();

  // Convert ALL CAPS to Title Case
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

  // Remove legal suffixes
  cleaned = cleaned.replace(/,?\s*(llc|l\.l\.c\.|inc\.?|corp\.?|corporation|ltd\.?|limited|co\.?|company|pllc|lp|l\.p\.|llp|l\.l\.p\.)\s*$/i, '').trim();

  return cleaned;
}

// =============================================================================
// STEP 1: GENERATE VALUE PROPOSITION
// =============================================================================

function buildStep1Prompt(
  demand: DemandRecord,
  supply: SupplyRecord,
  edge: Edge
): string {
  const fundingAmount = demand.metadata.fundingUsd
    ? `$${(demand.metadata.fundingUsd / 1000000).toFixed(0)}M`
    : null;

  return `Generate two short value propositions for a B2B introduction.
Tone: understated and cautious. Use hedging language—you are guessing, not claiming.

Input data:

DEMAND:
- Company: ${cleanCompanyName(demand.company)}
- Industry: ${demand.industry || 'tech'}
- Signal: ${edge.type} - ${edge.evidence}
${demand.metadata.employeeEnum ? `- Size: ${demand.metadata.employeeEnum}\n` : ''}${fundingAmount ? `- Funding: ${fundingAmount}\n` : ''}
SUPPLY:
- Company: ${cleanCompanyName(supply.company)}
- Capability: ${supply.capability || 'business services'}

=== VOICE (from $2M/yr playbook) ===

DEMAND VALUE PROP (max 15 words):
• "You raised $28M. Probably in the phase where you need pharma partnerships."
• "You raised $16M. Probably need help landing enterprise shippers."
• "Hit $950M AUM. Probably looking to bring in a couple more HNW clients."
• "Expanded capacity by 50%. Probably need help landing tier 1 contracts."
• "Just got 510(k). Probably need help with hospital introductions."

SUPPLY VALUE PROP (max 20 words):
• "48 people, $28M Series B. CEO is probably scaling partnerships & looking to land a couple pharma co-dev discussions."
• "55 people, $16M Series A. VP Sales is probably trying to land first 2-3 enterprise shipper accounts."
• "20 advisors, $1.1B AUM. Managing partner is probably looking to bring in a couple more HNW clients."
• "72 people, just expanded 50%. Operations director is probably trying to land a couple multi-year contracts."
• "45 people, 510(k) clearance. CEO is probably trying to land first hospital pilot programs."

HEDGING WORDS (use these):
• probably, might, would guess, seems like, a couple, first 2-3

AVOID: pipeline, systematic, strategic, significant, perfect, ideal, aggressively

Output (JSON only):
{"demandValueProp": "...", "supplyValueProp": "..."}`;
}

// =============================================================================
// STEP 2: GENERATE DEMAND INTRO
// =============================================================================

function buildStep2Prompt(
  demand: DemandRecord,
  supply: SupplyRecord,
  edge: Edge,
  valueProps: ValueProps
): string {
  const demandFirstName = extractFirstName(demand.contact);
  // Greeting format: if name is missing or is "Decision", use fallback
  const greeting = (!demandFirstName || demandFirstName === 'there' || demandFirstName === 'Decision')
    ? 'Hey—figured I\'d reach out.'
    : `Hey ${demandFirstName}—`;
  const fundingAmount = demand.metadata.fundingUsd
    ? `$${(demand.metadata.fundingUsd / 1000000).toFixed(0)}M`
    : null;

  return `Write a short demand-side B2B intro email.

MATCH DATA (use this — do not invent your own):
- TIMING: ${edge.evidence}
- FIT: ${valueProps.demandValueProp}
- WHO: ${supply.contact} at ${cleanCompanyName(supply.company)} — ${supply.capability || 'business services'}
- DEMAND COMPANY: ${cleanCompanyName(demand.company)}
${demand.metadata.companyDescription || demand.metadata.description ? `- WHAT THEY DO: ${demand.metadata.companyDescription || demand.metadata.description}\n` : ''}${fundingAmount ? `- FUNDING: ${fundingAmount}\n` : ''}
GREETING: ${greeting}

CRITICAL — NAME ATTRIBUTION:
You are writing TO someone at DEMAND COMPANY (${cleanCompanyName(demand.company)}).
You are OFFERING to connect them with WHO (${supply.contact} at ${cleanCompanyName(supply.company)}).
These are TWO DIFFERENT companies. The TIMING signal belongs to DEMAND COMPANY, not WHO.
If you swap these names, the intro is factually wrong and unusable. Double-check before outputting.

YOUR JOB: Translate the match data above into a natural-sounding email.
Pattern: Signal → why they fit → soft ask.

RULES:
• 40–60 words. Shorter is better.
• Never use "ended up diving into" or any rabbit-hole phrasing.
• Do not reference product, platform, or technology details unless provided in WHAT THEY DO above.
• If WHAT THEY DO is missing, skip personal commentary. Go straight from signal to offer.
• No generic compliments ("really smart approach", "impressive trajectory", "elegant solution").
• Each intro must sound different — vary openers, structure, and close.
• Em dash (—) has no spaces around it.
• Always include an options line ("got a few others", "others in that space").
• End with a short CTA ("Worth a chat?", "Worth connecting?", "Worth exploring?").
• NEVER reference the person's job title as a personal touch — only reference the COMPANY.

BANNED PHRASES: pipeline, systematic, repeatable, fuel, deploy, specialize, strategic, effectively, efficiently, seamlessly, holistically, aggressively, perfect fit, ideal opportunity, significant revenue

5 EXAMPLES (different structures, different verticals):

1. "Hey—saw NeuroPath just closed a $28M Series B. You're probably in the phase where you need a few pharma co-development intros. Know someone who might help: Sarah at BioPharma Partners. She lands early BD discussions for post-raise CNS biotechs. Got a couple others if useful. Worth a chat?"

2. "Hey Marcus—noticed your logistics platform raised $16M. Sounds like you might need your first 2-3 enterprise shipper accounts. Might be worth connecting with Derek at Supply Chain Accelerate. He helps funded logistics companies land big shippers. A few others in that space if useful. Worth connecting?"

3. "Hey—your RIA just crossed $950M AUM. Might be time to scale the HNW client base. Know someone: David at Founder Wealth Advisory. He routes warm HNW intros from the startup ecosystem. Got a couple others if you want options. Worth exploring?"

4. "Hey Tom—saw your precision shop expanded capacity by 50%. Probably looking to fill it. Know someone who might help: Michael at Aerospace Supply Partners. He connects certified shops with tier 1 primes. A few others if useful. Worth a chat?"

5. "Hey—noticed your RevOps platform launched v4.0. Looks like you're ready for midmarket. Might be worth chatting with Jessica at GTM Scale. She helps B2B SaaS companies land a couple enterprise logos. Others in that zone if useful. Worth connecting?"

Output: Just the intro text. No quotes. No labels. No commentary.`;
}

// =============================================================================
// STEP 3: GENERATE SUPPLY INTRO
// =============================================================================

function buildStep3Prompt(
  demand: DemandRecord,
  supply: SupplyRecord,
  edge: Edge,
  valueProps: ValueProps
): string {
  const supplyFirstName = extractFirstName(supply.contact);
  const fundingAmount = demand.metadata.fundingUsd
    ? `$${(demand.metadata.fundingUsd / 1000000).toFixed(0)}M`
    : null;
  // Greeting format: if name is missing, use "Hey there—"
  const greeting = (!supplyFirstName || supplyFirstName === 'there' || supplyFirstName === 'Contact')
    ? 'Hey there—'
    : `Hey ${supplyFirstName}—`;

  return `Write a short supply-side B2B intro email. You're tipping a friend about a lead.

MATCH DATA (use this — do not invent your own):
- DEMAND COMPANY: ${cleanCompanyName(demand.company)}
${demand.metadata.companyDescription || demand.metadata.description ? `- WHAT THEY DO: ${demand.metadata.companyDescription || demand.metadata.description}\n` : ''}- DEMAND CONTACT: ${demand.contact}
- DEMAND TITLE: ${demand.title || 'decision maker'}
- INDUSTRY: ${demand.industry || 'tech'}
${demand.metadata.employeeEnum ? `- SIZE: ${demand.metadata.employeeEnum}\n` : ''}${fundingAmount ? `- FUNDING: ${fundingAmount}\n` : ''}${demand.metadata.fundingType ? `- FUNDING TYPE: ${demand.metadata.fundingType}\n` : ''}- TIMING SIGNAL: ${edge.evidence}
- FIT: ${valueProps.supplyValueProp}

GREETING: ${greeting}

CRITICAL — NAME ATTRIBUTION:
You are writing TO the supply contact (${supply.contact}).
You are TIPPING them about DEMAND COMPANY (${cleanCompanyName(demand.company)}).
The DEMAND CONTACT is ${demand.contact} (${demand.title || 'decision maker'}) — the person at DEMAND COMPANY.
The TIMING SIGNAL belongs to DEMAND COMPANY. Do NOT attribute it to the supply contact's company.
If you swap these names, the intro is factually wrong and unusable. Double-check before outputting.

YOUR JOB: Translate the match data above into a casual, tip-a-friend email.
Pattern: Who the company is → what the contact is probably doing → why it fits → soft close.

RULES:
• 60–80 words. Shorter is better.
• Tone: casual, like giving a friend a lead. Understate. Let them decide.
• Use hedging: "probably", "might", "would guess", "seems like".
• If SIZE or FUNDING is not provided, omit it entirely. Never say "unknown" or "not sure".
• Do not fabricate company details not in the data above.
• Each intro must sound different — vary structure and close.
• Em dash (—) has no spaces around it.
• End with "Let me know" or similar casual CTA.

BANNED PHRASES: pipeline, systematic, repeatable, fuel, deploy, specialize, strategic, effectively, efficiently, seamlessly, holistically, aggressively, perfect opportunity, significant

5 EXAMPLES (different structures, different verticals):

1. "Hey Sarah—NeuroPath Therapeutics is a CNS biotech (48 people), just raised $28M Series B. CEO is probably scaling partnerships and looking for a couple early pharma co-development discussions. They're in the phase where they have funding but might need warm BD intros to neuroscience teams. Pretty sure you can deliver. Let me know."

2. "Hey Marcus—Supply Chain Accelerate is a logistics tech company (55 people), just closed $16M Series A. VP of Sales is probably trying to land first 2-3 enterprise shipper accounts. Would guess they need help with outbound to Fortune 500 supply chain leaders. Pretty sure it'd be helpful to connect. Let me know."

3. "Hey David—Founder Wealth Advisory just crossed $1.1B AUM serving startup founders. Managing partner is probably looking to bring in a couple more HNW clients from the late-stage startup ecosystem. Would guess they need warm founder introductions from VCs and startup CFOs. Let me know if worth connecting."

4. "Hey Tom—Aerospace Supply Partners is a precision machining company (72 people), just expanded capacity by 50%. Operations director is probably trying to land a couple multi-year contracts with aerospace OEMs. Seems like they need procurement introductions at tier 1 primes. Pretty sure you know the right people. Let me know."

5. "Hey Jessica—GTM Scale is a RevOps platform (42 people), just raised $14M Series A. Founder is probably looking to land a couple midmarket B2B SaaS logos. They're post-product-market-fit and might need meeting generation with revenue ops leaders. Would be helpful to connect you two. Let me know."

Output: Just the intro text. No quotes. No labels. No commentary.`;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function extractFirstName(fullName: string): string {
  const trimmed = (fullName || '').trim();
  if (!trimmed) return 'there';
  const parts = trimmed.split(/\s+/);
  return parts[0] || trimmed;
}

function cleanIntroOutput(text: string): string {
  let cleaned = text.trim();
  // Remove surrounding quotes
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  // Remove markdown code blocks
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '').trim();
  return cleaned;
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
      temperature: 0.7,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

async function callAnthropic(config: IntroAIConfig, prompt: string): Promise<string> {
  // Route through ai-proxy edge function — key lives server-side only
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
      max_tokens: 500,
      temperature: 0.7,
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
      temperature: 0.7,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[IntroAI] Azure error body:', errorBody);

    // LAYER 2: Explicit content_filter detection (Stripe-grade observability)
    if (
      response.status === 400 &&
      errorBody.toLowerCase().includes('content_filter')
    ) {
      console.error('[IntroAI] AZURE_CONTENT_FILTER_BLOCK detected');
      throw new Error('AZURE_CONTENT_FILTER_BLOCK');
    }

    throw new Error(`Azure error: ${response.status} - ${errorBody.slice(0, 200)}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

async function callAI(config: IntroAIConfig, prompt: string): Promise<string> {
  switch (config.provider) {
    case 'openai':
      return callOpenAI(config, prompt);
    case 'anthropic':
      return callAnthropic(config, prompt);
    case 'azure':
      // LAYER 3: Deterministic provider fallback (Stripe-grade resilience)
      // Azure blocks → automatic fallback to OpenAI
      // No user interruption, no retry loop, no prompt mutation
      try {
        return await callAzure(config, prompt);
      } catch (err) {
        if (err instanceof Error && err.message === 'AZURE_CONTENT_FILTER_BLOCK') {
          // Check if OpenAI fallback key is configured
          if (!config.openaiApiKeyFallback) {
            console.error('[IntroAI] Azure content filter blocked, no OpenAI fallback key configured');
            throw new Error('AZURE_CONTENT_FILTER_BLOCK: Configure OpenAI API key in Settings as fallback');
          }

          console.log('[IntroAI] Azure content filter triggered, falling back to OpenAI');
          const fallbackConfig: IntroAIConfig = {
            provider: 'openai',
            apiKey: config.openaiApiKeyFallback,
            model: 'gpt-4o-mini', // Cost-effective fallback
          };
          try {
            return await callOpenAI(fallbackConfig, prompt);
          } catch (fallbackErr) {
            console.error('[IntroAI] OpenAI fallback failed:', fallbackErr);
            throw new Error('AZURE_CONTENT_FILTER_BLOCK: OpenAI fallback also failed - check API key');
          }
        }
        throw err;
      }
    default:
      throw new Error(`Unknown AI provider: ${config.provider}`);
  }
}

// =============================================================================
// MAIN EXPORT: 3-STEP GENERATION
// =============================================================================

/**
 * Generate intros using 3-step AI process (user.txt contract)
 *
 * STEP 1: Generate value props (WHY this match matters)
 * STEP 2: Generate demand intro (using value prop)
 * STEP 3: Generate supply intro (using value prop)
 */
export async function generateIntrosAI(
  config: IntroAIConfig,
  demand: DemandRecord,
  supply: SupplyRecord,
  edge: Edge
): Promise<GeneratedIntros> {
  // STEP 1: Generate Value Propositions
  console.log('[IntroAI] Step 1: Generating value props...');
  const step1Prompt = buildStep1Prompt(demand, supply, edge);
  const step1Response = await callAI(config, step1Prompt);

  let valueProps: ValueProps;
  try {
    // Parse JSON response
    const cleaned = step1Response.replace(/```json\n?|\n?```/g, '').trim();
    valueProps = JSON.parse(cleaned);
  } catch (e) {
    console.error('[IntroAI] Step 1 parse error:', e);
    // Fallback value props
    valueProps = {
      demandValueProp: `${edge.evidence} creates an opportunity.`,
      supplyValueProp: `${cleanCompanyName(demand.company)} is an attractive prospect.`,
    };
  }
  console.log('[IntroAI] Step 1 complete:', valueProps);

  // STEP 2: Generate Demand Intro
  console.log('[IntroAI] Step 2: Generating demand intro...');
  const step2Prompt = buildStep2Prompt(demand, supply, edge, valueProps);
  const demandIntro = await callAI(config, step2Prompt);
  console.log('[IntroAI] Step 2 complete');

  // STEP 3: Generate Supply Intro
  console.log('[IntroAI] Step 3: Generating supply intro...');
  const step3Prompt = buildStep3Prompt(demand, supply, edge, valueProps);
  const supplyIntro = await callAI(config, step3Prompt);
  console.log('[IntroAI] Step 3 complete');

  return {
    demandIntro: cleanIntroOutput(demandIntro),
    supplyIntro: cleanIntroOutput(supplyIntro),
    valueProps,
  };
}

// =============================================================================
// BATCH GENERATION (for multiple matches)
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
  source: 'ai' | 'ai-fallback';  // Track whether AI succeeded or fell back to Composer
}

/**
 * Sequential batch (legacy) - kept for backwards compatibility
 */
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
      console.error(`[IntroAI] Fallback to Composer for ${item.id}:`, e);

      // Silent fallback to Composer (Stripe doctrine: system keeps working)
      const counterparty: Counterparty = {
        company: item.supply.company,
        contact: item.supply.contact || '',
        email: item.supply.email || '',
        title: item.supply.title || '',
        fitReason: '',
      };

      const composed = composeIntros(item.demand, item.edge, counterparty, item.supply);

      results.push({
        id: item.id,
        demandIntro: composed.demandBody,
        supplyIntro: composed.supplyBody,
        valueProps: { demandValueProp: '', supplyValueProp: '' },
        source: 'ai-fallback',
      });
    }
  }

  return results;
}

/**
 * Parallel batch with bounded concurrency.
 *
 * @param concurrency - Max parallel requests (default 5, safe for most AI providers)
 */
export async function generateIntrosBatchParallel(
  config: IntroAIConfig,
  items: BatchIntroItem[],
  concurrency: number = 5,
  onProgress?: (current: number, total: number) => void
): Promise<BatchIntroResult[]> {
  const results: BatchIntroResult[] = new Array(items.length);
  let completed = 0;

  // Process in chunks of `concurrency`
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
          console.error(`[IntroAI] Fallback to Composer for ${item.id}:`, e);

          // Silent fallback to Composer (Stripe doctrine: system keeps working)
          const counterparty: Counterparty = {
            company: item.supply.company,
            contact: item.supply.contact || '',
            email: item.supply.email || '',
            title: item.supply.title || '',
            fitReason: '',
          };

          const composed = composeIntros(item.demand, item.edge, counterparty, item.supply);

          return {
            index: i + idx,
            result: {
              id: item.id,
              demandIntro: composed.demandBody,
              supplyIntro: composed.supplyBody,
              valueProps: { demandValueProp: '', supplyValueProp: '' },
              source: 'ai-fallback',
            } as BatchIntroResult,
          };
        }
      })
    );

    // Store results in correct order
    for (const { index, result } of chunkResults) {
      results[index] = result;
      completed++;
      onProgress?.(completed, items.length);
    }
  }

  return results;
}
