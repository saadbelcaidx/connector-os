/**
 * ENRICHMENT — Smart Email Resolution
 *
 * Three providers. Waterfall pattern.
 *
 * B2B Contacts: email exists → verify (Connector Agent/Anymail) → continue/discard
 * Startup Jobs: no email → Apollo → Anymail → Connector Agent fallback
 *
 * CACHE LAYER: Check cache first. More users = richer cache = less API spend.
 *
 * CONCURRENCY: Bounded pool (MAX_CONCURRENCY) for throughput without deadlocks.
 * CIRCUIT BREAKER: Temporarily disable degraded providers within a batch.
 */

import { NormalizedRecord, Schema } from '../schemas';
import { supabase } from '../lib/supabase';
import { connectorAgentVerify, connectorAgentFind } from '../services/ConnectorAgentService';
import { fetchJson, isFetchError } from '../utils/fetchWithTimeout';

// =============================================================================
// CONSTANTS
// =============================================================================

export const RECORD_BUDGET_MS = 30_000;
export const MAX_CONCURRENCY = 5;
const CIRCUIT_BREAKER_THRESHOLD = 5;

const ANYMAIL_VERIFY_TIMEOUT_MS = 12_000;
const ANYMAIL_FIND_TIMEOUT_MS = 18_000;
const APOLLO_TIMEOUT_MS = 18_000;
const RETRIES = 1;

const SUPABASE_FUNCTIONS_URL = 'https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1';

// =============================================================================
// CIRCUIT BREAKER (batch-scoped, in-memory only)
// =============================================================================

type ProviderName = 'connectorAgent' | 'anymail' | 'apollo';

export interface CircuitBreaker {
  failures: Record<ProviderName, number>;
  disabled: Record<ProviderName, boolean>;
}

export function createCircuitBreaker(): CircuitBreaker {
  return {
    failures: { connectorAgent: 0, anymail: 0, apollo: 0 },
    disabled: { connectorAgent: false, anymail: false, apollo: false },
  };
}

function recordFailure(breaker: CircuitBreaker, provider: ProviderName): void {
  breaker.failures[provider]++;
  if (breaker.failures[provider] >= CIRCUIT_BREAKER_THRESHOLD && !breaker.disabled[provider]) {
    breaker.disabled[provider] = true;
    console.log(`[Enrichment] provider=${provider} action=DISABLED_TEMPORARILY reason=consecutive_failures`);
  }
}

function recordSuccess(breaker: CircuitBreaker, provider: ProviderName): void {
  breaker.failures[provider] = 0;
}

function isDisabled(breaker: CircuitBreaker, provider: ProviderName): boolean {
  return breaker.disabled[provider];
}

// =============================================================================
// LOG THROTTLE (per-flow, in-memory only)
// =============================================================================

interface FlowLogState {
  seen: Set<string>;
  counters: Map<string, number>;
  firstTs: number;
}

const flowLogStates = new Map<string, FlowLogState>();
const MAX_FLOW_STATES = 200;
const ENRICHMENT_LOG_HEARTBEAT_EVERY = 0; // Set to 25 for periodic heartbeat

function getFlowState(flowId: string): FlowLogState {
  let state = flowLogStates.get(flowId);
  if (!state) {
    // Safety cap: clear oldest if too many flows tracked
    if (flowLogStates.size >= MAX_FLOW_STATES) {
      let oldestKey: string | null = null;
      let oldestTs = Infinity;
      for (const [key, s] of flowLogStates) {
        if (s.firstTs < oldestTs) {
          oldestTs = s.firstTs;
          oldestKey = key;
        }
      }
      if (oldestKey) flowLogStates.delete(oldestKey);
    }
    state = { seen: new Set(), counters: new Map(), firstTs: Date.now() };
    flowLogStates.set(flowId, state);
  }
  return state;
}

function shouldLogOnce(flowId: string, key: string): boolean {
  const state = getFlowState(flowId);
  if (state.seen.has(key)) return false;
  state.seen.add(key);
  return true;
}

