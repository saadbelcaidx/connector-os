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
import { Workflow, ArrowLeft, Pencil, X, Check, Star, EyeOff, ArrowRight, ChevronRight, Info, CheckCircle2, Key, Clock, CreditCard, User, Building2, Settings, AlertCircle, Search, Sparkles, RefreshCw } from 'lucide-react';
import Dock from './Dock';
import { useAuth } from './AuthContext';
import { supabase } from './lib/supabase';

// New architecture
import { NormalizedRecord, renderSignal, getNarration } from './schemas';
import { matchRecords, MatchingResult, filterByScore } from './matching';
import { filterDemandBySupplyCapability, type FilterResult } from './services/matching';
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
  simpleHash,
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

// Signal Intelligence — AI-powered extraction
import { extractSignalIntelligence, type ExtractionResult } from './services/SignalIntelligenceService';

// CSV Data Support
import { getCsvData } from './services/SignalsClient';

// Flow State Persistence — IndexedDB-based, survives navigation
import {
  createFlow,
  saveFlow as persistFlow,
  loadFlowAsync,
  listFlowsAsync,
  FlowState as PersistedFlowState,
} from './services/FlowStateStore';

// 3-Step AI Intro Generation (user.txt contract)
import { generateIntrosAI, generateIntrosBatchParallel, IntroAIConfig, BatchIntroItem, BatchIntroResult } from './services/IntroAI';

// INTRO RELIABILITY CONTRACT — Stripe-level infrastructure
// Layer 0: Deterministic base (always runs first, always succeeds)
// Layer 1: AI enhancement (best effort, non-blocking)
import {
  generateIntroWithAI,
  IntroRequest,
} from './services/IntroReliability';

// Sender Adapter (Instantly, Plusvibe, etc.)
import { resolveSender, buildSenderConfig, SenderAdapter, SenderConfig, getLimiter, QueueProgress } from './services/senders';

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
import { MatchReasoningPopover } from './ui/matching/reasoning';
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

// CSV Phase 3 imports removed — stale warning removed

// UI Primitives — Single source of truth
import { BTN } from './ui/primitives';

