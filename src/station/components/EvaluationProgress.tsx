/**
 * EvaluationProgress — 4-phase horizontal stepper
 *
 * ① Embedding  ② Matching  ③ Evaluating  ④ Complete
 *
 * Active phase pulses subtly. Each phase shows one-line status below.
 * No loading spinners. Progress is always quantified or narrated.
 */

import { type JobPhase, type JobProgress } from '../hooks/useMCPJob';

// =============================================================================
// PHASE CONFIG
// =============================================================================

interface PhaseConfig {
  key: JobPhase | 'matching';
  label: string;
  index: number;
}

const PHASES: PhaseConfig[] = [
  { key: 'embedding', label: 'Embedding', index: 0 },
  { key: 'matching', label: 'Matching', index: 1 },
  { key: 'evaluating', label: 'Evaluating', index: 2 },
  { key: 'complete', label: 'Complete', index: 3 },
];

function getActiveIndex(phase: JobPhase): number {
  if (phase === 'idle') return -1;
  if (phase === 'embedding') return 0;
  if (phase === 'retrieving') return 1;
  if (phase === 'evaluating') return 2;
  if (phase === 'complete') return 3;
  if (phase === 'failed' || phase === 'aborted') return 2; // stay on evaluating
  return -1;
}

// =============================================================================
// FORMAT HELPERS
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
// COMPONENT
// =============================================================================

interface Props {
  phase: JobPhase;
  progress: JobProgress;
  elapsedMs: number;
  readyCount: number;
  signalCount?: number; // for embedding phase
}

export function EvaluationProgress({ phase, progress, elapsedMs, readyCount, signalCount }: Props) {
  const activeIndex = getActiveIndex(phase);

  return (
    <div className="px-4 py-3 border-b border-white/[0.06]">
      {/* Phase stepper */}
      <div className="flex items-center gap-0">
        {PHASES.map((p, i) => {
          const isComplete = i < activeIndex;
          const isActive = i === activeIndex;
          const isFuture = i > activeIndex;

          return (
            <div key={p.key} className="flex items-center">
              {/* Phase dot + label */}
              <div className="flex items-center gap-2">
                {/* Dot */}
                <span
                  className={`
                    inline-block w-2 h-2 rounded-full transition-colors
                    ${isComplete ? 'bg-white/30' : ''}
                    ${isActive ? 'bg-white/80' : ''}
                    ${isFuture ? 'bg-white/10' : ''}
                  `}
                  style={isActive ? { animation: 'evalPulse 2s ease-in-out infinite' } : undefined}
                />
                {/* Label */}
                <span
                  className={`
                    font-mono text-[11px] transition-colors
                    ${isComplete ? 'text-white/30' : ''}
                    ${isActive ? 'text-white/80' : ''}
                    ${isFuture ? 'text-white/20' : ''}
                  `}
                >
                  {isComplete ? '\u2713' : `${i + 1}`} {p.label}
                </span>
              </div>

              {/* Connector line between phases */}
              {i < PHASES.length - 1 && (
                <div
                  className={`mx-4 h-px flex-shrink-0 ${
                    i < activeIndex ? 'bg-white/20' : 'bg-white/[0.06]'
                  }`}
                  style={{ width: '48px' }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Active phase status line */}
      <div className="mt-2 font-mono text-[10px]" style={{ minHeight: '16px' }}>
        {phase === 'embedding' && (
          <span className="text-white/40">
            Embedding {signalCount || '...'} signals...
          </span>
        )}

        {phase === 'retrieving' && (
          <span className="text-white/40">
            Finding strongest pairs...
          </span>
        )}

        {phase === 'evaluating' && (
          <span className="text-white/40">
            {progress.completedPairs === 0 ? (
              'First results arriving...'
            ) : (
              <>
                {progress.completedPairs.toLocaleString()} / {progress.totalPairs.toLocaleString()}
                {' \u00B7 '}
                {progress.percentage}%
                {progress.estimatedRemainingMs !== null && progress.estimatedRemainingMs > 0 && (
                  <> {' \u00B7 '}{formatEstimate(progress.estimatedRemainingMs)}</>
                )}
              </>
            )}
          </span>
        )}

        {phase === 'complete' && (
          <span className="text-white/40">
            {progress.totalPairs.toLocaleString()} pairs evaluated
            {' \u00B7 '}
            {readyCount} introductions ready
            {' \u00B7 '}
            {formatDuration(elapsedMs)}
          </span>
        )}

        {phase === 'failed' && (
          <span className="text-red-400/70">
            Evaluation stopped. {progress.completedPairs.toLocaleString()} of{' '}
            {progress.totalPairs.toLocaleString()} pairs completed.
          </span>
        )}

        {phase === 'aborted' && (
          <span className="text-white/30">
            Evaluation paused. {progress.completedPairs.toLocaleString()} completed results available.
          </span>
        )}
      </div>

      {/* Progress bar (evaluating phase only) */}
      {(phase === 'evaluating' || (phase === 'complete' && elapsedMs < 3000)) && (
        <div className="mt-2 h-[2px] bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full bg-white/40 rounded-full transition-all duration-500"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
      )}

      {/* Pulse animation */}
      <style>{`
        @keyframes evalPulse {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