function countLog(flowId: string, counterKey: string): number {
  const state = getFlowState(flowId);
  const current = (state.counters.get(counterKey) || 0) + 1;
  state.counters.set(counterKey, current);
  return current;
}

function flushFlowLogs(flowId: string): { counters: Record<string, number>; uniqueDomains: number } | null {
  const state = flowLogStates.get(flowId);
  if (!state) return null;
  const result = {
    counters: Object.fromEntries(state.counters),
    uniqueDomains: state.seen.size,
  };
  flowLogStates.delete(flowId);
  return result;
}

// =============================================================================
// TYPES
// =============================================================================

export interface EnrichmentConfig {
  apolloApiKey?: string;
  anymailApiKey?: string;
  connectorAgentApiKey?: string;
  circuitBreaker?: CircuitBreaker;
  fetchSignals?: boolean; // Fetch company signals for B2B Contacts (default false)
}

/**
 * Signals — optional metadata extracted from Apollo organization data.
 * Read-only overlay. Never affects matching, intros, or validation.
 */
export interface Signals {
  funding_total: number | null;
  latest_funding_round_date: string | null;
  estimated_num_employees: number | null;
  technologies: string[] | null;
}

export interface EnrichmentResult {
  success: boolean;
  email: string | null;
  firstName: string;
  lastName: string;
  title: string;
  verified: boolean;
  source: 'existing' | 'anymail' | 'apollo' | 'timeout';
  signals?: Signals; // Optional metadata overlay — never required
}

/**
 * Extract signals from Apollo organization object.
 * Pure function — no side effects, no inference, no interpretation.
 * Returns undefined if organization is missing or empty.
 */
function extractSignalsFromApollo(organization: any): Signals | undefined {
  if (!organization || typeof organization !== 'object') {
    return undefined;
  }

  const signals: Signals = {
    funding_total: organization.funding_total ?? null,
    latest_funding_round_date: organization.latest_funding_round_date ?? null,
    estimated_num_employees: organization.estimated_num_employees ?? null,
    technologies: Array.isArray(organization.technologies) ? organization.technologies : null,
  };

  // Return undefined if all fields are null (no signal data)
  const hasAnySignal = signals.funding_total !== null ||
    signals.latest_funding_round_date !== null ||
    signals.estimated_num_employees !== null ||
    (signals.technologies !== null && signals.technologies.length > 0);

  return hasAnySignal ? signals : undefined;
}

// =============================================================================
// CACHE LAYER
// =============================================================================

const CACHE_TTL_DAYS = 90;

interface CachedContact {
  domain: string;
  email: string;
  first_name: string;
  last_name: string;
  title: string;
  source: string;
  enriched_at: string;
}

/**
 * Check cache for existing enrichment.
 */
async function checkCache(domain: string): Promise<EnrichmentResult | null> {
  try {
    const { data, error } = await supabase
      .from('enriched_contacts')
      .select('*')
      .eq('domain', domain.toLowerCase())
      .maybeSingle();

    if (error || !data) return null;

    // Check TTL
    const enrichedAt = new Date(data.enriched_at);
    const daysSince = (Date.now() - enrichedAt.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSince > CACHE_TTL_DAYS) {
      return null; // Stale, re-enrich
    }

    return {
      success: true,
      email: data.email,
      firstName: data.first_name,
      lastName: data.last_name,
      title: data.title,
      verified: true,
      source: data.source as 'apollo' | 'anymail' | 'existing',
    };
  } catch (err) {
    return null;
  }
}

/**
 * Store enrichment result in cache.
 */
async function storeInCache(domain: string, result: EnrichmentResult): Promise<void> {
  // Never cache timeout or failed results
  if (!result.success || !result.email || result.source === 'timeout') return;

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
  } catch (err) {
    // Swallow cache errors
  }
}

// =============================================================================
// INTERNAL ENRICHMENT LOGIC (called within budget guard)
// =============================================================================

