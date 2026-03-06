/**
 * LeaderboardPage — Operator ranking by total intros sent
 *
 * Route: /station/leaderboard
 * Data: get_leaderboard() RPC over contact_send_ledger
 * Tier: computeTier() client-side, reusing TIER_CONFIG
 */

import { Breadcrumb } from './Breadcrumb';
import ExecutionBadge from '../components/ExecutionBadge';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { TIER_CONFIG } from '../lib/executionTier';
import type { LeaderboardEntry } from '../hooks/useLeaderboard';

// =============================================================================
// HELPERS
// =============================================================================

function getOperatorId(): string {
  try {
    const raw = localStorage.getItem('guest_settings');
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return parsed.operatorId || '';
  } catch {
    return '';
  }
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic hue from operator_id — same person = same color every time */
function getAvatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 45%, 55%)`;
}

// =============================================================================
// ROW
// =============================================================================

function LeaderboardRow({ entry, rank, isCurrentOperator }: {
  entry: LeaderboardEntry;
  rank: number;
  isCurrentOperator: boolean;
}) {
  const cfg = TIER_CONFIG[entry.tier];

  return (
    <div
      className={`grid font-mono text-[11px] transition-all ${isCurrentOperator ? '' : 'hover:bg-white/[0.04]'}`}
      style={{
        gridTemplateColumns: '50px 1fr 100px 80px 60px 60px',
        padding: '10px 16px',
        alignItems: 'center',
        animation: `rowIn 0.2s ease-out ${Math.min(rank * 0.04, 0.6)}s both`,
        background: isCurrentOperator ? 'rgba(255,255,255,0.04)' : undefined,
        borderLeft: isCurrentOperator ? `2px solid ${cfg.accent}` : '2px solid transparent',
      }}
    >
      {/* Rank */}
      <span className="text-white/30">#{rank + 1}</span>

      {/* Operator name + avatar */}
      <span className={`flex items-center gap-2.5 truncate pr-4 ${isCurrentOperator ? 'text-white/90' : 'text-white/60'}`}>
        <span
          className="flex-shrink-0 flex items-center justify-center rounded-full font-mono font-medium"
          style={{
            width: '24px',
            height: '24px',
            fontSize: '9px',
            background: getAvatarColor(entry.operator_id),
            color: 'rgba(0,0,0,0.6)',
            letterSpacing: '0.02em',
          }}
        >
          {getInitials(entry.display_name)}
        </span>
        <span className="truncate">
          {isCurrentOperator && <span className="mr-1.5" style={{ color: cfg.accent }}>★</span>}
          {entry.display_name}
        </span>
      </span>

      {/* Tier */}
      <span className="flex items-center gap-1.5" style={{ color: cfg.accent }}>
        <span className="text-[10px]">{cfg.icon}</span>
        <span className="text-[10px] truncate">
          {entry.tier === 'none' ? '' :
           entry.tier === 'pending_rank1' ? 'R1…' :
           entry.tier === 'rank1' ? 'R1' :
           entry.tier === 'rank2' ? 'R2' :
           entry.tier === 'rank3' ? 'R3' :
           'MM'}
        </span>
      </span>

      {/* Total */}
      <span className="text-white/70 text-right font-medium">{formatNumber(entry.total_sent)}</span>

      {/* 7d */}
      <span className="text-white/30 text-right">{formatNumber(entry.sent_7d)}</span>

      {/* 30d */}
      <span className="text-white/30 text-right">{formatNumber(entry.sent_30d)}</span>
    </div>
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function LeaderboardPage() {
  const { entries, loading, error, refresh } = useLeaderboard();
  const currentOperatorId = getOperatorId();

  return (
    <div className="min-h-screen bg-[#09090b] text-white" style={{ animation: 'pageIn 0.25s ease-out' }}>
      <div className="max-w-[1100px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-2">
          <Breadcrumb
            items={[
              { label: 'Station', to: '/station' },
              { label: 'Leaderboard' },
            ]}
          />
          <ExecutionBadge mode="global" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-mono text-[15px] text-white/90 font-medium">Leaderboard</h1>
            <p className="font-mono text-[11px] text-white/30 mt-0.5">
              {entries.length} operator{entries.length !== 1 ? 's' : ''} ranked by total intros sent
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="font-mono text-[11px] text-white/40 hover:text-white/60 disabled:text-white/15 transition-colors cursor-pointer"
            style={{
              height: '28px',
              padding: '0 14px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '2px',
              outline: 'none',
              boxShadow: 'none',
            }}
          >
            Refresh {'\u21BB'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded border border-red-400/20 bg-red-400/[0.04]">
            <p className="font-mono text-[11px] text-red-400/70">{error}</p>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="py-20 text-center">
            <p className="font-mono text-[11px] text-white/20">Loading leaderboard...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="py-20 text-center">
            <p className="font-mono text-[11px] text-white/25">No operators yet.</p>
            <p className="font-mono text-[10px] text-white/15 mt-1">
              Send intros from the compose panel to appear on the board.
            </p>
          </div>
        ) : (
          <div className="border border-white/[0.06] rounded overflow-hidden">
            {/* Header */}
            <div
              className="grid font-mono text-[9px] text-white/25 uppercase tracking-widest border-b border-white/[0.06] bg-white/[0.02]"
              style={{
                gridTemplateColumns: '50px 1fr 100px 80px 60px 60px',
                padding: '8px 16px',
              }}
            >
              <span>#</span>
              <span>Operator</span>
              <span>Tier</span>
              <span className="text-right">Total</span>
              <span className="text-right">7d</span>
              <span className="text-right">30d</span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-white/[0.04]">
              {entries.map((entry, i) => (
                <LeaderboardRow
                  key={entry.operator_id}
                  entry={entry}
                  rank={i}
                  isCurrentOperator={entry.operator_id === currentOperatorId}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pageIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes rowIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
