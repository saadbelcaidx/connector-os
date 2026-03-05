/**
 * OVERLAY AUDIT PANEL — Three Cognitive Lanes
 *
 * History = past (diffs + activation timestamps)
 * Performance = data (metrics + deltas between versions)
 * Suggestions = future (proposals + apply/dismiss)
 *
 * Replaces the simple version list in the overlay editor.
 */

import React, { useMemo } from 'react';
import type { ClientOverlay, FulfillmentClient, OverlaySpec } from '../../types/station';
import type { OverlayVersionPerformance } from '../../services/OverlayPerformanceService';
import type { OverlaySuggestion } from '../../telemetry/overlaySuggestions';
import { computeOverlayDiff, type OverlayDiffEntry } from '../overlayDiff';

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  client: FulfillmentClient;
  versions: ClientOverlay[];       // sorted desc by version
  performance: OverlayVersionPerformance[];
  suggestions: OverlaySuggestion[];
  suggestionsLoading: boolean;
  onActivate: (overlayId: string) => void;
  onApplySuggestion: (suggestion: OverlaySuggestion) => void;
  onDismissSuggestion: (suggestionId: string) => void;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatTimeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDuration(start?: string, end?: string): string {
  if (!start) return '';
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const days = Math.floor((e - s) / 86400000);
  if (days === 0) return '<1d';
  return `${days}d`;
}

function diffIcon(type: OverlayDiffEntry['type']): string {
  if (type === 'added') return '+';
  if (type === 'removed') return '-';
  return '~';
}

function diffColor(type: OverlayDiffEntry['type']): string {
  if (type === 'added') return 'text-emerald-400/70';
  if (type === 'removed') return 'text-red-400/70';
  return 'text-amber-400/70';
}

function severityColor(severity: OverlaySuggestion['severity']): string {
  if (severity === 'opportunity') return 'text-emerald-400/80';
  if (severity === 'warning') return 'text-amber-400/80';
  return 'text-white/50';
}

function severityLabel(severity: OverlaySuggestion['severity']): string {
  if (severity === 'opportunity') return 'opportunity';
  if (severity === 'warning') return 'warning';
  return 'info';
}

// ============================================================================
// COMPONENT
// ============================================================================

