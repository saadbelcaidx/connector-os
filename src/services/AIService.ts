interface AIConfig {
  openaiKey?: string;
  azureKey?: string;
  azureEndpoint?: string;
  claudeKey?: string;
  model: string;
}

type AIProvider = 'openai' | 'azure' | 'claude' | 'none';

function selectProvider(config: AIConfig | null): { provider: AIProvider; apiKey: string | null } {
  if (!config) {
    return { provider: 'none', apiKey: null };
  }

  if (config.claudeKey && config.claudeKey.trim() !== '') {
    return { provider: 'claude', apiKey: config.claudeKey };
  }

  if (config.openaiKey && config.openaiKey.trim() !== '') {
    return { provider: 'openai', apiKey: config.openaiKey };
  }

  if (config.azureKey && config.azureKey.trim() !== '' && config.azureEndpoint && config.azureEndpoint.trim() !== '') {
    return { provider: 'azure', apiKey: config.azureKey };
  }

  return { provider: 'none', apiKey: null };
}

function getModelForProvider(provider: AIProvider, requestedModel: string): string {
  if (provider === 'claude') {
    if (requestedModel.includes('claude')) {
      return requestedModel;
    }
    return 'claude-3.5-sonnet';
  }

  if (provider === 'openai' || provider === 'azure') {
    if (requestedModel.includes('gpt')) {
      return requestedModel;
    }
    return 'gpt-4.1-mini';
  }

  return requestedModel;
}

async function callOpenAI(apiKey: string, model: string, prompt: string): Promise<string> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.9,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AIService] OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  } catch (error) {
    console.error('[AIService] OpenAI call failed:', error);
    throw error;
  }
}

async function callClaude(apiKey: string, model: string, prompt: string): Promise<string> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 1000,
        temperature: 0.9,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AIService] Claude API error:', response.status, errorText);
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    return data.content[0]?.text || '';
  } catch (error) {
    console.error('[AIService] Claude call failed:', error);
    throw error;
  }
}

async function callAzureOpenAI(apiKey: string, endpoint: string, prompt: string): Promise<string> {
  try {
    let url = endpoint;
    if (!url.includes('api-version')) {
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}api-version=2024-02-15-preview`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.9,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AIService] Azure OpenAI API error:', response.status, errorText);
      throw new Error(`Azure OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  } catch (error) {
    console.error('[AIService] Azure OpenAI call failed:', error);
    throw error;
  }
}

async function callAI(config: AIConfig, prompt: string): Promise<string | null> {
  const { provider, apiKey } = selectProvider(config);

  if (provider === 'none' || !apiKey) {
    console.log('[AIService] No AI provider configured, skipping AI call');
    return null;
  }

  const model = getModelForProvider(provider, config.model);

  try {
    if (provider === 'claude') {
      return await callClaude(apiKey, model, prompt);
    } else if (provider === 'openai') {
      return await callOpenAI(apiKey, model, prompt);
    } else if (provider === 'azure') {
      if (!config.azureEndpoint) {
        console.error('[AIService] Azure endpoint not configured');
        return null;
      }
      return await callAzureOpenAI(apiKey, config.azureEndpoint, prompt);
    }

    return null;
  } catch (error) {
    console.error('[AIService] AI call failed:', error);
    return null;
  }
}

function extractIndustry(companyName: string): string {
  const lower = companyName.toLowerCase();

  if (lower.includes('gaming') || lower.includes('game') || lower.includes('studios') || lower.includes('entertainment')) {
    return 'gaming';
  }
  if (lower.includes('fintech') || lower.includes('bank') || lower.includes('financial') || lower.includes('capital')) {
    return 'fintech';
  }
  if (lower.includes('saas') || lower.includes('software') || lower.includes('cloud')) {
    return 'SaaS';
  }
  if (lower.includes('health') || lower.includes('medical') || lower.includes('pharma')) {
    return 'healthcare';
  }
  if (lower.includes('retail') || lower.includes('commerce') || lower.includes('marketplace')) {
    return 'retail';
  }
  if (lower.includes('logistics') || lower.includes('shipping') || lower.includes('supply')) {
    return 'logistics';
  }
  if (lower.includes('security') || lower.includes('cyber')) {
    return 'cybersecurity';
  }
  if (lower.includes('ai') || lower.includes('ml') || lower.includes('data')) {
    return 'AI/ML';
  }

  return 'tech';
}

function inferCompanyType(employeeCount?: number): string {
  if (!employeeCount) return 'companies';
  if (employeeCount <= 50) return 'startups';
  if (employeeCount <= 500) return 'mid-market companies';
  return 'established companies';
}

/**
 * Connector interface - for backward compatibility
 * Supply companies are now discovered dynamically, not hardcoded
 */
interface Connector {
  name: string;
  company: string;
  specialty: string;
  type?: string;
}

function generateSignalHook(signalSummary: string, momentum?: string): string {
  const lower = signalSummary.toLowerCase();
  const jobCount = parseInt(signalSummary.match(/(\d+)/)?.[1] || '0');

  if (lower.includes('funding')) {
    return 'now that the board expects more';
  }

  if (lower.includes('layoff')) {
    return 'when they need to cut costs';
  }

  if (lower.includes('job') || lower.includes('hiring') || lower.includes('role')) {
    if (momentum === 'Downward' || jobCount <= 5) {
      return 'when budgets tighten';
    }
    if (jobCount >= 10 && momentum === 'Upward') {
      return 'when they need to scale fast';
    }
    if (jobCount > 0) {
      return 'when the team\'s stretched thin';
    }
    return 'when hiring slows down';
  }

  return 'when they need to move quickly';
}

