/**
 * MatchOverview — Market summary at top of RunDetailPage.
 *
 * Plain language. No jargon. One box.
 * Only shows what we KNOW from real data. No guessing.
 */

import type { JobProgress, JobBreakdown, MatchResult, CanonicalInfo } from '../hooks/useMCPJob';

// =============================================================================
// TYPES
// =============================================================================

interface MatchOverviewProps {
  phase: string;
  progress: JobProgress;
  breakdown: JobBreakdown;
  matches: MatchResult[];
  canonicals: Map<string, CanonicalInfo>;
  elapsedMs: number;
  createdAt?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem.toString().padStart(2, '0')}s`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function countBySide(canonicals: Map<string, CanonicalInfo>) {
  let demand = 0;
  let supply = 0;
  for (const c of canonicals.values()) {
    if (c.role === 'demand') demand++;
    else if (c.role === 'supply') supply++;
  }
  return { demand, supply };
}

/** Top N unique company names per side, from matches (ordered by match quality) */
function topCompanies(
  matches: MatchResult[],
  canonicals: Map<string, CanonicalInfo>,
  side: 'demand' | 'supply',
  limit: number = 5,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const m of matches) {
    if (result.length >= limit) break;
    const key = side === 'demand' ? m.demandKey : m.supplyKey;
    const c = canonicals.get(key);
    if (!c || !c.company || seen.has(c.company)) continue;
    seen.add(c.company);
    result.push(c.company);
  }

  return result;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function MatchOverview({
  phase,
  progress,
  breakdown,
  matches,
  canonicals,
  elapsedMs,
  createdAt,
}: MatchOverviewProps) {
  const isRunning = phase !== 'complete' && phase !== 'failed' && phase !== 'idle';
  const isComplete = phase === 'complete';
  const isFailed = phase === 'failed';

  const sides = countBySide(canonicals);
  const totalMatches = matches.length;

  const topDemandCompanies = topCompanies(matches, canonicals, 'demand');
  const topSupplyCompanies = topCompanies(matches, canonicals, 'supply');

  return (
    <div
      className="mx-4 mb-4 rounded"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        padding: '16px 20px',
        animation: 'pageIn 0.25s ease-out',
      }}
    >
      {/* Counts */}
      <div className="flex items-baseline gap-2 mb-3 flex-wrap">
        {sides.demand > 0 && (
          <span className="font-mono text-[12px] text-white/60">
            {sides.demand} demand
          </span>
        )}
        {sides.demand > 0 && sides.supply > 0 && (
          <span className="font-mono text-[11px] text-white/20">·</span>
        )}
        {sides.supply > 0 && (
          <span className="font-mono text-[12px] text-white/60">
            {sides.supply} supply
          </span>
        )}
      </div>

      {/* Match breakdown */}
      <div className="flex items-baseline gap-2 mb-4 flex-wrap">
        <span className="font-mono text-[12px] text-white/70">
          {totalMatches} matches
        </span>
        {breakdown.pass > 0 && (
          <>
            <span className="font-mono text-[11px] text-white/20">·</span>
            <span className="font-mono text-[11px] text-emerald-400/70">
              {breakdown.pass} strong
            </span>
          </>
        )}
        {breakdown.marginal > 0 && (
          <>
            <span className="font-mono text-[11px] text-white/20">·</span>
            <span className="font-mono text-[11px] text-amber-400/60">
              {breakdown.marginal} possible
            </span>
          </>
        )}
        {breakdown.vetoed > 0 && (
          <>
            <span className="font-mono text-[11px] text-white/20">·</span>
            <span className="font-mono text-[11px] text-red-400/50">
              {breakdown.vetoed} vetoed
            </span>
          </>
        )}
      </div>

      {/* Top matched companies */}
      {topDemandCompanies.length > 0 && (
        <p className="font-mono text-[10px] text-white/30 mb-1">
          Top demand: {topDemandCompanies.join(', ')}
        </p>
      )}
      {topSupplyCompanies.length > 0 && (
        <p className="font-mono text-[10px] text-white/30 mb-3">
          Top supply: {topSupplyCompanies.join(', ')}
        </p>
      )}

      {/* Status line */}
      {isComplete && (
        <p className="font-mono text-[10px] text-white/25">
          Completed{createdAt ? ` · ${formatDate(createdAt)}` : ''} · {formatDuration(elapsedMs)}
        </p>
      )}

      {isFailed && (
        <p className="font-mono text-[10px] text-red-400/50">
          Failed · {progress.completedPairs} / {progress.totalPairs} evaluated
        </p>
      )}

      {isRunning && (
        <div>
          {progress.estimatedRemainingMs != null && progress.estimatedRemainingMs > 0 && (
            <p className="font-mono text-[10px] text-white/20 mb-2">
              ~{formatDuration(progress.estimatedRemainingMs)} remaining
            </p>
          )}
          <div
            className="w-full h-[2px] rounded-full overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          >
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${progress.percentage}%`,
                backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0.15) 25%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0.15) 75%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s ease-in-out infinite',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