export const OverlayAuditPanel: React.FC<Props> = ({
  client,
  versions,
  performance,
  suggestions,
  suggestionsLoading,
  onActivate,
  onApplySuggestion,
  onDismissSuggestion,
}) => {

  // Build diffs between consecutive versions
  const versionDiffs = useMemo(() => {
    const diffs: Map<string, OverlayDiffEntry[]> = new Map();
    // versions is sorted desc: [v4, v3, v2, v1]
    for (let i = 0; i < versions.length - 1; i++) {
      const newer = versions[i];
      const older = versions[i + 1];
      diffs.set(newer.id, computeOverlayDiff(older.overlay, newer.overlay));
    }
    return diffs;
  }, [versions]);

  // Performance lookup by hash
  const perfByHash = useMemo(() => {
    const map = new Map<string, OverlayVersionPerformance>();
    for (const p of performance) {
      map.set(p.overlayHash, p);
    }
    return map;
  }, [performance]);

  // Build performance deltas between consecutive versions
  const perfDeltas = useMemo(() => {
    const deltas = new Map<string, string>();
    const sorted = [...performance].sort((a, b) => b.overlayVersion - a.overlayVersion);
    for (let i = 0; i < sorted.length - 1; i++) {
      const delta = sorted[i].replyRatePct - sorted[i + 1].replyRatePct;
      const sign = delta >= 0 ? '+' : '';
      deltas.set(sorted[i].overlayHash, `${sign}${delta.toFixed(1)}pp vs v${sorted[i + 1].overlayVersion}`);
    }
    if (sorted.length > 0) {
      deltas.set(sorted[sorted.length - 1].overlayHash, '(baseline)');
    }
    return deltas;
  }, [performance]);

  return (
    <div className="space-y-4">

      {/* ── HISTORY ── */}
      <div>
        <p className="text-[9px] font-mono text-white/30 tracking-widest uppercase mb-2">
          History
        </p>
        <div className="space-y-2">
          {versions.map(ov => {
            const diffs = versionDiffs.get(ov.id) || [];
            const isActive = ov.isActive;
            const activeDuration = ov.activatedAt
              ? formatDuration(ov.activatedAt, ov.deactivatedAt)
              : '';

            return (
              <div key={ov.id} className="border border-white/[0.06] rounded-sm px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono ${isActive ? 'text-white/80' : 'text-white/30'}`}>
                    v{ov.version}
                  </span>
                  <span className="text-[10px] font-mono text-white/20">
                    {new Date(ov.createdAt).toLocaleDateString()}
                  </span>
                  {isActive && ov.activatedAt && (
                    <span className="text-[9px] font-mono text-emerald-400/70">
                      active since {formatTimeAgo(ov.activatedAt)}
                    </span>
                  )}
                  {!isActive && activeDuration && (
                    <span className="text-[9px] font-mono text-white/20">
                      active {activeDuration}
                    </span>
                  )}
                  {!isActive && (
                    <button
                      onClick={() => onActivate(ov.id)}
                      className="ml-auto text-[9px] font-mono text-white/30 hover:text-white/60 transition-colors"
                    >
                      rollback
                    </button>
                  )}
                </div>

                {diffs.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {diffs.slice(0, 5).map((d, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <span className={`text-[10px] font-mono ${diffColor(d.type)}`}>
                          {diffIcon(d.type)}
                        </span>
                        <span className="text-[10px] font-mono text-white/40">
                          {d.label}
                          {d.type === 'changed' && `: ${d.oldValue} → ${d.newValue}`}
                          {d.type === 'added' && d.newValue && `: ${d.newValue}`}
                          {d.type === 'removed' && d.oldValue && `: ${d.oldValue}`}
                        </span>
                      </div>
                    ))}
                    {diffs.length > 5 && (
                      <span className="text-[9px] font-mono text-white/20">
                        +{diffs.length - 5} more changes
                      </span>
                    )}
                  </div>
                )}

                {diffs.length === 0 && versions.indexOf(ov) === versions.length - 1 && (
                  <span className="text-[9px] font-mono text-white/20 mt-0.5 block">
                    initial overlay
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── PERFORMANCE ── */}
      <div>
        <p className="text-[9px] font-mono text-white/30 tracking-widest uppercase mb-2">
          Performance
        </p>
        {performance.length === 0 ? (
          <p className="text-[10px] font-mono text-white/20">No data yet</p>
        ) : (
          <div className="space-y-1">
            {versions.map(ov => {
              // Find performance by matching hash (would need hash computation)
              // Fallback: match by version number from performance data
              const perf = performance.find(p => p.overlayVersion === ov.version);
              if (!perf) {
                return (
                  <div key={ov.id} className="flex items-center gap-3 px-3 py-1.5 border border-white/[0.04] rounded-sm">
                    <span className="text-[10px] font-mono text-white/30">v{ov.version}</span>
                    <span className="text-[9px] font-mono text-white/15">No data yet</span>
                  </div>
                );
              }

              const delta = perfDeltas.get(perf.overlayHash) || '';
              const deltaIsPositive = delta.startsWith('+') && !delta.includes('+0.0');
              const deltaIsNegative = delta.startsWith('-');

              return (
                <div key={ov.id} className="flex items-center gap-3 px-3 py-1.5 border border-white/[0.04] rounded-sm">
                  <span className={`text-[10px] font-mono w-6 ${ov.isActive ? 'text-white/80' : 'text-white/30'}`}>
                    v{ov.version}
                  </span>
                  <span className="text-[10px] font-mono text-white/40 w-16">
                    sent {perf.totalSent}
                  </span>
                  <span className="text-[10px] font-mono text-white/50 w-20">
                    reply {perf.replyRatePct}%
                  </span>
                  <span className="text-[10px] font-mono text-white/40 w-24">
                    meeting {perf.meetingRatePct}%
                  </span>
                  <span className={`text-[9px] font-mono ${
                    deltaIsPositive ? 'text-emerald-400/60' :
                    deltaIsNegative ? 'text-red-400/60' :
                    'text-white/20'
                  }`}>
                    {delta}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── SUGGESTIONS ── */}
      {!client.lockedManual && (
        <div>
          <p className="text-[9px] font-mono text-white/30 tracking-widest uppercase mb-2">
            Suggestions
          </p>
          {suggestionsLoading ? (
            <p className="text-[10px] font-mono text-white/20">Analyzing...</p>
          ) : suggestions.length === 0 ? (
            <p className="text-[10px] font-mono text-white/20">
              No suggestions — need more data or all thresholds met
            </p>
          ) : (
            <div className="space-y-2">
              {suggestions.map(s => (
                <div key={s.id} className="border border-white/[0.06] rounded-sm px-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[9px] font-mono ${severityColor(s.severity)}`}>
                      [{severityLabel(s.severity)}]
                    </span>
                    <span className="text-[10px] font-mono text-white/70">
                      {s.headline}
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-white/30 mb-1.5">
                    {s.detail}
                  </p>
                  <div className="flex items-center gap-1 mb-2">
                    {s.evidence.map((e, i) => (
                      <span key={i} className="text-[9px] font-mono text-white/20 px-1 py-0.5 bg-white/[0.03] rounded-sm">
                        {e}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    {s.proposedDiff && (
                      <button
                        onClick={() => onApplySuggestion(s)}
                        className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-white/[0.06] text-white/60 hover:text-white/80 hover:bg-white/[0.10] transition-colors"
                      >
                        Apply
                      </button>
                    )}
                    <button
                      onClick={() => onDismissSuggestion(s.id)}
                      className="text-[10px] font-mono px-2 py-0.5 rounded-sm text-white/20 hover:text-white/40 transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
