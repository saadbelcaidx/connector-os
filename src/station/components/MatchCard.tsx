/**
 * MatchCard — Single evaluation result card
 *
 * Fix 1: Company names from canonical lookup (not record key hashes)
 * Fix 2: Wants/offers intent below company names
 * Fix 5: Visual differentiation by score tier
 *
 * Framing is the headline (largest text, the product).
 * Company → Company with score bar.
 * Expandable reasoning. Queue Introduction button.
 */

import { useState, useEffect } from 'react';
import type { MatchResult, CanonicalInfo } from '../hooks/useMCPJob';

// =============================================================================
// HELPERS
// =============================================================================

function scoreBar(score: number): string {
  const filled = Math.round(score * 7);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(7 - filled);
}

function getCompanyName(key: string, canonicals: Map<string, CanonicalInfo>): string {
  const info = canonicals.get(key);
  if (info && info.company) return info.company;
  // Fallback: try to clean up the key
  const separators = ['__', '--', '::'];
  for (const sep of separators) {
    if (key.includes(sep)) {
      return key.split(sep)[0].replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
    }
  }
  return key.slice(0, 30);
}

// =============================================================================
// SCORE TIER (Fix 5: visual differentiation)
// =============================================================================

type ScoreTier = 'top' | 'standard' | 'muted';

function getScoreTier(combined: number): ScoreTier {
  if (combined >= 0.85) return 'top';
  if (combined >= 0.7) return 'standard';
  return 'muted';
}

// =============================================================================
// COMPONENT
// =============================================================================

interface Props {
  match: MatchResult;
  index: number;
  isNew?: boolean;
  canonicals: Map<string, CanonicalInfo>;
  onQueueIntro?: (match: MatchResult) => void;
}

