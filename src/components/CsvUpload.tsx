/**
 * CsvUpload.tsx — CSV Upload + Validation + Normalization UI
 *
 * CSV PHASE 1: Upload + Validation
 * - Template download links (demand + supply)
 * - File upload (.csv only, 10MB max)
 * - Pre-flight validation (4 tiers)
 * - Validation results display
 * - errors.csv + warnings.csv download
 *
 * CSV PHASE 2: Normalization + Dedup
 * - Normalize validated rows → NormalizedRecord[]
 * - Cross-upload deduplication via stableKey
 * - Dedup confirmation prompt
 * - Forward only new records to pipeline
 *
 * INVARIANT: Every uploaded CSV produces deterministic validation and normalization results.
 */

import { useState, useRef } from 'react';
import { Upload, Download, FileText, AlertCircle, CheckCircle, AlertTriangle, X } from 'lucide-react';
import { validateCsv, generateErrorsCsv, generateWarningsCsv } from '../utils/csvValidation';
import { normalizeCsvRecords } from '../normalization/csv';
import { checkCsvDuplicates, persistCsvStableKeys } from '../db/csvStableKeys';
import { CsvDedupPrompt } from './CsvDedupPrompt';
import type { NormalizedRecord } from '../schemas';

// =============================================================================
// TYPES (LOCAL ONLY — NOT EXPORTED)
// =============================================================================

interface ErrorRow {
  rowIndex: number;
  field: string;
  reason: string;
  originalValue: string;
}

interface WarningRow {
  rowIndex: number;
  field: string;
  reason: string;
  originalValue: string;
}

interface ValidationResult {
  status: 'valid' | 'invalid';
  errors: ErrorRow[];
  warnings: WarningRow[];
  stats: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    warningRows: number;
  };
}

type CsvSide = 'demand' | 'supply';

type CsvUploadState =
  | 'idle'
  | 'validating'
  | 'results'
  | 'normalizing'
  | 'dedup'
  | 'complete';