function buildHowYouHelp(
  painPointsSolved: string[],
  windowStatus: string
): string {
  const base = painPointsSolved && painPointsSolved.length > 0
    ? `I step in when ${painPointsSolved[0].toLowerCase()}`
    : 'I step in when work feels heavy';

  if (windowStatus === 'EARLY') {
    return base + '. I usually just check in and share what I see.';
  }
  if (windowStatus === 'OPEN') {
    return base + '. I help move fast when timing matters.';
  }
  return base + '.';
}

export interface IntroContext {
  personFirstName?: string;
  personFullName?: string;
  personTitle?: string;
  companyName?: string;
  companyDomain?: string;
  signalType?: string;
  signalSummary?: string;
  roleCount?: number;
  windowStatus?: 'EARLY' | 'BUILDING' | 'WATCH' | 'OPEN' | string;
  pressureProfile?: string;
  jobTitlesBeingHired?: string[];  // Job titles FROM SIGNAL - for connector selection
  // Dynamic supply company (discovered from Apify, not hardcoded)
  supplyCompany?: {
    name: string;
    domain: string;
    specialty?: string;
    description?: string;
  };
  connectorProfile?: {
    services_offered?: string[];
    industries_served?: string[];
    solves_for_roles?: string[];
    pain_points_solved?: string[];
    ideal_company_size?: string;
    geography?: string[];
  };
  providerMetadata?: {
    servicesDelivered?: string;
    idealClientType?: string;
    averageDealSize?: number;
    geographyServed?: string;
    nicheExpertise?: string;
  } | any;
  campaignMode?: 'pure_connector' | 'solution_provider' | 'network_orchestrator';
}

function describeSignalFallback(signalType?: string, roleCount?: number): string {
  if (signalType === 'jobs') {
    if (roleCount && roleCount > 1) return `${roleCount} new roles opened`;
    if (roleCount === 1) return 'one new role opened';
    return 'new hiring starting';
  }
  if (signalType === 'funding') return 'a fresh funding round hit';
  if (signalType === 'layoffs') return 'team cuts just happened';
  return 'something changed on your side';
}

function getWindowTone(status?: string): string {
  switch (status) {
    case 'OPEN': return 'time is good to move fast';
    case 'WATCH': return 'good time to check in';
    case 'BUILDING': return 'early but worth a soft touch';
    case 'EARLY':
    default: return 'early signal, gentle touch';
  }
}

