/**
 * STRATEGIC ALIGNMENT PLATFORM — CONSTANTS
 * Enterprise language strings and configuration.
 * Reference: Spec Section 7 (Enterprise Language)
 */

import type { ModeOption, SignalSourceConfig, SignalSource } from './types';

// =============================================================================
// ENTERPRISE LANGUAGE — UI COPY
// =============================================================================

export const PLATFORM_COPY = {
  // Page titles
  PAGE_TITLE: 'Strategic Alignment Platform',
  PAGE_SUBTITLE: 'Access-controlled network intelligence for client engagements',

  // Mode selection
  MODE_SELECTOR_TITLE: 'Who is on the call with you?',
  MODE_DEMAND_TITLE: 'Organization seeking providers',
  MODE_DEMAND_DESCRIPTION: 'Company looking for service providers, consultants, or partners',
  MODE_SUPPLY_TITLE: 'Provider seeking clients',
  MODE_SUPPLY_DESCRIPTION: 'Service provider looking for organizations to serve',

  // Loading states
  LOADING_CONFIG: 'Loading platform configuration...',
  ANALYZING_STEP_1: 'Analyzing signal sources...',
  ANALYZING_STEP_2: 'Identifying strategic alignments...',
  ANALYZING_STEP_3: 'Preparing results...',

  // Results
  RESULTS_TITLE: 'Strategic alignments identified',
  RESULTS_EMPTY: 'No strategic alignments identified',
  RESULTS_EMPTY_DESCRIPTION: 'Criteria may be too narrow. Consider expanding parameters.',

  // Errors
  ERROR_CONFIG: 'Unable to load platform configuration',
  ERROR_NETWORK: 'Connection interrupted',
  ERROR_RATE_LIMITED: 'Analysis limit reached',
  ERROR_RATE_LIMITED_DESCRIPTION: 'Daily analysis quota has been reached. Resets at midnight UTC.',

  // Actions
  ACTION_ANALYZE: 'Analyze',
  ACTION_RETRY: 'Retry analysis',
  ACTION_MODIFY_CRITERIA: 'Modify criteria',
  ACTION_BACK: 'Back',

  // Signal badges
  SIGNAL_HIRING: 'Active talent acquisition',
  SIGNAL_FUNDING: 'Recent capital event',
  SIGNAL_CLINICAL: 'Clinical trial activity',
  SIGNAL_GRANT: 'Research grant awarded',
  SIGNAL_CONTRACT: 'Federal contract awarded',

  // Tiers
  TIER_PREMIER: 'Premier alignment',
  TIER_STRONG: 'Strong alignment',
  TIER_GOOD: 'Good alignment',
} as const;

// =============================================================================
// MODE OPTIONS
// =============================================================================

export const MODE_OPTIONS: ModeOption[] = [
  {
    id: 'demand',
    title: PLATFORM_COPY.MODE_DEMAND_TITLE,
    description: PLATFORM_COPY.MODE_DEMAND_DESCRIPTION,
    icon: 'Building2',
  },
  {
    id: 'supply',
    title: PLATFORM_COPY.MODE_SUPPLY_TITLE,
    description: PLATFORM_COPY.MODE_SUPPLY_DESCRIPTION,
    icon: 'Users',
  },
];

// =============================================================================
// SIGNAL SOURCES
// =============================================================================

export const SIGNAL_SOURCES: SignalSourceConfig[] = [
  {
    id: 'funded_startups',
    name: 'Recently Funded',
    description: 'Companies with recent capital events',
    icon: 'TrendingUp',
    color: 'text-emerald-400',
    enabled: true,
  },
  {
    id: 'clinical_trials',
    name: 'Clinical Trials',
    description: 'Biotech and pharma trial activity',
    icon: 'Heart',
    color: 'text-rose-400',
    enabled: true,
  },
  {
    id: 'nih_grants',
    name: 'Research Grants',
    description: 'NIH and research institution awards',
    icon: 'GraduationCap',
    color: 'text-amber-400',
    enabled: true,
  },
  {
    id: 'federal_contracts',
    name: 'Federal Contracts',
    description: 'Government contract awards',
    icon: 'Landmark',
    color: 'text-violet-400',
    enabled: true,
  },
  {
    id: 'job_signals',
    name: 'Hiring Activity',
    description: 'Companies actively recruiting',
    icon: 'Users',
    color: 'text-blue-400',
    enabled: true,
  },
];

// =============================================================================
// SIGNAL BADGE CONFIGURATION
// =============================================================================

export const SIGNAL_BADGE_CONFIG: Record<SignalSource, { icon: string; color: string; label: string }> = {
  funded_startups: {
    icon: 'TrendingUp',
    color: 'text-emerald-400',
    label: 'Funding',
  },
  clinical_trials: {
    icon: 'Heart',
    color: 'text-rose-400',
    label: 'Clinical',
  },
  nih_grants: {
    icon: 'GraduationCap',
    color: 'text-amber-400',
    label: 'Grant',
  },
  federal_contracts: {
    icon: 'Landmark',
    color: 'text-violet-400',
    label: 'Contract',
  },
  job_signals: {
    icon: 'Users',
    color: 'text-blue-400',
    label: 'Hiring',
  },
};

// =============================================================================
// TIER CONFIGURATION
// =============================================================================

export const TIER_CONFIG = {
  premier: {
    minScore: 80,
    label: PLATFORM_COPY.TIER_PREMIER,
    bgClass: 'bg-amber-500/10',
    textClass: 'text-amber-400',
    borderClass: 'border-amber-500/20',
  },
  strong: {
    minScore: 60,
    label: PLATFORM_COPY.TIER_STRONG,
    bgClass: 'bg-white/10',
    textClass: 'text-white/90',
    borderClass: 'border-white/20',
  },
  good: {
    minScore: 40,
    label: PLATFORM_COPY.TIER_GOOD,
    bgClass: 'bg-white/5',
    textClass: 'text-white/70',
    borderClass: 'border-white/10',
  },
} as const;

// =============================================================================
// RESERVED SLUGS
// =============================================================================

export const RESERVED_SLUGS = [
  'admin',
  'api',
  'app',
  'demo',
  'help',
  'platform',
  'support',
  'www',
  'test',
  'staging',
];

// =============================================================================
// RATE LIMITS
// =============================================================================

export const RATE_LIMITS = {
  SEARCHES_PER_DAY: 100,
  RESULTS_PER_SEARCH: 5,
} as const;

// =============================================================================
// BANNED WORDS (for validation)
// =============================================================================

export const BANNED_WORDS = [
  'hey',
  'hi',
  'hello',
  'cool',
  'great',
  'awesome',
  'oops',
  'whoops',
  'just',
  'super',
  'really',
] as const;
