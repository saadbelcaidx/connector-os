/**
 * ENRICHMENT — Input-Driven, Schema-Agnostic
 *
 * This is the ONLY enrichment model.
 * No schema-based logic is allowed outside normalize().
 *
 * ARCHITECTURE:
 * 1. Classify inputs → determine ACTION
 * 2. Get providers that support this ACTION
 * 3. Filter by user's configured providers
 * 4. Waterfall through available providers
 * 5. Return OUTCOME (never collapse to boolean)
 *
 * INVARIANTS:
 * - VERIFY is terminal: once email exists, never try other providers
 * - Providers MUST NOT be called outside their declared capabilities
 * - Outcomes MUST be preserved end-to-end (no boolean collapse)
 */

import { NormalizedRecord, Schema } from '../schemas';
import { supabase } from '../lib/supabase';

// Re-export types from router (canonical types)
export type {
  EnrichmentInputs,
  EnrichmentAction,
  EnrichmentOutcome,
  EnrichmentResult,
  RouterConfig,
  BatchEnrichmentProgress,
  ProviderName,
} from './router';

// Re-export functions from router
export {
  classifyInputs,
  routeEnrichment,
  routeEnrichmentBatch,
  getOutcomeExplanation,
  getActionExplanation,
  PROVIDER_CAPABILITIES,
} from './router';

// Import for internal use
import {
  routeEnrichment,
  RouterConfig,
  EnrichmentResult,
} from './router';

// =============================================================================
// CONSTANTS
// =============================================================================

export const RECORD_BUDGET_MS = 30_000;
export const MAX_CONCURRENCY = 5;

const SUPABASE_FUNCTIONS_URL = 'https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1';

// =============================================================================
// CONFIG TYPE (for callers)
// =============================================================================

export interface EnrichmentConfig {
  apolloApiKey?: string;
  anymailApiKey?: string;
  connectorAgentApiKey?: string;
  fetchSignals?: boolean;
}

// =============================================================================
// CACHE LAYER
// =============================================================================

const CACHE_TTL_DAYS = 90;

/**
 * Check cache for existing enrichment result.
 * Returns full EnrichmentResult with action/outcome on cache hit.
 */
async function checkCache(domain: string): Promise<EnrichmentResult | null> {
  try {
    const { data, error } = await supabase
      .from('enriched_contacts')
      .select('*')
      .eq('domain', domain.toLowerCase())
      .maybeSingle();

    if (error || !data) return null;

    const enrichedAt = new Date(data.enriched_at);
    const daysSince = (Date.now() - enrichedAt.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSince > CACHE_TTL_DAYS) {
      return null;
    }

    // Return full EnrichmentResult format (not legacy boolean format)
    return {
      action: 'FIND_PERSON', // Cache doesn't know original action, assume FIND_PERSON
      outcome: 'ENRICHED',
      email: data.email,
      firstName: data.first_name || '',
      lastName: data.last_name || '',
      title: data.title || '',
      verified: true,
      source: data.source as 'apollo' | 'anymail' | 'connectorAgent',
      inputsPresent: {
        email: false, // Cache hit means we didn't have email initially
        domain: true,
        person_name: true, // Assume we had person name for FIND_PERSON
        company: false,
      },
      providersAttempted: [],
      providerResults: {
        connectorAgent: { attempted: false },
        anymail: { attempted: false },
        apollo: { attempted: false },
      },
      durationMs: 0,
    };
  } catch {
    return null;
  }
}

/**
 * Store successful enrichment result in cache.
 * Only stores ENRICHED or VERIFIED outcomes.
 */
async function storeInCache(domain: string, result: EnrichmentResult): Promise<void> {
  // Only cache successful enrichments
  if (result.outcome !== 'ENRICHED' && result.outcome !== 'VERIFIED') return;
  if (!result.email) return;
  if (result.source === 'none' || result.source === 'existing') return;

  try {
    await supabase
      .from('enriched_contacts')
      .upsert({
        domain: domain.toLowerCase(),
        email: result.email,
        first_name: result.firstName,
        last_name: result.lastName,
        title: result.title,
        source: result.source,
        enriched_at: new Date().toISOString(),
      }, { onConflict: 'domain' });
  } catch {
    // Swallow cache errors
  }
}

// =============================================================================
// MAIN ENRICHMENT FUNCTION
// =============================================================================

/**
 * Enrich a single record.
 *
 * FLOW:
 * 1. Check cache → HIT: return cached
 * 2. Route through providers based on inputs
 * 3. Store result in cache
 *
 * Returns full EnrichmentResult with action and outcome (never boolean).
 */
