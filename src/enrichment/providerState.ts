/**
 * PROVIDER STATE MACHINE — Truth Before Routing
 *
 * PHILEMON: Providers exist in truthful states before routing.
 * The router only sees eligible providers with valid inputs.
 *
 * STATE HIERARCHY (must pass all to be selected):
 * 1. configured — API key exists
 * 2. authorized — No HTTP 401 this session
 * 3. eligible(record) — Record has required inputs for this provider
 * 4. available — Not rate-limited (HTTP 429)
 *
 * STATE TRANSITIONS:
 * - 401 → authorized = false (PERMANENT for session)
 * - 429 → available = false (TEMPORARY, resets after cooldown)
 * - 400 → record marked MISSING_INPUT (provider state unchanged)
 * - NOT_FOUND/NO_CANDIDATES → normal outcome (provider state unchanged)
 */

import { deriveDomain } from './deriveDomain';
type DerivedDomain = ReturnType<typeof deriveDomain>;

// =============================================================================
// TYPES
// =============================================================================

export type ProviderName = 'anymail' | 'connectorAgent' | 'apollo';

/**
 * Provider contract — what inputs each provider requires.
 * STRICT: No ambiguity, no "maybe works".
 */
export interface ProviderContract {
  name: ProviderName;
  displayName: string;
  /** Required inputs. ALL must be present. */
  requires: ('domain')[];
  /** Alternative requirement (OR condition) */
  alternativeRequires?: ('company' | 'person_name')[];
  /** Priority order (lower = higher priority, tried first) */
  priority: number;
}

/**
 * Provider contracts — the truth about what each provider needs.
 *
 * ROUTING PRIORITY (when domain exists):
 * 1. Anymail (cheapest, domain-required)
 * 2. ConnectorAgent (internal, domain-required)
 * 3. Apollo (fallback, broader search)
 */
export const PROVIDER_CONTRACTS: Record<ProviderName, ProviderContract> = {
  anymail: {
    name: 'anymail',
    displayName: 'Anymail Finder',
    requires: ['domain'],
    priority: 1,
  },
  connectorAgent: {
    name: 'connectorAgent',
    displayName: 'Connector Agent',
    requires: ['domain'],
    priority: 2,
  },
  apollo: {
    name: 'apollo',
    displayName: 'Apollo',
    requires: ['domain'],
    // Apollo can ALSO work with company + person_name (no domain)
    alternativeRequires: ['company', 'person_name'],
    priority: 3,
  },
};

/**
 * Session-level provider state (persists across records in a batch).
 */
export interface ProviderSessionState {
  configured: boolean;
  authorized: boolean;
  available: boolean;
  /** Timestamp when rate limit expires (if rate-limited) */
  rateLimitExpiresAt?: number;
  /** Count of consecutive failures (for circuit breaker) */
  consecutiveFailures: number;
  /** Last error message (for UI display) */
  lastError?: string;
}

/**
 * Record-level eligibility result.
 */
export interface RecordEligibility {
  eligible: boolean;
  reason?: 'MISSING_DOMAIN' | 'MISSING_COMPANY' | 'MISSING_PERSON_NAME' | 'HAS_EMAIL';
  /** Which inputs are missing */
  missingInputs?: string[];
}

/**
 * Full provider state machine for a session.
 */
export interface ProviderStateMachine {
  providers: Record<ProviderName, ProviderSessionState>;
  /** Session start time */
  sessionStartedAt: number;
}

// =============================================================================
// STATE MACHINE INITIALIZATION
// =============================================================================

/**
 * Create a new provider state machine for a session.
 *
 * @param config - API keys from settings
 */
export function createProviderStateMachine(config: {
  anymailApiKey?: string;
  connectorAgentApiKey?: string;
  apolloApiKey?: string;
}): ProviderStateMachine {
  return {
    providers: {
      anymail: {
        configured: !!config.anymailApiKey && config.anymailApiKey.trim().length > 0,
        authorized: true,  // Assume authorized until 401
        available: true,
        consecutiveFailures: 0,
      },
      connectorAgent: {
        configured: !!config.connectorAgentApiKey && config.connectorAgentApiKey.trim().length > 0,
        authorized: true,
        available: true,
        consecutiveFailures: 0,
      },
      apollo: {
        configured: !!config.apolloApiKey && config.apolloApiKey.trim().length > 0,
        authorized: true,
        available: true,
        consecutiveFailures: 0,
      },
    },
    sessionStartedAt: Date.now(),
  };
}

// =============================================================================
// STATE QUERIES
// =============================================================================

/**
 * Check if provider is configured (API key exists).
 */
export function isConfigured(state: ProviderStateMachine, provider: ProviderName): boolean {
  return state.providers[provider].configured;
}

/**
 * Check if provider is authorized (no 401 this session).
 */
