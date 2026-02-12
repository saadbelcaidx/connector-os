/**
 * SMTP Verifier — Direct RCPT TO verification
 *
 * Opens a raw SMTP connection to the target MX server,
 * performs EHLO → MAIL FROM → RCPT TO → QUIT.
 * Never sends DATA. No email sent. Just checks if inbox exists.
 *
 * Response codes:
 *   250 = inbox exists (deliverable)
 *   550/551/552/553 = inbox doesn't exist (undeliverable)
 *   451/452/4xx = greylisted or temp failure (unknown)
 *   421 = server busy / connection refused (unknown)
 */

const net = require('net');
const dns = require('dns');
const { promisify } = require('util');

const resolveMx = promisify(dns.resolveMx);

const EHLO_DOMAIN = 'verify.connector-os.com';
const MAIL_FROM = 'probe@connector-os.com';
const CONNECT_TIMEOUT = 10000;  // 10s to connect
const COMMAND_TIMEOUT = 10000;  // 10s per SMTP command
const TOTAL_TIMEOUT = 30000;    // 30s total budget

// ============================================================
// MX RESOLUTION
// ============================================================

async function getMxHost(domain) {
  try {
    const records = await resolveMx(domain);
    if (!records || records.length === 0) return null;
    // Sort by priority (lowest = highest priority)
    records.sort((a, b) => a.priority - b.priority);
    return records[0].exchange;
  } catch (err) {
    console.log(`[SMTPVerify] MX resolve failed for ${domain}: ${err.code || err.message}`);
    return null;
  }
}

// ============================================================
// SMTP SESSION
// ============================================================

function smtpSession(mxHost, email) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let resolved = false;
    let buffer = '';
    let step = 'connect'; // connect → ehlo → mail_from → rcpt_to → quit

    function finish(result) {
      if (resolved) return;
      resolved = true;
      result.ms = Date.now() - startTime;
      result.mxHost = mxHost;
      try { socket.destroy(); } catch (_) {}
      resolve(result);
    }

    // Total timeout
    const totalTimer = setTimeout(() => {
      finish({ result: 'unknown', code: 0, message: 'total_timeout', step });
    }, TOTAL_TIMEOUT);

    const socket = net.createConnection({ host: mxHost, port: 25, timeout: CONNECT_TIMEOUT });

    socket.setEncoding('utf8');

    socket.on('timeout', () => {
      finish({ result: 'unknown', code: 0, message: 'connect_timeout', step });
    });

    socket.on('error', (err) => {
      finish({ result: 'unknown', code: 0, message: err.code || err.message, step });
    });

    socket.on('close', () => {
      if (!resolved) {
        finish({ result: 'unknown', code: 0, message: 'connection_closed', step });
      }
    });

    function sendCommand(cmd) {
      socket.write(cmd + '\r\n');
    }

    function getCode(line) {
      const match = line.match(/^(\d{3})/);
      return match ? parseInt(match[1], 10) : 0;
    }

    socket.on('data', (data) => {
      buffer += data;

      // SMTP responses can be multiline (xxx-text). Wait for final line (xxx space)
      const lines = buffer.split('\r\n');
      const lastComplete = lines.slice(0, -1);
      buffer = lines[lines.length - 1];

      for (const line of lastComplete) {
        if (!line) continue;
        const code = getCode(line);
        // Only process final line of multiline response (code + space, not code + dash)
        const isFinal = /^\d{3} /.test(line);
        if (!isFinal && /^\d{3}-/.test(line)) continue;

        if (step === 'connect') {
          if (code === 220) {
            step = 'ehlo';
            sendCommand(`EHLO ${EHLO_DOMAIN}`);
          } else {
            finish({ result: 'unknown', code, message: line, step });
          }
        } else if (step === 'ehlo') {
          if (code === 250) {
            step = 'mail_from';
            sendCommand(`MAIL FROM:<${MAIL_FROM}>`);
          } else {
            finish({ result: 'unknown', code, message: line, step });
          }
        } else if (step === 'mail_from') {
          if (code === 250) {
            step = 'rcpt_to';
            sendCommand(`RCPT TO:<${email}>`);
          } else {
            finish({ result: 'unknown', code, message: line, step });
          }
        } else if (step === 'rcpt_to') {
          step = 'quit';
          sendCommand('QUIT');

          if (code === 250) {
            finish({ result: 'deliverable', code, message: line, step: 'rcpt_to' });
          } else if (code >= 550 && code <= 559) {
            finish({ result: 'undeliverable', code, message: line, step: 'rcpt_to' });
          } else if (code >= 400 && code < 500) {
            finish({ result: 'unknown', code, message: line, step: 'rcpt_to' });
          } else {
            finish({ result: 'unknown', code, message: line, step: 'rcpt_to' });
          }
        } else if (step === 'quit') {
          // Don't care about QUIT response, already resolved
        }
      }
    });

    // Clean up total timer on resolve
    const origFinish = finish;
    finish = (result) => {
      clearTimeout(totalTimer);
      origFinish(result);
    };
  });
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Verify if an email inbox exists via direct SMTP RCPT TO.
 *
 * @param {string} email - Full email address
 * @returns {Promise<{
 *   result: 'deliverable' | 'undeliverable' | 'unknown',
 *   code: number,
 *   message: string,
 *   mxHost: string,
 *   ms: number
 * }>}
 */
async function verifyInboxSMTP(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) {
    return { result: 'unknown', code: 0, message: 'invalid_email', mxHost: null, ms: 0 };
  }

  const mxHost = await getMxHost(domain);
  if (!mxHost) {
    return { result: 'undeliverable', code: 0, message: 'no_mx_records', mxHost: null, ms: 0 };
  }

  console.log(`[SMTPVerify] ${email} → MX: ${mxHost}`);
  const result = await smtpSession(mxHost, email);
  console.log(`[SMTPVerify] ${email} → ${result.result} (${result.code}) ${result.ms}ms`);
  return result;
}

/**
 * Detect if a domain is catch-all by testing a gibberish address.
 * If gibberish gets 250, the domain accepts everything.
 *
 * @param {string} domain
 * @returns {Promise<{ isCatchAll: boolean, result: object }>}
 */
async function detectCatchAllSMTP(domain) {
  const gibberish = `xq7z9probe${Date.now()}@${domain}`;
  const result = await verifyInboxSMTP(gibberish);

  return {
    isCatchAll: result.result === 'deliverable',
    result,
  };
}

module.exports = {
  verifyInboxSMTP,
  detectCatchAllSMTP,
  getMxHost,
};
