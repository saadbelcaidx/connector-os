/**
 * Connector Agent Backend
 *
 * Local development server for email find & verify.
 * Port: 8000
 *
 * NO deployment. LOCAL ONLY.
 */

const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const path = require('path');
const http = require('http');
const { URL } = require('url');

// Stripe-grade bulk performance modules
const { hedgedVerify, getCircuitBreakerStats, clearCircuitBreaker, HEDGE_DELAY_MS, BULK_ITEM_BUDGET_MS } = require('./hedgedVerify');
const { scheduledBulkProcess, simpleBulkProcess, GLOBAL_MAX_CONCURRENCY, PER_DOMAIN_MAX_INFLIGHT } = require('./bulkScheduler');

// Web extraction module for crawling company websites
// DISABLED on Railway (Puppeteer needs too much memory)
// Set DISABLE_WEB_EXTRACTOR=true to skip loading
let extractEmailsForPerson = null;
if (process.env.DISABLE_WEB_EXTRACTOR !== 'true') {
  try {
    const webExtractor = require('./webExtractor');
    extractEmailsForPerson = webExtractor.extractEmailsForPerson;
    console.log('[WebExtractor] Loaded successfully');
  } catch (err) {
    console.warn('[WebExtractor] Failed to load (Puppeteer issue?):', err.message);
  }
} else {
  console.log('[WebExtractor] Disabled via DISABLE_WEB_EXTRACTOR=true');
}

const app = express();
const PORT = process.env.PORT || 8000;

// ============================================================
// DATABASE SETUP
// ============================================================

// Data directory can be overridden via environment variable for Railway persistent volumes
// Railway: Set DATA_DIR=/data and mount a volume at /data
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'connector-agent.db');

// Ensure data directory exists
const fs = require('fs');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

console.log(`[Database] Using data directory: ${dataDir}`);
console.log(`[Database] Database path: ${dbPath}`);

const db = new Database(dbPath);

// Create tables
db.exec(`
  -- API Keys table
  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_used_at TEXT,
    UNIQUE(user_id, status) -- Only one active key per user
  );

  -- Usage tracking
  CREATE TABLE IF NOT EXISTS usage (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    api_key_id TEXT NOT NULL,
    tokens_used INTEGER DEFAULT 0,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    UNIQUE(user_id, period_start)
  );

  -- Email cache (for deduplication)
  CREATE TABLE IF NOT EXISTS email_cache (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    verdict TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(domain, first_name, last_name)
  );

  -- Verification cache
  CREATE TABLE IF NOT EXISTS verify_cache (
    email TEXT PRIMARY KEY,
    verdict TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Domain pattern learning (speed optimization)
  CREATE TABLE IF NOT EXISTS domain_patterns (
    domain TEXT PRIMARY KEY,
    pattern TEXT NOT NULL,
    wins INTEGER DEFAULT 1,
    last_seen TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// ============================================================
// DOMAIN PATTERN LEARNING (speed optimization)
// ============================================================

/**
 * Extract pattern type from email
 * e.g., "john.smith@acme.com" → "firstname.lastname"
 */
function extractPattern(email, firstName, lastName) {
  const [local] = email.toLowerCase().split('@');
  const f = firstName.toLowerCase().trim().split(' ')[0];
  const l = lastName.toLowerCase().trim().split(' ')[0];
  const fi = f[0];
  const li = l[0];

  // Match against known patterns
  if (local === f) return 'firstname';
  if (local === `${f}.${l}`) return 'firstname.lastname';
  if (local === `${f}${l}`) return 'firstnamelastname';
  if (local === `${fi}${l}`) return 'firstinitiallastname';
  if (local === `${f}.${li}`) return 'firstname.lastinitial';
  if (local === `${fi}.${l}`) return 'firstinitial.lastname';
  if (local === `${l}`) return 'lastname';
  if (local === `${l}.${f}`) return 'lastname.firstname';
  if (local === `${l}${f}`) return 'lastnamefirstname';
  if (local === `${f}_${l}`) return 'firstname_lastname';
  if (local === `${fi}${l.slice(0, 3)}`) return 'firstinitial3lastname';

  return 'unknown';
}

/**
 * Record a winning pattern for a domain
 */
function recordDomainPattern(domain, email, firstName, lastName) {
  const pattern = extractPattern(email, firstName, lastName);
  if (pattern === 'unknown') return;

  db.prepare(`
    INSERT INTO domain_patterns (domain, pattern, wins, last_seen)
    VALUES (?, ?, 1, datetime('now'))
    ON CONFLICT(domain) DO UPDATE SET
      pattern = CASE WHEN excluded.pattern = pattern THEN pattern ELSE excluded.pattern END,
      wins = CASE WHEN excluded.pattern = pattern THEN wins + 1 ELSE 1 END,
      last_seen = datetime('now')
  `).run(domain.toLowerCase(), pattern);

  console.log(`[PatternLearning] Recorded ${pattern} for ${domain}`);
}

/**
 * Get learned pattern for a domain and generate email
 */
function getLearnedEmail(domain, firstName, lastName) {
  const row = db.prepare(`
    SELECT pattern, wins FROM domain_patterns
    WHERE domain = ? AND wins >= 2
  `).get(domain.toLowerCase());

  if (!row) return null;

  const f = firstName.toLowerCase().trim().split(' ')[0];
  const l = lastName.toLowerCase().trim().split(' ')[0];
  const fi = f[0];
  const li = l[0];
  const d = domain.toLowerCase();

  const patternMap = {
    'firstname': `${f}@${d}`,
    'firstname.lastname': `${f}.${l}@${d}`,
    'firstnamelastname': `${f}${l}@${d}`,
    'firstinitiallastname': `${fi}${l}@${d}`,
    'firstname.lastinitial': `${f}.${li}@${d}`,
    'firstinitial.lastname': `${fi}.${l}@${d}`,
    'lastname': `${l}@${d}`,
    'lastname.firstname': `${l}.${f}@${d}`,
    'lastnamefirstname': `${l}${f}@${d}`,
    'firstname_lastname': `${f}_${l}@${d}`,
    'firstinitial3lastname': `${fi}${l.slice(0, 3)}@${d}`,
  };

  const email = patternMap[row.pattern];
  if (email) {
    console.log(`[PatternLearning] Using learned pattern ${row.pattern} (${row.wins} wins) for ${domain}`);
  }
  return email;
}

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(cors({
  origin: [
    'https://app.connector-os.com',
    'https://www.connector-os.com',
    'https://connector-os.com',
    'http://localhost:5173',
    'http://localhost:4173',
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-user-email'],
  credentials: false,
}));

// Handle preflight for all routes
app.options('*', cors());

app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Generate API key: ssm_live_XXXX
 */
function generateApiKey() {
  const random = crypto.randomBytes(24).toString('hex');
  return `ssm_live_${random}`;
}

/**
 * Hash API key for storage
 */
function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Get current billing period (monthly)
 */
function getCurrentPeriod() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

/**
 * Get or create usage record for user
 */
function getOrCreateUsage(userId, apiKeyId) {
  const period = getCurrentPeriod();

  let usage = db.prepare(`
    SELECT * FROM usage
    WHERE user_id = ? AND period_start = ?
  `).get(userId, period.start);

  if (!usage) {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO usage (id, user_id, api_key_id, tokens_used, period_start, period_end)
      VALUES (?, ?, ?, 0, ?, ?)
    `).run(id, userId, apiKeyId, period.start, period.end);

    usage = db.prepare(`SELECT * FROM usage WHERE id = ?`).get(id);
  } else if (apiKeyId && usage.api_key_id !== apiKeyId) {
    // Fix orphaned api_key_id from a previous key rotation
    db.prepare(`UPDATE usage SET api_key_id = ? WHERE id = ?`).run(apiKeyId, usage.id);
    usage.api_key_id = apiKeyId;
  }

  return usage;
}

/**
 * Deduct tokens from quota
 * SUCCESS-ONLY PRICING: Only charge if we found a SAFE email
 */
function deductTokens(userId, apiKeyId, tokens) {
  const usage = getOrCreateUsage(userId, apiKeyId);
  const MONTHLY_LIMIT = 10000;

  if (usage.tokens_used + tokens > MONTHLY_LIMIT) {
    return { success: false, error: 'Quota exceeded' };
  }

  db.prepare(`
    UPDATE usage SET tokens_used = tokens_used + ? WHERE id = ?
  `).run(tokens, usage.id);

  // Update last_used_at on API key
  db.prepare(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), apiKeyId);

  return { success: true };
}

/**
 * Check if quota allows operation (without deducting)
 */
function checkQuota(userId, tokens) {
  const usage = getOrCreateUsage(userId, '');
  const MONTHLY_LIMIT = 10000;
  return usage.tokens_used + tokens <= MONTHLY_LIMIT;
}

/**
 * Verify API key and get user info
 */
function verifyApiKey(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const key = authHeader.replace('Bearer ', '');

  // Check for placeholder value (common user error)
  if (key === 'YOUR_API_KEY' || key === 'YOUR_KEY' || key.length < 10) {
    console.log(`[Auth] Invalid key value: looks like placeholder or too short`);
    return null;
  }

  const keyHash = hashKey(key);

  const apiKey = db.prepare(`
    SELECT * FROM api_keys WHERE key_hash = ? AND status = 'active'
  `).get(keyHash);

  if (!apiKey) {
    // Check if key exists but is revoked
    const revokedKey = db.prepare(`SELECT * FROM api_keys WHERE key_hash = ?`).get(keyHash);
    if (revokedKey) {
      console.log(`[Auth] Key found but status=${revokedKey.status} (not active)`);
    } else {
      console.log(`[Auth] Key not found in database (prefix: ${key.slice(0,8)}...)`);
    }
  }

  return apiKey;
}

/**
 * Generate email permutations (20+ enterprise-grade patterns)
 * Order matters: most common patterns first for early termination
 */
function generateEmailPermutations(firstName, lastName, domain, middleName = null) {
  const f = (firstName || '').toLowerCase().trim();
  const l = (lastName || '').toLowerCase().trim();

  // Guard against empty names
  if (!f || !l) {
    console.log(`[Permutations] Invalid name: first="${firstName}", last="${lastName}"`);
    return [];
  }

  const fi = f[0]; // First initial
  const li = l[0]; // Last initial
  const m = middleName ? middleName.toLowerCase().trim() : null;
  const mi = m ? m[0] : null;

  // ARCHITECTURAL FIX: Single-letter lastName detection
  // In UAE/India/Middle East markets, "Ritvik R" means firstName + middle initial
  // System treats "R" as middle initial, prioritizes firstName-only patterns
  // Contract: Single char lastName = incomplete data, adjust pattern priority
  const isSingleCharLastName = l.length === 1;
  if (isSingleCharLastName) {
    console.log(`[Permutations] Single-char lastName detected: "${lastName}" — treating as middle initial (UAE/India pattern)`);
  }

  const patterns = [];

  if (isSingleCharLastName) {
    // TIER 1: firstName-only patterns (most likely for incomplete data)
    patterns.push(
      `${f}@${domain}`,           // ritvik@company.com (HIGHEST PRIORITY)
      `${fi}${l}@${domain}`,      // rr@company.com (firstName initial + middle initial)
    );

    // TIER 2: firstName + single-char patterns (fallback)
    patterns.push(
      `${f}.${l}@${domain}`,      // ritvik.r@company.com
      `${f}${l}@${domain}`,       // ritvikr@company.com
      `${f}_${l}@${domain}`,      // ritvik_r@company.com
      `${f}-${l}@${domain}`,      // ritvik-r@company.com
    );

    // TIER 3: Initial-based (low priority for single char)
    patterns.push(
      `${fi}.${l}@${domain}`,     // r.r@company.com
      `${fi}${li}@${domain}`,     // rr@company.com (duplicate, dedupe handles)
      `${li}${fi}@${domain}`,     // rr@company.com (reversed, dedupe handles)
    );
  } else {
    // STANDARD PATTERN GENERATION (full lastName provided)
    patterns.push(
      // Tier 1: Most common (try first)
      `${f}.${l}@${domain}`,      // john.doe@company.com
      `${f}${l}@${domain}`,       // johndoe@company.com
      `${fi}${l}@${domain}`,      // jdoe@company.com
      `${f}@${domain}`,           // john@company.com
      `${f}${li}@${domain}`,      // johnd@company.com (THIS IS saadb pattern)

      // Tier 2: Common variations
      `${fi}.${l}@${domain}`,     // j.doe@company.com
      `${f}.${li}@${domain}`,     // john.d@company.com
      `${f}_${l}@${domain}`,      // john_doe@company.com
      `${f}-${l}@${domain}`,      // john-doe@company.com
      `${fi}${l}@${domain}`,      // jdoe@company.com (duplicate, dedupe handles)
      `${fi}_${l}@${domain}`,     // j_doe@company.com
      `${fi}-${l}@${domain}`,     // j-doe@company.com

      // Tier 3: Last name first patterns
      `${l}.${f}@${domain}`,      // doe.john@company.com
      `${l}${f}@${domain}`,       // doejohn@company.com
      `${l}_${f}@${domain}`,      // doe_john@company.com
      `${l}-${f}@${domain}`,      // doe-john@company.com
      `${l}${fi}@${domain}`,      // doej@company.com
      `${l}.${fi}@${domain}`,     // doe.j@company.com
      `${li}${f}@${domain}`,      // djohn@company.com
      `${li}.${f}@${domain}`,     // d.john@company.com

      // Tier 4: Simple patterns
      `${l}@${domain}`,           // doe@company.com
      `${fi}${li}@${domain}`,     // jd@company.com (initials)
      `${li}${fi}@${domain}`,     // dj@company.com (reversed initials)
    );

    // Tier 5: Middle name patterns (if provided)
    if (m && mi) {
      patterns.push(
        `${f}.${mi}.${l}@${domain}`,    // john.m.doe@company.com
        `${f}${mi}${l}@${domain}`,      // johnmdoe@company.com
        `${fi}${mi}${l}@${domain}`,     // jmdoe@company.com
        `${f}.${m}.${l}@${domain}`,     // john.michael.doe@company.com
      );
    }
  }

  // Dedupe (some patterns might overlap)
  return [...new Set(patterns)];
}

