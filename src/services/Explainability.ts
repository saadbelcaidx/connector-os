/**
 * EXPLAINABILITY SERVICE
 *
 * Maps validation failures into human-readable explanations with actions.
 * Premium UX: every block has a reason, fix steps, and actions.
 */

import { DOCS } from '../config/docs';

// =============================================================================
// TYPES
// =============================================================================

export type UXSeverity = 'info' | 'warning' | 'error' | 'blocking';

export type UXAction =
  | { kind: 'open_settings'; label: string; tab?: string; anchor?: string }
  | { kind: 'open_docs'; label: string; url: string }
  | { kind: 'copy_to_clipboard'; label: string; text: string }
  | { kind: 'export_audit'; label: string }
  | { kind: 'retry'; label: string }
  | { kind: 'contact_support'; label: string };

export interface UXExplanation {
  id: string;
  severity: UXSeverity;
  title: string;
  reason: string;
  fix: string[];
  actions?: UXAction[];
  details?: {
    technical?: string;
    context?: Record<string, unknown>;
  };
}

// =============================================================================
// INPUT CONTRACTS
// =============================================================================

export type UXBlock =
  | { type: 'MODE_MISSING' }
  | { type: 'DATASET_INVALID'; side: 'demand' | 'supply'; message: string; hint?: string; raw?: unknown }
  | { type: 'DATASET_EMPTY'; side: 'demand' | 'supply'; parsedCount: number; expectedFields?: string[] }
  | { type: 'COPY_BLOCKED'; failures: Array<{ code: string; message: string; meta?: unknown }> }
  | { type: 'EVIDENCE_REQUIRED'; claim: 'hiring' | 'funding' | 'tech' | 'partnership'; missing: string[]; record?: unknown }
  | { type: 'CONFIG_MISSING'; key: 'apify_token' | 'demand_dataset_id' | 'supply_dataset_id' | 'instantly_api_key' | 'campaign_id' | 'calendar_link' }
  | { type: 'SEND_NOT_POSSIBLE'; reason: string; meta?: unknown }
  | { type: 'COUNT_DISCREPANCY'; loaded: number; sendable: number; timedOut?: number; missingEmail?: number; unverified?: number; blocked?: number }
  | { type: 'LANE_CROSSING'; direction: 'demand_in_supply' | 'supply_in_demand'; phrase?: string }
  | { type: 'UNKNOWN_ERROR'; message: string; stack?: string };

export interface ExplainContext {
  mode?: string;
  side?: 'demand' | 'supply';
}

// =============================================================================
// STABLE ERROR CODES
// =============================================================================

