/**
 * DECISION-MAKER CACHE
 *
 * Cache keyed by DECISION MAKER identity, not email.
 * Email is a field with validation metadata.
 *
 * Cache Keys (priority order):
 * 1. LinkedIn person URL
 * 2. Domain + Full Name
 * 3. Domain + Title
 * 4. Domain (company-level fallback)
 */

import type { CanonicalEntity, Evidence, BlockReason } from './types';

// =============================================================================
// CACHE TYPES
// =============================================================================

export interface CachedEmail {
  email: string;
  validated: boolean;
  validatedAt?: string;
  source: 'dataset' | 'apollo' | 'anymail' | 'cache';
}

export interface CachedDecisionMaker {
  // Identity
  entityId: string;
  linkedinUrl?: string;
  domain: string;
  fullName?: string;
  title?: string;

  // Company
  companyName?: string;
  companyLinkedin?: string;

  // Contacts
  emails: CachedEmail[];
  phones: string[];

  // Metadata
  cachedAt: string;
  updatedAt: string;
  source: 'apify' | 'apollo' | 'anymail' | 'manual';
  evidence: Evidence[];
}

export interface CacheKey {
  type: 'linkedin' | 'domain_name' | 'domain_title' | 'domain';
  key: string;
}

// =============================================================================
// CACHE STORAGE (IN-MEMORY FOR NOW)
// =============================================================================

const cache = new Map<string, CachedDecisionMaker>();

/**
 * Generate cache keys for a decision maker.
 * Returns keys in priority order.
 */
export function generateCacheKeys(entity: CanonicalEntity): CacheKey[] {
  const keys: CacheKey[] = [];

  // 1. LinkedIn person URL (highest priority)
  if (entity.person?.linkedinUrl) {
    const normalized = normalizeLinkedinUrl(entity.person.linkedinUrl);
    if (normalized) {
      keys.push({ type: 'linkedin', key: `li:${normalized}` });
    }
  }

  const domain = entity.company.domain?.toLowerCase();

  // 2. Domain + Full Name
  if (domain && entity.person?.fullName) {
    const name = entity.person.fullName.toLowerCase().replace(/\s+/g, '_');
    keys.push({ type: 'domain_name', key: `dn:${domain}:${name}` });
  }

  // 3. Domain + Title
  if (domain && entity.person?.title) {
    const title = entity.person.title.toLowerCase().replace(/\s+/g, '_');
    keys.push({ type: 'domain_title', key: `dt:${domain}:${title}` });
  }

  // 4. Domain only (company-level fallback)
  if (domain) {
    keys.push({ type: 'domain', key: `d:${domain}` });
  }

  return keys;
}

/**
 * Normalize LinkedIn URL to consistent format.
 */
function normalizeLinkedinUrl(url: string): string | null {
  if (!url) return null;

  // Extract the profile path
  const match = url.match(/linkedin\.com\/in\/([^\/\?]+)/i);
  if (match) {
    return match[1].toLowerCase();
  }

  return null;
}

// =============================================================================
// CACHE OPERATIONS
// =============================================================================

/**
 * Look up decision maker in cache.
 * Tries keys in priority order.
 */
export function cacheLookup(entity: CanonicalEntity): CachedDecisionMaker | null {
  const keys = generateCacheKeys(entity);

  for (const { key, type } of keys) {
    const cached = cache.get(key);
    if (cached) {
      console.log(`[Cache] HIT (${type}):`, key);
      return cached;
    }
  }

  console.log('[Cache] MISS:', entity.company.domain || entity.entityId);
  return null;
}

/**
 * Store decision maker in cache.
 * Stores under all applicable keys.
 */
export function cacheStore(dm: CachedDecisionMaker): void {
  const entity: CanonicalEntity = {
    entityId: dm.entityId,
    entityType: 'demand',
    company: {
      domain: dm.domain,
      name: dm.companyName,
      linkedinCompanyUrl: dm.companyLinkedin,
    },
    person: {
      fullName: dm.fullName,
      title: dm.title,
      linkedinUrl: dm.linkedinUrl,
    },
    contacts: {
      emails: dm.emails.map(e => e.email),
      phones: dm.phones,
    },
    source: { provider: 'apify', rawIndex: 0 },
    confidence: { domain: 1, email: 1, person: 1, overall: 1 },
    evidence: dm.evidence,
    raw: null,
  };

  const keys = generateCacheKeys(entity);

  for (const { key } of keys) {
    cache.set(key, dm);
  }

  console.log('[Cache] STORE:', dm.domain, dm.fullName || dm.title, `(${keys.length} keys)`);
}

/**
 * Merge cached contacts into entity.
 * Returns updated entity with merged contacts.
 */
export function mergeFromCache(
  entity: CanonicalEntity,
  cached: CachedDecisionMaker
): CanonicalEntity {
  // Merge emails (dedupe)
  const existingEmails = new Set(entity.contacts.emails.map(e => e.toLowerCase()));
  const mergedEmails = [...entity.contacts.emails];

  for (const cachedEmail of cached.emails) {
    if (!existingEmails.has(cachedEmail.email.toLowerCase())) {
      mergedEmails.push(cachedEmail.email);
    }
  }

  // Add evidence for cache hit
  const cacheEvidence: Evidence = {
    field: 'contacts.emails',
    value: `merged ${cached.emails.length} emails from cache`,
    sourcePath: 'cache',
    extractor: 'DecisionMakerCache@1.0.0',
    confidence: 0.9,
  };

  return {
    ...entity,
    contacts: {
      ...entity.contacts,
      emails: mergedEmails,
    },
    evidence: [...entity.evidence, cacheEvidence],
  };
}

/**
 * Clear cache (for testing).
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * Get cache stats.
 */
export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: cache.size,
    keys: Array.from(cache.keys()).slice(0, 20),
  };
}

// =============================================================================
// ENTITY TO CACHED DECISION MAKER
// =============================================================================

/**
 * Convert CanonicalEntity to CachedDecisionMaker.
 */
export function entityToCachedDM(
  entity: CanonicalEntity,
  source: 'apify' | 'apollo' | 'anymail' | 'manual' = 'apify'
): CachedDecisionMaker {
  const now = new Date().toISOString();

  return {
    entityId: entity.entityId,
    linkedinUrl: entity.person?.linkedinUrl,
    domain: entity.company.domain || '',
    fullName: entity.person?.fullName,
    title: entity.person?.title,
    companyName: entity.company.name,
    companyLinkedin: entity.company.linkedinCompanyUrl,
    emails: entity.contacts.emails.map(email => ({
      email,
      validated: false,
      source: source === 'apify' ? 'dataset' : source,
    })),
    phones: entity.contacts.phones,
    cachedAt: now,
    updatedAt: now,
    source,
    evidence: entity.evidence,
  };
}
