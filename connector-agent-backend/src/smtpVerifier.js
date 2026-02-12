/**
 * SMTP Verifier — Relay-based RCPT TO verification
 *
 * Calls the SMTP relay service on a VPS with port 25 open.
 * The relay performs EHLO → MAIL FROM → RCPT TO → QUIT.
 * Never sends DATA. No email sent. Just checks if inbox exists.
 *
 * Response codes:
 *   250 = inbox exists (deliverable)
 *   550/551/552/553 = inbox doesn't exist (undeliverable)
 *   451/452/4xx = greylisted or temp failure (unknown)
 *   421 = server busy / connection refused (unknown)
 */

const RELAY_URL = process.env.SMTP_RELAY_URL || 'http://163.245.216.239:3025';
const RELAY_SECRET = process.env.SMTP_RELAY_SECRET || 'smtp-relay-connector-2026';
const RELAY_TIMEOUT = 20000; // 20s budget for relay call

// ============================================================
// RELAY HTTP CLIENT
// ============================================================

async function relayCall(endpoint, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RELAY_TIMEOUT);

  try {
    const res = await fetch(`${RELAY_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-relay-secret': RELAY_SECRET,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`relay ${res.status}: ${text}`);
    }

    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Verify if an email inbox exists via SMTP relay.
 *
 * @param {string} email - Full email address
 * @returns {Promise<{
 *   result: 'deliverable' | 'undeliverable' | 'unknown',
 *   code: number,
 *   mxHost: string,
 *   ms: number
 * }>}
 */
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

/**
 * Detect if a domain is catch-all via SMTP relay.
 *
 * @param {string} domain
 * @returns {Promise<{ isCatchAll: boolean, result: object }>}
 */
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

/**
 * Get MX host for a domain (resolved locally, no relay needed).
 */
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
