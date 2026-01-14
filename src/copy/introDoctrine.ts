/**
 * INTRO DOCTRINE — Single Source of Truth
 *
 * ALL intro generation must flow through this module.
 * No generator may define its own prompt, examples, or fallback text.
 *
 * CANONICAL STRUCTURE:
 * 1. Opening: "quick relevance check" / "quick check before I connect you"
 * 2. Context: Descriptive positioning ONLY (no timing, momentum, intent, activity)
 * 3. Bridge: Research frame ("came up while mapping...", "surfaced while reviewing...")
 * 4. Close: Opt-out ("if not useful, no worries" / "otherwise I'll drop it")
 *
 * HARD RULES:
 * - Never imply timing without presignal
 * - Never imply intent without evidence
 * - Never reveal counterparty
 * - Presignal may enrich wording but structure stays same
 * - Examples are law, not suggestions
 */

// =============================================================================
// TYPES
// =============================================================================

export type IntroSide = 'demand' | 'supply';

export type ConnectorMode =
  | 'recruiting'
  | 'biotech_licensing'
  | 'wealth_management'
  | 'real_estate_capital'
  | 'logistics'
  | 'crypto'
  | 'enterprise_partnerships'
  | 'b2b_general';

export interface IntroContext {
  firstName: string;
  company: string;
  industry?: string;
  contactTitle?: string;
  contactName?: string;
  // Presignal — operator-written context that earns timing claims
  preSignalContext?: string;
  // Wellfound data — allows factual freshness claims only
  hasWellfoundData?: boolean;
  wellfoundJobCount?: number;
  // PHASE-1 FIX: Neutral "why this match" reason (e.g., "Industry match", "Signal alignment")
  matchReason?: string;
}

export interface ComposeIntroArgs {
  side: IntroSide;
  mode?: ConnectorMode;
  ctx: IntroContext;
}

// =============================================================================
// TIMING CLAIMS — EXHAUSTIVE, NOT ILLUSTRATIVE
// If AI can slip through with a synonym, it will.
// =============================================================================

export const TIMING_CLAIMS = [
  // Core timing words
  'hiring', 'scaling', 'growing', 'raised', 'funding', 'funded',
  'expanding', 'after raising', 'series a', 'series b', 'series c',
  'seed round', 'building out', 'ramping up',
  // Verb forms
  'build', 'expand', 'adding', 'bringing on', 'onboarding',
  // Euphemisms
  'doubling down', 'next phase', 'entering', 'accelerating',
  'gaining momentum', 'building momentum', 'traction', 'growth spurt',
  'rapid growth', 'hypergrowth', 'post-funding', 'post-raise',
  // Biotech-specific proxies
  'advancing', 'moving into', 'entering clinical', 'phase 1', 'phase 2', 'phase 3',
  'pipeline expansion', 'platform expansion',
  // Team-building euphemisms
  'team growth', 'headcount', 'new hires', 'open roles', 'open positions',
  // Activity/momentum euphemisms
  'momentum', 'activity', 'actively', 'active in', 'in motion',
  'evaluating', 'investing', 'initiative', 'ramping', 'ramp up',
  // Intent language
  'looking to', 'planning to', 'seeking', 'exploring',
  'interested in', 'considering', 'evaluating options',
  // BANNED WORDS (always forbidden)
  'noticed', 'caught my eye', 'right now', 'moving fast',
] as const;

// =============================================================================
// WELLFOUND FACTUAL ALLOWLIST
// These claims are ALLOWED only when Wellfound data is present (factual, not inferred)
// =============================================================================

export const WELLFOUND_FACTUAL_CLAIMS = [
  'recently posted',
  'posted a role',
  'has open roles',
  'roles listed',
  'open positions listed',
  'job listing',
] as const;

// =============================================================================
// CANONICAL OPENINGS
// =============================================================================

export const CANONICAL_OPENINGS = {
  demand: 'quick relevance check',
  supply: 'quick check before I connect you',
} as const;

// =============================================================================
// CANONICAL STRUCTURES
// Demand: Hold the provider. Reference their situation, not who helps.
// Supply: Hold the list. "Companies like X" — one example, implies plurality.
// =============================================================================

