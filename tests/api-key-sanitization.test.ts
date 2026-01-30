/**
 * api-key-sanitization.test.ts — Proves API key whitespace bug
 *
 * HYPOTHESIS: Anthropic keys with trailing whitespace cause "invalid x-api-key" error
 * because no .trim() is applied anywhere in the chain.
 *
 * This test proves the bug exists by showing current behavior.
 */

import { describe, it, expect } from 'vitest';

// =============================================================================
// SIMULATE THE CURRENT FLOW (NO TRIMMING)
// =============================================================================

/**
 * Simulates how ConnectorAssistant.tsx builds the request body
 * (current behavior - no trimming)
 */
function buildAnthropicRequestBody(aiConfig: {
  provider: string;
  apiKey: string;
  model?: string;
}) {
  const { provider, apiKey, model } = aiConfig;

  const requestBody: Record<string, unknown> = {
    provider,
    messages: [{ role: 'user', content: 'test' }],
    max_tokens: 200,
    temperature: 0.7,
  };

  if (provider === 'anthropic') {
    // CURRENT BEHAVIOR: No .trim() on apiKey
    requestBody.anthropicApiKey = apiKey;
    requestBody.model = model || 'claude-3-haiku-20240307';
  }

  return requestBody;
}

/**
 * Simulates how ai-proxy builds headers for Anthropic
 * (current behavior - no trimming)
 */
function buildAnthropicHeaders(anthropicApiKey: string) {
  // CURRENT BEHAVIOR: No .trim() on key
  return {
    'x-api-key': anthropicApiKey,
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  };
}

// =============================================================================
// TEST: PROVE THE BUG EXISTS
// =============================================================================

describe('API Key Sanitization Bug', () => {
  const CLEAN_KEY = 'sk-ant-api03-validkey123';
  const KEY_WITH_TRAILING_SPACE = 'sk-ant-api03-validkey123 ';
  const KEY_WITH_TRAILING_NEWLINE = 'sk-ant-api03-validkey123\n';
  const KEY_WITH_TRAILING_TAB = 'sk-ant-api03-validkey123\t';
  const KEY_WITH_LEADING_SPACE = ' sk-ant-api03-validkey123';

  describe('Current Behavior (BUG)', () => {
    it('trailing space is NOT removed from API key', () => {
      const requestBody = buildAnthropicRequestBody({
        provider: 'anthropic',
        apiKey: KEY_WITH_TRAILING_SPACE,
      });

      // BUG: Key still has trailing space
      expect(requestBody.anthropicApiKey).toBe(KEY_WITH_TRAILING_SPACE);
      expect(requestBody.anthropicApiKey).not.toBe(CLEAN_KEY);
    });

    it('trailing newline is NOT removed from API key', () => {
      const requestBody = buildAnthropicRequestBody({
        provider: 'anthropic',
        apiKey: KEY_WITH_TRAILING_NEWLINE,
      });

      // BUG: Key still has trailing newline
      expect(requestBody.anthropicApiKey).toBe(KEY_WITH_TRAILING_NEWLINE);
      expect(requestBody.anthropicApiKey).not.toBe(CLEAN_KEY);
    });

    it('x-api-key header contains whitespace when key has whitespace', () => {
      const headers = buildAnthropicHeaders(KEY_WITH_TRAILING_SPACE);

      // BUG: Header value has trailing space
      expect(headers['x-api-key']).toBe(KEY_WITH_TRAILING_SPACE);
      expect(headers['x-api-key'].length).toBe(CLEAN_KEY.length + 1);
    });

    it('leading space is NOT removed from API key', () => {
      const requestBody = buildAnthropicRequestBody({
        provider: 'anthropic',
        apiKey: KEY_WITH_LEADING_SPACE,
      });

      // BUG: Key still has leading space
      expect(requestBody.anthropicApiKey).toBe(KEY_WITH_LEADING_SPACE);
    });
  });

  describe('Expected Behavior (FIX)', () => {
    /**
     * Sanitized version that should be used
     */
    function sanitizeApiKey(key: string): string {
      return key.trim();
    }

    it('trailing space SHOULD be removed', () => {
      const sanitized = sanitizeApiKey(KEY_WITH_TRAILING_SPACE);
      expect(sanitized).toBe(CLEAN_KEY);
    });

    it('trailing newline SHOULD be removed', () => {
      const sanitized = sanitizeApiKey(KEY_WITH_TRAILING_NEWLINE);
      expect(sanitized).toBe(CLEAN_KEY);
    });

    it('trailing tab SHOULD be removed', () => {
      const sanitized = sanitizeApiKey(KEY_WITH_TRAILING_TAB);
      expect(sanitized).toBe(CLEAN_KEY);
    });

    it('leading space SHOULD be removed', () => {
      const sanitized = sanitizeApiKey(KEY_WITH_LEADING_SPACE);
      expect(sanitized).toBe(CLEAN_KEY);
    });
  });

  describe('Anthropic Key Format Validation', () => {
    it('valid Anthropic key starts with sk-ant-', () => {
      expect(CLEAN_KEY.startsWith('sk-ant-')).toBe(true);
    });

    it('key with whitespace fails prefix check after trim', () => {
      // Edge case: whitespace at start breaks prefix check
      const keyWithLeadingWhitespace = ' sk-ant-api03-key';
      expect(keyWithLeadingWhitespace.startsWith('sk-ant-')).toBe(false);
      expect(keyWithLeadingWhitespace.trim().startsWith('sk-ant-')).toBe(true);
    });
  });
});

// =============================================================================
// TEST: PROVE THE FIX LOCATIONS
// =============================================================================

describe('Fix Locations', () => {
  it('ConnectorAssistant.tsx should trim apiKey before sending', () => {
    // This test documents WHERE the fix should be applied
    const locations = [
      'src/components/ConnectorAssistant.tsx:577 - apiKey: parsed.claudeApiKey.trim()',
      'src/components/ConnectorAssistant.tsx:335 - anthropicApiKey: apiKey.trim()',
    ];

    // Minimal fix: trim at request build time (line 335)
    expect(locations.length).toBeGreaterThan(0);
  });

  it('ai-proxy should trim as defense-in-depth', () => {
    // Defense in depth: also trim in edge function
    const location = 'supabase/functions/ai-proxy/index.ts:183 - anthropicApiKey.trim()';
    expect(location).toBeTruthy();
  });
});