export const ERROR_CODES = {
  MODE_MISSING: 'MODE_MISSING',
  DATASET_INVALID_DEMAND: 'DATASET_INVALID_DEMAND',
  DATASET_INVALID_SUPPLY: 'DATASET_INVALID_SUPPLY',
  DATASET_EMPTY_DEMAND: 'DATASET_EMPTY_DEMAND',
  DATASET_EMPTY_SUPPLY: 'DATASET_EMPTY_SUPPLY',
  COPY_FORBIDDEN_WORD_HIRING: 'COPY_FORBIDDEN_WORD_HIRING',
  COPY_FORBIDDEN_WORD_RECRUITING: 'COPY_FORBIDDEN_WORD_RECRUITING',
  COPY_FORBIDDEN_WORD_STAFFING: 'COPY_FORBIDDEN_WORD_STAFFING',
  COPY_TOO_SHORT: 'COPY_TOO_SHORT',
  COPY_MISSING_GREETING: 'COPY_MISSING_GREETING',
  LANE_CROSSING_DEMAND_PHRASE_IN_SUPPLY: 'LANE_CROSSING_DEMAND_PHRASE_IN_SUPPLY',
  LANE_CROSSING_SUPPLY_PHRASE_IN_DEMAND: 'LANE_CROSSING_SUPPLY_PHRASE_IN_DEMAND',
  EVIDENCE_REQUIRED_JOB: 'EVIDENCE_REQUIRED_JOB',
  EVIDENCE_REQUIRED_FUNDING: 'EVIDENCE_REQUIRED_FUNDING',
  EVIDENCE_REQUIRED_TECH: 'EVIDENCE_REQUIRED_TECH',
  EVIDENCE_REQUIRED_PARTNERSHIP: 'EVIDENCE_REQUIRED_PARTNERSHIP',
  CONFIG_MISSING_DEMAND_CSV: 'CONFIG_MISSING_DEMAND_CSV',
  CONFIG_MISSING_DEMAND_DATASET: 'CONFIG_MISSING_DEMAND_DATASET',
  CONFIG_MISSING_SUPPLY_DATASET: 'CONFIG_MISSING_SUPPLY_DATASET',
  CONFIG_MISSING_INSTANTLY_KEY: 'CONFIG_MISSING_INSTANTLY_KEY',
  CONFIG_MISSING_CAMPAIGN_ID: 'CONFIG_MISSING_CAMPAIGN_ID',
  CONFIG_MISSING_CALENDAR_LINK: 'CONFIG_MISSING_CALENDAR_LINK',
  COUNT_DISCREPANCY_SENDABLE: 'COUNT_DISCREPANCY_SENDABLE',
  SEND_NOT_POSSIBLE: 'SEND_NOT_POSSIBLE',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

// =============================================================================
// MAPPING FUNCTION
// =============================================================================

export function explain(block: UXBlock, ctx: ExplainContext = {}): UXExplanation {
  switch (block.type) {
    case 'MODE_MISSING':
      return {
        id: ERROR_CODES.MODE_MISSING,
        severity: 'blocking',
        title: 'Connector mode not set',
        reason: 'A connector mode is required to ensure the right language and filters are applied.',
        fix: [
          'Go to Settings',
          'Select your connector mode (IT Recruitment, Biotech, B2B, etc.)',
          'Save and return to Flow',
        ],
        actions: [
          { kind: 'open_settings', label: 'Open Settings', tab: 'general' },
          { kind: 'open_docs', label: 'Learn about modes', url: DOCS.modes },
        ],
      };

    case 'DATASET_INVALID':
      return {
        id: block.side === 'demand' ? ERROR_CODES.DATASET_INVALID_DEMAND : ERROR_CODES.DATASET_INVALID_SUPPLY,
        severity: 'error',
        title: `Invalid ${block.side} dataset`,
        reason: block.message || 'The dataset could not be parsed or contains invalid data.',
        fix: [
          'Check that your Apify dataset ID is correct',
          'Verify the scraper ran successfully in Apify',
          block.hint || 'Ensure the dataset contains the required fields',
        ],
        actions: [
          { kind: 'open_settings', label: 'Check Settings', tab: 'data' },
          { kind: 'open_docs', label: 'Supported scrapers', url: DOCS.supportedScrapers },
        ],
        details: block.raw ? { context: { raw: block.raw } } : undefined,
      };

    case 'DATASET_EMPTY':
      return {
        id: block.side === 'demand' ? ERROR_CODES.DATASET_EMPTY_DEMAND : ERROR_CODES.DATASET_EMPTY_SUPPLY,
        severity: 'error',
        title: `No usable ${block.side} records found`,
        reason: `Loaded ${block.parsedCount} records but none matched the required schema.`,
        fix: [
          'Verify your Apify scraper is configured correctly',
          block.expectedFields?.length
            ? `Expected fields: ${block.expectedFields.join(', ')}`
            : 'Check that records have company name and domain/URL',
          'Try a different scraper or dataset',
        ],
        actions: [
          { kind: 'open_docs', label: 'Supported scrapers', url: DOCS.supportedScrapers },
          { kind: 'retry', label: 'Retry fetch' },
        ],
        details: {
          technical: `Parsed: ${block.parsedCount}, Valid: 0`,
          context: { expectedFields: block.expectedFields },
        },
      };

    case 'COPY_BLOCKED':
      return explainCopyBlocked(block.failures, ctx);

    case 'EVIDENCE_REQUIRED':
      return explainEvidenceRequired(block.claim, block.missing, ctx);

    case 'LANE_CROSSING':
      return {
        id: block.direction === 'demand_in_supply'
          ? ERROR_CODES.LANE_CROSSING_DEMAND_PHRASE_IN_SUPPLY
          : ERROR_CODES.LANE_CROSSING_SUPPLY_PHRASE_IN_DEMAND,
        severity: 'error',
        title: 'Lane crossing detected',
        reason: block.direction === 'demand_in_supply'
          ? 'Demand-side language was used in supply copy. This confuses the recipient.'
          : 'Supply-side language was used in demand copy. This confuses the recipient.',
        fix: [
          'Review your copy for lane-specific phrases',
          block.direction === 'demand_in_supply'
            ? 'Remove phrases like "I know someone who could help" from supply messages'
            : 'Remove phrases like "got a lead" from demand messages',
          'Use language appropriate for the recipient side',
        ],
        actions: [
          { kind: 'open_docs', label: 'Learn about lanes', url: DOCS.lanes },
        ],
        details: block.phrase ? { technical: `Detected phrase: "${block.phrase}"` } : undefined,
      };

    case 'CONFIG_MISSING':
      return explainConfigMissing(block.key);

    case 'SEND_NOT_POSSIBLE':
      return {
        id: ERROR_CODES.SEND_NOT_POSSIBLE,
        severity: 'blocking',
        title: 'Cannot send',
        reason: block.reason,
        fix: [
          'Check that all required configuration is set',
          'Verify your Instantly API key and campaign ID',
          'Ensure records have valid email addresses',
        ],
        actions: [
          { kind: 'open_settings', label: 'Check Settings', tab: 'outreach' },
        ],
        details: block.meta ? { context: block.meta as Record<string, unknown> } : undefined,
      };

    case 'COUNT_DISCREPANCY':
      return {
        id: ERROR_CODES.COUNT_DISCREPANCY_SENDABLE,
        severity: 'warning',
        title: 'Not all records are sendable',
        reason: `Loaded ${block.loaded} records but only ${block.sendable} can be sent.`,
        fix: [
          block.missingEmail ? `${block.missingEmail} records missing email addresses` : '',
          block.blocked ? `${block.blocked} records blocked by validation` : '',
          block.timedOut ? `${block.timedOut} records timed out during enrichment` : '',
          block.unverified ? `${block.unverified} records with unverified emails` : '',
          'Run enrichment to find missing emails',
        ].filter(Boolean),
        actions: [
          { kind: 'export_audit', label: 'Export details' },
        ],
        details: {
          context: {
            loaded: block.loaded,
            sendable: block.sendable,
            missingEmail: block.missingEmail,
            blocked: block.blocked,
            timedOut: block.timedOut,
            unverified: block.unverified,
          },
        },
      };

    case 'UNKNOWN_ERROR':
      return {
        id: ERROR_CODES.UNKNOWN_ERROR,
        severity: 'error',
        title: 'Something went wrong',
        reason: block.message || 'An unexpected error occurred.',
        fix: [
          'Try refreshing the page',
          'Check your internet connection',
          'If the problem persists, export debug info and contact support',
        ],
        actions: [
          { kind: 'retry', label: 'Retry' },
          { kind: 'export_audit', label: 'Export debug info' },
          { kind: 'contact_support', label: 'Contact support' },
        ],
        details: block.stack ? { technical: block.stack } : undefined,
      };

    default:
      return {
        id: ERROR_CODES.UNKNOWN_ERROR,
        severity: 'error',
        title: 'Unknown issue',
        reason: 'An unrecognized error occurred.',
        fix: ['Try refreshing the page', 'Contact support if the issue persists'],
        actions: [{ kind: 'retry', label: 'Retry' }],
      };
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function explainCopyBlocked(
  failures: Array<{ code: string; message: string; meta?: unknown }>,
  ctx: ExplainContext
): UXExplanation {
  // Find the most important failure
  const primary = failures[0];
  if (!primary) {
    return {
      id: 'COPY_BLOCKED_UNKNOWN',
      severity: 'error',
      title: 'Copy blocked',
      reason: 'The message failed validation.',
      fix: ['Review your message content', 'Check for forbidden words'],
      actions: [],
    };
  }

  // Map specific codes to explanations
  if (primary.code.includes('hiring') || primary.code.includes('HIRING')) {
    return {
      id: ERROR_CODES.COPY_FORBIDDEN_WORD_HIRING,
      severity: 'blocking',
      title: 'Blocked: "hiring" requires evidence',
      reason: `In ${ctx.mode || 'this'} mode, using "hiring" requires job posting evidence.`,
      fix: [
        'Add a job posting URL to prove hiring activity',
        'Or remove "hiring" from your message',
        'Or switch to Recruiting mode if appropriate',
      ],
      actions: [
        { kind: 'open_docs', label: 'Evidence requirements', url: DOCS.jobSignal },
        { kind: 'open_settings', label: 'Change mode', tab: 'general' },
      ],
      details: {
        technical: `Code: ${primary.code}`,
        context: primary.meta as Record<string, unknown>,
      },
    };
  }

  if (primary.code.includes('recruiting') || primary.code.includes('RECRUITING')) {
    return {
      id: ERROR_CODES.COPY_FORBIDDEN_WORD_RECRUITING,
      severity: 'blocking',
      title: 'Blocked: "recruiting" not allowed',
      reason: `In ${ctx.mode || 'this'} mode, recruiting language is forbidden.`,
      fix: [
        'Remove recruiting-related words',
        'Use mode-appropriate language instead',
        'Check your connector mode setting',
      ],
      actions: [
        { kind: 'open_docs', label: 'Mode vocabulary', url: DOCS.modeAnchor(ctx.mode || 'recruiting') },
      ],
    };
  }

  if (primary.code.includes('short') || primary.code.includes('SHORT')) {
    return {
      id: ERROR_CODES.COPY_TOO_SHORT,
      severity: 'warning',
      title: 'Message too short',
      reason: 'Messages should be at least 2 sentences for credibility.',
      fix: [
        'Add more context to your message',
        'Include a clear call to action',
        'Aim for 30-500 characters',
      ],
      actions: [],
    };
  }

  if (primary.code.includes('greeting') || primary.code.includes('GREETING')) {
    return {
      id: ERROR_CODES.COPY_MISSING_GREETING,
      severity: 'warning',
      title: 'Missing greeting',
      reason: 'Messages should start with a personalized greeting.',
      fix: [
        'Start with "Hey [Name]" or similar',
        'Avoid generic openings like "Hey there"',
      ],
      actions: [],
    };
  }

  if (primary.code.includes('lane') || primary.code.includes('LANE')) {
    const isDemandInSupply = primary.code.includes('demand');
    return {
      id: isDemandInSupply
        ? ERROR_CODES.LANE_CROSSING_DEMAND_PHRASE_IN_SUPPLY
        : ERROR_CODES.LANE_CROSSING_SUPPLY_PHRASE_IN_DEMAND,
      severity: 'error',
      title: 'Lane crossing detected',
      reason: primary.message || 'Message contains language for the wrong side.',
      fix: [
        'Review your message for side-specific phrases',
        'Demand side: "I know someone who could help"',
        'Supply side: "got a lead", "got an opportunity"',
      ],
      actions: [
        { kind: 'open_docs', label: 'About lanes', url: DOCS.lanes },
      ],
    };
  }

  // Generic copy blocked
  return {
    id: 'COPY_BLOCKED',
    severity: 'error',
    title: 'Message blocked',
    reason: primary.message || 'The message failed validation.',
    fix: [
      'Review your message content',
      'Check for forbidden words in your mode',
      'Ensure proper formatting',
    ],
    actions: [],
    details: {
      technical: failures.map(f => `${f.code}: ${f.message}`).join('\n'),
    },
  };
}

function explainEvidenceRequired(
  claim: 'hiring' | 'funding' | 'tech' | 'partnership',
  missing: string[],
  ctx: ExplainContext
): UXExplanation {
  const claimMap: Record<string, { id: string; title: string; evidence: string[]; doc: string }> = {
    hiring: {
      id: ERROR_CODES.EVIDENCE_REQUIRED_JOB,
      title: '"Hiring" claim requires evidence',
      evidence: ['Job posting URL', 'Scraped job title', 'Open roles count > 0'],
      doc: DOCS.jobSignal,
    },
    funding: {
      id: ERROR_CODES.EVIDENCE_REQUIRED_FUNDING,
      title: '"Funding" claim requires evidence',
      evidence: ['Funding round (Series A, B, etc.)', 'Funding amount', 'News source URL'],
      doc: DOCS.fundingSignal,
    },
    tech: {
      id: ERROR_CODES.EVIDENCE_REQUIRED_TECH,
      title: '"Tech stack" claim requires evidence',
      evidence: ['Tech stack field from dataset', 'Job posting mentioning tech'],
      doc: DOCS.evidence,
    },
    partnership: {
      id: ERROR_CODES.EVIDENCE_REQUIRED_PARTNERSHIP,
      title: '"Partnership" claim requires evidence',
      evidence: ['Partnership announcement URL', 'News source'],
      doc: DOCS.evidence,
    },
  };

  const info = claimMap[claim] || claimMap.hiring;

  return {
    id: info.id,
    severity: 'blocking',
    title: info.title,
    reason: `You mentioned "${claim}" but no evidence was found in the data.`,
    fix: [
      `Provide one of: ${info.evidence.join(', ')}`,
      'Or remove the claim from your message',
      'Or use a different signal that has evidence',
    ],
    actions: [
      { kind: 'open_docs', label: 'Evidence requirements', url: info.doc },
    ],
    details: {
      technical: `Missing: ${missing.join(', ')}`,
      context: { claim, missing, mode: ctx.mode },
    },
  };
}

function explainConfigMissing(key: string): UXExplanation {
  const configMap: Record<string, { id: string; title: string; reason: string; tab: string }> = {
    demand_csv: {
      id: ERROR_CODES.CONFIG_MISSING_DEMAND_CSV,
      title: 'Demand CSV missing',
      reason: 'A demand CSV upload is required to load companies.',
      tab: 'data',
    },
    demand_dataset_id: {
      id: ERROR_CODES.CONFIG_MISSING_DEMAND_DATASET,
      title: 'Demand dataset not configured',
      reason: 'A demand dataset ID is required to load companies.',
      tab: 'data',
    },
    supply_dataset_id: {
      id: ERROR_CODES.CONFIG_MISSING_SUPPLY_DATASET,
      title: 'Supply dataset not configured',
      reason: 'A supply dataset ID is required to load providers.',
      tab: 'data',
    },
    instantly_api_key: {
      id: ERROR_CODES.CONFIG_MISSING_INSTANTLY_KEY,
      title: 'Instantly API key missing',
      reason: 'An Instantly API key is required to send emails.',
      tab: 'outreach',
    },
    campaign_id: {
      id: ERROR_CODES.CONFIG_MISSING_CAMPAIGN_ID,
      title: 'Campaign not selected',
      reason: 'Select a campaign to send emails to.',
      tab: 'outreach',
    },
    calendar_link: {
      id: ERROR_CODES.CONFIG_MISSING_CALENDAR_LINK,
      title: 'Calendar link missing',
      reason: 'A calendar link is recommended for scheduling calls.',
      tab: 'general',
    },
  };

  const info = configMap[key] || {
    id: `CONFIG_MISSING_${key.toUpperCase()}`,
    title: `${key} not configured`,
    reason: `The ${key.replace(/_/g, ' ')} setting is required.`,
    tab: 'general',
  };

  return {
    id: info.id,
    severity: 'blocking',
    title: info.title,
    reason: info.reason,
    fix: [
      'Go to Settings',
      `Navigate to the ${info.tab} section`,
      `Enter your ${key.replace(/_/g, ' ')}`,
    ],
    actions: [
      { kind: 'open_settings', label: 'Open Settings', tab: info.tab },
    ],
  };
}

// =============================================================================
// UTILITY: Group multiple blocks into summary
// =============================================================================

export function summarizeBlocks(blocks: UXBlock[], ctx: ExplainContext = {}): {
  total: number;
  byType: Record<string, number>;
  topExplanations: UXExplanation[];
} {
  const byType: Record<string, number> = {};
  const explanations: UXExplanation[] = [];

  for (const block of blocks) {
    byType[block.type] = (byType[block.type] || 0) + 1;
  }

  // Get unique explanations (max 5)
  const seen = new Set<string>();
  for (const block of blocks) {
    if (seen.size >= 5) break;
    const exp = explain(block, ctx);
    if (!seen.has(exp.id)) {
      seen.add(exp.id);
      explanations.push(exp);
    }
  }

  return {
    total: blocks.length,
    byType,
    topExplanations: explanations,
  };
}
