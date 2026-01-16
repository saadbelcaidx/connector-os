/**
 * PHILEMON — Enrichment Plan Engine
 *
 * Determines which providers can run BEFORE making any API calls.
 * No credits wasted on invalid requests. No HTTP_401/400 spam.
 *
 * INVARIANTS:
 * - Provider only called if key exists AND inputs valid
 * - 401 disables provider for entire run (circuit breaker)
 * - Missing inputs emit MISSING_INPUT, not HTTP_400
 * - UI shows enabled/disabled providers before enrichment
 */

// =============================================================================
// PROVIDER INPUT CONTRACTS — What each provider requires
// =============================================================================

export type ProviderName = 'apollo' | 'anymail' | 'connectorAgent';

export interface ProviderContract {
  name: ProviderName;
  displayName: string;
  requiredFields: string[];
  alternativeFields?: string[][]; // OR groups: [[domain], [company, name]] means domain OR (company AND name)
}

export const PROVIDER_CONTRACTS: Record<ProviderName, ProviderContract> = {
  apollo: {
    name: 'apollo',
    displayName: 'Apollo',
    requiredFields: [], // Apollo can search by domain OR company
    alternativeFields: [['domain'], ['company']], // Need at least one
  },
  anymail: {
    name: 'anymail',
    displayName: 'Anymail Finder',
    requiredFields: ['domain'], // Anymail requires domain
  },
  connectorAgent: {
    name: 'connectorAgent',
    displayName: 'Connector Agent',
    requiredFields: ['domain'], // Connector Agent requires domain
  },
};

// =============================================================================
// PROVIDER STATUS — Enabled/disabled with reason
// =============================================================================

export type DisableReason =
  | 'MISSING_KEY'
  | 'CIRCUIT_BREAKER_401'
  | 'CIRCUIT_BREAKER_400'
  | 'BUDGET_EXCEEDED';

export interface ProviderStatus {
  provider: ProviderName;
  enabled: boolean;
  reason?: DisableReason;
}

// =============================================================================
// RECORD ENRICHMENT PLAN — Per-record provider eligibility
// =============================================================================

export type SkipReason =
  | 'MISSING_INPUT'
  | 'PROVIDER_DISABLED'
  | 'ALREADY_HAS_EMAIL';

export interface RecordEnrichmentPlan {
  recordId: string;
  domain: string;
  hasEmail: boolean;
  runnableProviders: ProviderName[];
  skippedProviders: Array<{
    provider: ProviderName;
    reason: SkipReason;
    missingFields?: string[];
  }>;
}

// =============================================================================
// ENRICHMENT PLAN — Full session plan
// =============================================================================

export interface EnrichmentPlan {
  providers: ProviderStatus[];
  records: RecordEnrichmentPlan[];
  summary: {
    totalRecords: number;
    recordsWithEmail: number;
    recordsNeedingEnrichment: number;
    recordsMissingDomain: number;
    enabledProviders: ProviderName[];
    disabledProviders: Array<{ provider: ProviderName; reason: DisableReason }>;
  };
}

// =============================================================================
// ENRICHMENT OUTCOME — Aggregated results
// =============================================================================

export interface EnrichmentOutcome {
  enriched: number;
  no_candidates: number;
  not_found: number;
  missing_input: number;
  blocked_by_config: number;
  timeout: number;
  budget_exceeded: number;
  auth_error: number;
}

export function createEmptyOutcome(): EnrichmentOutcome {
  return {
    enriched: 0,
    no_candidates: 0,
    not_found: 0,
    missing_input: 0,
    blocked_by_config: 0,
    timeout: 0,
    budget_exceeded: 0,
    auth_error: 0,
  };
}

// =============================================================================
// CIRCUIT BREAKER STATE — Per-session provider health
// =============================================================================

export interface CircuitBreakerState {
  apollo: { disabled: boolean; reason?: DisableReason };
  anymail: { disabled: boolean; reason?: DisableReason };
  connectorAgent: { disabled: boolean; reason?: DisableReason };
}

export function createCircuitBreaker(): CircuitBreakerState {
  return {
    apollo: { disabled: false },
    anymail: { disabled: false },
    connectorAgent: { disabled: false },
  };
}

export function tripCircuitBreaker(
  state: CircuitBreakerState,
  provider: ProviderName,
  reason: DisableReason
): void {
  state[provider] = { disabled: true, reason };
  console.log(`[CIRCUIT_BREAKER] ${provider} disabled: ${reason}`);
}

// =============================================================================
// BUILD ENRICHMENT PLAN — Main entry point
// =============================================================================

export interface EnrichmentSettings {
  apolloApiKey?: string;
  anymailApiKey?: string;
  connectorAgentApiKey?: string;
}