export async function enrichRecord(
  record: NormalizedRecord,
  schema: Schema,
  config: EnrichmentConfig,
  signal?: string,
  correlationId?: string
): Promise<EnrichmentResult> {
  const cid = correlationId || `enrich-${Date.now()}-${record.domain?.replace(/[^a-z0-9.-]/gi, '') || 'unknown'}`;

  // STEP 1: Check cache (only if no email — if email exists, we need to VERIFY)
  if (record.domain && !record.email) {
    const cached = await checkCache(record.domain);
    if (cached) {
      console.log(`[Enrichment] cid=${cid} CACHE_HIT domain=${record.domain}`);
      return cached;
    }
  }

  // STEP 2: Build router config
  const routerConfig: RouterConfig = {
    apolloApiKey: config.apolloApiKey,
    anymailApiKey: config.anymailApiKey,
    connectorAgentApiKey: config.connectorAgentApiKey,
    supabaseFunctionsUrl: SUPABASE_FUNCTIONS_URL,
    timeoutMs: RECORD_BUDGET_MS,
  };

  // STEP 3: Route enrichment (new signature — no state machine)
  const result = await routeEnrichment(
    {
      email: record.email,
      domain: record.domain,
      firstName: record.firstName,
      lastName: record.lastName,
      fullName: record.fullName,
      name: record.fullName || `${record.firstName} ${record.lastName}`.trim(),
      company: record.company,
      title: record.title || signal,
    },
    routerConfig
  );

  // STEP 4: Store in cache (only for FIND/SEARCH actions, not VERIFY)
  if (record.domain && result.action !== 'VERIFY' && result.outcome === 'ENRICHED') {
    await storeInCache(record.domain, result);
  }

  console.log(`[Enrichment] cid=${cid} ACTION=${result.action} OUTCOME=${result.outcome} source=${result.source}`);

  return result;
}

// =============================================================================
// BATCH ENRICHMENT
// =============================================================================

/**
 * Enrich multiple records with bounded concurrency.
 *
 * Returns full EnrichmentResult with action and outcome (never boolean).
 */
export async function enrichBatch(
  records: NormalizedRecord[],
  schema: Schema,
  config: EnrichmentConfig,
  onProgress?: (current: number, total: number) => void,
  runId?: string
): Promise<Map<string, EnrichmentResult>> {
  const results = new Map<string, EnrichmentResult>();
  const rid = runId || `run-${Date.now()}`;

  // Build router config
  const routerConfig: RouterConfig = {
    apolloApiKey: config.apolloApiKey,
    anymailApiKey: config.anymailApiKey,
    connectorAgentApiKey: config.connectorAgentApiKey,
    supabaseFunctionsUrl: SUPABASE_FUNCTIONS_URL,
    timeoutMs: RECORD_BUDGET_MS,
  };

  // Process records
  let completed = 0;
  let enrichedCount = 0;
  let verifiedCount = 0;

  for (const record of records) {
    // Check cache first (only if no email — if email exists, we need to VERIFY)
    let result: EnrichmentResult | null = null;
    if (record.domain && !record.email) {
      result = await checkCache(record.domain);
    }

    if (!result) {
      // Route enrichment (new signature — no state machine)
      result = await routeEnrichment(
        {
          email: record.email,
          domain: record.domain,
          firstName: record.firstName,
          lastName: record.lastName,
          fullName: record.fullName,
          name: record.fullName || `${record.firstName} ${record.lastName}`.trim(),
          company: record.company,
          title: record.title,
        },
        routerConfig
      );

      // Store in cache (only for FIND/SEARCH actions, not VERIFY)
      if (record.domain && result.action !== 'VERIFY' && result.outcome === 'ENRICHED') {
        await storeInCache(record.domain, result);
      }
    }

    if (record.domain && result) {
      results.set(record.domain, result);
      if (result.outcome === 'ENRICHED') enrichedCount++;
      if (result.outcome === 'VERIFIED') verifiedCount++;
    }

    completed++;
    onProgress?.(completed, records.length);
  }

  console.log(`[Enrichment] batch=${rid} total=${records.length} enriched=${enrichedCount} verified=${verifiedCount}`);

  return results;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Check if result was successful (for backwards compatibility).
 * Use outcome directly when possible.
 */
export function isSuccessfulEnrichment(result: EnrichmentResult): boolean {
  return result.outcome === 'ENRICHED' || result.outcome === 'VERIFIED';
}
