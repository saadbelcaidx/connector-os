/**
 * MatchDetailExpanded — Inline expansion below a match row in AllMatchesTable.
 * Shows reasoning, risks, raw scores, and action buttons.
 */

import type { MatchResult } from '../hooks/useMCPJob';
import { getTier, parseReasoning } from '../lib/tiers';

interface MatchDetailExpandedProps {
  match: MatchResult;
}

export function MatchDetailExpanded({ match }: MatchDetailExpandedProps) {
  const tier = getTier(match);

  const borderColorClass =
    tier === 'strong' ? 'border-emerald-500' :
    tier === 'good' ? 'border-blue-500' :
    tier === 'weak' ? 'border-amber-500' :
    'border-red-500';

  return (
    <div className={`p-4 ml-8 border-l-2 bg-white/[0.02] ${borderColorClass}`}>
      {match.reasoning ? (
        <>
          {match.evalStatus === 'curated' ? (
            /* Curated: urgency badge + analyst note */
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide ${
                  match.framing === 'URGENT'
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                    : 'bg-white/[0.04] text-white/40 border border-white/[0.06]'
                }`}>
                  {match.framing === 'URGENT' ? 'URGENT' : 'NORMAL'}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-widest text-emerald-400">Analyst Note</span>
                <p className="text-sm text-white/60 leading-relaxed mt-0.5">{match.reasoning}</p>
              </div>
            </div>
          ) : (
            /* Reasoned: structured Signal / Edge */
            (() => {
              const parsed = parseReasoning(match.reasoning);
              if (parsed) {
                return (
                  <div className="space-y-2">
                    {parsed.signal && (
                      <div>
                        <span className="text-[10px] uppercase tracking-widest text-white/30">Signal</span>
                        <p className="text-sm text-white/60 leading-relaxed mt-0.5">{parsed.signal}</p>
                      </div>
                    )}
                    {parsed.edge && (
                      <div>
                        <span className="text-[10px] uppercase tracking-widest text-emerald-400">Edge</span>
                        <p className="text-sm text-white/70 leading-relaxed mt-0.5">{parsed.edge}</p>
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <p className="text-sm text-white/60 leading-relaxed">{match.reasoning}</p>
              );
            })()
          )}

          {match.risks?.length > 0 && (
            <div className="mt-3">
              <span className="text-[10px] uppercase tracking-widest text-red-400">
                Risk
              </span>
              <ul className="mt-1 space-y-1">
                {match.risks.map((r, i) => (
                  <li key={i} className="text-sm text-white/40">
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-white/30">
          Score available. Detailed analysis on demand.
        </p>
      )}

      <div className="mt-3 text-xs text-white/20">
        Fit {match.scores.fit.toFixed(2)} &middot;{' '}
        Timing {match.scores.timing.toFixed(2)} &middot;{' '}
        Combined {match.scores.combined.toFixed(2)}
      </div>

      <div className="mt-3 flex gap-3">
        <button className="text-sm text-white/40 hover:text-white/70 transition-colors"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          Enrich Contact
        </button>
        <button className="text-sm text-white/40 hover:text-white/70 transition-colors"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          Export
        </button>
      </div>
    </div>
  );
}
