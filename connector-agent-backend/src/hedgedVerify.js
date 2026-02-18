/**
 * Hedged Request Verification (Stripe Pattern)
 *
 * For bulk operations:
 * - Start relay verification immediately
 * - If relay doesn't resolve within HEDGE_DELAY_MS, start PRX2 in parallel
 * - Return first definitive verdict
 * - Prefer relay for speed, PRX2 for reliability
 *
 * Non-negotiable invariants:
 * - Zero API contract changes
 * - No double-charging (only bill once per email)
 * - Graceful degradation if stats/routing breaks
 */

const { verifyInboxSMTP, detectCatchAllSMTP } = require('./smtpVerifier');
const { resolveMailboxProvider } = require('./providerIntel');

// ============================================================
// ENV CONFIG
// ============================================================

const HEDGE_DELAY_MS = parseInt(process.env.HEDGE_DELAY_MS || '400', 10);
const BULK_ITEM_BUDGET_MS = parseInt(process.env.BULK_ITEM_BUDGET_MS || '12000', 10);

// ============================================================
// PROVIDER ROUTING
// ============================================================

/**
 * Determine if provider is SMTP-hostile (relay should be skipped).
 * SMTP-hostile: Google, Proton, Mimecast, Proofpoint, security gateways
 */
function isSmtpHostileProvider(mxInfo) {
  if (!mxInfo) return false;

  // Known SMTP blockers
  const hostile = ['google', 'proton', 'mimecast', 'proofpoint', 'barracuda'];
  if (hostile.includes(mxInfo.provider)) return true;

  // Security gateways
  if (mxInfo.isGateway) return true;

  // MX info explicitly marks it
  if (mxInfo.smtpBlocking === true) return true;

  return false;
}

/**
 * Check if provider is relay-preferred.
 * Microsoft and Zoho typically respond well to SMTP.
 */
function isRelayPreferred(mxInfo) {
  if (!mxInfo) return false;
  const preferred = ['microsoft', 'zoho', 'fastmail'];
  return preferred.includes(mxInfo.provider);
}

// ============================================================
// CIRCUIT BREAKER (PER-DOMAIN)
// ============================================================

/**
 * In-memory per-domain stats for circuit breaker logic.
 * Structure: { domain: { count, successes, timeouts, tempFails, emaMs, lastFailureTs, bypassUntil } }
 */
const domainStats = new Map();
const CIRCUIT_BREAKER_TIMEOUT_THRESHOLD = 3;      // 3 timeouts within window
const CIRCUIT_BREAKER_TIMEOUT_RATE = 0.2;         // 20% timeout rate over N samples
const CIRCUIT_BREAKER_EMA_THRESHOLD_MS = 4000;    // p95-ish threshold
const CIRCUIT_BREAKER_BYPASS_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CIRCUIT_BREAKER_SAMPLE_WINDOW = 20;         // Last 20 samples for rate calc

function recordDomainResult(domain, ms, success, isTimeout = false) {
  if (!domain) return;

  try {
    let stats = domainStats.get(domain);
    if (!stats) {
      stats = { count: 0, successes: 0, timeouts: 0, tempFails: 0, emaMs: 0, lastFailureTs: null, bypassUntil: null };
      domainStats.set(domain, stats);
    }

    stats.count++;
    if (success) stats.successes++;
    if (isTimeout) {
      stats.timeouts++;
      stats.lastFailureTs = Date.now();
    }

    // EMA calculation (exponential moving average)
    const alpha = 0.3; // Weight for new sample
    stats.emaMs = stats.emaMs === 0 ? ms : (alpha * ms) + ((1 - alpha) * stats.emaMs);

    // Circuit breaker logic
    const now = Date.now();
    const recentTimeouts = stats.timeouts;
    const timeoutRate = stats.count > 0 ? recentTimeouts / Math.min(stats.count, CIRCUIT_BREAKER_SAMPLE_WINDOW) : 0;

    // Trigger bypass if:
    // 1. 3+ timeouts within window
    // 2. Timeout rate > 20% over last N samples
    // 3. EMA > 4000ms
    const shouldBypass =
      (recentTimeouts >= CIRCUIT_BREAKER_TIMEOUT_THRESHOLD) ||
      (timeoutRate > CIRCUIT_BREAKER_TIMEOUT_RATE && stats.count >= 5) ||
      (stats.emaMs > CIRCUIT_BREAKER_EMA_THRESHOLD_MS && stats.count >= 3);

    if (shouldBypass && !stats.bypassUntil) {
      stats.bypassUntil = now + CIRCUIT_BREAKER_BYPASS_TTL_MS;
      console.log(`[CircuitBreaker] OPEN: ${domain} (timeouts=${recentTimeouts}, rate=${(timeoutRate * 100).toFixed(1)}%, ema=${stats.emaMs.toFixed(0)}ms) bypass_ttl=30m`);
    }

    // Decay: every 10 minutes, reduce timeout count
    if (stats.count % 50 === 0 && stats.timeouts > 0) {
      stats.timeouts = Math.max(0, stats.timeouts - 1);
    }
  } catch (err) {
    // Fail-open: if stats logic errors, don't block verification
    console.error(`[CircuitBreaker] Stats error for ${domain}: ${err.message}`);
  }
}

