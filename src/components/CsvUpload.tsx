/**
 * CsvUpload.tsx — CSV Upload + Column Mapping + Signal Prefix + Validation + Normalization
 *
 * Flow: Upload → Auto-detect columns → (Mapper UI if needed) → Validate → Normalize → Done
 *
 * Column mapper renames user columns to canonical names BEFORE validation runs.
 * Validation sees perfect headers every time. Everything downstream is identical.
 */

import { useState, useRef, useMemo, useEffect } from 'react';
import { Upload, Download, FileText, AlertCircle, CheckCircle, AlertTriangle, X, Check, ChevronDown } from 'lucide-react';
import Papa from 'papaparse';
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
type CsvUploadState = 'idle' | 'mapping' | 'validating' | 'normalizing' | 'results' | 'complete';

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

const CANONICAL_FIELDS = [
  'Company Name',
  'Full Name',
  'Domain',
  'Email',
  'Signal',
  'Title',
  'Context',
  'LinkedIn URL',
] as const;

const REQUIRED_FIELDS = ['Company Name', 'Signal'];

/** Map from canonical field name to known aliases (all lowercase for matching) */
const AUTO_MAP: Record<string, string[]> = {
  'Company Name': ['company_name', 'company', 'organization', 'org', 'company name', 'organization name', 'org name', 'account', 'account name'],
  'Full Name': ['full_name', 'name', 'contact_name', 'contact', 'full name', 'person', 'person name', 'contact name', 'first name', 'first_name'],
  'Domain': ['domain', 'website', 'company_url', 'url', 'company url', 'company_domain', 'company domain', 'website url', 'web'],
  'Email': ['email', 'email_address', 'contact_email', 'work_email', 'email address', 'contact email', 'work email', 'e-mail'],
  'Signal': ['signal', 'hiring_signal', 'job_title', 'job title', 'position', 'role', 'hiring signal', 'trigger', 'intent signal', 'intent_signal'],
  'Title': ['title', 'person title', 'contact title', 'seniority'],
  'Context': ['context', 'description', 'company_description', 'service_description', 'notes', 'about', 'summary', 'company description', 'bio'],
  'LinkedIn URL': ['linkedin', 'linkedin_url', 'linkedin url', 'profile_url', 'profile url', 'linkedin profile', 'li_url'],
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

/**
 * Auto-detect column mappings from raw headers.
 * Returns a map: canonical field name -> user's column name.
 * Only maps when there's an unambiguous match.
 */
export function autoDetectMappings(rawHeaders: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const usedHeaders = new Set<string>();

  // First pass: exact canonical match (case-insensitive)
  for (const canonical of CANONICAL_FIELDS) {
    const exactMatch = rawHeaders.find(
      h => h.toLowerCase().trim() === canonical.toLowerCase() && !usedHeaders.has(h)
    );
    if (exactMatch) {
      map[canonical] = exactMatch;
      usedHeaders.add(exactMatch);
    }
  }

  // Second pass: alias matching for unmapped fields
  for (const canonical of CANONICAL_FIELDS) {
    if (map[canonical]) continue;
    const aliases = AUTO_MAP[canonical] || [];
    const match = rawHeaders.find(
      h => aliases.includes(h.toLowerCase().trim()) && !usedHeaders.has(h)
    );
    if (match) {
      map[canonical] = match;
      usedHeaders.add(match);
    }
  }

  return map;
}

/**
 * Apply column mapping + signal prefix to raw rows.
 * Returns rows with canonical column names.
 */
export function applyMapping(
  rawRows: Record<string, string>[],
  columnMap: Record<string, string>,
  signalPrefix: string
): Record<string, string>[] {
  return rawRows.map(row => {
    const mapped: Record<string, string> = {};
    for (const [canonical, userCol] of Object.entries(columnMap)) {
      if (userCol && userCol !== '' && row[userCol] !== undefined) {
        mapped[canonical] = row[userCol];
      }
    }
    if (signalPrefix && mapped['Signal']) {
      mapped['Signal'] = `${signalPrefix} ${mapped['Signal']}`;
    }
    return mapped;
  });
}

/**
 * Serialize rows back to CSV text for validateCsv().
 */
export function serializeRowsToCsv(rows: Record<string, string>[]): string {
  if (rows.length === 0) return '';
  const allKeys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      allKeys.add(key);
    }
  }
  const headers = Array.from(allKeys);
  return Papa.unparse({ fields: headers, data: rows });
}

