/**
 * INTRO GENERATOR — Rich Context, Real Examples, Full Validation
 *
 * Feeds ALL available data to AI. No shortcuts. No "we can add this later."
 *
 * DOCTRINE:
 * - DEMAND: Hold the provider. Reference their situation, not who helps.
 * - SUPPLY: Hold the list. "Companies like X" — one example, implies plurality.
 */

import type { AIConfig } from './AIService';
import type { NormalizedRecord } from '../schemas';

// =============================================================================
// TYPES
// =============================================================================

interface DemandContext {
  firstName: string;
  company: string;
  signal: string;
  // Rich context - all available data
  companyDescription: string | null;
  companyFunding: string | null;
  companyRevenue: string | null;
  industry: string | null;
  size: string | null;
  headline: string | null;
  signalDetail: string | null;
  city: string | null;
  country: string | null;
  seniorityLevel: string | null;
  // Enriched contact info (from Apollo)
  contactTitle: string | null;
  // Role count (if multiple roles at same company)
  roleCount: number;
}

interface SupplyContext {
  firstName: string;
  exampleCompany: string;
  commonSignal: string;
  matchCount: number;
  // Rich context - supply side data
  supplierCompany: string;
  supplierTitle: string | null;
  supplierHeadline: string | null;
  supplierIndustry: string | null;
  // Rich context - demand company data (the example company)
  demandCompanyStage: string | null;      // "Series C", "Public", "Seed"
  demandCompanyIndustry: string | null;   // "fintech", "SaaS", "biotech"
  demandCompanyFunding: string | null;    // "just raised $150M"
  demandRoleCount: number;                 // 8 roles
  demandDecisionMakerTitle: string | null; // "VP Engineering"
  demandSpecificSignal: string | null;     // "scaling backend team"
}

interface IntroResult {
  intro: string;
  validated: boolean;
  regenerated: boolean;
  attempts: number;
}

// =============================================================================
// AI PROXY
// =============================================================================

async function callAI(config: AIConfig, prompt: string, maxTokens: number = 200): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const proxyUrl = `${supabaseUrl}/functions/v1/ai-proxy`;

  const body: Record<string, unknown> = {
    provider: config.provider,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    temperature: 0.7,
  };

  if (config.provider === 'azure') {
    body.azureEndpoint = config.endpoint;
    body.azureApiKey = config.apiKey;
    body.azureDeployment = config.deployment || config.model;
  } else if (config.provider === 'openai') {
    body.openaiApiKey = config.apiKey;
    body.model = config.model || 'gpt-4o-mini';
  } else if (config.provider === 'anthropic') {
    body.anthropicApiKey = config.apiKey;
    body.model = config.model || 'claude-3-haiku-20240307';
  }

  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`AI proxy failed: ${response.status}`);
  }

  const data = await response.json();
  return data.content || '';
}

// =============================================================================
// DEMAND INTRO GENERATOR — 15 REAL EXAMPLES
// =============================================================================

