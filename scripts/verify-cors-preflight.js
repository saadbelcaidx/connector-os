#!/usr/bin/env node
/**
 * CORS Preflight Verification Script
 *
 * Ensures CORS is correctly configured:
 * - ALLOWED: app.connector-os.com (canonical)
 * - BLOCKED: connector-os.com, www.connector-os.com, random origins
 *
 * Usage: node scripts/verify-cors-preflight.js
 * Exit code: 0 = pass, 1 = fail (blocks deployment)
 */

const https = require('https');

const API_ENDPOINT = 'https://api.connector-os.com/api/email/v2/quota';

// Only canonical origin should be allowed
const MUST_ALLOW = ['https://app.connector-os.com'];
const MUST_BLOCK = [
  'https://connector-os.com',
  'https://www.connector-os.com',
  'https://evil.com',
  'https://example.com',
];

let passed = 0;
let failed = 0;
const failures = [];

function log(status, message) {
  const icon = status === 'pass' ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`  ${icon} ${message}`);
  if (status === 'pass') passed++;
  else {
    failed++;
    failures.push(message);
  }
}

function preflight(origin) {
  return new Promise((resolve) => {
    const url = new URL(API_ENDPOINT);

    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'OPTIONS',
      headers: {
        'Origin': origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,authorization',
      },
      timeout: 10000,
    }, (res) => {
      const allowOrigin = res.headers['access-control-allow-origin'];
      resolve({
        status: res.statusCode,
        allowOrigin: allowOrigin || null,
      });
    });

    req.on('error', (err) => {
      resolve({ status: 0, allowOrigin: null, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, allowOrigin: null, error: 'timeout' });
    });

    req.end();
  });
}

async function checkMustAllow(origin) {
  const result = await preflight(origin);

  if (result.error) {
    log('fail', `${origin} → ERROR: ${result.error}`);
    return;
  }

  if (result.allowOrigin === origin || result.allowOrigin === '*') {
    log('pass', `${origin} → ALLOWED (Access-Control-Allow-Origin: ${result.allowOrigin})`);
  } else {
    log('fail', `${origin} → NOT ALLOWED (expected allow, got: ${result.allowOrigin || 'none'})`);
  }
}

async function checkMustBlock(origin) {
  const result = await preflight(origin);

  if (result.error) {
    // Connection error = effectively blocked
    log('pass', `${origin} → BLOCKED (connection error)`);
    return;
  }

  if (!result.allowOrigin || (result.allowOrigin !== origin && result.allowOrigin !== '*')) {
    log('pass', `${origin} → BLOCKED (no matching allow-origin)`);
  } else {
    log('fail', `${origin} → SHOULD BE BLOCKED but got Allow-Origin: ${result.allowOrigin}`);
  }
}

async function main() {
  console.log('\n\x1b[1mCORS Preflight Verification\x1b[0m');
  console.log(`Endpoint: ${API_ENDPOINT}\n`);

  console.log('\x1b[36m1. Origins that MUST be allowed:\x1b[0m');
  for (const origin of MUST_ALLOW) {
    await checkMustAllow(origin);
  }

  console.log('\n\x1b[36m2. Origins that MUST be blocked:\x1b[0m');
  for (const origin of MUST_BLOCK) {
    await checkMustBlock(origin);
  }

  console.log('\n\x1b[1mResults:\x1b[0m');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed > 0) {
    console.log('\n\x1b[31m✗ CORS VERIFICATION FAILED\x1b[0m');
    console.log('\x1b[31mDeployment must be blocked.\x1b[0m');
    console.log('\nFailing checks:');
    failures.forEach(f => console.log(`  - ${f}`));
    console.log('');
    process.exit(1);
  } else {
    console.log('\n\x1b[32m✓ All CORS checks passed\x1b[0m\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('\x1b[31mScript crashed:\x1b[0m', err.message);
  process.exit(1);
});
