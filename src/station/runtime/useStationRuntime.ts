/**
 * STATION RUNTIME HOOK — Phase 35
 *
 * CUT + MOVE from Flow.tsx. NO LOGIC CHANGES.
 * Owns: evaluations, handlers, telemetry, keyboard, stationMode.
 * Receives: intros, step from caller (Station or Flow).
 *
 * Phase 38: DMCB extraction now runs through useJobRunner via useDMCBExtraction.
 * Resume, abort, idempotency, and data integrity come free.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// Evaluation Primitive — deterministic builder + MCP enhancer
import { buildEvaluations } from '../../evaluation/buildEvaluations';
import { enhanceEvaluations } from '../../evaluation/enhanceEvaluations';
import type { Evaluation, EvaluationOutcomeStatus } from '../../evaluation/Evaluation';
import type { Match } from '../../matching';
import type { Edge } from '../../schemas/Edge';
import type { NormalizedRecord } from '../../schemas';

// Intent Stamp
import { stampIntentOnRecords, buildIntentMaps } from '../../services/IntentStamp';

// Phase 22-32: Telemetry
import { computeStationMetrics } from '../../telemetry/metrics';
import { computeSegmentLift } from '../../telemetry/segmentLift';
import { computeEvaluationQuality } from '../../telemetry/evaluationQuality';
import { computeCalibrationDrift } from '../../telemetry/calibrationDrift';
import { computeOperatorThroughput } from '../../telemetry/operatorThroughput';
import { computeMarketFeedback } from '../../telemetry/marketFeedback';
import { computeNextMoves } from '../../telemetry/nextMoves';
import { buildSessionSnapshot } from '../../telemetry/sessionSnapshot';
import { saveSnapshot } from '../../telemetry/stationMemory';

// Phase 24: MCP diagnosis
import { topDiagnosis } from '../../evaluation/mcpDiagnosis';

// AI Config type
import type { AIConfig } from '../../services/AIService';

// Phase 33/38: DMCB — Demand-Market Canonical Boundary (now via useJobRunner)
import { toRawRecords } from '../../dmcb/rawIntake';
import { buildSignalsFromCanonicals } from '../../dmcb/runDMCB';
import { useDMCBExtraction } from '../../dmcb/useDMCBExtraction';
import type { CanonicalSignal } from '../../dmcb/types';
import type { RawRecord } from '../../dmcb/types';
import type { DMCBAIConfig } from '../../dmcb/dmcbAiExtract';

// Phase 39-40: Embedding + Top-K + MCP Evaluation
import { useEmbedding } from '../../evaluation/useEmbedding';
import { generateCandidatePairs } from '../../evaluation/pairGeneration';
import type { CandidatePair } from '../../evaluation/topKRetrieval';
import { useMCPEvaluation } from '../../evaluation/useMCPEvaluation';

// =============================================================================
// TYPES
// =============================================================================

/** Extended IntroEntry — superset of station.ts IntroEntry for telemetry */
interface IntroEntryLike {
  text: string;
  source: string;
  evaluationId?: string;
  usedAIFraming?: boolean;
  sentAt?: string;
  outcomeType?: string;
  outcomeAt?: string;
  replyLatencyMs?: number;
}

interface UseStationRuntimeParams {
  /** Demand intros map — read by telemetry, written by outcome handler */
  demandIntros: Map<string, IntroEntryLike>;
  /** Supply intros map — read by telemetry, written by outcome handler */
  supplyIntros: Map<string, IntroEntryLike>;
  /** Current step — for showStation derivation */
  step: string;
  /** DOM refs for keyboard scroll-into-view */
  evalCardRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  /** Setter for demand intros — outcome propagation */
  setDemandIntros?: (fn: (prev: Map<string, IntroEntryLike>) => Map<string, IntroEntryLike>) => void;
  /** Setter for supply intros — outcome propagation */
  setSupplyIntros?: (fn: (prev: Map<string, IntroEntryLike>) => Map<string, IntroEntryLike>) => void;
  /** Phase 33: Demand NormalizedRecords for DMCB ingestion */
  demandRecords?: NormalizedRecord[];
  /** Phase 33: Supply NormalizedRecords for DMCB ingestion */
  supplyRecords?: NormalizedRecord[];
  /** Phase 37: AI config for DMCB extraction */
  aiConfig?: DMCBAIConfig;
}