export function isAuthorized(state: ProviderStateMachine, provider: ProviderName): boolean {
  return state.providers[provider].authorized;
}

/**
 * Check if provider is available (not rate-limited).
 */
export function isAvailable(state: ProviderStateMachine, provider: ProviderName): boolean {
  const providerState = state.providers[provider];

  // If rate-limited, check if cooldown has expired
  if (!providerState.available && providerState.rateLimitExpiresAt) {
    if (Date.now() >= providerState.rateLimitExpiresAt) {
      // Cooldown expired, reset availability
      providerState.available = true;
      providerState.rateLimitExpiresAt = undefined;
    }
  }

  return providerState.available;
}

/**
 * Check if provider can be used at session level.
 * Must be: configured AND authorized AND available.
 */
export function isSessionReady(state: ProviderStateMachine, provider: ProviderName): boolean {
  return isConfigured(state, provider) &&
         isAuthorized(state, provider) &&
         isAvailable(state, provider);
}

/**
 * Check record-level eligibility for a provider.
 *
 * @param provider - Provider to check
 * @param derivedDomain - Domain derivation result for this record
 * @param record - The record being enriched
 * @returns Eligibility result with reason if not eligible
 */
export function checkRecordEligibility(
  provider: ProviderName,
  derivedDomain: DerivedDomain,
  record: { email?: string | null; company?: string; firstName?: string; fullName?: string; name?: string }
): RecordEligibility {
  // Already has email → skip all providers
  if (record.email) {
    return { eligible: false, reason: 'HAS_EMAIL' };
  }

  const contract = PROVIDER_CONTRACTS[provider];
  const hasDomain = derivedDomain.domain !== null;
  const hasCompany = !!(record.company);
  const hasPersonName = !!(record.firstName || record.fullName || record.name);

  // Check primary requirements (domain)
  if (contract.requires.includes('domain')) {
    if (hasDomain) {
      return { eligible: true };
    }

    // Check alternative requirements (Apollo: company + person_name)
    if (contract.alternativeRequires) {
      const needsCompany = contract.alternativeRequires.includes('company');
      const needsPersonName = contract.alternativeRequires.includes('person_name');

      if (needsCompany && needsPersonName && hasCompany && hasPersonName) {
        return { eligible: true };
      }

      // Report what's missing for alternative path
      const missing: string[] = [];
      if (needsCompany && !hasCompany) missing.push('company');
      if (needsPersonName && !hasPersonName) missing.push('person_name');

      if (missing.length > 0) {
        return {
          eligible: false,
          reason: 'MISSING_DOMAIN',
          missingInputs: ['domain', ...missing],
        };
      }
    }

    return {
      eligible: false,
      reason: 'MISSING_DOMAIN',
      missingInputs: ['domain'],
    };
  }

  // Default: eligible if no specific requirements
  return { eligible: true };
}

/**
 * Check if a provider can be used for a specific record.
 * Combines session-level and record-level checks.
 */
export function canUseProvider(
  state: ProviderStateMachine,
  provider: ProviderName,
  derivedDomain: DerivedDomain,
  record: { email?: string | null; company?: string; firstName?: string; fullName?: string; name?: string }
): { canUse: boolean; reason?: string } {
  // Session-level checks
  if (!isConfigured(state, provider)) {
    return { canUse: false, reason: `${PROVIDER_CONTRACTS[provider].displayName} not configured (no API key)` };
  }
  if (!isAuthorized(state, provider)) {
    return { canUse: false, reason: `${PROVIDER_CONTRACTS[provider].displayName} unauthorized (401)` };
  }
  if (!isAvailable(state, provider)) {
    return { canUse: false, reason: `${PROVIDER_CONTRACTS[provider].displayName} rate-limited (429)` };
  }

  // Record-level check
  const eligibility = checkRecordEligibility(provider, derivedDomain, record);
  if (!eligibility.eligible) {
    const reasonText = eligibility.reason === 'HAS_EMAIL'
      ? 'Record already has email'
      : `Missing: ${eligibility.missingInputs?.join(', ')}`;
    return { canUse: false, reason: reasonText };
  }

  return { canUse: true };
}

// =============================================================================
// STATE TRANSITIONS
// =============================================================================

/**
 * Handle HTTP 401 — Kill provider for session.
 * PHILEMON: First 401 disables provider permanently for this session.
 */
export function handleUnauthorized(state: ProviderStateMachine, provider: ProviderName): void {
  state.providers[provider].authorized = false;
  state.providers[provider].lastError = 'Unauthorized (401) — API key invalid or expired';
  console.log(`[ProviderState] ${provider} KILLED — HTTP 401 (session-permanent)`);
}

/**
 * Handle HTTP 429 — Rate limit, temporary pause.
 * Provider becomes available again after cooldown.
 */
