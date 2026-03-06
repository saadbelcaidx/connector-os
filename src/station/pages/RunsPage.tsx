/**
 * RunsPage -- Lists all MCP evaluation jobs
 *
 * Route: /station/runs
 * Table: status, market, matches, started, duration
 * Click row -> /station/run/:jobId
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Breadcrumb } from './Breadcrumb';
import ExecutionBadge from '../components/ExecutionBadge';

// =============================================================================
// TYPES
// =============================================================================

interface JobRow {
  job_id: string;
  status: string;
  total_pairs: number | null;
  completed_pairs: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  market_name: string | null;
  market_id: string | null;
  error: string | null;
  scoring_status: string | null;
  reasoning_status: string | null;
  pass_count?: number;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatDate(iso: string): string {
  const d = new Date(iso);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${months[d.getMonth()]} ${d.getDate()} ${h}:${m}`;
}

function formatDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return '--';
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 0) return '--';
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec.toString().padStart(2, '0')}s`;
}

function shortId(jobId: string): string {
  // Take last 6 chars
  return jobId.slice(-6);
}

// =============================================================================
// STATUS BADGE
// =============================================================================

function StatusBadge({ status, scoringStatus, reasoningStatus }: { status: string; scoringStatus?: string | null; reasoningStatus?: string | null }) {
  if (status === 'complete') {
    return (
      <span className="flex items-center gap-1.5 text-emerald-400">
        <span className="text-[10px]">{'\u2713'}</span>
        <span>Done</span>
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="flex items-center gap-1.5 text-red-400/70">
        <span className="text-[10px]">{'\u2717'}</span>
        <span>Failed</span>
      </span>
    );
  }
  if (status === 'aborted') {
    return (
      <span className="flex items-center gap-1.5 text-white/30">
        <span>Aborted</span>
      </span>
    );
  }

  // Live phases — show granular progress
  let phase = 'Queued';
  if (status === 'embedding') phase = 'Embedding';
  else if (status === 'retrieving') phase = 'Matching';
  else if (status === 'evaluating') {
    if (reasoningStatus === 'reasoning') phase = 'Curating';
    else if (scoringStatus === 'complete') phase = 'Scoring done';
    else phase = 'Scoring';
  }

  return (
    <span className="flex items-center gap-1.5 text-amber-400">
      <span className="text-[10px]" style={{ animation: 'statusPulse 2s ease-in-out infinite' }}>{'\u26A1'}</span>
      <span>{phase}</span>
    </span>
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

const PAGE_SIZE = 20;

export default function RunsPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // Core fetch logic — shared by initial load and silent refresh
  const loadJobs = useCallback(async (): Promise<{ jobs: JobRow[]; count: number }> => {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const [{ count }, { data: jobRows }] = await Promise.all([
      supabase.from('mcp_jobs').select('*', { count: 'exact', head: true }),
      supabase.from('mcp_jobs').select('*').order('created_at', { ascending: false }).range(from, to),
    ]);

    if (!jobRows || jobRows.length === 0) {
      return { jobs: [], count: count || 0 };
    }

    // PASS counts — only for non-complete jobs that might change, plus all visible jobs
    const passMap = new Map<string, number>();
    await Promise.all(
      jobRows.map(async (j: JobRow) => {
        const { count: evalCount } = await supabase
          .from('mcp_evaluations')
          .select('*', { count: 'exact', head: true })
          .eq('job_id', j.job_id);
        passMap.set(j.job_id, evalCount || 0);
      }),
    );

    const enriched: JobRow[] = jobRows.map((j: JobRow) => ({
      ...j,
      pass_count: passMap.get(j.job_id) || 0,
    }));

    return { jobs: enriched, count: count || 0 };
  }, [page]);

  // Initial fetch — shows loading skeleton
  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const result = await loadJobs();
    setJobs(result.jobs);
    setTotalCount(result.count);
    setLoading(false);
  }, [loadJobs]);

  // Silent refresh — updates data in-place, no loading flash
  const silentRefresh = useCallback(async () => {
    const result = await loadJobs();
    setJobs(result.jobs);
    setTotalCount(result.count);
  }, [loadJobs]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Realtime: silent refresh on job updates, debounced to collapse rapid-fire events
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const channel = supabase
      .channel('runs-page-jobs')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'mcp_jobs' },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => silentRefresh(), 800);
        },
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [silentRefresh]);

  function handleDeleteRun(e: React.MouseEvent, jobId: string) {
    e.stopPropagation();
    setDeleteTarget(jobId);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    await supabase.from('mcp_evaluations').delete().eq('job_id', deleteTarget);
    await supabase.from('mcp_shards').delete().eq('job_id', deleteTarget);
    await supabase.from('mcp_jobs').delete().eq('job_id', deleteTarget);
    setDeleteTarget(null);
    setDeleting(false);
    fetchJobs();
  }

  function toggleSelect(jobId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId); else next.add(jobId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === jobs.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(jobs.map(j => j.job_id)));
    }
  }

  async function confirmBulkDelete() {
    if (selected.size === 0) return;
    setDeleting(true);
    const ids = Array.from(selected);
    await supabase.from('mcp_evaluations').delete().in('job_id', ids);
    await supabase.from('mcp_shards').delete().in('job_id', ids);
    await supabase.from('mcp_jobs').delete().in('job_id', ids);
    setSelected(new Set());
    setBulkDelete(false);
    setDeleting(false);
    fetchJobs();
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="min-h-screen bg-[#09090b] text-white" style={{ animation: 'pageIn 0.25s ease-out' }}>
      <div className="max-w-[1100px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-2">
          <Breadcrumb
            items={[
              { label: 'Station', to: '/station' },
              { label: 'Runs' },
            ]}
          />
          <ExecutionBadge mode="global" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-mono text-[15px] text-white/90 font-medium">Runs</h1>
            <p className="font-mono text-[11px] text-white/30 mt-0.5">
              {totalCount} total run{totalCount !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/station/leaderboard')}
              className="font-mono text-[11px] text-white/40 hover:text-white/60 transition-colors cursor-pointer"
              style={{
                height: '28px',
                padding: '0 14px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '2px',
                outline: 'none',
                boxShadow: 'none',
              }}
            >
              Leaderboard
            </button>
            {jobs.length > 0 && (
              <button
                onClick={() => { setBulkDelete(b => !b); setSelected(new Set()); }}
                className={`font-mono text-[11px] transition-colors cursor-pointer ${bulkDelete ? 'text-red-400/80 hover:text-red-300' : 'text-white/40 hover:text-white/60'}`}
                style={{
                  height: '28px',
                  padding: '0 14px',
                  background: bulkDelete ? 'rgba(239,68,68,0.08)' : 'transparent',
                  border: `1px solid ${bulkDelete ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: '2px',
                  outline: 'none',
                }}
              >
                {bulkDelete ? 'Cancel' : 'Select'}
              </button>
            )}
            <button
              onClick={() => navigate('/station')}
              className="font-mono text-[11px] text-white/70 hover:text-white/90 rounded transition-colors cursor-pointer"
              style={{
                height: '28px',
                padding: '0 14px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                outline: 'none',
                boxShadow: 'none',
              }}
            >
              New Run
            </button>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="py-20 text-center">
            <p className="font-mono text-[11px] text-white/20">Loading runs...</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="py-20 text-center">
            <p className="font-mono text-[11px] text-white/25">No runs yet.</p>
            <p className="font-mono text-[10px] text-white/15 mt-1">
              Start a new evaluation from Station.
            </p>
          </div>
        ) : (
          <div className="border border-white/[0.06] rounded overflow-hidden">
            {/* Bulk delete bar */}
            {bulkDelete && selected.size > 0 && (
              <div
                className="flex items-center justify-between border-b border-red-400/10 bg-red-400/[0.04]"
                style={{ padding: '6px 16px', animation: 'fadeIn 0.15s ease-out' }}
              >
                <span className="font-mono text-[11px] text-red-400/70">
                  {selected.size} run{selected.size !== 1 ? 's' : ''} selected
                </span>
                <button
                  onClick={() => setDeleteTarget('__bulk__')}
                  className="font-mono text-[11px] text-red-400/90 hover:text-red-300 transition-colors cursor-pointer"
                  style={{
                    height: '26px',
                    padding: '0 12px',
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    borderRadius: '2px',
                    outline: 'none',
                  }}
                >
                  Delete {selected.size}
                </button>
              </div>
            )}

            {/* Table header */}
            <div
              className="grid font-mono text-[9px] text-white/25 uppercase tracking-widest border-b border-white/[0.06] bg-white/[0.02]"
              style={{
                gridTemplateColumns: bulkDelete ? '32px 100px 1fr 80px 120px 80px' : '100px 1fr 80px 120px 80px 36px',
                padding: '8px 16px',
              }}
            >
              {bulkDelete && (
                <span className="flex items-center cursor-pointer" onClick={toggleSelectAll}>
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      border: `1px solid ${selected.size === jobs.length && jobs.length > 0 ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.15)'}`,
                      background: selected.size === jobs.length && jobs.length > 0 ? 'rgba(239,68,68,0.15)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}
                  >
                    {selected.size === jobs.length && jobs.length > 0 && (
                      <span style={{ color: 'rgba(239,68,68,0.8)', fontSize: 10, lineHeight: 1 }}>{'\u2713'}</span>
                    )}
                  </span>
                </span>
              )}
              <span>Run</span>
              <span>Status</span>
              <span className="text-right">Matches</span>
              <span className="text-right">Started</span>
              <span className="text-right">{bulkDelete ? '' : 'Duration'}</span>
              {!bulkDelete && <span />}
            </div>

            {/* Table rows */}
            <div className="divide-y divide-white/[0.04]">
              {jobs.map((job, i) => (
                <div
                  key={job.job_id}
                  onClick={() => {
                    if (bulkDelete) return toggleSelect(job.job_id, { stopPropagation: () => {} } as React.MouseEvent);
                    if (job.status === 'complete') navigate(`/station/run/${job.job_id}`, { state: { job } });
                  }}
                  className={`grid font-mono text-[11px] ${job.status === 'complete' || bulkDelete ? 'hover:bg-white/[0.04] active:bg-white/[0.06] active:scale-[0.998] cursor-pointer' : 'cursor-default'} transition-all ${selected.has(job.job_id) ? 'bg-red-400/[0.04]' : ''}`}
                  style={{
                    gridTemplateColumns: bulkDelete ? '32px 100px 1fr 80px 120px 80px' : '100px 1fr 80px 120px 80px 36px',
                    padding: '10px 16px',
                    alignItems: 'center',
                    animation: `rowIn 0.2s ease-out ${Math.min(i * 0.04, 0.4)}s both`,
                  }}
                >
                  {bulkDelete && (
                    <span className="flex items-center cursor-pointer" onClick={(e) => toggleSelect(job.job_id, e)}>
                      <span
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 3,
                          border: `1px solid ${selected.has(job.job_id) ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.12)'}`,
                          background: selected.has(job.job_id) ? 'rgba(239,68,68,0.15)' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s',
                        }}
                      >
                        {selected.has(job.job_id) && (
                          <span style={{ color: 'rgba(239,68,68,0.8)', fontSize: 10, lineHeight: 1 }}>{'\u2713'}</span>
                        )}
                      </span>
                    </span>
                  )}
                  <span className="text-white/60 truncate pr-4">
                    #{shortId(job.job_id)}
                  </span>
                  <StatusBadge status={job.status} scoringStatus={job.scoring_status} reasoningStatus={job.reasoning_status} />
                  <span className="text-white/50 text-right">
                    {job.status === 'complete'
                      ? (job.pass_count ?? 0)
                      : job.completed_pairs
                        ? <>{job.completed_pairs} <span className="text-white/20">pairs</span></>
                        : <span className="text-white/15">—</span>
                    }
                  </span>
                  <span className="text-white/30 text-right">
                    {formatDate(job.created_at)}
                  </span>
                  <span className="text-white/30 text-right">
                    {bulkDelete ? '' : formatDuration(job.started_at || job.created_at, job.completed_at)}
                  </span>
                  {!bulkDelete && (
                    <span className="flex justify-center">
                      <Trash2
                        size={13}
                        className="text-white/15 hover:text-red-400/70 transition-colors cursor-pointer"
                        onClick={(e) => handleDeleteRun(e, job.job_id)}
                      />
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className="font-mono text-[10px] text-white/20">
              Items per page: {PAGE_SIZE}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="font-mono text-[11px] text-white/40 hover:text-white/60 disabled:text-white/15 disabled:cursor-not-allowed transition-colors cursor-pointer"
                style={{
                  height: '26px',
                  padding: '0 10px',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '2px',
                  outline: 'none',
                  boxShadow: 'none',
                }}
              >
                Prev
              </button>
              <span className="font-mono text-[10px] text-white/30">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="font-mono text-[11px] text-white/40 hover:text-white/60 disabled:text-white/15 disabled:cursor-not-allowed transition-colors cursor-pointer"
                style={{
                  height: '26px',
                  padding: '0 10px',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '2px',
                  outline: 'none',
                  boxShadow: 'none',
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation modal (single + bulk) */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)', animation: 'fadeIn 0.15s ease-out' }}
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#111',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '4px',
              padding: '24px',
              maxWidth: '360px',
              width: '100%',
              animation: 'fadeIn 0.15s ease-out',
            }}
          >
            <p className="font-mono text-[13px] text-white/90 mb-2">
              {deleteTarget === '__bulk__' ? `Delete ${selected.size} run${selected.size !== 1 ? 's' : ''}` : 'Delete run'}
            </p>
            <p className="font-mono text-[11px] text-white/40 mb-6 leading-relaxed">
              {deleteTarget === '__bulk__'
                ? `This will permanently delete ${selected.size} run${selected.size !== 1 ? 's' : ''} and all their matches. This cannot be undone.`
                : 'This will permanently delete the run and all its matches. This cannot be undone.'}
            </p>

            {deleting && (
              <div className="w-full h-[2px] rounded-full overflow-hidden mb-4" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div style={{
                  width: '100%',
                  height: '100%',
                  backgroundImage: 'linear-gradient(90deg, transparent 25%, rgba(239,68,68,0.5) 50%, transparent 75%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 1.5s ease-in-out infinite',
                }} />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="font-mono text-[11px] text-white/50 hover:text-white/70 transition-colors cursor-pointer disabled:opacity-30"
                style={{
                  height: '28px',
                  padding: '0 14px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '2px',
                  outline: 'none',
                }}
              >
                Cancel
              </button>
              <button
                onClick={deleteTarget === '__bulk__' ? confirmBulkDelete : confirmDelete}
                disabled={deleting}
                className="font-mono text-[11px] text-red-400/90 hover:text-red-300 transition-colors cursor-pointer disabled:opacity-30"
                style={{
                  height: '28px',
                  padding: '0 14px',
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: '2px',
                  outline: 'none',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pulse animation for live status */}
      <style>{`
        @keyframes statusPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes pageIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes rowIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
