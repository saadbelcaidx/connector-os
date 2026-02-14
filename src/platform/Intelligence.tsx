/**
 * PLATFORM INTELLIGENCE — Radar UI
 *
 * Real-time intelligence for live sales calls.
 * Visual: Dark radar aesthetic, company nodes on a map, blue signal pulses.
 * NOT a SaaS tool — an intelligence radar.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { X, Settings, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { queryIntelligence, type IntelligenceKeys, type AIProvider } from './IntelligenceService';
import { getCompanyIntel, isPredictLeadsConfigured, type CompanyIntel, type PredictLeadsKeys } from './PredictLeadsService';
import type { IntelligenceResult, IntelligenceResponse } from './types';

// =============================================================================
// STYLES — Radar animations
// =============================================================================

const injectStyles = () => {
  if (document.getElementById('radar-styles')) return;
  const style = document.createElement('style');
  style.id = 'radar-styles';
  style.textContent = `
    @keyframes radarSweep {
      0% { transform: translate(-50%, -50%) rotate(0deg); }
      100% { transform: translate(-50%, -50%) rotate(360deg); }
    }

    @keyframes centerPulse {
      0% { width: 8px; height: 8px; opacity: 0.4; }
      100% { width: 200px; height: 200px; opacity: 0; }
    }

    @keyframes signalPulse {
      0% { transform: scale(1); opacity: 1; }
      100% { transform: scale(2.5); opacity: 0; }
    }

    @keyframes statusBlink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    @keyframes panelSlideIn {
      from { opacity: 0; transform: translateY(-50%) translateX(30px); }
      to { opacity: 1; transform: translateY(-50%) translateX(0); }
    }

    @keyframes nodeFadeIn {
      from { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
      to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .radar-font {
      font-family: 'SF Mono', 'Fira Code', 'Monaco', 'Consolas', monospace;
      letter-spacing: -0.02em;
    }
  `;
  document.head.appendChild(style);
};

// =============================================================================
// PROPS
// =============================================================================

interface IntelligenceProps {
  exaKey: string;
  aiProvider: AIProvider;
  aiKey: string;
  azureEndpoint?: string;
  azureDeployment?: string;
  apolloKey?: string;
  predictLeadsKey?: string;
  predictLeadsToken?: string;
  onConnect?: (result: IntelligenceResult) => void;
  prospectDomain?: string;
}

// =============================================================================
// NODE POSITIONING — Distribute companies in a circular pattern
// =============================================================================

function getNodePosition(index: number, total: number): { top: string; left: string } {
  // With max 8 nodes, single ring at radius 30 gives ~45° spacing minimum
  const radius = total <= 6 ? 28 : 32;
  const angleOffset = -90;
  const angle = angleOffset + (index / total) * 360;
  const radians = (angle * Math.PI) / 180;

  const x = 50 + radius * Math.cos(radians);
  const y = 50 + radius * Math.sin(radians);

  return { top: `${y}%`, left: `${x}%` };
}

/**
 * CHANGE 3: Dynamic signal shortening
 * Trims trailing detail after key event phrase — no hardcoded values
 */
function shortenSignal(signal: string | undefined, maxLength: number = 32): string {
  if (!signal) return 'Active signal';

  // Trim at common detail separators (from, in, with, &, at, for)
  const separators = [' from ', ' in ', ' with ', ' & ', ' at ', ' for ', ' to '];
  let shortened = signal;

  for (const sep of separators) {
    const idx = signal.toLowerCase().indexOf(sep);
    if (idx > 10 && idx < signal.length - 5) {
      // Keep text before separator if it's meaningful (>10 chars) and separator isn't at the end
      shortened = signal.slice(0, idx);
      break;
    }
  }

  // If still too long, truncate cleanly
  if (shortened.length > maxLength) {
    shortened = shortened.slice(0, maxLength).trim();
    // Don't cut mid-word
    const lastSpace = shortened.lastIndexOf(' ');
    if (lastSpace > maxLength - 10) {
      shortened = shortened.slice(0, lastSpace);
    }
  }

  return shortened || 'Active signal';
}

// =============================================================================
// FALLBACK QUERIES — vertical-aware, used when primary returns empty
// =============================================================================

