/**
 * PLATFORM INTELLIGENCE
 *
 * Real-time company intelligence for live sales calls.
 * Built like infrastructure: fast, reliable, invisible.
 *
 * Pipeline:
 * 1. Cache check (same query = instant)
 * 2. Exa semantic search
 * 3. AI extraction (companies + signals from any source type)
 *    - Supports: OpenAI, Azure OpenAI, Anthropic (Claude)
 * 4. Apollo enrichment (decision makers)
 * 5. Structured response
 *
 * AI Provider Support:
 * - OpenAI: x-openai-key header, uses gpt-4o-mini
 * - Azure: x-azure-key header, uses configured deployment
 * - Anthropic: x-anthropic-key header, uses claude-3-haiku
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================================
// CORS
// ============================================================================
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-exa-key, x-apollo-key, x-ai-provider, x-openai-key, x-azure-key, x-anthropic-key, x-azure-endpoint, x-azure-deployment',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ============================================================================
// TYPES
// ============================================================================

// Supported AI providers for extraction
type AIProvider = 'openai' | 'azure' | 'anthropic';

interface IntelligenceRequest {
  query: string;
  prospectDomain?: string;  // Exclude from results
  numResults?: number;      // Default 5
  includeContacts?: boolean; // Default true
}

interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  // Azure-specific
  azureEndpoint?: string;
  azureDeployment?: string;
}

interface ExaResult {
  id: string;
  url: string;
  title: string;
  publishedDate?: string;
  author?: string;
  score: number;
  text?: string;
}

interface ExtractedCompany {
  companyName: string;
  companyDomain: string | null;
  signalType: 'funding' | 'exec_change' | 'hiring' | 'acquisition' | 'certification' | 'expansion' | 'partnership' | 'other';
  signalTitle: string;
  signalDate: string | null;
  sourceUrl: string;
  sourceType: 'company_page' | 'news' | 'job_posting' | 'press_release';
  sourceTitle: string;
  matchScore: number;
  confidence: number;
}

interface EnrichedContact {
  fullName: string | null;
  firstName: string | null;
  title: string | null;
  email: string | null;
  linkedinUrl: string | null;
  seniorityLevel: 'c_suite' | 'vp' | 'director' | 'manager' | 'other';
  source: 'apollo' | 'anymail' | null;
}

interface IntelligenceResult {
  company: ExtractedCompany;
  contact: EnrichedContact | null;
}

interface IntelligenceResponse {
  success: boolean;
  results: IntelligenceResult[];
  meta: {
    query: string;
    resultCount: number;
    latencyMs: number;
    cached: boolean;
    costs: {
      exa: number;
      ai: number;
      enrichment: number;
      total: number;
    };
  };
  error?: string;
}

// ============================================================================
// UTILITIES
// ============================================================================
function hashQuery(query: string, prospectDomain?: string): string {
  const normalized = `${query.toLowerCase().trim()}|${prospectDomain || ''}`;
  // Simple hash for cache key
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function extractDomainFromUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    // Remove www. and common subdomains
    return hostname.replace(/^(www\.|blog\.|news\.|careers\.)/i, '');
  } catch {
    return null;
  }
}

function inferSeniorityLevel(title: string | null): 'c_suite' | 'vp' | 'director' | 'manager' | 'other' {
  if (!title) return 'other';
  const t = title.toLowerCase();
  if (/\b(ceo|cfo|cto|coo|cmo|cro|cpo|chro|chief|founder|co-founder|owner|president)\b/.test(t)) return 'c_suite';
  if (/\b(vp|vice president|svp|evp)\b/.test(t)) return 'vp';
  if (/\b(director|head of|principal)\b/.test(t)) return 'director';
  if (/\b(manager|lead|senior)\b/.test(t)) return 'manager';
  return 'other';
}

// ============================================================================
// INTELLIGENT SEARCH ORCHESTRATION
// ============================================================================
// Stripe-grade: Never fail visibly. Always return results if Exa has data.
//
// Architecture:
// 1. Any query >= 5 words → AI generates optimized search queries
// 2. Run multi-query search in parallel
// 3. If extraction yields < MIN_RESULTS → run direct search as fallback
// 4. Merge all results, dedupe by domain
// 5. Last resort: extract companies directly from Exa titles/URLs
//
// Guarantee: If Exa returns data, user sees results.
// ============================================================================

const MIN_RESULTS = 3;
const INTENT_WORD_THRESHOLD = 5;

function isDescriptiveQuery(query: string): boolean {
  if (!query) return false;
  return query.split(' ').length >= INTENT_WORD_THRESHOLD;
}

async function generateSearchQueries(
  description: string,
  aiConfig: AIConfig
): Promise<string[]> {
  const prompt = `You are a B2B sales intelligence expert.

A sales professional described their ideal prospect:
"${description}"

Your job: Generate 5 search queries to find COMPANIES that match this description.

Rules:
- Each query targets a different angle (hiring, funding, growth, news, industry)
- Queries should find the COMPANIES being described, not articles ABOUT the industry
- Be specific: include company size, industry, and signals mentioned
- Include year "2024" or "2025" for recency

Return ONLY a JSON array of 5 strings. No explanation.`;

  try {
    let content: string;

    switch (aiConfig.provider) {
      case 'azure': {
        if (!aiConfig.azureEndpoint || !aiConfig.azureDeployment) {
          return [description];
        }
        const url = `${aiConfig.azureEndpoint}/openai/deployments/${aiConfig.azureDeployment}/chat/completions?api-version=2024-02-15-preview`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': aiConfig.apiKey },
          body: JSON.stringify({
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
          }),
        });
        if (!response.ok) return [description];
        const data = await response.json();
        content = data.choices?.[0]?.message?.content || '';
        break;
      }

      case 'anthropic': {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': aiConfig.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1024,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        if (!response.ok) return [description];
        const data = await response.json();
        const textBlock = data.content?.find((b: any) => b.type === 'text');
        content = textBlock?.text || '';
        break;
      }

      case 'openai':
      default: {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${aiConfig.apiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
          }),
        });
        if (!response.ok) return [description];
        const data = await response.json();
        content = data.choices?.[0]?.message?.content || '';
        break;
      }
    }

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log('[Search] AI generated queries:', parsed.slice(0, 5));
        return parsed.slice(0, 5);
      }
    }
  } catch (e) {
    console.error('[Search] Query generation failed:', e);
  }

  return [description];
}

async function parallelSearch(
  queries: string[],
  exaKey: string,
  resultsPerQuery: number = 10
): Promise<ExaResult[]> {
  console.log('[Search] Running', queries.length, 'parallel searches');
  const searches = queries.map(q => searchExa(q, exaKey, resultsPerQuery));
  const results = await Promise.all(searches);
  return results.flatMap(r => r.results || []);
}

function dedupeByDomain(results: ExaResult[], maxResults: number = 20): ExaResult[] {
  const seen = new Map<string, ExaResult>();

  for (const result of results) {
    const domain = extractDomainFromUrl(result.url);
    if (!domain) continue;

    // Skip common non-company domains
    if (/^(linkedin|twitter|facebook|youtube|medium|substack|github)\./.test(domain)) continue;

    if (!seen.has(domain)) {
      seen.set(domain, result);
    } else {
      const existing = seen.get(domain)!;
      if ((result.score || 0) > (existing.score || 0)) {
        seen.set(domain, result);
      }
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, maxResults);
}

// Last resort: Extract company info directly from Exa results when AI extraction fails
function extractCompaniesFromTitles(exaResults: ExaResult[]): ExtractedCompany[] {
  const companies: ExtractedCompany[] = [];

  for (const result of exaResults) {
    const domain = extractDomainFromUrl(result.url);
    if (!domain) continue;

    // Skip non-company domains
    if (/^(linkedin|twitter|facebook|youtube|medium|substack|github|techcrunch|forbes|bloomberg)\./.test(domain)) continue;

    // Extract company name from domain (e.g., "acme.com" → "Acme")
    const namePart = domain.split('.')[0];
    const companyName = namePart.charAt(0).toUpperCase() + namePart.slice(1);

    companies.push({
      companyName,
      companyDomain: domain,
      signalType: 'other',
      signalTitle: result.title?.slice(0, 100) || 'Signal detected',
      signalDate: result.publishedDate || null,
      sourceUrl: result.url,
      sourceType: 'news',
      sourceTitle: result.title || '',
      matchScore: Math.round((result.score || 0.5) * 100),
      confidence: 0.6,
    });
  }

  // Dedupe by domain
  const seen = new Set<string>();
  return companies.filter(c => {
    if (seen.has(c.companyDomain || '')) return false;
    seen.add(c.companyDomain || '');
    return true;
  }).slice(0, 15);
}

// ============================================================================
// EXA SEARCH
// ============================================================================
async function searchExa(
  query: string,
  apiKey: string,
  numResults: number = 5
): Promise<{ results: ExaResult[]; cost: number; requestId: string }> {
  const response = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      query,
      numResults,
      type: 'neural',
      contents: { text: true },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Exa API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return {
    results: data.results || [],
    cost: data.costDollars?.total || 0,
    requestId: data.requestId,
  };
}

// ============================================================================
// AI EXTRACTION - Multi-Provider Support
// ============================================================================

// The extraction prompt (shared across all providers)
function getExtractionPrompt(context: any[], prospectDomain?: string): string {
  return `You are extracting company intelligence from search results. For each result, identify:
1. Company name (the main company being discussed, NOT the news source/publication)
2. Company domain (the company's ACTUAL website domain - CRITICAL for finding decision makers)
3. Signal type: funding, exec_change, hiring, acquisition, certification, expansion, partnership, or other
4. Signal title: A short phrase describing the signal (e.g., "Raised $17.5M Series A", "New CFO appointed")
5. Signal date: If mentioned (YYYY-MM-DD format)
6. Source type: company_page (company's own site), news, job_posting, or press_release
7. Confidence: 0-1 how confident you are this is a real, actionable company

CRITICAL RULES FOR DOMAIN EXTRACTION:
- The company domain is the company's ACTUAL website, NOT the news source
- Example: Article on techcrunch.com about "Octaura raises $46M" → domain should be "octaura.com", NOT "techcrunch.com"
- Example: Article on bloomberg.com about "Stripe launches new product" → domain should be "stripe.com", NOT "bloomberg.com"
- If the company name is "Acme Corp", the domain is likely "acmecorp.com" or "acme.com"
- Look for domain mentions in the article text, or infer from company name
- If you cannot determine the actual company domain, set it to null (do NOT use the news site domain)

OTHER RULES:
- Extract the COMPANY being discussed, not the publication
- Skip results that are general industry reports with no specific company
- Skip results where you can't identify a clear company
${prospectDomain ? `- EXCLUDE any company with domain containing: ${prospectDomain}` : ''}
- Include companies with confidence >= 0.3 (be generous, user can filter)

Return a JSON object with a "companies" array. Each company object must have: companyName, companyDomain, signalType, signalTitle, signalDate, sourceType, confidence, index (the result index from 0-${context.length - 1}).

If no valid companies found, return {"companies": []}.

Search results:
${JSON.stringify(context, null, 2)}`;
}

// OpenAI extraction
async function extractWithOpenAI(
  context: any[],
  apiKey: string,
  prospectDomain?: string
): Promise<{ content: string; cost: number }> {
  const prompt = getExtractionPrompt(context, prospectDomain);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You extract structured company data from search results. Return only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{"companies": []}';

  // Cost: gpt-4o-mini $0.15/1M input, $0.60/1M output
  const inputTokens = data.usage?.prompt_tokens || 0;
  const outputTokens = data.usage?.completion_tokens || 0;
  const cost = (inputTokens * 0.00000015) + (outputTokens * 0.0000006);

  return { content, cost };
}

// Azure OpenAI extraction
async function extractWithAzure(
  context: any[],
  apiKey: string,
  endpoint: string,
  deployment: string,
  prospectDomain?: string
): Promise<{ content: string; cost: number }> {
  const prompt = getExtractionPrompt(context, prospectDomain);

  // Azure endpoint format: https://{resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version=2024-02-15-preview
  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-15-preview`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: 'You extract structured company data from search results. Return only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Azure OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{"companies": []}';

  // Azure cost estimation (similar to OpenAI)
  const inputTokens = data.usage?.prompt_tokens || 0;
  const outputTokens = data.usage?.completion_tokens || 0;
  const cost = (inputTokens * 0.00000015) + (outputTokens * 0.0000006);

  return { content, cost };
}

// Anthropic (Claude) extraction
async function extractWithAnthropic(
  context: any[],
  apiKey: string,
  prospectDomain?: string
): Promise<{ content: string; cost: number }> {
  const prompt = getExtractionPrompt(context, prospectDomain);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `You extract structured company data from search results. Return only valid JSON with a "companies" array.\n\n${prompt}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const textBlock = data.content?.find((b: any) => b.type === 'text');
  let content = textBlock?.text || '{"companies": []}';

  // Claude sometimes wraps JSON in markdown code blocks
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    content = jsonMatch[1].trim();
  }

  // Cost: claude-3-haiku $0.25/1M input, $1.25/1M output
  const inputTokens = data.usage?.input_tokens || 0;
  const outputTokens = data.usage?.output_tokens || 0;
  const cost = (inputTokens * 0.00000025) + (outputTokens * 0.00000125);

  return { content, cost };
}

// Main extraction function - routes to correct provider
async function extractCompanies(
  exaResults: ExaResult[],
  aiConfig: AIConfig,
  prospectDomain?: string
): Promise<{ companies: ExtractedCompany[]; cost: number }> {
  // Prepare context for extraction
  const context = exaResults.map((r, i) => ({
    index: i,
    url: r.url,
    title: r.title,
    text: r.text?.slice(0, 1500), // Limit text to save tokens
    publishedDate: r.publishedDate,
    score: r.score,
  }));

  // Route to correct provider
  let result: { content: string; cost: number };

  switch (aiConfig.provider) {
    case 'azure':
      if (!aiConfig.azureEndpoint || !aiConfig.azureDeployment) {
        throw new Error('Azure requires endpoint and deployment configuration');
      }
      console.log('[Intelligence] Using Azure OpenAI for extraction');
      result = await extractWithAzure(
        context,
        aiConfig.apiKey,
        aiConfig.azureEndpoint,
        aiConfig.azureDeployment,
        prospectDomain
      );
      break;

    case 'anthropic':
      console.log('[Intelligence] Using Anthropic Claude for extraction');
      result = await extractWithAnthropic(context, aiConfig.apiKey, prospectDomain);
      break;

    case 'openai':
    default:
      console.log('[Intelligence] Using OpenAI for extraction');
      result = await extractWithOpenAI(context, aiConfig.apiKey, prospectDomain);
      break;
  }

  const { content, cost } = result;

  // Parse the response
  try {
    console.log('[Intelligence] Raw AI response:', content.slice(0, 500));

    const parsed = JSON.parse(content);
    const companies = (parsed.companies || parsed || []) as any[];

    console.log('[Intelligence] Parsed companies count:', companies.length);
    console.log('[Intelligence] First company (raw):', JSON.stringify(companies[0] || {}).slice(0, 300));

    // Map to our structure and validate
    const beforeFilter = companies.length;
    const extracted: ExtractedCompany[] = companies
      .filter((c: any) => {
        // Handle both camelCase and snake_case from AI response
        const name = c.companyName || c.company_name || c.name;
        const conf = c.confidence ?? c.match_confidence ?? 0.8;
        const passes = !!name && conf >= 0.3;
        if (!passes) {
          console.log('[Intelligence] Filtered out:', name || '(no name)', 'confidence:', conf);
        }
        return passes;
      })
      .map((c: any) => {
        // Normalize field names (AI might return camelCase or snake_case)
        const name = c.companyName || c.company_name || c.name;
        const domain = c.companyDomain || c.company_domain || c.domain;
        const signal = c.signalType || c.signal_type || c.type || 'other';
        const title = c.signalTitle || c.signal_title || c.title || 'Signal detected';
        const date = c.signalDate || c.signal_date || c.date || null;
        const srcType = c.sourceType || c.source_type || 'news';
        const srcTitle = c.sourceTitle || c.source_title || '';
        const conf = c.confidence ?? c.match_confidence ?? 0.8;
        const idx = c.index ?? c.resultIndex ?? 0;

        return {
          companyName: name,
          companyDomain: domain || extractDomainFromUrl(exaResults[idx]?.url || ''),
          signalType: signal,
          signalTitle: title,
          signalDate: date,
          sourceUrl: exaResults[idx]?.url || c.sourceUrl || c.source_url || '',
          sourceType: srcType,
          sourceTitle: exaResults[idx]?.title || srcTitle,
          matchScore: Math.round((exaResults[idx]?.score || 0.5) * 100),
          confidence: conf,
        };
      });

    console.log('[Intelligence] After filter:', extracted.length, 'of', beforeFilter, 'companies passed');

    // Deduplicate by domain
    const seen = new Set<string>();
    const deduplicated = extracted.filter(c => {
      const key = c.companyDomain || c.companyName.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log('[Intelligence] After dedup:', deduplicated.length, 'companies');
    return { companies: deduplicated, cost };
  } catch (e) {
    console.error('[Intelligence] Failed to parse extraction response:', e);
    console.error('[Intelligence] Raw content was:', content.slice(0, 1000));
    return { companies: [], cost };
  }
}

// ============================================================================
// APOLLO ENRICHMENT (with fallback stack for higher hit rate)
// ============================================================================

// Title fallback tiers - try in order until contact found
const TITLE_TIERS = [
  // Tier 1: C-Suite & Founders
  ['CEO', 'Founder', 'Co-Founder', 'Managing Partner', 'Partner', 'President', 'Owner'],
  // Tier 2: Investment Leadership
  ['Chief Investment Officer', 'CIO', 'Principal', 'Investment Director', 'Managing Director'],
  // Tier 3: VP & Directors
  ['VP', 'Vice President', 'Head of Investments', 'Head of Strategy', 'Director', 'Senior Director'],
  // Tier 4: Business Development
  ['Business Development', 'Partnerships', 'Corporate Development', 'Head of Growth', 'Head of Sales'],
];

// Seniority mapping for each tier
const TIER_SENIORITIES = [
  ['c_suite', 'founder', 'owner'],
  ['c_suite', 'vp', 'director'],
  ['vp', 'director', 'manager'],
  ['director', 'manager'],
];

// Normalize domain for better match rate
function normalizeDomain(domain: string): string {
  let normalized = domain
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')  // Remove protocol
    .replace(/^www\./, '')         // Remove www
    .replace(/\/+$/, '')           // Remove trailing slashes
    .split('/')[0];                // Remove path

  // Extract root domain from subdomain (e.g., blog.company.com → company.com)
  const parts = normalized.split('.');
  if (parts.length > 2) {
    // Keep last two parts for most TLDs, handle .co.uk etc.
    const knownTwoPartTLDs = ['co.uk', 'com.au', 'co.nz', 'co.jp'];
    const lastTwo = parts.slice(-2).join('.');
    if (knownTwoPartTLDs.includes(lastTwo)) {
      normalized = parts.slice(-3).join('.');
    } else {
      normalized = parts.slice(-2).join('.');
    }
  }

  return normalized;
}

// Single Apollo search attempt
async function apolloSearch(
  apolloKey: string,
  params: {
    domain?: string;
    companyName?: string;
    titles?: string[];
    seniorities?: string[];
  }
): Promise<any | null> {
  const body: any = {
    per_page: 1,
  };

  if (params.domain) {
    body.q_organization_domains_list = [params.domain];
  }
  if (params.companyName) {
    body.q_organization_name = params.companyName;
  }
  if (params.titles && params.titles.length > 0) {
    body.person_titles = params.titles;
  }
  if (params.seniorities && params.seniorities.length > 0) {
    body.person_seniorities = params.seniorities;
  }

  try {
    const response = await fetch('https://api.apollo.io/v1/mixed_people/api_search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'x-api-key': apolloKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.log('[Apollo] Search failed:', response.status);
      return null;
    }

    const data = await response.json();
    return data.people?.[0] || null;
  } catch (e) {
    console.error('[Apollo] Search error:', e);
    return null;
  }
}

// Step 2: Enrich person by ID to get full contact data (email, full name)
async function apolloEnrichById(
  apolloKey: string,
  personId: string
): Promise<any | null> {
  try {
    console.log('[Apollo] Enriching person ID:', personId);
    const response = await fetch('https://api.apollo.io/v1/people/enrich', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'x-api-key': apolloKey,
      },
      body: JSON.stringify({ id: personId }),
    });

    if (!response.ok) {
      console.log('[Apollo] Enrich failed:', response.status);
      return null;
    }

    const data = await response.json();
    console.log('[Apollo] Enriched:', data.person?.name, '|', data.person?.email ? 'HAS EMAIL' : 'NO EMAIL');
    return data.person || null;
  } catch (e) {
    console.error('[Apollo] Enrich error:', e);
    return null;
  }
}

async function enrichContact(
  companyDomain: string,
  apolloKey: string,
  companyName?: string
): Promise<EnrichedContact | null> {
  // Normalize domain
  const normalizedDomain = normalizeDomain(companyDomain);
  console.log('[Apollo] Step 1: Search for', companyDomain, '→', normalizedDomain);

  // Step 1: Search to get person ID
  let foundPerson: any = null;
  let foundTier = 0;
  let foundVia = 'domain';

  // Try each title tier with domain
  for (let tier = 0; tier < TITLE_TIERS.length; tier++) {
    console.log('[Apollo] Trying domain tier', tier + 1);

    const person = await apolloSearch(apolloKey, {
      domain: normalizedDomain,
      titles: TITLE_TIERS[tier],
      seniorities: TIER_SENIORITIES[tier],
    });

    if (person?.id) {
      foundPerson = person;
      foundTier = tier + 1;
      foundVia = 'domain';
      break;
    }
  }

  // Fallback: Try company name search if domain search failed
  if (!foundPerson && companyName) {
    console.log('[Apollo] Domain failed, trying company name:', companyName);

    for (let tier = 0; tier < 2; tier++) {
      const person = await apolloSearch(apolloKey, {
        companyName: companyName,
        titles: TITLE_TIERS[tier],
        seniorities: TIER_SENIORITIES[tier],
      });

      if (person?.id) {
        foundPerson = person;
        foundTier = tier + 1;
        foundVia = 'company_name';
        break;
      }
    }
  }

  if (!foundPerson?.id) {
    console.log('[Apollo] No contact found for', normalizedDomain);
    return null;
  }

  // Step 2: Enrich by ID to get full contact data
  console.log('[Apollo] Step 2: Enrich person ID:', foundPerson.id, '(found via', foundVia, 'tier', foundTier + ')');
  const enriched = await apolloEnrichById(apolloKey, foundPerson.id);

  if (!enriched) {
    // Fallback to search data if enrich fails
    console.log('[Apollo] Enrich failed, using search data');
    const fullName = foundPerson.name || (foundPerson.first_name && foundPerson.last_name
      ? `${foundPerson.first_name} ${foundPerson.last_name}`
      : foundPerson.first_name) || null;
    return {
      fullName,
      firstName: foundPerson.first_name || null,
      title: foundPerson.title || null,
      email: foundPerson.email || null,
      linkedinUrl: foundPerson.linkedin_url || null,
      seniorityLevel: inferSeniorityLevel(foundPerson.title),
      source: 'apollo',
    };
  }

  // Return enriched data
  console.log('[Apollo] Success:', enriched.name, '|', enriched.title, '|', enriched.email ? 'HAS EMAIL' : 'NO EMAIL');
  return {
    fullName: enriched.name || null,
    firstName: enriched.first_name || null,
    title: enriched.title || null,
    email: enriched.email || null,
    linkedinUrl: enriched.linkedin_url || null,
    seniorityLevel: inferSeniorityLevel(enriched.title),
    source: 'apollo',
  };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================
Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Parse request
    const body: IntelligenceRequest = await req.json();
    const { query, prospectDomain, numResults = 5, includeContacts = true } = body;

    if (!query || query.trim().length < 3) {
      return new Response(
        JSON.stringify({ success: false, error: 'Query too short' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // BYOK (Bring Your Own Keys) - Keys sent from client in headers
    // Users configure their own API keys in Settings
    // =========================================================================
    const exaKey = req.headers.get('x-exa-key') || Deno.env.get('EXA_API_KEY');
    const apolloKey = req.headers.get('x-apollo-key') || Deno.env.get('APOLLO_API_KEY');

    console.log('[Intelligence] BYOK check:');
    console.log('[Intelligence] x-apollo-key header:', req.headers.get('x-apollo-key') ? 'PRESENT' : 'MISSING');
    console.log('[Intelligence] apolloKey resolved:', apolloKey ? `${apolloKey.slice(0,8)}...` : 'EMPTY');
    console.log('[Intelligence] includeContacts from body:', includeContacts);

    // AI Provider configuration (from client headers)
    const aiProvider = (req.headers.get('x-ai-provider') || 'openai') as AIProvider;
    const openaiKey = req.headers.get('x-openai-key') || Deno.env.get('OPENAI_API_KEY');
    const azureKey = req.headers.get('x-azure-key') || Deno.env.get('AZURE_OPENAI_KEY');
    const anthropicKey = req.headers.get('x-anthropic-key') || Deno.env.get('ANTHROPIC_API_KEY');
    const azureEndpoint = req.headers.get('x-azure-endpoint') || Deno.env.get('AZURE_OPENAI_ENDPOINT');
    const azureDeployment = req.headers.get('x-azure-deployment') || Deno.env.get('AZURE_OPENAI_DEPLOYMENT') || 'gpt-4o-mini';

    if (!exaKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Exa API key required (x-exa-key header)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build AI config based on provider specified by client
    let aiConfig: AIConfig;
    switch (aiProvider) {
      case 'azure':
        if (!azureKey) {
          return new Response(
            JSON.stringify({ success: false, error: 'Azure API key required (x-azure-key header)' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (!azureEndpoint) {
          return new Response(
            JSON.stringify({ success: false, error: 'Azure endpoint required (x-azure-endpoint header)' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        aiConfig = {
          provider: 'azure',
          apiKey: azureKey,
          azureEndpoint,
          azureDeployment,
        };
        break;

      case 'anthropic':
        if (!anthropicKey) {
          return new Response(
            JSON.stringify({ success: false, error: 'Anthropic API key required (x-anthropic-key header)' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        aiConfig = {
          provider: 'anthropic',
          apiKey: anthropicKey,
        };
        break;

      case 'openai':
      default:
        if (!openaiKey) {
          return new Response(
            JSON.stringify({ success: false, error: 'OpenAI API key required (x-openai-key header)' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        aiConfig = {
          provider: 'openai',
          apiKey: openaiKey,
        };
        break;
    }

    console.log('[Intelligence] AI Provider:', aiConfig.provider);

    // Initialize Supabase for caching (optional)
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = supabaseUrl && supabaseKey
      ? createClient(supabaseUrl, supabaseKey)
      : null;

    // Check cache
    const queryHash = hashQuery(query, prospectDomain);
    let cached = false;

    if (supabase) {
      const { data: cachedQuery } = await supabase
        .from('intelligence_queries')
        .select(`
          id,
          intelligence_results (
            company_name,
            company_domain,
            signal_type,
            signal_title,
            signal_date,
            source_url,
            source_type,
            source_title,
            match_score,
            confidence,
            intelligence_contacts (
              full_name,
              first_name,
              title,
              email,
              linkedin_url,
              seniority_level,
              enrichment_source
            )
          )
        `)
        .eq('query_hash', queryHash)
        .gt('expires_at', new Date().toISOString())
        .single();

      // Check if cached results have contacts when contacts are requested
      const cachedHasContacts = cachedQuery?.intelligence_results?.some(
        (r: any) => r.intelligence_contacts?.length > 0
      );
      const shouldUseCache = cachedQuery?.intelligence_results?.length > 0 &&
        (!includeContacts || cachedHasContacts);

      console.log('[Intelligence] Cache check:', {
        hasResults: cachedQuery?.intelligence_results?.length > 0,
        includeContacts,
        cachedHasContacts,
        shouldUseCache
      });

      if (shouldUseCache) {
        cached = true;
        const results: IntelligenceResult[] = cachedQuery.intelligence_results.map((r: any) => ({
          company: {
            companyName: r.company_name,
            companyDomain: r.company_domain,
            signalType: r.signal_type,
            signalTitle: r.signal_title,
            signalDate: r.signal_date,
            sourceUrl: r.source_url,
            sourceType: r.source_type,
            sourceTitle: r.source_title,
            matchScore: r.match_score,
            confidence: r.confidence,
          },
          contact: r.intelligence_contacts?.[0] ? {
            fullName: r.intelligence_contacts[0].full_name,
            firstName: r.intelligence_contacts[0].first_name,
            title: r.intelligence_contacts[0].title,
            email: r.intelligence_contacts[0].email,
            linkedinUrl: r.intelligence_contacts[0].linkedin_url,
            seniorityLevel: r.intelligence_contacts[0].seniority_level,
            source: r.intelligence_contacts[0].enrichment_source,
          } : null,
        }));

        const response: IntelligenceResponse = {
          success: true,
          results,
          meta: {
            query,
            resultCount: results.length,
            latencyMs: Date.now() - startTime,
            cached: true,
            costs: { exa: 0, ai: 0, enrichment: 0, total: 0 },
          },
        };

        return new Response(JSON.stringify(response), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // =========================================================================
    // STEP 1: INTELLIGENT SEARCH
    // =========================================================================
    const isDescriptive = isDescriptiveQuery(query);
    console.log('[Search] Query:', query);
    console.log('[Search] Mode:', isDescriptive ? 'multi-query' : 'direct');

    let exaResults: ExaResult[];
    let exaCost = 0;
    let exaRequestId: string | null = null;
    let searchQueries: string[] = [];

    if (isDescriptive) {
      // Generate optimized search queries from description
      searchQueries = await generateSearchQueries(query, aiConfig);

      // Run parallel search
      const rawResults = await parallelSearch(searchQueries, exaKey, 10);
      console.log('[Search] Raw results:', rawResults.length);

      exaResults = dedupeByDomain(rawResults, 20);
      console.log('[Search] After dedupe:', exaResults.length);

      exaCost = searchQueries.length * 0.001;
      exaRequestId = `multi-${Date.now()}`;
    } else {
      // Direct search for short queries
      console.log('[Search] Direct Exa search:', query);
      const exaResponse = await searchExa(query, exaKey, 25);
      exaResults = exaResponse.results;
      exaCost = exaResponse.cost;
      exaRequestId = exaResponse.requestId;
    }

    // Never return empty if Exa found nothing
    if (exaResults.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          results: [],
          meta: {
            query,
            resultCount: 0,
            latencyMs: Date.now() - startTime,
            cached: false,
            costs: { exa: exaCost, ai: 0, enrichment: 0, total: exaCost },
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // STEP 2: EXTRACTION WITH FALLBACK CHAIN
    // =========================================================================
    // Guarantee: If Exa returned data, user sees companies.
    // Chain: AI extraction → Direct search fallback → Title extraction fallback
    // =========================================================================

    console.log('[Extract] Processing', exaResults.length, 'results');
    let extraction = await extractCompanies(exaResults, aiConfig, prospectDomain);
    let aiCost = extraction.cost;
    let usedFallback = false;

    // Fallback 1: If too few companies, try direct search
    if (extraction.companies.length < MIN_RESULTS && isDescriptive) {
      console.log('[Extract] Only', extraction.companies.length, 'companies, trying direct search fallback');

      const fallbackResponse = await searchExa(query, exaKey, 25);
      exaCost += fallbackResponse.cost;

      if (fallbackResponse.results.length > 0) {
        const fallbackExtraction = await extractCompanies(fallbackResponse.results, aiConfig, prospectDomain);
        aiCost += fallbackExtraction.cost;

        // Merge results, dedupe by domain
        const allCompanies = [...extraction.companies, ...fallbackExtraction.companies];
        const seenDomains = new Set<string>();
        extraction.companies = allCompanies.filter(c => {
          const domain = c.companyDomain || c.companyName.toLowerCase();
          if (seenDomains.has(domain)) return false;
          seenDomains.add(domain);
          return true;
        });
        usedFallback = true;
        console.log('[Extract] After fallback merge:', extraction.companies.length, 'companies');
      }
    }

    // Fallback 2: Last resort - extract from titles/URLs if AI extraction failed completely
    if (extraction.companies.length === 0 && exaResults.length > 0) {
      console.log('[Extract] AI extraction failed, using title extraction fallback');
      extraction.companies = extractCompaniesFromTitles(exaResults);
      usedFallback = true;
      console.log('[Extract] Title extraction found:', extraction.companies.length, 'companies');
    }

    // Descriptive queries get more results (up to 15)
    const effectiveNumResults = isDescriptive ? Math.max(numResults, 15) : numResults;
    const companies = extraction.companies.slice(0, effectiveNumResults);

    console.log('[Extract] Final:', companies.length, 'companies', usedFallback ? '(used fallback)' : '');

    // Step 3: Enrichment (parallel)
    let enrichmentCost = 0;
    const results: IntelligenceResult[] = [];

    if (includeContacts && apolloKey) {
      console.log('[Intelligence] Enriching', companies.length, 'companies');
      console.log('[Intelligence] Domains to enrich:', companies.map(c => c.companyDomain).join(', '));

      const enrichmentPromises = companies.map(async (company) => {
        if (!company.companyDomain) {
          console.log('[Intelligence] Skipping enrichment for', company.companyName, '- no domain');
          return { company, contact: null };
        }
        console.log('[Intelligence] Enriching:', company.companyName, '→', company.companyDomain);
        const contact = await enrichContact(company.companyDomain, apolloKey, company.companyName);
        if (contact) {
          console.log('[Intelligence] Found contact:', contact.fullName, 'at', company.companyDomain);
        } else {
          console.log('[Intelligence] No contact found at', company.companyDomain);
        }
        return { company, contact };
      });

      const enriched = await Promise.all(enrichmentPromises);
      results.push(...enriched);

      // Estimate Apollo cost (roughly $0.01 per lookup)
      enrichmentCost = companies.filter(c => c.companyDomain).length * 0.01;
    } else {
      results.push(...companies.map(c => ({ company: c, contact: null })));
    }

    // Cache results if we have Supabase
    if (supabase && results.length > 0) {
      try {
        // Get user from auth header
        const authHeader = req.headers.get('Authorization');
        let userId = null;
        if (authHeader) {
          const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
          userId = user?.id;
        }

        // Insert query
        const { data: queryRecord } = await supabase
          .from('intelligence_queries')
          .insert({
            user_id: userId,
            query_text: query,
            query_hash: queryHash,
            prospect_domain: prospectDomain,
            result_count: results.length,
            exa_request_id: exaRequestId,
            cost_exa: exaCost,
            cost_ai: aiCost,
            cost_enrichment: enrichmentCost,
            latency_ms: Date.now() - startTime,
          })
          .select('id')
          .single();

        if (queryRecord) {
          // Insert results
          for (let i = 0; i < results.length; i++) {
            const r = results[i];
            const { data: resultRecord } = await supabase
              .from('intelligence_results')
              .insert({
                query_id: queryRecord.id,
                company_name: r.company.companyName,
                company_domain: r.company.companyDomain,
                signal_type: r.company.signalType,
                signal_title: r.company.signalTitle,
                signal_date: r.company.signalDate,
                source_url: r.company.sourceUrl,
                source_type: r.company.sourceType,
                source_title: r.company.sourceTitle,
                match_score: r.company.matchScore,
                confidence: r.company.confidence,
                rank: i + 1,
              })
              .select('id')
              .single();

            if (resultRecord && r.contact) {
              await supabase
                .from('intelligence_contacts')
                .insert({
                  result_id: resultRecord.id,
                  full_name: r.contact.fullName,
                  first_name: r.contact.firstName,
                  title: r.contact.title,
                  email: r.contact.email,
                  linkedin_url: r.contact.linkedinUrl,
                  seniority_level: r.contact.seniorityLevel,
                  enrichment_source: r.contact.source,
                  enrichment_status: r.contact.email ? 'found' : 'not_found',
                });
            }
          }
        }
      } catch (cacheError) {
        console.error('[Intelligence] Cache write failed:', cacheError);
        // Don't fail the request, caching is optional
      }
    }

    // Build response
    const totalCost = exaCost + aiCost + enrichmentCost;
    const response: IntelligenceResponse = {
      success: true,
      results,
      meta: {
        query,
        resultCount: results.length,
        latencyMs: Date.now() - startTime,
        cached: false,
        costs: {
          exa: exaCost,
          ai: aiCost,
          enrichment: enrichmentCost,
          total: totalCost,
        },
      },
      // Debug info (remove in production)
      _debug: {
        exaResultCount: exaResults.length,
        extractedCompanyCount: extraction.companies.length,
        aiProvider: aiConfig.provider,
        multiQueryMode: isDescriptive,
        domainsSearched: companies.map(c => c.companyDomain || 'null'),
        contactsFound: results.filter(r => r.contact?.email).length,
      },
    } as any;

    console.log('[Intelligence] Complete:', results.length, 'results in', Date.now() - startTime, 'ms');

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Intelligence] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
        results: [],
        meta: {
          query: '',
          resultCount: 0,
          latencyMs: Date.now() - startTime,
          cached: false,
          costs: { exa: 0, ai: 0, enrichment: 0, total: 0 },
        },
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
