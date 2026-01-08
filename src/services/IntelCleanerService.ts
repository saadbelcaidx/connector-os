/**
 * Intel Cleaner Service
 *
 * Takes raw Instantly AI enrichment data and distills it into
 * sharp, actionable insights for premium connectors.
 *
 * No academic fluff. No "The main pain points are...".
 * Just the intel that matters for routing million-dollar deals.
 */

import { callAI, AIConfig } from './AIService';

interface CleanedIntel {
  painPoint: string | null;        // One sharp pain (max 60 chars)
  competitors: string[];           // Clean company names only
  sellsTo: string | null;          // One line about who they serve
  whyMatch: string | null;         // Sharp match reason
}

interface RawEnrichment {
  painPoints: string[];
  competitors: string[];
  customerProfiles: string[];
  description?: string;
}

/**
 * Clean competitor strings - remove markdown, extract just the company name
 */
function cleanCompetitor(raw: string): string | null {
  if (!raw || raw.length < 2) return null;

  // Remove markdown bold/italic
  let cleaned = raw.replace(/\*\*/g, '').replace(/\*/g, '');

  // Remove URLs in parentheses
  cleaned = cleaned.replace(/\([^)]*\.(com|io|ai|co)[^)]*\)/gi, '');

  // If it contains ":" it's likely "Name: description", take just the name
  if (cleaned.includes(':')) {
    cleaned = cleaned.split(':')[0].trim();
  }

  // Remove common suffixes
  cleaned = cleaned.replace(/\s*(Inc\.|LLC|Ltd\.?|Corp\.?|Company)$/i, '');

  // Remove numbering like "1. " or "- "
  cleaned = cleaned.replace(/^[\d\.\-\*\•]+\s*/, '');

  // Trim and validate
  cleaned = cleaned.trim();

  // Skip if too short, too long, or looks like a sentence
  if (cleaned.length < 2 || cleaned.length > 40) return null;
  if (cleaned.split(' ').length > 4) return null;
  if (cleaned.toLowerCase().includes('competitor')) return null;
  if (cleaned.toLowerCase().includes('key ')) return null;

  return cleaned;
}

/**
 * Clean pain point - extract the core pain, no fluff
 */
function cleanPainPoint(raw: string): string | null {
  if (!raw || raw.length < 10) return null;

  let cleaned = raw;

  // Remove common AI fluff prefixes
  const fluffPrefixes = [
    /^the main pain points? (experienced by|for|of)[^:]*:?\s*/i,
    /^(here are|the following are|key|main|primary|some)\s*(pain points?|challenges?|issues?)[^:]*:?\s*/i,
    /^[^:]+:\s*/,  // Remove "Company: " prefix
    /^\d+\.\s*/,   // Remove numbering
    /^[\-\*\•]\s*/, // Remove bullets
  ];

  for (const prefix of fluffPrefixes) {
    cleaned = cleaned.replace(prefix, '');
  }

  // Remove markdown
  cleaned = cleaned.replace(/\*\*/g, '').replace(/\*/g, '');

  // Take first sentence if multiple
  const firstSentence = cleaned.split(/[.!?]/)[0];
  if (firstSentence && firstSentence.length >= 20) {
    cleaned = firstSentence;
  }

  // Trim and cap length
  cleaned = cleaned.trim();
  if (cleaned.length > 80) {
    cleaned = cleaned.slice(0, 77) + '...';
  }

  return cleaned.length >= 15 ? cleaned : null;
}

/**
 * Clean "sells to" - extract a concise target customer description
 */
function cleanSellsTo(raw: string): string | null {
  if (!raw || raw.length < 10) return null;

  let cleaned = raw;

  // Remove common AI fluff
  const fluffPrefixes = [
    /^(here are|the following are|based on|three|target customer profiles?)[^:]*:?\s*/i,
    /^\d+\.\s*/,
    /^[\-\*\•]\s*/,
  ];

  for (const prefix of fluffPrefixes) {
    cleaned = cleaned.replace(prefix, '');
  }

  // Remove markdown
  cleaned = cleaned.replace(/\*\*/g, '').replace(/\*/g, '');

  // Take first meaningful part
  const firstPart = cleaned.split(/[.!?]/)[0];
  if (firstPart && firstPart.length >= 15) {
    cleaned = firstPart;
  }

  cleaned = cleaned.trim();
  if (cleaned.length > 80) {
    cleaned = cleaned.slice(0, 77) + '...';
  }

  return cleaned.length >= 10 ? cleaned : null;
}

/**
 * Select best pain point from array
 * Priority: shortest concrete pain with verb+constraint, <120 chars
 */
function selectBestPain(painPoints: string[]): string | null {
  if (!painPoints || painPoints.length === 0) return null;

  // Clean all pain points first
  const cleaned = painPoints.map(cleanPainPoint).filter((p): p is string => p !== null);
  if (cleaned.length === 0) return null;

  // Action verbs that signal real pain (verb + constraint)
  const actionVerbs = ['scaling', 'hiring', 'building', 'growing', 'finding', 'reducing', 'losing', 'struggling'];

  // Priority 1: Shortest <120 chars WITH action verb (best quality)
  const shortWithVerb = cleaned.filter(p => p.length < 120 && actionVerbs.some(v => p.toLowerCase().includes(v)));
  if (shortWithVerb.length > 0) {
    return shortWithVerb.reduce((a, b) => a.length <= b.length ? a : b);
  }

  // Priority 2: Shortest <120 chars
  const short = cleaned.filter(p => p.length < 120);
  if (short.length > 0) {
    return short.reduce((a, b) => a.length <= b.length ? a : b);
  }

  // Priority 3: Any with action verb
  const actionPain = cleaned.find(p => actionVerbs.some(v => p.toLowerCase().includes(v)));
  if (actionPain) return actionPain;

  // Fallback: first
  return cleaned[0];
}

