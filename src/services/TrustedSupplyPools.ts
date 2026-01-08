/**
 * TrustedSupplyPools.ts
 *
 * TRUSTED SUPPLY POOLS v0 + ROTATION LOGIC
 *
 * Maintains pools of trusted supply providers per RoleType.
 * Designed for operator-grade coverage (50-200 providers per role).
 *
 * KEY PRINCIPLES:
 * - Order and tier, don't aggressively narrow
 * - Favor coverage over precision
 * - Deterministic behavior only
 * - NO AI, NO decay, NO learning
 *
 * TIERS:
 * - Tier 1: Top 10 (highest quality)
 * - Tier 2: Next 20 (high quality)
 * - Tier 3: Next 50+ (quality pool)
 *
 * ROTATION (v0):
 * - Prioritize Tier 1 → Tier 2 → Tier 3
 * - Round-robin within tier (by lastUsedAt)
 * - Distributes intros to avoid overusing same provider
 *
 * CAP: 200 providers per roleType (drop oldest by lastSeenAt)
 */

import type { RoleType } from '../pressure/InversionTable';
import type { SupplyCompany } from './SupplySignalsClient';

// ============================================================================
// TYPES
// ============================================================================

export type PoolTier = 'tier1' | 'tier2' | 'tier3';

export interface TrustedSupplyEntry {
  domain: string;
  name: string;
  lastSeenAt: string;  // ISO timestamp - when provider was last discovered/updated
  lastUsedAt?: string; // ISO timestamp - when provider was last selected for intro (for rotation)
  qualityScore: number;
  rankingReason: string[];
  tier: PoolTier;
}

export interface TrustedSupplyPool {
  providers: TrustedSupplyEntry[];
  lastUpdated: string;  // ISO timestamp
}

export type TrustedSupplyPools = Partial<Record<RoleType, TrustedSupplyPool>>;

// ============================================================================
// CONSTANTS
// ============================================================================

const TIER_1_SIZE = 10;
const TIER_2_SIZE = 20;
const TIER_3_SIZE = 50;  // Minimum, can grow
const MAX_POOL_SIZE = 200;

// ============================================================================
// TIER ASSIGNMENT
// ============================================================================

/**
 * Assign tier based on rank position (1-indexed)
 */
export function assignTier(rank: number): PoolTier {
  if (rank <= TIER_1_SIZE) return 'tier1';
  if (rank <= TIER_1_SIZE + TIER_2_SIZE) return 'tier2';
  return 'tier3';
}

/**
 * Get human-readable tier label
 */
export function getTierLabel(tier: PoolTier): string {
  switch (tier) {
    case 'tier1': return 'Tier 1';
    case 'tier2': return 'Tier 2';
    case 'tier3': return 'Tier 3';
  }
}

/**
 * Get tier styling class
 */
export function getTierStyle(tier: PoolTier): string {
  switch (tier) {
    case 'tier1': return 'bg-emerald-500/20 text-emerald-400';
    case 'tier2': return 'bg-blue-500/20 text-blue-400';
    case 'tier3': return 'bg-white/10 text-white/60';
  }
}

// ============================================================================
// POOL OPERATIONS
// ============================================================================

/**
 * Convert ranked supply companies to pool entries with tier assignments.
 * Expects companies to already be sorted by qualityScore descending.
 */
export function createPoolEntries(
  rankedCompanies: SupplyCompany[]
): TrustedSupplyEntry[] {
  const now = new Date().toISOString();

  return rankedCompanies.map((company, index) => ({
    domain: company.domain,
    name: company.name,
    lastSeenAt: now,
    qualityScore: company.qualityScore ?? 50,  // Default if not ranked
    rankingReason: company.rankingReason ?? [],
    tier: assignTier(index + 1)
  }));
}

/**
 * Merge new entries into existing pool.
 * - Updates existing entries (by domain) with new data
 * - Appends new entries
 * - Enforces MAX_POOL_SIZE by dropping oldest entries
 */