export async function generateDemandIntro(
  config: AIConfig | null,
  ctx: DemandContext
): Promise<IntroResult> {
  // Build fallback template with available context
  // Use specific signal (already transformed by buildDemandContext)
  const signalPhrase = ctx.signal || 'growing the team';

  // Include contact title if available for more specific feel
  const greeting = ctx.contactTitle
    ? `Hey ${ctx.firstName}`
    : `Hey ${ctx.firstName}`;

  const fallback = `${greeting} — noticed ${ctx.company} is ${signalPhrase}. I'm connected to someone who helps companies at exactly this stage. Worth an intro?`;

  if (!config?.enabled || !config.apiKey) {
    return { intro: fallback, validated: true, regenerated: false, attempts: 1 };
  }

  // Build rich context section
  const contextLines: string[] = [];

  // Contact info - include their specific title if available
  if (ctx.contactTitle) {
    contextLines.push(`CONTACT: ${ctx.firstName}, ${ctx.contactTitle} at ${ctx.company}`);
  } else {
    contextLines.push(`CONTACT: ${ctx.firstName} at ${ctx.company}`);
  }

  // Signal info - already transformed to be specific by buildDemandContext
  contextLines.push(`SIGNAL: ${ctx.signal || 'growing the team'}`);

  // Role count if significant
  if (ctx.roleCount && ctx.roleCount >= 3) {
    contextLines.push(`ROLE COUNT: ${ctx.roleCount} open positions in this category`);
  }

  // Company context
  if (ctx.companyDescription) contextLines.push(`COMPANY: ${ctx.companyDescription.slice(0, 200)}`);
  if (ctx.companyFunding) contextLines.push(`FUNDING: ${ctx.companyFunding}`);
  if (ctx.companyRevenue) contextLines.push(`REVENUE: ${ctx.companyRevenue}`);
  if (ctx.industry) contextLines.push(`INDUSTRY: ${ctx.industry}`);
  if (ctx.size) contextLines.push(`SIZE: ${ctx.size}`);
  if (ctx.headline) contextLines.push(`THEIR HEADLINE: ${ctx.headline}`);
  if (ctx.city && ctx.country) contextLines.push(`LOCATION: ${ctx.city}, ${ctx.country}`);
  if (ctx.seniorityLevel) contextLines.push(`SENIORITY: ${ctx.seniorityLevel}`);

  const prompt = `Write a 2-sentence intro email for a connector reaching out to a company (DEMAND side).

=== CONTEXT ===
${contextLines.join('\n')}

=== CONNECTOR DOCTRINE ===
You are a connector — you know WHO can help this company but you HOLD that information.
- NEVER reveal the provider type (recruiter, agency, consultant, vendor)
- NEVER say "I know a recruiter" or "I work with an agency"
- INSTEAD reference their SITUATION and imply you have the right connection
- Make them CURIOUS about who you're connected to

=== FORMULA ===
"Hey [Name] — noticed [company] is [specific situation from their signal/description]. I'm connected to someone who [helps with this exact thing without revealing who]. Worth an intro?"

=== 15 REAL EXAMPLES ===

EXAMPLE 1 (Tech startup, hiring engineers, has funding):
Context: Sarah at Stripe, hiring Senior Engineers, $2.2B funding, "Building financial infrastructure"
Output: "Hey Sarah — noticed Stripe is scaling the engineering team after the recent raise. I'm connected to someone who specializes in helping high-growth fintech teams build out fast. Worth an intro?"

EXAMPLE 2 (SaaS company, hiring sales, Series B):
Context: Mike at Notion, hiring Account Executives, Series B, "Productivity tools for teams"
Output: "Hey Mike — noticed Notion is building out the sales org. I know someone who's helped similar product-led companies make that transition. Interested in an intro?"

EXAMPLE 3 (Biotech, hiring scientists, well-funded):
Context: Jennifer at Moderna, hiring Research Scientists, $1.5B funding, mRNA therapeutics
Output: "Hey Jennifer — noticed Moderna is expanding the research team. I'm connected to someone who knows the biotech talent landscape extremely well. Worth a quick intro?"

EXAMPLE 4 (E-commerce, hiring marketers):
Context: David at Shopify, hiring Growth Marketing Manager, "E-commerce platform"
Output: "Hey David — noticed Shopify is investing in growth. I know someone who's helped scale marketing at similar platforms. Want me to connect you?"

EXAMPLE 5 (Consulting firm, hiring consultants):
Context: Amanda at McKinsey, hiring Associate Consultants, "Management consulting"
Output: "Hey Amanda — noticed McKinsey is growing the team. I'm connected to someone who understands what top firms look for. Worth an intro?"

EXAMPLE 6 (Healthcare, hiring nurses, large org):
Context: Robert at Kaiser, hiring Registered Nurses, 200k+ employees, "Healthcare provider"
Output: "Hey Robert — noticed Kaiser is scaling the clinical team. I know someone who specializes in healthcare staffing at this scale. Interested?"

EXAMPLE 7 (Fintech startup, hiring product):
Context: Lisa at Plaid, hiring Product Managers, Series C, "Financial data infrastructure"
Output: "Hey Lisa — noticed Plaid is building out product. I'm connected to someone who knows the fintech PM landscape really well. Worth connecting?"

EXAMPLE 8 (Manufacturing, hiring engineers):
Context: Tom at Tesla, hiring Manufacturing Engineers, "Electric vehicles"
Output: "Hey Tom — noticed Tesla is expanding manufacturing. I know someone who's placed engineering talent at similar high-velocity production environments. Want an intro?"

EXAMPLE 9 (Media company, hiring content):
Context: Rachel at Netflix, hiring Content Strategists, "Streaming entertainment"
Output: "Hey Rachel — noticed Netflix is investing in content strategy. I'm connected to someone who understands the streaming talent market. Worth a quick intro?"

EXAMPLE 10 (Real estate, hiring agents):
Context: James at Compass, hiring Real Estate Agents, "Real estate technology"
Output: "Hey James — noticed Compass is growing the agent network. I know someone who's helped similar brokerages scale their teams. Interested in connecting?"

EXAMPLE 11 (Legal, hiring attorneys):
Context: Patricia at Latham, hiring Corporate Associates, "Law firm"
Output: "Hey Patricia — noticed Latham is expanding corporate. I'm connected to someone who knows the BigLaw lateral market extremely well. Worth an intro?"

EXAMPLE 12 (Startup, vague signal, limited data):
Context: Kevin at Acme Inc, hiring, no description available
Output: "Hey Kevin — noticed Acme is growing the team. I'm connected to someone who might be a fit for what you're building. Worth a quick intro?"

EXAMPLE 13 (Enterprise software, hiring sales leadership):
Context: Michelle at Salesforce, hiring VP of Sales, $20B+ revenue, "CRM software"
Output: "Hey Michelle — noticed Salesforce is looking for sales leadership. I know someone who's helped enterprise companies find executives at this level. Want me to connect you?"

EXAMPLE 14 (Crypto/Web3, hiring developers):
Context: Brian at Coinbase, hiring Blockchain Engineers, "Cryptocurrency exchange"
Output: "Hey Brian — noticed Coinbase is scaling the engineering team. I'm connected to someone who knows the Web3 talent market inside out. Worth an intro?"

EXAMPLE 15 (Agency, hiring creatives):
Context: Emily at Wieden+Kennedy, hiring Creative Directors, "Advertising agency"
Output: "Hey Emily — noticed W+K is expanding creative. I know someone who understands the agency talent landscape at the leadership level. Interested?"

=== RULES ===
1. Exactly 2 sentences
2. Start with "Hey ${ctx.firstName}"
3. First sentence: Reference THEIR specific situation (use the context provided)
4. Second sentence: Imply you have the right connection WITHOUT revealing what type
5. End with a question: "Worth an intro?" / "Interested?" / "Want me to connect you?"
6. Be SPECIFIC to their situation — don't be generic
7. If you have company description/funding, USE IT to be more specific

=== OUTPUT ===
Write ONLY the intro. No explanation. No quotes around it.`;

  let intro = '';
  let attempts = 0;
  let validated = false;

  // Try up to 3 times
  while (attempts < 3 && !validated) {
    attempts++;
    try {
      intro = (await callAI(config, prompt)).trim();

      // Validate the output
      const validation = await validateDemandIntro(config, intro, ctx);
      if (validation.valid) {
        validated = true;
      } else {
        console.log(`[IntroGenerator] Demand intro failed validation (attempt ${attempts}):`, validation.reason);
        if (attempts < 3) {
          // Add validation feedback for next attempt
          intro = '';
        }
      }
    } catch (err) {
      console.error(`[IntroGenerator] Demand intro generation failed (attempt ${attempts}):`, err);
    }
  }

  // If all attempts failed, use fallback
  if (!intro || !validated) {
    return { intro: fallback, validated: false, regenerated: attempts > 1, attempts };
  }

  return { intro, validated: true, regenerated: attempts > 1, attempts };
}

