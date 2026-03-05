/**
 * JobSidebar — Live summary panel (right side, 30% width)
 *
 * Animated count-up numbers. Breakdown by classification.
 * Progress bar. Pause/Abort controls.
 * Filter controls for the match feed.
 * "Safe to close tab" notice.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { JobPhase, JobProgress, JobBreakdown } from '../hooks/useMCPJob';
import type { FilterMode, SortMode } from './LiveMatchFeed';

// =============================================================================
// ANIMATED NUMBER
// =============================================================================

function useAnimatedNumber(target: number, duration = 400): number {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const from = prevRef.current;
    const to = target;
    if (from === to) return;

    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        prevRef.current = to;
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]);

  return display;
}

// =============================================================================
// FORMAT
// =============================================================================

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec.toString().padStart(2, '0')}s`;
}

function formatEstimate(ms: number | null): string {
  if (ms === null || ms <= 0) return '';
  return `~${formatDuration(ms)} remaining`;
}

// =============================================================================
// DOT SCALE
// =============================================================================

function dots(count: number, max: number): string {
  if (max === 0) return '';
  const normalized = Math.min(Math.ceil((count / max) * 5), 5);
  return '\u25CF'.repeat(normalized);
}

// =============================================================================
// COMPONENT
// =============================================================================

interface Props {
  phase: JobPhase;
  progress: JobProgress;
  breakdown: JobBreakdown;
  readyCount: number;
  elapsedMs: number;
  filter: FilterMode;
  sort: SortMode;
  search: string;
  onFilterChange: (filter: FilterMode) => void;
  onSortChange: (sort: SortMode) => void;
  onSearchChange: (search: string) => void;
  onPause: () => void;
  onAbort: () => void;
  onResume?: () => void;
}

export function JobSidebar({
  phase,
  progress,
  breakdown,
  readyCount,
  elapsedMs,
  filter,
  sort,
  search,
  onFilterChange,
  onSortChange,
  onSearchChange,
  onPause,
  onAbort,
  onResume,
}: Props) {
  const isRunning = phase === 'embedding' || phase === 'retrieving' || phase === 'evaluating';
  const isComplete = phase === 'complete';
  const isFailed = phase === 'failed';

  const animatedReady = useAnimatedNumber(readyCount);
  const animatedCompleted = useAnimatedNumber(progress.completedPairs);
  const animatedPass = useAnimatedNumber(breakdown.pass);
  const animatedMarginal = useAnimatedNumber(breakdown.marginal);
  const animatedQuarantine = useAnimatedNumber(breakdown.quarantine);
  const animatedVetoed = useAnimatedNumber(breakdown.vetoed);

  const maxBreakdown = Math.max(breakdown.pass, breakdown.marginal, breakdown.quarantine, breakdown.vetoed, 1);

  // Search debounce
  const [localSearch, setLocalSearch] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSearchInput = useCallback(
    (val: string) => {
      setLocalSearch(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onSearchChange(val), 200);
    },
    [onSearchChange],
  );

  return (
    <div
      className="flex flex-col border-l border-white/[0.06] overflow-y-auto [&::-webkit-scrollbar]:hidden"
      style={{ scrollbarWidth: 'none', width: '100%' }}
    >
      {/* Live Summary */}
      <div className="px-4 py-4 border-b border-white/[0.06]">
        <p
          className="font-mono text-white/30 tracking-widest uppercase mb-3"
          style={{ fontSize: '9px' }}
        >
          {isComplete ? 'COMPLETE' : isRunning ? 'LIVE SUMMARY' : 'SUMMARY'}
        </p>

        {/* Progress bar */}
        {(isRunning || isComplete) && (
          <div className="mb-4">
            <div className="flex justify-between mb-1">
              <span className="font-mono text-[10px] text-white/30">Pairs evaluated</span>
              <span className="font-mono text-[10px] text-white/40">{progress.percentage}%</span>
            </div>
            <div className="h-[2px] bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-white/40 rounded-full transition-all duration-500"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
            <p className="font-mono text-[10px] text-white/30 mt-1">
              {animatedCompleted.toLocaleString()} / {progress.totalPairs.toLocaleString()}
            </p>
          </div>
        )}

        {/* Hero number: Introductions ready */}
        <div className="mb-4">
          <p className="font-mono text-[10px] text-white/30 mb-0.5">Introductions ready</p>
          <p className="font-mono text-white/80" style={{ fontSize: '28px', lineHeight: 1 }}>
            {animatedReady}
          </p>
        </div>

        {/* Breakdown */}
        <div className="space-y-1.5">
          <p
            className="font-mono text-white/25 tracking-widest uppercase mb-1"
            style={{ fontSize: '9px' }}
          >
            Breakdown
          </p>

          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-white/40">Strong</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-white/50">{animatedPass}</span>
              <span className="text-emerald-400/50 text-[8px] tracking-tight">
                {dots(breakdown.pass, maxBreakdown)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-white/40">Possible</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-white/50">{animatedMarginal}</span>
              <span className="text-blue-400/50 text-[8px] tracking-tight">
                {dots(breakdown.marginal, maxBreakdown)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-white/40">Weak</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-white/50">{animatedQuarantine}</span>
              <span className="text-white/20 text-[8px] tracking-tight">
                {dots(breakdown.quarantine, maxBreakdown)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-white/40">Vetoed</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-white/50">{animatedVetoed}</span>
              <span className="text-red-400/30 text-[8px] tracking-tight">
                {breakdown.vetoed > 0 ? '\u25CB'.repeat(Math.min(breakdown.vetoed, 5)) : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Time estimate / elapsed */}
        <div className="mt-4">
          {isRunning && progress.estimatedRemainingMs !== null && progress.estimatedRemainingMs > 0 && (
            <p className="font-mono text-[10px] text-white/30">
              {formatEstimate(progress.estimatedRemainingMs)}
            </p>
          )}
          {isComplete && (
            <p className="font-mono text-[10px] text-white/30">
              {formatDuration(elapsedMs)}
            </p>
          )}
        </div>

        {/* Actions */}
        {(isRunning || isFailed) && (
          <div className="mt-4 pt-3 border-t border-white/[0.04]">
            <p
              className="font-mono text-white/25 tracking-widest uppercase mb-2"
              style={{ fontSize: '9px' }}
            >
              Actions
            </p>
            <div className="flex gap-2">
              {isRunning && (
                <>
                  <button
                    onClick={onPause}
                    className="font-mono text-[11px] text-white/50 hover:text-white/70 rounded transition-colors"
                    style={{
                      height: '28px',
                      padding: '0 12px',
                      background: 'rgba(255,255,255,0.06)',
                      outline: 'none',
                      boxShadow: 'none',
                    }}
                  >
                    Pause
                  </button>
                  <button
                    onClick={onAbort}
                    className="font-mono text-[11px] text-white/30 hover:text-white/50 rounded transition-colors"
                    style={{
                      height: '28px',
                      padding: '0 12px',
                      background: 'transparent',
                      outline: 'none',
                      boxShadow: 'none',
                    }}
                  >
                    Abort
                  </button>
                </>
              )}
              {isFailed && onResume && (
                <button
                  onClick={onResume}
                  className="font-mono text-[11px] text-white/70 hover:text-white rounded transition-colors"
                  style={{
                    height: '28px',
                    padding: '0 14px',
                    background: 'rgba(255,255,255,0.12)',
                    outline: 'none',
                    boxShadow: 'none',
                  }}
                >
                  Resume
                </button>
              )}
            </div>
          </div>
        )}

        {/* Safe to close notice */}
        {isRunning && (
          <p className="font-mono text-[10px] text-white/20 mt-4">
            Safe to close tab. Your job continues.
          </p>
        )}
      </div>

      {/* Filter controls */}
      <div className="px-4 py-4">
        <p
          className="font-mono text-white/25 tracking-widest uppercase mb-3"
          style={{ fontSize: '9px' }}
        >
          Filters
        </p>

        {/* Show filter */}
        <div className="mb-3">
          <p className="font-mono text-[10px] text-white/30 mb-1.5">Show</p>
          <div className="flex flex-wrap gap-1">
            {(['all', 'strong', 'possible', 'vetoed'] as FilterMode[]).map((f) => (
              <button
                key={f}
                onClick={() => onFilterChange(f)}
                className="font-mono rounded transition-colors"
                style={{
                  height: '22px',
                  padding: '0 8px',
                  fontSize: '11px',
                  border:
                    filter === f
                      ? '1px solid rgba(255,255,255,0.20)'
                      : '1px solid rgba(255,255,255,0.08)',
                  background:
                    filter === f ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color:
                    filter === f
                      ? 'rgba(255,255,255,0.90)'
                      : 'rgba(255,255,255,0.40)',
                  outline: 'none',
                  boxShadow: 'none',
                  cursor: 'pointer',
                }}
              >
                {f === 'all' ? 'All' : f === 'strong' ? 'Strong' : f === 'possible' ? 'Possible' : 'Vetoed'}
              </button>
            ))}
          </div>
        </div>

        {/* Sort */}
        <div className="mb-3">
          <p className="font-mono text-[10px] text-white/30 mb-1.5">Sort</p>
          <div className="flex flex-wrap gap-1">
            {(['score', 'company', 'recency'] as SortMode[]).map((s) => (
              <button
                key={s}
                onClick={() => onSortChange(s)}
                className="font-mono rounded transition-colors"
                style={{
                  height: '22px',
                  padding: '0 8px',
                  fontSize: '11px',
                  border:
                    sort === s
                      ? '1px solid rgba(255,255,255,0.20)'
                      : '1px solid rgba(255,255,255,0.08)',
                  background:
                    sort === s ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color:
                    sort === s
                      ? 'rgba(255,255,255,0.90)'
                      : 'rgba(255,255,255,0.40)',
                  outline: 'none',
                  boxShadow: 'none',
                  cursor: 'pointer',
                }}
              >
                {s === 'score' ? 'Score' : s === 'company' ? 'Company' : 'Recency'}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div>
          <p className="font-mono text-[10px] text-white/30 mb-1.5">Search</p>
          <input
            type="text"
            value={localSearch}
            onChange={(e) => handleSearchInput(e.target.value)}
            placeholder="Company name..."
            className="w-full bg-white/[0.03] border border-white/[0.06] rounded font-mono text-[11px] text-white/70 placeholder:text-white/20 focus:border-white/20 transition-colors"
            style={{
              height: '28px',
              padding: '0 10px',
              outline: 'none',
              boxShadow: 'none',
            }}
          />
        </div>
      </div>
    </div>
  );
}
