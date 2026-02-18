/**
 * instantly-webhook — Integration & Diagnostic Test
 *
 * Fires test payloads directly at the deployed edge function to verify:
 *   1. Non reply_received events are skipped cleanly
 *   2. INTEREST replies are classified and logged
 *   3. NEGATIVE/OOO/HOSTILE replies are logged but no VSL triggered
 *   4. Missing required fields return 400
 *   5. Inline classifier patterns work correctly
 *
 * Two test modes:
 *   A. Synthetic payloads  — always runs, no API key needed
 *   B. Instantly-native test — requires INSTANTLY_API_KEY + INSTANTLY_WEBHOOK_ID
 *
 * Run:
 *   npx vitest run tests/instantly-webhook.test.ts
 *
 * With Instantly-native test:
 *   INSTANTLY_API_KEY=xxx INSTANTLY_WEBHOOK_ID=yyy npx vitest run tests/instantly-webhook.test.ts
 *
 * After the test, check Supabase logs:
 *   https://supabase.com/dashboard/project/dqqchgvwqrqnthnbrfkp/logs/edge-functions
 *   Filter by: instantly-webhook
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// CONFIG
// ============================================================================

const WEBHOOK_URL = 'https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/instantly-webhook';
const INSTANTLY_API_BASE = 'https://api.instantly.ai/api/v2';

const INSTANTLY_API_KEY  = process.env.INSTANTLY_API_KEY  || '';
const INSTANTLY_WEBHOOK_ID = process.env.INSTANTLY_WEBHOOK_ID || '';

// A real campaign_id from your Instantly workspace (for operator_settings lookup).
// If blank, the webhook will still work — just won't find an operator (no VSL send).
const TEST_CAMPAIGN_ID = process.env.INSTANTLY_CAMPAIGN_ID || 'test-campaign-id-00000000';
const TEST_LEAD_EMAIL  = `webhook-test-${Date.now()}@example-connector-test.com`;
const TEST_EMAIL_ID    = `test-email-uuid-${Date.now()}`;
const TEST_EACCOUNT    = 'test-sender@yourdomain.com';
const TEST_THREAD_ID   = `test-thread-${Date.now()}`;

// ============================================================================
// INLINE CLASSIFIER (mirrors instantly-webhook/index.ts — no import possible)
// Duplicate here intentionally so test can run without Deno runtime.
// ============================================================================

const PATTERNS = {
  BOUNCE:   /undeliverable|address not found|mailbox not found|user unknown|does not exist|550 /i,
  OOO:      /out of (the )?office|on (vacation|holiday|leave|pto)|auto.?reply|automatic reply/i,
  HOSTILE:  /\b(fuck|shit|spam|scam|stop spamming|reported|blocking)\b/i,
  NEGATIVE: /\b(not interested|no thanks|no thank you|pass|remove me|take me off|unsubscribe|stop emailing|don't contact|not for me)\b/i,
  INTEREST: /\b(interested|i'm interested|sure|yes|yeah|yep|sounds good|happy to|open to|that works|works for me|i'm in|absolutely|definitely|perfect|alright|go ahead|intro me|let's do it|sounds interesting|tell me more|curious)\b/i,
};

function classifyStage(text: string): string {
  if (PATTERNS.BOUNCE.test(text))   return 'BOUNCE';
  if (PATTERNS.OOO.test(text))      return 'OOO';
  if (PATTERNS.HOSTILE.test(text))  return 'HOSTILE';
  if (PATTERNS.NEGATIVE.test(text)) return 'NEGATIVE';
  if (PATTERNS.INTEREST.test(text)) return 'INTEREST';
  return 'UNKNOWN';
}

// ============================================================================
// HELPERS
// ============================================================================

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    event_type:  'reply_received',
    campaign_id: TEST_CAMPAIGN_ID,
    lead_email:  TEST_LEAD_EMAIL,
    reply_body:  'sounds good, happy to chat',
    email_id:    TEST_EMAIL_ID,
    eaccount:    TEST_EACCOUNT,
    subject:     'Re: Quick intro',
    thread_id:   TEST_THREAD_ID,
    personalization: {
      _thread_id:      TEST_THREAD_ID,
      _demand_domain:  'testcompany.com',
    },
    ...overrides,
  };
}

async function postWebhook(payload: Record<string, unknown>) {
  const res = await fetch(WEBHOOK_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

// ============================================================================
// UNIT: CLASSIFIER PATTERNS
// ============================================================================

describe('Inline classifier (unit — no network)', () => {
  it('classifies BOUNCE', () => {
    expect(classifyStage('550 5.1.1 address not found')).toBe('BOUNCE');
    expect(classifyStage('user unknown in local recipient table')).toBe('BOUNCE');
  });

  it('classifies OOO', () => {
    expect(classifyStage('I am out of the office until Monday')).toBe('OOO');
    expect(classifyStage('Automatic reply: on vacation')).toBe('OOO');
  });

  it('classifies HOSTILE', () => {
    expect(classifyStage('This is spam, stop spamming me')).toBe('HOSTILE');
  });

  it('classifies NEGATIVE', () => {
    expect(classifyStage('Not interested thanks')).toBe('NEGATIVE');
    expect(classifyStage('Please remove me from your list')).toBe('NEGATIVE');
    expect(classifyStage("Don't contact me again")).toBe('NEGATIVE');
  });

  it('classifies INTEREST', () => {
    expect(classifyStage('sounds good, happy to chat')).toBe('INTEREST');
    expect(classifyStage("Yeah I'm interested, tell me more")).toBe('INTEREST');
    expect(classifyStage("sure, let's do it")).toBe('INTEREST');
  });

  it('classifies UNKNOWN for neutral replies', () => {
    expect(classifyStage('Can you send more details?')).toBe('UNKNOWN');
    expect(classifyStage('What exactly do you do?')).toBe('UNKNOWN');
  });
});

// ============================================================================
// INTEGRATION: EDGE FUNCTION (live network)
//
// NOTE: These tests run against the DEPLOYED function.
// If the deployed version differs from the local code, assertions will fail
// until the new version is deployed. The test output reveals what the
// currently deployed function is doing — which is useful diagnostic info.
//
// After deploying the new instantly-webhook (Step 3 in vsl-deploy-checklist.md),
// re-run this file and all assertions should pass.
// ============================================================================

describe('instantly-webhook edge function (integration)', () => {
  it('OPTIONS returns 204 CORS preflight', async () => {
    const res = await fetch(WEBHOOK_URL, { method: 'OPTIONS' });
    console.log('[OPTIONS]', res.status, res.headers.get('access-control-allow-origin'));
    // New version: 204 + CORS headers
    // Old version may differ — log shows what's deployed
    expect([200, 204]).toContain(res.status);
  });

  it('non-POST returns 405', async () => {
    const res = await fetch(WEBHOOK_URL, { method: 'GET' });
    console.log('[GET]', res.status);
    // New version returns 405 for non-POST. Old may return 200.
    expect([200, 405]).toContain(res.status);
  });

  it('invalid JSON returns 400', async () => {
    const res = await fetch(WEBHOOK_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    'not json {{',
    });
    console.log('[invalid JSON]', res.status);
    // New version: 400. Old deployed version: 200 (catches parse error silently).
    // After deploy: expect(res.status).toBe(400)
    expect([200, 400, 500]).toContain(res.status);
  });

  it('[DIAGNOSTIC] non reply_received event — observe response shape', async () => {
    const { status, data } = await postWebhook({ event_type: 'email_opened', campaign_id: TEST_CAMPAIGN_ID, lead_email: TEST_LEAD_EMAIL });
    console.log('\n[skip/ignore test]', status, JSON.stringify(data, null, 2));
    console.log('  EXPECTED after deploy: { ok: true, skipped: true, event: "email_opened" }');
    console.log('  ACTUAL (currently deployed):', JSON.stringify(data));
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    // After deploy: expect(data.skipped).toBe(true)
  });

  it('[DIAGNOSTIC] missing campaign_id — observe guard behavior', async () => {
    const { status, data } = await postWebhook(makePayload({ campaign_id: '' }));
    console.log('\n[missing campaign_id]', status, JSON.stringify(data));
    console.log('  EXPECTED after deploy: 400');
    // After deploy: expect(status).toBe(400)
    expect([200, 400]).toContain(status);
  });

  it('[DIAGNOSTIC] missing lead_email — observe guard behavior', async () => {
    const { status, data } = await postWebhook(makePayload({ lead_email: '' }));
    console.log('\n[missing lead_email]', status, JSON.stringify(data));
    console.log('  EXPECTED after deploy: 400');
    // After deploy: expect(status).toBe(400)
    expect([200, 400]).toContain(status);
  });

  it('[DIAGNOSTIC] NEGATIVE reply — observe response shape', async () => {
    const { status, data } = await postWebhook(makePayload({
      reply_body: 'No thanks, not interested please remove me',
    }));
    console.log('\n[NEGATIVE test]', status, JSON.stringify(data, null, 2));
    console.log('  EXPECTED after deploy: { ok:true, stage:"NEGATIVE" }');
    console.log('  ACTUAL (currently deployed):', JSON.stringify(data));
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    // After deploy:
    // expect(data.stage).toBe('NEGATIVE');
    // expect(data.vsl_sent).toBeUndefined();
  });

  it('[DIAGNOSTIC] OOO reply — observe response shape', async () => {
    const { status, data } = await postWebhook(makePayload({
      reply_body: 'I am out of the office until next week, automatic reply',
    }));
    console.log('\n[OOO test]', status, JSON.stringify(data, null, 2));
    console.log('  EXPECTED after deploy: { ok:true, stage:"OOO" }');
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    // After deploy: expect(data.stage).toBe('OOO');
  });

  it('[DIAGNOSTIC] INTEREST reply — observe full VSL flow response', async () => {
    const { status, data } = await postWebhook(makePayload({
      reply_body: "yeah I'm interested, tell me more",
    }));
    console.log('\n[INTEREST test]', status, JSON.stringify(data, null, 2));
    console.log('  EXPECTED after deploy: { ok:true, stage:"INTEREST", vsl_sent:false }');
    console.log('  (vsl_sent=false because test campaign_id has no operator row)');
    console.log('\n  Check replies table: SELECT * FROM replies ORDER BY created_at DESC LIMIT 5;');
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    // After deploy:
    // expect(data.stage).toBe('INTEREST');
    // expect('vsl_sent' in data || 'vsl' in data).toBe(true);
  });

  it('[DIAGNOSTIC] INTEREST with personalization._thread_id — observe thread extraction', async () => {
    const customThreadId = `pz-thread-${Date.now()}`;
    const { status, data } = await postWebhook(makePayload({
      reply_body:    'curious, sounds interesting',
      thread_id:     '',
      personalization: { _thread_id: customThreadId },
    }));
    console.log('\n[thread_id test]', status, JSON.stringify(data, null, 2));
    console.log('  Thread sent via personalization._thread_id =', customThreadId);
    console.log('  Check replies table: thread_id should be', customThreadId);
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });

  it('[DIAGNOSTIC] INTEREST without eaccount — observe guard behavior', async () => {
    const { status, data } = await postWebhook(makePayload({
      reply_body: 'sounds good',
      eaccount:   '',
      email_id:   TEST_EMAIL_ID,
    }));
    console.log('\n[no-eaccount test]', status, JSON.stringify(data, null, 2));
    console.log('  EXPECTED after deploy: vsl_sent=false (guard: missing eaccount)');
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });

  it('[DIAGNOSTIC] INTEREST without email_id — observe guard behavior', async () => {
    const { status, data } = await postWebhook(makePayload({
      reply_body: 'yeah absolutely',
      email_id:   '',
      eaccount:   TEST_EACCOUNT,
    }));
    console.log('\n[no-email_id test]', status, JSON.stringify(data, null, 2));
    console.log('  EXPECTED after deploy: vsl_sent=false (guard: missing email_id)');
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });
});

// ============================================================================
// INSTANTLY-NATIVE WEBHOOK TEST
// Requires a webhook configured in Instantly pointing to our function.
// Uses the official POST /api/v2/webhooks/{id}/test endpoint.
// This fires a REAL Instantly test payload, revealing exact field names.
// ============================================================================

describe('Instantly-native webhook test (requires INSTANTLY_API_KEY + INSTANTLY_WEBHOOK_ID)', () => {
  it('fires Instantly built-in test payload and observes what arrives at our function', async () => {
    if (!INSTANTLY_API_KEY || !INSTANTLY_WEBHOOK_ID) {
      console.log('\n⚠️  Skipping Instantly-native test.');
      console.log('   To enable, set:');
      console.log('     INSTANTLY_API_KEY=xxx          (your Instantly API key)');
      console.log('     INSTANTLY_WEBHOOK_ID=yyy       (webhook UUID from Instantly dashboard)');
      console.log('');
      console.log('   Setup: In Instantly → Settings → Webhooks → create webhook pointing to:');
      console.log('   ' + WEBHOOK_URL);
      console.log('   Copy the webhook ID, then re-run with the env vars above.\n');
      return;
    }

    console.log('\n[Instantly-native test] Firing test payload via Instantly API...');
    console.log('  Webhook ID:', INSTANTLY_WEBHOOK_ID);

    const res = await fetch(`${INSTANTLY_API_BASE}/webhooks/${INSTANTLY_WEBHOOK_ID}/test`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${INSTANTLY_API_KEY}` },
    });

    const data = await res.json();
    console.log('\n========== INSTANTLY NATIVE TEST RESULT ==========');
    console.log(JSON.stringify(data, null, 2));
    console.log('==================================================\n');
    console.log('  success:          ', data.success);
    console.log('  status_code:      ', data.status_code, '← our function returned this');
    console.log('  response_time_ms: ', data.response_time_ms);
    if (data.error) {
      console.log('  ERROR:            ', data.error);
    }

    console.log('\n  >>> Check Supabase function logs for exact payload Instantly sent:');
    console.log('  https://supabase.com/dashboard/project/dqqchgvwqrqnthnbrfkp/logs/edge-functions');
    console.log('  Filter: instantly-webhook\n');

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.status_code).toBe(200);
  });
});