export function MatchCard({ match, index, isNew, canonicals, onQueueIntro }: Props) {
  const [expanded, setExpanded] = useState(false);

  // Fade-in animation for new cards
  const [visible, setVisible] = useState(!isNew);
  useEffect(() => {
    if (isNew) {
      const delay = (index % 10) * 50;
      const timer = setTimeout(() => setVisible(true), delay);
      return () => clearTimeout(timer);
    }
  }, [isNew, index]);

  const isPASS = match.classification === 'PASS' && !match.vetoed;
  const isMARGINAL = match.classification === 'MARGINAL' && !match.vetoed;
  const isVETOED = match.vetoed;
  const tier = getScoreTier(match.scores.combined);

  // Fix 1: real company names
  const demandCompany = getCompanyName(match.demandKey, canonicals);
  const supplyCompany = getCompanyName(match.supplyKey, canonicals);

  // Fix 2: intent text
  const demandInfo = canonicals.get(match.demandKey);
  const supplyInfo = canonicals.get(match.supplyKey);
  const demandWants = demandInfo?.wants || '';
  const supplyOffers = supplyInfo?.offers || '';

  // Fix 5: tier-based border
  const leftBorder = isVETOED
    ? '2px solid rgba(248, 113, 113, 0.5)'
    : tier === 'top'
      ? '2px solid rgba(251, 191, 36, 0.4)'
      : 'none';

  return (
    <div
      className="transition-opacity duration-300"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 300ms ease-out, transform 300ms ease-out',
      }}
    >
      <div
        className="border-b border-white/[0.04] px-5 py-4"
        style={{
          borderLeft: leftBorder,
          opacity: isMARGINAL ? 0.65 : 1,
        }}
      >
        {/* Top match badge (Fix 5) */}
        {tier === 'top' && !isVETOED && (
          <span
            className="font-mono tracking-wider uppercase"
            style={{ fontSize: '9px', color: 'rgba(251, 191, 36, 0.6)' }}
          >
            TOP MATCH
          </span>
        )}

        {/* Framing — THE HEADLINE */}
        {match.framing && (
          <p
            className={`leading-relaxed ${tier === 'top' ? 'mt-1' : ''} mb-3 ${
              isVETOED ? 'text-white/30 line-through' : 'text-white/80'
            }`}
            style={{ fontSize: isPASS ? '16px' : '14px' }}
          >
            "{match.framing}"
          </p>
        )}

        {/* Company → Company + Score */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="font-medium text-white/90 truncate" style={{ fontSize: '13px' }}>
              {demandCompany}
            </span>
            <span className="text-white/20 flex-shrink-0">{'\u2192'}</span>
            <span className="font-medium text-white/90 truncate" style={{ fontSize: '13px' }}>
              {supplyCompany}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="font-mono text-[10px] text-white/25 tracking-tight">
              {scoreBar(match.scores.combined)}
            </span>
          </div>
        </div>

        {/* Fix 2: Intent wants → offers */}
        {(demandWants || supplyOffers) && (
          <div className="flex items-start gap-2 mt-1.5 min-w-0">
            <span className="font-mono text-[10px] text-white/30 truncate flex-1" title={demandWants}>
              {demandWants}
            </span>
            {demandWants && supplyOffers && (
              <span className="text-white/15 flex-shrink-0 text-[10px]">{'\u2192'}</span>
            )}
            <span className="font-mono text-[10px] text-white/30 truncate flex-1 text-right" title={supplyOffers}>
              {supplyOffers}
            </span>
          </div>
        )}

        {/* Vetoed tag */}
        {isVETOED && (
          <div className="mt-2">
            <span className="font-mono text-[10px] text-red-400/60 tracking-wider uppercase">
              potential competitor
              {match.vetoReason && ` \u00B7 ${match.vetoReason}`}
            </span>
          </div>
        )}

        {/* Expandable reasoning + action button */}
        <div className="flex items-center justify-between mt-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="font-mono text-[11px] text-white/30 hover:text-white/50 transition-colors"
            style={{ outline: 'none', boxShadow: 'none', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            {expanded ? '\u25BE' : '\u25B8'} Why this matches
          </button>

          {isPASS && onQueueIntro && (
            <button
              onClick={() => onQueueIntro(match)}
              className="font-mono rounded text-white hover:bg-white/[0.18] transition-colors"
              style={{
                height: '28px',
                padding: '0 14px',
                background: 'rgba(255,255,255,0.12)',
                fontSize: '11px',
                outline: 'none',
                boxShadow: 'none',
              }}
            >
              Queue Introduction
            </button>
          )}

          {isMARGINAL && expanded && onQueueIntro && (
            <button
              onClick={() => onQueueIntro(match)}
              className="font-mono rounded text-white/50 hover:text-white/70 hover:bg-white/[0.08] transition-colors"
              style={{
                height: '28px',
                padding: '0 14px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.08)',
                fontSize: '11px',
                outline: 'none',
                boxShadow: 'none',
              }}
            >
              Queue Introduction
            </button>
          )}
        </div>

        {/* Expanded reasoning */}
        {expanded && (
          <div className="mt-3 px-0 py-3 border-t border-white/[0.04]">
            {match.reasoning && (
              <p className="font-mono text-[11px] text-white/40 leading-relaxed mb-2">
                {match.reasoning}
              </p>
            )}

            <div className="grid grid-cols-2 gap-x-8 gap-y-1 font-mono text-[10px]">
              <span className="text-white/30">Classification</span>
              <span className={
                match.classification === 'PASS'
                  ? 'text-emerald-400/70'
                  : match.classification === 'MARGINAL'
                    ? 'text-white/50'
                    : 'text-red-400/60'
              }>
                {match.classification}
              </span>
              <span className="text-white/30">Readiness</span>
              <span className="text-white/50">{match.readiness}</span>
            </div>

            {match.risks && match.risks.length > 0 && (
              <div className="mt-2">
                <span className="font-mono text-[9px] text-white/25 tracking-widest uppercase">RISKS</span>
                <div className="mt-1 space-y-0.5">
                  {match.risks.map((risk, i) => (
                    <p key={i} className="font-mono text-[10px] text-white/35">{risk}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