async function enrichRecordInternal(
  record: NormalizedRecord,
  schema: Schema,
  config: EnrichmentConfig,
  signal: string | undefined,
  correlationId: string
): Promise<EnrichmentResult> {

  // STEP 1: Check cache first
  const cached = await checkCache(record.domain);
  if (cached) {
    return cached;
  }

  let result: EnrichmentResult;
  const breaker = config.circuitBreaker;

  // B2B Contacts - has contact info
  if (schema.hasContacts) {

    // Helper: Fetch company signals if enabled (B2B Contacts only)
    // DOCTRINE: Only after verification success, fail silently, no new fan-out
    const maybeAttachSignals = async (r: EnrichmentResult): Promise<EnrichmentResult> => {
      if (
        config.fetchSignals === true &&
        config.apolloApiKey &&
        r.verified === true &&
        !r.signals &&
        record.domain
      ) {
        r.signals = await orgEnrich(record.domain, config.apolloApiKey, correlationId);
      }
      return r;
    };

    if (record.email) {
      // Has email → verify
      const verified = await verifyEmail(record.email, config, correlationId, breaker);

      if (verified) {
        result = {
          success: true,
          email: record.email,
          firstName: record.firstName,
          lastName: record.lastName,
          title: record.title,
          verified: true,
          source: 'existing',
        };
        // Fetch signals if enabled (B2B Contacts overlay)
        await maybeAttachSignals(result);
        // Don't cache existing emails, only enriched ones
        return result;
      }

      // Email invalid, try Anymail with name + domain
      result = await anymailEnrich(record.fullName, record.domain, config, correlationId, breaker);
      if (result.success) {
        await maybeAttachSignals(result);
        await storeInCache(record.domain, result);
        return result;
      }

      // Anymail failed, try Connector Agent
      result = await connectorAgentEnrich(record.firstName, record.lastName, record.domain, config, correlationId, breaker);
      await maybeAttachSignals(result);
      await storeInCache(record.domain, result);
      return result;
    }

    // No email, but has name + domain → Anymail → Connector Agent
    if (record.fullName && record.domain) {
      result = await anymailEnrich(record.fullName, record.domain, config, correlationId, breaker);
      if (result.success) {
        await maybeAttachSignals(result);
        await storeInCache(record.domain, result);
        return result;
      }

      // Anymail failed, try Connector Agent
      result = await connectorAgentEnrich(record.firstName, record.lastName, record.domain, config, correlationId, breaker);
      await maybeAttachSignals(result);
      await storeInCache(record.domain, result);
      return result;
    }

    // Nothing to work with
    return { success: false, email: null, firstName: '', lastName: '', title: '', verified: false, source: 'existing' };
  }

  // Startup Jobs - no contact, need to find by role
  result = await apolloEnrich(record.domain, signal || record.signal, config, correlationId, breaker);
  await storeInCache(record.domain, result);
  return result;
}

// =============================================================================
// MAIN ENRICHMENT FUNCTION (with budget guard)
// =============================================================================

/**
 * Get verified email for a record.
 *
 * FLOW:
 * 1. Check cache → HIT: return cached
 * 2. B2B Contacts: verify existing email or Anymail lookup
 * 3. Startup Jobs: Apollo → Anymail fallback
 * 4. Store result in cache
 *
 * BUDGET: Hard cap of RECORD_BUDGET_MS per record.
 */
