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
import { Workflow, ArrowLeft, Pencil, X, Check, Star, EyeOff, ArrowRight } from 'lucide-react';
import Dock from './Dock';
import { useAuth } from './AuthContext';
import { supabase } from './lib/supabase';

// New architecture
import { validateDataset, normalizeDataset, NormalizedRecord, Schema } from './schemas';
import { matchRecords, MatchingResult, filterByScore } from './matching';
import { enrichRecord, enrichBatch, EnrichmentConfig, EnrichmentResult } from './enrichment';
import { generateDemandIntro, generateSupplyIntro } from './templates';

// AI Config type + Antifragile intro generation
import { AIConfig, generateIntro } from './services/AIService';

// Intro Generator — Rich context for DEMAND only (supply uses antifragile path)
import {
  generateDemandIntro as generateDemandIntroRich,
  buildDemandContext,
} from './services/IntroGenerator';

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

/**
 * Detect common signal category across multiple matches.
 * Used for aggregated supply intros: "5 companies hiring engineers"
 */
function detectCommonSignal(signals: string[]): string {
  if (signals.length === 0) return 'hiring';

  // Count occurrences of each category
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

  // Return most common category
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
  step: 'upload' | 'validating' | 'matching' | 'enriching' | 'generating' | 'ready' | 'sending' | 'complete';

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

  // Error
  error: string | null;

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
    enrichedDemand: new Map(),
    enrichedSupply: new Map(),
    demandIntros: new Map(),
    supplyIntros: new Map(),
    progress: { current: 0, total: 0, message: '' },
    sentDemand: 0,
    sentSupply: 0,
    error: null,
    auditData: null,
    copyValidationFailures: [],
  });

  const [settings, setSettings] = useState<Settings | null>(null);

  // CANONICAL: Per-side presignal editing state
  const [editingPresignalSide, setEditingPresignalSide] = useState<'demand' | 'supply' | null>(null);
  const [presignalText, setPresignalText] = useState('');
  const [savingPresignal, setSavingPresignal] = useState(false);

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
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  // Scroll to error when it appears
  useEffect(() => {
    if (state.error && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [state.error]);

  // Debug mode check
  const isDebugMode = new URLSearchParams(window.location.search).get('debug') === '1';

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
            presignalDemand: data?.presignal_demand || '',
            presignalSupply: data?.presignal_supply || '',
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
          presignalDemand: s.presignalDemand || '',
          presignalSupply: s.presignalSupply || '',
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
    setState(prev => ({ ...prev, step: 'validating', error: null }));
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

        // Check for cross-source matching block
        if (hubError) {
          console.error('[Flow] Hub ERROR:', hubError);
          setState(prev => ({
            ...prev,
            step: 'upload',
            error: toUserError('HUB_ERROR', hubError),
          }));
          return;
        }

        // Validate both sides exist
        if (hubDemand.length === 0 || hubSupply.length === 0) {
          console.error('[Flow] Hub ERROR: Missing one side - demand:', hubDemand.length, 'supply:', hubSupply.length);
          setState(prev => ({
            ...prev,
            step: 'upload',
            error: toUserError('HUB_MISSING_SIDE'),
          }));
          return;
        }

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

        if (!validateRecords(dedupedDemand, 'demand')) {
          setState(prev => ({
            ...prev,
            step: 'upload',
            error: toUserError('CONTRACT_VIOLATION', 'demand records missing required fields'),
          }));
          return;
        }

        if (!validateRecords(dedupedSupply, 'supply')) {
          setState(prev => ({
            ...prev,
            step: 'upload',
            error: toUserError('CONTRACT_VIOLATION', 'supply records missing required fields'),
          }));
          return;
        }

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

      if (!settings?.apifyToken) {
        setState(prev => ({ ...prev, step: 'upload', error: toUserError('MISSING_APIFY_TOKEN') }));
        return;
      }
      if (!settings?.demandDatasetId) {
        setState(prev => ({ ...prev, step: 'upload', error: toUserError('MISSING_DATASET_ID') }));
        return;
      }

      setState(prev => ({ ...prev, progress: { current: 0, total: 100, message: 'Loading demand...' } }));

      // Fetch demand dataset
      const demandData = await fetchApifyDataset(settings.demandDatasetId, settings.apifyToken);
      console.log('[Flow] Raw demand data sample:', demandData[0]);
      console.log('[Flow] Raw demand fields:', demandData[0] ? Object.keys(demandData[0]) : 'empty');
      setState(prev => ({ ...prev, progress: { ...prev.progress, current: 30, message: 'Validating demand...' } }));

      // Validate demand
      const demandValidation = validateDataset(demandData);
      console.log('[Flow] Demand validation:', { valid: demandValidation.valid, schema: demandValidation.schema?.name, error: demandValidation.error });

      // Check for empty dataset
      if (!demandData || demandData.length === 0) {
        setState(prev => ({
          ...prev,
          step: 'upload',
          error: toUserError('DATASET_EMPTY'),
        }));
        return;
      }

      if (!demandValidation.valid || !demandValidation.schema) {
        setState(prev => ({
          ...prev,
          step: 'upload',
          error: toUserError('DATASET_INVALID', demandValidation.error),
        }));
        return;
      }

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
      console.error('[Flow] Validation failed:', err);
      const detail = err instanceof Error ? err.message : undefined;
      setState(prev => ({
        ...prev,
        step: 'upload',
        error: toUserError('DATASET_FETCH_FAILED', detail),
      }));
    }
  }, [settings]);

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

    // Both datasets required for matching
    if (supply.length === 0) {
      console.log(`[Flow] ERROR: No supply dataset - matching requires both datasets`);
      setState(prev => ({
        ...prev,
        step: 'upload',
        error: toUserError('MISSING_SUPPLY'),
      }));
      return;
    }

    // Diagnostic logs
    console.time('[MATCH] matchRecords');
    console.log('[MATCH] inputs', { demand: demand.length, supply: supply.length });

    // Run matching brain (async with yielding for large datasets)
    const result = await matchRecords(demand, supply);

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
    // INVARIANT: After matchRecords, we MUST advance to enriching
    // =======================================================================
    console.log('[MATCH] advancing step', { from: 'matching', to: 'enriching' });

    setState(prev => ({
      ...prev,
      step: 'enriching',
      matchingResult: filtered,
      progress: { current: 0, total: filtered.demandMatches.length, message: 'Enriching contacts...' },
    }));

    // Heartbeat to confirm setState executed
    setTimeout(() => console.log('[MATCH] post-setState heartbeat'), 0);

    // =======================================================================
    // RUNTIME GUARD: If matches exist, enrichment MUST be called
    // =======================================================================
    if (filtered.demandMatches.length > 0 || filtered.supplyAggregates.length > 0) {
      console.log('[MATCH] matches exist, calling runEnrichment');
      await runEnrichment(filtered, demandSchema, supplySchema);
    } else {
      console.error('[MATCH] CRITICAL: No matches to enrich - flow ends here');
      setState(prev => ({
        ...prev,
        step: 'ready',
        progress: { current: 100, total: 100, message: 'No matches found' },
      }));
    }
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

    // Update state with demand results
    setState(prev => ({ ...prev, enrichedDemand: new Map(enrichedDemand) }));

    // Enrich supply side
    const enrichedSupply = new Map<string, EnrichmentResult>();
    const supplyToEnrich = matching.supplyAggregates;

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

    // Move to ready — intros will generate when user clicks Route
    // This allows operator to add pre-signal context before intro generation
    setState(prev => ({
      ...prev,
      step: 'ready',
      enrichedDemand,
      enrichedSupply,
    }));
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
    const aiConfig = settings?.aiConfig || null;

    // DEBUG: Log what we have
    console.log('[Flow] Anti-Fragile intro generation starting:');
    console.log('  - demandMatches:', matching.demandMatches.length);
    console.log('  - supplyAggregates:', matching.supplyAggregates.length);
    console.log('  - enrichedDemand size:', enrichedDemand.size);
    console.log('  - enrichedSupply size:', enrichedSupply.size);
    console.log('  - AI configured:', aiConfig ? aiConfig.provider : 'none (using templates)');

    // Count emails
    const demandWithEmail = matching.demandMatches.filter(m => {
      const e = enrichedDemand.get(m.demand.domain);
      return e?.email;
    });
    const supplyWithEmail = matching.supplyAggregates.filter(a => {
      const e = enrichedSupply.get(a.supply.domain);
      return e?.email;
    });

    console.log('  - demandWithEmail:', demandWithEmail.length);
    console.log('  - supplyWithEmail:', supplyWithEmail.length);

    let progress = 0;
    const total = demandWithEmail.length + supplyWithEmail.length;

    // ==========================================================================
    // Calculate role counts per company (for richer signals)
    // "Stripe is hiring" → "Stripe is scaling engineering with 8+ roles"
    // ==========================================================================
    const roleCountByDomain = new Map<string, number>();
    for (const match of matching.demandMatches) {
      const domain = match.demand.domain;
      roleCountByDomain.set(domain, (roleCountByDomain.get(domain) || 0) + 1);
    }

    // ==========================================================================
    // GENERATE DEMAND INTROS — Rich context, 15 examples, validation
    // ==========================================================================
    for (const match of matching.demandMatches) {
      if (abortRef.current) break;

      const enriched = enrichedDemand.get(match.demand.domain);
      if (!enriched?.success || !enriched.email) continue;

      // No name = not a match, skip
      const firstName = enriched.firstName || match.demand.firstName;
      if (!firstName) {
        console.log(`[Flow] Skipping ${match.demand.company} - no name found`);
        continue;
      }

      // Get role count for this company (for specific signals)
      const roleCount = roleCountByDomain.get(match.demand.domain) || 1;

      try {
        // CANONICAL: Use per-side presignal (applies to ALL demand contacts)
        const demandPreSignalContext = settings?.presignalDemand;

        // Build rich context from ALL available data
        // Pass: firstName, enriched title (e.g., "VP Engineering"), role count
        const ctx = buildDemandContext(
          match.demand,
          firstName,
          enriched.title || undefined,  // Enriched title from Apollo
          roleCount,
          demandPreSignalContext,  // CANONICAL: Same presignal for ALL demand
          state.connectorMode || undefined  // CANONICAL: Mode for language routing (biotech vs recruiting)
        );
        console.log(`[Flow] Generating demand intro for ${firstName} at ${match.demand.company}...`);
        console.log(`[Flow] Using per-side presignalDemand:`, demandPreSignalContext || '(none)');
        console.log(`[Flow] Context:`, {
          signal: ctx.signal,
          contactTitle: ctx.contactTitle,
          roleCount: ctx.roleCount,
          hasDescription: !!ctx.companyDescription,
          hasFunding: !!ctx.companyFunding,
          industry: ctx.industry,
          preSignalContext: ctx.preSignalContext || '(none)',
          connectorMode: ctx.connectorMode || '(not set)',
        });

        // Generate with validation (retries up to 3x if validation fails)
        const result = await generateDemandIntroRich(aiConfig, ctx);
        demandIntros.set(match.demand.domain, result.intro);
        console.log(`[Flow] Demand intro (validated=${result.validated}, attempts=${result.attempts}): "${result.intro}"`);

      } catch (err) {
        console.error('[Flow] Demand intro failed:', match.demand.domain, err);
        // PHASE 3: Fallback routes through canonical doctrine (no timing defaults)
        demandIntros.set(match.demand.domain, generateDemandIntro({
          ...match.demand,
          firstName,
          connectorMode: state.connectorMode || undefined,
          preSignalContext: settings?.presignalDemand,
        }));
      }

      progress++;
      setState(prev => ({
        ...prev,
        progress: { current: progress, total, message: `Generating ${progress}/${total}` },
        demandIntros: new Map(demandIntros),
      }));

      // Rate limit: 500ms between matches (generation + validation calls)
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // ==========================================================================
    // GENERATE SUPPLY INTROS — Antifragile path (AIService.generateIntro)
    // Signal-only, no enrichment, deterministic fallback
    // ==========================================================================
    for (const agg of matching.supplyAggregates) {
      if (abortRef.current) break;

      const enriched = enrichedSupply.get(agg.supply.domain);
      if (!enriched?.success || !enriched.email) continue;

      // No name = not a match, skip
      const firstName = enriched.firstName || agg.supply.firstName;
      if (!firstName) {
        console.log(`[Flow] Skipping supply ${agg.supply.company} - no name found`);
        continue;
      }

      const exampleCompany = agg.bestMatch.demand.company;  // ONE example only
      const allSignals = agg.matches.map(m => m.demand.signal || '');
      const commonSignal = detectCommonSignal(allSignals);

      // SIGNAL CONTRACT: Sanitize before intro generation
      const sanitizedSignal = sanitizeSignal(commonSignal);

      // Get decision maker name (not title - antifragile uses name only)
      const demandEnriched = enrichedDemand.get(agg.bestMatch.demand.domain);
      const contactName = demandEnriched?.firstName || agg.bestMatch.demand.firstName || null;

      // CANONICAL: Use per-side presignal (applies to ALL supply contacts)
      const supplyPreSignalContext = settings?.presignalSupply;

      console.log(`[Flow] Generating supply intro for ${firstName} via antifragile path...`);
      console.log(`[Flow] Signal: "${commonSignal}" → sanitized: "${sanitizedSignal}"`);
      console.log(`[Flow] Using per-side presignalSupply:`, supplyPreSignalContext || '(none)');

      // ANTIFRAGILE PATH: AIService.generateIntro (signal-only, no enrichment)
      // FIX 1 + FIX 3: Pass connector mode and job signal for mode-appropriate language
      const intro = await generateIntro(
        {
          type: 'supply',
          signalDetail: sanitizedSignal,
          context: {
            firstName,
            company: exampleCompany,
            contactName: contactName || undefined,
            // Operator-written pre-signal context (normalized lookup)
            preSignalContext: supplyPreSignalContext,
          },
          // FIX 1: Pass connector mode
          connectorMode: state.connectorMode,
          // FIX 3: Supply side doesn't use job signals (we're offering leads, not hiring)
          jobSignal: undefined,
        },
        aiConfig
      );

      supplyIntros.set(agg.supply.domain, intro);
      console.log(`[Flow] Supply intro (antifragile): "${intro}"`);

      progress++;
      setState(prev => ({
        ...prev,
        progress: { current: progress, total, message: `Generating ${progress}/${total}` },
        supplyIntros: new Map(supplyIntros),
      }));

      // Rate limit: 500ms between calls
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Summary
    console.log(`[Flow] Intro generation complete:`);
    console.log(`  - Demand intros: ${demandIntros.size}`);
    console.log(`  - Supply intros: ${supplyIntros.size}`);

    // Save intros to state (step transition handled by caller)
    setState(prev => ({
      ...prev,
      demandIntros,
      supplyIntros,
    }));
  };

  // =============================================================================
  // STEP 5: SEND VIA SENDER ADAPTER
  // =============================================================================

  const startSending = useCallback(async () => {
    // Resolve sender ONCE at start
    const senderId = settings?.sendingProvider || 'instantly';
    const sender = resolveSender(senderId);

    if (!sender) {
      setState(prev => ({ ...prev, error: `Unknown sending provider: ${senderId}` }));
      return;
    }

    // Build sender config
    const senderConfig = buildSenderConfig({
      instantlyApiKey: settings?.instantlyApiKey,
      plusvibeApiKey: settings?.plusvibeApiKey,
      plusvibeWorkspaceId: settings?.plusvibeWorkspaceId,
      demandCampaignId: settings?.demandCampaignId,
      supplyCampaignId: settings?.supplyCampaignId,
      sendingProvider: senderId,
    });

    // Validate config
    const configError = sender.validateConfig(senderConfig);
    if (configError) {
      setState(prev => ({ ...prev, error: configError }));
      return;
    }

    // Generate intros NOW (after user has had chance to add context)
    const { matchingResult, enrichedDemand, enrichedSupply } = state;
    if (matchingResult) {
      setState(prev => ({ ...prev, step: 'generating' }));
      await runIntroGeneration(matchingResult, enrichedDemand, enrichedSupply);
    }

    setState(prev => ({ ...prev, step: 'sending' }));

    if (!matchingResult) return;

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

              {/* Error Banner - Premium AlertPanel with Explainability */}
              {state.error && (() => {
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

          {/* MATCHING */}
          {state.step === 'matching' && (
            <motion.div
              key="matching"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <div className="text-[48px] font-light text-white mb-2">
                {state.demandRecords.length}
              </div>
              <p className="text-[13px] text-white/40">
                {state.isHubFlow
                  ? 'Routing contacts to Flow...'
                  : 'signals loaded, matching...'}
              </p>
            </motion.div>
          )}

          {/* ENRICHING */}
          {state.step === 'enriching' && (
            <motion.div
              key="enriching"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <div className="text-[48px] font-light text-white mb-2">
                {state.progress.current}<span className="text-white/30">/{state.progress.total}</span>
              </div>
              <p className="text-[13px] text-white/40 mb-8">Finding decision makers</p>
              <div className="w-48 mx-auto">
                <div className="h-[3px] bg-white/[0.08] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-400/60 rounded-full transition-all"
                    style={{ width: `${(state.progress.current / Math.max(state.progress.total, 1)) * 100}%` }}
                  />
                </div>
              </div>
              <p className="mt-6 text-[11px] text-white/25">Safe to leave — progress saves</p>
            </motion.div>
          )}

          {/* GENERATING */}
          {state.step === 'generating' && (
            <motion.div
              key="generating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <div className="text-[48px] font-light text-white mb-2">
                {state.progress.current}<span className="text-white/30">/{state.progress.total}</span>
              </div>
              <p className="text-[13px] text-white/40 mb-8">
                {settings?.aiConfig ? 'Generating intros' : 'Building intros'}
              </p>
              <div className="w-48 mx-auto">
                <div className="h-[3px] bg-white/[0.08] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400/60 rounded-full transition-all"
                    style={{ width: `${(state.progress.current / Math.max(state.progress.total, 1)) * 100}%` }}
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

                    {/* Count — THE thing */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="text-center mb-10"
                    >
                      <span className="text-[48px] font-light text-white/90 tracking-tight">{totalReady}</span>
                      <p className="text-[13px] text-white/40 mt-1">Ready to Route</p>
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

                    {/* Route Context — Single card, route-level */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="w-full max-w-sm mb-10"
                    >
                      {(() => {
                        const currentContext = settings?.presignalDemand || settings?.presignalSupply || '';

                        // Not editing, no context
                        if (!isEditingContext && !currentContext) {
                          return (
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
                          );
                        }

                        // Editing
                        if (isEditingContext) {
                          return (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.98 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08]"
                            >
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
                                    // Save to both sides (route-level context)
                                    await savePresignal('demand');
                                    if (presignalText.trim()) {
                                      // Also sync to supply side
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
                            </motion.div>
                          );
                        }

                        // Has context, show it
                        return (
                          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-[10px] text-white/30 uppercase tracking-wider">Route Context</span>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => startEditPresignal('demand')}
                                  className="text-[10px] text-white/30 hover:text-white/50 transition-colors"
                                >
                                  Edit
                                </button>
                                <span className="text-white/10">·</span>
                                <button
                                  onClick={async () => {
                                    // Clear both sides
                                    setSettings(prev => prev ? { ...prev, presignalDemand: '', presignalSupply: '' } : prev);
                                    if (user?.id) {
                                      await supabase.from('operator_settings').update({ presignal_demand: '', presignal_supply: '' }).eq('user_id', user.id);
                                    } else {
                                      const stored = localStorage.getItem('guest_settings');
                                      if (stored) {
                                        const parsed = JSON.parse(stored);
                                        parsed.presignalDemand = '';
                                        parsed.presignalSupply = '';
                                        localStorage.setItem('guest_settings', JSON.stringify(parsed));
                                      }
                                    }
                                  }}
                                  className="text-[10px] text-white/30 hover:text-red-400/70 transition-colors"
                                >
                                  Clear
                                </button>
                              </div>
                            </div>
                            <p className="text-[13px] text-white/60 leading-relaxed text-center">{safeRender(currentContext)}</p>
                          </div>
                        );
                      })()}
                    </motion.div>
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
                        onClick={startSending}
                        disabled={hasPresignalViolation}
                        className={`px-5 py-2.5 text-[13px] font-medium rounded-lg transition-all ${
                          hasPresignalViolation
                            ? 'bg-white/20 text-white/30 cursor-not-allowed'
                            : 'bg-white text-black hover:bg-white/90 active:scale-[0.98]'
                        }`}
                      >
                        Route to Instantly
                      </button>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          )}

          {/* SENDING */}
          {state.step === 'sending' && (
            <motion.div
              key="sending"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <div className="text-[48px] font-light text-white mb-2">
                {state.progress.current}<span className="text-white/30">/{state.progress.total}</span>
              </div>
              <p className="text-[13px] text-white/40 mb-8">{safeRender(state.progress.message)}</p>
              <div className="w-48 mx-auto">
                <div className="h-[3px] bg-white/[0.08] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-400/60 rounded-full transition-all"
                    style={{ width: `${(state.progress.current / Math.max(state.progress.total, 1)) * 100}%` }}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* COMPLETE */}
          {state.step === 'complete' && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <div className="w-16 h-16 mx-auto mb-8 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                <svg className="w-7 h-7 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h1 className="text-[17px] font-medium text-white/90 mb-1">Complete</h1>

              <p className="text-[13px] text-white/40 mb-10">
                {state.sentDemand} demand · {state.sentSupply} supply routed
              </p>

              <button
                onClick={reset}
                className="px-4 py-2 text-[13px] font-medium rounded-md bg-white text-black hover:bg-white/90 active:scale-[0.98]"
              >
                Run again
              </button>
            </motion.div>
          )}

          </AnimatePresence>
        </div>
      </div>

      {/* Dock */}
      <Dock />
    </div>
  );
}
// Build: 1768325570
