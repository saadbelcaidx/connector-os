/**
 * RunDetailPageV2 — Apple Minimal operator workspace
 *
 * Two-panel layout:
 *   Left (35%):  Pair list — curated pairs with tier dots, scrollable
 *   Right (65%): Detail — demand card, analyst note, supply card, action
 *
 * Top: Single quiet header line (back, run ID, status, stats)
 * The pair IS the insight. The operator reads WHY, then acts.
 *
 * Route: /station/run/:jobId
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useMCPJob } from '../hooks/useMCPJob';
import type { MatchResult, CanonicalInfo } from '../hooks/useMCPJob';
import { getTier, tierConfig, type Tier } from '../lib/tiers.tsx';
import { fetchCompanyIntel, INTEL_TYPES, type IntelType } from '../../services/InstantlyIntelService';
import { routeEnrichment } from '../../enrichment/router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../AuthContext';
import ExecutionBadge from '../components/ExecutionBadge';
import { applyOverlayV2 } from '../lib/applyOverlayV2';
import { EnrichmentGate } from '../components/EnrichmentGate';
import type { FulfillmentClient, ClientOverlay, ClientProfile } from '../../types/station';

// =============================================================================
// HELPERS
// =============================================================================

function isLikelyPersonName(name: string): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  const words = trimmed.split(/\s+/);
  if (words.length < 2 || words.length > 3) return false;
  if (/\b(inc|corp|llc|ltd|team|group|leadership|founding|company)\b/i.test(trimmed)) return false;
  return true;
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem.toString().padStart(2, '0')}s`;
}

function companyName(key: string, canonicals: Map<string, CanonicalInfo>): string {
  return canonicals.get(key)?.company || key.split(':')[1] || key;
}

function countTiers(matches: MatchResult[]): Record<Tier, number> {
  const counts: Record<Tier, number> = { strong: 0, good: 0, weak: 0, none: 0, conflict: 0 };
  for (const m of matches) counts[getTier(m)]++;
  return counts;
}

// =============================================================================
// COMPANY INTEL PANEL — expandable intel inside company cards
// =============================================================================

type IntelCache = Map<string, Map<IntelType, string | null>>;

function CompanyIntelPanel({
  domain,
  intelCache,
  onFetch,
}: {
  domain: string;
  intelCache: IntelCache;
  onFetch: (domain: string, type: IntelType) => void;
}) {
  const [activeTab, setActiveTab] = useState<IntelType>('Company+Description');
  const domainCache = intelCache.get(domain);
  const content = domainCache?.get(activeTab);

  // Fetch active tab on mount + tab change
  useEffect(() => {
    if (!domainCache?.has(activeTab)) {
      onFetch(domain, activeTab);
    }
  }, [domain, activeTab, domainCache, onFetch]);

  return (
    <div
      style={{
        marginTop: '10px',
        padding: '12px 0 0',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        animation: 'detailFadeIn 0.15s ease-out',
      }}
    >
      {/* Tab row */}
      <div className="flex items-center gap-1 mb-3">
        {INTEL_TYPES.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="font-mono transition-colors"
            style={{
              fontSize: '9px',
              padding: '3px 8px',
              borderRadius: '3px',
              background: activeTab === key ? 'rgba(255,255,255,0.06)' : 'transparent',
              color: activeTab === key ? 'rgba(255,255,255,0.60)' : 'rgba(255,255,255,0.20)',
              border: 'none',
              outline: 'none',
              cursor: 'pointer',
              letterSpacing: '0.02em',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ minHeight: '40px' }}>
        {!domainCache?.has(activeTab) ? (
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-full border border-white/10 animate-spin"
              style={{ borderTopColor: 'rgba(255,255,255,0.30)' }}
            />
            <span className="font-mono text-white/15" style={{ fontSize: '10px' }}>
              Loading…
            </span>
          </div>
        ) : content ? (
          <div className="space-y-2">
            {content
              .replace(/\[\d+\]/g, '')
              .split('\n')
              .map(line => line.replace(/^#{1,4}\s+/, '').replace(/\*\*/g, '').trim())
              .filter(line => line.length > 0)
              .map((line, i) => (
                <p
                  key={i}
                  className="text-white/40 leading-relaxed"
                  style={{ fontSize: '12px' }}
                >
                  {line}
                </p>
              ))}
          </div>
        ) : (
          <p className="font-mono text-white/15" style={{ fontSize: '10px' }}>
            No data available
          </p>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// GROUPED PAIR LIST — demand company header + supply sub-entries
// =============================================================================

interface DemandGroup {
  demandKey: string;
  demandName: string;
  matches: MatchResult[];
}

function groupByDemand(matches: MatchResult[], canonicals: Map<string, CanonicalInfo>): DemandGroup[] {
  const map = new Map<string, DemandGroup>();
  for (const m of matches) {
    let group = map.get(m.demandKey);
    if (!group) {
      group = { demandKey: m.demandKey, demandName: companyName(m.demandKey, canonicals), matches: [] };
      map.set(m.demandKey, group);
    }
    group.matches.push(m);
  }
  return [...map.values()];
}

function DemandGroupItem({
  group,
  canonicals,
  selectedEvalId,
  onSelect,
}: {
  group: DemandGroup;
  canonicals: Map<string, CanonicalInfo>;
  selectedEvalId: string | null;
  onSelect: (evalId: string) => void;
}) {
  const hasSelected = group.matches.some(m => m.evalId === selectedEvalId);

  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
      {/* Demand header */}
      <div
        className="font-mono truncate"
        style={{
          fontSize: '11px',
          color: hasSelected ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.40)',
          padding: '10px 16px 4px',
          letterSpacing: '0.01em',
        }}
      >
        {group.demandName}
      </div>
      {/* Supply sub-entries */}
      {group.matches.map(match => {
        const tier = getTier(match);
        const isSelected = selectedEvalId === match.evalId;
        const supply = companyName(match.supplyKey, canonicals);
        return (
          <button
            key={match.evalId}
            onClick={() => onSelect(match.evalId)}
            className="w-full text-left transition-colors"
            style={{
              padding: '5px 16px 5px 28px',
              background: isSelected ? 'rgba(255,255,255,0.04)' : 'transparent',
              border: 'none',
              outline: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span
              className="flex-shrink-0 inline-block w-1.5 h-1.5 rounded-full"
              style={{
                background:
                  tier === 'strong' ? '#34d399' :
                  tier === 'good' ? 'rgba(96,165,250,0.50)' :
                  tier === 'weak' ? 'rgba(251,191,36,0.35)' :
                  tier === 'conflict' ? 'rgba(248,113,113,0.50)' :
                  'rgba(255,255,255,0.10)',
              }}
            />
            <span
              className="font-mono truncate flex-1"
              style={{
                fontSize: '11px',
                color: isSelected ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.30)',
              }}
            >
              {supply}
            </span>
            {match.evalStatus === 'curated' && (
              <span
                className="flex-shrink-0"
                style={{ fontSize: '9px', color: '#34d399', letterSpacing: '0.05em' }}
              >
                VETTED
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// =============================================================================
// FULFILLMENT: FLAT CONTACT LIST — deduped by demandKey
// =============================================================================

interface DemandContact {
  demandKey: string;
  demandName: string;
  industry: string | null;
  signal: string;
  bestScore: number;
  bestMatch: MatchResult;
  allMatches: MatchResult[];
  enriched: boolean;
}

function groupByDemandFlat(
  matches: MatchResult[],
  canonicals: Map<string, CanonicalInfo>,
  enrichResults: Map<string, any>,
): DemandContact[] {
  const map = new Map<string, DemandContact>();
  for (const m of matches) {
    const existing = map.get(m.demandKey);
    const canon = canonicals.get(m.demandKey);
    const score = m.scores.combined;
    const enrichResult = enrichResults.get(m.evalId);
    const isEnriched = enrichResult && typeof enrichResult === 'object' && enrichResult.demand?.outcome === 'ENRICHED';

    if (!existing) {
      map.set(m.demandKey, {
        demandKey: m.demandKey,
        demandName: canon?.company || m.demandKey.split(':')[1] || m.demandKey,
        industry: canon?.industry || null,
        signal: canon?.whyNow || canon?.wants || m.framing || '',
        bestScore: score,
        bestMatch: m,
        allMatches: [m],
        enriched: !!isEnriched,
      });
    } else {
      existing.allMatches.push(m);
      if (score > existing.bestScore) {
        existing.bestScore = score;
        existing.bestMatch = m;
      }
      if (isEnriched) existing.enriched = true;
    }
  }
  // Sort: curated first, then by best score desc
  return [...map.values()].sort((a, b) => {
    const aCurated = a.bestMatch.evalStatus === 'curated' ? 1 : 0;
    const bCurated = b.bestMatch.evalStatus === 'curated' ? 1 : 0;
    if (aCurated !== bCurated) return bCurated - aCurated;
    return b.bestScore - a.bestScore;
  });
}

function ContactListItem({
  contact,
  isSelected,
  onSelect,
}: {
  contact: DemandContact;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const tier = getTier(contact.bestMatch);
  const tierColor =
    tier === 'strong' ? '#34d399' :
    tier === 'good' ? 'rgba(96,165,250,0.50)' :
    tier === 'weak' ? 'rgba(251,191,36,0.35)' :
    tier === 'conflict' ? 'rgba(248,113,113,0.50)' :
    'rgba(255,255,255,0.10)';
  const isVetted = contact.bestMatch.evalStatus === 'curated';

  return (
    <button
      onClick={onSelect}
      className="w-full text-left transition-colors"
      style={{
        padding: '10px 16px',
        background: isSelected ? 'rgba(255,255,255,0.04)' : 'transparent',
        border: 'none',
        borderBottom: '1px solid rgba(255,255,255,0.03)',
        outline: 'none',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: '3px',
      }}
    >
      {/* Row 1: tier dot + company + score */}
      <div className="flex items-center gap-2 w-full">
        <span
          className="flex-shrink-0 inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: tierColor }}
        />
        <span
          className="font-mono truncate flex-1"
          style={{
            fontSize: '11px',
            color: isSelected ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.40)',
            letterSpacing: '0.01em',
          }}
        >
          {contact.demandName}
        </span>
        {isVetted && (
          <span
            className="flex-shrink-0 font-mono"
            style={{ fontSize: '9px', color: '#34d399', letterSpacing: '0.05em' }}
          >
            VETTED
          </span>
        )}
        {/* Score hidden from operator — internal only */}
      </div>
      {/* Row 2: industry · signal */}
      {(contact.industry || contact.signal) && (
        <div
          className="font-mono truncate pl-4"
          style={{ fontSize: '10px', color: 'rgba(255,255,255,0.15)' }}
        >
          {[contact.industry, contact.signal].filter(Boolean).join(' · ')}
        </div>
      )}
    </button>
  );
}

// =============================================================================
// ENRICHMENT CONTACT CARD — reusable per-side display
// =============================================================================

function EnrichmentContactCard({
  label,
  side,
  onCopyEmail,
  emailCopied,
}: {
  label: string;
  side: any;
  onCopyEmail: (email: string) => void;
  emailCopied: boolean;
}) {
  if (side === 'loading') {
    return (
      <div>
        <div className="font-mono uppercase tracking-widest mb-2" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.06em' }}>
          {label}
        </div>
        <span className="font-mono text-white/30" style={{ fontSize: '11px' }}>
          Finding contact…
        </span>
      </div>
    );
  }

  if (!side || typeof side !== 'object') return null;

  if (side.outcome === 'ENRICHED') {
    return (
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '16px', position: 'relative', overflow: 'hidden' }}>
        <div className="font-mono uppercase tracking-widest mb-2" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.06em' }}>
          {label}
        </div>

        {/* Scan line */}
        <div
          style={{
            position: 'absolute',
            top: '16px',
            left: 0,
            right: 0,
            height: '1px',
            background: 'linear-gradient(90deg, transparent 0%, rgba(52,211,153,0.4) 20%, rgba(52,211,153,0.6) 50%, rgba(52,211,153,0.4) 80%, transparent 100%)',
            boxShadow: '0 0 8px rgba(52,211,153,0.3), 0 0 20px rgba(52,211,153,0.1)',
            animation: 'enrichScan 0.9s ease-out forwards',
            pointerEvents: 'none',
          }}
        />

        <div style={{ opacity: 0, animation: 'enrichReveal 0.4s ease-out 0.1s forwards', fontSize: '15px', color: 'rgba(255,255,255,0.90)', fontWeight: 500 }}>
          {side.firstName} {side.lastName}
        </div>
        {side.title && (
          <div className="truncate" style={{ opacity: 0, animation: 'enrichReveal 0.4s ease-out 0.22s forwards', fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginTop: '3px', maxWidth: '100%' }}>
            {side.title}
          </div>
        )}
        {(side.city || side.state) && (
          <div className="font-mono" style={{ opacity: 0, animation: 'enrichReveal 0.4s ease-out 0.34s forwards', fontSize: '11px', color: 'rgba(255,255,255,0.20)', marginTop: '2px' }}>
            {[side.city, side.state].filter(Boolean).join(', ')}
          </div>
        )}

        <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div className="flex items-center gap-2" style={{ opacity: 0, animation: 'enrichReveal 0.4s ease-out 0.50s forwards' }}>
            <span className="font-mono" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.60)' }}>
              {side.email}
            </span>
            <button
              onClick={() => onCopyEmail(side.email)}
              className="font-mono transition-colors"
              style={{
                fontSize: '9px',
                color: emailCopied ? 'rgba(52,211,153,0.60)' : 'rgba(255,255,255,0.20)',
                background: 'none',
                border: 'none',
                outline: 'none',
                cursor: 'pointer',
                padding: 0,
                letterSpacing: '0.04em',
              }}
            >
              {emailCopied ? 'copied' : 'copy'}
            </button>
          </div>
          {side.linkedinUrl && (
            <a
              href={side.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-white/25 hover:text-white/40 underline underline-offset-2 transition-colors"
              style={{ opacity: 0, animation: 'enrichReveal 0.4s ease-out 0.62s forwards', fontSize: '11px', textDecoration: 'underline', width: 'fit-content' }}
            >
              LinkedIn
            </a>
          )}
        </div>
      </div>
    );
  }

  // Error / not found states
  return (
    <div>
      <div className="font-mono uppercase tracking-widest mb-2" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <span className="font-mono text-white/25" style={{ fontSize: '11px' }}>
        {side.outcome === 'AUTH_ERROR'
          ? 'API key invalid or payment issue — check Settings.'
          : side.outcome === 'CREDITS_EXHAUSTED'
          ? 'Provider credits exhausted.'
          : side.outcome === 'RATE_LIMITED'
          ? 'Rate limited — try again shortly.'
          : side.outcome === 'NO_PROVIDERS'
          ? 'Add enrichment key in Settings.'
          : side.outcome === 'NO_CANDIDATES' || side.outcome === 'NOT_FOUND'
          ? 'No public contacts found.'
          : side.outcome === 'CANNOT_ROUTE'
          ? 'Not enough data to search.'
          : "Couldn't complete — try again."}
      </span>
    </div>
  );
}

// =============================================================================
// DETAIL PANE — the pair view
// =============================================================================

function PairDetail({
  match,
  canonicals,
  intelCache,
  onFetchIntel,
  enrichResult,
  onEnrich,
}: {
  match: MatchResult;
  canonicals: Map<string, CanonicalInfo>;
  intelCache: IntelCache;
  onFetchIntel: (domain: string, type: IntelType) => void;
  enrichResult: any;
  onEnrich: () => void;
}) {
  const pairNav = useNavigate();
  const tier = getTier(match);
  const tc = tierConfig[tier];
  const demandCanon = canonicals.get(match.demandKey);
  const supplyCanon = canonicals.get(match.supplyKey);

  const briefRef = useRef<HTMLDivElement>(null);
  const isVetted = match.evalStatus === 'curated';
  const tierColor = isVetted ? '#34d399' : tier === 'strong' ? 'rgba(52,211,153,0.50)' : tier === 'good' ? 'rgba(96,165,250,0.50)' : 'rgba(251,191,36,0.35)';

  // Track which cards have intel expanded
  const [demandIntelOpen, setDemandIntelOpen] = useState(false);
  const [supplyIntelOpen, setSupplyIntelOpen] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);

  const demandDomain = demandCanon?.domain;
  const supplyDomain = supplyCanon?.domain;

  return (
    <div style={{ animation: 'detailFadeIn 0.2s ease-out' }}>

      {/* Status — VETTED is the dominant signal, tier dot is quiet ranking */}
      <div className="flex items-center gap-3 mb-8">
        {match.evalStatus === 'curated' ? (
          <span className="font-mono uppercase tracking-widest" style={{ fontSize: '11px', color: '#34d399', letterSpacing: '0.08em' }}>
            Vetted
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: tierColor }}
            />
            <span className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>
              {tc.label}
            </span>
          </div>
        )}
        {match.evalStatus === 'curated' && match.framing === 'URGENT' && (
          <span className="font-mono" style={{ fontSize: '9px', color: 'rgba(251,191,36,0.50)', letterSpacing: '0.05em' }}>
            URGENT
          </span>
        )}
      </div>

      {/* DEMAND */}
      <div style={{ paddingBottom: '24px', paddingLeft: '14px', borderBottom: '1px solid rgba(255,255,255,0.04)', borderLeft: '2px solid rgba(251,191,36,0.20)' }}>
        <div className="flex items-center justify-between">
          <span
            className="font-mono uppercase tracking-widest"
            style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)' }}
          >
            Needs help
          </span>
          {demandCanon?.industry && (
            <span className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', textTransform: 'capitalize' }}>
              {demandCanon.industry}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <div className="text-white/90 font-medium" style={{ fontSize: '15px', lineHeight: '1.3' }}>
            {demandCanon?.company || match.demandKey}
          </div>
          {demandDomain && (
            <button
              onClick={() => setDemandIntelOpen(!demandIntelOpen)}
              className="font-mono transition-colors flex-shrink-0"
              style={{
                fontSize: '9px',
                padding: '2px 6px',
                borderRadius: '3px',
                background: demandIntelOpen ? 'rgba(255,255,255,0.06)' : 'transparent',
                color: demandIntelOpen ? 'rgba(255,255,255,0.40)' : 'rgba(255,255,255,0.15)',
                border: 'none',
                outline: 'none',
                cursor: 'pointer',
                letterSpacing: '0.03em',
              }}
            >
              Intel
            </button>
          )}
        </div>
        {demandCanon?.wants && (
          <p className="text-white/40 mt-2 leading-relaxed" style={{ fontSize: '13px', textTransform: 'capitalize' }}>
            {demandCanon.wants}
          </p>
        )}
        {demandCanon?.whyNow && (
          <p className="text-white/25 mt-1.5 leading-relaxed" style={{ fontSize: '12px', textTransform: 'capitalize' }}>
            {demandCanon.whyNow}
          </p>
        )}
        {demandIntelOpen && demandDomain && (
          <CompanyIntelPanel
            domain={demandDomain}
            intelCache={intelCache}
            onFetch={onFetchIntel}
          />
        )}
      </div>

      {/* BRIEF */}
      {match.reasoning && (
        <div ref={briefRef} style={{ padding: '20px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div
            className="font-mono uppercase tracking-widest mb-2"
            style={{ fontSize: '9px', color: tierColor }}
          >
            {match.evalStatus === 'curated' ? 'Brief' : 'Signal'}
          </div>
          <p className="text-white/55 leading-relaxed" style={{ fontSize: '13px' }}>
            {match.reasoning}
          </p>
          {match.risks?.length > 0 && (
            <p className="text-white/20 mt-2 leading-relaxed" style={{ fontSize: '11px' }}>
              Risk: {match.risks[0]}
            </p>
          )}
        </div>
      )}

      {/* SUPPLY */}
      <div style={{ paddingTop: '24px', paddingBottom: '24px', paddingLeft: '14px', borderBottom: '1px solid rgba(255,255,255,0.04)', borderLeft: '2px solid rgba(52,211,153,0.20)' }}>
        <div className="flex items-center justify-between">
          <span
            className="font-mono uppercase tracking-widest"
            style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)' }}
          >
            Can deliver
          </span>
          {supplyCanon?.industry && (
            <span className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', textTransform: 'capitalize' }}>
              {supplyCanon.industry}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <div className="text-white/90 font-medium" style={{ fontSize: '15px', lineHeight: '1.3' }}>
            {supplyCanon?.company || match.supplyKey}
          </div>
          {supplyDomain && (
            <button
              onClick={() => setSupplyIntelOpen(!supplyIntelOpen)}
              className="font-mono transition-colors flex-shrink-0"
              style={{
                fontSize: '9px',
                padding: '2px 6px',
                borderRadius: '3px',
                background: supplyIntelOpen ? 'rgba(255,255,255,0.06)' : 'transparent',
                color: supplyIntelOpen ? 'rgba(255,255,255,0.40)' : 'rgba(255,255,255,0.15)',
                border: 'none',
                outline: 'none',
                cursor: 'pointer',
                letterSpacing: '0.03em',
              }}
            >
              Intel
            </button>
          )}
        </div>
        {supplyCanon?.offers && (
          <p className="text-white/40 mt-2 leading-relaxed" style={{ fontSize: '13px', textTransform: 'capitalize' }}>
            {supplyCanon.offers}
          </p>
        )}
        {supplyIntelOpen && supplyDomain && (
          <CompanyIntelPanel
            domain={supplyDomain}
            intelCache={intelCache}
            onFetch={onFetchIntel}
          />
        )}
      </div>

      {/* ACTION — ENRICHMENT */}
      <div style={{ marginTop: '32px' }}>
        {!enrichResult && (
          <button
            onClick={onEnrich}
            className="font-mono text-white/50 hover:text-white/80 transition-colors"
            style={{
              fontSize: '11px',
              padding: '8px 16px',
              background: 'none',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '4px',
              cursor: 'pointer',
              outline: 'none',
              letterSpacing: '0.02em',
            }}
          >
            Find the right person
          </button>
        )}

        {/* Loading orbital */}
        {enrichResult && typeof enrichResult === 'object' && (enrichResult.demand === 'loading' || enrichResult.supply === 'loading') && (
          <div className="flex flex-col items-center py-6" style={{ animation: 'breatheIn 0.4s ease-out' }}>
            <div style={{ position: 'relative', width: '36px', height: '36px', marginBottom: '12px' }}>
              <div style={{ position: 'absolute', inset: 0, border: '1px solid rgba(255,255,255,0.06)', borderRadius: '50%', animation: 'orbitSpin 3s linear infinite' }}>
                <div style={{ position: 'absolute', top: '-2px', left: '50%', marginLeft: '-2px', width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(255,255,255,0.50)', boxShadow: '0 0 8px rgba(255,255,255,0.30)' }} />
              </div>
              <div style={{ position: 'absolute', inset: '8px', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '50%', animation: 'orbitSpin 1.8s linear infinite reverse' }}>
                <div style={{ position: 'absolute', top: '-1.5px', left: '50%', marginLeft: '-1.5px', width: '3px', height: '3px', borderRadius: '50%', background: 'rgba(255,255,255,0.35)', boxShadow: '0 0 6px rgba(255,255,255,0.20)' }} />
              </div>
              <div style={{ position: 'absolute', inset: '14px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)', animation: 'corePulse 2s ease-in-out infinite' }} />
            </div>
            <span className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', animation: 'textBreathe 2.5s ease-in-out infinite' }}>
              Searching contacts
            </span>
            <div style={{ width: '80px', height: '1px', marginTop: '10px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: '20px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.20), transparent)', animation: 'particleDrift 1.6s ease-in-out infinite' }} />
            </div>
          </div>
        )}

        {enrichResult === 'no-keys' && (
          <span className="font-mono text-white/25" style={{ fontSize: '11px' }}>
            Add Apollo or Anymail Finder in{' '}
            <button
              onClick={() => pairNav('/settings')}
              className="text-white/40 hover:text-white/60 underline underline-offset-2 transition-colors"
              style={{ background: 'none', border: 'none', outline: 'none', cursor: 'pointer', fontSize: '11px', padding: 0, fontFamily: 'inherit' }}
            >
              Settings
            </button>
            {' '}to enable contact search.
          </span>
        )}

        {/* Dual enrichment display */}
        {enrichResult && typeof enrichResult === 'object' && 'supply' in enrichResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
            {/* SUPPLY CONTACT */}
            <EnrichmentContactCard
              label="Supply contact"
              side={enrichResult.supply}
              onCopyEmail={email => {
                navigator.clipboard.writeText(email);
                setEmailCopied(true);
                setTimeout(() => setEmailCopied(false), 1500);
              }}
              emailCopied={emailCopied}
            />
            {/* DEMAND CONTACT */}
            <EnrichmentContactCard
              label="Demand contact"
              side={enrichResult.demand}
              onCopyEmail={email => {
                navigator.clipboard.writeText(email);
                setEmailCopied(true);
                setTimeout(() => setEmailCopied(false), 1500);
              }}
              emailCopied={emailCopied}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// FULFILLMENT: CLIENT CONTEXT BAR — persistent stripe below header
// =============================================================================

function ClientContextBar({
  clientName,
  profile,
  contactCount,
  onCompose,
}: {
  clientName: string;
  profile: ClientProfile;
  contactCount: number;
  onCompose: () => void;
}) {
  const [showProfile, setShowProfile] = useState(false);

  const profileFields: Array<{ label: string; value: string }> = [];
  if (profile.companyDescription) profileFields.push({ label: 'What they do', value: profile.companyDescription });
  if (profile.specialization) profileFields.push({ label: 'Specialization', value: profile.specialization });
  if (profile.differentiators?.length) profileFields.push({ label: 'Differentiators', value: profile.differentiators.join(' · ') });
  if (profile.painPoints?.length) profileFields.push({ label: 'Problems they solve', value: profile.painPoints.join(' · ') });
  if (profile.desiredOutcomes?.length) profileFields.push({ label: 'Outcomes', value: profile.desiredOutcomes.join(' · ') });
  if (profile.caseStudy) profileFields.push({ label: 'Proof', value: profile.caseStudy });
  if (profile.icpDescription) profileFields.push({ label: 'Ideal client', value: profile.icpDescription });
  if (profile.icpTitles?.length) profileFields.push({ label: 'Titles', value: profile.icpTitles.join(', ') });
  if (profile.icpIndustries?.length) profileFields.push({ label: 'Industries', value: profile.icpIndustries.join(', ') });
  if (profile.icpCompanySize) profileFields.push({ label: 'Company size', value: profile.icpCompanySize });
  if (profile.icpGeography) profileFields.push({ label: 'Geography', value: profile.icpGeography });
  if (profile.messagingTone) profileFields.push({ label: 'Tone', value: profile.messagingTone });
  if (profile.prospectingQuestions?.length) profileFields.push({ label: 'Prospecting angles', value: profile.prospectingQuestions.join(' · ') });
  if (profile.fullBrief) profileFields.push({ label: 'Brief', value: profile.fullBrief });

  return (
    <>
      <div
        className="flex-shrink-0 px-5"
        style={{
          background: 'rgba(255,255,255,0.015)',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{ height: '36px' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span style={{ color: 'rgba(52,211,153,0.40)', fontSize: '8px', lineHeight: 1 }}>◆</span>
            <button
              onClick={() => setShowProfile(true)}
              className="font-mono truncate transition-colors hover:text-white/80"
              style={{ fontSize: '13px', color: 'rgba(255,255,255,0.60)', background: 'none', border: 'none', outline: 'none', cursor: 'pointer', padding: 0 }}
            >
              {clientName}
            </button>
            {profile.specialization && (
              <span className="font-mono truncate" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}>
                {profile.specialization}
              </span>
            )}
            <span className="font-mono flex-shrink-0" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.15)' }}>
              {contactCount} contacts
            </span>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={() => setShowProfile(true)}
              className="font-mono text-white/20 hover:text-white/40 transition-colors"
              style={{ fontSize: '10px', background: 'none', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '4px', outline: 'none', cursor: 'pointer', padding: '2px 8px' }}
            >
              Profile
            </button>
            <button
              onClick={onCompose}
              className="font-mono transition-colors"
              style={{
                fontSize: '10px',
                padding: '3px 10px',
                borderRadius: '4px',
                background: 'rgba(52,211,153,0.08)',
                color: 'rgba(52,211,153,0.70)',
                border: '1px solid rgba(52,211,153,0.15)',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              Compose
            </button>
          </div>
        </div>
      </div>

      {/* Frosted glass profile modal */}
      {showProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'overlayFadeIn 0.2s ease-out' }} onClick={() => setShowProfile(false)}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }} />
          <div className="relative flex flex-col" style={{ width: '100%', maxWidth: '520px', maxHeight: '85vh', margin: '0 24px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', overflow: 'hidden', animation: 'cardFloat 0.3s ease-out' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div className="flex items-center gap-2">
                <span style={{ color: 'rgba(52,211,153,0.40)', fontSize: '8px', lineHeight: 1 }}>◆</span>
                <span className="font-mono" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.60)' }}>
                  {clientName}
                </span>
              </div>
              <button onClick={() => setShowProfile(false)} className="font-mono" style={{ fontSize: '14px', color: 'rgba(255,255,255,0.20)', background: 'none', border: 'none', cursor: 'pointer', outline: 'none', padding: '0 4px' }}>x</button>
            </div>
            <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none', padding: '16px 24px 24px' }}>
              {profileFields.map((f, i) => (
                <div key={i} style={{ marginBottom: i < profileFields.length - 1 ? '14px' : 0 }}>
                  <p className="font-mono" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }}>{f.label}</p>
                  <p className="font-mono" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.65)', lineHeight: '1.6' }}>{f.value}</p>
                </div>
              ))}
              {profileFields.length === 0 && (
                <p className="font-mono" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.20)' }}>No profile data configured.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// =============================================================================
// FULFILLMENT: CONTACT DETAIL — demand-only detail pane (no supply card)
// =============================================================================

function ContactDetail({
  contact,
  canonicals,
  intelCache,
  onFetchIntel,
  enrichResult,
  onEnrich,
}: {
  contact: DemandContact;
  canonicals: Map<string, CanonicalInfo>;
  intelCache: IntelCache;
  onFetchIntel: (domain: string, type: IntelType) => void;
  enrichResult: any;
  onEnrich: () => void;
}) {
  const detailNav = useNavigate();
  const match = contact.bestMatch;
  const tier = getTier(match);
  const tc = tierConfig[tier];
  const demandCanon = canonicals.get(contact.demandKey);
  const isVetted = match.evalStatus === 'curated';
  const tierColor = isVetted ? '#34d399' : tier === 'strong' ? 'rgba(52,211,153,0.50)' : tier === 'good' ? 'rgba(96,165,250,0.50)' : 'rgba(251,191,36,0.35)';

  const [demandIntelOpen, setDemandIntelOpen] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [matchAnglesOpen, setMatchAnglesOpen] = useState(false);

  const demandDomain = demandCanon?.domain;

  return (
    <div style={{ animation: 'detailFadeIn 0.2s ease-out' }}>

      {/* Status */}
      <div className="flex items-center gap-3 mb-8">
        {isVetted ? (
          <span className="font-mono uppercase tracking-widest" style={{ fontSize: '11px', color: '#34d399', letterSpacing: '0.08em' }}>
            Vetted
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: tierColor }} />
            <span className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>
              {tc.label}
            </span>
          </div>
        )}
      </div>

      {/* DEMAND CONTACT — the target */}
      <div style={{ paddingBottom: '24px', paddingLeft: '14px', borderBottom: '1px solid rgba(255,255,255,0.04)', borderLeft: '2px solid rgba(251,191,36,0.20)' }}>
        <div className="flex items-center justify-between">
          <div className="text-white/90 font-medium" style={{ fontSize: '15px', lineHeight: '1.3' }}>
            {demandCanon?.company || match.demandKey}
          </div>
          {demandCanon?.industry && (
            <span className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', textTransform: 'capitalize' }}>
              {demandCanon.industry}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          {demandDomain && (
            <button
              onClick={() => setDemandIntelOpen(!demandIntelOpen)}
              className="font-mono transition-colors flex-shrink-0"
              style={{
                fontSize: '9px',
                padding: '2px 6px',
                borderRadius: '3px',
                background: demandIntelOpen ? 'rgba(255,255,255,0.06)' : 'transparent',
                color: demandIntelOpen ? 'rgba(255,255,255,0.40)' : 'rgba(255,255,255,0.15)',
                border: 'none',
                outline: 'none',
                cursor: 'pointer',
                letterSpacing: '0.03em',
              }}
            >
              Intel
            </button>
          )}
        </div>
        {demandCanon?.wants && (
          <p className="text-white/40 mt-2 leading-relaxed" style={{ fontSize: '13px', textTransform: 'capitalize' }}>
            {demandCanon.wants}
          </p>
        )}
        {demandCanon?.whyNow && (
          <p className="text-white/25 mt-1.5 leading-relaxed" style={{ fontSize: '12px', textTransform: 'capitalize' }}>
            {demandCanon.whyNow}
          </p>
        )}
        {demandIntelOpen && demandDomain && (
          <CompanyIntelPanel domain={demandDomain} intelCache={intelCache} onFetch={onFetchIntel} />
        )}
      </div>

      {/* WHY RELEVANT — reasoning reframed for fulfillment */}
      {match.reasoning && (
        <div style={{ padding: '20px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div
            className="font-mono uppercase tracking-widest mb-2"
            style={{ fontSize: '9px', color: tierColor }}
          >
            Why Relevant
          </div>
          <p className="text-white/55 leading-relaxed" style={{ fontSize: '13px' }}>
            {match.reasoning}
          </p>
          {match.risks?.length > 0 && (
            <p className="text-white/20 mt-2 leading-relaxed" style={{ fontSize: '11px' }}>
              Risk: {match.risks[0]}
            </p>
          )}
        </div>
      )}

      {/* MATCH ANGLES — collapsible, only shown when multiple matches */}
      {contact.allMatches.length > 1 && (
        <div style={{ padding: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <button
            onClick={() => setMatchAnglesOpen(!matchAnglesOpen)}
            className="font-mono text-white/25 hover:text-white/40 transition-colors"
            style={{ fontSize: '10px', background: 'none', border: 'none', outline: 'none', cursor: 'pointer', padding: 0 }}
          >
            {contact.allMatches.length} match angles {matchAnglesOpen ? '▾' : '▸'}
          </button>
          {matchAnglesOpen && (
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {contact.allMatches
                .sort((a, b) => b.scores.combined - a.scores.combined)
                .map(m => (
                  <div key={m.evalId} className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', paddingLeft: '8px' }}>
                    {m.scores.combined.toFixed(2)} · {m.framing || m.reasoning?.slice(0, 60) || '—'}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ENRICHMENT — demand-only (no supply card) */}
      <div style={{ marginTop: '32px' }}>
        {!enrichResult && (
          <button
            onClick={onEnrich}
            className="font-mono text-white/50 hover:text-white/80 transition-colors"
            style={{
              fontSize: '11px',
              padding: '8px 16px',
              background: 'none',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '4px',
              cursor: 'pointer',
              outline: 'none',
              letterSpacing: '0.02em',
            }}
          >
            Find Contact
          </button>
        )}

        {/* Loading orbital */}
        {enrichResult && typeof enrichResult === 'object' && enrichResult.demand === 'loading' && (
          <div className="flex flex-col items-center py-6" style={{ animation: 'breatheIn 0.4s ease-out' }}>
            <div style={{ position: 'relative', width: '36px', height: '36px', marginBottom: '12px' }}>
              <div style={{ position: 'absolute', inset: 0, border: '1px solid rgba(255,255,255,0.06)', borderRadius: '50%', animation: 'orbitSpin 3s linear infinite' }}>
                <div style={{ position: 'absolute', top: '-2px', left: '50%', marginLeft: '-2px', width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(255,255,255,0.50)', boxShadow: '0 0 8px rgba(255,255,255,0.30)' }} />
              </div>
              <div style={{ position: 'absolute', inset: '8px', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '50%', animation: 'orbitSpin 1.8s linear infinite reverse' }}>
                <div style={{ position: 'absolute', top: '-1.5px', left: '50%', marginLeft: '-1.5px', width: '3px', height: '3px', borderRadius: '50%', background: 'rgba(255,255,255,0.35)', boxShadow: '0 0 6px rgba(255,255,255,0.20)' }} />
              </div>
              <div style={{ position: 'absolute', inset: '14px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)', animation: 'corePulse 2s ease-in-out infinite' }} />
            </div>
            <span className="font-mono" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', animation: 'textBreathe 2.5s ease-in-out infinite' }}>
              Searching contact
            </span>
            <div style={{ width: '80px', height: '1px', marginTop: '10px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: '20px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.20), transparent)', animation: 'particleDrift 1.6s ease-in-out infinite' }} />
            </div>
          </div>
        )}

        {enrichResult === 'no-keys' && (
          <span className="font-mono text-white/25" style={{ fontSize: '11px' }}>
            Add Apollo or Anymail Finder in{' '}
            <button
              onClick={() => detailNav('/settings')}
              className="text-white/40 hover:text-white/60 underline underline-offset-2 transition-colors"
              style={{ background: 'none', border: 'none', outline: 'none', cursor: 'pointer', fontSize: '11px', padding: 0, fontFamily: 'inherit' }}
            >
              Settings
            </button>
            {' '}to enable contact search.
          </span>
        )}

        {/* Single contact card — demand only */}
        {enrichResult && typeof enrichResult === 'object' && 'demand' in enrichResult && (
          <div style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
            <EnrichmentContactCard
              label="Contact"
              side={enrichResult.demand}
              onCopyEmail={email => {
                navigator.clipboard.writeText(email);
                setEmailCopied(true);
                setTimeout(() => setEmailCopied(false), 1500);
              }}
              emailCopied={emailCopied}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// EMPTY DETAIL
// =============================================================================

function EmptyDetail({ matchCount, lensEmpty, isFulfillment }: { matchCount: number; lensEmpty?: boolean; isFulfillment?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full" style={{ minHeight: '400px' }}>
      <p className="font-mono text-white/15" style={{ fontSize: '12px' }}>
        {matchCount > 0
          ? (isFulfillment ? 'Select a contact to see relevance' : 'Select a pair to see the connection')
          : lensEmpty
            ? ''
            : 'Matches will appear here as they arrive'}
      </p>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

function enrichStorageKey(jobId: string): string {
  return `enrichResults_${jobId}`;
}

export default function RunDetailPageV2() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const prefetched = (location.state as any)?.job;
  const job = useMCPJob();
  const resumedRef = useRef(false);

  const [selectedEvalId, setSelectedEvalId] = useState<string | null>(null);
  const [filterTier, setFilterTier] = useState<'all' | 'strong' | 'good' | 'weak'>('all');
  const [lensDropdownOpen, setLensDropdownOpen] = useState(false);
  const [intelCache, setIntelCache] = useState<IntelCache>(new Map());
  const [lensTransitionKey, setLensTransitionKey] = useState(0);

  // ── Lens state — hydrate from localStorage, re-read on tab focus ──
  const [lensClientId, setLensClientId] = useState<string | null>(
    () => localStorage.getItem('station_active_lens_client_id')
  );

  useEffect(() => {
    const handleFocus = () => {
      setLensClientId(localStorage.getItem('station_active_lens_client_id'));
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') handleFocus();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // ── Available clients for lens selector ──
  const lensClients = useMemo(() => {
    try {
      const raw = localStorage.getItem('station_fulfillment_clients');
      if (!raw) return [];
      const clients: FulfillmentClient[] = JSON.parse(raw);
      return clients.filter(c => c.status === 'active');
    } catch { return []; }
  }, [lensClientId]); // re-read when lens changes

  const handleLensChange = useCallback((id: string | null) => {
    setLensClientId(id);
    setSelectedEvalId(null);
    setLensTransitionKey(k => k + 1);  // trigger re-mount animation
    if (id) {
      localStorage.setItem('station_active_lens_client_id', id);
    } else {
      localStorage.removeItem('station_active_lens_client_id');
    }
  }, []);

  const { overlay, profile, clientName, clientEconomicSide, clientCanonicalKey } = useMemo(() => {
    if (!lensClientId) return { overlay: null, profile: null, clientName: null, clientEconomicSide: undefined as 'demand' | 'supply' | undefined, clientCanonicalKey: undefined as string | undefined };
    try {
      const clients: FulfillmentClient[] = JSON.parse(localStorage.getItem('station_fulfillment_clients') || '[]');
      const overlays: ClientOverlay[] = JSON.parse(localStorage.getItem('station_client_overlays') || '[]');
      const client = clients.find(c => c.id === lensClientId);
      const versions = overlays.filter(o => o.clientId === lensClientId).sort((a, b) => b.version - a.version);
      const active = versions.find(o => o.isActive) ?? versions[0];
      const ecoSide = client?.economicSide === 'demand' || client?.economicSide === 'supply'
        ? client.economicSide
        : undefined;

      // Backfill: clients created before canonicalKey was added get it stamped now
      let resolvedKey = client?.canonicalKey;
      if (client && !resolvedKey) {
        resolvedKey = `fc_${client.id.replace(/-/g, '').slice(0, 8)}`;
        const idx = clients.findIndex(c => c.id === client.id);
        if (idx >= 0) { clients[idx] = { ...clients[idx], canonicalKey: resolvedKey }; }
        localStorage.setItem('station_fulfillment_clients', JSON.stringify(clients));
      }

      return {
        overlay: active?.overlay ?? null,
        profile: client?.profile ?? null,
        clientName: client?.name ?? null,
        clientEconomicSide: ecoSide,
        clientCanonicalKey: resolvedKey,
      };
    } catch {
      return { overlay: null, profile: null, clientName: null, clientEconomicSide: undefined as 'demand' | 'supply' | undefined, clientCanonicalKey: undefined as string | undefined };
    }
  }, [lensClientId]);
  const intelCacheRef = useRef<IntelCache>(intelCache);
  intelCacheRef.current = intelCache;

  // Enrichment API keys — DB first (auth), localStorage fallback (guest)
  const [enrichKeys, setEnrichKeys] = useState<{ apollo: string; anymail: string } | null>(null);
  const enrichKeysLoaded = useRef(false);

  useEffect(() => {
    if (enrichKeysLoaded.current) return;
    enrichKeysLoaded.current = true;

    (async () => {
      // AUTH: load from DB (source of truth)
      if (user?.id) {
        try {
          const { data } = await supabase
            .from('operator_settings')
            .select('enrichment_api_key, anymail_finder_api_key')
            .eq('user_id', user.id)
            .maybeSingle();
          if (data && (data.enrichment_api_key || data.anymail_finder_api_key)) {
            console.log('[Enrich] Keys loaded from DB:', { apollo: !!data.enrichment_api_key, anymail: !!data.anymail_finder_api_key });
            setEnrichKeys({ apollo: data.enrichment_api_key || '', anymail: data.anymail_finder_api_key || '' });
            return;
          }
        } catch (err) {
          console.warn('[Enrich] DB load failed, trying localStorage:', err);
        }
      }

      // GUEST: fallback to localStorage
      const pk = localStorage.getItem('platform_keys');
      if (pk) {
        try {
          const parsed = JSON.parse(pk);
          if (parsed.apolloApiKey || parsed.anymailApiKey) {
            setEnrichKeys({ apollo: parsed.apolloApiKey || '', anymail: parsed.anymailApiKey || '' });
            return;
          }
        } catch {}
      }
      const gs = localStorage.getItem('guest_settings');
      if (gs) {
        try {
          const { settings } = JSON.parse(gs);
          if (settings?.apolloApiKey || settings?.anymailApiKey) {
            setEnrichKeys({ apollo: settings.apolloApiKey || '', anymail: settings.anymailApiKey || '' });
            return;
          }
        } catch {}
      }
    })();
  }, [user?.id]);

  // Enrichment results: evalId → result object | 'loading' | 'no-keys'
  const [enrichResults, setEnrichResults] = useState<Map<string, any>>(new Map());
  const enrichResultsRef = useRef(enrichResults);
  enrichResultsRef.current = enrichResults;

  // Cache-hit toasts — dopamine reward when enrichment is free
  const [cacheToasts, setCacheToasts] = useState<Array<{ id: number; email: string }>>([]);
  const toastIdRef = useRef(0);

  const playCoinSound = useCallback(() => {
    try {
      const ctx = new AudioContext();
      // Note 1: B5 (988 Hz) — short ping
      const o1 = ctx.createOscillator();
      const g1 = ctx.createGain();
      o1.type = 'sine';
      o1.frequency.value = 988;
      g1.gain.setValueAtTime(0.15, ctx.currentTime);
      g1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      o1.connect(g1).connect(ctx.destination);
      o1.start(ctx.currentTime);
      o1.stop(ctx.currentTime + 0.12);
      // Note 2: E6 (1319 Hz) — higher follow-up
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.type = 'sine';
      o2.frequency.value = 1319;
      g2.gain.setValueAtTime(0.12, ctx.currentTime + 0.08);
      g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      o2.connect(g2).connect(ctx.destination);
      o2.start(ctx.currentTime + 0.08);
      o2.stop(ctx.currentTime + 0.25);
      setTimeout(() => ctx.close(), 500);
    } catch {}
  }, []);

  const showCacheToast = useCallback((email: string) => {
    const id = ++toastIdRef.current;
    setCacheToasts(prev => [...prev, { id, email }]);
    setTimeout(() => setCacheToasts(prev => prev.filter(t => t.id !== id)), 2800);
    playCoinSound();
  }, [playCoinSound]);

  // Restore enrichment results from localStorage on mount
  useEffect(() => {
    if (!jobId) return;
    try {
      const stored = localStorage.getItem(enrichStorageKey(jobId));
      if (stored) {
        const entries: Array<[string, any]> = JSON.parse(stored);
        if (entries.length > 0) {
          console.log(`[Enrich] Restored ${entries.length} cached results for job ${jobId}`);
          setEnrichResults(new Map(entries));
        }
      }
    } catch {}
  }, [jobId]);

  // Persist enrichment results to localStorage on change
  useEffect(() => {
    if (!jobId || enrichResults.size === 0) return;
    const persistable = [...enrichResults.entries()].filter(
      ([_, v]) => v !== 'loading' && v !== 'no-keys'
    );
    if (persistable.length === 0) return;
    try {
      localStorage.setItem(enrichStorageKey(jobId), JSON.stringify(persistable));
    } catch {}
  }, [enrichResults, jobId]);

  // Fetch intel for a domain + type, cache result (stable identity via ref)
  const handleFetchIntel = useCallback(async (domain: string, type: IntelType) => {
    if (intelCacheRef.current.get(domain)?.has(type)) return;

    const result = await fetchCompanyIntel(domain, type);
    setIntelCache(prev => {
      const next = new Map(prev);
      const domainMap = new Map(next.get(domain) || []);
      domainMap.set(type, result);
      next.set(domain, domainMap);
      return next;
    });
  }, []);

  const handleEnrich = useCallback(async (evalId: string, supplyCanon: CanonicalInfo | undefined, demandCanon: CanonicalInfo | undefined) => {
    if (!enrichKeys?.apollo && !enrichKeys?.anymail) {
      setEnrichResults(prev => new Map(prev).set(evalId, 'no-keys'));
      return;
    }
    if (enrichResultsRef.current.has(evalId)) return;

    setEnrichResults(prev => new Map(prev).set(evalId, { supply: 'loading', demand: 'loading' }));

    const supplyRecord = {
      domain: supplyCanon?.domain,
      company: supplyCanon?.company,
      person_name: isLikelyPersonName(supplyCanon?.who || '') ? supplyCanon?.who : undefined,
    };
    const demandRecord = {
      domain: demandCanon?.domain,
      company: demandCanon?.company,
      person_name: isLikelyPersonName(demandCanon?.who || '') ? demandCanon?.who : undefined,
    };
    const config = {
      apolloApiKey: enrichKeys.apollo || undefined,
      anymailApiKey: enrichKeys.anymail || undefined,
      supabaseFunctionsUrl: ((import.meta as any).env.VITE_SUPABASE_URL || '').trim() + '/functions/v1',
      timeoutMs: 15000,
    };
    console.log('[Enrich] supply inputs:', JSON.stringify(supplyRecord));
    console.log('[Enrich] demand inputs:', JSON.stringify(demandRecord));
    console.log('[Enrich] config keys:', { apollo: Boolean(config.apolloApiKey), anymail: Boolean(config.anymailApiKey), url: config.supabaseFunctionsUrl });

    try {
      const [supplyRes, demandRes] = await Promise.allSettled([
        routeEnrichment(supplyRecord, config),
        routeEnrichment(demandRecord, config),
      ]);
      const supply = supplyRes.status === 'fulfilled' ? supplyRes.value : { outcome: 'ERROR' as const };
      const demand = demandRes.status === 'fulfilled' ? demandRes.value : { outcome: 'ERROR' as const };
      console.log('[Enrich] supply result:', supply.outcome, (supply as any).email, (supply as any).source);
      console.log('[Enrich] demand result:', demand.outcome, (demand as any).email, (demand as any).source);
      setEnrichResults(prev => new Map(prev).set(evalId, { supply, demand }));
      // Cache-hit reward — no API credit consumed
      if ((supply as any).source === 'existing' && (supply as any).email) {
        showCacheToast((supply as any).email);
      }
      if ((demand as any).source === 'existing' && (demand as any).email) {
        showCacheToast((demand as any).email);
      }
    } catch (err) {
      console.error('[Enrich] thrown:', err);
      setEnrichResults(prev => new Map(prev).set(evalId, { supply: { outcome: 'ERROR' }, demand: { outcome: 'ERROR' } }));
    }
  }, [enrichKeys]);

  // Resume job on mount AND when jobId changes (navigating between runs)
  useEffect(() => {
    if (jobId) {
      resumedRef.current = true;
      setSelectedEvalId(null);
      setFilterTier('all');
      job.resume(jobId);
    }
  }, [jobId]);

  // Auto-select first curated match when available
  useEffect(() => {
    if (!selectedEvalId && job.matches.length > 0) {
      const curated = job.matches.find(m => m.evalStatus === 'curated' && !m.vetoed);
      const first = curated || job.matches.find(m => !m.vetoed);
      if (first) setSelectedEvalId(first.evalId);
    }
  }, [job.matches, selectedEvalId]);

  const shortId = jobId ? jobId.slice(-6) : '...';
  const isRunning = job.phase !== 'complete' && job.phase !== 'failed' && job.phase !== 'idle';
  const isComplete = job.phase === 'complete';

  // Overlay re-rank results (null when no lens active)
  const overlayResults = useMemo(() => {
    if (!overlay) return null;
    return applyOverlayV2(
      job.matches.filter(m => !m.vetoed),
      job.canonicals, overlay, profile ?? undefined, clientEconomicSide, clientCanonicalKey,
    );
  }, [job.matches, job.canonicals, overlay, profile, clientEconomicSide, clientCanonicalKey]);

  // Sort: overlay re-rank if active, else curated first + combined score desc
  const sortedMatches = useMemo(() => {
    if (overlayResults) {
      let filtered = overlayResults.filter(r => !r.excluded).map(r => r.match);
      if (filterTier !== 'all') filtered = filtered.filter(m => getTier(m) === filterTier);
      return filtered;
    }
    return [...job.matches]
      .filter(m => !m.vetoed)
      .filter(m => {
        if (filterTier === 'all') return true;
        return getTier(m) === filterTier;
      })
      .sort((a, b) => {
        if (a.evalStatus === 'curated' && b.evalStatus !== 'curated') return -1;
        if (b.evalStatus === 'curated' && a.evalStatus !== 'curated') return 1;
        return b.scores.combined - a.scores.combined;
      });
  }, [job.matches, overlayResults, filterTier]);

  const selectedMatch = sortedMatches.find(m => m.evalId === selectedEvalId) || null;

  // When lens is active, counts reflect the overlay-filtered set. Otherwise raw.
  const effectiveMatches = overlayResults
    ? overlayResults.filter(r => !r.excluded).map(r => r.match)
    : job.matches.filter(m => !m.vetoed);
  const tiers = countTiers(effectiveMatches);

  // Status pill
  const statusLabel = job.phase === 'complete' ? 'Done'
    : job.phase === 'failed' ? 'Failed'
    : job.phase === 'idle' ? 'Loading'
    : 'Live';
  const statusColor = job.phase === 'complete' ? 'rgba(52,211,153,0.80)'
    : job.phase === 'failed' ? 'rgba(248,113,113,0.80)'
    : 'rgba(251,191,36,0.80)';

  // ── FULFILLMENT MODE ──
  const isFulfillment = clientEconomicSide === 'supply' && !!profile;

  // Demand-only enrichment handler (skips supply API call entirely)
  const handleEnrichDemandOnly = useCallback(async (evalId: string, demandCanon: CanonicalInfo | undefined) => {
    if (!enrichKeys?.apollo && !enrichKeys?.anymail) {
      setEnrichResults(prev => new Map(prev).set(evalId, 'no-keys'));
      return;
    }
    if (enrichResultsRef.current.has(evalId)) return;

    setEnrichResults(prev => new Map(prev).set(evalId, { demand: 'loading' }));

    const demandRecord = {
      domain: demandCanon?.domain,
      company: demandCanon?.company,
      person_name: isLikelyPersonName(demandCanon?.who || '') ? demandCanon?.who : undefined,
    };
    const config = {
      apolloApiKey: enrichKeys.apollo || undefined,
      anymailApiKey: enrichKeys.anymail || undefined,
      supabaseFunctionsUrl: ((import.meta as any).env.VITE_SUPABASE_URL || '').trim() + '/functions/v1',
      timeoutMs: 15000,
    };

    try {
      const demand = await routeEnrichment(demandRecord, config);
      setEnrichResults(prev => new Map(prev).set(evalId, { demand }));
      if ((demand as any).source === 'existing' && (demand as any).email) {
        showCacheToast((demand as any).email);
      }
    } catch {
      setEnrichResults(prev => new Map(prev).set(evalId, { demand: { outcome: 'ERROR' } }));
    }
  }, [enrichKeys, showCacheToast]);

  // Fulfillment: flat contact list deduped by demandKey
  const demandContacts = useMemo(() => {
    if (!isFulfillment) return [];
    return groupByDemandFlat(sortedMatches, job.canonicals, enrichResults);
  }, [isFulfillment, sortedMatches, job.canonicals, enrichResults]);

  // Fulfillment: selected contact resolved from selectedEvalId
  const selectedContact = useMemo(() => {
    if (!isFulfillment || !selectedEvalId) return null;
    return demandContacts.find(c => c.bestMatch.evalId === selectedEvalId) || null;
  }, [isFulfillment, selectedEvalId, demandContacts]);

  // Fulfillment: unique contact count for stats
  const uniqueContactCount = useMemo(() => {
    if (!isFulfillment) return 0;
    const allContacts = groupByDemandFlat(effectiveMatches, job.canonicals, enrichResults);
    return allContacts.length;
  }, [isFulfillment, effectiveMatches, job.canonicals, enrichResults]);

  // Fulfillment: tier counts deduped by demand contact (uses best score per contact)
  const contactTiers = useMemo(() => {
    if (!isFulfillment) return tiers;
    const allContacts = groupByDemandFlat(effectiveMatches, job.canonicals, enrichResults);
    const counts: Record<Tier, number> = { strong: 0, good: 0, weak: 0, none: 0, conflict: 0 };
    for (const c of allContacts) counts[getTier(c.bestMatch)]++;
    return counts;
  }, [isFulfillment, effectiveMatches, job.canonicals, enrichResults, tiers]);

  // Enrichment gate — check if keys are configured before allowing send
  const [showEnrichGate, setShowEnrichGate] = useState(false);
  const hasEnrichKeys = !!(enrichKeys?.apollo || enrichKeys?.anymail);

  // Navigate to compose with enrichResults
  const handleNavigateCompose = useCallback(() => {
    if (!hasEnrichKeys) {
      setShowEnrichGate(true);
      return;
    }
    const enrichObj: Record<string, unknown> = {};
    enrichResults.forEach((val, key) => { enrichObj[key] = val; });
    navigate(`/station/run/${jobId}/send`, { state: { enrichResults: enrichObj } });
  }, [enrichResults, navigate, jobId, hasEnrichKeys]);

  return (
    <div className="flex flex-col h-screen bg-[#09090b]" style={{ animation: 'pageIn 0.25s ease-out' }}>

      {/* ── HEADER: one quiet line ── */}
      <div
        className="flex items-center justify-between px-5 flex-shrink-0"
        style={{ height: '48px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        {/* Left: back + run ID + status */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/station/runs')}
            className="font-mono text-white/25 hover:text-white/50 transition-colors"
            style={{ background: 'none', border: 'none', outline: 'none', cursor: 'pointer', fontSize: '12px', padding: 0 }}
          >
            ← Runs
          </button>
          <span className="font-mono text-white/40" style={{ fontSize: '12px' }}>
            #{shortId}
          </span>
          <span
            className="font-mono"
            style={{ fontSize: '10px', color: statusColor }}
          >
            {statusLabel}
          </span>
          {isRunning && (
            <span className="font-mono text-white/20" style={{ fontSize: '10px' }}>
              {job.progress.completedPairs}/{job.progress.totalPairs} pairs
            </span>
          )}
          {/* Lens selector — custom dropdown (matches Station pattern) */}
          {lensClients.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-white/30 shrink-0">Lens:</span>
              <div className="relative">
                <button
                  onClick={() => setLensDropdownOpen(v => !v)}
                  className="font-mono text-[11px] text-left bg-white/[0.03] border border-white/[0.06] rounded hover:border-white/[0.12] transition-colors flex items-center justify-between px-3"
                  style={{ height: '28px', minWidth: '120px', outline: 'none', boxShadow: 'none' }}
                >
                  <span className={lensClientId ? 'text-white/70' : 'text-white/20'}>
                    {lensClientId
                      ? lensClients.find(c => c.id === lensClientId)?.name ?? 'All Signals'
                      : 'All Signals'}
                  </span>
                  <span className="text-white/20 ml-2">▾</span>
                </button>
                {lensDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setLensDropdownOpen(false)} />
                    <div className="absolute top-full left-0 right-0 mt-0.5 bg-[#09090b] border border-white/[0.06] rounded z-50 max-h-48 overflow-y-auto" style={{ scrollbarWidth: 'none', minWidth: '120px', animation: 'lensDropIn 150ms ease-out' }}>
                      <button
                        onClick={() => { handleLensChange(null); setLensDropdownOpen(false); }}
                        className={`w-full text-left px-2.5 py-1.5 font-mono text-[11px] transition-colors ${!lensClientId ? 'text-white/90 bg-white/[0.06]' : 'text-white/50 hover:text-white/80 hover:bg-white/[0.02]'}`}
                        style={{ border: 'none', outline: 'none', cursor: 'pointer' }}
                      >
                        All Signals
                      </button>
                      {lensClients.map(c => (
                        <button
                          key={c.id}
                          onClick={() => { handleLensChange(c.id); setLensDropdownOpen(false); }}
                          className={`w-full text-left px-2.5 py-1.5 font-mono text-[11px] transition-colors ${lensClientId === c.id ? 'text-white/90 bg-white/[0.06]' : 'text-white/50 hover:text-white/80 hover:bg-white/[0.02]'}`}
                          style={{ border: 'none', outline: 'none', cursor: 'pointer' }}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: stats summary */}
        <div className="flex items-center gap-3 font-mono" style={{ fontSize: '10px' }}>
          {job.matches.length > 0 && (
            <span className="text-white/20">
              {isFulfillment
                ? `${uniqueContactCount} contacts`
                : clientName && overlayResults
                  ? `${effectiveMatches.length} of ${job.matches.filter(m => !m.vetoed).length} for ${clientName}`
                  : `${effectiveMatches.length} pairs`
              }
            </span>
          )}
          {isComplete && job.elapsedMs > 0 && (
            <span className="text-white/15">{formatDuration(job.elapsedMs)}</span>
          )}
          {/* Send Intros button — hidden in fulfillment (moved to client context bar) */}
          {!isFulfillment && isComplete && effectiveMatches.length > 0 && (
            <button
              onClick={handleNavigateCompose}
              className="font-mono transition-colors"
              style={{
                fontSize: '10px',
                padding: '3px 10px',
                borderRadius: '4px',
                background: 'rgba(52,211,153,0.08)',
                color: 'rgba(52,211,153,0.70)',
                border: '1px solid rgba(52,211,153,0.15)',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              Send Intros
            </button>
          )}
          <button
            onClick={() => navigate('/settings')}
            className="font-mono text-white/20 hover:text-white/40 underline underline-offset-2 transition-colors"
            style={{ background: 'none', border: 'none', outline: 'none', cursor: 'pointer', fontSize: '10px', padding: 0 }}
          >
            Settings
          </button>
        </div>
      </div>

      {/* ── ENRICHMENT GATE ── */}
      {showEnrichGate && (
        <div className="px-5 py-3 border-b border-white/[0.06]">
          <EnrichmentGate
            apolloConnected={!!enrichKeys?.apollo}
            emailFinderConnected={!!enrichKeys?.anymail}
            onOpenSettings={() => navigate('/settings')}
            onDismiss={() => setShowEnrichGate(false)}
          />
        </div>
      )}

      {/* ── EXECUTION TIER ── */}
      <div className="flex items-center justify-end px-5 py-1 border-b border-white/[0.04] bg-white/[0.01]">
        <ExecutionBadge mode="global" />
      </div>

      {/* ── FULFILLMENT: CLIENT CONTEXT BAR ── */}
      {isFulfillment && clientName && profile && (
        <ClientContextBar
          clientName={clientName}
          profile={profile}
          contactCount={uniqueContactCount}
          onCompose={handleNavigateCompose}
        />
      )}

      {/* ── LIVE PROGRESS BAR (only while running) ── */}
      {isRunning && (
        <div className="flex-shrink-0" style={{ height: '2px', background: 'rgba(255,255,255,0.04)' }}>
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${job.progress.percentage}%`,
              background: 'rgba(251,191,36,0.40)',
            }}
          />
        </div>
      )}

      {/* ── TWO-PANEL WORKSPACE ── */}
      <div className="flex flex-1 min-h-0">

        {/* LEFT PANEL: Pair list */}
        <div
          className="flex flex-col flex-shrink-0"
          style={{
            width: '320px',
            borderRight: '1px solid rgba(255,255,255,0.04)',
          }}
        >
          {/* Filter chips */}
          <div
            className="flex items-center gap-1 px-4 flex-shrink-0"
            style={{ height: '40px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}
          >
            {(['all', 'strong', 'good', 'weak'] as const).map(f => {
              const count = f === 'all'
                ? (isFulfillment ? uniqueContactCount : effectiveMatches.length)
                : contactTiers[f];
              // Hide empty non-all tabs to keep UI clean
              if (f !== 'all' && count === 0) return null;
              const compact = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : String(n);
              const label = f === 'all' ? 'All'
                : f === 'good' ? 'Actionable'
                : f.charAt(0).toUpperCase() + f.slice(1);
              return (
                <button
                  key={f}
                  onClick={() => { setFilterTier(f); setSelectedEvalId(null); }}
                  className="font-mono transition-colors"
                  style={{
                    fontSize: '10px',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: filterTier === f ? 'rgba(255,255,255,0.06)' : 'transparent',
                    color: filterTier === f ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.25)',
                    border: 'none',
                    outline: 'none',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label} <span style={{ opacity: 0.5 }}>{compact(count)}</span>
                </button>
              );
            })}
          </div>

          {/* Scrollable list */}
          <div key={`list-${lensTransitionKey}`} className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none', animation: 'lensSlideIn 200ms ease-out' }}>
            {sortedMatches.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 px-6">
                {isRunning ? (
                  <p className="font-mono text-white/15" style={{ fontSize: '11px' }}>
                    {isFulfillment ? 'Contacts arriving...' : 'Pairs arriving...'}
                  </p>
                ) : clientName && effectiveMatches.length === 0 && job.matches.filter(m => !m.vetoed).length > 0 ? (
                  <>
                    <p className="font-mono text-white/25" style={{ fontSize: '11px' }}>
                      {clientName} filters don't match this run
                    </p>
                    <p className="font-mono text-white/12 text-center" style={{ fontSize: '10px' }}>
                      {job.matches.filter(m => !m.vetoed).length} matches exist but none pass the lens.
                      Check industries and titles in the overlay, or try a different run.
                    </p>
                  </>
                ) : (
                  <p className="font-mono text-white/15" style={{ fontSize: '11px' }}>
                    No matches in {filterTier !== 'all' ? `the ${filterTier} tier` : 'this filter'}
                  </p>
                )}
              </div>
            ) : isFulfillment ? (
              /* FULFILLMENT: flat contact list deduped by demandKey */
              demandContacts.map(contact => (
                <ContactListItem
                  key={contact.demandKey}
                  contact={contact}
                  isSelected={selectedEvalId === contact.bestMatch.evalId}
                  onSelect={() => setSelectedEvalId(contact.bestMatch.evalId)}
                />
              ))
            ) : (
              /* MARKET: grouped pair list */
              groupByDemand(sortedMatches, job.canonicals).map(group => (
                <DemandGroupItem
                  key={group.demandKey}
                  group={group}
                  canonicals={job.canonicals}
                  selectedEvalId={selectedEvalId}
                  onSelect={setSelectedEvalId}
                />
              ))
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Detail */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          <div key={`detail-${lensTransitionKey}`} className="max-w-[560px] mx-auto py-10 px-8" style={{ animation: 'lensFadeIn 250ms ease-out' }}>
            {isFulfillment && selectedContact ? (
              /* FULFILLMENT: demand-only contact detail (no supply card) */
              <ContactDetail
                contact={selectedContact}
                canonicals={job.canonicals}
                intelCache={intelCache}
                onFetchIntel={handleFetchIntel}
                enrichResult={enrichResults.get(selectedContact.bestMatch.evalId)}
                onEnrich={() => handleEnrichDemandOnly(selectedContact.bestMatch.evalId, job.canonicals.get(selectedContact.demandKey))}
              />
            ) : !isFulfillment && selectedMatch ? (
              /* MARKET: full pair detail */
              <PairDetail
                match={selectedMatch}
                canonicals={job.canonicals}
                intelCache={intelCache}
                onFetchIntel={handleFetchIntel}
                enrichResult={enrichResults.get(selectedMatch.evalId)}
                onEnrich={() => handleEnrich(selectedMatch.evalId, job.canonicals.get(selectedMatch.supplyKey), job.canonicals.get(selectedMatch.demandKey))}
              />
            ) : (
              <EmptyDetail
                matchCount={isFulfillment ? demandContacts.length : sortedMatches.length}
                lensEmpty={!!clientName && effectiveMatches.length === 0 && job.matches.filter(m => !m.vetoed).length > 0}
                isFulfillment={isFulfillment}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── CACHE-HIT TOASTS ── */}
      {cacheToasts.length > 0 && (
        <div style={{ position: 'fixed', bottom: '96px', right: '24px', zIndex: 49, display: 'flex', flexDirection: 'column-reverse', gap: '8px', pointerEvents: 'none' }}>
          {cacheToasts.map(t => (
            <div
              key={t.id}
              className="font-mono"
              style={{
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '8px',
                padding: '10px 18px',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                animation: 'cacheToastIn 0.3s ease-out, cacheToastOut 0.4s ease-in 2.2s forwards',
                whiteSpace: 'nowrap',
              }}
            >
              <div style={{ fontSize: '11px', color: 'rgba(16, 185, 129, 0.90)', fontWeight: 500 }}>
                Already known — no charge
              </div>
              <div style={{ fontSize: '10px', color: 'rgba(16, 185, 129, 0.50)', marginTop: '2px' }}>
                {t.email}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── ANIMATIONS ── */}
      <style>{`
        @keyframes cacheToastIn {
          from { opacity: 0; transform: translateY(12px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes cacheToastOut {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to { opacity: 0; transform: translateY(-8px) scale(0.97); }
        }
        @keyframes pageIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes detailFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes enrichScan {
          0%   { transform: translateY(0); opacity: 1; }
          85%  { opacity: 0.5; }
          100% { transform: translateY(110px); opacity: 0; }
        }
        @keyframes enrichReveal {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes overlayFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes cardFloat {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes orbitSpin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes corePulse { 0%,100% { opacity: 0.3; transform: scale(0.8) } 50% { opacity: 1; transform: scale(1.2) } }
        @keyframes textBreathe { 0%,100% { opacity: 0.35 } 50% { opacity: 0.60 } }
        @keyframes particleDrift { 0% { left: -30px } 100% { left: 120px } }
        @keyframes breatheIn { from { opacity: 0; transform: scale(0.95) } to { opacity: 1; transform: scale(1) } }
        @keyframes lensSlideIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes lensFadeIn { from { opacity: 0; transform: translateY(4px) scale(0.99); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes lensDropIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