export const CANONICAL_STRUCTURES = {
  demand: {
    // WITHOUT presignal (neutral — no timing claims)
    neutral: `Hey {firstName} — {opening}. I'm connecting a small number of {industryPhrase} with people who work in this space. {company} came up as a clean fit. I can make the intro if it's useful — if not, no worries.`,
    // WITH presignal (presignal-aware — weave in the source)
    presignal: `Hey {firstName} — {opening}. {presignalBridge}. {company} came up as a fit. I can make the intro if it's useful — if not, no worries.`,
  },
  supply: {
    // WITHOUT presignal (neutral — no timing claims)
    neutral: `Hey {firstName} — {opening}. I'm introducing people in your space to a few companies where there's clear overlap. Your work stood out. Happy to connect you if you're interested.`,
    // WITH presignal (presignal-aware — weave in the source)
    presignal: `Hey {firstName} — {opening}. {presignalBridge}. Your work came up as a fit. Happy to connect you if you're interested.`,
  },
} as const;

// =============================================================================
// CANONICAL EXAMPLES — 15 DEMAND + 15 SUPPLY + PRESIGNAL-AWARE
// Examples are law, not suggestions. AI must mimic these exactly.
// =============================================================================

export const CANONICAL_EXAMPLES = {
  demand: {
    neutral: [
      // Fintech
      { ctx: 'Sarah at Stripe, fintech infrastructure', output: 'Hey Sarah — quick relevance check. I\'m connecting a small number of fintech infrastructure teams with people who work in this space. Stripe came up as a clean fit. I can make the intro if it\'s useful — if not, no worries.' },
      // SaaS
      { ctx: 'Mike at Notion, productivity SaaS', output: 'Hey Mike — quick relevance check. I\'m connecting a small number of product-led SaaS companies with people who operate in go-to-market. Notion came up as a clean fit. I can make the intro if it\'s useful — if not, no worries.' },
      // Biotech
      { ctx: 'Jennifer at Moderna, mRNA therapeutics', output: 'Hey Jennifer — quick relevance check. I\'m connecting a small number of clinical-stage biotech companies with teams in the same therapeutic space. Moderna came up as a clean fit. I can make the intro if it\'s useful — if not, no worries.' },
      // E-commerce
      { ctx: 'David at Shopify, e-commerce platform', output: 'Hey David — quick relevance check. I\'m connecting a small number of e-commerce platforms with people who work in this space. Shopify came up as a clean fit. I can make the intro if it\'s useful — if not, no worries.' },
      // Healthcare
      { ctx: 'Robert at Kaiser, healthcare provider', output: 'Hey Robert — quick relevance check. I\'m connecting a small number of healthcare organizations with people in clinical operations. Kaiser came up as a clean fit. I can make the intro if it\'s useful — if not, no worries.' },
      // Manufacturing
      { ctx: 'Tom at Tesla, electric vehicles', output: 'Hey Tom — quick relevance check. I\'m connecting a small number of manufacturing companies with people in production engineering. Tesla came up as a clean fit. I can make the intro if it\'s useful — if not, no worries.' },
      // Media
      { ctx: 'Rachel at Netflix, streaming entertainment', output: 'Hey Rachel — quick relevance check. I\'m connecting a small number of streaming companies with people in content strategy. Netflix came up as a clean fit. I can make the intro if it\'s useful — if not, no worries.' },
      // Crypto
      { ctx: 'Brian at Coinbase, cryptocurrency exchange', output: 'Hey Brian — quick relevance check. I\'m connecting a small number of web3 projects with teams in the same problem space. Coinbase came up as a clean fit. I can make the intro if it\'s useful — if not, no worries.' },
      // Generic startup
      { ctx: 'Kevin at Acme Inc, tech startup', output: 'Hey Kevin — quick relevance check. I\'m connecting a small number of teams with people who work in this space. Acme came up as a clean fit. I can make the intro if it\'s useful — if not, no worries.' },
    ],
    presignal: [
      // Fintech with presignal
      { ctx: 'Lisa at Plaid, financial data infrastructure', presignal: 'I\'ve been speaking with a recruiter who places API platform engineers', output: 'Hey Lisa — quick relevance check. I\'ve been speaking with someone who places API platform engineers — Plaid came up as a fit. I can make the intro if it\'s useful — if not, no worries.' },
      // SaaS with presignal
      { ctx: 'Amanda at Figma, design tools', presignal: 'After a recent conversation with a growth consultant focused on PLG', output: 'Hey Amanda — quick relevance check. After a recent conversation with someone focused on PLG growth — Figma came up. I can make the intro if it\'s useful — if not, no worries.' },
      // Biotech with presignal
      { ctx: 'Marcus at Genentech, pharma BD', presignal: 'This came up while discussing partnership opportunities with a clinical-stage biotech', output: 'Hey Marcus — quick relevance check. This came up while discussing partnership opportunities — Genentech came up as relevant. I can make the intro if it\'s useful — if not, no worries.' },
      // Enterprise with presignal
      { ctx: 'Michelle at Salesforce, CRM software', presignal: 'I\'ve been speaking with a consultant who works with enterprise sales teams', output: 'Hey Michelle — quick relevance check. I\'ve been speaking with someone who works with enterprise sales teams — Salesforce came up as a fit. I can make the intro if it\'s useful — if not, no worries.' },
      // Real estate with presignal
      { ctx: 'James at Compass, real estate technology', presignal: 'After a conversation with a broker who covers the same markets', output: 'Hey James — quick relevance check. After a conversation with someone who covers your markets — Compass came up. I can make the intro if it\'s useful — if not, no worries.' },
      // Agency with presignal
      { ctx: 'Emily at Wieden+Kennedy, advertising agency', presignal: 'I\'ve been speaking with a creative director looking for agency partnerships', output: 'Hey Emily — quick relevance check. I\'ve been speaking with a creative director exploring agency partnerships — W+K came up as a fit. I can make the intro if it\'s useful — if not, no worries.' },
    ],
  },
  supply: {
    neutral: [
      // Recruiter fintech
      { ctx: 'Sam works in fintech recruiting, Brex is a fintech company', output: 'Hey Sam — quick check before I connect you. I\'m introducing people in your space to a few companies where there\'s clear overlap in engineering needs. Your work stood out. Happy to connect you if you\'re interested.' },
      // Recruiter SaaS
      { ctx: 'Lisa works in sales recruiting, Notion is a SaaS company', output: 'Hey Lisa — quick check before I connect you. I\'m introducing people in your space to a few product-led SaaS companies where there\'s clear overlap. Your work stood out. Happy to connect you if you\'re interested.' },
      // Consultant crypto
      { ctx: 'Sarah does compliance consulting, Coinbase is a crypto exchange', output: 'Hey Sarah — quick check before I connect you. I\'m introducing people in your space to a few crypto companies where there\'s clear regulatory overlap. Your work stood out. Happy to connect you if you\'re interested.' },
      // Recruiter AI/ML
      { ctx: 'Tom recruits ML engineers, Stripe is a fintech company', output: 'Hey Tom — quick check before I connect you. I\'m introducing people in your space to a few fintech companies where there\'s clear overlap in technical needs. Your work stood out. Happy to connect you if you\'re interested.' },
      // Agency biotech
      { ctx: 'Jennifer runs a marketing agency, Moderna is a biotech company', output: 'Hey Jennifer — quick check before I connect you. I\'m introducing people in your space to a few biotech companies where there\'s clear overlap in positioning. Your work stood out. Happy to connect you if you\'re interested.' },
      // Recruiter healthcare
      { ctx: 'Robert recruits clinical staff, Kaiser is a healthcare provider', output: 'Hey Robert — quick check before I connect you. I\'m introducing people in your space to a few clinical organizations where there\'s clear overlap. Your work stood out. Happy to connect you if you\'re interested.' },
      // IT consulting
      { ctx: 'Amanda does IT consulting, Salesforce is an enterprise software company', output: 'Hey Amanda — quick check before I connect you. I\'m introducing people in your space to a few enterprise software companies where there\'s clear overlap. Your work stood out. Happy to connect you if you\'re interested.' },
      // Legal recruiter
      { ctx: 'Patricia recruits attorneys, Latham is a law firm', output: 'Hey Patricia — quick check before I connect you. I\'m introducing people in your space to a few top firms where there\'s clear overlap in practice areas. Your work stood out. Happy to connect you if you\'re interested.' },
      // Logistics
      { ctx: 'Emily runs a logistics company, Tesla is a manufacturer', output: 'Hey Emily — quick check before I connect you. I\'m introducing people in your space to a few manufacturing companies where there\'s clear overlap in distribution. Your work stood out. Happy to connect you if you\'re interested.' },
    ],
    presignal: [
      // Recruiter with presignal
      { ctx: 'Mike works in engineering recruiting', presignal: 'I\'ve been speaking with Stripe about their backend team needs', output: 'Hey Mike — quick check before I connect you. I\'ve been speaking with Stripe — your work in backend recruiting came up as a fit. Happy to connect you if you\'re interested.' },
      // Agency with presignal
      { ctx: 'Kevin runs a design agency', presignal: 'After a recent conversation with Airbnb\'s brand team', output: 'Hey Kevin — quick check before I connect you. After a recent conversation with Airbnb\'s brand team — your agency came up. Happy to connect you if you\'re interested.' },
      // Consultant with presignal
      { ctx: 'Michelle does security consulting', presignal: 'This came up while discussing infrastructure needs with JPMorgan', output: 'Hey Michelle — quick check before I connect you. This came up while discussing infrastructure with JPMorgan — your security work stood out. Happy to connect you if you\'re interested.' },
      // PR agency with presignal
      { ctx: 'Brian runs a PR agency', presignal: 'I\'ve been speaking with OpenAI about their communications strategy', output: 'Hey Brian — quick check before I connect you. I\'ve been speaking with OpenAI about comms — your agency came up as a fit. Happy to connect you if you\'re interested.' },
      // Finance recruiter with presignal
      { ctx: 'David recruits finance professionals', presignal: 'After a conversation with Plaid\'s CFO about their finance team', output: 'Hey David — quick check before I connect you. After a conversation with Plaid\'s finance team — your work came up. Happy to connect you if you\'re interested.' },
      // Content agency with presignal
      { ctx: 'Rachel runs a content agency', presignal: 'I\'ve been speaking with Netflix about content strategy partnerships', output: 'Hey Rachel — quick check before I connect you. I\'ve been speaking with Netflix about content partnerships — your agency stood out. Happy to connect you if you\'re interested.' },
    ],
  },
} as const;