// =============================================================================
// HOOK
// =============================================================================

export function useStationRuntime(params: UseStationRuntimeParams) {
  const { demandIntros, supplyIntros, step, evalCardRefs, setDemandIntros, setSupplyIntros, demandRecords, supplyRecords, aiConfig: dmcbAiConfig } = params;

  // =========================================================================
  // EVALUATIONS STATE (moved from Flow.tsx lines 1024-1026)
  // =========================================================================
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [mcpErrors, setMcpErrors] = useState<string[]>([]);

  // =========================================================================
  // EXTERNAL RECORDS — Phase 35 "Your Data" tab
  // =========================================================================
  const [externalRecords, setExternalRecords] = useState<{ demand: any[]; supply: any[] }>({ demand: [], supply: [] });

  function loadExternalRecords({ demandRecords: demandRecs, supplyRecords: supplyRecs }: { demandRecords?: any[]; supplyRecords?: any[] }) {
    setExternalRecords({
      demand: demandRecs ?? [],
      supply: supplyRecs ?? [],
    });
  }

  /** Push pre-extracted canonical signals directly (bypasses DMCB extraction) */
  function pushCanonicalSignals(signals: CanonicalSignal[]) {
    setCanonicalSignals(signals);
    dmcbStartedRef.current = true; // prevent DMCB from auto-starting
  }

  // =========================================================================
  // DMCB BOUNDARY (Phase 33/38) — Canonical signal ingestion via useJobRunner
  // =========================================================================
  const [canonicalSignals, setCanonicalSignals] = useState<CanonicalSignal[]>([]);

  // Effective records: external records override params when non-empty
  const effectiveDemandRecords = externalRecords.demand.length > 0
    ? externalRecords.demand as NormalizedRecord[]
    : demandRecords;
  const effectiveSupplyRecords = externalRecords.supply.length > 0
    ? externalRecords.supply as NormalizedRecord[]
    : supplyRecords;

  // Build RawRecord[] from effective records (memoized to avoid re-renders)
  const rawRecords = useMemo<RawRecord[]>(() => {
    if (!effectiveDemandRecords && !effectiveSupplyRecords) return [];
    const allRecords = [
      ...(effectiveDemandRecords || []),
      ...(effectiveSupplyRecords || []),
    ];
    if (allRecords.length === 0) return [];

    const hasMarkets = allRecords.some((r: any) => r.origin === 'markets');
    const source: 'csv' | 'markets' = hasMarkets ? 'markets' : 'csv';
    return toRawRecords(allRecords, source);
  }, [effectiveDemandRecords, effectiveSupplyRecords]);

  // Fallback AI config for when no config is provided (extraction won't start)
  const safeAiConfig = useMemo<DMCBAIConfig>(
    () => dmcbAiConfig || { provider: 'openai' },
    [dmcbAiConfig]
  );

  // useJobRunner-backed DMCB extraction
  const dmcbExtraction = useDMCBExtraction({
    rawRecords,
    aiConfig: safeAiConfig,
  });

  // Track whether we've auto-started extraction for this record set
  const dmcbStartedRef = useRef(false);
  const prevRawLengthRef = useRef(0);

  // Reset start ref when external records change so DMCB can re-run
  useEffect(() => {
    if (externalRecords.demand.length > 0 || externalRecords.supply.length > 0) {
      dmcbStartedRef.current = false;
    }
  }, [externalRecords]);

  // Auto-start DMCB extraction when records + AI config are ready
  useEffect(() => {
    if (dmcbStartedRef.current && rawRecords.length === prevRawLengthRef.current) return;
    if (rawRecords.length === 0) return;
    if (!dmcbAiConfig) {
      console.warn('[dmcb] No AI config — skipping extraction');
      return;
    }

    dmcbStartedRef.current = true;
    prevRawLengthRef.current = rawRecords.length;
    console.log(`[dmcb] Starting extraction: ${rawRecords.length} records`);
    dmcbExtraction.start();
  }, [rawRecords, dmcbAiConfig, dmcbExtraction.start]);

  // When extraction completes, load canonicals from Supabase and build signals
  const dmcbCompletedRef = useRef(false);
  useEffect(() => {
    if (dmcbExtraction.status !== 'completed') {
      dmcbCompletedRef.current = false;
      return;
    }
    if (dmcbCompletedRef.current) return;
    dmcbCompletedRef.current = true;

    dmcbExtraction.loadCanonicalMap().then((canonicalMap) => {
      const { signals, quarantined } = buildSignalsFromCanonicals({
        raw: rawRecords,
        canonicalMap,
      });
      setCanonicalSignals(signals);
      console.log('[dmcb] Phase 2 complete', { accepted: signals.length, quarantined: quarantined.length });
    }).catch((err) => {
      console.warn('[dmcb] Failed to load canonicals for Phase 2:', err);
    });
  }, [dmcbExtraction.status, dmcbExtraction.loadCanonicalMap, rawRecords]);

  // Build canonical lookup by recordKey for downstream intent text resolution
  const canonicalByRecordKey = useMemo(() => {
    const m = new Map<string, CanonicalSignal>();
    for (const s of canonicalSignals) m.set(s.recordKey, s);
    return m;
  }, [canonicalSignals]);

  // =========================================================================
  // EMBEDDING STEP (Phase 40) — runs after DMCB extraction completes
  // Platform infrastructure — uses our key, not BYOK
  // =========================================================================

  const embeddingJobId = useMemo(
    () => dmcbExtraction.jobId ? `embed-${dmcbExtraction.jobId}` : 'embed-empty',
    [dmcbExtraction.jobId],
  );

  const embedding = useEmbedding({
    signals: canonicalSignals,
    jobId: dmcbExtraction.jobId || '',
  });

  // Auto-start embedding when canonical signals are ready
  const embedStartedRef = useRef(false);
  const prevSignalsLengthRef = useRef(0);
  useEffect(() => {
    if (embedStartedRef.current && canonicalSignals.length === prevSignalsLengthRef.current) return;
    if (canonicalSignals.length === 0) return;

    embedStartedRef.current = true;
    prevSignalsLengthRef.current = canonicalSignals.length;
    console.log(`[embed] Starting embedding: ${canonicalSignals.length} signals`);
    embedding.start();
  }, [canonicalSignals, embedding.start]);

  // =========================================================================
  // TOP-K PAIR GENERATION (Phase 40) — runs after embedding completes
  // =========================================================================

  const [candidatePairs, setCandidatePairs] = useState<CandidatePair[]>([]);

  const pairsGeneratedRef = useRef(false);
  useEffect(() => {
    if (embedding.status !== 'completed') {
      pairsGeneratedRef.current = false;
      return;
    }
    if (pairsGeneratedRef.current) return;
    pairsGeneratedRef.current = true;

    console.log('[pairGen] Embedding complete, generating top-K pairs...');
    generateCandidatePairs({
      signals: canonicalSignals,
      embeddingJobId,
    }).then((pairs) => {
      setCandidatePairs(pairs);
      console.log(`[pairGen] Generated ${pairs.length} candidate pairs via top-K`);
    }).catch((err) => {
      console.warn('[pairGen] Failed to generate pairs:', err);
    });
  }, [embedding.status, canonicalSignals, embeddingJobId]);

  // =========================================================================
  // MCP PAIR EVALUATION (Phase 39) — runs after pair generation completes
  // =========================================================================

  // MCP evaluation via useJobRunner (BYOK)
  const mcpEvaluation = useMCPEvaluation({
    candidatePairs,
    aiConfig: safeAiConfig,
  });

  // Auto-start MCP evaluation when candidate pairs are ready + AI config exists
  const mcpEvalStartedRef = useRef(false);
  const prevPairsLengthRef = useRef(0);
  useEffect(() => {
    if (mcpEvalStartedRef.current && candidatePairs.length === prevPairsLengthRef.current) return;
    if (candidatePairs.length === 0) return;
    if (!dmcbAiConfig) {
      console.warn('[mcp-eval] No AI config — skipping evaluation');
      return;
    }

    mcpEvalStartedRef.current = true;
    prevPairsLengthRef.current = candidatePairs.length;
    console.log(`[mcp-eval] Starting evaluation: ${candidatePairs.length} pairs`);
    mcpEvaluation.start();
  }, [candidatePairs, dmcbAiConfig, mcpEvaluation.start]);

  // =========================================================================
  // APPROVAL HANDLERS (moved from Flow.tsx lines 1029-1045)
  // =========================================================================
  const handleApproveEvaluation = useCallback((evalId: string) => {
    setEvaluations(prev => prev.map(ev =>
      ev.id === evalId && ev.status === 'proposed'
        ? { ...ev, status: 'approved' as const, updated_at: new Date().toISOString() }
        : ev
    ));
    console.log('[EVAL] approved', evalId);
  }, []);

  const handleSkipEvaluation = useCallback((evalId: string) => {
    setEvaluations(prev => prev.map(ev =>
      ev.id === evalId && ev.status === 'proposed'
        ? { ...ev, status: 'skipped' as const, updated_at: new Date().toISOString() }
        : ev
    ));
    console.log('[EVAL] skipped', evalId);
  }, []);

  // =========================================================================
  // OUTCOME HANDLER (moved from Flow.tsx lines 1047-1076)
  // =========================================================================
  const handleEvaluationOutcome = useCallback((evalId: string, outcomeStatus: EvaluationOutcomeStatus) => {
    const nowISO = new Date().toISOString();
    setEvaluations(prev => prev.map(ev =>
      ev.id === evalId && ev.status === 'consumed'
        ? { ...ev, status: 'scored' as const, outcome: { status: outcomeStatus, at: nowISO }, updated_at: nowISO }
        : ev
    ));

    // Phase 21: propagate outcome to corresponding IntroEntries
    const applyOutcome = (entry: IntroEntryLike): IntroEntryLike => {
      if (entry.evaluationId !== evalId) return entry;
      const replyLatencyMs = entry.sentAt
        ? Date.parse(nowISO) - Date.parse(entry.sentAt)
        : undefined;
      return { ...entry, outcomeType: outcomeStatus, outcomeAt: nowISO, replyLatencyMs };
    };

    if (setDemandIntros) {
      setDemandIntros(prev => {
        const next = new Map(prev);
        for (const [k, v] of next) {
          if (v.evaluationId === evalId) next.set(k, applyOutcome(v));
        }
        return next;
      });
    }
    if (setSupplyIntros) {
      setSupplyIntros(prev => {
        const next = new Map(prev);
        for (const [k, v] of next) {
          if (v.evaluationId === evalId) next.set(k, applyOutcome(v));
        }
        return next;
      });
    }

    console.log('[EVAL] scored', evalId, outcomeStatus);
  }, [setDemandIntros, setSupplyIntros]);

  // =========================================================================
  // KEYBOARD HANDLERS (moved from Flow.tsx lines 1085-1146)
  // =========================================================================
  const focusedEvalIdRef = useRef<string | null>(null);

  // Auto-focus first actionable evaluation
  const autoFocusFiredRef = useRef(false);
  useEffect(() => {
    if (autoFocusFiredRef.current || evaluations.length === 0) return;
    const target =
      evaluations.find(e => e.status === 'proposed') ||
      evaluations.find(e => e.status === 'approved') ||
      evaluations.find(e => e.status === 'consumed' && !e.outcome);
    if (!target) return;
    focusedEvalIdRef.current = target.id;
    const el = evalCardRefs.current.get(target.id);
    if (!el) return;
    autoFocusFiredRef.current = true;
    el.scrollIntoView({ block: 'center', behavior: 'auto' });
  }, [evaluations, evalCardRefs]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      if (evaluations.length === 0) return;

      const STATUS_ORDER: Record<string, number> = { proposed: 0, approved: 0, consumed: 1, scored: 2, skipped: 3, reviewed: 0 };
      const READINESS_ORDER: Record<string, number> = { READY: 0, WARMING: 1, NOT_YET: 2 };
      const sorted = [...evaluations].sort((a, b) => {
        const sa = STATUS_ORDER[a.status] ?? 0;
        const sb = STATUS_ORDER[b.status] ?? 0;
        if (sa !== sb) return sa - sb;
        const ra = READINESS_ORDER[a.scores.readiness] ?? 2;
        const rb = READINESS_ORDER[b.scores.readiness] ?? 2;
        if (ra !== rb) return ra - rb;
        return b.scores.match_score - a.scores.match_score;
      });
      const ids = sorted.map(ev => ev.id);
      const currentIdx = focusedEvalIdRef.current ? ids.indexOf(focusedEvalIdRef.current) : -1;

      if (e.key === 'j' || e.key === 'J') {
        const next = currentIdx < ids.length - 1 ? currentIdx + 1 : 0;
        focusedEvalIdRef.current = ids[next];
        evalCardRefs.current.get(ids[next])?.scrollIntoView({ block: 'center', behavior: 'auto' });
      } else if (e.key === 'k' || e.key === 'K') {
        const prev = currentIdx > 0 ? currentIdx - 1 : ids.length - 1;
        focusedEvalIdRef.current = ids[prev];
        evalCardRefs.current.get(ids[prev])?.scrollIntoView({ block: 'center', behavior: 'auto' });
      } else if (e.key === 'a' || e.key === 'A') {
        if (focusedEvalIdRef.current) handleApproveEvaluation(focusedEvalIdRef.current);
      } else if (e.key === 's' || e.key === 'S') {
        if (focusedEvalIdRef.current) handleSkipEvaluation(focusedEvalIdRef.current);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [evaluations, handleApproveEvaluation, handleSkipEvaluation, evalCardRefs]);

  // =========================================================================
  // STATION MODE DERIVATION (moved from Flow.tsx lines 3550-3560)
  // =========================================================================
  const PROCESSING_STEPS = ['validating', 'matching', 'enriching', 'generating', 'sending'];
  const stationMode =
    evaluations.length > 0 &&
    evaluations.some(e =>
      e.status === 'proposed' ||
      e.status === 'approved' ||
      e.status === 'consumed'
    );
  const showStation = stationMode && !PROCESSING_STEPS.includes(step);

  // =========================================================================
  // TELEMETRY — Phases 22-32 (moved from Flow.tsx lines 3563-3739)
  // =========================================================================

  // Phase 22: Station metrics
  const stationMetrics = useMemo(() => {
    if (!stationMode) return null;
    return computeStationMetrics({
      evaluations,
      demandIntros: demandIntros as any,
      supplyIntros: supplyIntros as any,
      window: 'today',
    });
  }, [stationMode, evaluations, demandIntros, supplyIntros]);

  // Phase 25: Segment lift
  const segmentLift = useMemo(() => {
    if (!stationMode) return null;
    return computeSegmentLift(demandIntros as any, supplyIntros as any, evaluations);
  }, [stationMode, evaluations, demandIntros, supplyIntros]);

  const segmentLiftLoggedRef = useRef(false);
  useEffect(() => {
    if (!segmentLift || segmentLift.length === 0 || segmentLiftLoggedRef.current) return;
    segmentLiftLoggedRef.current = true;
    console.table(segmentLift.map(s => ({
      segment: s.segment,
      sent: s.totalSent,
      replies: s.replies,
      replyRate: `${(s.replyRate * 100).toFixed(0)}%`,
      aiRate: `${(s.aiReplyRate * 100).toFixed(0)}%`,
      nonAiRate: `${(s.nonAiReplyRate * 100).toFixed(0)}%`,
      lift: `${(s.lift * 100).toFixed(1)}%`,
      avgLatency: s.avgLatencyMs != null ? `${Math.round(s.avgLatencyMs / 60000)}m` : '—',
      avgConf: s.avgConfidenceAI != null ? s.avgConfidenceAI.toFixed(2) : '—',
    })));
  }, [segmentLift]);

  // Phase 26: Evaluation quality
  const evaluationQuality = useMemo(() => {
    if (!stationMode) return null;
    return computeEvaluationQuality(demandIntros as any, supplyIntros as any, evaluations);
  }, [stationMode, evaluations, demandIntros, supplyIntros]);

  const evalQualityLoggedRef = useRef(false);
  useEffect(() => {
    if (!evaluationQuality || evaluationQuality.totalEvaluations === 0 || evalQualityLoggedRef.current) return;
    evalQualityLoggedRef.current = true;
    console.table({
      totalEvaluations: evaluationQuality.totalEvaluations,
      approvedRate: `${(evaluationQuality.approvedRate * 100).toFixed(0)}%`,
      consumedRate: `${(evaluationQuality.consumedRate * 100).toFixed(0)}%`,
      replyRate: `${(evaluationQuality.replyRate * 100).toFixed(0)}%`,
      meetingRate: `${(evaluationQuality.meetingRate * 100).toFixed(0)}%`,
    });
    if (Object.keys(evaluationQuality.readinessBreakdown).length > 0) {
      console.table(Object.fromEntries(
        Object.entries(evaluationQuality.readinessBreakdown).map(([k, v]) => [k, { sent: (v as any).sent, replies: (v as any).replies, replyRate: `${((v as any).replyRate * 100).toFixed(0)}%` }])
      ));
    }
    if (Object.keys(evaluationQuality.tierBreakdown).length > 0) {
      console.table(Object.fromEntries(
        Object.entries(evaluationQuality.tierBreakdown).map(([k, v]) => [k, { sent: (v as any).sent, replies: (v as any).replies, replyRate: `${((v as any).replyRate * 100).toFixed(0)}%` }])
      ));
    }
    console.table({
      'conf<0.5': { sent: evaluationQuality.confidenceBuckets.low.sent, replies: evaluationQuality.confidenceBuckets.low.replies, replyRate: `${(evaluationQuality.confidenceBuckets.low.replyRate * 100).toFixed(0)}%` },
      'conf 0.5-0.75': { sent: evaluationQuality.confidenceBuckets.mid.sent, replies: evaluationQuality.confidenceBuckets.mid.replies, replyRate: `${(evaluationQuality.confidenceBuckets.mid.replyRate * 100).toFixed(0)}%` },
      'conf>0.75': { sent: evaluationQuality.confidenceBuckets.high.sent, replies: evaluationQuality.confidenceBuckets.high.replies, replyRate: `${(evaluationQuality.confidenceBuckets.high.replyRate * 100).toFixed(0)}%` },
    });
  }, [evaluationQuality]);

  // Phase 27: Calibration drift
  const calibrationDrift = useMemo(() => {
    if (!stationMode) return null;
    return computeCalibrationDrift(demandIntros as any, supplyIntros as any, evaluations);
  }, [stationMode, evaluations, demandIntros, supplyIntros]);

  const calibrationLoggedRef = useRef(false);
  useEffect(() => {
    if (!calibrationDrift || calibrationDrift.totalSamples === 0 || calibrationLoggedRef.current) return;
    calibrationLoggedRef.current = true;
    console.table(calibrationDrift.buckets.map(b => ({
      range: b.range,
      avgConf: b.avgConfidence.toFixed(2),
      replyRate: `${(b.actualReplyRate * 100).toFixed(0)}%`,
      drift: `${(b.drift * 100).toFixed(1)}%`,
      samples: b.samples,
    })));
    console.log(`[Calibration] status: ${calibrationDrift.status} | overall drift: ${(calibrationDrift.overallDrift * 100).toFixed(1)}% | samples: ${calibrationDrift.totalSamples}`);
  }, [calibrationDrift]);

  // Phase 28: Operator throughput
  const operatorThroughput = useMemo(() => {
    if (!stationMode) return null;
    return computeOperatorThroughput(demandIntros as any, supplyIntros as any, evaluations);
  }, [stationMode, evaluations, demandIntros, supplyIntros]);

  const throughputLoggedRef = useRef(false);
  useEffect(() => {
    if (!operatorThroughput || operatorThroughput.totals.proposed === 0 || throughputLoggedRef.current) return;
    throughputLoggedRef.current = true;
    console.table(operatorThroughput.totals);
    console.table({
      approvalRate: `${(operatorThroughput.rates.approvalRate * 100).toFixed(0)}%`,
      sendRate: `${(operatorThroughput.rates.sendRate * 100).toFixed(0)}%`,
      replyRate: `${(operatorThroughput.rates.replyRate * 100).toFixed(0)}%`,
      meetingRate: `${(operatorThroughput.rates.meetingRate * 100).toFixed(0)}%`,
    });
    console.table({
      medianApproval: operatorThroughput.timing.medianApprovalMinutes != null ? `${operatorThroughput.timing.medianApprovalMinutes.toFixed(1)}m` : '—',
      medianSend: operatorThroughput.timing.medianSendMinutes != null ? `${operatorThroughput.timing.medianSendMinutes.toFixed(1)}m` : '—',
      medianReply: operatorThroughput.timing.medianReplyMinutes != null ? `${operatorThroughput.timing.medianReplyMinutes.toFixed(1)}m` : '—',
    });
  }, [operatorThroughput]);

  // Phase 29: Market feedback
  const marketFeedback = useMemo(() => {
    if (!stationMode) return null;
    return computeMarketFeedback(demandIntros as any, supplyIntros as any, evaluations);
  }, [stationMode, evaluations, demandIntros, supplyIntros]);

  const marketFeedbackLoggedRef = useRef(false);
  useEffect(() => {
    if (!marketFeedback) return;
    if (marketFeedback.edgePerformance.length === 0 && marketFeedback.readinessPerformance.length === 0 && marketFeedback.tierPerformance.length === 0) return;
    if (marketFeedbackLoggedRef.current) return;
    marketFeedbackLoggedRef.current = true;
    console.log('[Market Feedback]');
    if (marketFeedback.edgePerformance.length > 0) console.table(marketFeedback.edgePerformance.map(e => ({ edge: e.edge_type, sent: e.sent, replies: e.replies, replyRate: `${(e.replyRate * 100).toFixed(0)}%` })));
    if (marketFeedback.readinessPerformance.length > 0) console.table(marketFeedback.readinessPerformance.map(r => ({ readiness: r.readiness, sent: r.sent, replies: r.replies, replyRate: `${(r.replyRate * 100).toFixed(0)}%` })));
    if (marketFeedback.tierPerformance.length > 0) console.table(marketFeedback.tierPerformance.map(t => ({ tier: t.tier, sent: t.sent, replies: t.replies, replyRate: `${(t.replyRate * 100).toFixed(0)}%` })));
  }, [marketFeedback]);

  // Phase 30: Next moves
  const nextMoves = useMemo(() => {
    if (!stationMode || !stationMetrics || !calibrationDrift || !operatorThroughput || !marketFeedback) return null;
    return computeNextMoves(marketFeedback, calibrationDrift, operatorThroughput, stationMetrics);
  }, [stationMode, stationMetrics, calibrationDrift, operatorThroughput, marketFeedback]);

  const nextMovesLoggedRef = useRef(false);
  useEffect(() => {
    if (!nextMoves || nextMoves.length === 0 || nextMovesLoggedRef.current) return;
    nextMovesLoggedRef.current = true;
    console.log('[Next Moves]');
    nextMoves.forEach((m, i) => {
      console.log(`${i + 1}. ${m.title}`);
      console.log(`   why: ${m.why}`);
      console.log(`   action: ${m.action}`);
      m.evidence.forEach(e => console.log(`   - ${e}`));
    });
  }, [nextMoves]);

  // Phase 31: Session snapshot
  const stationSnapshot = useMemo(() => {
    if (!stationMode || !stationMetrics || !segmentLift || !evaluationQuality || !calibrationDrift || !operatorThroughput || !marketFeedback || !nextMoves) return null;
    return buildSessionSnapshot(
      stationMetrics,
      segmentLift,
      evaluationQuality,
      calibrationDrift,
      operatorThroughput,
      marketFeedback,
      nextMoves,
    );
  }, [stationMode, stationMetrics, segmentLift, evaluationQuality, calibrationDrift, operatorThroughput, marketFeedback, nextMoves]);

  const snapshotLoggedRef = useRef(false);
  useEffect(() => {
    if (!stationSnapshot || snapshotLoggedRef.current) return;
    console.log('[station:snapshot]', stationSnapshot);
    snapshotLoggedRef.current = true;
  }, [stationSnapshot]);

  // Phase 32: Persist snapshot to localStorage
  const snapshotSavedRef = useRef(false);
  useEffect(() => {
    if (!stationSnapshot || snapshotSavedRef.current) return;
    saveSnapshot(stationSnapshot);
    console.log('[station:memory] snapshot saved', { id: stationSnapshot.id });
    snapshotSavedRef.current = true;
  }, [stationSnapshot]);

  // =========================================================================
  // ACTIONS
  // =========================================================================

  // Build + MCP enhance evaluations (moved from Flow.tsx lines 1909-1931)
  const buildAndEnhance = useCallback((matches: Match[], edges: Map<string, Edge>, aiConfig: AIConfig | null) => {
    if (evaluations.length > 0) {
      console.log('[EVAL] Skipping rebuild — evaluations already exist');
      return;
    }
    const evals = buildEvaluations(matches, edges);
    setEvaluations(evals);
    console.log('[Evaluation] built:', evals.length);

    const mcpAI = aiConfig ? {
      provider: aiConfig.provider as 'openai' | 'azure' | 'anthropic',
      apiKey: aiConfig.apiKey,
      model: aiConfig.model,
      endpoint: aiConfig.endpoint,
      deployment: aiConfig.deployment,
    } : null;
    enhanceEvaluations(evals, mcpAI)
      .then(result => {
        setEvaluations(result.evaluations);
        setMcpErrors(result.mcpErrors);
      })
      .catch(() => {});
  }, [evaluations.length]);

  // Intent stamp orchestration (moved from Flow.tsx lines 1698-1712)
  const stampIntents = useCallback((
    extractedNeeds: any,
    extractedCapabilities: any,
    demandRecs: NormalizedRecord[],
    supplyRecs: NormalizedRecord[],
  ) => {
    try {
      const intentMaps = buildIntentMaps(extractedNeeds, extractedCapabilities);
      const stamped = stampIntentOnRecords(demandRecs, supplyRecs, intentMaps);
      console.log('[intent-stamp]', {
        demandStamped: stamped.demand.filter((r: any) => r.intent).length,
        supplyStamped: stamped.supply.filter((r: any) => r.intent).length,
      });
      return stamped;
    } catch {
      return { demand: demandRecs, supply: supplyRecs };
    }
  }, []);

  // Phase 24: MCP diagnosis
  const diagnosis = useMemo(() => {
    if (mcpErrors.length === 0) return null;
    return topDiagnosis(mcpErrors);
  }, [mcpErrors]);

  // Guardrail: never empty screen
  if (stationMode && evaluations.length === 0) {
    console.warn('[Station] unexpected empty state');
  }

  // =========================================================================
  // RETURN — organized per haha.txt contract
  // =========================================================================
  return {
    evaluations: {
      items: evaluations,
      mcpErrors,
      diagnosis,
    },
    handlers: {
      approve: handleApproveEvaluation,
      skip: handleSkipEvaluation,
      outcome: handleEvaluationOutcome,
    },
    metrics: {
      stationMetrics,
      segmentLift,
      evaluationQuality,
      calibrationDrift,
      operatorThroughput,
      marketFeedback,
      nextMoves,
      stationSnapshot,
    },
    actions: {
      buildAndEnhance,
      stampIntents,
      setEvaluations,
      stationMode,
      showStation,
      focusedEvalId: focusedEvalIdRef,
    },
    dmcb: {
      canonicalByRecordKey,
      canonicalSignals,
      extraction: {
        status: dmcbExtraction.status,
        progress: dmcbExtraction.progress,
        start: dmcbExtraction.start,
        pause: dmcbExtraction.pause,
        abort: dmcbExtraction.abort,
        resume: dmcbExtraction.resume,
        jobId: dmcbExtraction.jobId,
      },
    },
    embedding: {
      status: embedding.status,
      progress: embedding.progress,
      start: embedding.start,
      pause: embedding.pause,
      abort: embedding.abort,
      resume: embedding.resume,
      jobId: embedding.jobId,
    },
    mcpEval: {
      candidatePairs,
      status: mcpEvaluation.status,
      progress: mcpEvaluation.progress,
      start: mcpEvaluation.start,
      pause: mcpEvaluation.pause,
      abort: mcpEvaluation.abort,
      resume: mcpEvaluation.resume,
      jobId: mcpEvaluation.jobId,
    },
    loadExternalRecords,
    pushCanonicalSignals,
  };
}