// =============================================================================
// SUPPLY INTRO GENERATOR — RICH CONTEXT, SPECIFIC DATA
// =============================================================================

export async function generateSupplyIntro(
  config: AIConfig | null,
  ctx: SupplyContext
): Promise<IntroResult> {
  // Build RICH fallback template (per user.txt spec)
  const fallback = buildRichSupplyFallback(ctx);

  if (!config?.enabled || !config.apiKey) {
    return { intro: fallback, validated: true, regenerated: false, attempts: 1 };
  }

  // Build rich context section with ALL available data
  const contextLines: string[] = [];
  contextLines.push(`SUPPLIER: ${ctx.firstName} at ${ctx.supplierCompany}`);
  if (ctx.supplierTitle) contextLines.push(`SUPPLIER'S ROLE: ${ctx.supplierTitle}`);
  if (ctx.supplierHeadline) contextLines.push(`SUPPLIER'S HEADLINE: ${ctx.supplierHeadline}`);
  if (ctx.supplierIndustry) contextLines.push(`SUPPLIER'S INDUSTRY: ${ctx.supplierIndustry}`);

  // DEMAND COMPANY DATA - this is what makes it RICH
  contextLines.push(`\nEXAMPLE DEMAND COMPANY: ${ctx.exampleCompany}`);
  if (ctx.demandCompanyStage) contextLines.push(`COMPANY STAGE: ${ctx.demandCompanyStage}`);
  if (ctx.demandCompanyIndustry) contextLines.push(`COMPANY INDUSTRY: ${ctx.demandCompanyIndustry}`);
  if (ctx.demandCompanyFunding) contextLines.push(`FUNDING SIGNAL: ${ctx.demandCompanyFunding}`);
  if (ctx.demandSpecificSignal) contextLines.push(`SPECIFIC SIGNAL: ${ctx.demandSpecificSignal}`);
  if (ctx.demandRoleCount && ctx.demandRoleCount > 1) contextLines.push(`ROLE COUNT: ${ctx.demandRoleCount}+ roles open`);
  if (ctx.demandDecisionMakerTitle) contextLines.push(`DECISION MAKER: ${ctx.demandDecisionMakerTitle}`);

  contextLines.push(`\nTOTAL MATCHES: ${ctx.matchCount} companies (but you only mention ONE example with RICH context)`);

  const prompt = `Write a 2-sentence intro email for a connector offering leads to a supplier (SUPPLY side).

=== CONTEXT ===
${contextLines.join('\n')}

=== CONNECTOR DOCTRINE ===
You are a connector with MULTIPLE companies that could use this supplier's services.
- Use "companies like [ONE example]" — implies plurality WITHOUT revealing the list
- Include RICH CONTEXT: stage, industry, funding if available
- Include SPECIFIC DETAILS: role count, what they're doing
- Name SPECIFIC decision maker title (NOT generic "decision-makers")
- You HOLD the full list until they reply YES

=== THE FORMULA (user.txt spec) ===
Sentence 1: "I'm seeing companies like [Example] ([stage/industry], [funding signal]) [specific action] - [specific details]"
Sentence 2: "I can intro you to their [specific title] if useful."

=== 15 RICH EXAMPLES ===

EXAMPLE 1 (Recruiter, fintech scaling engineering):
Context: Sam, Brex, Series C fintech, just raised $150M, scaling backend, 8+ roles, VP Engineering
Output: "Hey Sam — I'm seeing companies like Brex (Series C fintech, just raised $150M) scaling their engineering team fast - 8+ backend roles open right now. I can intro you to their VP Engineering if useful."

EXAMPLE 2 (Recruiter, SaaS building sales):
Context: Lisa, Notion, Series C, $10B valuation, ramping enterprise sales, 6 AE roles, VP Sales
Output: "Hey Lisa — I'm seeing companies like Notion (Series C, $10B valuation) ramping enterprise sales - 6 AE roles for Fortune 500 accounts. I can intro you to their VP Sales if interested."

EXAMPLE 3 (Software vendor, design tools):
Context: Mike, Figma, design tools, 800 employees, evaluating platforms, Head of IT
Output: "Hey Mike — I'm seeing companies like Figma (design tools, 800 employees) evaluating new collaboration platforms for remote teams. I can intro you to their Head of IT if useful."

EXAMPLE 4 (Consultant, crypto compliance):
Context: Sarah, Coinbase, public crypto exchange, expanding markets, compliance help, Chief Compliance Officer
Output: "Hey Sarah — I'm seeing companies like Coinbase (public, crypto exchange) looking for compliance help as they expand to new markets. I can intro you to their Chief Compliance Officer if interested."

EXAMPLE 5 (Recruiter, AI infrastructure):
Context: Tom, Stripe, public fintech 3000+ employees, building AI infrastructure, 12 ML roles, Director of Engineering
Output: "Hey Tom — I'm seeing companies like Stripe (public fintech, 3000+ employees) building out their AI infrastructure team - 12 ML Engineer roles posted this week. I can intro you to their Director of Engineering if useful."

EXAMPLE 6 (Agency, biotech marketing):
Context: Jennifer, Moderna, Series D biotech, $1.5B raised, scaling marketing, 5 roles, VP Marketing
Output: "Hey Jennifer — I'm seeing companies like Moderna (Series D biotech, $1.5B raised) scaling their marketing team - 5 senior roles open. I can intro you to their VP Marketing if interested."

EXAMPLE 7 (Recruiter, healthcare clinical):
Context: Robert, Kaiser, healthcare provider, 200k+ employees, expanding clinical, 15+ nursing roles, Director of Nursing
Output: "Hey Robert — I'm seeing companies like Kaiser (healthcare provider, 200k+ employees) expanding clinical staff - 15+ nursing positions open. I can intro you to their Director of Nursing if useful."

EXAMPLE 8 (IT consulting, enterprise transformation):
Context: Amanda, Salesforce, $20B+ revenue, digital transformation, CTO
Output: "Hey Amanda — I'm seeing companies like Salesforce ($20B+ revenue) investing heavily in digital transformation initiatives. I can intro you to their CTO if interested."

EXAMPLE 9 (Legal recruiter, BigLaw):
Context: Patricia, Latham, law firm, growing corporate practice, 6 associate roles, Recruiting Partner
Output: "Hey Patricia — I'm seeing firms like Latham (top 10 law firm) expanding their corporate practices - 6 associate roles open. I can intro you to their Recruiting Partner if useful."

EXAMPLE 10 (Design agency, rebranding):
Context: Kevin, Airbnb, travel tech, $100B+ market cap, rebranding initiative, Chief Design Officer
Output: "Hey Kevin — I'm seeing companies like Airbnb (travel tech, $100B+ market cap) investing in major rebranding initiatives. I can intro you to their Chief Design Officer if interested."

EXAMPLE 11 (Security firm, fintech):
Context: Michelle, JPMorgan, banking, Fortune 100, security investments, CISO
Output: "Hey Michelle — I'm seeing companies like JPMorgan (Fortune 100, banking) investing heavily in security infrastructure. I can intro you to their CISO if useful."

EXAMPLE 12 (PR agency, AI launches):
Context: Brian, OpenAI, AI company, Series F, announcing launches, VP Communications
Output: "Hey Brian — I'm seeing companies like OpenAI (Series F, AI company) gearing up for major product announcements. I can intro you to their VP Communications if interested."

EXAMPLE 13 (Supply chain, manufacturing):
Context: Emily, Tesla, EV manufacturer, scaling production, VP Operations
Output: "Hey Emily — I'm seeing companies like Tesla (EV manufacturer, public) scaling production capacity aggressively. I can intro you to their VP Operations if useful."

EXAMPLE 14 (Finance recruiter, CFO searches):
Context: David, Plaid, Series D fintech, building finance team, 4 roles, CFO
Output: "Hey David — I'm seeing companies like Plaid (Series D fintech) building out their finance function - 4 senior roles including controller. I can intro you to their CFO if interested."

EXAMPLE 15 (Content agency, streaming):
Context: Rachel, Netflix, streaming, public, investing in content, 8 roles, VP Content Strategy
Output: "Hey Rachel — I'm seeing companies like Netflix (public, streaming) investing in content strategy - 8 roles open. I can intro you to their VP Content Strategy if useful."

=== RULES ===
1. Exactly 2 sentences
2. Start with "Hey ${ctx.firstName}"
3. First sentence MUST include:
   - Company name
   - Context in parentheses (stage, industry, funding)
   - Specific action with details (role count if available)
4. Second sentence: "I can intro you to their [SPECIFIC TITLE]" (NOT "decision-makers")
5. End with: "if useful" / "if interested"
6. NEVER say "decision-makers" - always specific title
7. Use ALL available context data

=== OUTPUT ===
Write ONLY the intro. No explanation. No quotes around it.`;

  let intro = '';
  let attempts = 0;
  let validated = false;

  // Try up to 3 times
  while (attempts < 3 && !validated) {
    attempts++;
    try {
      intro = (await callAI(config, prompt)).trim();

      // Validate the output
      const validation = await validateSupplyIntro(config, intro, ctx);
      if (validation.valid) {
        validated = true;
      } else {
        console.log(`[IntroGenerator] Supply intro failed validation (attempt ${attempts}):`, validation.reason);
        if (attempts < 3) {
          intro = '';
        }
      }
    } catch (err) {
      console.error(`[IntroGenerator] Supply intro generation failed (attempt ${attempts}):`, err);
    }
  }

  // If all attempts failed, use fallback
  if (!intro || !validated) {
    return { intro: fallback, validated: false, regenerated: attempts > 1, attempts };
  }

  return { intro, validated: true, regenerated: attempts > 1, attempts };
}

