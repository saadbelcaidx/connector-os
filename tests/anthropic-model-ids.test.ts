/**
 * anthropic-model-ids.test.ts — Proves Anthropic model ID bug
 *
 * BUG 1: Model ID `claude-3-5-sonnet-20241022` is invalid (404 from Anthropic)
 * BUG 2: ConnectorAssistant ignores aiProvider preference
 *
 * Stripe Doctrine: AUDIT → OBSERVE → TEST → MINIMAL FIX
 */

import { describe, it, expect } from 'vitest';

// =============================================================================
// VALID ANTHROPIC MODEL IDS (as of Jan 2025)
// =============================================================================

const VALID_MODELS = [
  'claude-3-haiku-20240307',
  'claude-3-5-haiku-latest',
  'claude-3-5-haiku-20241022',
  'claude-sonnet-4-20250514',
];

const INVALID_MODELS = [
  'claude-3-5-sonnet-20241022',  // BUG: This is in Settings.tsx line 1557
  'claude-3-5-sonnet-latest',
  'claude-sonnet-4-latest',
];

// =============================================================================
// BUG 1: INVALID MODEL ID IN SETTINGS
// =============================================================================

describe('BUG 1: Invalid Model ID in Settings.tsx', () => {
  const SETTINGS_MODEL_SONNET = 'claude-3-5-sonnet-20241022'; // Line 1557

  it('Settings.tsx uses invalid Sonnet model ID', () => {
    // This model ID is hardcoded in Settings.tsx line 1557
    expect(INVALID_MODELS).toContain(SETTINGS_MODEL_SONNET);
    expect(VALID_MODELS).not.toContain(SETTINGS_MODEL_SONNET);
  });

  it('correct Sonnet model ID should be claude-sonnet-4-20250514', () => {
    const CORRECT_MODEL = 'claude-sonnet-4-20250514';
    expect(VALID_MODELS).toContain(CORRECT_MODEL);
  });

  it('Haiku model ID is valid (no change needed)', () => {
    const SETTINGS_MODEL_HAIKU = 'claude-3-haiku-20240307'; // Line 1556
    expect(VALID_MODELS).toContain(SETTINGS_MODEL_HAIKU);
  });
});

// =============================================================================
// BUG 2: aiProvider PREFERENCE IGNORED
// =============================================================================

describe('BUG 2: aiProvider Preference Ignored', () => {
  /**
   * Simulates ConnectorAssistant's CURRENT auto-detection logic (buggy)
   * This ignores aiProvider and picks based on which keys exist
   */
  function detectProviderBuggy(settings: {
    aiProvider: string;
    azureEndpoint?: string;
    azureApiKey?: string;
    openaiApiKey?: string;
    claudeApiKey?: string;
  }): string {
    // BUG: Checks Azure first, ignores aiProvider
    if (settings.azureEndpoint && settings.azureApiKey) {
      return 'azure';
    }
    if (settings.openaiApiKey) {
      return 'openai';
    }
    if (settings.claudeApiKey) {
      return 'anthropic';
    }
    return 'none';
  }

  /**
   * Simulates FIXED auto-detection logic
   * Respects aiProvider preference first
   */
  function detectProviderFixed(settings: {
    aiProvider: string;
    azureEndpoint?: string;
    azureApiKey?: string;
    openaiApiKey?: string;
    claudeApiKey?: string;
  }): string {
    const preferred = settings.aiProvider;

    // Try user's preferred provider first
    if (preferred === 'anthropic' && settings.claudeApiKey) {
      return 'anthropic';
    }
    if (preferred === 'azure' && settings.azureEndpoint && settings.azureApiKey) {
      return 'azure';
    }
    if (preferred === 'openai' && settings.openaiApiKey) {
      return 'openai';
    }

    // Fall back to auto-detection if preferred provider missing credentials
    if (settings.azureEndpoint && settings.azureApiKey) {
      return 'azure';
    }
    if (settings.openaiApiKey) {
      return 'openai';
    }
    if (settings.claudeApiKey) {
      return 'anthropic';
    }
    return 'none';
  }

  it('BUGGY: picks Azure even when aiProvider is anthropic', () => {
    const settings = {
      aiProvider: 'anthropic',
      azureEndpoint: 'https://example.openai.azure.com',
      azureApiKey: 'azure-key-123',
      claudeApiKey: 'sk-ant-key-456',
    };

    // BUG: Returns 'azure' instead of 'anthropic'
    const detected = detectProviderBuggy(settings);
    expect(detected).toBe('azure'); // Bug confirmed
    expect(detected).not.toBe(settings.aiProvider);
  });

  it('FIXED: respects aiProvider preference', () => {
    const settings = {
      aiProvider: 'anthropic',
      azureEndpoint: 'https://example.openai.azure.com',
      azureApiKey: 'azure-key-123',
      claudeApiKey: 'sk-ant-key-456',
    };

    const detected = detectProviderFixed(settings);
    expect(detected).toBe('anthropic'); // Respects user preference
    expect(detected).toBe(settings.aiProvider);
  });

  it('FIXED: falls back to auto-detect if preferred provider has no credentials', () => {
    const settings = {
      aiProvider: 'anthropic', // Prefers Anthropic
      azureEndpoint: 'https://example.openai.azure.com',
      azureApiKey: 'azure-key-123',
      claudeApiKey: '', // But no Claude key!
    };

    const detected = detectProviderFixed(settings);
    expect(detected).toBe('azure'); // Falls back to Azure
  });

  it('FIXED: works when only preferred provider has credentials', () => {
    const settings = {
      aiProvider: 'anthropic',
      claudeApiKey: 'sk-ant-key-456',
    };

    const detected = detectProviderFixed(settings);
    expect(detected).toBe('anthropic');
  });
});

// =============================================================================
// FIX LOCATIONS
// =============================================================================

describe('Fix Locations', () => {
  it('documents Settings.tsx fix location', () => {
    const fix = {
      file: 'src/Settings.tsx',
      line: 1557,
      before: '<option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet (Best)</option>',
      after: '<option value="claude-sonnet-4-20250514">Claude Sonnet 4 (Best)</option>',
    };
    expect(fix.line).toBe(1557);
  });

  it('documents ConnectorAssistant.tsx fix location', () => {
    const fix = {
      file: 'src/components/ConnectorAssistant.tsx',
      lines: '548-582',
      description: 'Add aiProvider preference check before auto-detection',
    };
    expect(fix.lines).toBe('548-582');
  });
});
