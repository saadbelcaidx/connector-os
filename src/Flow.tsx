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
import { Workflow, ArrowLeft, Pencil, X, Check, Star, EyeOff, ArrowRight, ChevronRight } from 'lucide-react';
import Dock from './Dock';
import { useAuth } from './AuthContext';
import { supabase } from './lib/supabase';

// New architecture
import { validateDataset, normalizeDataset, NormalizedRecord, Schema } from './schemas';
import { matchRecords, MatchingResult, filterByScore } from './matching';
import { enrichRecord, enrichBatch, EnrichmentConfig, EnrichmentResult, Signals } from './enrichment';
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

// Connector Mode — Deterministic supply filter builder (FIX 1 + FIX 2)
import {
  ConnectorMode,
  detectConnectorMode,
  buildSupplyFilters,
  validateSupplyRecord,
  getModeLabel,
  MODE_LABELS,
  getModesForUI,
} from './services/SupplyFilterBuilder';

// Enterprise Validation — Copy validation, evidence gates
import {
  getModeContract,
  getAvailableModes,
  MODE_REGISTRY_VERSION,
  getPresignalExamples,
  getModeDocsAnchor,
} from './services/ConnectorModeRegistry';
import {
  buildEvidenceSet,
  emptyEvidenceSet,
  type EvidenceSet,
} from './services/EvidenceGate';
import {
  validateCopy,
  canSend,
  type CopyValidationResult,
  hasPresignal,
  containsActivityTimingLanguage,
  getPresignalStatus,
  COPY_ERROR_CODES,
} from './services/CopyValidator';

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

  // Leadership signals
  if (signalLower.includes('vp') || signalLower.includes('vice president')) {
    signals.push({ type: 'VP_OPEN', source: 'signal' });
    metadata.vpOpen = true;
  }
  if (signalLower.includes('ceo') || signalLower.includes('cfo') || signalLower.includes('cto') ||
      signalLower.includes('coo') || signalLower.includes('chief')) {
    signals.push({ type: 'C_LEVEL_OPEN', source: 'signal' });
    metadata.cLevelOpen = true;
  }
  if (signalLower.includes('director') || signalLower.includes('head of')) {
    signals.push({ type: 'LEADERSHIP_OPEN', source: 'signal' });
    metadata.hasLeadershipRole = true;
  }

  // Funding from company data
  if (normalized.companyFunding) {
    signals.push({ type: 'FUNDING', value: normalized.companyFunding, source: 'company' });
    metadata.hasFunding = true;
  }

  // Growth indicators from raw data
  const raw = normalized.raw || {};
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
    const domain = match.demand.domain;
    const enriched = data.enrichedDemand.get(domain);

    // Same filter as routing: must have email
    if (!enriched?.success || !enriched.email) continue;

    const intro = data.demandIntros.get(domain) || '';
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
      match.reasons.join('; '),
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
    const domain = agg.supply.domain;
    const enriched = data.enrichedSupply.get(domain);

    // Same filter as routing: must have email
    if (!enriched?.success || !enriched.email) continue;

    const intro = data.supplyIntros.get(domain) || '';
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
 * MODE-AWARE: Uses appropriate language per connector mode.
 * - recruiting: "hiring engineers", "scaling sales"
 * - biotech: "licensing opportunities", "partnership activity"
 * - other: "activity", "momentum"
 */
function detectCommonSignal(signals: string[], mode?: ConnectorMode | null): string {
  // Mode-specific defaults (avoid "hiring" for non-recruiting modes)
  const MODE_DEFAULTS: Record<string, string> = {
    recruiting: 'hiring',
    biotech_licensing: 'licensing activity',
    wealth_management: 'growth activity',
    real_estate_capital: 'deal activity',
    enterprise_partnerships: 'partnership activity',
    logistics: 'operational activity',
    crypto: 'protocol activity',
    custom: 'activity',
  };

  const defaultSignal = MODE_DEFAULTS[mode || ''] || 'activity';

  if (signals.length === 0) return defaultSignal;

  // For recruiting mode, use detailed hiring categories
  if (mode === 'recruiting') {
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
      } else {
        categories['hiring'] = (categories['hiring'] || 0) + 1;
      }
    }

    let maxCategory = 'hiring';
    let maxCount = 0;
    for (const [cat, count] of Object.entries(categories)) {
      if (count > maxCount) {
        maxCount = count;
        maxCategory = cat;
      }
    }
    return maxCategory;
  }

  // For non-recruiting modes, use generic activity language
  // Don't use "hiring" - it's mode-specific to recruiting
  return defaultSignal;
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

/**
 * Normalize presignal/context values to string at state boundaries.
 * After migration to TEXT columns: handles null/undefined, legacy JSONB {}, and strings.
 */
function normalizeToString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return ''; // Legacy JSONB default {} → empty
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

  // Connector Mode (FIX 1) — determines supply filter + intro language
  connectorMode: ConnectorMode | null;  // null = not yet selected
  customModeAcknowledged: boolean;  // Safety interlock for Custom mode

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

// Pre-signal context entry (operator-written)
interface PreSignalContextEntry {
  text: string;
  source?: 'linkedin' | 'news' | 'prior_convo' | 'job_post' | 'other';
  updatedAt: string;
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
  // FIX 1: Connector mode (persisted per operator)
  connectorMode?: ConnectorMode | null;
  // CANONICAL: Per-side presignal (applies to ALL contacts on that side)
  presignalDemand?: string;   // Text for ALL demand contacts
  presignalSupply?: string;   // Text for ALL supply contacts
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
    connectorMode: null,  // FIX 1: Will be auto-detected or user-selected
    customModeAcknowledged: false,  // Safety interlock for Custom mode
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

  // CANONICAL: Per-side presignal editing state
  const [editingPresignalSide, setEditingPresignalSide] = useState<'demand' | 'supply' | null>(null);
  const [presignalText, setPresignalText] = useState('');
  const [savingPresignal, setSavingPresignal] = useState(false);