// =============================================================================
// VALIDATION — AI checks output before returning
// =============================================================================

interface ValidationResult {
  valid: boolean;
  reason?: string;
}

async function validateDemandIntro(
  config: AIConfig,
  intro: string,
  ctx: DemandContext
): Promise<ValidationResult> {
  // Quick structural checks first (no AI needed)
  if (!intro.toLowerCase().startsWith('hey')) {
    return { valid: false, reason: 'Must start with Hey' };
  }
  if (!intro.includes('?')) {
    return { valid: false, reason: 'Must end with a question' };
  }
  if (intro.length < 50 || intro.length > 350) {
    return { valid: false, reason: 'Length out of range (50-350 chars)' };
  }

  // Check for doctrine violations (reveals provider type)
  const violations = [
    'recruiter', 'agency', 'consultant', 'staffing', 'headhunter',
    'firm', 'vendor', 'provider', 'service provider', 'partner'
  ];
  const lowerIntro = intro.toLowerCase();
  for (const word of violations) {
    if (lowerIntro.includes(word)) {
      return { valid: false, reason: `Reveals provider type: "${word}"` };
    }
  }

  // Check that it mentions the company
  if (!intro.toLowerCase().includes(ctx.company.toLowerCase().split(' ')[0])) {
    return { valid: false, reason: 'Does not mention the company' };
  }

  // AI validation for quality
  const validationPrompt = `You are a quality checker. Evaluate this intro email:

INTRO: "${intro}"

CONTEXT: This is for ${ctx.firstName} at ${ctx.company}, who is ${ctx.signal}.

CHECK:
1. Is it natural and conversational (not robotic)?
2. Does it reference their specific situation (not generic)?
3. Does it create curiosity without revealing who the connection is?
4. Is it exactly 2 sentences?

Reply ONLY with: VALID or INVALID:[reason]`;

  try {
    const result = await callAI(config, validationPrompt, 50);
    if (result.trim().toUpperCase().startsWith('VALID')) {
      return { valid: true };
    }
    return { valid: false, reason: result.replace('INVALID:', '').trim() };
  } catch {
    // If validation call fails, accept the intro (structural checks passed)
    return { valid: true };
  }
}

