/**
 * Bulk Scheduler with Layered Concurrency
 *
 * Implements:
 * - Global concurrency cap (GLOBAL_MAX_CONCURRENCY)
 * - Per-domain concurrency cap (PER_DOMAIN_MAX_INFLIGHT)
 * - Per-provider concurrency cap (PER_PROVIDER_MAX_INFLIGHT)
 *
 * Preserves input order in results.
 * Graceful degradation: if routing breaks, falls back to simple pool.
 */

const { getMxProvider } = require('./dnsIntel');

// ============================================================
// ENV CONFIG
// ============================================================

const GLOBAL_MAX_CONCURRENCY = parseInt(process.env.BULK_GLOBAL_CONCURRENCY || '25', 10);
const PER_DOMAIN_MAX_INFLIGHT = parseInt(process.env.BULK_DOMAIN_CONCURRENCY || '2', 10);

// Per-provider limits (configurable via env)
const PER_PROVIDER_LIMITS = {
  google: parseInt(process.env.BULK_GOOGLE_CONCURRENCY || '5', 10),
  microsoft: parseInt(process.env.BULK_MICROSOFT_CONCURRENCY || '10', 10),
  mimecast: parseInt(process.env.BULK_GATEWAY_CONCURRENCY || '5', 10),
  proofpoint: parseInt(process.env.BULK_GATEWAY_CONCURRENCY || '5', 10),
  barracuda: parseInt(process.env.BULK_GATEWAY_CONCURRENCY || '5', 10),
  unknown: parseInt(process.env.BULK_UNKNOWN_CONCURRENCY || '5', 10),
  custom: parseInt(process.env.BULK_CUSTOM_CONCURRENCY || '5', 10),
};

// ============================================================
// SCHEDULER
// ============================================================

/**
 * Process items with layered concurrency caps.
 *
 * @param {Array} items - Input items
 * @param {Function} getDomain - (item) => domain string
 * @param {Function} processFn - async (item, index) => result
 * @returns {Promise<Array>} Results in same order as input
 */
async function scheduledBulkProcess(items, getDomain, processFn) {
  const results = new Array(items.length);
  const queue = items.map((item, index) => ({ item, index }));

  // Inflight tracking
  let inflightTotal = 0;
  const inflightByDomain = new Map(); // domain -> count
  const inflightByProvider = new Map(); // provider -> count

  // Resolve provider for each item upfront (cached, fast)
  const itemProviders = new Map(); // index -> provider string

  async function resolveProvider(item, index) {
    try {
      const domain = getDomain(item);
      if (!domain) return 'unknown';

      const mx = await getMxProvider(domain);
      const provider = mx.provider || 'unknown';
      itemProviders.set(index, provider);
      return provider;
    } catch (err) {
      itemProviders.set(index, 'unknown');
      return 'unknown';
    }
  }

  // Pre-resolve providers for all items (parallel, fast)
  console.log(`[BulkScheduler] Pre-resolving providers for ${items.length} items...`);
  const t0 = Date.now();
  await Promise.all(queue.map(q => resolveProvider(q.item, q.index)));
  console.log(`[BulkScheduler] Providers resolved in ${Date.now() - t0}ms`);

  // Worker function
  async function worker() {
    while (queue.length > 0) {
      // Find next dispatchable item
      let dispatchIndex = -1;

      for (let i = 0; i < queue.length; i++) {
        const { item, index } = queue[i];
        const domain = getDomain(item);
        const provider = itemProviders.get(index) || 'unknown';
        const providerLimit = PER_PROVIDER_LIMITS[provider] || PER_PROVIDER_LIMITS.unknown;

        // Check limits
        const domainInflight = inflightByDomain.get(domain) || 0;
        const providerInflight = inflightByProvider.get(provider) || 0;

        const canDispatch =
          inflightTotal < GLOBAL_MAX_CONCURRENCY &&
          domainInflight < PER_DOMAIN_MAX_INFLIGHT &&
          providerInflight < providerLimit;

        if (canDispatch) {
          dispatchIndex = i;
          break;
        }
      }

      // No dispatchable item, wait and retry
      if (dispatchIndex === -1) {
        await new Promise(resolve => setTimeout(resolve, 50)); // Small delay
        continue;
      }

      // Dispatch item
      const { item, index } = queue.splice(dispatchIndex, 1)[0];
      const domain = getDomain(item);
      const provider = itemProviders.get(index) || 'unknown';

      // Increment inflight counters
      inflightTotal++;
      inflightByDomain.set(domain, (inflightByDomain.get(domain) || 0) + 1);
      inflightByProvider.set(provider, (inflightByProvider.get(provider) || 0) + 1);

      // Process item
      (async () => {
        try {
          results[index] = await processFn(item, index);
        } catch (err) {
          console.error(`[BulkScheduler] Error processing item ${index}:`, err.message);
          results[index] = { error: err.message };
        } finally {
          // Decrement inflight counters
          inflightTotal--;
          inflightByDomain.set(domain, Math.max(0, (inflightByDomain.get(domain) || 0) - 1));
          inflightByProvider.set(provider, Math.max(0, (inflightByProvider.get(provider) || 0) - 1));
        }
      })();
    }
  }

  // Start workers
  const workerCount = Math.min(GLOBAL_MAX_CONCURRENCY, items.length);
  const workers = [];
  for (let w = 0; w < workerCount; w++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  return results;
}

/**
 * Fallback: simple concurrency pool (no layered limits).
 * Used if scheduledBulkProcess errors out.
 */
async function simpleBulkProcess(items, concurrency, processFn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await processFn(items[i], i);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  const workers = [];
  for (let w = 0; w < workerCount; w++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return results;
}

module.exports = {
  scheduledBulkProcess,
  simpleBulkProcess,
  GLOBAL_MAX_CONCURRENCY,
  PER_DOMAIN_MAX_INFLIGHT,
  PER_PROVIDER_LIMITS,
};