function capitalizeFirstLetter(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function capitalizeCompanyName(name: string): string {
  if (!name) return name;
  return name
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Clean company name for use in intros
 * - Removes business suffixes (Inc, LLC, Corp, etc.)
 * - Removes "Source" suffix (e.g., "HYR Global Source" → "HYR Global")
 * - Converts ALL CAPS to Title Case
 * - Trims extra whitespace
 */
function cleanCompanyName(name: string): string {
  if (!name) return name;

  let cleaned = name.trim();

  // Check if ALL CAPS (more than 50% uppercase letters)
  const letters = cleaned.replace(/[^a-zA-Z]/g, '');
  const uppercaseCount = (cleaned.match(/[A-Z]/g) || []).length;
  const isAllCaps = letters.length > 2 && uppercaseCount / letters.length > 0.7;

  if (isAllCaps) {
    // Convert to Title Case
    cleaned = cleaned
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // Remove business suffixes (case-insensitive)
  const suffixes = [
    /\s*,?\s*Inc\.?$/i,
    /\s*,?\s*LLC\.?$/i,
    /\s*,?\s*L\.L\.C\.?$/i,
    /\s*,?\s*Corp\.?$/i,
    /\s*,?\s*Corporation$/i,
    /\s*,?\s*Ltd\.?$/i,
    /\s*,?\s*Limited$/i,
    /\s*,?\s*Co\.?$/i,
    /\s*,?\s*Company$/i,
    /\s*,?\s*PLC\.?$/i,
    /\s*,?\s*LP\.?$/i,
    /\s*,?\s*LLP\.?$/i,
  ];

  for (const suffix of suffixes) {
    cleaned = cleaned.replace(suffix, '');
  }

  // Remove "Source" when it appears at the end (e.g., "HYR Global Source")
  cleaned = cleaned.replace(/\s+Source$/i, '');

  // Trim extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

/**
 * Shorten a job title for use in intros
 * "Vice President of Engineering" -> "VP Engineering"
 * "Senior Software Engineering Manager" -> "Engineering Manager"
 * "Chief Technology Officer" -> "CTO"
 */
function shortenTitle(title: string): string {
  if (!title) return 'Hiring Lead';

  const t = title.trim();
  const tLower = t.toLowerCase();

  // C-level shortcuts - return immediately
  if (/chief technology officer|cto\b/i.test(t)) return 'CTO';
  if (/chief executive officer|ceo\b/i.test(t)) return 'CEO';
  if (/chief financial officer|cfo\b/i.test(t)) return 'CFO';
  if (/chief operating officer|coo\b/i.test(t)) return 'COO';
  if (/chief revenue officer|cro\b/i.test(t)) return 'CRO';
  if (/chief marketing officer|cmo\b/i.test(t)) return 'CMO';
  if (/chief product officer|cpo\b/i.test(t)) return 'CPO';
  if (/chief people officer|chro\b/i.test(t)) return 'CPO';

  // Extract role level
  let level = '';
  if (/\bvp\b|vice president/i.test(t)) level = 'VP';
  else if (/\bdirector\b/i.test(t)) level = 'Director';
  else if (/\bhead\b/i.test(t)) level = 'Head';
  else if (/\bmanager\b/i.test(t)) level = 'Manager';
  else if (/\blead\b/i.test(t)) level = 'Lead';
  else if (/\bfounder\b|co-founder/i.test(t)) level = 'Founder';
  else if (/\bowner\b/i.test(t)) level = 'Owner';
  else if (/\bpartner\b/i.test(t)) level = 'Partner';

  // Extract primary domain (first match wins)
  let domain = '';
  const domainPatterns: [RegExp, string][] = [
    [/engineer|development|software|tech/i, 'Engineering'],
    [/product\b/i, 'Product'],
    [/design|ux|ui\b/i, 'Design'],
    [/market/i, 'Marketing'],
    [/sales|revenue|business dev/i, 'Sales'],
    [/talent|recruiting|people|hr\b|human/i, 'Talent'],
    [/operations|ops\b/i, 'Operations'],
    [/finance|accounting/i, 'Finance'],
    [/customer|success|support/i, 'Customer'],
    [/partner/i, 'Partnerships'],
    [/growth/i, 'Growth'],
    [/data\b|analytics/i, 'Data'],
    [/security|infosec/i, 'Security'],
    [/legal|compliance/i, 'Legal'],
    [/affiliate/i, 'Affiliate'],
  ];

  for (const [pattern, name] of domainPatterns) {
    if (pattern.test(tLower)) {
      domain = name;
      break;
    }
  }

  // Build clean short title
  if (level && domain) {
    return `${domain} ${level}`;
  } else if (level) {
    return level;
  } else if (domain) {
    return `${domain} Lead`;
  }

  // Last resort: take first 2-3 meaningful words, no "..."
  const words = t.split(/[\s,&]+/).filter(w => w.length > 2 && !/^(and|the|of|for|at|in)$/i.test(w));
  if (words.length >= 2) {
    return words.slice(0, 2).join(' ');
  }
  if (words.length === 1) {
    return words[0];
  }

  return 'Hiring Lead';
}

export async function rewriteIntro(
  text: string,
  config: AIConfig | null,
  ctx?: IntroContext
): Promise<string> {
  if (!text || text.trim() === '') {
    return text;
  }

  const { provider, apiKey } = selectProvider(config);
  const model = getModelForProvider(provider, config?.model || 'gpt-4.1-mini');

  console.log('[AIService] rewriteIntro - Provider:', provider, 'Model:', model, 'Has API Key:', !!apiKey);

  const rawName = ctx?.personFirstName || ctx?.personFullName?.split(' ')[0] || 'there';
  const safeName = capitalizeFirstLetter(rawName);
  const rawCompany = ctx?.companyName || 'your team';
  const safeCompany = capitalizeCompanyName(rawCompany);
  const safeSignal = ctx?.signalSummary || describeSignalFallback(ctx?.signalType, ctx?.roleCount);

  const campaignMode = ctx?.campaignMode || 'solution_provider';

  // Use dynamically discovered supply company from context
  // NO hardcoded connectors - supply must be passed in
  let connector: { name: string; company: string; specialty: string; type?: string };

  if (ctx?.supplyCompany) {
    // Use the dynamically discovered supply company
    connector = {
      name: ctx.supplyCompany.name,
      company: ctx.supplyCompany.name, // Company name is the supply company name
      specialty: ctx.supplyCompany.specialty || ctx.supplyCompany.description || 'provides talent solutions',
      type: 'supply',
    };
  } else {
    // No supply company provided - use generic placeholder
    console.warn('[AIService] rewriteIntro: No supply company provided, using generic');
    connector = {
      name: 'a recruiting partner',
      company: 'recruiting partner',
      specialty: 'fills roles fast',
      type: 'supply',
    };
  }

  console.log('[Connector Selection]');
  console.log('Campaign Mode:', campaignMode);
  console.log('Signal Type:', ctx?.signalType);
  console.log('Connector Type:', connector.type || 'connector');
  console.log('Connector Name:', connector.name);
  console.log('Connector Company:', connector.company);
  console.log('Connector Specialty:', connector.specialty);

  if (!connector?.name || !connector?.company || !connector?.specialty) {
    throw new Error('Connector missing required fields for intro generation');
  }

  if (provider === 'none' || !apiKey) {
    console.warn('[AIService] rewriteIntro: No AI provider configured');

    if (campaignMode === 'solution_provider') {
      return `hey ${safeName} — noticed ${safeCompany} has ${safeSignal.toLowerCase()} — we ${connector.specialty.toLowerCase()}, interested?`;
    }

    return `hey ${safeName} — noticed ${safeCompany} has ${safeSignal.toLowerCase()} — i can connect you with ${connector.name} at ${connector.company} who ${connector.specialty.toLowerCase()}, interested?`;
  }

  const isProvider = campaignMode === 'solution_provider';

  const cleanCompanyName = safeCompany
    .replace(/\b(Inc\.?|LLC|Ltd\.?|Studios|Holdings)\b/gi, '')
    .trim();

  const connectorFirstName = connector.name.split(' ')[0];

  console.log('[Intro AI Input]', {
    person: safeName,
    company: cleanCompanyName,
    signal: safeSignal,
    connector: connectorFirstName,
    connectorCompany: connector.company,
    action: connector.specialty
  });

  const prompt = isProvider
    ? `
Write ONE sentence. STRICT MAX 130 CHARACTERS. COUNT CAREFULLY.

FORMAT:
"hey [firstName] — noticed [shortCompany] has [signal] — we [shortAction], interested?"

RULES (MANDATORY):
- STRICT MAX 130 characters total - count every character
- One sentence only
- First names only (never last names)
- SHORT company names only (drop: Inc, LLC, Ltd, Studios, Holdings)
- Action must be VERY SHORT (3-4 words max):
  Good: "place devs fast", "build eng teams", "fix ops"
  Bad: "help teams with their hiring needs"
- End EXACTLY with: "interested?"
- Casual lowercase tone
- No corporate words
- No commas after dashes

DATA (YOU MUST USE):
Person first name: ${safeName}
Company: ${cleanCompanyName}
Signal: ${safeSignal}
What we do: ${connector.specialty}

BAD (NEVER DO):
❌ "open to a quick intro?" or "open to a quick chat?"
❌ over 130 chars
❌ last names
❌ long action phrases

GOOD EXAMPLE (117 chars):
"hey Paolo — noticed Keywords has 3 roles — we place devs fast, interested?"

OUTPUT: Only the sentence, no quotes, no explanation.
`
    : `
Write ONE sentence. STRICT MAX 130 CHARACTERS. COUNT CAREFULLY.

FORMAT:
"hey [firstName] — noticed [shortCompany] has [signal] — i can connect you with [connectorFirstName] at [connectorCompany] who [shortAction], interested?"

RULES (MANDATORY):
- STRICT MAX 130 characters total - count every character
- One sentence only
- First names only (never last names)
- SHORT company names only (drop: Inc, LLC, Ltd, Studios, Holdings)
- Action must be VERY SHORT (3-4 words max):
  Good: "places devs fast", "builds eng teams", "fixes ops"
  Bad: "helps teams with their hiring needs"
- End EXACTLY with: "interested?"
- Casual lowercase tone
- No corporate words
- No commas after dashes

DATA (YOU MUST USE):
Person first name: ${safeName}
Company: ${cleanCompanyName}
Signal: ${safeSignal}
Connector first name: ${connectorFirstName}
Connector company: ${connector.company}
Connector action: ${connector.specialty}

BAD (NEVER DO):
❌ "open to a quick intro?"
❌ "who helps with this"
❌ over 130 chars
❌ last names

GOOD EXAMPLE (124 chars):
"hey Paolo — noticed Keywords has 3 roles — i can connect you with Maya at Toptal who places devs fast, interested?"

OUTPUT: Only the sentence, no quotes, no explanation.
`;

  try {
    const raw = await callAI(config, prompt);
    let intro = (raw || '').replace(/\s+/g, ' ').trim();

    const genericPhrases = [
      'helps with this',
      'a team',
      'someone who',
      'assists with',
      'supports teams',
      'works on'
    ];

    const hasGenericPhrase = genericPhrases.some(phrase => intro.toLowerCase().includes(phrase));

    if (!intro || hasGenericPhrase || !intro.includes(connectorFirstName) || !intro.includes(connector.company)) {
      console.warn('[AIService] Generated intro was generic or missing connector details, using fallback');
      return `hey ${safeName} — noticed ${cleanCompanyName} has ${safeSignal.toLowerCase()} — i can connect you with ${connectorFirstName} at ${connector.company} who ${connector.specialty.toLowerCase()}, interested?`;
    }

    console.log('[Intro Length]', intro.length, intro);

    return intro;
  } catch (error) {
    console.error('[AIService] rewriteIntro failed:', error);
    if (isProvider) {
      return `hey ${safeName} — noticed ${cleanCompanyName} has ${safeSignal.toLowerCase()} — we ${connector.specialty.toLowerCase()}, interested?`;
    }
    return `hey ${safeName} — noticed ${cleanCompanyName} has ${safeSignal.toLowerCase()} — i can connect you with ${connectorFirstName} at ${connector.company} who ${connector.specialty.toLowerCase()}, interested?`;
  }
}

export async function rewriteInsight(
  original: string,
  context: {
    signalStrength?: number;
    pressureForecast?: string;
    windowStatus?: string;
  },
  config: AIConfig | null
): Promise<string> {
  if (!original || original.trim() === '') {
    return original;
  }

  if (!isAIConfigured(config)) {
    console.warn('[AIService] rewriteInsight: AI not configured');
    return original;
  }

  const { provider, apiKey } = selectProvider(config);
  const model = getModelForProvider(provider, config?.model || 'gpt-4.1-mini');

  console.log('[AIService] rewriteInsight - Provider:', provider, 'Model:', model, 'Has API Key:', !!apiKey);

  const contextLines = [
    `Original insight: "${original}"`,
    context.signalStrength != null ? `Signal strength: ${context.signalStrength}/100` : '',
    context.pressureForecast ? `Forecast: ${context.pressureForecast}` : '',
    context.windowStatus ? `Window status: ${context.windowStatus}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = `You are an operator-level B2B strategist. Rewrite the following insight to be:
- clear and concrete
- under 3 sentences
- focused on pressure, timing, and leverage
Do NOT add emojis or hype. Keep tone calm, analytical.

${contextLines}

Rewritten insight:`;

  try {
    const result = await callAI(config, prompt);

    if (!result || result.trim() === '') {
      console.warn('[AIService] rewriteInsight: No result from AI');
      return original;
    }

    const trimmed = result.trim();

    if (trimmed === original.trim()) {
      console.warn('[AIService] rewriteInsight: AI returned identical text');
    }

    return trimmed;
  } catch (error) {
    console.warn('[AIService] rewriteInsight failed, falling back to original insight', error);
    return original;
  }
}

export async function cleanSignal(rawJson: any, signalType: string, config: AIConfig | null): Promise<any> {
  if (!rawJson || !config) {
    return rawJson;
  }

  const jsonString = typeof rawJson === 'string' ? rawJson : JSON.stringify(rawJson, null, 2);

  const prompt = `You are a data cleaning assistant. The following is a raw API response for a ${signalType} signal. Extract the most relevant information and return a clean, structured JSON object with only the key fields.

Expected fields for ${signalType}:
- If jobs: company, title, location, posted_date, description (brief)
- If funding: company, amount, round, investors, date
- If layoffs: company, count, date, industry
- If hiring: trend, percentage, industry, period
- If tech: technologies (array), categories, company

Raw response:
${jsonString}

Return ONLY the cleaned JSON object, no additional text:`;

  try {
    const result = await callAI(config, prompt);

    if (!result) {
      return rawJson;
    }

    const cleanedJson = JSON.parse(result);
    return cleanedJson;
  } catch (error) {
    console.error('[AIService] cleanSignal failed, returning original:', error);
    return rawJson;
  }
}

export async function enrichMetadata(signal: any, providerContext: string, config: AIConfig | null): Promise<string> {
  if (!signal || !config) {
    return 'No insights available.';
  }

  const signalString = typeof signal === 'string' ? signal : JSON.stringify(signal, null, 2);

  const prompt = `You are a business intelligence analyst. Based on the following signal data from ${providerContext}, provide 2-3 actionable business insights in bullet points. Focus on what this means for sales/outreach strategy.

Signal data:
${signalString}

Business insights (bullet points only):`;

  try {
    const result = await callAI(config, prompt);

    if (!result) {
      return 'AI insights unavailable.';
    }

    return result.trim();
  } catch (error) {
    console.error('[AIService] enrichMetadata failed:', error);
    return 'AI insights unavailable.';
  }
}

export async function forecastWindow(
  signalHistory: any[],
  momentum: string,
  config: AIConfig
): Promise<{ window: string; confidence: string; reasoning: string }> {
  if (!signalHistory || signalHistory.length === 0) {
    return {
      window: 'Unknown',
      confidence: 'Low',
      reasoning: 'Insufficient historical data',
    };
  }

  const historyString = JSON.stringify(signalHistory.slice(-10), null, 2);

  const prompt = `You are a data science forecasting assistant. Based on the following signal history and current momentum (${momentum}), predict the optimal outreach window.

Signal history:
${historyString}

Provide your forecast in the following JSON format:
{
  "window": "Open Now" | "Opening Soon" | "Cooling Off" | "Wait",
  "confidence": "High" | "Medium" | "Low",
  "reasoning": "1-2 sentence explanation"
}

Return ONLY the JSON object:`;

  try {
    const result = await callAI(config, prompt);

    if (!result) {
      return {
        window: 'Unknown',
        confidence: 'Low',
        reasoning: 'AI forecasting unavailable',
      };
    }

    const forecast = JSON.parse(result);
    return {
      window: forecast.window || 'Unknown',
      confidence: forecast.confidence || 'Low',
      reasoning: forecast.reasoning || 'No reasoning provided',
    };
  } catch (error) {
    console.error('[AIService] forecastWindow failed:', error);
    return {
      window: 'Unknown',
      confidence: 'Low',
      reasoning: 'AI forecasting failed',
    };
  }
}

export async function cleanApiResponse(rawResponse: any, signalType: string, config: AIConfig | null): Promise<any> {
  if (!rawResponse || !config) {
    return rawResponse;
  }

  const jsonString = typeof rawResponse === 'string' ? rawResponse : JSON.stringify(rawResponse, null, 2);

  let prompt = '';

  switch (signalType) {
    case 'jobs':
      prompt = `You are a data cleaning assistant. Extract and structure the following job posting data. Return ONLY a clean JSON object with these fields: company (string), title (string), location (string), posted_date (string), description_brief (string, max 100 chars).

Raw response:
${jsonString}

Clean JSON:`;
      break;

    case 'funding':
      prompt = `You are a data cleaning assistant. Extract and structure the following funding data. Return ONLY a clean JSON object with these fields: company (string), amount (string), round (string), investors (array of strings), date (string).

Raw response:
${jsonString}

Clean JSON:`;
      break;

    case 'layoffs':
      prompt = `You are a data cleaning assistant. Extract and structure the following layoffs data. Return ONLY a clean JSON object with these fields: company (string), count (number), date (string), industry (string), reason_brief (string, max 80 chars).

Raw response:
${jsonString}

Clean JSON:`;
      break;

    case 'hiring':
      prompt = `You are a data cleaning assistant. Extract and structure the following hiring velocity data. Return ONLY a clean JSON object with these fields: trend (string), percentage (number), industry (string), period (string), context (string, max 100 chars).

Raw response:
${jsonString}

Clean JSON:`;
      break;

    case 'tech':
      prompt = `You are a data cleaning assistant. Extract and structure the following tech adoption data. Return ONLY a clean JSON object with these fields: technologies (array of strings), categories (array of strings), company (string), adoption_trend (string).

Raw response:
${jsonString}

Clean JSON:`;
      break;

    default:
      return rawResponse;
  }

  try {
    const result = await callAI(config, prompt);

    if (!result) {
      console.warn('[AIService] cleanApiResponse: No result from AI, returning original');
      return rawResponse;
    }

    const cleaned = JSON.parse(result);
    return cleaned;
  } catch (error) {
    console.error('[AIService] cleanApiResponse failed:', error);
    return rawResponse;
  }
}

export function isAIConfigured(config: AIConfig | null): boolean {
  if (!config) return false;
  return selectProvider(config).provider !== 'none';
}

export function getActiveProvider(config: AIConfig | null): string {
  if (!config) return 'None';

  const { provider } = selectProvider(config);

  if (provider === 'claude') return 'Claude';
  if (provider === 'openai') return 'OpenAI';
  if (provider === 'azure') return 'Azure OpenAI';
  return 'None';
}

export async function generateWhyNow(
  config: AIConfig | null,
  context: {
    companyName: string;
    jobTitle?: string;
    jobDescription?: string;
    roleCount: number;
    companySize: number;
    signalType: string;
  }
): Promise<string> {
  if (!isAIConfigured(config)) {
    return 'Something changed recently that is making work harder for the team.';
  }

  const jobInfo = context.jobTitle || context.jobDescription
    ? `\nJob Title: ${context.jobTitle || 'Not provided'}\nJob Description: ${context.jobDescription?.substring(0, 500) || 'Not provided'}`
    : '';

  const prompt = `You analyze business signals to explain why a company needs help RIGHT NOW.

Company: ${context.companyName}
Company Size: ${context.companySize} employees
Signal: ${context.signalType}
Open Roles: ${context.roleCount}${jobInfo}

Write ONE short sentence (under 15 words) explaining why this signal means they need help now.

Rules:
- Talk calm and direct
- No hype or big words
- Focus on the real pressure they feel
- Use simple, human language
- No emojis

Examples of good "why now":
- "One open role at a big company usually means a specific team needs help."
- "Five roles opening at once usually means the team feels stretched."
- "New funding usually means pressure to move fast."

Now write ONE sentence for ${context.companyName}. Return ONLY the sentence.`;

  try {
    const result = await callAI(config, prompt);
    if (!result || result.trim() === '') {
      return 'Something changed recently that is making work harder for the team.';
    }
    return result.trim();
  } catch (error) {
    console.error('[AIService] generateWhyNow failed:', error);
    return 'Something changed recently that is making work harder for the team.';
  }
}

export async function generateWhyYou(
  config: AIConfig | null,
  context: {
    buyerTitle: string;
    companyName: string;
    jobTitle?: string;
    jobDescription?: string;
    connectorServices?: string[];
  }
): Promise<string> {
  if (!isAIConfigured(config)) {
    return `${context.buyerTitle}s usually deal with this before anyone else.`;
  }

  const jobInfo = context.jobTitle || context.jobDescription
    ? `\nJob Posted: ${context.jobTitle || 'Not provided'}\nDescription: ${context.jobDescription?.substring(0, 300) || 'Not provided'}`
    : '';

  const servicesInfo = context.connectorServices && context.connectorServices.length > 0
    ? `\nConnector offers: ${context.connectorServices.join(', ')}`
    : '';

  const prompt = `You explain why a specific role (like CEO, VP Sales) is the right person to talk to about a business need.

Company: ${context.companyName}
Target Role: ${context.buyerTitle}${jobInfo}${servicesInfo}

Write ONE short sentence (under 15 words) explaining why this role cares about this problem.

Rules:
- Talk calm and direct
- No hype or big words
- Focus on what THIS role actually worries about
- Use simple, human language
- No emojis

Examples of good "why you":
- "CEOs usually deal with scaling pressure before anyone else."
- "VPs of Sales feel hiring gaps when quota is on the line."
- "CTOs handle this when the roadmap can't wait."

Now write ONE sentence for the ${context.buyerTitle} at ${context.companyName}. Return ONLY the sentence.`;

  try {
    const result = await callAI(config, prompt);
    if (!result || result.trim() === '') {
      return `${context.buyerTitle}s usually deal with this before anyone else.`;
    }
    return result.trim();
  } catch (error) {
    console.error('[AIService] generateWhyYou failed:', error);
    return `${context.buyerTitle}s usually deal with this before anyone else.`;
  }
}

export async function generateDemandIntro(
  config: AIConfig | null,
  context: {
    firstName: string;
    companyName: string;
    signalDetail: string;
    roleLabel?: string;  // Job title from signal (e.g., "Software Engineer")
    roleCount?: number;  // Number of roles
    jobTitles?: string[];  // All job titles being hired (for more context)
  },
  connector: {
    name: string;
    company: string;
    specialty: string;
  }
): Promise<string> {
  const { provider, apiKey } = selectProvider(config);

  const firstName = capitalizeFirstLetter(context?.firstName || 'there');
  const companyName = cleanCompanyName(context?.companyName || 'the company');
  const roleCount = context?.roleCount || 1;
  const jobTitles = context?.jobTitles || [];

  // Build a detailed role description from job titles
  // e.g., "3 roles (Backend Engineer, Frontend Developer, DevOps)"
  const buildRoleDescription = (): string => {
    if (jobTitles.length === 0 && !context?.roleLabel) {
      return roleCount === 1 ? 'a new role' : `${roleCount} open roles`;
    }

    // Clean and shorten job titles for the intro - NEVER use "..."
    const shortenJobTitle = (title: string): string => {
      if (!title) return 'Role';
      let t = title.trim();

      // Remove common prefixes/seniority
      t = t.replace(/^(senior|sr\.?|junior|jr\.?|lead|staff|principal|head of|vp of|director of)\s+/i, '');

      // Remove anything after dash, comma, or parenthesis (team/department info)
      t = t.replace(/\s*[-–—,\(].*$/, '');

      // Direct replacements for common titles
      const replacements: [RegExp, string][] = [
        [/^software engineer.*$/i, 'Software Eng'],
        [/^software developer.*$/i, 'Software Dev'],
        [/^backend engineer.*$/i, 'Backend Eng'],
        [/^frontend engineer.*$/i, 'Frontend Eng'],
        [/^front.?end (engineer|developer).*$/i, 'Frontend Eng'],
        [/^back.?end (engineer|developer).*$/i, 'Backend Eng'],
        [/^full.?stack (engineer|developer).*$/i, 'Fullstack Eng'],
        [/^data engineer.*$/i, 'Data Eng'],
        [/^data scientist.*$/i, 'Data Scientist'],
        [/^data analyst.*$/i, 'Data Analyst'],
        [/^analytics engineer.*$/i, 'Analytics Eng'],
        [/^machine learning.*$/i, 'ML Engineer'],
        [/^ml engineer.*$/i, 'ML Engineer'],
        [/^devops engineer.*$/i, 'DevOps Eng'],
        [/^sre.*$/i, 'SRE'],
        [/^site reliability.*$/i, 'SRE'],
        [/^platform engineer.*$/i, 'Platform Eng'],
        [/^infrastructure engineer.*$/i, 'Infra Eng'],
        [/^cloud engineer.*$/i, 'Cloud Eng'],
        [/^security engineer.*$/i, 'Security Eng'],
        [/^product manager.*$/i, 'PM'],
        [/^product owner.*$/i, 'Product Owner'],
        [/^project manager.*$/i, 'Project Mgr'],
        [/^engineering manager.*$/i, 'Eng Manager'],
        [/^account executive.*$/i, 'AE'],
        [/^account manager.*$/i, 'Account Mgr'],
        [/^sales development.*$/i, 'SDR'],
        [/^business development.*$/i, 'BD'],
        [/^customer success.*$/i, 'CS'],
        [/^ux designer.*$/i, 'UX Designer'],
        [/^ui designer.*$/i, 'UI Designer'],
        [/^product designer.*$/i, 'Designer'],
        [/^graphic designer.*$/i, 'Designer'],
        [/^marketing manager.*$/i, 'Marketing Mgr'],
        [/^content (writer|manager|strategist).*$/i, 'Content'],
        [/^qa engineer.*$/i, 'QA Eng'],
        [/^quality assurance.*$/i, 'QA'],
        [/^mobile (developer|engineer).*$/i, 'Mobile Dev'],
        [/^ios (developer|engineer).*$/i, 'iOS Dev'],
        [/^android (developer|engineer).*$/i, 'Android Dev'],
        [/^react (developer|engineer).*$/i, 'React Dev'],
        [/^node\.?js (developer|engineer).*$/i, 'Node Dev'],
        [/^python (developer|engineer).*$/i, 'Python Dev'],
        [/^java (developer|engineer).*$/i, 'Java Dev'],
        [/^golang (developer|engineer).*$/i, 'Go Dev'],
        [/^go (developer|engineer).*$/i, 'Go Dev'],
      ];

      for (const [pattern, replacement] of replacements) {
        if (pattern.test(t)) {
          return replacement;
        }
      }

      // If no match, extract first meaningful word(s) - max 15 chars, no "..."
      const words = t.split(/\s+/).filter(w => w.length > 1 && !/^(and|the|of|for|at|in|a|an)$/i.test(w));
      if (words.length >= 2) {
        const twoWords = words.slice(0, 2).join(' ');
        if (twoWords.length <= 15) return twoWords;
        return words[0].substring(0, 12); // Single word, capped
      }
      if (words.length === 1) {
        return words[0].length <= 15 ? words[0] : words[0].substring(0, 12);
      }

      return 'Role';
    };

    // Get unique shortened titles
    const allTitles = jobTitles.length > 0 ? jobTitles : (context?.roleLabel ? [context.roleLabel] : []);
    const uniqueTitles = [...new Set(allTitles.map(t => shortenJobTitle(t)))];

    if (uniqueTitles.length === 0) {
      return roleCount === 1 ? 'a new role' : `${roleCount} open roles`;
    }

    if (uniqueTitles.length === 1) {
      const title = uniqueTitles[0];
      return roleCount === 1 ? `a ${title} role` : `${roleCount} ${title} roles`;
    }

    // Multiple distinct roles - show count + top titles
    const displayTitles = uniqueTitles.slice(0, 3).join(', ');
    if (uniqueTitles.length > 3) {
      return `${roleCount} roles (${displayTitles}, +${uniqueTitles.length - 3} more)`;
    }
    return `${roleCount} roles (${displayTitles})`;
  };

  const roleDescription = buildRoleDescription();
  const providerName = connector?.name || 'a recruiting partner';
  const providerSpecialty = connector?.specialty || 'fills these roles fast';

  // CANONICAL TEMPLATE - no AI modification
  // Includes: count, specific roles, provider info
  const canonicalIntro = `hey ${firstName} — saw ${companyName} hiring for ${roleDescription} — I know someone at ${providerName} who ${providerSpecialty}, want an intro?`;

  console.log(`[AIService] generateDemandIntro - ${roleCount} roles, titles: ${jobTitles.join(', ')}`);

  // Return canonical template directly - no AI needed
  // This ensures consistent, predictable output with real job details
  return canonicalIntro;
}

export async function generateSupplyIntro(
  config: AIConfig | null,
  demandContact: {
    company_name: string;
    person_name: string;
    title: string;
  },
  signal: {
    summary: string;
    fitReason?: string;
    roleCount?: number;
    roleLabel?: string;
    hireCategory?: string; // engineering, sales, marketing, etc.
  },
  supplyContact: {
    name: string;
  },
  providerInfo?: {
    name: string;
    specialty?: string;
  }
): Promise<string> {
  const { provider, apiKey } = selectProvider(config);

  // Build the supply intro - this goes TO the supply contact (recruiter)
  // ABOUT the demand company and demand contact
  const companyName = cleanCompanyName(demandContact?.company_name || 'a company');
  const demandFullName = demandContact?.person_name || 'the hiring contact';
  const demandTitle = demandContact?.title || 'decision maker';
  const supplyFirstName = capitalizeFirstLetter((supplyContact?.name || 'there').split(' ')[0]);

  // Use hireCategory directly if provided, otherwise detect from signal
  let roleCategory = signal?.hireCategory || '';
  if (!roleCategory || roleCategory === 'unknown') {
    const text = `${signal?.roleLabel || ''} ${signal?.summary || ''}`.toLowerCase();
    if (/engineer|developer|software|devops|backend|frontend|fullstack/.test(text)) roleCategory = 'engineering';
    else if (/sales|account|sdr|bdr|revenue/.test(text)) roleCategory = 'sales';
    else if (/marketing|growth|content/.test(text)) roleCategory = 'marketing';
    else if (/finance|accounting/.test(text)) roleCategory = 'finance';
    else roleCategory = 'engineering'; // default
  }

  // CANONICAL SUPPLY INTRO TEMPLATE
  const shortTitle = shortenTitle(demandTitle);
  const contactRef = `${demandFullName} (${shortTitle})`;

  // Use provider company name if available
  const providerName = providerInfo?.name || '';
  const providerMention = providerName ? ` at ${providerName}` : '';

  // Template includes provider name for personalization
  const canonicalIntro = `hey ${supplyFirstName} — ${companyName} is actively hiring for ${roleCategory} roles. ${contactRef} is the hiring owner. Thought your team${providerMention} could be a strong fit — want me to connect you?`;

  console.log(`[AIService] generateSupplyIntro - Supply: ${supplyFirstName}${providerMention}, Demand: ${demandFullName}, Category: ${roleCategory}`);

  return canonicalIntro;
}

export interface ParsedJobData {
  company_name: string;
  job_titles: string[];
  job_count: number;
}

export interface GenericJobsParseResult {
  companies: ParsedJobData[];
  total_jobs: number;
  raw_response_type: string;
}

export async function parseGenericJobsAPI(
  jsonData: any,
  config: AIConfig | null
): Promise<GenericJobsParseResult | null> {
  const { provider, apiKey } = selectProvider(config);

  if (provider === 'none' || !apiKey) {
    console.log('[AIService] No AI provider for generic jobs parsing, attempting heuristic extraction');
    return extractJobsHeuristically(jsonData);
  }

  const sampleData = truncateForAI(jsonData, 8000);

  const prompt = `You are a JSON parser. Extract job posting data from this API response.

INPUT JSON:
${JSON.stringify(sampleData, null, 2)}

TASK: Find all job postings in this JSON and extract:
1. Company names
2. Job titles at each company
3. Job count per company

RETURN ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "companies": [
    {"company_name": "Acme Corp", "job_titles": ["Software Engineer", "Product Manager"], "job_count": 2},
    {"company_name": "Beta Inc", "job_titles": ["Data Analyst"], "job_count": 1}
  ],
  "total_jobs": 3,
  "raw_response_type": "array_of_jobs"
}

Rules:
- raw_response_type should describe the JSON structure: "array_of_jobs", "nested_data_array", "paginated_results", "single_company", or "unknown"
- Group jobs by company
- If company name is missing, use "Unknown Company"
- If no jobs found, return empty companies array with total_jobs: 0
- Return ONLY the JSON object, nothing else`;

  try {
    const result = await callAI(config!, prompt);

    if (!result) {
      console.log('[AIService] AI returned null, falling back to heuristic extraction');
      return extractJobsHeuristically(jsonData);
    }

    const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as GenericJobsParseResult;

    console.log('[AIService] AI parsed jobs:', parsed.total_jobs, 'jobs from', parsed.companies.length, 'companies');

    return parsed;
  } catch (error) {
    console.error('[AIService] parseGenericJobsAPI failed:', error);
    return extractJobsHeuristically(jsonData);
  }
}

function truncateForAI(data: any, maxChars: number): any {
  const str = JSON.stringify(data);

  if (str.length <= maxChars) {
    return data;
  }

  if (Array.isArray(data)) {
    const sample = data.slice(0, Math.min(20, data.length));
    const sampleStr = JSON.stringify(sample);
    if (sampleStr.length <= maxChars) {
      return sample;
    }
    return data.slice(0, 10);
  }

  if (data && typeof data === 'object') {
    const keys = ['data', 'results', 'jobs', 'items', 'records', 'listings'];
    for (const key of keys) {
      if (Array.isArray(data[key])) {
        return { ...data, [key]: data[key].slice(0, 20) };
      }
    }
  }

  return data;
}

function extractJobsHeuristically(data: any): GenericJobsParseResult | null {
  try {
    let jobs: any[] = [];

    if (Array.isArray(data)) {
      jobs = data;
    } else if (data && typeof data === 'object') {
      const arrayKeys = ['data', 'results', 'jobs', 'items', 'records', 'listings', 'postings', 'positions'];
      for (const key of arrayKeys) {
        if (Array.isArray(data[key])) {
          jobs = data[key];
          break;
        }
      }
    }

    if (jobs.length === 0) {
      return { companies: [], total_jobs: 0, raw_response_type: 'unknown' };
    }

    const companyMap = new Map<string, { titles: Set<string>; count: number }>();

    for (const job of jobs) {
      const companyName =
        job.employer_name ||
        job.company_name ||
        job.company ||
        job.organization ||
        job.employer ||
        job.companyName ||
        (job.company && typeof job.company === 'object' ? job.company.name : null) ||
        'Unknown Company';

      const title =
        job.job_title ||
        job.title ||
        job.position ||
        job.role ||
        job.jobTitle ||
        job.position_title ||
        'Untitled Role';

      if (!companyMap.has(companyName)) {
        companyMap.set(companyName, { titles: new Set(), count: 0 });
      }

      const entry = companyMap.get(companyName)!;
      entry.titles.add(title);
      entry.count++;
    }

    const companies: ParsedJobData[] = [];
    for (const [name, data] of companyMap) {
      companies.push({
        company_name: name,
        job_titles: Array.from(data.titles),
        job_count: data.count
      });
    }

    companies.sort((a, b) => b.job_count - a.job_count);

    return {
      companies,
      total_jobs: jobs.length,
      raw_response_type: Array.isArray(data) ? 'array_of_jobs' : 'nested_data_array'
    };
  } catch (error) {
    console.error('[AIService] Heuristic extraction failed:', error);
    return null;
  }
}
