/**
 * DNS Intelligence Module
 *
 * Free DNS-based signals for email verification:
 * - Domain liveness (A/AAAA)
 * - MX provider detection
 * - SPF provider inference
 * - Autodiscover probe (Microsoft 365)
 *
 * Zero dependencies. Zero API cost. Built-in Node.js dns module.
 */

const dns = require('dns');
const dnsPromises = dns.promises;
const https = require('https');

// ============================================================
// LRU CACHE WITH TTL
// ============================================================

class LruTtlCache {
  constructor(maxSize = 2000) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key, value, ttlMs) {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  get size() {
    return this.cache.size;
  }

  clear() {
    this.cache.clear();
  }

  // Return all non-expired entries for admin stats
  entries() {
    const now = Date.now();
    const result = [];
    for (const [key, entry] of this.cache) {
      if (now <= entry.expiresAt) {
        result.push({ key, value: entry.value });
      }
    }
    return result;
  }
}

// ============================================================
// CACHE INSTANCES
// ============================================================

const livenessCache = new LruTtlCache(1000);
const mxCache = new LruTtlCache(2000);
const spfCache = new LruTtlCache(2000);
const autodiscoverCache = new LruTtlCache(2000);
const tenantCache = new LruTtlCache(2000);

// TTLs
const TTL_LIVENESS = 6 * 60 * 60 * 1000;         // 6h
const TTL_LIVENESS_DEAD = 1 * 60 * 60 * 1000;     // 1h (NXDOMAIN)
const TTL_LIVENESS_TIMEOUT = 2 * 60 * 1000;        // 2min (DNS timeout — don't cache as negative)
const TTL_MX = 24 * 60 * 60 * 1000;               // 24h
const TTL_SPF = 24 * 60 * 60 * 1000;              // 24h
const TTL_AUTODISCOVER = 24 * 60 * 60 * 1000;     // 24h
const TTL_TENANT_HIT = 7 * 24 * 60 * 60 * 1000;  // 7 days (confirmed M365)
const TTL_TENANT_MISS = 24 * 60 * 60 * 1000;      // 1 day (not M365)
const TTL_TENANT_ERROR = 60 * 60 * 1000;           // 1h (on network error)

// ============================================================
// TIMEOUT WRAPPER
// ============================================================

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('DNS_TIMEOUT')), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// ============================================================
// MX PROVIDER MAP
// ============================================================

const MX_PROVIDERS = [
  { name: 'google', pattern: /\.(google|googlemail)\.com$/i, smtpBlocking: true },
  { name: 'google', pattern: /^aspmx\d?\.l\.google\.com$/i, smtpBlocking: true },
  { name: 'microsoft', pattern: /\.mail\.protection\.outlook\.com$/i, smtpBlocking: false },
  { name: 'proton', pattern: /\.(protonmail\.ch|proton\.me)$/i, smtpBlocking: true },
  { name: 'mimecast', pattern: /\.mimecast\.com$/i, smtpBlocking: true },
  { name: 'barracuda', pattern: /\.barracudanetworks\.com$/i, smtpBlocking: true },
  { name: 'proofpoint', pattern: /\.(pphosted|proofpoint)\.com$/i, smtpBlocking: true },
  { name: 'zoho', pattern: /\.zoho\.(com|eu|in)$/i, smtpBlocking: false },
  { name: 'fastmail', pattern: /\.fastmail\.(com|fm)$/i, smtpBlocking: false },
];

// Gateway providers — MX is a security layer, not the mailbox provider
const GATEWAY_PROVIDERS = new Set(['mimecast', 'barracuda', 'proofpoint']);

// ============================================================
// A) DOMAIN LIVENESS (DNS_A)
// ============================================================

/**
 * Check if domain resolves (A or AAAA record).
 * Budget: 1200ms total. No retries.
 *
 * @returns {{ live: boolean|'unknown', reason?: string, ms: number }}
 */