// ============================================================
// MAILTESTER NINJA INTEGRATION (HARDENED - AWS GRADE)
// ============================================================
// Design principles:
// - Users NEVER see rate limits
// - Accuracy > speed
// - Silence > errors
// - Degrade internally, never externally
// ============================================================

// API Keys - round-robin for 1M capacity (500k each)
let MAILTESTER_API_KEYS = [
  'sub_1Sn2MDAJu6gy4fiYwmetgzK8',  // Original 500k
  'sub_1SnFs1AJu6gy4fiYB3N1k3Zr',  // New 500k ($49)
];
let keyIndex = 0;

// Round-robin key selection
function getNextMailtesterKey() {
  const key = MAILTESTER_API_KEYS[keyIndex];
  keyIndex = (keyIndex + 1) % MAILTESTER_API_KEYS.length;
  return key;
}

// For backwards compatibility (single key access)
function getCurrentMailtesterKey() {
  return MAILTESTER_API_KEYS[keyIndex] || MAILTESTER_API_KEYS[0];
}

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'connector-admin-2024';

// PRX2 endpoint config (higher limits, requires browser headers)
const USE_MAILTESTER_PRX2 = process.env.USE_MAILTESTER_PRX2 !== 'false'; // default true
const PRX2_CID = uuidv4(); // Static per service boot, never rotate
const PRX2_HEADERS = {
  'Origin': 'https://mailtester.ninja',
  'Referer': 'https://mailtester.ninja/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

// ============================================================
// RATE LIMITER: Token Bucket (2 req/sec, burst 3)
// ============================================================
const RATE_LIMIT = {
  tokensPerSecond: 2,
  maxBurst: 3,
  tokens: 3,
  lastRefill: Date.now(),
};

function refillTokenBucket() {
  const now = Date.now();
  const elapsed = (now - RATE_LIMIT.lastRefill) / 1000;
  RATE_LIMIT.tokens = Math.min(
    RATE_LIMIT.maxBurst,
    RATE_LIMIT.tokens + elapsed * RATE_LIMIT.tokensPerSecond
  );
  RATE_LIMIT.lastRefill = now;
}

function tryAcquireToken() {
  refillTokenBucket();
  if (RATE_LIMIT.tokens >= 1) {
    RATE_LIMIT.tokens -= 1;
    return true;
  }
  return false;
}

// ============================================================
// WORKER POOL QUEUES: Interactive (parallel) vs Bulk (sequential)
// ============================================================
const INTERACTIVE_CONCURRENCY = 5;  // Matches parallel permutations
const BULK_CONCURRENCY = 3;         // 3 jobs in flight, still rate-limited to 2 req/sec

const queues = {
  interactive: { items: [], activeWorkers: 0 },
  bulk: { items: [], activeWorkers: 0 },
};

// In-flight dedupe: prevents duplicate PRX2 calls for same email
const inFlightRequests = new Map(); // email -> Promise

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wrap a promise with a timeout for per-contact verification
 * @param {Promise} promise - The async operation to timeout
 * @param {number} ms - Timeout in milliseconds
 * @returns {Promise} - Resolves with result or timeout flag
 */
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise(resolve =>
      setTimeout(() => resolve({ timeout: true }), ms)
    )
  ]);
}

/**
 * Track domain performance stats for adaptive timeout
 * Map: domain -> { totalMs, count, failures }
 */
const domainStats = new Map();
const STATS_DECAY_INTERVAL = 10 * 60 * 1000; // 10 minutes
const SLOW_DOMAIN_THRESHOLD_MS = 15000; // 15s average = slow (lowered to catch issues faster)
const SLOW_DOMAIN_TIMEOUT_MS = 12000; // Timeout slow domains at 12s (relay 7s + PRX2 fallback 5s)
const NORMAL_DOMAIN_TIMEOUT_MS = 20000; // Normal domains get 20s (reduced from 30s for faster batches)

// Decay stats every 10 minutes to prevent stale data
setInterval(() => {
  domainStats.clear();
}, STATS_DECAY_INTERVAL);

/**
 * Get adaptive timeout for a domain based on historical performance
 * @param {string} domain
 * @returns {number} Timeout in milliseconds (12s for slow domains, 20s otherwise)
 */
function getAdaptiveTimeout(domain) {
  const stats = domainStats.get(domain);
  if (!stats) return NORMAL_DOMAIN_TIMEOUT_MS; // Default 20s

  const avgMs = stats.totalMs / stats.count;
  const isSlow = avgMs > SLOW_DOMAIN_THRESHOLD_MS || stats.failures > 2;

  return isSlow ? SLOW_DOMAIN_TIMEOUT_MS : NORMAL_DOMAIN_TIMEOUT_MS;
}

/**
 * Record domain performance for adaptive timeout adjustment
 * @param {string} domain
 * @param {number} durationMs
 * @param {boolean} failed
 */
function recordDomainPerformance(domain, durationMs, failed = false) {
  const stats = domainStats.get(domain) || { totalMs: 0, count: 0, failures: 0 };
  stats.totalMs += durationMs;
  stats.count += 1;
  if (failed) stats.failures += 1;
  domainStats.set(domain, stats);
}

/**
 * Enqueue a task for processing (no hard timeout - caller handles deadline)
 * @param {string} userId - User ID for fairness
 * @param {Function} task - Async task to execute
 * @param {string} queueType - 'interactive' or 'bulk'
 * @returns {Promise} - Resolves with task result
 */
function enqueue(userId, task, queueType = 'interactive') {
  return new Promise((resolve, reject) => {
    const queue = queues[queueType] || queues.interactive;
    const concurrency = queueType === 'bulk' ? BULK_CONCURRENCY : INTERACTIVE_CONCURRENCY;

    queue.items.push({
      id: uuidv4(),
      userId,
      task,
      resolve,
      reject,
      timestamp: Date.now(),
    });

    processWorkerPool(queueType, concurrency);
  });
}

/**
 * Enqueue with in-flight dedupe (for email verification)
 * Same email requested multiple times concurrently = single PRX2 call
 */
function enqueueWithDedupe(email, userId, task, queueType = 'interactive') {
  const key = email.toLowerCase();

  // If already in-flight, piggyback on existing request
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key);
  }

  // Create new request and track it
  const promise = enqueue(userId, task, queueType)
    .finally(() => {
      // Clean up after completion
      inFlightRequests.delete(key);
    });

  inFlightRequests.set(key, promise);
  return promise;
}

async function processWorkerPool(queueType, concurrency) {
  const queue = queues[queueType];

  // Spin up workers up to concurrency limit
  while (queue.activeWorkers < concurrency && queue.items.length > 0) {
    // Wait for rate limit token
    while (!tryAcquireToken()) {
      await sleep(50);
    }

    // Sort by userId for fairness, then by timestamp
    queue.items.sort((a, b) => {
      if (a.userId < b.userId) return -1;
      if (a.userId > b.userId) return 1;
      return a.timestamp - b.timestamp;
    });

    const request = queue.items.shift();
    if (!request) break;

    queue.activeWorkers++;

    // Start worker (don't await - run in parallel)
    (async () => {
      try {
        const result = await request.task();
        request.resolve(result);
      } catch (err) {
        request.resolve({ verdict: 'UNKNOWN', reason: 'task_error', error: err.message });
      } finally {
        queue.activeWorkers--;
        // Continue processing if more items
        if (queue.items.length > 0) {
          processWorkerPool(queueType, concurrency);
        }
      }
    })();
  }
}

/**
 * Wrap a promise with a deadline (soft timeout at route layer)
 * Does NOT resolve to RISKY - returns service_busy for retryability
 */
function withDeadline(promise, deadlineMs, context = '') {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(() => {
        resolve({ verdict: 'SERVICE_BUSY', reason: 'deadline_exceeded', context });
      }, deadlineMs);
    }),
  ]);
}

// ============================================================
// DEGRADATION MODE: Self-regulating based on observed failure
// ============================================================
const METRICS = {
  window: [], // Last 60 seconds of results
  WINDOW_SIZE: 60000,
};

function recordMetric(type) {
  const now = Date.now();
  METRICS.window.push({ type, timestamp: now });
  // Prune old entries
  METRICS.window = METRICS.window.filter(m => now - m.timestamp < METRICS.WINDOW_SIZE);
}

function getMode() {
  const now = Date.now();
  const recent = METRICS.window.filter(m => now - m.timestamp < METRICS.WINDOW_SIZE);

  if (recent.length < 5) return 'NORMAL'; // Not enough data

  const total = recent.length;
  const failures = recent.filter(m => m.type === 'mb' || m.type === 'timeout' || m.type === 'error').length;
  const failureRate = failures / total;

  if (failureRate > 0.9) return 'RESTRICTED';
  if (failureRate > 0.7) return 'DEGRADED';
  return 'NORMAL';
}


// ============================================================
// PRX2 VERIFICATION (Primary - higher limits)
// ============================================================

async function verifyWithPrx2Direct(email) {
  if (MAILTESTER_API_KEYS.length === 0 || !USE_MAILTESTER_PRX2) {
    console.log(`[PRX2] Skipped: keys=${MAILTESTER_API_KEYS.length}, enabled=${USE_MAILTESTER_PRX2}`);
    return null;
  }

  try {
    const apiKey = getNextMailtesterKey();
    const url = `https://prx2.mailtester.ninja/ninja?email=${encodeURIComponent(email)}&key=${apiKey}&cid=${PRX2_CID}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: PRX2_HEADERS
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log(`[PRX2] ${email} - HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log(`[PRX2] ${email} - code=${data?.code}`);
    if (!data || typeof data.code === 'undefined') return null;

    if (data.code === 'ok') {
      recordMetric('ok');
      return { verdict: 'VALID', raw: data };
    } else if (data.code === 'ko') {
      recordMetric('ko');
      return { verdict: 'INVALID', raw: data };
    } else {
      // mb (catch-all/accept-all) — check if provider blocks SMTP by design
      recordMetric('mb');
      const domain = email.split('@')[1];
      const mx = await getMxProvider(domain);
      if (mx.smtpBlocking) {
        console.log(`[PRX2] ${email} - code=${data.code} BUT ${mx.provider} blocks SMTP → upgrading to VALID`);
        return { verdict: 'VALID', mxUpgrade: true, mxProvider: mx.provider, raw: data };
      }
      return { verdict: 'RISKY', catchAll: true, raw: data };
    }
  } catch (err) {
    console.log(`[PRX2] ${email} - error: ${err.message}`);
    return null;
  }
}

// ============================================================
// DOCUMENTED API VERIFICATION (Fallback)
// ============================================================