async function validateSupplyIntro(
  config: AIConfig,
  intro: string,
  ctx: SupplyContext
): Promise<ValidationResult> {
  // Quick structural checks first
  if (!intro.toLowerCase().startsWith('hey')) {
    return { valid: false, reason: 'Must start with Hey' };
  }
  if (!intro.includes('useful') && !intro.includes('interested') && !intro.includes('?')) {
    return { valid: false, reason: 'Must end with offer/question' };
  }
  if (intro.length < 50 || intro.length > 400) {
    return { valid: false, reason: 'Length out of range (50-400 chars)' };
  }

  // Check for doctrine violations (reveals list)
  const violations = [
    /\d+ companies/i,
    /several companies/i,
    /multiple companies/i,
    /a few companies/i,
    /many companies/i,
    /,\s*and\s+/i,  // "Stripe, Notion, and..."
  ];
  for (const pattern of violations) {
    if (pattern.test(intro)) {
      return { valid: false, reason: 'Reveals list count or enumerates' };
    }
  }

  // NEW: Check for generic "decision-makers" (forbidden per user.txt)
  if (intro.toLowerCase().includes('decision-makers') || intro.toLowerCase().includes('decision makers')) {
    return { valid: false, reason: 'Uses generic "decision-makers" instead of specific title' };
  }

  // Check that it uses "companies like"
  if (!intro.toLowerCase().includes('companies like') && !intro.toLowerCase().includes('firms like')) {
    return { valid: false, reason: 'Must use "companies like [example]" pattern' };
  }

  // AI validation for quality
  const validationPrompt = `You are a quality checker. Evaluate this intro email:

INTRO: "${intro}"

CONTEXT: This is for ${ctx.firstName}, offering leads from companies like ${ctx.exampleCompany}.

CHECK:
1. Does it use "companies like [one example]" pattern?
2. Does it NOT reveal how many companies or list multiple?
3. Is it natural and creates interest?
4. Is it exactly 2 sentences?

Reply ONLY with: VALID or INVALID:[reason]`;

  try {
    const result = await callAI(config, validationPrompt, 50);
    if (result.trim().toUpperCase().startsWith('VALID')) {
      return { valid: true };
    }
    return { valid: false, reason: result.replace('INVALID:', '').trim() };
  } catch {
    // If validation call fails, accept the intro (structural checks passed)
    return { valid: true };
  }
}

