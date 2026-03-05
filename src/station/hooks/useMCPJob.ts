/**
 * useMCPJob — Streaming evaluation hook for the V5 QStash pipeline
 *
 * Browser makes ONE POST to mcp-orchestrate. Server does everything.
 * This hook subscribes to Supabase Realtime on:
 *   - mcp_evaluations (INSERT, filtered by job_id)
 *   - mcp_jobs (UPDATE, filtered by job_id)
 *
 * Exposes: status, progress, matches[], estimatedRemaining, actions
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { cleanCompanyName } from '../intro/engine';

// =============================================================================
// TYPES
// =============================================================================

export type JobPhase = 'idle' | 'embedding' | 'retrieving' | 'evaluating' | 'complete' | 'failed' | 'aborted';

export type Classification = 'PASS' | 'MARGINAL' | 'QUARANTINE' | 'HARD_DROP';
export type Readiness = 'READY' | 'WARMING' | 'NOT_YET';

export interface MatchResult {
  id: string;
  evalId: string;
  demandKey: string;
  supplyKey: string;
  scores: { fit: number; timing: number; combined: number };
  classification: Classification;
  readiness: Readiness;
  vetoed: boolean;
  vetoReason: string | null;
  risks: string[];
  framing: string;
  reasoning: string;
  similarity: number;
  rank: number;
  evaluatedAt: string;
  evalStatus: 'scored' | 'reasoned' | 'curated';
}

export interface JobProgress {
  totalPairs: number;
  completedPairs: number;
  percentage: number;
  estimatedRemainingMs: number | null;
}

export interface JobBreakdown {
  pass: number;
  marginal: number;
  quarantine: number;
  vetoed: number;
}

export interface AIConfig {
  provider: 'openai' | 'azure' | 'anthropic';
  openaiApiKey?: string;
  azureApiKey?: string;
  azureEndpoint?: string;
  azureChatDeployment?: string;
  anthropicApiKey?: string;
  model?: string;
}

export interface CanonicalInfo {
  company: string;
  wants: string;
  offers: string;
  role: 'demand' | 'supply' | '';
  who: string;
  whyNow: string;
  industry: string | null;
  title: string | null;
  seniority: string | null;
  keywords: string[];
  domain: string | null;
  entityType: 'person' | 'organization';
  // Signal event metadata (from signal_events table)
  signalType: string | null;
  signalGroup: string | null;
  signalLabel: string | null;
}

interface OrchestrateResponse {
  jobId: string;
  status: string;
  totalPairs: number;
  totalShards?: number;
  error?: string;
}

// =============================================================================
// CLIENT-SIDE CLASSIFICATION (spec thresholds override AI)
// =============================================================================

function classifyByCombined(combined: number): Classification {
  if (combined >= 0.50) return 'PASS';
  if (combined >= 0.30) return 'MARGINAL';
  return 'QUARANTINE';
}

// =============================================================================
// HOOK
// =============================================================================

export function useMCPJob() {
  // Core state
  const [phase, setPhase] = useState<JobPhase>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [canonicals, setCanonicals] = useState<Map<string, CanonicalInfo>>(new Map());
  const [progress, setProgress] = useState<JobProgress>({
    totalPairs: 0,
    completedPairs: 0,
    percentage: 0,
    estimatedRemainingMs: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [scoringStatus, setScoringStatus] = useState<'pending' | 'scoring' | 'complete'>('pending');
  const [reasoningStatus, setReasoningStatus] = useState<'pending' | 'reasoning' | 'complete'>('pending');

  // Internal refs
  const startTimeRef = useRef<number>(0);
  const firstResultTimeRef = useRef<number>(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const matchMapRef = useRef<Map<string, MatchResult>>(new Map());
  const pendingCanonicalKeys = useRef<Set<string>>(new Set());
  const canonicalFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derived state
  const breakdown: JobBreakdown = {
    pass: 0,
    marginal: 0,
    quarantine: 0,
    vetoed: 0,
  };
  for (const m of matches) {
    if (m.vetoed) breakdown.vetoed++;
    else if (m.classification === 'PASS') breakdown.pass++;
    else if (m.classification === 'MARGINAL') breakdown.marginal++;
    else breakdown.quarantine++;
  }

  const readyCount = matches.filter((m) => m.classification === 'PASS' && !m.vetoed).length;

  // =========================================================================
  // ELAPSED TIMER
  // =========================================================================

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // =========================================================================
  // ESTIMATED REMAINING (from real data only)
  // =========================================================================

  const calcEstimatedRemaining = useCallback(
    (completed: number, total: number): number | null => {
      if (completed === 0 || total === 0 || !firstResultTimeRef.current) return null;
      const elapsed = Date.now() - firstResultTimeRef.current;
      const remaining = total - completed;
      if (remaining <= 0) return 0;
      return Math.round(elapsed * (remaining / completed));
    },
    [],
  );

  // =========================================================================
  // REALTIME HANDLERS
  // =========================================================================

  /** Map a DB row to a MatchResult */
  const mapRowToMatch = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (row: any): MatchResult => {
      const scores = row.scores || { fit: 0, timing: 0, combined: 0 };
      return {
        id: row.id,
        evalId: row.eval_id,
        demandKey: row.demand_key,
        supplyKey: row.supply_key,
        scores,
        classification: classifyByCombined(scores.combined),
        readiness: row.readiness || 'NOT_YET',
        vetoed: row.vetoed || false,
        vetoReason: row.veto_reason || null,
        risks: row.risks || [],
        framing: row.framing || '',
        reasoning: row.reasoning || '',
        similarity: row.similarity || 0,
        rank: row.rank || 0,
        evaluatedAt: row.evaluated_at || new Date().toISOString(),
        evalStatus: row.eval_status || 'reasoned',
      };
    },
    [],
  );

  const handleEvalChange = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (payload: { eventType: string; new: any }) => {
      const row = payload.new;
      if (!row) return;

      const match = mapRowToMatch(row);

      // Track first result time for ETA
      if (!firstResultTimeRef.current) {
        firstResultTimeRef.current = Date.now();
      }

      // INSERT (Phase 1 scored) or UPDATE (Phase 2 reasoning added)
      // Both merge into same map by evalId — UPDATE overwrites scored with reasoned
      matchMapRef.current.set(match.evalId, match);

      // Queue canonical lookup for new keys (batched, 300ms debounce)
      if (!canonicals.has(match.demandKey)) pendingCanonicalKeys.current.add(match.demandKey);
      if (!canonicals.has(match.supplyKey)) pendingCanonicalKeys.current.add(match.supplyKey);
      if (pendingCanonicalKeys.current.size > 0) {
        if (canonicalFlushTimer.current) clearTimeout(canonicalFlushTimer.current);
        canonicalFlushTimer.current = setTimeout(() => {
          const keys = Array.from(pendingCanonicalKeys.current);
          pendingCanonicalKeys.current.clear();
          if (keys.length > 0) {
            // Parallel fetch: dmcb_canonicals + signal_events
            Promise.all([
              supabase
                .from('dmcb_canonicals')
                .select('record_key, canonical')
                .in('record_key', keys),
              supabase
                .from('signal_events')
                .select('record_key, signal_type, signal_group, signal_label')
                .in('record_key', keys),
            ]).then(([canonicalResult, signalResult]) => {
              if (canonicalResult.data && canonicalResult.data.length > 0) {
                // Build signal lookup
                const signalMap = new Map<string, { signal_type: string; signal_group: string; signal_label: string }>();
                for (const row of signalResult.data ?? []) {
                  signalMap.set(row.record_key, row);
                }

                setCanonicals((prev) => {
                  const map = new Map(prev);
                  for (const row of canonicalResult.data) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const c: any = row.canonical || {};
                    const sig = signalMap.get(row.record_key);
                    map.set(row.record_key, {
                      company: cleanCompanyName(c.company || c.who || ''),
                      wants: c.wants || '',
                      offers: c.offers || c.wants || '',
                      role: c.role || '',
                      who: c.who || '',
                      whyNow: c.why_now || '',
                      industry: c.industry || null,
                      title: c.title || null,
                      seniority: c.seniority || null,
                      keywords: Array.isArray(c.keywords) ? c.keywords : [],
                      domain: c.domain || null,
                      entityType: c.entity_type === 'person' ? 'person' : 'organization',
                      signalType: sig?.signal_type ?? null,
                      signalGroup: sig?.signal_group ?? null,
                      signalLabel: sig?.signal_label ?? null,
                    });
                  }
                  return map;
                });
              }
            });
          }
        }, 300);
      }

      // Rebuild sorted array (combined desc)
      const sorted = Array.from(matchMapRef.current.values()).sort(
        (a, b) => b.scores.combined - a.scores.combined,
      );
      setMatches(sorted);
    },
    [mapRowToMatch, canonicals],
  );

  const handleJobUpdate = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (payload: { new: any }) => {
      const row = payload.new;
      if (!row) return;

      const status = row.status as JobPhase;
      const total = row.total_pairs || 0;
      const completed = row.completed_pairs || 0;
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

      setPhase(status);
      setProgress({
        totalPairs: total,
        completedPairs: completed,
        percentage: pct,
        estimatedRemainingMs: calcEstimatedRemaining(completed, total),
      });

      // Two-phase status tracking
      if (row.scoring_status) setScoringStatus(row.scoring_status);
      if (row.reasoning_status) setReasoningStatus(row.reasoning_status);

      if (status === 'complete' || status === 'failed' || status === 'aborted') {
        setPhase(status === 'aborted' ? 'failed' : status as JobPhase);
        stopTimer();
      }

      if (status === 'failed' && row.error) {
        setError(row.error);
      }
    },
    [calcEstimatedRemaining, stopTimer],
  );

  // =========================================================================
  // SUBSCRIBE TO REALTIME
  // =========================================================================

  const subscribe = useCallback(
    (activeJobId: string) => {
      // Clean up previous channel
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }

      const channel = supabase
        .channel(`mcp-job-${activeJobId}`)
        .on(
          'postgres_changes',
          {
            event: '*', // Two-pass: INSERT for scored, UPDATE for reasoned
            schema: 'public',
            table: 'mcp_evaluations',
            filter: `job_id=eq.${activeJobId}`,
          },
          handleEvalChange,
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'mcp_jobs',
            filter: `job_id=eq.${activeJobId}`,
          },
          handleJobUpdate,
        )
        .subscribe();

      channelRef.current = channel;
    },
    [handleEvalChange, handleJobUpdate],
  );

  // =========================================================================
  // CANONICAL LOOKUP (company names + intents)
  // =========================================================================

  const loadCanonicals = useCallback(async (recordKeys?: string[]) => {
    // Query by record_key (not job_id — DMCB and MCP use different job IDs)
    if (!recordKeys || recordKeys.length === 0) return;

    // Parallel fetch: dmcb_canonicals + signal_events
    const [canonicalResult, signalResult] = await Promise.all([
      supabase
        .from('dmcb_canonicals')
        .select('record_key, canonical')
        .in('record_key', recordKeys),
      supabase
        .from('signal_events')
        .select('record_key, signal_type, signal_group, signal_label')
        .in('record_key', recordKeys),
    ]);

    const data = canonicalResult.data;
    if (data && data.length > 0) {
      // Build signal lookup
      const signalMap = new Map<string, { signal_type: string; signal_group: string; signal_label: string }>();
      for (const row of signalResult.data ?? []) {
        signalMap.set(row.record_key, row);
      }

      setCanonicals((prev) => {
        const map = new Map(prev);
        for (const row of data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const c: any = row.canonical || {};
          const sig = signalMap.get(row.record_key);
          map.set(row.record_key, {
            company: c.company || c.who || '',
            wants: c.wants || '',
            offers: c.offers || c.wants || '',
            role: c.role || '',
            who: c.who || '',
            whyNow: c.why_now || '',
            industry: c.industry || null,
            title: c.title || null,
            seniority: c.seniority || null,
            keywords: Array.isArray(c.keywords) ? c.keywords : [],
            domain: c.domain || null,
            entityType: c.entity_type === 'person' ? 'person' : 'organization',
            signalType: sig?.signal_type ?? null,
            signalGroup: sig?.signal_group ?? null,
            signalLabel: sig?.signal_label ?? null,
          });
        }
        return map;
      });
    }
  }, []);

  // =========================================================================
  // LOAD EXISTING RESULTS (return-to-page)
  // =========================================================================

  const loadExistingResults = useCallback(async (activeJobId: string) => {
    // Load job status
    const { data: jobRow } = await supabase
      .from('mcp_jobs')
      .select('*')
      .eq('job_id', activeJobId)
      .single();

    if (jobRow) {
      const status = jobRow.status as JobPhase;
      setPhase(status);
      setProgress({
        totalPairs: jobRow.total_pairs || 0,
        completedPairs: jobRow.completed_pairs || 0,
        percentage:
          jobRow.total_pairs > 0
            ? Math.round(((jobRow.completed_pairs || 0) / jobRow.total_pairs) * 100)
            : 0,
        estimatedRemainingMs: null,
      });

      if (jobRow.scoring_status) setScoringStatus(jobRow.scoring_status);
      if (jobRow.reasoning_status) setReasoningStatus(jobRow.reasoning_status);

      if (status === 'failed' && jobRow.error) {
        setError(jobRow.error);
      }
    }

    // Load all existing evaluations
    const { data: evals } = await supabase
      .from('mcp_evaluations')
      .select('*')
      .eq('job_id', activeJobId)
      .order('scores->combined', { ascending: false });

    if (evals && evals.length > 0) {
      const map = new Map<string, MatchResult>();
      for (const row of evals) {
        const match = mapRowToMatch(row);
        map.set(match.evalId, match);
      }

      matchMapRef.current = map;

      // Load canonicals BEFORE setting matches — prevents flash of raw keys
      const allKeys = Array.from(map.values()).flatMap(
        (m) => [m.demandKey, m.supplyKey],
      );
      if (allKeys.length > 0) {
        await loadCanonicals(Array.from(new Set(allKeys)));
      }

      setMatches(Array.from(map.values()));
    }
  }, [mapRowToMatch, loadCanonicals]);

  // =========================================================================
  // ACTIONS
  // =========================================================================
  // TODO(saad, 2026-03-15): cron to fail jobs pending > 10min

  const start = useCallback(
    async (params: {
      demandKeys: string[];
      supplyKeys: string[];
      aiConfig: AIConfig;
      topK?: number;
      jobId?: string;
    }) => {
      const id = params.jobId || `v5-${Date.now()}`;
      setJobId(id);
      setPhase('embedding');
      setError(null);
      setMatches([]);
      matchMapRef.current.clear();
      firstResultTimeRef.current = 0;
      setProgress({ totalPairs: 0, completedPairs: 0, percentage: 0, estimatedRemainingMs: null });

      startTimer();
      loadCanonicals([...params.demandKeys, ...params.supplyKeys]);

      // Subscribe before POST so we catch the first result
      subscribe(id);

      try {
        const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp-orchestrate`;
        const res = await fetch(base, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            jobId: id,
            demandKeys: params.demandKeys,
            supplyKeys: params.supplyKeys,
            aiConfig: params.aiConfig,
            topK: params.topK || 10,
          }),
        });

        const data: OrchestrateResponse = await res.json();

        if (data.status === 'failed') {
          setPhase('failed');
          setError(data.error || 'Orchestrator failed');
          stopTimer();
          return;
        }

        setProgress((prev) => ({
          ...prev,
          totalPairs: data.totalPairs,
        }));

        if (data.status === 'complete' && data.totalPairs === 0) {
          setPhase('complete');
          stopTimer();
        }
      } catch (err) {
        setPhase('failed');
        setError((err as Error).message);
        stopTimer();
      }
    },
    [subscribe, startTimer, stopTimer, loadCanonicals],
  );

  const resume = useCallback(
    async (existingJobId: string) => {
      setJobId(existingJobId);
      startTimer();
      await loadExistingResults(existingJobId);
      subscribe(existingJobId);
    },
    [subscribe, startTimer, loadExistingResults],
  );

  const abort = useCallback(async () => {
    if (!jobId) return;
    await supabase
      .from('mcp_jobs')
      .update({ status: 'aborted', completed_at: new Date().toISOString() })
      .eq('job_id', jobId);
    setPhase('aborted');
    stopTimer();
  }, [jobId, stopTimer]);

  const pause = useCallback(async () => {
    if (!jobId) return;
    // QStash has no pause — mark job but shards continue
    await supabase
      .from('mcp_jobs')
      .update({ status: 'aborted' })
      .eq('job_id', jobId);
    setPhase('aborted');
    stopTimer();
  }, [jobId, stopTimer]);

  // =========================================================================
  // CLEANUP
  // =========================================================================

  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (canonicalFlushTimer.current) {
        clearTimeout(canonicalFlushTimer.current);
      }
    };
  }, []);

  // =========================================================================
  // CHECK FOR ACTIVE/COMPLETE JOB ON MOUNT
  // =========================================================================

  useEffect(() => {
    async function checkExisting() {
      const { data } = await supabase
        .from('mcp_jobs')
        .select('job_id, status')
        .in('status', ['embedding', 'retrieving', 'evaluating', 'complete'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const existing = data[0];
        setJobId(existing.job_id);
        await loadExistingResults(existing.job_id);

        // If still running, subscribe for updates
        if (['embedding', 'retrieving', 'evaluating'].includes(existing.status)) {
          startTimer();
          subscribe(existing.job_id);
        }
      }
    }
    checkExisting();
  }, [loadExistingResults, subscribe, startTimer]);

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  return {
    // State
    phase,
    jobId,
    matches,
    canonicals,
    progress,
    breakdown,
    readyCount,
    error,
    elapsedMs,
    scoringStatus,
    reasoningStatus,

    // Actions
    start,
    resume,
    pause,
    abort,
  };
}