async function verifyWithDocumentedApiDirect(email, retryCount = 0) {
  // Use API key directly (not token)
  if (MAILTESTER_API_KEYS.length === 0) {
    return null;
  }

  const backoffDelays = [200, 400, 800];

  try {
    const apiKey = getNextMailtesterKey();
    const url = `https://happy.mailtester.ninja/ninja?email=${encodeURIComponent(email)}&key=${apiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    // Handle rate limit (429)
    if (response.status === 429) {
      recordMetric('limited');
      if (retryCount < 2) {
        await sleep(backoffDelays[retryCount]);
        return verifyWithDocumentedApiDirect(email, retryCount + 1);
      }
      return null;
    }

    const data = await response.json();

    // Handle invalid/disabled key - retry once
    if (data.code === '--' || data.message === 'Invalid Token' || data.message === 'Disabled Key') {
      if (retryCount === 0) {
        await sleep(200);
        return verifyWithDocumentedApiDirect(email, 1);
      }
      recordMetric('error');
      return null;
    }

    // Handle "Limited" message
    if (data.message === 'Limited') {
      recordMetric('limited');
      if (retryCount < 2) {
        await sleep(backoffDelays[retryCount]);
        return verifyWithDocumentedApiDirect(email, retryCount + 1);
      }
      return null;
    }

    // Map response to verdicts
    if (data.code === 'ok') {
      recordMetric('ok');
      return { verdict: 'VALID', raw: data };
    } else if (data.code === 'ko') {
      recordMetric('ko');
      return { verdict: 'INVALID', raw: data };
    } else {
      // mb (catch-all/accept-all) — check if provider blocks SMTP by design
      recordMetric('mb');
      const domain = email.split('@')[1];
      const mx = await getMxProvider(domain);
      if (mx.smtpBlocking) {
        console.log(`[DocAPI] ${email} - code=${data.code} BUT ${mx.provider} blocks SMTP → upgrading to VALID`);
        return { verdict: 'VALID', mxUpgrade: true, mxProvider: mx.provider, raw: data };
      }
      return { verdict: 'RISKY', catchAll: true, raw: data };
    }
  } catch (err) {
    recordMetric('timeout');
    // Retry once on timeout
    if (retryCount < 2 && err.name === 'AbortError') {
      await sleep(backoffDelays[retryCount]);
      return verifyWithDocumentedApiDirect(email, retryCount + 1);
    }
    return null;
  }
}

// ============================================================
// CATCH-ALL DETECTION & BEST GUESS
// ============================================================

/**
 * Detect if domain is catch-all by sending gibberish email
 * If accepted = catch-all, we can return best-guess pattern as VALID
 */
async function detectCatchAll(domain) {
  const gibberish = `xq7km9z3test${Date.now()}@${domain}`;
  const result = await verifyWithMailtesterDirect(gibberish);

  if (!result) return { isCatchAll: false, error: true };

  // If gibberish is accepted (VALID) = catch-all domain
  if (result.verdict === 'VALID') {
    return { isCatchAll: true };
  }

  // If rejected (INVALID) = normal domain, verification works
  return { isCatchAll: false };
}

/**
 * Get best-guess email pattern for catch-all domains
 * Ordered by probability in the wild
 */
function getBestGuessEmail(firstName, lastName, domain) {
  const f = (firstName || '').toLowerCase().trim().split(' ')[0]; // First word only
  const l = (lastName || '').toLowerCase().trim().split(' ')[0];  // First word only

  if (!f || !l) return null;

  // Most common patterns in order of probability
  const patterns = [
    `${f}@${domain}`,           // 60% - firstname@
    `${f}.${l}@${domain}`,      // 20% - firstname.lastname@
    `${f[0]}${l}@${domain}`,    // 10% - firstinitiallastname@
    `${f}${l}@${domain}`,       // 5%  - firstnamelastname@
    `${f[0]}.${l}@${domain}`,   // 5%  - firstinitial.lastname@
  ];

  return patterns[0]; // Return most likely (firstname@)
}

// ============================================================
// UNIFIED VERIFY: PRX2 primary, documented API fallback
// ============================================================

async function verifyWithMailtesterDirect(email, retryCount = 0) {
  // Try PRX2 first (if enabled)
  if (USE_MAILTESTER_PRX2) {
    const prx2Result = await verifyWithPrx2Direct(email);
    if (prx2Result !== null) {
      return prx2Result;
    }
    // PRX2 failed - fallback silently to documented API
  }

  // Fallback to documented API
  return verifyWithDocumentedApiDirect(email, retryCount);
}

// ============================================================
// QUEUED VERIFICATION (User-facing - never fails visibly)
// ============================================================

async function verifyWithMailtester(email, userId = 'system', queueType = 'interactive') {
  const mode = getMode();

  // RESTRICTED mode: No API calls, return UNKNOWN
  if (mode === 'RESTRICTED') {
    return { verdict: 'UNKNOWN', reason: 'degraded' };
  }

  // Queue with in-flight dedupe - same email = single PRX2 call
  return enqueueWithDedupe(email, userId, () => verifyWithMailtesterDirect(email), queueType);
}

// ============================================================
// MAILTESTER NATIVE FIND (Fallback after permutations fail)
// ============================================================

async function findWithMailtesterDirect(firstName, lastName, domain, retryCount = 0) {
  // Use API key directly (not token)
  // NOTE: FIND endpoint may not be available on all plans (returns 403)
  if (MAILTESTER_API_KEYS.length === 0) {
    return null;
  }

  const backoffDelays = [200, 400, 800];

  try {
    const apiKey = getNextMailtesterKey();
    const url = `https://happy.mailtester.ninja/find?first=${encodeURIComponent(firstName)}&last=${encodeURIComponent(lastName)}&domain=${encodeURIComponent(domain)}&key=${apiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    // Handle rate limit (429)
    if (response.status === 429) {
      recordMetric('limited');
      if (retryCount < 2) {
        await sleep(backoffDelays[retryCount]);
        return findWithMailtesterDirect(firstName, lastName, domain, retryCount + 1);
      }
      return null;
    }

    const data = await response.json();
    console.log(`[MailTester FIND] Response for ${firstName} ${lastName} @ ${domain}:`, JSON.stringify(data));

    // Handle invalid/disabled key - retry once
    if (data.code === '--' || data.message === 'Invalid Token' || data.message === 'Disabled Key') {
      if (retryCount === 0) {
        await sleep(200);
        return findWithMailtesterDirect(firstName, lastName, domain, 1);
      }
      recordMetric('error');
      return null;
    }

    // Handle "Limited" message
    if (data.message === 'Limited') {
      recordMetric('limited');
      if (retryCount < 2) {
        await sleep(backoffDelays[retryCount]);
        return findWithMailtesterDirect(firstName, lastName, domain, retryCount + 1);
      }
      return null;
    }

    // Return email if found
    if (data.email) {
      return data.email;
    }

    return null;
  } catch (err) {
    recordMetric('timeout');
    if (retryCount < 2 && err.name === 'AbortError') {
      await sleep(backoffDelays[retryCount]);
      return findWithMailtesterDirect(firstName, lastName, domain, retryCount + 1);
    }
    return null;
  }
}

async function findWithMailtester(firstName, lastName, domain, userId = 'system') {
  const mode = getMode();

  // RESTRICTED mode: No API calls
  if (mode === 'RESTRICTED') {
    return null;
  }

  // Queue the request for fair processing
  return enqueue(userId, () => findWithMailtesterDirect(firstName, lastName, domain));
}

// ============================================================
// CACHE WITH TTLs (SAFE 7d, BLOCKED 30d, RISKY never)
// ============================================================

function getCachedVerdict(email) {
  const cached = db.prepare(`
    SELECT verdict, created_at FROM verify_cache WHERE email = ?
  `).get(email.toLowerCase());

  if (!cached) return null;

  const age = Date.now() - new Date(cached.created_at).getTime();
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

  // SAFE: 7 days TTL
  if (cached.verdict === 'SAFE' && age < SEVEN_DAYS) {
    return cached.verdict;
  }
  // BLOCKED: 30 days TTL
  if (cached.verdict === 'BLOCKED' && age < THIRTY_DAYS) {
    return cached.verdict;
  }
  // RISKY: never cached (always re-verify)

  return null;
}

function cacheVerdict(email, verdict) {
  // RISKY is never cached
  if (verdict === 'RISKY') return;

  db.prepare(`
    INSERT OR REPLACE INTO verify_cache (email, verdict, created_at)
    VALUES (?, ?, ?)
  `).run(email.toLowerCase(), verdict, new Date().toISOString());
}

// ============================================================
// DOMAIN CACHE: Catch-all detection
// ============================================================

