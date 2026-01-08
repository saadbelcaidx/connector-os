/**
 * TrustedDemandPools.ts
 *
 * TRUSTED DEMAND POOLS v0 + ROTATION LOGIC
 *
 * Maintains pools of trusted demand companies (hiring companies) per RoleType.
 * Designed for operator-grade coverage (100-300 companies per role).
 *
 * KEY PRINCIPLES:
 * - Order and tier, don't aggressively narrow
 * - Favor coverage over precision
 * - Deterministic behavior only
 * - NO AI, NO decay, NO learning
 *
 * TIERS:
 * - Tier 1: Top 15 (highest confidence + most recent)
 * - Tier 2: Next 35 (medium confidence / active)
 * - Tier 3: Next 250+ (long tail)
 *
 * ROTATION (v0):
 * - Prioritize Tier 1 → Tier 2 → Tier 3
 * - Round-robin within tier (by lastUsedAt)
 * - Distributes outreach to avoid overusing same company
 *
 * CAP: 300 companies per roleType (drop oldest by lastSeenAt)
 */

import type { RoleType } from '../pressure/InversionTable';

// ============================================================================
// TYPES
// ============================================================================

export type DemandPoolTier = 'tier1' | 'tier2' | 'tier3';

export interface TrustedDemandEntry {
  domain: string;
  companyName: string;
  lastSeenAt: string;       // ISO timestamp - when company was last discovered/updated
  lastUsedAt?: string;      // ISO timestamp - when company was last selected for outreach (for rotation)
  pressureConfidence: number; // 0-100, from pressure detection
  roleType: RoleType;
  tier: DemandPoolTier;
}

export interface TrustedDemandPool {
  companies: TrustedDemandEntry[];
  lastUpdated: string;  // ISO timestamp
}

export type TrustedDemandPools = Partial<Record<RoleType, TrustedDemandPool>>;

// ============================================================================
// CONSTANTS
// ============================================================================

const TIER_1_SIZE = 15;
const TIER_2_SIZE = 35;
const TIER_3_SIZE = 250;  // Minimum, can grow
const MAX_POOL_SIZE = 300;

// ============================================================================
// TIER ASSIGNMENT
// ============================================================================

/**
 * Assign tier based on rank position (1-indexed)
 */
export function assignDemandTier(rank: number): DemandPoolTier {
  if (rank <= TIER_1_SIZE) return 'tier1';
  if (rank <= TIER_1_SIZE + TIER_2_SIZE) return 'tier2';
  return 'tier3';
}

/**
 * Get human-readable tier label
 */
export function getDemandTierLabel(tier: DemandPoolTier): string {
  switch (tier) {
    case 'tier1': return 'Tier 1';
    case 'tier2': return 'Tier 2';
    case 'tier3': return 'Tier 3';
  }
}

/**
 * Get tier styling class
 */
export function getDemandTierStyle(tier: DemandPoolTier): string {
  switch (tier) {
    case 'tier1': return 'bg-violet-500/20 text-violet-400';
    case 'tier2': return 'bg-indigo-500/20 text-indigo-400';
    case 'tier3': return 'bg-white/10 text-white/60';
  }
}

// ============================================================================
// DEMAND ENTRY CREATION
// ============================================================================

export interface DemandCompanyInput {
  domain: string;
  companyName: string;
  pressureConfidence: number;
  roleType: RoleType;
}

/**
 * Create a single demand entry from detection result
 */
export function createDemandEntry(
  input: DemandCompanyInput
): TrustedDemandEntry {
  const now = new Date().toISOString();

  return {
    domain: input.domain,
    companyName: input.companyName,
    lastSeenAt: now,
    pressureConfidence: input.pressureConfidence,
    roleType: input.roleType,
    tier: 'tier3' // Will be re-assigned during merge
  };
}

/**
 * Convert multiple inputs to demand entries
 */
export function createDemandEntries(
  inputs: DemandCompanyInput[]
): TrustedDemandEntry[] {
  return inputs.map(input => createDemandEntry(input));
}

// ============================================================================
// POOL OPERATIONS
// ============================================================================

/**
 * Calculate ranking score for sorting (higher = better)
 * Based on: pressureConfidence (0-100) + recency bonus (0-20)
 */
function calculateRankingScore(entry: TrustedDemandEntry): number {
  const now = Date.now();
  const lastSeen = new Date(entry.lastSeenAt).getTime();
  const daysSinceLastSeen = (now - lastSeen) / (1000 * 60 * 60 * 24);

  // Recency bonus: 20 points if seen today, decays to 0 over 30 days
  const recencyBonus = Math.max(0, 20 - (daysSinceLastSeen * (20 / 30)));

  return entry.pressureConfidence + recencyBonus;
}

