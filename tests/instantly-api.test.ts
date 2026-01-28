/**
 * Instantly API Integration Test
 *
 * DIAGNOSTIC: Observe actual Instantly API v2 response format
 *
 * Run with: npx vitest run tests/instantly-api.test.ts
 *
 * Requires environment variables:
 *   INSTANTLY_API_KEY - Your Instantly API key
 *   INSTANTLY_CAMPAIGN_ID - A valid campaign ID to test with
 */

import { describe, it, expect } from 'vitest';

const EDGE_URL = 'https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/instantly-proxy';

// Test credentials - set via environment or hardcode for one-time test
const API_KEY = process.env.INSTANTLY_API_KEY || '';
const CAMPAIGN_ID = process.env.INSTANTLY_CAMPAIGN_ID || '';

describe('Instantly API Response Format', () => {
  it('should reveal actual API response structure', async () => {
    if (!API_KEY || !CAMPAIGN_ID) {
      console.log('\n⚠️  Skipping - set INSTANTLY_API_KEY and INSTANTLY_CAMPAIGN_ID to run\n');
      console.log('Example:');
      console.log('  INSTANTLY_API_KEY=xxx INSTANTLY_CAMPAIGN_ID=yyy npx vitest run tests/instantly-api.test.ts\n');
      return;
    }

    // Use a clearly fake test email that won't pollute real campaigns
    const testPayload = {
      campaign: CAMPAIGN_ID,
      email: `test-diagnostic-${Date.now()}@example-test-domain-fake.com`,
      first_name: 'Test',
      last_name: 'Diagnostic',
      company_name: 'Test Company',
      website: 'example.com',
      personalization: 'This is a diagnostic test - please ignore',
      skip_if_in_workspace: true,
      skip_if_in_campaign: true,
      skip_if_in_list: true,
    };

    console.log('\n========== INSTANTLY API DIAGNOSTIC ==========');
    console.log('Calling edge function:', EDGE_URL);
    console.log('Payload:', JSON.stringify(testPayload, null, 2));
    console.log('===============================================\n');

    const response = await fetch(EDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiKey: API_KEY,
        payload: testPayload,
      }),
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    const data = await response.json();

    console.log('\n========== RAW INSTANTLY RESPONSE ==========');
    console.log(JSON.stringify(data, null, 2));
    console.log('=============================================\n');

    console.log('Response analysis:');
    console.log('  - Keys present:', Object.keys(data));
    console.log('  - Has "status":', 'status' in data, '→', data.status);
    console.log('  - Has "resultStatus":', 'resultStatus' in data, '→', data.resultStatus);
    console.log('  - Has "error":', 'error' in data, '→', data.error);
    console.log('  - Has "lead_id":', 'lead_id' in data, '→', data.lead_id);
    console.log('  - Has "id":', 'id' in data, '→', data.id);
    console.log('  - Has "message":', 'message' in data, '→', data.message);

    // Don't fail the test - we just want to observe
    expect(true).toBe(true);
  });

  it('should test with invalid campaign ID to see error format', async () => {
    if (!API_KEY) {
      console.log('\n⚠️  Skipping - set INSTANTLY_API_KEY to run\n');
      return;
    }

    const testPayload = {
      campaign: 'invalid-campaign-id-12345',
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      company_name: 'Test',
      website: '',
      personalization: 'Test',
      skip_if_in_workspace: true,
      skip_if_in_campaign: true,
      skip_if_in_list: true,
    };

    console.log('\n========== ERROR RESPONSE DIAGNOSTIC ==========');
    console.log('Testing with INVALID campaign ID to see error format');
    console.log('=================================================\n');

    const response = await fetch(EDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiKey: API_KEY,
        payload: testPayload,
      }),
    });

    console.log('Response status:', response.status);

    const data = await response.json();

    console.log('\n========== ERROR RESPONSE ==========');
    console.log(JSON.stringify(data, null, 2));
    console.log('=====================================\n');

    console.log('Error analysis:');
    console.log('  - Keys present:', Object.keys(data));
    console.log('  - Has "error":', 'error' in data);
    console.log('  - Has "status":', 'status' in data);
    console.log('  - Has "message":', 'message' in data);

    expect(true).toBe(true);
  });
});