async function isDomainLive(domain, cid = '-') {
  const domainLower = domain.toLowerCase();
  const cached = livenessCache.get(domainLower);
  if (cached) return cached;

  const start = Date.now();

  try {
    // Race A and AAAA — either one resolving means the domain is live
    await withTimeout(
      Promise.any([
        dnsPromises.resolve4(domainLower),
        dnsPromises.resolve6(domainLower),
      ]),
      1200
    );

    const ms = Date.now() - start;
    const result = { live: true, ms };
    livenessCache.set(domainLower, result, TTL_LIVENESS);
    console.log(`[DNS] cid=${cid} step=DNS_A domain=${domainLower} ms=${ms} ok=1 live=1`);
    return result;
  } catch (err) {
    const ms = Date.now() - start;

    // NXDOMAIN or NODATA = domain is dead
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA' ||
        (err.errors && err.errors.every(e => e.code === 'ENOTFOUND' || e.code === 'ENODATA'))) {
      const result = { live: false, reason: 'NXDOMAIN', ms };
      livenessCache.set(domainLower, result, TTL_LIVENESS_DEAD);
      console.log(`[DNS] cid=${cid} step=DNS_A domain=${domainLower} ms=${ms} ok=1 live=0 reason=NXDOMAIN`);
      return result;
    }

    // Timeout or transient error — unknown, don't short-circuit
    const reason = err.message === 'DNS_TIMEOUT' ? 'TIMEOUT' : err.code || err.message;
    const result = { live: 'unknown', reason, ms };
    livenessCache.set(domainLower, result, TTL_LIVENESS_TIMEOUT);
    console.log(`[DNS] cid=${cid} step=DNS_A domain=${domainLower} ms=${ms} ok=0 live=unknown reason=${reason}`);
    return result;
  }
}

// ============================================================
// B) MX PROVIDER (DNS_MX)
// ============================================================

/**
 * Resolve MX records and identify email provider.
 * Budget: 1500ms.
 *
 * @returns {{ provider: string, smtpBlocking: boolean, mxHosts: string[], isGateway: boolean, ms: number }}
 */
async function getMxProvider(domain, cid = '-') {
  const domainLower = domain.toLowerCase();
  const cached = mxCache.get(domainLower);
  if (cached) return cached;

  const start = Date.now();

  try {
    const mxRecords = await withTimeout(dnsPromises.resolveMx(domainLower), 1500);
    const ms = Date.now() - start;

    if (!mxRecords || mxRecords.length === 0) {
      const result = { provider: 'unknown', smtpBlocking: false, mxHosts: [], isGateway: false, ms };
      mxCache.set(domainLower, result, TTL_MX);
      console.log(`[DNS] cid=${cid} step=DNS_MX domain=${domainLower} ms=${ms} ok=1 provider=unknown reason=no_mx`);
      return result;
    }

    mxRecords.sort((a, b) => a.priority - b.priority);
    const mxHosts = mxRecords.map(r => r.exchange.toLowerCase());

    // Match against known providers
    for (const mx of mxHosts) {
      for (const entry of MX_PROVIDERS) {
        if (entry.pattern.test(mx)) {
          const isGateway = GATEWAY_PROVIDERS.has(entry.name);
          const result = { provider: entry.name, smtpBlocking: entry.smtpBlocking, mxHosts, isGateway, ms };
          mxCache.set(domainLower, result, TTL_MX);
          console.log(`[DNS] cid=${cid} step=DNS_MX domain=${domainLower} ms=${ms} ok=1 provider=${entry.name} gateway=${isGateway}`);
          return result;
        }
      }
    }

    const result = { provider: 'unknown', smtpBlocking: false, mxHosts, isGateway: false, ms };
    mxCache.set(domainLower, result, TTL_MX);
    console.log(`[DNS] cid=${cid} step=DNS_MX domain=${domainLower} ms=${ms} ok=1 provider=unknown hosts=${mxHosts[0]}`);
    return result;
  } catch (err) {
    const ms = Date.now() - start;
    const reason = err.message === 'DNS_TIMEOUT' ? 'TIMEOUT' : err.code || err.message;
    const result = { provider: 'unknown', smtpBlocking: false, mxHosts: [], isGateway: false, ms, error: reason };
    mxCache.set(domainLower, result, TTL_LIVENESS_TIMEOUT); // Short TTL for errors
    console.log(`[DNS] cid=${cid} step=DNS_MX domain=${domainLower} ms=${ms} ok=0 reason=${reason}`);
    return result;
  }
}

// ============================================================
// C) SPF INFERENCE (DNS_SPF_TXT)
// ============================================================