// Create domain_stats table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS domain_stats (
    domain TEXT PRIMARY KEY,
    ok_count INTEGER DEFAULT 0,
    ko_count INTEGER DEFAULT 0,
    mb_count INTEGER DEFAULT 0,
    updated_at TEXT
  );

  -- Markets daily usage tracking (5000 leads/day cap)
  CREATE TABLE IF NOT EXISTS markets_usage (
    api_key TEXT NOT NULL,
    search_date TEXT NOT NULL,
    leads_fetched INTEGER DEFAULT 0,
    PRIMARY KEY (api_key, search_date)
  );

  -- Markets pack performance logging (for reply-rate ranking)
  CREATE TABLE IF NOT EXISTS markets_pack_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query_hash TEXT NOT NULL,
    pack_name TEXT NOT NULL,
    leads_returned INTEGER DEFAULT 0,
    unique_added INTEGER DEFAULT 0,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Markets query cache (24h TTL)
  CREATE TABLE IF NOT EXISTS markets_query_cache (
    query_hash TEXT PRIMARY KEY,
    response_json TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Catch-all confidence probe results (7-day TTL)
  CREATE TABLE IF NOT EXISTS catchall_confidence (
    email TEXT PRIMARY KEY,
    confidence INTEGER NOT NULL,
    signals TEXT NOT NULL,
    should_upgrade INTEGER NOT NULL,
    probes TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

function updateDomainStats(email, code) {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return;

  const existing = db.prepare(`SELECT * FROM domain_stats WHERE domain = ?`).get(domain);

  if (existing) {
    const field = code === 'ok' ? 'ok_count' : code === 'ko' ? 'ko_count' : 'mb_count';
    db.prepare(`UPDATE domain_stats SET ${field} = ${field} + 1, updated_at = ? WHERE domain = ?`)
      .run(new Date().toISOString(), domain);
  } else {
    const ok = code === 'ok' ? 1 : 0;
    const ko = code === 'ko' ? 1 : 0;
    const mb = (code !== 'ok' && code !== 'ko') ? 1 : 0;
    db.prepare(`INSERT INTO domain_stats (domain, ok_count, ko_count, mb_count, updated_at) VALUES (?, ?, ?, ?, ?)`)
      .run(domain, ok, ko, mb, new Date().toISOString());
  }
}

function isDomainCatchAll(domain) {
  const stats = db.prepare(`SELECT * FROM domain_stats WHERE domain = ?`).get(domain.toLowerCase());
  if (!stats) return false;

  // Catch-all: 3+ mb responses, 0 ok, 0 ko
  return stats.mb_count >= 3 && stats.ok_count === 0 && stats.ko_count === 0;
}

// ============================================================
// CATCH-ALL CONFIDENCE CACHE (7-day TTL)
// ============================================================

function getCachedConfidence(email) {
  try {
    const row = db.prepare(
      `SELECT * FROM catchall_confidence WHERE email = ?`
    ).get(email.toLowerCase());
    if (!row) return null;
    const age = Date.now() - new Date(row.created_at).getTime();
    if (age > 7 * 24 * 60 * 60 * 1000) return null;
    return {
      confidence: row.confidence,
      signals: JSON.parse(row.signals),
      shouldUpgrade: row.should_upgrade === 1,
      probes: JSON.parse(row.probes),
    };
  } catch (_) { return null; }
}

function cacheConfidence(email, conf) {
  try {
    db.prepare(`
      INSERT OR REPLACE INTO catchall_confidence (email, confidence, signals, should_upgrade, probes, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      email.toLowerCase(),
      conf.confidence,
      JSON.stringify(conf.signals),
      conf.shouldUpgrade ? 1 : 0,
      JSON.stringify(conf.probes),
      new Date().toISOString()
    );
  } catch (_) { /* non-critical */ }
}

// ============================================================
// DNS INTELLIGENCE MODULES
// ============================================================
const { getMxProvider, getCacheStats: getDnsCacheStats, clearAllCaches: clearDnsCaches } = require('./dnsIntel');
const { resolveMailboxProvider } = require('./providerIntel');
const { reorderPermutations } = require('./permutationPriority');
const { probeCatchAllConfidence } = require('./catchAllConfidence');
const { verifyInboxSMTP, detectCatchAllSMTP, getMxHost } = require('./smtpVerifier');

// ============================================================
// MAIN VERIFY FUNCTION
// ============================================================

async function verifyEmail(email, userId = 'system', queueType = 'interactive') {
  const emailLower = email.toLowerCase();
  const domain = emailLower.split('@')[1];

  // Check verify_cache first (respects TTLs)
  const cachedVerdict = getCachedVerdict(emailLower);
  if (cachedVerdict) {
    return { verdict: cachedVerdict, cached: true };
  }

  // Also check email_cache (from FIND results)
  // Only trust VALID — RISKY falls through to catch-all confidence probing
  const emailCached = db.prepare(`
    SELECT email, verdict, created_at FROM email_cache WHERE email = ?
  `).get(emailLower);
  if (emailCached && emailCached.verdict === 'VALID') {
    const age = Date.now() - new Date(emailCached.created_at).getTime();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    if (age < SEVEN_DAYS) {
      return { verdict: emailCached.verdict, cached: true };
    }
  }

  // Check if domain is known catch-all — run confidence probes before returning RISKY
  if (domain && isDomainCatchAll(domain)) {
    // Check confidence cache first
    const cachedConf = getCachedConfidence(emailLower);
    if (cachedConf) {
      const verdict = cachedConf.shouldUpgrade ? 'VALID' : 'RISKY';
      return { verdict, reason: 'catch_all_domain', catchAll: true, cached: true,
        confidence: cachedConf.confidence, signals: cachedConf.signals, catchAllUpgrade: cachedConf.shouldUpgrade };
    }

    // Run confidence probes
    const mx = await getMxProvider(domain);
    const conf = await probeCatchAllConfidence(emailLower, domain, mx.provider, db);
    cacheConfidence(emailLower, conf);

    const verdict = conf.shouldUpgrade ? 'VALID' : 'RISKY';
    if (conf.shouldUpgrade) {
      cacheVerdict(emailLower, 'VALID');
    }
    return { verdict, reason: 'catch_all_domain', catchAll: true, cached: false,
      confidence: conf.confidence, signals: conf.signals, catchAllUpgrade: conf.shouldUpgrade };
  }

  // Blocked patterns (skip API call)
  const blockedPatterns = [
    /^test@/, /^fake@/, /^noreply@/, /^no-reply@/,
    /^admin@/, /^info@/, /^support@/, /^sales@/,
    /^hello@/, /^contact@/, /^help@/,
    /@example\.com$/, /@test\.com$/, /@localhost$/,
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(emailLower)) {
      cacheVerdict(emailLower, 'INVALID');
      return { verdict: 'INVALID', cached: false };
    }
  }

  // ── SMTP PRE-STEP: Direct RCPT TO verification (free, zero API cost) ──
  // Runs before PRX2 fallback. Definitive answers skip PRX2 entirely.
  try {
    await domainThrottle(emailLower); // Per-domain rate limit — prevent MX greylisting
    const smtpResult = await verifyInboxSMTP(emailLower);
    console.log(`[Verify] SMTP pre-step: ${emailLower} → ${smtpResult.result} (code=${smtpResult.code}) ${smtpResult.ms}ms`);

    if (smtpResult.result === 'deliverable') {
      // SMTP says inbox exists — but check if domain is catch-all first
      const catchAllCheck = await detectCatchAllSMTP(domain);
      if (catchAllCheck.isCatchAll) {
        // Domain accepts everything — run confidence probes
        console.log(`[Verify] SMTP catch-all detected for ${domain}, running confidence probes`);
        const mx = await getMxProvider(domain);
        const conf = await probeCatchAllConfidence(emailLower, domain, mx.provider, db);
        cacheConfidence(emailLower, conf);

        // Mark domain as catch-all via domain_stats mb_count (catch-all indicator)
        try {
          const existing = db.prepare(`SELECT * FROM domain_stats WHERE domain = ?`).get(domain);
          if (existing) {
            db.prepare(`UPDATE domain_stats SET mb_count = mb_count + 100, updated_at = datetime('now') WHERE domain = ?`).run(domain);
          } else {
            db.prepare(`INSERT INTO domain_stats (domain, ok_count, ko_count, mb_count, updated_at) VALUES (?, 0, 0, 100, datetime('now'))`).run(domain);
          }
        } catch (_) {}

        if (conf.shouldUpgrade) {
          cacheVerdict(emailLower, 'VALID');
          return { verdict: 'VALID', catchAll: true, cached: false,
            confidence: conf.confidence, signals: conf.signals, catchAllUpgrade: true,
            smtpDirect: true };
        }
        return { verdict: 'RISKY', catchAll: true, cached: false,
          confidence: conf.confidence, signals: conf.signals,
          smtpDirect: true };
      }

      // Not catch-all — SMTP deliverable is definitive
      cacheVerdict(emailLower, 'VALID');
      return { verdict: 'VALID', cached: false, smtpDirect: true };
    }

    if (smtpResult.result === 'undeliverable') {
      // SMTP says inbox doesn't exist — definitive rejection
      cacheVerdict(emailLower, 'INVALID');
      return { verdict: 'INVALID', cached: false, smtpDirect: true,
        smtpCode: smtpResult.code, smtpMessage: smtpResult.message };
    }

    // smtpResult.result === 'unknown' — fall through to PRX2
    console.log(`[Verify] SMTP inconclusive for ${emailLower} (${smtpResult.message}), falling back to PRX2`);
  } catch (smtpErr) {
    console.log(`[Verify] SMTP pre-step error for ${emailLower}: ${smtpErr.message}, falling back to PRX2`);
  }

  // Call MailTester (queued, rate-limited, retried) — PRX2 fallback
  const result = await verifyWithMailtester(emailLower, userId, queueType);

  if (result && result.verdict) {
    // Update domain stats for catch-all detection
    if (result.raw?.code) {
      updateDomainStats(emailLower, result.raw.code);
    }

    // Catch-all confidence probing: intercept RISKY + catchAll before caching
    if (result.verdict === 'RISKY' && result.catchAll) {
      const mx = await getMxProvider(domain);
      const conf = await probeCatchAllConfidence(emailLower, domain, mx.provider, db);
      cacheConfidence(emailLower, conf);

      if (conf.shouldUpgrade) {
        cacheVerdict(emailLower, 'VALID');
        return { verdict: 'VALID', catchAll: true, cached: false,
          confidence: conf.confidence, signals: conf.signals, catchAllUpgrade: true };
      }
      // Stay RISKY but attach confidence data
      return { verdict: 'RISKY', catchAll: true, cached: false,
        confidence: conf.confidence, signals: conf.signals };
    }

    // Cache VALID, RISKY, and INVALID (not UNKNOWN, not SERVICE_BUSY)
    if (result.verdict === 'VALID' || result.verdict === 'RISKY' || result.verdict === 'INVALID') {
      cacheVerdict(emailLower, result.verdict);
    }
    return { verdict: result.verdict, catchAll: result.catchAll || false, cached: false };
  }

  // Infra failure: return UNKNOWN, don't cache, don't charge
  return { verdict: 'UNKNOWN', reason: 'verification_unavailable', cached: false };
}

// ============================================================
// API KEY ENDPOINTS
// ============================================================

/**
 * POST /api/keys/generate
 * Creates a new API key (one per user)
 * If active key exists, rotates automatically (revoke old + create new)
 */
app.post('/api/keys/generate', (req, res) => {
  const userId = req.headers['x-user-id'];
  const userEmail = req.headers['x-user-email'];

  // Structured logging for diagnosis
  console.log(`[Keys:Generate] Request: user_id=${userId || 'MISSING'}, user_email=${userEmail || 'MISSING'}`);

  if (!userId || !userEmail) {
    console.log(`[Keys:Generate] FAILED: Missing headers - user_id=${!!userId}, user_email=${!!userEmail}`);
    return res.status(400).json({ success: false, error: 'Missing user headers' });
  }

  // Delete ALL existing keys for this user (clean slate on generate)
  // Usage records intentionally preserved — rotation changes the credential, not the billing
  const deleted = db.prepare(`DELETE FROM api_keys WHERE user_id = ?`).run(userId);
  const rotated = deleted.changes > 0;
  if (rotated) {
    console.log(`[Keys] Rotated: deleted ${deleted.changes} old key(s) for ${userEmail} (usage preserved)`);
  }

  // Generate new key
  const key = generateApiKey();
  const keyHash = hashKey(key);
  const keyId = uuidv4();
  const keyPrefix = key.slice(0, 12) + '...';

  db.prepare(`
    INSERT INTO api_keys (id, user_id, user_email, key_hash, key_prefix, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?)
  `).run(keyId, userId, userEmail, keyHash, keyPrefix, new Date().toISOString());

  // Initialize usage for this period
  getOrCreateUsage(userId, keyId);

  console.log(`[Keys:Generate] SUCCESS: user_id=${userId}, user_email=${userEmail}, key_prefix=${keyPrefix}, rotated=${rotated}`);

  res.json({
    success: true,
    key_id: keyId,
    key: key,
    key_prefix: keyPrefix,
    created_at: new Date().toISOString(),
    rotated,
  });
});

/**
 * GET /api/keys/active
 * Returns active key metadata (NOT the key value)
 */
app.get('/api/keys/active', (req, res) => {
  const userId = req.headers['x-user-id'];

  if (!userId) {
    return res.status(400).json({ success: false, error: 'Missing user headers' });
  }

  const key = db.prepare(`
    SELECT id, key_prefix, status, created_at, last_used_at
    FROM api_keys
    WHERE user_id = ? AND status = 'active'
  `).get(userId);

  if (!key) {
    return res.json({ success: true, key: null });
  }

  res.json({
    success: true,
    key: {
      key_id: key.id,
      key_prefix: key.key_prefix,
      status: key.status,
      name: 'Default',
      created_at: key.created_at,
      last_used_at: key.last_used_at,
    },
  });
});

/**
 * DELETE /api/keys/:id
 * Revokes an API key
 */
app.delete('/api/keys/:id', (req, res) => {
  const userId = req.headers['x-user-id'];
  const keyId = req.params.id;

  if (!userId) {
    return res.status(400).json({ success: false, error: 'Missing user headers' });
  }

  const key = db.prepare(`
    SELECT * FROM api_keys WHERE id = ? AND user_id = ?
  `).get(keyId, userId);

  if (!key) {
    return res.status(404).json({ success: false, error: 'Key not found' });
  }

  db.prepare(`UPDATE api_keys SET status = 'revoked' WHERE id = ?`).run(keyId);

  console.log(`[Keys] Revoked key ${keyId}`);

  res.json({ success: true });
});

// ============================================================
// QUOTA ENDPOINT
// ============================================================

/**
 * GET /api/email/v2/quota
 * Returns current token usage
 */
app.get('/api/email/v2/quota', (req, res) => {
  const apiKey = verifyApiKey(req.headers['authorization']);
  const userId = req.headers['x-user-id'];

  // Allow quota check via API key OR user headers (for when key not in localStorage)
  if (!apiKey && !userId) {
    return res.status(401).json({ success: false, error: 'Missing authentication' });
  }

  const effectiveUserId = apiKey ? apiKey.user_id : userId;
  const usage = getOrCreateUsage(effectiveUserId, apiKey?.id || '');
  const MONTHLY_LIMIT = 10000;

  res.json({
    success: true,
    quota: {
      limit: MONTHLY_LIMIT,
      used: usage.tokens_used,
      remaining: MONTHLY_LIMIT - usage.tokens_used,
      percentage_used: Math.round((usage.tokens_used / MONTHLY_LIMIT) * 100),
      breakdown: {
        find_calls: 0, // Would track separately
        verify_calls: 0,
        bulk_find_rows: 0,
        bulk_verify_rows: 0,
        cached_hits: 0,
        tokens_saved_by_cache: 0,
      },
    },
  });
});

// ============================================================
// EMAIL FIND ENDPOINT
// ============================================================

/**
 * POST /api/email/v2/find
 * Find email for a person at a company
 *
 * Contract:
 * - FOUND → email (charged 1 token)
 * - NOT_FOUND → null (no charge)
 *
 * Degradation behavior:
 * - NORMAL: Try all permutations
 * - DEGRADED: Try rank-1 only
 * - RESTRICTED: Return NOT_FOUND immediately (no API calls)
 */
app.post('/api/email/v2/find', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const apiKey = verifyApiKey(authHeader);
  const userId = req.headers['x-user-id'];

  // Allow API key OR user headers (for UI usage without stored key)
  if (!apiKey && !userId) {
    // Diagnostic error message for automation users
    const hasAuthHeader = !!authHeader;
    const authFormat = hasAuthHeader ? (authHeader.startsWith('Bearer ') ? 'Bearer format OK' : 'Missing "Bearer " prefix') : 'No Authorization header';
    console.log(`[Auth] 401 on /find: auth=${authFormat}, x-user-id=${!!userId}`);
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Set header: Authorization: Bearer YOUR_API_KEY',
      hint: hasAuthHeader && !authHeader.startsWith('Bearer ') ? 'Header must start with "Bearer " (with space)' : undefined
    });
  }

  const effectiveUserId = apiKey ? apiKey.user_id : userId;
  const effectiveKeyId = apiKey ? apiKey.id : '';

  const { firstName, lastName, domain: rawDomain } = req.body;

  if (!firstName || !lastName) {
    return res.status(400).json({ success: false, error: 'firstName and lastName required' });
  }

  if (!rawDomain) {
    return res.status(400).json({ success: false, error: 'domain required' });
  }

  // Clean domain: strip protocol, www, trailing slashes
  // "https://www.converge-bio.com/" → "converge-bio.com"
  const domain = rawDomain
    .replace(/^https?:\/\//, '')  // Remove http:// or https://
    .replace(/^www\./, '')         // Remove www.
    .replace(/\/.*$/, '')          // Remove path and trailing slash
    .toLowerCase()
    .trim();

  if (!domain || !domain.includes('.')) {
    return res.status(400).json({ success: false, error: 'Invalid domain format' });
  }

  console.log(`[Find] Domain cleaned: "${rawDomain}" → "${domain}"`);

  // Check cache first (with TTL)
  const cached = db.prepare(`
    SELECT email, verdict, created_at FROM email_cache
    WHERE domain = ? AND first_name = ? AND last_name = ?
  `).get(domain.toLowerCase(), firstName.toLowerCase(), lastName.toLowerCase());

  if (cached && cached.email) {
    // Check TTL (7 days for SAFE results)
    const age = Date.now() - new Date(cached.created_at).getTime();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    if (age < SEVEN_DAYS) {
      // Get provider info for cached results
      const mx = await getMxProvider(domain);
      const hostedAt = mx.provider || 'Custom';
      return res.json({ email: cached.email, status: (cached.verdict || 'valid').toLowerCase(), hosted_at: hostedAt });
    }
  }

  // Check if user has enough quota
  const usage = getOrCreateUsage(effectiveUserId, effectiveKeyId);
  const MONTHLY_LIMIT = 10000;
  if (usage.tokens_used >= MONTHLY_LIMIT) {
    return res.status(429).json({ email: null });
  }

  // Check degradation mode
  const mode = getMode();

  // RESTRICTED: No API calls, return NOT_FOUND (no charge)
  if (mode === 'RESTRICTED') {
    const mx = await getMxProvider(domain);
    const hostedAt = mx.provider || 'Custom';
    return res.json({ email: null, hosted_at: hostedAt });
  }

  // Wrap main logic in try-catch to handle ECONNRESET and network errors
  try {

  // Get provider info early (used throughout)
  const cid = effectiveKeyId ? effectiveKeyId.slice(0, 8) : domain.slice(0, 8);
  const providerInfo = await resolveMailboxProvider(domain, cid);
  const hostedAt = providerInfo.provider || 'Custom';

  // Helper to cache and return found email
  const cacheAndReturn = (email, source, isCatchAll = false) => {
    deductTokens(effectiveUserId, effectiveKeyId, 1);

    const verdict = isCatchAll ? 'RISKY' : 'VALID';

    // Cache in email_cache (for find dedup)
    db.prepare(`
      INSERT OR REPLACE INTO email_cache (id, domain, first_name, last_name, email, verdict, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      domain.toLowerCase(),
      firstName.toLowerCase(),
      lastName.toLowerCase(),
      email,
      verdict,
      new Date().toISOString()
    );

    // Also cache in verify_cache
    cacheVerdict(email, verdict);

    // Record pattern for learning (skip catch-all, they're all best-guess)
    if (!isCatchAll) {
      recordDomainPattern(domain, email, firstName, lastName);
    }

    console.log(`[Find] ${verdict} via ${source}: ${email}${isCatchAll ? ' (catch-all)' : ''}`);
    return res.json({ email, status: verdict.toLowerCase(), hosted_at: hostedAt });
  };

  // ============================================================
  // STEP 0a: LEARNED PATTERN (fastest path for repeat domains)
  // ============================================================
  const learnedEmail = getLearnedEmail(domain, firstName, lastName);
  if (learnedEmail) {
    console.log(`[Find] STEP 0a: Trying learned pattern: ${learnedEmail}`);
    const learnedResult = await verifyEmail(learnedEmail, userId);
    if (learnedResult.verdict === 'VALID') {
      return cacheAndReturn(learnedEmail, 'learned-pattern');
    }
    if (learnedResult.verdict === 'RISKY') {
      return cacheAndReturn(learnedEmail, 'learned-pattern', true);
    }
    console.log(`[Find] Learned pattern failed, continuing cascade`);
  }

  // ============================================================
  // DNS INTELLIGENCE (free signals — liveness, provider, SPF, autodiscover)
  // ============================================================
  // Note: providerInfo already fetched earlier in try block

  // DOMAIN LIVENESS: short-circuit dead domains (saves all downstream API calls)
  if (providerInfo.live === false) {
    console.log(`[Find] cid=${cid} domain=${domain} DOMAIN_DEAD — skipping all verification`);
    return res.json({ email: null, hosted_at: hostedAt });
  }

  console.log(`[Find] cid=${cid} provider=${providerInfo.provider} gateway_mx=${providerInfo.gatewayMx || 'none'} evidence=${JSON.stringify(providerInfo.evidence)}`);

  // ============================================================
  // STEP 0b: CATCH-ALL DETECTION (fast path for catch-all domains)
  // ============================================================
  console.log(`[Find] STEP 0b: Catch-all detection for ${domain}`);

  // Skip catch-all test for SMTP-blocking providers (e.g. Google always accepts gibberish)
  if (providerInfo.smtpBlocking) {
    console.log(`[Find] Skipping catch-all test — ${providerInfo.provider} blocks SMTP verification`);
  }

  const catchAllResult = providerInfo.smtpBlocking ? { isCatchAll: false, skipped: true } : await detectCatchAll(domain);

  if (catchAllResult.isCatchAll) {
    // Domain accepts everything - return best-guess pattern as VALID
    const bestGuess = getBestGuessEmail(firstName, lastName, domain);
    if (bestGuess) {
      console.log(`[Find] Catch-all detected! Returning best-guess: ${bestGuess}`);
      return cacheAndReturn(bestGuess, 'catch-all-best-guess', true);
    }
  }

  if (!catchAllResult.error) {
    console.log(`[Find] Not a catch-all domain, proceeding with verification cascade`);
  }

  // ============================================================
  // STEP 1: PARALLEL PERMUTATION ENGINE (top 5, race to VALID)
  // ============================================================
  const FIND_DEADLINE_MS = 12000; // 12 second deadline for entire find operation
  const allPermutations = generateEmailPermutations(firstName, lastName, domain);

  // Provider-aware reorder: try most likely patterns first (same set, different order)
  let reorderedPermutations = reorderPermutations(allPermutations, providerInfo.provider, firstName, lastName);
  if (providerInfo.provider !== 'unknown') {
    console.log(`[Find] cid=${cid} perm_order=${providerInfo.provider}_default top3=${reorderedPermutations.slice(0, 3).join(',')}`);
  }

  // Google dot-equivalence: remove patterns that are the same mailbox as first.last
  // Google ignores dots — saad.belcaid@ and saadbelcaid@ hit the same inbox.
  // Don't waste a top-5 slot on a duplicate. Keep first.last, drop firstlast.
  if (providerInfo.provider === 'google') {
    const dotless = `${firstName.toLowerCase()}${lastName.toLowerCase()}@${domain}`;
    reorderedPermutations = reorderedPermutations.filter(e => e !== dotless);
    console.log(`[Find] Google: removed dot-equivalent ${dotless}`);
  }

  // Take top 5 patterns (or top 3 in degraded mode)
  const PARALLEL_LIMIT = mode === 'DEGRADED' ? 3 : 5;
  const topPermutations = reorderedPermutations.slice(0, PARALLEL_LIMIT);

  console.log(`[Find] STEP 1: Parallel permutation engine - racing ${topPermutations.length} patterns`);
  console.log(`[Find] Patterns: ${topPermutations.join(', ')}`);

  // Track real verdicts vs service_busy
  let hasRealVerdict = false;
  let allServiceBusy = true;

  try {
    // Race top patterns in parallel - first VALID wins
    const validEmail = await Promise.any(
      topPermutations.map(async (email) => {
        const result = await withDeadline(
          verifyEmail(email, userId),
          FIND_DEADLINE_MS,
          email
        );

        // Track if we got a real verdict
        if (result.verdict !== 'SERVICE_BUSY') {
          hasRealVerdict = true;
          allServiceBusy = false;
        }

        if (result.verdict === 'VALID') {
          console.log(`[Find] 🏆 Winner (valid): ${email}`);
          return { email, isCatchAll: false };
        }
        if (result.verdict === 'RISKY') {
          console.log(`[Find] 🏆 Winner (risky/catch-all): ${email}`);
          return { email, isCatchAll: true };
        }
        throw new Error(result.verdict === 'SERVICE_BUSY' ? 'service_busy' : 'not_valid');
      })
    );

    return cacheAndReturn(validEmail.email, 'parallel-permutation', validEmail.isCatchAll);
  } catch (err) {
    // All top patterns failed - check if service was busy
    console.log(`[Find] Top ${PARALLEL_LIMIT} patterns failed, trying remaining...`);
  }

  // Fallback: try remaining permutations sequentially
  const remainingPermutations = reorderedPermutations.slice(PARALLEL_LIMIT);
  for (const email of remainingPermutations) {
    const result = await withDeadline(
      verifyEmail(email, userId),
      FIND_DEADLINE_MS,
      email
    );

    if (result.verdict !== 'SERVICE_BUSY') {
      hasRealVerdict = true;
      allServiceBusy = false;
    }

    if (result.verdict === 'VALID') {
      return cacheAndReturn(email, 'permutation');
    }
    if (result.verdict === 'RISKY') {
      return cacheAndReturn(email, 'permutation', true);
    }
  }
  console.log(`[Find] Permutations: none of ${allPermutations.length} patterns verified`);

  // ============================================================
  // STEP 3: MAILTESTER FIND (last resort)
  // ============================================================
  console.log(`[Find] STEP 3: MailTester FIND for ${firstName} ${lastName} @ ${domain}`);

  const foundEmail = await findWithMailtester(firstName, lastName, domain, userId);

  if (foundEmail) {
    return cacheAndReturn(foundEmail, 'mailtester-find');
  }
  console.log(`[Find] MailTester FIND: no email returned`);

  // ============================================================
  // STEP 4: RESPOND HONESTLY
  // ============================================================
  // Only return no_deliverable_email if we got real verdicts
  // If all attempts hit service_busy, that's retryable - not a definitive "not found"
  if (allServiceBusy && !hasRealVerdict) {
    console.log(`[Find] SERVICE BUSY: All verification attempts timed out`);
    return res.status(503).json({ email: null, hosted_at: hostedAt, reason: 'service_busy' });
  }

  console.log(`[Find] FAILED: No deliverable email for ${firstName} ${lastName} @ ${domain}`);
  return res.status(404).json({ email: null, hosted_at: hostedAt, reason: 'not_found' });

  } catch (err) {
    // Handle ECONNRESET, ETIMEDOUT, and other network errors gracefully
    console.error(`[Find] ERROR: ${err.code || err.message} for ${firstName} ${lastName} @ ${domain}`);
    // Try to get hostedAt for error case
    let errorHostedAt = 'Custom';
    try {
      const mx = await getMxProvider(domain);
      errorHostedAt = mx.provider || 'Custom';
    } catch {}
    return res.status(500).json({ email: null, hosted_at: errorHostedAt, reason: 'error' });
  }
});

// ============================================================
// EMAIL VERIFY ENDPOINT
// ============================================================

/**
 * POST /api/email/v2/verify
 * Verify a single email
 *
 * Contract:
 * - SAFE | BLOCKED → charged 1 token
 * - RISKY (infra failure) → no charge, not cached
 * - Cached → no charge
 */
app.post('/api/email/v2/verify', async (req, res) => {
  const VERIFY_DEADLINE_MS = 8000; // 8 second deadline for single verify
  const authHeader = req.headers['authorization'];
  const apiKey = verifyApiKey(authHeader);
  const userId = req.headers['x-user-id'];

  // Allow API key OR user headers (for UI usage without stored key)
  if (!apiKey && !userId) {
    const hasAuthHeader = !!authHeader;
    const authFormat = hasAuthHeader ? (authHeader.startsWith('Bearer ') ? 'Bearer format OK' : 'Missing "Bearer " prefix') : 'No Authorization header';
    console.log(`[Auth] 401 on /verify: auth=${authFormat}, x-user-id=${!!userId}`);
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Set header: Authorization: Bearer YOUR_API_KEY',
      hint: hasAuthHeader && !authHeader.startsWith('Bearer ') ? 'Header must start with "Bearer " (with space)' : undefined
    });
  }

  const effectiveUserId = apiKey ? apiKey.user_id : userId;
  const effectiveKeyId = apiKey ? apiKey.id : '';

  const { email, emails } = req.body;
  const emailToVerify = email || (emails && emails[0]);

  if (!emailToVerify) {
    return res.status(400).json({ success: false, error: 'email required' });
  }

  const emailLower = emailToVerify.toLowerCase();
  const domain = emailToVerify.split('@')[1] || '';

  // Get provider info
  const mx = await getMxProvider(domain);
  const hostedAt = mx.provider || 'Custom';

  // FAST PATH: Check if email was previously found by FIND (already verified)
  // Only trust VALID verdicts — RISKY/null must go through real verification
  const foundEmail = db.prepare(`
    SELECT email, verdict FROM email_cache WHERE LOWER(email) = ?
  `).get(emailLower);
  if (foundEmail && foundEmail.verdict === 'VALID') {
    console.log(`[Verify] CACHE HIT from email_cache: ${emailLower} (verdict=${foundEmail.verdict})`);
    return res.json({ email: emailToVerify, status: 'valid', hosted_at: hostedAt });
  }

  // Check quota first (don't deduct yet)
  const usage = getOrCreateUsage(effectiveUserId, effectiveKeyId);
  const MONTHLY_LIMIT = 10000;
  if (usage.tokens_used >= MONTHLY_LIMIT) {
    return res.status(429).json({ email: null });
  }

  // Wrap main logic in try-catch to handle ECONNRESET and network errors
  try {
    const result = await withDeadline(
      verifyEmail(emailToVerify, effectiveUserId),
      VERIFY_DEADLINE_MS,
      emailToVerify
    );

    // Handle deadline exceeded - retryable, no charge
    if (result.verdict === 'SERVICE_BUSY') {
      return res.status(503).json({ email: null, hosted_at: hostedAt, reason: 'service_busy' });
    }

    // Token accounting: only charge on VALID, RISKY, or INVALID (not cached, not service_busy)
    if (!result.cached && (result.verdict === 'VALID' || result.verdict === 'RISKY' || result.verdict === 'INVALID')) {
      deductTokens(effectiveUserId, effectiveKeyId, 1);
    }

    // VALID or RISKY = return email with status, anything else = null
    // Include confidence data when available (catch-all probing)
    if (result.verdict === 'VALID') {
      const response = { email: emailToVerify, status: 'valid', hosted_at: hostedAt };
      if (result.confidence !== undefined) {
        response.confidence = result.confidence;
        response.signals = result.signals;
        response.catchAllUpgrade = result.catchAllUpgrade || false;
      }
      if (result.smtpDirect) response.smtpDirect = true;
      res.json(response);
    } else if (result.verdict === 'RISKY') {
      const response = { email: emailToVerify, status: 'risky', hosted_at: hostedAt };
      if (result.confidence !== undefined) {
        response.confidence = result.confidence;
        response.signals = result.signals;
      }
      if (result.smtpDirect) response.smtpDirect = true;
      res.json(response);
    } else {
      return res.status(422).json({ email: emailToVerify, status: 'invalid', hosted_at: hostedAt });
    }
  } catch (err) {
    // Handle ECONNRESET, ETIMEDOUT, and other network errors gracefully
    console.error(`[Verify] ERROR: ${err.code || err.message} for ${emailToVerify}`);
    return res.status(500).json({ email: null, hosted_at: hostedAt, reason: 'error' });
  }
});

