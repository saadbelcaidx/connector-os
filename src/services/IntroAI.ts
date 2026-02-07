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

  return `Summarize the match context for a B2B introduction. Be concrete and casual — like a connector explaining to a friend why two people should meet.

DATA:
- DEMAND COMPANY: ${cleanCompanyName(demand.company)}
${demand.industry ? `- INDUSTRY: ${demand.industry}\n` : ''}- SIGNAL: ${edge.evidence}
${demand.metadata.companyDescription || demand.metadata.description ? `- CONTEXT: ${(demand.metadata.companyDescription || demand.metadata.description).slice(0, 400)}\n` : ''}${demand.metadata.employeeEnum ? `- SIZE: ${demand.metadata.employeeEnum}\n` : ''}${fundingAmount ? `- FUNDING: ${fundingAmount}\n` : ''}
- SUPPLY COMPANY: ${cleanCompanyName(supply.company)}
${supply.capability ? `- SUPPLY FOCUS: ${supply.capability}\n` : ''}${supply.metadata?.companyDescription || supply.metadata?.description ? `- SUPPLY CONTEXT: ${(supply.metadata.companyDescription || supply.metadata.description).slice(0, 300)}\n` : ''}
INSTRUCTIONS:
- demandValueProp: In plain English, what is the demand company doing right now? Use specifics from CONTEXT (product name, market, metric). Max 15 words. Example: "Scaling into enterprise after 11x ARR growth, hiring across sales and CS."
- supplyValueProp: Why would this timing matter to someone at the supply company? Use SUPPLY CONTEXT if available. Max 15 words. Example: "They run a $42B family office—this is exactly who they serve."

Do NOT describe what the supply company sells. DO reference their scale or positioning if it's in SUPPLY CONTEXT.
Do NOT use corporate jargon: partnerships, expertise, alignment, strategic, solutions, leverage, optimize, streamline.

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

  return `Write a short demand-side intro email. You're a connector who noticed a signal and is offering to make an introduction. Sound like a human — casual, direct, no corporate language.

VOICE: You're a fellow founder/operator making a warm connection. Insider tone — short, genuine, casual. This should read like a LinkedIn DM between peers, not formal outreach. Write naturally — do NOT copy example phrases from this prompt. Every sentence must make grammatical sense on its own. NEVER use: "tends to", "typically", "teams at this stage", "surface needs", "spotlight", "tighten workflows". Never sound like a platform or a sales email.

DATA:
- DEMAND COMPANY: ${cleanCompanyName(demand.company)}
- TIMING: ${edge.evidence}
${demand.metadata.companyDescription || demand.metadata.description ? `- CONTEXT: ${(demand.metadata.companyDescription || demand.metadata.description).slice(0, 400)}\n` : ''}${fundingAmount ? `- FUNDING: ${fundingAmount}\n` : ''}- SUPPLIER: ${supply.contact} at ${cleanCompanyName(supply.company)}
- SUPPLIER FOCUS: ${supply.capability || 'business services'}
${supply.metadata?.companyDescription || supply.metadata?.description ? `- SUPPLIER CONTEXT: ${(supply.metadata.companyDescription || supply.metadata.description).slice(0, 200)}\n` : ''}

GREETING: ${greeting}

WRITE EXACTLY THIS STRUCTURE:

Paragraph 1: State what you noticed (from TIMING). ONE fact, ONE sentence. Pick the single most important thing — don't chain multiple facts with "after" or "and". No adjectives, no commentary, no editorializing.
✅ "Saw you stepped down as CEO in Sept 2025."
❌ "Saw you stepped down as CEO in Sept 2025 after selling $724M in shares." (two facts crammed)
Use the ACTUAL date or timeframe from TIMING. NEVER invent relative time like "earlier this month", "recently". If no date, skip the time reference.

Paragraph 2: The timing bridge — ONE sentence that connects the signal to WHY they might want help. Acknowledge what that signal means in practice — the complexity, the timing pressure, the opportunity window. This makes you sound like someone who understands their world, not just someone forwarding facts.
✅ "That kind of push always comes with a lot of moving parts." / "That's a lot of moving pieces to coordinate." / "Big lift—lots of plates spinning."
❌ "Could be interesting for you." / "Worth exploring." / "That's exciting." (empty filler)
❌ "They're focusing on side effects and immune response." (technical detail they already know)
Keep it casual and short — ONE sentence max.