  // Signals drawer — read-only overlay, no logic impact
  const [showSignalsDrawer, setShowSignalsDrawer] = useState(false);

  // Export Receipt — Trust Layer (show what's filtered before download)
  const [showExportReceipt, setShowExportReceipt] = useState(false);
  const [exportReceiptData, setExportReceiptData] = useState<{ demand: ExportReceipt; supply: ExportReceipt } | null>(null);
  const [exportModalKey, setExportModalKey] = useState(0); // Force modal remount on reopen

  // Supply Annotations — Operator judgment (render-only, no matching impact)
  const [supplyAnnotations, setSupplyAnnotations] = useState<Map<string, SupplyAnnotation>>(new Map());

  // Markets banner (dismissible)
  const [showMarketsBanner, setShowMarketsBanner] = useState(() => {
    return !localStorage.getItem('flow_markets_banner_dismissed');
  });
  const dismissMarketsBanner = () => {
    setShowMarketsBanner(false);
    localStorage.setItem('flow_markets_banner_dismissed', 'true');
  };

  const abortRef = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const presignalRef = useRef<{ demand: string; supply: string }>({ demand: '', supply: '' });
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
            presignalDemand: normalizeToString(data?.presignal_demand),
            presignalSupply: normalizeToString(data?.presignal_supply),
            fetchSignals: data?.fetch_signals === true, // default false
          });

          // VERIFICATION LOG: Presignal loaded from DB
          const loadedDemand = normalizeToString(data?.presignal_demand);
          const loadedSupply = normalizeToString(data?.presignal_supply);
          console.log(`[Settings] presignalDemand loaded type=${typeof data?.presignal_demand} valueLen=${loadedDemand.length}`);
          console.log(`[Settings] presignalSupply loaded type=${typeof data?.presignal_supply} valueLen=${loadedSupply.length}`);
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
          presignalDemand: normalizeToString(s.presignalDemand),
          presignalSupply: normalizeToString(s.presignalSupply),
          fetchSignals: s.fetchSignals === true, // default false
        });

        // VERIFICATION LOG: Presignal loaded from localStorage
        const loadedDemand = normalizeToString(s.presignalDemand);
        const loadedSupply = normalizeToString(s.presignalSupply);
        console.log(`[Settings] presignalDemand loaded type=${typeof s.presignalDemand} valueLen=${loadedDemand.length}`);
        console.log(`[Settings] presignalSupply loaded type=${typeof s.presignalSupply} valueLen=${loadedSupply.length}`);
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

  // CANONICAL: Save presignal for a side (demand or supply)
  const savePresignal = useCallback(async (side: 'demand' | 'supply') => {
    if (!presignalText.trim()) {
      setEditingPresignalSide(null);
      return;
    }

    setSavingPresignal(true);
    try {
      const fieldName = side === 'demand' ? 'presignalDemand' : 'presignalSupply';
      const text = presignalText.trim();

      // Update local state immediately
      setSettings(prev => prev ? { ...prev, [fieldName]: text } : prev);

      // Persist based on auth state
      if (isAuthenticated && user?.id) {
        await supabase.from('operator_settings').upsert({
          user_id: user.id,
          [fieldName === 'presignalDemand' ? 'presignal_demand' : 'presignal_supply']: text,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        console.log(`[Flow] Saved ${side} presignal to Supabase`);
      } else {
        // Guest: update localStorage
        const stored = localStorage.getItem('guest_settings');
        const parsed = stored ? JSON.parse(stored) : { settings: {} };
        const updatedSettings = { ...parsed.settings, [fieldName]: text };
        localStorage.setItem('guest_settings', JSON.stringify({ settings: updatedSettings }));
        console.log(`[Flow] Saved ${side} presignal to localStorage`);
      }

      setEditingPresignalSide(null);
      setPresignalText('');
    } catch (e) {
      console.error('[Flow] Failed to save presignal:', e);
    }
    setSavingPresignal(false);
  }, [presignalText, isAuthenticated, user?.id]);

  // CANONICAL: Start editing presignal for a side
  const startEditPresignal = useCallback((side: 'demand' | 'supply') => {
    const existing = side === 'demand' ? settings?.presignalDemand : settings?.presignalSupply;
    setPresignalText(existing || '');
    setEditingPresignalSide(side);
  }, [settings]);

  // CANONICAL: Cancel editing presignal
  const cancelEditPresignal = useCallback(() => {
    setEditingPresignalSide(null);
    setPresignalText('');
  }, []);

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

        const supplyValidation = validateDataset(supplyData);
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
    // Pass connectorMode for buyer-seller overlap validation (Supply Truth Constraint)
    const result = await matchRecords(demand, supply, undefined, state.connectorMode || undefined);

    console.timeEnd('[MATCH] matchRecords');
    console.log('[MATCH] result', {
      demandMatches: result.demandMatches.length,
      supplyAggregates: result.supplyAggregates.length,
      avgScore: result.stats.avgScore,
    });

    // Filter by minimum score
    const filtered = filterByScore(result, 20);

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
    // PHASE 1: EDGE PREFLIGHT (FREE) — Detect edges BEFORE enrichment
    // No edge = No enrichment = No credits spent
    // =======================================================================
    console.log('[EDGE_PREFLIGHT] Starting edge detection on', filtered.demandMatches.length, 'matched demands');
    setState(prev => ({ ...prev, progress: { current: 90, total: 100, message: 'Looking for real connection signals...' } }));

    const edgePositiveMatches: typeof filtered.demandMatches = [];
    const detectedEdges = new Map<string, Edge>();
    let edgesFound = 0;
    let edgesMissing = 0;

    for (const match of filtered.demandMatches) {
      const demandRecord = toDemandRecord(match.demand);
      const edge = detectEdge(demandRecord);

      if (edge) {
        edgePositiveMatches.push(match);
        detectedEdges.set(match.demand.domain, edge);
        edgesFound++;
        console.log(`[EDGE_PREFLIGHT] ✓ EDGE: ${match.demand.company} → ${edge.type} (${edge.evidence})`);
      } else {
        edgesMissing++;
        console.log(`[EDGE_PREFLIGHT] ✗ NO_EDGE: ${match.demand.company}`);
      }
    }

    console.log(`[EDGE_PREFLIGHT] Complete: ${edgesFound} edges found, ${edgesMissing} dropped`);
    console.log(`[EDGE_PREFLIGHT] Edge-positive ratio: ${((edgesFound / (edgesFound + edgesMissing)) * 100).toFixed(1)}%`);

    // =======================================================================
    // EDGE GATE: If zero edges, abort flow — no enrichment, no credits spent
    // =======================================================================
    if (edgePositiveMatches.length === 0) {
      console.log('[EDGE_PREFLIGHT] ABORT: Zero edges detected — showing no_matches UI');
      console.log('[EDGE_PREFLIGHT] NO CREDITS SPENT — edge preflight is FREE');
      setState(prev => ({
        ...prev,
        step: 'no_matches',
        matchingResult: filtered, // Keep original for UI display
        progress: { current: 100, total: 100, message: 'No matches found' },
      }));
      return;
    }

    // Update filtered with only edge-positive matches for enrichment
    const edgeFiltered: MatchingResult = {
      ...filtered,
      demandMatches: edgePositiveMatches,
    };

    // Store detected edges in state for later use in composition
    console.log('[EDGE_PREFLIGHT] Matches found:', edgePositiveMatches.length, 'edge-positive');
    console.log('[EDGE_PREFLIGHT] CREDITS SAVED:', edgesMissing, 'records skipped (no edge)');

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
    console.log('[EDGE_PREFLIGHT] Paused at matches_found — waiting for user to click "Find the right people"');
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
    const demandRecords = matching.demandMatches.map(m => m.demand);
    console.log(`[Flow] Enriching ${demandRecords.length} demand matches (concurrency=5)`);

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

      // Supply from B2B Contacts usually has email
      if (record.email) {
        enrichedSupply.set(record.domain, {
          success: true,
          email: record.email,
          firstName: record.firstName,
          lastName: record.lastName,
          title: record.title,
          verified: true,
          source: 'existing',
        });
      } else if (supplySchema) {
        const sanitizedDomain = record.domain?.replace(/[^a-z0-9.-]/gi, '') || 'unknown';
        const correlationId = `${runId}-supply-${sanitizedDomain}`;
        try {
          const result = await enrichRecord(record, supplySchema, config, undefined, correlationId);
          enrichedSupply.set(record.domain, result);
        } catch (err) {
          console.log(`[Enrichment] cid=${correlationId} UNCAUGHT domain=${record.domain}`);
          enrichedSupply.set(record.domain, {
            success: false,
            email: null,
            firstName: record.firstName || '',
            lastName: record.lastName || '',
            title: record.title || '',
            verified: false,
            source: 'timeout',
          });
        }
      }
    }

    // Summary
    const demandSuccessCount = Array.from(enrichedDemand.values()).filter(r => r.success && r.email).length;
    const supplySuccessCount = Array.from(enrichedSupply.values()).filter(r => r.success && r.email).length;
    const demandTimeoutCount = Array.from(enrichedDemand.values()).filter(r => r.source === 'timeout').length;
    const supplyTimeoutCount = Array.from(enrichedSupply.values()).filter(r => r.source === 'timeout').length;
    console.log(`[Flow] Enrichment complete (runId=${runId}):`);
    console.log(`  - Demand: ${demandSuccessCount}/${enrichedDemand.size} with email, ${demandTimeoutCount} timeouts`);
    console.log(`  - Supply: ${supplySuccessCount}/${enrichedSupply.size} with email, ${supplyTimeoutCount} timeouts`);

    // ATOMIC STATE UPDATE: Set enrichment results AND step change together
    // This prevents race conditions where route_context renders before enrichment data is available
    setState(prev => ({
      ...prev,
      enrichedDemand,
      enrichedSupply,
      step: 'route_context',
    }));
    console.log('[Flow] Enrichment complete — waiting for route context before generating intros');
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
      const e = enrichedDemand.get(m.demand.domain);
      return e?.success && e.email;
    }).length;

    // Process each demand match using pre-detected edges
    for (const match of matching.demandMatches) {
      if (abortRef.current) break;

      // GATE 1: Check for detected edge (from preflight)
      const edge = state.detectedEdges.get(match.demand.domain);
      if (!edge) {
        console.log(`[COMPOSE] DROP: ${match.demand.company} - no edge detected`);
        dropped++;
        continue;
      }

      // GATE 2: Check demand enrichment
      const demandEnriched = enrichedDemand.get(match.demand.domain);
      if (!demandEnriched?.success || !demandEnriched.email) {
        console.log(`[COMPOSE] DROP: ${match.demand.company} - demand not enriched`);
        dropped++;
        continue;
      }

      // GATE 3: Check supply enrichment
      const supplyEnriched = enrichedSupply.get(match.supply.domain);
      if (!supplyEnriched?.success || !supplyEnriched.email) {
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

        demandIntros.set(match.demand.domain, composed_output.demandBody);
        supplyIntros.set(match.supply.domain, composed_output.supplyBody);

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
  // =============================================================================
  // PRESIGNAL → INTRO GENERATION HANDLER (replaces dual useEffect)
  // =============================================================================
  // FIX: Single handler for generating intros after presignal is set
  // Called from route_context step OR when regenerating in ready step

  const generateIntrosWithPresignal = useCallback(async () => {
    if (!state.matchingResult) {
      console.error('[Flow] Cannot generate intros: no matching result');
      return;
    }

    // VERIFICATION LOG: Log presignal values before intro generation
    const demandPresignal = settings?.presignalDemand || '';
    const supplyPresignal = settings?.presignalSupply || '';
    console.log(`[Flow] presignalDemand source=ui valueLen=${demandPresignal.length}`);
    console.log(`[Flow] presignalSupply source=ui valueLen=${supplyPresignal.length}`);

    // Update ref to current values (single update point, no race condition)
    presignalRef.current = { demand: demandPresignal, supply: supplyPresignal };

    // Generate intros
    setState(prev => ({ ...prev, step: 'generating' }));
    await runIntroGeneration(state.matchingResult, state.enrichedDemand, state.enrichedSupply);
    setState(prev => ({ ...prev, step: 'ready' }));
  }, [state.matchingResult, state.enrichedDemand, state.enrichedSupply, settings?.presignalDemand, settings?.presignalSupply]);

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
    //          matched_supply_company, match_score, match_reasons (demand-specific),
    //          matched_demand_count, avg_match_score (supply-specific)
    const headers = [
      'side', 'email', 'first_name', 'last_name', 'company_name',
      'website', 'personalization',
      'matched_supply_company', 'match_score', 'match_reasons',
      'matched_demand_count', 'avg_match_score'
    ];

    // Build demand rows with lowercase side, add empty supply-specific columns
    const rawDemandRows = buildDemandExportRows(data);
    const demandRows = rawDemandRows.map(row => [
      'demand',           // side (lowercase per spec)
      row[1], row[2], row[3], row[4], row[5], row[6],  // email through personalization
      row[7], row[8], row[9],  // matched_supply_company, match_score, match_reasons
      '', ''  // matched_demand_count, avg_match_score (empty for demand)
    ]);

    // Build supply rows with lowercase side, add empty demand-specific columns
    const rawSupplyRows = buildSupplyExportRows(data);
    const supplyRows = rawSupplyRows.map(row => [
      'supply',           // side (lowercase per spec)
      row[1], row[2], row[3], row[4], row[5], row[6],  // email through personalization
      '', '', '',  // matched_supply_company, match_score, match_reasons (empty for supply)
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
        const enriched = enrichedDemand.get(m.demand.domain);
        return enriched?.success && enriched.email;
      });

      setState(prev => ({
        ...prev,
        progress: { current: 0, total: demandToSend.length, message: 'Sending to demand...' },
      }));

      for (let i = 0; i < demandToSend.length; i++) {
        if (abortRef.current) break;

        const match = demandToSend[i];
        const enriched = enrichedDemand.get(match.demand.domain)!;

        // Use pre-generated AI intro (fall back to template if missing)
        // PHASE 3: Fallback routes through canonical doctrine (no timing defaults)
        const intro = state.demandIntros.get(match.demand.domain) || generateDemandIntro({
          ...match.demand,
          firstName: enriched.firstName || match.demand.firstName,
          email: enriched.email,
          connectorMode: state.connectorMode || undefined,
          preSignalContext: settings?.presignalDemand,
        });

        // ENTERPRISE: Validate copy before send (if mode is set)
        if (state.connectorMode && intro) {
          const evidence = buildEvidenceSet({
            jobPostingUrl: match.demand.job_posting_url,
            jobTitle: match.demand.job_title,
            openRolesCount: match.demand.open_roles_count,
            funding: match.demand.funding,
            fundingRound: match.demand.funding_round,
          });

          const validation = canSend(intro, {
            mode: state.connectorMode,
            side: 'demand',
            evidence,
            presignal_context: settings?.presignalDemand,
          });

          if (!validation.canSend) {
            console.warn(`[Flow] Copy validation blocked: ${match.demand.domain}`, validation.blockReason);
            // Track the failure but continue with next
            setState(prev => ({
              ...prev,
              progress: { current: i + 1, total: demandToSend.length, message: `Demand ${i + 1}/${demandToSend.length} (skipped)` },
            }));
            continue; // Skip this send
          }
        }

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
          if (result.success) sentDemand++;
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
        const enriched = enrichedSupply.get(a.supply.domain);
        return enriched?.success && enriched.email;
      });

      setState(prev => ({
        ...prev,
        progress: { current: 0, total: supplyToSend.length, message: 'Sending to supply...' },
      }));

      for (let i = 0; i < supplyToSend.length; i++) {
        if (abortRef.current) break;

        const agg = supplyToSend[i];
        const enriched = enrichedSupply.get(agg.supply.domain)!;

        // Use pre-generated AI intro (fall back to template if missing)
        // PHASE 3: Fallback routes through canonical doctrine (no timing defaults)
        const intro = state.supplyIntros.get(agg.supply.domain) || generateSupplyIntro(
          {
            ...agg.supply,
            firstName: enriched.firstName || agg.supply.firstName,
            email: enriched.email,
            connectorMode: state.connectorMode || undefined,
            preSignalContext: settings?.presignalSupply,
          },
          agg.bestMatch.demand
        );

        // ENTERPRISE: Validate copy before send (if mode is set)
        if (state.connectorMode && intro) {
          // Supply side doesn't have job signals in the same way - use empty evidence for now
          const evidence = emptyEvidenceSet();

          const validation = canSend(intro, {
            mode: state.connectorMode,
            side: 'supply',
            evidence,
            presignal_context: settings?.presignalSupply,
          });

          if (!validation.canSend) {
            console.warn(`[Flow] Copy validation blocked supply: ${agg.supply.domain}`, validation.blockReason);
            setState(prev => ({
              ...prev,
              progress: { current: i + 1, total: supplyToSend.length, message: `Supply ${i + 1}/${supplyToSend.length} (skipped)` },
            }));
            continue; // Skip this send
          }
        }

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
          if (result.success) sentSupply++;
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
      connectorMode: null,  // Reset mode for new flow
      customModeAcknowledged: false,
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

      {/* Markets Banner - Platinum */}
      <AnimatePresence>
        {showMarketsBanner && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="px-8 pt-4"
          >
            <div className="max-w-[520px] mx-auto">
              <div className="relative bg-gradient-to-r from-zinc-400/[0.06] via-slate-300/[0.04] to-zinc-400/[0.06] rounded-xl border border-zinc-400/10 px-4 py-2.5 overflow-hidden">
                {/* Shimmer effect */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent -skew-x-12"
                  initial={{ x: '-100%' }}
                  animate={{ x: '200%' }}
                  transition={{ duration: 2, ease: 'easeInOut', delay: 0.5, repeat: Infinity, repeatDelay: 4 }}
                />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.2 }}
                      className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-zinc-400/15"
                    >
                      <span className="text-[10px] text-zinc-300">◆</span>
                      <span className="text-[9px] font-bold text-zinc-300 uppercase tracking-wide">New</span>
                    </motion.div>
                    <p className="text-[12px] text-white/60">
                      <span className="font-medium text-zinc-200">Pick your market</span>
                      <span className="mx-1.5 text-white/20">—</span>
                      <span className="text-white/50">7 modes or go custom</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate('/library?page=modes')}
                      className="group flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-400/15 hover:bg-zinc-400/25 text-zinc-300 text-[11px] font-medium transition-all"
                    >
                      Learn more
                      <ArrowRight size={10} className="group-hover:translate-x-0.5 transition-transform" />
                    </button>
                    <button
                      onClick={dismissMarketsBanner}
                      className="p-1 text-white/20 hover:text-white/50 transition-colors"
                      aria-label="Dismiss"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
              <p className="text-[13px] text-white/40 mb-6">Match · Enrich · Route</p>

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

                const explanation = explain(errorBlock, {
                  mode: state.connectorMode || undefined,
                });

                return (
                  <div ref={errorRef} className="mb-8 max-w-lg mx-auto">
                    <AlertFromExplanation
                      explanation={explanation}
                      onAction={(action) => {
                        if (action.kind === 'open_settings') {
                          navigate('/settings');
                        } else if (action.kind === 'copy_to_clipboard') {
                          navigator.clipboard.writeText(
                            `Flow Error: ${errorStr}\n\nDataset: ${settings?.demandDatasetId || 'not set'}\nMode: ${state.connectorMode || 'not set'}`
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
                          <p>connectorMode: {state.connectorMode || '(not selected)'}</p>
                        </div>
                      </details>
                    )}
                  </div>
                );
              })()}

              {/* Connector Mode Selector — All modes from registry with tooltips */}
              <div className="mb-6">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <span className="text-[12px] text-white/40">Mode</span>
                </div>
                <div className="grid grid-cols-4 gap-2 max-w-2xl mx-auto">
                  {getModesForUI().map((mode) => {
                    const isCustom = mode.id === 'custom';

                    return (
                      <button
                        key={mode.id}
                        onClick={() => setState(prev => ({
                          ...prev,
                          connectorMode: mode.id,
                          customModeAcknowledged: mode.id === 'custom' ? false : prev.customModeAcknowledged,
                        }))}
                        className={`px-3 py-2.5 text-[12px] rounded-lg border transition-all text-left ${
                          state.connectorMode === mode.id
                            ? 'bg-white/10 border-white/20 text-white/90'
                            : 'border-white/[0.08] text-white/40 hover:border-white/20 hover:text-white/60'
                        }`}
                      >
                        <span className="font-medium block">{mode.label}</span>
                        <span className="block text-[10px] text-white/30 mt-0.5 truncate">
                          {isCustom ? 'You define' : mode.description.split('→')[0].trim()}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Custom mode safety interlock */}
                {state.connectorMode === 'custom' && (
                  <div className="mt-4 max-w-sm mx-auto">
                    <div className="p-3 rounded-lg bg-amber-500/[0.08] border border-amber-500/20">
                      <p className="text-[11px] text-amber-400/90 font-medium mb-2">Custom Mode Warning</p>
                      <ul className="text-[10px] text-white/50 space-y-1 mb-3">
                        <li>• Custom does not auto-filter industries</li>
                        <li>• You must choose correct datasets</li>
                        <li>• Claims like hiring/funding/partnership are blocked without evidence</li>
                      </ul>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={state.customModeAcknowledged}
                          onChange={(e) => setState(prev => ({ ...prev, customModeAcknowledged: e.target.checked }))}
                          className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500/30"
                        />
                        <span className="text-[10px] text-white/60 leading-tight">
                          I understand custom mode requires correct datasets
                        </span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={startFlow}
                disabled={
                  !settings?.demandDatasetId ||
                  !state.connectorMode ||
                  (state.connectorMode === 'custom' && !state.customModeAcknowledged)
                }
                className="px-4 py-2 text-[13px] font-medium rounded-md bg-white text-black hover:bg-white/90 active:scale-[0.98] disabled:opacity-30 transition-all"
              >
                {state.error ? 'Retry' : 'Start'}
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

          {/* MATCHING — Stripe-style: brief transition, no numbers */}
          {state.step === 'matching' && (
            <motion.div
              key="matching"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                className="w-8 h-8 mx-auto mb-6 rounded-full border-2 border-white/10 border-t-white/50"
              />
              <p className="text-[14px] text-white/50 font-medium">
                Looking for real connection signals…
              </p>
            </motion.div>
          )}

          {/* MATCHES FOUND — User must click to proceed to enrichment */}
          {state.step === 'matches_found' && (
            <motion.div
              key="matches_found"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center max-w-sm mx-auto"
            >
              {(() => {
                const matches = state.matchingResult?.demandMatches || [];
                const totalScanned = state.demandRecords.length;
                const edgeCount = matches.length;

                // Get top 3 matches for preview
                const previewMatches = matches.slice(0, 3);
                const moreCount = Math.max(0, matches.length - 3);

                // Translate edge evidence to 2nd grade language
                const simplifyEvidence = (edge: Edge | undefined): string => {
                  if (!edge) return 'Good fit';
                  const evidence = edge.evidence.toLowerCase();
                  if (evidence.includes('vp') || evidence.includes('c-level') || evidence.includes('leadership')) {
                    return 'Needs a leader';
                  }
                  if (evidence.includes('funding') || evidence.includes('raised')) {
                    return 'Just raised money';
                  }
                  if (evidence.includes('growth') || evidence.includes('growing')) {
                    return 'Growing fast';
                  }
                  if (evidence.includes('hiring') || evidence.includes('roles')) {
                    return 'Hiring';
                  }
                  return 'Good timing';
                };

                // Simplify supply capability to 2nd grade
                const simplifyCapability = (supply: NormalizedRecord, edge: Edge | undefined): string => {
                  if (!edge) return 'Can help';
                  const evidence = edge.evidence.toLowerCase();
                  if (evidence.includes('vp') || evidence.includes('c-level') || evidence.includes('leadership')) {
                    return 'Finds leaders';
                  }
                  if (evidence.includes('funding') || evidence.includes('growth')) {
                    return 'Helps growth';
                  }
                  if (evidence.includes('hiring') || evidence.includes('roles')) {
                    return 'Finds talent';
                  }
                  return 'Can help';
                };

                return (
                  <>
                    {/* Primary heading */}
                    <motion.h2
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-[36px] font-light text-white/90 mb-2"
                    >
                      Found {edgeCount} matches
                    </motion.h2>

                    {/* Filter explanation - reframe as quality */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.1 }}
                      className="text-[11px] text-white/40 mb-6"
                    >
                      <p>{totalScanned} scanned · {totalScanned - edgeCount} filtered out</p>
                      <p className="text-white/25 mt-1">Only showing companies with real timing signals</p>
                    </motion.div>

                    {/* Column labels - maps to card layout */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.15 }}
                      className="flex items-center justify-between text-[10px] text-white/30 mb-3 px-4"
                    >
                      <span>Companies that need help</span>
                      <span>People who can help</span>
                    </motion.div>

                    {/* Preview cards - animated stagger */}
                    <div className="space-y-2.5 mb-6">
                      {previewMatches.map((match, i) => {
                        const edge = state.detectedEdges.get(match.demand.domain);
                        const demandNeed = simplifyEvidence(edge);
                        const supplyHelp = simplifyCapability(match.supply, edge);

                        return (
                          <motion.div
                            key={match.demand.domain}
                            initial={{ opacity: 0, y: 15, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ delay: 0.2 + (i * 0.1), duration: 0.3 }}
                            className="px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]
                              hover:bg-white/[0.05] hover:border-white/[0.1] transition-all duration-200"
                          >
                            <div className="flex items-center justify-between text-[13px]">
                              <span className="text-white/70 font-medium truncate max-w-[140px]">
                                {match.demand.company}
                              </span>
                              <span className="text-white/30 mx-2">→</span>
                              <span className="text-white/50 truncate max-w-[120px]">
                                {match.supply.company}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] mt-1.5 text-white/30">
                              <span>{demandNeed}</span>
                              <span>{supplyHelp}</span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>

                    {/* More count */}
                    {moreCount > 0 && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="text-[12px] text-white/25 mb-8"
                      >
                        +{moreCount} more
                      </motion.p>
                    )}

                    {/* CTA Button */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.55 }}
                      className="relative group inline-block"
                    >
                      <motion.button
                        onClick={proceedToEnrichment}
                        className="px-8 py-3 bg-white text-black rounded-xl font-medium text-[14px]
                          hover:scale-[1.02] active:scale-[0.98] transition-all duration-200
                          shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                        whileHover={{ boxShadow: '0 0 30px rgba(255,255,255,0.15)' }}
                      >
                        Find the right people
                      </motion.button>
                    </motion.div>

                    {/* Matches low? Educational note */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.7 }}
                      className="mt-10 pt-6 border-t border-white/[0.06]"
                    >
                      <p className="text-[11px] text-white/50 mb-1">
                        Matches low? Improve your dataset.
                      </p>
                      <p className="text-[10px] text-white/40 max-w-[280px] mx-auto">
                        We only show companies when there's a real match. We can't lie to you.
                      </p>
                    </motion.div>
                  </>
                );
              })()}
            </motion.div>
          )}

          {/* NO MATCHES — Clean, friendly, no blame */}
          {state.step === 'no_matches' && (
            <motion.div
              key="no_matches"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center max-w-md mx-auto"
            >
              {/* Primary heading */}
              <h2 className="text-[32px] font-light text-white/90 mb-3">
                No matches found
              </h2>

              {/* Secondary text */}
              <p className="text-[14px] text-white/40 mb-8">
                These datasets don't line up right now.
              </p>

              {/* Helper copy */}
              <div className="space-y-1.5 mb-10 text-[13px] text-white/30">
                <p>This usually means:</p>
                <p className="pl-4">• No clear need on one side</p>
                <p className="pl-4">• Or no fit on the other</p>
              </div>

              {/* CTA Button */}
              <button
                onClick={() => {
                  // Reset to upload step to try different datasets
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
                className="px-6 py-2.5 bg-white/[0.06] border border-white/[0.08] text-white/70 rounded-xl text-[14px]
                  hover:bg-white/[0.08] hover:border-white/[0.12] hover:text-white/90
                  transition-all duration-200"
              >
                Try different datasets
              </button>

              {/* Optional help link */}
              <p className="mt-6 text-[11px] text-white/20">
                <a href="/library?page=matching" className="hover:text-white/40 underline underline-offset-2">
                  How to improve matches
                </a>
              </p>

              {/* No credits message */}
              <p className="mt-8 text-[11px] text-emerald-500/60">
                No credits spent.
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

          {/* ROUTE CONTEXT — FIX: Shows BEFORE intro generation */}
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
                  const e = state.enrichedDemand.get(m.demand.domain);
                  return e?.success && e?.email;
                }).length;
                const supplyEnriched = supplyAggregates.filter(a => {
                  const e = state.enrichedSupply.get(a.supply.domain);
                  return e?.success && e?.email;
                }).length;
                const totalEnriched = demandEnriched + supplyEnriched;
                const enrichmentFailed = matchCount > 0 && totalEnriched === 0;
                const enrichmentPartial = matchCount > 0 && totalEnriched > 0 && totalEnriched < matchCount;

                const isEditingContext = editingPresignalSide !== null;
                const currentContext = settings?.presignalDemand || settings?.presignalSupply || '';

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
                      className="text-center mb-6"
                    >
                      <p className="text-[18px] font-light text-white/80">{matchCount} matches found</p>
                      {enrichmentFailed ? (
                        <>
                          <p className="text-[12px] text-amber-400/70 mt-2">0 ready to route (emails unavailable)</p>
                          <p className="text-[11px] text-white/30 mt-2 max-w-xs">
                            We found real matches, but couldn't retrieve contact emails yet.
                            This usually happens when enrichment limits are reached.
                          </p>
                        </>
                      ) : enrichmentPartial ? (
                        <p className="text-[12px] text-white/40 mt-2">{demandEnriched} of {matchCount} ready to route</p>
                      ) : (
                        <p className="text-[12px] text-white/40 mt-2">{demandEnriched} ready to route</p>
                      )}
                    </motion.div>

                    {/* Route Context Input */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="w-full max-w-sm mb-8"
                    >
                      {isEditingContext ? (
                        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08]">
                          <p className="text-[11px] text-white/40 mb-3 text-center">Route Context</p>
                          <textarea
                            value={presignalText}
                            onChange={(e) => setPresignalText(e.target.value)}
                            placeholder="e.g., I've been speaking with a few founders who recently raised..."
                            className="w-full h-20 bg-transparent text-[13px] text-white/70 resize-none outline-none placeholder:text-white/20 leading-relaxed"
                            autoFocus
                          />
                          <div className="flex justify-end gap-2 mt-3">
                            <button
                              onClick={cancelEditPresignal}
                              className="px-3 py-1.5 text-[11px] text-white/40 hover:text-white/60 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={async () => {
                                await savePresignal('demand');
                                if (presignalText.trim()) {
                                  setSettings(prev => prev ? { ...prev, presignalSupply: presignalText.trim() } : prev);
                                  if (user?.id) {
                                    await supabase.from('operator_settings').update({ presignal_supply: presignalText.trim() }).eq('user_id', user.id);
                                  }
                                }
                              }}
                              disabled={savingPresignal}
                              className="px-4 py-1.5 text-[11px] bg-white/10 hover:bg-white/15 text-white/80 rounded-lg transition-all disabled:opacity-50"
                            >
                              {savingPresignal ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </div>
                      ) : currentContext ? (
                        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] text-white/30 uppercase tracking-wider">Route Context</span>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => startEditPresignal('demand')}
                                className="text-[10px] text-white/30 hover:text-white/50 transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                onClick={async () => {
                                  // Clear presignal from state
                                  setSettings(prev => prev ? { ...prev, presignalDemand: '', presignalSupply: '' } : prev);
                                  // Clear from DB/localStorage
                                  if (user?.id) {
                                    await supabase.from('operator_settings').update({ presignal_demand: '', presignal_supply: '' }).eq('user_id', user.id);
                                  } else {
                                    const guestSettings = JSON.parse(localStorage.getItem('guest_settings') || '{}');
                                    guestSettings.presignalDemand = '';
                                    guestSettings.presignalSupply = '';
                                    localStorage.setItem('guest_settings', JSON.stringify(guestSettings));
                                  }
                                }}
                                className="text-[10px] text-red-400/50 hover:text-red-400/80 transition-colors"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                          <p className="text-[13px] text-white/60 leading-relaxed text-center">{safeRender(currentContext)}</p>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditPresignal('demand')}
                          className="w-full group"
                        >
                          <div className="p-4 rounded-xl border border-dashed border-white/[0.08] hover:border-white/[0.15] transition-all duration-300">
                            <p className="text-[12px] text-white/30 group-hover:text-white/50 transition-colors text-center">
                              Route Context <span className="text-white/20">(Optional)</span>
                            </p>
                            <p className="text-[10px] text-white/20 mt-1 text-center">
                              Prior conversations or observations
                            </p>
                          </div>
                        </button>
                      )}
                    </motion.div>

                    {/* Buttons — conditional on enrichment state */}
                    {enrichmentFailed ? (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="flex flex-col items-center gap-3"
                      >
                        <button
                          onClick={() => {
                            // Reset enrichment state and go back to enriching
                            setState(prev => ({
                              ...prev,
                              step: 'enriching',
                              enrichedDemand: new Map(),
                              enrichedSupply: new Map(),
                            }));
                          }}
                          className="px-6 py-2.5 bg-white text-black rounded-xl font-medium text-[13px]
                            hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                        >
                          Retry enrichment
                        </button>
                        <button
                          onClick={() => window.open('/settings', '_blank')}
                          className="px-4 py-2 text-[12px] text-white/40 hover:text-white/60 transition-colors"
                        >
                          Manage API keys
                        </button>
                      </motion.div>
                    ) : (
                      <>
                        <motion.button
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3 }}
                          onClick={generateIntrosWithPresignal}
                          disabled={isEditingContext || savingPresignal || demandEnriched === 0}
                          className="px-8 py-3 bg-white text-black rounded-xl font-medium text-[14px]
                            hover:scale-[1.02] active:scale-[0.98] transition-all duration-200
                            shadow-[0_0_20px_rgba(255,255,255,0.1)]
                            disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                          whileHover={{ boxShadow: '0 0 30px rgba(255,255,255,0.15)' }}
                        >
                          Generate Intros
                        </motion.button>

                        <p className="mt-4 text-[10px] text-white/25">
                          {currentContext ? 'Context will be used in all intros' : 'Skip context to use neutral intros'}
                        </p>
                      </>
                    )}
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

          {/* READY */}
          {state.step === 'ready' && (
            <motion.div
              key="ready"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
{/* Ready to Route — Vercel/Linear Level */}
              {(() => {
                // Calculate total sendable
                const demandMatches = state.matchingResult?.demandMatches || [];
                const supplyAggregates = state.matchingResult?.supplyAggregates || [];

                const demandEnriched = demandMatches.filter(m => {
                  const e = state.enrichedDemand.get(m.demand.domain);
                  return e?.success && e?.email;
                }).length;

                const supplyEnriched = supplyAggregates.filter(a => {
                  const e = state.enrichedSupply.get(a.supply.domain);
                  return e?.success && e?.email;
                }).length;

                const totalReady = demandEnriched + supplyEnriched;
                const hasContext = settings?.presignalDemand || settings?.presignalSupply;
                const isEditingContext = editingPresignalSide !== null;

                return (
                  <div className="flex flex-col items-center">
                    {/* Checkmark with glow animation */}
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 200, damping: 15 }}
                      className="relative w-16 h-16 mb-8"
                    >
                      <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl animate-pulse" />
                      <div className="relative w-full h-full rounded-full bg-gradient-to-b from-emerald-500/20 to-emerald-500/5 border border-emerald-500/30 flex items-center justify-center">
                        <motion.svg
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ duration: 0.5, delay: 0.2 }}
                          className="w-7 h-7 text-emerald-400"
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

                    {/* Count — total contacts being reached */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="text-center mb-6"
                    >
                      <p className="text-[18px] font-light text-white/80">Found {demandEnriched} matches</p>
                      <p className="text-[12px] text-white/40 mt-2">These will reach {demandEnriched + supplyEnriched} people</p>
                      <p className="text-[11px] text-white/30 mt-0.5">{demandEnriched} demand · {supplyEnriched} supply</p>
                    </motion.div>

                    {/* Intro Preview Cards — 2 samples */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="w-full max-w-md space-y-3 mb-8"
                    >
                      {(() => {
                        // Get first match with both intros
                        const matchesWithIntros = demandMatches
                          .filter(m => state.demandIntros.get(m.demand.domain) && state.supplyIntros.get(m.supply.domain))
                          .slice(0, 1);

                        if (matchesWithIntros.length === 0) return null;

                        const match = matchesWithIntros[0];
                        const demandIntro = state.demandIntros.get(match.demand.domain) || '';
                        const supplyIntro = state.supplyIntros.get(match.supply.domain) || '';

                        return (
                          <>
                            {/* Demand intro preview — compact, left-aligned */}
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.5 }}
                              className="text-left"
                            >
                              <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">
                                To {match.demand.company}
                              </p>
                              <p className="text-[12px] text-white/60 leading-[1.7] whitespace-pre-line">
                                {demandIntro}
                              </p>
                            </motion.div>

                            <div className="h-px bg-white/[0.04] my-4" />

                            {/* Supply intro preview — compact, left-aligned */}
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.65 }}
                              className="text-left"
                            >
                              <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">
                                To {match.supply.company}
                              </p>
                              <p className="text-[12px] text-white/60 leading-[1.7] whitespace-pre-line">
                                {supplyIntro}
                              </p>
                            </motion.div>
                          </>
                        );
                      })()}
                    </motion.div>

                    {/* Error surface */}
                    {state.error && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-[12px] text-red-400/80 mb-6 text-center max-w-sm"
                      >
                        {safeRender(state.error)}
                      </motion.p>
                    )}
                  </div>
                );
              })()}

              {/* Run Audit Panel — Observability (debug only) */}
              {isDebugMode && state.connectorMode && (
                <div className="mb-6 max-w-sm mx-auto">
                  <RunAuditPanel
                    data={state.auditData || {
                      mode: state.connectorMode,
                      registryVersion: MODE_REGISTRY_VERSION,
                      demandCount: state.demandRecords.length,
                      supplyCount: state.supplyRecords.length,
                      enrichedCount: state.enrichedDemand.size + state.enrichedSupply.size,
                      matchedCount: state.matchingResult?.demandMatches.length || 0,
                      demandValidationFailures: [],
                      supplyValidationFailures: [],
                      copyValidationFailures: state.copyValidationFailures,
                      instantlyPayloadSize: (state.matchingResult?.demandMatches.length || 0) + (state.matchingResult?.supplyAggregates.length || 0),
                      sentCount: state.sentDemand + state.sentSupply,
                      skippedReasons: [],
                      runStartedAt: new Date(),
                    }}
                  />
                </div>
              )}

              {/* Route button with presignal gate */}
              {(() => {
                // Match count for button text
                const matchCount = state.matchingResult?.demandMatches.length || 0;

                // CANONICAL: Check for presignal violations using per-side presignal
                const hasPresignalViolation = (() => {
                  if (!state.matchingResult) return false;

                  // Check demand intros (use per-side presignalDemand)
                  const demandPresignal = settings?.presignalDemand;
                  for (const match of state.matchingResult.demandMatches.slice(0, 2)) {
                    const intro = state.demandIntros.get(match.demand.domain) || '';
                    if (!hasPresignal(demandPresignal) && containsActivityTimingLanguage(intro).found) {
                      return true;
                    }
                  }

                  // Check supply intros (use per-side presignalSupply)
                  const supplyPresignal = settings?.presignalSupply;
                  for (const agg of state.matchingResult.supplyAggregates.slice(0, 1)) {
                    const intro = state.supplyIntros.get(agg.supply.domain) || '';
                    if (!hasPresignal(supplyPresignal) && containsActivityTimingLanguage(intro).found) {
                      return true;
                    }
                  }

                  return false;
                })();

                return (
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center justify-center gap-3">
                      <button
                        onClick={reset}
                        className="px-4 py-2 text-[13px] text-white/50 hover:text-white/70 transition-colors"
                      >
                        Start Over
                      </button>
                      <button
                        onClick={openExportReceipt}
                        className="px-4 py-2.5 text-[13px] font-medium rounded-lg border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-all active:scale-[0.98]"
                      >
                        Export CSV
                      </button>
                      <button
                        onClick={startSending}
                        disabled={hasPresignalViolation}
                        className={`px-5 py-2.5 text-[13px] font-medium rounded-lg transition-all ${
                          hasPresignalViolation
                            ? 'bg-white/20 text-white/30 cursor-not-allowed'
                            : 'bg-white text-black hover:bg-white/90 active:scale-[0.98]'
                        }`}
                      >
                        Route {matchCount} matches
                      </button>
                    </div>
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
