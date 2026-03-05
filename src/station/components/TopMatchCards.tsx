/**
 * TopMatchCards — Top 3 reasoned matches displayed as cards.
 * Shows demand/supply companies, reasoning, risks.
 */

import type { MatchResult, CanonicalInfo } from '../hooks/useMCPJob';
import { getTier, tierConfig, parseReasoning } from '../lib/tiers';

interface TopMatchCardsProps {
  matches: MatchResult[];
  canonicals: Map<string, CanonicalInfo>;
  isRunning: boolean;
}

export function TopMatchCards({ matches, canonicals, isRunning }: TopMatchCardsProps) {
  // Curated matches first, then reasoned — both have analyst notes
  const reasoned = matches
    .filter((m) => m.reasoning && !m.vetoed)
    .sort((a, b) => {
      // Curated matches bubble to top
      if (a.evalStatus === 'curated' && b.evalStatus !== 'curated') return -1;
      if (b.evalStatus === 'curated' && a.evalStatus !== 'curated') return 1;
      return b.scores.combined - a.scores.combined;
    })
    .slice(0, 3);

  // Skeleton cards while running and fewer than 3 reasoned
  const skeletonCount = isRunning ? Math.max(0, 3 - reasoned.length) : 0;

  if (reasoned.length === 0 && !isRunning) return null;

  return (
    <div className="mt-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {reasoned.map((match, i) => {
          const tier = getTier(match);
          const tc = tierConfig[tier];
          const demandCanon = canonicals.get(match.demandKey);
          const supplyCanon = canonicals.get(match.supplyKey);

          return (
            <div
              key={match.evalId}
              className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-6"
              style={{ animation: `cardIn 0.3s ease-out ${i * 0.1}s both` }}
            >
              {/* Rank + tier */}
              <div className="text-sm text-white/40 mb-4">
                #{i + 1} &middot;{' '}
                <span className={tc.textColor}>{tc.label}</span>
              </div>

              {/* Demand */}
              <div className="text-[10px] uppercase tracking-widest text-white/20 mb-1">
                Demand
              </div>
              <div className="text-white/90 font-medium text-sm">
                {demandCanon?.company || match.demandKey}
              </div>
              <div className="text-white/50 text-sm mt-0.5 line-clamp-2">
                {demandCanon?.wants || ''}
              </div>

              {/* Divider */}
              <div className="border-t border-white/[0.06] my-3" />

              {/* Supply */}
              <div className="text-[10px] uppercase tracking-widest text-white/20 mb-1">
                Supply
              </div>
              <div className="text-white/90 font-medium text-sm">
                {supplyCanon?.company || match.supplyKey}
              </div>
              <div className="text-white/50 text-sm mt-0.5 line-clamp-2">
                {supplyCanon?.offers || ''}
              </div>

              {/* Divider */}
              <div className="border-t border-white/[0.06] my-3" />

              {/* Curated: urgency badge + analyst note */}
              {match.evalStatus === 'curated' ? (
                <>
                  {/* Urgency badge */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide ${
                      match.framing === 'URGENT'
                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                        : 'bg-white/[0.04] text-white/40 border border-white/[0.06]'
                    }`}>
                      {match.framing === 'URGENT' ? 'URGENT' : 'NORMAL'}
                    </span>
                  </div>

                  <div className="text-[10px] uppercase tracking-widest text-emerald-400 mb-1">
                    Analyst Note
                  </div>
                  <p className="text-sm text-white/60 leading-relaxed">
                    {match.reasoning}
                  </p>
                </>
              ) : (
                /* Reasoned: structured Signal / Edge display */
                (() => {
                  const parsed = parseReasoning(match.reasoning);
                  if (parsed) {
                    return (
                      <>
                        {parsed.signal && (
                          <>
                            <div className="text-[10px] uppercase tracking-widest text-white/30 mb-1">
                              Signal
                            </div>
                            <p className="text-sm text-white/60 leading-relaxed">
                              {parsed.signal}
                            </p>
                          </>
                        )}
                        {parsed.edge && (
                          <>
                            <div className="text-[10px] uppercase tracking-widest text-emerald-400 mt-3 mb-1">
                              Edge
                            </div>
                            <p className="text-sm text-white/70 leading-relaxed">
                              {parsed.edge}
                            </p>
                          </>
                        )}
                      </>
                    );
                  }
                  return (
                    <>
                      <div className="text-[10px] uppercase tracking-widest text-emerald-400 mb-1">
                        Why this works
                      </div>
                      <p className="text-sm text-white/60 leading-relaxed">
                        {match.reasoning}
                      </p>
                    </>
                  );
                })()
              )}

              {/* Risks */}
              {match.risks?.length > 0 && (
                <>
                  <div className="text-[10px] uppercase tracking-widest text-red-400 mt-3 mb-1">
                    Risk
                  </div>
                  {match.risks.map((r, j) => (
                    <div key={j} className="text-sm text-white/40">
                      {r}
                    </div>
                  ))}
                </>
              )}
            </div>
          );
        })}

        {/* Skeleton cards */}
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <div
            key={`skeleton-${i}`}
            className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-6 flex flex-col items-center justify-center"
            style={{ minHeight: '256px' }}
          >
            <div className="space-y-3 w-full">
              {[180, 140, 200, 120, 160].map((w, j) => (
                <div
                  key={j}
                  className="h-[2px] rounded-full overflow-hidden"
                  style={{ maxWidth: `${w}px`, background: 'rgba(255,255,255,0.06)' }}
                >
                  <div style={{
                    width: '100%',
                    height: '100%',
                    backgroundImage: 'linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.12) 50%, transparent 75%)',
                    backgroundSize: '200% 100%',
                    animation: `shimmer 1.5s ease-in-out infinite ${j * 0.15}s`,
                  }} />
                </div>
              ))}
            </div>
            <p className="text-xs text-white/20 mt-4">Analyzing top matches...</p>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
