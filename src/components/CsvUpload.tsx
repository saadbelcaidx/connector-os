/**
 * CsvUpload.tsx — CSV Upload + Validation + Normalization
 *
 * Simple flow: Upload → Validate → Normalize → Done
 *
 * User's responsibility to manage data quality (no dedup).
 * Template compliance is enforced via validation.
 */

import { useState, useRef } from 'react';
import { Upload, Download, FileText, AlertCircle, CheckCircle, AlertTriangle, X } from 'lucide-react';
import { validateCsv, generateErrorsCsv, generateWarningsCsv } from '../utils/csvValidation';
import { normalizeCsvRecords } from '../normalization/csv';
import type { NormalizedRecord } from '../schemas';

// =============================================================================
// TYPES
// =============================================================================

interface ValidationResult {
  status: 'valid' | 'invalid';
  errors: { rowIndex: number; field: string; reason: string; originalValue: string }[];
  warnings: { rowIndex: number; field: string; reason: string; originalValue: string }[];
  stats: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    warningRows: number;
  };
}

type CsvSide = 'demand' | 'supply';
type CsvUploadState = 'idle' | 'validating' | 'normalizing' | 'results' | 'complete';

interface CsvUploadProps {
  side: CsvSide;
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

function generateUploadId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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

export function CsvUpload({ side, onValidated, onNormalized }: CsvUploadProps) {
  const [state, setState] = useState<CsvUploadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [uploadId, setUploadId] = useState<string>('');
  const [recordCount, setRecordCount] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Core normalization — no dedup, just normalize and store
  const proceedWithNormalization = async (rows: Record<string, string>[]) => {
    if (rows.length === 0) return;

    setState('normalizing');
    setError(null);

    try {
      const { records } = normalizeCsvRecords({
        rows: rows as any,
        side,
        uploadId,
      });

      setRecordCount(records.length);
      setState('complete');
      onNormalized?.(records);
    } catch (err) {
      console.error('[CsvUpload] Normalization failed:', err);
      setError('CSV processing failed. Please check your file and try again.');
      setState('results');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset state
    setError(null);
    setValidationResult(null);
    setParsedRows([]);
    setRecordCount(0);

    const newUploadId = generateUploadId();
    setUploadId(newUploadId);

    // Validate file type
    if (!file.name.endsWith('.csv')) {
      setError('Please upload a CSV file (.csv)');
      return;
    }

    // Validate file size
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
      onValidated?.(result, rows);

      // Auto-proceed when valid
      if (result.status === 'valid' && rows.length > 0) {
        await proceedWithNormalization(rows);
      } else {
        setState('results');
      }
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
    downloadFile(generateErrorsCsv(validationResult.errors), `${side}-errors.csv`);
  };

  const handleDownloadWarnings = () => {
    if (!validationResult?.warnings.length) return;
    downloadFile(generateWarningsCsv(validationResult.warnings), `${side}-warnings.csv`);
  };

  const handleReset = () => {
    setState('idle');
    setError(null);
    setValidationResult(null);
    setParsedRows([]);
    setUploadId('');
    setRecordCount(0);
  };

  const handleProceed = () => proceedWithNormalization(parsedRows);

  const sideLabel = side === 'demand' ? 'Demand' : 'Supply';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white/90">Upload {sideLabel} CSV</h3>
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
        <label className="flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.02] cursor-pointer transition-all">
          <div className="w-10 h-10 rounded-full bg-white/[0.04] flex items-center justify-center">
            <Upload size={18} className="text-white/40" />
          </div>
          <div className="text-center">
            <p className="text-sm text-white/70">
              Drop your CSV here or <span className="text-white/90 underline">browse</span>
            </p>
            <p className="text-xs text-white/40 mt-1">Max {MAX_FILE_SIZE_MB}MB, .csv only</p>
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
          <button onClick={handleReset} className="ml-auto text-white/40 hover:text-white/60">
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
          <p className="text-sm text-white/60">Processing...</p>
        </div>
      )}

      {/* Complete State */}
      {state === 'complete' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-4 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/[0.15]">
            <CheckCircle size={16} className="text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-emerald-400">Import Complete</p>
              <p className="text-xs text-emerald-400/70 mt-0.5">{recordCount} records ready</p>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white/60 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
          >
            Upload Another File
          </button>
        </div>
      )}

      {/* Results State (shown for invalid CSVs) */}
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
              <p className="text-xs text-emerald-400">CSV is valid. Ready to proceed.</p>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/[0.08] border border-red-500/[0.15]">
              <AlertCircle size={14} className="text-red-400 shrink-0" />
              <p className="text-xs text-red-400">CSV has errors. Download the error report, fix issues, and re-upload.</p>
            </div>
          )}

          {/* Download Buttons */}
          <div className="flex items-center gap-2">
            {validationResult.errors.length > 0 && (
              <button
                onClick={handleDownloadErrors}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/[0.08] border border-red-500/[0.15] text-xs text-red-400 hover:bg-red-500/[0.12] transition-colors"
              >
                <FileText size={12} />
                Download errors.csv
              </button>
            )}
            {validationResult.warnings.length > 0 && (
              <button
                onClick={handleDownloadWarnings}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/[0.08] border border-amber-500/[0.15] text-xs text-amber-400 hover:bg-amber-500/[0.12] transition-colors"
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
              className="px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white/60 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
            >
              Upload Different File
            </button>
            <button
              onClick={handleProceed}
              disabled={validationResult.status === 'invalid'}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                validationResult.status === 'valid'
                  ? 'bg-white text-black hover:bg-white/90'
                  : 'bg-white/[0.04] text-white/30 cursor-not-allowed'
              }`}
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
