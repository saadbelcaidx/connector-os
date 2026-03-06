/**
 * STATION — One OS station. Not a wizard. Operator decides.
 *
 * Doctrine: Linear × Palantir — data-dense rows, monospace values,
 * near-monochrome, 4px grid. No cards. No rounded-xl. No batch send.
 *
 * Canonical loop: Signal → Syndicate → Match → Route → Print
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';

import { useAuth } from './AuthContext';
import { supabase } from './lib/supabase';
import { normalize, CSV_SCHEMA } from './schemas/index';
import type { NormalizedRecord } from './schemas/index';
/** @deprecated V5 wiring — prebuilt markets + Apify now use mcp-orchestrate. Only CSV path remains. */
import { matchRecords } from './matching/index';
import type { Match, MatchingResult, ConfidenceTier } from './matching/index';
import { enrichBatch } from './enrichment/index';
import type { EnrichmentResult } from './enrichment/router';
import type { EnrichmentConfig } from './enrichment/index';
import { buildEnrichmentPlan } from './flow/enrichmentPlan';
import type { EnrichmentSettings } from './flow/enrichmentPlan';
import { generateIntrosAI } from './services/IntroAI';
import type { IntroAIConfig } from './services/IntroAI';
import { sendToInstantly } from './services/InstantlyService';
import { searchMarkets, normalizeToRecord, enrichCompanies, fetchFallbackDescriptions } from './services/MarketsService';
import type { MarketSearchOptions } from './services/MarketsService';
import { MARKETS, NEWS_SIGNALS, SIGNAL_GROUPS, EMPLOYEE_COUNT_OPTIONS, REVENUE_OPTIONS, FUNDING_TYPE_OPTIONS, INDUSTRY_GROUPS } from './constants/marketPresets';
import type { Pack } from './constants/marketPresets';
import type { DemandRecord } from './schemas/DemandRecord';
import type { SupplyRecord } from './schemas/SupplyRecord';
import type { Edge } from './schemas/Edge';
import type { RowPhase, IntroEntry, StationStep, StationPanel, FulfillmentClient, ClientOverlay, OverlaySpec, Deal, ClientTargetSet } from './types/station';
import { useOperatorSession } from './stores/operatorSession';
import { rankAllMatches, defaultOverlay } from './station/ranking';
import type { RankedMatchEntry } from './station/ranking';
import { composeIntros } from './matching/Composer';
import type { Counterparty } from './schemas/IntroOutput';
import { useStationRuntime } from './station/runtime/useStationRuntime';
import DmcbStatusBar from './station/components/DmcbStatusBar';
import IntentCardPreview from './station/components/IntentCardPreview';
import StationSourcePanel from './station/components/StationSourcePanel';
import AnalyzeModal from './station/components/AnalyzeModal';
import type { AnalyzeDiagnostics } from './station/components/AnalyzeModal';
import { resolveApifyInput } from './station/utils/resolveApifyInput';
import { fetchApifyDataset } from './station/utils/fetchApifyDataset';
import { toRawRecords, toRawRecordsFromApify } from './dmcb/rawIntake';
import { extractCanonicals, buildSignalsFromCanonicals } from './dmcb/runDMCB';
import type { DMCBCanonical } from './dmcb/dmcbAiExtract';
import type { RawRecord, CanonicalSignal } from './dmcb/types';
import { persistCanonicals } from './dmcb/persistCanonicals';
import { persistSignalEvents } from './dmcb/persistSignalEvents';
import { classifyFromPack, classifySignal } from './dmcb/classifySignal';
import type { SignalClassification } from './dmcb/classifySignal';
import { buildEventMeta } from './dmcb/normalizedToCanonical';
import ExecutionBadge from './station/components/ExecutionBadge';
import AuthModal from './AuthModal';
import { OverlayAuditPanel } from './station/components/OverlayAuditPanel';
import { useOverlayPerformance } from './station/hooks/useOverlayPerformance';
import { useOverlaySuggestions } from './station/hooks/useOverlaySuggestions';
import { hashOverlaySpecSync } from './station/lib/overlayHash';
import type { OverlaySuggestion } from './telemetry/overlaySuggestions';
import ClientProfileModal from './station/components/ClientProfileModal';
import { patchGuestSettings } from './utils/settingsCache';

// =============================================================================
// HELPERS — outside component to avoid re-creation
// =============================================================================

// Pack ID → Market ID lookup (MARKETS is a module-level constant — never changes)
const PACK_TO_MARKET = new Map<string, string>();
for (const m of MARKETS) {
  for (const p of m.packs) PACK_TO_MARKET.set(p.id, m.id);
}

// Market ID → Market display name
const MARKET_NAME_OF = new Map<string, string>();
for (const m of MARKETS) MARKET_NAME_OF.set(m.id, m.name);

/** Read current sending provider config from guest_settings localStorage cache. */
function readCurrentSendConfig(): {
  provider: string;
  workspaceId?: string;
  operatorId: string;
  demandCampaignId?: string;
  supplyCampaignId?: string;
} | null {
  try {
    const gs = localStorage.getItem('guest_settings');
    if (!gs) return null;
    const { settings: s } = JSON.parse(gs);
    const provider = s?.sendingProvider || 'instantly';
    if (provider === 'plusvibe' && s?.plusvibeApiKey) {
      return {
        provider: 'plusvibe',
        workspaceId: s.plusvibeWorkspaceId || '',
        operatorId: s.operatorId || 'guest',
        demandCampaignId: s.plusvibeCampaignDemand || s.instantlyCampaignDemand || '',
        supplyCampaignId: s.plusvibeCampaignSupply || s.instantlyCampaignSupply || '',
      };
    }
    return {
      provider: 'instantly',
      operatorId: s.operatorId || 'guest',
      demandCampaignId: s.instantlyCampaignDemand || '',
      supplyCampaignId: s.instantlyCampaignSupply || '',
    };
  } catch { return null; }
}

function tierLabel(tier: ConfidenceTier): string {
  return tier === 'strong' ? 'A' : tier === 'good' ? 'B' : 'C';
}

function tierColor(tier: ConfidenceTier): string {
  return tier === 'strong' ? 'text-emerald-400' : tier === 'good' ? 'text-blue-400' : 'text-white/30';
}

function rowKey(idx: number): string {
  return String(idx);
}

// A1 — Adapter: Match → DemandRecord + SupplyRecord + Edge
function matchToIntroInputs(match: Match): { demand: DemandRecord; supply: SupplyRecord; edge: Edge } {
  const demand: DemandRecord = {
    domain: match.demand.domain || '',
    company: match.demand.company || '',
    contact: match.demand.fullName || '',
    email: match.demand.email || '',
    title: match.demand.title || '',
    industry: typeof match.demand.industry === 'string'
      ? match.demand.industry
      : Array.isArray(match.demand.industry) ? (match.demand.industry[0] || '') : '',
    signals: match.demand.signalMeta
      ? [{ type: match.demand.signalMeta.kind, value: match.demand.signalMeta.label, source: match.demand.signalMeta.source }]
      : [],
    metadata: { packId: match.demand.packId, market: match.demand.market },
  };

  const supply: SupplyRecord = {
    domain: match.supply.domain || '',
    company: match.supply.company || '',
    contact: match.supply.fullName || '',
    email: match.supply.email || '',
    title: match.supply.title || '',
    capability: match.supply.headline || match.supply.signal || match.supply.companyDescription?.slice(0, 100) || '',
    targetProfile: match.supply.companyDescription?.slice(0, 120) || '',
    metadata: { packId: match.supply.packId, market: match.supply.market },
  };

  const edge: Edge = {
    type: match.tier,
    evidence: match.tierReason,
    confidence: match.score,
  };

  return { demand, supply, edge };
}

// =============================================================================
// PR-A — RETENTION HELPERS (localStorage-backed, no backend)
// =============================================================================

// ── Print layer ──────────────────────────────────────────────────────────────

function loadPrintDeals(): Deal[] {
  try {
    const raw = localStorage.getItem('print_deals');
    return raw ? (JSON.parse(raw) as Deal[]) : [];
  } catch { return []; }
}

function savePrintDeal(deal: Deal): void {
  const deals = loadPrintDeals();
  const idx = deals.findIndex(d => d.id === deal.id);
  if (idx >= 0) deals[idx] = deal; else deals.push(deal);
  localStorage.setItem('print_deals', JSON.stringify(deals));
}

/** Deterministic deal ID: base64(demandCompany|supplyCompany|date).slice(0,16) */
function makeDealId(demandCompany: string, supplyCompany: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const raw = `${demandCompany}|${supplyCompany}|${date}`;
  try { return btoa(raw).slice(0, 16); } catch { return String(Date.now()); }
}

// ── Daily stats + streak ─────────────────────────────────────────────────────

function getTodayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

interface DailyStats { dateISO: string; reviewed: number; sent: number; generated: number; }
interface Streak { lastDateISO: string; streakCount: number; }

function loadDailyStats(): DailyStats {
  try {
    const raw = localStorage.getItem('station_daily_stats');
    if (!raw) return { dateISO: getTodayISO(), reviewed: 0, sent: 0, generated: 0 };
    const data = JSON.parse(raw) as DailyStats;
    if (data.dateISO !== getTodayISO()) return { dateISO: getTodayISO(), reviewed: 0, sent: 0, generated: 0 };
    return data;
  } catch { return { dateISO: getTodayISO(), reviewed: 0, sent: 0, generated: 0 }; }
}

function saveDailyStats(stats: DailyStats): void {
  localStorage.setItem('station_daily_stats', JSON.stringify(stats));
}

function loadStreak(): Streak {
  try {
    const raw = localStorage.getItem('station_streak');
    return raw ? (JSON.parse(raw) as Streak) : { lastDateISO: '', streakCount: 0 };
  } catch { return { lastDateISO: '', streakCount: 0 }; }
}

/** Call when an intro is successfully sent. Returns updated streak. */
function incrementStreakOnSend(): Streak {
  const today = getTodayISO();
  const streak = loadStreak();
  if (streak.lastDateISO === today) return streak; // already counted today
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yISO = yesterday.toISOString().slice(0, 10);
  const next: Streak = {
    lastDateISO: today,
    streakCount: streak.lastDateISO === yISO ? streak.streakCount + 1 : 1,
  };
  localStorage.setItem('station_streak', JSON.stringify(next));
  return next;
}

// ── First Win Mode ────────────────────────────────────────────────────────────

function getFirstIntroSent(): boolean {
  try { return localStorage.getItem('first_intro_sent') === 'true'; } catch { return false; }
}

function markFirstIntroSent(): void {
  localStorage.setItem('first_intro_sent', 'true');
}

// Pack filters → MarketSearchOptions
function packToSearchOptions(pack: Pack): Partial<MarketSearchOptions> {
  const f = pack.filters;
  const titleInclude = f.titleInclude ? f.titleInclude.split(',').map(s => s.trim()).filter(Boolean) : [];
  const titleExclude = f.titleExclude ? f.titleExclude.split(',').map(s => s.trim()).filter(Boolean) : [];
  return {
    news: f.signals && f.signals.length > 0 ? f.signals : undefined,
    subIndustry: f.industries && f.industries.length > 0 ? { include: f.industries, exclude: [] } : undefined,
    title: (titleInclude.length > 0 || titleExclude.length > 0) ? { include: titleInclude, exclude: titleExclude } : undefined,
    keywordFilter: (f.keywordsInclude || f.keywordsExclude)
      ? { include: f.keywordsInclude || '', exclude: f.keywordsExclude || '' }
      : undefined,
    showOneLeadPerCompany: true,
  };
}

// CSV parse wrapper
function parseCsv(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data as any[]),
      error: (err: Error) => reject(err),
    });
  });
}

// Get effective email for a record (original or enriched)
function getEmail(record: NormalizedRecord, enriched: Map<string, EnrichmentResult>): string | null {
  if (record.email) return record.email;
  return enriched.get(record.recordKey)?.email || null;
}

// Progress bar component
function ProgressBar({ value, total, label }: { value: number; total: number; label: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 text-[10px] font-mono text-white/40 shrink-0">{label}</span>
      <div className="flex-1 h-[2px] bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className="h-full bg-white/40 transition-all duration-150"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-12 text-right text-[10px] font-mono text-white/30 shrink-0">
        {value} / {total}
      </span>
    </div>
  );
}

// =============================================================================
// TOKEN INPUT — removable tag chips over comma-separated string
// =============================================================================

