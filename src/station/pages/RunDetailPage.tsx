/**
 * RunDetailPage -- Shows a specific MCP evaluation job
 *
 * Route: /station/run/:jobId
 * Uses useMCPJob hook with resume(jobId) on mount.
 * Full-width stacked layout: Brief → Top Matches → All Matches table.
 */

import { useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useMCPJob } from '../hooks/useMCPJob';
import { EvaluationProgress } from '../components/EvaluationProgress';
import { IntelligenceBrief } from '../components/IntelligenceBrief';
import { TopMatchCards } from '../components/TopMatchCards';
import { AllMatchesTable } from '../components/AllMatchesTable';
import { Breadcrumb } from './Breadcrumb';

// =============================================================================
// COMPONENT
// =============================================================================

export default function RunDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const prefetched = (location.state as any)?.job;
  const job = useMCPJob();
  const resumedRef = useRef(false);

  // Resume the specific job on mount
  useEffect(() => {
    if (jobId && !resumedRef.current) {
      resumedRef.current = true;
      job.resume(jobId);
    }
    // Only run once on mount with jobId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const shortId = jobId ? jobId.slice(-6) : '...';
  const isIdle = job.phase === 'idle';
  const isRunning = job.phase !== 'complete' && job.phase !== 'failed' && job.phase !== 'idle';

  return (
    <div className="flex flex-col min-h-screen bg-[#09090b]" style={{ animation: 'pageIn 0.25s ease-out' }}>
      {/* Breadcrumb */}
      <div className="px-4 pt-4">
        <Breadcrumb
          items={[
            { label: 'Station', to: '/station' },
            { label: 'Runs', to: '/station/runs' },
            { label: `Run #${shortId}` },
          ]}
        />
      </div>

      {/* Back to runs */}
      <div className="px-4 pt-2">
        <button
          onClick={() => navigate('/station/runs')}
          className="font-mono text-[11px] text-white/30 hover:text-white/50 transition-colors cursor-pointer"
          style={{ background: 'none', border: 'none', outline: 'none', padding: 0 }}
        >
          ← Runs
        </button>
      </div>

      {/* Intelligence Brief — market summary */}
      {!isIdle && (
        <div className="px-4 pt-2">
          <IntelligenceBrief
            phase={job.phase}
            progress={job.progress}
            matches={job.matches}
            canonicals={job.canonicals}
            elapsedMs={job.elapsedMs}
            createdAt={prefetched?.created_at}
            totalPairs={job.progress.totalPairs}
          />
        </div>
      )}

      {/* Phase stepper (always visible when not idle) */}
      {!isIdle && (
        <EvaluationProgress
          phase={job.phase}
          progress={job.progress}
          elapsedMs={job.elapsedMs}
          readyCount={job.readyCount}
        />
      )}

      {/* Top Match Cards — top 3 reasoned matches */}
      {!isIdle && (
        <div className="px-4">
          <TopMatchCards
            matches={job.matches}
            canonicals={job.canonicals}
            isRunning={isRunning}
          />
        </div>
      )}

      {/* All Matches Table — dense table with tabs, filter, expand */}
      {!isIdle && (
        <div className="px-4 pb-16">
          <AllMatchesTable
            matches={job.matches}
            canonicals={job.canonicals}
            isRunning={isRunning}
          />
        </div>
      )}

      {/* Loading state — shimmer skeleton with prefetched summary */}
      {isIdle && (
        <div className="flex-1 flex flex-col px-4 py-6 gap-4">
          {prefetched && (
            <div className="flex items-center gap-4 mb-2">
              <span className="font-mono text-[11px] text-white/50">
                #{shortId}
              </span>
              <span className="font-mono text-[10px] text-white/30">
                {prefetched.status === 'complete' ? 'Done' : prefetched.status === 'failed' ? 'Failed' : 'Live'}
              </span>
              {prefetched.pass_count != null && (
                <span className="font-mono text-[10px] text-white/30">
                  {prefetched.pass_count} matches
                </span>
              )}
            </div>
          )}
          {/* Shimmer skeleton lines */}
          {[200, 280, 160, 240, 180].map((w, i) => (
            <div
              key={i}
              className="h-[2px] rounded-full overflow-hidden"
              style={{ maxWidth: `${w}px`, background: 'rgba(255,255,255,0.06)' }}
            >
              <div style={{
                width: '100%',
                height: '100%',
                backgroundImage: 'linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.15) 50%, transparent 75%)',
                backgroundSize: '200% 100%',
                animation: `shimmer 1.5s ease-in-out infinite ${i * 0.15}s`,
              }} />
            </div>
          ))}
        </div>
      )}
      <style>{`
        @keyframes pageIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
