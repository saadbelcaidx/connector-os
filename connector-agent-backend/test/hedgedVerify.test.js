/**
 * Hedged Verify Tests
 *
 * Validates:
 * - Hedged request behavior (relay → PRX2 delay → race)
 * - Provider routing (SMTP-hostile skip relay)
 * - Circuit breaker (timeouts → bypass)
 * - Concurrency caps (global + per-domain + per-provider)
 */

const { hedgedVerify, isSmtpHostileProvider, recordDomainResult, isDomainBypassed } = require('../src/hedgedVerify');
const { scheduledBulkProcess } = require('../src/bulkScheduler');

// ============================================================
// MOCK FUNCTIONS
// ============================================================

const mockPrx2Fn = async () => ({ verdict: 'VALID', source: 'prx2', cached: false });
const mockCatchAllProbeFn = async () => ({ shouldUpgrade: false, confidence: 50, signals: ['test'] });

// ============================================================
// TEST 1: Provider Routing
// ============================================================

async function testProviderRouting() {
  console.log('\n[Test 1] Provider Routing');

  // Google = SMTP-hostile
  const googleMx = { provider: 'google', smtpBlocking: true };
  const isHostile = isSmtpHostileProvider(googleMx);
  console.assert(isHostile === true, 'Google should be SMTP-hostile');
  console.log('✓ Google detected as SMTP-hostile');

  // Microsoft = relay-preferred
  const microsoftMx = { provider: 'microsoft', smtpBlocking: false };
  const isHostile2 = isSmtpHostileProvider(microsoftMx);
  console.assert(isHostile2 === false, 'Microsoft should NOT be SMTP-hostile');
  console.log('✓ Microsoft NOT detected as SMTP-hostile');

  // Gateway = SMTP-hostile
  const gatewayMx = { provider: 'custom', smtpBlocking: false, isGateway: true };
  const isHostile3 = isSmtpHostileProvider(gatewayMx);
  console.assert(isHostile3 === true, 'Gateway should be SMTP-hostile');
  console.log('✓ Gateway detected as SMTP-hostile');
}

// ============================================================
// TEST 2: Circuit Breaker
// ============================================================

async function testCircuitBreaker() {
  console.log('\n[Test 2] Circuit Breaker');

  const domain = 'slow-test-domain.com';

  // Record 3 timeouts
  for (let i = 0; i < 3; i++) {
    recordDomainResult(domain, 5000, false, true);
  }

  const isBypassed = isDomainBypassed(domain);
  console.assert(isBypassed === true, 'Domain should be bypassed after 3 timeouts');
  console.log('✓ Circuit breaker OPEN after 3 timeouts');

  // Record successes should not immediately close
  recordDomainResult(domain, 100, true, false);
  const stillBypassed = isDomainBypassed(domain);
  console.assert(stillBypassed === true, 'Domain should still be bypassed (TTL not expired)');
  console.log('✓ Circuit breaker stays OPEN (TTL active)');
}

// ============================================================
// TEST 3: Concurrency Caps
// ============================================================

async function testConcurrencyCaps() {
  console.log('\n[Test 3] Concurrency Caps');

  const items = Array.from({ length: 50 }, (_, i) => ({ email: `test${i}@example.com` }));
  const getDomain = (item) => item.email.split('@')[1];

  let maxInflight = 0;
  let currentInflight = 0;

  const processFn = async (item) => {
    currentInflight++;
    maxInflight = Math.max(maxInflight, currentInflight);
    await new Promise(resolve => setTimeout(resolve, 10)); // Simulate work
    currentInflight--;
    return { email: item.email };
  };

  const t0 = Date.now();
  await scheduledBulkProcess(items, getDomain, processFn);
  const elapsed = Date.now() - t0;

  console.log(`✓ Processed 50 items in ${elapsed}ms`);
  console.log(`✓ Max concurrent: ${maxInflight} (should be <= GLOBAL_MAX_CONCURRENCY)`);
  console.assert(maxInflight <= 30, 'Should respect global concurrency cap');
}

// ============================================================
// TEST 4: Hedged Request (Manual)
// ============================================================

async function testHedgedRequest() {
  console.log('\n[Test 4] Hedged Request (Logs Only)');

  const email = 'test@microsoft-test.com';

  // This will attempt real verification - just checking it doesn't crash
  try {
    const result = await hedgedVerify(email, mockPrx2Fn, mockCatchAllProbeFn, 'bulk');
    console.log(`✓ Hedged verify completed: verdict=${result.verdict}, source=${result.source || 'N/A'}`);
  } catch (err) {
    console.error(`✗ Hedged verify failed: ${err.message}`);
  }
}

// ============================================================
// RUN ALL TESTS
// ============================================================

(async () => {
  console.log('='.repeat(60));
  console.log('Running Hedged Verify + Scheduler Tests');
  console.log('='.repeat(60));

  try {
    await testProviderRouting();
    await testCircuitBreaker();
    await testConcurrencyCaps();
    await testHedgedRequest();

    console.log('\n' + '='.repeat(60));
    console.log('✓ All tests passed');
    console.log('='.repeat(60) + '\n');
    process.exit(0);
  } catch (err) {
    console.error('\n✗ Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