export function mergeIntoPool(
  existingPool: TrustedSupplyPool | undefined,
  newEntries: TrustedSupplyEntry[]
): TrustedSupplyPool {
  const now = new Date().toISOString();
  const existingProviders = existingPool?.providers ?? [];

  // Create a map for fast lookup
  const byDomain = new Map<string, TrustedSupplyEntry>();

  // Add existing entries first
  for (const entry of existingProviders) {
    byDomain.set(entry.domain, entry);
  }

  // Merge new entries (update or append)
  for (const entry of newEntries) {
    const existing = byDomain.get(entry.domain);
    if (existing) {
      // Update with new data, keep best score seen
      byDomain.set(entry.domain, {
        ...entry,
        qualityScore: Math.max(existing.qualityScore, entry.qualityScore),
        lastSeenAt: now
      });
    } else {
      // New entry
      byDomain.set(entry.domain, entry);
    }
  }

  // Convert back to array
  let providers = Array.from(byDomain.values());

  // Enforce cap: drop oldest by lastSeenAt if exceeding
  if (providers.length > MAX_POOL_SIZE) {
    providers.sort((a, b) =>
      new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
    );
    providers = providers.slice(0, MAX_POOL_SIZE);
  }

  // Re-sort by qualityScore for consistent ordering
  providers.sort((a, b) => b.qualityScore - a.qualityScore);

  // Re-assign tiers based on current pool ordering
  providers = providers.map((p, index) => ({
    ...p,
    tier: assignTier(index + 1)
  }));

  return {
    providers,
    lastUpdated: now
  };
}

/**
 * Update pools for a specific roleType.
 * Call this after ranking supply providers when pressure is detected.
 */
export function updatePoolForRole(
  pools: TrustedSupplyPools,
  roleType: RoleType,
  rankedCompanies: SupplyCompany[]
): TrustedSupplyPools {
  if (roleType === 'unknown' || rankedCompanies.length === 0) {
    return pools;
  }

  const newEntries = createPoolEntries(rankedCompanies);
  const existingPool = pools[roleType];
  const updatedPool = mergeIntoPool(existingPool, newEntries);

  return {
    ...pools,
    [roleType]: updatedPool
  };
}

// ============================================================================
// POOL QUERIES
// ============================================================================

/**
 * Check if a provider is in the trusted pool for a roleType
 */
export function isInPool(
  pools: TrustedSupplyPools,
  roleType: RoleType,
  domain: string
): boolean {
  const pool = pools[roleType];
  if (!pool) return false;
  return pool.providers.some(p => p.domain === domain);
}

/**
 * Get a provider's pool entry if trusted
 */
export function getPoolEntry(
  pools: TrustedSupplyPools,
  roleType: RoleType,
  domain: string
): TrustedSupplyEntry | null {
  const pool = pools[roleType];
  if (!pool) return null;
  return pool.providers.find(p => p.domain === domain) ?? null;
}

/**
 * Get pool statistics for all roleTypes
 */
export function getPoolStats(
  pools: TrustedSupplyPools
): Record<RoleType, { total: number; tier1: number; tier2: number; tier3: number }> {
  const roleTypes: RoleType[] = ['engineering', 'sales', 'marketing', 'operations', 'finance', 'compliance', 'unknown'];

  const stats: Record<RoleType, { total: number; tier1: number; tier2: number; tier3: number }> = {} as any;

  for (const role of roleTypes) {
    const pool = pools[role];
    if (!pool) {
      stats[role] = { total: 0, tier1: 0, tier2: 0, tier3: 0 };
    } else {
      stats[role] = {
        total: pool.providers.length,
        tier1: pool.providers.filter(p => p.tier === 'tier1').length,
        tier2: pool.providers.filter(p => p.tier === 'tier2').length,
        tier3: pool.providers.filter(p => p.tier === 'tier3').length
      };
    }
  }

  return stats;
}

/**
 * Get top N providers from a pool
 */
export function getTopProviders(
  pools: TrustedSupplyPools,
  roleType: RoleType,
  limit: number = 10
): TrustedSupplyEntry[] {
  const pool = pools[roleType];
  if (!pool) return [];
  return pool.providers.slice(0, limit);
}

/**
 * Get total provider count across all pools
 */