export interface EnrichableRecord {
  domain: string;
  company?: string;
  name?: string;
  title?: string;
  email?: string;
  existingContact?: {
    email?: string;
    name?: string;
  };
}

export function buildEnrichmentPlan(
  records: EnrichableRecord[],
  settings: EnrichmentSettings,
  circuitBreaker?: CircuitBreakerState
): EnrichmentPlan {
  const cb = circuitBreaker || createCircuitBreaker();

  // 1. Determine provider status
  const providers: ProviderStatus[] = [
    {
      provider: 'apollo',
      enabled: !!settings.apolloApiKey && !cb.apollo.disabled,
      reason: !settings.apolloApiKey ? 'MISSING_KEY' : cb.apollo.reason,
    },
    {
      provider: 'anymail',
      enabled: !!settings.anymailApiKey && !cb.anymail.disabled,
      reason: !settings.anymailApiKey ? 'MISSING_KEY' : cb.anymail.reason,
    },
    {
      provider: 'connectorAgent',
      enabled: !!settings.connectorAgentApiKey && !cb.connectorAgent.disabled,
      reason: !settings.connectorAgentApiKey ? 'MISSING_KEY' : cb.connectorAgent.reason,
    },
  ];

  const enabledProviders = providers.filter(p => p.enabled).map(p => p.provider);
  const disabledProviders = providers
    .filter(p => !p.enabled)
    .map(p => ({ provider: p.provider, reason: p.reason! }));

  // Log provider status
  console.log('[ENRICHMENT_PLAN] Provider status:', {
    apollo: providers.find(p => p.provider === 'apollo')?.enabled ? 'enabled' : 'disabled',
    anymail: providers.find(p => p.provider === 'anymail')?.enabled ? 'enabled' : 'disabled',
    connectorAgent: providers.find(p => p.provider === 'connectorAgent')?.enabled ? 'enabled' : 'disabled',
  });

  // 2. Build per-record plans
  let recordsWithEmail = 0;
  let recordsMissingDomain = 0;

  const recordPlans: RecordEnrichmentPlan[] = records.map((record, index) => {
    const hasEmail = !!(record.email || record.existingContact?.email);
    const hasDomain = !!record.domain;
    const hasCompany = !!record.company;

    if (hasEmail) recordsWithEmail++;
    if (!hasDomain) recordsMissingDomain++;

    const runnableProviders: ProviderName[] = [];
    const skippedProviders: RecordEnrichmentPlan['skippedProviders'] = [];

    // Skip if already has email
    if (hasEmail) {
      enabledProviders.forEach(provider => {
        skippedProviders.push({
          provider,
          reason: 'ALREADY_HAS_EMAIL',
        });
      });
      return {
        recordId: record.domain || `record-${index}`,
        domain: record.domain || '',
        hasEmail: true,
        runnableProviders: [],
        skippedProviders,
      };
    }

    // Check each enabled provider
    for (const provider of enabledProviders) {
      const contract = PROVIDER_CONTRACTS[provider];

      // Check required fields
      if (contract.alternativeFields) {
        // OR logic: at least one group must be satisfied
        const satisfied = contract.alternativeFields.some(group =>
          group.every(field => {
            if (field === 'domain') return hasDomain;
            if (field === 'company') return hasCompany;
            if (field === 'name') return !!record.name;
            return false;
          })
        );

        if (!satisfied) {
          skippedProviders.push({
            provider,
            reason: 'MISSING_INPUT',
            missingFields: contract.alternativeFields.flat(),
          });
          continue;
        }
      } else if (contract.requiredFields.length > 0) {
        // AND logic: all required fields must exist
        const missingFields: string[] = [];
        for (const field of contract.requiredFields) {
          if (field === 'domain' && !hasDomain) missingFields.push('domain');
          if (field === 'company' && !hasCompany) missingFields.push('company');
          if (field === 'name' && !record.name) missingFields.push('name');
        }

        if (missingFields.length > 0) {
          skippedProviders.push({
            provider,
            reason: 'MISSING_INPUT',
            missingFields,
          });
          continue;
        }
      }

      runnableProviders.push(provider);
    }

    // Add disabled providers to skipped
    for (const { provider, reason } of disabledProviders) {
      skippedProviders.push({
        provider,
        reason: 'PROVIDER_DISABLED',
      });
    }

    return {
      recordId: record.domain || `record-${index}`,
      domain: record.domain || '',
      hasEmail: false,
      runnableProviders,
      skippedProviders,
    };
  });

  const recordsNeedingEnrichment = records.length - recordsWithEmail;

  return {
    providers,
    records: recordPlans,
    summary: {
      totalRecords: records.length,
      recordsWithEmail,
      recordsNeedingEnrichment,
      recordsMissingDomain,
      enabledProviders,
      disabledProviders,
    },
  };
}

