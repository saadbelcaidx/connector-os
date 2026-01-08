/**
 * PreEnrichedContactsPool.ts
 *
 * PRE-ENRICHED CONTACTS POOL v0
 *
 * Maintains pools of pre-enriched contacts per RoleType.
 * Only contains leads with VERIFIED contact info (email required).
 *
 * KEY PRINCIPLES:
 * - Only "ready" leads (verified email)
 * - Capacity per roleType (scales automatically)
 * - Filled by background enrichment worker
 * - Consumed by batch send (deterministic, fast)
 * - NO inline enrichment during batch
 *
 * LIFECYCLE:
 * 1. Pressure detected → demand companies added to TrustedDemandPools
 * 2. Background worker picks unenriched companies
 * 3. Worker enriches sequentially (rate-limited)
 * 4. Enriched contacts added here
 * 5. Batch send consumes from here only
 *
 * CAPACITY: Scales automatically based on usage
 */

import type { RoleType } from '../pressure/InversionTable';
import type { PersonData } from './PersonEnrichmentService';

// ============================================================================
// TYPES
// ============================================================================

export type EmailVerificationStatus = 'verified' | 'risky' | 'invalid' | 'pending';
export type EmailSource = 'apollo' | 'anymailfinder' | 'apify';

export interface PreEnrichedContact {
  // Company info
  domain: string;
  companyName: string;
  roleType: RoleType;

  // Contact info (REQUIRED - only verified contacts in pool)
  email: string;
  name: string;
  title: string;
  linkedin?: string;

  // Email verification (NEW)
  emailSource: EmailSource;
  emailVerificationStatus: EmailVerificationStatus;
  emailVerifiedAt?: string;   // ISO timestamp - when email was verified

  // Metadata
  enrichedAt: string;         // ISO timestamp - when contact was enriched
  consumedAt?: string;        // ISO timestamp - when consumed by batch send
  signalSummary?: string;     // For intro generation context
  signalStrength?: number;

  // Status
  status: 'ready' | 'consumed' | 'failed';
}

export interface PreEnrichedPool {
  contacts: PreEnrichedContact[];
  lastUpdated: string;  // ISO timestamp
}

export type PreEnrichedContactsPools = Partial<Record<RoleType, PreEnrichedPool>>;

// ============================================================================
// CONSTANTS
// ============================================================================

// Default pool capacity (can be overridden per-operator)
const DEFAULT_POOL_CAPACITY = 500;

// ============================================================================
// POOL CREATION
// ============================================================================

/**
 * Create empty pools structure
 */
export function createEmptyPreEnrichedPools(): PreEnrichedContactsPools {
  return {};
}

/**
 * Create a single pre-enriched contact entry
 */
export function createPreEnrichedContact(
  domain: string,
  companyName: string,
  roleType: RoleType,
  person: PersonData,
  emailSource: EmailSource,
  emailVerificationStatus: EmailVerificationStatus,
  signalSummary?: string,
  signalStrength?: number
): PreEnrichedContact | null {
  // MUST have email - this is the whole point
  if (!person.email) {
    return null;
  }

  // Allow verified and risky into pool (risky = dev fallback, batch send filters them out)
  // Reject invalid and pending
  if (emailVerificationStatus !== 'verified' && emailVerificationStatus !== 'risky') {
    console.log(`[PreEnrichedPool] Rejecting ${person.email} - status: ${emailVerificationStatus}`);
    return null;
  }

  return {
    domain,
    companyName,
    roleType,
    email: person.email,
    name: person.name || '',
    title: person.title || '',
    linkedin: person.linkedin,
    emailSource,
    emailVerificationStatus,
    emailVerifiedAt: new Date().toISOString(),
    enrichedAt: new Date().toISOString(),
    signalSummary,
    signalStrength,
    status: 'ready'
  };
}

// ============================================================================
// POOL OPERATIONS
// ============================================================================

/**
 * Add enriched contact to pool.
 * Returns null if contact has no email (not added).
 */