function isDomainBypassed(domain) {
  if (!domain) return false;

  const stats = domainStats.get(domain);
  if (!stats || !stats.bypassUntil) return false;

  const now = Date.now();
  if (now < stats.bypassUntil) {
    return true;
  }

  // Bypass expired, clear it
  stats.bypassUntil = null;
  console.log(`[CircuitBreaker] CLOSED: ${domain} (bypass expired)`);
  return false;
}

// Cleanup: cap map size to prevent memory leaks
setInterval(() => {
  if (domainStats.size > 5000) {
    const oldest = Array.from(domainStats.entries())
      .sort((a, b) => (a[1].lastFailureTs || 0) - (b[1].lastFailureTs || 0))
      .slice(0, 1000)
      .map(([domain]) => domain);

    oldest.forEach(d => domainStats.delete(d));
    console.log(`[CircuitBreaker] Cleanup: evicted ${oldest.length} stale domains (size=${domainStats.size})`);
  }
}, 10 * 60 * 1000); // Every 10 minutes

// ============================================================
// HEDGED VERIFICATION (BULK OPTIMIZED)
// ============================================================

/**
 * Hedged verification with provider routing and circuit breaker.
 *
 * @param {string} email - Email to verify
 * @param {function} prx2Fn - PRX2 verification function (async () => { verdict, ... })
 * @param {function} catchAllProbeFn - Catch-all confidence probe function (async (email, domain) => { shouldUpgrade, confidence, signals })
 * @param {string} queueType - 'bulk' or 'interactive'
 * @returns {Promise<{ verdict: string, ... }>}
 */
