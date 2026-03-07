/**
 * AnalyzeModal — Dataset diagnostics before Run.
 * Station design system (Linear x Palantir). 560px modal.
 *
 * Shows per-side diagnostics: total records, company extraction, domain extraction,
 * average confidence, coverage bars, guidance messages.
 * Run button gated on company name from both sides.
 */

// ---------------------------------------------------------------------------
// Types — co-located (only this component uses them)
// ---------------------------------------------------------------------------

export interface SideDiagnostic {
  total: number;
  extracted: number;
  errors: number;
  companyFound: number;
  domainFound: number;
  avgConfidence: number;
  missingFields: string[];
}

export interface AnalyzeDiagnostics {
  demand: SideDiagnostic;
  supply: SideDiagnostic;
  canRun: boolean;
}

interface AnalyzeModalProps {
  diagnostics: AnalyzeDiagnostics;
  onRun: () => void;
  onClose: () => void;
  onExport?: () => void;
  launching?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(n: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((n / total) * 100);
}

function CoverageBar({ value, total }: { value: number; total: number }) {
  const p = pct(value, total);
  return (
    <div className="w-full h-[2px] bg-white/[0.06] mt-1">
      <div
        className="h-full bg-emerald-500/60 transition-all duration-500"
        style={{ width: `${p}%` }}
      />
    </div>
  );
}

function SideColumn({ label, diag }: { label: string; diag: SideDiagnostic }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="font-mono text-[9px] text-white/30 tracking-widest uppercase mb-4">
        {label} &middot; {diag.total} records
      </p>

      {/* Company */}
      <div className="mb-3">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[11px] text-white/50">company</span>
          <span className="font-mono text-[11px] text-white/70">
            {diag.companyFound} / {diag.total}
          </span>
        </div>
        <CoverageBar value={diag.companyFound} total={diag.total} />
        <span className="font-mono text-[10px] text-white/20 mt-0.5 block text-right">
          {pct(diag.companyFound, diag.total)}%
        </span>
      </div>

      {/* Domain */}
      <div className="mb-3">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[11px] text-white/50">domain</span>
          <span className="font-mono text-[11px] text-white/70">
            {diag.domainFound} / {diag.total}
          </span>
        </div>
        <CoverageBar value={diag.domainFound} total={diag.total} />
        <span className="font-mono text-[10px] text-white/20 mt-0.5 block text-right">
          {pct(diag.domainFound, diag.total)}%
        </span>
      </div>

{/* Confidence hidden — internal metric, not user-facing */}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AnalyzeModal({ diagnostics, onRun, onClose, onExport, launching }: AnalyzeModalProps) {
  const { demand, supply, canRun } = diagnostics;

  // Guidance — always exactly one section. Factual, calm, non-defensive.
  const demandIdentity = Math.max(demand.companyFound, demand.domainFound);
  const supplyIdentity = Math.max(supply.companyFound, supply.domainFound);
  const demandNoIdentity = Math.max(0, demand.total - demandIdentity);
  const supplyNoIdentity = Math.max(0, supply.total - supplyIdentity);
  const pl = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const messages: string[] = [];

  if (demand.total === 0 || supply.total === 0) {
    if (demand.total === 0 && supply.total === 0) {
      messages.push('Both datasets returned no records.');
    } else if (demand.total === 0) {
      messages.push('Demand dataset returned no records.');
    } else {
      messages.push('Supply dataset returned no records.');
    }
  } else {
    const bothZero = demand.extracted === 0 && supply.extracted === 0;
    if (bothZero) {
      messages.push('No records were extracted. Check your API key in Settings.');
    } else {
      // Identity warnings — kept
      if (demandNoIdentity > 0 && supplyNoIdentity > 0) {
        messages.push(
          `${demandNoIdentity} demand and ${supplyNoIdentity} supply records have no company or domain.`
          + (canRun ? ' Records with identity produce better results.' : '')
        );
      } else if (demandNoIdentity > 0) {
        messages.push(`${demandNoIdentity} demand records have no company or domain.`);
      } else if (supplyNoIdentity > 0) {
        messages.push(`${supplyNoIdentity} supply records have no company or domain.`);
      }

      // Low confidence — kept
      const avgAll = (demand.extracted + supply.extracted) > 0
        ? (demand.avgConfidence * demand.extracted + supply.avgConfidence * supply.extracted)
          / (demand.extracted + supply.extracted)
        : 0;
      if (avgAll > 0 && avgAll < 0.4) {
        messages.push('Confidence is low across this dataset. Records with richer fields produce better results.');
      }

      // Positive feedback — when no warnings and canRun
      if (messages.length === 0 && canRun) {
        messages.push(`${pl(demandIdentity, 'demand record')} · ${pl(supplyIdentity, 'supply record')} ready.`);
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-[560px] max-h-[80vh] bg-[#09090b] border border-white/[0.10] rounded-sm overflow-auto"
        style={{ animation: 'stSlideIn 200ms ease both' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <span className="text-[13px] text-white/90 font-medium font-mono">
            Dataset Analysis
          </span>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/60 transition-colors font-mono text-[13px] cursor-pointer"
            style={{ outline: 'none' }}
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pb-6">
          {/* Side columns */}
          <div className="flex gap-8">
            <SideColumn label="Demand" diag={demand} />
            <SideColumn label="Supply" diag={supply} />
          </div>

          {/* Guidance */}
          {messages.length > 0 && (
            <div className="mt-6 pt-4 border-t border-white/[0.06]">
              {messages.map((msg, i) => (
                <p key={i} className="font-mono text-[11px] text-white/40 leading-relaxed">
                  {msg}
                </p>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-center gap-3 mt-8 mb-2">
            {onExport && (
              <button
                onClick={onExport}
                style={{
                  height: '36px',
                  padding: '0 20px',
                  fontSize: '11px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'transparent',
                  outline: 'none',
                  cursor: 'pointer',
                }}
                className="font-mono rounded text-white/40 hover:text-white/70 hover:border-white/[0.15] transition-colors"
              >
                Export CSV
              </button>
            )}
            <button
              disabled={!canRun || launching}
              onClick={onRun}
              style={{
                height: '36px',
                padding: '0 32px',
                fontSize: '11px',
                border: '1px solid rgba(255,255,255,0.15)',
                background: launching ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.12)',
                outline: 'none',
                boxShadow: canRun && !launching ? '0 0 20px rgba(255,255,255,0.06)' : 'none',
                opacity: canRun ? 1 : 0.25,
                cursor: canRun && !launching ? 'pointer' : 'not-allowed',
              }}
              className="font-mono rounded text-white hover:bg-white/[0.18] transition-colors"
            >
              {launching ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 border border-white/60 border-t-transparent rounded-full animate-spin" />
                  Launching…
                </span>
              ) : 'Run'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
