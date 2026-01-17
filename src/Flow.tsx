/**
 * FLOW — The Core Product
 *
 * Two scrapers. Known fields. Templates. Matching brain.
 *
 * Pipeline: VALIDATE → MATCH → ENRICH → INTRO → ROUTE
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Workflow, ArrowLeft, Pencil, X, Check, Star, EyeOff, ArrowRight, ChevronRight, Info } from 'lucide-react';
import Dock from './Dock';
import { useAuth } from './AuthContext';
import { supabase } from './lib/supabase';

// New architecture
import { validateDataset, validateSupplyDataset, normalizeDataset, NormalizedRecord, Schema } from './schemas';
import { matchRecords, MatchingResult, filterByScore } from './matching';
import {
  enrichRecord,
  enrichBatch,
  EnrichmentConfig,
  EnrichmentResult,
  EnrichmentOutcome,
  isSuccessfulEnrichment,
  getOutcomeExplanation,
  getActionExplanation,
  recordKey,
} from './enrichment';
import { generateDemandIntro, generateSupplyIntro } from './templates';

// Deterministic Pipeline Components — Edge Preflight + Compose
import { detectEdge } from './matching/EdgeDetector';
import { composeIntros } from './matching/Composer';
import type { DemandRecord } from './schemas/DemandRecord';
import type { SupplyRecord } from './schemas/SupplyRecord';
import type { Edge } from './schemas/Edge';
import type { Counterparty } from './schemas/IntroOutput';

// AI Config type
import { AIConfig } from './services/AIService';

// INTRO RELIABILITY CONTRACT — Stripe-level infrastructure
// Layer 0: Deterministic base (always runs first, always succeeds)
// Layer 1: AI enhancement (best effort, non-blocking)
import {
  generateIntroWithAI,
  IntroRequest,
} from './services/IntroReliability';

// Sender Adapter (Instantly, Plusvibe, etc.)
import { resolveSender, buildSenderConfig, SenderAdapter, SenderConfig } from './services/senders';

// Connector Hub Adapter (side-channel - does NOT modify existing flow)
import { isFromHub, hasHubContacts, getHubBothSides, clearHubContacts } from './services/ConnectorHubAdapter';

// Supply Annotations — Operator judgment persistence (render-only, no matching impact)
import {
  SupplyAnnotation,
  fingerprintFromSupply,
  fetchAllUserAnnotations,
  toggleStarred,
  toggleExcluded,
  getGuestAnnotations,
  saveGuestAnnotation,
} from './services/SupplyAnnotationService';

// Match Events — Behavioral learning infrastructure (Option B)
import { logMatchSent, MatchEventData } from './services/MatchEventsService';

// PHILEMON — Ground Truth UI System (Phase 0-5)
import {
  deriveUiState,
  deriveTruthCounters,
  logStateSnapshot,
  buildDeriveInput,
} from './flow/uiState';
import {
  preflightDataset,
  isRoutable,
  type DatasetPreflight,
} from './flow/datasetIntrospection';
import {
  buildEnrichmentPlan,
  type EnrichmentPlan,
  type ProviderName,
} from './flow/enrichmentPlan';

// Observability
import {
  RunAuditPanel,
  createEmptyAuditData,
  type RunAuditData,
  type ValidationFailure,
} from './components/RunAuditPanel';

// Premium UX Components (Education + Explainability)
import { AlertPanel, AlertFromExplanation } from './components/AlertPanel';
import { TooltipHint, LabelWithHint } from './components/TooltipHint';
import { InlineHelpLink } from './components/InlineHelpLink';
import { explain, type UXBlock } from './services/Explainability';
import { DOCS } from './config/docs';

// Flow Guards — Zero Silent Failures
import {
  FlowBlock,
  FlowBlockSetter,
  guard,
  BLOCKS,
  FlowAbort,
  wrapPipelineAction,
} from './flow/flowGuards';

// Export Receipt — Trust Layer (show what's filtered before download)
import {
  buildDemandReceipt,
  buildSupplyReceipt,
  formatReceiptSummary,
  REASON_LABELS,
  type ExportReceipt,
  type DemandExportInput,
  type SupplyExportInput,
} from './export/exportReceipt';

// =============================================================================
// SIGNAL STATUS — Explicit 3-state for UX (no silent failures)
// =============================================================================

type SignalStatus = 'disabled' | 'unavailable' | 'available';

/**
 * Derive signal status from settings + enrichment results.
 * Called once after enrichment completes. No per-record guessing.
 */
function deriveSignalStatus(
  fetchSignals: boolean,
  enrichedDemand: Map<string, EnrichmentResult>,
  enrichedSupply: Map<string, EnrichmentResult>
): { status: SignalStatus; coverage: { available: number; total: number } } {
  // State 1: Signals disabled in settings
  if (!fetchSignals) {
    return { status: 'disabled', coverage: { available: 0, total: 0 } };
  }

  // Count records with signals
  let available = 0;
  let total = 0;

  for (const [, enriched] of enrichedDemand.entries()) {
    total++;
    if (enriched.signals) available++;
  }
  for (const [, enriched] of enrichedSupply.entries()) {
    total++;
    if (enriched.signals) available++;
  }

  // State 2: Enabled but no data available
  if (available === 0) {
    return { status: 'unavailable', coverage: { available: 0, total } };
  }

  // State 3: Signals available
  return { status: 'available', coverage: { available, total } };
}

// =============================================================================
// INTRO GENERATION — Now handled by IntroGenerator.ts
// Rich context, 15 real examples, validation with regeneration
// =============================================================================

/**
 * Extract company stage from funding string for fallback intros.
 * "$50M Series C" → "Series C"
 */
function extractStageFromFunding(funding: string): string | null {
  if (!funding) return null;
  const lower = funding.toLowerCase();
  if (lower.includes('series a')) return 'Series A';
  if (lower.includes('series b')) return 'Series B';
  if (lower.includes('series c')) return 'Series C';
  if (lower.includes('series d')) return 'Series D';
  if (lower.includes('seed')) return 'Seed';
  if (lower.includes('public') || lower.includes('ipo')) return 'Public';
  return null;
}

// =============================================================================
// EDGE PREFLIGHT — Transform NormalizedRecord → DemandRecord for EdgeDetector
// =============================================================================

/**
 * Transform NormalizedRecord (Flow's format) → DemandRecord (EdgeDetector format).
 * Extracts signals from signal string and metadata from raw data.
 */
function toDemandRecord(normalized: NormalizedRecord): DemandRecord {
  const signals: { type: string; value?: string; source?: string }[] = [];
  const metadata: Record<string, any> = {};

  // Extract signal type from signal string (job title/description)
  const signalLower = (normalized.signal || '').toLowerCase();
  const isJobPosting = normalized.schemaId === 'startup-jobs';

  // LEADERSHIP_GAP signals are ONLY valid when sourced from job postings
  // For B2B_CONTACTS (schemaId === 'b2b-contacts'):
  // job_title represents a CURRENT ROLE, NOT an open position.
  // Therefore we must NEVER set vpOpen / cLevelOpen / hasLeadershipRole from contact titles.
  if (isJobPosting) {
    if (signalLower.includes('vp') || signalLower.includes('vice president')) {
      signals.push({ type: 'VP_OPEN', source: 'job_posting' });
      metadata.vpOpen = true;
      metadata.jobPostingProvenance = true;
    }
    if (signalLower.includes('ceo') || signalLower.includes('cfo') || signalLower.includes('cto') ||
        signalLower.includes('coo') || signalLower.includes('chief')) {
      signals.push({ type: 'C_LEVEL_OPEN', source: 'job_posting' });
      metadata.cLevelOpen = true;
      metadata.jobPostingProvenance = true;
    }
    if (signalLower.includes('director') || signalLower.includes('head of')) {
      signals.push({ type: 'LEADERSHIP_OPEN', source: 'job_posting' });
      metadata.hasLeadershipRole = true;
      metadata.jobPostingProvenance = true;
    }
  }

  // ==========================================================================
  // CRUNCHBASE ORGANIZATIONS — Funding signals from Crunchbase data
  // ==========================================================================
  const isCrunchbase = normalized.schemaId === 'crunchbase-orgs';
  const raw = normalized.raw || {};

  if (isCrunchbase) {
    // Extract funding date and type from raw Crunchbase data
    const fundingDate = raw.last_funding_at || null;
    const fundingType = raw.last_funding_type || raw.last_equity_funding_type || null;
    const fundingUsd = raw.last_funding_total?.value_usd || raw.last_equity_funding_total?.value_usd || null;

    // Mark as Crunchbase provenance for edge detection
    metadata.crunchbaseProvenance = true;
    metadata.crunchbaseLink = raw.link || null;
    metadata.fundingStage = raw.funding_stage || null;
    metadata.numFundingRounds = raw.num_funding_rounds || null;
    metadata.employeeEnum = raw.num_employees_enum || null;
    metadata.revenueRange = raw.revenue_range || null;

    // Extract founder names for enrichment target
    const founderIdentifiers = raw.founder_identifiers || [];
    if (Array.isArray(founderIdentifiers) && founderIdentifiers.length > 0) {
      metadata.founderNames = founderIdentifiers.map((f: any) => f.value || f).filter(Boolean);
    }

    // Create funding signals with Crunchbase provenance
    if (fundingDate) {
      signals.push({ type: 'FUNDING_RECENT', source: 'crunchbase', value: fundingDate });
      metadata.fundingDate = fundingDate;
    }
    if (fundingType) {
      signals.push({ type: 'FUNDING_EVENT', source: 'crunchbase', value: fundingType });
      metadata.fundingType = fundingType;
    }
    if (fundingUsd) {
      metadata.fundingUsd = fundingUsd;
    }

    // NOTE: Do NOT create VP_OPEN / LEADERSHIP_OPEN / C_LEVEL_OPEN for Crunchbase
    // Crunchbase is company data, not job posting data
  }

  // Funding from company data (generic - non-Crunchbase)
  if (!isCrunchbase && normalized.companyFunding) {
    signals.push({ type: 'FUNDING', value: normalized.companyFunding, source: 'company' });
    metadata.hasFunding = true;
  }

  // Growth indicators from raw data
  if (raw.company?.inc_5000 || raw.inc_5000) {
    signals.push({ type: 'INC_5000', value: 'true', source: 'raw' });
    metadata.inc5000 = true;
  }
  if (raw.company?.revenue_growth || raw.revenue_growth) {
    signals.push({ type: 'GROWTH', value: 'revenue', source: 'raw' });
    metadata.revenueGrowth = true;
  }

  // Multiple roles indicator (from raw if available)
  if (raw.open_roles_count && raw.open_roles_count >= 3) {
    signals.push({ type: 'MULTIPLE_OPEN_ROLES', value: String(raw.open_roles_count), source: 'raw' });
    metadata.openRolesCount = raw.open_roles_count;
  }

  // Hiring pressure (days open)
  if (raw.days_open && raw.days_open >= 30) {
    signals.push({ type: 'HIRING_OPEN_ROLES_30D', value: String(raw.days_open), source: 'raw' });
    metadata.openRolesDays = raw.days_open;
  }

  return {
    domain: normalized.domain,
    company: normalized.company,
    contact: normalized.fullName || `${normalized.firstName} ${normalized.lastName}`.trim() || '',
    email: normalized.email || '',
    title: normalized.title || '',
    industry: Array.isArray(normalized.industry) ? normalized.industry[0] || '' : (normalized.industry || ''),
    signals,
    metadata,
  };
}

/**
 * Normalize domain for consistent key lookup.
 * "http://www.vitatek.com/" → "vitatek.com"
 */
function normalizeDomain(input?: string): string | null {
  if (!input) return null;
  return input
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .trim() || null;
}

/**
 * Clean company name by stripping business suffixes.
 * "Centurion Wealth Management, Llc" → "Centurion Wealth Management"
 * "Acme Corp." → "Acme"
 */
function cleanCompanyName(name: string | null | undefined): string {
  if (!name) return '';

  // Patterns to remove (case insensitive, with optional punctuation)
  const suffixes = [
    /,?\s*(llc|l\.l\.c\.?)\.?\s*$/i,
    /,?\s*(ltd|l\.t\.d\.?)\.?\s*$/i,
    /,?\s*(inc|incorporated)\.?\s*$/i,
    /,?\s*(corp|corporation)\.?\s*$/i,
    /,?\s*(co|company)\.?\s*$/i,
    /,?\s*(pllc|p\.l\.l\.c\.?)\.?\s*$/i,
    /,?\s*(plc|p\.l\.c\.?)\.?\s*$/i,
    /,?\s*(llp|l\.l\.p\.?)\.?\s*$/i,
    /,?\s*(lp|l\.p\.?)\.?\s*$/i,
    /,?\s*(gmbh)\.?\s*$/i,
    /,?\s*(ag)\.?\s*$/i,
    /,?\s*(sa|s\.a\.?)\.?\s*$/i,
    /,?\s*(nv|n\.v\.?)\.?\s*$/i,
    /,?\s*(bv|b\.v\.?)\.?\s*$/i,
  ];

  let cleaned = name.trim();
  for (const suffix of suffixes) {
    cleaned = cleaned.replace(suffix, '');
  }

  // Also clean trailing commas and whitespace
  cleaned = cleaned.replace(/[,\s]+$/, '').trim();

  return cleaned || name.trim(); // Return original if cleaning leaves empty
}

/**
 * SIGNAL CONTRACT ENFORCER
 * - 3-8 words max
 * - Must start with action verb
 * - No enrichment (descriptions, industries, locations)
 * - Fallback: "showing momentum"
 */
const FALLBACK_SIGNAL = 'showing momentum';
const ACTION_VERBS = ['hiring', 'scaling', 'growing', 'building', 'expanding', 'raising', 'launching', 'opening', 'adding', 'seeking'];
const FORBIDDEN_PATTERNS = [
  /\b(inc|llc|ltd|corp|company|industry|description|services?|solutions?|provider)\b/i,
  /\b(located|based|headquartered)\b/i,
  /\b(we are|they are|is a)\b/i,
  /[,·•|]/,  // Multi-part enrichment joins
];

function sanitizeSignal(signal: string | null | undefined): string {
  if (!signal || signal.trim().length === 0) return FALLBACK_SIGNAL;

  const trimmed = signal.trim();
  const words = trimmed.split(/\s+/);

  // Reject: too long (> 8 words)
  if (words.length > 8) return FALLBACK_SIGNAL;

  // Reject: too short (< 2 words) unless it's a verb
  if (words.length < 2 && !ACTION_VERBS.some(v => trimmed.toLowerCase().startsWith(v))) {
    return FALLBACK_SIGNAL;
  }

  // Reject: contains forbidden patterns (enrichment indicators)
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(trimmed)) return FALLBACK_SIGNAL;
  }

  // Reject: doesn't start with action verb (unless very short)
  const firstWord = words[0].toLowerCase();
  if (words.length >= 3 && !ACTION_VERBS.some(v => firstWord.startsWith(v))) {
    return FALLBACK_SIGNAL;
  }

  return trimmed;
}