// ============================================================
// BULK CONCURRENCY POOL
// ============================================================

const BULK_POOL_SIZE = 5; // 5 parallel verifications — own relay, own rules

/**
 * Run tasks with concurrency limit. Preserves input order in results.
 * @param {Array} items - Input items
 * @param {number} concurrency - Max parallel tasks
 * @param {Function} fn - async (item, index) => result
 * @returns {Promise<Array>} Results in same order as input
 */
async function parallelPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = [];
  for (let w = 0; w < Math.min(concurrency, items.length); w++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

// ============================================================
// BULK ENDPOINTS
// ============================================================

/**
 * POST /api/email/v2/find-bulk
 * Bulk find emails — 5 concurrent verifications
 *
 * Same rules as single find:
 * - FOUND → charged 1 token
 * - NOT_FOUND → no charge
 * - Degradation modes apply
 */
app.post('/api/email/v2/find-bulk', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const apiKey = verifyApiKey(authHeader);
  const userIdHeader = req.headers['x-user-id'];

  // Allow API key OR user headers (same as single endpoints)
  if (!apiKey && !userIdHeader) {
    const hasAuthHeader = !!authHeader;
    const authFormat = hasAuthHeader ? (authHeader.startsWith('Bearer ') ? 'Bearer format OK' : 'Missing "Bearer " prefix') : 'No Authorization header';
    console.log(`[Auth] 401 on /find-bulk: auth=${authFormat}, x-user-id=${!!userIdHeader}`);
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Set header: Authorization: Bearer YOUR_API_KEY',
      hint: hasAuthHeader && !authHeader.startsWith('Bearer ') ? 'Header must start with "Bearer " (with space)' : undefined
    });
  }

  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'items array required' });
  }

  const userId = apiKey ? apiKey.user_id : userIdHeader;
  const keyId = apiKey ? apiKey.id : '';
  const mode = getMode();

  // Check quota BEFORE processing (worst case: 1 token per item)
  const usage = getOrCreateUsage(userId, keyId);
  const MONTHLY_LIMIT = 10000;
  if (usage.tokens_used + items.length > MONTHLY_LIMIT) {
    return res.status(429).json({ success: false, error: 'Quota exceeded' });
  }

  let found = 0;
  let tokensUsed = 0;
  const t0 = Date.now();

  // Process single find-bulk item (called from pool)
  async function processFindItem(item) {
    const { firstName, lastName, domain: rawDomain } = item;

    if (!firstName || !lastName || !rawDomain) {
      return { ...item, success: false, error: 'Missing fields', hosted_at: 'Custom' };
    }

    const domain = rawDomain
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '')
      .toLowerCase()
      .trim();

    if (!domain || !domain.includes('.')) {
      return { ...item, success: false, error: 'Invalid domain format', hosted_at: 'Custom' };
    }

    if (mode === 'RESTRICTED') {
      return { firstName, lastName, domain, success: false, reason: 'no_verifiable_email', hosted_at: 'Custom' };
    }

    // Check cache with TTL
    const cachedResult = db.prepare(`
      SELECT email, verdict, created_at FROM email_cache
      WHERE domain = ? AND first_name = ? AND last_name = ?
    `).get(domain.toLowerCase(), firstName.toLowerCase(), lastName.toLowerCase());

    if (cachedResult && cachedResult.email) {
      const age = Date.now() - new Date(cachedResult.created_at).getTime();
      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
      if (age < SEVEN_DAYS) {
        found++;
        // For cached results, we need to get provider info
        const mx = await getMxProvider(domain);
        const cachedHostedAt = mx.provider || 'Custom';
        return { firstName, lastName, domain, success: true, email: cachedResult.email, verdict: cachedResult.verdict, hosted_at: cachedHostedAt };
      }
    }

    // Generate permutations with provider-aware reorder
    const rawPermutations = generateEmailPermutations(firstName, lastName, domain);
    const bulkProviderInfo = await resolveMailboxProvider(domain, `bulk-${domain.slice(0, 8)}`);

    if (bulkProviderInfo.live === false) {
      return { firstName, lastName, domain, success: false, reason: 'domain_dead', hosted_at: 'Custom' };
    }

    const hostedAt = bulkProviderInfo.provider || 'Custom';

    let permutations = reorderPermutations(rawPermutations, bulkProviderInfo.provider, firstName, lastName);
    if (mode === 'DEGRADED') {
      permutations = permutations.slice(0, 1);
    }

    // Use hedged verification for bulk (relay + PRX2 hedge)
    // CRITICAL: Wrap ENTIRE contact (all permutations) in item budget
    const domainVerifyStart = Date.now();
    const CONTACT_BUDGET_MS = parseInt(process.env.BULK_ITEM_BUDGET_MS || '12000', 10);

    let foundEmail = null;

    // Item budget wrapper - timeout for ENTIRE contact, not per permutation
    const findWithBudget = async () => {
      for (const email of permutations) {
        // PRX2 function wrapper
        const prx2Fn = async () => {
          const result = await verifyWithMailtester(email, userId, 'bulk');
          return result || { verdict: 'UNKNOWN', cached: false };
        };

        // Catch-all probe function wrapper
        const catchAllProbeFn = async (emailAddr, dom) => {
          const mx = await getMxProvider(dom);
          return await probeCatchAllConfidence(emailAddr, dom, mx.provider, db);
        };

        // Use hedged verify instead of direct verifyEmail
        const verifyResult = await hedgedVerify(email, prx2Fn, catchAllProbeFn, 'bulk');

        if (verifyResult.verdict === 'VALID') {
          return email;
        }
      }
      return null;
    };

    // Race: findWithBudget vs timeout
    try {
      foundEmail = await Promise.race([
        findWithBudget(),
        new Promise((resolve) => setTimeout(() => {
          console.log(`[BulkFind] Contact budget exceeded (${CONTACT_BUDGET_MS}ms) for ${domain}`);
          resolve(null);
        }, CONTACT_BUDGET_MS))
      ]);
    } catch (err) {
      console.error(`[BulkFind] Error finding email for ${domain}:`, err.message);
      foundEmail = null;
    }

    if (foundEmail) {
      deductTokens(userId, keyId, 1);
      tokensUsed += 1;

      db.prepare(`
        INSERT OR REPLACE INTO email_cache (id, domain, first_name, last_name, email, verdict, created_at)
        VALUES (?, ?, ?, ?, ?, 'VALID', ?)
      `).run(uuidv4(), domain.toLowerCase(), firstName.toLowerCase(), lastName.toLowerCase(), foundEmail, new Date().toISOString());

      found++;
      return { firstName, lastName, domain, success: true, email: foundEmail, verdict: 'VALID', hosted_at: hostedAt };
    }

    return { firstName, lastName, domain, success: false, reason: 'no_verifiable_email', hosted_at: hostedAt };
  }

  // Use scheduled bulk process with layered concurrency
  const getDomain = (item) => {
    const rawDomain = item.domain || '';
    return rawDomain
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '')
      .toLowerCase()
      .trim();
  };

  let results;
  try {
    results = await scheduledBulkProcess(items, getDomain, processFindItem);
  } catch (err) {
    console.error(`[BulkFind] Scheduler error, falling back to simple pool: ${err.message}`);
    results = await simpleBulkProcess(items, BULK_POOL_SIZE, processFindItem);
  }

  console.log(`[BulkFind] ${items.length} items → ${found} found, ${tokensUsed} charged, ${Date.now() - t0}ms (global=${GLOBAL_MAX_CONCURRENCY}, perDomain=${PER_DOMAIN_MAX_INFLIGHT}, hedge=${HEDGE_DELAY_MS}ms)`);

  res.json({
    success: true,
    results: results.filter(r => r.success),
    summary: { total: items.length, found, not_found: items.length - found },
    tokens_used: tokensUsed,
  });
});