// =============================================================================
// CUSTOM SELECT (Linear-style — matches PrebuiltIntelligence.tsx)
// =============================================================================

interface MapperSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

function MapperSelect({
  value,
  onChange,
  options,
  placeholder = '-- skip --',
}: {
  value: string;
  onChange: (value: string) => void;
  options: MapperSelectOption[];
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);
  const displayLabel = selectedOption?.label || placeholder;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex(prev => {
            let next = prev + 1;
            while (next < options.length && options[next].disabled) next++;
            return next < options.length ? next : prev;
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex(prev => {
            let next = prev - 1;
            while (next >= 0 && options[next].disabled) next--;
            return next >= 0 ? next : prev;
          });
          break;
        case 'Enter':
          e.preventDefault();
          if (highlightedIndex >= 0 && !options[highlightedIndex].disabled) {
            onChange(options[highlightedIndex].value);
            setIsOpen(false);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          break;
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, highlightedIndex, options, onChange]);

  useEffect(() => {
    if (isOpen) {
      const currentIndex = options.findIndex(opt => opt.value === value);
      setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [isOpen, options, value]);

  useEffect(() => {
    if (isOpen && listRef.current && highlightedIndex >= 0) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement;
      if (item) item.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full h-9 px-3 text-left text-[13px]
          bg-[#141414] border rounded-lg
          flex items-center justify-between gap-2
          transition-all duration-150 ease-out
          ${isOpen
            ? 'border-white/20 bg-[#1A1A1A] shadow-[0_0_0_1px_rgba(255,255,255,0.05)]'
            : 'border-white/[0.08] hover:border-white/[0.12] hover:bg-[#181818]'
          }
        `}
      >
        <span className={selectedOption ? 'text-white/90 truncate' : 'text-white/40 truncate'}>
          {displayLabel}
        </span>
        <ChevronDown
          className={`
            w-3.5 h-3.5 text-white/40 flex-shrink-0
            transition-transform duration-200 ease-out
            ${isOpen ? 'rotate-180' : ''}
          `}
        />
      </button>

      {isOpen && (
        <div
          ref={listRef}
          className="
            absolute z-[100] w-full mt-1
            bg-[#1A1A1A] border border-white/[0.1] rounded-lg
            shadow-[0_4px_24px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.03)]
            overflow-hidden
            max-h-[240px] overflow-y-auto
          "
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255,255,255,0.1) transparent',
          }}
        >
          {/* Skip option */}
          <button
            type="button"
            onClick={() => { onChange(''); setIsOpen(false); }}
            onMouseEnter={() => setHighlightedIndex(-1)}
            className={`
              w-full px-3 py-2 text-left text-[13px]
              transition-colors duration-75
              flex items-center justify-between
              ${!value ? 'text-white bg-white/[0.06]' : 'text-white/40 hover:text-white/60 hover:bg-white/[0.03]'}
            `}
          >
            <span>-- skip --</span>
            {!value && <Check className="w-3.5 h-3.5 text-white/60" />}
          </button>

          {options.map((option, index) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                if (!option.disabled) {
                  onChange(option.value);
                  setIsOpen(false);
                }
              }}
              onMouseEnter={() => { if (!option.disabled) setHighlightedIndex(index); }}
              className={`
                w-full px-3 py-2 text-left text-[13px]
                transition-colors duration-75
                flex items-center justify-between
                ${option.disabled
                  ? 'text-white/20 cursor-not-allowed'
                  : option.value === value
                    ? 'text-white bg-white/[0.06]'
                    : 'text-white/70 hover:text-white/90'
                }
                ${!option.disabled && highlightedIndex === index && option.value !== value
                  ? 'bg-white/[0.04]'
                  : ''
                }
              `}
            >
              <span className="truncate">{option.label}</span>
              {option.value === value && !option.disabled && (
                <Check className="w-3.5 h-3.5 text-white/60 flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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

  // Column mapping state
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [signalPrefix, setSignalPrefix] = useState<string>('');
  const [columnSamples, setColumnSamples] = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if all required fields are mapped
  const requiredMapped = useMemo(() => {
    return REQUIRED_FIELDS.every(f => columnMap[f] && columnMap[f] !== '');
  }, [columnMap]);

  // Set of columns already claimed by a mapping (for dropdown exclusion)
  const usedColumns = useMemo(() => {
    const used = new Set<string>();
    for (const val of Object.values(columnMap)) {
      if (val && val !== '') used.add(val);
    }
    return used;
  }, [columnMap]);

  // Core normalization
  const proceedWithNormalization = async (rows: Record<string, string>[], uploadIdOverride?: string) => {
    if (rows.length === 0) return;

    setState('normalizing');
    setError(null);

    const effectiveUploadId = uploadIdOverride || uploadId || generateUploadId();

    try {
      const { records } = normalizeCsvRecords({
        rows: rows as any,
        side,
        uploadId: effectiveUploadId,
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

  // Run validation on mapped rows (serializes to CSV text, feeds to existing validateCsv)
  const runValidation = async (mappedRows: Record<string, string>[], newUploadId: string) => {
    setState('validating');

    try {
      const csvText = serializeRowsToCsv(mappedRows);
      const { result, rows } = validateCsv(csvText, side);

      setValidationResult(result);
      setParsedRows(rows);
      onValidated?.(result, rows);

      if (result.status === 'valid' && rows.length > 0) {
        await proceedWithNormalization(rows, newUploadId);
      } else {
        setState('results');
      }
    } catch (err) {
      setError('Validation failed. Please check your file and try again.');
      setState('idle');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset all state
    setError(null);
    setValidationResult(null);
    setParsedRows([]);
    setRecordCount(0);
    setRawHeaders([]);
    setRawRows([]);
    setColumnMap({});
    setSignalPrefix('');
    setColumnSamples({});

    const newUploadId = generateUploadId();
    setUploadId(newUploadId);

    if (!file.name.endsWith('.csv')) {
      setError('Please upload a CSV file (.csv)');
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`);
      return;
    }

    try {
      const text = await file.text();

      // Parse with Papa Parse to get headers
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim(),
        transform: (value) => value.trim(),
      });

      const headers = parsed.meta.fields || [];
      const rows = parsed.data;

      if (headers.length === 0 || rows.length === 0) {
        setError('CSV is empty or has no valid rows.');
        return;
      }

      // Cache first non-empty value per column for sample preview
      const samples: Record<string, string> = {};
      for (const h of headers) {
        for (const row of rows) {
          const val = row[h]?.trim();
          if (val) {
            samples[h] = val.length > 30 ? val.slice(0, 30) + '...' : val;
            break;
          }
        }
      }
      setColumnSamples(samples);

      // Auto-detect column mappings
      const detected = autoDetectMappings(headers);
      const allRequiredMapped = REQUIRED_FIELDS.every(f => detected[f] && detected[f] !== '');

      // Check if headers are already canonical (exact match)
      const isAlreadyCanonical = REQUIRED_FIELDS.every(f => headers.includes(f));

      if (isAlreadyCanonical || allRequiredMapped) {
        // Required fields resolved (canonical or auto-detected).
        // Always apply mapping so optional columns (e.g. lowercase 'email'
        // from Anymail Finder) get renamed to canonical 'Email'.
        const mappedRows = applyMapping(rows, detected, '');
        await runValidation(mappedRows, newUploadId);
      } else {
        // Need user input — show mapper
        setRawHeaders(headers);
        setRawRows(rows);
        setColumnMap(detected);
        setState('mapping');
      }
    } catch (err) {
      setError('Failed to read file. Please try again.');
      setState('idle');
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // User clicks "Process" in mapping UI
  const handleProcessMapping = async () => {
    const mappedRows = applyMapping(rawRows, columnMap, signalPrefix);
    const newUploadId = uploadId || generateUploadId();
    await runValidation(mappedRows, newUploadId);
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
    setRawHeaders([]);
    setRawRows([]);
    setColumnMap({});
    setSignalPrefix('');
    setColumnSamples({});
  };

  const handleProceed = () => proceedWithNormalization(parsedRows);

  const sideLabel = side === 'demand' ? 'Demand' : 'Supply';

  // Count how many fields are mapped (for progress display)
  const mappedCount = Object.values(columnMap).filter(v => v && v !== '').length;
  const autoDetectedFields = useMemo(() => {
    if (rawHeaders.length === 0) return new Set<string>();
    const detected = autoDetectMappings(rawHeaders);
    return new Set(Object.keys(detected));
  }, [rawHeaders]);

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

      {/* Column Mapping UI */}
      {state === 'mapping' && (
        <div className="space-y-4">
          {/* Mapping header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white/90">Map columns</p>
              <p className="text-xs text-white/40 mt-0.5">{rawRows.length} rows · {mappedCount} of {CANONICAL_FIELDS.length} fields mapped</p>
            </div>
          </div>

          {/* Column mapping rows */}
          <div className="space-y-2">
            {CANONICAL_FIELDS.map((canonical) => {
              const isRequired = REQUIRED_FIELDS.includes(canonical);
              const currentMapping = columnMap[canonical] || '';
              const isAutoDetected = autoDetectedFields.has(canonical);
              const sampleValue = currentMapping ? columnSamples[currentMapping] : '';

              return (
                <div key={canonical} className="flex items-center gap-3">
                  {/* Canonical field label */}
                  <div className="w-28 shrink-0">
                    <span className={`text-xs ${isRequired ? 'text-white/80 font-medium' : 'text-white/50'}`}>
                      {canonical}
                      {isRequired && <span className="text-red-400/70 ml-0.5">*</span>}
                    </span>
                  </div>

                  {/* Arrow */}
                  <span className="text-white/20 text-xs shrink-0">&larr;</span>

                  {/* Dropdown */}
                  <div className="flex-1">
                    <MapperSelect
                      value={currentMapping}
                      onChange={(v) => {
                        setColumnMap(prev => ({ ...prev, [canonical]: v }));
                      }}
                      options={rawHeaders.map(h => ({
                        value: h,
                        label: h,
                        disabled: usedColumns.has(h) && currentMapping !== h,
                      }))}
                    />
                  </div>

                  {/* Auto-detected indicator */}
                  <div className="w-5 shrink-0 flex items-center justify-center">
                    {isAutoDetected && currentMapping && (
                      <Check size={12} className="text-emerald-400/60" />
                    )}
                  </div>

                  {/* Sample data preview */}
                  {sampleValue && (
                    <span className="text-[10px] text-white/30 truncate max-w-[120px] shrink-0" title={sampleValue}>
                      "{sampleValue}"
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Skipped columns notice */}
          {(() => {
            const skippedCount = rawHeaders.length - usedColumns.size;
            return skippedCount > 0 ? (
              <p className="text-[10px] text-white/30">{skippedCount} column{skippedCount !== 1 ? 's' : ''} skipped</p>
            ) : null;
          })()}

          {/* Signal prefix */}
          <div className="pt-3 border-t border-white/[0.06]">
            <label className="block">
              <span className="text-xs text-white/50">Signal prefix</span>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('connector-assistant:open', { detail: { question: 'What does signal prefix do in CSV upload?' } }))}
                className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/[0.06] border border-white/[0.1] text-[9px] text-white/40 hover:text-white/70 hover:bg-white/[0.1] hover:border-white/[0.2] transition-all duration-200 cursor-pointer"
                title="Ask Connector"
              >?</button>
              <input
                type="text"
                value={signalPrefix}
                onChange={(e) => setSignalPrefix(e.target.value)}
                placeholder='e.g. "Hiring" or "Funding"'
                className="mt-1.5 w-full h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13px] text-white/90 placeholder:text-white/25 transition-all duration-200 hover:bg-white/[0.06] hover:border-white/[0.12] focus:outline-none focus:border-white/20 focus:ring-1 focus:ring-white/10"
              />
            </label>
            {signalPrefix && (() => {
              const signalCol = columnMap['Signal'];
              const affectedCount = signalCol
                ? rawRows.filter(r => r[signalCol]?.trim()).length
                : 0;
              return (
                <p className="mt-1.5 text-[10px] text-white/30">
                  Will prefix {affectedCount} signal{affectedCount !== 1 ? 's' : ''}
                </p>
              );
            })()}
          </div>

          {/* Context enrichment placeholder */}
          <div className="flex items-center gap-2 opacity-40 cursor-not-allowed">
            <div className="w-3.5 h-3.5 rounded border border-white/20" />
            <span className="text-[11px] text-white/40">Generate context (coming soon)</span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white/60 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleProcessMapping}
              disabled={!requiredMapped}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                requiredMapped
                  ? 'bg-white text-black hover:bg-white/90'
                  : 'bg-white/[0.04] text-white/30 cursor-not-allowed'
              }`}
            >
              Process
            </button>
          </div>
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