// =============================================================================
// CSV EXPORT — Pure extraction from in-memory state
// =============================================================================

/**
 * Escape CSV field — handles commas, quotes, newlines
 */
function escapeCSV(value: string | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Build CSV string from rows
 */
function buildCSV(headers: string[], rows: (string | null | undefined)[][]): string {
  const headerLine = headers.map(escapeCSV).join(',');
  const dataLines = rows.map(row => row.map(escapeCSV).join(','));
  return [headerLine, ...dataLines].join('\r\n');
}

/**
 * Trigger browser download of CSV file
 */
function downloadCSV(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

interface ExportData {
  matchingResult: MatchingResult | null;
  enrichedDemand: Map<string, EnrichmentResult>;
  enrichedSupply: Map<string, EnrichmentResult>;
  demandIntros: Map<string, string>;
  supplyIntros: Map<string, string>;
}

/**
 * Build demand CSV rows from in-memory state.
 * Only includes records that WOULD be sent (have email + intro).
 */
function buildDemandExportRows(data: ExportData): (string | null)[][] {
  if (!data.matchingResult) return [];

  const rows: (string | null)[][] = [];

  for (const match of data.matchingResult.demandMatches) {
    const key = recordKey(match.demand);
    const enriched = data.enrichedDemand.get(key);

    // Same filter as routing: must have email
    if (!enriched || !isSuccessfulEnrichment(enriched) || !enriched.email) continue;

    const intro = data.demandIntros.get(key) || '';
    if (!intro) continue; // No intro = wouldn't be sent

    rows.push([
      'DEMAND',
      enriched.email,
      enriched.firstName || '',
      enriched.lastName || '',
      cleanCompanyName(match.demand.company),
      domain || '',
      intro,
      cleanCompanyName(match.supply.company),
      String(match.score),
      match.tierReason || match.reasons.join('; '),  // Use tierReason for human-readable match reason
      match.tier || 'open',  // Confidence tier
    ]);
  }

  return rows;
}

/**
 * Build supply CSV rows from in-memory state.
 * Only includes records that WOULD be sent (have email + intro).
 */
function buildSupplyExportRows(data: ExportData): (string | null)[][] {
  if (!data.matchingResult) return [];

  const rows: (string | null)[][] = [];

  for (const agg of data.matchingResult.supplyAggregates) {
    const key = recordKey(agg.supply);
    const enriched = data.enrichedSupply.get(key);

    // Same filter as routing: must have email
    if (!enriched || !isSuccessfulEnrichment(enriched) || !enriched.email) continue;

    const intro = data.supplyIntros.get(key) || '';
    if (!intro) continue; // No intro = wouldn't be sent

    // Calculate average match score
    const avgScore = agg.matches.length > 0
      ? Math.round(agg.matches.reduce((sum, m) => sum + m.score, 0) / agg.matches.length)
      : 0;

    rows.push([
      'SUPPLY',
      enriched.email,
      enriched.firstName || '',
      enriched.lastName || '',
      cleanCompanyName(agg.supply.company),
      domain || '',
      intro,
      String(agg.matches.length),
      String(avgScore),
    ]);
  }

  return rows;
}

/**
 * Detect common signal category across multiple matches.
 * Analyzes signal text to find the dominant category.
 */
function detectCommonSignal(signals: string[]): string {
  if (signals.length === 0) return 'activity';

  const categories: Record<string, number> = {};

  for (const signal of signals) {
    const lower = (signal || '').toLowerCase();

    if (lower.includes('engineer') || lower.includes('developer') || lower.includes('software')) {
      categories['hiring engineers'] = (categories['hiring engineers'] || 0) + 1;
    } else if (lower.includes('sales') || lower.includes('account executive')) {
      categories['scaling sales'] = (categories['scaling sales'] || 0) + 1;
    } else if (lower.includes('marketing') || lower.includes('growth')) {
      categories['growing marketing'] = (categories['growing marketing'] || 0) + 1;
    } else if (lower.includes('product') || lower.includes('design')) {
      categories['building product'] = (categories['building product'] || 0) + 1;
    } else if (lower.includes('data') || lower.includes('analyst')) {
      categories['hiring data teams'] = (categories['hiring data teams'] || 0) + 1;
    } else if (lower.includes('licens') || lower.includes('partner')) {
      categories['partnership activity'] = (categories['partnership activity'] || 0) + 1;
    } else if (lower.includes('fund') || lower.includes('capital') || lower.includes('invest')) {
      categories['funding activity'] = (categories['funding activity'] || 0) + 1;
    } else {
      categories['activity'] = (categories['activity'] || 0) + 1;
    }
  }

  let maxCategory = 'activity';
  let maxCount = 0;
  for (const [cat, count] of Object.entries(categories)) {
    if (count > maxCount) {
      maxCount = count;
      maxCategory = cat;
    }
  }
  return maxCategory;
}

// =============================================================================
// SAFE RENDER — Prevent React error #31 (object as child)
// =============================================================================

/**
 * Safely convert any value to a renderable string.
 * Prevents React error #31 when objects leak into render paths.
 *
 * This is a DEFENSIVE guard — it should never be triggered in normal flow,
 * but protects against edge cases (401 errors, malformed responses, etc.)
 */
function safeRender(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Error) return value.message;
  // Object detected — log warning and stringify
  if (typeof value === 'object') {
    console.warn('[Flow] safeRender caught object in render path:', value);
    return JSON.stringify(value);
  }
  return String(value);
}

// =============================================================================
// USER-FRIENDLY ERROR MESSAGES
// =============================================================================

type ErrorCode =
  | 'MISSING_APIFY_TOKEN'
  | 'MISSING_DATASET_ID'
  | 'DATASET_FETCH_FAILED'
  | 'DATASET_EMPTY'
  | 'DATASET_INVALID'
  | 'MISSING_SUPPLY'
  | 'HUB_ERROR'
  | 'HUB_MISSING_SIDE'
  | 'CONTRACT_VIOLATION'
  | 'UNKNOWN';

function toUserError(code: ErrorCode, detail?: string): string {
  const messages: Record<ErrorCode, string> = {
    MISSING_APIFY_TOKEN: 'Missing Apify token. Go to Settings → Data Sources, paste your Apify API token.',
    MISSING_DATASET_ID: 'Missing dataset ID. Go to Settings → Data Sources, add your Apify dataset ID.',
    DATASET_FETCH_FAILED: `Failed to fetch dataset${detail ? `: ${detail}` : ''}. Check your dataset ID and Apify token, then retry.`,
    DATASET_EMPTY: 'Dataset returned 0 rows. Run your Apify scraper first, or check the dataset ID.',
    DATASET_INVALID: `Dataset format not recognized${detail ? `: ${detail}` : ''}. Use a supported Apify scraper (Wellfound Jobs, LinkedIn Company Leads).`,
    MISSING_SUPPLY: 'No supply dataset configured. Go to Settings → Data Sources, add a supply dataset ID.',
    HUB_ERROR: detail || 'Hub data error. Please try selecting contacts again.',
    HUB_MISSING_SIDE: 'Hub requires both Demand and Supply contacts. Go back to Hub and select contacts for both sides.',
    CONTRACT_VIOLATION: `Data validation failed${detail ? `: ${detail}` : ''}. Check console for details.`,
    UNKNOWN: detail || 'Something went wrong. Check console for details.',
  };
  return messages[code];
}

// =============================================================================
// TYPES
// =============================================================================

interface FlowState {
  step: 'upload' | 'validating' | 'matching' | 'matches_found' | 'no_matches' | 'enriching' | 'route_context' | 'generating' | 'ready' | 'sending' | 'complete';

  // Source tracking (for UI labels)
  isHubFlow: boolean;

  // Datasets
  demandSchema: Schema | null;
  supplySchema: Schema | null;
  demandRecords: NormalizedRecord[];
  supplyRecords: NormalizedRecord[];

  // Matching
  matchingResult: MatchingResult | null;

  // Edge Preflight — Detected edges by domain (for composition)
  detectedEdges: Map<string, Edge>;

  // Enrichment
  enrichedDemand: Map<string, EnrichmentResult>;
  enrichedSupply: Map<string, EnrichmentResult>;

  // Intros (AI-generated)
  demandIntros: Map<string, string>;  // domain -> intro
  supplyIntros: Map<string, string>;  // domain -> intro

  // Progress
  progress: { current: number; total: number; message: string };

  // Results
  sentDemand: number;
  sentSupply: number;

  // Error (legacy string-based)
  error: string | null;

  // FlowBlock — Structured error for zero silent failures
  flowBlock: FlowBlock | null;

  // Audit (observability)
  auditData: RunAuditData | null;
  copyValidationFailures: CopyValidationResult[];
}

interface Settings {
  apifyToken?: string;
  demandDatasetId?: string;
  supplyDatasetId?: string;
  apolloApiKey?: string;
  anymailApiKey?: string;
  connectorAgentApiKey?: string;
  // Sending provider
  sendingProvider?: 'instantly' | 'plusvibe';
  instantlyApiKey?: string;
  plusvibeApiKey?: string;
  plusvibeWorkspaceId?: string;
  demandCampaignId?: string;
  supplyCampaignId?: string;
  // AI
  aiConfig: AIConfig | null;
  // Signals toggle — fetch company signals for B2B Contacts (default false)
  fetchSignals?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function Flow() {
  const [state, setState] = useState<FlowState>({
    step: 'upload',
    isHubFlow: false,
    demandSchema: null,
    supplySchema: null,
    demandRecords: [],
    supplyRecords: [],
    matchingResult: null,
    detectedEdges: new Map(),
    enrichedDemand: new Map(),
    enrichedSupply: new Map(),
    demandIntros: new Map(),
    supplyIntros: new Map(),
    progress: { current: 0, total: 0, message: '' },
    sentDemand: 0,
    sentSupply: 0,
    error: null,
    flowBlock: null,
    auditData: null,
    copyValidationFailures: [],
  });

  const [settings, setSettings] = useState<Settings | null>(null);

  // Signals drawer — read-only overlay, no logic impact
  const [showSignalsDrawer, setShowSignalsDrawer] = useState(false);

  // Export Receipt — Trust Layer (show what's filtered before download)
  const [showExportReceipt, setShowExportReceipt] = useState(false);
  const [exportReceiptData, setExportReceiptData] = useState<{ demand: ExportReceipt; supply: ExportReceipt } | null>(null);
  const [exportModalKey, setExportModalKey] = useState(0); // Force modal remount on reopen

  // Supply Annotations — Operator judgment (render-only, no matching impact)
  const [supplyAnnotations, setSupplyAnnotations] = useState<Map<string, SupplyAnnotation>>(new Map());

  const abortRef = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  // Navigation guard — warn user before leaving during active flow
  const hasActiveFlow = state.step !== 'upload' && state.step !== 'complete';
  useEffect(() => {
    if (!hasActiveFlow) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // Required for Chrome
      return ''; // Required for some browsers
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasActiveFlow]);

  // Scroll to error when it appears
  useEffect(() => {
    if (state.error && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [state.error]);

  // Debug mode check
  const isDebugMode = new URLSearchParams(window.location.search).get('debug') === '1';

  // FlowBlock setter — Zero Silent Failures pattern
  const setFlowBlock: FlowBlockSetter = useCallback((block) => {
    setState(prev => ({ ...prev, flowBlock: block, step: block ? 'upload' : prev.step }));
  }, []);

  // Scroll to error when flowBlock appears
  useEffect(() => {
    if (state.flowBlock && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [state.flowBlock]);

  // Load settings (auth-aware: Supabase for logged-in, localStorage for guests)
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Helper to build AIConfig from raw settings
        const buildAIConfig = (s: any): AIConfig | null => {
          if (s.azureApiKey && s.azureEndpoint) {
            return {
              enabled: true,
              provider: 'azure',
              model: s.azureDeployment || 'gpt-4o-mini',
              apiKey: s.azureApiKey,
              endpoint: s.azureEndpoint,
              deployment: s.azureDeployment,
            };
          } else if (s.openaiApiKey) {
            return {
              enabled: true,
              provider: 'openai',
              model: s.aiModel || 'gpt-4o-mini',
              apiKey: s.openaiApiKey,
            };
          } else if (s.claudeApiKey) {
            return {
              enabled: true,
              provider: 'anthropic',
              model: s.aiModel || 'claude-3-haiku-20240307',
              apiKey: s.claudeApiKey,
            };
          }
          return null;
        };

        // AUTHENTICATED: Load from Supabase + localStorage for AI keys
        if (isAuthenticated && user?.id) {
          console.log('[Flow] Loading settings from Supabase (authenticated)');

          const { data } = await supabase
            .from('operator_settings')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

          // AI settings always from localStorage (sensitive keys)
          const aiSettings = localStorage.getItem('ai_settings');
          const ai = aiSettings ? JSON.parse(aiSettings) : {};

          const aiConfig = buildAIConfig(ai);

          // Determine sending provider
          const sendingProvider = data?.sending_provider || 'instantly';

          // Select campaign IDs based on provider
          const demandCampaignId = sendingProvider === 'plusvibe'
            ? data?.plusvibe_campaign_demand || ''
            : data?.instantly_campaign_demand || '';
          const supplyCampaignId = sendingProvider === 'plusvibe'
            ? data?.plusvibe_campaign_supply || ''
            : data?.instantly_campaign_supply || '';

          setSettings({
            apifyToken: data?.apify_token || '',
            demandDatasetId: data?.demand_dataset_id || '',
            supplyDatasetId: data?.supply_dataset_id || '',
            apolloApiKey: data?.enrichment_api_key || '',
            anymailApiKey: data?.anymail_finder_api_key || '',
            connectorAgentApiKey: data?.connector_agent_api_key || '',
            sendingProvider,
            instantlyApiKey: data?.instantly_api_key || '',
            plusvibeApiKey: data?.plusvibe_api_key || '',
            plusvibeWorkspaceId: data?.plusvibe_workspace_id || '',
            demandCampaignId,
            supplyCampaignId,
            aiConfig,
            fetchSignals: data?.fetch_signals === true, // default false
          });

          console.log('[Flow] Loaded from Supabase, AI:', aiConfig ? aiConfig.provider : 'none');
          return;
        }

        // GUEST: Load from localStorage (existing behavior)
        console.log('[Flow] Loading settings from localStorage (guest)');
        const stored = localStorage.getItem('guest_settings');
        if (!stored) {
          console.log('[Flow] No settings found');
          setSettings({ aiConfig: null });
          return;
        }

        const parsed = JSON.parse(stored);
        const s = parsed.settings || parsed || {};

        console.log('[Flow] Loaded settings:', Object.keys(s));

        const aiConfig = buildAIConfig(s);

        // Determine sending provider
        const sendingProvider = s.sendingProvider || 'instantly';

        // Select campaign IDs based on provider
        const demandCampaignId = sendingProvider === 'plusvibe'
          ? s.plusvibeCampaignDemand
          : s.instantlyCampaignDemand;
        const supplyCampaignId = sendingProvider === 'plusvibe'
          ? s.plusvibeCampaignSupply
          : s.instantlyCampaignSupply;

        setSettings({
          apifyToken: s.apifyToken,
          demandDatasetId: s.demandDatasetId,
          supplyDatasetId: s.supplyDatasetId,
          apolloApiKey: s.apolloApiKey,
          anymailApiKey: s.anymailApiKey,
          connectorAgentApiKey: s.connectorAgentApiKey,
          sendingProvider,
          instantlyApiKey: s.instantlyApiKey,
          plusvibeApiKey: s.plusvibeApiKey,
          plusvibeWorkspaceId: s.plusvibeWorkspaceId,
          demandCampaignId,
          supplyCampaignId,
          aiConfig,
          fetchSignals: s.fetchSignals === true, // default false
        });

        console.log('[Flow] AI configured:', aiConfig ? aiConfig.provider : 'none');
      } catch (e) {
        console.error('[Flow] Settings load error:', e);
        setSettings({ aiConfig: null });
      }
    };

    loadSettings();
  }, [isAuthenticated, user?.id]);

  // Load supply annotations (operator judgment — render-only, no matching impact)
  useEffect(() => {
    const loadAnnotations = async () => {
      try {
        if (isAuthenticated && user?.id) {
          const annotations = await fetchAllUserAnnotations();
          setSupplyAnnotations(annotations);
        } else {
          // Guest mode: load from localStorage
          const guestAnnotations = getGuestAnnotations();
          setSupplyAnnotations(guestAnnotations);
        }
      } catch (err) {
        console.warn('[Flow] Failed to load supply annotations:', err);
      }
    };
    loadAnnotations();
  }, [isAuthenticated, user?.id]);

  // Handle star/exclude toggle for supply
  const handleToggleStar = useCallback(async (fingerprint: string) => {
    const current = supplyAnnotations.get(fingerprint);
    const currentValue = current?.starred ?? false;

    // Optimistic update
    setSupplyAnnotations(prev => {
      const next = new Map(prev);
      next.set(fingerprint, { ...current, supplier_fingerprint: fingerprint, starred: !currentValue, excluded: current?.excluded ?? false, notes: current?.notes ?? null, tags: current?.tags ?? [] });
      return next;
    });

    // Persist
    if (isAuthenticated && user?.id) {
      await toggleStarred(fingerprint, currentValue);
    } else {
      saveGuestAnnotation(fingerprint, { starred: !currentValue });
    }
  }, [supplyAnnotations, isAuthenticated, user?.id]);

  const handleToggleExcluded = useCallback(async (fingerprint: string) => {
    const current = supplyAnnotations.get(fingerprint);
    const currentValue = current?.excluded ?? false;

    // Optimistic update
    setSupplyAnnotations(prev => {
      const next = new Map(prev);
      next.set(fingerprint, { ...current, supplier_fingerprint: fingerprint, starred: current?.starred ?? false, excluded: !currentValue, notes: current?.notes ?? null, tags: current?.tags ?? [] });
      return next;
    });

    // Persist
    if (isAuthenticated && user?.id) {
      await toggleExcluded(fingerprint, currentValue);
    } else {
      saveGuestAnnotation(fingerprint, { excluded: !currentValue });
    }
  }, [supplyAnnotations, isAuthenticated, user?.id]);

  // Auto-start when coming from Connector Hub (ref to avoid dependency issues)
  const hubAutoStartRef = useRef(false);
  const startFlowRef = useRef<() => void>();

  // =============================================================================
  // STEP 1: VALIDATE & LOAD DATASETS
  // =============================================================================

  const startFlow = useCallback(async () => {
    abortRef.current = false;
    setState(prev => ({ ...prev, step: 'validating', error: null, flowBlock: null }));
    setState(prev => ({ ...prev, progress: { current: 0, total: 100, message: 'Loading...' } }));

    try {
      // =========================================================================
      // HUB ADAPTER: Check if contacts came from Connector Hub
      // Hub collects BOTH demand AND supply - no Apify fetch needed
      // STRICT: Requires BOTH URL param AND hub data - no fallbacks
      // =========================================================================
      const urlHasHubSource = new URLSearchParams(window.location.search).get('source') === 'hub';
      const hubHasData = hasHubContacts();

      console.log('[Flow] Hub check:', { urlHasHubSource, hubHasData });

      if (urlHasHubSource && hubHasData) {
        console.log('[Flow] Hub source detected - using two-sided adapter');
        setState(prev => ({ ...prev, progress: { current: 20, total: 100, message: 'Loading Hub contacts...' } }));

        // Get BOTH sides from Hub (demand + supply)
        const { demand: hubDemand, supply: hubSupply, error: hubError } = getHubBothSides();
        console.log('[Flow] Hub adapter returned', hubDemand.length, 'demand +', hubSupply.length, 'supply');

        // GUARDS — Hub validation
        if (!guard(!hubError, BLOCKS.HUB_ERROR(hubError || 'Unknown hub error'), setFlowBlock)) return;
        if (!guard(hubDemand.length > 0 && hubSupply.length > 0, BLOCKS.HUB_MISSING_SIDE, setFlowBlock)) return;

        setState(prev => ({ ...prev, progress: { current: 40, total: 100, message: 'Deduplicating...' } }));

        // Dedupe demand by domain
        const seenDemandDomains = new Set<string>();
        const dedupedDemand = hubDemand.filter(r => {
          if (!r.domain || seenDemandDomains.has(r.domain)) return false;
          seenDemandDomains.add(r.domain);
          return true;
        });

        // Dedupe supply by domain
        const seenSupplyDomains = new Set<string>();
        const dedupedSupply = hubSupply.filter(r => {
          if (!r.domain || seenSupplyDomains.has(r.domain)) return false;
          seenSupplyDomains.add(r.domain);
          return true;
        });

        console.log('[Flow] After dedup: demand:', dedupedDemand.length, 'supply:', dedupedSupply.length);

        // =======================================================================
        // RUNTIME ASSERTIONS — Validate adapter contract before matching
        // =======================================================================
        const validateRecords = (records: NormalizedRecord[], label: string): boolean => {
          for (let i = 0; i < records.length; i++) {
            const r = records[i];
            // size must be string | null
            if (r.size !== null && typeof r.size !== 'string') {
              console.error(`[Flow] CONTRACT VIOLATION in ${label}[${i}]: size is ${typeof r.size}, not string|null`, r.size);
              console.error(`[Flow] Record sample:`, { company: r.company, domain: r.domain, size: r.size });
              return false;
            }
            // Required fields
            if (!r.domain) {
              console.error(`[Flow] CONTRACT VIOLATION in ${label}[${i}]: missing domain`, r);
              return false;
            }
          }
          return true;
        };

        // GUARDS — Contract validation
        if (!guard(validateRecords(dedupedDemand, 'demand'),
          BLOCKS.CONTRACT_VIOLATION('Demand records missing required fields'), setFlowBlock)) return;
        if (!guard(validateRecords(dedupedSupply, 'supply'),
          BLOCKS.CONTRACT_VIOLATION('Supply records missing required fields'), setFlowBlock)) return;

        console.log('[Flow] Contract validation passed for both sides');
        // =======================================================================

        // Clear URL param before processing
        window.history.replaceState({}, '', window.location.pathname);

        // Hub adapts data, then calls the SAME flow functions as normal path
        // This ensures 100% parity - no duplicated logic
        const hubDemandSchema = { name: 'Connector Hub (Demand)', id: 'connector-hub-demand', fields: [], hasContacts: true } as any;
        const hubSupplySchema = { name: 'Connector Hub (Supply)', id: 'connector-hub-supply', fields: [], hasContacts: true } as any;

        // Set state with adapted data, then let runMatching handle the rest
        setState(prev => ({
          ...prev,
          step: 'matching',
          isHubFlow: true,  // Track source for UI labels
          demandSchema: hubDemandSchema,
          supplySchema: hubSupplySchema,
          demandRecords: dedupedDemand,
          supplyRecords: dedupedSupply,
          progress: { current: 70, total: 100, message: 'Matching...' },
        }));

        console.log('[Flow:Hub] Handing off to runMatching (same path as normal flow)');

        // CRITICAL: Hub calls the SAME runMatching function as normal path
        // runMatching → matchRecords → runEnrichment → runIntroGeneration
        await runMatching(dedupedDemand, dedupedSupply, hubDemandSchema, hubSupplySchema);

        // Clear hub data after successful flow to prevent contamination
        console.log('[Flow:Hub] Clearing hub localStorage after successful handoff');
        clearHubContacts();
        return;
      }
      // =========================================================================
      // END HUB ADAPTER - Normal flow continues below
      // =========================================================================

      // GUARDS — Zero Silent Failures
      if (!guard(settings?.apifyToken, BLOCKS.NO_APIFY_TOKEN, setFlowBlock)) return;
      if (!guard(settings?.demandDatasetId, BLOCKS.NO_DEMAND_DATASET, setFlowBlock)) return;

      setState(prev => ({ ...prev, progress: { current: 0, total: 100, message: 'Loading demand...' } }));

      // Fetch demand dataset
      const demandData = await fetchApifyDataset(settings.demandDatasetId, settings.apifyToken);
      console.log('[Flow] Raw demand data sample:', demandData[0]);
      console.log('[Flow] Raw demand fields:', demandData[0] ? Object.keys(demandData[0]) : 'empty');
      setState(prev => ({ ...prev, progress: { ...prev.progress, current: 30, message: 'Validating demand...' } }));

      // Validate demand
      const demandValidation = validateDataset(demandData);
      console.log('[Flow] Demand validation:', { valid: demandValidation.valid, schema: demandValidation.schema?.name, error: demandValidation.error });

      // GUARDS — Dataset validation
      if (!guard(demandData && demandData.length > 0, BLOCKS.DATASET_EMPTY, setFlowBlock)) return;
      if (!guard(demandValidation.valid && demandValidation.schema,
        BLOCKS.SCHEMA_INVALID(demandValidation.error || 'Unknown schema'), setFlowBlock)) return;

      // Normalize demand
      const demandRecords = normalizeDataset(demandData, demandValidation.schema);
      console.log(`[Flow] Demand: ${demandRecords.length} records (${demandValidation.schema.name})`);
      console.log('[Flow] Normalized demand sample:', demandRecords[0] ? { email: demandRecords[0].email, firstName: demandRecords[0].firstName, company: demandRecords[0].company, domain: demandRecords[0].domain, signal: demandRecords[0].signal } : 'empty');

      // Fetch supply dataset
      let supplyRecords: NormalizedRecord[] = [];
      let supplySchema: Schema | null = null;

      if (settings.supplyDatasetId) {
        setState(prev => ({ ...prev, progress: { ...prev.progress, current: 50, message: 'Loading supply...' } }));
        const supplyData = await fetchApifyDataset(settings.supplyDatasetId, settings.apifyToken);
        console.log('[Flow] Raw supply data sample:', supplyData[0]);
        console.log('[Flow] Raw supply fields:', supplyData[0] ? Object.keys(supplyData[0]) : 'empty');

        const supplyValidation = validateSupplyDataset(supplyData);
        console.log('[Flow] Supply validation:', { valid: supplyValidation.valid, schema: supplyValidation.schema?.name, error: supplyValidation.error });
        if (supplyValidation.valid && supplyValidation.schema) {
          supplyRecords = normalizeDataset(supplyData, supplyValidation.schema);
          supplySchema = supplyValidation.schema;
          console.log(`[Flow] Supply: ${supplyRecords.length} records (${supplyValidation.schema.name})`);
          console.log('[Flow] Normalized supply sample:', supplyRecords[0] ? { email: supplyRecords[0].email, firstName: supplyRecords[0].firstName, company: supplyRecords[0].company, domain: supplyRecords[0].domain, title: supplyRecords[0].title } : 'empty');
        }
      } else {
        console.log('[Flow] No supply dataset configured');
      }

      setState(prev => ({
        ...prev,
        step: 'matching',
        demandSchema: demandValidation.schema,
        supplySchema,
        demandRecords,
        supplyRecords,
        progress: { current: 70, total: 100, message: 'Matching...' },
      }));

      // Start matching
      await runMatching(demandRecords, supplyRecords, demandValidation.schema, supplySchema);

    } catch (err) {
      // Handle FlowAbort (guard failures already set flowBlock)
      if (err instanceof FlowAbort) {
        setFlowBlock(err.uxBlock);
        return;
      }
      // Unknown errors get surfaced
      console.error('[Flow] Validation failed:', err);
      const detail = err instanceof Error ? err.message : 'Unknown error';
      setFlowBlock(BLOCKS.DATASET_FETCH_FAILED(detail));
    }
  }, [settings, setFlowBlock]);

  // Keep startFlow ref updated for Hub auto-start
  startFlowRef.current = startFlow;

  // Auto-start when coming from Connector Hub
  // STRICT: Requires BOTH URL param AND hub data - no fallbacks
  useEffect(() => {
    if (hubAutoStartRef.current) return;
    if (!settings) return;

    const urlHasHubSource = new URLSearchParams(window.location.search).get('source') === 'hub';
    const hubHasData = hasHubContacts();

    console.log('[Flow] Auto-start check:', { urlHasHubSource, hubHasData, alreadyStarted: hubAutoStartRef.current });

    // STRICT AND - both must be true
    if (urlHasHubSource && hubHasData) {
      console.log('[Flow] Auto-starting from Hub');
      hubAutoStartRef.current = true;
      startFlowRef.current?.();
    }
  }, [settings]);

  // =============================================================================
  // STEP 2: MATCHING
  // =============================================================================

  const runMatching = async (
    demand: NormalizedRecord[],
    supply: NormalizedRecord[],
    demandSchema: Schema,
    supplySchema: Schema | null
  ) => {
    setState(prev => ({ ...prev, progress: { current: 80, total: 100, message: 'Finding matches...' } }));

    // GUARD — Both datasets required for matching
    if (!guard(supply.length > 0, BLOCKS.NO_SUPPLY_DATASET, setFlowBlock)) return;

    // Diagnostic logs
    console.time('[MATCH] matchRecords');
    console.log('[MATCH] inputs', { demand: demand.length, supply: supply.length });

    // Run matching brain (async with yielding for large datasets)
    const totalComparisons = demand.length * supply.length;
    const result = await matchRecords(
      demand,
      supply,
      (current, total) => {
        setState(prev => ({
          ...prev,
          progress: {
            current,
            total,
            message: `Matching ${Math.round((current / total) * 100)}%`,
          },
        }));
      }
    );

    console.timeEnd('[MATCH] matchRecords');
    console.log('[MATCH] result', {
      demandMatches: result.demandMatches.length,
      supplyAggregates: result.supplyAggregates.length,
      avgScore: result.stats.avgScore,
    });

    // NO THRESHOLD — all matches pass through
    // User decides what to send, not the system
    const filtered = result;

    console.log(`[Flow] Matching complete:`);
    console.log(`  - Demand: ${demand.length} records`);
    console.log(`  - Supply: ${supply.length} records`);
    console.log(`  - Demand matches: ${filtered.demandMatches.length}`);
    console.log(`  - Supply aggregates: ${filtered.supplyAggregates.length}`);
    console.log(`  - Avg score: ${result.stats.avgScore}`);

    // Debug: Log sample data if no matches
    if (filtered.demandMatches.length === 0) {
      console.log(`[Flow] WARNING: 0 matches found. Sample data:`);
      if (demand[0]) console.log(`  - Demand[0]:`, { company: demand[0].company, domain: demand[0].domain, signal: demand[0].signal, industry: demand[0].industry });
      if (supply[0]) console.log(`  - Supply[0]:`, { company: supply[0].company, domain: supply[0].domain, title: supply[0].title, industry: supply[0].industry });
    }

    // =======================================================================
    // PHASE 1: EDGE ANNOTATION (INFORMATIONAL ONLY — NEVER BLOCKS)
    // Edge = confidence label. Match score > 0 = always routable.
    // =======================================================================
    console.log('[EDGE] Annotating', filtered.demandMatches.length, 'matches with confidence levels');
    setState(prev => ({ ...prev, progress: { current: 90, total: 100, message: 'Analyzing match quality...' } }));

    // GRACEFUL DEGRADATION: Always build human-readable evidence
    // Priority: strong signal → soft signal → generic (never empty)
    const buildWhy = (match: Match): string => {
      const demand = match.demand;

      // Priority 1: Hiring signal (strong)
      if (demand.signal && /hiring|recruit|engineer|sales|marketing|developer/i.test(demand.signal)) {
        return `is hiring ${demand.signal.toLowerCase().slice(0, 30)}`;
      }

      // Priority 2: Funding signal (strong)
      if (demand.companyFunding) {
        return 'recently raised funding';
      }

      // Priority 3: Industry (medium)
      if (demand.industry) {
        const ind = Array.isArray(demand.industry) ? demand.industry[0] : demand.industry;
        if (ind) return `is growing in ${String(ind).split(',')[0].trim()}`;
      }

      // Priority 4: Company description (soft)
      if (demand.companyDescription) {
        return 'is scaling';
      }

      // Priority 5: Generic (escape hatch — always works)
      return 'may be exploring outside partners';
    };

    const edgePositiveMatches: typeof filtered.demandMatches = [];
    const detectedEdges = new Map<string, Edge>();

    const HIGH_THRESHOLD = 0.7;
    const MEDIUM_THRESHOLD = 0.4;

    for (const match of filtered.demandMatches) {
      // ALL matches with score > 0 are routable
      if (match.score > 0) {
        const demandRecord = toDemandRecord(match.demand);
        const explicitEdge = detectEdge(demandRecord);

        // Confidence level based on match score + explicit signals
        const confidence = explicitEdge
          ? Math.max(explicitEdge.confidence, match.score)
          : match.score;

        const confidenceLevel = confidence >= HIGH_THRESHOLD ? 'high' :
                                confidence >= MEDIUM_THRESHOLD ? 'medium' : 'low';

        const edge: Edge = explicitEdge || {
          type: 'MATCH_QUALITY',
          evidence: buildWhy(match),
          confidence,
        };

        edgePositiveMatches.push(match);
        detectedEdges.set(recordKey(match.demand), edge);
        console.log(`[EDGE] ✓ ${match.demand.company} → ${confidenceLevel} (${confidence.toFixed(2)})`);
      }
    }

    console.log(`[EDGE] Complete: ${edgePositiveMatches.length} matches ready for enrichment`);
    // Edge NEVER blocks — if matches exist, proceed

    // Update filtered with only edge-positive matches for enrichment
    const edgeFiltered: MatchingResult = {
      ...filtered,
      demandMatches: edgePositiveMatches,
    };

    // Store detected edges in state for later use in composition
    console.log('[EDGE] Matches ready:', edgePositiveMatches.length);

    // =======================================================================
    // UI PAUSE: Show "Matches found" panel, wait for user action
    // User must click "Find the right people" to proceed to enrichment
    // NO CREDITS SPENT YET
    // =======================================================================
    console.log('[MATCH] advancing step', { from: 'matching', to: 'matches_found' });

    setState(prev => ({
      ...prev,
      step: 'matches_found',
      matchingResult: edgeFiltered, // Only edge-positive matches
      detectedEdges, // Store detected edges for composition
      progress: { current: 100, total: 100, message: 'Matches found' },
      // Store schemas for later enrichment call
      demandSchema,
      supplySchema,
    }));

    // Don't auto-proceed to enrichment — wait for user action
    console.log('[MATCH] Paused — waiting for user to proceed');

    // PHILEMON: STATE_SNAPSHOT after edge preflight
    const philemonInput = buildDeriveInput(
      demandSchema,
      supplySchema,
      demand,
      supply,
      edgeFiltered,
      detectedEdges,
      new Map(), // enrichedDemand (empty at this stage)
      new Map(), // enrichedSupply (empty at this stage)
      false, // enrichmentStarted
      false, // enrichmentFinished
      !!(settings?.apolloApiKey || settings?.anymailApiKey || settings?.connectorAgentApiKey),
      0 // introsGenerated
    );
    const philemonCounters = deriveTruthCounters(philemonInput);
    const philemonState = deriveUiState(philemonInput);
    logStateSnapshot('MATCH_COMPLETE', 'matches_found', philemonCounters, philemonState);
  };

  // =============================================================================
  // STEP 2.5: PROCEED TO ENRICHMENT (User clicks "Find the right people")
  // =============================================================================

  const proceedToEnrichment = async () => {
    if (!state.matchingResult || !state.demandSchema) {
      console.error('[ENRICH] Cannot proceed - missing matching result or schema');
      return;
    }

    console.log('[ENRICH] User clicked "Find the right people" - proceeding to enrichment');
    console.log('[ENRICH] This will use credits for', state.matchingResult.demandMatches.length, 'records');

    setState(prev => ({
      ...prev,
      step: 'enriching',
      progress: { current: 0, total: state.matchingResult?.demandMatches.length || 0, message: 'Finding decision-makers…' },
    }));

    await runEnrichment(state.matchingResult, state.demandSchema, state.supplySchema);
  };

  // =============================================================================
  // STEP 3: ENRICHMENT (bounded concurrency, circuit breaker, per-record isolation)
  // =============================================================================

  const runEnrichment = async (
    matching: MatchingResult,
    demandSchema: Schema,
    supplySchema: Schema | null
  ) => {
    const config: EnrichmentConfig = {
      apolloApiKey: settings?.apolloApiKey,
      anymailApiKey: settings?.anymailApiKey,
      connectorAgentApiKey: settings?.connectorAgentApiKey,
      fetchSignals: settings?.fetchSignals === true, // default false
    };

    // Run ID for this batch
    const runId = `flow-${Date.now()}`;

    console.log('[Flow] Enrichment config:', {
      hasApollo: !!config.apolloApiKey,
      hasAnymail: !!config.anymailApiKey,
      hasConnectorAgent: !!config.connectorAgentApiKey,
      fetchSignals: config.fetchSignals,
      runId,
      concurrency: 5,
    });

    // Enrich demand side with bounded concurrency
    const TEST_LIMIT = 100; // TODO: Remove before deploy — saves enrichment credits during testing
    const demandRecords = matching.demandMatches.map(m => m.demand).slice(0, TEST_LIMIT);
    console.log(`[Flow] Enriching ${demandRecords.length} demand matches (concurrency=5) [TEST MODE: ${TEST_LIMIT}]`);

    const enrichedDemand = await enrichBatch(
      demandRecords,
      demandSchema,
      config,
      (current, total) => {
        setState(prev => ({
          ...prev,
          progress: { current, total, message: `Enriching ${current}/${total}` },
        }));
      },
      `${runId}-demand`
    );

    // NOTE: Don't update state yet — wait until both demand and supply are enriched
    // to avoid race conditions where route_context renders with partial data

    // Enrich supply side — ONLY supplies paired with edge-positive demands
    const enrichedSupply = new Map<string, EnrichmentResult>();

    // Extract unique supplies from demand matches (not all supplyAggregates)
    const matchedSupplyDomains = new Set<string>();
    const supplyToEnrich: { supply: NormalizedRecord }[] = [];

    for (const match of matching.demandMatches) {
      if (!matchedSupplyDomains.has(match.supply.domain)) {
        matchedSupplyDomains.add(match.supply.domain);
        supplyToEnrich.push({ supply: match.supply });
      }
    }

    console.log(`[Flow] Enriching ${supplyToEnrich.length} matched supplies (not all ${matching.supplyAggregates.length})`);

    for (const agg of supplyToEnrich) {
      if (abortRef.current) break;

      const record = agg.supply;

      // Supply from B2B Contacts usually has email — will be VERIFIED by router
      if (supplySchema) {
        const sanitizedDomain = record.domain?.replace(/[^a-z0-9.-]/gi, '') || 'unknown';
        const correlationId = `${runId}-supply-${sanitizedDomain}`;
        try {
          const result = await enrichRecord(record, supplySchema, config, undefined, correlationId);
          enrichedSupply.set(record.domain, result);
        } catch (err) {
          console.log(`[Enrichment] cid=${correlationId} UNCAUGHT domain=${record.domain}`);
          // Construct error result with new format
          enrichedSupply.set(record.domain, {
            action: record.email ? 'VERIFY' : 'FIND_COMPANY_CONTACT',
            outcome: 'ERROR',
            email: record.email || null,
            firstName: record.firstName || '',
            lastName: record.lastName || '',
            title: record.title || '',
            verified: false,
            source: 'none',
            inputsPresent: {
              email: !!record.email,
              domain: !!record.domain,
              person_name: !!(record.firstName || record.lastName),
              company: !!record.company,
            },
            providersAttempted: [],
            providerResults: {
              connectorAgent: { attempted: false },
              anymail: { attempted: false },
              apollo: { attempted: false },
            },
            durationMs: 0,
          });
        }
      }
    }

    // Summary
    const demandSuccessCount = Array.from(enrichedDemand.values()).filter(r => isSuccessfulEnrichment(r) && r.email).length;
    const supplySuccessCount = Array.from(enrichedSupply.values()).filter(r => isSuccessfulEnrichment(r) && r.email).length;
    const demandTimeoutCount = Array.from(enrichedDemand.values()).filter(r => r.source === 'timeout').length;
    const supplyTimeoutCount = Array.from(enrichedSupply.values()).filter(r => r.source === 'timeout').length;
    console.log(`[Flow] Enrichment complete (runId=${runId}):`);
    console.log(`  - Demand: ${demandSuccessCount}/${enrichedDemand.size} with email, ${demandTimeoutCount} timeouts`);
    console.log(`  - Supply: ${supplySuccessCount}/${enrichedSupply.size} with email, ${supplyTimeoutCount} timeouts`);

    // PHILEMON: STATE_SNAPSHOT after enrichment
    const philemonEnrichInput = buildDeriveInput(
      demandSchema,
      supplySchema,
      matching.demandMatches.map(m => m.demand),
      matching.supplyAggregates.map(a => a.supply),
      matching,
      state.detectedEdges,
      enrichedDemand,
      enrichedSupply,
      true, // enrichmentStarted
      true, // enrichmentFinished
      !!(settings?.apolloApiKey || settings?.anymailApiKey || settings?.connectorAgentApiKey),
      0 // introsGenerated (not yet)
    );
    const philemonEnrichCounters = deriveTruthCounters(philemonEnrichInput);
    const philemonEnrichState = deriveUiState(philemonEnrichInput);
    logStateSnapshot('ENRICHMENT_COMPLETE', 'route_context', philemonEnrichCounters, philemonEnrichState);

    // ATOMIC STATE UPDATE: Set enrichment results AND step change together
    // This prevents race conditions where route_context renders before enrichment data is available
    setState(prev => ({
      ...prev,
      enrichedDemand,
      enrichedSupply,
      step: 'route_context',
    }));
    console.log('[Flow] Enrichment complete — ready for intro generation');
  };

  // =============================================================================
  // STEP 4: INTRO GENERATION — DOCTRINE COMPLIANT
  // =============================================================================
  //
  // DEMAND: Hold the provider. Reference their situation, not who helps.
  // SUPPLY: Hold the list. "Companies like X" — one example, implies plurality.
  //
  // Matching is many-to-many. Messaging is one-to-one.
  // =============================================================================

  const runIntroGeneration = async (
    matching: MatchingResult,
    enrichedDemand: Map<string, EnrichmentResult>,
    enrichedSupply: Map<string, EnrichmentResult>
  ) => {
    const demandIntros = new Map<string, string>();
    const supplyIntros = new Map<string, string>();

    console.log('[COMPOSE] Starting intro composition:');
    console.log('  - demandMatches:', matching.demandMatches.length);
    console.log('  - supplyAggregates:', matching.supplyAggregates.length);
    console.log('  - detectedEdges:', state.detectedEdges.size);

    let progress = 0;
    let composed = 0;
    let dropped = 0;

    const total = matching.demandMatches.filter(m => {
      const e = enrichedDemand.get(recordKey(m.demand));
      return e && isSuccessfulEnrichment(e) && e.email;
    }).length;

    // Process each demand match using pre-detected edges
    for (const match of matching.demandMatches) {
      if (abortRef.current) break;

      const demandKey = recordKey(match.demand);
      const supplyKey = recordKey(match.supply);

      // GATE 1: Check for detected edge (from preflight)
      const edge = state.detectedEdges.get(demandKey);
      if (!edge) {
        console.log(`[COMPOSE] DROP: ${match.demand.company} - no edge detected`);
        dropped++;
        continue;
      }

      // GATE 2: Check demand enrichment
      const demandEnriched = enrichedDemand.get(demandKey);
      if (!demandEnriched || !isSuccessfulEnrichment(demandEnriched) || !demandEnriched.email) {
        console.log(`[COMPOSE] DROP: ${match.demand.company} - demand not enriched`);
        dropped++;
        continue;
      }

      // GATE 3: Check supply enrichment
      const supplyEnriched = enrichedSupply.get(supplyKey);
      if (!supplyEnriched || !isSuccessfulEnrichment(supplyEnriched) || !supplyEnriched.email) {
        console.log(`[COMPOSE] DROP: ${match.demand.company} - supply not enriched`);
        dropped++;
        continue;
      }

      // Build DemandRecord
      const demandRecord: DemandRecord = {
        domain: match.demand.domain,
        company: match.demand.company,
        contact: demandEnriched.firstName || match.demand.firstName || '',
        email: demandEnriched.email,
        title: demandEnriched.title || match.demand.title || '',
        industry: Array.isArray(match.demand.industry) ? match.demand.industry[0] || '' : (match.demand.industry || ''),
        signals: [],
        metadata: {},
      };

      // Build SupplyRecord (use raw fields for extended data)
      const supplyRaw = match.supply.raw || {};
      const supplyRecord: SupplyRecord = {
        domain: match.supply.domain,
        company: match.supply.company,
        contact: supplyEnriched.firstName || match.supply.firstName || '',
        email: supplyEnriched.email || '',
        title: supplyEnriched.title || match.supply.title || '',
        capability: supplyRaw.capability || supplyRaw.services || match.supply.headline || match.supply.signal || '',
        targetProfile: supplyRaw.targetProfile || (Array.isArray(match.supply.industry) ? (match.supply.industry as string[])[0] : match.supply.industry) || '',
        metadata: {},
      };

      // Build Counterparty (for Composer)
      const counterparty: Counterparty = {
        company: supplyRecord.company,
        contact: supplyRecord.contact,
        email: supplyRecord.email,
        fitReason: `${supplyRecord.company} focuses on ${supplyRecord.capability}. ${demandRecord.company} ${edge.evidence}.`,
      };

      // Compose intros using deterministic Composer
      try {
        const composed_output = composeIntros(demandRecord, edge, counterparty, supplyRecord);

        demandIntros.set(recordKey(match.demand), composed_output.demandBody);
        supplyIntros.set(recordKey(match.supply), composed_output.supplyBody);

        console.log(`[COMPOSE] ✓ ${match.demand.company} → ${match.supply.company} (${edge.type})`);
        composed++;
      } catch (err) {
        console.log(`[COMPOSE] DROP: ${match.demand.company} - Composer error: ${err}`);
        dropped++;
        continue;
      }

      progress++;
      setState(prev => ({
        ...prev,
        progress: { current: progress, total, message: `Writing clean introductions…` },
        demandIntros: new Map(demandIntros),
        supplyIntros: new Map(supplyIntros),
      }));
    }

    console.log(`[COMPOSE] Complete:`);
    console.log(`  - Composed: ${composed}`);
    console.log(`  - Dropped: ${dropped}`);
    console.log(`  - Demand intros: ${demandIntros.size}`);
    console.log(`  - Supply intros: ${supplyIntros.size}`);

    setState(prev => ({
      ...prev,
      demandIntros,
      supplyIntros,
    }));
  };

  // =============================================================================
  // EXPORT RECEIPT — Trust Layer (show what's filtered before download)
  // =============================================================================

  const openExportReceipt = useCallback(() => {
    if (!state.matchingResult) {
      console.log('[Export] No matching result, cannot open export');
      return;
    }

    // Build demand receipt
    const demandInput: DemandExportInput = {
      matches: state.matchingResult.demandMatches,
      enriched: state.enrichedDemand,
      intros: state.demandIntros,
    };
    const demandReceipt = buildDemandReceipt(demandInput);

    // Build supply receipt
    const supplyInput: SupplyExportInput = {
      aggregates: state.matchingResult.supplyAggregates,
      enriched: state.enrichedSupply,
      intros: state.supplyIntros,
    };
    const supplyReceipt = buildSupplyReceipt(supplyInput);

    const totalExported = demandReceipt.totalExported + supplyReceipt.totalExported;
    console.log('[Export] Opening modal:', { totalExported });

    // FIX: Fully reset modal state BEFORE reopening (Stripe/Vercel-grade)
    // This prevents the race condition where stale handlers intercept clicks
    setShowExportReceipt(false);
    setExportReceiptData(null);

    // requestAnimationFrame is more reliable than setTimeout(0) for UI re-mounts
    requestAnimationFrame(() => {
      setExportModalKey(prev => prev + 1);
      setExportReceiptData({ demand: demandReceipt, supply: supplyReceipt });
      setShowExportReceipt(true);
    });
  }, [state.matchingResult, state.enrichedDemand, state.enrichedSupply, state.demandIntros, state.supplyIntros]);

  // =============================================================================
  // INTRO REGENERATION HANDLER
  // =============================================================================

  const regenerateIntros = useCallback(async () => {
    if (!state.matchingResult) {
      console.error('[Flow] Cannot generate intros: no matching result');
      return;
    }

    // Generate intros
    setState(prev => ({ ...prev, step: 'generating' }));
    await runIntroGeneration(state.matchingResult, state.enrichedDemand, state.enrichedSupply);
    setState(prev => ({ ...prev, step: 'ready' }));
  }, [state.matchingResult, state.enrichedDemand, state.enrichedSupply]);

  // =============================================================================
  // CSV EXPORT HANDLER — Pure extraction from in-memory state
  // =============================================================================

  const handleExportCSV = useCallback(() => {
    const data: ExportData = {
      matchingResult: state.matchingResult,
      enrichedDemand: state.enrichedDemand,
      enrichedSupply: state.enrichedSupply,
      demandIntros: state.demandIntros,
      supplyIntros: state.supplyIntros,
    };

    // UNIFIED CSV (Option A) — Single file with side column
    // Headers: side, email, first_name, last_name, company_name, website, personalization,
    //          matched_supply_company, match_score, match_reason, confidence_tier (demand-specific),
    //          matched_demand_count, avg_match_score (supply-specific)
    const headers = [
      'side', 'email', 'first_name', 'last_name', 'company_name',
      'website', 'personalization',
      'matched_supply_company', 'match_score', 'match_reason', 'confidence_tier',
      'matched_demand_count', 'avg_match_score'
    ];

    // Build demand rows with lowercase side, add empty supply-specific columns
    const rawDemandRows = buildDemandExportRows(data);
    const demandRows = rawDemandRows.map(row => [
      'demand',           // side (lowercase per spec)
      row[1], row[2], row[3], row[4], row[5], row[6],  // email through personalization
      row[7], row[8], row[9], row[10],  // matched_supply_company, match_score, match_reason, confidence_tier
      '', ''  // matched_demand_count, avg_match_score (empty for demand)
    ]);

    // Build supply rows with lowercase side, add empty demand-specific columns
    const rawSupplyRows = buildSupplyExportRows(data);
    const supplyRows = rawSupplyRows.map(row => [
      'supply',           // side (lowercase per spec)
      row[1], row[2], row[3], row[4], row[5], row[6],  // email through personalization
      '', '', '', '',  // matched_supply_company, match_score, match_reason, confidence_tier (empty for supply)
      row[7], row[8]  // matched_demand_count, avg_match_score
    ]);

    // Combine all rows into single CSV
    const allRows = [...demandRows, ...supplyRows];

    if (allRows.length > 0) {
      const csv = buildCSV(headers, allRows);
      downloadCSV(`export_${Date.now()}.csv`, csv);
    }

    // Log export count
    console.log(`[CSV Export] Demand: ${demandRows.length}, Supply: ${supplyRows.length}, Total: ${allRows.length}`);

    // Close receipt modal after download
    setShowExportReceipt(false);
  }, [state.matchingResult, state.enrichedDemand, state.enrichedSupply, state.demandIntros, state.supplyIntros]);

  // =============================================================================
  // STEP 5: SEND VIA SENDER ADAPTER
  // =============================================================================

  const startSending = useCallback(async () => {
    // Resolve sender ONCE at start
    const senderId = settings?.sendingProvider || 'instantly';
    const sender = resolveSender(senderId);

    // GUARD — Sender must exist
    if (!guard(sender, BLOCKS.ROUTING_FAILED(`Unknown sending provider: ${senderId}`), setFlowBlock)) return;

    // Build sender config
    const senderConfig = buildSenderConfig({
      instantlyApiKey: settings?.instantlyApiKey,
      plusvibeApiKey: settings?.plusvibeApiKey,
      plusvibeWorkspaceId: settings?.plusvibeWorkspaceId,
      demandCampaignId: settings?.demandCampaignId,
      supplyCampaignId: settings?.supplyCampaignId,
      sendingProvider: senderId,
    });

    // GUARD — Config must be valid
    const configError = sender.validateConfig(senderConfig);
    if (!guard(!configError, BLOCKS.NO_SENDER_CONFIG, setFlowBlock)) return;

    // Intros already generated after enrichment (READY = fully materialized)
    // Send is now pure routing — no intro generation here
    const { matchingResult, enrichedDemand, enrichedSupply } = state;

    setState(prev => ({ ...prev, step: 'sending' }));

    // GUARD — Matching result required for sending
    if (!guard(matchingResult, BLOCKS.NO_MATCHES, setFlowBlock)) return;

    let sentDemand = 0;
    let sentSupply = 0;

    // Send to demand side
    if (senderConfig.demandCampaignId) {
      const demandToSend = matchingResult.demandMatches.filter(m => {
        const enriched = enrichedDemand.get(recordKey(m.demand));
        return enriched && isSuccessfulEnrichment(enriched) && enriched.email;
      });

      setState(prev => ({
        ...prev,
        progress: { current: 0, total: demandToSend.length, message: 'Sending to demand...' },
      }));

      for (let i = 0; i < demandToSend.length; i++) {
        if (abortRef.current) break;

        const match = demandToSend[i];
        const demandKey = recordKey(match.demand);
        const enriched = enrichedDemand.get(demandKey)!;

        // Use pre-generated AI intro (fall back to template if missing)
        // PHASE 3: Fallback routes through canonical doctrine (no timing defaults)
        const intro = state.demandIntros.get(demandKey) || generateDemandIntro({
          ...match.demand,
          firstName: enriched.firstName || match.demand.firstName,
          email: enriched.email,
        });

        try {
          const result = await sender.sendLead(senderConfig, {
            type: 'DEMAND',
            campaignId: senderConfig.demandCampaignId!,
            email: enriched.email!,
            firstName: enriched.firstName,
            lastName: enriched.lastName,
            companyName: match.demand.company,
            companyDomain: match.demand.domain,
            introText: intro,
            contactTitle: enriched.title,
          });
          if (result.success) {
            sentDemand++;
            // Fire-and-forget: Log match event for behavioral learning (Option B)
            if (user?.id && match.tier && match.needProfile && match.capabilityProfile) {
              logMatchSent({
                operatorId: user.id,
                demandDomain: match.demand.domain,
                supplyDomain: match.supply.domain,
                demandCompany: match.demand.company,
                supplyCompany: match.supply.company,
                score: match.score,
                tier: match.tier,
                tierReason: match.tierReason || '',
                needProfile: match.needProfile,
                capabilityProfile: match.capabilityProfile,
                scoreBreakdown: match.scoreBreakdown,
                campaignId: senderConfig.demandCampaignId!,
              }).catch(() => {}); // Silent fire-and-forget
            }
          }
        } catch (err) {
          console.error('[Flow] Send failed:', match.demand.domain, err);
        }

        setState(prev => ({
          ...prev,
          progress: { current: i + 1, total: demandToSend.length, message: `Demand ${i + 1}/${demandToSend.length}` },
        }));
      }
    }

    // Send to supply side (aggregated - one per supplier)
    if (senderConfig.supplyCampaignId) {
      const supplyToSend = matchingResult.supplyAggregates.filter(a => {
        const enriched = enrichedSupply.get(recordKey(a.supply));
        return enriched && isSuccessfulEnrichment(enriched) && enriched.email;
      });

      setState(prev => ({
        ...prev,
        progress: { current: 0, total: supplyToSend.length, message: 'Sending to supply...' },
      }));

      for (let i = 0; i < supplyToSend.length; i++) {
        if (abortRef.current) break;

        const agg = supplyToSend[i];
        const supplyKey = recordKey(agg.supply);
        const enriched = enrichedSupply.get(supplyKey)!;

        // Use pre-generated AI intro (fall back to template if missing)
        // PHASE 3: Fallback routes through canonical doctrine (no timing defaults)
        const intro = state.supplyIntros.get(supplyKey) || generateSupplyIntro(
          {
            ...agg.supply,
            firstName: enriched.firstName || agg.supply.firstName,
            email: enriched.email,
          },
          agg.bestMatch.demand
        );

        try {
          const result = await sender.sendLead(senderConfig, {
            type: 'SUPPLY',
            campaignId: senderConfig.supplyCampaignId!,
            email: enriched.email!,
            firstName: enriched.firstName,
            lastName: enriched.lastName,
            companyName: agg.supply.company,
            companyDomain: agg.supply.domain,
            introText: intro,
            contactTitle: enriched.title,
          });
          if (result.success) {
            sentSupply++;
            // Fire-and-forget: Log match event for behavioral learning (Option B)
            // Supply sends use bestMatch for the demand-supply pairing data
            const bestMatch = agg.bestMatch;
            if (user?.id && bestMatch.tier && bestMatch.needProfile && bestMatch.capabilityProfile) {
              logMatchSent({
                operatorId: user.id,
                demandDomain: bestMatch.demand.domain,
                supplyDomain: agg.supply.domain,
                demandCompany: bestMatch.demand.company,
                supplyCompany: agg.supply.company,
                score: bestMatch.score,
                tier: bestMatch.tier,
                tierReason: bestMatch.tierReason || '',
                needProfile: bestMatch.needProfile,
                capabilityProfile: bestMatch.capabilityProfile,
                scoreBreakdown: bestMatch.scoreBreakdown,
                campaignId: senderConfig.supplyCampaignId!,
              }).catch(() => {}); // Silent fire-and-forget
            }
          }
        } catch (err) {
          console.error('[Flow] Send failed:', agg.supply.domain, err);
        }

        setState(prev => ({
          ...prev,
          progress: { current: i + 1, total: supplyToSend.length, message: `Supply ${i + 1}/${supplyToSend.length}` },
        }));
      }
    }

    // Complete
    setState(prev => ({
      ...prev,
      step: 'complete',
      sentDemand,
      sentSupply,
    }));
  }, [state, settings]);

  // =============================================================================
  // HELPERS
  // =============================================================================

  async function fetchApifyDataset(datasetId: string, token: string): Promise<any[]> {
    const url = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch dataset');
    return response.json();
  }

  const reset = () => {
    abortRef.current = true;
    setState({
      step: 'upload',
      isHubFlow: false,
      demandSchema: null,
      supplySchema: null,
      demandRecords: [],
      supplyRecords: [],
      matchingResult: null,
      enrichedDemand: new Map(),
      enrichedSupply: new Map(),
      demandIntros: new Map(),
      supplyIntros: new Map(),
      progress: { current: 0, total: 0, message: '' },
      sentDemand: 0,
      sentSupply: 0,
      error: null,
      flowBlock: null,
      auditData: null,
      copyValidationFailures: [],
    });
  };

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <div className="min-h-screen bg-[#000000] text-white flex flex-col">
      {/* Back arrow */}
      <div className="px-8 pt-8">
        <button
          onClick={() => navigate('/launcher')}
          className="p-2 rounded-xl hover:bg-white/[0.04] transition-colors"
        >
          <ArrowLeft size={18} className="text-white/50" />
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center pb-24">
        <div className="w-full max-w-[520px] px-6">

          <AnimatePresence mode="wait">

          {/* UPLOAD / START */}
          {state.step === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="text-center"
            >
              <div className="w-12 h-12 mx-auto mb-6 rounded-xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/[0.08] flex items-center justify-center">
                <Workflow size={20} strokeWidth={1.5} className="text-white/80" />
              </div>

              <h1 className="text-[17px] font-medium text-white/90 mb-2">Flow</h1>
              <p className="text-[13px] text-white/40 mb-6">Match · Enrich · Send</p>

              {/* FlowBlock Banner — Zero Silent Failures (structured errors) */}
              {state.flowBlock && (
                <div ref={errorRef} className="mb-8 max-w-lg mx-auto">
                  <div className={`p-4 rounded-xl border ${
                    state.flowBlock.severity === 'warning'
                      ? 'bg-amber-500/[0.06] border-amber-500/20'
                      : state.flowBlock.severity === 'info'
                      ? 'bg-blue-500/[0.06] border-blue-500/20'
                      : 'bg-red-500/[0.06] border-red-500/20'
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <p className={`text-[13px] font-medium mb-1 ${
                          state.flowBlock.severity === 'warning' ? 'text-amber-400' :
                          state.flowBlock.severity === 'info' ? 'text-blue-400' : 'text-red-400'
                        }`}>
                          {state.flowBlock.title}
                        </p>
                        <p className="text-[12px] text-white/60 mb-2">{state.flowBlock.detail}</p>
                        <p className="text-[11px] text-white/40">{state.flowBlock.next_step}</p>
                      </div>
                      <button
                        onClick={() => setFlowBlock(null)}
                        className="p-1 rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-white/60"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/[0.06]">
                      <button
                        onClick={() => navigate('/settings')}
                        className="px-3 py-1.5 text-[11px] rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/70 hover:text-white/90 transition-colors"
                      >
                        Open Settings
                      </button>
                      <button
                        onClick={() => setFlowBlock(null)}
                        className="px-3 py-1.5 text-[11px] rounded-lg text-white/40 hover:text-white/60 transition-colors"
                      >
                        Dismiss
                      </button>
                      {isDebugMode && (
                        <span className="text-[10px] text-white/20 font-mono ml-auto">
                          {state.flowBlock.code}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Legacy Error Banner - Premium AlertPanel with Explainability */}
              {state.error && !state.flowBlock && (() => {
                // Normalize error to string (defensive against objects leaking in)
                const errorStr = safeRender(state.error);

                // Convert error string to UXBlock for rich explanation
                const errorBlock: UXBlock = errorStr.includes('Missing Apify token')
                  ? { type: 'DATASET_INVALID', side: 'demand', message: 'Missing Apify token' }
                  : errorStr.includes('Missing dataset')
                  ? { type: 'DATASET_INVALID', side: 'demand', message: errorStr }
                  : errorStr.includes('No supply dataset')
                  ? { type: 'DATASET_INVALID', side: 'supply', message: 'No supply dataset configured' }
                  : errorStr.includes('Hub')
                  ? { type: 'DATASET_INVALID', side: 'demand', message: errorStr }
                  : { type: 'UNKNOWN_ERROR', message: errorStr };

                const explanation = explain(errorBlock, {});

                return (
                  <div ref={errorRef} className="mb-8 max-w-lg mx-auto">
                    <AlertFromExplanation
                      explanation={explanation}
                      onAction={(action) => {
                        if (action.kind === 'open_settings') {
                          navigate('/settings');
                        } else if (action.kind === 'copy_to_clipboard') {
                          navigator.clipboard.writeText(
                            `Flow Error: ${errorStr}\n\nDataset: ${settings?.demandDatasetId || 'not set'}`
                          );
                        } else if (action.kind === 'retry') {
                          setState(prev => ({ ...prev, error: null }));
                        }
                      }}
                      onDismiss={() => setState(prev => ({ ...prev, error: null }))}
                    />
                    {/* Debug payload (only in debug mode) */}
                    {isDebugMode && settings && (
                      <details className="mt-2">
                        <summary className="text-[10px] text-white/30 cursor-pointer hover:text-white/50">
                          Debug info
                        </summary>
                        <div className="mt-2 p-2 rounded-lg bg-black/30 border border-white/[0.06] text-[10px] font-mono text-white/50 space-y-1">
                          <p>demandDatasetId: {settings.demandDatasetId || '(not set)'}</p>
                          <p>supplyDatasetId: {settings.supplyDatasetId || '(not set)'}</p>
                          <p>apifyToken: {settings.apifyToken ? '✓ set' : '✗ missing'}</p>
                          <p>aiConfig: {settings.aiConfig?.provider || 'none'}</p>
                        </div>
                      </details>
                    )}
                  </div>
                );
              })()}

              <button
                onClick={startFlow}
                disabled={!settings?.demandDatasetId}
                className="px-5 py-2.5 text-[13px] font-medium rounded-xl bg-white text-black hover:bg-white/90 active:scale-[0.98] disabled:opacity-30 transition-all"
              >
                {state.error ? 'Retry' : 'Begin Matching'}
              </button>

            </motion.div>
          )}

          {/* VALIDATING */}
          {state.step === 'validating' && (
            <motion.div
              key="validating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="w-10 h-10 mx-auto mb-8 rounded-full border-2 border-white/10 border-t-white/60"
              />
              <p className="text-[13px] text-white/40">{safeRender(state.progress.message)}</p>
            </motion.div>
          )}

          {/* MATCHING — Linear/Stripe-style progress */}
          {state.step === 'matching' && (
            <motion.div
              key="matching"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <p className="text-[14px] text-white/50 font-medium mb-2">Finding matches</p>
              <p className="text-[11px] text-white/30 mb-6">Analyzing your datasets…</p>
              <p className="text-[28px] font-light text-white/80 mb-6 tabular-nums">
                {Math.round((state.progress.current / Math.max(state.progress.total, 1)) * 100)}
                <span className="text-white/30 text-[18px]">%</span>
              </p>
              <div className="w-56 mx-auto">
                <div className="h-[3px] bg-white/[0.08] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-violet-400/60 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${(state.progress.current / Math.max(state.progress.total, 1)) * 100}%` }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* MATCHES FOUND — User must click to proceed to enrichment */}
          {state.step === 'matches_found' && (
            <motion.div
              key="matches_found"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-2xl mx-auto"
            >
              {(() => {
                const matches = state.matchingResult?.demandMatches || [];
                const totalScanned = state.demandRecords.length;
                const edgeCount = matches.length;

                // Get top 3 matches for preview
                const previewMatches = matches.slice(0, 3);
                const moreCount = Math.max(0, matches.length - 3);

                // PHILEMON: Runtime preflight — derive routability from actual data, not schema assumptions
                const demandPreflight = preflightDataset(
                  'Demand',
                  state.demandRecords,
                  state.demandSchema?.id
                );
                const supplyPreflight = preflightDataset(
                  'Supply',
                  state.supplyRecords,
                  state.supplySchema?.id
                );

                // Routability check — both datasets must be routable for enrichment
                const demandRoutable = isRoutable(demandPreflight);
                const supplyRoutable = isRoutable(supplyPreflight);
                const canEnrich = demandRoutable && supplyRoutable;

                // Block reason if either dataset is incomplete
                const blockReason = !demandRoutable
                  ? demandPreflight.blockReason
                  : !supplyRoutable
                  ? supplyPreflight.blockReason
                  : undefined;

                // =============================================================
                // 3-LINE SIGNATURE HELPERS — Entity-specific, not generic
                // Line 1: Entity name
                // Line 2: Signal (what changed)
                // Line 3: Context (entity-specific)
                // =============================================================
                const getDemandSignature = (match: typeof matches[0], edge: Edge | undefined) => {
                  const company = match.demand.company;
                  // Line 2: Signal - use actual job title or edge type
                  const signal = match.demand.signal
                    ? `Hiring ${match.demand.signal}`
                    : edge?.type === 'FUNDING_RECENT' ? 'Just raised funding'
                    : edge?.type === 'SCALING' ? 'Scaling team'
                    : edge?.type === 'GROWTH' ? 'Growing fast'
                    : 'Active hiring signal';
                  // Line 3: Context - industry with dots (limit to 3 for readability)
                  // Handle string, array, or missing industry
                  let context = 'Timing signal detected';
                  if (match.demand.industry) {
                    let industries: string[] = [];
                    if (typeof match.demand.industry === 'string') {
                      industries = match.demand.industry.split(/[,\/]/).map(s => s.trim()).filter(Boolean);
                    } else if (Array.isArray(match.demand.industry)) {
                      industries = match.demand.industry.filter(Boolean);
                    }
                    // Limit to 3 industries max for clean UI
                    const displayIndustries = industries.slice(0, 3);
                    context = displayIndustries.join(' · ');
                  }
                  return { company, signal, context };
                };

                // Rotating fit phrases to avoid robotic feel
                const FIT_PHRASES = [
                  'Has done this role before',
                  'Scaled teams at this level',
                  'Worked in similar companies',
                ];

                const getSupplySignature = (match: typeof matches[0], index: number) => {
                  const entity = match.supply.company;
                  // Line 2: What they do - use title if available
                  const capability = match.supply.title
                    ? match.supply.title
                    : 'Industry operator';
                  // Line 3: Why them - rotate phrases based on index
                  const fit = match.supply.industry
                    ? `Works in ${match.supply.industry}`
                    : FIT_PHRASES[index % FIT_PHRASES.length];
                  return { entity, capability, fit };
                };

                // Entity-specific tooltip
                const getDemandTooltip = (match: typeof matches[0], edge: Edge | undefined) => {
                  const action = edge?.type === 'LEADERSHIP_GAP' ? 'opened a senior role'
                    : edge?.type === 'FUNDING_RECENT' ? 'raised funding recently'
                    : edge?.type === 'SCALING' ? 'is scaling up'
                    : 'has an active signal';
                  return `${match.demand.company} ${action}`;
                };

                const getSupplyTooltip = (match: typeof matches[0]) => {
                  return match.supply.title
                    ? `${match.supply.company} — ${match.supply.title}`
                    : `${match.supply.company} can help`;
                };

                return (
                  <>
                    {/* ============================================= */}
                    {/* DATASET AWARENESS CARDS — Always render, derived from actual data */}
                    {/* ============================================= */}
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                      className="grid grid-cols-2 gap-4 mb-8"
                    >
                      {/* Demand Dataset Card */}
                      <motion.div
                        className={`group p-4 rounded-xl transition-all duration-300
                          ${demandRoutable
                            ? 'bg-white/[0.02] border border-white/[0.08] hover:bg-white/[0.03]'
                            : 'bg-amber-500/[0.05] border border-amber-500/20'
                          }`}
                        whileHover={{ y: -2 }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-[11px] text-white/50 font-medium tracking-wide">DEMAND</p>
                          {!demandRoutable && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                              INCOMPLETE
                            </span>
                          )}
                          {demandPreflight.state === 'ROUTABLE_DERIVED' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40">
                              {demandPreflight.derivedNote}
                            </span>
                          )}
                        </div>
                        <p className="text-[13px] text-white/80 font-medium">
                          {demandPreflight.card.title}
                        </p>
                        <div className="overflow-hidden transition-all duration-300 max-h-0 group-hover:max-h-20 group-hover:mt-2">
                          <p className="text-[10px] text-white/40">
                            Contains: {demandPreflight.card.contains}
                          </p>
                          <p className="text-[10px] text-white/30 mt-0.5">
                            Missing: {demandPreflight.card.missing}
                          </p>
                        </div>
                      </motion.div>

                      {/* Supply Dataset Card */}
                      <motion.div
                        className={`group p-4 rounded-xl transition-all duration-300
                          ${supplyRoutable
                            ? 'bg-white/[0.02] border border-white/[0.08] hover:bg-white/[0.03]'
                            : 'bg-amber-500/[0.05] border border-amber-500/20'
                          }`}
                        whileHover={{ y: -2 }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-[11px] text-white/50 font-medium tracking-wide">SUPPLY</p>
                          {!supplyRoutable && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                              INCOMPLETE
                            </span>
                          )}
                          {supplyPreflight.state === 'ROUTABLE_DERIVED' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40">
                              {supplyPreflight.derivedNote}
                            </span>
                          )}
                        </div>
                        <p className="text-[13px] text-white/80 font-medium">
                          {supplyPreflight.card.title}
                        </p>
                        <div className="overflow-hidden transition-all duration-300 max-h-0 group-hover:max-h-20 group-hover:mt-2">
                          <p className="text-[10px] text-white/40">
                            Contains: {supplyPreflight.card.contains}
                          </p>
                          <p className="text-[10px] text-white/30 mt-0.5">
                            Missing: {supplyPreflight.card.missing}
                          </p>
                        </div>
                      </motion.div>
                    </motion.div>

                    {/* ============================================= */}
                    {/* HEADING + STATS */}
                    {/* ============================================= */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="text-center mb-8"
                    >
                      <h2 className="text-[32px] font-light text-white/90 mb-2">
                        {edgeCount > 0 ? `${edgeCount} companies ready` : 'Datasets loaded'}
                      </h2>
                      <p className="text-[12px] text-white/40">
                        {edgeCount > 0
                          ? `${totalScanned} scanned · ready to find contacts`
                          : `${totalScanned} companies loaded · you can send to any of them`
                        }
                      </p>

                      {/* Confidence Tier Legend */}
                      <div className="flex items-center justify-center gap-4 mt-4 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="text-violet-400">🟣</span>
                          <span className="text-white/50">Strong fit</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-blue-400">🔵</span>
                          <span className="text-white/50">Good fit</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-white/40">⚪</span>
                          <span className="text-white/50">Exploratory</span>
                        </div>
                      </div>
                    </motion.div>

                    {/* ============================================= */}
                    {/* COLUMN HEADERS — Strong, with underline */}
                    {/* ============================================= */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.15 }}
                      className="grid grid-cols-[1fr_40px_1fr] gap-0 mb-4"
                    >
                      <div className="border-b border-white/[0.15] pb-2">
                        <span className="text-[12px] font-medium text-white/60 tracking-wide">
                          Companies that need help
                        </span>
                      </div>
                      <div /> {/* Spacer for connector */}
                      <div className="border-b border-white/[0.15] pb-2 text-right">
                        <span className="text-[12px] font-medium text-white/60 tracking-wide">
                          People with relevant experience
                        </span>
                      </div>
                    </motion.div>

                    {/* ============================================= */}
                    {/* MATCH CARDS — 3-line signature, equal columns */}
                    {/* ============================================= */}
                    <div className="space-y-3">
                      {previewMatches.map((match, i) => {
                        const edge = state.detectedEdges.get(recordKey(match.demand));
                        const demandSig = getDemandSignature(match, edge);
                        const supplySig = getSupplySignature(match, i);
                        const isLast = i === previewMatches.length - 1;

                        return (
                          <motion.div
                            key={match.demand.domain}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 + (i * 0.02), duration: 0.3 }}
                            className="group"
                          >
                            <div className="grid grid-cols-[1fr_40px_1fr] gap-0 items-center">
                              {/* DEMAND CARD — Left */}
                              <motion.div
                                className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]
                                  group-hover:bg-white/[0.05] group-hover:border-white/[0.1]
                                  transition-all duration-200 overflow-hidden min-w-0"
                                whileHover={{ y: -2 }}
                                title={getDemandTooltip(match, edge)}
                              >
                                {/* Line 1: Entity + Tier Badge */}
                                <div className="flex items-center gap-2">
                                  <p className="text-[14px] font-medium text-white/80 truncate flex-1">
                                    {demandSig.company}
                                  </p>
                                  {/* Confidence Tier Badge */}
                                  <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                                    match.tier === 'strong'
                                      ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                                      : match.tier === 'good'
                                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                        : 'bg-white/10 text-white/50 border border-white/20'
                                  }`}>
                                    {match.tier === 'strong' ? '🟣' : match.tier === 'good' ? '🔵' : '⚪'}
                                  </span>
                                </div>
                                {/* Line 2: Signal */}
                                <p className="text-[12px] text-white/50 mt-1 truncate">
                                  {demandSig.signal}
                                </p>
                                {/* Line 3: Tier Reason (replaces generic context) */}
                                <p className="text-[11px] text-white/40 mt-0.5 truncate">
                                  {match.tierReason || demandSig.context}
                                </p>
                              </motion.div>

                              {/* CONNECTOR RAIL — Animated on hover */}
                              <div className="relative flex items-center justify-center h-full">
                                <div className="absolute w-full h-[1px] bg-white/[0.1] group-hover:bg-white/[0.2] transition-colors" />
                                <motion.div
                                  className="absolute left-0 w-2 h-2 rounded-full bg-white/30 group-hover:bg-white/50"
                                  initial={{ x: 0 }}
                                  whileHover={{ x: 24 }}
                                  transition={{ duration: 0.3 }}
                                />
                                <div className="absolute right-0 w-0 h-0 border-t-[4px] border-t-transparent
                                  border-b-[4px] border-b-transparent border-l-[6px] border-l-white/30
                                  group-hover:border-l-white/50 transition-colors" />
                              </div>

                              {/* SUPPLY CARD — Right */}
                              <motion.div
                                className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]
                                  group-hover:bg-white/[0.05] group-hover:border-white/[0.1]
                                  transition-all duration-200 overflow-hidden min-w-0"
                                whileHover={{ y: -2 }}
                                title={getSupplyTooltip(match)}
                              >
                                {/* Line 1: Entity */}
                                <p className="text-[14px] font-medium text-white/70 truncate">
                                  {supplySig.entity}
                                </p>
                                {/* Line 2: Capability */}
                                <p className="text-[12px] text-white/50 mt-1 truncate">
                                  {supplySig.capability}
                                </p>
                                {/* Line 3: Fit */}
                                <p className="text-[11px] text-white/30 mt-0.5 truncate">
                                  {supplySig.fit}
                                </p>
                              </motion.div>
                            </div>

                            {/* +X MORE — Attached to last card */}
                            {isLast && moreCount > 0 && (
                              <motion.div
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 0.6, y: 0 }}
                                transition={{ delay: 0.5 }}
                                className="text-center mt-3"
                              >
                                <span className="text-[11px] text-white/40">
                                  +{moreCount} more matches
                                </span>
                              </motion.div>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>

                    {/* ============================================= */}
                    {/* CTA SECTION — Anchored under cards */}
                    {/* ============================================= */}
                    {(() => {
                      // PHILEMON: Build enrichment plan to show provider status
                      const enrichmentPlan = buildEnrichmentPlan(
                        matches.map(m => ({
                          domain: m.demand.domain,
                          company: m.demand.company,
                          email: m.demand.existingContact?.email,
                          existingContact: m.demand.existingContact,
                        })),
                        {
                          apolloApiKey: settings?.apolloApiKey,
                          anymailApiKey: settings?.anymailApiKey,
                          connectorAgentApiKey: settings?.connectorAgentApiKey,
                        }
                      );

                      const { summary } = enrichmentPlan;

                      // PHILEMON: Combine provider status with dataset routability
                      const canProceed = canEnrich && summary.enabledProviders.length > 0;

                      return (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.4 }}
                          className="mt-8 pt-6 border-t border-white/[0.06] text-center"
                        >
                          {/* PHILEMON: Block message when dataset is incomplete */}
                          {!canEnrich && blockReason && (
                            <div className="mb-6 p-4 rounded-xl bg-amber-500/[0.08] border border-amber-500/20">
                              <p className="text-[12px] text-amber-400 font-medium">
                                Dataset incomplete
                              </p>
                              <p className="text-[11px] text-amber-400/70 mt-1">
                                {blockReason}
                              </p>
                            </div>
                          )}

                          {/* Pre-enrichment explanation (only when routable) */}
                          {canEnrich && (
                            <p className="text-[11px] text-white/40 mb-4">
                              We will try to find emails. Some companies don't have public emails. That's normal.
                            </p>
                          )}

                          {/* Provider status (only when routable) */}
                          {canEnrich && (
                            <div className="flex items-center justify-center gap-4 mb-5">
                              {enrichmentPlan.providers.map(p => (
                                <div key={p.provider} className="flex items-center gap-1.5">
                                  <span className={`w-1.5 h-1.5 rounded-full ${p.enabled ? 'bg-emerald-400' : 'bg-white/20'}`} />
                                  <span className={`text-[10px] ${p.enabled ? 'text-white/50' : 'text-white/30'}`}>
                                    {p.provider === 'apollo' ? 'Apollo' : p.provider === 'anymail' ? 'Anymail' : 'Connector Agent'}
                                  </span>
                                  {!p.enabled && (
                                    <span className="text-[9px] text-white/20">(not connected)</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Summary stats (only when routable) */}
                          {canEnrich && (summary.recordsWithEmail > 0 || summary.recordsMissingDomain > 0) && (
                            <p className="text-[10px] text-white/30 mb-4">
                              {summary.recordsWithEmail > 0 && `${summary.recordsWithEmail} already have emails. `}
                              {summary.recordsMissingDomain > 0 && `${summary.recordsMissingDomain} missing website.`}
                            </p>
                          )}

                          <motion.button
                            onClick={proceedToEnrichment}
                            disabled={!canProceed}
                            className={`px-8 py-3 rounded-xl font-medium text-[14px]
                              transition-all duration-200 shadow-[0_0_20px_rgba(255,255,255,0.1)]
                              ${canProceed
                                ? 'bg-white text-black hover:scale-[1.02] active:scale-[0.98]'
                                : 'bg-white/10 text-white/40 cursor-not-allowed'
                              }`}
                            whileHover={canProceed ? { boxShadow: '0 0 30px rgba(255,255,255,0.15)' } : {}}
                          >
                            {!canEnrich
                              ? 'Re-run scrape with required fields'
                              : summary.enabledProviders.length > 0
                              ? `Find emails for ${summary.recordsNeedingEnrichment} companies`
                              : 'Connect an email tool in Settings'
                            }
                          </motion.button>

                          {/* Credits info — only when routable AND providers enabled */}
                          {canProceed && (
                            <p className="text-[10px] text-white/30 mt-3">
                              Uses credits for {summary.recordsNeedingEnrichment} lookups
                            </p>
                          )}
                        </motion.div>
                      );
                    })()}
                  </>
                );
              })()}
            </motion.div>
          )}

          {/* ESCAPE HATCH — Always allow sending */}
          {state.step === 'no_matches' && (
            <motion.div
              key="no_matches"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center max-w-md mx-auto"
            >
              {/* Primary heading — encouraging, not blocking */}
              <h2 className="text-[32px] font-light text-white/90 mb-3">
                Datasets loaded
              </h2>

              {/* Secondary text — action-oriented */}
              <p className="text-[14px] text-white/40 mb-8">
                We found companies you can reach out to.
              </p>

              {/* Helper copy — encouraging */}
              <div className="space-y-1.5 mb-10 text-[13px] text-white/30">
                <p>These are exploratory matches.</p>
                <p>Some may need softer positioning.</p>
                <p>You can always refine later.</p>
              </div>

              {/* PRIMARY CTA — Send anyway (escape hatch) */}
              <button
                onClick={proceedToEnrichment}
                className="px-8 py-3 bg-white text-black rounded-xl text-[14px] font-medium
                  hover:scale-[1.02] active:scale-[0.98]
                  transition-all duration-200 shadow-[0_0_20px_rgba(255,255,255,0.1)]"
              >
                Find contacts anyway
              </button>

              {/* SECONDARY — Try different datasets */}
              <button
                onClick={() => {
                  setState(prev => ({
                    ...prev,
                    step: 'upload',
                    matchingResult: null,
                    detectedEdges: new Map(),
                    enrichedDemand: new Map(),
                    enrichedSupply: new Map(),
                    demandIntros: new Map(),
                    supplyIntros: new Map(),
                    progress: { current: 0, total: 0, message: '' },
                  }));
                }}
                className="mt-4 px-6 py-2.5 bg-transparent border border-white/[0.08] text-white/50 rounded-xl text-[13px]
                  hover:border-white/[0.12] hover:text-white/70
                  transition-all duration-200"
              >
                Or try different datasets
              </button>

              {/* Reassurance */}
              <p className="mt-6 text-[11px] text-white/30">
                You can always refine your approach later.
              </p>
            </motion.div>
          )}

          {/* ENRICHING — Stripe-style: clean progress bar */}
          {state.step === 'enriching' && (
            <motion.div
              key="enriching"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <p className="text-[14px] text-white/50 font-medium mb-2">Finding decision-makers…</p>
              <p className="text-[11px] text-white/30 mb-6">We only do this when there's a real match.</p>
              <p className="text-[28px] font-light text-white/80 mb-6">
                {state.progress.current} <span className="text-white/30">of {state.progress.total}</span>
              </p>
              <div className="w-56 mx-auto">
                <div className="h-[3px] bg-white/[0.08] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-white/40 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${(state.progress.current / Math.max(state.progress.total, 1)) * 100}%` }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  />
                </div>
              </div>
              <p className="mt-8 text-[11px] text-white/20">Safe to leave</p>
            </motion.div>
          )}

          {/* ENRICHMENT COMPLETE — Ready for intro generation */}
          {state.step === 'route_context' && (
            <motion.div
              key="route_context"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              {(() => {
                // INVARIANT: Match count persists independently of enrichment
                const demandMatches = state.matchingResult?.demandMatches || [];
                const supplyAggregates = state.matchingResult?.supplyAggregates || [];
                const matchCount = demandMatches.length; // This NEVER changes after edge preflight

                // Enrichment results (can be 0 if BUDGET_EXCEEDED)
                const demandEnriched = demandMatches.filter(m => {
                  const e = state.enrichedDemand.get(recordKey(m.demand));
                  return e && isSuccessfulEnrichment(e) && e.email;
                }).length;
                const supplyEnriched = supplyAggregates.filter(a => {
                  const e = state.enrichedSupply.get(recordKey(a.supply));
                  return e && isSuccessfulEnrichment(e) && e.email;
                }).length;
                const totalEnriched = demandEnriched + supplyEnriched;
                const enrichmentFailed = matchCount > 0 && totalEnriched === 0;
                const enrichmentPartial = matchCount > 0 && totalEnriched > 0 && totalEnriched < matchCount;

                // SENDABLE COUNT — requires both sides enriched (routable contacts)
                // Per user.txt: "intro routing requires stricter constraints"
                const sendableCount = Math.min(demandEnriched, supplyEnriched);

                // =============================================================
                // EMAIL AVAILABILITY STATE (per directive)
                // INVARIANT: If at least ONE email exists, CSV export MUST be available.
                // Intro feasibility must NEVER gate email export.
                // =============================================================
                const demandEmailState: 'ALL' | 'PARTIAL' | 'NONE' =
                  demandEnriched === 0 ? 'NONE' :
                  demandEnriched === demandMatches.length ? 'ALL' : 'PARTIAL';
                const demandWithoutEmail = demandMatches.length - demandEnriched;

                // Matches WITH email (for CSV export)
                const demandWithEmail = demandMatches.filter(m => {
                  const e = state.enrichedDemand.get(recordKey(m.demand));
                  return e && isSuccessfulEnrichment(e) && e.email;
                });

                // Matches WITHOUT email (for LinkedIn export)
                const demandWithoutEmailList = demandMatches.filter(m => {
                  const e = state.enrichedDemand.get(recordKey(m.demand));
                  return !e || !isSuccessfulEnrichment(e) || !e.email;
                });

                // =============================================================
                // ENRICHMENT STATUS HELPER — Maps outcome to simple label
                // =============================================================
                const getEnrichmentStatusLabel = (result: EnrichmentResult | undefined): { label: string; color: string } => {
                  if (!result) {
                    return { label: 'Not searched', color: 'text-white/30' };
                  }
                  // Use outcome (never collapse to boolean)
                  if (isSuccessfulEnrichment(result) && result.email) {
                    return { label: 'Email found', color: 'text-emerald-400/80' };
                  }
                  if (result.outcome === 'ERROR' || result.outcome === 'RATE_LIMITED') {
                    return { label: 'Credits used up', color: 'text-amber-400/70' };
                  }
                  // Use human-readable explanation from outcome
                  return { label: getOutcomeExplanation(result), color: 'text-white/40' };
                };

                // Build per-company status list
                const enrichmentStatusList = demandMatches.map(m => {
                  const result = state.enrichedDemand.get(recordKey(m.demand));
                  const status = getEnrichmentStatusLabel(result);
                  return {
                    company: m.demand.company,
                    domain: m.demand.domain,
                    ...status,
                  };
                });

                // Count by status for summary
                const statusCounts = {
                  found: enrichmentStatusList.filter(s => s.label === 'Email found').length,
                  notFound: enrichmentStatusList.filter(s => s.label === 'No public email').length,
                  creditsUsed: enrichmentStatusList.filter(s => s.label === 'Credits used up').length,
                };

                return (
                  <div className="flex flex-col items-center">
                    {/* Checkmark — subtle purple, Linear style */}
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 200, damping: 15 }}
                      className="relative w-12 h-12 mb-4"
                    >
                      <div className="absolute inset-0 rounded-full bg-violet-500/10 blur-lg" />
                      <div className="relative w-full h-full rounded-full bg-gradient-to-b from-violet-500/15 to-violet-500/5 border border-violet-500/20 flex items-center justify-center">
                        <motion.svg
                          className="w-5 h-5 text-violet-400/80"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <motion.path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ duration: 0.4, delay: 0.2 }}
                          />
                        </motion.svg>
                      </div>
                    </motion.div>

                    {/* Count — INVARIANT: always show match count, route count separate */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 }}
                      className="text-center mb-4"
                    >
                      <p className="text-[18px] font-light text-white/80">{matchCount} matches found</p>
                      {demandEmailState === 'NONE' ? (
                        <p className="text-[12px] text-white/40 mt-2">No public emails found</p>
                      ) : demandEmailState === 'PARTIAL' ? (
                        <p className="text-[12px] text-white/40 mt-2">{demandEnriched} emails · {demandWithoutEmail} need LinkedIn</p>
                      ) : (
                        <p className="text-[12px] text-white/40 mt-2">{demandEnriched} ready to send</p>
                      )}
                    </motion.div>

                    {/* Enrichment Status Summary — Simple labels, no raw codes */}
                    {(enrichmentFailed || enrichmentPartial) && (
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="mb-6 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] max-w-xs"
                      >
                        <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2 text-center">What happened</p>
                        <div className="flex justify-center gap-4 text-[11px]">
                          {statusCounts.found > 0 && (
                            <span className="text-emerald-400/80">{statusCounts.found} email found</span>
                          )}
                          {statusCounts.notFound > 0 && (
                            <span className="text-white/40">{statusCounts.notFound} no public email</span>
                          )}
                          {statusCounts.creditsUsed > 0 && (
                            <span className="text-amber-400/70">{statusCounts.creditsUsed} credits used up</span>
                          )}
                        </div>
                        <p className="text-[9px] text-white/20 mt-2 text-center">
                          Some companies don't have public emails. This is normal.
                        </p>
                      </motion.div>
                    )}

                    {/* Info Card — Only shows when some matches don't have emails */}
                    {demandWithoutEmail > 0 && demandEmailState === 'PARTIAL' && (
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.25 }}
                        className="mb-6 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] max-w-sm"
                      >
                        <p className="text-[12px] text-white/50 text-center">
                          {demandWithoutEmail} {demandWithoutEmail === 1 ? 'match doesn\'t' : 'matches don\'t'} list public emails.
                        </p>
                      </motion.div>
                    )}

                    {/* Buttons — based on EMAIL AVAILABILITY STATE */}
                    {/* INVARIANT: If at least ONE email exists, CSV export MUST be available */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="flex flex-col items-center gap-3"
                    >
                      {/* CSV Export — shows when ANY emails exist (STATE A or B) */}
                      {demandEmailState !== 'NONE' && (
                        <button
                          onClick={() => {
                            const csvContent = [
                              ['Company', 'Domain', 'Person', 'Title', 'Email'].join(','),
                              ...demandWithEmail.map(m => {
                                const e = state.enrichedDemand.get(recordKey(m.demand));
                                return [
                                  m.demand.companyName || '',
                                  m.demand.domain || '',
                                  e?.name || m.demand.existingContact?.name || '',
                                  e?.title || m.demand.existingContact?.title || '',
                                  e?.email || ''
                                ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
                              })
                            ].join('\n');
                            const blob = new Blob([csvContent], { type: 'text/csv' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `email-outreach-${Date.now()}.csv`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="px-6 py-2.5 bg-white text-black rounded-xl font-medium text-[13px]
                            hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                        >
                          Export CSV ({demandEnriched} emails)
                        </button>
                      )}

                      {/* LinkedIn Export — shows when ANY are missing emails (STATE B or C) */}
                      {demandWithoutEmail > 0 && (
                        <button
                          onClick={() => {
                            const csvContent = [
                              ['Company', 'Domain', 'Person', 'Title', 'LinkedIn'].join(','),
                              ...demandWithoutEmailList.map(m => [
                                m.demand.companyName || '',
                                m.demand.domain || '',
                                m.demand.existingContact?.name || '',
                                m.demand.existingContact?.title || '',
                                m.demand.existingContact?.linkedin || ''
                              ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
                            ].join('\n');
                            const blob = new Blob([csvContent], { type: 'text/csv' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `linkedin-outreach-${Date.now()}.csv`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className={`px-6 py-2.5 rounded-xl font-medium text-[13px]
                            hover:scale-[1.02] active:scale-[0.98] transition-all duration-200
                            ${demandEmailState === 'NONE'
                              ? 'bg-white text-black'
                              : 'bg-white/[0.08] text-white/80 hover:bg-white/[0.12]'
                            }`}
                        >
                          Export LinkedIn ({demandWithoutEmail})
                        </button>
                      )}

                      {/* Generate Intros — only when sendableCount > 0 */}
                      {sendableCount > 0 && (
                        <button
                          onClick={regenerateIntros}
                          className="px-6 py-2.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30
                            rounded-xl font-medium text-[13px]
                            hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                        >
                          Generate intros ({sendableCount})
                        </button>
                      )}
                    </motion.div>
                  </div>
                );
              })()}
            </motion.div>
          )}

          {/* GENERATING — Stripe-style: clean progress */}
          {state.step === 'generating' && (
            <motion.div
              key="generating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <p className="text-[14px] text-white/50 font-medium mb-4">Writing intros</p>
              <p className="text-[28px] font-light text-white/80 mb-6">
                {state.progress.current} <span className="text-white/30">of {state.progress.total}</span>
              </p>
              <div className="w-56 mx-auto">
                <div className="h-[3px] bg-white/[0.08] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-emerald-400/50 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${(state.progress.current / Math.max(state.progress.total, 1)) * 100}%` }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* READY — Split Model (Ready to Send vs Need Email) */}
          {state.step === 'ready' && (
            <motion.div
              key="ready"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-2xl mx-auto"
            >
              {(() => {
                // Calculate split: ready vs need email
                const demandMatches = state.matchingResult?.demandMatches || [];
                const supplyAggregates = state.matchingResult?.supplyAggregates || [];

                // Ready to send (has email)
                const demandReady = demandMatches.filter(m => {
                  const e = state.enrichedDemand.get(recordKey(m.demand));
                  return e && isSuccessfulEnrichment(e) && e.email;
                });
                const supplyReady = supplyAggregates.filter(a => {
                  const e = state.enrichedSupply.get(recordKey(a.supply));
                  return e && isSuccessfulEnrichment(e) && e.email;
                });

                // Need email (no email found)
                const demandNeedEmail = demandMatches.filter(m => {
                  const e = state.enrichedDemand.get(recordKey(m.demand));
                  return !e || !isSuccessfulEnrichment(e) || !e.email;
                });
                const supplyNeedEmail = supplyAggregates.filter(a => {
                  const e = state.enrichedSupply.get(recordKey(a.supply));
                  return !e || !isSuccessfulEnrichment(e) || !e.email;
                });

                const totalReady = demandReady.length + supplyReady.length;
                const totalNeedEmail = demandNeedEmail.length + supplyNeedEmail.length;

                return (
                  <div className="space-y-12">
                    {/* ═══════════════════════════════════════════════════════════════
                        ZONE 1: Ready to Send
                    ═══════════════════════════════════════════════════════════════ */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8"
                    >
                      {/* Header */}
                      <div className="flex items-baseline justify-between mb-2">
                        <h2 className="text-[15px] font-medium text-white/90">Ready to Send</h2>
                        <span className="text-[32px] font-light text-white/90 tabular-nums">{totalReady}</span>
                      </div>
                      <p className="text-[13px] text-white/40 mb-6">Emails found. Ready for Instantly.</p>

                      {/* Preview cards (max 2) */}
                      {totalReady > 0 && (
                        <div className="space-y-3 mb-6">
                          {demandReady.slice(0, 2).map((m, i) => {
                            const demandKey = recordKey(m.demand);
                            const e = state.enrichedDemand.get(demandKey);
                            const intro = state.demandIntros.get(demandKey);
                            return (
                              <div key={demandKey} className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[13px] font-medium text-white/90 truncate">{m.demand.company}</p>
                                    <p className="text-[12px] text-white/40 truncate">{m.demand.industry || 'Company'}</p>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <p className="text-[12px] text-white/60 font-mono">{e?.email}</p>
                                    <p className="text-[10px] text-emerald-400/70">✓ verified</p>
                                  </div>
                                </div>
                                {intro && (
                                  <p className="mt-3 text-[11px] text-white/50 line-clamp-2 leading-relaxed">"{intro}"</p>
                                )}
                              </div>
                            );
                          })}
                          {totalReady > 2 && (
                            <p className="text-[12px] text-white/30 text-center">+{totalReady - 2} more ready</p>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={startSending}
                          disabled={totalReady === 0}
                          className="flex-1 px-5 py-3 text-[13px] font-medium rounded-xl transition-all bg-white text-black hover:bg-white/90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Send {totalReady} to Instantly
                        </button>
                        <button
                          onClick={openExportReceipt}
                          className="px-4 py-3 text-[13px] font-medium rounded-xl border border-white/[0.12] text-white/70 hover:text-white hover:border-white/30 transition-all active:scale-[0.98]"
                        >
                          Export CSV
                        </button>
                      </div>
                    </motion.div>

                    {/* ═══════════════════════════════════════════════════════════════
                        ZONE 2: Need Email
                    ═══════════════════════════════════════════════════════════════ */}
                    {totalNeedEmail > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="rounded-2xl border border-amber-500/[0.15] bg-amber-500/[0.02] p-8"
                      >
                        {/* Header */}
                        <div className="flex items-baseline justify-between mb-2">
                          <h2 className="text-[15px] font-medium text-white/90">Need Email</h2>
                          <span className="text-[32px] font-light text-white/60 tabular-nums">{totalNeedEmail}</span>
                        </div>
                        <p className="text-[13px] text-white/40 mb-6">Intro ready. Saad recommends LinkedIn DMs when no contact found.</p>

                        {/* Preview cards (max 2) */}
                        <div className="space-y-3 mb-6">
                          {demandNeedEmail.slice(0, 2).map((m, i) => {
                            const intro = state.demandIntros.get(recordKey(m.demand));
                            return (
                              <div key={m.demand.domain} className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[13px] font-medium text-white/90 truncate">{m.demand.company}</p>
                                    <p className="text-[12px] text-white/40 truncate">{m.demand.industry || 'Company'}</p>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <p className="text-[12px] text-white/40 font-mono">{m.demand.domain}</p>
                                    <p className="text-[10px] text-amber-400/70">no email found</p>
                                  </div>
                                </div>
                                {intro && (
                                  <p className="mt-3 text-[11px] text-white/50 line-clamp-2 leading-relaxed">"{intro}"</p>
                                )}
                              </div>
                            );
                          })}
                          {totalNeedEmail > 2 && (
                            <p className="text-[12px] text-white/30 text-center">+{totalNeedEmail - 2} more need email</p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              // Export only need-email records
                              const records = [...demandNeedEmail.map(m => ({
                                type: 'demand',
                                company: m.demand.company,
                                domain: m.demand.domain,
                                industry: m.demand.industry || '',
                                intro: state.demandIntros.get(recordKey(m.demand)) || '',
                                email: '',
                              })), ...supplyNeedEmail.map(a => ({
                                type: 'supply',
                                company: a.supply.company,
                                domain: a.supply.domain,
                                industry: a.supply.industry || '',
                                intro: state.supplyIntros.get(recordKey(a.supply)) || '',
                                email: '',
                              }))];
                              const csv = [
                                ['type', 'company', 'domain', 'industry', 'intro', 'email'].join(','),
                                ...records.map(r => [r.type, `"${r.company}"`, r.domain, `"${r.industry}"`, `"${r.intro.replace(/"/g, '""')}"`, r.email].join(','))
                              ].join('\n');
                              const blob = new Blob([csv], { type: 'text/csv' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `need-email-${new Date().toISOString().split('T')[0]}.csv`;
                              a.click();
                              URL.revokeObjectURL(url);
                            }}
                            className="flex-1 px-5 py-3 text-[13px] font-medium rounded-xl border border-white/[0.12] text-white/70 hover:text-white hover:border-white/30 transition-all active:scale-[0.98]"
                          >
                            Export {totalNeedEmail} to complete manually
                          </button>
                        </div>
                      </motion.div>
                    )}

                    {/* Start Over */}
                    <div className="text-center">
                      <button
                        onClick={reset}
                        className="px-4 py-2 text-[12px] text-white/40 hover:text-white/60 transition-colors"
                      >
                        Start Over
                      </button>
                    </div>

                    {/* Error surface */}
                    {state.error && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-[12px] text-red-400/80 text-center"
                      >
                        {safeRender(state.error)}
                      </motion.p>
                    )}
                  </div>
                );
              })()}

            </motion.div>
          )}

          {/* SENDING — Stripe-style: clean progress */}
          {state.step === 'sending' && (
            <motion.div
              key="sending"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <p className="text-[14px] text-white/50 font-medium mb-4">Sending</p>
              <p className="text-[28px] font-light text-white/80 mb-6">
                {state.progress.current} <span className="text-white/30">of {state.progress.total}</span>
              </p>
              <div className="w-56 mx-auto">
                <div className="h-[3px] bg-white/[0.08] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-violet-400/50 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${(state.progress.current / Math.max(state.progress.total, 1)) * 100}%` }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* COMPLETE — Stripe-style: clean success */}
          {state.step === 'complete' && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              {/* Animated checkmark */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                className="relative w-16 h-16 mx-auto mb-8"
              >
                <div className="absolute inset-0 rounded-full bg-violet-500/20 blur-xl" />
                <div className="relative w-full h-full rounded-full bg-gradient-to-b from-violet-500/20 to-violet-500/5 border border-violet-500/30 flex items-center justify-center">
                  <motion.svg
                    className="w-7 h-7 text-violet-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <motion.path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.5, delay: 0.2 }}
                    />
                  </motion.svg>
                </div>
              </motion.div>

              {/* Count */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mb-8"
              >
                <span className="text-[56px] font-light text-white tracking-tight">{state.sentDemand + state.sentSupply}</span>
                <p className="text-[15px] text-white/50 mt-1 font-medium">Intros sent</p>
                <p className="text-[12px] text-white/25 mt-2">
                  {state.sentDemand} demand · {state.sentSupply} supply
                </p>
              </motion.div>

              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                onClick={reset}
                className="px-5 py-2.5 text-[13px] font-medium rounded-lg bg-white text-black hover:bg-white/90 active:scale-[0.98] transition-all"
              >
                Run again
              </motion.button>
            </motion.div>
          )}

          </AnimatePresence>
        </div>
      </div>

      {/* Export Receipt Modal — Trust Layer */}
      <AnimatePresence>
        {showExportReceipt && exportReceiptData && (
          <motion.div
            key={`export-modal-${exportModalKey}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setShowExportReceipt(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xs mx-4 p-6 rounded-2xl bg-[#0A0A0A] border border-white/[0.08] shadow-2xl text-center"
            >
              {/* Stripe-style: just show what they're getting */}
              <p className="text-[13px] text-white/40 mb-2">Export</p>
              <p className="text-[42px] font-light text-white tracking-tight mb-1">
                {exportReceiptData.demand.totalExported + exportReceiptData.supply.totalExported}
              </p>
              <p className="text-[14px] text-white/50 font-medium mb-1">intros</p>
              <p className="text-[12px] text-white/25 mb-6">
                {exportReceiptData.demand.totalExported} demand · {exportReceiptData.supply.totalExported} supply
              </p>

              <button
                onClick={handleExportCSV}
                className="w-full py-2.5 text-[13px] font-medium rounded-lg bg-white text-black hover:bg-white/90 transition-all active:scale-[0.98]"
              >
                Download CSV
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dock */}
      <Dock />
    </div>
  );
}
// Build: 1768325570
