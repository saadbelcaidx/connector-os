/**
 * ExecutionBadge — Visual tier progression badge
 *
 * Two modes:
 * - "global" — compact, fixed top-right (AppHeader region)
 * - "station" — detailed, inline in Today's Progress banner
 */

import { useExecutionState, TIER_CONFIG, getProgressToNext } from '../lib/executionTier';
import type { ExecutionTier } from '../lib/executionTier';

// =============================================================================
// SVG ICONS — 14px, monochrome, tier accent
// =============================================================================

function Chevron({ accent, size }: { accent: string; size: number }) {
  const h = size;
  const w = size * 0.55;
  return (
    <svg width={w} height={h} viewBox="0 0 7 12" fill="none">
      <path d="M1.5 1.5L5.5 6L1.5 10.5" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TierIcon({ tier, size = 14 }: { tier: ExecutionTier; size?: number }) {
  const accent = TIER_CONFIG[tier].accent;

  switch (tier) {
    case 'pending_rank1':
      // Single chevron, dimmed
      return (
        <div className="flex items-center" style={{ opacity: 0.6 }}>
          <Chevron accent={accent} size={size} />
        </div>
      );
    case 'rank1':
      // Single chevron, solid
      return (
        <div className="flex items-center">
          <Chevron accent={accent} size={size} />
        </div>
      );
    case 'rank2':
      // Double chevron
      return (
        <div className="flex items-center" style={{ gap: '1px' }}>
          <Chevron accent={accent} size={size} />
          <Chevron accent={accent} size={size} />
        </div>
      );
    case 'rank3':
      // Triple chevron
      return (
        <div className="flex items-center" style={{ gap: '1px' }}>
          <Chevron accent={accent} size={size} />
          <Chevron accent={accent} size={size} />
          <Chevron accent={accent} size={size} />
        </div>
      );
    case 'market_maker':
      // Crown
      return (
        <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
          <path d="M2 10L1 4L4.5 6.5L7 2L9.5 6.5L13 4L12 10Z" fill={accent} />
          <rect x="2" y="10.5" width="10" height="1.5" rx="0.5" fill={accent} />
        </svg>
      );
    default:
      return null;
  }
}

// =============================================================================
// GLOBAL MODE — Compact badge, top-right
// =============================================================================

function GlobalBadge() {
  const state = useExecutionState();
  const progress = getProgressToNext(state);

  // Hidden when totalSent === 0
  if (state.totalSent === 0) return null;

  const config = TIER_CONFIG[state.tier];
  const isPreTier = state.tier === 'none';
  const isPending = state.tier === 'pending_rank1';

  return (
    <div
      className="flex items-center gap-2 select-none"
      style={{
        padding: '5px 10px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '6px',
        animation: state.justTransitioned ? 'tierPulse 600ms ease-out' : undefined,
      }}
    >
      {!isPreTier && <TierIcon tier={state.tier} />}

      {isPreTier ? (
        // Pre-tier: "87 routed · 213 to Rank 1"
        <span className="font-mono" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.40)' }}>
          {state.totalSent.toLocaleString()} routed
          {progress && <> &middot; {progress.label}</>}
        </span>
      ) : isPending ? (
        // Pending: "Rank 1 pending · 2d remaining"
        <span className="font-mono" style={{ fontSize: '11px', color: config.accent }}>
          {config.label}
          {progress && <> &middot; {progress.label}</>}
        </span>
      ) : (
        // Post-tier: "Operator Rank 1 · 342 routed"
        <>
          <span className="font-mono" style={{ fontSize: '11px', color: config.accent }}>
            {config.label}
          </span>
          <span className="font-mono" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.40)' }}>
            &middot; {state.totalSent.toLocaleString()} routed
          </span>
        </>
      )}
    </div>
  );
}

// =============================================================================
// STATION MODE — Detailed badge with progress bar
// =============================================================================

function StationBadge() {
  const state = useExecutionState();
  const progress = getProgressToNext(state);

  const config = TIER_CONFIG[state.tier];
  const isPreTier = state.tier === 'none';
  const isPending = state.tier === 'pending_rank1';

  return (
    <div
      className="flex items-center gap-2 shrink-0"
      style={{
        animation: state.justTransitioned ? 'tierPulse 600ms ease-out' : undefined,
      }}
    >
      {!isPreTier && <TierIcon tier={state.tier} size={12} />}

      {isPreTier ? (
        <span className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.40)' }}>
          {state.totalSent.toLocaleString()} / 300
          {progress && <> &middot; {progress.label}</>}
        </span>
      ) : isPending ? (
        <span className="font-mono" style={{ fontSize: '10px', color: config.accent }}>
          {config.label}
          {progress && <> &middot; {progress.label}</>}
        </span>
      ) : (
        <>
          <span className="font-mono" style={{ fontSize: '10px', color: config.accent }}>
            {config.label}
          </span>
          <span className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)' }}>
            &middot; {state.totalSent.toLocaleString()} routed
          </span>
          {progress && (
            <span className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>
              &middot; {progress.label}
            </span>
          )}
        </>
      )}
    </div>
  );
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

export default function ExecutionBadge({ mode }: { mode: 'global' | 'station' }) {
  return (
    <>
      {mode === 'global' ? <GlobalBadge /> : <StationBadge />}
      <style>{`
        @keyframes tierPulse {
          0% { transform: scale(1); }
          30% { transform: scale(1.08); }
          100% { transform: scale(1); }
        }
        @keyframes pendingPulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
    </>
  );
}