export function addToPreEnrichedPool(
  pools: PreEnrichedContactsPools,
  contact: PreEnrichedContact
): PreEnrichedContactsPools {
  if (contact.roleType === 'unknown' || !contact.email) {
    return pools;
  }

  const existingPool = pools[contact.roleType] || { contacts: [], lastUpdated: '' };
  const now = new Date().toISOString();

  // Check if domain already exists
  const existingIndex = existingPool.contacts.findIndex(c => c.domain === contact.domain);

  let updatedContacts: PreEnrichedContact[];

  if (existingIndex >= 0) {
    // Update existing entry
    updatedContacts = [...existingPool.contacts];
    updatedContacts[existingIndex] = {
      ...contact,
      enrichedAt: now,
      status: 'ready'
    };
  } else {
    // Add new entry
    updatedContacts = [contact, ...existingPool.contacts];

    // Keep within capacity: drop oldest (by enrichedAt) if exceeding
    if (updatedContacts.length > DEFAULT_POOL_CAPACITY) {
      // Sort by enrichedAt descending, keep newest
      updatedContacts.sort((a, b) =>
        new Date(b.enrichedAt).getTime() - new Date(a.enrichedAt).getTime()
      );
      updatedContacts = updatedContacts.slice(0, DEFAULT_POOL_CAPACITY);
    }
  }

  return {
    ...pools,
    [contact.roleType]: {
      contacts: updatedContacts,
      lastUpdated: now
    }
  };
}

/**
 * Bulk add contacts to pool for a roleType
 */
export function bulkAddToPreEnrichedPool(
  pools: PreEnrichedContactsPools,
  contacts: PreEnrichedContact[]
): PreEnrichedContactsPools {
  let result = pools;
  for (const contact of contacts) {
    result = addToPreEnrichedPool(result, contact);
  }
  return result;
}

// ============================================================================
// POOL QUERIES
// ============================================================================

/**
 * Get ready contacts for a roleType (not yet consumed, VERIFIED ONLY)
 */
export function getReadyContacts(
  pools: PreEnrichedContactsPools,
  roleType: RoleType,
  limit?: number
): PreEnrichedContact[] {
  const pool = pools[roleType];
  if (!pool) return [];

  // CRITICAL: Only return verified emails - double-check even if createPreEnrichedContact enforces this
  const ready = pool.contacts.filter(c =>
    c.status === 'ready' &&
    c.emailVerificationStatus === 'verified'
  );

  if (limit && limit > 0) {
    return ready.slice(0, limit);
  }

  return ready;
}

/**
 * Get count of ready contacts for a roleType (VERIFIED ONLY)
 */
export function getReadyCount(
  pools: PreEnrichedContactsPools,
  roleType: RoleType
): number {
  const pool = pools[roleType];
  if (!pool) return 0;
  return pool.contacts.filter(c =>
    c.status === 'ready' &&
    c.emailVerificationStatus === 'verified'
  ).length;
}

/**
 * Get count of UNIQUE emails in ready pool (deduped - actual sendable count)
 * This is what will actually be sent since duplicates are filtered during batch send
 */
export function getUniqueSendCount(
  pools: PreEnrichedContactsPools,
  roleType: RoleType
): number {
  const pool = pools[roleType];
  if (!pool) return 0;
  const uniqueEmails = new Set<string>();
  for (const c of pool.contacts) {
    if (c.status === 'ready' && c.emailVerificationStatus === 'verified' && c.email) {
      uniqueEmails.add(c.email.toLowerCase());
    }
  }
  return uniqueEmails.size;
}

/**
 * Check if a domain has a ready contact (VERIFIED ONLY)
 */
export function hasReadyContact(
  pools: PreEnrichedContactsPools,
  roleType: RoleType,
  domain: string
): boolean {
  const pool = pools[roleType];
  if (!pool) return false;
  return pool.contacts.some(c =>
    c.domain === domain &&
    c.status === 'ready' &&
    c.emailVerificationStatus === 'verified'
  );
}

/**
 * Get a specific contact by domain
 */
export function getContactByDomain(
  pools: PreEnrichedContactsPools,
  roleType: RoleType,
  domain: string
): PreEnrichedContact | null {
  const pool = pools[roleType];
  if (!pool) return null;
  return pool.contacts.find(c => c.domain === domain) ?? null;
}

/**
 * Get pool statistics for all roleTypes
 */