// =============================================================================
// MODE-SPECIFIC INDUSTRY PHRASES
// Only industry/vertical changes, NOT timing or structure
// =============================================================================

const MODE_INDUSTRY_PHRASES: Record<ConnectorMode, { demand: string; supply: string }> = {
  recruiting: {
    demand: 'teams',
    supply: 'recruiters',
  },
  biotech_licensing: {
    demand: 'clinical-stage companies',
    supply: 'pharma BD teams',
  },
  wealth_management: {
    demand: 'individuals',
    supply: 'wealth advisors',
  },
  real_estate_capital: {
    demand: 'projects',
    supply: 'capital partners',
  },
  logistics: {
    demand: 'companies',
    supply: 'logistics operators',
  },
  crypto: {
    demand: 'web3 projects',
    supply: 'teams',
  },
  enterprise_partnerships: {
    demand: 'companies',
    supply: 'partners',
  },
  b2b_general: {
    demand: 'companies',
    supply: 'providers',
  },
};

// =============================================================================
// PRESIGNAL VALIDATION
// =============================================================================

const MIN_PRESIGNAL_LENGTH = 20;

/**
 * Check if presignal is valid (not empty, not placeholder, min length)
 */
export function hasValidPresignal(presignal: string | undefined | null): boolean {
  return typeof presignal === 'string' && presignal.trim().length >= MIN_PRESIGNAL_LENGTH;
}