/**
 * POST /api/email/v2/verify-bulk
 * Bulk verify emails — 5 concurrent verifications, 1 token per email
 */
app.post('/api/email/v2/verify-bulk', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const apiKey = verifyApiKey(authHeader);
  const userIdHeader = req.headers['x-user-id'];

  // Allow API key OR user headers (same as single endpoints)
  if (!apiKey && !userIdHeader) {
    const hasAuthHeader = !!authHeader;
    const authFormat = hasAuthHeader ? (authHeader.startsWith('Bearer ') ? 'Bearer format OK' : 'Missing "Bearer " prefix') : 'No Authorization header';
    console.log(`[Auth] 401 on /verify-bulk: auth=${authFormat}, x-user-id=${!!userIdHeader}`);
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Set header: Authorization: Bearer YOUR_API_KEY',
      hint: hasAuthHeader && !authHeader.startsWith('Bearer ') ? 'Header must start with "Bearer " (with space)' : undefined
    });
  }

  const userId = apiKey ? apiKey.user_id : userIdHeader;
  const keyId = apiKey ? apiKey.id : '';

  const { emails } = req.body;

  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ success: false, error: 'emails array required' });
  }

  // Check quota (1 token per email)
  const tokensNeeded = emails.length;
  const usage = getOrCreateUsage(userId, keyId);
  const MONTHLY_LIMIT = 10000;

  if (usage.tokens_used + tokensNeeded > MONTHLY_LIMIT) {
    return res.status(429).json({ email: null });
  }

  let tokensUsed = 0;
  const t0 = Date.now();

  // Process function for each email
  async function processVerifyItem(email) {
    const domain = email.split('@')[1] || '';

    // Get provider info
    const mx = await getMxProvider(domain);
    const hostedAt = mx.provider || 'Custom';

    // PRX2 function wrapper
    const prx2Fn = async () => {
      const result = await verifyWithMailtester(email, userId, 'bulk');
      return result || { verdict: 'UNKNOWN', cached: false };
    };

    // Catch-all probe function wrapper
    const catchAllProbeFn = async (emailAddr, dom) => {
      return await probeCatchAllConfidence(emailAddr, dom, mx.provider, db);
    };

    // Use hedged verify
    const result = await hedgedVerify(email, prx2Fn, catchAllProbeFn, 'bulk');

    // Charge 1 token per valid verdict (not cached, not unknown)
    if (!result.cached && (result.verdict === 'VALID' || result.verdict === 'INVALID')) {
      deductTokens(userId, keyId, 1);
      tokensUsed += 1;
    }

    return {
      email: result.verdict === 'VALID' ? email : null,
      hosted_at: hostedAt
    };
  }

  // Use scheduled bulk process with layered concurrency
  const getDomain = (email) => email.split('@')[1] || '';

  let results;
  try {
    results = await scheduledBulkProcess(emails, getDomain, processVerifyItem);
  } catch (err) {
    console.error(`[BulkVerify] Scheduler error, falling back to simple pool: ${err.message}`);
    results = await simpleBulkProcess(emails, BULK_POOL_SIZE, processVerifyItem);
  }

  console.log(`[BulkVerify] ${emails.length} emails → ${tokensUsed} charged, ${Date.now() - t0}ms (global=${GLOBAL_MAX_CONCURRENCY}, perDomain=${PER_DOMAIN_MAX_INFLIGHT}, hedge=${HEDGE_DELAY_MS}ms)`);

  res.json(results);
});

// ============================================================
// PATTERN INGESTION (learn from CSV uploads)
// ============================================================

/**
 * POST /api/patterns/ingest
 * Learn domain email patterns from user-provided CSV data.
 *
 * Body: { patterns: [{ email, firstName, lastName }] }
 * Auth: API key (same as find/verify)
 *
 * Each record calls extractPattern() + recordDomainPattern() (existing functions).
 * The 2-win gate in getLearnedEmail() provides safety — one CSV upload = 1 win,
 * needs confirmation from a second source before the pattern is used.
 *
 * Cap: 1000 records per request.
 */
app.post('/api/patterns/ingest', (req, res) => {
  const authHeader = req.headers['authorization'];
  const apiKey = verifyApiKey(authHeader);
  const userId = req.headers['x-user-id'];

  if (!apiKey && !userId) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const { patterns } = req.body;

  if (!patterns || !Array.isArray(patterns)) {
    return res.status(400).json({ success: false, error: 'patterns array required' });
  }

  // Cap at 1000 records per request
  const batch = patterns.slice(0, 1000);

  let learned = 0;
  let skipped = 0;

  for (const item of batch) {
    const { email, firstName, lastName } = item;

    if (!email || !firstName || !lastName) {
      skipped++;
      continue;
    }

    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) {
      skipped++;
      continue;
    }

    const pattern = extractPattern(email, firstName, lastName);
    if (pattern === 'unknown') {
      skipped++;
      continue;
    }

    recordDomainPattern(domain, email, firstName, lastName);
    learned++;
  }

  console.log(`[Patterns] Ingested ${learned} patterns, skipped ${skipped} (total: ${batch.length})`);

  res.json({ learned, skipped });
});

// ============================================================
// MARKETS — Signal-based lead search (provider-agnostic proxy)
// ============================================================

// In-memory cache for company intel (24h TTL)
const companyIntelCache = new Map(); // companyId -> { data, timestamp }
const COMPANY_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Shared JWT for company intel endpoint (service-level, not user-facing)
const MARKETS_COMPANY_JWT = process.env.MARKETS_COMPANY_JWT || '';

function getCompanyCached(companyId) {
  const entry = companyIntelCache.get(companyId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > COMPANY_CACHE_TTL) {
    companyIntelCache.delete(companyId);
    return null;
  }
  return entry.data;
}