export function getPreEnrichedPoolStats(
  pools: PreEnrichedContactsPools
): Record<RoleType, { total: number; ready: number; verified: number; risky: number; consumed: number }> {
  const roleTypes: RoleType[] = ['engineering', 'sales', 'marketing', 'operations', 'finance', 'compliance', 'unknown'];

  const stats: Record<RoleType, { total: number; ready: number; verified: number; risky: number; consumed: number }> = {} as any;

  for (const role of roleTypes) {
    const pool = pools[role];
    if (!pool) {
      stats[role] = { total: 0, ready: 0, verified: 0, risky: 0, consumed: 0 };
    } else {
      const readyContacts = pool.contacts.filter(c => c.status === 'ready');
      stats[role] = {
        total: pool.contacts.length,
        ready: readyContacts.length,
        verified: readyContacts.filter(c => c.emailVerificationStatus === 'verified').length,
        risky: readyContacts.filter(c => c.emailVerificationStatus === 'risky').length,
        consumed: pool.contacts.filter(c => c.status === 'consumed').length
      };
    }
  }

  return stats;
}

/**
 * Get total ready count across all pools
 */
export function getTotalReadyCount(pools: PreEnrichedContactsPools): number {
  let total = 0;
  for (const role of Object.keys(pools) as RoleType[]) {
    total += getReadyCount(pools, role);
  }
  return total;
}

// ============================================================================
// CONSUMPTION (for batch send)
// ============================================================================

/**
 * Mark a contact as consumed (used by batch send).
 * Returns updated pools.
 */
export function markContactConsumed(
  pools: PreEnrichedContactsPools,
  roleType: RoleType,
  domain: string
): PreEnrichedContactsPools {
  const pool = pools[roleType];
  if (!pool) return pools;

  const now = new Date().toISOString();

  const updatedContacts = pool.contacts.map(c =>
    c.domain === domain
      ? { ...c, status: 'consumed' as const, consumedAt: now }
      : c
  );

  return {
    ...pools,
    [roleType]: {
      ...pool,
      contacts: updatedContacts,
      lastUpdated: now
    }
  };
}

/**
 * Consume next N ready contacts for batch send.
 * Returns the contacts AND updates pools to mark them consumed.
 */
export function consumeReadyContacts(
  pools: PreEnrichedContactsPools,
  roleType: RoleType,
  count: number
): { contacts: PreEnrichedContact[]; updatedPools: PreEnrichedContactsPools } {
  const ready = getReadyContacts(pools, roleType, count);

  let updatedPools = pools;
  for (const contact of ready) {
    updatedPools = markContactConsumed(updatedPools, roleType, contact.domain);
  }

  return { contacts: ready, updatedPools };
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Remove consumed contacts older than N days
 */
export function cleanupConsumedContacts(
  pools: PreEnrichedContactsPools,
  maxAgeDays: number = 7
): PreEnrichedContactsPools {
  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  const result: PreEnrichedContactsPools = {};

  for (const role of Object.keys(pools) as RoleType[]) {
    const pool = pools[role];
    if (!pool) continue;

    const filteredContacts = pool.contacts.filter(c => {
      if (c.status !== 'consumed') return true;
      if (!c.consumedAt) return true;

      const consumedAt = new Date(c.consumedAt).getTime();
      return (now - consumedAt) < maxAgeMs;
    });

    result[role] = {
      contacts: filteredContacts,
      lastUpdated: pool.lastUpdated
    };
  }

  return result;
}

// ============================================================================
// DOMAINS NEEDING ENRICHMENT
// ============================================================================

/**
 * Get domains from TrustedDemandPools that are NOT in PreEnrichedContactsPool.
 * These are candidates for background enrichment.
 */
export function getDomainsNeedingEnrichment(
  demandDomains: string[],
  pools: PreEnrichedContactsPools,
  roleType: RoleType,
  limit: number = 50
): string[] {
  const pool = pools[roleType];
  const enrichedDomains = new Set(pool?.contacts.map(c => c.domain) ?? []);

  const needsEnrichment = demandDomains.filter(d => !enrichedDomains.has(d));

  return needsEnrichment.slice(0, limit);
}