/**
 * Check if text contains timing claims
 */
export function containsTimingClaim(text: string): { found: boolean; claims: string[] } {
  const lower = text.toLowerCase();
  const found: string[] = [];

  for (const claim of TIMING_CLAIMS) {
    if (lower.includes(claim)) {
      found.push(claim);
    }
  }

  return { found: found.length > 0, claims: found };
}

/**
 * Check if timing claim is allowed via Wellfound exception
 */
export function isWellfoundAllowed(text: string, hasWellfoundData: boolean): boolean {
  if (!hasWellfoundData) return false;

  const lower = text.toLowerCase();
  return WELLFOUND_FACTUAL_CLAIMS.some(claim => lower.includes(claim));
}

// =============================================================================
// CANONICAL FALLBACKS — Mode-aware variables only, NO timing claims
// =============================================================================

export const CANONICAL_FALLBACKS = {
  demand: (ctx: IntroContext, mode: ConnectorMode = 'b2b_general'): string => {
    // PHASE-1 FIX: Always use mode-specific language, never generic "companies"
    const industryPhrase = MODE_INDUSTRY_PHRASES[mode].demand;
    const opening = CANONICAL_OPENINGS.demand;

    // If presignal exists, use presignal-aware structure
    if (hasValidPresignal(ctx.preSignalContext)) {
      const bridge = transformPresignalToBridge(ctx.preSignalContext!);
      return `Hey ${ctx.firstName} — ${opening}. ${bridge}. ${ctx.company} came up as a fit. I can make the intro if it's useful — if not, no worries.`;
    }

    // Neutral fallback — NO timing claims
    return `Hey ${ctx.firstName} — ${opening}. I'm connecting a small number of ${industryPhrase} with people who work in this space. ${ctx.company} came up as a clean fit. I can make the intro if it's useful — if not, no worries.`;
  },

  supply: (ctx: IntroContext, mode: ConnectorMode = 'b2b_general'): string => {
    const opening = CANONICAL_OPENINGS.supply;

    // If presignal exists, use presignal-aware structure
    if (hasValidPresignal(ctx.preSignalContext)) {
      const bridge = transformPresignalToBridge(ctx.preSignalContext!);
      return `Hey ${ctx.firstName} — ${opening}. ${bridge}. Your work came up as a fit. Happy to connect you if you're interested.`;
    }

    // Neutral fallback — NO timing claims
    return `Hey ${ctx.firstName} — ${opening}. I'm introducing people in your space to a few companies where there's clear overlap. Your work stood out. Happy to connect you if you're interested.`;
  },
};

