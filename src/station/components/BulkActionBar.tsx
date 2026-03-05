/**
 * BulkActionBar — Fixed bottom bar when matches are selected.
 * Shows count + Enrich All / Export CSV actions.
 */

interface BulkActionBarProps {
  selectedCount: number;
  onEnrichAll: () => void;
  onExportCsv: () => void;
  onClear: () => void;
}

export function BulkActionBar({ selectedCount, onEnrichAll, onExportCsv, onClear }: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-white/[0.05] backdrop-blur-sm border-t border-white/[0.06] px-6 py-3 flex items-center justify-between z-50"
      style={{ animation: 'bulkBarIn 0.15s ease-out' }}
    >
      <div className="flex items-center gap-3">
        <span className="text-sm text-white/70">
          {selectedCount} match{selectedCount !== 1 ? 'es' : ''} selected
        </span>
        <button
          onClick={onClear}
          className="text-xs text-white/30 hover:text-white/50 transition-colors"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          Clear
        </button>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onEnrichAll}
          className="px-4 py-1.5 text-sm bg-white/[0.06] hover:bg-white/[0.1] rounded-lg text-white/70 transition-colors"
          style={{ border: 'none', cursor: 'pointer' }}
        >
          Enrich All
        </button>
        <button
          onClick={onExportCsv}
          className="px-4 py-1.5 text-sm bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg transition-colors"
          style={{ border: 'none', cursor: 'pointer' }}
        >
          Export CSV
        </button>
      </div>

      <style>{`
        @keyframes bulkBarIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
