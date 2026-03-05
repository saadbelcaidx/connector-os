/**
 * AnalyzeSummary — Market brief after DMCB extraction completes.
 *
 * Screen ② from frozen spec. Reads like a brief, not software.
 * Pure presentational. No API calls. Derives everything from canonicals in state.
 */

import type { CanonicalSignal } from '../../dmcb/types';

// =============================================================================
// TYPES
// =============================================================================

interface AnalyzeSummaryProps {
  canonicals: CanonicalSignal[];
  marketName: string;
  onMatch: () => void;
}

interface SegmentCount {
  segment: string;
  count: number;
}

// =============================================================================
// HELPERS
// =============================================================================

function groupBySegment(signals: CanonicalSignal[]): SegmentCount[] {
  const map = new Map<string, number>();
  for (const s of signals) {
    const seg = s.segment || 'Other';
    map.set(seg, (map.get(seg) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([segment, count]) => ({ segment, count }))
    .sort((a, b) => b.count - a.count);
}

function summarizeDemand(segments: SegmentCount[]): string {
  const top = segments.slice(0, 3).map(s => s.segment);
  if (top.length === 0) return 'No demand signals detected.';
  if (top.length === 1) return `Companies actively hiring in ${top[0]}.`;
  const last = top.pop();
  return `Companies actively hiring in ${top.join(', ')} and ${last}.`;
}

function summarizeSupply(segments: SegmentCount[]): string {
  const top = segments.slice(0, 3).map(s => s.segment);
  if (top.length === 0) return 'No supply signals detected.';
  if (top.length === 1) return `Providers specializing in ${top[0]}.`;
  const last = top.pop();
  return `Providers specializing in ${top.join(', ')} and ${last}.`;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function AnalyzeSummary({ canonicals, marketName, onMatch }: AnalyzeSummaryProps) {
  const demand = canonicals.filter(c => c.side === 'demand');
  const supply = canonicals.filter(c => c.side === 'supply');

  const demandSegments = groupBySegment(demand);
  const supplySegments = groupBySegment(supply);

  const totalWithCompany = canonicals.filter(c => c.party.company).length;
  const total = canonicals.length;

  // Estimate: demand × top-K (5) pairs, ~80s for 2000
  const estimatedPairs = demand.length * Math.min(supply.length, 5);
  const estimatedSeconds = Math.max(10, Math.round((estimatedPairs / 2000) * 80));

  const canMatch = demand.length > 0 && supply.length > 0;

  return (
    <div className="max-w-[720px] mx-auto">
      {/* Market title */}
      <h2 className="font-mono text-[15px] text-white/90 font-medium mb-8">
        {marketName}
      </h2>

      {/* What's in this market */}
      <div className="mb-10">
        <p
          className="font-mono text-white/25 tracking-widest uppercase mb-6"
          style={{ fontSize: '9px' }}
        >
          What's in this market
        </p>

        {/* Demand */}
        <div className="mb-8">
          <p className="font-mono text-[12px] text-white/60 mb-2">
            Demand · {demand.length} signals
          </p>
          <p className="font-mono text-[11px] text-white/40 mb-3">
            {summarizeDemand(demandSegments)}
          </p>
          {demandSegments.length > 0 && (
            <div className="space-y-1 ml-2">
              {demandSegments.slice(0, 5).map(s => (
                <p key={s.segment} className="font-mono text-[11px] text-white/30">
                  · {s.segment} ({s.count})
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Supply */}
        <div className="mb-8">
          <p className="font-mono text-[12px] text-white/60 mb-2">
            Supply · {supply.length} signals
          </p>
          <p className="font-mono text-[11px] text-white/40 mb-3">
            {summarizeSupply(supplySegments)}
          </p>
          {supplySegments.length > 0 && (
            <div className="space-y-1 ml-2">
              {supplySegments.slice(0, 5).map(s => (
                <p key={s.segment} className="font-mono text-[11px] text-white/30">
                  · {s.segment} ({s.count})
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Data Quality */}
      <div className="mb-10">
        <p
          className="font-mono text-white/25 tracking-widest uppercase mb-4"
          style={{ fontSize: '9px' }}
        >
          Data Quality
        </p>
        <p className="font-mono text-[11px] text-white/40">
          {totalWithCompany} of {total} signals have company names.
        </p>
        <p className="font-mono text-[11px] text-white/40 mt-1">
          Enrichment-ready: {totalWithCompany} / {total}
          {totalWithCompany === total && total > 0 ? (
            <span className="text-emerald-400/60 ml-1">✓</span>
          ) : null}
        </p>
      </div>

      {/* What happens next */}
      <div className="mb-10">
        <p
          className="font-mono text-white/25 tracking-widest uppercase mb-4"
          style={{ fontSize: '9px' }}
        >
          What happens next
        </p>
        <p className="font-mono text-[11px] text-white/40 leading-relaxed">
          When you click Match, the system will:
        </p>
        <div className="mt-2 space-y-1 ml-2">
          <p className="font-mono text-[11px] text-white/30">
            1. Find the strongest demand ↔ supply pairs
          </p>
          <p className="font-mono text-[11px] text-white/30">
            2. Score each pair on fit and timing
          </p>
          <p className="font-mono text-[11px] text-white/30">
            3. Generate introduction framing for top matches
          </p>
        </div>
        {canMatch && (
          <p className="font-mono text-[11px] text-white/20 mt-4">
            Estimated: ~{estimatedPairs.toLocaleString()} pairs in ~{estimatedSeconds}s.
          </p>
        )}
      </div>

      {/* Match button */}
      <div className="flex justify-center mt-12 mb-4">
        <button
          disabled={!canMatch}
          onClick={onMatch}
          style={{
            height: '36px',
            padding: '0 32px',
            fontSize: '11px',
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.12)',
            outline: 'none',
            boxShadow: canMatch ? '0 0 20px rgba(255,255,255,0.06)' : 'none',
            opacity: canMatch ? 1 : 0.25,
            cursor: canMatch ? 'pointer' : 'not-allowed',
          }}
          className="font-mono rounded text-white hover:bg-white/[0.18] transition-colors"
        >
          Match This Market
        </button>
      </div>
    </div>
  );
}
