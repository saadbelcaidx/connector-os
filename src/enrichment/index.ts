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

// Record key for stable storage/retrieval (supports domainless records)
import { recordKey, domainFromKey } from './recordKey';
export { recordKey } from './recordKey';

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
 * Uses recordKey (stable identifier) — works for domainless records too.
 */
async function checkCache(key: string): Promise<EnrichmentResult | null> {
  try {
    const { data, error } = await supabase
      .from('enriched_contacts')
      .select('*')
      .eq('domain', key.toLowerCase())  // 'domain' column stores recordKey
      .maybeSingle();

    if (error || !data) return null;

    const enrichedAt = new Date(data.enriched_at);
    const daysSince = (Date.now() - enrichedAt.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSince > CACHE_TTL_DAYS) {
      return null;
    }

    console.log(`[Enrichment] CACHE_HIT key=${key}`);

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
        domain: !!data.domain?.includes('.'),  // Guess based on key format
        person_name: true,
        company: true,
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
 * Uses recordKey (stable identifier) — works for domainless records too.
 */
async function storeInCache(key: string, result: EnrichmentResult): Promise<void> {
  // Only cache successful enrichments
  if (result.outcome !== 'ENRICHED' && result.outcome !== 'VERIFIED') return;
  if (!result.email) return;
  if (result.source === 'none' || result.source === 'existing') return;

  try {
    await supabase
      .from('enriched_contacts')
      .upsert({
        domain: key.toLowerCase(),  // 'domain' column stores recordKey
        email: result.email,
        first_name: result.firstName,
        last_name: result.lastName,
        title: result.title,
        source: result.source,
        enriched_at: new Date().toISOString(),
      }, { onConflict: 'domain' });
    console.log(`[Enrichment] CACHE_STORE key=${key} email=${result.email}`);
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
  // Use recordKey for stable identification (works for domainless records)
  const key = recordKey(record);
  const cid = correlationId || `enrich-${Date.now()}-${key.replace(/[^a-z0-9.-]/gi, '').slice(0, 30)}`;

  // STEP 1: Check cache (only if no email)
  // Now works for domainless records too (uses recordKey)
  if (!record.email) {
    const cached = await checkCache(key);
    if (cached) {
      return cached;
    }
  }

  // STEP 1.5: PRE-ENRICHED — If email already exists (from CSV), trust it
  // User's data is their responsibility. No verification, no API calls.
  // This is the Stripe pattern: user provides data, we use it.
  if (record.email) {
    console.log(`[Enrichment] cid=${cid} PRE_ENRICHED email=${record.email.slice(0, 3)}***`);
    return {
      action: 'VERIFY', // Was going to verify, but we're trusting instead
      outcome: 'ENRICHED',
      email: record.email,
      firstName: record.firstName || '',
      lastName: record.lastName || '',
      title: record.title || '',
      verified: true, // Trust user's data
      source: 'existing',
      inputsPresent: {
        email: true,
        domain: !!record.domain,
        person_name: !!(record.firstName || record.lastName),
        company: !!record.company,
      },
      providersAttempted: [],
      providerResults: {
        connectorAgent: { attempted: false },
        anymail: { attempted: false },
        apollo: { attempted: false },
      },
      durationMs: 0,
    };
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
  // Now works for domainless records too (uses recordKey)
  if (result.action !== 'VERIFY' && result.outcome === 'ENRICHED') {
    await storeInCache(key, result);
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
  const batchStart = performance.now();
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
    // Use recordKey for stable identification (works for domainless records)
    const key = recordKey(record);

    // PRE-ENRICHED — If email already exists (from CSV), trust it immediately
    // User's data is their responsibility. No verification, no API calls.
    if (record.email) {
      results.set(key, {
        action: 'VERIFY',
        outcome: 'ENRICHED',
        email: record.email,
        firstName: record.firstName || '',
        lastName: record.lastName || '',
        title: record.title || '',
        verified: true,
        source: 'existing',
        inputsPresent: {
          email: true,
          domain: !!record.domain,
          person_name: !!(record.firstName || record.lastName),
          company: !!record.company,
        },
        providersAttempted: [],
        providerResults: {
          connectorAgent: { attempted: false },
          anymail: { attempted: false },
          apollo: { attempted: false },
        },
        durationMs: 0,
      });
      enrichedCount++;
      completed++;
      onProgress?.(completed, records.length);
      continue;
    }

    // Check cache first (no email, so we might have cached result)
    let result: EnrichmentResult | null = null;
    result = await checkCache(key);

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
      if (result.action !== 'VERIFY' && result.outcome === 'ENRICHED') {
        await storeInCache(key, result);
      }
    }

    // Store result using stable key (supports domainless records)
    if (result) {
      results.set(key, result);
      if (result.outcome === 'ENRICHED') enrichedCount++;
      if (result.outcome === 'VERIFIED') verifiedCount++;
    }

    completed++;
    onProgress?.(completed, records.length);
  }

  const batchDuration = performance.now() - batchStart;
  const batchSuccess = enrichedCount + verifiedCount;
  const batchFailures = records.length - batchSuccess;

  console.log('[Enrichment] BATCH_COMPLETE', {
    total: records.length,
    success: batchSuccess,
    failures: batchFailures,
    durationMs: Math.round(batchDuration),
    avgLatencyMs: records.length === 0 ? 0 : Math.round(batchDuration / records.length),
  });

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