function setCompanyCached(companyId, data) {
  companyIntelCache.set(companyId, { data, timestamp: Date.now() });
  // Evict if cache is too large (prevent memory leak)
  if (companyIntelCache.size > 5000) {
    const oldest = companyIntelCache.keys().next().value;
    companyIntelCache.delete(oldest);
  }
}

// Title packs — rotated per search to maximize unique decision-makers
const TITLE_PACKS = [
  { name: 'founders',  titles: ['Founder', 'Co-Founder', 'Owner', 'Partner'] },
  { name: 'c-level',   titles: ['CEO', 'CTO', 'COO', 'CFO', 'CMO', 'CRO'] },
  { name: 'vp-head',   titles: ['VP', 'Vice President', 'Head of', 'SVP'] },
  { name: 'directors',  titles: ['Director', 'Senior Director', 'Managing Director'] },
  { name: 'talent',    titles: ['Talent Acquisition', 'Recruiting', 'HR Director', 'CHRO', 'Head of People'] },
  { name: 'managers',  titles: ['General Manager', 'President', 'Principal', 'Board Member'] },
];

const SEARCH_ENDPOINT = 'https://app.instantly.ai/backend/api/v2/supersearch-enrichment/preview-leads-from-supersearch';
const TARGET_UNIQUE = 300;
const QUERY_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

function hashQuery(obj) {
  return require('crypto').createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16);
}

/**
 * POST /markets/search
 * Proxy search request to provider API using member's API key.
 * Client never sees provider domain or auth mechanism.
 *
 * Backend silently expands each search by rotating title packs,
 * deduplicates by person+company, and caps at ~300 uniques.
 */
app.post('/markets/search', async (req, res) => {
  const {
    apiKey,
    news,
    subIndustry,
    jobListingFilter,
    title,
    employeeCount,
    fundingType,
    revenue,
    keywordFilter,
    locations,
    technologies,
    showOneLeadPerCompany,
  } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: 'API key required' });
  }

  // Daily cap: 5000 leads/day per API key
  const DAILY_LEAD_CAP = 5000;
  const today = new Date().toISOString().split('T')[0];

  const usage = db.prepare(
    'SELECT leads_fetched FROM markets_usage WHERE api_key = ? AND search_date = ?'
  ).get(apiKey, today);

  const currentUsage = usage?.leads_fetched || 0;
  if (currentUsage >= DAILY_LEAD_CAP) {
    return res.status(429).json({
      error: 'Daily limit reached (5,000 leads). Resets at midnight UTC.',
      leads_fetched: currentUsage,
      daily_cap: DAILY_LEAD_CAP,
    });
  }

  // Build base search_filters — exact API param names, exact shapes
  const search_filters = {};
  if (news && news.length > 0) search_filters.news = news;
  if (subIndustry) search_filters.subIndustry = subIndustry; // { include: [], exclude: [] }
  if (jobListingFilter && jobListingFilter.length > 0) search_filters.jobListingFilter = jobListingFilter;
  if (employeeCount && employeeCount.length > 0) search_filters.employeeCount = employeeCount; // [{ op, min, max }]
  if (fundingType && fundingType.length > 0) search_filters.fundingType = fundingType;
  if (revenue && revenue.length > 0) search_filters.revenue = revenue;
  if (keywordFilter && (keywordFilter.include || keywordFilter.exclude)) search_filters.keywordFilter = keywordFilter; // { include: "str", exclude: "str" }
  if (locations && locations.include && locations.include.length > 0) search_filters.locations = locations; // { include: [{ place_id, label }] }
  if (technologies && technologies.length > 0) search_filters.technologies = technologies;

  // Detect user-provided title filter — titles are injected per-pack below, not into base search_filters
  const hasUserTitleFilter = title && title.include && title.include.length > 0;

  // Query cache — identical query within 24h returns cached result
  const queryHash = hashQuery({ search_filters, showOneLeadPerCompany, hasUserTitleFilter });
  const cached = db.prepare(
    'SELECT response_json, created_at FROM markets_query_cache WHERE query_hash = ?'
  ).get(queryHash);

  if (cached) {
    const age = Date.now() - new Date(cached.created_at).getTime();
    if (age < QUERY_CACHE_TTL) {
      console.log(`[Markets] Cache hit for ${queryHash} (age: ${Math.round(age / 60000)}m)`);
      const cachedResponse = JSON.parse(cached.response_json);
      return res.json(cachedResponse);
    }
    // Stale — delete and re-fetch
    db.prepare('DELETE FROM markets_query_cache WHERE query_hash = ?').run(queryHash);
  }

  try {
    const uniqueLeads = [];
    const seen = new Set(); // dedupe key: companyName (one contact per company across all packs)
    let totalCount = 0;
    let redactedCount = 0;

    // Determine packs: user-provided titles split into individual packs (1 title per call),
    // else rotate all standard packs. This maximizes unique companies from the 50-per-call API cap.
    const packsToRun = hasUserTitleFilter
      ? title.include.map(t => ({ name: `user-${t}`, titles: [t] }))
      : TITLE_PACKS;

    for (const pack of packsToRun) {
      if (uniqueLeads.length >= TARGET_UNIQUE) break;

      // Every pack gets its own title filter — user-provided or standard
      const packFilters = { ...search_filters, title: { include: pack.titles, exclude: [] } };

      const payload = {
        search_filters: packFilters,
        skip_owned_leads: false,
        show_one_lead_per_company: showOneLeadPerCompany !== undefined ? showOneLeadPerCompany : true,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(SEARCH_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        console.log(`[Markets] Pack "${pack.name}" failed: HTTP ${response.status} ${errText.slice(0, 200)}`);
        // First pack failure = hard fail. Later packs = skip and return what we have.
        if (uniqueLeads.length === 0) {
          return res.status(response.status).json({ error: 'Search failed', detail: errText.slice(0, 200) });
        }
        continue;
      }

      const data = await response.json();
      const packLeads = data.leads || [];
      totalCount = Math.max(totalCount, data.number_of_leads || 0);
      redactedCount = Math.max(redactedCount, data.number_of_redacted_results || 0);

      // Dedup and collect
      let newCount = 0;
      for (const lead of packLeads) {
        const key = (lead.companyName || '').toLowerCase().trim();
        if (seen.has(key)) continue;
        seen.add(key);
        lead._pack = pack.name; // Tag for downstream attribution
        uniqueLeads.push(lead);
        newCount++;
      }

      console.log(`[Markets] Pack "${pack.name}": ${packLeads.length} returned, ${newCount} new → ${uniqueLeads.length} total`);

      // Log pack performance
      db.prepare(
        'INSERT INTO markets_pack_log (query_hash, pack_name, leads_returned, unique_added) VALUES (?, ?, ?, ?)'
      ).run(queryHash, pack.name, packLeads.length, newCount);

      // 200ms delay between calls to avoid burst/rate limits
      if (packsToRun.indexOf(pack) < packsToRun.length - 1) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    const leads = uniqueLeads.slice(0, TARGET_UNIQUE);
    const leadsReturned = leads.length;
    console.log(`[Markets] Search complete: ${leadsReturned} unique leads from ${hasUserTitleFilter ? 'user title filter' : TITLE_PACKS.length + ' packs'}`);

    // Increment daily usage
    db.prepare(`INSERT INTO markets_usage (api_key, search_date, leads_fetched)
      VALUES (?, ?, ?)
      ON CONFLICT(api_key, search_date)
      DO UPDATE SET leads_fetched = leads_fetched + ?`
    ).run(apiKey, today, leadsReturned, leadsReturned);

    const responseBody = {
      data: leads,
      total_count: totalCount,
      redacted_count: redactedCount,
      daily_remaining: DAILY_LEAD_CAP - (currentUsage + leadsReturned),
    };

    // Cache the response
    db.prepare(
      'INSERT OR REPLACE INTO markets_query_cache (query_hash, response_json, created_at) VALUES (?, ?, ?)'
    ).run(queryHash, JSON.stringify(responseBody), new Date().toISOString());

    res.json(responseBody);
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('[Markets] Search timed out');
      return res.status(504).json({ error: 'Search timed out' });
    }
    console.error('[Markets] Search error:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * POST /markets/company
 * Fetch company intel using shared service JWT.
 * Client never sees the JWT or provider endpoint.
 */
app.post('/markets/company', async (req, res) => {
  const { companyId } = req.body;

  if (!companyId) {
    return res.status(400).json({ error: 'companyId required' });
  }

  // Check cache
  const cached = getCompanyCached(companyId);
  if (cached) {
    return res.json({ company: cached });
  }

  if (!MARKETS_COMPANY_JWT) {
    console.log('[Markets] Company intel skipped: no JWT configured');
    return res.json({ company: null });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(`https://app.instantly.ai/leadsy/api/v1/company/${companyId}`, {
      method: 'GET',
      headers: {
        'x-auth-jwt': MARKETS_COMPANY_JWT,
        'x-from-instantly': 'true',
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log(`[Markets] Company intel failed for ${companyId}: HTTP ${response.status}`);
      return res.json({ company: null });
    }

    const data = await response.json();
    const companyData = data?.company || data;
    setCompanyCached(companyId, companyData);
    console.log(`[Markets] Enriched company: ${companyData?.name || companyId}`);

    res.json({ company: companyData });
  } catch (err) {
    console.log(`[Markets] Company intel error for ${companyId}: ${err.message}`);
    res.json({ company: null });
  }
});

/**
 * POST /markets/enrich-batch
 * Batch company enrichment with 100ms delay between calls.
 * Returns map of companyId -> company data.
 */
app.post('/markets/enrich-batch', async (req, res) => {
  const { companyIds } = req.body;

  if (!companyIds || !Array.isArray(companyIds) || companyIds.length === 0) {
    return res.status(400).json({ error: 'companyIds array required' });
  }

  // Cap at 50 per batch
  const ids = companyIds.slice(0, 50);
  const companies = {};

  for (const id of ids) {
    // Check cache first
    const cached = getCompanyCached(id);
    if (cached) {
      companies[id] = cached;
      continue;
    }

    if (!MARKETS_COMPANY_JWT) {
      companies[id] = null;
      continue;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`https://app.instantly.ai/leadsy/api/v1/company/${id}`, {
        method: 'GET',
        headers: {
          'x-auth-jwt': MARKETS_COMPANY_JWT,
          'x-from-instantly': 'true',
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const companyData = data?.company || data;
        setCompanyCached(id, companyData);
        companies[id] = companyData;
      } else {
        companies[id] = null;
      }
    } catch (err) {
      companies[id] = null;
    }

    // 100ms delay between calls
    await sleep(100);
  }

  console.log(`[Markets] Batch enriched ${Object.values(companies).filter(Boolean).length}/${ids.length} companies`);
  res.json({ companies });
});

// ============================================================
// ADMIN ENDPOINTS
// ============================================================

// Create admin_log table for audit
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_log (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    details TEXT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

/**
 * POST /admin/mailtester/key
 * Hot-swap MailTester API keys without restart
 *
 * Accepts:
 * - { api_key: "single_key" } - adds to existing keys
 * - { api_keys: ["key1", "key2"] } - replaces all keys
 * - { api_key: "key", action: "remove" } - removes a key
 */
app.post('/admin/mailtester/key', (req, res) => {
  const secret = req.headers['x-admin-secret'];

  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ success: false, error: 'Invalid admin secret' });
  }

  const { api_key, api_keys, action } = req.body;

  // Handle array of keys (replace all)
  if (api_keys && Array.isArray(api_keys)) {
    const validKeys = api_keys.filter(k => typeof k === 'string' && k.length >= 10).map(k => k.trim());
    if (validKeys.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid API keys provided' });
    }
    MAILTESTER_API_KEYS = validKeys;
    keyIndex = 0; // Reset round-robin index

    // Audit log
    db.prepare(`INSERT INTO admin_log (id, action, details, timestamp) VALUES (?, ?, ?, ?)`)
      .run(uuidv4(), 'mailtester_keys_replace', `Replaced with ${validKeys.length} keys`, new Date().toISOString());

    console.log(`[Admin] MailTester API keys replaced: ${validKeys.length} keys configured`);

    return res.json({
      success: true,
      message: `${validKeys.length} API keys configured`,
      total_keys: validKeys.length,
      key_prefixes: validKeys.map(k => k.slice(0, 8) + '...'),
    });
  }

  // Handle single key
  if (!api_key || typeof api_key !== 'string' || api_key.length < 10) {
    return res.status(400).json({ success: false, error: 'Invalid API key' });
  }

  const trimmedKey = api_key.trim();

  // Remove action
  if (action === 'remove') {
    const idx = MAILTESTER_API_KEYS.indexOf(trimmedKey);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Key not found' });
    }
    MAILTESTER_API_KEYS.splice(idx, 1);
    keyIndex = keyIndex % Math.max(1, MAILTESTER_API_KEYS.length);

    db.prepare(`INSERT INTO admin_log (id, action, details, timestamp) VALUES (?, ?, ?, ?)`)
      .run(uuidv4(), 'mailtester_key_remove', `Key removed: ${trimmedKey.slice(0, 8)}...`, new Date().toISOString());

    console.log(`[Admin] MailTester API key removed: ${trimmedKey.slice(0, 8)}...`);

    return res.json({
      success: true,
      message: 'API key removed',
      total_keys: MAILTESTER_API_KEYS.length,
    });
  }

  // Add key (default action)
  if (!MAILTESTER_API_KEYS.includes(trimmedKey)) {
    MAILTESTER_API_KEYS.push(trimmedKey);
  }

  // Audit log
  db.prepare(`INSERT INTO admin_log (id, action, details, timestamp) VALUES (?, ?, ?, ?)`)
    .run(uuidv4(), 'mailtester_key_add', `Key added: ${trimmedKey.slice(0, 8)}...`, new Date().toISOString());

  console.log(`[Admin] MailTester API key added: ${trimmedKey.slice(0, 8)}... (total: ${MAILTESTER_API_KEYS.length})`);

  res.json({
    success: true,
    message: 'API key added',
    total_keys: MAILTESTER_API_KEYS.length,
    key_prefix: trimmedKey.slice(0, 8) + '...',
  });
});

/**
 * GET /admin/status
 * Internal status for operators
 */
app.get('/admin/status', (req, res) => {
  const secret = req.headers['x-admin-secret'];

  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ success: false, error: 'Invalid admin secret' });
  }

  const mode = getMode();
  const recent = METRICS.window.filter(m => Date.now() - m.timestamp < 60000);
  const breakdown = {
    ok: recent.filter(m => m.type === 'ok').length,
    ko: recent.filter(m => m.type === 'ko').length,
    mb: recent.filter(m => m.type === 'mb').length,
    timeout: recent.filter(m => m.type === 'timeout').length,
    error: recent.filter(m => m.type === 'error').length,
    limited: recent.filter(m => m.type === 'limited').length,
  };

  res.json({
    success: true,
    mode,
    mailtester: {
      keys_configured: MAILTESTER_API_KEYS.length,
      key_prefixes: MAILTESTER_API_KEYS.map(k => k.slice(0, 8) + '...'),
      current_key_index: keyIndex,
      status: MAILTESTER_API_KEYS.length > 0 ? 'ready' : 'no_keys',
    },
    rate_limit: {
      tokens_available: RATE_LIMIT.tokens.toFixed(2),
      max_burst: RATE_LIMIT.maxBurst,
      rate: RATE_LIMIT.tokensPerSecond + '/sec',
    },
    queue_depth: 0,
    metrics_60s: breakdown,
    dns_intel: getDnsCacheStats(),
  });
});

