/**
 * MATCH STAGE — DETERMINISTIC + AI (OPTIONAL)
 *
 * Two substages:
 * 1. stageMatchDeterministic — REQUIRED, always succeeds if data exists
 * 2. stageMatchAI — OPTIONAL, additive, never blocks pipeline
 *
 * AI failure is logged, never thrown.
 */

import type { CanonicalEntity, Evidence, BlockReason } from './types';

// =============================================================================
// MATCH RESULT
// =============================================================================

export interface MatchResult {
  demandId: string;
  supplyId: string;
  demandDomain: string;
  supplyDomain: string;
  confidence: number;
  matchType: 'domain' | 'email_domain' | 'company_name' | 'ai';
  reason: string;
  evidence: Evidence[];
}

export interface MatchStageOutput {
  matches: MatchResult[];
  blocked: BlockReason[];
  metrics: {
    deterministicMatches: number;
    aiMatches: number;
    aiSkipped: boolean;
    aiFailed: boolean;
    aiError?: string;
    processingMs: number;
  };
}

// =============================================================================
// SAFE JSON PARSE
// =============================================================================

interface SafeParseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Safe JSON parse with schema validation.
 * Never throws — returns { success, data, error }.
 */
export function safeParse<T>(
  json: string,
  validator?: (obj: unknown) => obj is T
): SafeParseResult<T> {
  try {
    const parsed = JSON.parse(json);

    if (validator && !validator(parsed)) {
      return { success: false, error: 'Schema validation failed' };
    }

    return { success: true, data: parsed as T };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown parse error',
    };
  }
}

// =============================================================================
// DOMAIN NORMALIZATION
// =============================================================================

/**
 * Normalize domain for matching.
 * Strips protocol, www, paths, trailing slashes.
 */
export function normalizeDomain(input: string | undefined): string {
  if (!input) return '';

  let domain = input.toLowerCase().trim();

  // Remove protocol
  domain = domain.replace(/^https?:\/\//, '');

  // Remove www
  domain = domain.replace(/^www\./, '');

  // Remove path/query/hash
  domain = domain.split('/')[0].split('?')[0].split('#')[0];

  // Remove port
  domain = domain.split(':')[0];

  return domain;
}

/**
 * Extract domain from email address.
 */
export function extractDomainFromEmail(email: string | undefined): string {
  if (!email || !email.includes('@')) return '';
  return email.split('@')[1]?.toLowerCase() || '';
}

// =============================================================================
// STRING SIMILARITY (SIMPLE)
// =============================================================================

/**
 * Simple string similarity using Jaccard index on bigrams.
 * Returns 0-1 score.
 */
function stringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;

  const aNorm = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const bNorm = b.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (aNorm === bNorm) return 1;
  if (aNorm.length < 2 || bNorm.length < 2) return 0;

  // Generate bigrams
  const getBigrams = (s: string): Set<string> => {
    const bigrams = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) {
      bigrams.add(s.substring(i, i + 2));
    }
    return bigrams;
  };

  const aBigrams = getBigrams(aNorm);
  const bBigrams = getBigrams(bNorm);

  // Jaccard: intersection / union
  let intersection = 0;
  for (const bigram of aBigrams) {
    if (bBigrams.has(bigram)) intersection++;
  }

  const union = aBigrams.size + bBigrams.size - intersection;
  return union > 0 ? intersection / union : 0;
}

// =============================================================================
// STAGE: DETERMINISTIC MATCH (REQUIRED)
// =============================================================================

/**
 * CANONICAL MATCHING CONTRACT — Connector OS
 *
 * RULES (STRICT):
 * 1. EVERY demand entity MUST produce EXACTLY ONE match
 * 2. NEVER require domain equality (demand ≠ supply domains)
 * 3. NEVER drop a demand due to "no match"
 * 4. Supply selection: category fit → first available (legacy parity)
 *
 * CARDINALITY INVARIANT:
 * matches.length MUST EQUAL demand.length
 */