export async function enrichRecord(
  record: NormalizedRecord,
  schema: Schema,
  config: EnrichmentConfig,
  signal?: string,
  correlationId?: string
): Promise<EnrichmentResult> {
  const cid = correlationId || `enrich-${Date.now()}-${record.domain?.replace(/[^a-z0-9.-]/gi, '') || 'unknown'}`;

  // Budget timeout result
  const timeoutResult: EnrichmentResult = {
    success: false,
    email: record.email || null,
    firstName: record.firstName || '',
    lastName: record.lastName || '',
    title: record.title || '',
    verified: false,
    source: 'timeout',
  };

  // Race enrichment against budget timeout
  const budgetPromise = new Promise<EnrichmentResult>((resolve) => {
    setTimeout(() => {
      // Throttled logging: one line per unique domain, count all
      const flowId = cid.split('-')[0] + '-' + cid.split('-')[1]; // e.g., "enrich-1234567890"
      const logKey = `BUDGET_EXCEEDED:${record.domain}`;
      const count = countLog(flowId, 'budgetExceeded');

      if (shouldLogOnce(flowId, logKey)) {
        console.log(`[Enrichment] cid=${cid} BUDGET_EXCEEDED domain=${record.domain}`);
      }

      // Optional heartbeat every N occurrences
      if (ENRICHMENT_LOG_HEARTBEAT_EVERY > 0 && count % ENRICHMENT_LOG_HEARTBEAT_EVERY === 0) {
        const state = getFlowState(flowId);
        const suppressed = count - state.seen.size;
        console.log(`[Enrichment] cid=${flowId} budget_exceeded_seen=${count} (suppressed=${suppressed})`);
      }

      resolve(timeoutResult);
    }, RECORD_BUDGET_MS);
  });

  try {
    const result = await Promise.race([
      enrichRecordInternal(record, schema, config, signal, cid),
      budgetPromise,
    ]);
    return result;
  } catch (err) {
    const code = isFetchError(err) ? err.code : 'ERROR';
    console.log(`[Enrichment] cid=${cid} FAILED domain=${record.domain} code=${code}`);
    return timeoutResult;
  }
}

// =============================================================================
// VERIFICATION
// =============================================================================

/**
 * Verify an email using Connector Agent or Anymail.
 *
 * DOCTRINE (fixed order):
 * 1. Connector Agent first (if user has key)
 * 2. Anymail Verify fallback (if user has Anymail)
 * 3. If both fail → return false (discard email)
 *
 * NO regex-only checks. NO blind trust.
 */
async function verifyEmail(
  email: string,
  config: EnrichmentConfig,
  correlationId: string,
  breaker?: CircuitBreaker
): Promise<boolean> {
  if (!email || !email.includes('@')) return false;

  // STEP 1: Try Connector Agent first (if available and not disabled)
  if (config.connectorAgentApiKey && (!breaker || !isDisabled(breaker, 'connectorAgent'))) {
    try {
      const result = await connectorAgentVerify(config.connectorAgentApiKey, email, correlationId);
      if (result.success) {
        if (breaker) recordSuccess(breaker, 'connectorAgent');
        if (result.verdict === 'VALID') {
          return true;
        }
        // Don't return false yet - try Anymail fallback
      } else if (breaker) {
        recordFailure(breaker, 'connectorAgent');
      }
    } catch (err) {
      if (breaker) recordFailure(breaker, 'connectorAgent');
      // Continue to Anymail fallback
    }
  }

  // STEP 2: Try Anymail verify (if available and not disabled)
  if (config.anymailApiKey && (!breaker || !isDisabled(breaker, 'anymail'))) {
    const startMs = Date.now();
    try {
      const data = await fetchJson<any>(
        `${SUPABASE_FUNCTIONS_URL}/anymail-finder`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'verify_email',
            apiKey: config.anymailApiKey,
            email,
          }),
          timeoutMs: ANYMAIL_VERIFY_TIMEOUT_MS,
          retries: RETRIES,
          correlationId,
        }
      );

      const ms = Date.now() - startMs;

      if (data.success && data.verification_status === 'verified') {
        console.log(`[Enrichment] cid=${correlationId} step=VERIFY provider=anymail ms=${ms} ok=1`);
        if (breaker) recordSuccess(breaker, 'anymail');
        return true;
      } else if (data.success) {
        console.log(`[Enrichment] cid=${correlationId} step=VERIFY provider=anymail ms=${ms} ok=0 code=NOT_VERIFIED`);
        if (breaker) recordSuccess(breaker, 'anymail'); // API worked, just not verified
        return false;
      }
    } catch (err) {
      const ms = Date.now() - startMs;
      const code = isFetchError(err) ? err.code : 'ERROR';
      console.log(`[Enrichment] cid=${correlationId} step=VERIFY provider=anymail ms=${ms} ok=0 code=${code}`);
      if (breaker) recordFailure(breaker, 'anymail');
    }
  }

  // STEP 3: No provider available or both failed
  return false;
}

