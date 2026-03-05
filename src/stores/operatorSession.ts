/**
 * OPERATOR SESSION STORE
 *
 * Persists all workflow state across navigation.
 * Station.tsx is a VIEW — this store is the state owner.
 *
 * Serialization contract:
 *   Map<string, T>  → stored as Record<string, T>
 *   Set<number>     → stored as number[]
 *   Set<string>     → stored as string[]
 *
 * Station.tsx converts at boundary via useMemo (see selectors below).
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import type { MatchingResult } from '../matching/index';
import type { EnrichmentResult } from '../enrichment/router';
import type {
  RowPhase,
  IntroEntry,
  StationStep,
  StationPanel,
} from '../types/station';

// =============================================================================
// STATE SHAPE — serializable only
// =============================================================================

export interface OperatorSessionState {
  // Step / panel
  step: StationStep;
  panel: StationPanel;

  // Acquisition config
  marketsMode: 'pack' | 'custom';
  demandPackId: string;
  supplyPackId: string;
  batchSize: number;
  customSignals: string[];
  customTitleInclude: string;
  customIndustries: string[];
  customEmployeeCount: string[];
  customRevenue: string[];
  customFunding: string[];
  customKeywordInclude: string;
  customKeywordExclude: string;
  jobListingFilter: string;
  technologiesInput: string;

  // Matching result
  matchingResult: MatchingResult | null;

  // Selection — serialized Set<number>
  selectedIndices: number[];

  // Row lifecycle — serialized Map<string, RowPhase>
  rowPhases: Record<string, RowPhase>;

  // Enrichment results — serialized Map<string, EnrichmentResult>
  enrichedDemand: Record<string, EnrichmentResult>;
  enrichedSupply: Record<string, EnrichmentResult>;

  // Intro results — serialized Map<string, IntroEntry>
  demandIntros: Record<string, IntroEntry>;
  supplyIntros: Record<string, IntroEntry>;

  // Send status — serialized Map<string, status>
  demandSendStatus: Record<string, 'idle' | 'sending' | 'sent' | 'error'>;
  supplySendStatus: Record<string, 'idle' | 'sending' | 'sent' | 'error'>;

  // Loading state
  loading: boolean;
  loadingPhase: string | null;
  error: string | null;

  // Filters
  firstWinMode: boolean;
}

// =============================================================================
// ACTIONS
// =============================================================================

export interface OperatorSessionActions {
  setStep: (v: StationStep) => void;
  setPanel: (v: StationPanel) => void;

  setMarketsMode: (v: 'pack' | 'custom') => void;
  setDemandPackId: (v: string) => void;
  setSupplyPackId: (v: string) => void;
  setBatchSize: (v: number) => void;
  setCustomSignals: (v: string[] | ((prev: string[]) => string[])) => void;
  setCustomTitleInclude: (v: string) => void;
  setCustomIndustries: (v: string[] | ((prev: string[]) => string[])) => void;
  setCustomEmployeeCount: (v: string[] | ((prev: string[]) => string[])) => void;
  setCustomRevenue: (v: string[] | ((prev: string[]) => string[])) => void;
  setCustomFunding: (v: string[] | ((prev: string[]) => string[])) => void;
  setCustomKeywordInclude: (v: string) => void;
  setCustomKeywordExclude: (v: string) => void;
  setJobListingFilter: (v: string) => void;
  setTechnologiesInput: (v: string) => void;

  setMatchingResult: (v: MatchingResult | null) => void;

  // Accept Map/Set types directly — store converts to serializable form
  setSelectedIndices: (v: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
  setRowPhases: (v: Map<string, RowPhase> | ((prev: Map<string, RowPhase>) => Map<string, RowPhase>)) => void;
  setEnrichedDemand: (v: Map<string, EnrichmentResult> | ((prev: Map<string, EnrichmentResult>) => Map<string, EnrichmentResult>)) => void;
  setEnrichedSupply: (v: Map<string, EnrichmentResult> | ((prev: Map<string, EnrichmentResult>) => Map<string, EnrichmentResult>)) => void;
  setDemandIntros: (v: Map<string, IntroEntry> | ((prev: Map<string, IntroEntry>) => Map<string, IntroEntry>)) => void;
  setSupplyIntros: (v: Map<string, IntroEntry> | ((prev: Map<string, IntroEntry>) => Map<string, IntroEntry>)) => void;
  setDemandSendStatus: (
    v: Map<string, 'idle' | 'sending' | 'sent' | 'error'> |
      ((prev: Map<string, 'idle' | 'sending' | 'sent' | 'error'>) =>
        Map<string, 'idle' | 'sending' | 'sent' | 'error'>)
  ) => void;
  setSupplySendStatus: (
    v: Map<string, 'idle' | 'sending' | 'sent' | 'error'> |
      ((prev: Map<string, 'idle' | 'sending' | 'sent' | 'error'>) =>
        Map<string, 'idle' | 'sending' | 'sent' | 'error'>)
  ) => void;

  setLoading: (v: boolean) => void;
  setLoadingPhase: (v: string | null) => void;
  setError: (v: string | null) => void;
  setFirstWinMode: (v: boolean) => void;

  clearSession: () => void;
}

// =============================================================================
// INITIAL STATE
// =============================================================================

const INITIAL: OperatorSessionState = {
  step: 'load',
  panel: 'match_review',
  marketsMode: 'pack',
  demandPackId: '',
  supplyPackId: '',
  batchSize: 50,
  customSignals: [],
  customTitleInclude: '',
  customIndustries: [],
  customEmployeeCount: [],
  customRevenue: [],
  customFunding: [],
  customKeywordInclude: '',
  customKeywordExclude: '',
  jobListingFilter: '',
  technologiesInput: '',
  matchingResult: null,
  selectedIndices: [],
  rowPhases: {},
  enrichedDemand: {},
  enrichedSupply: {},
  demandIntros: {},
  supplyIntros: {},
  demandSendStatus: {},
  supplySendStatus: {},
  loading: false,
  loadingPhase: null,
  error: null,
  firstWinMode: false,
};

// =============================================================================
// HELPERS — Map/Set ↔ serializable converters
// =============================================================================

function applySetUpdate<T>(
  current: T[],
  updater: T[] | Set<T> | ((prev: Set<T>) => Set<T>)
): T[] {
  if (typeof updater === 'function') {
    return Array.from(updater(new Set(current)));
  }
  if (updater instanceof Set) {
    return Array.from(updater);
  }
  return updater;
}

function applyMapUpdate<V>(
  current: Record<string, V>,
  updater:
    | Map<string, V>
    | Record<string, V>
    | ((prev: Map<string, V>) => Map<string, V>)
): Record<string, V> {
  if (typeof updater === 'function') {
    return Object.fromEntries(updater(new Map(Object.entries(current))));
  }
  if (updater instanceof Map) {
    return Object.fromEntries(updater);
  }
  return updater;
}

function applyArrayUpdate<T>(
  current: T[],
  updater: T[] | ((prev: T[]) => T[])
): T[] {
  return typeof updater === 'function' ? updater(current) : updater;
}

// =============================================================================
// STORE
// =============================================================================

export const useOperatorSession = create<OperatorSessionState & OperatorSessionActions>()(
  persist(
    (set, get) => ({
      ...INITIAL,

      setStep: v => set({ step: v }),
      setPanel: v => set({ panel: v }),

      setMarketsMode: v => set({ marketsMode: v }),
      setDemandPackId: v => set({ demandPackId: v }),
      setSupplyPackId: v => set({ supplyPackId: v }),
      setBatchSize: v => set({ batchSize: v }),

      setCustomSignals: v => set(s => ({ customSignals: applyArrayUpdate(s.customSignals, v as any) })),
      setCustomTitleInclude: v => set({ customTitleInclude: v }),
      setCustomIndustries: v => set(s => ({ customIndustries: applyArrayUpdate(s.customIndustries, v as any) })),
      setCustomEmployeeCount: v => set(s => ({ customEmployeeCount: applyArrayUpdate(s.customEmployeeCount, v as any) })),
      setCustomRevenue: v => set(s => ({ customRevenue: applyArrayUpdate(s.customRevenue, v as any) })),
      setCustomFunding: v => set(s => ({ customFunding: applyArrayUpdate(s.customFunding, v as any) })),
      setCustomKeywordInclude: v => set({ customKeywordInclude: v }),
      setCustomKeywordExclude: v => set({ customKeywordExclude: v }),
      setJobListingFilter: v => set({ jobListingFilter: v }),
      setTechnologiesInput: v => set({ technologiesInput: v }),

      setMatchingResult: v => set({ matchingResult: v }),

      setSelectedIndices: v =>
        set(s => ({ selectedIndices: applySetUpdate(s.selectedIndices, v as any) })),

      setRowPhases: v =>
        set(s => ({ rowPhases: applyMapUpdate(s.rowPhases, v as any) })),

      setEnrichedDemand: v =>
        set(s => ({ enrichedDemand: applyMapUpdate(s.enrichedDemand, v as any) })),

      setEnrichedSupply: v =>
        set(s => ({ enrichedSupply: applyMapUpdate(s.enrichedSupply, v as any) })),

      setDemandIntros: v =>
        set(s => ({ demandIntros: applyMapUpdate(s.demandIntros, v as any) })),

      setSupplyIntros: v =>
        set(s => ({ supplyIntros: applyMapUpdate(s.supplyIntros, v as any) })),

      setDemandSendStatus: v =>
        set(s => ({ demandSendStatus: applyMapUpdate(s.demandSendStatus, v as any) })),

      setSupplySendStatus: v =>
        set(s => ({ supplySendStatus: applyMapUpdate(s.supplySendStatus, v as any) })),

      setLoading: v => set({ loading: v }),
      setLoadingPhase: v => set({ loadingPhase: v }),
      setError: v => set({ error: v }),
      setFirstWinMode: v => set({ firstWinMode: v }),

      clearSession: () => set(INITIAL),
    }),
    {
      name: 'connector_session',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