export function handleRateLimited(
  state: ProviderStateMachine,
  provider: ProviderName,
  cooldownMs: number = 60_000
): void {
  state.providers[provider].available = false;
  state.providers[provider].rateLimitExpiresAt = Date.now() + cooldownMs;
  state.providers[provider].lastError = `Rate limited (429) — retry after ${cooldownMs / 1000}s`;
  console.log(`[ProviderState] ${provider} PAUSED — HTTP 429 (cooldown: ${cooldownMs}ms)`);
}

/**
 * Handle success — Reset consecutive failures.
 */
export function handleSuccess(state: ProviderStateMachine, provider: ProviderName): void {
  state.providers[provider].consecutiveFailures = 0;
  state.providers[provider].lastError = undefined;
}

/**
 * Handle generic failure — Track for potential circuit breaker.
 * Does NOT disable provider (NOT_FOUND/NO_CANDIDATES are normal).
 */
export function handleFailure(state: ProviderStateMachine, provider: ProviderName, error?: string): void {
  state.providers[provider].consecutiveFailures++;
  if (error) {
    state.providers[provider].lastError = error;
  }
}

/**
 * Parse HTTP error and apply appropriate state transition.
 *
 * @returns Outcome type for record-level tracking
 */
export function handleHttpError(
  state: ProviderStateMachine,
  provider: ProviderName,
  error: any
): 'AUTH_ERROR' | 'RATE_LIMITED' | 'MISSING_INPUT' | 'NO_CANDIDATES' | 'ERROR' {
  const status = error?.status || error?.response?.status;
  const message = error?.message || String(error);

  // HTTP 401 — Kill provider
  if (status === 401 || message.includes('401') || message.includes('Unauthorized')) {
    handleUnauthorized(state, provider);
    return 'AUTH_ERROR';
  }

  // HTTP 429 — Rate limit
  if (status === 429 || message.includes('429') || message.includes('rate limit')) {
    handleRateLimited(state, provider);
    return 'RATE_LIMITED';
  }

  // HTTP 400 — Missing input (per-record, provider stays healthy)
  if (status === 400 || message.includes('400') || message.includes('Bad Request')) {
    return 'MISSING_INPUT';
  }

  // NOT_FOUND / NO_CANDIDATES — Normal outcome
  if (message.includes('not found') || message.includes('no candidates') || message.includes('NO_CANDIDATES')) {
    return 'NO_CANDIDATES';
  }

  // Generic failure
  handleFailure(state, provider, message);
  return 'ERROR';
}

// =============================================================================
// UI HELPERS
// =============================================================================

/**
 * Get provider status for UI display.
 */
export function getProviderStatus(
  state: ProviderStateMachine,
  provider: ProviderName
): {
  status: 'ready' | 'not_configured' | 'unauthorized' | 'rate_limited';
  displayName: string;
  message?: string;
} {
  const providerState = state.providers[provider];
  const contract = PROVIDER_CONTRACTS[provider];

  if (!providerState.configured) {
    return {
      status: 'not_configured',
      displayName: contract.displayName,
      message: 'No API key configured',
    };
  }

  if (!providerState.authorized) {
    return {
      status: 'unauthorized',
      displayName: contract.displayName,
      message: 'API key invalid or expired (401)',
    };
  }

  if (!isAvailable(state, provider)) {
    const remainingMs = (providerState.rateLimitExpiresAt || 0) - Date.now();
    return {
      status: 'rate_limited',
      displayName: contract.displayName,
      message: `Rate limited — retry in ${Math.ceil(remainingMs / 1000)}s`,
    };
  }

  return {
    status: 'ready',
    displayName: contract.displayName,
  };
}

/**
 * Get all provider statuses for UI.
 */
export function getAllProviderStatuses(state: ProviderStateMachine): ReturnType<typeof getProviderStatus>[] {
  return (['anymail', 'connectorAgent', 'apollo'] as ProviderName[]).map(p => getProviderStatus(state, p));
}

/**
 * Get list of providers eligible for a record, sorted by priority.
 */
export function getEligibleProviders(
  state: ProviderStateMachine,
  derivedDomain: DerivedDomain,
  record: { email?: string | null; company?: string; firstName?: string; fullName?: string; name?: string }
): ProviderName[] {
  const eligible: { provider: ProviderName; priority: number }[] = [];

  for (const provider of ['anymail', 'connectorAgent', 'apollo'] as ProviderName[]) {
    const { canUse } = canUseProvider(state, provider, derivedDomain, record);
    if (canUse) {
      eligible.push({ provider, priority: PROVIDER_CONTRACTS[provider].priority });
    }
  }

  // Sort by priority (lower = higher priority)
  return eligible.sort((a, b) => a.priority - b.priority).map(e => e.provider);
}