/**
 * Merge new entries into existing pool.
 * - Updates existing entries (by domain) with new data
 * - Appends new entries
 * - Enforces MAX_POOL_SIZE by dropping oldest entries
 */
export function mergeDemandIntoPool(
  existingPool: TrustedDemandPool | undefined,
  newEntries: TrustedDemandEntry[]
): TrustedDemandPool {
  const now = new Date().toISOString();
  const existingCompanies = existingPool?.companies ?? [];

  // Create a map for fast lookup
  const byDomain = new Map<string, TrustedDemandEntry>();

  // Add existing entries first
  for (const entry of existingCompanies) {
    byDomain.set(entry.domain, entry);
  }

  // Merge new entries (update or append)
  for (const entry of newEntries) {
    const existing = byDomain.get(entry.domain);
    if (existing) {
      // Update with new data, keep best confidence seen
      byDomain.set(entry.domain, {
        ...entry,
        pressureConfidence: Math.max(existing.pressureConfidence, entry.pressureConfidence),
        lastSeenAt: now,
        lastUsedAt: existing.lastUsedAt // Preserve usage tracking
      });
    } else {
      // New entry
      byDomain.set(entry.domain, entry);
    }
  }

  // Convert back to array
  let companies = Array.from(byDomain.values());

  // Enforce cap: drop oldest by lastSeenAt if exceeding
  if (companies.length > MAX_POOL_SIZE) {
    companies.sort((a, b) =>
      new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
    );
    companies = companies.slice(0, MAX_POOL_SIZE);
  }

  // Re-sort by ranking score (confidence + recency)
  companies.sort((a, b) => calculateRankingScore(b) - calculateRankingScore(a));

  // Re-assign tiers based on current pool ordering
  companies = companies.map((c, index) => ({
    ...c,
    tier: assignDemandTier(index + 1)
  }));

  return {
    companies,
    lastUpdated: now
  };
}

/**
 * Add a single demand company to pool for a specific roleType.
 * Call this when pressure is detected for a hiring company.
 */
export function addDemandToPool(
  pools: TrustedDemandPools,
  input: DemandCompanyInput
): TrustedDemandPools {
  if (input.roleType === 'unknown') {
    return pools;
  }

  const newEntry = createDemandEntry(input);
  const existingPool = pools[input.roleType];
  const updatedPool = mergeDemandIntoPool(existingPool, [newEntry]);

  return {
    ...pools,
    [input.roleType]: updatedPool
  };
}

/**
 * Bulk update pool for a specific roleType.
 */
export function updateDemandPoolForRole(
  pools: TrustedDemandPools,
  roleType: RoleType,
  inputs: DemandCompanyInput[]
): TrustedDemandPools {
  if (roleType === 'unknown' || inputs.length === 0) {
    return pools;
  }

  const newEntries = createDemandEntries(inputs);
  const existingPool = pools[roleType];
  const updatedPool = mergeDemandIntoPool(existingPool, newEntries);

  return {
    ...pools,
    [roleType]: updatedPool
  };
}

// ============================================================================
// POOL QUERIES
// ============================================================================

/**
 * Check if a company is in the trusted demand pool for a roleType
 */
export function isDemandInPool(
  pools: TrustedDemandPools,
  roleType: RoleType,
  domain: string
): boolean {
  const pool = pools[roleType];
  if (!pool) return false;
  return pool.companies.some(c => c.domain === domain);
}

/**
 * Get a company's pool entry if trusted
 */
export function getDemandPoolEntry(
  pools: TrustedDemandPools,
  roleType: RoleType,
  domain: string
): TrustedDemandEntry | null {
  const pool = pools[roleType];
  if (!pool) return null;
  return pool.companies.find(c => c.domain === domain) ?? null;
}

/**
 * Get pool statistics for all roleTypes
 */
export function getDemandPoolStats(
  pools: TrustedDemandPools
): Record<RoleType, { total: number; tier1: number; tier2: number; tier3: number }> {
  const roleTypes: RoleType[] = ['engineering', 'sales', 'marketing', 'operations', 'finance', 'compliance', 'unknown'];

  const stats: Record<RoleType, { total: number; tier1: number; tier2: number; tier3: number }> = {} as any;

  for (const role of roleTypes) {
    const pool = pools[role];
    if (!pool) {
      stats[role] = { total: 0, tier1: 0, tier2: 0, tier3: 0 };
    } else {
      stats[role] = {
        total: pool.companies.length,
        tier1: pool.companies.filter(c => c.tier === 'tier1').length,
        tier2: pool.companies.filter(c => c.tier === 'tier2').length,
        tier3: pool.companies.filter(c => c.tier === 'tier3').length
      };
    }
  }

  return stats;
}