// SPF include patterns → provider
const SPF_PATTERNS = [
  { pattern: /_spf\.google\.com|spf\.google\.com/, provider: 'google' },
  { pattern: /spf\.protection\.outlook\.com|include:outlook\.com/, provider: 'microsoft' },
  { pattern: /zoho\.(com|eu|in)/, provider: 'zoho' },
  { pattern: /fastmail\.(com|fm)/, provider: 'fastmail' },
  { pattern: /protonmail\.ch|proton\.me/, provider: 'proton' },
];

/**
 * Infer mailbox provider from SPF TXT record.
 * No recursive include chasing (v1).
 * Budget: 1500ms.
 *
 * @returns {{ inferred: string, spfPresent: boolean, ms: number }}
 */
async function inferMailboxProviderFromSpf(domain, cid = '-') {
  const domainLower = domain.toLowerCase();
  const cached = spfCache.get(domainLower);
  if (cached) return cached;

  const start = Date.now();

  try {
    const records = await withTimeout(dnsPromises.resolveTxt(domainLower), 1500);
    const ms = Date.now() - start;

    // Flatten TXT records (they come as arrays of chunks)
    const txtStrings = records.map(chunks => chunks.join(''));
    const spfRecord = txtStrings.find(r => r.startsWith('v=spf1'));

    if (!spfRecord) {
      const result = { inferred: 'unknown', spfPresent: false, ms };
      spfCache.set(domainLower, result, TTL_SPF);
      console.log(`[DNS] cid=${cid} step=DNS_SPF domain=${domainLower} ms=${ms} ok=1 inferred=unknown reason=no_spf`);
      return result;
    }

    for (const entry of SPF_PATTERNS) {
      if (entry.pattern.test(spfRecord)) {
        const result = { inferred: entry.provider, spfPresent: true, ms };
        spfCache.set(domainLower, result, TTL_SPF);
        console.log(`[DNS] cid=${cid} step=DNS_SPF domain=${domainLower} ms=${ms} ok=1 inferred=${entry.provider}`);
        return result;
      }
    }

    const result = { inferred: 'unknown', spfPresent: true, ms };
    spfCache.set(domainLower, result, TTL_SPF);
    console.log(`[DNS] cid=${cid} step=DNS_SPF domain=${domainLower} ms=${ms} ok=1 inferred=unknown spf_present=1`);
    return result;
  } catch (err) {
    const ms = Date.now() - start;
    const reason = err.message === 'DNS_TIMEOUT' ? 'TIMEOUT' : err.code || err.message;
    const result = { inferred: 'unknown', spfPresent: false, ms, error: reason };
    spfCache.set(domainLower, result, TTL_LIVENESS_TIMEOUT);
    console.log(`[DNS] cid=${cid} step=DNS_SPF domain=${domainLower} ms=${ms} ok=0 reason=${reason}`);
    return result;
  }
}

// ============================================================
// D) AUTODISCOVER PROBE (DNS_AUTODISCOVER)
// ============================================================

/**
 * Check autodiscover CNAME for Microsoft 365 detection.
 * Budget: 1500ms.
 *
 * @returns {{ inferred: string, hit: boolean, ms: number }}
 */
async function inferProviderFromAutodiscover(domain, cid = '-') {
  const domainLower = domain.toLowerCase();
  const cached = autodiscoverCache.get(domainLower);
  if (cached) return cached;

  const start = Date.now();
  const autodiscoverDomain = `autodiscover.${domainLower}`;

  try {
    const cname = await withTimeout(dnsPromises.resolveCname(autodiscoverDomain), 1500);
    const ms = Date.now() - start;

    const isMicrosoft = cname.some(c => /outlook\.com/i.test(c));

    if (isMicrosoft) {
      const result = { inferred: 'microsoft', hit: true, ms };
      autodiscoverCache.set(domainLower, result, TTL_AUTODISCOVER);
      console.log(`[DNS] cid=${cid} step=DNS_AUTODISCOVER domain=${domainLower} ms=${ms} ok=1 inferred=microsoft`);
      return result;
    }

    const result = { inferred: 'unknown', hit: true, ms };
    autodiscoverCache.set(domainLower, result, TTL_AUTODISCOVER);
    console.log(`[DNS] cid=${cid} step=DNS_AUTODISCOVER domain=${domainLower} ms=${ms} ok=1 inferred=unknown cname=${cname[0]}`);
    return result;
  } catch (err) {
    const ms = Date.now() - start;
    const reason = err.message === 'DNS_TIMEOUT' ? 'TIMEOUT' : err.code || err.message;
    const result = { inferred: 'unknown', hit: false, ms, error: reason };
    autodiscoverCache.set(domainLower, result, TTL_LIVENESS_TIMEOUT);
    // Don't log ENODATA/ENOTFOUND as errors — most domains don't have autodiscover
    if (reason !== 'ENOTFOUND' && reason !== 'ENODATA') {
      console.log(`[DNS] cid=${cid} step=DNS_AUTODISCOVER domain=${domainLower} ms=${ms} ok=0 reason=${reason}`);
    }
    return result;
  }
}

