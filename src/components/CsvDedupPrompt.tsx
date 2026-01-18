/**
 * CsvDedupPrompt.tsx — Cross-Upload Deduplication Confirmation
 *
 * CSV Phase 2: Shows user how many records are duplicates vs new,
 * and asks for confirmation before proceeding.
 *
 * INVARIANT: User explicitly approves skipping duplicates.
 */

import { AlertTriangle, Check, X } from 'lucide-react';

interface CsvDedupPromptProps {
  totalRecords: number;
  newRecords: number;
  duplicateRecords: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CsvDedupPrompt({
  totalRecords,
  newRecords,
  duplicateRecords,
  onConfirm,
  onCancel,
}: CsvDedupPromptProps) {
  return (
    <div className="space-y-4">
      {/* Warning Banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/[0.08] border border-amber-500/[0.15]">
        <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
          <AlertTriangle size={16} className="text-amber-400" />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-white/90">
            Duplicate Records Detected
          </p>
          <p className="text-sm text-white/60">
            {duplicateRecords} records already exist from previous uploads.
            <br />
            {newRecords} new records detected.
          </p>
          <p className="text-sm text-white/70">
            Do you want to import new records only?
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] text-center">
          <p className="text-lg font-semibold text-white/90">{totalRecords}</p>
          <p className="text-[10px] text-white/40 uppercase tracking-wider">Total</p>
        </div>
        <div className="p-3 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/[0.12] text-center">
          <p className="text-lg font-semibold text-emerald-400">{newRecords}</p>
          <p className="text-[10px] text-emerald-400/60 uppercase tracking-wider">New</p>
        </div>
        <div className="p-3 rounded-lg bg-amber-500/[0.06] border border-amber-500/[0.12] text-center">
          <p className="text-lg font-semibold text-amber-400">{duplicateRecords}</p>
          <p className="text-[10px] text-amber-400/60 uppercase tracking-wider">Duplicates</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
        <button
          onClick={onCancel}
          className="
            flex items-center gap-1.5 px-4 py-2 rounded-lg
            bg-white/[0.04] border border-white/[0.08]
            text-xs text-white/60 hover:text-white/80 hover:bg-white/[0.06]
            transition-colors
          "
        >
          <X size={12} />
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={newRecords === 0}
          className={`
            flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors
            ${newRecords > 0
              ? 'bg-white text-black hover:bg-white/90'
              : 'bg-white/[0.04] text-white/30 cursor-not-allowed'
            }
          `}
        >
          <Check size={12} />
          Import {newRecords} New Only
        </button>
      </div>

      {/* Help Text */}
      {newRecords === 0 && (
        <p className="text-xs text-white/40 text-center">
          All records in this upload already exist. Upload a different file to add new records.
        </p>
      )}
    </div>
  );
}

export default CsvDedupPrompt;