// =============================================================================
// ANYMAIL ENRICHMENT
// =============================================================================

/**
 * Find email using Anymail Finder (name + domain).
 * Anymail finds AND verifies in one step.
 */
async function anymailEnrich(
  fullName: string,
  domain: string,
  config: EnrichmentConfig,
  correlationId: string,
  breaker?: CircuitBreaker
): Promise<EnrichmentResult> {

  // Skip if disabled by circuit breaker
  if (!config.anymailApiKey || (breaker && isDisabled(breaker, 'anymail'))) {
    return { success: false, email: null, firstName: '', lastName: '', title: '', verified: false, source: 'anymail' };
  }

  const startMs = Date.now();

  try {
    const data = await fetchJson<any>(
      `${SUPABASE_FUNCTIONS_URL}/anymail-finder`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'find_person',
          apiKey: config.anymailApiKey,
          domain,
          full_name: fullName,
        }),
        timeoutMs: ANYMAIL_FIND_TIMEOUT_MS,
        retries: RETRIES,
        correlationId,
      }
    );

    const ms = Date.now() - startMs;

    if (data.success && data.email) {
      console.log(`[Enrichment] cid=${correlationId} step=FIND provider=anymail ms=${ms} ok=1`);
      if (breaker) recordSuccess(breaker, 'anymail');
      const nameParts = fullName.split(' ');
      return {
        success: true,
        email: data.email,
        firstName: data.name?.split(' ')[0] || nameParts[0] || '',
        lastName: data.name?.split(' ').slice(1).join(' ') || nameParts.slice(1).join(' ') || '',
        title: data.title || '',
        verified: true,
        source: 'anymail',
      };
    }

    console.log(`[Enrichment] cid=${correlationId} step=FIND provider=anymail ms=${ms} ok=0 code=NOT_FOUND`);
    if (breaker) recordSuccess(breaker, 'anymail'); // API worked, just not found
  } catch (err) {
    const ms = Date.now() - startMs;
    const code = isFetchError(err) ? err.code : 'ERROR';
    console.log(`[Enrichment] cid=${correlationId} step=FIND provider=anymail ms=${ms} ok=0 code=${code}`);
    if (breaker) recordFailure(breaker, 'anymail');
  }

  return { success: false, email: null, firstName: '', lastName: '', title: '', verified: false, source: 'anymail' };
}

// =============================================================================
// CONNECTOR AGENT ENRICHMENT
// =============================================================================

/**
 * Find email using Connector Agent (name + domain).
 * Used as final fallback when Apollo and Anymail fail.
 */
async function connectorAgentEnrich(
  firstName: string,
  lastName: string,
  domain: string,
  config: EnrichmentConfig,
  correlationId: string,
  breaker?: CircuitBreaker
): Promise<EnrichmentResult> {

  // Skip if disabled by circuit breaker
  if (!config.connectorAgentApiKey || (breaker && isDisabled(breaker, 'connectorAgent'))) {
    return { success: false, email: null, firstName: '', lastName: '', title: '', verified: false, source: 'existing' };
  }

  // Connector Agent requires first and last name separately
  if (!firstName && !lastName) {
    return { success: false, email: null, firstName: '', lastName: '', title: '', verified: false, source: 'existing' };
  }

  try {
    const result = await connectorAgentFind(config.connectorAgentApiKey, firstName, lastName, domain, correlationId);

    if (result.success && result.email) {
      if (breaker) recordSuccess(breaker, 'connectorAgent');
      return {
        success: true,
        email: result.email,
        firstName: firstName,
        lastName: lastName,
        title: '',
        verified: true,
        source: 'existing', // Connector Agent verifies when finding
      };
    } else if (breaker) {
      // Not found is not a failure (API worked)
      recordSuccess(breaker, 'connectorAgent');
    }
  } catch (err) {
    if (breaker) recordFailure(breaker, 'connectorAgent');
    // Error already logged in connectorAgentFind
  }

  return { success: false, email: null, firstName: '', lastName: '', title: '', verified: false, source: 'existing' };
}

