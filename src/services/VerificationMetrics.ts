/**
 * VERIFICATION METRICS — Observability Layer
 *
 * Tracks verification attempts, failures, and timing.
 * NO BEHAVIOR CHANGE. Just metrics for future optimization.
 *
 * Per user.txt:
 * - Count verification attempts
 * - Count verification failures
 * - Time per verification batch (coarse, best-effort)
 * - No throttling yet. No retries yet. No backpressure yet.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface VerificationAttempt {
  provider: 'anymail' | 'connectorAgent' | 'apollo';
  action: 'VERIFY' | 'FIND_PERSON' | 'FIND_COMPANY_CONTACT' | 'SEARCH_PERSON' | 'SEARCH_COMPANY';
  outcome: 'success' | 'failure' | 'not_found' | 'error';
  durationMs: number;
  timestamp: number;
}

export interface BatchMetrics {
  batchId: string;
  startTime: number;
  endTime: number | null;
  totalRecords: number;
  completed: number;
  attempts: number;
  successes: number;
  failures: number;
  errors: number;
  avgDurationMs: number;
}

export interface VerificationMetricsSnapshot {
  // Lifetime totals
  totalAttempts: number;
  totalSuccesses: number;
  totalFailures: number;
  totalErrors: number;

  // Current batch (if any)
  currentBatch: BatchMetrics | null;

  // Recent batches (last 5)
  recentBatches: BatchMetrics[];

  // Provider breakdown
  byProvider: {
    anymail: { attempts: number; successes: number; failures: number; avgMs: number };
    connectorAgent: { attempts: number; successes: number; failures: number; avgMs: number };
    apollo: { attempts: number; successes: number; failures: number; avgMs: number };
  };
}

// =============================================================================
// SINGLETON STATE — In-memory only (no persistence needed for observability)
// =============================================================================

let totalAttempts = 0;
let totalSuccesses = 0;
let totalFailures = 0;
let totalErrors = 0;

let currentBatch: BatchMetrics | null = null;
const recentBatches: BatchMetrics[] = [];
const MAX_RECENT_BATCHES = 5;

const providerStats: Record<string, { attempts: number; successes: number; failures: number; totalMs: number }> = {
  anymail: { attempts: 0, successes: 0, failures: 0, totalMs: 0 },
  connectorAgent: { attempts: 0, successes: 0, failures: 0, totalMs: 0 },
  apollo: { attempts: 0, successes: 0, failures: 0, totalMs: 0 },
};

// =============================================================================
// BATCH LIFECYCLE
// =============================================================================

/**
 * Start a new verification batch.
 * Call this at the beginning of enrichBatch().
 */
export function startBatch(totalRecords: number): string {
  const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  currentBatch = {
    batchId,
    startTime: Date.now(),
    endTime: null,
    totalRecords,
    completed: 0,
    attempts: 0,
    successes: 0,
    failures: 0,
    errors: 0,
    avgDurationMs: 0,
  };

  console.log(`[VerificationMetrics] BATCH_START id=${batchId} records=${totalRecords}`);
  return batchId;
}

/**
 * End the current batch.
 * Call this at the end of enrichBatch().
 */
export function endBatch(): void {
  if (!currentBatch) return;

  currentBatch.endTime = Date.now();
  const durationSec = Math.round((currentBatch.endTime - currentBatch.startTime) / 1000);

  console.log(`[VerificationMetrics] BATCH_END id=${currentBatch.batchId}`, {
    durationSec,
    completed: currentBatch.completed,
    attempts: currentBatch.attempts,
    successes: currentBatch.successes,
    failures: currentBatch.failures,
    errors: currentBatch.errors,
  });

  // Archive to recent batches
  recentBatches.unshift({ ...currentBatch });
  if (recentBatches.length > MAX_RECENT_BATCHES) {
    recentBatches.pop();
  }

  currentBatch = null;
}

// =============================================================================
// ATTEMPT TRACKING
// =============================================================================

/**
 * Record a verification attempt.
 * Call this after each provider call in the router.
 */
export function recordAttempt(attempt: VerificationAttempt): void {
  // Lifetime totals
  totalAttempts++;
  if (attempt.outcome === 'success') totalSuccesses++;
  if (attempt.outcome === 'failure' || attempt.outcome === 'not_found') totalFailures++;
  if (attempt.outcome === 'error') totalErrors++;

  // Provider stats
  const stats = providerStats[attempt.provider];
  if (stats) {
    stats.attempts++;
    stats.totalMs += attempt.durationMs;
    if (attempt.outcome === 'success') stats.successes++;
    if (attempt.outcome === 'failure' || attempt.outcome === 'not_found') stats.failures++;
  }

  // Current batch
  if (currentBatch) {
    currentBatch.attempts++;
    if (attempt.outcome === 'success') currentBatch.successes++;
    if (attempt.outcome === 'failure' || attempt.outcome === 'not_found') currentBatch.failures++;
    if (attempt.outcome === 'error') currentBatch.errors++;

    // Update avg duration
    if (currentBatch.attempts > 0) {
      const totalMs = currentBatch.avgDurationMs * (currentBatch.attempts - 1) + attempt.durationMs;
      currentBatch.avgDurationMs = Math.round(totalMs / currentBatch.attempts);
    }
  }
}

/**
 * Record a record completion (regardless of outcome).
 * Call this after each record is processed in the batch.
 */
export function recordCompletion(): void {
  if (currentBatch) {
    currentBatch.completed++;
  }
}

// =============================================================================
// SNAPSHOT — For UI display
// =============================================================================

/**
 * Get current metrics snapshot.
 * Use this in Flow.tsx to display verification metrics.
 */
export function getMetricsSnapshot(): VerificationMetricsSnapshot {
  return {
    totalAttempts,
    totalSuccesses,
    totalFailures,
    totalErrors,
    currentBatch: currentBatch ? { ...currentBatch } : null,
    recentBatches: recentBatches.map(b => ({ ...b })),
    byProvider: {
      anymail: {
        attempts: providerStats.anymail.attempts,
        successes: providerStats.anymail.successes,
        failures: providerStats.anymail.failures,
        avgMs: providerStats.anymail.attempts > 0
          ? Math.round(providerStats.anymail.totalMs / providerStats.anymail.attempts)
          : 0,
      },
      connectorAgent: {
        attempts: providerStats.connectorAgent.attempts,
        successes: providerStats.connectorAgent.successes,
        failures: providerStats.connectorAgent.failures,
        avgMs: providerStats.connectorAgent.attempts > 0
          ? Math.round(providerStats.connectorAgent.totalMs / providerStats.connectorAgent.attempts)
          : 0,
      },
      apollo: {
        attempts: providerStats.apollo.attempts,
        successes: providerStats.apollo.successes,
        failures: providerStats.apollo.failures,
        avgMs: providerStats.apollo.attempts > 0
          ? Math.round(providerStats.apollo.totalMs / providerStats.apollo.attempts)
          : 0,
      },
    },
  };
}

/**
 * Reset all metrics (for testing or new session).
 */
export function resetMetrics(): void {
  totalAttempts = 0;
  totalSuccesses = 0;
  totalFailures = 0;
  totalErrors = 0;
  currentBatch = null;
  recentBatches.length = 0;
  providerStats.anymail = { attempts: 0, successes: 0, failures: 0, totalMs: 0 };
  providerStats.connectorAgent = { attempts: 0, successes: 0, failures: 0, totalMs: 0 };
  providerStats.apollo = { attempts: 0, successes: 0, failures: 0, totalMs: 0 };
}
