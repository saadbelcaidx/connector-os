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

// Web extraction module for crawling company websites
const { extractEmailsForPerson } = require('./webExtractor');

const app = express();
const PORT = process.env.PORT || 8000;

// ============================================================
// DATABASE SETUP
// ============================================================

const dbPath = path.join(__dirname, '..', 'data', 'connector-agent.db');

// Ensure data directory exists
const fs = require('fs');
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

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
  const keyHash = hashKey(key);

  const apiKey = db.prepare(`
    SELECT * FROM api_keys WHERE key_hash = ? AND status = 'active'
  `).get(keyHash);

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

  const patterns = [
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
    `${fi}${l}@${domain}`,      // jdoe@company.com
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
  ];

  // Tier 5: Middle name patterns (if provided)
  if (m && mi) {
    patterns.push(
      `${f}.${mi}.${l}@${domain}`,    // john.m.doe@company.com
      `${f}${mi}${l}@${domain}`,      // johnmdoe@company.com
      `${fi}${mi}${l}@${domain}`,     // jmdoe@company.com
      `${f}.${m}.${l}@${domain}`,     // john.michael.doe@company.com
    );
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

// Token cache (valid for 24 hours)
let mailtesterToken = null;
let mailtesterTokenExpiry = null;
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
const BULK_CONCURRENCY = 1;         // Protects quota stability

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
// MAILTESTER TOKEN MANAGEMENT
// ============================================================

async function getMailtesterToken(retryCount = 0) {
  // Return cached token if still valid (with 1 hour buffer)
  if (mailtesterToken && mailtesterTokenExpiry && Date.now() < mailtesterTokenExpiry - 3600000) {
    return mailtesterToken;
  }

  if (MAILTESTER_API_KEYS.length === 0) {
    return null;
  }

  try {
    const apiKey = getNextMailtesterKey();
    const url = `https://token.mailtester.ninja/token?key=${apiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    const text = await response.text();

    // Check if response is JSON
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // Not JSON - likely redirect or error page
      if (response.status === 401) {
        recordMetric('error');
        return null;
      }
      throw new Error('Invalid response');
    }

    if (data.token) {
      mailtesterToken = data.token;
      mailtesterTokenExpiry = Date.now() + 24 * 60 * 60 * 1000;
      return mailtesterToken;
    } else {
      recordMetric('error');
      return null;
    }
  } catch (err) {
    recordMetric('timeout');
    // Retry once on timeout
    if (retryCount === 0 && err.name === 'AbortError') {
      await sleep(200);
      return getMailtesterToken(1);
    }
    return null;
  }
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
      // mb (catch-all/accept-all) = VALID - users want emails, not excuses
      recordMetric('mb');
      return { verdict: 'VALID', catchAll: true, raw: data };
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

    // Handle invalid/expired token - refresh and retry once
    if (data.code === '--' || data.message === 'Invalid Token' || data.message === 'Disabled Key') {
      mailtesterToken = null;
      mailtesterTokenExpiry = null;
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

    // Map response to verdicts - VALID for ok and mb (catch-all)
    if (data.code === 'ok') {
      recordMetric('ok');
      return { verdict: 'VALID', raw: data };
    } else if (data.code === 'ko') {
      recordMetric('ko');
      return { verdict: 'INVALID', raw: data };
    } else {
      // mb (catch-all/accept-all) = VALID - marketing > morals
      recordMetric('mb');
      return { verdict: 'VALID', catchAll: true, raw: data };
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

    // Handle invalid/expired token
    if (data.code === '--' || data.message === 'Invalid Token' || data.message === 'Disabled Key') {
      mailtesterToken = null;
      mailtesterTokenExpiry = null;
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
  const emailCached = db.prepare(`
    SELECT email, verdict, created_at FROM email_cache WHERE email = ?
  `).get(emailLower);
  if (emailCached && emailCached.verdict === 'VALID') {
    const age = Date.now() - new Date(emailCached.created_at).getTime();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    if (age < SEVEN_DAYS) {
      return { verdict: 'VALID', cached: true };
    }
  }

  // Check if domain is known catch-all - still VALID (users want emails!)
  if (domain && isDomainCatchAll(domain)) {
    return { verdict: 'VALID', reason: 'catch_all_domain', catchAll: true, cached: false };
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

  // Call MailTester (queued, rate-limited, retried)
  const result = await verifyWithMailtester(emailLower, userId, queueType);

  if (result && result.verdict) {
    // Update domain stats for catch-all detection
    if (result.raw?.code) {
      updateDomainStats(emailLower, result.raw.code);
    }

    // Cache VALID and INVALID (not UNKNOWN, not SERVICE_BUSY)
    if (result.verdict === 'VALID' || result.verdict === 'INVALID') {
      cacheVerdict(emailLower, result.verdict);
    }
    return { verdict: result.verdict, cached: false };
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
  const deleted = db.prepare(`DELETE FROM api_keys WHERE user_id = ?`).run(userId);
  const rotated = deleted.changes > 0;
  if (rotated) {
    console.log(`[Keys] Rotated: deleted ${deleted.changes} old key(s) for ${userEmail}`);
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
  const apiKey = verifyApiKey(req.headers['authorization']);
  const userId = req.headers['x-user-id'];

  // Allow API key OR user headers (for UI usage without stored key)
  if (!apiKey && !userId) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const effectiveUserId = apiKey ? apiKey.user_id : userId;
  const effectiveKeyId = apiKey ? apiKey.id : '';

  const { firstName, lastName, domain } = req.body;

  if (!firstName || !lastName) {
    return res.status(400).json({ success: false, error: 'firstName and lastName required' });
  }

  if (!domain) {
    return res.status(400).json({ success: false, error: 'domain required' });
  }

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
      return res.json({ email: cached.email });
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
    return res.json({ email: null });
  }

  // Wrap main logic in try-catch to handle ECONNRESET and network errors
  try {

  // Helper to cache and return VALID email
  const cacheAndReturn = (email, source, isCatchAll = false) => {
    deductTokens(effectiveUserId, effectiveKeyId, 1);

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
      'VALID',
      new Date().toISOString()
    );

    // Also cache in verify_cache (so verify endpoint returns VALID)
    cacheVerdict(email, 'VALID');

    // Record pattern for learning (skip catch-all, they're all best-guess)
    if (!isCatchAll) {
      recordDomainPattern(domain, email, firstName, lastName);
    }

    console.log(`[Find] SUCCESS via ${source}: ${email}${isCatchAll ? ' (catch-all)' : ''}`);
    return res.json({ email });
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
    console.log(`[Find] Learned pattern failed, continuing cascade`);
  }

  // ============================================================
  // STEP 0b: CATCH-ALL DETECTION (fast path for catch-all domains)
  // ============================================================
  console.log(`[Find] STEP 0b: Catch-all detection for ${domain}`);

  const catchAllResult = await detectCatchAll(domain);

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

  // Take top 5 patterns (or top 3 in degraded mode)
  const PARALLEL_LIMIT = mode === 'DEGRADED' ? 3 : 5;
  const topPermutations = allPermutations.slice(0, PARALLEL_LIMIT);

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
          console.log(`[Find] 🏆 Winner: ${email}`);
          return email;
        }
        throw new Error(result.verdict === 'SERVICE_BUSY' ? 'service_busy' : 'not_valid');
      })
    );

    return cacheAndReturn(validEmail, 'parallel-permutation');
  } catch (err) {
    // All top patterns failed - check if service was busy
    console.log(`[Find] Top ${PARALLEL_LIMIT} patterns failed, trying remaining...`);
  }

  // Fallback: try remaining permutations sequentially
  const remainingPermutations = allPermutations.slice(PARALLEL_LIMIT);
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
  }
  console.log(`[Find] Permutations: none of ${allPermutations.length} patterns verified VALID`);

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
    return res.json({ email: null });
  }

  console.log(`[Find] FAILED: No deliverable email for ${firstName} ${lastName} @ ${domain}`);
  res.json({ email: null });

  } catch (err) {
    // Handle ECONNRESET, ETIMEDOUT, and other network errors gracefully
    console.error(`[Find] ERROR: ${err.code || err.message} for ${firstName} ${lastName} @ ${domain}`);
    return res.json({ email: null });
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
  const apiKey = verifyApiKey(req.headers['authorization']);
  const userId = req.headers['x-user-id'];

  // Allow API key OR user headers (for UI usage without stored key)
  if (!apiKey && !userId) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const effectiveUserId = apiKey ? apiKey.user_id : userId;
  const effectiveKeyId = apiKey ? apiKey.id : '';

  const { email, emails } = req.body;
  const emailToVerify = email || (emails && emails[0]);

  if (!emailToVerify) {
    return res.status(400).json({ success: false, error: 'email required' });
  }

  const emailLower = emailToVerify.toLowerCase();

  // FAST PATH: Check if email was previously found by FIND (already verified)
  const foundEmail = db.prepare(`
    SELECT email FROM email_cache WHERE LOWER(email) = ?
  `).get(emailLower);
  if (foundEmail) {
    console.log(`[Verify] CACHE HIT from email_cache: ${emailLower}`);
    return res.json({ email: emailToVerify, status: 'valid' });
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
      return res.json({ email: null });
    }

    // Token accounting: only charge on VALID or INVALID (not cached, not service_busy)
    if (!result.cached && (result.verdict === 'VALID' || result.verdict === 'INVALID')) {
      deductTokens(effectiveUserId, effectiveKeyId, 1);
    }

    // VALID = return email + status, anything else = null + invalid
    if (result.verdict === 'VALID') {
      res.json({ email: emailToVerify, status: 'valid' });
    } else {
      res.json({ email: null, status: 'invalid' });
    }
  } catch (err) {
    // Handle ECONNRESET, ETIMEDOUT, and other network errors gracefully
    console.error(`[Verify] ERROR: ${err.code || err.message} for ${emailToVerify}`);
    return res.json({ email: null });
  }
});

// ============================================================
// BULK ENDPOINTS
// ============================================================

/**
 * POST /api/email/v2/find-bulk
 * Bulk find emails
 *
 * Same rules as single find:
 * - FOUND → charged 1 token
 * - NOT_FOUND → no charge
 * - Degradation modes apply
 */
app.post('/api/email/v2/find-bulk', async (req, res) => {
  const apiKey = verifyApiKey(req.headers['authorization']);
  const userIdHeader = req.headers['x-user-id'];

  // Allow API key OR user headers (same as single endpoints)
  if (!apiKey && !userIdHeader) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'items array required' });
  }

  const userId = apiKey ? apiKey.user_id : userIdHeader;
  const keyId = apiKey ? apiKey.id : '';
  const mode = getMode();

  const results = [];
  let found = 0;
  let tokensUsed = 0;

  for (const item of items) {
    const { firstName, lastName, domain } = item;

    if (!firstName || !lastName || !domain) {
      results.push({ ...item, success: false, error: 'Missing fields' });
      continue;
    }

    // RESTRICTED mode: skip all
    if (mode === 'RESTRICTED') {
      results.push({ firstName, lastName, domain, success: false, reason: 'no_verifiable_email' });
      continue;
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
        results.push({
          firstName, lastName, domain,
          success: true,
          email: cachedResult.email,
          verdict: cachedResult.verdict,
        });
        found++;
        continue;
      }
    }

    // Generate permutations (DEGRADED = rank-1 only)
    let permutations = generateEmailPermutations(firstName, lastName, domain);
    if (mode === 'DEGRADED') {
      permutations = permutations.slice(0, 1);
    }

    let foundEmail = null;
    for (const email of permutations) {
      const verifyResult = await verifyEmail(email, userId, 'bulk');
      if (verifyResult.verdict === 'VALID') {
        foundEmail = email;
        break;
      }
    }

    if (foundEmail) {
      deductTokens(userId, keyId, 1);
      tokensUsed += 1;

      db.prepare(`
        INSERT OR REPLACE INTO email_cache (id, domain, first_name, last_name, email, verdict, created_at)
        VALUES (?, ?, ?, ?, ?, 'VALID', ?)
      `).run(uuidv4(), domain.toLowerCase(), firstName.toLowerCase(), lastName.toLowerCase(), foundEmail, new Date().toISOString());

      results.push({ firstName, lastName, domain, success: true, email: foundEmail, verdict: 'VALID' });
      found++;
    } else {
      results.push({ firstName, lastName, domain, success: false, reason: 'no_verifiable_email' });
    }
  }

  res.json({
    success: true,
    results,
    summary: { total: items.length, found, not_found: items.length - found },
    tokens_used: tokensUsed,
  });
});

/**
 * POST /api/email/v2/verify-bulk
 * Bulk verify emails - 1 token per email
 */
app.post('/api/email/v2/verify-bulk', async (req, res) => {
  const apiKey = verifyApiKey(req.headers['authorization']);
  const userIdHeader = req.headers['x-user-id'];

  // Allow API key OR user headers (same as single endpoints)
  if (!apiKey && !userIdHeader) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
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
    return res.status(429).json({ success: false, error: 'Quota exceeded' });
  }

  const results = [];
  let valid = 0;
  let invalid = 0;
  let unknown = 0;
  let tokensUsed = 0;

  for (const email of emails) {
    const result = await verifyEmail(email, userId, 'bulk');

    // Charge 1 token per valid verdict (not cached, not unknown)
    if (!result.cached && (result.verdict === 'VALID' || result.verdict === 'INVALID')) {
      deductTokens(userId, keyId, 1);
      tokensUsed += 1;
    }

    results.push({
      email,
      verdict: result.verdict,
    });

    if (result.verdict === 'VALID') valid++;
    else if (result.verdict === 'INVALID') invalid++;
    else unknown++;
  }

  console.log(`[BulkVerify] ${emails.length} emails → VALID:${valid} INVALID:${invalid} UNKNOWN:${unknown}`);

  res.json({
    success: true,
    results,
    summary: {
      total: emails.length,
      valid,
      invalid,
      unknown,
    },
    tokens_used: tokensUsed,
  });
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

    // Clear token cache
    mailtesterToken = null;
    mailtesterTokenExpiry = null;

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

  // Clear token cache (force refresh)
  mailtesterToken = null;
  mailtesterTokenExpiry = null;

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
      token_valid: !!(mailtesterToken && mailtesterTokenExpiry && Date.now() < mailtesterTokenExpiry),
      token_expires_in: mailtesterTokenExpiry ? Math.max(0, Math.round((mailtesterTokenExpiry - Date.now()) / 1000 / 60)) + ' minutes' : null,
    },
    rate_limit: {
      tokens_available: RATE_LIMIT.tokens.toFixed(2),
      max_burst: RATE_LIMIT.maxBurst,
      rate: RATE_LIMIT.tokensPerSecond + '/sec',
    },
    queue_depth: 0,
    metrics_60s: breakdown,
  });
});

// ============================================================
// DEV ENDPOINTS
// ============================================================

// Clear all caches (dev only)
app.delete('/api/dev/cache', (req, res) => {
  db.prepare(`DELETE FROM verify_cache`).run();
  db.prepare(`DELETE FROM email_cache`).run();
  db.prepare(`DELETE FROM domain_stats`).run();
  mailtesterToken = null;
  mailtesterTokenExpiry = null;
  METRICS.window = [];
  console.log('[Dev] All caches cleared');
  res.json({ success: true, message: 'All caches cleared' });
});

// ============================================================
// HEALTH CHECK (Enhanced)
// ============================================================

app.get('/health', (req, res) => {
  const mode = getMode();

  // Determine mailtester status
  let mailtesterStatus = 'down';
  if (MAILTESTER_API_KEYS.length > 0) {
    if (mode === 'RESTRICTED') {
      mailtesterStatus = 'degraded';
    } else if (mailtesterToken && mailtesterTokenExpiry && Date.now() < mailtesterTokenExpiry) {
      mailtesterStatus = 'reachable';
    } else {
      mailtesterStatus = 'degraded';
    }
  }

  res.json({
    status: 'ok',
    mode,
    mailtester: mailtesterStatus,
    mailtester_keys: MAILTESTER_API_KEYS.length,
    queue_depth: 0,
    timestamp: new Date().toISOString(),
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
// START SERVER
// ============================================================

app.listen(PORT, () => {
  console.log('');
  console.log('============================================');
  console.log('  CONNECTOR AGENT BACKEND');
  console.log('============================================');
  console.log(`  Server running on http://localhost:${PORT}`);
  console.log(`  Database: ${dbPath}`);
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
  console.log('============================================');
  console.log('');
});