async function hedgedVerify(email, prx2Fn, catchAllProbeFn, queueType = 'bulk') {
  const emailLower = email.toLowerCase();
  const domain = emailLower.split('@')[1];

  if (!domain) {
    return { verdict: 'INVALID', reason: 'malformed_email', cached: false };
  }

  const startTime = Date.now();

  // Get provider info for routing (includes M365 tenant attribution)
  let mxInfo;
  try {
    mxInfo = await resolveMailboxProvider(domain, `hedge-${domain.slice(0, 8)}`);
  } catch (err) {
    console.error(`[HedgedVerify] Provider lookup failed for ${domain}: ${err.message}`);
    mxInfo = { provider: 'unknown', smtpBlocking: false };
  }

  const isBulk = queueType === 'bulk';
  const isHostile = isSmtpHostileProvider(mxInfo);
  const isBypassed = isDomainBypassed(domain);

  // RULE 1: SMTP-hostile providers → skip relay, go PRX2 directly
  if (isHostile && isBulk) {
    console.log(`[HedgedVerify] ${emailLower} → SMTP-hostile provider (${mxInfo.provider}), routing to PRX2 directly`);
    const result = await prx2Fn();
    recordDomainResult(domain, Date.now() - startTime, result && result.verdict !== 'UNKNOWN', false);
    return result || { verdict: 'UNKNOWN', reason: 'prx2_failed', cached: false };
  }

  // RULE 2: Circuit breaker bypass → skip relay, go PRX2 directly
  if (isBypassed && isBulk) {
    console.log(`[HedgedVerify] ${emailLower} → circuit breaker OPEN for ${domain}, routing to PRX2 directly`);
    const result = await prx2Fn();
    recordDomainResult(domain, Date.now() - startTime, result && result.verdict !== 'UNKNOWN', false);
    return result || { verdict: 'UNKNOWN', reason: 'prx2_failed', cached: false };
  }

  // RULE 3: For single (non-bulk) calls, use existing cascade (relay → PRX2 fallback)
  // This preserves existing behavior for non-bulk
  if (!isBulk) {
    // Traditional cascade (existing behavior)
    try {
      const smtpResult = await verifyInboxSMTP(emailLower);

      if (smtpResult.result === 'deliverable') {
        // Check catch-all
        const catchAllCheck = await detectCatchAllSMTP(domain);
        if (catchAllCheck.isCatchAll) {
          const conf = await catchAllProbeFn(emailLower, domain);
          const verdict = conf.shouldUpgrade ? 'VALID' : 'RISKY';
          recordDomainResult(domain, Date.now() - startTime, true, false);
          return { verdict, catchAll: true, confidence: conf.confidence, signals: conf.signals, catchAllUpgrade: conf.shouldUpgrade, smtpDirect: true, cached: false };
        }
        recordDomainResult(domain, Date.now() - startTime, true, false);
        return { verdict: 'VALID', cached: false, smtpDirect: true };
      }

      if (smtpResult.result === 'undeliverable') {
        recordDomainResult(domain, Date.now() - startTime, true, false);
        return { verdict: 'INVALID', cached: false, smtpDirect: true };
      }

      // Fall through to PRX2
    } catch (err) {
      console.error(`[HedgedVerify] SMTP error for ${emailLower}: ${err.message}`);
    }

    // PRX2 fallback
    const result = await prx2Fn();
    recordDomainResult(domain, Date.now() - startTime, result && result.verdict !== 'UNKNOWN', false);
    return result || { verdict: 'UNKNOWN', reason: 'prx2_failed', cached: false };
  }

  // RULE 4: BULK mode → Hedged requests
  console.log(`[HedgedVerify] ${emailLower} → hedged mode (provider=${mxInfo.provider})`);

  // Per-item budget wrapper
  const withBudget = (promise) => {
    return Promise.race([
      promise,
      new Promise(resolve => setTimeout(() => resolve({ verdict: 'UNKNOWN', reason: 'budget_exceeded', cached: false }), BULK_ITEM_BUDGET_MS))
    ]);
  };

  let relayPromise;
  let prx2Promise;
  let relayStarted = false;
  let prx2Started = false;

  // Start relay immediately
  relayPromise = (async () => {
    relayStarted = true;
    try {
      const smtpResult = await verifyInboxSMTP(emailLower);

      if (smtpResult.result === 'deliverable') {
        const catchAllCheck = await detectCatchAllSMTP(domain);
        if (catchAllCheck.isCatchAll) {
          const conf = await catchAllProbeFn(emailLower, domain);
          const verdict = conf.shouldUpgrade ? 'VALID' : 'RISKY';
          return { verdict, catchAll: true, confidence: conf.confidence, signals: conf.signals, catchAllUpgrade: conf.shouldUpgrade, smtpDirect: true, cached: false, source: 'relay' };
        }
        return { verdict: 'VALID', cached: false, smtpDirect: true, source: 'relay' };
      }

      if (smtpResult.result === 'undeliverable') {
        return { verdict: 'INVALID', cached: false, smtpDirect: true, source: 'relay' };
      }

      // Relay inconclusive, not definitive
      return { verdict: 'UNKNOWN', reason: 'relay_inconclusive', source: 'relay' };
    } catch (err) {
      return { verdict: 'UNKNOWN', reason: 'relay_error', error: err.message, source: 'relay' };
    }
  })();

  // Start PRX2 after HEDGE_DELAY_MS if relay hasn't resolved
  prx2Promise = (async () => {
    await new Promise(resolve => setTimeout(resolve, HEDGE_DELAY_MS));

    // Check if relay already finished with definitive answer
    const relayResult = await Promise.race([
      relayPromise,
      Promise.resolve(null) // Returns null if relay still pending
    ]);

    if (relayResult && relayResult.verdict !== 'UNKNOWN') {
      // Relay won, don't start PRX2
      return null;
    }

    // Relay still pending or inconclusive, start PRX2
    prx2Started = true;
    console.log(`[HedgedVerify] ${emailLower} → relay delayed, starting PRX2 hedge`);
    const result = await prx2Fn();
    return { ...result, source: 'prx2' };
  })();

  // Race for first definitive result
  const result = await withBudget(
    Promise.race([relayPromise, prx2Promise].filter(Boolean))
  );

  // Log which source won
  if (result.source) {
    console.log(`[HedgedVerify] ${emailLower} → ${result.source} won (verdict=${result.verdict}, ms=${Date.now() - startTime})`);
  }

  // Record domain performance
  const isTimeout = result.reason === 'budget_exceeded';
  recordDomainResult(domain, Date.now() - startTime, result.verdict !== 'UNKNOWN', isTimeout);

  return result;
}

// ============================================================
// STATS EXPORT (FOR ADMIN/DEBUG)
// ============================================================

function getCircuitBreakerStats() {
  const stats = [];
  for (const [domain, data] of domainStats.entries()) {
    if (data.bypassUntil && Date.now() < data.bypassUntil) {
      stats.push({
        domain,
        timeouts: data.timeouts,
        emaMs: Math.round(data.emaMs),
        bypassRemaining: Math.round((data.bypassUntil - Date.now()) / 1000 / 60) + 'm'
      });
    }
  }
  return stats;
}

function clearCircuitBreaker(domain) {
  if (domain) {
    domainStats.delete(domain);
    return true;
  }
  domainStats.clear();
  return true;
}

module.exports = {
  hedgedVerify,
  isSmtpHostileProvider,
  isRelayPreferred,
  isDomainBypassed,
  recordDomainResult,
  getCircuitBreakerStats,
  clearCircuitBreaker,
  HEDGE_DELAY_MS,
  BULK_ITEM_BUDGET_MS,
};