export function getTotalPoolSize(pools: TrustedSupplyPools): number {
  let total = 0;
  for (const role of Object.keys(pools) as RoleType[]) {
    total += pools[role]?.providers.length ?? 0;
  }
  return total;
}

// ============================================================================
// ROTATION LOGIC (v0)
// ============================================================================

/**
 * Rotation result with selected provider and metadata
 */
export interface RotationResult {
  provider: TrustedSupplyEntry;
  rotationApplied: boolean;  // True if rotation changed selection from default
  reason: string;
}

/**
 * Get tier priority for sorting (lower = higher priority)
 */
function getTierPriority(tier: PoolTier): number {
  switch (tier) {
    case 'tier1': return 1;
    case 'tier2': return 2;
    case 'tier3': return 3;
  }
}

/**
 * Get the next provider using tier-aware rotation.
 *
 * Selection priority:
 * 1. Tier (Tier 1 > Tier 2 > Tier 3)
 * 2. lastUsedAt (oldest first = round-robin effect)
 * 3. qualityScore (highest first as tiebreaker)
 *
 * @param pools - Current trusted supply pools
 * @param roleType - The role type to select from
 * @param eligibleDomains - Optional: limit to these domains (from current session ranking)
 * @returns RotationResult or null if no eligible providers
 */
export function getNextRotatedProvider(
  pools: TrustedSupplyPools,
  roleType: RoleType,
  eligibleDomains?: string[]
): RotationResult | null {
  const pool = pools[roleType];
  if (!pool || pool.providers.length === 0) return null;

  // Filter to eligible domains if provided
  let candidates = eligibleDomains
    ? pool.providers.filter(p => eligibleDomains.includes(p.domain))
    : pool.providers;

  if (candidates.length === 0) return null;

  // Sort by: tier (asc) → lastUsedAt (asc, nulls first) → qualityScore (desc)
  const sorted = [...candidates].sort((a, b) => {
    // 1. Tier priority (lower = better)
    const tierDiff = getTierPriority(a.tier) - getTierPriority(b.tier);
    if (tierDiff !== 0) return tierDiff;

    // 2. lastUsedAt (older = should be used next, nulls first)
    const aUsed = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
    const bUsed = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
    if (aUsed !== bUsed) return aUsed - bUsed;

    // 3. qualityScore (higher = better, as tiebreaker)
    return b.qualityScore - a.qualityScore;
  });

  const selected = sorted[0];

  // Determine if rotation changed the selection
  // (would be different from just picking highest quality score)
  const byQualityFirst = [...candidates].sort((a, b) => b.qualityScore - a.qualityScore)[0];
  const rotationApplied = selected.domain !== byQualityFirst.domain;

  const reason = rotationApplied
    ? `Rotated from ${byQualityFirst.name} to ${selected.name} (${getTierLabel(selected.tier)})`
    : `Selected ${selected.name} (${getTierLabel(selected.tier)})`;

  return {
    provider: selected,
    rotationApplied,
    reason
  };
}

/**
 * Mark a provider as used (update lastUsedAt).
 * Returns updated pools.
 */
export function markProviderUsed(
  pools: TrustedSupplyPools,
  roleType: RoleType,
  domain: string
): TrustedSupplyPools {
  const pool = pools[roleType];
  if (!pool) return pools;

  const now = new Date().toISOString();

  const updatedProviders = pool.providers.map(p =>
    p.domain === domain
      ? { ...p, lastUsedAt: now }
      : p
  );

  return {
    ...pools,
    [roleType]: {
      ...pool,
      providers: updatedProviders
    }
  };
}

/**
 * Check if a provider matches an eligible supply company (by domain)
 */
export function findPoolEntryForSupply(
  pools: TrustedSupplyPools,
  roleType: RoleType,
  supply: SupplyCompany
): TrustedSupplyEntry | null {
  return getPoolEntry(pools, roleType, supply.domain);
}

// ============================================================================
// EMPTY POOL FACTORY
// ============================================================================

/**
 * Create empty pools structure
 */
export function createEmptyPools(): TrustedSupplyPools {
  return {};
}
