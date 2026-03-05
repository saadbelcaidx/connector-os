/**
 * ExportButton — Export all matches + reasoning as CSV
 *
 * Ghost button. On click, builds CSV with columns:
 * Demand Company, Demand Wants, Supply Company, Supply Offers,
 * Combined Score, Classification, Framing, Reasoning
 *
 * Downloads as matches-{jobId}-{date}.csv
 */

import { useCallback } from 'react';
import type { MatchResult, CanonicalInfo } from '../hooks/useMCPJob';

// =============================================================================
// TYPES
// =============================================================================

interface Props {
  matches: MatchResult[];
  canonicals: Map<string, CanonicalInfo>;
  jobId: string | null;
}

// =============================================================================
// HELPERS
// =============================================================================

function getCompanyName(key: string, canonicals: Map<string, CanonicalInfo>): string {
  const info = canonicals.get(key);
  if (info && info.company) return info.company;
  const separators = ['__', '--', '::'];
  for (const sep of separators) {
    if (key.includes(sep)) {
      return key
        .split(sep)[0]
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
    }
  }
  return key.slice(0, 30);
}

function escapeCSV(value: string): string {
  if (!value) return '';
  // If value contains comma, newline, or double-quote, wrap in quotes
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function buildCSV(
  matches: MatchResult[],
  canonicals: Map<string, CanonicalInfo>,
): string {
  const headers = [
    'Demand Company',
    'Demand Wants',
    'Supply Company',
    'Supply Offers',
    'Combined Score',
    'Classification',
    'Framing',
    'Reasoning',
  ];

  const rows = matches.map((m) => {
    const demandName = getCompanyName(m.demandKey, canonicals);
    const supplyName = getCompanyName(m.supplyKey, canonicals);
    const demandInfo = canonicals.get(m.demandKey);
    const supplyInfo = canonicals.get(m.supplyKey);

    return [
      escapeCSV(demandName),
      escapeCSV(demandInfo?.wants || ''),
      escapeCSV(supplyName),
      escapeCSV(supplyInfo?.offers || ''),
      m.scores.combined.toFixed(4),
      m.vetoed ? 'VETOED' : m.classification,
      escapeCSV(m.framing || ''),
      escapeCSV(m.reasoning || ''),
    ].join(',');
  });

  return headers.join(',') + '\n' + rows.join('\n');
}

function formatDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ExportButton({ matches, canonicals, jobId }: Props) {
  const handleExport = useCallback(() => {
    if (matches.length === 0) return;

    const csv = buildCSV(matches, canonicals);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const filename = `matches-${jobId || 'export'}-${formatDate()}.csv`;

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();

    // Cleanup
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
  }, [matches, canonicals, jobId]);

  if (matches.length === 0) return null;

  return (
    <button
      onClick={handleExport}
      className="font-mono text-[11px] text-white/30 hover:text-white/50 transition-colors"
      style={{
        background: 'none',
        border: 'none',
        outline: 'none',
        boxShadow: 'none',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      Export CSV
    </button>
  );
}