// =============================================================================
// SIGNAL STATUS — Explicit 3-state for UX (no silent failures)
// =============================================================================

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
  const raw = normalized.raw || {};

  // CSV-ONLY: Use signalMeta.kind to detect hiring signals
  const isHiringSignal = normalized.signalMeta?.kind === 'HIRING_ROLE';

  // LEADERSHIP_GAP signals are ONLY valid for HIRING_ROLE signals
  if (isHiringSignal) {
    if (signalLower.includes('vp') || signalLower.includes('vice president')) {
      signals.push({ type: 'VP_OPEN', source: 'csv' });
      metadata.vpOpen = true;
    }
    if (signalLower.includes('ceo') || signalLower.includes('cfo') || signalLower.includes('cto') ||
        signalLower.includes('coo') || signalLower.includes('chief')) {
      signals.push({ type: 'C_LEVEL_OPEN', source: 'csv' });
      metadata.cLevelOpen = true;
    }
    if (signalLower.includes('director') || signalLower.includes('head of')) {
      signals.push({ type: 'LEADERSHIP_OPEN', source: 'csv' });
      metadata.hasLeadershipRole = true;
    }
  }

  // Funding from company data
  if (normalized.companyFunding) {
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

  // CHECKPOINT 3 (user.txt): Map companyDescription to metadata
  // IntroAI reads metadata.companyDescription — this mapping is NON-NEGOTIABLE
  metadata.companyDescription = normalized.companyDescription || '';
  metadata.description = metadata.companyDescription;  // Mirrored fallback

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
  demandIntros: Map<string, IntroEntry>;
  supplyIntros: Map<string, IntroEntry>;
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

    // EMAIL RESOLUTION (user.txt contract): pre-existing OR enriched
    const email = match.demand.email || (enriched && isSuccessfulEnrichment(enriched) ? enriched.email : null);
    if (!email) continue;

    const introEntry = data.demandIntros.get(key);
    const intro = introEntry?.text || '';
    if (!intro) continue; // No intro = wouldn't be sent

    rows.push([
      'DEMAND',
      email,  // Use resolved email
      enriched?.firstName || match.demand.firstName || '',
      enriched?.lastName || match.demand.lastName || '',
      cleanCompanyName(match.demand.company),
      match.demand.domain || '',
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

    // EMAIL RESOLUTION (user.txt contract): pre-existing OR enriched
    const email = agg.supply.email || (enriched && isSuccessfulEnrichment(enriched) ? enriched.email : null);
    if (!email) continue;

    const introEntry = data.supplyIntros.get(key);
    const intro = introEntry?.text || '';
    if (!intro) continue; // No intro = wouldn't be sent

    // Calculate average match score
    const avgScore = agg.matches.length > 0
      ? Math.round(agg.matches.reduce((sum, m) => sum + m.score, 0) / agg.matches.length)
      : 0;

    rows.push([
      'SUPPLY',
      email,  // Use resolved email
      enriched?.firstName || agg.supply.firstName || '',
      enriched?.lastName || agg.supply.lastName || '',
      cleanCompanyName(agg.supply.company),
      agg.supply.domain || '',
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
  | 'MISSING_DEMAND_CSV'
  | 'DATASET_FETCH_FAILED'
  | 'DATASET_EMPTY'
  | 'DATASET_INVALID'
  | 'MISSING_SUPPLY'
  | 'HUB_ERROR'
  | 'HUB_MISSING_SIDE'
  | 'CONTRACT_VIOLATION'
  | 'UNKNOWN';

function toUserError(code: ErrorCode, detail?: string): string {
  // CSV-ONLY: Apple-calm guidance messages
  const messages: Record<ErrorCode, string> = {
    MISSING_DEMAND_CSV: 'Add a demand CSV in Settings to continue.',
    DATASET_FETCH_FAILED: detail ? `Couldn't read CSV: ${detail}` : `Couldn't read CSV. Check the format.`,
    DATASET_EMPTY: 'CSV is empty. Add some rows and try again.',
    DATASET_INVALID: detail ? `CSV needs adjustment: ${detail}` : 'CSV needs Company Name and Signal columns.',
    MISSING_SUPPLY: 'Add a supply CSV in Settings to continue.',
    HUB_ERROR: detail || 'Hub needs a refresh. Try selecting contacts again.',
    HUB_MISSING_SIDE: 'Select contacts for both Demand and Supply in Hub.',
    CONTRACT_VIOLATION: detail || 'Data format issue. Check console for details.',
    UNKNOWN: detail || 'Something unexpected happened.',
  };
  return messages[code];
}

// =============================================================================
// TYPES
// =============================================================================

// =============================================================================
// DATA PREVIEW — Stripe-style transparency (show what system sees before matching)
// =============================================================================

interface CategoryBreakdown {
  category: string;
  count: number;
  percentage: number;
}

interface DataPreview {
  demandBreakdown: CategoryBreakdown[];
  supplyBreakdown: CategoryBreakdown[];
  detectedMatchType: string;
  demandTotal: number;
  supplyTotal: number;
}

/**
 * STRIPE-LEVEL: Safe string coercion for any data type.
 * Handles objects, arrays, null, undefined, numbers — everything.
 */
function safeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(safeString).join(' ');
  if (typeof value === 'object') {
    // Try common string fields
    const obj = value as Record<string, unknown>;
    if (obj.name) return safeString(obj.name);
    if (obj.value) return safeString(obj.value);
    if (obj.label) return safeString(obj.label);
    if (obj.title) return safeString(obj.title);
    return '';
  }
  return '';
}

/**
 * Analyze demand records — CSV-ONLY.
 *
 * HIRING_ROLE signals:
 *   → signal = what they're hiring for (Engineering, Sales, etc.)
 *
 * GROWTH/CONTACT_ROLE signals:
 *   → signal = company activity or person's title
 *   → Analyze by INDUSTRY instead
 *
 * Uses signalMeta.kind to detect data type, show correct breakdown.
 */
function analyzeDemandNeeds(records: NormalizedRecord[]): CategoryBreakdown[] {
  const categories: Record<string, number> = {};

  // CSV-ONLY: Detect if this is HIRING data or CONTACT data
  // HIRING_ROLE signals → analyze by role type (what they're hiring for)
  // GROWTH/CONTACT_ROLE → analyze by industry (what kind of companies)
  const isHiringData = records.some(r =>
    r.signalMeta?.kind === 'HIRING_ROLE'
  );

  for (const record of records) {
    let category = 'General';

    if (isHiringData) {
      // HIRING_ROLE — analyze by role type (what they're hiring for)
      const signal = safeString(record.signal || record.title).toLowerCase();

      if (/engineer|developer|software|tech lead|architect|devops|sre|full.?stack|front.?end|back.?end|data scientist|ml|machine learning/i.test(signal)) {
        category = 'Engineering';
      } else if (/sales|account executive|ae|sdr|bdr|business development|revenue/i.test(signal)) {
        category = 'Sales';
      } else if (/marketing|growth|brand|content|seo|sem|demand gen|product marketing/i.test(signal)) {
        category = 'Marketing';
      } else if (/operations|ops|coo|chief operating|supply chain|logistics|procurement/i.test(signal)) {
        category = 'Operations';
      } else if (/finance|cfo|controller|fp&a|accounting|treasury/i.test(signal)) {
        category = 'Finance';
      } else if (/hr|human resources|people|talent|recruiting|recruiter/i.test(signal)) {
        category = 'HR/People';
      } else if (/product|pm|product manager|product owner/i.test(signal)) {
        category = 'Product';
      } else if (/design|ux|ui|creative|graphic/i.test(signal)) {
        category = 'Design';
      } else if (/legal|counsel|attorney|compliance/i.test(signal)) {
        category = 'Legal';
      } else if (/ceo|founder|president|chief executive|managing director|general manager/i.test(signal)) {
        category = 'Executive';
      }
    } else {
      // CONTACT/COMPANY DATA — analyze by INDUSTRY (what kind of companies)
      const industry = safeString(record.industry).toLowerCase();
      const company = safeString(record.company).toLowerCase();
      const description = safeString(record.description || record.companyDescription).toLowerCase();
      const combined = `${industry} ${company} ${description}`;

      if (/biotech|pharma|therapeutic|clinical|life science|drug|medical device/i.test(combined)) {
        category = 'Biotech/Pharma';
      } else if (/tech|software|saas|cloud|platform|digital|app|cyber|ai|machine learning/i.test(combined)) {
        category = 'Tech/Software';
      } else if (/health|medical|hospital|healthcare/i.test(combined)) {
        category = 'Healthcare';
      } else if (/financ|banking|insurance|invest|capital|fintech/i.test(combined)) {
        category = 'Finance';
      } else if (/retail|ecommerce|e-commerce|consumer|brand/i.test(combined)) {
        category = 'Retail/E-commerce';
      } else if (/manufactur|industrial|supply chain|logistics/i.test(combined)) {
        category = 'Manufacturing';
      } else if (/real estate|property|construction/i.test(combined)) {
        category = 'Real Estate';
      } else if (/media|entertainment|gaming|content/i.test(combined)) {
        category = 'Media';
      } else if (/energy|oil|gas|renewable|clean/i.test(combined)) {
        category = 'Energy';
      } else if (/consult|professional service|agency/i.test(combined)) {
        category = 'Services';
      }
    }

    categories[category] = (categories[category] || 0) + 1;
  }

  return Object.entries(categories)
    .map(([category, count]) => ({
      category,
      count,
      percentage: Math.round((count / records.length) * 100),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
}

/**
 * Analyze supply records to extract CAPABILITY — what they CAN DO.
 * STRIPE-LEVEL: Shows WHO CAN SOLVE the demand, not job titles.
 * A "Founder/CEO" means nothing — we need "Recruitment agency" or "Sales consultants".
 */
function analyzeSupplyCapabilities(records: NormalizedRecord[]): CategoryBreakdown[] {
  const categories: Record<string, number> = {};

  for (const record of records) {
    const title = safeString(record.title || record.signal).toLowerCase();
    const company = safeString(record.company).toLowerCase();
    const industry = safeString(record.industry).toLowerCase();
    const description = safeString(record.description).toLowerCase();

    // Combine all text to detect CAPABILITY
    const combined = `${title} ${company} ${industry} ${description}`;

    // Detect CAPABILITY — what service/solution they provide
    let category = 'Professionals';

    // Recruitment/Staffing — can solve hiring needs
    if (/recruit|staffing|talent acquisition|headhunt|executive search|hiring|placement/i.test(combined)) {
      category = 'Recruiters/Staffing';
    }
    // Consulting/Advisory — can solve strategy/ops needs
    else if (/consult|advisor|advisory|fractional|interim|outsourced/i.test(combined)) {
      category = 'Consultants';
    }
    // Agency — can solve marketing/creative/dev needs
    else if (/agency|studio|creative|design agency|dev shop|development agency|marketing agency/i.test(combined)) {
      category = 'Agencies';
    }
    // Tech/Engineering services
    else if (/software|development|engineering|tech|saas|platform|solution/i.test(combined) && /service|partner|vendor|provider/i.test(combined)) {
      category = 'Tech Services';
    }
    // Sales/BD services
    else if (/sales|business development|lead gen|outbound|growth/i.test(combined) && !/hiring|recruit/i.test(combined)) {
      category = 'Sales/BD Services';
    }
    // Finance services
    else if (/cfo|accounting|bookkeep|finance|tax|audit|cpa/i.test(combined) && /service|consult|firm|partner/i.test(combined)) {
      category = 'Finance Services';
    }
    // HR services
    else if (/hr |human resource|people ops|payroll|benefits/i.test(combined) && /service|consult|partner/i.test(combined)) {
      category = 'HR Services';
    }
    // Legal services
    else if (/law|legal|attorney|counsel|compliance/i.test(combined)) {
      category = 'Legal Services';
    }
    // Venture/Investment — can solve funding needs
    else if (/venture|investor|capital|fund|angel|vc |invest/i.test(combined)) {
      category = 'Investors/VCs';
    }

    categories[category] = (categories[category] || 0) + 1;
  }

  return Object.entries(categories)
    .map(([category, count]) => ({
      category,
      count,
      percentage: Math.round((count / records.length) * 100),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
}

/**
 * Detect the match type from demand needs and supply capabilities.
 * SCHEMA-AWARE: Different labels for job data vs company data.
 */
function detectMatchType(demandBreakdown: CategoryBreakdown[], supplyBreakdown: CategoryBreakdown[]): string {
  const topDemand = demandBreakdown[0]?.category || 'General';
  const topSupply = supplyBreakdown[0]?.category || 'Professionals';

  // Check if demand is industry-based (contact data) or role-based (job data)
  const isIndustryBased = ['Biotech/Pharma', 'Tech/Software', 'Healthcare', 'Finance', 'Retail/E-commerce', 'Manufacturing', 'Real Estate', 'Media', 'Energy', 'Services'].includes(topDemand);

  let demandLabel: string;
  if (topDemand === 'General') {
    demandLabel = 'Companies';
  } else if (isIndustryBased) {
    demandLabel = topDemand; // "Biotech/Pharma", "Tech/Software"
  } else {
    demandLabel = `${topDemand} hiring`; // "Engineering hiring", "Sales hiring"
  }

  return `${demandLabel} → ${topSupply}`;
}

/**
 * Generate full data preview analysis.
 */
function analyzeDataForPreview(demandRecords: NormalizedRecord[], supplyRecords: NormalizedRecord[]): DataPreview {
  const demandBreakdown = analyzeDemandNeeds(demandRecords);
  const supplyBreakdown = analyzeSupplyCapabilities(supplyRecords);
  const detectedMatchType = detectMatchType(demandBreakdown, supplyBreakdown);

  return {
    demandBreakdown,
    supplyBreakdown,
    detectedMatchType,
    demandTotal: demandRecords.length,
    supplyTotal: supplyRecords.length,
  };
}

// Intro entry with source tracking for badges
interface IntroEntry {
  text: string;
  source: 'template' | 'ai' | 'ai-fallback';
}

// Badge component for intro source
function IntroBadge({ source }: { source?: 'template' | 'ai' | 'ai-fallback' }) {
  if (!source) return null;

  const config = {
    'template': { label: 'TEMPLATE', className: 'bg-white/[0.06] text-white/40 border-white/[0.08]' },
    'ai': { label: 'AI', className: 'bg-violet-500/10 text-violet-400/80 border-violet-500/20' },
    'ai-fallback': { label: 'AI-FALLBACK', className: 'bg-amber-500/10 text-amber-400/80 border-amber-500/20' },
  }[source];

  return (
    <span className={`text-[8px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border ${config.className}`}>
      {config.label}
    </span>
  );
}

interface FlowState {
  step: 'upload' | 'validating' | 'preview' | 'matching' | 'matches_found' | 'no_matches' | 'enriching' | 'route_context' | 'generating' | 'ready' | 'sending' | 'complete';

  // Data Preview — Stripe-style transparency
  dataPreview: DataPreview | null;

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

  // Intros (AI-generated or template-based)
  demandIntros: Map<string, IntroEntry>;  // domain -> intro with source tracking
  supplyIntros: Map<string, IntroEntry>;  // domain -> intro with source tracking

  // Progress
  progress: { current: number; total: number; message: string };

  // Results
  sentDemand: number;
  sentSupply: number;

  // Send breakdown (Apple-style: new | existing | needs_attention)
  sendBreakdown: {
    new: number;
    existing: number;
    needsAttention: number;
    details: string[];  // Details for needs_attention items
  };

  // Error (legacy string-based)
  error: string | null;

  // FlowBlock — Structured error for zero silent failures
  flowBlock: FlowBlock | null;

  // Audit (observability)
  auditData: RunAuditData | null;
  copyValidationFailures: CopyValidationResult[];

  // INVARIANT C: No data loss on resume
  // If results exceed storage limits, preserve summaries
  resultsDropped: boolean;
  droppedCounts: { demand: number; supply: number; intros: number } | null;
}

interface Settings {
  // CSV-ONLY: Apify settings removed (architectural decision locked)
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
  // LAYER 3: OpenAI key as fallback when Azure content filter blocks
  openaiApiKeyFallback?: string;
  // Enhance Intro toggle — when true use AI, when false use templates (default false)
  enhanceIntro?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function Flow() {
  const [state, setState] = useState<FlowState>({
    step: 'upload',
    dataPreview: null,
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
    sendBreakdown: { new: 0, existing: 0, needsAttention: 0, details: [] },
    error: null,
    flowBlock: null,
    auditData: null,
    resultsDropped: false,
    droppedCounts: null,
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

  // View mode toggle: demand → supply or supply → demands
  const [matchViewMode, setMatchViewMode] = useState<'demand' | 'supply'>('demand');

  // Supply-aware filter — shows what % of demand matches supply capability
  const [supplyAwareFilter, setSupplyAwareFilter] = useState<FilterResult | null>(null);

  const abortRef = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  // =============================================================================
  // FLOW PERSISTENCE — IndexedDB-based, survives navigation
  // =============================================================================
  const flowIdRef = useRef<string | null>(null);
  const hasRestoredRef = useRef(false);

  // VALID_STEPS — used for restore validation (user.txt Task 1)
  const VALID_STEPS = [
    'upload', 'validating', 'preview', 'matching', 'matches_found',
    'no_matches', 'enriching', 'route_context', 'generating',
    'ready', 'sending', 'complete'
  ] as const;

  // Serialize Maps to objects for IndexedDB storage
  const serializeState = useCallback((s: FlowState) => ({
    step: s.step,
    isHubFlow: s.isHubFlow,
    demandSchema: s.demandSchema,  // Task 1: persist schemas
    supplySchema: s.supplySchema,  // Task 1: persist schemas
    demandRecords: s.demandRecords,
    supplyRecords: s.supplyRecords,
    matchingResult: s.matchingResult,
    detectedEdges: Object.fromEntries(s.detectedEdges),
    enrichedDemand: Object.fromEntries(s.enrichedDemand),
    enrichedSupply: Object.fromEntries(s.enrichedSupply),
    demandIntros: Object.fromEntries(s.demandIntros),
    supplyIntros: Object.fromEntries(s.supplyIntros),
    progress: s.progress,
    sentDemand: s.sentDemand,
    sentSupply: s.sentSupply,
  }), []);

  // Deserialize objects back to Maps (with restore guard - user.txt Task 1)
  const deserializeState = useCallback((data: any): Partial<FlowState> & { _downgraded?: boolean } => {
    // Task 1: Validate step against VALID_STEPS
    let step = data.step;
    let downgraded = false;

    if (!VALID_STEPS.includes(step)) {
      console.warn(`[Flow] Invalid step "${step}" in persisted data, resetting to upload`);
      step = 'upload';
      downgraded = true;
    }

    // Task 1: Restore guard — if step requires prerequisites, validate them
    const requiresSchemas = ['enriching', 'route_context', 'generating', 'ready', 'sending'].includes(step);
    const hasSchemas = data.demandSchema != null;
    const hasMatchingResult = data.matchingResult != null;

    if (requiresSchemas && (!hasSchemas || !hasMatchingResult)) {
      // Downgrade: if we have matchingResult, go to matches_found; else upload
      if (hasMatchingResult) {
        console.warn(`[Flow] Step "${step}" requires schemas but missing, downgrading to matches_found`);
        step = 'matches_found';
      } else {
        console.warn(`[Flow] Step "${step}" requires matchingResult but missing, downgrading to upload`);
        step = 'upload';
      }
      downgraded = true;
    }

    return {
      step,
      isHubFlow: data.isHubFlow,
      demandSchema: data.demandSchema || null,  // Task 1: restore schemas
      supplySchema: data.supplySchema || null,  // Task 1: restore schemas
      demandRecords: data.demandRecords || [],
      supplyRecords: data.supplyRecords || [],
      matchingResult: data.matchingResult,
      detectedEdges: new Map(Object.entries(data.detectedEdges || {})),
      enrichedDemand: new Map(Object.entries(data.enrichedDemand || {})),
      enrichedSupply: new Map(Object.entries(data.enrichedSupply || {})),
      // Migrate old string intros to new IntroEntry format
      demandIntros: new Map(Object.entries(data.demandIntros || {}).map(([k, v]) => [
        k,
        typeof v === 'string' ? { text: v, source: 'template' as const } : v as IntroEntry
      ])),
      supplyIntros: new Map(Object.entries(data.supplyIntros || {}).map(([k, v]) => [
        k,
        typeof v === 'string' ? { text: v, source: 'template' as const } : v as IntroEntry
      ])),
      progress: data.progress || { current: 0, total: 0, message: '' },
      sentDemand: data.sentDemand || 0,
      sentSupply: data.sentSupply || 0,
      _downgraded: downgraded,  // Signal for UX toast
    };
  }, []);

  // Persist state to IndexedDB (Task 4: expanded dependencies for incremental persist)
  useEffect(() => {
    // Don't persist upload or complete steps
    if (state.step === 'upload' || state.step === 'complete') return;
    // Don't persist if no data loaded yet
    if (state.demandRecords.length === 0 && state.supplyRecords.length === 0) return;

    // Create flow if we don't have one
    if (!flowIdRef.current) {
      const newFlow = createFlow({ name: `Flow ${new Date().toLocaleTimeString()}` });
      flowIdRef.current = newFlow.flowId;
      console.log('[Flow] Created persistent flow:', flowIdRef.current);
    }

    // Save current state
    const serialized = serializeState(state);
    loadFlowAsync(flowIdRef.current).then(existingFlow => {
      if (existingFlow) {
        existingFlow.stages.matching.results = serialized;
        existingFlow.stages.matching.status = state.step === 'matches_found' ? 'complete' : 'running';
        existingFlow.stages.matching.progress = Math.round((state.progress.current / Math.max(state.progress.total, 1)) * 100);
        persistFlow(existingFlow);
        console.log('[Flow] Persisted state:', state.step, 'enriched:', state.enrichedDemand.size, 'intros:', state.demandIntros.size);
      }
    });
  }, [
    // Task 4: Complete dependency list for incremental persistence
    state.step,
    state.demandRecords.length,
    state.supplyRecords.length,
    state.matchingResult,
    state.detectedEdges.size,
    state.enrichedDemand.size,
    state.enrichedSupply.size,
    state.demandIntros.size,
    state.supplyIntros.size,
    state.progress.current,
    serializeState
  ]);

  // Restore message state (Task 5B: UX for downgrade)
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);

  // Fallback warning state (Enhance Intro feature: show when AI fallback rate > 20%)
  const [fallbackWarning, setFallbackWarning] = useState<string | null>(null);

  // Restore state on mount (check URL param or latest incomplete flow)
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const resumeFlowId = params.get('resumeFlowId');

    const restore = async () => {
      let flowToRestore: PersistedFlowState | null = null;

      if (resumeFlowId) {
        // Explicit resume from URL
        flowToRestore = await loadFlowAsync(resumeFlowId);
      } else {
        // Check for any recent incomplete flow
        const flows = await listFlowsAsync();
        for (const entry of flows) {
          const flow = await loadFlowAsync(entry.flowId);
          if (flow && flow.stages.matching.status === 'running') {
            flowToRestore = flow;
            break;
          }
        }
      }

      if (flowToRestore && flowToRestore.stages.matching.results) {
        const restored = deserializeState(flowToRestore.stages.matching.results);
        flowIdRef.current = flowToRestore.flowId;

        // Task 5B: Show downgrade toast if data was missing
        if (restored._downgraded) {
          setRestoreMessage('Picked up where you left off.');
        }

        // Task 5D: Show resume banner if partial progress exists
        const enrichedCount = (restored.enrichedDemand?.size || 0) + (restored.enrichedSupply?.size || 0);
        const introsCount = (restored.demandIntros?.size || 0) + (restored.supplyIntros?.size || 0);

        if (restored.step === 'enriching' && enrichedCount > 0 && !restored._downgraded) {
          setRestoreMessage(`resume enrichment — ${enrichedCount} contacts already saved`);
        } else if (restored.step === 'generating' && introsCount > 0 && !restored._downgraded) {
          setRestoreMessage(`resume intro generation — ${introsCount} intros already saved`);
        }

        // Remove _downgraded before setting state
        const { _downgraded, ...cleanRestored } = restored;
        setState(prev => ({ ...prev, ...cleanRestored }));
        console.log('[Flow] Restored from:', flowToRestore.flowId, 'step:', restored.step, 'downgraded:', _downgraded);
      }
    };

    restore();
  }, [deserializeState]);

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

          // LAYER 3: If using Azure, store OpenAI key as fallback (if available)
          const openaiApiKeyFallback = aiConfig?.provider === 'azure' && ai.openaiApiKey
            ? ai.openaiApiKey
            : undefined;

          setSettings({
            // CSV-ONLY: Apify settings removed
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
            openaiApiKeyFallback,
            enhanceIntro: ai.enhanceIntro === true, // from localStorage (same source as AI keys)
          });

          console.log('[Flow] Loaded from Supabase, AI:', aiConfig ? aiConfig.provider : 'none', openaiApiKeyFallback ? '(OpenAI fallback configured)' : '');
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

        // LAYER 3: If using Azure, store OpenAI key as fallback (if available)
        const openaiApiKeyFallback = aiConfig?.provider === 'azure' && s.openaiApiKey
          ? s.openaiApiKey
          : undefined;

        setSettings({
          // CSV-ONLY: Apify settings removed
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
          openaiApiKeyFallback,
          enhanceIntro: s.enhanceIntro === true, // default false — user must opt-in to AI intros
        });

        console.log('[Flow] AI configured:', aiConfig ? aiConfig.provider : 'none', openaiApiKeyFallback ? '(OpenAI fallback configured)' : '');
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

  // Compute supply-aware filter when both datasets are loaded
  useEffect(() => {
    if (state.demandRecords.length > 0 && state.supplyRecords.length > 0) {
      console.log('[Flow] Computing supply-aware filter...');
      const result = filterDemandBySupplyCapability(
        state.demandRecords,
        state.supplyRecords
      );
      setSupplyAwareFilter(result);
    } else {
      setSupplyAwareFilter(null);
    }
  }, [state.demandRecords, state.supplyRecords]);

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

        // Dedupe demand by recordKey (supports domainless records)
        const seenDemandKeys = new Set<string>();
        const dedupedDemand = hubDemand.filter(r => {
          const key = recordKey(r);
          if (seenDemandKeys.has(key)) return false;
          seenDemandKeys.add(key);
          return true;
        });

        // Dedupe supply by recordKey (supports domainless records)
        const seenSupplyKeys = new Set<string>();
        const dedupedSupply = hubSupply.filter(r => {
          const key = recordKey(r);
          if (seenSupplyKeys.has(key)) return false;
          seenSupplyKeys.add(key);
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
            // Records need EITHER domain OR (company + name) for enrichment
            // Domainless records use SEARCH_PERSON action via Anymail
            if (!r.domain && !r.company) {
              console.error(`[Flow] CONTRACT VIOLATION in ${label}[${i}]: missing both domain and company`, r);
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

      // CSV-ONLY: Load demand from CSV (already normalized by CsvUpload)
      let demandRecords: NormalizedRecord[] = [];

      // CSV schemas — placeholder metadata for downstream functions
      // Same pattern as Hub path (lines 1437-1438)
      const csvDemandSchema = { name: 'CSV Upload (Demand)', id: 'csv-demand', fields: [], hasContacts: true } as any;
      const csvSupplySchema = { name: 'CSV Upload (Supply)', id: 'csv-supply', fields: [], hasContacts: true } as any;

      const csvDemandData = getCsvData('demand');
      if (csvDemandData && csvDemandData.length > 0) {
        console.log('[Flow] Loading demand from CSV:', csvDemandData.length, 'records');
        console.log('[Flow] CSV demand sample:', csvDemandData[0]);
        setState(prev => ({ ...prev, progress: { current: 0, total: 100, message: 'Loading demand from CSV...' } }));

        // Data is already NormalizedRecord[] from CsvUpload — use directly
        demandRecords = csvDemandData as NormalizedRecord[];
        console.log(`[Flow] Demand: ${demandRecords.length} records`);
      } else {
        // No CSV — require upload
        if (!guard(false, BLOCKS.NO_DEMAND_CSV, setFlowBlock)) return;
      }

      // CSV-ONLY: Load supply from CSV (already normalized by CsvUpload)
      let supplyRecords: NormalizedRecord[] = [];

      const csvSupplyData = getCsvData('supply');
      if (csvSupplyData && csvSupplyData.length > 0) {
        console.log('[Flow] Loading supply from CSV:', csvSupplyData.length, 'records');
        console.log('[Flow] CSV supply sample:', csvSupplyData[0]);
        setState(prev => ({ ...prev, progress: { ...prev.progress, current: 50, message: 'Loading supply from CSV...' } }));

        // Data is already NormalizedRecord[] from CsvUpload — use directly
        supplyRecords = csvSupplyData as NormalizedRecord[];
        console.log(`[Flow] Supply: ${supplyRecords.length} records`);
      } else {
        console.log('[Flow] No supply CSV uploaded');
      }

      // Analyze data for preview BEFORE matching
      // Use AI extraction if configured, otherwise fall back to keyword analysis
      let dataPreview: DataPreview;

      if (settings?.aiConfig?.apiKey) {
        // AI-powered extraction — the intelligence layer
        console.log('[Flow] Using AI extraction for signal intelligence...');
        setState(prev => ({ ...prev, progress: { current: 50, total: 100, message: 'Analyzing signals...' } }));

        try {
          const extractionResult = await extractSignalIntelligence(
            demandRecords.map(r => ({
              domain: r.domain,
              signal: r.signal || r.title || '',
              company: r.company,
              title: r.title,
              companyDescription: r.companyDescription || undefined,
            })),
            supplyRecords.map(r => ({
              domain: r.domain,
              company: r.company,
              title: r.title,
              companyDescription: r.companyDescription || undefined,
            })),
            settings.aiConfig,
            (message, current, total) => {
              const progress = 50 + Math.round((current / total) * 20);
              setState(prev => ({ ...prev, progress: { current: progress, total: 100, message } }));
            }
          );

          console.log('[Flow] AI extraction complete:', extractionResult);
          dataPreview = {
            demandBreakdown: extractionResult.demandBreakdown,
            supplyBreakdown: extractionResult.supplyBreakdown,
            detectedMatchType: extractionResult.detectedMatchType,
            demandTotal: extractionResult.demandTotal,
            supplyTotal: extractionResult.supplyTotal,
          };
        } catch (err) {
          // Fallback to keyword analysis if AI fails
          console.warn('[Flow] AI extraction failed, falling back to keyword analysis:', err);
          dataPreview = analyzeDataForPreview(demandRecords, supplyRecords);
        }
      } else {
        // Keyword-based analysis (fallback — should not happen with AI gate)
        console.log('[Flow] Using keyword analysis (no AI configured)');
        dataPreview = analyzeDataForPreview(demandRecords, supplyRecords);
      }

      console.log('[Flow] Data preview:', dataPreview);

      setState(prev => ({
        ...prev,
        step: 'preview',
        dataPreview,
        demandSchema: csvDemandSchema,
        supplySchema: csvSupplySchema,
        demandRecords,
        supplyRecords,
        progress: { current: 70, total: 100, message: 'Review data...' },
      }));

      // DON'T auto-start matching — wait for user confirmation in preview step

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
  // PREVIEW → MATCHING TRANSITION
  // =============================================================================

  /**
   * User confirmed data looks correct — proceed to matching.
   */
  const continueFromPreview = useCallback(async () => {
    const { demandRecords, supplyRecords, demandSchema, supplySchema } = state;

    if (!demandSchema) {
      console.error('[Flow] Cannot continue from preview: no demand schema');
      return;
    }

    setState(prev => ({
      ...prev,
      step: 'matching',
      progress: { current: 70, total: 100, message: 'Matching...' },
    }));

    try {
      await runMatching(demandRecords, supplyRecords, demandSchema, supplySchema);
    } catch (err) {
      // FIX: Error handling mirrors startFlow pattern (lines 1658-1668)
      // Without this, errors leave step stuck at 'matching' and user must refresh
      if (err instanceof FlowAbort) {
        setFlowBlock(err.uxBlock);
        return;
      }
      console.error('[Flow] Matching failed:', err);
      const detail = err instanceof Error ? err.message : 'Unknown error';
      setFlowBlock(BLOCKS.MATCHING_FAILED(detail));
    }
  }, [state.demandRecords, state.supplyRecords, state.demandSchema, state.supplySchema, setFlowBlock]);

  /**
   * User says "Wrong data" — go back to upload step.
   */
  const cancelPreview = useCallback(() => {
    setState(prev => ({
      ...prev,
      step: 'upload',
      dataPreview: null,
      demandRecords: [],
      supplyRecords: [],
      progress: { current: 0, total: 0, message: '' },
    }));
  }, []);

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

    // CSV-ONLY: Use signalMeta.kind as source of truth
    const buildWhy = (match: Match): string => {
      const demand = match.demand;

      // HIRING_ROLE: "Hiring: Senior Engineer" → "is hiring Senior Engineer"
      if (demand.signalMeta?.kind === 'HIRING_ROLE') {
        const role = (demand.signalMeta.label || '').replace(/^hiring[:\s]*/i, '').trim();
        return role ? `is hiring ${role}` : 'is actively hiring';
      }

      // GROWTH: Non-hiring signal — use label as-is
      if (demand.signalMeta?.kind === 'GROWTH') {
        return demand.signalMeta.label || 'is showing activity';
      }

      // CONTACT_ROLE or UNKNOWN — use title if available
      if (demand.title) {
        return `has ${demand.title} exploring options`;
      }

      // Funding signal
      if (demand.companyFunding) {
        return 'recently raised funding';
      }

      // Industry fallback
      if (demand.industry) {
        const ind = Array.isArray(demand.industry) ? demand.industry[0] : demand.industry;
        if (ind) return `is growing in ${String(ind).split(',')[0].trim()}`;
      }

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
    };

    // Run ID for this batch
    const runId = `flow-${Date.now()}`;

    console.log('[Flow] Enrichment config:', {
      hasApollo: !!config.apolloApiKey,
      hasAnymail: !!config.anymailApiKey,
      hasConnectorAgent: !!config.connectorAgentApiKey,
      runId,
      concurrency: 5,
    });

    // Task 2: Resume-safe enrichment — use existing results from state
    const existingDemand = state.enrichedDemand;
    const existingSupply = state.enrichedSupply;
    console.log(`[Flow] Resume check: ${existingDemand.size} demand, ${existingSupply.size} supply already enriched`);

    // Enrich demand side with bounded concurrency
    const TEST_LIMIT = import.meta.env.DEV ? 100 : Infinity; // Dev = 100 (saves credits), Prod = unlimited
    const allDemandRecords = matching.demandMatches.map(m => m.demand).slice(0, TEST_LIMIT);

    // Task 2: Filter out already-enriched demand records
    const demandRecords = allDemandRecords.filter(r => !existingDemand.has(recordKey(r)));
    console.log(`[Flow] Enriching ${demandRecords.length} demand matches (${allDemandRecords.length - demandRecords.length} skipped from cache)`);

    // Start with existing results
    const enrichedDemand = new Map(existingDemand);

    if (demandRecords.length > 0) {
      const newDemandResults = await enrichBatch(
        demandRecords,
        demandSchema,
        config,
        (current, total) => {
          setState(prev => ({
            ...prev,
            progress: { current: existingDemand.size + current, total: allDemandRecords.length, message: `Enriching ${existingDemand.size + current}/${allDemandRecords.length}` },
          }));
        },
        `${runId}-demand`
      );

      // Merge new results
      for (const [k, v] of newDemandResults) {
        enrichedDemand.set(k, v);
      }
    }

    // Task 2: Persist demand results immediately (incremental persist)
    setState(prev => ({
      ...prev,
      enrichedDemand: new Map(enrichedDemand),
    }));
    console.log(`[Flow] Demand enrichment persisted: ${enrichedDemand.size} total`);

    // Enrich supply side — ONLY supplies paired with edge-positive demands
    const enrichedSupply = new Map(existingSupply);

    // Extract unique supplies from demand matches (not all supplyAggregates)
    const matchedSupplyKeys = new Set<string>();
    const supplyToEnrich: { supply: NormalizedRecord }[] = [];

    for (const match of matching.demandMatches) {
      const supplyKey = recordKey(match.supply);
      // Task 2: Skip already-enriched supplies
      if (!matchedSupplyKeys.has(supplyKey) && !existingSupply.has(supplyKey)) {
        matchedSupplyKeys.add(supplyKey);
        supplyToEnrich.push({ supply: match.supply });
      }
    }

    const totalSupplyCount = new Set(matching.demandMatches.map(m => recordKey(m.supply))).size;
    console.log(`[Flow] Enriching ${supplyToEnrich.length} supplies (${totalSupplyCount - supplyToEnrich.length} skipped from cache)`);

    // Task 2: Batch counter for incremental state updates
    let batchCounter = 0;
    const BATCH_SIZE = 5; // Update state every 5 enrichments

    for (const agg of supplyToEnrich) {
      if (abortRef.current) break;

      const record = agg.supply;
      const key = recordKey(record); // Use recordKey for consistent Map access

      // Supply enrichment (verify if has email, find if not)
      if (supplySchema) {
        const sanitizedDomain = record.domain?.replace(/[^a-z0-9.-]/gi, '') || 'unknown';
        const correlationId = `${runId}-supply-${sanitizedDomain}`;
        try {
          const result = await enrichRecord(record, supplySchema, config, undefined, correlationId);
          enrichedSupply.set(key, result);
        } catch (err) {
          console.log(`[Enrichment] cid=${correlationId} UNCAUGHT domain=${record.domain}`);
          // Construct error result with new format
          enrichedSupply.set(key, {
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

        // Task 2: Incremental state update every BATCH_SIZE
        batchCounter++;
        if (batchCounter >= BATCH_SIZE) {
          setState(prev => ({
            ...prev,
            enrichedSupply: new Map(enrichedSupply),
          }));
          batchCounter = 0;
        }
      }
    }

    // Task 2: Final state update for any remaining
    if (batchCounter > 0) {
      setState(prev => ({
        ...prev,
        enrichedSupply: new Map(enrichedSupply),
      }));
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
    // Task 3: Resume-safe intro generation — start with existing intros from state
    const existingDemandIntros = state.demandIntros;
    const existingSupplyIntros = state.supplyIntros;
    const demandIntros = new Map(existingDemandIntros);
    const supplyIntros = new Map(existingSupplyIntros);

    console.log('[COMPOSE] Starting intro composition:');
    console.log('  - demandMatches:', matching.demandMatches.length);
    console.log('  - supplyAggregates:', matching.supplyAggregates.length);
    console.log('  - detectedEdges:', state.detectedEdges.size);
    console.log('  - enrichedDemand size:', enrichedDemand.size);
    console.log('  - enrichedDemand keys (first 5):', Array.from(enrichedDemand.keys()).slice(0, 5));
    console.log('  - demandMatches keys (first 5):', matching.demandMatches.slice(0, 5).map(m => recordKey(m.demand)));
    console.log('  - existing demandIntros:', existingDemandIntros.size);
    console.log('  - existing supplyIntros:', existingSupplyIntros.size);

    let progress = 0;
    let composed = 0;
    let dropped = 0;
    let skipped = 0;  // Task 3: Track skipped (already generated)

    // Count must match all 3 gates used in the loop below
    // Gate 3 uses FALLBACK — if matched supply has no email, check if ANY supply has email
    const anySupplyHasEmail = matching.supplyAggregates?.some(agg => {
      const aggKey = recordKey(agg.supply);
      const aggEnriched = enrichedSupply.get(aggKey);
      return agg.supply.email || (aggEnriched && isSuccessfulEnrichment(aggEnriched) && aggEnriched.email);
    }) ?? false;

    const total = matching.demandMatches.filter(m => {
      const demandKey = recordKey(m.demand);
      const supplyKey = recordKey(m.supply);

      // Gate 1: edge evidence non-empty
      const edge = state.detectedEdges.get(demandKey);
      if (!edge || !edge.evidence || edge.evidence.trim() === '') return false;

      // Gate 2: demand email (pre-existing OR enriched)
      const demandEnriched = enrichedDemand.get(demandKey);
      const demandEmail = m.demand.email || (demandEnriched && isSuccessfulEnrichment(demandEnriched) ? demandEnriched.email : null);
      if (!demandEmail) return false;

      // Gate 3: supply email — matched supply OR fallback to any supply with email
      const supplyEnriched = enrichedSupply.get(supplyKey);
      const supplyEmail = m.supply.email || (supplyEnriched && isSuccessfulEnrichment(supplyEnriched) ? supplyEnriched.email : null);
      if (!supplyEmail && !anySupplyHasEmail) return false;

      return true;
    }).length;
    console.log(`[COMPOSE] Count: ${total} matches pass all 3 gates (edge + demand email + supply email)`);

    // Build IntroAIConfig from settings (used in Phase 2)
    const introAIConfig: IntroAIConfig | null = settings.aiConfig?.apiKey ? {
      provider: settings.aiConfig.provider as 'openai' | 'anthropic' | 'azure',
      apiKey: settings.aiConfig.apiKey,
      model: settings.aiConfig.model,
      azureEndpoint: settings.aiConfig.endpoint,
      azureDeployment: settings.aiConfig.deployment,
      openaiApiKeyFallback: settings.openaiApiKeyFallback,
    } : null;

    // ==========================================================================
    // PHASE 1: COLLECT WORK ITEMS (NO AI CALLS)
    // ==========================================================================
    // Iterate matches exactly as before, apply all gates and regression guards,
    // but instead of calling AI, collect valid items into workItems array.
    // ==========================================================================

    type IntroWorkItem = {
      id: string;
      demandKey: string;
      supplyKey: string;
      demandRecord: DemandRecord;
      supplyRecord: SupplyRecord;
      edge: Edge;
      match: typeof matching.demandMatches[0]; // For template fallback path
    };

    const aiWorkItems: IntroWorkItem[] = [];
    const templateItems: IntroWorkItem[] = [];

    console.log('[COMPOSE] Phase 1: Collecting work items...');

    for (const match of matching.demandMatches) {
      if (abortRef.current) break;

      const demandKey = recordKey(match.demand);
      const supplyKey = recordKey(match.supply);

      // Task 3: Skip already-generated intros (dedupe by demandKey + supplyKey)
      if (existingDemandIntros.has(demandKey) && existingSupplyIntros.has(supplyKey)) {
        skipped++;
        progress++;
        continue;
      }

      // GATE 1: Check for detected edge WITH evidence (fail loud on empty)
      const edge = state.detectedEdges.get(demandKey);
      if (!edge) {
        console.error(`[COMPOSE] BLOCKED: ${match.demand.company} — no edge detected`);
        dropped++;
        continue;
      }
      if (!edge.evidence || edge.evidence.trim() === '') {
        console.error(`[COMPOSE] BLOCKED: ${match.demand.company} — edge exists but evidence is empty (type: ${edge.type})`);
        dropped++;
        continue;
      }

      // GATE 2: Check demand email (pre-existing OR enriched)
      const demandEnriched = enrichedDemand.get(demandKey);
      const demandEmail = match.demand.email || (demandEnriched && isSuccessfulEnrichment(demandEnriched) ? demandEnriched.email : null);
      if (!demandEmail) {
        console.log(`[COMPOSE] DROP: ${match.demand.company} - no demand email`);
        dropped++;
        continue;
      }

      // GATE 3: Check supply email — FALLBACK to any supply with email if matched supply has none
      const supplyEnriched = enrichedSupply.get(supplyKey);
      let supplyEmail = match.supply.email || (supplyEnriched && isSuccessfulEnrichment(supplyEnriched) ? supplyEnriched.email : null);
      let effectiveSupply = match.supply;
      let effectiveSupplyEnriched = supplyEnriched;
      let effectiveSupplyKey = supplyKey;

      // If matched supply has no email, find ANY supply with email
      if (!supplyEmail && matching.supplyAggregates) {
        for (const agg of matching.supplyAggregates) {
          const aggKey = recordKey(agg.supply);
          const aggEnriched = enrichedSupply.get(aggKey);
          const aggEmail = agg.supply.email || (aggEnriched && isSuccessfulEnrichment(aggEnriched) ? aggEnriched.email : null);
          if (aggEmail) {
            console.log(`[COMPOSE] FALLBACK: ${match.demand.company} - using ${agg.supply.company} (has email) instead of ${match.supply.company}`);
            supplyEmail = aggEmail;
            effectiveSupply = agg.supply;
            effectiveSupplyEnriched = aggEnriched;
            effectiveSupplyKey = aggKey;
            break;
          }
        }
      }

      if (!supplyEmail) {
        console.log(`[COMPOSE] DROP: ${match.demand.company} - no supply with email found`);
        dropped++;
        continue;
      }

      // Build DemandRecord with FULL metadata (user.txt contract: feed ALL data)
      const demandRaw = match.demand.raw || {};

      // STRIPE-FIX: Use schema-aware needProfile.category for industry
      const demandIndustryRaw = Array.isArray(match.demand.industry)
        ? match.demand.industry[0]
        : match.demand.industry;
      const demandIndustry = match.needProfile?.category || demandIndustryRaw || 'tech';

      const demandRecord: DemandRecord = {
        domain: match.demand.domain,
        company: match.demand.company,
        contact: demandEnriched?.firstName || match.demand.firstName || '',
        email: demandEmail,
        title: demandEnriched?.title || match.demand.title || '',
        industry: demandIndustry,
        signals: [edge.evidence],
        metadata: {
          companyDescription: match.demand.companyDescription || demandRaw.company_description || demandRaw['Service Description'] || demandRaw.description || '',
          description: match.demand.companyDescription || demandRaw.company_description || demandRaw['Service Description'] || demandRaw.description || '',
          fundingDate: demandRaw.last_funding_at || null,
          fundingType: demandRaw.last_funding_type || demandRaw.last_equity_funding_type || null,
          fundingUsd: demandRaw.last_funding_total?.value_usd || demandRaw.last_equity_funding_total?.value_usd || null,
          fundingStage: demandRaw.funding_stage || null,
          numFundingRounds: demandRaw.num_funding_rounds || null,
          employeeEnum: demandRaw.num_employees_enum || null,
          revenueRange: demandRaw.revenue_range || null,
          openRolesCount: demandRaw.open_roles_count || null,
          openRolesDays: demandRaw.days_open || null,
        },
      };

      // Build SupplyRecord with capability data — USE effectiveSupply (may be fallback)
      const supplyRaw = effectiveSupply.raw || {};

      const capabilityFromProfile = match.capabilityProfile?.category;
      const capabilityLabel =
        capabilityFromProfile === 'biotech_contact' ? 'biotech BD partnerships' :
        capabilityFromProfile === 'healthcare_contact' ? 'healthcare partnerships' :
        capabilityFromProfile === 'tech_contact' ? 'technology partnerships' :
        capabilityFromProfile === 'finance_contact' ? 'financial services' :
        capabilityFromProfile === 'recruiting' ? 'talent placement' :
        capabilityFromProfile === 'bd_professional' ? 'business development' :
        capabilityFromProfile === 'executive' ? 'executive network' :
        capabilityFromProfile === 'consulting' ? 'strategic consulting' :
        capabilityFromProfile === 'fractional' ? 'fractional leadership' :
        capabilityFromProfile === 'marketing' ? 'growth marketing' :
        capabilityFromProfile === 'engineering' ? 'software development' :
        null;

      const supplyCapability =
        supplyRaw.capability ||
        supplyRaw.services ||
        capabilityLabel ||
        effectiveSupply.headline ||
        effectiveSupply.signal ||
        effectiveSupply.companyDescription?.slice(0, 100) ||
        'business services';

      const supplyRecord: SupplyRecord = {
        domain: effectiveSupply.domain,
        company: effectiveSupply.company,
        contact: effectiveSupplyEnriched?.firstName || effectiveSupply.firstName || '',
        email: supplyEmail,
        title: effectiveSupplyEnriched?.title || effectiveSupply.title || '',
        capability: supplyCapability,
        targetProfile: supplyRaw.targetProfile || (Array.isArray(effectiveSupply.industry) ? (effectiveSupply.industry as string[])[0] : effectiveSupply.industry) || '',
        metadata: {
          companyDescription: effectiveSupply.companyDescription || supplyRaw.company_description || supplyRaw['Service Description'] || supplyRaw.description || '',
          description: effectiveSupply.companyDescription || supplyRaw.company_description || supplyRaw['Service Description'] || supplyRaw.description || '',
        },
      };

      // ==========================================================================
      // CHECKPOINT 5 (user.txt): Regression Guard — DO NOT SILENTLY LOSE DATA
      // ==========================================================================
      const sourceHadDemandDesc =
        demandRaw.company_description ||
        demandRaw['Service Description'] ||
        demandRaw.description ||
        demandRaw.short_description ||
        match.demand.companyDescription;

      if (sourceHadDemandDesc && !demandRecord.metadata.companyDescription) {
        console.error('[REGRESSION_GUARD] DEMAND DESCRIPTION LOST:', {
          source: sourceHadDemandDesc?.slice(0, 50),
          mappedTo: demandRecord.metadata.companyDescription,
          company: demandRecord.company,
        });
        dropped++;
        continue;
      }

      const sourceHadSupplyDesc =
        supplyRaw.company_description ||
        supplyRaw['Service Description'] ||
        supplyRaw.description ||
        effectiveSupply.companyDescription;

      if (sourceHadSupplyDesc && !supplyRecord.metadata.companyDescription) {
        console.error('[REGRESSION_GUARD] SUPPLY DESCRIPTION LOST:', {
          source: sourceHadSupplyDesc?.slice(0, 50),
          mappedTo: supplyRecord.metadata.companyDescription,
          company: supplyRecord.company,
        });
        dropped++;
        continue;
      }

      // Collect work item — use effectiveSupplyKey so intro is stored under correct supply
      const workItem: IntroWorkItem = {
        id: `${demandKey}:${effectiveSupplyKey}`,
        demandKey,
        supplyKey: effectiveSupplyKey,
        demandRecord,
        supplyRecord,
        edge,
        match,
      };

      // Respect enhanceIntro toggle — AI only when user opts in AND has valid config
      if (introAIConfig && settings.enhanceIntro) {
        aiWorkItems.push(workItem);
      } else {
        templateItems.push(workItem);
      }
    }

    console.log(`[COMPOSE] Phase 1 complete: ${aiWorkItems.length} AI items, ${templateItems.length} template items`);

    // ==========================================================================
    // PHASE 2: PARALLEL AI GENERATION (CONCURRENCY = 5)
    // ==========================================================================

    if (aiWorkItems.length > 0 && introAIConfig) {
      console.log(`[COMPOSE] Phase 2: Parallel AI generation (${aiWorkItems.length} items, concurrency=5)...`);

      // Convert to BatchIntroItem format
      const batchItems: BatchIntroItem[] = aiWorkItems.map(item => ({
        id: item.id,
        demand: item.demandRecord,
        supply: item.supplyRecord,
        edge: item.edge,
      }));

      // Progress callback
      const onProgress = (current: number, totalItems: number) => {
        setState(prev => ({
          ...prev,
          progress: { current: skipped + current, total: total, message: `Writing clean introductions…` },
        }));
      };

      // Call parallel batch function (concurrency = 5)
      const batchResults = await generateIntrosBatchParallel(introAIConfig, batchItems, 5, onProgress);

      // ==========================================================================
      // PHASE 3: APPLY RESULTS (DETERMINISTIC)
      // ==========================================================================

      console.log(`[COMPOSE] Phase 3: Applying ${batchResults.length} AI results...`);

      // Track AI success vs fallback for toast warning
      let aiSuccess = 0;
      let aiFallback = 0;

      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        const workItem = aiWorkItems[i];

        if (result.error) {
          console.log(`[COMPOSE] DROP: ${workItem.demandRecord.company} - Error: ${result.error}`);
          dropped++;
          continue;
        }

        // Track source for fallback rate calculation
        if (result.source === 'ai') {
          aiSuccess++;
        } else if (result.source === 'ai-fallback') {
          aiFallback++;
        }

        // Store intro with source tracking for badges
        demandIntros.set(workItem.demandKey, { text: result.demandIntro, source: result.source });
        supplyIntros.set(workItem.supplyKey, { text: result.supplyIntro, source: result.source });

        console.log(`[COMPOSE] ✓ ${result.source === 'ai' ? 'AI' : 'AI-Fallback'}: ${workItem.demandRecord.company} → ${workItem.supplyRecord.company} (${workItem.edge.type})`);
        composed++;
        progress++;
      }

      // Check fallback rate — only warn when AI was explicitly enabled and attempted
      if (settings.enhanceIntro) {
        const totalAIAttempts = aiSuccess + aiFallback;
        if (totalAIAttempts > 0) {
          const fallbackRate = (aiFallback / totalAIAttempts) * 100;
          console.log(`[COMPOSE] AI fallback rate: ${fallbackRate.toFixed(1)}% (${aiFallback}/${totalAIAttempts})`);
          if (fallbackRate === 100) {
            // AI completely unavailable — clear signal, once per session
            setFallbackWarning('AI unavailable — using templates');
            setTimeout(() => setFallbackWarning(null), 8000);
          } else if (fallbackRate > 20) {
            setFallbackWarning(`${Math.round(fallbackRate)}% of intros used template fallback. Check your API key or try a different provider.`);
            setTimeout(() => setFallbackWarning(null), 8000);
          }
        }
      }
    }

    // ==========================================================================
    // TEMPLATE PATH (no AI configured) — same as before
    // ==========================================================================

    if (templateItems.length > 0) {
      console.log(`[COMPOSE] Processing ${templateItems.length} template items...`);

      for (const item of templateItems) {
        if (abortRef.current) break;

        const counterparty: Counterparty = {
          company: item.supplyRecord.company,
          contact: item.supplyRecord.contact,
          email: item.supplyRecord.email,
          fitReason: `${item.supplyRecord.company} focuses on ${item.supplyRecord.capability}. ${item.demandRecord.company} ${item.edge.evidence}.`,
        };

        const composed_output = composeIntros(item.demandRecord, item.edge, counterparty, item.supplyRecord);

        // Store intro with source tracking for badges
        demandIntros.set(item.demandKey, { text: composed_output.demandBody, source: 'template' });
        supplyIntros.set(item.supplyKey, { text: composed_output.supplyBody, source: 'template' });

        console.log(`[COMPOSE] ✓ Template: ${item.demandRecord.company} → ${item.supplyRecord.company} (${item.edge.type})`);
        composed++;
        progress++;

        setState(prev => ({
          ...prev,
          progress: { current: progress, total, message: `Writing clean introductions…` },
          demandIntros: new Map(demandIntros),
          supplyIntros: new Map(supplyIntros),
        }));
      }
    }

    console.log(`[COMPOSE] Complete:`);
    console.log(`  - Composed: ${composed}`);
    console.log(`  - Skipped (already generated): ${skipped}`);
    console.log(`  - Dropped: ${dropped}`);
    console.log(`  - Demand intros: ${demandIntros.size}`);
    console.log(`  - Supply intros: ${supplyIntros.size}`);

    // INVARIANT C: No data loss on resume
    const resultsDropped = dropped > 0;
    const droppedCounts = resultsDropped ? {
      demand: demandIntros.size,
      supply: supplyIntros.size,
      intros: dropped,
    } : null;

    if (resultsDropped) {
      console.log(`[COMPOSE] INVARIANT C: ${dropped} intros dropped — preserving summary for resume`);
    }

    setState(prev => ({
      ...prev,
      demandIntros,
      supplyIntros,
      resultsDropped,
      droppedCounts,
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

    // Direct open: set data and show immediately
    setExportModalKey(prev => prev + 1);
    setExportReceiptData({ demand: demandReceipt, supply: supplyReceipt });
    setShowExportReceipt(true);
  }, [state.matchingResult, state.enrichedDemand, state.enrichedSupply, state.demandIntros, state.supplyIntros]);

  // =============================================================================
  // INTRO REGENERATION HANDLER
  // =============================================================================

  const regenerateIntros = useCallback(async () => {
    if (!state.matchingResult) {
      console.error('[Flow] Cannot generate intros: no matching result');
      return;
    }

    // Clear existing intros first to force regeneration
    setState(prev => ({
      ...prev,
      step: 'generating',
      demandIntros: new Map(),
      supplyIntros: new Map(),
    }));
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
  // STEP 5: SEND VIA RATE-LIMITED QUEUE
  // =============================================================================
  // CONTRACT (user.txt):
  // - 80 requests / 10 seconds (hard cap)
  // - 480 requests / minute (hard cap)
  // - Max concurrency: 4
  // - 429 → pause queue, retry with backoff, never skip
  // - Target: 1,000 leads ≤ 15 minutes
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
    const { matchingResult, enrichedDemand, enrichedSupply } = state;

    setState(prev => ({ ...prev, step: 'sending' }));

    // GUARD — Matching result required for sending
    if (!guard(matchingResult, BLOCKS.NO_MATCHES, setFlowBlock)) return;

    // Track breakdown (Apple-style: new | existing | needs_attention)
    const breakdown = { new: 0, existing: 0, needsAttention: 0, details: [] as string[] };
    let sentDemand = 0;
    let sentSupply = 0;

    // ==========================================================================
    // PHASE 1: BUILD SEND QUEUE (no API calls)
    // ==========================================================================

    type SendQueueItem = {
      type: 'DEMAND' | 'SUPPLY';
      params: Parameters<typeof sender.sendLead>[1];
      match?: typeof matchingResult.demandMatches[0];
      agg?: typeof matchingResult.supplyAggregates[0];
    };

    const sendQueue: SendQueueItem[] = [];

    // Collect demand sends
    if (senderConfig.demandCampaignId) {
      const demandToSend = matchingResult.demandMatches.filter(m => {
        if (m.demand.email) return true;
        const enriched = enrichedDemand.get(recordKey(m.demand));
        return enriched && isSuccessfulEnrichment(enriched) && enriched.email;
      });

      for (const match of demandToSend) {
        const demandKey = recordKey(match.demand);
        const enriched = enrichedDemand.get(demandKey);
        const email = match.demand.email || enriched?.email;

        const introEntry = state.demandIntros.get(demandKey);
        const intro = introEntry?.text || generateDemandIntro({
          ...match.demand,
          firstName: enriched?.firstName || match.demand.firstName,
          email: email!,
        });

        sendQueue.push({
          type: 'DEMAND',
          params: {
            type: 'DEMAND',
            campaignId: senderConfig.demandCampaignId!,
            email: email!,
            firstName: enriched?.firstName || match.demand.firstName,
            lastName: enriched?.lastName || match.demand.lastName,
            companyName: match.demand.company,
            companyDomain: match.demand.domain,
            introText: intro,
            contactTitle: enriched?.title || match.demand.title,
          },
          match,
        });
      }
    }

    // Collect supply sends
    if (senderConfig.supplyCampaignId) {
      const supplyToSend = matchingResult.supplyAggregates.filter(a => {
        if (a.supply.email) return true;
        const enriched = enrichedSupply.get(recordKey(a.supply));
        return enriched && isSuccessfulEnrichment(enriched) && enriched.email;
      });

      for (const agg of supplyToSend) {
        const supplyKey = recordKey(agg.supply);
        const enriched = enrichedSupply.get(supplyKey);
        const email = agg.supply.email || enriched?.email;

        const introEntry = state.supplyIntros.get(supplyKey);
        const intro = introEntry?.text || generateSupplyIntro(
          {
            ...agg.supply,
            firstName: enriched?.firstName || agg.supply.firstName,
            email: email!,
          },
          agg.bestMatch.demand
        );

        sendQueue.push({
          type: 'SUPPLY',
          params: {
            type: 'SUPPLY',
            campaignId: senderConfig.supplyCampaignId!,
            email: email!,
            firstName: enriched?.firstName || agg.supply.firstName,
            lastName: enriched?.lastName || agg.supply.lastName,
            companyName: agg.supply.company,
            companyDomain: agg.supply.domain,
            introText: intro,
            contactTitle: enriched?.title || agg.supply.title,
          },
          agg,
        });
      }
    }

    console.log(`[Flow] Send queue built: ${sendQueue.length} items (demand + supply)`);

    // ==========================================================================
    // PHASE 2: SEND VIA RATE-LIMITED QUEUE
    // ==========================================================================
    // ALL sends go through provider-specific rate limiter — never fire inline.
    // Instantly: 80/10s burst, 480/min sustained, concurrency=4
    // Plusvibe: 5/sec, concurrency=2
    // 429 handling: pause bucket, retry with backoff, never skip
    // ==========================================================================

    // Get limiter for this provider
    const limiter = getLimiter(senderId);

    // Reset limiter for this batch
    limiter.reset();

    // Set progress callback
    limiter.setProgressCallback((progress: QueueProgress) => {
      setState(prev => ({
        ...prev,
        progress: {
          current: progress.completed,
          total: progress.total,
          message: `Routing ${progress.completed}/${progress.total} (${progress.inFlight} in flight, ${progress.queued} queued)`,
        },
      }));
    });

    // Handle abort
    const originalAbortRef = abortRef.current;
    if (abortRef.current) {
      limiter.abort();
      return;
    }

    // Enqueue all sends and collect results
    const sendPromises = sendQueue.map(async (item) => {
      // Check abort before each send
      if (abortRef.current) {
        return { item, result: { success: false, status: 'needs_attention' as const, detail: 'Aborted' } };
      }

      try {
        // ALL sends MUST go through the provider's rate limiter
        const result = await limiter.enqueue(senderConfig, item.params);
        return { item, result };
      } catch (err) {
        return {
          item,
          result: {
            success: false,
            status: 'needs_attention' as const,
            detail: err instanceof Error ? err.message : 'Connection issue',
          },
        };
      }
    });

    // Wait for all sends to complete
    const results = await Promise.all(sendPromises);

    // ==========================================================================
    // PHASE 3: PROCESS RESULTS (deterministic)
    // ==========================================================================

    for (const { item, result } of results) {
      // Track breakdown by status
      if (result.status === 'new') {
        breakdown.new++;
        if (item.type === 'DEMAND') sentDemand++;
        else sentSupply++;
      } else if (result.status === 'existing') {
        breakdown.existing++;
        // NOT counted toward sentDemand/sentSupply — these were skipped by Instantly
      } else if (result.status === 'needs_attention') {
        breakdown.needsAttention++;
        if (result.detail) {
          breakdown.details.push(`${item.params.companyName}: ${result.detail}`);
        }
      }

      // Fire-and-forget: Log match event for behavioral learning (Option B)
      if (result.success && user?.id) {
        if (item.type === 'DEMAND' && item.match) {
          const match = item.match;
          if (match.tier && match.needProfile && match.capabilityProfile) {
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
            }).catch(() => {});
          }
        } else if (item.type === 'SUPPLY' && item.agg) {
          const bestMatch = item.agg.bestMatch;
          if (bestMatch.tier && bestMatch.needProfile && bestMatch.capabilityProfile) {
            logMatchSent({
              operatorId: user.id,
              demandDomain: bestMatch.demand.domain,
              supplyDomain: item.agg.supply.domain,
              demandCompany: bestMatch.demand.company,
              supplyCompany: item.agg.supply.company,
              score: bestMatch.score,
              tier: bestMatch.tier,
              tierReason: bestMatch.tierReason || '',
              needProfile: bestMatch.needProfile,
              capabilityProfile: bestMatch.capabilityProfile,
              scoreBreakdown: bestMatch.scoreBreakdown,
              campaignId: senderConfig.supplyCampaignId!,
            }).catch(() => {});
          }
        }
      }
    }

    // Clean up limiter
    limiter.setProgressCallback(null);

    // Complete — with breakdown
    setState(prev => ({
      ...prev,
      step: 'complete',
      sentDemand,
      sentSupply,
      sendBreakdown: breakdown,
    }));
  }, [state, settings]);

  // =============================================================================
  // HELPERS
  // =============================================================================

  // CSV-ONLY: fetchApifyDataset removed (architectural decision locked)

  const reset = () => {
    abortRef.current = true;
    setState({
      step: 'upload',
      dataPreview: null,
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
      sendBreakdown: { new: 0, existing: 0, needsAttention: 0, details: [] },
      error: null,
      flowBlock: null,
      auditData: null,
      resultsDropped: false,
      droppedCounts: null,
      copyValidationFailures: [],
    });
  };

  // =============================================================================
  // HELPERS (stable across renders)
  // =============================================================================

  // DOCTRINE: Stable React key — use recordKey from normalization
  // recordKey is stable, non-null, never domain-based (set in normalize())
  const getDemandReactKey = (demand: NormalizedRecord): string => {
    return demand.recordKey || `fallback:${demand.company}:${demand.fullName}`;
  };

  // =============================================================================
  // RENDER
  // =============================================================================

  // Task 5C: Reset flow data handler
  const handleResetFlowData = useCallback(async () => {
    // Clear IndexedDB flow data
    if (flowIdRef.current) {
      try {
        const flows = await listFlowsAsync();
        for (const entry of flows) {
          // Mark as complete to clear from "running" list
          const flow = await loadFlowAsync(entry.flowId);
          if (flow) {
            flow.stages.matching.status = 'complete';
            persistFlow(flow);
          }
        }
      } catch (e) {
        console.error('[Flow] Error clearing flow data:', e);
      }
    }
    flowIdRef.current = null;
    localStorage.removeItem('flow:index');
    setRestoreMessage(null);
    setState({
      step: 'upload',
      dataPreview: null,
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
      sendBreakdown: { new: 0, existing: 0, needsAttention: 0, details: [] },
      error: null,
      flowBlock: null,
      auditData: null,
      resultsDropped: false,
      droppedCounts: null,
      copyValidationFailures: [],
    });
    console.log('[Flow] Reset flow data complete');
  }, []);

  return (
    <div className="min-h-screen bg-[#000000] text-white flex flex-col relative">
      {/* Restore message — Apple-style toast (portal-style, doesn't affect layout) */}
      <AnimatePresence>
        {restoreMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-6 left-0 right-0 z-50 flex justify-center pointer-events-none"
          >
            <div className="pointer-events-auto px-5 py-3 rounded-2xl bg-[#1c1c1e]/90 backdrop-blur-xl border border-white/[0.06]">
              <div className="flex items-center gap-3">
                <CheckCircle2 size={16} className="text-white/50 flex-shrink-0" />
                <p className="text-[13px] text-white/70 tracking-[-0.01em]">
                  {restoreMessage}
                </p>
                <button
                  onClick={() => setRestoreMessage(null)}
                  className="p-1.5 hover:bg-white/[0.08] rounded-lg transition-all duration-200 flex-shrink-0 ml-2"
                >
                  <X size={12} className="text-white/30" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Fallback warning toast — amber for warning */}
      <AnimatePresence>
        {fallbackWarning && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-6 left-0 right-0 z-50 flex justify-center pointer-events-none"
          >
            <div className="pointer-events-auto px-5 py-3 rounded-2xl bg-amber-950/90 backdrop-blur-xl border border-amber-500/20">
              <div className="flex items-center gap-3">
                <AlertCircle size={16} className="text-amber-400/80 flex-shrink-0" />
                <p className="text-[13px] text-amber-200/80 tracking-[-0.01em]">
                  {fallbackWarning}
                </p>
                <button
                  onClick={() => setFallbackWarning(null)}
                  className="p-1.5 hover:bg-amber-500/10 rounded-lg transition-all duration-200 flex-shrink-0 ml-2"
                >
                  <X size={12} className="text-amber-400/50" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header — fixed height, consistent layout */}
      <div className="h-16 px-8 flex items-center justify-between flex-shrink-0">
        {/* Left: Back button */}
        <button
          onClick={() => navigate('/launcher')}
          className={BTN.icon}
        >
          <ArrowLeft size={18} className="text-white/50" />
        </button>

        {/* Center: Processing indicator (absolute to not affect siblings) */}
        {hasActiveFlow && ['enriching', 'generating', 'sending'].includes(state.step) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-pulse" />
            <span className="text-[11px] text-white/40 tracking-wide whitespace-nowrap">
              Processing — keep this tab open
            </span>
          </motion.div>
        )}

        {/* Right: Start over (always reserve space) */}
        <div className="w-16 flex justify-end">
          {(state.step !== 'upload' || restoreMessage) && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={handleResetFlowData}
              className="text-[11px] text-white/25 hover:text-white/50 transition-all duration-300 tracking-wide whitespace-nowrap"
            >
              Start over
            </motion.button>
          )}
        </div>
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

              {/* FlowBlock Banner — Apple iOS style */}
              {state.flowBlock && (
                <div ref={errorRef} className="mb-8 max-w-sm mx-auto">
                  <div className="p-5 rounded-2xl bg-white/[0.03] backdrop-blur-sm">
                    <div className="text-center">
                      {/* Icon */}
                      <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-white/[0.06] flex items-center justify-center">
                        <Settings className="w-5 h-5 text-white/40" />
                      </div>

                      {/* Title */}
                      <p className="text-[14px] font-medium text-white/90 mb-1">
                        {state.flowBlock.title}
                      </p>

                      {/* Detail */}
                      <p className="text-[13px] text-white/50 mb-4">
                        {state.flowBlock.detail}
                      </p>

                      {/* Single CTA */}
                      <button
                        onClick={() => {
                          navigate('/settings');
                          setFlowBlock(null);
                        }}
                        className="w-full py-2.5 text-[13px] font-medium rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-white/80 hover:text-white transition-all duration-200"
                      >
                        {state.flowBlock.next_step}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Legacy Error Banner - Premium AlertPanel with Explainability */}
              {state.error && !state.flowBlock && (() => {
                // Normalize error to string (defensive against objects leaking in)
                const errorStr = safeRender(state.error);

                // Convert error string to UXBlock for rich explanation (CSV-ONLY)
                const errorBlock: UXBlock = errorStr.includes('No demand CSV')
                  ? { type: 'DATASET_INVALID', side: 'demand', message: 'No demand CSV uploaded' }
                  : errorStr.includes('Missing dataset') || errorStr.includes('No CSV')
                  ? { type: 'DATASET_INVALID', side: 'demand', message: errorStr }
                  : errorStr.includes('No supply')
                  ? { type: 'DATASET_INVALID', side: 'supply', message: 'No supply CSV uploaded' }
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
                            `Flow Error: ${errorStr}\n\nCSV: ${getCsvData('demand') ? 'loaded' : 'not set'}`
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
                          <p>demandCSV: {getCsvData('demand') ? '✓ loaded' : '✗ not set'}</p>
                          <p>supplyCSV: {getCsvData('supply') ? '✓ loaded' : '✗ not set'}</p>
                          <p>aiConfig: {settings.aiConfig?.provider || 'none'}</p>
                        </div>
                      </details>
                    )}
                  </div>
                );
              })()}

              {/* PRE-FLIGHT GATE: Check requirements BEFORE matching (CSV-ONLY) */}
              {(() => {
                const hasDataset = !!getCsvData('demand');
                const hasEnrichmentKeys = !!(
                  settings?.apolloApiKey ||
                  settings?.anymailApiKey ||
                  settings?.connectorAgentApiKey
                );
                const hasAIKey = !!(settings?.aiConfig?.apiKey);
                const canStartMatching = hasDataset && hasEnrichmentKeys && hasAIKey;

                return (
                  <>
                    {/* Warning: No AI configured — Apple iOS style */}
                    {hasDataset && hasEnrichmentKeys && !hasAIKey && (
                      <div className="mb-6 max-w-sm mx-auto">
                        <div className="p-5 rounded-2xl bg-white/[0.03] backdrop-blur-sm">
                          <div className="text-center">
                            <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-white/[0.06] flex items-center justify-center">
                              <Sparkles className="w-5 h-5 text-white/40" />
                            </div>
                            <p className="text-[14px] font-medium text-white/90 mb-1">
                              Add AI for matching
                            </p>
                            <p className="text-[13px] text-white/50 mb-4">
                              Matching requires AI to understand signals and find the right fits.
                            </p>
                            <button
                              onClick={() => navigate('/settings')}
                              className="w-full py-2.5 text-[13px] font-medium rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-white/80 hover:text-white transition-all duration-200"
                            >
                              Open Settings
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Warning: No enrichment providers — Apple iOS style */}
                    {hasDataset && !hasEnrichmentKeys && (
                      <div className="mb-6 max-w-sm mx-auto">
                        <div className="p-5 rounded-2xl bg-white/[0.03] backdrop-blur-sm">
                          <div className="text-center">
                            <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-white/[0.06] flex items-center justify-center">
                              <Settings className="w-5 h-5 text-white/40" />
                            </div>
                            <p className="text-[14px] font-medium text-white/90 mb-1">
                              Add an email finder
                            </p>
                            <p className="text-[13px] text-white/50 mb-4">
                              Connect Apollo or Anymail to find decision-maker emails.
                            </p>
                            <button
                              onClick={() => navigate('/settings')}
                              className="w-full py-2.5 text-[13px] font-medium rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-white/80 hover:text-white transition-all duration-200"
                            >
                              Open Settings
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Begin Matching button - only show if can proceed OR has dataset but missing keys */}
                    {(canStartMatching || !hasDataset) && (
                      <button
                        onClick={startFlow}
                        disabled={!canStartMatching}
                        className={`${BTN.primary} ${!canStartMatching ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {state.error ? 'Retry' : 'Begin Matching'}
                      </button>
                    )}

                    {/* Hint when no CSV */}
                    {!hasDataset && (
                      <p className="text-[11px] text-white/30 mt-3 text-center">
                        Upload a CSV in Settings to begin
                      </p>
                    )}
                  </>
                );
              })()}

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
              <p className="text-[13px] text-white/40 mb-4">{safeRender(state.progress.message)}</p>
              {state.progress.total > 0 && (
                <div className="max-w-xs mx-auto">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <span className="text-[13px] text-white/60 font-medium">
                      {state.progress.current} <span className="text-white/30">of {state.progress.total}</span>
                    </span>
                  </div>
                  <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-white/40 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${(state.progress.current / Math.max(state.progress.total, 1)) * 100}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* PREVIEW — Data Summary before matching (Stripe-style transparency) */}
          {state.step === 'preview' && state.dataPreview && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="w-full max-w-lg mx-auto"
            >
              {/* Header */}
              <div className="text-center mb-8">
                <h2 className="text-[18px] font-medium text-white/90 mb-2">Review your data</h2>
                <p className="text-[13px] text-white/40">Here's what the system detected</p>
              </div>

              {/* Data Summary Card */}
              <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                {/* Two columns */}
                <div className="grid grid-cols-2 gap-8">
                  {/* DEMAND — What companies need */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[11px] font-medium text-white/40 uppercase tracking-wide">Demand</span>
                      <span className="text-[11px] text-white/30">{state.dataPreview.demandTotal} records</span>
                    </div>
                    <div className="space-y-2">
                      {state.dataPreview.demandBreakdown.map((item, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-[13px] text-white/70">{item.category}</span>
                          <span className="text-[13px] text-white/40 tabular-nums">{item.percentage}%</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* SUPPLY — Who can solve it */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[11px] font-medium text-white/40 uppercase tracking-wide">Supply</span>
                      <span className="text-[11px] text-white/30">{state.dataPreview.supplyTotal} records</span>
                    </div>
                    <div className="space-y-2">
                      {state.dataPreview.supplyBreakdown.map((item, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-[13px] text-white/70">{item.category}</span>
                          <span className="text-[13px] text-white/40 tabular-nums">{item.percentage}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Detected Match Type */}
                <div className="mt-6 pt-6 border-t border-white/[0.06]">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-white/40 uppercase tracking-wide">Match</span>
                    <span className="text-[13px] text-white/70">{state.dataPreview.detectedMatchType}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 flex gap-3">
                <button
                  onClick={cancelPreview}
                  className="flex-1 h-11 rounded-xl bg-white/[0.04] hover:bg-white/[0.06] text-white/60 text-[13px] font-medium transition-all"
                >
                  Wrong data
                </button>
                <button
                  onClick={continueFromPreview}
                  className="flex-1 h-11 rounded-xl bg-white text-black text-[13px] font-medium hover:bg-white/90 transition-all"
                >
                  Looks right
                </button>
              </div>

              {/* Subtitle */}
              <p className="text-center text-[11px] text-white/30 mt-4">
                You can always change your data in Settings
              </p>
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

                // DOCTRINE: Tier counts — NEVER compress into single number
                const strongCount = matches.filter(m => m.tier === 'strong').length;
                const goodCount = matches.filter(m => m.tier === 'good').length;
                const exploratoryCount = matches.filter(m => m.tier === 'open').length;

                // DOCTRINE: 4 separate counters — Matching ≠ Quality ≠ Sendability
                // Demand emails: raw + enriched
                const demandRawEmails = matches.filter(m => m.demand.email).length;
                const demandEnrichedEmails = matches.filter(m => {
                  if (m.demand.email) return false;
                  const e = state.enrichedDemand.get(recordKey(m.demand));
                  return e?.email;
                }).length;
                // Supply emails: raw + enriched
                const supplyRawEmails = matches.filter(m => m.supply.email).length;
                const supplyEnrichedEmails = matches.filter(m => {
                  if (m.supply.email) return false;
                  const e = state.enrichedSupply.get(recordKey(m.supply));
                  return e?.email;
                }).length;
                // Total emails detected (both sides)
                const emailCount = demandRawEmails + demandEnrichedEmails + supplyRawEmails + supplyEnrichedEmails;
                // Ready to send: only VERIFIED emails (must pass through enrichment)
                const readyToSendCount = matches.filter(m => {
                  const e = state.enrichedDemand.get(recordKey(m.demand));
                  return e?.email && e?.verified;
                }).length;

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
                  // Line 2: Signal — use signalMeta.label (truth from normalization, no prefixes)
                  const signal = match.demand.signalMeta?.label || 'Active signal';
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
                            : 'bg-white/[0.02] border border-white/[0.06]'
                          }`}
                        whileHover={{ y: -2 }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-[11px] text-white/50 font-medium tracking-wide">DEMAND</p>
                          {!demandRoutable && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40">
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
                            : 'bg-white/[0.02] border border-white/[0.06]'
                          }`}
                        whileHover={{ y: -2 }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-[11px] text-white/50 font-medium tracking-wide">SUPPLY</p>
                          {!supplyRoutable && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40">
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
                    {/* HEADING + STATS — Apple iOS Style */}
                    {/* ============================================= */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="text-center mb-8"
                    >
                      {/* Hero number — Apple style */}
                      <div className="mb-6">
                        <p className="text-[56px] font-light text-white tracking-tight leading-none">
                          {edgeCount}
                        </p>
                        <p className="text-[13px] text-white/40 mt-1">
                          {edgeCount === 1 ? 'match' : 'matches'}
                        </p>
                      </div>

                      {/* Tier breakdown — monochrome, no rainbow */}
                      {edgeCount > 0 && (
                        <p className="text-[12px] text-white/50 mb-6">
                          {strongCount > 0 && <><span className="text-white/70 font-medium">{strongCount}</span> strong</>}
                          {strongCount > 0 && goodCount > 0 && <span className="text-white/30 mx-1.5">·</span>}
                          {goodCount > 0 && <><span className="text-white/70 font-medium">{goodCount}</span> good</>}
                          {(strongCount > 0 || goodCount > 0) && exploratoryCount > 0 && <span className="text-white/30 mx-1.5">·</span>}
                          {exploratoryCount > 0 && <><span className="text-white/70 font-medium">{exploratoryCount}</span> exploratory</>}
                        </p>
                      )}

                      {/* Stats row — clean, integrated */}
                      <div className="inline-flex items-center gap-6 px-5 py-2.5 rounded-full bg-white/[0.03]">
                        <div className="text-center">
                          <p className="text-[15px] font-medium text-white/80">{emailCount}</p>
                          <p className="text-[10px] text-white/40">emails</p>
                        </div>
                        <div className="w-px h-6 bg-white/[0.08]" />
                        <div className="text-center">
                          <p className="text-[15px] font-medium text-white/80">{readyToSendCount}</p>
                          <p className="text-[10px] text-white/40">ready</p>
                        </div>
                      </div>

                      {/* Supply filter REMOVED — was showing misleading "0 of X match" when real matcher found matches.
                          The keyword-based filter assumed demand.signal = title, which is false for biotech licensing,
                          partnerships, BD, strategy use cases. A system that emits confident wrong information is worse
                          than no information. Real matching uses AI extraction. */}

                      {/* iOS Segmented Control */}
                      {edgeCount > 0 && (
                        <div className="mt-6 inline-flex p-1 rounded-xl bg-white/[0.04]">
                          <button
                            onClick={() => setMatchViewMode('demand')}
                            className={`px-4 py-1.5 text-[11px] font-medium rounded-lg transition-all duration-200 ${
                              matchViewMode === 'demand'
                                ? 'bg-white/[0.12] text-white shadow-sm'
                                : 'text-white/40 hover:text-white/60'
                            }`}
                          >
                            Companies
                          </button>
                          <button
                            onClick={() => setMatchViewMode('supply')}
                            className={`px-4 py-1.5 text-[11px] font-medium rounded-lg transition-all duration-200 ${
                              matchViewMode === 'supply'
                                ? 'bg-white/[0.12] text-white shadow-sm'
                                : 'text-white/40 hover:text-white/60'
                            }`}
                          >
                            People
                          </button>
                        </div>
                      )}
                    </motion.div>

                    {/* ============================================= */}
                    {/* VIEW TOGGLE CONTENT */}
                    {/* ============================================= */}

                    {matchViewMode === 'demand' ? (
                      <>
                    {/* ============================================= */}
                    {/* COLUMN HEADERS — Clean, no jargon */}
                    {/* ============================================= */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.15 }}
                      className="grid grid-cols-[1fr_40px_1fr] gap-0 mb-4"
                    >
                      <div className="border-b border-white/[0.08] pb-2">
                        <span className="text-[10px] font-medium text-white/40 tracking-wide uppercase">
                          Company
                        </span>
                      </div>
                      <div /> {/* Spacer for connector */}
                      <div className="border-b border-white/[0.08] pb-2 text-right">
                        <span className="text-[10px] font-medium text-white/40 tracking-wide uppercase">
                          Match
                        </span>
                      </div>
                    </motion.div>

                    {/* ============================================= */}
                    {/* MATCH CARDS — 3-line signature, equal columns */}
                    {/* ============================================= */}
                    <div className="space-y-2">
                      {previewMatches.map((match, i) => {
                        const edge = state.detectedEdges.get(recordKey(match.demand));
                        const demandSig = getDemandSignature(match, edge);
                        const supplySig = getSupplySignature(match, i);
                        const isLast = i === previewMatches.length - 1;

                        return (
                          <motion.div
                            key={getDemandReactKey(match.demand)}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.15 + (i * 0.02), duration: 0.25 }}
                          >
                            {/* SINGLE CARD — Clean, no jargon */}
                            <div className="p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.03] transition-all duration-200">
                              {/* Row 1: Company → Person with tier badge */}
                              <div className="flex items-center gap-3">
                                {/* Tier indicator */}
                                <span className="text-[12px]">
                                  {match.tier === 'strong' ? '🟣' : match.tier === 'good' ? '🔵' : '⚪'}
                                </span>

                                {/* Company side */}
                                <div className="flex-1 min-w-0">
                                  <p className="text-[14px] font-medium text-white/90 truncate">
                                    {demandSig.company}
                                  </p>
                                  <p className="text-[11px] text-white/40 truncate">
                                    {demandSig.signal}
                                  </p>
                                </div>

                                {/* Arrow */}
                                <span className="text-white/20 text-[12px]">→</span>

                                {/* Person side */}
                                <div className="flex-1 min-w-0 text-right">
                                  <p className="text-[14px] font-medium text-white/70 truncate">
                                    {supplySig.entity}
                                  </p>
                                  {supplySig.capability && (
                                    <p className="text-[11px] text-white/40 truncate">
                                      {supplySig.capability}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Row 2: Match reason (if exists) */}
                              {match.tierReason && (
                                <p className="text-[11px] text-white/30 mt-2 pl-7">
                                  {match.tierReason}
                                </p>
                              )}
                            </div>

                            {/* +X MORE */}
                            {isLast && moreCount > 0 && (
                              <p className="text-center text-[11px] text-white/30 mt-3">
                                +{moreCount} more
                              </p>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                      </>
                    ) : (
                      /* ============================================= */
                      /* SUPPLY LEVERAGE VIEW — Apple Responsive Grid */
                      /* ============================================= */
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.1 }}
                      >
                        {/* People Cards — Responsive Grid, sorted by count */}
                        {(() => {
                          const supplyAggregates = state.matchingResult?.supplyAggregates || [];
                          const leveragedSupplies = supplyAggregates
                            .filter(agg => agg.matches.length > 1)
                            .sort((a, b) => b.matches.length - a.matches.length)
                            .slice(0, 10);

                          if (leveragedSupplies.length === 0) {
                            return (
                              <div className="text-center py-12">
                                <p className="text-[13px] text-white/40">No one matches multiple companies yet</p>
                              </div>
                            );
                          }

                          return (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {leveragedSupplies.map((agg, i) => (
                                <motion.div
                                  key={recordKey(agg.supply)}
                                  initial={{ opacity: 0, y: 8 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: 0.04 * i }}
                                  className="p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-200"
                                >
                                  {/* Supply Header */}
                                  <div className="flex items-start justify-between gap-3 mb-3">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[14px] font-medium text-white/90 truncate">
                                        {agg.supply.fullName || agg.supply.company}
                                      </p>
                                      {agg.supply.title && (
                                        <p className="text-[11px] text-white/40 truncate">
                                          {agg.supply.title}
                                        </p>
                                      )}
                                    </div>
                                    <span className="flex-shrink-0 w-9 h-9 rounded-full bg-white/[0.06] text-white/70 text-[13px] font-medium flex items-center justify-center">
                                      {agg.matches.length}
                                    </span>
                                  </div>

                                  {/* Matching Demands — Inline chips */}
                                  <div className="flex flex-wrap gap-1.5">
                                    {agg.matches.slice(0, 3).map((match, j) => (
                                      <span
                                        key={recordKey(match.demand)}
                                        className="px-2 py-0.5 rounded-md bg-white/[0.04] text-[11px] text-white/50 truncate max-w-[120px]"
                                      >
                                        {match.demand.company}
                                      </span>
                                    ))}
                                    {agg.matches.length > 3 && (
                                      <span className="px-2 py-0.5 text-[11px] text-white/30">
                                        +{agg.matches.length - 3}
                                      </span>
                                    )}
                                  </div>
                                </motion.div>
                              ))}
                            </div>
                          );
                        })()}
                      </motion.div>
                    )}

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
                          {/* PHILEMON: Block message when dataset is incomplete — Apple iOS style */}
                          {!canEnrich && blockReason && (
                            <div className="mb-6 max-w-xs mx-auto">
                              <div className="p-4 rounded-2xl bg-white/[0.03] backdrop-blur-sm">
                                <p className="text-[13px] text-white/70 font-medium mb-1">
                                  Dataset incomplete
                                </p>
                                <p className="text-[12px] text-white/40">
                                  {blockReason}
                                </p>
                              </div>
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
                CSV loaded
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
                className={BTN.primary}
              >
                Find contacts anyway
              </button>

              {/* SECONDARY — Try different CSV */}
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
                className={`mt-4 ${BTN.secondary}`}
              >
                Or try different CSV
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
                  // Check pre-existing email in normalized record first
                  if (m.demand.email) return true;
                  // Then check enriched map
                  const e = state.enrichedDemand.get(recordKey(m.demand));
                  return e && isSuccessfulEnrichment(e) && e.email;
                }).length;
                const supplyEnriched = supplyAggregates.filter(a => {
                  // Check pre-existing email in normalized record first (Leads Finder)
                  if (a.supply.email) return true;
                  // Then check enriched map
                  const e = state.enrichedSupply.get(recordKey(a.supply));
                  return e && isSuccessfulEnrichment(e) && e.email;
                }).length;
                const totalEnriched = demandEnriched + supplyEnriched;
                const enrichmentFailed = matchCount > 0 && totalEnriched === 0;
                const enrichmentPartial = matchCount > 0 && totalEnriched > 0 && totalEnriched < matchCount;

                // INTRO PAIR COUNT — Task 6: Gate-aligned count using same 3 gates as runIntroGeneration
                // This is what the generator loops through, so this is the honest count
                const introPairCount = demandMatches.filter(m => {
                  const demandKey = recordKey(m.demand);
                  const supplyKey = recordKey(m.supply);

                  // Gate 1: Edge evidence non-empty
                  const edge = state.detectedEdges.get(demandKey);
                  if (!edge || !edge.evidence || edge.evidence.trim() === '') return false;

                  // Gate 2: Demand has email (pre-existing OR enriched success)
                  const demandHasEmail = m.demand.email || (() => {
                    const e = state.enrichedDemand.get(demandKey);
                    return e && isSuccessfulEnrichment(e) && e.email;
                  })();
                  if (!demandHasEmail) return false;

                  // Gate 3: Supply has email (pre-existing OR enriched success) — OR FALLBACK
                  const supplyHasEmail = m.supply.email || (() => {
                    const e = state.enrichedSupply.get(supplyKey);
                    return e && isSuccessfulEnrichment(e) && e.email;
                  })();
                  if (supplyHasEmail) return true;

                  // FALLBACK: If matched supply has no email, check if ANY supply has email
                  const anySupplyHasEmail = state.matchingResult?.supplyAggregates?.some(agg => {
                    const aggKey = recordKey(agg.supply);
                    const aggEnriched = state.enrichedSupply.get(aggKey);
                    return agg.supply.email || (aggEnriched && isSuccessfulEnrichment(aggEnriched) && aggEnriched.email);
                  }) ?? false;
                  return anySupplyHasEmail;
                }).length;

                // Unique supply contacts (secondary stat)
                const uniqueSupplyWithEmail = supplyEnriched;

                // =============================================================
                // EMAIL AVAILABILITY STATE (per directive)
                // INVARIANT: If at least ONE email exists, CSV export MUST be available.
                // Intro feasibility must NEVER gate email export.
                // =============================================================
                const demandEmailState: 'ALL' | 'PARTIAL' | 'NONE' =
                  demandEnriched === 0 ? 'NONE' :
                  demandEnriched === demandMatches.length ? 'ALL' : 'PARTIAL';
                const demandWithoutEmail = demandMatches.length - demandEnriched;

                // Matches WITH email (for CSV export) — check pre-existing OR enriched
                const demandWithEmail = demandMatches.filter(m => {
                  if (m.demand.email) return true;
                  const e = state.enrichedDemand.get(recordKey(m.demand));
                  return e && isSuccessfulEnrichment(e) && e.email;
                });

                // Matches WITHOUT email (for LinkedIn export)
                const demandWithoutEmailList = demandMatches.filter(m => {
                  if (m.demand.email) return false; // Has pre-existing email
                  const e = state.enrichedDemand.get(recordKey(m.demand));
                  return !e || !isSuccessfulEnrichment(e) || !e.email;
                });

                // =============================================================
                // ENRICHMENT STATUS HELPER — Maps outcome to specific labels
                // STRIPE PATTERN: Specific errors, not generic buckets
                // =============================================================
                type EnrichmentStatusInfo = {
                  label: string;
                  color: string;
                  icon: React.ReactNode;
                  action?: string;
                  actionLink?: string;
                  outcome: EnrichmentOutcome | 'NOT_SEARCHED';
                };

                const getEnrichmentStatusLabel = (result: EnrichmentResult | undefined): EnrichmentStatusInfo => {
                  if (!result) {
                    return {
                      label: 'Not searched',
                      color: 'text-white/30',
                      icon: <Search className="w-3.5 h-3.5" />,
                      outcome: 'NOT_SEARCHED',
                    };
                  }

                  switch (result.outcome) {
                    case 'ENRICHED':
                      return {
                        label: 'Email found',
                        color: 'text-emerald-400/80',
                        icon: <CheckCircle2 className="w-3.5 h-3.5" />,
                        outcome: 'ENRICHED',
                      };
                    case 'VERIFIED':
                      return {
                        label: 'Email verified',
                        color: 'text-emerald-400/80',
                        icon: <CheckCircle2 className="w-3.5 h-3.5" />,
                        outcome: 'VERIFIED',
                      };
                    case 'AUTH_ERROR':
                      return {
                        label: 'API key invalid',
                        color: 'text-red-400/80',
                        icon: <Key className="w-3.5 h-3.5" />,
                        action: 'Check API key in Settings',
                        actionLink: '/settings',
                        outcome: 'AUTH_ERROR',
                      };
                    case 'CREDITS_EXHAUSTED':
                      return {
                        label: 'Credits exhausted',
                        color: 'text-amber-400/80',
                        icon: <CreditCard className="w-3.5 h-3.5" />,
                        action: 'Check provider account',
                        outcome: 'CREDITS_EXHAUSTED',
                      };
                    case 'RATE_LIMITED':
                      return {
                        label: 'Rate limited',
                        color: 'text-amber-400/80',
                        icon: <Clock className="w-3.5 h-3.5" />,
                        action: 'Wait and retry',
                        outcome: 'RATE_LIMITED',
                      };
                    case 'NO_CANDIDATES':
                      return {
                        label: 'No contact found',
                        color: 'text-white/40',
                        icon: <User className="w-3.5 h-3.5" />,
                        action: 'Try adding backup provider',
                        actionLink: '/settings',
                        outcome: 'NO_CANDIDATES',
                      };
                    case 'NOT_FOUND':
                      return {
                        label: 'Not in database',
                        color: 'text-white/40',
                        icon: <Building2 className="w-3.5 h-3.5" />,
                        outcome: 'NOT_FOUND',
                      };
                    case 'NO_PROVIDERS':
                      return {
                        label: 'No providers configured',
                        color: 'text-amber-400/80',
                        icon: <Settings className="w-3.5 h-3.5" />,
                        action: 'Connect Apollo or Anymail',
                        actionLink: '/settings',
                        outcome: 'NO_PROVIDERS',
                      };
                    case 'MISSING_INPUT':
                      return {
                        label: 'Missing company data',
                        color: 'text-white/40',
                        icon: <AlertCircle className="w-3.5 h-3.5" />,
                        outcome: 'MISSING_INPUT',
                      };
                    case 'INVALID':
                      return {
                        label: 'Email invalid',
                        color: 'text-white/40',
                        icon: <AlertCircle className="w-3.5 h-3.5" />,
                        outcome: 'INVALID',
                      };
                    case 'ERROR':
                    default:
                      return {
                        label: 'Provider error',
                        color: 'text-red-400/70',
                        icon: <AlertCircle className="w-3.5 h-3.5" />,
                        action: 'Check provider status',
                        outcome: 'ERROR',
                      };
                  }
                };

                // Build per-company status list with full outcome data
                const enrichmentStatusList = demandMatches.map(m => {
                  const result = state.enrichedDemand.get(recordKey(m.demand));
                  const status = getEnrichmentStatusLabel(result);
                  return {
                    company: m.demand.company,
                    domain: m.demand.domain,
                    ...status,
                  };
                });

                // Count by ACTUAL outcome — no compression
                const outcomeCounts = enrichmentStatusList.reduce((acc, s) => {
                  acc[s.outcome] = (acc[s.outcome] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>);

                // For backward compat with existing UI checks
                const statusCounts = {
                  found: (outcomeCounts['ENRICHED'] || 0) + (outcomeCounts['VERIFIED'] || 0),
                  notFound: (outcomeCounts['NO_CANDIDATES'] || 0) + (outcomeCounts['NOT_FOUND'] || 0),
                  authError: outcomeCounts['AUTH_ERROR'] || 0,
                  creditsExhausted: outcomeCounts['CREDITS_EXHAUSTED'] || 0,
                  rateLimited: outcomeCounts['RATE_LIMITED'] || 0,
                  noProviders: outcomeCounts['NO_PROVIDERS'] || 0,
                  error: outcomeCounts['ERROR'] || 0,
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

                    {/* Enrichment Status Summary — STRIPE PATTERN: specific outcomes */}
                    {(enrichmentFailed || enrichmentPartial) && (
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="mb-6 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] max-w-sm"
                      >
                        <p className="text-[10px] text-white/30 uppercase tracking-wider mb-3 text-center">Enrichment results</p>
                        <div className="space-y-2">
                          {/* Success */}
                          {statusCounts.found > 0 && (
                            <div className="flex items-center gap-2 text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/80" />
                              <span className="text-emerald-400/80">{statusCounts.found} emails found</span>
                            </div>
                          )}
                          {/* Not found (normal) */}
                          {statusCounts.notFound > 0 && (
                            <div className="flex items-center gap-2 text-[11px]">
                              <User className="w-3.5 h-3.5 text-white/40" />
                              <span className="text-white/40">{statusCounts.notFound} no public email</span>
                            </div>
                          )}
                          {/* Auth Error — actionable */}
                          {statusCounts.authError > 0 && (
                            <div className="flex items-center justify-between text-[11px]">
                              <div className="flex items-center gap-2">
                                <Key className="w-3.5 h-3.5 text-red-400/80" />
                                <span className="text-red-400/70">{statusCounts.authError} API key needs attention</span>
                              </div>
                              <button
                                onClick={() => navigate('/settings')}
                                className="text-[10px] text-white/50 hover:text-white/80 underline underline-offset-2"
                              >
                                Fix in Settings
                              </button>
                            </div>
                          )}
                          {/* Credits Exhausted — actionable */}
                          {statusCounts.creditsExhausted > 0 && (
                            <div className="flex items-center justify-between text-[11px]">
                              <div className="flex items-center gap-2">
                                <CreditCard className="w-3.5 h-3.5 text-amber-400/80" />
                                <span className="text-amber-400/80">{statusCounts.creditsExhausted} credits exhausted</span>
                              </div>
                              <span className="text-[10px] text-white/40">Check provider account</span>
                            </div>
                          )}
                          {/* Rate Limited */}
                          {statusCounts.rateLimited > 0 && (
                            <div className="flex items-center justify-between text-[11px]">
                              <div className="flex items-center gap-2">
                                <Clock className="w-3.5 h-3.5 text-amber-400/80" />
                                <span className="text-amber-400/80">{statusCounts.rateLimited} rate limited</span>
                              </div>
                              <span className="text-[10px] text-white/40">Wait and retry</span>
                            </div>
                          )}
                          {/* No Providers — critical actionable */}
                          {statusCounts.noProviders > 0 && (
                            <div className="flex items-center justify-between text-[11px]">
                              <div className="flex items-center gap-2">
                                <Settings className="w-3.5 h-3.5 text-amber-400/80" />
                                <span className="text-amber-400/80">{statusCounts.noProviders} no providers</span>
                              </div>
                              <button
                                onClick={() => navigate('/settings')}
                                className="text-[10px] text-white/50 hover:text-white/80 underline underline-offset-2"
                              >
                                Connect provider
                              </button>
                            </div>
                          )}
                          {/* Generic Error */}
                          {statusCounts.error > 0 && (
                            <div className="flex items-center gap-2 text-[11px]">
                              <AlertCircle className="w-3.5 h-3.5 text-white/40" />
                              <span className="text-white/50">{statusCounts.error} provider issues</span>
                            </div>
                          )}
                        </div>
                        {/* Only show "normal" message if the only issue is not found */}
                        {statusCounts.notFound > 0 &&
                         statusCounts.authError === 0 &&
                         statusCounts.creditsExhausted === 0 &&
                         statusCounts.noProviders === 0 &&
                         statusCounts.error === 0 && (
                          <p className="text-[9px] text-white/20 mt-3 text-center">
                            Some companies don't have public emails. This is normal.
                          </p>
                        )}
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

                    {/* Generate Intros — export happens AFTER intros in Ready step */}
                    {introPairCount > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                      >
                        <button
                          onClick={regenerateIntros}
                          className={BTN.primary}
                        >
                          Generate {introPairCount} intros
                        </button>
                        {uniqueSupplyWithEmail > 0 && uniqueSupplyWithEmail < introPairCount && (
                          <p className="text-[10px] text-white/40 mt-1.5 text-center">
                            {introPairCount} intros · {uniqueSupplyWithEmail} supply contacts
                          </p>
                        )}
                      </motion.div>
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

          {/* READY — Split Screen (The Holy Shit Moment) */}
          {state.step === 'ready' && (
            <motion.div
              key="ready"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-5xl mx-auto px-4"
            >
              {(() => {
                const demandMatches = state.matchingResult?.demandMatches || [];
                const supplyAggregates = state.matchingResult?.supplyAggregates || [];

                const demandReady = demandMatches.filter(m => {
                  const e = state.enrichedDemand.get(recordKey(m.demand));
                  return e && isSuccessfulEnrichment(e) && e.email;
                });
                const supplyReady = supplyAggregates.filter(a => {
                  const e = state.enrichedSupply.get(recordKey(a.supply));
                  return e && isSuccessfulEnrichment(e) && e.email;
                });

                const demandNeedEmail = demandMatches.filter(m => {
                  const e = state.enrichedDemand.get(recordKey(m.demand));
                  return !e || !isSuccessfulEnrichment(e) || !e.email;
                });
                const supplyNeedEmail = supplyAggregates.filter(a => {
                  const e = state.enrichedSupply.get(recordKey(a.supply));
                  return !e || !isSuccessfulEnrichment(e) || !e.email;
                });

                // FIX: Count actual intros, not just emails — "intros ready" must be truthful
                const totalReady = demandReady.filter(m =>
                  state.demandIntros.has(recordKey(m.demand))
                ).length + supplyReady.filter(a =>
                  state.supplyIntros.has(recordKey(a.supply))
                ).length;
                const totalNeedEmail = demandNeedEmail.length + supplyNeedEmail.length;

                // Build message previews — 2 per side, dedupe supply
                // FIX #5: Use match slices directly for stable keys (getDemandReactKey defined at component level)
                const demandPreview = demandReady.slice(0, 2);

                // UPSTREAM FIX: Build supply preview from supplies that ACTUALLY have intros
                // Not from match.supply (which may have no email and fallback was used)
                // This fixes the "Intro pending" bug when fallback supply is used
                const suppliesWithIntros: Array<{ supply: NormalizedRecord; key: string }> = [];
                state.supplyIntros.forEach((_, supplyKey) => {
                  // Find the supply in supplyAggregates that matches this key
                  const agg = supplyAggregates.find(a => recordKey(a.supply) === supplyKey);
                  if (agg && !suppliesWithIntros.some(s => s.key === supplyKey)) {
                    suppliesWithIntros.push({ supply: agg.supply, key: supplyKey });
                  }
                });
                const supplyPreview = suppliesWithIntros.slice(0, 2);

                return (
                  <div className="text-center">
                    {/* HERO — compact */}
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                      className="mb-5"
                    >
                      <div className="relative inline-block">
                        <div className="absolute inset-0 blur-2xl bg-gradient-to-r from-blue-500/30 via-white/20 to-violet-500/30 rounded-full scale-125" />
                        <span className="relative text-[44px] font-extralight text-white tracking-tight tabular-nums">
                          {totalReady}
                        </span>
                      </div>
                      <p className="text-[12px] text-white/40 mt-0.5">intros ready</p>
                    </motion.div>

                    {/* INVARIANT C: Results Dropped Warning */}
                    {state.resultsDropped && state.droppedCounts && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="max-w-md mx-auto mb-4 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]"
                      >
                        <p className="text-[11px] text-white/40 text-center">
                          {state.droppedCounts.intros} skipped · {state.droppedCounts.demand + state.droppedCounts.supply} ready
                        </p>
                      </motion.div>
                    )}

                    {/* CSV QUALITY WARNING removed — stale after enrichment */}

                    {/* SPLIT SCREEN */}
                    <div className="grid grid-cols-2 gap-4 mb-5">
                      {/* LEFT — Demand (blue) */}
                      <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2, duration: 0.4 }}
                        className="space-y-2"
                      >
                        <div className="flex items-center gap-1.5 pl-1">
                          <div className="w-5 h-5 rounded bg-blue-500/20 flex items-center justify-center">
                            <span className="text-[9px] font-bold text-blue-400">D</span>
                          </div>
                          <span className="text-[10px] font-medium text-white/40 uppercase tracking-wider">Demand</span>
                          <span className="text-[10px] text-white/20">({demandReady.length})</span>
                        </div>
                        {demandPreview.map((match, i) => (
                          <motion.div
                            key={getDemandReactKey(match.demand)}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 + i * 0.08 }}
                          >
                            <div className="h-[130px] rounded-xl rounded-tl-sm bg-blue-500/[0.05] border border-blue-500/[0.10] text-left flex flex-col">
                              <div className="px-3 pt-2.5 pb-1.5 border-b border-blue-500/[0.06] flex items-center justify-between gap-2">
                                <p className="text-[10px] text-blue-400/70 font-medium truncate">→ {match.demand.company}</p>
                                <IntroBadge source={state.demandIntros.get(recordKey(match.demand))?.source} />
                              </div>
                              <div className="flex-1 px-3 py-2 overflow-y-auto custom-scroll">
                                {/* INVARIANT E: Preview truthfulness — never show placeholder after enrichment */}
                                <p className="text-[11px] text-white/60 leading-[1.55]">
                                  {state.demandIntros.get(recordKey(match.demand))?.text ||
                                    (state.step === 'generating' ? 'Generating intro...' :
                                      state.step === 'ready' ? 'Intro pending — click Generate' :
                                        'Awaiting intro generation')}
                                </p>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                        {demandReady.length > 2 && (
                          <p className="text-[10px] text-white/25 pl-1">+{demandReady.length - 2} more</p>
                        )}
                      </motion.div>

                      {/* RIGHT — Supply (violet) */}
                      <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.25, duration: 0.4 }}
                        className="space-y-2"
                      >
                        <div className="flex items-center justify-end gap-1.5 pr-1">
                          <span className="text-[10px] text-white/20">({suppliesWithIntros.length})</span>
                          <span className="text-[10px] font-medium text-white/40 uppercase tracking-wider">Supply</span>
                          <div className="w-5 h-5 rounded bg-violet-500/20 flex items-center justify-center">
                            <span className="text-[9px] font-bold text-violet-400">S</span>
                          </div>
                        </div>
                        {supplyPreview.map((item, i) => (
                          <motion.div
                            key={item.key}
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.35 + i * 0.08 }}
                          >
                            <div className="h-[130px] rounded-xl rounded-tr-sm bg-violet-500/[0.05] border border-violet-500/[0.10] text-left flex flex-col">
                              <div className="px-3 pt-2.5 pb-1.5 border-b border-violet-500/[0.06] flex items-center justify-between gap-2">
                                <p className="text-[10px] text-violet-400/70 font-medium truncate">→ {item.supply.company}</p>
                                <IntroBadge source={state.supplyIntros.get(item.key)?.source} />
                              </div>
                              <div className="flex-1 px-3 py-2 overflow-y-auto custom-scroll">
                                {/* INVARIANT E: Preview truthfulness — never show placeholder after enrichment */}
                                <p className="text-[11px] text-white/60 leading-[1.55]">
                                  {state.supplyIntros.get(item.key)?.text ||
                                    (state.step === 'generating' ? 'Generating intro...' :
                                      state.step === 'ready' ? 'Intro pending — click Generate' :
                                        'Awaiting intro generation')}
                                </p>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                        {suppliesWithIntros.length > 2 && (
                          <p className="text-[10px] text-white/25 text-right pr-1">+{suppliesWithIntros.length - 2} more</p>
                        )}
                      </motion.div>
                    </div>

                    {/* ACTIONS — all in one row */}
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="flex items-center justify-center gap-2 flex-wrap"
                    >
                      <button onClick={startSending} disabled={totalReady === 0} className={BTN.primary}>
                        Send {totalReady}
                      </button>
                      <button onClick={openExportReceipt} className={BTN.secondary}>
                        Export
                      </button>
                      {totalNeedEmail > 0 && (
                        <button
                          onClick={() => {
                            const records = [...demandNeedEmail.map(m => ({
                              type: 'demand',
                              company: m.demand.company,
                              domain: m.demand.domain,
                              industry: m.demand.industry || '',
                              intro: state.demandIntros.get(recordKey(m.demand))?.text || '',
                              linkedin: m.demand.existingContact?.linkedin || '',
                            })), ...supplyNeedEmail.map(a => ({
                              type: 'supply',
                              company: a.supply.company,
                              domain: a.supply.domain,
                              industry: a.supply.industry || '',
                              intro: state.supplyIntros.get(recordKey(a.supply))?.text || '',
                              linkedin: a.supply.linkedin || '',
                            }))];
                            const csv = [
                              ['type', 'company', 'domain', 'industry', 'intro', 'linkedin'].join(','),
                              ...records.map(r => [r.type, `"${r.company}"`, r.domain, `"${r.industry}"`, `"${r.intro.replace(/"/g, '""')}"`, r.linkedin].join(','))
                            ].join('\n');
                            const blob = new Blob([csv], { type: 'text/csv' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `linkedin-dm-${new Date().toISOString().split('T')[0]}.csv`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#0A66C2]/10 border border-[#0A66C2]/20 text-[11px] font-medium text-[#0A66C2] hover:bg-[#0A66C2]/15 transition-all"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                          </svg>
                          {totalNeedEmail} DM
                        </button>
                      )}
                      <span className="text-white/10 mx-1">|</span>
                      <button
                        onClick={regenerateIntros}
                        className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-[11px] text-white/30 hover:text-white/50 hover:bg-white/[0.03] transition-all"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Regenerate
                      </button>
                      <button onClick={reset} className="h-9 px-3 rounded-lg text-[11px] text-white/30 hover:text-white/50 hover:bg-white/[0.03] transition-all">
                        Start over
                      </button>
                    </motion.div>

                    {state.error && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mt-4 text-[11px] text-white/50"
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

              {/* Count + Breakdown */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mb-8"
              >
                <span className="text-[56px] font-light text-white tracking-tight">
                  {state.sendBreakdown.new}
                </span>
                <p className="text-[15px] text-white/50 mt-1 font-medium">sent</p>

                {/* Breakdown: demand · supply · already in Instantly */}
                <p className="text-[12px] text-white/25 mt-2">
                  {state.sentDemand > 0 && `${state.sentDemand} demand`}
                  {state.sentDemand > 0 && state.sentSupply > 0 && ' · '}
                  {state.sentSupply > 0 && `${state.sentSupply} supply`}
                  {state.sendBreakdown.new === 0 && 'No new leads'}
                </p>
                {state.sendBreakdown.existing > 0 && (
                  <p className="text-[12px] text-white/20 mt-1">
                    {state.sendBreakdown.existing} already in Instantly
                  </p>
                )}

                {/* Needs attention — subtle, not alarming */}
                {state.sendBreakdown.needsAttention > 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="mt-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                  >
                    <p className="text-[12px] text-white/40">
                      {state.sendBreakdown.needsAttention} need attention
                    </p>
                    {state.sendBreakdown.details.length > 0 && (
                      <p className="text-[11px] text-white/25 mt-1 line-clamp-2">
                        {state.sendBreakdown.details[0]}
                      </p>
                    )}
                  </motion.div>
                )}
              </motion.div>

              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                onClick={reset}
                className={BTN.primary}
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
        {showExportReceipt && exportReceiptData && (() => {
          const totalReady = exportReceiptData.demand.totalExported + exportReceiptData.supply.totalExported;
          const totalMatched = exportReceiptData.demand.totalMatched + exportReceiptData.supply.totalMatched;
          const totalNotReady = totalMatched - totalReady;

          // Aggregate filtered reasons from both sides
          const reasonCounts = new Map<string, number>();
          for (const f of [...exportReceiptData.demand.filtered, ...exportReceiptData.supply.filtered]) {
            const label = REASON_LABELS[f.reason] || f.reason;
            reasonCounts.set(label, (reasonCounts.get(label) || 0) + f.count);
          }
          const reasons = Array.from(reasonCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3); // Show top 3 reasons

          return (
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
                {/* Apple-style: show ready count with context */}
                <p className="text-[13px] text-white/40 mb-2">Export</p>
                <p className="text-[42px] font-light text-white tracking-tight mb-1">
                  {totalReady}
                </p>
                <p className="text-[14px] text-white/50 font-medium mb-1">ready</p>
                <p className="text-[12px] text-white/25 mb-4">
                  {exportReceiptData.demand.totalExported} demand · {exportReceiptData.supply.totalExported} supply
                </p>

                {/* Show context: matched total and what's not ready */}
                {totalNotReady > 0 && (
                  <div className="mb-6 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                    <p className="text-[12px] text-white/30 mb-2">
                      {totalMatched} matched total
                    </p>
                    <div className="space-y-1">
                      {reasons.map(([label, count]) => (
                        <p key={label} className="text-[11px] text-white/20">
                          {count} {label.toLowerCase()}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={handleExportCSV}
                  disabled={totalReady === 0}
                  className={`w-full ${BTN.primary}`}
                >
                  {totalReady > 0 ? 'Download CSV' : 'Nothing to export'}
                </button>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Dock */}
      <Dock />
    </div>
  );
}
// Build: 1768325570
