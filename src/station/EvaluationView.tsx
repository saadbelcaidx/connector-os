/**
 * EvaluationView — Board-demo streaming evaluation UI
 *
 * Combines: EvaluationProgress + LiveMatchFeed + JobSidebar
 * Desktop: 70/30 split (feed | sidebar)
 * Tablet: horizontal summary bar above feed
 * Mobile: stacked
 *
 * Wires useMCPJob hook. Handles return-to-page.
 */

import { useState, useCallback } from 'react';
import { useMCPJob } from './hooks/useMCPJob';
import type { AIConfig, MatchResult } from './hooks/useMCPJob';
import { EvaluationProgress } from './components/EvaluationProgress';
import { LiveMatchFeed } from './components/LiveMatchFeed';
import type { FilterMode, SortMode } from './components/LiveMatchFeed';
import { JobSidebar } from './components/JobSidebar';

// =============================================================================
// COMPONENT
// =============================================================================

interface Props {
  /** If provided, starts evaluation immediately on mount */
  autoStart?: {
    demandKeys: string[];
    supplyKeys: string[];
    aiConfig: AIConfig;
    topK?: number;
  };
  /** Signal count for embedding phase display */
  signalCount?: number;
  /** Called when user clicks "Queue Introduction" on a match */
  onQueueIntro?: (match: MatchResult) => void;
}

export function EvaluationView({ autoStart, signalCount, onQueueIntro }: Props) {
  const job = useMCPJob();

  // Filter state (owned here, shared between sidebar and feed)
  const [filter, setFilter] = useState<FilterMode>('all');
  const [sort, setSort] = useState<SortMode>('score');
  const [search, setSearch] = useState('');

  // Auto-start on mount (if params provided and no active job)
  const [started, setStarted] = useState(false);
  if (autoStart && !started && job.phase === 'idle') {
    setStarted(true);
    // Defer to avoid setState during render
    setTimeout(() => {
      job.start({
        demandKeys: autoStart.demandKeys,
        supplyKeys: autoStart.supplyKeys,
        aiConfig: autoStart.aiConfig,
        topK: autoStart.topK,
      });
    }, 0);
  }

  const handleQueueIntro = useCallback(
    (match: MatchResult) => {
      if (onQueueIntro) {
        onQueueIntro(match);
      }
    },
    [onQueueIntro],
  );

  const handleResume = useCallback(() => {
    if (job.jobId) {
      job.resume(job.jobId);
    }
  }, [job]);

  const isIdle = job.phase === 'idle';

  return (
    <div className="flex flex-col h-full bg-[#09090b]">
      {/* Phase stepper (always visible when not idle) */}
      {!isIdle && (
        <EvaluationProgress
          phase={job.phase}
          progress={job.progress}
          elapsedMs={job.elapsedMs}
          readyCount={job.readyCount}
          signalCount={signalCount}
        />
      )}

      {/* Main content: Feed + Sidebar */}
      {!isIdle && (
        <div className="flex flex-1 min-h-0">
          {/* Match Feed — 70% */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0" style={{ flex: '7 0 0%' }}>
            <LiveMatchFeed
              matches={job.matches}
              phase={job.phase}
              filter={filter}
              sort={sort}
              search={search}
              canonicals={job.canonicals}
              onQueueIntro={handleQueueIntro}
            />
          </div>

          {/* Sidebar — 30% (desktop only) */}
          <div
            className="hidden lg:flex flex-col flex-shrink-0"
            style={{ flex: '3 0 0%', maxWidth: '360px' }}
          >
            <JobSidebar
              phase={job.phase}
              progress={job.progress}
              breakdown={job.breakdown}
              readyCount={job.readyCount}
              elapsedMs={job.elapsedMs}
              filter={filter}
              sort={sort}
              search={search}
              onFilterChange={setFilter}
              onSortChange={setSort}
              onSearchChange={setSearch}
              onPause={job.pause}
              onAbort={job.abort}
              onResume={handleResume}
            />
          </div>
        </div>
      )}

      {/* Mobile/tablet: summary bar when sidebar hidden */}
      {!isIdle && (
        <div className="lg:hidden border-t border-white/[0.06] px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-mono text-[10px] text-white/30">
              {job.progress.completedPairs.toLocaleString()} / {job.progress.totalPairs.toLocaleString()}
            </span>
            <span className="font-mono text-[10px] text-white/50">
              {job.readyCount} ready
            </span>
          </div>
          <div className="flex gap-2">
            {/* Mobile filter chips */}
            {(['all', 'strong', 'possible'] as FilterMode[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="font-mono rounded transition-colors"
                style={{
                  height: '22px',
                  padding: '0 8px',
                  fontSize: '10px',
                  border:
                    filter === f
                      ? '1px solid rgba(255,255,255,0.20)'
                      : '1px solid rgba(255,255,255,0.08)',
                  background: filter === f ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: filter === f ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.40)',
                  outline: 'none',
                  boxShadow: 'none',
                  cursor: 'pointer',
                }}
              >
                {f === 'all' ? 'All' : f === 'strong' ? 'Strong' : 'Possible'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Idle state */}
      {isIdle && (
        <div className="flex-1 flex items-center justify-center">
          <p className="font-mono text-[11px] text-white/20">
            No active evaluation. Start one from Station.
          </p>
        </div>
      )}
    </div>
  );
}
