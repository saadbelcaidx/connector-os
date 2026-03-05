/**
 * TestFulfillment — Fulfillment Simulation Page
 *
 * Route: /station/test-fulfillment
 *
 * Standalone test page for Saad to:
 *   1. Pick any completed run
 *   2. Pick any fulfillment client (from localStorage)
 *   3. See before/after overlay filtering with full diagnostics
 *   4. Verify signal group distribution, tier counts, exclusion reasons
 *   5. Navigate to compose (SendPage applies the same lens)
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { cleanCompanyName } from '../intro/engine';
import { applyOverlayV2 } from '../lib/applyOverlayV2';
import type { OverlayV2Result } from '../lib/applyOverlayV2';
import type { MatchResult, CanonicalInfo } from '../hooks/useMCPJob';
import type { FulfillmentClient, ClientOverlay, OverlaySpec, ClientProfile } from '../../types/station';

// =============================================================================
// TYPES
// =============================================================================

interface JobOption {
  job_id: string;
  market_name: string;
  completed_at: string;
  total_pairs: number;
}

// =============================================================================
// HELPERS
// =============================================================================

function tierFromScore(combined: number): 'strong' | 'good' | 'weak' {
  if (combined >= 0.7) return 'strong';
  if (combined >= 0.5) return 'good';
  return 'weak';
}

const TIER_COLORS: Record<string, string> = {
  strong: '#34d399',
  good: '#facc15',
  weak: '#f87171',
};

const GROUP_COLORS: Record<string, string> = {
  growth: '#34d399',
  capital: '#60a5fa',
  product: '#c084fc',
  deals: '#f59e0b',
  risk: '#f87171',
  other: '#94a3b8',
  unknown: '#64748b',
};

// =============================================================================
// MAIN
// =============================================================================

export default function TestFulfillment() {
  const navigate = useNavigate();

  // ── Data state ──
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [canonicals, setCanonicals] = useState<Map<string, CanonicalInfo>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Client state ──
  const [selectedClientId, setSelectedClientId] = useState('');

  // ── Load completed jobs on mount ──
  useEffect(() => {
    async function loadJobs() {
      const { data } = await supabase
        .from('mcp_jobs')
        .select('job_id, market_name, completed_at, total_pairs')
        .eq('status', 'complete')
        .order('completed_at', { ascending: false })
        .limit(20);
      if (data) setJobs(data);
    }
    loadJobs();
  }, []);

  // ── Load matches + canonicals when job selected ──
  useEffect(() => {
    if (!selectedJobId) return;

    async function loadData() {
      setLoading(true);
      setError(null);
      setMatches([]);
      setCanonicals(new Map());

      // 1. Load evaluations
      // Load ALL evaluations — same as useMCPJob.resume() (no eval_status filter)
      const { data: evals, error: evalErr } = await supabase
        .from('mcp_evaluations')
        .select('*')
        .eq('job_id', selectedJobId)
        .order('scores->combined', { ascending: false });

      if (evalErr) {
        setError(evalErr.message);
        setLoading(false);
        return;
      }

      // 2. Build MatchResult[] from rows
      const builtMatches: MatchResult[] = (evals || []).map((row) => ({
        id: row.id,
        evalId: row.eval_id,
        demandKey: row.demand_key,
        supplyKey: row.supply_key,
        scores: row.scores || { fit: 0, timing: 0, combined: 0 },
        classification: row.scores?.combined >= 0.5 ? 'PASS' as const
          : row.scores?.combined >= 0.3 ? 'MARGINAL' as const
          : 'QUARANTINE' as const,
        readiness: (row.readiness || 'NOT_YET') as MatchResult['readiness'],
        vetoed: row.vetoed || false,
        vetoReason: row.veto_reason || null,
        risks: row.risks || [],
        framing: row.framing || '',
        reasoning: row.reasoning || '',
        similarity: row.similarity || 0,
        rank: row.rank || 0,
        evaluatedAt: row.evaluated_at || '',
        evalStatus: (row.eval_status || 'reasoned') as MatchResult['evalStatus'],
      }));

      if (builtMatches.length === 0) {
        setError('No evaluated matches found for this run.');
        setLoading(false);
        return;
      }

      // 3. Load canonicals + signal events (parallel)
      const allKeys = [...new Set(builtMatches.flatMap((m) => [m.demandKey, m.supplyKey]))];

      const [canonRes, signalRes] = await Promise.all([
        supabase
          .from('dmcb_canonicals')
          .select('record_key, canonical')
          .in('record_key', allKeys),
        supabase
          .from('signal_events')
          .select('record_key, signal_type, signal_group, signal_label')
          .in('record_key', allKeys),
      ]);

      // Build signal lookup
      const signalMap = new Map<string, { signal_type: string; signal_group: string; signal_label: string }>();
      for (const row of signalRes.data || []) {
        signalMap.set(row.record_key, row);
      }

      // Build canonical map
      const cMap = new Map<string, CanonicalInfo>();
      for (const row of canonRes.data || []) {
        const c: Record<string, unknown> = (row.canonical as Record<string, unknown>) || {};
        const sig = signalMap.get(row.record_key);
        cMap.set(row.record_key, {
          company: cleanCompanyName((c.company as string) || (c.who as string) || ''),
          wants: (c.wants as string) || '',
          offers: (c.offers as string) || (c.wants as string) || '',
          role: ((c.role as string) || '') as CanonicalInfo['role'],
          who: (c.who as string) || '',
          whyNow: (c.why_now as string) || '',
          industry: (c.industry as string) || null,
          title: (c.title as string) || null,
          seniority: (c.seniority as string) || null,
          keywords: Array.isArray(c.keywords) ? (c.keywords as string[]) : [],
          domain: (c.domain as string) || null,
          entityType: c.entity_type === 'person' ? 'person' : 'organization',
          signalType: sig?.signal_type ?? null,
          signalGroup: sig?.signal_group ?? null,
          signalLabel: sig?.signal_label ?? null,
        });
      }

      setMatches(builtMatches);
      setCanonicals(cMap);
      setLoading(false);
    }
    loadData();
  }, [selectedJobId]);

  // ── Clients from localStorage ──
  const clients: FulfillmentClient[] = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('station_fulfillment_clients') || '[]');
    } catch {
      return [];
    }
  }, []);

  // ── Overlay + profile from selected client ──
  const { overlay, profile, economicSide, clientName } = useMemo(() => {
    const empty = { overlay: null as OverlaySpec | null, profile: null as ClientProfile | null, economicSide: undefined as 'demand' | 'supply' | undefined, clientName: '' };
    if (!selectedClientId) return empty;
    try {
      const client = clients.find(c => c.id === selectedClientId);
      if (!client) return empty;

      const overlays: ClientOverlay[] = JSON.parse(localStorage.getItem('station_client_overlays') || '[]');
      const versions = overlays.filter(o => o.clientId === selectedClientId).sort((a, b) => b.version - a.version);
      const active = versions.find(o => o.isActive) ?? versions[0];
      if (!active) return { ...empty, clientName: client.name };

      const ecoSide = client.economicSide === 'demand' || client.economicSide === 'supply'
        ? client.economicSide
        : undefined;

      return {
        overlay: active.overlay,
        profile: client.profile ?? null,
        economicSide: ecoSide,
        clientName: client.name,
      };
    } catch {
      return empty;
    }
  }, [selectedClientId, clients]);

  // ── Apply overlay ──
  const overlayResults: OverlayV2Result[] | null = useMemo(() => {
    const nonVetoed = matches.filter(m => !m.vetoed);
    if (!overlay || nonVetoed.length === 0) return null;
    return applyOverlayV2(nonVetoed, canonicals, overlay, profile ?? undefined, economicSide);
  }, [matches, canonicals, overlay, profile, economicSide]);

  // ── Stats ──
  const stats = useMemo(() => {
    const nonVetoed = matches.filter(m => !m.vetoed);
    const included = overlayResults ? overlayResults.filter(r => !r.excluded) : [];
    const excluded = overlayResults ? overlayResults.filter(r => r.excluded) : [];

    // Signal group distribution (from included matches, demand-side canonical)
    const signalGroups: Record<string, number> = {};
    const source = overlayResults ? included : nonVetoed.map(m => ({ match: m, excluded: false }));
    for (const item of source) {
      const m = 'match' in item ? item.match : item;
      const dc = canonicals.get(m.demandKey);
      const g = dc?.signalGroup || 'unknown';
      signalGroups[g] = (signalGroups[g] || 0) + 1;
    }

    // Tier distribution (from included matches)
    const tiers: Record<string, number> = { strong: 0, good: 0, weak: 0 };
    for (const item of source) {
      const m = 'match' in item ? item.match : item;
      tiers[tierFromScore(m.scores.combined)]++;
    }

    // Exclusion reasons
    const reasons: Record<string, number> = {};
    for (const r of excluded) {
      const key = r.excludeReason || 'unknown';
      reasons[key] = (reasons[key] || 0) + 1;
    }

    return {
      totalNonVetoed: nonVetoed.length,
      vetoed: matches.length - nonVetoed.length,
      included: overlayResults ? included.length : nonVetoed.length,
      excluded: excluded.length,
      signalGroups,
      tiers,
      reasons,
    };
  }, [matches, canonicals, overlayResults]);

  // ── "Open in Compose" ──
  function handleOpenCompose() {
    if (selectedClientId) {
      localStorage.setItem('station_active_lens_client_id', selectedClientId);
    }
    navigate(`/station/run/${selectedJobId}/send`);
  }

  // ── Render ──
  return (
    <div className="min-h-screen bg-[#09090b] text-white p-6" style={{ animation: 'pageIn 0.25s ease-out' }}>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight mb-1">Fulfillment Simulation</h1>
        <p className="text-white/40 text-xs font-mono">
          Pick a run + client lens. See before/after overlay filtering.
        </p>
      </div>

      {/* Pickers */}
      <div className="flex gap-4 mb-6">
        {/* Job picker */}
        <div className="flex-1 max-w-sm">
          <label className="block text-[10px] uppercase tracking-wider text-white/40 mb-1 font-mono">Run</label>
          <select
            className="w-full bg-[#111] border border-white/[0.08] rounded px-3 py-2 text-sm text-white font-mono"
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
          >
            <option value="">Select a run...</option>
            {jobs.map((j) => (
              <option key={j.job_id} value={j.job_id}>
                {j.market_name || j.job_id} — {j.total_pairs} pairs — {new Date(j.completed_at).toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>

        {/* Client picker */}
        <div className="flex-1 max-w-sm">
          <label className="block text-[10px] uppercase tracking-wider text-white/40 mb-1 font-mono">Client Lens</label>
          <select
            className="w-full bg-[#111] border border-white/[0.08] rounded px-3 py-2 text-sm text-white font-mono"
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
          >
            <option value="">(no lens)</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.economicSide})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading / Error */}
      {loading && <p className="text-white/30 text-sm font-mono mb-4">Loading matches...</p>}
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {/* Stats bar */}
      {matches.length > 0 && (
        <div className="mb-6 space-y-3">

          {/* Summary line */}
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-white/50">{stats.totalNonVetoed} non-vetoed</span>
            {overlayResults && (
              <>
                <span className="text-white/20">&rarr;</span>
                <span style={{ color: '#34d399' }}>{stats.included} pass {clientName} overlay</span>
                <span className="text-white/30">({stats.excluded} excluded)</span>
              </>
            )}
            {stats.vetoed > 0 && (
              <span className="text-white/20">+ {stats.vetoed} vetoed</span>
            )}
          </div>

          {/* Signal group row */}
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="text-white/30 uppercase tracking-wider mr-1">Signals</span>
            {Object.entries(stats.signalGroups)
              .sort(([, a], [, b]) => b - a)
              .map(([group, count]) => (
                <span
                  key={group}
                  className="px-2 py-0.5 rounded-sm"
                  style={{
                    background: `${GROUP_COLORS[group] || '#64748b'}15`,
                    color: GROUP_COLORS[group] || '#64748b',
                    border: `1px solid ${GROUP_COLORS[group] || '#64748b'}30`,
                  }}
                >
                  {group} ({count})
                </span>
              ))}
          </div>

          {/* Tier row */}
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="text-white/30 uppercase tracking-wider mr-1">Tiers</span>
            {(['strong', 'good', 'weak'] as const).map(tier => (
              <span
                key={tier}
                className="px-2 py-0.5 rounded-sm"
                style={{
                  background: `${TIER_COLORS[tier]}15`,
                  color: TIER_COLORS[tier],
                  border: `1px solid ${TIER_COLORS[tier]}30`,
                }}
              >
                {tier} ({stats.tiers[tier] || 0})
              </span>
            ))}
          </div>

          {/* Exclusion reasons (only when overlay active) */}
          {overlayResults && stats.excluded > 0 && (
            <div className="flex items-center gap-2 text-[10px] font-mono">
              <span className="text-white/30 uppercase tracking-wider mr-1">Excluded</span>
              {Object.entries(stats.reasons)
                .sort(([, a], [, b]) => b - a)
                .map(([reason, count]) => (
                  <span key={reason} className="px-2 py-0.5 rounded-sm bg-red-500/10 text-red-400 border border-red-500/20">
                    {reason} ({count})
                  </span>
                ))}
            </div>
          )}

          {/* Open in Compose button */}
          {selectedJobId && (
            <button
              onClick={handleOpenCompose}
              className="mt-2 px-4 py-1.5 text-xs font-mono rounded border border-white/[0.08] bg-white/[0.04] text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors"
            >
              Open in Compose &rarr;
            </button>
          )}
        </div>
      )}

      {/* Match table */}
      {matches.length > 0 && !loading && (
        <div className="border border-white/[0.06] rounded overflow-hidden">
          <div
            className="overflow-y-auto"
            style={{ maxHeight: 'calc(100vh - 380px)' }}
          >
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-white/30 text-[10px] uppercase tracking-wider border-b border-white/[0.06]">
                  <th className="text-left px-3 py-2">#</th>
                  <th className="text-left px-3 py-2">Demand</th>
                  <th className="text-left px-3 py-2">Supply</th>
                  <th className="text-right px-3 py-2">Score</th>
                  <th className="text-center px-3 py-2">Tier</th>
                  <th className="text-center px-3 py-2">Signal</th>
                  <th className="text-center px-3 py-2">Status</th>
                  {overlayResults && <th className="text-left px-3 py-2">Reason</th>}
                </tr>
              </thead>
              <tbody>
                {(overlayResults || matches.filter(m => !m.vetoed).map(m => ({ match: m, excluded: false, finalScore: m.scores.combined } as OverlayV2Result)))
                  .map((row, i) => {
                    const m = row.match;
                    const dc = canonicals.get(m.demandKey);
                    const sc = canonicals.get(m.supplyKey);
                    const tier = tierFromScore(row.finalScore);
                    const signalGroup = dc?.signalGroup || 'unknown';

                    return (
                      <tr
                        key={m.evalId}
                        className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                        style={{ opacity: row.excluded ? 0.35 : 1 }}
                      >
                        <td className="px-3 py-2 text-white/20">{i + 1}</td>
                        <td className="px-3 py-2 text-white/70 max-w-[180px] truncate">
                          {dc?.company || m.demandKey}
                        </td>
                        <td className="px-3 py-2 text-white/70 max-w-[180px] truncate">
                          {sc?.company || m.supplyKey}
                        </td>
                        <td className="px-3 py-2 text-right text-white/50">
                          {row.finalScore.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className="inline-block w-2 h-2 rounded-full"
                            style={{ background: TIER_COLORS[tier] }}
                            title={tier}
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className="px-1.5 py-0.5 rounded-sm text-[9px]"
                            style={{
                              background: `${GROUP_COLORS[signalGroup] || '#64748b'}15`,
                              color: GROUP_COLORS[signalGroup] || '#64748b',
                            }}
                          >
                            {signalGroup}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.excluded
                            ? <span className="text-red-400">&#x2717;</span>
                            : <span className="text-emerald-400">&#x2713;</span>
                          }
                        </td>
                        {overlayResults && (
                          <td className="px-3 py-2 text-white/30 max-w-[160px] truncate">
                            {row.excludeReason || ''}
                          </td>
                        )}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && matches.length === 0 && selectedJobId && (
        <div className="text-center text-white/20 text-sm font-mono py-12">
          No matches found for this run.
        </div>
      )}

      <style>{`
        @keyframes pageIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