// =============================================================================
// HELPER: Build context from NormalizedRecord
// =============================================================================

/**
 * Build rich demand context for intro generation.
 * Creates SPECIFIC signals like "scaling the backend team with 8+ roles"
 * instead of generic "hiring for Senior Backend Engineer".
 */
export function buildDemandContext(
  record: NormalizedRecord,
  enrichedFirstName?: string,
  enrichedTitle?: string,
  roleCount: number = 1
): DemandContext {
  // Transform raw job title into SPECIFIC hiring context
  const rawSignal = record.signal || '';
  let signal = buildSpecificSignal(rawSignal, roleCount, record.signalDetail);

  // Add funding context if available (makes intro more specific)
  if (record.companyFunding) {
    const fundingContext = extractFundingContext(record.companyFunding);
    if (fundingContext && !signal.toLowerCase().includes('raise') && !signal.toLowerCase().includes('funding')) {
      signal = `${signal} after the ${fundingContext}`;
    }
  }

  return {
    firstName: enrichedFirstName || record.firstName,
    company: record.company,
    signal,
    companyDescription: record.companyDescription,
    companyFunding: record.companyFunding,
    companyRevenue: record.companyRevenue,
    industry: Array.isArray(record.industry) ? record.industry[0] : record.industry,
    size: Array.isArray(record.size) ? record.size[0] : record.size,
    headline: record.headline,
    signalDetail: record.signalDetail,
    city: record.city,
    country: record.country,
    seniorityLevel: record.seniorityLevel,
    contactTitle: enrichedTitle || null,
    roleCount,
  };
}