// =============================================================================
// ORG ENRICH — Company Signals (B2B Contacts overlay)
// =============================================================================

/**
 * Fetch organization data from Apollo for company signals.
 * Used ONLY for B2B Contacts when fetchSignals is enabled.
 *
 * DOCTRINE:
 * - No retries (single attempt)
 * - Fail silently (return undefined on any error)
 * - Never blocks or affects enrichment flow
 */
async function orgEnrich(
  domain: string,
  apolloApiKey: string,
  correlationId: string
): Promise<Signals | undefined> {
  if (!domain || !apolloApiKey) return undefined;

  try {
    const data = await fetchJson<any>(
      `${SUPABASE_FUNCTIONS_URL}/apollo-enrichment`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'org_enrich',
          apiKey: apolloApiKey,
          domain,
        }),
        timeoutMs: APOLLO_TIMEOUT_MS,
        retries: 0, // No retries — fail fast
        correlationId,
      }
    );

    if (data.organization) {
      const signals = extractSignalsFromApollo(data.organization);
      if (signals) {
        console.log(`[Enrichment] cid=${correlationId} step=ORG_SIGNALS domain=${domain} ok=1`);
      }
      return signals;
    }
  } catch (err) {
    // Fail silently — signals are optional metadata
    console.log(`[Enrichment] cid=${correlationId} step=ORG_SIGNALS domain=${domain} ok=0 reason=error`);
  }

  return undefined;
}

// =============================================================================
// APOLLO ENRICHMENT
// =============================================================================

/**
 * Find decision maker using Apollo (by role/signal).
 *
 * TWO-STEP PROCESS:
 * 1. people_search → Find person (returns name, title, has_email)
 * 2. people_match → Reveal email (requires name + domain)
 *
 * Falls back to Anymail/Connector Agent if Apollo fails.
 */