// ============================================================
// ADMIN: CACHE STATS
// ============================================================

function getCacheStats() {
  const providerDist = {};
  for (const { value } of mxCache.entries()) {
    const name = value.provider || 'unknown';
    providerDist[name] = (providerDist[name] || 0) + 1;
  }

  return {
    liveness: { size: livenessCache.size },
    mx: { size: mxCache.size, providers: providerDist },
    spf: { size: spfCache.size },
    autodiscover: { size: autodiscoverCache.size },
  };
}

function clearAllCaches() {
  livenessCache.clear();
  mxCache.clear();
  spfCache.clear();
  autodiscoverCache.clear();
}

// ============================================================
// MICROSOFT 365 TENANT ATTRIBUTION
// ============================================================

/**
 * Check if a domain is a confirmed Microsoft 365 tenant.
 *
 * Uses Microsoft's OIDC discovery endpoint:
 *   GET https://login.microsoftonline.com/{domain}/v2.0/.well-known/openid-configuration
 *
 * Returns { isM365: true, tenantId: '...' } for confirmed M365 tenants.
 * Returns { isM365: false, tenantId: null } for non-M365 or on error.
 *
 * Cache: 7 days on hit, 1 day on miss, 1h on network error.
 *
 * @param {string} domain
 * @returns {Promise<{ isM365: boolean, tenantId: string|null }>}
 */
async function getMicrosoftTenantId(domain) {
  const cached = tenantCache.get(domain);
  if (cached !== null) return cached;

  try {
    const result = await new Promise((resolve, reject) => {
      const url = `https://login.microsoftonline.com/${domain}/v2.0/.well-known/openid-configuration`;

      const req = https.get(url, (res) => {
        if (res.statusCode === 404 || res.statusCode === 400) {
          res.resume();
          return resolve({ isM365: false, tenantId: null });
        }

        if (res.statusCode !== 200) {
          res.resume();
          return resolve({ isM365: false, tenantId: null });
        }

        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            // issuer: "https://login.microsoftonline.com/{tenantId}/v2.0"
            const match = (json.issuer || '').match(
              /login\.microsoftonline\.com\/([^/]+)\/v2\.0/
            );
            if (match && match[1] && match[1] !== 'common' && match[1] !== 'organizations') {
              resolve({ isM365: true, tenantId: match[1] });
            } else {
              resolve({ isM365: false, tenantId: null });
            }
          } catch (_) {
            resolve({ isM365: false, tenantId: null });
          }
        });
      });

      req.setTimeout(3000, () => {
        req.destroy();
        reject(new Error('TENANT_TIMEOUT'));
      });

      req.on('error', (err) => reject(err));
    });

    const ttl = result.isM365 ? TTL_TENANT_HIT : TTL_TENANT_MISS;
    tenantCache.set(domain, result, ttl);
    return result;
  } catch (err) {
    const miss = { isM365: false, tenantId: null };
    tenantCache.set(domain, miss, TTL_TENANT_ERROR);
    return miss;
  }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  isDomainLive,
  getMxProvider,
  inferMailboxProviderFromSpf,
  inferProviderFromAutodiscover,
  getMicrosoftTenantId,
  getCacheStats,
  clearAllCaches,
  // Exported for testing
  LruTtlCache,
  MX_PROVIDERS,
  SPF_PATTERNS,
  GATEWAY_PROVIDERS,
};