// ============================================================
// CIRCUIT BREAKER ADMIN ENDPOINTS
// ============================================================

/**
 * GET /admin/circuit-breaker
 * View circuit breaker stats (domains currently bypassed)
 */
app.get('/admin/circuit-breaker', (req, res) => {
  const secret = req.headers['x-admin-secret'];

  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ success: false, error: 'Invalid admin secret' });
  }

  const stats = getCircuitBreakerStats();

  res.json({
    success: true,
    bypassed_domains: stats,
    config: {
      global_concurrency: GLOBAL_MAX_CONCURRENCY,
      per_domain_concurrency: PER_DOMAIN_MAX_INFLIGHT,
      hedge_delay_ms: HEDGE_DELAY_MS,
      item_budget_ms: BULK_ITEM_BUDGET_MS,
    },
  });
});

/**
 * DELETE /admin/circuit-breaker/:domain
 * Clear circuit breaker for specific domain or all domains
 */
app.delete('/admin/circuit-breaker/:domain?', (req, res) => {
  const secret = req.headers['x-admin-secret'];

  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ success: false, error: 'Invalid admin secret' });
  }

  const { domain } = req.params;

  if (domain && domain !== 'all') {
    const cleared = clearCircuitBreaker(domain);
    console.log(`[Admin] Circuit breaker cleared for domain: ${domain}`);
    return res.json({ success: true, cleared: domain });
  }

  clearCircuitBreaker();
  console.log(`[Admin] Circuit breaker cleared for all domains`);
  res.json({ success: true, cleared: 'all' });
});

// ============================================================
// DEV ENDPOINTS
// ============================================================

// Clear all caches (dev only)
app.delete('/api/dev/cache', (req, res) => {
  db.prepare(`DELETE FROM verify_cache`).run();
  db.prepare(`DELETE FROM email_cache`).run();
  db.prepare(`DELETE FROM domain_stats`).run();
  clearDnsCaches();
  METRICS.window = [];
  console.log('[Dev] All caches cleared (including DNS intel caches)');
  res.json({ success: true, message: 'All caches cleared' });
});

// ============================================================
// HEALTH CHECK
// ============================================================
// Health is informational. It reflects capability, not liveness probes.
// Keys configured = ready to verify. No network calls in /health.

app.get('/health', async (req, res) => {
  const mode = getMode();

  // 1. DB readiness check (if this fails, we can't serve requests)
  let dbOk = false;
  let dbStats = { api_keys: 0, active_keys: 0, email_cache: 0 };
  try {
    const keyCount = db.prepare(`SELECT COUNT(*) as count FROM api_keys`).get();
    const activeKeyCount = db.prepare(`SELECT COUNT(*) as count FROM api_keys WHERE status = 'active'`).get();
    const cacheCount = db.prepare(`SELECT COUNT(*) as count FROM email_cache`).get();
    dbStats = {
      api_keys: keyCount?.count || 0,
      active_keys: activeKeyCount?.count || 0,
      email_cache: cacheCount?.count || 0,
    };
    dbOk = true;
  } catch (e) {
    dbStats.error = e.message;
  }

  // 2. SMTP relay reachability (fast ping, 3s timeout)
  let relayOk = false;
  let relayMs = 0;
  try {
    const relayUrl = process.env.SMTP_RELAY_URL || 'http://163.245.216.239:3025';
    const t0 = Date.now();
    await new Promise((resolve, reject) => {
      const url = new URL('/health', relayUrl);
      const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'GET', timeout: 3000 }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => { resolve(d); });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.end();
    });
    relayMs = Date.now() - t0;
    relayOk = true;
  } catch (_) {}

  // 3. Memory check
  const mem = process.memoryUsage();
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  const memOk = heapUsedMB < 450; // Railway containers are typically 512MB

  // Mailtester status
  let mailtesterStatus = 'down';
  if (MAILTESTER_API_KEYS.length > 0) {
    mailtesterStatus = mode === 'RESTRICTED' ? 'throttled' : 'reachable';
  }

  // Overall status: non-200 only if app truly cannot serve
  const healthy = dbOk && memOk;
  const statusCode = healthy ? 200 : 503;

  res.status(statusCode).json({
    status: healthy ? 'ok' : 'degraded',
    mode,
    db: { ok: dbOk, ...dbStats },
    relay: { ok: relayOk, ms: relayMs },
    memory: { ok: memOk, heap_mb: heapUsedMB, heap_total_mb: heapTotalMB, rss_mb: rssMB },
    mailtester: mailtesterStatus,
    mailtester_keys: MAILTESTER_API_KEYS.length,
    uptime_s: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// SMTP DIAGNOSTIC ENDPOINT (test port 25 from this host)
// ============================================================

app.get('/api/smtp/diagnostic', async (req, res) => {
  const targets = [
    { domain: 'gmail.com', desc: 'Google (gmail)' },
    { domain: 'microsoft.com', desc: 'Microsoft 365' },
    { domain: 'zoho.com', desc: 'Zoho' },
  ];

  const results = [];
  for (const target of targets) {
    try {
      const mxHost = await getMxHost(target.domain);
      if (!mxHost) {
        results.push({ ...target, mxHost: null, port25: 'no_mx' });
        continue;
      }

      // Try TCP connect to port 25 with 5s timeout
      const connectResult = await new Promise((resolve) => {
        const net = require('net');
        const socket = net.createConnection({ host: mxHost, port: 25, timeout: 5000 });
        let banner = '';

        socket.setEncoding('utf8');
        socket.on('connect', () => {
          // Connected — wait for banner
        });
        socket.on('data', (data) => {
          banner += data;
          socket.destroy();
          resolve({ connected: true, banner: banner.trim().substring(0, 200), ms: Date.now() - start });
        });
        socket.on('timeout', () => {
          socket.destroy();
          resolve({ connected: false, reason: 'timeout', ms: Date.now() - start });
        });
        socket.on('error', (err) => {
          resolve({ connected: false, reason: err.code || err.message, ms: Date.now() - start });
        });

        const start = Date.now();
      });

      results.push({ ...target, mxHost, port25: connectResult });
    } catch (err) {
      results.push({ ...target, error: err.message });
    }
  }

  // Also test a direct SMTP verify
  let smtpVerifyTest = null;
  try {
    const testResult = await verifyInboxSMTP('test@gmail.com');
    smtpVerifyTest = testResult;
  } catch (err) {
    smtpVerifyTest = { error: err.message };
  }

  res.json({
    host: process.env.RAILWAY_STATIC_URL || process.env.HOSTNAME || 'unknown',
    timestamp: new Date().toISOString(),
    targets: results,
    smtpVerifyTest,
  });
});

// ============================================================
// GLOBAL ERROR HANDLER (catch ECONNRESET, timeouts, etc.)
// ============================================================

app.use((err, req, res, next) => {
  // Log the error
  console.error('[GlobalError]', {
    path: req.path,
    method: req.method,
    error: err.message,
    code: err.code,
    stack: err.stack?.split('\n').slice(0, 3).join(' '),
  });

  // Normalize ECONNRESET and network errors
  if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
    return res.status(200).json({ email: null });
  }

  // Generic error fallback
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ============================================================
// ============================================================
// PROCESS CRASH GUARDS — keep alive for logging, then exit clean
// ============================================================

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled rejection:', reason?.message || reason);
  console.error('[FATAL] Stack:', reason?.stack?.split('\n').slice(0, 5).join('\n'));
  // Don't exit — log it, let Railway health check decide
});

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err.message);
  console.error('[FATAL] Stack:', err.stack?.split('\n').slice(0, 5).join('\n'));
  // Give 3s for logs to flush, then exit
  setTimeout(() => process.exit(1), 3000);
});

// ============================================================
// DOMAIN RATE LIMITER — prevent MX server throttling
// ============================================================

const domainLastCall = new Map(); // domain → timestamp
const DOMAIN_MIN_INTERVAL_MS = 200; // 200ms between calls to same domain (5 req/s per domain max)

/**
 * Wait if needed to respect per-domain rate limit.
 * Call before any SMTP relay request.
 */
async function domainThrottle(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return;
  const last = domainLastCall.get(domain) || 0;
  const wait = DOMAIN_MIN_INTERVAL_MS - (Date.now() - last);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  domainLastCall.set(domain, Date.now());
  // Cleanup old entries every 1000 domains
  if (domainLastCall.size > 1000) {
    const cutoff = Date.now() - 60000;
    for (const [d, t] of domainLastCall) { if (t < cutoff) domainLastCall.delete(d); }
  }
}

// ============================================================
// START SERVER
// ============================================================

const server = app.listen(PORT, '0.0.0.0', () => {
  // Check existing API keys count to diagnose persistence
  const keyCount = db.prepare(`SELECT COUNT(*) as count FROM api_keys WHERE status = 'active'`).get();
  const dbFileExists = fs.existsSync(dbPath);
  const dbStats = dbFileExists ? fs.statSync(dbPath) : null;
  const relayUrl = process.env.SMTP_RELAY_URL || 'http://163.245.216.239:3025';
  const mem = process.memoryUsage();

  console.log('');
  console.log('============================================');
  console.log('  CONNECTOR AGENT BACKEND');
  console.log('============================================');
  console.log(`  Node:        ${process.version}`);
  console.log(`  Environment: ${process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV || 'local'}`);
  console.log(`  Server:      http://0.0.0.0:${PORT}`);
  console.log(`  SMTP Relay:  ${relayUrl}`);
  console.log(`  Pool Size:   ${BULK_POOL_SIZE} concurrent`);
  console.log(`  Database:    ${dbPath}`);
  console.log(`  DB Exists:   ${dbFileExists}`);
  console.log(`  DB Size:     ${dbStats ? Math.round(dbStats.size / 1024) + ' KB' : 'N/A'}`);
  console.log(`  API Keys:    ${keyCount.count} active`);
  console.log(`  Memory:      ${Math.round(mem.rss / 1024 / 1024)}MB RSS, ${Math.round(mem.heapUsed / 1024 / 1024)}MB heap`);
  console.log(`  DATA_DIR:    ${process.env.DATA_DIR || '(default)'}`);
  console.log('');
  console.log('  Endpoints:');
  console.log('  - POST /api/keys/generate');
  console.log('  - GET  /api/keys/active');
  console.log('  - DELETE /api/keys/:id');
  console.log('  - GET  /api/email/v2/quota');
  console.log('  - POST /api/email/v2/find');
  console.log('  - POST /api/email/v2/verify');
  console.log('  - POST /api/email/v2/find-bulk');
  console.log('  - POST /api/email/v2/verify-bulk');
  console.log('  - POST /api/patterns/ingest');
  console.log('  - POST /markets/search');
  console.log('  - POST /markets/company');
  console.log('  - POST /markets/enrich-batch');
  console.log('============================================');
  console.log('');
});

// Graceful shutdown — Railway sends SIGTERM before stopping
process.on('SIGTERM', () => {
  console.log('[Shutdown] SIGTERM received, closing server...');
  server.close(() => {
    db.close();
    console.log('[Shutdown] Clean exit.');
    process.exit(0);
  });
});