interface CsvUploadProps {
  side: CsvSide;
  userId?: string; // For dedup — optional, guest mode won't have this
  onValidated?: (result: ValidationResult, rows: Record<string, string>[]) => void;
  onNormalized?: (records: NormalizedRecord[]) => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const TEMPLATE_URLS: Record<CsvSide, string> = {
  demand: '/csv-template-demand.csv',
  supply: '/csv-template-supply.csv',
};

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Generate unique upload ID.
 * Format: crypto.randomUUID() or fallback.
 */
function generateUploadId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Trigger file download in browser.
 */
function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// =============================================================================
// COMPONENT
// =============================================================================

export function CsvUpload({ side, userId, onValidated, onNormalized }: CsvUploadProps) {
  const [state, setState] = useState<CsvUploadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [uploadId, setUploadId] = useState<string>('');

  // Phase 2 state
  const [normalizedRecords, setNormalizedRecords] = useState<NormalizedRecord[]>([]);
  const [stableKeys, setStableKeys] = useState<string[]>([]);
  const [dedupResult, setDedupResult] = useState<{
    newKeys: string[];
    duplicateKeys: string[];
    totalNew: number;
    totalDuplicates: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset state
    setError(null);
    setValidationResult(null);
    setParsedRows([]);
    setNormalizedRecords([]);
    setStableKeys([]);
    setDedupResult(null);

    // Generate uploadId at the start of upload (Phase 1)
    const newUploadId = generateUploadId();
    setUploadId(newUploadId);

    // Check file type
    if (!file.name.endsWith('.csv')) {
      setError('Please upload a CSV file (.csv)');
      return;
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`);
      return;
    }

    setState('validating');

    try {
      const text = await file.text();
      const { result, rows } = validateCsv(text, side);

      setValidationResult(result);
      setParsedRows(rows);
      setState('results');

      // Callback for parent component
      onValidated?.(result, rows);
    } catch (err) {
      setError('Failed to read file. Please try again.');
      setState('idle');
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDownloadErrors = () => {
    if (!validationResult?.errors.length) return;
    const csv = generateErrorsCsv(validationResult.errors);
    downloadFile(csv, `${side}-errors.csv`);
  };

  const handleDownloadWarnings = () => {
    if (!validationResult?.warnings.length) return;
    const csv = generateWarningsCsv(validationResult.warnings);
    downloadFile(csv, `${side}-warnings.csv`);
  };

  const handleReset = () => {
    setState('idle');
    setError(null);
    setValidationResult(null);
    setParsedRows([]);
    setUploadId('');
    setNormalizedRecords([]);
    setStableKeys([]);
    setDedupResult(null);
  };

  /**
   * Phase 2: Proceed button handler.
   * 1. Normalize CSV rows
   * 2. Check for duplicates (if userId available)
   * 3. Show dedup prompt OR forward records
   */
  const handleProceed = async () => {
    if (parsedRows.length === 0) return;

    setState('normalizing');
    setError(null);

    try {
      // Step 1: Normalize CSV rows
      const { records, stableKeys: keys } = normalizeCsvRecords({
        rows: parsedRows as any, // Type assertion for CSV validated rows
        side,
        uploadId,
      });

      setNormalizedRecords(records);
      setStableKeys(keys);

      // Step 2: Check for duplicates (only if userId available)
      if (userId) {
        const dedup = await checkCsvDuplicates({
          userId,
          stableKeys: keys,
          side,
        });

        setDedupResult(dedup);

        if (dedup.totalDuplicates > 0) {
          // Show dedup prompt
          setState('dedup');
          return;
        }
      }

      // No duplicates OR no userId — proceed directly
      setState('complete');
      onNormalized?.(records);

      // Persist stableKeys for future dedup (only if userId available)
      if (userId) {
        await persistCsvStableKeys({ userId, stableKeys: keys, side });
      }
    } catch (err) {
      console.error('[CsvUpload] Normalization failed:', {
        error: err instanceof Error ? err.message : 'Unknown error',
        uploadId,
        phase: 'csv-2',
      });
      setError('CSV normalization failed. Please re-upload or contact support.');
      setState('results'); // Go back to results state
    }
  };

  /**
   * Phase 2: User confirms importing new records only.
   */
  const handleDedupConfirm = async () => {
    if (!dedupResult || !normalizedRecords.length) return;

    // Filter to only new records (based on stableKey)
    const newKeySet = new Set(dedupResult.newKeys);
    const newRecords = normalizedRecords.filter((record) => {
      const stableKey = record.raw?._stableKey;
      return stableKey && newKeySet.has(stableKey);
    });

    setState('complete');
    onNormalized?.(newRecords);

    // Persist only new stableKeys
    if (userId && dedupResult.newKeys.length > 0) {
      await persistCsvStableKeys({
        userId,
        stableKeys: dedupResult.newKeys,
        side,
      });
    }
  };

  /**
   * Phase 2: User cancels dedup — go back to results.
   */
  const handleDedupCancel = () => {
    setState('results');
    setDedupResult(null);
  };

  const sideLabel = side === 'demand' ? 'Demand' : 'Supply';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white/90">
          Upload {sideLabel} CSV
        </h3>
        <a
          href={TEMPLATE_URLS[side]}
          download={`csv-template-${side}.csv`}
          className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/70 transition-colors"
        >
          <Download size={12} />
          Download Template
        </a>
      </div>

      {/* Upload Area */}
      {state === 'idle' && (
        <label className="
          flex flex-col items-center justify-center gap-3 p-8
          rounded-xl border-2 border-dashed border-white/[0.08]
          hover:border-white/[0.15] hover:bg-white/[0.02]
          cursor-pointer transition-all
        ">
          <div className="w-10 h-10 rounded-full bg-white/[0.04] flex items-center justify-center">
            <Upload size={18} className="text-white/40" />
          </div>
          <div className="text-center">
            <p className="text-sm text-white/70">
              Drop your CSV here or <span className="text-white/90 underline">browse</span>
            </p>
            <p className="text-xs text-white/40 mt-1">
              Max {MAX_FILE_SIZE_MB}MB, .csv only
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
          />
        </label>
      )}

      {/* Error State */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/[0.08] border border-red-500/[0.15]">
          <AlertCircle size={14} className="text-red-400 shrink-0" />
          <p className="text-xs text-red-400">{error}</p>
          <button
            onClick={handleReset}
            className="ml-auto text-white/40 hover:text-white/60"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Validating State */}
      {state === 'validating' && (
        <div className="flex items-center justify-center gap-2 p-8 rounded-xl border border-white/[0.06]">
          <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          <p className="text-sm text-white/60">Validating...</p>
        </div>
      )}

      {/* Normalizing State */}
      {state === 'normalizing' && (
        <div className="flex items-center justify-center gap-2 p-8 rounded-xl border border-white/[0.06]">
          <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          <p className="text-sm text-white/60">Processing records...</p>
        </div>
      )}

      {/* Dedup Prompt State */}
      {state === 'dedup' && dedupResult && (
        <CsvDedupPrompt
          totalRecords={normalizedRecords.length}
          newRecords={dedupResult.totalNew}
          duplicateRecords={dedupResult.totalDuplicates}
          onConfirm={handleDedupConfirm}
          onCancel={handleDedupCancel}
        />
      )}

      {/* Complete State */}
      {state === 'complete' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-4 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/[0.15]">
            <CheckCircle size={16} className="text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-emerald-400">
                Import Complete
              </p>
              <p className="text-xs text-emerald-400/70 mt-0.5">
                {dedupResult
                  ? `${dedupResult.totalNew} new records imported (${dedupResult.totalDuplicates} duplicates skipped)`
                  : `${normalizedRecords.length} records imported`
                }
              </p>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="
              px-4 py-2 rounded-lg
              bg-white/[0.04] border border-white/[0.08]
              text-xs text-white/60 hover:text-white/80 hover:bg-white/[0.06]
              transition-colors
            "
          >
            Upload Another File
          </button>
        </div>
      )}

      {/* Results State */}
      {state === 'results' && validationResult && (
        <div className="space-y-4">
          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] text-center">
              <p className="text-lg font-semibold text-white/90">{validationResult.stats.totalRows}</p>
              <p className="text-[10px] text-white/40 uppercase tracking-wider">Total</p>
            </div>
            <div className="p-3 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/[0.12] text-center">
              <p className="text-lg font-semibold text-emerald-400">{validationResult.stats.validRows}</p>
              <p className="text-[10px] text-emerald-400/60 uppercase tracking-wider">Valid</p>
            </div>
            <div className="p-3 rounded-lg bg-red-500/[0.06] border border-red-500/[0.12] text-center">
              <p className="text-lg font-semibold text-red-400">{validationResult.stats.invalidRows}</p>
              <p className="text-[10px] text-red-400/60 uppercase tracking-wider">Invalid</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-500/[0.06] border border-amber-500/[0.12] text-center">
              <p className="text-lg font-semibold text-amber-400">{validationResult.stats.warningRows}</p>
              <p className="text-[10px] text-amber-400/60 uppercase tracking-wider">Warnings</p>
            </div>
          </div>

          {/* Status Message */}
          {validationResult.status === 'valid' ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/[0.08] border border-emerald-500/[0.15]">
              <CheckCircle size={14} className="text-emerald-400 shrink-0" />
              <p className="text-xs text-emerald-400">
                CSV is valid. {validationResult.warnings.length > 0 ? 'Review warnings below.' : 'Ready to proceed.'}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/[0.08] border border-red-500/[0.15]">
              <AlertCircle size={14} className="text-red-400 shrink-0" />
              <p className="text-xs text-red-400">
                CSV has errors. Download the error report, fix issues, and re-upload.
              </p>
            </div>
          )}

          {/* Download Buttons */}
          <div className="flex items-center gap-2">
            {validationResult.errors.length > 0 && (
              <button
                onClick={handleDownloadErrors}
                className="
                  flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                  bg-red-500/[0.08] border border-red-500/[0.15]
                  text-xs text-red-400 hover:bg-red-500/[0.12]
                  transition-colors
                "
              >
                <FileText size={12} />
                Download errors.csv
              </button>
            )}
            {validationResult.warnings.length > 0 && (
              <button
                onClick={handleDownloadWarnings}
                className="
                  flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                  bg-amber-500/[0.08] border border-amber-500/[0.15]
                  text-xs text-amber-400 hover:bg-amber-500/[0.12]
                  transition-colors
                "
              >
                <AlertTriangle size={12} />
                Download warnings.csv
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
            <button
              onClick={handleReset}
              className="
                px-4 py-2 rounded-lg
                bg-white/[0.04] border border-white/[0.08]
                text-xs text-white/60 hover:text-white/80 hover:bg-white/[0.06]
                transition-colors
              "
            >
              Upload Different File
            </button>
            <button
              onClick={handleProceed}
              disabled={validationResult.status === 'invalid'}
              className={`
                px-4 py-2 rounded-lg text-xs font-medium transition-colors
                ${validationResult.status === 'valid'
                  ? 'bg-white text-black hover:bg-white/90'
                  : 'bg-white/[0.04] text-white/30 cursor-not-allowed'
                }
              `}
            >
              Proceed
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CsvUpload;