export function stageMatchDeterministic(
  demand: CanonicalEntity[],
  supply: CanonicalEntity[]
): { matches: MatchResult[]; blocked: BlockReason[] } {
  const startMs = Date.now();
  console.log('[Pipeline:match:deterministic] Starting with', demand.length, 'demand,', supply.length, 'supply');

  const matches: MatchResult[] = [];
  const blocked: BlockReason[] = [];

  // Filter out entities that need enrichment (no domain = can't route)
  const routableDemand = demand.filter(d => !d.needsEnrichment && d.company.domain);
  const routableSupply = supply.filter(s => !s.needsEnrichment && s.company.domain);

  // Block entities that need enrichment
  const needsEnrichmentDemand = demand.filter(d => d.needsEnrichment || !d.company.domain);
  for (const d of needsEnrichmentDemand) {
    blocked.push({
      stage: 'Match',
      code: 'NO_COMPANY_DOMAIN',
      message: `Demand entity needs enrichment: ${d.company.name || d.entityId}`,
      details: { entityId: d.entityId, companyName: d.company.name, needsEnrichment: true },
    });
  }

  if (routableDemand.length === 0) {
    blocked.push({
      stage: 'Match',
      code: 'NO_DEMAND_AVAILABLE',
      message: 'No routable demand entities (all need enrichment or missing domain)',
      details: { demandCount: demand.length, routableCount: 0 },
    });
    return { matches, blocked };
  }

  if (routableSupply.length === 0) {
    blocked.push({
      stage: 'Match',
      code: 'NO_SUPPLY_AVAILABLE',
      message: 'No routable supply entities available',
      details: { supplyCount: supply.length, routableCount: 0, demandCount: routableDemand.length },
    });
    return { matches, blocked };
  }

  // Default supply (first available — legacy parity)
  const defaultSupply = routableSupply[0];
  const defaultSupplyDomain = normalizeDomain(defaultSupply.company.domain || defaultSupply.company.website);

  // Match EVERY routable demand entity to a supply
  // CARDINALITY INVARIANT: One match per routable demand
  for (const d of routableDemand) {
    const demandDomain = normalizeDomain(d.company.domain || d.company.website);
    const demandCompanyName = d.company.name || demandDomain || 'Unknown';

    // Select best supply for this demand
    // Future: category fit, AI ranking
    // Current: first available (legacy parity)
    const selectedSupply = defaultSupply;
    const selectedSupplyDomain = defaultSupplyDomain;
    const selectedSupplyName = selectedSupply.company.name || selectedSupplyDomain || 'Provider';

    matches.push({
      demandId: d.entityId,
      supplyId: selectedSupply.entityId,
      demandDomain: demandDomain || '',
      supplyDomain: selectedSupplyDomain,
      confidence: 0.7, // Base confidence for default matching
      matchType: 'category', // Not domain-based
      reason: `${demandCompanyName} → ${selectedSupplyName}`,
      evidence: [{
        field: 'match',
        value: `Demand matched to available supply`,
        sourcePath: 'matching.default',
        extractor: 'DeterministicMatcher@1.0.0',
        confidence: 0.7,
      }],
    });
  }

  const elapsedMs = Date.now() - startMs;
  console.log('[Pipeline:match:deterministic] Complete:', matches.length, 'matches in', elapsedMs, 'ms', {
    totalDemand: demand.length,
    routableDemand: routableDemand.length,
    needsEnrichment: needsEnrichmentDemand.length,
  });

  // CARDINALITY CHECK (against routable demand, not total)
  if (matches.length !== routableDemand.length) {
    console.error('[Pipeline:match] CARDINALITY VIOLATION:', matches.length, '!==', routableDemand.length);
    blocked.push({
      stage: 'Match',
      code: 'CARDINALITY_VIOLATION',
      message: `Match count (${matches.length}) does not equal routable demand count (${routableDemand.length})`,
      details: { matchCount: matches.length, routableDemandCount: routableDemand.length },
    });
  }

  return { matches, blocked };
}

// =============================================================================
// STAGE: AI MATCH (OPTIONAL, ADDITIVE)
// =============================================================================

export interface AIMatchConfig {
  enabled: boolean;
  apiKey?: string;
  endpoint?: string;
  timeout?: number;
}

/**
 * AI matching — OPTIONAL, additive.
 * Only runs if deterministic matches exist and AI is configured.
 * NEVER throws. Failures are logged as BlockReason.
 */
export async function stageMatchAI(
  demand: CanonicalEntity[],
  supply: CanonicalEntity[],
  deterministicMatches: MatchResult[],
  config: AIMatchConfig
): Promise<{ matches: MatchResult[]; blocked: BlockReason[]; failed: boolean; error?: string }> {
  const matches: MatchResult[] = [];
  const blocked: BlockReason[] = [];

  // Gate 1: AI disabled
  if (!config.enabled) {
    console.log('[Pipeline:match:ai] Skipped (disabled)');
    return { matches, blocked, failed: false };
  }

  // Gate 2: No API key
  if (!config.apiKey) {
    console.log('[Pipeline:match:ai] Skipped (no API key)');
    return { matches, blocked, failed: false };
  }

  // Gate 3: No deterministic matches to enhance
  if (deterministicMatches.length === 0) {
    console.log('[Pipeline:match:ai] Skipped (no deterministic matches)');
    return { matches, blocked, failed: false };
  }

  console.log('[Pipeline:match:ai] Starting AI enhancement for', deterministicMatches.length, 'matches');

  try {
    // AI matching would go here
    // For now, return empty (AI is additive, not required)
    console.log('[Pipeline:match:ai] AI matching not yet implemented');
    return { matches, blocked, failed: false };

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown AI error';
    console.error('[Pipeline:match:ai] Failed:', errorMsg);

    blocked.push({
      stage: 'Match',
      code: 'MATCH_FAILED',
      message: `AI matching failed: ${errorMsg}`,
      details: { error: errorMsg },
    });

    // DO NOT throw — return gracefully
    return { matches, blocked, failed: true, error: errorMsg };
  }
}

// =============================================================================
// COMBINED MATCH STAGE
// =============================================================================

/**
 * Run complete match stage.
 * Deterministic first (required), then AI (optional).
 */
export async function stageMatch(
  demand: CanonicalEntity[],
  supply: CanonicalEntity[],
  aiConfig: AIMatchConfig
): Promise<MatchStageOutput> {
  const startMs = Date.now();

  // Stage 1: Deterministic (required)
  const deterministic = stageMatchDeterministic(demand, supply);

  // Stage 2: AI (optional, additive)
  const ai = await stageMatchAI(demand, supply, deterministic.matches, aiConfig);

  // Combine results
  const allMatches = [...deterministic.matches, ...ai.matches];
  const allBlocked = [...deterministic.blocked, ...ai.blocked];

  const elapsedMs = Date.now() - startMs;

  console.log('[Pipeline:match] Complete:', {
    deterministic: deterministic.matches.length,
    ai: ai.matches.length,
    total: allMatches.length,
    blocked: allBlocked.length,
    aiFailed: ai.failed,
    ms: elapsedMs,
  });

  return {
    matches: allMatches,
    blocked: allBlocked,
    metrics: {
      deterministicMatches: deterministic.matches.length,
      aiMatches: ai.matches.length,
      aiSkipped: !aiConfig.enabled || !aiConfig.apiKey,
      aiFailed: ai.failed,
      aiError: ai.error,
      processingMs: elapsedMs,
    },
  };
}
