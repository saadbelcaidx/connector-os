/**
 * IntelligenceBrief — Market intelligence summary at top of RunDetailPage.
 *
 * Upgraded to 4-card row matching shadcn-admin Dashboard pattern.
 * All derivation helpers preserved from original.
 */

import type { JobProgress, MatchResult, CanonicalInfo } from '../hooks/useMCPJob';
import { getTier } from '../lib/tiers';

// =============================================================================
// TYPES
// =============================================================================

interface IntelligenceBriefProps {
  phase: string;
  progress: JobProgress;
  matches: MatchResult[];
  canonicals: Map<string, CanonicalInfo>;
  elapsedMs: number;
  createdAt?: string;
  totalPairs?: number;
}

// =============================================================================
// DERIVATION HELPERS (preserved from original)
// =============================================================================

function frequency(items: string[]): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = item.trim();
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

function topN(items: string[], n: number): string[] {
  return frequency(items).slice(0, n).map(([key]) => key);
}

function splitBySide(canonicals: Map<string, CanonicalInfo>) {
  const demand: CanonicalInfo[] = [];
  const supply: CanonicalInfo[] = [];
  for (const c of canonicals.values()) {
    if (c.role === 'demand') demand.push(c);
    else if (c.role === 'supply') supply.push(c);
  }
  return { demand, supply };
}

function deriveMarketTitle(demand: CanonicalInfo[], supply: CanonicalInfo[]): string {
  const demandIndustries = demand.map((c) => c.industry).filter(Boolean) as string[];
  const supplyIndustries = supply.map((c) => c.industry).filter(Boolean) as string[];
  const topDemand = topN(demandIndustries, 1)[0] || 'Demand';
  const topSupply = topN(supplyIndustries, 1)[0] || 'Supply';
  return `${topDemand} \u00D7 ${topSupply}`;
}

function stripSeniorityPrefix(title: string): string {
  return title
    .replace(
      /^(senior\s+|sr\.?\s+|associate\s+|executive\s+)*(vice\s+president|vp|director|head|manager|lead|chief|principal)\s*(\/\s*(senior\s+|sr\.?\s+|associate\s+|executive\s+)*(vice\s+president|vp|director|head|manager|lead|chief|principal))?\s*[,\s]*(of\s+|for\s+|-\s*)?/i,
      '',
    )
    .replace(/\s*\(.*?\)\s*/g, '')
    .trim();
}

function deriveHiringFor(demand: CanonicalInfo[]): string[] {
  const functions = demand
    .map((c) => c.title)
    .filter(Boolean)
    .map((t) => stripSeniorityPrefix(t!))
    .filter((f) => f.length >= 3);
  return topN(functions, 4);
}

function derivePlacedBy(supply: CanonicalInfo[]): string[] {
  const allKeywords = supply.flatMap((c) => c.keywords || []);
  return topN(allKeywords, 4);
}

function deriveDemandLine(demand: CanonicalInfo[]): string {
  const functions = demand
    .map((c) => c.title)
    .filter(Boolean)
    .map((t) => stripSeniorityPrefix(t!).toLowerCase())
    .filter((f) => f.length >= 3);
  const top = topN(functions, 1)[0] || 'talent';
  return `${demand.length} companies hiring ${top} leaders`;
}

function deriveSupplyLine(supply: CanonicalInfo[]): string {
  const industries = supply.map((c) => c.industry).filter(Boolean) as string[];
  const top = topN(industries, 1)[0]?.toLowerCase() || 'industry';
  return `${supply.length} firms placing ${top} talent`;
}

/** Tier-based counts (aligned with tiers.ts thresholds) */
function deriveStats(matches: MatchResult[]) {
  let strong = 0;
  let good = 0;
  let vetoed = 0;
  for (const m of matches) {
    const tier = getTier(m);
    if (tier === 'conflict') vetoed++;
    else if (tier === 'strong') strong++;
    else if (tier === 'good') good++;
  }
  return { strong, good, vetoed };
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem.toString().padStart(2, '0')}s`;
}

// =============================================================================
// STAT CARD
// =============================================================================

function StatCard({
  title,
  value,
  subtitle,
  accent,
}: {
  title: string;
  value: number;
  subtitle: string;
  accent: 'emerald' | 'blue' | 'red' | 'neutral';
}) {
  const valueColor =
    accent === 'emerald' ? 'text-emerald-400' :
    accent === 'blue' ? 'text-blue-400' :
    accent === 'red' ? 'text-red-400' :
    'text-white/90';

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-6">
      <div className="text-sm font-medium text-white/40 tracking-tight">
        {title}
      </div>
      <div className={`text-3xl font-bold mt-1 ${valueColor}`}>
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-white/30 mt-1">
        {subtitle}
      </div>
    </div>
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

export function IntelligenceBrief({
  phase,
  progress,
  matches,
  canonicals,
  elapsedMs,
  createdAt,
  totalPairs,
}: IntelligenceBriefProps) {
  const isRunning = phase !== 'complete' && phase !== 'failed' && phase !== 'idle';
  const isComplete = phase === 'complete';

  const { demand, supply } = splitBySide(canonicals);
  const stats = deriveStats(matches);
  const marketTitle = deriveMarketTitle(demand, supply);
  const demandLine = deriveDemandLine(demand);
  const supplyLine = deriveSupplyLine(supply);
  const hiringFor = deriveHiringFor(demand);
  const placedBy = derivePlacedBy(supply);

  return (
    <div style={{ animation: 'pageIn 0.25s ease-out' }}>
      {/* Market title + description */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-white/90 tracking-tight">
          {marketTitle}
        </h2>
        <div className="flex flex-col gap-0.5 mt-2">
          <p className="text-sm text-white/50">
            <span className="text-white/70">{demand.length}</span> {demandLine.replace(/^\d+\s/, '')}
            {' \u00B7 '}
            <span className="text-white/70">{supply.length}</span> {supplyLine.replace(/^\d+\s/, '')}
          </p>
          {isRunning && (
            <p className="text-sm text-amber-400/70">
              Scoring... {progress.completedPairs.toLocaleString()}/{progress.totalPairs.toLocaleString()} pairs
            </p>
          )}
        </div>
      </div>

      {/* 4-card stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Strong Fits"
          value={stats.strong}
          subtitle="Ready to act"
          accent="emerald"
        />
        <StatCard
          title="Good Fits"
          value={stats.good}
          subtitle="Worth a look"
          accent="blue"
        />
        <StatCard
          title="Conflicts"
          value={stats.vetoed}
          subtitle="Auto-filtered"
          accent="red"
        />
        <StatCard
          title="Total Pairs"
          value={totalPairs || progress.totalPairs}
          subtitle={
            isComplete
              ? `in ${formatDuration(elapsedMs)}`
              : isRunning
              ? `${progress.percentage}% complete`
              : ''
          }
          accent="neutral"
        />
      </div>

      {/* Signal tags */}
      {(hiringFor.length > 0 || placedBy.length > 0) && (
        <div className="flex gap-6 mt-4">
          {hiringFor.length > 0 && (
            <div>
              <span className="text-[10px] uppercase tracking-widest text-white/20 mr-2">
                Hiring for
              </span>
              <span className="text-xs text-white/40">
                {hiringFor.join(' \u00B7 ')}
              </span>
            </div>
          )}
          {placedBy.length > 0 && (
            <div>
              <span className="text-[10px] uppercase tracking-widest text-white/20 mr-2">
                Placed by
              </span>
              <span className="text-xs text-white/40">
                {placedBy.join(' \u00B7 ')}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