/**
 * Quick clean without AI - just string processing
 */
export function quickCleanIntel(raw: RawEnrichment, companyDomain: string): CleanedIntel {
  // Clean competitors - filter out the company itself
  const cleanedCompetitors = raw.competitors
    .map(cleanCompetitor)
    .filter((c): c is string => c !== null)
    .filter(c => !companyDomain.toLowerCase().includes(c.toLowerCase().split(' ')[0]))
    .slice(0, 5);

  // Select best pain point (not just first)
  const painPoint = selectBestPain(raw.painPoints);

  // Clean sells to
  const sellsTo = raw.customerProfiles.length > 0 ? cleanSellsTo(raw.customerProfiles[0]) : null;

  return {
    painPoint,
    competitors: cleanedCompetitors,
    sellsTo,
    whyMatch: null, // Will be generated separately
  };
}

/**
 * Deep clean with AI - distill raw intel into sharp insights
 */
export async function deepCleanIntel(
  raw: RawEnrichment,
  companyName: string,
  companyDomain: string,
  aiConfig: AIConfig
): Promise<CleanedIntel> {
  // Start with quick clean
  const quickCleaned = quickCleanIntel(raw, companyDomain);

  // If no meaningful data, return quick clean
  if (!raw.painPoints.length && !raw.customerProfiles.length) {
    return quickCleaned;
  }

  // Build context for AI
  const context = `
Company: ${companyName} (${companyDomain})
Raw Pain Points: ${raw.painPoints.slice(0, 2).join(' | ')}
Raw Customer Profiles: ${raw.customerProfiles.slice(0, 2).join(' | ')}
`.trim();

  const prompt = `You are an intel analyst for premium B2B connectors who route million-dollar deals.

Given this raw company data, extract SHARP insights. No fluff. No "The company..." or "They are...".

${context}

Return JSON only:
{
  "painPoint": "Their #1 business pain in <100 chars, start with action verb (scaling, hiring, losing, etc.)",
  "sellsTo": "Who they serve in <80 chars, be specific"
}

Examples of GOOD painPoint:
- "Scaling enterprise sales without burning cash"
- "Competing with VC-backed players on limited budget"
- "Finding ML engineers who actually ship"

Examples of BAD painPoint:
- "The main pain points experienced by..."
- "Company faces challenges in..."

Return ONLY valid JSON, no explanation.`;

  try {
    const response = await callAI(aiConfig, prompt);
    if (!response) return quickCleaned;

    // Parse JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return quickCleaned;

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      painPoint: parsed.painPoint || quickCleaned.painPoint,
      competitors: quickCleaned.competitors, // Keep rule-based cleaning for these
      sellsTo: parsed.sellsTo || quickCleaned.sellsTo,
      whyMatch: null,
    };
  } catch (err) {
    console.error('[IntelCleaner] AI cleaning failed:', err);
    return quickCleaned;
  }
}

/**
 * Generate a sharp "why match" reason
 */
export async function generateWhyMatch(
  demandCompany: string,
  demandPain: string | null,
  supplyCompany: string,
  supplyCapability: string | null,
  aiConfig: AIConfig
): Promise<string | null> {
  if (!demandPain && !supplyCapability) return null;

  const prompt = `You're writing a one-liner explaining why two companies should connect.

Demand: ${demandCompany}
${demandPain ? `Pain: ${demandPain}` : ''}

Supply: ${supplyCompany}
${supplyCapability ? `Does: ${supplyCapability}` : ''}

Write ONE sharp sentence (max 80 chars) explaining the match. No "This match..." or "They could...". Start with the demand company name.

Example: "Stripe needs ML talent → Toptal delivers ML engineers fast"`;

  try {
    const response = await callAI(aiConfig, prompt);
    if (!response) return null;

    // Clean up response
    let cleaned = response.trim();
    cleaned = cleaned.replace(/^["']|["']$/g, ''); // Remove quotes
    if (cleaned.length > 100) cleaned = cleaned.slice(0, 97) + '...';

    return cleaned;
  } catch {
    return null;
  }
}

// In-memory cache for cleaned intel
const cleanedIntelCache = new Map<string, CleanedIntel>();

/**
 * Get or create cleaned intel for a domain
 */
export async function getCleanedIntel(
  domain: string,
  raw: RawEnrichment,
  companyName: string,
  aiConfig: AIConfig | null,
  forceRefresh = false
): Promise<CleanedIntel> {
  const cacheKey = domain.toLowerCase();

  // Check cache
  if (!forceRefresh && cleanedIntelCache.has(cacheKey)) {
    return cleanedIntelCache.get(cacheKey)!;
  }

  // Clean with AI if available, otherwise quick clean
  let cleaned: CleanedIntel;
  if (aiConfig) {
    cleaned = await deepCleanIntel(raw, companyName, domain, aiConfig);
  } else {
    cleaned = quickCleanIntel(raw, domain);
  }

  // Cache result
  cleanedIntelCache.set(cacheKey, cleaned);

  return cleaned;
}

/**
 * Clear cache for a domain
 */
export function clearCleanedIntelCache(domain?: string): void {
  if (domain) {
    cleanedIntelCache.delete(domain.toLowerCase());
  } else {
    cleanedIntelCache.clear();
  }
}