const FALLBACK_QUERIES: Record<string, string> = {
  recruitment: 'companies hiring VP Sales CFO Head of People',
  wealth: 'recent acquisitions IPO filings founder exits',
  biotech: 'Phase 2 trial biotech partnering licensing',
  pe: 'growth equity raise founder-led expansion',
  general: 'companies expanding hiring leadership scaling operations',
};

const FALLBACK_KEYWORDS: Record<string, string[]> = {
  recruitment: ['hiring', 'recruit', 'talent', 'staffing', 'headhunt', 'hr', 'people'],
  wealth: ['wealth', 'advisor', 'hnw', 'family office', 'asset', 'portfolio'],
  biotech: ['biotech', 'pharma', 'clinical', 'trial', 'therapeutics', 'drug'],
  pe: ['private equity', 'pe ', 'growth equity', 'buyout', 'portfolio company', 'fund'],
};

function detectFallbackVertical(query: string): string {
  const lower = query.toLowerCase();
  for (const [vertical, keywords] of Object.entries(FALLBACK_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return vertical;
  }
  return 'general';
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function Intelligence({
  exaKey,
  aiProvider,
  aiKey,
  azureEndpoint,
  azureDeployment,
  apolloKey,
  predictLeadsKey,
  predictLeadsToken,
  onConnect,
  prospectDomain,
}: IntelligenceProps) {
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<IntelligenceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<IntelligenceResult | null>(null);
  const [companyIntel, setCompanyIntel] = useState<CompanyIntel | null>(null);
  const [loadingIntel, setLoadingIntel] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastSuccessfulResponse = useRef<IntelligenceResponse | null>(null);

  // PredictLeads keys for deep intel
  const predictLeadsKeys: PredictLeadsKeys = {
    apiKey: predictLeadsKey || '',
    apiToken: predictLeadsToken || '',
  };
  const hasPredictLeads = isPredictLeadsConfigured(predictLeadsKeys);

  useEffect(() => {
    injectStyles();
  }, []);

  // Fetch deep intel when a company node is selected
  useEffect(() => {
    if (!selectedResult || !hasPredictLeads) {
      setCompanyIntel(null);
      return;
    }

    const domain = selectedResult.company.companyDomain;
    if (!domain) return;

    let cancelled = false;
    setLoadingIntel(true);
    setCompanyIntel(null);

    getCompanyIntel(domain, predictLeadsKeys)
      .then((intel) => {
        if (!cancelled) {
          setCompanyIntel(intel);
        }
      })
      .catch((err) => {
        console.error('[Intelligence] PredictLeads fetch failed:', err);
      })
      .finally(() => {
        if (!cancelled) setLoadingIntel(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedResult, hasPredictLeads, predictLeadsKey, predictLeadsToken]);

  const keys: IntelligenceKeys = {
    exaKey,
    aiProvider,
    aiKey,
    azureEndpoint,
    azureDeployment,
    apolloKey,
  };

  const handleSearch = useCallback(async () => {
    if (!query.trim() || isLoading) return;

    console.log('[Intelligence] handleSearch called');
    console.log('[Intelligence] apolloKey prop:', apolloKey ? `${apolloKey.slice(0,8)}...` : 'EMPTY');
    console.log('[Intelligence] keys object:', {
      hasExa: !!keys.exaKey,
      hasApollo: !!keys.apolloKey,
      apolloKeyValue: keys.apolloKey ? `${keys.apolloKey.slice(0,8)}...` : 'EMPTY',
      hasAiKey: !!keys.aiKey
    });
    console.log('[Intelligence] includeContacts will be:', !!apolloKey);

    setIsLoading(true);
    setError(null);
    setSelectedResult(null);

    try {
      const result = await queryIntelligence(
        {
          query: query.trim(),
          prospectDomain,
          numResults: 8,
          includeContacts: !!apolloKey,
        },
        keys
      );

      // Step 1: "Never empty" fallback — if results are empty, retry with vertical-aware query
      if (result.success && result.results.length === 0) {
        console.log('[Intelligence] Empty results — firing vertical fallback');
        const vertical = detectFallbackVertical(query);
        const fallbackQuery = FALLBACK_QUERIES[vertical];
        console.log(`[Intelligence] Fallback vertical: ${vertical}, query: "${fallbackQuery}"`);

        try {
          const fallbackResult = await queryIntelligence(
            {
              query: fallbackQuery,
              prospectDomain,
              numResults: 8,
              includeContacts: !!apolloKey,
            },
            keys
          );

          if (fallbackResult.success && fallbackResult.results.length > 0) {
            setResponse(fallbackResult);
            lastSuccessfulResponse.current = fallbackResult;
            return; // Radar populated — done
          }
        } catch (fallbackErr) {
          console.error('[Intelligence] Fallback query also failed:', fallbackErr);
        }
      }

      setResponse(result);

      if (result.success) {
        lastSuccessfulResponse.current = result;
      }

      // Step 3: Call-safe error — never show raw error to user
      if (!result.success && result.error) {
        console.error('[Intelligence] API error (hidden from UI):', result.error);
        if (lastSuccessfulResponse.current) {
          // Show cached results + muted delay notice
          setResponse(lastSuccessfulResponse.current);
          setError('delayed');
        } else {
          setError('no_results');
        }
      }
    } catch (err) {
      console.error('[Intelligence] Query failed:', err);
      // Step 3: Never expose raw error — use cached results or calm placeholder
      if (lastSuccessfulResponse.current) {
        setResponse(lastSuccessfulResponse.current);
        setError('delayed');
      } else {
        setError('no_results');
      }
    } finally {
      setIsLoading(false);
    }
  }, [query, keys, prospectDomain, apolloKey, isLoading]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  const isConfigured = !!exaKey && !!aiKey;

  const hasLiveSignal = (result: IntelligenceResult) => {
    return result.company.signalType === 'hiring' ||
           result.company.signalType === 'funding' ||
           result.company.signalType === 'expansion';
  };

  // Not configured
  if (!isConfigured) {
    return (
      <div className="h-[85vh] flex items-center justify-center relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }}
        />
        <div className="relative max-w-sm text-center radar-font z-10">
          <div className="w-16 h-16 rounded-full bg-white/[0.02] border border-white/[0.06] flex items-center justify-center mx-auto mb-5">
            <div className="w-3 h-3 rounded-full bg-red-500/60" />
          </div>
          <p className="text-[12px] text-white/50 uppercase tracking-widest mb-2">Missing credentials</p>
          <div className="text-[13px] text-white/30 mb-8 space-y-1">
            {!exaKey && <p>EXA API key not set</p>}
            {!aiKey && <p>AI provider key not set (OpenAI, Anthropic, or Azure)</p>}
          </div>
          <button
            onClick={() => navigate('/settings')}
            className="h-10 px-6 rounded-xl bg-white text-[#08090a] text-[13px] font-medium
              flex items-center justify-center gap-2 mx-auto hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <Settings className="w-4 h-4" />
            Configure
          </button>
        </div>
      </div>
    );
  }

  const hasResults = response && response.results.length > 0;

  // Structural: limit radar to top 8, ranked by opportunityScore from backend
  const MAX_RADAR_NODES = 8;
  const rankResult = (r: IntelligenceResult) =>
    ((r.company as any).opportunityScore || 0)
    + (r.contact?.email ? 20 : r.contact ? 10 : 0);
  const radarResults = hasResults
    ? [...response.results]
        .sort((a, b) => rankResult(b) - rankResult(a))
        .slice(0, MAX_RADAR_NODES)
    : [];
  const overflowCount = hasResults ? Math.max(0, response.results.length - MAX_RADAR_NODES) : 0;

  return (
    <div className="relative h-[85vh] radar-font overflow-hidden">
      {/* Grid background */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />

      {/* Radar rings */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150px] h-[150px] rounded-full border border-white/[0.08]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full border border-white/[0.06]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] h-[450px] rounded-full border border-white/[0.04]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-white/[0.03]" />

      {/* CHANGE 6: Removed radar sweep — too theatrical */}

      {/* Center point */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white/40" />

      {/* CHANGE 6: Removed center pulse — too theatrical */}

      {/* CHANGE 1: Dim status — operators don't announce readiness */}
      <div className="absolute top-8 left-8 flex items-center gap-2 z-10">
        <div
          className={`w-2 h-2 rounded-full ${isLoading ? 'bg-violet-400 animate-pulse' : 'bg-white/20'}`}
        />
        <span className="text-[11px] text-white/20 uppercase tracking-widest">
          {isLoading ? 'Loading' : ''}
        </span>
      </div>

      {/* CHANGE 5: Removed plumbing stats — breaks illusion */}

      {/* Market activity — one quiet line, pattern before companies */}
      {hasResults && (() => {
        const ma = (response.meta as any)?.marketActivity;
        if (!ma) return null;
        const parts: string[] = [];
        if (ma.hiring > 0) parts.push(`${ma.hiring} hiring`);
        if (ma.funding > 0) parts.push(`${ma.funding} funding`);
        if (ma.expansion > 0) parts.push(`${ma.expansion} expansion`);
        if (ma.acquisition > 0) parts.push(`${ma.acquisition} acquisition`);
        if (ma.exec_change > 0) parts.push(`${ma.exec_change} leadership change`);
        if (parts.length === 0) return null;
        return (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-10">
            <span className="text-[13px] text-white/40">Market activity: {parts.join(' · ')}</span>
          </div>
        );
      })()}

      {/* Company nodes — top 8 by matchScore only */}
      {hasResults && radarResults.map((result, i) => {
        const pos = getNodePosition(i, radarResults.length);
        const isActive = hasLiveSignal(result);
        const isSelected = selectedResult?.company.companyDomain === result.company.companyDomain;

        return (
          <div
            key={result.company.companyDomain || i}
            className="absolute cursor-pointer group"
            style={{
              top: pos.top,
              left: pos.left,
              transform: 'translate(-50%, -50%)',
              /* CHANGE 3: No staggered animation — instant appear */
              zIndex: isSelected ? 20 : 10,
            }}
            onClick={() => setSelectedResult(isSelected ? null : result)}
          >
            <div className="relative flex flex-col items-center">
              <div
                className={`w-4 h-4 rounded-full transition-all duration-300 ${
                  isActive
                    ? 'bg-violet-500 shadow-[0_0_30px_rgba(139,92,246,0.6)]'
                    : 'bg-white/80 group-hover:bg-white'
                } ${isSelected ? 'ring-2 ring-white/60 ring-offset-2 ring-offset-[#08090a]' : ''}`}
              />
              {isActive && (
                <>
                  <div
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full border border-violet-400/50"
                    style={{ animation: 'signalPulse 2s ease-out infinite' }}
                  />
                  <div
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full border border-violet-400/30"
                    style={{ animation: 'signalPulse 2s ease-out infinite 0.6s' }}
                  />
                </>
              )}
              {/* CHANGE 3 & 4: Brighter signal, bolder company name */}
              <div className="mt-4 text-center whitespace-nowrap">
                <div className={`text-[15px] font-semibold tracking-tight ${isActive || isSelected ? 'text-white' : 'text-white/80'}`}>
                  {result.company.companyName}
                </div>
                <div className={`text-[17px] font-bold mt-2 ${isActive ? 'text-violet-300' : 'text-white'}`}>
                  {shortenSignal(result.company.signalTitle || result.company.companyDescription)}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Overflow counter */}
      {overflowCount > 0 && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10">
          <span className="text-[12px] text-white/30">+{overflowCount} more results</span>
        </div>
      )}

      {/* Search bar - BOTTOM, not center */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-xl px-6 z-20">
        {/* CHANGE 5: Removed stats above search — plumbing */}

        {/* Search input — always active, always reusable */}
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type to search..."
            className={`w-full h-14 px-6 ${!hasResults ? 'pr-24' : 'pr-6'} rounded-2xl
              bg-white/[0.06] border border-white/[0.15]
              text-white text-[15px] placeholder:text-white/40
              focus:outline-none focus:border-violet-500/50 focus:bg-white/[0.08]
              hover:border-white/20 hover:bg-white/[0.07]
              transition-all cursor-text`}
            disabled={isLoading}
          />
          {/* Button only in empty state — Enter always works */}
          {!hasResults && (
            <button
              onClick={handleSearch}
              disabled={!query.trim() || isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-10 px-5 rounded-xl
                bg-violet-500 text-white text-[13px] font-medium
                disabled:opacity-30 disabled:cursor-not-allowed
                hover:bg-violet-400 active:scale-[0.98] transition-all"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Scan'}
            </button>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedResult && (
        <div
          className="intel-scroll absolute top-1/2 right-10 -translate-y-1/2 w-[400px] max-h-[85vh] overflow-y-auto p-7 bg-[#0c0d0f]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl z-30"
          style={{ animation: 'panelSlideIn 0.4s ease' }}
        >
          <button
            onClick={() => setSelectedResult(null)}
            className="absolute top-5 right-5 w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center hover:bg-white/[0.1] transition-colors"
          >
            <X className="w-4 h-4 text-white/60" />
          </button>

          {/* Header */}
          <div className="mb-6">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="text-[17px] font-medium text-white tracking-[-0.02em]">
                  {selectedResult.company.companyName}
                </div>
                <div className="text-[12px] text-white/40 mt-1">
                  {companyIntel?.profile?.location || selectedResult.company.companyDomain || 'No domain'}
                </div>
              </div>
              {(hasLiveSignal(selectedResult) || companyIntel?.hasHiringSignal || companyIntel?.hasFundingSignal) && (
                <div className="px-2.5 py-1 bg-violet-500/15 border border-violet-500/20 rounded-lg text-[10px] text-violet-400 uppercase tracking-wider font-medium">
                  Signal
                </div>
              )}
            </div>
          </div>

          {/* Loading intel */}
          {loadingIntel && (
            <div className="flex items-center gap-2 mb-5 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
              <span className="text-[12px] text-white/50">Fetching intelligence...</span>
            </div>
          )}

          {/* Intel pending - PredictLeads queued crawl */}
          {hasPredictLeads && !loadingIntel && companyIntel &&
           !companyIntel.profile &&
           companyIntel.jobOpenings.length === 0 &&
           companyIntel.financingEvents.length === 0 &&
           companyIntel.newsEvents.length === 0 && (
            <div className="flex items-center gap-2 mb-5 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse" />
              <span className="text-[12px] text-white/50">Intel pending — check back in 24h</span>
            </div>
          )}

          {/* Timing Signal (from PredictLeads) */}
          {companyIntel?.summary?.timingSignal && companyIntel.summary.timingSignal !== 'Stable — no urgent signals' && (
            <div className="p-5 rounded-xl mb-5 bg-violet-500/[0.06] border border-violet-500/10">
              <div className="text-[9px] text-violet-400/80 uppercase tracking-widest mb-2.5">
                Timing Signal
              </div>
              <div className="text-[14px] text-white/90 leading-relaxed">
                {companyIntel.summary.timingSignal}
              </div>
            </div>
          )}

          {/* Opportunity reason */}
          {(selectedResult.company as any).opportunityReason && (
            <div className="text-[12px] text-white/40 mb-5">
              {(selectedResult.company as any).opportunityReason}
            </div>
          )}

          {/* Primary Signal */}
          {selectedResult.company.signalTitle && (
            <div className="p-5 rounded-xl mb-5 bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[9px] text-white/40 uppercase tracking-widest mb-2.5">
                {hasLiveSignal(selectedResult) ? 'Live Signal' : 'Signal'}
              </div>
              <div className="text-[14px] text-white/90 leading-relaxed">
                {selectedResult.company.signalTitle}
              </div>
            </div>
          )}

          {/* Hiring Intel (PredictLeads) */}
          {companyIntel?.jobOpenings && companyIntel.jobOpenings.length > 0 && (
            <div className="p-5 rounded-xl mb-5 bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[9px] text-white/40 uppercase tracking-widest mb-3">
                Hiring · <span className="text-violet-400/80">{companyIntel.jobOpenings.length} roles</span>
              </div>
              <div className="space-y-2.5">
                {companyIntel.jobOpenings.slice(0, 3).map((job, i) => (
                  <div key={i} className="text-[13px] text-white/80">
                    {job.title} {job.location && <span className="text-white/40">· {job.location}</span>}
                  </div>
                ))}
                {companyIntel.jobOpenings.length > 3 && (
                  <div className="text-[11px] text-white/40 mt-1">+{companyIntel.jobOpenings.length - 3} more</div>
                )}
              </div>
            </div>
          )}

          {/* Funding Intel (PredictLeads) */}
          {companyIntel?.financingEvents && companyIntel.financingEvents.length > 0 && (
            <div className="p-5 rounded-xl mb-5 bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[9px] text-white/40 uppercase tracking-widest mb-3">
                Recent Funding
              </div>
              <div className="space-y-2">
                {companyIntel.financingEvents.slice(0, 2).map((event, i) => (
                  <div key={i} className="text-[13px] text-white/80">
                    {event.type} {event.amount && <span className="text-violet-400/80">· {event.amount}</span>}
                    {event.date && <span className="text-white/40 text-[11px]"> · {event.date}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* News (PredictLeads) */}
          {companyIntel?.newsEvents && companyIntel.newsEvents.length > 0 && (
            <div className="p-5 rounded-xl mb-5 bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[9px] text-white/40 uppercase tracking-widest mb-3">
                Recent News
              </div>
              <div className="space-y-2.5">
                {companyIntel.newsEvents.slice(0, 2).map((news, i) => (
                  <div key={i} className="text-[13px] text-white/70">
                    {news.title}
                    {news.date && <span className="text-white/30 text-[10px] ml-1">· {news.date}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tech Stack (PredictLeads) */}
          {companyIntel?.techStack && companyIntel.techStack.length > 0 && (
            <div className="mb-5">
              <div className="text-[9px] text-white/40 uppercase tracking-widest mb-3">Tech Stack</div>
              <div className="flex flex-wrap gap-2">
                {companyIntel.techStack.slice(0, 6).map((tech, i) => (
                  <span key={i} className="px-2.5 py-1 text-[11px] text-white/60 bg-white/[0.03] border border-white/[0.06] rounded-lg">
                    {tech.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Decision Maker */}
          {selectedResult.contact?.fullName ? (
            <div className="p-5 bg-white/[0.02] border border-white/[0.06] rounded-xl mb-5">
              <div className="text-[9px] text-white/40 uppercase tracking-widest mb-3">
                Decision Maker
              </div>
              <div className="text-[15px] text-white/90 font-medium">
                {selectedResult.contact.fullName}
              </div>
              {selectedResult.contact.title && (
                <div className="text-[13px] text-white/50 mt-1.5">
                  {selectedResult.contact.title}
                </div>
              )}
              {selectedResult.contact.email && (
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/[0.06]">
                  <span className="text-[13px] text-violet-400/90 font-mono">
                    {selectedResult.contact.email}
                  </span>
                  <button
                    onClick={() => navigator.clipboard.writeText(selectedResult.contact!.email!)}
                    className="text-[11px] text-white/40 hover:text-white/70 transition-colors px-2 py-0.5 rounded bg-white/[0.04]"
                  >
                    Copy
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="mb-5">
              <span className="text-[12px] text-white/30">Contact available on routing</span>
            </div>
          )}

          {onConnect && (
            <button
              onClick={() => onConnect(selectedResult)}
              className="w-full h-12 rounded-xl bg-violet-500 text-white text-[14px] font-medium
                hover:bg-violet-600 active:scale-[0.98] transition-all mt-2"
            >
              Connect
            </button>
          )}
        </div>
      )}

      {/* CHANGE 1: Default state — never blank */}
      {!response && !isLoading && !error && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center z-10">
          <div className="text-[13px] text-white/30">Intelligence ready</div>
        </div>
      )}

      {/* CHANGE 2: No "No matches found" — system always has something */}
      {/* Removed empty results message — backend should always return results */}

      {/* Call-safe error states — never red, never raw */}
      {error === 'delayed' && (
        <div className="absolute top-8 right-8 z-30" style={{ animation: 'fadeIn 0.5s ease' }}>
          <span className="text-[11px] text-white/30">Results may be delayed</span>
        </div>
      )}
      {error === 'no_results' && !hasResults && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center z-10">
          <div className="text-[13px] text-white/30">Scanning market signals...</div>
        </div>
      )}
    </div>
  );
}