Paragraph 3: "I know [supplier first name] at [supplier company]—[lane]. Want an intro?"
The lane is 5-15 words. Describe who they are — what they do, at what scale, for whom. Use specifics from SUPPLIER CONTEXT. Include dollar figures ($42B, $80B+), client type (tech founders, UHNW families), or their actual edge.
✅ "they run a $42B multi-family office out of Philly" / "they manage $80B+ for tech founders like Zuckerberg" / "they place senior engineering leaders at Series B+ startups"
❌ "they manage wealth and do investing" / "they focus on trust management" / "a firm with deep roots serving families nationwide" / "they're a full-service CRO that handles everything from early phase through regulatory work"
Be specific and casual. Use real details from the data — not corporate descriptions.

HARD RULES:
• 40–70 words total. Three or four short paragraphs.
• Supplier relevance = ONE casual clause max (e.g. "they handle clinical trial services"). Never a formal multi-part description.
• NEVER reference anyone's job title.
• NEVER use corporate/robotic language.
• Use natural contractions (don't, that's, I'm).
• Em dash (—) has no spaces.

ATTRIBUTION: You are writing TO someone at ${cleanCompanyName(demand.company)}. The TIMING signal belongs to them. ${supply.contact} is the person you're offering to introduce. Do NOT mix up which company the signal belongs to.

BANNED WORDS (using any = failure): probably, might, sounds like, would guess, seems like, could be, exploring, partnerships, pipeline, systematic, repeatable, fuel, deploy, specialize, specializes, strategic, effectively, efficiently, seamlessly, holistically, aggressively, perfect fit, ideal opportunity, significant revenue, got a few others, others in that space, needs, requires, expertise, aligns, alignment, deep experience, helps, helping, address, addressing, solution, solutions, works in, works with, works on, supports, during high-growth phases, scaling companies, enterprise enablement, could help, worth connecting, highlight, demonstrate, leverage, optimize, streamline, accelerate, technology services, business services, consulting services, mix of exciting and chaotic, comes with its own set of challenges, manage wealth and do investing, focus on trust management, next-gen, earlier this month, earlier this week, earlier this year, the other day, just recently, big move, major move, big transition, big chapter, big shift, big step, major transition, major chapter, major shift, major step, deep roots, deep trust, trust management roots, based firm, based company, based in, serving families nationwide, serving clients nationwide

Output: Just the intro text. No quotes. No labels.`;
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

  return `Write a short supply-side intro email. You're a connector tipping someone about a lead. Sound like a human — casual, direct, no corporate language.

VOICE: You're a fellow founder/operator tipping someone in your network about a lead. Insider tone — short, genuine, casual. This should read like a LinkedIn DM between peers, not formal outreach. Write naturally — do NOT copy example phrases from this prompt. Every sentence must make grammatical sense on its own. NEVER use: "tends to", "typically", "teams at this stage", "surface needs", "spotlight", "tighten workflows". Never sound like a platform or a sales email.

DATA:
- DEMAND COMPANY: ${cleanCompanyName(demand.company)}
${demand.metadata.companyDescription || demand.metadata.description ? `- CONTEXT: ${(demand.metadata.companyDescription || demand.metadata.description).slice(0, 400)}\n` : ''}- DEMAND CONTACT: ${demand.contact}
${demand.title ? `- DEMAND TITLE: ${demand.title}\n` : ''}${demand.metadata.employeeEnum ? `- SIZE: ${demand.metadata.employeeEnum}\n` : ''}${fundingAmount ? `- FUNDING: ${fundingAmount}\n` : ''}${demand.metadata.fundingType ? `- FUNDING TYPE: ${demand.metadata.fundingType}\n` : ''}- TIMING: ${edge.evidence}

GREETING: ${greeting}

WRITE EXACTLY THIS STRUCTURE:

Paragraph 1: "[Demand company] [what happened from TIMING]. [Demand contact first name] is driving this." — Lead with the fact. Name who's behind it. Use specifics from CONTEXT if available.
Rephrase the signal NATURALLY — don't copy database fields verbatim. Say "is gearing up for a Phase 2 trial" not "has a Phase 2 trial not yet recruiting." Say "just closed a $32B acquisition" not "acquisition completed July 2025." Sound like you're telling a friend, not reading from a spreadsheet.
Use the ACTUAL date or timeframe from TIMING (e.g. "Sept 2025", "last year", "in July"). NEVER invent relative time like "earlier this month", "recently", "just announced", "the other day". If TIMING has no date, skip the time reference entirely.

Paragraph 2: The timing bridge — explain WHY you're flagging this NOW and why it matters for the recipient. This is the sentence that makes you sound like an insider with timing intel, not just someone forwarding facts.
✅ "Figured I'd flag it since they're not recruiting yet but will be soon—timing could line up for you."
✅ "They're ramping fast—figured you'd want first look before it gets crowded."
✅ "Still early stage—could be good timing to get in front of this."
❌ "They're focusing on side effects and immune response in older populations." (technical padding, not a timing bridge)
❌ "Could be interesting." / "Worth a look." / "Up your alley." (empty filler)
Do NOT describe the demand company's business or add technical detail the recipient already knows.

Paragraph 3: "Let me know if you want an intro." — that's it.

HARD RULES:
• 35–60 words total. Three short paragraphs. Shorter is better.
• You're tipping them — they know what they do. Don't describe their business.
• NEVER reference anyone's job title in the body (only use demand contact's first name).
• NEVER use corporate/robotic language.
• NEVER write filler. Every sentence must contain a fact or a name.
• Use natural contractions (don't, that's, it's).
• Em dash (—) has no spaces.
• Always end with "Let me know." or "Let me know if you want an intro."

ATTRIBUTION: You are writing TO ${supply.contact}. You are tipping them about ${cleanCompanyName(demand.company)}. The TIMING signal belongs to ${cleanCompanyName(demand.company)}. ${demand.contact} is the person at the demand company. Do NOT mix up which company the signal belongs to.

BANNED WORDS (using any = failure): probably, might, sounds like, would guess, seems like, could be, exploring, explore, partnerships, pipeline, systematic, repeatable, fuel, deploy, specialize, specializes, strategic, effectively, efficiently, seamlessly, holistically, aggressively, perfect opportunity, significant, needs, requires, expertise, aligns, alignment, deep experience, helps, helping, address, addressing, solution, solutions, works in, works with, works on, supports, during high-growth phases, scaling companies, enterprise enablement, could help, worth connecting, highlight, demonstrate, leverage, optimize, streamline, accelerate, timing feels right, feels like the right moment, everything happening, given what's going on, way things are moving, rethinking their, shifting their, in the space right now, up your alley, interesting angle, major player, congrats, worth a look, worth exploring, thought it could, earlier this month, earlier this week, earlier this year, the other day, just recently, big move, major move, big transition, big chapter, big shift, big step, major transition, major chapter, major shift, major step, deep roots, deep trust, trust management roots, based firm, based company, based in, serving families nationwide, serving clients nationwide

Output: Just the intro text. No quotes. No labels.`;
}

// =============================================================================
// BANNED WORD ENFORCEMENT (code-level — AI cannot bypass this)
// =============================================================================

const BANNED_PHRASES = [
  // Multi-word (check these first — order matters for substring matching)
  'BD partnerships', 'exploring opportunities', 'deep experience',
  'perfect fit', 'ideal opportunity', 'significant revenue',
  'got a few others', 'others in that space', 'worth connecting',
  'could help', 'works in', 'works with', 'works on',
  'works extensively in', 'sounds like', 'would guess', 'seems like',
  'could be', 'may be', 'during high-growth phases',
  'scaling companies', 'enterprise enablement',
  // Single-word
  'partnerships', 'partnership', 'exploring', 'probably', 'might',
  'possibly', 'likely', 'perhaps', 'guessing', 'pipeline',
  'systematic', 'repeatable', 'fuel', 'deploy', 'specialize',
  'specializes', 'strategic', 'effectively', 'efficiently',
  'seamlessly', 'holistically', 'aggressively', 'expertise',
  'aligns', 'alignment', 'helps', 'helping', 'address',
  'addressing', 'solution', 'solutions', 'supports',
  'technology services', 'business services', 'consulting services',
  'teams at this stage often', 'teams at this stage', 'AI-powered',
  'infrastructure', 'tends to', 'typically', 'surface needs',
  'spotlight', 'tighten workflows', 'ramping up its game',
  'manage wealth and do investing', 'manage wealth and invest',
  'focus on trust management', 'wealth and investing',
  'mix of exciting and chaotic', 'comes with its own set of challenges',
  'next-gen', 'next gen',
  'timing feels right', 'feels like the right moment',
  'everything happening in the space', 'everything happening',
  'way things are moving', 'in the space right now',
  'right moment to get in front', 'rethinking their',
  'shifting their strategy',
  'up your alley', 'interesting angle', 'major player',
  'could be an interesting', 'thought it could',
  'worth a look', 'worth exploring', 'worth checking out',
  'congrats on the move', 'congrats on',
  'earlier this month', 'earlier this week', 'earlier this year',
  'the other day', 'just recently', 'big move', 'major move',
  'big transition', 'big chapter', 'big shift', 'big step',
  'major transition', 'major chapter', 'major shift', 'major step',
  'deep roots', 'deep trust', 'trust management roots',
  'based firm', 'based company', 'based in',
  'serving families nationwide', 'serving clients nationwide',
  'full-service', 'handles everything from',
];

function findBannedWords(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED_PHRASES.filter(phrase => lower.includes(phrase.toLowerCase()));
}

/**
 * Sanitize value props from Step 1 before feeding to Steps 2/3.
 * Removes sentences containing banned words so the AI never sees them as input.
 */
function sanitizeValueProps(vp: ValueProps): ValueProps {
  return {
    demandValueProp: stripBannedSentences(vp.demandValueProp),
    supplyValueProp: stripBannedSentences(vp.supplyValueProp),
  };
}

function stripBannedSentences(text: string): string {
  if (!text) return text;
  // Split into sentences, remove any containing banned words
  const sentences = text.split(/(?<=[.!?])\s+/);
  const clean = sentences.filter(s => findBannedWords(s).length === 0);
  // If all sentences banned, return original minus the banned words inline
  if (clean.length === 0) {
    let result = text;
    for (const phrase of BANNED_PHRASES) {
      const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      result = result.replace(regex, '').replace(/\s{2,}/g, ' ').trim();
    }
    return result;
  }
  return clean.join(' ');
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
      temperature: 0.3,
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

  // CRITICAL: Sanitize value props before feeding to Steps 2/3
  // If Step 1 leaked banned words, Steps 2/3 would copy them from input
  valueProps = sanitizeValueProps(valueProps);
  console.log('[IntroAI] Step 1 complete (sanitized):', valueProps);

  // STEP 2: Generate Demand Intro (with retry on banned word violation)
  console.log('[IntroAI] Step 2: Generating demand intro...');
  let demandIntro = await callAI(config, buildStep2Prompt(demand, supply, edge, valueProps));
  let demandViolations = findBannedWords(demandIntro);
  if (demandViolations.length > 0) {
    console.warn('[IntroAI] Step 2 banned words detected:', demandViolations, '— retrying once');
    const retryPrompt = buildStep2Prompt(demand, supply, edge, valueProps) +
      `\n\nCRITICAL RETRY: Your previous output contained these BANNED words: ${demandViolations.join(', ')}. Rewrite WITHOUT any of them. This is non-negotiable.`;
    demandIntro = await callAI(config, retryPrompt);
    demandViolations = findBannedWords(demandIntro);
    if (demandViolations.length > 0) {
      console.error('[IntroAI] Step 2 STILL has banned words after retry:', demandViolations);
    }
  }
  console.log('[IntroAI] Step 2 complete');

  // STEP 3: Generate Supply Intro (with retry on banned word violation)
  console.log('[IntroAI] Step 3: Generating supply intro...');
  let supplyIntro = await callAI(config, buildStep3Prompt(demand, supply, edge, valueProps));
  let supplyViolations = findBannedWords(supplyIntro);
  if (supplyViolations.length > 0) {
    console.warn('[IntroAI] Step 3 banned words detected:', supplyViolations, '— retrying once');
    const retryPrompt = buildStep3Prompt(demand, supply, edge, valueProps) +
      `\n\nCRITICAL RETRY: Your previous output contained these BANNED words: ${supplyViolations.join(', ')}. Rewrite WITHOUT any of them. This is non-negotiable.`;
    supplyIntro = await callAI(config, retryPrompt);
    supplyViolations = findBannedWords(supplyIntro);
    if (supplyViolations.length > 0) {
      console.error('[IntroAI] Step 3 STILL has banned words after retry:', supplyViolations);
    }
  }
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
  source: 'ai' | 'ai-fallback';
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

    // Store results in correct order
    for (const { index, result } of chunkResults) {
      results[index] = result;
      completed++;
      onProgress?.(completed, items.length);
    }
  }

  return results;
}
