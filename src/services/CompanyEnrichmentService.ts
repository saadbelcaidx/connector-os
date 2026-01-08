/**
 * CompanyEnrichmentService — Enrichment as Ammo
 *
 * Fetches company intelligence from Instantly AI:
 * - Company description
 * - Pain points
 * - Competitors
 * - Customer profiles
 *
 * Cache-first, rate-safe, 14-day TTL.
 */

import { supabase } from '../lib/supabase';

export interface CompanyEnrichment {
  description?: string;
  painPoints: string[];
  competitors: string[];
  customerProfiles: string[];
  cached: boolean;
  fetchedAt?: string;
}

interface EnrichmentCache {
  [domain: string]: {
    data: CompanyEnrichment;
    timestamp: number;
  };
}

// In-memory cache for instant lookups
const memoryCache: EnrichmentCache = {};
const MEMORY_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Get cached enrichment from memory
 */
function getFromMemory(domain: string): CompanyEnrichment | null {
  const cached = memoryCache[domain];
  if (!cached) return null;

  if (Date.now() - cached.timestamp > MEMORY_CACHE_TTL) {
    delete memoryCache[domain];
    return null;
  }

  return cached.data;
}

/**
 * Store enrichment in memory cache
 */
function storeInMemory(domain: string, data: CompanyEnrichment): void {
  memoryCache[domain] = {
    data,
    timestamp: Date.now(),
  };
}

/**
 * Clean domain string
 */
function cleanDomain(domain: string): string {
  return domain
    .toLowerCase()
    .replace(/^(https?:\/\/)?(www\.)?/, '')
    .split('/')[0]
    .trim();
}

/**
 * Fetch enrichment for a domain
 * - Checks memory cache first
 * - Then calls edge function (which checks DB cache)
 * - Returns cached or fresh data
 */
export async function enrichDomain(
  domain: string,
  instantlyApiKey: string,
  userId?: string
): Promise<CompanyEnrichment> {
  const cleanedDomain = cleanDomain(domain);

  // Check memory cache first
  const memoryCached = getFromMemory(cleanedDomain);
  if (memoryCached) {
    console.log(`[Enrichment] Memory cache hit: ${cleanedDomain}`);
    return memoryCached;
  }

  // Call edge function
  try {
    const { data, error } = await supabase.functions.invoke('instantly-enrichment', {
      body: {
        domain: cleanedDomain,
        apiKey: instantlyApiKey,
        userId: userId || null,
      },
    });

    if (error) {
      console.error('[Enrichment] Edge function error:', error);
      return emptyEnrichment();
    }

    const enrichment: CompanyEnrichment = {
      description: data.description || undefined,
      painPoints: data.painPoints || [],
      competitors: data.competitors || [],
      customerProfiles: data.customerProfiles || [],
      cached: data.cached || false,
      fetchedAt: data.fetchedAt,
    };

    // Store in memory cache
    storeInMemory(cleanedDomain, enrichment);

    console.log(`[Enrichment] Fetched for ${cleanedDomain}:`, {
      hasPains: enrichment.painPoints.length > 0,
      hasDesc: !!enrichment.description,
      cached: enrichment.cached,
    });

    return enrichment;
  } catch (err) {
    console.error('[Enrichment] Failed:', err);
    return emptyEnrichment();
  }
}

/**
 * Batch enrich multiple domains (background, non-blocking)
 */
export async function batchEnrichDomains(
  domains: string[],
  instantlyApiKey: string,
  userId?: string,
  onProgress?: (completed: number, total: number) => void
): Promise<Map<string, CompanyEnrichment>> {
  const results = new Map<string, CompanyEnrichment>();
  const uniqueDomains = [...new Set(domains.map(cleanDomain))];

  let completed = 0;

  for (const domain of uniqueDomains) {
    try {
      const enrichment = await enrichDomain(domain, instantlyApiKey, userId);
      results.set(domain, enrichment);
    } catch (err) {
      console.error(`[Enrichment] Batch failed for ${domain}:`, err);
      results.set(domain, emptyEnrichment());
    }

    completed++;
    onProgress?.(completed, uniqueDomains.length);

    // Rate limit: wait 1 second between requests (edge function handles caching)
    if (completed < uniqueDomains.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}

/**
 * Get cached enrichment without fetching (for UI display)
 */
export function getCachedEnrichment(domain: string): CompanyEnrichment | null {
  return getFromMemory(cleanDomain(domain));
}

/**
 * Check if domain has enrichment in memory
 */
export function hasEnrichment(domain: string): boolean {
  return getFromMemory(cleanDomain(domain)) !== null;
}

/**
 * Get primary pain point for narration
 * Smart selection: shortest concrete pain with verb+constraint, <120 chars
 * Never returns company description or generic fluff
 */
export function getPrimaryPain(enrichment: CompanyEnrichment): string | null {
  if (!enrichment.painPoints || enrichment.painPoints.length === 0) {
    return null;
  }

  // Filter out garbage
  const validPains = enrichment.painPoints.filter(p => {
    if (!p || p.length < 10) return false;
    // Skip company descriptions
    if (p.toLowerCase().includes('is a company') || p.toLowerCase().includes('we are a')) return false;
    // Skip generic fluff
    if (p.toLowerCase().startsWith('the main pain')) return false;
    if (p.toLowerCase().startsWith('key challenges')) return false;
    return true;
  });

  if (validPains.length === 0) return null;

  // Action verbs that signal real pain (verb + constraint)
  const actionVerbs = ['scaling', 'hiring', 'building', 'growing', 'finding', 'reducing', 'improving', 'managing', 'losing', 'struggling'];

  // Priority 1: Shortest pain <120 chars WITH action verb (best quality)
  const shortWithVerb = validPains
    .filter(p => p.length < 120 && actionVerbs.some(v => p.toLowerCase().includes(v)));
  if (shortWithVerb.length > 0) {
    return shortWithVerb.reduce((a, b) => a.length <= b.length ? a : b);
  }

  // Priority 2: Shortest pain <120 chars (concise = usable)
  const shortPains = validPains.filter(p => p.length < 120);
  if (shortPains.length > 0) {
    return shortPains.reduce((a, b) => a.length <= b.length ? a : b);
  }

  // Priority 3: Any pain with action verb, truncated
  const actionPain = validPains.find(p =>
    actionVerbs.some(v => p.toLowerCase().includes(v))
  );
  if (actionPain) {
    return actionPain.length >= 120 ? actionPain.slice(0, 117) + '...' : actionPain;
  }

  // Fallback: first valid pain, truncated
  const pain = validPains[0];
  return pain.length >= 120 ? pain.slice(0, 117) + '...' : pain;
}

/**
 * Format enrichment for match narration
 */
export function formatEnrichmentNarration(
  enrichment: CompanyEnrichment,
  companyName: string
): string | null {
  const pain = getPrimaryPain(enrichment);
  if (!pain) return null;

  return `${companyName} is struggling with: "${pain}"`;
}

/**
 * Empty enrichment result
 */
function emptyEnrichment(): CompanyEnrichment {
  return {
    painPoints: [],
    competitors: [],
    customerProfiles: [],
    cached: false,
  };
}

/**
 * Clear memory cache (for testing)
 */
export function clearMemoryCache(): void {
  Object.keys(memoryCache).forEach(key => delete memoryCache[key]);
}