/**
 * Transform generic job title into SPECIFIC signal phrase.
 * "Senior Backend Engineer" + 8 roles → "scaling the backend team"
 * "ML Engineer" + 3 roles → "building out the ML team"
 */
function buildSpecificSignal(rawTitle: string, roleCount: number, signalDetail?: string | null): string {
  if (!rawTitle) return 'growing the team';

  const lower = rawTitle.toLowerCase();

  // Detect role category
  let category = '';
  let verb = roleCount > 2 ? 'scaling' : 'building out';

  if (lower.includes('engineer') || lower.includes('developer') || lower.includes('software')) {
    if (lower.includes('backend') || lower.includes('back-end') || lower.includes('back end')) {
      category = 'backend engineering';
    } else if (lower.includes('frontend') || lower.includes('front-end') || lower.includes('front end')) {
      category = 'frontend engineering';
    } else if (lower.includes('fullstack') || lower.includes('full-stack') || lower.includes('full stack')) {
      category = 'engineering';
    } else if (lower.includes('ml') || lower.includes('machine learning') || lower.includes('ai')) {
      category = 'ML/AI';
    } else if (lower.includes('data')) {
      category = 'data engineering';
    } else if (lower.includes('platform') || lower.includes('infra')) {
      category = 'platform infrastructure';
    } else if (lower.includes('mobile') || lower.includes('ios') || lower.includes('android')) {
      category = 'mobile engineering';
    } else {
      category = 'engineering';
    }
  } else if (lower.includes('sales') || lower.includes('account executive') || lower.includes('ae')) {
    category = 'sales';
    verb = roleCount > 2 ? 'scaling' : 'building';
  } else if (lower.includes('marketing') || lower.includes('growth')) {
    category = 'marketing';
    verb = 'investing in';
  } else if (lower.includes('product manager') || lower.includes('product lead')) {
    category = 'product';
    verb = 'building out';
  } else if (lower.includes('design') || lower.includes('ux') || lower.includes('ui')) {
    category = 'design';
    verb = 'investing in';
  } else if (lower.includes('hr') || lower.includes('recruiter') || lower.includes('people')) {
    category = 'people ops';
    verb = 'growing';
  } else if (lower.includes('finance') || lower.includes('accounting') || lower.includes('controller')) {
    category = 'finance';
    verb = 'building out';
  } else {
    // Use the raw title but simplify
    category = rawTitle.split(/,|·|-/)[0].trim();
    verb = 'hiring for';
  }

  // Build the signal with role count if significant
  if (roleCount >= 5) {
    return `${verb} ${category} with ${roleCount}+ roles open`;
  } else if (roleCount >= 3) {
    return `${verb} the ${category} team`;
  } else {
    return `${verb} ${category}`;
  }
}

/**
 * Extract funding context from funding string.
 * "$10M Series A" → "Series A"
 * "$50M funding round" → "recent raise"
 */
function extractFundingContext(funding: string): string | null {
  if (!funding) return null;

  const lower = funding.toLowerCase();

  if (lower.includes('series a')) return 'Series A';
  if (lower.includes('series b')) return 'Series B';
  if (lower.includes('series c')) return 'Series C';
  if (lower.includes('series d')) return 'Series D';
  if (lower.includes('seed')) return 'seed round';
  if (lower.includes('ipo')) return 'IPO';

  // Check for dollar amounts indicating recent raise
  const amountMatch = funding.match(/\$[\d,.]+[MBK]?/i);
  if (amountMatch) return 'recent raise';

  return null;
}

