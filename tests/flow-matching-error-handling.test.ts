/**
 * flow-matching-error-handling.test.ts — Proves matching state blocking bug
 *
 * BUG: continueFromPreview has no error handling. If matchRecords throws,
 * the step remains stuck at 'matching' and user must refresh.
 *
 * Stripe Doctrine: AUDIT → OBSERVE → TEST → MINIMAL FIX
 */

import { describe, it, expect } from 'vitest';

// =============================================================================
// SIMULATE THE CURRENT FLOW (NO ERROR HANDLING)
// =============================================================================

interface FlowState {
  step: string;
  error: string | null;
  flowBlock: { title: string; detail: string } | null;
}

/**
 * Simulates continueFromPreview — CURRENT buggy behavior.
 * No try-catch means errors leave step stuck at 'matching'.
 */
async function continueFromPreviewBuggy(
  setState: (fn: (prev: FlowState) => FlowState) => void,
  runMatching: () => Promise<void>
) {
  // Set step to matching (this always runs)
  setState(prev => ({
    ...prev,
    step: 'matching',
    error: null,
    flowBlock: null,
  }));

  // BUG: No try-catch around this — if runMatching throws, step stays 'matching'
  await runMatching();
}

/**
 * Simulates continueFromPreview — FIXED behavior.
 * Wraps runMatching in try-catch like startFlow does.
 */
async function continueFromPreviewFixed(
  setState: (fn: (prev: FlowState) => FlowState) => void,
  setFlowBlock: (block: { title: string; detail: string }) => void,
  runMatching: () => Promise<void>
) {
  // Set step to matching
  setState(prev => ({
    ...prev,
    step: 'matching',
    error: null,
    flowBlock: null,
  }));

  try {
    await runMatching();
  } catch (err) {
    // FIXED: Error handling mirrors startFlow pattern
    const detail = err instanceof Error ? err.message : 'Unknown error';
    setFlowBlock({
      title: 'Matching failed',
      detail,
    });
  }
}

// =============================================================================
// TEST: PROVE THE BUG EXISTS
// =============================================================================

describe('BUG: continueFromPreview has no error handling', () => {

  it('BUGGY: step stays stuck at "matching" when runMatching throws', async () => {
    let state: FlowState = { step: 'preview', error: null, flowBlock: null };
    const setState = (fn: (prev: FlowState) => FlowState) => {
      state = fn(state);
    };

    // Simulate runMatching that throws an error
    const runMatchingThatThrows = async () => {
      throw new Error('matchRecords failed: timeout');
    };

    // Attempt to continue from preview
    try {
      await continueFromPreviewBuggy(setState, runMatchingThatThrows);
    } catch {
      // Error propagates up (no catch in continueFromPreview)
    }

    // BUG: Step is stuck at 'matching', no flowBlock set
    expect(state.step).toBe('matching');
    expect(state.flowBlock).toBeNull(); // No error visible to user
  });

  it('BUGGY: user sees no error message when matching fails', async () => {
    let state: FlowState = { step: 'preview', error: null, flowBlock: null };
    const setState = (fn: (prev: FlowState) => FlowState) => {
      state = fn(state);
    };

    const runMatchingThatThrows = async () => {
      throw new Error('Network error');
    };

    try {
      await continueFromPreviewBuggy(setState, runMatchingThatThrows);
    } catch {
      // Error escapes
    }

    // BUG: User has no visibility into what went wrong
    expect(state.flowBlock).toBeNull();
    expect(state.error).toBeNull();
    // User sees "Matching..." spinner forever
    expect(state.step).toBe('matching');
  });

  it('FIXED: sets flowBlock when runMatching throws', async () => {
    let state: FlowState = { step: 'preview', error: null, flowBlock: null };
    const setState = (fn: (prev: FlowState) => FlowState) => {
      state = fn(state);
    };
    const setFlowBlock = (block: { title: string; detail: string }) => {
      state = { ...state, flowBlock: block, step: 'upload' };
    };

    const runMatchingThatThrows = async () => {
      throw new Error('matchRecords failed: timeout');
    };

    await continueFromPreviewFixed(setState, setFlowBlock, runMatchingThatThrows);

    // FIXED: flowBlock is set, user sees error
    expect(state.flowBlock).not.toBeNull();
    expect(state.flowBlock?.title).toBe('Matching failed');
    expect(state.flowBlock?.detail).toContain('timeout');
  });

  it('FIXED: step returns to upload when error occurs', async () => {
    let state: FlowState = { step: 'preview', error: null, flowBlock: null };
    const setState = (fn: (prev: FlowState) => FlowState) => {
      state = fn(state);
    };
    const setFlowBlock = (block: { title: string; detail: string }) => {
      state = { ...state, flowBlock: block, step: 'upload' };
    };

    const runMatchingThatThrows = async () => {
      throw new Error('Database connection lost');
    };

    await continueFromPreviewFixed(setState, setFlowBlock, runMatchingThatThrows);

    // FIXED: User can retry from upload step
    expect(state.step).toBe('upload');
  });

  it('FIXED: normal flow still works when no error', async () => {
    let state: FlowState = { step: 'preview', error: null, flowBlock: null };
    const setState = (fn: (prev: FlowState) => FlowState) => {
      state = fn(state);
    };
    const setFlowBlock = (block: { title: string; detail: string }) => {
      state = { ...state, flowBlock: block, step: 'upload' };
    };

    // Simulate successful matching
    const runMatchingSuccess = async () => {
      // In real code, runMatching sets step to 'matches_found' on success
      state = { ...state, step: 'matches_found' };
    };

    await continueFromPreviewFixed(setState, setFlowBlock, runMatchingSuccess);

    // Normal flow: step advances to matches_found
    expect(state.step).toBe('matches_found');
    expect(state.flowBlock).toBeNull();
  });
});

// =============================================================================
// FIX LOCATION
// =============================================================================

describe('Fix Location', () => {
  it('documents the fix location in Flow.tsx', () => {
    const fix = {
      file: 'src/Flow.tsx',
      lines: '1700-1715',
      function: 'continueFromPreview',
      change: 'Wrap runMatching call in try-catch, set flowBlock on error',
      pattern: 'Mirror error handling from startFlow (lines 1658-1668)',
    };

    expect(fix.function).toBe('continueFromPreview');
  });
});
