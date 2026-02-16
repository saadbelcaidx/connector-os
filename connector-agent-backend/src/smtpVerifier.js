/**
 * SMTP Verifier — Relay-based RCPT TO verification
 *
 * Calls the SMTP relay service on a VPS with port 25 open.
 * The relay performs EHLO → MAIL FROM → RCPT TO → QUIT.
 * Never sends DATA. No email sent. Just checks if inbox exists.
 *
 * Uses Node built-in http module — works on any Node version (no fetch dependency).
 */

const http = require('http');
const { URL } = require('url');

const RELAY_URL = process.env.SMTP_RELAY_URL || 'http://163.245.216.239:3025';
const RELAY_SECRET = process.env.SMTP_RELAY_SECRET || 'smtp-relay-connector-2026';
const RELAY_TIMEOUT = 7000; // 7s budget for relay call (fast fail → fallback sooner)

// ============================================================
// CONNECTION POOLING (HTTP Agent with keepAlive)
// ============================================================

/**
 * HTTP Agent with connection pooling
 * - Reuses TCP connections to relay service
 * - Max 10 concurrent sockets
 * - 60s keepalive timeout
 * - Auto-closes idle connections
 */
const pooledAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 60000, // 60s keepalive
  maxSockets: 10, // Max concurrent connections
  maxFreeSockets: 5, // Max idle connections
  timeout: RELAY_TIMEOUT,
});

// Cleanup on shutdown
process.on('SIGTERM', () => pooledAgent.destroy());
process.on('SIGINT', () => pooledAgent.destroy());

// ============================================================
// RELAY HTTP CLIENT (Node built-in — no fetch, no deps)
// ============================================================

function relayCall(endpoint, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, RELAY_URL);
    const payload = JSON.stringify(body);

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'x-relay-secret': RELAY_SECRET,
      },
      timeout: RELAY_TIMEOUT,
      agent: pooledAgent, // Use pooled connections
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`relay parse error: ${data.slice(0, 200)}`)); }
        } else {
          reject(new Error(`relay ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', e => reject(new Error(`relay_connect: ${e.code || e.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error('relay_timeout')); });
    req.write(payload);
    req.end();
  });
}

// ============================================================
// PUBLIC API
// ============================================================

async function verifyInboxSMTP(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) {
    return { result: 'unknown', code: 0, message: 'invalid_email', mxHost: null, ms: 0 };
  }

  const t0 = Date.now();
  try {
    console.log(`[SMTPVerify] ${email} → relay ${RELAY_URL}/verify`);
    const result = await relayCall('/verify', { email });
    console.log(`[SMTPVerify] ${email} → ${result.result} (${result.code}) ${result.ms}ms relay + ${Date.now() - t0}ms total`);
    return result;
  } catch (err) {
    console.log(`[SMTPVerify] ${email} → relay error: ${err.message}`);
    return { result: 'unknown', code: 0, message: `relay_error: ${err.message}`, mxHost: null, ms: Date.now() - t0 };
  }
}

async function detectCatchAllSMTP(domain) {
  const t0 = Date.now();
  try {
    console.log(`[SMTPVerify] catch-all check: ${domain} → relay`);
    const result = await relayCall('/catch-all', { domain });
    console.log(`[SMTPVerify] catch-all ${domain} → ${result.catchAll} (${result.code}) ${result.ms}ms`);
    return {
      isCatchAll: result.catchAll,
      result: { ...result, ms: Date.now() - t0 },
    };
  } catch (err) {
    console.log(`[SMTPVerify] catch-all ${domain} → relay error: ${err.message}`);
    return {
      isCatchAll: false,
      result: { error: err.message, ms: Date.now() - t0 },
    };
  }
}

async function getMxHost(domain) {
  const dns = require('dns');
  const { promisify } = require('util');
  const resolveMx = promisify(dns.resolveMx);
  try {
    const records = await resolveMx(domain);
    if (!records || records.length === 0) return null;
    records.sort((a, b) => a.priority - b.priority);
    return records[0].exchange;
  } catch (err) {
    return null;
  }
}

module.exports = {
  verifyInboxSMTP,
  detectCatchAllSMTP,
  getMxHost,
};