/**
 * Get top N companies from a pool
 */
export function getTopDemandCompanies(
  pools: TrustedDemandPools,
  roleType: RoleType,
  limit: number = 10
): TrustedDemandEntry[] {
  const pool = pools[roleType];
  if (!pool) return [];
  return pool.companies.slice(0, limit);
}

/**
 * Get total company count across all pools
 */
export function getTotalDemandPoolSize(pools: TrustedDemandPools): number {
  let total = 0;
  for (const role of Object.keys(pools) as RoleType[]) {
    total += pools[role]?.companies.length ?? 0;
  }
  return total;
}

/**
 * Get all domains for a specific roleType
 */
export function getDomainsForRole(
  pools: TrustedDemandPools,
  roleType: RoleType
): string[] {
  const pool = pools[roleType];
  if (!pool) return [];
  return pool.companies.map(c => c.domain);
}

// ============================================================================
// ROTATION LOGIC (v0)
// ============================================================================

/**
 * Rotation result with selected company and metadata
 */
export interface DemandRotationResult {
  company: TrustedDemandEntry;
  rotationApplied: boolean;  // True if rotation changed selection from default
  reason: string;
}

/**
 * Get tier priority for sorting (lower = higher priority)
 */
function getDemandTierPriority(tier: DemandPoolTier): number {
  switch (tier) {
    case 'tier1': return 1;
    case 'tier2': return 2;
    case 'tier3': return 3;
  }
}

/**
 * Get the next company using tier-aware rotation.
 *
 * Selection priority:
 * 1. Tier (Tier 1 > Tier 2 > Tier 3)
 * 2. lastUsedAt (oldest first = round-robin effect)
 * 3. pressureConfidence (highest first as tiebreaker)
 *
 * @param pools - Current trusted demand pools
 * @param roleType - The role type to select from
 * @param eligibleDomains - Optional: limit to these domains (from current session)
 * @returns DemandRotationResult or null if no eligible companies
 */
export function getNextRotatedDemand(
  pools: TrustedDemandPools,
  roleType: RoleType,
  eligibleDomains?: string[]
): DemandRotationResult | null {
  const pool = pools[roleType];
  if (!pool || pool.companies.length === 0) return null;

  // Filter to eligible domains if provided
  let candidates = eligibleDomains
    ? pool.companies.filter(c => eligibleDomains.includes(c.domain))
    : pool.companies;

  if (candidates.length === 0) return null;

  // Sort by: tier (asc) → lastUsedAt (asc, nulls first) → pressureConfidence (desc)
  const sorted = [...candidates].sort((a, b) => {
    // 1. Tier priority (lower = better)
    const tierDiff = getDemandTierPriority(a.tier) - getDemandTierPriority(b.tier);
    if (tierDiff !== 0) return tierDiff;

    // 2. lastUsedAt (older = should be used next, nulls first)
    const aUsed = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
    const bUsed = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
    if (aUsed !== bUsed) return aUsed - bUsed;

    // 3. pressureConfidence (higher = better, as tiebreaker)
    return b.pressureConfidence - a.pressureConfidence;
  });

  const selected = sorted[0];

  // Determine if rotation changed the selection
  // (would be different from just picking highest confidence)
  const byConfidenceFirst = [...candidates].sort((a, b) => b.pressureConfidence - a.pressureConfidence)[0];
  const rotationApplied = selected.domain !== byConfidenceFirst.domain;

  const reason = rotationApplied
    ? `Rotated from ${byConfidenceFirst.companyName} to ${selected.companyName} (${getDemandTierLabel(selected.tier)})`
    : `Selected ${selected.companyName} (${getDemandTierLabel(selected.tier)})`;

  return {
    company: selected,
    rotationApplied,
    reason
  };
}

/**
 * Mark a company as used (update lastUsedAt).
 * Returns updated pools.
 */
export function markDemandUsed(
  pools: TrustedDemandPools,
  roleType: RoleType,
  domain: string
): TrustedDemandPools {
  const pool = pools[roleType];
  if (!pool) return pools;

  const now = new Date().toISOString();

  const updatedCompanies = pool.companies.map(c =>
    c.domain === domain
      ? { ...c, lastUsedAt: now }
      : c
  );

  return {
    ...pools,
    [roleType]: {
      ...pool,
      companies: updatedCompanies
    }
  };
}

// ============================================================================
// EMPTY POOL FACTORY
// ============================================================================

/**
 * Create empty pools structure
 */
export function createEmptyDemandPools(): TrustedDemandPools {
  return {};
}

