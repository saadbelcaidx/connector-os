/**
 * AllMatchesTable — Dense table of all matches with tabs, filter, expand, bulk select.
 * Reference: shadcn-admin Tasks table (dark mode).
 * Pure Tailwind, no shadcn dependency.
 */

import { useState, useMemo, useCallback } from 'react';
import type { MatchResult, CanonicalInfo } from '../hooks/useMCPJob';
import { getTier, TierBadge, type Tier } from '../lib/tiers';
import { MatchDetailExpanded } from './MatchDetailExpanded';
import { BulkActionBar } from './BulkActionBar';

interface AllMatchesTableProps {
  matches: MatchResult[];
  canonicals: Map<string, CanonicalInfo>;
  isRunning: boolean;
}

type TabKey = 'all' | 'strong' | 'good' | 'weak' | 'conflicts';

const PAGE_SIZE = 50;

export function AllMatchesTable({ matches, canonicals, isRunning }: AllMatchesTableProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);

  // Resolve company info for a match
  const getCompany = useCallback(
    (key: string) => {
      const c = canonicals.get(key);
      return {
        company: c?.company || key,
        industry: c?.industry || '',
        wants: c?.wants || '',
        offers: c?.offers || '',
      };
    },
    [canonicals],
  );

  // Tab filter
  const tabFilters: Record<TabKey, (m: MatchResult) => boolean> = {
    all: () => true,
    strong: (m) => getTier(m) === 'strong',
    good: (m) => getTier(m) === 'good',
    weak: (m) => getTier(m) === 'weak',
    conflicts: (m) => getTier(m) === 'conflict',
  };

  // Count per tab
  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = { all: 0, strong: 0, good: 0, weak: 0, conflicts: 0 };
    for (const m of matches) {
      counts.all++;
      const tier = getTier(m);
      if (tier === 'strong') counts.strong++;
      else if (tier === 'good') counts.good++;
      else if (tier === 'weak') counts.weak++;
      else if (tier === 'conflict') counts.conflicts++;
    }
    return counts;
  }, [matches]);

  // Filtered + searched matches
  const filtered = useMemo(() => {
    let list = matches.filter(tabFilters[activeTab]);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((m) => {
        const dc = canonicals.get(m.demandKey);
        const sc = canonicals.get(m.supplyKey);
        return (
          (dc?.company || '').toLowerCase().includes(q) ||
          (sc?.company || '').toLowerCase().includes(q) ||
          (dc?.industry || '').toLowerCase().includes(q) ||
          (sc?.industry || '').toLowerCase().includes(q)
        );
      });
    }

    return list;
  }, [matches, activeTab, search, canonicals]);

  // Pagination
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageStart = page * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageEnd);

  // Reset page when tab/search changes
  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setPage(0);
    setExpandedId(null);
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setPage(0);
  };

  // Selection
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === pageItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pageItems.map((m) => m.evalId)));
    }
  };

  const allPageSelected = pageItems.length > 0 && pageItems.every((m) => selectedIds.has(m.evalId));

  // Expand
  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'strong', label: 'Strong fits' },
    { key: 'good', label: 'Good fits' },
    { key: 'weak', label: 'Weak' },
    { key: 'conflicts', label: 'Conflicts' },
  ];

  return (
    <div className="mt-8">
      {/* Section title */}
      <h3 className="text-sm font-medium text-white/40 mb-4 tracking-tight">
        All Matches
      </h3>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/[0.06]">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`px-4 py-2 text-sm transition-colors ${
              activeTab === tab.key
                ? 'text-white border-b-2 border-white'
                : 'text-white/40 hover:text-white/60'
            }`}
            style={{ background: 'none', border: 'none', borderBottom: activeTab === tab.key ? '2px solid white' : '2px solid transparent', cursor: 'pointer', outline: 'none' }}
            onClick={() => handleTabChange(tab.key)}
          >
            {tab.label} ({tabCounts[tab.key]})
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex gap-3 py-3">
        <input
          placeholder="Filter companies..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm text-white/90 placeholder:text-white/30 w-64 focus:outline-none focus:border-white/20 transition-colors"
        />
        {isRunning && (
          <span className="flex items-center text-xs text-amber-400/70">
            Live &mdash; updating
          </span>
        )}
      </div>

      {/* Table */}
      <div className="border border-white/[0.06] rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06] bg-white/[0.02]">
              <th className="w-8 py-2 px-2">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={toggleSelectAll}
                  className="accent-emerald-500"
                />
              </th>
              <th className="text-left text-xs font-medium text-white/40 py-2 px-2">
                Demand
              </th>
              <th className="text-left text-xs font-medium text-white/40 py-2 px-2">
                Supply
              </th>
              <th className="text-left text-xs font-medium text-white/40 py-2 px-2">
                Fit
              </th>
              <th className="w-8 py-2 px-2" />
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-sm text-white/20">
                  {search ? 'No matches found.' : 'No matches in this category.'}
                </td>
              </tr>
            ) : (
              pageItems.map((match) => {
                const demandInfo = getCompany(match.demandKey);
                const supplyInfo = getCompany(match.supplyKey);
                const isExpanded = expandedId === match.evalId;
                const isSelected = selectedIds.has(match.evalId);

                return (
                  <MatchRow
                    key={match.evalId}
                    match={match}
                    demandCompany={demandInfo.company}
                    demandIndustry={demandInfo.industry}
                    supplyCompany={supplyInfo.company}
                    supplyIndustry={supplyInfo.industry}
                    isExpanded={isExpanded}
                    isSelected={isSelected}
                    onToggleExpand={() => toggleExpand(match.evalId)}
                    onToggleSelect={() => toggleSelect(match.evalId)}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-xs text-white/30">
          <span>
            Showing {pageStart + 1}&ndash;{Math.min(pageEnd, filtered.length)} of{' '}
            {filtered.length} {activeTab === 'all' ? 'matches' : tabs.find((t) => t.key === activeTab)?.label.toLowerCase()}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 text-white/40 hover:text-white/60 disabled:text-white/15 transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '4px', cursor: page === 0 ? 'default' : 'pointer', outline: 'none' }}
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 text-white/40 hover:text-white/60 disabled:text-white/15 transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '4px', cursor: page >= totalPages - 1 ? 'default' : 'pointer', outline: 'none' }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        onEnrichAll={() => { /* TODO: wire to enrichment */ }}
        onExportCsv={() => { /* TODO: wire to export */ }}
        onClear={() => setSelectedIds(new Set())}
      />
    </div>
  );
}

// =============================================================================
// MATCH ROW (inline — keeps table DOM structure clean)
// =============================================================================

interface MatchRowProps {
  match: MatchResult;
  demandCompany: string;
  demandIndustry: string;
  supplyCompany: string;
  supplyIndustry: string;
  isExpanded: boolean;
  isSelected: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
}

function MatchRow({
  match,
  demandCompany,
  demandIndustry,
  supplyCompany,
  supplyIndustry,
  isExpanded,
  isSelected,
  onToggleExpand,
  onToggleSelect,
}: MatchRowProps) {
  const tier = getTier(match);

  return (
    <>
      <tr
        className={`border-b border-white/[0.04] hover:bg-white/[0.02] cursor-pointer transition-colors ${
          isSelected ? 'bg-white/[0.03]' : ''
        }`}
        onClick={onToggleExpand}
      >
        <td className="py-3 px-2">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            className="accent-emerald-500"
          />
        </td>
        <td className="py-3 px-2">
          <div className="text-sm font-medium text-white/90 truncate max-w-[200px]">
            {demandCompany}
          </div>
          {demandIndustry && (
            <div className="text-xs text-white/30 truncate max-w-[200px]">
              {demandIndustry}
            </div>
          )}
        </td>
        <td className="py-3 px-2">
          <div className="text-sm font-medium text-white/90 truncate max-w-[200px]">
            {supplyCompany}
          </div>
          {supplyIndustry && (
            <div className="text-xs text-white/30 truncate max-w-[200px]">
              {supplyIndustry}
            </div>
          )}
        </td>
        <td className="py-3 px-2">
          <div className="flex items-center gap-1.5">
            <TierBadge tier={tier} />
            {match.evalStatus === 'curated' && match.framing === 'URGENT' && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold tracking-wide bg-amber-500/15 text-amber-400 border border-amber-500/20">
                URGENT
              </span>
            )}
          </div>
        </td>
        <td className="py-3 px-2 text-white/30 text-center">
          {isExpanded ? '\u25B4' : '\u25BE'}
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={5} className="p-0">
            <MatchDetailExpanded match={match} />
          </td>
        </tr>
      )}
    </>
  );
}
