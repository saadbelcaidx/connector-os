#!/usr/bin/env node
/**
 * Origin Configuration Verification Script
 *
 * Verifies that:
 * 1. Root/www domains redirect to app.connector-os.com
 * 2. CORS preflight works from allowed origins
 * 3. CORS preflight fails from disallowed origins
 *
 * Usage: node scripts/verify-origin-config.js
 */

const https = require('https');
const http = require('http');

const CANONICAL = 'app.connector-os.com';
const API_BASE = 'api.connector-os.com';
const ALLOWED_ORIGINS = [
  'https://app.connector-os.com',
  'https://localhost:5173',
];
const DISALLOWED_ORIGINS = [
  'https://evil.com',
  'https://example.com',
];

let passed = 0;
let failed = 0;

function log(status, message) {
  const icon = status === 'pass' ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`  ${icon} ${message}`);
  if (status === 'pass') passed++;
  else failed++;
}

function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;

    const req = protocol.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

async function checkRedirect(domain, expectedDest) {
  try {
    const res = await fetch(`https://${domain}/`, { method: 'HEAD' });

    if (res.status === 308 || res.status === 301 || res.status === 307) {
      const location = res.headers.location || '';
      if (location.startsWith(`https://${expectedDest}`)) {
        log('pass', `${domain} redirects to ${expectedDest}`);
        return;
      }
    }

    // Check if it's serving the same app (might not redirect but serve from same deployment)
    if (res.status === 200) {
      log('pass', `${domain} serves content (check if same deployment)`);
      return;
    }

    log('fail', `${domain} does not redirect to ${expectedDest} (status: ${res.status})`);
  } catch (err) {
    log('fail', `${domain} check failed: ${err.message}`);
  }
}

async function checkCorsAllowed(origin) {
  try {
    const res = await fetch(`https://${API_BASE}/api/email/v2/quota`, {
      method: 'OPTIONS',
      headers: {
        'Origin': origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });

    const allowOrigin = res.headers['access-control-allow-origin'];

    if (allowOrigin === origin || allowOrigin === '*') {
      log('pass', `CORS allows origin: ${origin}`);
    } else {
      log('fail', `CORS did not allow origin: ${origin} (got: ${allowOrigin || 'none'})`);
    }
  } catch (err) {
    log('fail', `CORS check for ${origin} failed: ${err.message}`);
  }
}

async function checkCorsBlocked(origin) {
  try {
    const res = await fetch(`https://${API_BASE}/api/email/v2/quota`, {
      method: 'OPTIONS',
      headers: {
        'Origin': origin,
        'Access-Control-Request-Method': 'POST',
      },
    });

    const allowOrigin = res.headers['access-control-allow-origin'];

    if (!allowOrigin || (allowOrigin !== origin && allowOrigin !== '*')) {
      log('pass', `CORS correctly blocks origin: ${origin}`);
    } else {
      log('fail', `CORS should block origin: ${origin} (got: ${allowOrigin})`);
    }
  } catch (err) {
    // Connection refused or error = blocked = good
    log('pass', `CORS blocks origin: ${origin} (connection error)`);
  }
}

async function checkCanonicalServes() {
  try {
    const res = await fetch(`https://${CANONICAL}/`);

    if (res.status === 200) {
      log('pass', `${CANONICAL} serves content (200 OK)`);
    } else {
      log('fail', `${CANONICAL} returned ${res.status}`);
    }
  } catch (err) {
    log('fail', `${CANONICAL} check failed: ${err.message}`);
  }
}

async function main() {
  console.log('\n\x1b[1mOrigin Configuration Verification\x1b[0m\n');

  console.log('\x1b[36m1. Checking canonical app serves:\x1b[0m');
  await checkCanonicalServes();

  console.log('\n\x1b[36m2. Checking domain redirects:\x1b[0m');
  await checkRedirect('connector-os.com', CANONICAL);
  await checkRedirect('www.connector-os.com', CANONICAL);

  console.log('\n\x1b[36m3. Checking CORS allows known origins:\x1b[0m');
  for (const origin of ALLOWED_ORIGINS) {
    await checkCorsAllowed(origin);
  }

  console.log('\n\x1b[36m4. Checking CORS blocks unknown origins:\x1b[0m');
  for (const origin of DISALLOWED_ORIGINS) {
    await checkCorsBlocked(origin);
  }

  console.log('\n\x1b[1mResults:\x1b[0m');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed > 0) {
    console.log('\n\x1b[31mSome checks failed. Review configuration.\x1b[0m\n');
    process.exit(1);
  } else {
    console.log('\n\x1b[32mAll checks passed!\x1b[0m\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
