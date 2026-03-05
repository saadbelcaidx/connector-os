/**
 * LiveMatchFeed — Streaming match card feed
 *
 * Renders MatchCard[] sorted by combined score descending.
 * Fade-in animation for new cards (300ms ease-out, 50ms stagger).
 * "New matches above" pill when user has scrolled down.
 * Classification-based filtering.
 * QUARANTINE hidden by default.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { MatchResult, JobPhase, CanonicalInfo } from '../hooks/useMCPJob';
import { MatchCard } from './MatchCard';

// =============================================================================
// TYPES
// =============================================================================

export type FilterMode = 'all' | 'strong' | 'possible' | 'vetoed';
export type SortMode = 'score' | 'company' | 'recency';

// =============================================================================
// HELPERS
// =============================================================================

function extractCompanyName(key: string): string {
  const separators = ['__', '--', '::'];
  for (const sep of separators) {
    if (key.includes(sep)) {
      return key.split(sep)[0].replace(/[-_]/g, ' ').trim().toLowerCase();
    }
  }
  return key.replace(/[-_]/g, ' ').trim().toLowerCase();
}

function filterMatches(matches: MatchResult[], filter: FilterMode, search: string): MatchResult[] {
  let filtered = matches;

  switch (filter) {
    case 'strong':
      filtered = matches.filter((m) => m.classification === 'PASS' && !m.vetoed);
      break;
    case 'possible':
      filtered = matches.filter((m) => m.classification === 'MARGINAL' && !m.vetoed);
      break;
    case 'vetoed':
      filtered = matches.filter((m) => m.vetoed);
      break;
    case 'all':
    default:
      // Hide QUARANTINE + HARD_DROP by default in "all" view
      filtered = matches.filter(
        (m) => m.classification === 'PASS' || m.classification === 'MARGINAL' || m.vetoed,
      );
      break;
  }

  if (search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(
      (m) =>
        extractCompanyName(m.demandKey).includes(q) ||
        extractCompanyName(m.supplyKey).includes(q) ||
        (m.framing && m.framing.toLowerCase().includes(q)),
    );
  }

  return filtered;
}

function sortMatches(matches: MatchResult[], sort: SortMode): MatchResult[] {
  const copy = [...matches];
  switch (sort) {
    case 'company':
      return copy.sort((a, b) => extractCompanyName(a.demandKey).localeCompare(extractCompanyName(b.demandKey)));
    case 'recency':
      return copy.sort((a, b) => new Date(b.evaluatedAt).getTime() - new Date(a.evaluatedAt).getTime());
    case 'score':
    default:
      return copy.sort((a, b) => b.scores.combined - a.scores.combined);
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

interface Props {
  matches: MatchResult[];
  phase: JobPhase;
  filter: FilterMode;
  sort: SortMode;
  search: string;
  canonicals: Map<string, CanonicalInfo>;
  onQueueIntro?: (match: MatchResult) => void;
}

export function LiveMatchFeed({ matches, phase, filter, sort, search, canonicals, onQueueIntro }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [newAbove, setNewAbove] = useState(false);
  const [showQuarantine, setShowQuarantine] = useState(false);
  const prevCountRef = useRef(0);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  // Track which cards are new
  useEffect(() => {
    const currentIds = new Set(matches.map((m) => m.evalId));
    const fresh = new Set<string>();
    for (const id of currentIds) {
      if (!seenIdsRef.current.has(id)) {
        fresh.add(id);
      }
    }
    if (fresh.size > 0) {
      setNewIds(fresh);
      // Mark as seen after animation
      const timer = setTimeout(() => {
        for (const id of fresh) {
          seenIdsRef.current.add(id);
        }
        setNewIds(new Set());
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [matches]);

  // Detect "new matches above" when scrolled
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // If scrolled more than 200px from top and new cards arrived
    if (el.scrollTop > 200 && matches.length > prevCountRef.current) {
      setNewAbove(true);
    }
    if (el.scrollTop < 50) {
      setNewAbove(false);
    }
  }, [matches.length]);

  useEffect(() => {
    prevCountRef.current = matches.length;
  }, [matches.length]);

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setNewAbove(false);
  }, []);

  // Apply filters and sorting
  const visible = sortMatches(filterMatches(matches, filter, search), sort);

  // Count hidden quarantine matches
  const quarantineCount = matches.filter(
    (m) => (m.classification === 'QUARANTINE' || m.classification === 'HARD_DROP') && !m.vetoed,
  ).length;

  const quarantineMatches = showQuarantine
    ? sortMatches(
        matches.filter(
          (m) => (m.classification === 'QUARANTINE' || m.classification === 'HARD_DROP') && !m.vetoed,
        ),
        sort,
      )
    : [];

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* "New matches above" pill */}
      {newAbove && (
        <button
          onClick={scrollToTop}
          className="absolute top-2 left-1/2 -translate-x-1/2 z-10 font-mono text-[10px] text-white/70 px-3 rounded-full transition-colors cursor-pointer"
          style={{
            height: '24px',
            background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.08)',
            outline: 'none',
            boxShadow: 'none',
            lineHeight: '24px',
          }}
        >
          New matches above {'\u2191'}
        </button>
      )}

      {/* Scrollable feed */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none' }}
      >
        {/* Empty state */}
        {matches.length === 0 && phase !== 'complete' && (
          <div className="flex items-center justify-center py-20">
            <p className="font-mono text-[11px] text-white/25">
              Matches will appear here as they're found.
            </p>
          </div>
        )}

        {/* No matches found (complete, nothing) */}
        {matches.length === 0 && phase === 'complete' && (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <p className="font-mono text-[12px] text-white/40">
              No strong matches found in this dataset.
            </p>
            <p className="font-mono text-[11px] text-white/25">
              Try expanding your supply list or adjusting filters.
            </p>
          </div>
        )}

        {/* No results for current filter */}
        {matches.length > 0 && visible.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <p className="font-mono text-[11px] text-white/25">
              No matches for this filter.
            </p>
          </div>
        )}

        {/* Match cards */}
        {visible.map((match, i) => (
          <MatchCard
            key={match.evalId}
            match={match}
            index={i}
            isNew={newIds.has(match.evalId)}
            canonicals={canonicals}
            onQueueIntro={onQueueIntro}
          />
        ))}

        {/* Quarantine section */}
        {filter === 'all' && quarantineCount > 0 && !showQuarantine && (
          <div className="px-5 py-4 border-t border-white/[0.04]">
            <button
              onClick={() => setShowQuarantine(true)}
              className="font-mono text-[11px] text-white/25 hover:text-white/40 transition-colors"
              style={{ outline: 'none', boxShadow: 'none', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              Show {quarantineCount} low-confidence matches
            </button>
          </div>
        )}

        {showQuarantine &&
          quarantineMatches.map((match, i) => (
            <MatchCard
              key={match.evalId}
              match={match}
              index={i}
              canonicals={canonicals}
              onQueueIntro={onQueueIntro}
            />
          ))}
      </div>
    </div>
  );
}