async function apolloEnrich(
  domain: string,
  signal: string,
  config: EnrichmentConfig,
  correlationId: string,
  breaker?: CircuitBreaker
): Promise<EnrichmentResult> {

  // Skip Apollo if disabled by circuit breaker
  if (!config.apolloApiKey || (breaker && isDisabled(breaker, 'apollo'))) {
    // No Apollo, try Anymail directly
    return await anymailEnrich('', domain, config, correlationId, breaker);
  }

  const startMs = Date.now();

  try {
    // STEP 1: Find decision maker via people_search
    const targetTitles = inferTargetTitles(signal);

    const searchData = await fetchJson<any>(
      `${SUPABASE_FUNCTIONS_URL}/apollo-enrichment`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'people_search',
          apiKey: config.apolloApiKey,
          domain,
          titles: targetTitles,
        }),
        timeoutMs: APOLLO_TIMEOUT_MS,
        retries: RETRIES,
        correlationId,
      }
    );

    const people = searchData.people || [];

    // Find best candidate (has_email: true preferred)
    const candidate = people.find((p: any) => p.has_email === true || p.has_email === 'Yes') || people[0];

    if (!candidate) {
      const ms = Date.now() - startMs;
      console.log(`[Enrichment] cid=${correlationId} step=SEARCH provider=apollo ms=${ms} ok=0 code=NO_CANDIDATES`);
      if (breaker) recordSuccess(breaker, 'apollo'); // API worked, just no candidates
      // Fall through to Anymail/Connector Agent
    } else {
      if (breaker) recordSuccess(breaker, 'apollo');
      const firstName = candidate.first_name;
      const lastName = candidate.last_name || candidate.last_name_obfuscated?.replace(/\*+/g, '') || '';

      // Extract signals from organization (optional metadata overlay)
      const signals = extractSignalsFromApollo(candidate.organization);

      // If search already returned email, use it
      const directEmail = candidate.email || candidate.email_from_pdl;
      if (directEmail && firstName) {
        const ms = Date.now() - startMs;
        console.log(`[Enrichment] cid=${correlationId} step=SEARCH provider=apollo ms=${ms} ok=1`);
        return {
          success: true,
          email: directEmail,
          firstName,
          lastName,
          title: candidate.title || '',
          verified: true,
          source: 'apollo',
          signals, // Optional metadata — never affects flow
        };
      }

      // STEP 2: Reveal email via people_match (if has_email but no email returned)
      if (firstName && (candidate.has_email === true || candidate.has_email === 'Yes')) {
        const matchData = await fetchJson<any>(
          `${SUPABASE_FUNCTIONS_URL}/apollo-enrichment`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'people_match',
              apiKey: config.apolloApiKey,
              payload: {
                first_name: firstName,
                last_name: lastName,
                organization_domain: domain,
                reveal_personal_emails: true,
              },
            }),
            timeoutMs: APOLLO_TIMEOUT_MS,
            retries: RETRIES,
            correlationId,
          }
        );

        const matchedPerson = matchData.person;
        if (matchedPerson?.email) {
          const ms = Date.now() - startMs;
          console.log(`[Enrichment] cid=${correlationId} step=MATCH provider=apollo ms=${ms} ok=1`);
          return {
            success: true,
            email: matchedPerson.email,
            firstName: matchedPerson.first_name || firstName,
            lastName: matchedPerson.last_name || lastName,
            title: matchedPerson.title || candidate.title || '',
            verified: true,
            source: 'apollo',
            signals, // Optional metadata — never affects flow
          };
        }
      }

      // Have name but couldn't get email - try Anymail with the name we found
      if (firstName) {
        const fullName = `${firstName} ${lastName}`.trim();
        const anymailResult = await anymailEnrich(fullName, domain, config, correlationId, breaker);
        if (anymailResult.success) {
          return anymailResult;
        }

        // Try Connector Agent with the name
        const connectorResult = await connectorAgentEnrich(firstName, lastName, domain, config, correlationId, breaker);
        if (connectorResult.success) {
          return connectorResult;
        }
      }
    }
  } catch (err) {
    const ms = Date.now() - startMs;
    const code = isFetchError(err) ? err.code : 'ERROR';
    console.log(`[Enrichment] cid=${correlationId} step=SEARCH provider=apollo ms=${ms} ok=0 code=${code}`);
    if (breaker) recordFailure(breaker, 'apollo');
  }

  // Apollo failed completely, try Anymail as fallback (no name)
  const anymailResult = await anymailEnrich('', domain, config, correlationId, breaker);
  if (anymailResult.success) {
    return anymailResult;
  }

  // Anymail also failed, try Connector Agent as final fallback
  return await connectorAgentEnrich('', '', domain, config, correlationId, breaker);
}

/**
 * Infer target job titles based on the signal.
 *
 * "hiring engineers" → VP Engineering, CTO, Engineering Manager
 * "hiring sales" → VP Sales, Head of Sales, Sales Director
 */
