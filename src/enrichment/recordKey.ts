/**
 * RECORD KEY — Stable identifier for enrichment result storage/retrieval
 *
 * PROBLEM: Crunchbase People records have company + person_name but no domain.
 * Old code used domain as Map key, so domainless records couldn't be stored/retrieved.
 *
 * SOLUTION: Generate a stable key from available fields with priority:
 * 1. domain (existing behavior preserved)
 * 2. Crunchbase uuid (stable identifier from raw data)
 * 3. company + fullName (deterministic slug)
 * 4. company only
 * 5. hash fallback
 *
 * INVARIANT: Records with domain get key "d:<domain>" — identical to old behavior.
 */

/**
 * Simple slug: lowercase, alphanumeric only, spaces to dashes
 */
function slug(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50); // Cap length for sanity
}

/**
 * Simple hash for fallback (deterministic, not cryptographic)
 */
function simpleHash(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Generate stable key for a record.
 *
 * @param r - Record with optional domain, company, fullName, raw, recordKey
 * @returns Stable string key prefixed by source type
 *
 * PRIORITY:
 * 0. recordKey field (if set by normalization — canonical source)
 * 1. domain-based (existing behavior)
 * 2. uuid-based (Crunchbase)
 * 3. person+company slug
 * 4. company-only slug
 * 5. hash fallback
 *
 * Prefixes:
 * - "cb_person:", "cb_org:", "job:", "contact:" (from normalization)
 * - "d:" domain-based (existing behavior)
 * - "u:" uuid-based (Crunchbase)
 * - "p:" person+company slug
 * - "c:" company-only slug
 * - "x:" hash fallback
 */
export function recordKey(r: {
  recordKey?: string;  // Preferred: set by normalization
  domain?: string | null;
  company?: string | null;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  raw?: { uuid?: string } | null;
}): string {
  // Priority 0: Use recordKey from normalization if available (canonical)
  if (r.recordKey) {
    return r.recordKey;
  }
  // Priority 1: domain (preserves existing behavior exactly)
  if (r.domain) {
    return `d:${r.domain.toLowerCase()}`;
  }

  // Priority 2: Crunchbase uuid from raw data
  if (r.raw?.uuid) {
    return `u:${r.raw.uuid}`;
  }

  // Build person name from available fields
  const personName = r.fullName ||
    [r.firstName, r.lastName].filter(Boolean).join(' ').trim() ||
    null;

  // Priority 3: company + person name
  if (r.company && personName) {
    return `p:${slug(personName)}|${slug(r.company)}`;
  }

  // Priority 4: company only
  if (r.company) {
    return `c:${slug(r.company)}`;
  }

  // Priority 5: hash fallback (should rarely hit this)
  const fallbackData = JSON.stringify({
    c: r.company || '',
    n: personName || '',
  });
  return `x:${simpleHash(fallbackData)}`;
}

/**
 * Check if a key is domain-based (for backwards compatibility checks)
 */
export function isDomainKey(key: string): boolean {
  return key.startsWith('d:');
}

/**
 * Extract domain from a domain-based key (for cache compatibility)
 */
export function domainFromKey(key: string): string | null {
  if (key.startsWith('d:')) {
    return key.substring(2);
  }
  return null;
}
