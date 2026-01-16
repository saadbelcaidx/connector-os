/**
 * PHILEMON — UI Copy Contract
 *
 * This file defines the truth contract for all UI text.
 * NO copy may mislead users about what exists.
 *
 * RULES:
 * - "people" only after enrichment finds emails
 * - "ready to send" only in SENDABLE_READY state
 * - Never imply emails exist until they do
 */

import type { UiState } from './uiState';

// =============================================================================
// BANNED PHRASES — UI must NEVER show these
// =============================================================================

export const BANNED_PHRASES = [
  // Implies contacts exist
  'people found',
  'contacts found',
  'leads found',

  // Implies reachability
  'these will reach',
  'will be sent to',
  'ready to send', // Only allowed in SENDABLE_READY

  // Implies ownership
  'your leads',
  'your contacts',

  // Technical/scary
  'failed',
  'error',
  'something went wrong',
  'try again later',

  // Implies guarantees
  'all emails',
  'guaranteed',
];

// =============================================================================
// SAFE PHRASES BY STATE — What UI is allowed to say
// =============================================================================

export const COPY_BY_STATE: Record<UiState, {
  heading: string;
  subtext: string;
  action?: string;
}> = {
  NO_DATASETS: {
    heading: 'Load your datasets',
    subtext: 'Add demand and supply datasets to get started.',
    action: 'Upload datasets',
  },
  DEMAND_ONLY: {
    heading: 'Demand loaded',
    subtext: 'Add a supply dataset to find matches.',
    action: 'Add supply',
  },
  SUPPLY_ONLY: {
    heading: 'Supply loaded',
    subtext: 'Add a demand dataset to find matches.',
    action: 'Add demand',
  },
  DEMAND_AND_SUPPLY: {
    heading: 'Ready to match',
    subtext: 'Both datasets loaded. Start matching.',
    action: 'Find matches',
  },
  EDGE_PREFLIGHT: {
    heading: 'Analyzing timing signals',
    subtext: 'Looking for companies with real needs.',
  },
  NO_MATCHES: {
    heading: 'No timing signals found',
    subtext: 'These datasets don\'t line up right now.',
    action: 'Try different datasets',
  },
  MATCHES_FOUND: {
    heading: 'Found companies with timing',
    subtext: 'We try to find emails. Some companies have them. Some don\'t.',
    action: 'Find the right people',
  },
  ENRICHMENT_BLOCKED: {
    heading: 'Connect an email tool first',
    subtext: 'Add an API key in Settings to find emails.',
    action: 'Go to Settings',
  },
  ENRICHMENT_PARTIAL: {
    heading: 'Found emails for some',
    subtext: 'Some companies don\'t have public emails. This is normal.',
    action: 'Generate intros',
  },
  ENRICHMENT_COMPLETE: {
    heading: 'Found emails for all',
    subtext: 'All matches have contactable people.',
    action: 'Generate intros',
  },
  ENRICHMENT_EMPTY: {
    heading: 'No public emails found',
    subtext: 'This is normal for some datasets. Try different data.',
    action: 'Try different datasets',
  },
  SENDABLE_READY: {
    heading: 'Ready to route',
    subtext: 'Intros generated and ready to send.',
    action: 'Send',
  },
  SENDABLE_EMPTY: {
    heading: 'Nothing to send yet',
    subtext: 'Need emails and intros before sending.',
    action: 'Retry enrichment',
  },
};

// =============================================================================
// ERROR LABELS — Map internal codes to human text
// =============================================================================

export const ERROR_LABELS: Record<string, {
  label: string;
  fatal: boolean;
  userAction: string;
}> = {
  NO_SUPPLY_DATASET: {
    label: 'Add a supply dataset',
    fatal: false,
    userAction: 'Upload supply dataset in Settings',
  },
  ENRICHMENT_REQUIRED: {
    label: 'Find emails first',
    fatal: false,
    userAction: 'Click "Find the right people"',
  },
  NO_CANDIDATES: {
    label: 'No public email',
    fatal: false,
    userAction: 'Skip — this company doesn\'t have public emails',
  },
  NOT_FOUND: {
    label: 'No email exists',
    fatal: false,
    userAction: 'Skip — move to next',
  },
  HTTP_400: {
    label: 'Missing info to search',
    fatal: false,
    userAction: 'Check dataset has names and domains',
  },
  HTTP_401: {
    label: 'Email tool not connected',
    fatal: true,
    userAction: 'Go to Settings → add API key',
  },
  HTTP_403: {
    label: 'Access denied',
    fatal: true,
    userAction: 'Check API key permissions',
  },
  HTTP_429: {
    label: 'Rate limited',
    fatal: false,
    userAction: 'Wait a moment, then retry',
  },
  BUDGET_EXCEEDED: {
    label: 'Credits used up',
    fatal: true,
    userAction: 'Add credits or wait for reset',
  },
  TIMEOUT: {
    label: 'Search timed out',
    fatal: false,
    userAction: 'Will retry automatically',
  },
};

// =============================================================================
// DATASET EXPLANATIONS — What each scraper contains
// =============================================================================

export const DATASET_EXPLANATIONS: Record<string, {
  name: string;
  contains: string;
  missing: string;
  requires: string;
}> = {
  'startup-jobs': {
    name: 'Wellfound Jobs',
    contains: 'Job listings, company names, roles',
    missing: 'Emails, decision-maker names',
    requires: 'Enrichment to find people',
  },
  'crunchbase-orgs': {
    name: 'Crunchbase Organizations',
    contains: 'Company names, funding data, industries',
    missing: 'Emails, contacts',
    requires: 'Enrichment to find people',
  },
  'crunchbase-people': {
    name: 'Crunchbase People',
    contains: 'Names, titles, companies',
    missing: 'Emails',
    requires: 'Enrichment to find emails',
  },
  'b2b-contacts': {
    name: 'B2B Contacts',
    contains: 'Names, emails, titles, companies',
    missing: 'Nothing — full contact data',
    requires: 'Verification (emails may be stale)',
  },
};

// =============================================================================
// DEV ASSERT — Warn if banned phrase detected
// =============================================================================

export function assertNoBannedPhrases(text: string, callsite: string): void {
  if (process.env.NODE_ENV !== 'development') return;

  const lowerText = text.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lowerText.includes(phrase.toLowerCase())) {
      console.warn(
        `[PHILEMON] BANNED PHRASE DETECTED: "${phrase}" in "${text}" at ${callsite}`
      );
    }
  }
}

// =============================================================================
// HELPER: Get copy for current state
// =============================================================================

export function getCopyForState(uiState: UiState): {
  heading: string;
  subtext: string;
  action?: string;
} {
  return COPY_BY_STATE[uiState] || COPY_BY_STATE.NO_DATASETS;
}

// =============================================================================
// HELPER: Get error label
// =============================================================================

export function getErrorLabel(code: string): {
  label: string;
  fatal: boolean;
  userAction: string;
} {
  return ERROR_LABELS[code] || {
    label: 'Something unexpected happened',
    fatal: false,
    userAction: 'Refresh and try again',
  };
}

// =============================================================================
// HELPER: Get dataset explanation
// =============================================================================

export function getDatasetExplanation(schemaId: string): {
  name: string;
  contains: string;
  missing: string;
  requires: string;
} | null {
  return DATASET_EXPLANATIONS[schemaId] || null;
}