// =============================================================================
// VALIDATE RECORD FOR PROVIDER — Call before each enrichment attempt
// =============================================================================

export function canCallProvider(
  provider: ProviderName,
  record: EnrichableRecord,
  circuitBreaker: CircuitBreakerState
): { canCall: boolean; reason?: SkipReason; missingFields?: string[] } {
  // Check circuit breaker
  if (circuitBreaker[provider].disabled) {
    return { canCall: false, reason: 'PROVIDER_DISABLED' };
  }

  // Check already has email
  if (record.email || record.existingContact?.email) {
    return { canCall: false, reason: 'ALREADY_HAS_EMAIL' };
  }

  const contract = PROVIDER_CONTRACTS[provider];
  const hasDomain = !!record.domain;
  const hasCompany = !!record.company;

  // Check input contracts
  if (contract.alternativeFields) {
    const satisfied = contract.alternativeFields.some(group =>
      group.every(field => {
        if (field === 'domain') return hasDomain;
        if (field === 'company') return hasCompany;
        return false;
      })
    );
    if (!satisfied) {
      return {
        canCall: false,
        reason: 'MISSING_INPUT',
        missingFields: ['domain', 'company'],
      };
    }
  } else if (contract.requiredFields.includes('domain') && !hasDomain) {
    return {
      canCall: false,
      reason: 'MISSING_INPUT',
      missingFields: ['domain'],
    };
  }

  return { canCall: true };
}

// =============================================================================
// HANDLE PROVIDER ERROR — Update circuit breaker + return outcome
// =============================================================================

export function handleProviderError(
  provider: ProviderName,
  error: any,
  circuitBreaker: CircuitBreakerState
): { outcome: keyof EnrichmentOutcome; shouldDisable: boolean } {
  const status = error?.status || error?.response?.status;
  const message = error?.message || '';

  // Log for diagnostics
  console.log(`[ENRICHMENT_ERROR] ${provider}:`, {
    status,
    message: message.slice(0, 100),
  });

  if (status === 401 || message.includes('401') || message.includes('Unauthorized')) {
    tripCircuitBreaker(circuitBreaker, provider, 'CIRCUIT_BREAKER_401');
    return { outcome: 'auth_error', shouldDisable: true };
  }

  if (status === 400 || message.includes('400') || message.includes('Bad Request')) {
    // Log missing fields for diagnostics
    console.log(`[${provider.toUpperCase()}_400] Bad request — check input fields`);
    return { outcome: 'missing_input', shouldDisable: false };
  }

  if (status === 429 || message.includes('429') || message.includes('rate limit')) {
    return { outcome: 'budget_exceeded', shouldDisable: false };
  }

  if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
    return { outcome: 'timeout', shouldDisable: false };
  }

  if (message.includes('no candidates') || message.includes('NO_CANDIDATES')) {
    return { outcome: 'no_candidates', shouldDisable: false };
  }

  if (message.includes('not found') || message.includes('NOT_FOUND')) {
    return { outcome: 'not_found', shouldDisable: false };
  }

  // Default to no_candidates for unknown errors
  return { outcome: 'no_candidates', shouldDisable: false };
}

// =============================================================================
// HUMAN-READABLE OUTCOME LABELS — 2nd grade copy
// =============================================================================

export const OUTCOME_LABELS: Record<keyof EnrichmentOutcome, string> = {
  enriched: 'emails found',
  no_candidates: 'no public email',
  not_found: 'no email exists',
  missing_input: 'missing website or name',
  blocked_by_config: 'email tool not connected',
  timeout: 'took too long',
  budget_exceeded: 'credits used up',
  auth_error: 'email tool not connected',
};

export function formatOutcomeSummary(outcome: EnrichmentOutcome, total: number): string {
  const parts: string[] = [];

  if (outcome.enriched > 0) {
    parts.push(`found emails for ${outcome.enriched}`);
  }

  if (outcome.no_candidates > 0) {
    parts.push(`${outcome.no_candidates} had no public email`);
  }

  if (outcome.missing_input > 0) {
    parts.push(`${outcome.missing_input} missing website`);
  }

  if (outcome.auth_error > 0 || outcome.blocked_by_config > 0) {
    parts.push(`${outcome.auth_error + outcome.blocked_by_config} need email tool connected`);
  }

  if (outcome.budget_exceeded > 0) {
    parts.push(`${outcome.budget_exceeded} hit credit limit`);
  }

  if (parts.length === 0) {
    return `checked ${total} companies`;
  }

  return `We ${parts.join('. ')}.`;
}