/**
 * Build RICH fallback for supply intros.
 * Uses all available context to create a specific, not generic, fallback.
 */
function buildRichSupplyFallback(ctx: SupplyContext): string {
  // Build context phrase: "(Series C fintech, just raised $150M)"
  const contextParts: string[] = [];
  if (ctx.demandCompanyStage) contextParts.push(ctx.demandCompanyStage);
  if (ctx.demandCompanyIndustry) contextParts.push(ctx.demandCompanyIndustry);
  if (ctx.demandCompanyFunding) contextParts.push(ctx.demandCompanyFunding);

  const contextPhrase = contextParts.length > 0 ? ` (${contextParts.join(', ')})` : '';

  // Build action phrase: "scaling their engineering team fast - 8+ roles open"
  let actionPhrase = ctx.demandSpecificSignal || ctx.commonSignal || 'showing momentum';
  if (ctx.demandRoleCount && ctx.demandRoleCount > 2) {
    actionPhrase = `${actionPhrase} - ${ctx.demandRoleCount}+ roles open right now`;
  }

  // Build decision maker phrase: "their VP Engineering" or fallback
  const dmPhrase = ctx.demandDecisionMakerTitle
    ? `their ${ctx.demandDecisionMakerTitle}`
    : 'the right people there';

  return `Hey ${ctx.firstName} — I'm seeing companies like ${ctx.exampleCompany}${contextPhrase} ${actionPhrase}. I can intro you to ${dmPhrase} if useful.`;
}

export function buildSupplyContext(
  supplyRecord: NormalizedRecord,
  exampleDemandCompany: string,
  commonSignal: string,
  matchCount: number,
  enrichedFirstName?: string,
  // NEW: Rich demand company data
  demandRecord?: NormalizedRecord | null,
  demandEnrichedTitle?: string | null,
  demandRoleCount?: number
): SupplyContext {
  // Extract stage from funding or description
  let demandCompanyStage: string | null = null;
  if (demandRecord?.companyFunding) {
    demandCompanyStage = extractCompanyStage(demandRecord.companyFunding);
  }

  // Extract industry
  const demandCompanyIndustry = demandRecord?.industry
    ? (Array.isArray(demandRecord.industry) ? demandRecord.industry[0] : demandRecord.industry)
    : null;

  // Extract funding signal
  const demandCompanyFunding = demandRecord?.companyFunding
    ? extractFundingSignal(demandRecord.companyFunding)
    : null;

  // Build specific signal from demand record
  const demandSpecificSignal = demandRecord?.signal
    ? buildSpecificSignal(demandRecord.signal, demandRoleCount || 1, demandRecord.signalDetail)
    : null;

  return {
    firstName: enrichedFirstName || supplyRecord.firstName,
    exampleCompany: exampleDemandCompany,
    commonSignal,
    matchCount,
    supplierCompany: supplyRecord.company,
    supplierTitle: supplyRecord.title,
    supplierHeadline: supplyRecord.headline,
    supplierIndustry: Array.isArray(supplyRecord.industry) ? supplyRecord.industry[0] : supplyRecord.industry,
    // NEW: Rich demand company data
    demandCompanyStage,
    demandCompanyIndustry,
    demandCompanyFunding,
    demandRoleCount: demandRoleCount || 1,
    demandDecisionMakerTitle: demandEnrichedTitle || null,
    demandSpecificSignal,
  };
}

/**
 * Extract company stage from funding string.
 * "$50M Series C" → "Series C"
 */
function extractCompanyStage(funding: string): string | null {
  if (!funding) return null;
  const lower = funding.toLowerCase();

  if (lower.includes('series a')) return 'Series A';
  if (lower.includes('series b')) return 'Series B';
  if (lower.includes('series c')) return 'Series C';
  if (lower.includes('series d')) return 'Series D';
  if (lower.includes('series e')) return 'Series E';
  if (lower.includes('series f')) return 'Series F';
  if (lower.includes('seed')) return 'Seed';
  if (lower.includes('ipo') || lower.includes('public')) return 'Public';

  return null;
}

/**
 * Extract funding signal for display.
 * "$150M raised" → "just raised $150M"
 */
function extractFundingSignal(funding: string): string | null {
  if (!funding) return null;

  // Look for dollar amount
  const amountMatch = funding.match(/\$[\d,.]+\s*[MBK]?/i);
  if (amountMatch) {
    return `just raised ${amountMatch[0]}`;
  }

  return null;
}