function inferTargetTitles(signal: string): string[] {
  const lowerSignal = signal.toLowerCase();

  // Engineering roles
  if (lowerSignal.includes('engineer') || lowerSignal.includes('developer') || lowerSignal.includes('software')) {
    return ['VP Engineering', 'CTO', 'Engineering Manager', 'Head of Engineering', 'Director of Engineering'];
  }

  // Sales roles
  if (lowerSignal.includes('sales') || lowerSignal.includes('account executive') || lowerSignal.includes('sdr')) {
    return ['VP Sales', 'Head of Sales', 'Sales Director', 'CRO', 'Chief Revenue Officer'];
  }

  // Marketing roles
  if (lowerSignal.includes('marketing') || lowerSignal.includes('growth')) {
    return ['VP Marketing', 'CMO', 'Head of Marketing', 'Director of Marketing', 'Head of Growth'];
  }

  // HR/Recruiting roles
  if (lowerSignal.includes('recruiter') || lowerSignal.includes('hr') || lowerSignal.includes('talent')) {
    return ['VP HR', 'Head of Talent', 'Director of HR', 'Chief People Officer', 'Head of People'];
  }

  // Finance roles
  if (lowerSignal.includes('finance') || lowerSignal.includes('accounting') || lowerSignal.includes('cfo')) {
    return ['CFO', 'VP Finance', 'Head of Finance', 'Controller', 'Director of Finance'];
  }

  // Product roles
  if (lowerSignal.includes('product') || lowerSignal.includes('pm')) {
    return ['VP Product', 'CPO', 'Head of Product', 'Director of Product', 'Product Manager'];
  }

  // Default to C-level / founders
  return ['CEO', 'Founder', 'Co-Founder', 'COO', 'Managing Director'];
}

// =============================================================================
// CONCURRENCY POOL
// =============================================================================

/**
 * Simple concurrency pool - processes items with bounded parallelism.
 * Each item runs independently; failures don't affect others.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  maxConcurrency: number,
  processor: (item: T, index: number) => Promise<R>,
  onProgress?: (completed: number, total: number) => void
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let completed = 0;
  let nextIndex = 0;

  async function processNext(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      const item = items[currentIndex];

      try {
        results[currentIndex] = await processor(item, currentIndex);
      } catch (err) {
        // This shouldn't happen since processor handles errors, but safety first
        results[currentIndex] = undefined as any;
      }

      completed++;
      if (onProgress) {
        onProgress(completed, items.length);
      }
    }
  }

  // Start maxConcurrency workers
  const workers = Array(Math.min(maxConcurrency, items.length))
    .fill(null)
    .map(() => processNext());

  await Promise.all(workers);
  return results;
}

// =============================================================================
// BATCH ENRICHMENT (with bounded concurrency)
// =============================================================================

/**
 * Enrich multiple records with bounded concurrency.
 *
 * - Max 5 records processed simultaneously
 * - Each record has independent budget (RECORD_BUDGET_MS)
 * - One slow record cannot block others
 * - Circuit breaker shared across batch
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

  // Create batch-scoped circuit breaker
  const breaker = createCircuitBreaker();
  const configWithBreaker: EnrichmentConfig = { ...config, circuitBreaker: breaker };

  // Process with bounded concurrency
  const enrichedResults = await runWithConcurrency(
    records,
    MAX_CONCURRENCY,
    async (record, i) => {
      const sanitizedDomain = record.domain?.replace(/[^a-z0-9.-]/gi, '') || 'unknown';
      const correlationId = `${rid}-${i}-${sanitizedDomain}`;

      const result = await enrichRecord(record, schema, configWithBreaker, record.signal, correlationId);
      return { domain: record.domain, result };
    },
    onProgress
  );

  // Build results map
  for (const { domain, result } of enrichedResults) {
    if (domain && result) {
      results.set(domain, result);
    }
  }

  // Emit watermark summary and flush log state
  const flowState = flowLogStates.get(rid);
  const startTs = flowState?.firstTs || Date.now();
  const logStats = flushFlowLogs(rid);
  if (logStats && logStats.counters.budgetExceeded) {
    const elapsed = Date.now() - startTs;
    const suppressed = logStats.counters.budgetExceeded - logStats.uniqueDomains;
    console.log(`[Enrichment] cid=${rid} watermark budget_exceeded=${logStats.counters.budgetExceeded} unique_domains=${logStats.uniqueDomains} suppressed=${Math.max(0, suppressed)} elapsed_ms=${elapsed}`);
  }

  return results;
}