function TokenInput({
  value, onChange, placeholder, autoCapitalize,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoCapitalize?: boolean;
}) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const tokens = value.split(',').map(s => s.trim()).filter(Boolean);

  const addToken = (raw: string) => {
    const cleaned = raw.trim();
    if (!cleaned) return;
    const final = autoCapitalize ? cleaned.replace(/\b\w/g, c => c.toUpperCase()) : cleaned;
    if (tokens.includes(final)) return;
    onChange([...tokens, final].join(', '));
    setInputValue('');
  };

  const removeToken = (index: number) => {
    onChange(tokens.filter((_, i) => i !== index).join(', '));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addToken(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && tokens.length > 0) {
      removeToken(tokens.length - 1);
    }
  };

  return (
    <div
      className="min-h-[28px] px-2 py-1 bg-white/[0.03] border border-white/[0.06] rounded flex flex-wrap gap-1 cursor-text focus-within:border-white/20 transition-colors"
      onClick={() => inputRef.current?.focus()}
    >
      {tokens.map((token, i) => (
        <span key={i} className="flex items-center gap-1 h-5 px-1.5 bg-white/[0.08] rounded text-[10px] font-mono text-white/70">
          {token}
          <button
            type="button"
            onClick={e => { e.stopPropagation(); removeToken(i); }}
            className="text-white/30 hover:text-white/70 leading-none"
          >×</button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (inputValue.trim()) addToken(inputValue); }}
        placeholder={tokens.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[80px] bg-transparent text-[11px] font-mono text-white/70 placeholder:text-white/20 outline-none"
      />
    </div>
  );
}

// =============================================================================
// SETTINGS SHAPE
// =============================================================================

interface StationSettings {
  apolloApiKey?: string;
  anymailApiKey?: string;
  connectorAgentApiKey?: string;
  instantlyApiKey?: string;
  demandCampaignId?: string;
  supplyCampaignId?: string;
  apifyToken?: string;
  aiConfig: IntroAIConfig | null;
}

// =============================================================================
// PR-B — SaveTargetSetButton (inline component, outside Station)
// =============================================================================

function SaveTargetSetButton({ onSave }: { onSave: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="h-7 px-3 text-[11px] rounded text-white/30 hover:text-white/60 transition-colors"
      >
        + save as target set
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && name.trim()) { onSave(name); setEditing(false); setName(''); }
          if (e.key === 'Escape') { setEditing(false); setName(''); }
        }}
        placeholder="set name…"
        className="h-7 px-2 text-[11px] font-mono bg-white/[0.04] border border-white/[0.08] rounded text-white/70 focus:outline-none w-36"
      />
      <button
        onClick={() => { if (name.trim()) { onSave(name); setEditing(false); setName(''); } }}
        className="h-7 px-2 text-[11px] rounded text-white/60 hover:text-white/90"
      >✓</button>
    </div>
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function Station() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  // ==========================================================================
  // OPERATOR SESSION STORE — persists across navigation (sessionStorage)
  // ==========================================================================

  const {
    step, setStep,
    panel, setPanel,
    marketsMode, setMarketsMode,
    demandPackId, setDemandPackId,
    supplyPackId, setSupplyPackId,
    batchSize, setBatchSize,
    customSignals, setCustomSignals,
    customTitleInclude, setCustomTitleInclude,
    customIndustries, setCustomIndustries,
    customEmployeeCount, setCustomEmployeeCount,
    customRevenue, setCustomRevenue,
    customFunding, setCustomFunding,
    customKeywordInclude, setCustomKeywordInclude,
    customKeywordExclude, setCustomKeywordExclude,
    jobListingFilter, setJobListingFilter,
    technologiesInput, setTechnologiesInput,
    matchingResult, setMatchingResult,
    selectedIndices: _selectedIndices, setSelectedIndices,
    rowPhases: _rowPhases, setRowPhases,
    enrichedDemand: _enrichedDemand, setEnrichedDemand,
    enrichedSupply: _enrichedSupply, setEnrichedSupply,
    demandIntros: _demandIntros, setDemandIntros,
    supplyIntros: _supplyIntros, setSupplyIntros,
    demandSendStatus: _demandSendStatus, setDemandSendStatus,
    supplySendStatus: _supplySendStatus, setSupplySendStatus,
    loading, setLoading,
    loadingPhase, setLoadingPhase,
    error, setError,
    firstWinMode, setFirstWinMode,
  } = useOperatorSession();

  // Map/Set — memoized from store's serializable records/arrays
  const selectedIndices = useMemo(() => new Set(_selectedIndices), [_selectedIndices]);
  const rowPhases       = useMemo(() => new Map(Object.entries(_rowPhases)) as Map<string, RowPhase>, [_rowPhases]);
  const enrichedDemand  = useMemo(() => new Map(Object.entries(_enrichedDemand)) as Map<string, EnrichmentResult>, [_enrichedDemand]);
  const enrichedSupply  = useMemo(() => new Map(Object.entries(_enrichedSupply)) as Map<string, EnrichmentResult>, [_enrichedSupply]);
  const demandIntros    = useMemo(() => new Map(Object.entries(_demandIntros)) as Map<string, IntroEntry>, [_demandIntros]);
  const supplyIntros    = useMemo(() => new Map(Object.entries(_supplyIntros)) as Map<string, IntroEntry>, [_supplyIntros]);
  const demandSendStatus = useMemo(
    () => new Map(Object.entries(_demandSendStatus)) as Map<string, 'idle' | 'sending' | 'sent' | 'error'>,
    [_demandSendStatus]
  );
  const supplySendStatus = useMemo(
    () => new Map(Object.entries(_supplySendStatus)) as Map<string, 'idle' | 'sending' | 'sent' | 'error'>,
    [_supplySendStatus]
  );

  // Derive demand/supply NormalizedRecord arrays from matchingResult for DMCB
  const derivedDemandRecords = useMemo(() => {
    if (!matchingResult) return undefined;
    const seen = new Set<string>();
    const out: NormalizedRecord[] = [];
    for (const m of matchingResult.demandMatches) {
      if (!seen.has(m.demand.recordKey)) {
        seen.add(m.demand.recordKey);
        out.push(m.demand);
      }
    }
    return out;
  }, [matchingResult]);

  const derivedSupplyRecords = useMemo(() => {
    if (!matchingResult) return undefined;
    const seen = new Set<string>();
    const out: NormalizedRecord[] = [];
    for (const m of matchingResult.demandMatches) {
      if (!seen.has(m.supply.recordKey)) {
        seen.add(m.supply.recordKey);
        out.push(m.supply);
      }
    }
    return out;
  }, [matchingResult]);

  // — Settings —
  const [settings, setSettings] = useState<StationSettings>({ aiConfig: null });
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Phase 37: Build DMCBAIConfig from IntroAIConfig for DMCB extraction
  const dmcbAiConfig = useMemo(() => {
    const ai = settings.aiConfig;
    if (!ai) return undefined;
    if (ai.provider === 'azure') {
      return {
        provider: 'azure' as const,
        azureApiKey: ai.apiKey,
        azureEndpoint: ai.azureEndpoint,
        azureChatDeployment: ai.azureDeployment,
        model: ai.model,
      };
    } else if (ai.provider === 'anthropic') {
      return {
        provider: 'anthropic' as const,
        anthropicApiKey: ai.apiKey,
        model: ai.model,
      };
    } else {
      return {
        provider: 'openai' as const,
        openaiApiKey: ai.apiKey,
        model: ai.model,
      };
    }
  }, [settings.aiConfig]);

  // Phase 35: Station Runtime — evaluations, handlers, telemetry, keyboard
  const evalCardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const station = useStationRuntime({
    demandIntros: demandIntros as any,
    supplyIntros: supplyIntros as any,
    step,
    evalCardRefs,
    setDemandIntros: setDemandIntros as any,
    setSupplyIntros: setSupplyIntros as any,
    demandRecords: derivedDemandRecords,
    supplyRecords: derivedSupplyRecords,
    aiConfig: dmcbAiConfig,
  });

  // DMCB stats for status bar
  const dmcbStats = useMemo(() => {
    const sigs = station.dmcb.canonicalSignals;
    if (!sigs.length) return null;
    const avg = sigs.reduce((sum, s) => sum + s.confidence, 0) / sigs.length;
    return { accepted: sigs.length, avgConfidence: avg };
  }, [station.dmcb.canonicalSignals]);

  // — Load screen (UI + ephemeral only) —
  const [demandFile, setDemandFile] = useState<File | null>(null);
  const [supplyFile, setSupplyFile] = useState<File | null>(null);
  const [demandDropdownOpen, setDemandDropdownOpen] = useState(false);
  const [supplyDropdownOpen, setSupplyDropdownOpen] = useState(false);
  const [dailyRemaining, setDailyRemaining] = useState<number | null>(null);

  // — Load screen overlay panels —
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [signalPanelOpen, setSignalPanelOpen] = useState(false);
  const [industryPanelOpen, setIndustryPanelOpen] = useState(false);
  const [industrySearch, setIndustrySearch] = useState('');

  // — Intro UI state —
  const [expandedIntros, setExpandedIntros] = useState<Set<string>>(new Set());
  const [introGenerating, setIntroGenerating] = useState<Set<string>>(new Set());

  // — Enrichment progress (transient) —
  const [enrichProgress, setEnrichProgress] = useState({ demand: 0, demandTotal: 0, supply: 0, supplyTotal: 0 });

  // — RunId ref for enrichment cancellation —
  const currentRunIdRef = useRef<string | null>(null);

  // ==========================================================================
  // PR-A — RETENTION STATE
  // ==========================================================================

  // Today's Progress — loaded from localStorage, updated on actions
  const [dailyStats, setDailyStats] = useState<DailyStats>(() => loadDailyStats());
  const [streak, setStreak] = useState<Streak>(() => loadStreak());

  // ==========================================================================
  // OVERLAY SYSTEM STATE — §5, §6, §8 of Fulfillment Overlay Architecture
  // V1: localStorage-backed clients + overlays. No DB required.
  // ==========================================================================

  // Active lens: null = All Signals, string = client ID
  const [activeLensClientId, setActiveLensClientId] = useState<string | null>(() => {
    try { return localStorage.getItem('station_active_lens_client_id') || null; } catch { return null; }
  });

  // Persist active lens to localStorage for SendPage to read
  useEffect(() => {
    if (activeLensClientId) {
      localStorage.setItem('station_active_lens_client_id', activeLensClientId);
    } else {
      localStorage.removeItem('station_active_lens_client_id');
    }
  }, [activeLensClientId]);

  // Clients list — loaded from localStorage
  const [fulfillmentClients, setFulfillmentClients] = useState<FulfillmentClient[]>([]);

  // Overlays list — all versions for all clients
  const [clientOverlays, setClientOverlays] = useState<ClientOverlay[]>([]);

  // Overlay editor modal state
  const [overlayEditorOpen, setOverlayEditorOpen] = useState(false);
  const [editorClientId, setEditorClientId] = useState<string | null>(null);
  const [draftOverlay, setDraftOverlay] = useState<OverlaySpec>(defaultOverlay());

  // PR-B: target sets
  const [targetSets, setTargetSets] = useState<ClientTargetSet[]>(() => {
    try {
      const raw = localStorage.getItem('client_target_sets_v1');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [editorTargetSetId, setEditorTargetSetId] = useState<string | null>(null);

  // Client manager modal state
  const [clientManagerOpen, setClientManagerOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientSide, setNewClientSide] = useState<'demand' | 'supply'>('demand');

  // Client profile modal state
  const [profileClientId, setProfileClientId] = useState<string | null>(null);

  // Lens dropdown open state
  const [lensDropdownOpen, setLensDropdownOpen] = useState(false);

  // Delete confirmation in filters modal
  const [confirmDeleteClient, setConfirmDeleteClient] = useState(false);

  // Source tab — 'market' (Prebuilt Markets, SSM gated) vs 'yourdata' (Apify, open)
  const [sourceTab, setSourceTab] = useState<'market' | 'yourdata'>('yourdata');

  // SSM gate for prebuilt markets
  const [ssmApproved, setSsmApproved] = useState(false);
  const [showSsmModal, setShowSsmModal] = useState(false);

  useEffect(() => {
    // Dev bypass — match SSMGate behavior on localhost
    if (window.location.hostname === 'localhost') {
      setSsmApproved(true);
      setSourceTab('market');
      return;
    }
    if (!user?.email) return;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ssm-access/check?email=${encodeURIComponent(user.email.toLowerCase().trim())}`;
    fetch(url).then(r => r.json()).then(d => {
      if (d.status === 'approved') { setSsmApproved(true); setSourceTab('market'); }
    }).catch(() => {});
  }, [user?.email]);

  const handleSourceTabChange = (mode: 'market' | 'yourdata') => {
    if (mode === 'market' && !ssmApproved) {
      setShowSsmModal(true);
      return;
    }
    setSourceTab(mode);
  };

  // Your Data tab state
  const [yourDemandInput, setYourDemandInput] = useState('');
  const [yourSupplyInput, setYourSupplyInput] = useState('');
  const [yourDemandDesc, setYourDemandDesc] = useState('');
  const [yourSupplyDesc, setYourSupplyDesc] = useState('');
  const [yourDataLoading, setYourDataLoading] = useState(false);
  const [yourDataError, setYourDataError] = useState<string | null>(null);

  // Analyze flow state
  const [analyzeModalOpen, setAnalyzeModalOpen] = useState(false);
  const [analyzeDiagnostics, setAnalyzeDiagnostics] = useState<AnalyzeDiagnostics | null>(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzeProgress, setAnalyzeProgress] = useState<{ done: number; total: number } | null>(null);
  const analyzeCacheRef = useRef<{ canonicalMap: Map<string, DMCBCanonical>; rawRecords: RawRecord[]; timestamp: number; marketName?: string; marketId?: string } | null>(null);

  // Market campaign config — per-market campaign IDs for prebuilt markets (localStorage-backed)
  const [marketCampaigns, setMarketCampaigns] = useState<Record<string, { demandCampaignId: string; supplyCampaignId: string }>>(() => {
    try {
      const raw = localStorage.getItem('market_campaigns');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  // Clear analyze cache when URLs change
  useEffect(() => {
    analyzeCacheRef.current = null;
    setAnalyzeDiagnostics(null);
  }, [yourDemandInput, yourSupplyInput, yourDemandDesc, yourSupplyDesc]);

  // Explain drawer — index of match being explained (null = closed)
  const [explainedMatchIdx, setExplainedMatchIdx] = useState<number | null>(null);

  // ==========================================================================
  // SETTINGS LOAD — exact pattern from Flow.tsx
  // ==========================================================================

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const buildAIConfig = (s: any): IntroAIConfig | null => {
          if (s.azureApiKey && s.azureEndpoint) {
            return {
              provider: 'azure',
              model: s.azureDeployment || 'gpt-4o-mini',
              apiKey: s.azureApiKey,
              azureEndpoint: s.azureEndpoint,
              azureDeployment: s.azureDeployment,
            };
          } else if (s.openaiApiKey) {
            return { provider: 'openai', model: s.aiModel || 'gpt-4o-mini', apiKey: s.openaiApiKey };
          } else if (s.claudeApiKey) {
            return { provider: 'anthropic', model: s.aiModel || 'claude-3-haiku-20240307', apiKey: s.claudeApiKey };
          }
          return null;
        };

        if (isAuthenticated && user?.id) {
          const { data } = await supabase
            .from('operator_settings')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

          const aiSettings = localStorage.getItem('ai_settings');
          const ai = aiSettings ? JSON.parse(aiSettings) : {};
          const aiConfig = buildAIConfig(ai);

          setSettings({
            apolloApiKey: data?.enrichment_api_key || '',
            anymailApiKey: data?.anymail_finder_api_key || '',
            connectorAgentApiKey: data?.connector_agent_api_key || '',
            instantlyApiKey: data?.instantly_api_key || '',
            demandCampaignId: data?.instantly_campaign_demand || '',
            supplyCampaignId: data?.instantly_campaign_supply || '',
            apifyToken: data?.apify_token || '',
            aiConfig,
          });
          // Load market_campaigns from DB (overrides localStorage init)
          if (data?.market_campaigns && typeof data.market_campaigns === 'object') {
            setMarketCampaigns(data.market_campaigns as Record<string, { demandCampaignId: string; supplyCampaignId: string }>);
          }
          // Cache sending config for readCurrentSendConfig() / SendPage
          patchGuestSettings({
            sendingProvider: data?.sending_provider || 'instantly',
            instantlyApiKey: data?.instantly_api_key || '',
            instantlyCampaignDemand: data?.instantly_campaign_demand || '',
            instantlyCampaignSupply: data?.instantly_campaign_supply || '',
            plusvibeApiKey: data?.plusvibe_api_key || '',
            plusvibeWorkspaceId: data?.plusvibe_workspace_id || '',
            plusvibeCampaignDemand: data?.plusvibe_campaign_demand || '',
            plusvibeCampaignSupply: data?.plusvibe_campaign_supply || '',
            operatorId: user?.id || 'guest',
          });
          return;
        }

        // Guest
        const stored = localStorage.getItem('guest_settings');
        if (!stored) { setSettings({ aiConfig: null }); return; }
        const s = JSON.parse(stored)?.settings || JSON.parse(stored) || {};
        const aiConfig = buildAIConfig(s);

        setSettings({
          apolloApiKey: s.apolloApiKey,
          anymailApiKey: s.anymailApiKey,
          connectorAgentApiKey: s.connectorAgentApiKey,
          instantlyApiKey: s.instantlyApiKey,
          demandCampaignId: s.instantlyCampaignDemand,
          supplyCampaignId: s.instantlyCampaignSupply,
          apifyToken: s.apifyToken || s.apify_token || '',
          aiConfig,
        });
        // Load market_campaigns from guest_settings (overrides localStorage init)
        if (s.marketCampaigns && typeof s.marketCampaigns === 'object') {
          setMarketCampaigns(s.marketCampaigns as Record<string, { demandCampaignId: string; supplyCampaignId: string }>);
        }
      } catch (e) {
        console.error('[Station] Settings load error:', e);
        setSettings({ aiConfig: null });
      } finally {
        setSettingsLoaded(true);
      }
    };

    loadSettings();
  }, [isAuthenticated, user?.id]);

  // Reset stale loading state — no async operation can be in-flight on fresh mount
  useEffect(() => {
    if (loading) {
      setLoading(false);
      setLoadingPhase(null);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ==========================================================================
  // OVERLAY SYSTEM — localStorage persistence + computed state (§9.2 V1)
  // ==========================================================================

  // Load clients + overlays from localStorage on mount
  useEffect(() => {
    try {
      const rawClients = localStorage.getItem('station_fulfillment_clients');
      if (rawClients) setFulfillmentClients(JSON.parse(rawClients));
      const rawOverlays = localStorage.getItem('station_client_overlays');
      if (rawOverlays) setClientOverlays(JSON.parse(rawOverlays));
    } catch (e) {
      console.error('[Station] Overlay load error:', e);
    }
  }, []);

  const persistClients = useCallback((clients: FulfillmentClient[]) => {
    setFulfillmentClients(clients);
    localStorage.setItem('station_fulfillment_clients', JSON.stringify(clients));
  }, []);

  const persistOverlays = useCallback((overlays: ClientOverlay[]) => {
    setClientOverlays(overlays);
    localStorage.setItem('station_client_overlays', JSON.stringify(overlays));
  }, []);

  // PR-B: target set persistence
  const persistTargetSets = useCallback((sets: ClientTargetSet[]) => {
    localStorage.setItem('client_target_sets_v1', JSON.stringify(sets));
    setTargetSets(sets);
  }, []);

  const handleSaveAsTargetSet = useCallback((name: string, spec: OverlaySpec) => {
    const newSet: ClientTargetSet = {
      id: crypto.randomUUID(),
      name: name.trim(),
      titles: spec.filters.include.titles,
      industries: spec.filters.include.industries,
      createdAt: new Date().toISOString(),
    };
    persistTargetSets([...targetSets, newSet]);
    setEditorTargetSetId(newSet.id);
  }, [targetSets, persistTargetSets]);

  // Active overlay for the selected lens client
  const activeOverlay = useMemo((): OverlaySpec => {
    if (!activeLensClientId) return defaultOverlay();
    const versions = clientOverlays
      .filter(o => o.clientId === activeLensClientId)
      .sort((a, b) => b.version - a.version);
    const active = versions.find(o => o.isActive) ?? versions[0];
    return active?.overlay ?? defaultOverlay();
  }, [activeLensClientId, clientOverlays]);

  // Overlay version indicator for selected client
  const activeOverlayVersion = useMemo((): number | null => {
    if (!activeLensClientId) return null;
    const versions = clientOverlays
      .filter(o => o.clientId === activeLensClientId)
      .sort((a, b) => b.version - a.version);
    const active = versions.find(o => o.isActive) ?? versions[0];
    return active?.version ?? null;
  }, [activeLensClientId, clientOverlays]);

  // Operator ID for overlay performance queries (matches introductions.operator_id)
  const stationOperatorId = useMemo((): string | null => {
    try {
      const gs = localStorage.getItem('guest_settings');
      if (gs) {
        const { settings } = JSON.parse(gs);
        if (settings?.operatorId) return settings.operatorId;
      }
    } catch { /* ignore */ }
    return user?.id ?? null;
  }, [user]);

  // Overlay context for send-path stamping
  const activeOverlayClientName = useMemo((): string | null => {
    if (!activeLensClientId) return null;
    return fulfillmentClients.find(c => c.id === activeLensClientId)?.name ?? null;
  }, [activeLensClientId, fulfillmentClients]);

  const activeOverlayHash = useMemo((): string | null => {
    if (!activeLensClientId) return null;
    return hashOverlaySpecSync(activeOverlay);
  }, [activeLensClientId, activeOverlay]);

  // Active FulfillmentClient object for the current lens
  const activeFulfillmentClient = useMemo((): FulfillmentClient | null => {
    if (!activeLensClientId) return null;
    return fulfillmentClients.find(c => c.id === activeLensClientId) ?? null;
  }, [activeLensClientId, fulfillmentClients]);

  // Overlay versions for the active lens client (sorted desc)
  const activeLensVersions = useMemo((): ClientOverlay[] => {
    if (!activeLensClientId) return [];
    return clientOverlays
      .filter(o => o.clientId === activeLensClientId)
      .sort((a, b) => b.version - a.version);
  }, [activeLensClientId, clientOverlays]);

  // Hashes and activation windows for performance hook
  const activeLensHashes = useMemo(() =>
    [...new Set(activeLensVersions.map(v => hashOverlaySpecSync(v.overlay)))],
    [activeLensVersions]
  );

  const activeLensWindows = useMemo(() => {
    const windows: Record<string, { activatedAt?: string; deactivatedAt?: string }> = {};
    for (const v of activeLensVersions) {
      const h = hashOverlaySpecSync(v.overlay);
      if (!windows[h] && (v.activatedAt || v.deactivatedAt)) {
        windows[h] = { activatedAt: v.activatedAt, deactivatedAt: v.deactivatedAt };
      }
    }
    return Object.keys(windows).length > 0 ? windows : undefined;
  }, [activeLensVersions]);

  // Overlay performance hook
  const overlayPerf = useOverlayPerformance({
    operatorId: stationOperatorId,
    clientId: activeLensClientId ?? undefined,
    clientName: activeOverlayClientName ?? undefined,
    hashes: activeLensHashes,
    activationWindows: activeLensWindows,
  });

  // Overlay suggestions hook
  const overlaySuggestions = useOverlaySuggestions({
    operatorId: stationOperatorId,
    client: activeFulfillmentClient,
    currentOverlay: activeOverlay,
    overlayHash: activeOverlayHash || '',
  });

  // Ranked matches — computed deterministically from activeOverlay + matchingResult
  const rankedMatches = useMemo((): RankedMatchEntry[] => {
    if (!matchingResult) return [];
    return rankAllMatches(matchingResult.demandMatches, activeOverlay);
  }, [matchingResult, activeOverlay]);

  // Helpers — create client, create overlay version, activate overlay
  const handleCreateClient = useCallback(() => {
    if (!newClientName.trim()) return;
    const now = new Date().toISOString();
    const client: FulfillmentClient = {
      id: crypto.randomUUID(),
      name: newClientName.trim(),
      economicSide: newClientSide,
      status: 'active',
      createdAt: now,
    };
    const updated = [...fulfillmentClients, client];
    persistClients(updated);
    // Create default overlay version 1 for the new client
    const overlay: ClientOverlay = {
      id: crypto.randomUUID(),
      clientId: client.id,
      version: 1,
      isActive: true,
      overlay: defaultOverlay(),
      createdAt: now,
      activatedAt: now,
    };
    const updatedOverlays = [...clientOverlays, overlay];
    persistOverlays(updatedOverlays);
    setNewClientName('');
    setNewClientSide('demand');
  }, [newClientName, newClientSide, fulfillmentClients, clientOverlays, persistClients, persistOverlays]);

  const handleSaveOverlay = useCallback((clientId: string, spec: OverlaySpec) => {
    const existing = clientOverlays.filter(o => o.clientId === clientId);
    const maxVersion = existing.reduce((m, o) => Math.max(m, o.version), 0);
    const newVersion: ClientOverlay = {
      id: crypto.randomUUID(),
      clientId,
      version: maxVersion + 1,
      isActive: false,  // H6 fix: save is append-only; existing active stays active
      overlay: spec,
      createdAt: new Date().toISOString(),
    };
    // H6 fix: do NOT deactivate existing overlays — only append the new inactive version.
    // Activation is a separate explicit action via handleActivateOverlay.
    persistOverlays([...clientOverlays, newVersion]);
  }, [clientOverlays, persistOverlays]);

  const handleActivateOverlay = useCallback((overlayId: string) => {
    const target = clientOverlays.find(o => o.id === overlayId);
    if (!target) return;
    const now = new Date().toISOString();
    const updated = clientOverlays.map(o => {
      if (o.clientId !== target.clientId) return o;
      if (o.id === overlayId) {
        return { ...o, isActive: true, activatedAt: now, deactivatedAt: undefined };
      }
      if (o.isActive) {
        return { ...o, isActive: false, deactivatedAt: now };
      }
      return o;
    });
    persistOverlays(updated);
  }, [clientOverlays, persistOverlays]);

  // Manual lock toggle — per-client governance
  const handleToggleManualLock = useCallback((clientId: string) => {
    const updated = fulfillmentClients.map(c =>
      c.id === clientId ? { ...c, lockedManual: !c.lockedManual } : c
    );
    persistClients(updated);
  }, [fulfillmentClients, persistClients]);

  // Apply suggestion — creates a new INACTIVE overlay version with proposed changes
  const handleApplySuggestion = useCallback((suggestion: OverlaySuggestion) => {
    if (!editorClientId || !suggestion.proposedDiff) return;
    const mergedSpec: OverlaySpec = {
      ...draftOverlay,
      ...suggestion.proposedDiff,
      filters: {
        ...draftOverlay.filters,
        ...(suggestion.proposedDiff.filters || {}),
        include: {
          ...draftOverlay.filters?.include,
          ...(suggestion.proposedDiff.filters?.include || {}),
        },
        exclude: {
          ...draftOverlay.filters?.exclude,
          ...(suggestion.proposedDiff.filters?.exclude || {}),
        },
      },
      weights: {
        ...draftOverlay.weights,
        ...(suggestion.proposedDiff.weights || {}),
      },
    };
    handleSaveOverlay(editorClientId, mergedSpec);
  }, [editorClientId, draftOverlay, handleSaveOverlay]);

  // Dismiss suggestion — 7-day cooldown stored on FulfillmentClient
  const handleDismissSuggestion = useCallback((suggestionId: string) => {
    if (!activeLensClientId) return;
    const cooldownUntil = new Date(Date.now() + 7 * 86400000).toISOString();
    const updated = fulfillmentClients.map(c => {
      if (c.id !== activeLensClientId) return c;
      return {
        ...c,
        suggestionDismissals: {
          ...(c.suggestionDismissals || {}),
          [suggestionId]: cooldownUntil,
        },
      };
    });
    persistClients(updated);
  }, [activeLensClientId, fulfillmentClients, persistClients]);

  // ==========================================================================
  // LOAD HANDLERS
  // ==========================================================================

  const handleCsvLoad = useCallback(async () => {
    if (!demandFile || !supplyFile) return;
    setLoading(true);
    setError(null);
    try {
      const demandRows = await parseCsv(demandFile);
      const supplyRows = await parseCsv(supplyFile);

      const demandRecords = demandRows
        .map(row => normalize(row, CSV_SCHEMA))
        .map(r => ({ ...r, side: r.side ?? ('demand' as const), origin: r.origin ?? ('csv' as const) }));

      const supplyRecords = supplyRows
        .map(row => normalize(row, CSV_SCHEMA))
        .map(r => ({ ...r, side: r.side ?? ('supply' as const), origin: r.origin ?? ('csv' as const) }));

      const result = await matchRecords(demandRecords, supplyRecords);

      // A8 — zero matches guard
      if (result.demandMatches.length === 0) {
        setError('No matches found — check that demand and supply data are from the same market.');
        return;
      }

      setMatchingResult(result);
      setStep('station');
      setPanel('match_review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV');
    } finally {
      setLoading(false);
    }
  }, [demandFile, supplyFile]);

  // Build MarketSearchOptions from custom filter state for one side
  const buildCustomOptions = useCallback((
    signals: string[], titleInclude: string, titleExclude: string,
    industries: string[], employeeCount: string[], revenue: string[], funding: string[],
    keywordInclude: string, keywordExclude: string, targetCount: number,
    jobListing: string, technologies: string,
  ): Partial<MarketSearchOptions> => {
    const tInc = titleInclude.split(',').map(s => s.trim()).filter(Boolean);
    const tExc = titleExclude.split(',').map(s => s.trim()).filter(Boolean);
    const jl = jobListing.split(',').map(s => s.trim()).filter(Boolean);
    const tech = technologies.split(',').map(s => s.trim()).filter(Boolean);
    return {
      news: signals.length > 0 ? signals : undefined,
      title: (tInc.length > 0 || tExc.length > 0) ? { include: tInc, exclude: tExc } : undefined,
      subIndustry: industries.length > 0 ? { include: industries, exclude: [] } : undefined,
      employeeCount: employeeCount.length > 0
        ? employeeCount.map(label => {
            const opt = EMPLOYEE_COUNT_OPTIONS.find(o => o.label === label)!;
            return { op: 'preset_between', min: opt.min, max: opt.max };
          })
        : undefined,
      revenue: revenue.length > 0 ? revenue : undefined,
      fundingType: funding.length > 0 ? funding : undefined,
      jobListingFilter: jl.length > 0 ? jl : undefined,
      technologies: tech.length > 0 ? tech : undefined,
      keywordFilter: (keywordInclude || keywordExclude)
        ? { include: keywordInclude, exclude: keywordExclude }
        : undefined,
      targetCount,
      showOneLeadPerCompany: true,
    };
  }, []);

  const handleMarketsLoad = useCallback(async () => {
    if (loading) return;
    if (!settings.instantlyApiKey) return;
    setLoading(true);
    setError(null);
    setLoadingPhase('scanning market…');
    try {
      let demandOptions: Partial<MarketSearchOptions>;
      let supplyOptions: Partial<MarketSearchOptions>;
      let demandLabel: string;
      let supplyLabel: string;
      let market: string;

      if (marketsMode === 'pack') {
        if (!demandPackId || !supplyPackId) return;
        const allPacks = MARKETS.flatMap(m => m.packs);
        const demandPack = allPacks.find(p => p.id === demandPackId);
        const supplyPack = allPacks.find(p => p.id === supplyPackId);
        if (!demandPack || !supplyPack) return;
        // Same-market guard — demand and supply must be from the same market
        const demandMarketId = PACK_TO_MARKET.get(demandPackId);
        const supplyMarketId = PACK_TO_MARKET.get(supplyPackId);
        if (demandMarketId !== supplyMarketId) {
          setError('Demand and supply packs must be from the same market.');
          return;
        }
        demandOptions = { ...packToSearchOptions(demandPack), targetCount: batchSize };
        supplyOptions = { ...packToSearchOptions(supplyPack), targetCount: batchSize };
        demandLabel = demandPack.name;
        supplyLabel = supplyPack.name;
        market = demandMarketId || demandPack.id.split('.')[0];
      } else {
        // Demand: watch signals for trigger events + job posting filter
        demandOptions = buildCustomOptions(
          customSignals, '', '', [], [], [], [],
          '', '', batchSize,
          jobListingFilter, '',
        );
        // Supply: who to target by profile (title + industries + advanced + technologies)
        supplyOptions = buildCustomOptions(
          [], customTitleInclude, '', customIndustries,
          customEmployeeCount, customRevenue, customFunding,
          customKeywordInclude, customKeywordExclude, batchSize,
          '', technologiesInput,
        );
        demandLabel = customSignals.length > 0
          ? NEWS_SIGNALS.filter(s => customSignals.includes(s.value)).map(s => s.label).join(', ')
          : 'Custom demand';
        supplyLabel = customTitleInclude || customIndustries.length > 0
          ? [customTitleInclude, ...customIndustries.slice(0, 2)].filter(Boolean).join(', ')
          : 'Custom supply';
        market = 'custom';
      }

      const [demandResult, supplyResult] = await Promise.all([
        searchMarkets({ apiKey: settings.instantlyApiKey, ...demandOptions }),
        searchMarkets({ apiKey: settings.instantlyApiKey, ...supplyOptions }),
      ]);

      if (demandResult.error || supplyResult.error) {
        setError(demandResult.error || supplyResult.error || 'Search failed');
        return;
      }

      setLoadingPhase(`scanning market… ${demandResult.records.length + supplyResult.records.length} companies`);

      const remaining = Math.min(
        demandResult.dailyRemaining ?? 5000,
        supplyResult.dailyRemaining ?? 5000,
      );
      setDailyRemaining(remaining);

      setLoadingPhase('enriching companies… 0 of ?');

      const allCompanyIds = [...new Set([
        ...demandResult.records.map(r => (r.raw as any)?.lead?.companyId).filter(Boolean),
        ...supplyResult.records.map(r => (r.raw as any)?.lead?.companyId).filter(Boolean),
      ])];
      const companyMap = allCompanyIds.length > 0
        ? await enrichCompanies(allCompanyIds, (done, total) => {
            setLoadingPhase(`enriching companies… ${done} of ${total}`);
          })
        : new Map();

      // Fallback: AI descriptions for companies missing description
      const allRecords = [...demandResult.records, ...supplyResult.records];
      const missingDescNames: string[] = [];
      const idToName = new Map<string, string>();
      for (const r of allRecords) {
        const lead = (r.raw as any)?.lead;
        const companyId = lead?.companyId ? String(lead.companyId) : null;
        const companyName = lead?.companyName || '';
        if (!companyId || !companyName) continue;
        const existing = companyMap.get(companyId);
        if (!existing || !existing.description) {
          if (!idToName.has(companyId)) {
            missingDescNames.push(companyName);
            idToName.set(companyId, companyName);
          }
        }
      }
      if (missingDescNames.length > 0) {
        setLoadingPhase(`enriching companies… fetching ${missingDescNames.length} profiles`);
        const fallbackDescs = await fetchFallbackDescriptions([...new Set(missingDescNames)], (done, total) => {
          setLoadingPhase(`enriching companies… ${done} of ${total} profiles`);
        });
        for (const [companyId, companyName] of idToName) {
          const desc = fallbackDescs.get(companyName);
          if (desc) {
            const existing = companyMap.get(companyId) || {};
            companyMap.set(companyId, { ...existing, description: desc } as any);
          }
        }
      }

      setLoadingPhase('enriching companies… building records');

      const packId = marketsMode === 'pack' ? demandPackId : 'custom';

      const demandRecords = demandResult.records.map(r => {
        const lead = (r.raw as any)?.lead;
        const company = companyMap.get(lead?.companyId) || null;
        const rec = normalizeToRecord(lead, company, demandLabel, null);
        return { ...rec, side: 'demand' as const, market, packId, origin: 'markets' as const };
      });

      const supplyRecords = supplyResult.records.map(r => {
        const lead = (r.raw as any)?.lead;
        const company = companyMap.get(lead?.companyId) || null;
        const rec = normalizeToRecord(lead, company, supplyLabel, null);
        return { ...rec, side: 'supply' as const, market, packId: marketsMode === 'pack' ? supplyPackId : 'custom', origin: 'markets' as const };
      });

      if (!dmcbAiConfig) {
        setError('AI configuration required. Check Settings.');
        return;
      }

      // Signal classification — at ingestion boundary, BEFORE canonical extraction
      // Pack context gives deterministic classification when pack has exactly 1 signal type.
      // Text classifier is fallback for multi-signal packs and custom mode.
      const eventMetaMap = new Map<string, SignalClassification>();
      if (marketsMode === 'pack') {
        const allPacks = MARKETS.flatMap(m => m.packs);
        const demandPackObj = allPacks.find(p => p.id === demandPackId);
        const packClass = demandPackObj?.filters?.signals
          ? classifyFromPack(demandPackObj.filters.signals)
          : null;
        for (const r of demandRecords) {
          const sc = packClass || classifySignal(r.signal);
          if (sc) eventMetaMap.set(r.recordKey, sc);
        }
      } else {
        // Custom mode — classify from signal text
        for (const r of demandRecords) {
          const sc = classifySignal(r.signal);
          if (sc) eventMetaMap.set(r.recordKey, sc);
        }
      }
      // Persist signal events first — before canonical extraction
      if (eventMetaMap.size > 0) {
        const srcSystem = marketsMode === 'pack' ? 'instantly_pack' as const : 'unknown' as const;
        persistSignalEvents(eventMetaMap, srcSystem).catch(err =>
          console.warn('[station] signal events persist failed (non-blocking):', err),
        );
      }

      // V5: AI extraction → persist canonicals → mcp-orchestrate → navigate to runs
      setLoadingPhase('interpreting intent…');
      const rawRecords = toRawRecords([...demandRecords, ...supplyRecords], 'markets');
      const { canonicalMap, errors: extractErrors } = await extractCanonicals({
        raw: rawRecords,
        ai: dmcbAiConfig,
        onProgress: (done, total) => setLoadingPhase(`interpreting intent… ${done}/${total}`),
      });
      if (extractErrors.length > 0) {
        console.warn(`[station] AI extraction: ${extractErrors.length} errors out of ${rawRecords.length} records`);
      }
      const demandKeys = demandRecords
        .filter(r => canonicalMap.has(r.recordKey))
        .map(r => r.recordKey);
      const supplyKeys = supplyRecords
        .filter(r => canonicalMap.has(r.recordKey))
        .map(r => r.recordKey);
      if (demandKeys.length === 0 || supplyKeys.length === 0) {
        setError('No valid demand or supply records found after AI extraction.');
        return;
      }

      // Compute diagnostics and show AnalyzeModal — same gate as Apify path.
      // User clicks Run in the modal → handleAnalyzeRun() fires the orchestrator.
      const computeDiag = (recs: typeof demandRecords) => {
        let companyFound = 0, domainFound = 0, totalConf = 0, extracted = 0;
        for (const r of recs) {
          const c = canonicalMap.get(r.recordKey);
          if (c) { extracted++; if (c.company) companyFound++; if (c.domain) domainFound++; totalConf += c.confidence ?? 0; }
        }
        return { total: recs.length, extracted, errors: recs.length - extracted, companyFound, domainFound, avgConfidence: extracted > 0 ? totalConf / extracted : 0, missingFields: [] as string[] };
      };
      const demandDiag = computeDiag(demandRecords);
      const supplyDiag = computeDiag(supplyRecords);
      const canRun = (demandDiag.companyFound > 0 || demandDiag.domainFound > 0)
        && (supplyDiag.companyFound > 0 || supplyDiag.domainFound > 0);

      analyzeCacheRef.current = { canonicalMap, rawRecords, timestamp: Date.now(), marketName: marketsMode === 'pack' ? market : 'Custom Market', marketId: marketsMode === 'pack' ? market : 'custom' };
      setAnalyzeDiagnostics({ demand: demandDiag, supply: supplyDiag, canRun });
      setAnalyzeModalOpen(true);
      return;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Markets search failed');
    } finally {
      setLoading(false);
      setLoadingPhase(null);
    }
  }, [
    loading,
    marketsMode, demandPackId, supplyPackId, settings.instantlyApiKey,
    customSignals, customTitleInclude, customIndustries,
    customEmployeeCount, customRevenue, customFunding,
    customKeywordInclude, customKeywordExclude, batchSize,
    buildCustomOptions, dmcbAiConfig, navigate,
  ]);

  // ==========================================================================
  // YOUR DATA — Analyze (fetch + AI extraction + diagnostics)
  // ==========================================================================

  async function handleAnalyze() {
    if (!yourDemandInput.trim() || !yourSupplyInput.trim()) return;
    // Cache hit — reopen modal instantly, skip fetch + extraction
    if (analyzeCacheRef.current && analyzeDiagnostics) {
      setAnalyzeModalOpen(true);
      return;
    }
    if (!dmcbAiConfig) {
      setAnalyzeError('__no_ai__');
      return;
    }

    try {
      setAnalyzeLoading(true);
      setAnalyzeError(null);
      setAnalyzeProgress(null);

      // 1. Fetch both datasets (append token if available)
      const demandUrl = resolveApifyInput(yourDemandInput);
      const supplyUrl = resolveApifyInput(yourSupplyInput);
      const token = settings.apifyToken?.trim();
      const appendToken = (url: string) =>
        token ? `${url}${url.includes('?') ? '&' : '?'}token=${token}` : url;

      const [demandItems, supplyItems] = await Promise.all([
        fetchApifyDataset(appendToken(demandUrl)),
        fetchApifyDataset(appendToken(supplyUrl)),
      ]);
      console.log('[station:analyze] fetched', { demand: demandItems.length, supply: supplyItems.length });

      // 2. Convert to RawRecords with stamped side + generated recordKey
      const rawRecords = toRawRecordsFromApify(demandItems, supplyItems, {
        demandContext: yourDemandDesc.trim() || undefined,
        supplyContext: yourSupplyDesc.trim() || undefined,
      });
      console.log('[station:analyze] rawRecords', rawRecords.length);

      // 3. AI extraction with progress callback
      const { canonicalMap, errors } = await extractCanonicals({
        raw: rawRecords,
        ai: dmcbAiConfig,
        onProgress: (done, total) => setAnalyzeProgress({ done, total }),
      });
      console.log('[station:analyze] extracted', { canonical: canonicalMap.size, errors: errors.length });

      // 4. Compute per-side diagnostics
      const demandRaws = rawRecords.filter(r => r.side === 'demand');
      const supplyRaws = rawRecords.filter(r => r.side === 'supply');

      function computeSideDiag(raws: RawRecord[], sideLabel: string) {
        let companyFound = 0;
        let domainFound = 0;
        let totalConf = 0;
        let extracted = 0;

        for (const rr of raws) {
          const c = canonicalMap.get(rr.recordKey);
          if (c) {
            extracted++;
            if (c.company) companyFound++;
            if (c.domain) domainFound++;
            totalConf += c.confidence ?? 0;
          }
        }

        const sideErrors = errors.filter(e => raws.some(r => r.recordKey === e.id)).length;
        const avg = extracted > 0 ? totalConf / extracted : 0;

        return {
          total: raws.length,
          extracted,
          errors: sideErrors,
          companyFound,
          domainFound,
          avgConfidence: avg,
          missingFields: [],
        };
      }

      const demandDiag = computeSideDiag(demandRaws, 'demand');
      const supplyDiag = computeSideDiag(supplyRaws, 'supply');
      const canRun = (demandDiag.companyFound > 0 || demandDiag.domainFound > 0)
        && (supplyDiag.companyFound > 0 || supplyDiag.domainFound > 0);

      const diagnostics: AnalyzeDiagnostics = {
        demand: demandDiag,
        supply: supplyDiag,
        canRun,
      };

      // 5. Cache results for Run
      analyzeCacheRef.current = { canonicalMap, rawRecords, timestamp: Date.now() };
      setAnalyzeDiagnostics(diagnostics);
      setAnalyzeModalOpen(true);

    } catch (e) {
      console.error('[station:analyze]', e);
      setAnalyzeError((e as Error).message);
    } finally {
      setAnalyzeLoading(false);
      setAnalyzeProgress(null);
    }
  }

  // ==========================================================================
  // YOUR DATA — Export CSV (from analyze modal, uses cached raw records)
  // ==========================================================================

  const handleAnalyzeExport = useCallback(() => {
    const cache = analyzeCacheRef.current;
    if (!cache) return;

    const CSV_COLS = ['fullName','firstName','lastName','email','title','company','domain','industry','signal','city','state','country','linkedin','companyDescription'] as const;
    const escape = (v: any) => {
      if (v == null || v === '') return '';
      const s = String(v).replace(/"/g, '""');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
    };

    const rows = cache.rawRecords.map(r => {
      const p = r.payload as any;
      // NormalizedRecord payloads have direct fields; Apify payloads have nested JSON
      return CSV_COLS.map(col => escape(p?.[col])).join(',');
    });

    const csv = [CSV_COLS.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // ==========================================================================
  // YOUR DATA — Run (from modal, uses cached extraction, zero AI re-calls)
  // ==========================================================================

  async function handleAnalyzeRun() {
    const cache = analyzeCacheRef.current;
    if (!cache) return;
    if (!dmcbAiConfig) {
      setAnalyzeError('AI configuration required. Check Settings.');
      return;
    }

    // Staleness guard: reject cache older than 30 minutes
    if (cache.timestamp && Date.now() - cache.timestamp > 30 * 60 * 1000) {
      setAnalyzeError('Analysis data is stale. Please re-run Analyze.');
      analyzeCacheRef.current = null;
      setAnalyzeDiagnostics(null);
      return;
    }

    const { canonicalMap, rawRecords } = cache;
    const demandKeys = rawRecords.filter(r => r.side === 'demand').map(r => r.recordKey);
    const supplyKeys = rawRecords.filter(r => r.side === 'supply').map(r => r.recordKey);

    // =========================================================================
    // FULFILLMENT: promote client into a canonical if active
    // =========================================================================
    const client = activeFulfillmentClient;
    let fulfillmentKey: string | undefined;
    let fulfillmentSide: 'demand' | 'supply' | undefined;

    if (client) {
      if (!client.profile?.companyDescription) {
        setAnalyzeError('Fill in client profile (company description) before running fulfillment.');
        return;
      }
      // Stable record_key from client ID — fc_ prefix never collides with d_/s_
      fulfillmentKey = client.canonicalKey || `fc_${client.id.replace(/-/g, '').slice(0, 8)}`;
      fulfillmentSide = client.economicSide;

      // Persist canonicalKey back to client so RunDetailPageV2 can read it
      if (!client.canonicalKey) {
        client.canonicalKey = fulfillmentKey;
        const allClients: typeof client[] = JSON.parse(localStorage.getItem('station_fulfillment_clients') || '[]');
        const idx = allClients.findIndex(c => c.id === client.id);
        if (idx >= 0) { allClients[idx] = { ...allClients[idx], canonicalKey: fulfillmentKey }; }
        localStorage.setItem('station_fulfillment_clients', JSON.stringify(allClients));
      }

      // Build canonical from client profile
      const p = client.profile;
      const clientCanonical: DMCBCanonical = {
        role: client.economicSide,
        company: client.name,
        who: client.name,
        wants: client.economicSide === 'demand' ? (p.companyDescription || '') : '',
        offers: client.economicSide === 'supply' ? (p.companyDescription || '') : '',
        why_now: '',
        constraints: [],
        proof: p.caseStudy || '',
        confidence: 1.0,
        domain: null,
        industry: p.specialization || null,
        keywords: [...(p.differentiators || []), ...(p.painPoints || [])].slice(0, 10),
        entity_type: 'organization',
      };
      canonicalMap.set(fulfillmentKey, clientCanonical);
    }

    // Validate sides — in fulfillment, only the OTHER side is required from the dataset
    if (client && fulfillmentSide === 'supply') {
      if (demandKeys.length === 0) {
        setAnalyzeError('Fulfillment client is supply — need demand records in the dataset.');
        return;
      }
    } else if (client && fulfillmentSide === 'demand') {
      if (supplyKeys.length === 0) {
        setAnalyzeError('Fulfillment client is demand — need supply records in the dataset.');
        return;
      }
    } else if (!client) {
      if (demandKeys.length === 0 || supplyKeys.length === 0) {
        setAnalyzeError('Need both demand and supply records.');
        return;
      }
    }

    try {
      // Signal classification for Apify data — text classifier (no pack context)
      const eventMetaMap = new Map<string, SignalClassification>();
      for (const r of rawRecords) {
        if (r.side === 'demand') {
          // rawRecords from Apify: use signal field from the payload for classification
          const canonical = canonicalMap.get(r.recordKey);
          const signalText = canonical?.why_now || r.payload?.signal || '';
          if (signalText) {
            const sc = classifySignal(signalText);
            if (sc) eventMetaMap.set(r.recordKey, sc);
          }
        }
      }
      if (eventMetaMap.size > 0) {
        persistSignalEvents(eventMetaMap, 'apify').catch(err =>
          console.warn('[station] signal events persist failed (non-blocking):', err),
        );
      }

      const jobId = `v5-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await persistCanonicals(canonicalMap, jobId);

      // Resolve market + campaign pair for immutable snapshot
      const marketId = cache.marketId || 'custom';
      const mktCampaigns = marketCampaigns[marketId];
      const sendCfg = readCurrentSendConfig();
      let campaignPair: Record<string, unknown> | null = null;

      if (mktCampaigns?.demandCampaignId && mktCampaigns?.supplyCampaignId) {
        // market_campaigns is the sole source for new jobs
        campaignPair = {
          marketId,
          marketName: cache.marketName || 'Custom',
          provider: sendCfg?.provider || 'instantly',
          demandCampaignId: mktCampaigns.demandCampaignId,
          supplyCampaignId: mktCampaigns.supplyCampaignId,
          operatorId: sendCfg?.operatorId || stationOperatorId || 'guest',
          providerWorkspaceId: sendCfg?.provider === 'plusvibe' ? sendCfg.workspaceId || null : null,
        };
      }
      // No fallback to global Settings — market_campaigns is the sole source for new jobs.
      // If no campaigns configured, campaignPair stays null → SendPage won't allow sending.

      const { error: jobError } = await supabase.from('mcp_jobs').upsert({
        job_id: jobId,
        status: 'pending',
        market_name: client ? `Fulfillment: ${client.name}` : (cache.marketName || 'Apify Dataset'),
        market_id: marketId,
        started_at: new Date().toISOString(),
        config: {
          demandCount: demandKeys.length,
          supplyCount: supplyKeys.length,
          ...(campaignPair ? { campaignPair } : {}),
          ...(client ? { fulfillment: { key: fulfillmentKey, side: fulfillmentSide, clientName: client.name } } : {}),
        },
      }, { onConflict: 'job_id' });
      if (jobError) throw new Error(`Failed to create job: ${jobError.message}`);

      const orchBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp-orchestrate`;
      fetch(orchBase, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          jobId,
          demandKeys,
          supplyKeys,
          ...(fulfillmentKey ? { clientKey: fulfillmentKey, clientSide: fulfillmentSide } : {}),
          aiConfig: dmcbAiConfig,
          topK: 10,
        }),
      }).catch((err) => console.error('[station] orchestrate POST failed:', err));

      setAnalyzeModalOpen(false);
      navigate('/station/runs');
    } catch (err) {
      setAnalyzeError((err as Error).message || 'Failed to launch evaluation');
    }
  }

  // ==========================================================================
  // SELECTION HANDLERS
  // ==========================================================================

  const FIRST_WIN_CAP = 10;

  const handleToggleRow = useCallback((idx: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        // PR-A: First Win Mode caps selection at 10
        if (firstWinMode && next.size >= FIRST_WIN_CAP) return prev;
        next.add(idx);
      }
      return next;
    });
  }, [firstWinMode]);

  const handleSelectAll = useCallback(() => {
    if (!matchingResult) return;
    // L3 fix: in client lens mode, only select matches that passed overlay gates
    if (activeLensClientId) {
      const includedIndices = rankedMatches
        .filter(e => e.result.included)
        .map(e => e.matchIndex);
      // PR-A: cap at 10 in First Win Mode
      const capped = firstWinMode ? includedIndices.slice(0, FIRST_WIN_CAP) : includedIndices;
      setSelectedIndices(new Set(capped));
    } else if (firstWinMode) {
      // First Win Mode: select up to 10 strong-tier matches only
      const strongIndices = matchingResult.demandMatches
        .map((m, i) => ({ m, i }))
        .filter(({ m }) => m.tier === 'strong')
        .slice(0, FIRST_WIN_CAP)
        .map(({ i }) => i);
      setSelectedIndices(new Set(strongIndices));
    } else {
      setSelectedIndices(new Set(matchingResult.demandMatches.map((_, i) => i)));
    }
  }, [matchingResult, activeLensClientId, rankedMatches, firstWinMode]);

  const handleClearAll = useCallback(() => {
    setSelectedIndices(new Set());
  }, []);

  // ==========================================================================
  // ENRICHMENT HANDLER
  // ==========================================================================

  const handleEnrich = useCallback(async () => {
    if (!matchingResult || selectedIndices.size === 0) return;

    // PR-A: count reviewed (selections entering enrichment)
    const reviewedNext = { ...loadDailyStats(), reviewed: loadDailyStats().reviewed + selectedIndices.size };
    saveDailyStats(reviewedNext);
    setDailyStats(reviewedNext);

    const selected = Array.from(selectedIndices);
    const matches = matchingResult.demandMatches;

    // Build unique demand + supply records
    const demandMap = new Map<string, NormalizedRecord>();
    const supplyMap = new Map<string, NormalizedRecord>();
    for (const i of selected) {
      demandMap.set(matches[i].demand.domain || matches[i].demand.recordKey, matches[i].demand);
      supplyMap.set(matches[i].supply.domain || matches[i].supply.recordKey, matches[i].supply);
    }
    const demandToEnrich = Array.from(demandMap.values());
    const supplyToEnrich = Array.from(supplyMap.values());

    // A7 — preflight: manual inspection
    const enrichSettings: EnrichmentSettings = {
      apolloApiKey: settings.apolloApiKey,
      anymailApiKey: settings.anymailApiKey,
      connectorAgentApiKey: settings.connectorAgentApiKey,
    };

    const enrichableRecords = demandToEnrich.map(r => ({
      domain: r.domain,
      company: r.company,
      name: r.fullName ?? undefined,
    }));

    const plan = buildEnrichmentPlan(enrichableRecords, enrichSettings);
    const onlyCA = plan.summary.enabledProviders.length === 1 &&
      plan.summary.enabledProviders[0] === 'connectorAgent';
    if (onlyCA && plan.summary.recordsMissingDomain > 0) {
      setError(`${plan.summary.recordsMissingDomain} records missing domain — ConnectorAgent requires domain.`);
      return;
    }

    if (plan.summary.enabledProviders.length === 0) {
      setError('No enrichment providers configured — add Apollo or Anymail API key in Settings.');
      return;
    }

    const runId = crypto.randomUUID();
    currentRunIdRef.current = runId;

    // Set selected rows to 'enriching'
    setRowPhases(prev => {
      const next = new Map(prev);
      for (const i of selected) next.set(rowKey(i), 'enriching');
      return next;
    });

    setPanel('enriching');
    setEnrichProgress({ demand: 0, demandTotal: demandToEnrich.length, supply: 0, supplyTotal: supplyToEnrich.length });
    setError(null);

    const enrichConfig: EnrichmentConfig = {
      apolloApiKey: settings.apolloApiKey,
      anymailApiKey: settings.anymailApiKey,
      connectorAgentApiKey: settings.connectorAgentApiKey,
    };

    try {
      // Enrich demand
      const demandResults = await enrichBatch(
        demandToEnrich,
        CSV_SCHEMA,
        enrichConfig,
        (current, total) => setEnrichProgress(prev => ({ ...prev, demand: current, demandTotal: total })),
        runId,
        (key, result) => setEnrichedDemand(prev => new Map(prev).set(key, result)),
        () => runId !== currentRunIdRef.current,
      );

      if (runId !== currentRunIdRef.current) return; // Cancelled
      setEnrichedDemand(demandResults);

      // Enrich supply
      const supplyResults = await enrichBatch(
        supplyToEnrich,
        CSV_SCHEMA,
        enrichConfig,
        (current, total) => setEnrichProgress(prev => ({ ...prev, supply: current, supplyTotal: total })),
        runId,
        (key, result) => setEnrichedSupply(prev => new Map(prev).set(key, result)),
        () => runId !== currentRunIdRef.current,
      );

      if (runId !== currentRunIdRef.current) return; // Cancelled
      setEnrichedSupply(supplyResults);

      // Mark all selected rows as 'enriched'
      setRowPhases(prev => {
        const next = new Map(prev);
        for (const i of selected) next.set(rowKey(i), 'enriched');
        return next;
      });

      setPanel('route');
    } catch (err) {
      if (runId !== currentRunIdRef.current) return;
      setError('Enrichment failed — check API keys and try again.');
      setPanel('match_review');
      // Reset enriching rows back to matched
      setRowPhases(prev => {
        const next = new Map(prev);
        for (const i of selected) {
          if (next.get(rowKey(i)) === 'enriching') next.set(rowKey(i), 'matched');
        }
        return next;
      });
    }
  }, [matchingResult, selectedIndices, settings]);

  const handleCancelEnrichment = useCallback(() => {
    currentRunIdRef.current = null;
    setPanel('match_review');
    setRowPhases(prev => {
      const next = new Map(prev);
      for (const [key, phase] of next) {
        if (phase === 'enriching') next.set(key, 'matched');
      }
      return next;
    });
  }, []);

  // ==========================================================================
  // INTRO GENERATION
  // ==========================================================================

  const handleGenerateIntro = useCallback(async (matchIdx: number) => {
    if (!matchingResult || !settings.aiConfig) return;
    const match = matchingResult.demandMatches[matchIdx];
    const key = rowKey(matchIdx);

    setIntroGenerating(prev => new Set(prev).add(key));

    try {
      const { demand, supply, edge } = matchToIntroInputs(match);
      const result = await generateIntrosAI(settings.aiConfig, demand, supply, edge);

      setDemandIntros(prev => new Map(prev).set(key, { text: result.demandIntro, source: 'ai' }));
      setSupplyIntros(prev => new Map(prev).set(key, { text: result.supplyIntro, source: 'ai' }));
      setRowPhases(prev => new Map(prev).set(key, 'generated'));
      // PR-A: track generated count
      const g = { ...loadDailyStats(), generated: loadDailyStats().generated + 1 };
      saveDailyStats(g); setDailyStats(g);
    } catch {
      // AI failed — fall back to Composer template (same system used everywhere else)
      try {
        const { demand, supply, edge } = matchToIntroInputs(match);
        const counterparty: Counterparty = {
          company: match.supply.company || '',
          contact: match.supply.fullName || '',
          email: match.supply.email || '',
          title: match.supply.title || '',
          fitReason: match.tierReason || '',
        };
        const composed = composeIntros(demand, edge, counterparty, supply);
        setDemandIntros(prev => new Map(prev).set(key, { text: composed.demandBody, source: 'ai-fallback' }));
        setSupplyIntros(prev => new Map(prev).set(key, { text: composed.supplyBody, source: 'ai-fallback' }));
      } catch {
        setError('Intro generation failed — check AI config and retry.');
      }
      setRowPhases(prev => new Map(prev).set(key, 'generated'));
    } finally {
      setIntroGenerating(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  }, [matchingResult, settings.aiConfig]);

  // ==========================================================================
  // SEND HANDLERS
  // ==========================================================================

  const handleSendDemand = useCallback(async (matchIdx: number) => {
    if (!matchingResult || !settings.instantlyApiKey || !settings.demandCampaignId) return;
    const match = matchingResult.demandMatches[matchIdx];
    const key = rowKey(matchIdx);
    const email = getEmail(match.demand, enrichedDemand);
    if (!email) return;

    setDemandSendStatus(prev => new Map(prev).set(key, 'sending'));
    try {
      const result = await sendToInstantly(settings.instantlyApiKey, {
        campaignId: settings.demandCampaignId,
        email,
        first_name: match.demand.firstName,
        last_name: match.demand.lastName,
        company_name: match.demand.company,
        website: match.demand.domain,
        type: 'DEMAND',
        intro_text: demandIntros.get(key)?.text,
      });
      setDemandSendStatus(prev => new Map(prev).set(key, result.success ? 'sent' : 'error'));
      if (result.success) {
        setRowPhases(prev => new Map(prev).set(key, 'sent'));
        // PR-A: auto-create Deal in print layer
        const deal: Deal = {
          id: makeDealId(match.demand.company, match.supply.company),
          demandCompany: match.demand.company,
          supplyCompany: match.supply.company,
          introSentAt: new Date().toISOString(),
          status: 'intro_sent',
        };
        savePrintDeal(deal);
        // PR-A: update daily stats + streak
        const next = { ...loadDailyStats(), sent: loadDailyStats().sent + 1 };
        saveDailyStats(next);
        setDailyStats(next);
        setStreak(incrementStreakOnSend());
        // PR-A: disable First Win Mode once first intro sent
        if (!getFirstIntroSent()) {
          markFirstIntroSent();
          setFirstWinMode(false);
        }
      }
    } catch {
      setDemandSendStatus(prev => new Map(prev).set(key, 'error'));
    }
  }, [matchingResult, settings, enrichedDemand, demandIntros]);

  const handleSendSupply = useCallback(async (matchIdx: number) => {
    if (!matchingResult || !settings.instantlyApiKey || !settings.supplyCampaignId) return;
    const match = matchingResult.demandMatches[matchIdx];
    const key = rowKey(matchIdx);
    const email = getEmail(match.supply, enrichedSupply);
    if (!email) return;

    setSupplySendStatus(prev => new Map(prev).set(key, 'sending'));
    try {
      const result = await sendToInstantly(settings.instantlyApiKey, {
        campaignId: settings.supplyCampaignId,
        email,
        first_name: match.supply.firstName,
        last_name: match.supply.lastName,
        company_name: match.supply.company,
        website: match.supply.domain,
        type: 'SUPPLY',
        intro_text: supplyIntros.get(key)?.text,
      });
      setSupplySendStatus(prev => new Map(prev).set(key, result.success ? 'sent' : 'error'));
      if (result.success) {
        // PR-A: upsert Deal (supply send on same pair — same deal id, status stays)
        const deal: Deal = {
          id: makeDealId(match.demand.company, match.supply.company),
          demandCompany: match.demand.company,
          supplyCompany: match.supply.company,
          introSentAt: new Date().toISOString(),
          status: 'intro_sent',
        };
        savePrintDeal(deal);
        const next = { ...loadDailyStats(), sent: loadDailyStats().sent + 1 };
        saveDailyStats(next);
        setDailyStats(next);
        setStreak(incrementStreakOnSend());
        if (!getFirstIntroSent()) {
          markFirstIntroSent();
          setFirstWinMode(false);
        }
      }
    } catch {
      setSupplySendStatus(prev => new Map(prev).set(key, 'error'));
    }
  }, [matchingResult, settings, enrichedSupply, supplyIntros]);

  // ==========================================================================
  // RENDER — LOAD SCREEN
  // ==========================================================================

  const allDemandPacks = MARKETS.flatMap(m => m.packs.filter(p => p.side === 'demand'));
  const allSupplyPacks = MARKETS.flatMap(m => m.packs.filter(p => p.side === 'supply'));

  // Pack ID → parent market name (uses PACK_TO_MARKET, no string parsing)
  const marketNameOf = (packId: string) => {
    const mid = PACK_TO_MARKET.get(packId);
    return (mid && MARKET_NAME_OF.get(mid)) ?? mid ?? packId;
  };

  // Resolved market ID from current pack selection (null if packs not from same market)
  const resolvedMarketId = useMemo((): string | null => {
    if (!demandPackId || !supplyPackId) return null;
    const dMid = PACK_TO_MARKET.get(demandPackId);
    const sMid = PACK_TO_MARKET.get(supplyPackId);
    if (!dMid || !sMid || dMid !== sMid) return null;
    return dMid;
  }, [demandPackId, supplyPackId]);

  // Save market campaigns on change — DB for auth, localStorage for guests
  const updateMarketCampaign = useCallback((marketId: string, field: 'demandCampaignId' | 'supplyCampaignId', value: string) => {
    setMarketCampaigns(prev => {
      const next = { ...prev, [marketId]: { ...prev[marketId], [field]: value } };
      // Ensure both fields exist
      if (!next[marketId].demandCampaignId) next[marketId].demandCampaignId = '';
      if (!next[marketId].supplyCampaignId) next[marketId].supplyCampaignId = '';
      // Always write to localStorage (fast cache)
      localStorage.setItem('market_campaigns', JSON.stringify(next));
      // Persist to DB for auth users
      if (isAuthenticated && user?.id) {
        supabase.from('operator_settings').upsert({
          user_id: user.id,
          market_campaigns: next,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' }).then(({ error }) => {
          if (error) console.error('[Station] market_campaigns DB save failed:', error);
        });
        // Register campaign to user_campaigns for webhook routing (same pattern as Settings)
        if (value) {
          const sendCfg = readCurrentSendConfig();
          const provider = sendCfg?.provider || 'instantly';
          const side = field === 'demandCampaignId' ? 'Demand' : 'Supply';
          supabase.from('user_campaigns').upsert({
            user_id: user.id,
            campaign_id: value,
            provider,
            campaign_name: `${side} Campaign (${marketId})`,
          }, { onConflict: 'campaign_id' }).catch(err => {
            console.warn('[Station] campaign registration failed (non-blocking):', err);
          });
        }
      } else {
        // Guest: also persist into guest_settings so Settings round-trip works
        try {
          const gs = localStorage.getItem('guest_settings');
          const parsed = gs ? JSON.parse(gs) : { settings: {} };
          const s = parsed.settings || parsed;
          s.marketCampaigns = next;
          localStorage.setItem('guest_settings', JSON.stringify({ settings: s }));
        } catch { /* non-critical */ }
      }
      return next;
    });
  }, [isAuthenticated, user?.id]);

  const renderLoadScreen = () => {
    const demandPack = allDemandPacks.find(p => p.id === demandPackId);
    const supplyPack = allSupplyPacks.find(p => p.id === supplyPackId);
    const sameMarket = !demandPackId || !supplyPackId || PACK_TO_MARKET.get(demandPackId) === PACK_TO_MARKET.get(supplyPackId);
    const packCanLoad = !!settings.instantlyApiKey && !!demandPackId && !!supplyPackId && sameMarket;
    const customCanLoad = !!settings.instantlyApiKey && customSignals.length > 0;

    // Loading phase index: 0=scanning, 1=enriching, 2=interpreting, 3=launching
    const phaseIndex = loadingPhase?.startsWith('scanning market') ? 0
      : loadingPhase?.startsWith('enriching companies') ? 1
      : loadingPhase?.startsWith('interpreting intent') ? 2
      : loadingPhase?.startsWith('launching evaluation') ? 3
      : -1;

    // Signal summary
    const selectedSignalLabels = NEWS_SIGNALS
      .filter(s => customSignals.includes(s.value))
      .map(s => s.label);

    // Industries flat list for search
    const allIndustriesFlat = INDUSTRY_GROUPS.flatMap(g => g.subs);
    const filteredIndustries = industrySearch.trim()
      ? allIndustriesFlat.filter(i => i.toLowerCase().includes(industrySearch.toLowerCase()))
      : allIndustriesFlat;

    // Shared chip style
    const chipStyle = (selected: boolean): React.CSSProperties => ({
      height: '22px',
      padding: '0 8px',
      fontSize: '11px',
      border: selected ? '1px solid rgba(255,255,255,0.20)' : '1px solid rgba(255,255,255,0.08)',
      background: selected ? 'rgba(255,255,255,0.12)' : 'transparent',
      outline: 'none',
      boxShadow: 'none',
    });

    return (
      <div className="min-h-screen bg-[#09090b] flex flex-col">
        {/* Header bar — back + canonical loop + lens bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => navigate('/launcher')}
              className="font-mono text-white/25 hover:text-white/50 transition-colors"
              style={{ background: 'none', border: 'none', outline: 'none', cursor: 'pointer', fontSize: '12px', padding: 0 }}
            >
              ← Launcher
            </button>
            <span className="text-white/[0.08]">|</span>
            <p className="text-[10px] font-mono text-white/20 tracking-widest uppercase whitespace-nowrap">
              Signal → Syndicate → Match → Route → Print
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Lens selector — custom dropdown (matches prebuilt markets pattern) */}
            <span className="text-[10px] font-mono text-white/30 shrink-0">Lens:</span>
            <div className="relative">
              <button
                onClick={() => setLensDropdownOpen(v => !v)}
                className="font-mono text-[11px] text-left bg-white/[0.03] border border-white/[0.06] rounded hover:border-white/[0.12] transition-colors flex items-center justify-between px-3"
                style={{ height: '28px', minWidth: '120px', outline: 'none', boxShadow: 'none' }}
              >
                <span className={activeLensClientId ? 'text-white/70' : 'text-white/20'}>
                  {activeLensClientId
                    ? fulfillmentClients.find(c => c.id === activeLensClientId)?.name ?? '— select —'
                    : 'All Signals'}
                </span>
                <span className="text-white/20 ml-2">▾</span>
              </button>
              {lensDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setLensDropdownOpen(false)} />
                  <div className="absolute top-full left-0 right-0 mt-0.5 bg-[#09090b] border border-white/[0.06] rounded z-50 max-h-48 overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', minWidth: '120px' }}>
                    <button
                      onClick={() => { setActiveLensClientId(null); setLensDropdownOpen(false); }}
                      className={`w-full text-left px-2.5 py-1.5 font-mono text-[11px] transition-colors ${!activeLensClientId ? 'text-white/90 bg-white/[0.06]' : 'text-white/50 hover:text-white/80 hover:bg-white/[0.02]'}`}
                      style={{ border: 'none', outline: 'none' }}
                    >
                      All Signals
                    </button>
                    {fulfillmentClients
                      .filter(c => c.status === 'active')
                      .map(c => (
                        <button
                          key={c.id}
                          onClick={() => { setActiveLensClientId(c.id); setLensDropdownOpen(false); }}
                          className={`w-full text-left px-2.5 py-1.5 font-mono text-[11px] transition-colors ${activeLensClientId === c.id ? 'text-white/90 bg-white/[0.06]' : 'text-white/50 hover:text-white/80 hover:bg-white/[0.02]'}`}
                          style={{ border: 'none', outline: 'none' }}
                        >
                          {c.name}
                        </button>
                      ))
                    }
                  </div>
                </>
              )}
            </div>
            {/* Edit filters for active lens client */}
            {activeLensClientId && activeOverlayVersion !== null && (
              <button
                onClick={() => {
                  setEditorClientId(activeLensClientId);
                  const versions = clientOverlays.filter(o => o.clientId === activeLensClientId);
                  const active = versions.find(o => o.isActive) ?? versions[versions.length - 1];
                  setDraftOverlay(active ? { ...active.overlay } : defaultOverlay());
                  setOverlayEditorOpen(true); setConfirmDeleteClient(false);
                }}
                className="text-[10px] font-mono text-white/30 hover:text-white/50 transition-colors"
                title="Edit filters for this client"
              >
                edit filters
              </button>
            )}
            {/* Manage clients */}
            <button
              onClick={() => setClientManagerOpen(true)}
              className="text-[10px] font-mono text-white/20 hover:text-white/40 transition-colors"
            >
              + clients
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-24 pb-10 w-full max-w-[1200px] xl:max-w-[1400px] mx-auto" style={{ marginTop: '64px' }}>

          {/* LOADING STATE — warm confident terminal */}
          {loading && loadingPhase ? (
            <div className="flex flex-col items-center" style={{ minHeight: '320px', justifyContent: 'center' }}>
              <style>{`@keyframes barFill { from { width: 0% } to { width: 100% } }
                @keyframes subtitleFade { from { opacity: 0 } to { opacity: 1 } }`}</style>
              <p className="font-mono text-white/40 mb-2" style={{ fontSize: '12px', letterSpacing: '0.02em' }}>
                Reading the market
              </p>
              <p className="font-mono text-white/20 mb-10" style={{ fontSize: '10px', animation: 'subtitleFade 1.5s ease 3s both' }}>
                Grab your coffee — we're reading hundreds of companies right now.
              </p>
              <div className="space-y-4" style={{ width: '320px' }}>
                {([
                  { label: 'Scanning companies', idx: 0 },
                  { label: 'Enriching profiles', idx: 1 },
                  { label: 'Interpreting intent', idx: 2 },
                  { label: 'Launching evaluation', idx: 3 },
                ] as { label: string; idx: number }[]).map(({ label, idx }) => {
                  const isDone = phaseIndex > idx;
                  const isActive = phaseIndex === idx;
                  return (
                    <div key={label} className="flex items-center gap-3">
                      <span
                        className="font-mono flex-shrink-0 transition-colors duration-500"
                        style={{
                          fontSize: '10px',
                          width: '140px',
                          color: isDone ? 'rgba(255,255,255,0.50)' : isActive ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.15)',
                        }}
                      >
                        {isDone ? '✓ ' : '  '}{label}
                      </span>
                      <div className="flex-1 rounded-full overflow-hidden" style={{ height: '2px', background: 'rgba(255,255,255,0.06)' }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            background: isDone ? 'rgba(255,255,255,0.40)' : 'rgba(255,255,255,0.25)',
                            width: isDone ? '100%' : '0%',
                            animation: isActive ? 'barFill 4s ease-out forwards' : undefined,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {(() => {
                const detail = loadingPhase?.includes('…') ? loadingPhase.split('…')[1]?.trim() : null;
                return detail ? (
                  <p className="font-mono text-white/20 mt-6" style={{ fontSize: '9px' }}>{detail}</p>
                ) : phaseIndex >= 2 ? (
                  <p className="font-mono text-white/15 mt-6" style={{ fontSize: '9px', animation: 'subtitleFade 0.8s ease both' }}>
                    Our AI is reading every company like an analyst would
                  </p>
                ) : null;
              })()}
            </div>
          ) : (
            <>
              <style>{`
                @keyframes stSlideIn {
                  from { opacity: 0; transform: translateY(8px) }
                  to   { opacity: 1; transform: translateY(0) }
                }
                @keyframes overlayFadeIn {
                  from { opacity: 0 } to { opacity: 1 }
                }
                @keyframes cardFloat {
                  from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) }
                }
                @keyframes dropReveal {
                  from { opacity: 0; transform: translateY(-6px) scale(0.98); }
                  to   { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes itemFadeIn {
                  from { opacity: 0; transform: translateX(-4px); }
                  to   { opacity: 1; transform: translateX(0); }
                }
              `}</style>

              <StationSourcePanel
                mode={sourceTab}
                onModeChange={handleSourceTabChange}
                marketLocked={!ssmApproved}
              >
              {sourceTab === 'market' && (
              <div style={{ animation: 'stSlideIn 200ms ease both' }}>
              {/* Pack / Custom toggle */}
              <div className="flex justify-center mb-6">
                <div className="inline-flex rounded border border-white/[0.06] bg-white/[0.04]" style={{ height: '28px' }}>
                  <button
                    onClick={() => setMarketsMode('pack')}
                    className={`px-4 font-mono text-[11px] transition-colors ${marketsMode === 'pack' ? 'bg-white/[0.10] text-white' : 'text-white/40 hover:text-white/70'}`}
                    style={{ outline: 'none', boxShadow: 'none', border: 'none' }}
                  >
                    Packs
                  </button>
                  <button
                    onClick={() => setMarketsMode('custom')}
                    className={`px-4 font-mono text-[11px] transition-colors ${marketsMode === 'custom' ? 'bg-white/[0.10] text-white' : 'text-white/40 hover:text-white/70'}`}
                    style={{ outline: 'none', boxShadow: 'none', border: 'none' }}
                  >
                    Custom
                  </button>
                </div>
              </div>

              {/* STAGE 2 — SCOPE: Prebuilt */}
              {marketsMode === 'pack' && (
                <div
                  className="space-y-3 mx-auto"
                  style={{ maxWidth: '340px', animation: 'stSlideIn 200ms ease both', marginBottom: '32px' }}
                >
                  {/* Demand Pack */}
                  <div>
                    <p className="font-mono text-white/40 mb-1.5 tracking-widest uppercase" style={{ fontSize: '10px' }}>Demand Pack</p>
                    <div className="relative">
                      <button
                        onClick={() => { setDemandDropdownOpen(v => !v); setSupplyDropdownOpen(false); }}
                        onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
                        onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                        className="w-full font-mono text-[11px] text-left bg-white/[0.03] border border-white/[0.06] rounded hover:border-white/[0.12] flex items-center justify-between px-3"
                        style={{ height: '28px', border: '1px solid rgba(255,255,255,0.06)', outline: 'none', boxShadow: 'none', transition: 'transform 150ms ease, border-color 200ms ease' }}
                      >
                        <span className={`truncate ${demandPackId ? 'text-white/70' : 'text-white/20'}`}>
                          {demandPack ? `${marketNameOf(demandPack.id)} / ${demandPack.name}` : '— select —'}
                        </span>
                        <span className="text-white/20 ml-2 flex-shrink-0" style={{ transition: 'transform 200ms ease', transform: demandDropdownOpen ? 'rotate(180deg)' : 'rotate(0)' }}>▾</span>
                      </button>
                      {demandDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setDemandDropdownOpen(false)} />
                          <div
                            className="absolute top-full left-0 right-0 mt-0.5 bg-[#09090b] border border-white/[0.06] rounded z-50 max-h-48 overflow-y-auto [&::-webkit-scrollbar]:hidden"
                            style={{ scrollbarWidth: 'none', animation: 'dropReveal 200ms cubic-bezier(0.16,1,0.3,1) both' }}
                          >
                            {allDemandPacks.map((p, i) => (
                              <button key={p.id} onClick={() => { setDemandPackId(p.id); setDemandDropdownOpen(false); }}
                                className={`w-full text-left px-2.5 py-1.5 font-mono text-[11px] truncate transition-colors ${demandPackId === p.id ? 'text-white/90 bg-white/[0.06]' : 'text-white/50 hover:text-white/80 hover:bg-white/[0.02]'}`}
                                style={{ border: 'none', outline: 'none', animation: `itemFadeIn 250ms cubic-bezier(0.16,1,0.3,1) ${30 * i}ms both` }}>
                                {marketNameOf(p.id)} / {p.name}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Supply Pack */}
                  <div>
                    <p className="font-mono text-white/40 mb-1.5 tracking-widest uppercase" style={{ fontSize: '10px' }}>Supply Pack</p>
                    <div className="relative">
                      <button
                        onClick={() => { setSupplyDropdownOpen(v => !v); setDemandDropdownOpen(false); }}
                        onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
                        onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                        className="w-full font-mono text-[11px] text-left bg-white/[0.03] border border-white/[0.06] rounded hover:border-white/[0.12] flex items-center justify-between px-3"
                        style={{ height: '28px', border: '1px solid rgba(255,255,255,0.06)', outline: 'none', boxShadow: 'none', transition: 'transform 150ms ease, border-color 200ms ease' }}
                      >
                        <span className={`truncate ${supplyPackId ? 'text-white/70' : 'text-white/20'}`}>
                          {supplyPack ? `${marketNameOf(supplyPack.id)} / ${supplyPack.name}` : '— select —'}
                        </span>
                        <span className="text-white/20 ml-2 flex-shrink-0" style={{ transition: 'transform 200ms ease', transform: supplyDropdownOpen ? 'rotate(180deg)' : 'rotate(0)' }}>▾</span>
                      </button>
                      {supplyDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setSupplyDropdownOpen(false)} />
                          <div
                            className="absolute top-full left-0 right-0 mt-0.5 bg-[#09090b] border border-white/[0.06] rounded z-50 max-h-48 overflow-y-auto [&::-webkit-scrollbar]:hidden"
                            style={{ scrollbarWidth: 'none', animation: 'dropReveal 200ms cubic-bezier(0.16,1,0.3,1) both' }}
                          >
                            {allSupplyPacks.map((p, i) => (
                              <button key={p.id} onClick={() => { setSupplyPackId(p.id); setSupplyDropdownOpen(false); }}
                                className={`w-full text-left px-2.5 py-1.5 font-mono text-[11px] truncate transition-colors ${supplyPackId === p.id ? 'text-white/90 bg-white/[0.06]' : 'text-white/50 hover:text-white/80 hover:bg-white/[0.02]'}`}
                                style={{ border: 'none', outline: 'none', animation: `itemFadeIn 250ms cubic-bezier(0.16,1,0.3,1) ${30 * i}ms both` }}>
                                {marketNameOf(p.id)} / {p.name}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Cross-market warning */}
                  {demandPackId && supplyPackId && !sameMarket && (
                    <p className="font-mono text-white/30 text-center" style={{ fontSize: '10px', marginTop: '12px' }}>
                      Select packs from the same market.
                    </p>
                  )}

                  {/* Campaign config — shown when both packs are from the same market */}
                  {resolvedMarketId && (
                    <div style={{ marginTop: '20px', animation: 'stSlideIn 200ms ease both' }}>
                      <p className="font-mono text-white/30 mb-2 tracking-widest uppercase text-center" style={{ fontSize: '10px' }}>
                        Campaigns
                      </p>
                      <div className="space-y-1.5">
                        <div>
                          <p className="font-mono text-white/40 mb-1 tracking-widest uppercase" style={{ fontSize: '10px' }}>Demand Campaign</p>
                          <input
                            type="text"
                            value={marketCampaigns[resolvedMarketId]?.demandCampaignId || ''}
                            onChange={e => updateMarketCampaign(resolvedMarketId, 'demandCampaignId', e.target.value)}
                            placeholder="Paste campaign ID"
                            className="w-full font-mono text-[11px] text-white/60 bg-white/[0.03] border border-white/[0.06] rounded px-2.5 placeholder:text-white/15 focus:outline-none focus:border-white/[0.12]"
                            style={{ height: '28px' }}
                          />
                        </div>
                        <div>
                          <p className="font-mono text-white/40 mb-1 tracking-widest uppercase" style={{ fontSize: '10px' }}>Supply Campaign</p>
                          <input
                            type="text"
                            value={marketCampaigns[resolvedMarketId]?.supplyCampaignId || ''}
                            onChange={e => updateMarketCampaign(resolvedMarketId, 'supplyCampaignId', e.target.value)}
                            placeholder="Paste campaign ID"
                            className="w-full font-mono text-[11px] text-white/60 bg-white/[0.03] border border-white/[0.06] rounded px-2.5 placeholder:text-white/15 focus:outline-none focus:border-white/[0.12]"
                            style={{ height: '28px' }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Batch size */}
                  <div className="flex flex-col items-center" style={{ marginTop: '40px', marginBottom: '16px' }}>
                    <p className="font-mono text-white/20 mb-2 tracking-widest uppercase" style={{ fontSize: '10px' }}>Batch size</p>
                    <div className="inline-flex gap-1">
                      {[50, 100, 300, 1000].map(n => (
                        <button
                          key={n}
                          onClick={() => setBatchSize(n)}
                          style={{
                            height: '22px', padding: '0 10px', fontSize: '11px',
                            border: batchSize === n ? '1px solid rgba(255,255,255,0.20)' : '1px solid rgba(255,255,255,0.08)',
                            background: batchSize === n ? 'rgba(255,255,255,0.12)' : 'transparent',
                            outline: 'none', cursor: 'pointer',
                          }}
                          className="font-mono rounded text-white/60 hover:text-white/90 transition-colors"
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Execute */}
                  <div className="flex flex-col items-center pt-2 gap-2" style={{ marginTop: '0' }}>
                    {settingsLoaded && !settings.instantlyApiKey && (
                      <p className="font-mono text-white/30 text-center" style={{ fontSize: '11px' }}>
                        instantly not connected —{' '}
                        <a onClick={(e) => { e.preventDefault(); navigate('/settings'); }} className="text-white/50 hover:text-white/70 underline underline-offset-2 transition-colors cursor-pointer">settings</a>
                      </p>
                    )}
                    <button
                      onClick={handleMarketsLoad}
                      disabled={!packCanLoad}
                      style={{
                        height: '36px', padding: '0 24px', fontSize: '11px',
                        border: '1px solid rgba(255,255,255,0.15)',
                        background: 'rgba(255,255,255,0.12)',
                        outline: 'none',
                        boxShadow: packCanLoad ? '0 0 20px rgba(255,255,255,0.06)' : 'none',
                        opacity: !packCanLoad ? 0.25 : 1,
                        cursor: !packCanLoad ? 'not-allowed' : 'pointer',
                      }}
                      className="font-mono rounded text-white hover:bg-white/[0.18] transition-colors"
                    >
                      Run
                    </button>
                  </div>
                </div>
              )}

              {/* STAGE 2 — SCOPE: Custom */}
              {marketsMode === 'custom' && (
                <div style={{ animation: 'stSlideIn 200ms ease both' }}>

                  {/* Signal intent */}
                  <div style={{ marginBottom: customSignals.length > 0 ? '32px' : '0' }}>
                    <p className="font-mono text-white/40 mb-3" style={{ fontSize: '11px' }}>
                      What are we watching?
                    </p>
                    {customSignals.length === 0 ? (
                      <button
                        onClick={() => setSignalPanelOpen(true)}
                        style={{
                          height: '28px', padding: '0 12px', fontSize: '11px',
                          border: '1px solid rgba(255,255,255,0.08)',
                          background: 'transparent',
                          outline: 'none', cursor: 'pointer',
                        }}
                        className="font-mono rounded text-white/40 hover:text-white/70 hover:border-white/20 transition-colors"
                      >
                        + Select Signals
                      </button>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-white/60" style={{ fontSize: '11px' }}>
                          {selectedSignalLabels.join(' • ')}
                          {' '}<span className="text-white/30">({customSignals.length})</span>
                        </span>
                        <button
                          onClick={() => setSignalPanelOpen(true)}
                          style={{ background: 'none', border: 'none', outline: 'none', cursor: 'pointer', padding: 0 }}
                          className="font-mono text-white/25 hover:text-white/50 transition-colors"
                        >
                          <span style={{ fontSize: '10px' }}>edit</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* STAGE 3 — PRECISION: Target (unlocked after signals) */}
                  {customSignals.length > 0 && (
                    <div style={{ animation: 'stSlideIn 200ms ease both', marginBottom: '32px' }}>
                      <p className="font-mono text-white/40 mb-4" style={{ fontSize: '11px' }}>
                        Who are we targeting?
                      </p>

                      {/* Titles */}
                      <div style={{ marginBottom: '20px' }}>
                        <p className="font-mono text-white/20 mb-1.5 uppercase tracking-widest" style={{ fontSize: '10px' }}>Titles</p>
                        <TokenInput value={customTitleInclude} onChange={setCustomTitleInclude} placeholder="CEO, Founder, VP Sales" autoCapitalize />
                      </div>

                      {/* Industries — popover */}
                      <div style={{ marginBottom: '20px' }}>
                        <p className="font-mono text-white/20 mb-2 uppercase tracking-widest" style={{ fontSize: '10px' }}>Industries</p>
                        {customIndustries.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {customIndustries.map(ind => (
                              <button
                                key={ind}
                                onClick={() => setCustomIndustries(prev => prev.filter(i => i !== ind))}
                                style={{
                                  height: '22px', padding: '0 8px', fontSize: '11px',
                                  border: '1px solid rgba(255,255,255,0.20)',
                                  background: 'rgba(255,255,255,0.10)',
                                  outline: 'none', cursor: 'pointer',
                                }}
                                className="font-mono text-white/80 rounded flex items-center gap-1.5 transition-colors hover:bg-white/[0.06]"
                              >
                                {ind}<span className="text-white/30">×</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="relative inline-block">
                          <button
                            onClick={() => { setIndustryPanelOpen(v => !v); setIndustrySearch(''); }}
                            style={{
                              height: '22px', padding: '0 8px', fontSize: '11px',
                              border: '1px solid rgba(255,255,255,0.08)',
                              background: 'transparent',
                              outline: 'none', cursor: 'pointer',
                            }}
                            className="font-mono text-white/30 hover:text-white/50 hover:border-white/20 rounded transition-colors"
                          >
                            + Add Industry
                          </button>
                          {industryPanelOpen && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => { setIndustryPanelOpen(false); setIndustrySearch(''); }} />
                              <div
                                className="absolute top-full left-0 mt-1 bg-[#0e0e0e] border border-white/[0.08] rounded z-50"
                                style={{ width: '240px' }}
                              >
                                <div className="px-3 py-2 border-b border-white/[0.06]">
                                  <input
                                    autoFocus
                                    value={industrySearch}
                                    onChange={e => setIndustrySearch(e.target.value)}
                                    placeholder="search…"
                                    className="w-full bg-transparent font-mono text-white/60 placeholder-white/20 outline-none"
                                    style={{ fontSize: '11px' }}
                                  />
                                </div>
                                <div className="overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ maxHeight: '200px', scrollbarWidth: 'none' }}>
                                  {filteredIndustries.map(ind => {
                                    const sel = customIndustries.includes(ind);
                                    return (
                                      <button
                                        key={ind}
                                        onClick={() => setCustomIndustries(prev =>
                                          prev.includes(ind) ? prev.filter(i => i !== ind) : [...prev, ind]
                                        )}
                                        className={`w-full text-left px-3 py-1.5 font-mono text-[11px] transition-colors ${
                                          sel ? 'text-white/90 bg-white/[0.06]' : 'text-white/50 hover:text-white/80 hover:bg-white/[0.02]'
                                        }`}
                                        style={{ border: 'none', outline: 'none' }}
                                      >
                                        {ind}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Advanced collapsible */}
                      <div>
                        <button
                          onClick={() => setAdvancedOpen(v => !v)}
                          style={{ background: 'none', border: 'none', outline: 'none', cursor: 'pointer', padding: 0 }}
                          className="font-mono text-white/25 hover:text-white/45 transition-colors"
                        >
                          <span style={{ fontSize: '11px' }}>Advanced filters {advancedOpen ? '▾' : '▸'}</span>
                        </button>
                        {advancedOpen && (
                          <div className="mt-4 space-y-4" style={{ animation: 'stSlideIn 200ms ease both' }}>
                            <div>
                              <p className="font-mono text-white/20 mb-1.5 uppercase tracking-widest" style={{ fontSize: '10px' }}>Revenue</p>
                              <div className="flex flex-wrap gap-1.5">
                                {REVENUE_OPTIONS.map(rev => {
                                  const selected = customRevenue.includes(rev);
                                  return (
                                    <button key={rev}
                                      onClick={() => setCustomRevenue(selected ? customRevenue.filter(r => r !== rev) : [...customRevenue, rev])}
                                      style={chipStyle(selected)}
                                      className={`rounded font-mono transition-colors ${selected ? 'text-white/90' : 'text-white/40 hover:text-white/60'}`}
                                    >{rev}</button>
                                  );
                                })}
                              </div>
                            </div>
                            <div>
                              <p className="font-mono text-white/20 mb-1.5 uppercase tracking-widest" style={{ fontSize: '10px' }}>Company size</p>
                              <div className="flex flex-wrap gap-1.5">
                                {EMPLOYEE_COUNT_OPTIONS.map(opt => {
                                  const selected = customEmployeeCount.includes(opt.label);
                                  return (
                                    <button key={opt.label}
                                      onClick={() => setCustomEmployeeCount(selected ? customEmployeeCount.filter(e => e !== opt.label) : [...customEmployeeCount, opt.label])}
                                      style={chipStyle(selected)}
                                      className={`rounded font-mono transition-colors ${selected ? 'text-white/90' : 'text-white/40 hover:text-white/60'}`}
                                    >{opt.label}</button>
                                  );
                                })}
                              </div>
                            </div>
                            <div>
                              <p className="font-mono text-white/20 mb-1.5 uppercase tracking-widest" style={{ fontSize: '10px' }}>Funding stages</p>
                              <div className="flex flex-wrap gap-1.5">
                                {FUNDING_TYPE_OPTIONS.map(opt => {
                                  const selected = customFunding.includes(opt.value);
                                  return (
                                    <button key={opt.value}
                                      onClick={() => setCustomFunding(selected ? customFunding.filter(f => f !== opt.value) : [...customFunding, opt.value])}
                                      style={chipStyle(selected)}
                                      className={`rounded font-mono transition-colors ${selected ? 'text-white/90' : 'text-white/40 hover:text-white/60'}`}
                                    >{opt.label}</button>
                                  );
                                })}
                              </div>
                            </div>
                            <div>
                              <p className="font-mono text-white/20 mb-1 uppercase tracking-widest" style={{ fontSize: '10px' }}>
                                Job postings <span className="text-white/15 normal-case tracking-normal">demand · case sensitive</span>
                              </p>
                              <TokenInput value={jobListingFilter} onChange={setJobListingFilter} placeholder="Software Engineer, Product Manager" autoCapitalize />
                            </div>
                            <div>
                              <p className="font-mono text-white/20 mb-1 uppercase tracking-widest" style={{ fontSize: '10px' }}>
                                Technologies <span className="text-white/15 normal-case tracking-normal">supply</span>
                              </p>
                              <TokenInput value={technologiesInput} onChange={setTechnologiesInput} placeholder="Salesforce, HubSpot, AWS" />
                            </div>
                            <div>
                              <p className="font-mono text-white/20 mb-1 uppercase tracking-widest" style={{ fontSize: '10px' }}>Keywords include</p>
                              <TokenInput value={customKeywordInclude} onChange={setCustomKeywordInclude} placeholder="saas, cloud, enterprise" />
                            </div>
                            <div>
                              <p className="font-mono text-white/20 mb-1 uppercase tracking-widest" style={{ fontSize: '10px' }}>Keywords exclude</p>
                              <TokenInput value={customKeywordExclude} onChange={setCustomKeywordExclude} placeholder="agency, staffing, intern" />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Batch size */}
                  {customSignals.length > 0 && (
                    <div className="flex flex-col items-center" style={{ marginTop: '40px', marginBottom: '16px' }}>
                      <p className="font-mono text-white/20 mb-2 tracking-widest uppercase" style={{ fontSize: '10px' }}>Batch size</p>
                      <div className="inline-flex gap-1">
                        {[50, 100, 300, 1000].map(n => (
                          <button
                            key={n}
                            onClick={() => setBatchSize(n)}
                            style={{
                              height: '22px', padding: '0 10px', fontSize: '11px',
                              border: batchSize === n ? '1px solid rgba(255,255,255,0.20)' : '1px solid rgba(255,255,255,0.08)',
                              background: batchSize === n ? 'rgba(255,255,255,0.12)' : 'transparent',
                              outline: 'none', cursor: 'pointer',
                            }}
                            className="font-mono rounded text-white/60 hover:text-white/90 transition-colors"
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* EXECUTE */}
                  {customSignals.length > 0 && (
                    <div className="flex flex-col items-center" style={{ marginTop: '0' }}>
                      {!settings.instantlyApiKey && (
                        <p className="font-mono text-white/30 mb-3" style={{ fontSize: '11px' }}>
                          instantly not connected —{' '}
                          <a onClick={(e) => { e.preventDefault(); navigate('/settings'); }} className="text-white/50 hover:text-white/70 underline underline-offset-2 transition-colors cursor-pointer">settings</a>
                        </p>
                      )}
                      <button
                        onClick={handleMarketsLoad}
                        disabled={!customCanLoad}
                        style={{
                          height: '36px', padding: '0 28px', fontSize: '11px',
                          border: '1px solid rgba(255,255,255,0.15)',
                          background: 'rgba(255,255,255,0.12)',
                          outline: 'none',
                          boxShadow: customCanLoad ? '0 0 24px rgba(255,255,255,0.07)' : 'none',
                          opacity: !customCanLoad ? 0.25 : 1,
                          cursor: !customCanLoad ? 'not-allowed' : 'pointer',
                        }}
                        className="font-mono rounded text-white hover:bg-white/[0.18] transition-colors"
                      >
                        Run
                      </button>
                      <span className="font-mono text-white/20 mt-2" style={{ fontSize: '10px' }}>
                        {dailyRemaining !== null ? `${dailyRemaining.toLocaleString()} / 5,000 remaining today` : '5,000 leads / day'}
                      </span>
                    </div>
                  )}

                </div>
              )}
              </div>
              )}

              {sourceTab === 'yourdata' && (
                <div style={{ animation: 'stSlideIn 200ms ease both' }}>
                  <div className="space-y-5 mx-auto" style={{ maxWidth: '340px' }}>
                    <p className="font-mono text-white/40 mb-4" style={{ fontSize: '11px' }}>
                      Paste your Apify dataset IDs
                    </p>

                    {/* Demand Dataset */}
                    <div>
                      <p className="font-mono text-white/20 mb-1.5 tracking-widest uppercase" style={{ fontSize: '10px' }}>Demand Dataset</p>
                      <input
                        type="text"
                        placeholder="Xh1gIAAoJPfAz1FOL"
                        value={yourDemandInput}
                        onChange={(e) => setYourDemandInput(e.target.value)}
                        className="w-full font-mono text-[11px] text-white/70 placeholder:text-white/20 bg-white/[0.03] border border-white/[0.06] rounded px-3 outline-none focus:border-white/20 transition-colors"
                        style={{ height: '28px' }}
                      />
                      <textarea
                        placeholder="e.g., Series A–C SaaS that just raised and need SOC 2 within 6 months"
                        value={yourDemandDesc}
                        onChange={(e) => setYourDemandDesc(e.target.value)}
                        className="w-full font-mono text-[11px] text-white/40 placeholder:text-white/15 bg-transparent border border-white/[0.04] rounded px-3 py-2 outline-none focus:border-white/10 transition-colors resize-none"
                        rows={2}
                        style={{ marginTop: '6px' }}
                      />
                    </div>

                    {/* Supply Dataset */}
                    <div>
                      <p className="font-mono text-white/20 mb-1.5 tracking-widest uppercase" style={{ fontSize: '10px' }}>Supply Dataset</p>
                      <input
                        type="text"
                        placeholder="k9pLmN3qRsTuVwXyZ"
                        value={yourSupplyInput}
                        onChange={(e) => setYourSupplyInput(e.target.value)}
                        className="w-full font-mono text-[11px] text-white/70 placeholder:text-white/20 bg-white/[0.03] border border-white/[0.06] rounded px-3 outline-none focus:border-white/20 transition-colors"
                        style={{ height: '28px' }}
                      />
                      <textarea
                        placeholder="e.g., Boutique cybersecurity firms specializing in SOC 2 and ISO compliance"
                        value={yourSupplyDesc}
                        onChange={(e) => setYourSupplyDesc(e.target.value)}
                        className="w-full font-mono text-[11px] text-white/40 placeholder:text-white/15 bg-transparent border border-white/[0.04] rounded px-3 py-2 outline-none focus:border-white/10 transition-colors resize-none"
                        rows={2}
                        style={{ marginTop: '6px' }}
                      />
                    </div>

                    {/* Campaign config — for custom/Apify datasets */}
                    <div style={{ marginTop: '20px', animation: 'stSlideIn 200ms ease both' }}>
                      <p className="font-mono text-white/30 mb-2 tracking-widest uppercase text-center" style={{ fontSize: '10px' }}>
                        Campaigns
                      </p>
                      <div className="space-y-1.5">
                        <div>
                          <p className="font-mono text-white/40 mb-1 tracking-widest uppercase" style={{ fontSize: '10px' }}>Demand Campaign</p>
                          <input
                            type="text"
                            value={marketCampaigns['custom']?.demandCampaignId || ''}
                            onChange={e => updateMarketCampaign('custom', 'demandCampaignId', e.target.value)}
                            placeholder="Paste campaign ID"
                            className="w-full font-mono text-[11px] text-white/60 bg-white/[0.03] border border-white/[0.06] rounded px-2.5 placeholder:text-white/15 focus:outline-none focus:border-white/[0.12]"
                            style={{ height: '28px' }}
                          />
                        </div>
                        <div>
                          <p className="font-mono text-white/40 mb-1 tracking-widest uppercase" style={{ fontSize: '10px' }}>Supply Campaign</p>
                          <input
                            type="text"
                            value={marketCampaigns['custom']?.supplyCampaignId || ''}
                            onChange={e => updateMarketCampaign('custom', 'supplyCampaignId', e.target.value)}
                            placeholder="Paste campaign ID"
                            className="w-full font-mono text-[11px] text-white/60 bg-white/[0.03] border border-white/[0.06] rounded px-2.5 placeholder:text-white/15 focus:outline-none focus:border-white/[0.12]"
                            style={{ height: '28px' }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Analyze */}
                    <div className="flex flex-col items-center" style={{ marginTop: '40px' }}>
                      <button
                        disabled={!yourDemandInput.trim() || !yourSupplyInput.trim() || analyzeLoading}
                        onClick={handleAnalyze}
                        style={{
                          height: '36px', padding: '0 24px', fontSize: '11px',
                          border: '1px solid rgba(255,255,255,0.15)',
                          background: 'rgba(255,255,255,0.12)',
                          outline: 'none',
                          boxShadow: yourDemandInput.trim() && yourSupplyInput.trim() && !analyzeLoading ? '0 0 20px rgba(255,255,255,0.06)' : 'none',
                          opacity: !yourDemandInput.trim() || !yourSupplyInput.trim() || analyzeLoading ? 0.25 : 1,
                          cursor: !yourDemandInput.trim() || !yourSupplyInput.trim() || analyzeLoading ? 'not-allowed' : 'pointer',
                        }}
                        className="font-mono rounded text-white hover:bg-white/[0.18] transition-colors"
                      >
                        {analyzeLoading
                          ? analyzeProgress
                            ? `Analyzing ${analyzeProgress.done} / ${analyzeProgress.total}...`
                            : 'Fetching datasets...'
                          : 'Analyze'}
                      </button>

                      {/* Progress bar — indeterminate shimmer (fetch) or determinate (analyze) */}
                      {analyzeLoading && (
                        <div className="w-full mt-3 h-[2px] rounded-full overflow-hidden" style={{ maxWidth: '200px', background: 'rgba(255,255,255,0.06)' }}>
                          {analyzeProgress ? (
                            <div
                              className="h-full transition-all duration-300"
                              style={{
                                width: `${Math.round((analyzeProgress.done / analyzeProgress.total) * 100)}%`,
                                backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0.15) 25%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0.15) 75%)',
                                backgroundSize: '200% 100%',
                                animation: 'shimmer 1.5s ease-in-out infinite',
                              }}
                            />
                          ) : (
                            <div style={{
                              width: '100%',
                              height: '100%',
                              backgroundImage: 'linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.4) 50%, transparent 75%)',
                              backgroundSize: '200% 100%',
                              animation: 'shimmer 1.5s ease-in-out infinite',
                            }} />
                          )}
                        </div>
                      )}

                      {analyzeError && (
                        analyzeError === '__no_ai__' ? (
                          <a
                            onClick={(e) => { e.preventDefault(); navigate('/settings?tab=ai'); }}
                            className="font-mono text-white/40 hover:text-white/60 underline underline-offset-2 transition-colors mt-2 block cursor-pointer"
                            style={{ fontSize: '10px' }}
                          >
                            set your AI key in Settings to continue
                          </a>
                        ) : (
                          <p className="font-mono text-white/40 mt-2" style={{ fontSize: '10px' }}>
                            {analyzeError}
                          </p>
                        )
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* SSM Auth Modal — triggered when non-member clicks Prebuilt Markets */}
              <AuthModal
                isOpen={showSsmModal}
                onClose={() => setShowSsmModal(false)}
                onSuccess={() => { setSsmApproved(true); setShowSsmModal(false); setSourceTab('market'); }}
                featureName="Prebuilt Markets"
              />

              {/* Analyze Modal */}
              {analyzeModalOpen && analyzeDiagnostics && (
                <AnalyzeModal
                  diagnostics={analyzeDiagnostics}
                  onRun={handleAnalyzeRun}
                  onClose={() => setAnalyzeModalOpen(false)}
                  onExport={handleAnalyzeExport}
                />
              )}
              </StationSourcePanel>

              {/* Past Runs link */}
              <div className="flex justify-end mt-2">
                <button
                  onClick={() => navigate('/station/runs')}
                  className="font-mono text-[10px] text-white/25 hover:text-white/50 transition-colors cursor-pointer"
                  style={{ background: 'none', border: 'none', outline: 'none', padding: 0 }}
                >
                  Past Runs →
                </button>
              </div>

              {/* Error */}
              {error && (
                <p className="mt-6 text-[11px] font-mono text-red-400/70">{error}</p>
              )}
            </>
          )}
        </div>

        {/* SIGNAL SELECTION PANEL — floating, 720px, centered */}
        {signalPanelOpen && (
          <>
            <div
              className="fixed inset-0 z-50"
              style={{ background: 'rgba(0,0,0,0.50)', backdropFilter: 'blur(2px)' }}
              onClick={() => setSignalPanelOpen(false)}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
              <div
                className="pointer-events-auto border border-white/[0.08] rounded-lg overflow-hidden"
                style={{ width: '720px', maxHeight: '80vh', background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(12px)' }}
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
                  <p className="font-mono text-white/40" style={{ fontSize: '11px' }}>Select signals</p>
                  <button
                    onClick={() => setSignalPanelOpen(false)}
                    style={{ background: 'none', border: 'none', outline: 'none', cursor: 'pointer' }}
                    className="font-mono text-white/30 hover:text-white/70 transition-colors"
                  >
                    <span style={{ fontSize: '11px' }}>Done</span>
                  </button>
                </div>
                <div className="px-5 py-5 overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ maxHeight: 'calc(80vh - 48px)', scrollbarWidth: 'none' }}>
                  {SIGNAL_GROUPS.map(group => (
                    <div key={group.category} className="mb-5">
                      <p className="font-mono text-white/20 mb-2" style={{ fontSize: '10px' }}>{group.category}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {group.signals.map(sv => {
                          const sig = NEWS_SIGNALS.find(s => s.value === sv)!;
                          const selected = customSignals.includes(sv);
                          return (
                            <button
                              key={sv}
                              onClick={() => setCustomSignals(
                                selected ? customSignals.filter(s => s !== sv) : [...customSignals, sv]
                              )}
                              style={chipStyle(selected)}
                              className={`rounded font-mono transition-colors ${selected ? 'text-white/90' : 'text-white/40 hover:text-white/60'}`}
                            >
                              {sig.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  // ==========================================================================
  // RENDER — MATCH REVIEW PANEL
  // ==========================================================================

  /** @deprecated V5 wiring — prebuilt markets + Apify now use mcp-orchestrate. Only CSV path remains. */
  const renderMatchReview = () => {
    if (!matchingResult) return null;
    const selCount = selectedIndices.size;

    // Lens mode:
    // All Signals → show all matches in original order (no overlay gating)
    // Client Lens → show rankedMatches (sorted, gated by overlay)
    const isClientLens = activeLensClientId !== null;
    const baseEntries: RankedMatchEntry[] = isClientLens
      ? rankedMatches
      : matchingResult.demandMatches.map((match, i) => ({
          matchIndex: i,
          match,
          result: { included: true, rankScore: match.score, explanation: {
            baseScore: match.score, tierBoost: 0, signalWeightBoost: 0,
            titleMatchBoost: 0, industryMatchBoost: 0, domainPresentBoost: 0,
            emailPresentBoost: 0, recencyBoost: 0,
            gatingPass: true, supplyExhausted: false, supplyUsageCount: 0,
            capabilitySource: 'fallback', signalSource: 'raw',
          }},
        }));

    const totalAvailable = baseEntries.length;

    // PR-A: First Win Mode — show only Tier A (strong) matches
    const FIRST_WIN_CAP = 10;
    const displayEntries: RankedMatchEntry[] = firstWinMode
      ? baseEntries.filter(e => e.match.tier === 'strong').slice(0, FIRST_WIN_CAP)
      : baseEntries;

    const includedCount = displayEntries.filter(e => e.result.included).length;
    const excludedCount = firstWinMode
      ? baseEntries.length - displayEntries.length
      : displayEntries.filter(e => !e.result.included).length;

    const visibleCount = displayEntries.length;

    return (
      <div className="flex flex-col h-full">
        {/* Diagnostic counter */}
        <div className="flex items-center justify-between px-4 py-1.5 border-b border-white/[0.04]">
          <span className="text-[10px] font-mono text-white/30">
            Showing {displayEntries.length} of {baseEntries.length} matches · batch {batchSize}
          </span>
          {firstWinMode && (
            <span className="text-[9px] font-mono text-amber-400/40">First Win Mode · Tier A only</span>
          )}
        </div>
        {/* Column headers */}
        <div className="flex border-b border-white/[0.06]">
          <div className="flex-1 flex items-center justify-between px-4 py-2 border-r border-white/[0.06]">
            <span className="text-[10px] font-mono text-white/30 tracking-widest uppercase">Demand</span>
            <div className="flex gap-2">
              <button onClick={handleSelectAll} className="text-[10px] text-white/30 hover:text-white/50">select all</button>
              <span className="text-[10px] text-white/20">·</span>
              <button onClick={handleClearAll} className="text-[10px] text-white/30 hover:text-white/50">clear</button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-between px-4 py-2">
            <span className="text-[10px] font-mono text-white/30 tracking-widest uppercase">Supply</span>
            <div className="flex items-center gap-2">
              {firstWinMode && (
                <span className="text-[9px] font-mono text-emerald-400/40">
                  Tier A only · cap {FIRST_WIN_CAP}
                  {excludedCount > 0 && ` · ${excludedCount} hidden`}
                </span>
              )}
              {!firstWinMode && isClientLens && excludedCount > 0 && (
                <span className="text-[9px] font-mono text-white/20">{excludedCount} excluded</span>
              )}
            </div>
          </div>
        </div>

        {/* Match rows */}
        <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04]">
          {displayEntries.map(({ matchIndex, match, result }) => {
            const i = matchIndex;
            const isSelected = selectedIndices.has(i);
            const phase = rowPhases.get(rowKey(i)) || 'matched';
            const isExcluded = !result.included;
            const isExplained = explainedMatchIdx === i;
            const rowOpacity = isExcluded ? 'opacity-30' : '';

            return (
              <div key={i} className={`${rowOpacity}`}>
                <div
                  onClick={() => !isExcluded && handleToggleRow(i)}
                  className={`flex transition-colors min-h-[72px] ${
                    isExcluded
                      ? 'cursor-default'
                      : isSelected
                        ? 'bg-white/[0.04] cursor-pointer'
                        : 'hover:bg-white/[0.04] cursor-pointer'
                  }`}
                >
                  {/* Demand side */}
                  <div className="flex-1 flex items-start gap-2.5 px-4 py-4 border-r border-white/[0.06]">
                    <input
                      type="checkbox"
                      readOnly
                      checked={isSelected}
                      disabled={isExcluded}
                      className="mt-0.5 w-3.5 h-3.5 shrink-0 accent-white cursor-pointer disabled:opacity-0"
                      onClick={e => e.stopPropagation()}
                      onChange={() => !isExcluded && handleToggleRow(i)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] text-white/90 font-medium truncate">{match.demand.company}</span>
                        <span className={`text-[10px] font-mono ${tierColor(match.tier)} shrink-0`}>[{tierLabel(match.tier)}]</span>
                        {phase !== 'matched' && (
                          <span className={`text-[9px] font-mono shrink-0 ${
                            phase === 'sent' ? 'text-emerald-400' :
                            phase === 'generated' ? 'text-white/40' :
                            phase === 'enriched' ? 'text-white/30' :
                            'text-white/20'
                          }`}>{phase}</span>
                        )}
                        {isClientLens && result.included && (
                          <span className="text-[9px] font-mono text-white/20 shrink-0">
                            {result.rankScore.toFixed(0)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-mono text-white/60 truncate mt-0.5">
                        {match.tierReason.split('→')[0]?.trim() || match.demand.signal}
                      </p>
                    </div>
                  </div>

                  {/* Supply side */}
                  <div className="flex-1 flex items-start gap-2.5 px-4 py-4">
                    <div className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] text-white/90 font-medium truncate">{match.supply.company}</span>
                        <span className={`text-[10px] font-mono ${tierColor(match.tier)} shrink-0`}>[{tierLabel(match.tier)}]</span>
                      </div>
                      <p className="text-xs font-mono text-white/60 truncate mt-0.5">
                        {isExcluded
                          ? <span className="text-red-400/50">{result.excludedReason}</span>
                          : match.tierReason.split('→')[1]?.trim() || match.supply.signal
                        }
                      </p>
                    </div>
                    {/* Why button — only in client lens */}
                    {isClientLens && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setExplainedMatchIdx(isExplained ? null : i);
                        }}
                        className={`shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors ${
                          isExplained
                            ? 'bg-white/10 text-white/60'
                            : 'text-white/20 hover:text-white/40 hover:bg-white/[0.04]'
                        }`}
                      >
                        why
                      </button>
                    )}
                  </div>
                </div>

                {/* Explain drawer — inline, only when expanded */}
                {isExplained && isClientLens && (
                  <div className="px-4 py-3 bg-white/[0.02] border-t border-white/[0.04]">
                    <p className="text-[9px] font-mono text-white/30 tracking-widest uppercase mb-2">Score breakdown</p>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-[10px] font-mono">
                      <div className="flex justify-between">
                        <span className="text-white/40">base score</span>
                        <span className="text-white/60">{result.explanation.baseScore.toFixed(0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/40">tier boost</span>
                        <span className="text-white/60">+{result.explanation.tierBoost}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/40">signal weight</span>
                        <span className="text-white/60">+{result.explanation.signalWeightBoost}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/40">title match</span>
                        <span className="text-white/60">+{result.explanation.titleMatchBoost}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/40">industry match</span>
                        <span className="text-white/60">+{result.explanation.industryMatchBoost}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/40">domain present</span>
                        <span className="text-white/60">+{result.explanation.domainPresentBoost}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/40">email present</span>
                        <span className="text-white/60">+{result.explanation.emailPresentBoost}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/40">recency</span>
                        <span className="text-white/60">+{result.explanation.recencyBoost}</span>
                      </div>
                      <div className="flex justify-between col-span-2 border-t border-white/[0.06] pt-1 mt-1">
                        <span className="text-white/50">rank score</span>
                        <span className="text-white/80 font-medium">{result.rankScore.toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/40">gate</span>
                        <span className={result.explanation.gatingPass ? 'text-emerald-400/70' : 'text-red-400/60'}>
                          {result.explanation.gatingPass ? 'pass' : 'fail'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/40">supply usage</span>
                        <span className="text-white/60">{result.explanation.supplyUsageCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/40">capability src</span>
                        <span className="text-white/40">{result.explanation.capabilitySource}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/40">signal src</span>
                        <span className="text-white/40">{result.explanation.signalSource}</span>
                      </div>
                    </div>
                    {!result.explanation.gatingPass && result.explanation.gatingFailReason && (
                      <p className="mt-2 text-[10px] font-mono text-red-400/60">{result.explanation.gatingFailReason}</p>
                    )}
                    {result.explanation.supplyExhausted && (
                      <p className="mt-1 text-[10px] font-mono text-amber-400/60">supply exhausted within run</p>
                    )}
                  </div>
                )}

                {/* IntentCardPreview — shows canonical intent for selected demand record */}
                {isSelected && (
                  <div className="px-4 py-3">
                    <IntentCardPreview
                      signal={station.dmcb.canonicalByRecordKey.get(match.demand.recordKey)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06]">
          <span className="text-[11px] font-mono text-white/40">
            {selCount > 0
              ? `${selCount} selected`
              : isClientLens
                ? `${includedCount} visible · ${excludedCount} excluded`
                : `${displayEntries.length} pairs`
            }
          </span>
          <button
            onClick={handleEnrich}
            disabled={selCount === 0}
            className="h-7 px-3 text-[11px] rounded bg-white/[0.08] text-white/80 hover:bg-white/[0.12] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Enrich selected ({selCount})
          </button>
        </div>
      </div>
    );
  };

  // ==========================================================================
  // RENDER — ENRICHING PANEL
  // ==========================================================================

  const renderEnriching = () => (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
      <div className="w-full max-w-sm space-y-4">
        <p className="text-[10px] font-mono text-white/30 tracking-widest uppercase mb-4">Enriching</p>
        <ProgressBar
          value={enrichProgress.demand}
          total={enrichProgress.demandTotal}
          label="Demand"
        />
        <ProgressBar
          value={enrichProgress.supply}
          total={enrichProgress.supplyTotal}
          label="Supply"
        />
        <div className="pt-2">
          <button
            onClick={handleCancelEnrichment}
            className="text-[11px] text-white/30 hover:text-white/50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  // ==========================================================================
  // RENDER — ROUTE PANEL
  // ==========================================================================

  const renderRoute = () => {
    if (!matchingResult) return null;
    const selected = Array.from(selectedIndices).sort((a, b) => a - b);
    const matches = matchingResult.demandMatches;

    return (
      <div className="flex flex-col h-full">
        {/* Column headers */}
        <div className="flex border-b border-white/[0.06]">
          <div className="flex-1 px-4 py-2 border-r border-white/[0.06]">
            <span className="text-[10px] font-mono text-white/30 tracking-widest uppercase">Demand</span>
          </div>
          <div className="flex-1 px-4 py-2">
            <span className="text-[10px] font-mono text-white/30 tracking-widest uppercase">Supply</span>
          </div>
        </div>

        {/* Route rows */}
        <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04]">
          {selected.map(i => {
            const match = matches[i];
            const key = rowKey(i);
            const phase = rowPhases.get(key) || 'enriched';

            const demandEmail = getEmail(match.demand, enrichedDemand);
            const supplyEmail = getEmail(match.supply, enrichedSupply);

            const dIntro = demandIntros.get(key);
            const sIntro = supplyIntros.get(key);
            const isGenerating = introGenerating.has(key);
            const hasIntros = !!dIntro && !!sIntro;

            const dStatus = demandSendStatus.get(key) || 'idle';
            const sStatus = supplySendStatus.get(key) || 'idle';

            const isExpanded = expandedIntros.has(key);

            return (
              <div key={i} className="flex">
                {/* Demand side */}
                <div className="flex-1 px-4 py-3 border-r border-white/[0.06] space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[13px] text-white/90 font-medium block truncate">{match.demand.company}</span>
                      {demandEmail ? (
                        <span className="text-[11px] font-mono text-white/40 block truncate">✓ {demandEmail}</span>
                      ) : (
                        <span className="text-[11px] font-mono text-white/20">✗ not found</span>
                      )}
                    </div>
                    {/* Send status icon */}
                    {dStatus === 'sent' && <span className="text-[11px] font-mono text-emerald-400 shrink-0">✓</span>}
                    {dStatus === 'error' && <span className="text-[11px] font-mono text-red-400/60 shrink-0">✗</span>}
                  </div>

                  {/* Intro preview */}
                  {dIntro && (
                    <div className="space-y-1">
                      <p className="text-[11px] text-white/50 leading-relaxed">
                        {isExpanded ? dIntro.text : `${dIntro.text.slice(0, 100)}${dIntro.text.length > 100 ? '…' : ''}`}
                      </p>
                      {dIntro.text.length > 100 && (
                        <button
                          onClick={() => setExpandedIntros(prev => {
                            const n = new Set(prev);
                            if (n.has(key)) n.delete(key); else n.add(key);
                            return n;
                          })}
                          className="text-[10px] text-white/20 hover:text-white/40"
                        >
                          {isExpanded ? 'collapse' : 'expand'}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    {!hasIntros && (
                      <button
                        onClick={() => handleGenerateIntro(i)}
                        disabled={isGenerating || !settings.aiConfig}
                        className="h-7 px-3 text-[11px] rounded bg-white/[0.06] text-white/60 hover:bg-white/[0.10] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {isGenerating ? 'Generating…' : 'Generate ▾'}
                      </button>
                    )}
                    {demandEmail && hasIntros && dStatus === 'idle' && settings.demandCampaignId && (
                      <button
                        onClick={() => handleSendDemand(i)}
                        className="h-7 px-3 text-[11px] rounded bg-white/[0.06] text-white/60 hover:bg-white/[0.10] transition-colors"
                      >
                        Send
                      </button>
                    )}
                    {dStatus === 'sending' && (
                      <span className="text-[11px] font-mono text-white/30 self-center">sending…</span>
                    )}
                  </div>
                </div>

                {/* Supply side */}
                <div className="flex-1 px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[13px] text-white/90 font-medium block truncate">{match.supply.company}</span>
                      {supplyEmail ? (
                        <span className="text-[11px] font-mono text-white/40 block truncate">✓ {supplyEmail}</span>
                      ) : (
                        <span className="text-[11px] font-mono text-white/20">✗ not found</span>
                      )}
                    </div>
                    {sStatus === 'sent' && <span className="text-[11px] font-mono text-emerald-400 shrink-0">✓</span>}
                    {sStatus === 'error' && <span className="text-[11px] font-mono text-red-400/60 shrink-0">✗</span>}
                  </div>

                  {/* Intro preview */}
                  {sIntro && (
                    <p className="text-[11px] text-white/50 leading-relaxed">
                      {isExpanded ? sIntro.text : `${sIntro.text.slice(0, 100)}${sIntro.text.length > 100 ? '…' : ''}`}
                    </p>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    {supplyEmail && hasIntros && sStatus === 'idle' && settings.supplyCampaignId && (
                      <button
                        onClick={() => handleSendSupply(i)}
                        className="h-7 px-3 text-[11px] rounded bg-white/[0.06] text-white/60 hover:bg-white/[0.10] transition-colors"
                      >
                        Send
                      </button>
                    )}
                    {sStatus === 'sending' && (
                      <span className="text-[11px] font-mono text-white/30 self-center">sending…</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer: back to match review */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06]">
          <button
            onClick={() => setPanel('match_review')}
            className="text-[11px] text-white/30 hover:text-white/50 transition-colors"
          >
            ← back to review
          </button>
          <span className="text-[11px] font-mono text-white/20">{selected.length} rows</span>
        </div>
      </div>
    );
  };

  // ==========================================================================
  // RENDER — OVERLAY EDITOR MODAL (§8.5 V1 Minimal)
  // Save = new overlay version. Activate = set active. Rollback list.
  // ==========================================================================

  const renderOverlayEditor = () => {
    if (!overlayEditorOpen || !editorClientId) return null;
    const client = fulfillmentClients.find(c => c.id === editorClientId);
    if (!client) return null;

    const f = draftOverlay.filters;

    const updateFilterInclude = (key: string, val: string) => {
      const arr = val.split(',').map(s => s.trim()).filter(Boolean);
      setDraftOverlay(prev => ({
        ...prev,
        filters: {
          ...prev.filters,
          include: { ...prev.filters.include, [key]: arr.length > 0 ? arr : undefined },
        },
      }));
    };

    const updateExcludeCompanies = (val: string) => {
      const arr = val.split(',').map(s => s.trim()).filter(Boolean);
      setDraftOverlay(prev => ({
        ...prev,
        filters: {
          ...prev.filters,
          exclude: { ...prev.filters.exclude, companies: arr.length > 0 ? arr : undefined },
        },
      }));
    };

    const updateFilterExclude = (key: string, val: string) => {
      const arr = val.split(',').map(s => s.trim()).filter(Boolean);
      setDraftOverlay(prev => ({
        ...prev,
        filters: {
          ...prev.filters,
          exclude: { ...prev.filters.exclude, [key]: arr.length > 0 ? arr : undefined },
        },
      }));
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'overlayFadeIn 0.2s ease-out' }} onClick={() => setOverlayEditorOpen(false)}>
        <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }} />
        <div className="relative flex flex-col" style={{ width: '100%', maxWidth: '480px', maxHeight: '80vh', margin: '0 24px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', overflow: 'hidden', animation: 'cardFloat 0.3s ease-out' }} onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="flex items-center gap-2">
              <span style={{ color: 'rgba(52,211,153,0.40)', fontSize: '8px', lineHeight: 1 }}>◆</span>
              <div>
                <p className="font-mono" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.60)' }}>{client.name}</p>
                <p className="font-mono" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Filters</p>
              </div>
            </div>
            <button
              onClick={() => setOverlayEditorOpen(false)}
              className="font-mono"
              style={{ fontSize: '14px', color: 'rgba(255,255,255,0.20)', background: 'none', border: 'none', cursor: 'pointer', outline: 'none', padding: '0 4px' }}
            >
              x
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-5" style={{ scrollbarWidth: 'none', padding: '16px 24px 24px' }}>

            {/* Show — must match at least one */}
            <div className="space-y-4">
              <p className="text-[10px] font-mono text-white/50 tracking-widest uppercase border-b border-white/[0.06] pb-1">Only show matches with</p>

              <div>
                <p className="text-[9px] font-mono text-white/30 tracking-widest uppercase mb-2">Industries</p>
                <TokenInput
                  value={(f.include.industries ?? []).join(', ')}
                  onChange={v => updateFilterInclude('industries', v)}
                  placeholder="Biotech, Pharma…"
                />
              </div>

              <div>
                <p className="text-[9px] font-mono text-white/30 tracking-widest uppercase mb-2">Titles</p>
                <TokenInput
                  value={(f.include.titles ?? []).join(', ')}
                  onChange={v => updateFilterInclude('titles', v)}
                  placeholder="VP Clinical, Head of HR…"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[9px] font-mono text-white/30 tracking-widest uppercase">Signal Groups</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDraftOverlay(prev => ({
                        ...prev,
                        filters: { ...prev.filters, include: { ...prev.filters.include, signalGroups: undefined } },
                      }))}
                      className="text-[9px] font-mono text-white/25 hover:text-white/50 transition-colors"
                    >
                      All
                    </button>
                    <button
                      onClick={() => setDraftOverlay(prev => ({
                        ...prev,
                        filters: { ...prev.filters, include: { ...prev.filters.include, signalGroups: [] } },
                      }))}
                      className="text-[9px] font-mono text-white/25 hover:text-white/50 transition-colors"
                    >
                      None
                    </button>
                  </div>
                </div>
                <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '2px' }}>
                  {([
                    { key: 'growth', label: 'Growth', desc: 'Hiring, offices, new locations' },
                    { key: 'capital', label: 'Capital', desc: 'Funding, IPO, investments' },
                    { key: 'product', label: 'Product', desc: 'Launches, dev, integrations' },
                    { key: 'deals', label: 'Deals', desc: 'Partnerships, M&A, new clients' },
                    { key: 'risk', label: 'Risk', desc: 'Departures, layoffs, lawsuits' },
                    { key: 'other', label: 'Other', desc: 'Awards, recognition' },
                    { key: 'unknown', label: 'Unknown', desc: 'Unclassified data' },
                  ] as const).map(({ key: g, label, desc }, i) => {
                    const selected = !f.include.signalGroups || f.include.signalGroups.includes(g);
                    return (
                      <button
                        key={g}
                        onClick={() => {
                          setDraftOverlay(prev => {
                            const current = prev.filters.include.signalGroups ?? ['growth', 'capital', 'product', 'deals', 'risk', 'other', 'unknown'];
                            const next = selected
                              ? current.filter(s => s !== g)
                              : [...current, g];
                            return {
                              ...prev,
                              filters: {
                                ...prev.filters,
                                include: {
                                  ...prev.filters.include,
                                  signalGroups: next.length === 7 ? undefined : next,
                                },
                              },
                            };
                          });
                        }}
                        className="w-full flex items-center gap-3 text-left transition-colors hover:bg-white/[0.02]"
                        style={{
                          padding: '6px 10px',
                          borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                        }}
                      >
                        {/* Checkbox */}
                        <span
                          className="flex-shrink-0"
                          style={{
                            width: '12px',
                            height: '12px',
                            borderRadius: '2px',
                            border: '1px solid',
                            borderColor: selected ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.10)',
                            background: selected ? 'rgba(255,255,255,0.10)' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '8px',
                            color: 'rgba(255,255,255,0.50)',
                          }}
                        >
                          {selected ? '✓' : ''}
                        </span>
                        {/* Label */}
                        <span style={{ fontSize: '11px', fontFamily: 'monospace', color: selected ? 'rgba(255,255,255,0.60)' : 'rgba(255,255,255,0.25)', minWidth: '60px' }}>
                          {label}
                        </span>
                        {/* Description */}
                        <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.18)' }}>
                          {desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Hide — never show these */}
            <div className="space-y-4">
              <p className="text-[10px] font-mono text-white/50 tracking-widest uppercase border-b border-white/[0.06] pb-1">Never show matches with</p>

              <div>
                <p className="text-[9px] font-mono text-white/30 tracking-widest uppercase mb-2">Companies</p>
                <TokenInput
                  value={(f.exclude.companies ?? []).join(', ')}
                  onChange={v => updateExcludeCompanies(v)}
                  placeholder="Acme, Contoso…"
                />
              </div>

              <div>
                <p className="text-[9px] font-mono text-white/30 tracking-widest uppercase mb-2">Industries</p>
                <TokenInput
                  value={(f.exclude.industries ?? []).join(', ')}
                  onChange={v => updateFilterExclude('industries', v)}
                  placeholder="Finance, Legal…"
                />
              </div>

              <div>
                <p className="text-[9px] font-mono text-white/30 tracking-widest uppercase mb-2">Titles</p>
                <TokenInput
                  value={(f.exclude.titles ?? []).join(', ')}
                  onChange={v => updateFilterExclude('titles', v)}
                  placeholder="Intern, Coordinator…"
                />
              </div>

            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-3 border-t border-white/[0.06]">
              <button
                onClick={() => {
                  // Atomic save + activate
                  const existing = clientOverlays.filter(o => o.clientId === editorClientId);
                  const maxV = existing.reduce((m, o) => Math.max(m, o.version), 0);
                  const now = new Date().toISOString();
                  const newOv: ClientOverlay = {
                    id: crypto.randomUUID(),
                    clientId: editorClientId,
                    targetSetId: editorTargetSetId ?? undefined,
                    version: maxV + 1,
                    isActive: true,
                    overlay: draftOverlay,
                    createdAt: now,
                    activatedAt: now,
                  };
                  persistOverlays([
                    ...clientOverlays.map(o =>
                      o.clientId === editorClientId
                        ? { ...o, isActive: false, deactivatedAt: o.isActive ? now : o.deactivatedAt }
                        : o
                    ),
                    newOv,
                  ]);
                  setOverlayEditorOpen(false);
                }}
                className="h-7 px-4 text-[11px] rounded bg-white/[0.08] text-white/80 hover:bg-white/[0.12] transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => setOverlayEditorOpen(false)}
                className="h-7 px-3 text-[11px] rounded text-white/40 hover:text-white/60 transition-colors"
              >
                Cancel
              </button>
              {!confirmDeleteClient ? (
                <button
                  onClick={() => setConfirmDeleteClient(true)}
                  className="ml-auto h-7 px-3 text-[11px] rounded text-white/20 hover:text-red-400/60 transition-colors"
                >
                  Delete client
                </button>
              ) : (
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-[10px] font-mono text-red-400/60">Remove {client.name}?</span>
                  <button
                    onClick={() => {
                      if (activeLensClientId === editorClientId) setActiveLensClientId(null);
                      persistClients(fulfillmentClients.filter(c => c.id !== editorClientId));
                      persistOverlays(clientOverlays.filter(o => o.clientId !== editorClientId));
                      setOverlayEditorOpen(false);
                      setConfirmDeleteClient(false);
                    }}
                    className="h-7 px-3 text-[11px] rounded bg-red-400/10 text-red-400/80 border border-red-400/20 hover:bg-red-400/20 transition-colors"
                  >
                    Yes, delete
                  </button>
                  <button
                    onClick={() => setConfirmDeleteClient(false)}
                    className="h-7 px-3 text-[11px] rounded text-white/40 hover:text-white/60 transition-colors"
                  >
                    No
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ==========================================================================
  // RENDER — CLIENT MANAGER MODAL
  // ==========================================================================

  const renderClientManager = () => {
    if (!clientManagerOpen) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'overlayFadeIn 0.2s ease-out' }} onClick={() => setClientManagerOpen(false)}>
        <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }} />
        <div className="relative flex flex-col" style={{ width: '100%', maxWidth: '420px', maxHeight: '70vh', margin: '0 24px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', overflow: 'hidden', animation: 'cardFloat 0.3s ease-out' }} onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="flex items-center gap-2">
              <span style={{ color: 'rgba(52,211,153,0.40)', fontSize: '8px', lineHeight: 1 }}>◆</span>
              <p className="font-mono" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.60)' }}>Clients</p>
            </div>
            <button
              onClick={() => setClientManagerOpen(false)}
              className="font-mono"
              style={{ fontSize: '14px', color: 'rgba(255,255,255,0.20)', background: 'none', border: 'none', cursor: 'pointer', outline: 'none', padding: '0 4px' }}
            >
              x
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4" style={{ scrollbarWidth: 'none', padding: '16px 20px 20px' }}>

            {/* Existing clients */}
            {fulfillmentClients.length > 0 && (
              <div className="space-y-1">
                {fulfillmentClients.map(client => {
                  const versions = clientOverlays.filter(o => o.clientId === client.id);
                  const active = versions.find(o => o.isActive);
                  return (
                    <div
                      key={client.id}
                      className="flex items-center justify-between px-3 py-2.5"
                      style={{ border: '1px solid rgba(255,255,255,0.04)', borderRadius: '8px' }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span style={{ color: 'rgba(52,211,153,0.35)', fontSize: '7px', lineHeight: 1, flexShrink: 0 }}>◆</span>
                        <div className="min-w-0">
                          <p className="font-mono text-white/80 truncate" style={{ fontSize: '12px' }}>{client.name}</p>
                          <p className="font-mono" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>
                            {client.economicSide}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setProfileClientId(client.id);
                            setClientManagerOpen(false);
                          }}
                          className="font-mono transition-all"
                          style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', outline: 'none', transform: 'scale(1)' }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)'; }}
                          onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.95)'; }}
                          onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                        >
                          profile
                        </button>
                        <button
                          onClick={() => {
                            setEditorClientId(client.id);
                            const activeOv = versions.find(o => o.isActive) ?? versions[versions.length - 1];
                            setDraftOverlay(activeOv ? { ...activeOv.overlay } : defaultOverlay());
                            setOverlayEditorOpen(true); setConfirmDeleteClient(false);
                            setClientManagerOpen(false);
                          }}
                          className="font-mono transition-all"
                          style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', outline: 'none', transform: 'scale(1)' }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)'; }}
                          onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.95)'; }}
                          onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                        >
                          filters
                        </button>
                        <button
                          onClick={() => {
                            if (activeLensClientId === client.id) setActiveLensClientId(null);
                            persistClients(fulfillmentClients.filter(c => c.id !== client.id));
                            persistOverlays(clientOverlays.filter(o => o.clientId !== client.id));
                          }}
                          className="font-mono"
                          style={{ fontSize: '10px', color: 'rgba(255,255,255,0.12)', background: 'none', border: 'none', cursor: 'pointer', outline: 'none', padding: '0 2px' }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'rgba(248,113,113,0.50)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.12)'; }}
                        >
                          x
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Input section */}
            <div className={fulfillmentClients.length > 0 ? 'pt-4' : ''} style={{ borderTop: fulfillmentClients.length > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
              {fulfillmentClients.length === 0 && (
                <p className="font-mono leading-relaxed mb-4" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}>
                  When someone pays you, add them here. Each client becomes a lens — matches re-rank around their profile.
                </p>
              )}
              <input
                type="text"
                value={newClientName}
                onChange={e => setNewClientName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateClient(); }}
                placeholder="Client name…"
                className="w-full font-mono text-white/80 placeholder-white/15 outline-none"
                style={{ height: '32px', padding: '0 12px', fontSize: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px' }}
                onFocus={e => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.06)'; }}
              />
              <div className="flex items-center gap-2 mt-2">
                {(['demand', 'supply'] as const).map(side => (
                  <button
                    key={side}
                    onClick={() => setNewClientSide(side)}
                    className="font-mono transition-all"
                    style={{
                      fontSize: '10px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: newClientSide === side ? '1px solid rgba(255,255,255,0.25)' : '1px solid rgba(255,255,255,0.06)',
                      color: newClientSide === side ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.25)',
                      background: newClientSide === side ? 'rgba(255,255,255,0.05)' : 'transparent',
                      cursor: 'pointer',
                      outline: 'none',
                      transform: 'scale(1)',
                    }}
                    onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.93)'; }}
                    onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                  >
                    {side}
                  </button>
                ))}
                <button
                  onClick={handleCreateClient}
                  disabled={!newClientName.trim()}
                  className="ml-auto font-mono transition-all"
                  style={{
                    height: '28px',
                    padding: '0 14px',
                    fontSize: '11px',
                    borderRadius: '6px',
                    background: 'rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.60)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    cursor: newClientName.trim() ? 'pointer' : 'not-allowed',
                    opacity: newClientName.trim() ? 1 : 0.3,
                    outline: 'none',
                    transform: 'scale(1)',
                  }}
                  onMouseEnter={e => { if (newClientName.trim()) { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.80)'; } }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.60)'; e.currentTarget.style.transform = 'scale(1)'; }}
                  onMouseDown={e => { if (newClientName.trim()) e.currentTarget.style.transform = 'scale(0.96)'; }}
                  onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ==========================================================================
  // RENDER — STATION BODY
  // ==========================================================================

  const renderStation = () => (
    <div className="min-h-screen bg-[#09090b] flex flex-col">
      {/* Top bar — §8.2 Station Top Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] gap-4">
        {/* Left: back to launcher + pipeline breadcrumb */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => navigate('/launcher')}
            className="font-mono text-white/25 hover:text-white/50 transition-colors"
            style={{ background: 'none', border: 'none', outline: 'none', cursor: 'pointer', fontSize: '12px', padding: 0 }}
          >
            ← Launcher
          </button>
          <span className="text-white/[0.08]">|</span>
          <p className="text-[10px] font-mono text-white/20 tracking-widest uppercase whitespace-nowrap">
            Signal → Syndicate → Match → Route → Print
          </p>
        </div>

        {/* Center: Lens bar */}
        <div className="flex items-center gap-2 flex-1 justify-center">
          {/* Lens selector */}
          <span className="text-[10px] font-mono text-white/30 shrink-0">Lens:</span>
          <select
            value={activeLensClientId ?? '__all__'}
            onChange={e => {
              const val = e.target.value;
              setActiveLensClientId(val === '__all__' ? null : val);
              setExplainedMatchIdx(null);
            }}
            className="h-6 px-1.5 text-[11px] font-mono bg-white/[0.04] border border-white/[0.08] rounded-sm text-white/70 outline-none focus:border-white/20 cursor-pointer"
          >
            <option value="__all__">All Signals</option>
            {fulfillmentClients
              .filter(c => c.status === 'active')
              .map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))
            }
          </select>

          {/* Overlay version indicator */}
          {activeLensClientId && activeOverlayVersion !== null && (
            <button
              onClick={() => {
                setEditorClientId(activeLensClientId);
                const versions = clientOverlays.filter(o => o.clientId === activeLensClientId);
                const active = versions.find(o => o.isActive) ?? versions[versions.length - 1];
                setDraftOverlay(active ? { ...active.overlay } : defaultOverlay());
                setOverlayEditorOpen(true); setConfirmDeleteClient(false);
              }}
              className="text-[10px] font-mono text-white/30 hover:text-white/50 transition-colors"
              title="Click to view/edit overlay"
            >
              Overlay v{activeOverlayVersion}
            </button>
          )}

          {/* Manage clients button */}
          <button
            onClick={() => setClientManagerOpen(true)}
            className="text-[10px] font-mono text-white/20 hover:text-white/40 transition-colors"
          >
            + clients
          </button>
        </div>

        {/* Right: pair count + panel dots + reset */}
        <div className="flex items-center gap-3 shrink-0">
          {matchingResult && (
            <span className="text-[11px] font-mono text-white/30">
              {matchingResult.demandMatches.length} pairs
            </span>
          )}
          <div className="flex gap-1">
            {(['match_review', 'enriching', 'route'] as StationPanel[]).map(p => (
              <span
                key={p}
                className={`w-1.5 h-1.5 rounded-full ${panel === p ? 'bg-white/40' : 'bg-white/10'}`}
              />
            ))}
          </div>
          <button
            onClick={() => { setStep('load'); setMatchingResult(null); setSelectedIndices(new Set()); setRowPhases(new Map()); setError(null); }}
            className="text-[11px] text-white/20 hover:text-white/40 transition-colors"
          >
            ↺ reset
          </button>
        </div>
      </div>

      {/* PR-A: Today's Progress banner */}
      <div className="flex items-center gap-5 px-4 py-1.5 border-b border-white/[0.04] bg-white/[0.01]">
        <span className="text-[9px] font-mono text-white/20 tracking-wider uppercase shrink-0">Today</span>
        <div className="flex items-center gap-4 flex-1">
          <span className="text-[10px] font-mono text-white/40">
            reviewed <span className="text-white/60">{dailyStats.reviewed}</span>
          </span>
          <span className="text-[10px] font-mono text-white/40">
            sent <span className="text-white/60">{dailyStats.sent}</span>
          </span>
          <span className="text-[10px] font-mono text-white/40">
            generated <span className="text-white/60">{dailyStats.generated}</span>
          </span>
          {streak.streakCount > 0 && (
            <span className="text-[10px] font-mono text-amber-400/60">
              {streak.streakCount}d streak
            </span>
          )}
        </div>
        <ExecutionBadge mode="station" />
        {firstWinMode && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[9px] font-mono text-emerald-400/50">First Win Mode</span>
            <button
              onClick={() => setFirstWinMode(false)}
              className="text-[9px] font-mono text-white/20 hover:text-white/40 transition-colors"
              title="Turn off First Win Mode"
            >
              ✕
            </button>
          </div>
        )}
        <a
          href="/print"
          className="text-[9px] font-mono text-white/20 hover:text-white/40 transition-colors shrink-0"
        >
          pipeline →
        </a>
      </div>

      {/* DMCB status bar — intent synthesis metrics */}
      {dmcbStats && (
        <DmcbStatusBar
          accepted={dmcbStats.accepted}
          quarantined={0}
          avgConfidence={dmcbStats.avgConfidence}
        />
      )}

      {/* Error bar */}
      {error && (
        <div className="px-6 py-2 border-b border-red-400/20 bg-red-400/[0.04]">
          <p className="text-[11px] font-mono text-red-400/70">{error}</p>
        </div>
      )}

      {/* Panel content */}
      <div className="flex-1 overflow-hidden w-full max-w-none px-24 xl:px-32">
        {panel === 'match_review' && renderMatchReview()}
        {panel === 'enriching' && renderEnriching()}
        {panel === 'route' && renderRoute()}
      </div>
    </div>
  );

  // ==========================================================================
  // ROOT RENDER
  // ==========================================================================

  if (step === 'load') return (
    <>
      {renderLoadScreen()}
      {renderOverlayEditor()}
      {renderClientManager()}
      {profileClientId && (() => {
        const client = fulfillmentClients.find(c => c.id === profileClientId);
        if (!client) return null;
        return (
          <ClientProfileModal
            clientName={client.name}
            profile={client.profile}
            onSave={profile => {
              const updated = fulfillmentClients.map(c =>
                c.id === profileClientId ? { ...c, profile } : c
              );
              persistClients(updated);
              setProfileClientId(null);
            }}
            onClose={() => setProfileClientId(null)}
          />
        );
      })()}
    </>
  );
  return (
    <>
      {renderStation()}
      {renderOverlayEditor()}
      {renderClientManager()}
      {profileClientId && (() => {
        const client = fulfillmentClients.find(c => c.id === profileClientId);
        if (!client) return null;
        return (
          <ClientProfileModal
            clientName={client.name}
            profile={client.profile}
            onSave={profile => {
              const updated = fulfillmentClients.map(c =>
                c.id === profileClientId ? { ...c, profile } : c
              );
              persistClients(updated);
              setProfileClientId(null);
            }}
            onClose={() => setProfileClientId(null)}
          />
        );
      })()}
    </>
  );
}