/**
 * Transform operator presignal into a bridge phrase
 * "I spoke with X about Y" → "I've been speaking with X about Y"
 */
function transformPresignalToBridge(presignal: string): string {
  const trimmed = presignal.trim();

  // If already starts with a bridge pattern, use as-is
  if (/^(i've been|after a|this came up|while)/i.test(trimmed)) {
    return trimmed;
  }

  // If starts with "spoke with" or "talked to", transform
  if (/^(spoke|talked)/i.test(trimmed)) {
    return `I've been speaking ${trimmed.replace(/^(spoke|talked)\s+(with|to)/i, 'with')}`;
  }

  // Default: wrap in "This came up while..."
  return `This came up while ${trimmed}`;
}

// =============================================================================
// COMPOSE INTRO — Single entry point for ALL intro generation
// =============================================================================

/**
 * Compose a doctrine-compliant intro.
 * This is the ONLY function that should be called for fallback intros.
 *
 * - If presignal exists: uses presignal-aware structure
 * - If no presignal: uses neutral structure (no timing claims)
 * - Mode only affects industry phrasing, NOT structure
 */
export function composeIntro(args: ComposeIntroArgs): string {
  const { side, mode = 'b2b_general', ctx } = args;

  if (side === 'demand') {
    return CANONICAL_FALLBACKS.demand(ctx, mode);
  }

  return CANONICAL_FALLBACKS.supply(ctx, mode);
}

// =============================================================================
// VALIDATION — Use before sending
// =============================================================================

/**
 * Validate intro against doctrine before send.
 * Returns { valid: true } or { valid: false, reason: string, claims: string[] }
 */
export function validateIntro(
  text: string,
  ctx: IntroContext
): { valid: true } | { valid: false; reason: string; claims: string[] } {
  const timingCheck = containsTimingClaim(text);

  if (timingCheck.found) {
    // Check if timing claim is earned via presignal
    if (hasValidPresignal(ctx.preSignalContext)) {
      return { valid: true };
    }

    // Check if timing claim is allowed via Wellfound exception
    if (isWellfoundAllowed(text, ctx.hasWellfoundData ?? false)) {
      return { valid: true };
    }

    // Timing claim without evidence — BLOCKED
    return {
      valid: false,
      reason: 'Timing claims require presignal or Wellfound evidence',
      claims: timingCheck.claims,
    };
  }

  return { valid: true };
}

// =============================================================================
// PROMPT BUILDER — For AI generation paths
// =============================================================================

/**
 * Build canonical prompt for AI intro generation.
 * All AI paths must use this prompt header + examples.
 */
export function buildCanonicalPrompt(args: {
  side: IntroSide;
  ctx: IntroContext;
  mode?: ConnectorMode;
}): string {
  const { side, ctx, mode = 'b2b_general' } = args;
  const hasPresignal = hasValidPresignal(ctx.preSignalContext);

  const examples = side === 'demand'
    ? [...CANONICAL_EXAMPLES.demand.neutral, ...(hasPresignal ? CANONICAL_EXAMPLES.demand.presignal : [])]
    : [...CANONICAL_EXAMPLES.supply.neutral, ...(hasPresignal ? CANONICAL_EXAMPLES.supply.presignal : [])];

  const exampleBlock = examples.map((ex, i) => {
    const presignalLine = 'presignal' in ex ? `\nOperator context: ${ex.presignal}` : '\nOperator context: none';
    return `EXAMPLE ${i + 1}:\nContext: ${ex.ctx}${presignalLine}\nOutput: "${ex.output}"`;
  }).join('\n\n');

  const presignalContextLine = hasPresignal
    ? `\n=== OPERATOR CONTEXT (CRITICAL — weave into bridge) ===\n${ctx.preSignalContext!.trim()}\n`
    : '\n=== NO OPERATOR CONTEXT — use neutral formula only ===\n';

  const opening = side === 'demand' ? CANONICAL_OPENINGS.demand : CANONICAL_OPENINGS.supply;
  const closePhrase = side === 'demand'
    ? 'I can make the intro if it\'s useful — if not, no worries.'
    : 'Happy to connect you if you\'re interested.';

  // PHASE-1 FIX: Include mode-specific industry phrase so AI knows the niche
  const modeIndustryPhrase = MODE_INDUSTRY_PHRASES[mode][side];

  return `Write a 2-sentence intro email for a connector reaching out (${side.toUpperCase()} side).

=== CONTEXT ===
CONTACT: ${ctx.firstName}${ctx.contactTitle ? `, ${ctx.contactTitle}` : ''} at ${ctx.company}
${ctx.industry ? `INDUSTRY: ${ctx.industry}` : ''}
MODE: ${mode} (use "${modeIndustryPhrase}" when referencing the type of ${side === 'demand' ? 'companies' : 'providers'})
${ctx.matchReason ? `WHY MATCHED: ${ctx.matchReason} (weave this into "clear overlap" or "clean fit" phrasing)` : ''}
${presignalContextLine}
=== CONNECTOR DOCTRINE ===
You are a connector curating introductions.
- NEVER use timing claims (scaling, growing, expanding, hiring, building out, ramping) unless operator context explicitly provides them
- NEVER reveal the provider type (recruiter, agency, consultant, vendor)
- Use DESCRIPTIVE positioning only (what they work in, not what they're doing NOW)
- Use OPT-OUT close, not permission-asking close

=== DUAL FORMULA (CRITICAL) ===

WITHOUT operator context (neutral):
"Hey [Name] — ${opening}. I'm connecting a small number of [X] with [Y] in this space. [Company] came up as a clean fit. ${closePhrase}"

WITH operator context (presignal-aware):
"Hey [Name] — ${opening}. [Reference from context — e.g., 'I've been speaking with...', 'After a conversation with...', 'This came up while...']. [Company] came up as a fit. ${closePhrase}"

=== CANONICAL EXAMPLES ===

${exampleBlock}

=== FORBIDDEN WORDS (HARD BLOCK) ===
${TIMING_CLAIMS.slice(0, 30).join(', ')}

=== RULES ===
1. Exactly 2 sentences
2. Start with "Hey [firstName] — ${opening}."
3. If NO operator context: use "I'm connecting a small number of [X] with [Y]"
4. If operator context EXISTS: use "I've been speaking with..." / "After a conversation with..." / "This came up while..."
5. End with: "${closePhrase}"
6. NEVER use forbidden words without operator context earning them
7. The word "noticed" is BANNED — never use it

=== OUTPUT ===
Write ONLY the intro. No explanation. No quotes around it.`;
}
