/**
 * Dataset Health Card
 *
 * Shows dataset analysis, match prediction, and counterparty filters.
 * Linear-style monochromatic design.
 */

import { useState } from 'react';
import { Check, Copy, Database, Users, Mail, Target, ChevronRight, Loader2, CircleDollarSign } from 'lucide-react';
import type { DatasetHealth, CounterpartyFilters, MatchPrediction } from '../services/DatasetIntelligence';
import { formatFiltersForScraper, formatFiltersForLeadsFinder } from '../services/DatasetIntelligence';

interface DatasetHealthCardProps {
  title: string;
  health: DatasetHealth | null;
  isLoading: boolean;
  counterpartyFilters?: CounterpartyFilters | null;
  matchPrediction?: MatchPrediction | null;
}

export function DatasetHealthCard({
  title,
  health,
  isLoading,
  counterpartyFilters,
  matchPrediction
}: DatasetHealthCardProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  const copyFilters = () => {
    if (!counterpartyFilters) return;
    navigator.clipboard.writeText(formatFiltersForScraper(counterpartyFilters));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyLeadsFinderJson = () => {
    if (!counterpartyFilters) return;
    navigator.clipboard.writeText(formatFiltersForLeadsFinder(counterpartyFilters));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
        <div className="flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-white/30 animate-spin" />
          <span className="text-white/40 text-[13px]">Analyzing {title.toLowerCase()}...</span>
        </div>
      </div>
    );
  }

  if (!health) {
    return (
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
        <div className="flex items-center gap-3">
          <Database className="w-4 h-4 text-white/20" />
          <span className="text-white/40 text-[13px]">No {title.toLowerCase()} configured</span>
        </div>
      </div>
    );
  }

  // Linear-style: use opacity to indicate quality, not colors
  const emailOpacity = health.emailCoverage >= 80 ? 'text-white/90' :
                       health.emailCoverage >= 50 ? 'text-white/70' : 'text-white/50';

  const dmOpacity = health.decisionMakerPercent >= 70 ? 'text-white/90' :
                    health.decisionMakerPercent >= 40 ? 'text-white/70' : 'text-white/50';

  return (
    <div className="bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.04]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center">
              <Database className="w-4 h-4 text-white/50" />
            </div>
            <div>
              <h3 className="text-[13px] font-medium text-white/90">{title}</h3>
              <p className="text-[11px] text-white/40">{health.niche}</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-white/90 text-lg font-medium tabular-nums">{health.totalContacts}</span>
            <p className="text-white/40 text-[11px]">contacts</p>
          </div>
        </div>
      </div>

      {/* Stats Grid - Linear monochrome */}
      <div className="px-4 py-3 grid grid-cols-4 gap-2">
        <div className="text-center py-2">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Mail className="w-3 h-3 text-white/30" />
            <span className={`text-[15px] font-medium tabular-nums ${emailOpacity}`}>{health.emailCoverage}%</span>
          </div>
          <p className="text-white/30 text-[10px] uppercase tracking-wider">Emails</p>
        </div>

        <div className="text-center py-2">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Users className="w-3 h-3 text-white/30" />
            <span className={`text-[15px] font-medium tabular-nums ${dmOpacity}`}>{health.decisionMakerPercent}%</span>
          </div>
          <p className="text-white/30 text-[10px] uppercase tracking-wider">DMs</p>
        </div>

        <div className="text-center py-2">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Target className="w-3 h-3 text-white/30" />
            <span className="text-[15px] font-medium tabular-nums text-white/70">{health.enrichmentEstimate?.recordsNeedingEnrichment || 0}</span>
          </div>
          <p className="text-white/30 text-[10px] uppercase tracking-wider">Enrich</p>
        </div>

        <div className="text-center py-2">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <CircleDollarSign className="w-3 h-3 text-white/30" />
            <span className="text-[15px] font-medium tabular-nums text-white/70">${health.enrichmentEstimate?.estimatedCost || 0}</span>
          </div>
          <p className="text-white/30 text-[10px] uppercase tracking-wider">Cost</p>
        </div>
      </div>

      {/* Top Industry - subtle */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-white/30 text-[11px]">Top industry</span>
          <span className="text-white/60 text-[11px] bg-white/[0.04] px-2 py-0.5 rounded">{health.topIndustry}</span>
        </div>
      </div>

      {/* Counterparty Filters (if available) */}
      {counterpartyFilters && (
        <div className="border-t border-white/[0.04]">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-2">
              <ChevronRight className={`w-3.5 h-3.5 text-white/40 transition-transform duration-200 ${showFilters ? 'rotate-90' : ''}`} />
              <span className="text-white/70 text-[12px] font-medium">Counterparty Filters</span>
              <span className="text-white/30 text-[11px]">{counterpartyFilters.description}</span>
            </div>
          </button>

          {showFilters && (
            <div className="px-4 pb-4 space-y-3">
              {/* Job Titles Include */}
              <div>
                <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Job Titles</p>
                <div className="flex flex-wrap gap-1">
                  {counterpartyFilters.jobTitlesInclude.slice(0, 8).map((title, i) => (
                    <span key={i} className="text-[11px] bg-white/[0.04] text-white/60 px-2 py-0.5 rounded">
                      {title}
                    </span>
                  ))}
                  {counterpartyFilters.jobTitlesInclude.length > 8 && (
                    <span className="text-[11px] text-white/30">+{counterpartyFilters.jobTitlesInclude.length - 8}</span>
                  )}
                </div>
              </div>

              {/* Keywords Include */}
              <div>
                <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1.5">Keywords</p>
                <div className="flex flex-wrap gap-1">
                  {counterpartyFilters.keywordsInclude.slice(0, 6).map((kw, i) => (
                    <span key={i} className="text-[11px] bg-white/[0.04] text-white/60 px-2 py-0.5 rounded">
                      {kw}
                    </span>
                  ))}
                  {counterpartyFilters.keywordsInclude.length > 6 && (
                    <span className="text-[11px] text-white/30">+{counterpartyFilters.keywordsInclude.length - 6}</span>
                  )}
                </div>
              </div>

              {/* Copy Buttons - Linear style */}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={copyFilters}
                  className="flex-1 h-8 bg-white/[0.04] hover:bg-white/[0.06] border border-white/[0.06] rounded-lg flex items-center justify-center gap-2 transition-all duration-200"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-white/70" />
                      <span className="text-white/70 text-[12px]">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-white/50" />
                      <span className="text-white/50 text-[12px]">Copy text</span>
                    </>
                  )}
                </button>
                <button
                  onClick={copyLeadsFinderJson}
                  className="flex-1 h-8 bg-white/[0.04] hover:bg-white/[0.06] border border-white/[0.06] rounded-lg flex items-center justify-center gap-2 transition-all duration-200"
                >
                  {copiedJson ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-white/70" />
                      <span className="text-white/70 text-[12px]">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-white/50" />
                      <span className="text-white/50 text-[12px]">Leads Finder JSON</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Match Prediction (if available) - monochrome */}
      {matchPrediction && (
        <div className="border-t border-white/[0.04] p-4 bg-white/[0.01]">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
            <span className="text-white/70 font-medium text-[12px]">Match Prediction</span>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-white/[0.03] rounded-lg p-3 text-center">
              <span className="text-xl font-medium text-white/90 tabular-nums">{matchPrediction.introsPossible}</span>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mt-0.5">Intros</p>
            </div>
            <div className="bg-white/[0.03] rounded-lg p-3 text-center">
              <span className="text-xl font-medium text-white/90 tabular-nums">${matchPrediction.estimatedCost}</span>
              <p className="text-white/30 text-[10px] uppercase tracking-wider mt-0.5">Est. cost</p>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-white/30">Match quality</span>
            <span className={`font-medium ${
              matchPrediction.matchQuality === 'excellent' ? 'text-white/90' :
              matchPrediction.matchQuality === 'good' ? 'text-white/70' :
              matchPrediction.matchQuality === 'partial' ? 'text-white/50' : 'text-white/40'
            }`}>
              {matchPrediction.matchQuality.charAt(0).toUpperCase() + matchPrediction.matchQuality.slice(1)}
            </span>
          </div>

          {matchPrediction.enrichmentNeeded > 0 && (
            <p className="text-white/30 text-[11px] mt-2">
              {matchPrediction.enrichmentNeeded} contacts need enrichment
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Compact version for inline display - Linear monochrome
 */
export function DatasetHealthBadge({ health }: { health: DatasetHealth | null }) {
  if (!health) return null;

  // Linear-style: use opacity not colors
  const opacity = health.emailCoverage >= 80 ? 'text-white/70' :
                  health.emailCoverage >= 50 ? 'text-white/50' : 'text-white/40';

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.04] text-[11px]">
      <Mail className={`w-3 h-3 ${opacity}`} />
      <span className={opacity}>{health.emailCoverage}%</span>
      <span className="text-white/20">·</span>
      <span className="text-white/50">{health.totalContacts}</span>
    </span>
  );
}
