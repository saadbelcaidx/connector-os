/**
 * EnrichmentGate — Inline banner shown when enrichment is not configured
 *
 * Appears when user clicks [Queue Introduction] but lacks Apollo + email finder.
 * NOT a modal. Inline banner with status, explanation, and settings link.
 */

// =============================================================================
// TYPES
// =============================================================================

interface Props {
  apolloConnected: boolean;
  emailFinderConnected: boolean;
  onOpenSettings: () => void;
  onDismiss: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function EnrichmentGate({
  apolloConnected,
  emailFinderConnected,
  onOpenSettings,
  onDismiss,
}: Props) {
  return (
    <div
      className="relative border border-white/[0.08] rounded px-5 py-4"
      style={{ background: 'rgba(255,255,255,0.02)' }}
    >
      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        className="absolute top-3 right-3 text-white/20 hover:text-white/40 transition-colors"
        style={{
          background: 'none',
          border: 'none',
          outline: 'none',
          boxShadow: 'none',
          cursor: 'pointer',
          fontSize: '13px',
          lineHeight: 1,
          padding: '2px',
        }}
      >
        x
      </button>

      {/* Title */}
      <p className="font-mono text-[11px] text-white/60 mb-3">
        Enrichment requires Apollo + email finder
      </p>

      {/* Status lines */}
      <div className="space-y-1 mb-3">
        <p className="font-mono text-[10px]">
          {apolloConnected ? (
            <span className="text-emerald-400/70">
              {'v'} Connected
            </span>
          ) : (
            <span className="text-red-400/60">
              {'x'} Not configured
            </span>
          )}
          <span className="text-white/30 ml-2">Apollo</span>
        </p>

        <p className="font-mono text-[10px]">
          {emailFinderConnected ? (
            <span className="text-emerald-400/70">
              {'v'} Connected
            </span>
          ) : (
            <span className="text-red-400/60">
              {'x'} Not configured
            </span>
          )}
          <span className="text-white/30 ml-2">Email finder</span>
        </p>
      </div>

      {/* Explanation */}
      <div className="space-y-1 mb-4">
        <p className="font-mono text-[10px] text-white/30">
          Apollo finds company decision-makers.
        </p>
        <p className="font-mono text-[10px] text-white/30">
          Email finder verifies contact information.
        </p>
        <p className="font-mono text-[10px] text-white/30">
          Both are required for reliable introductions.
        </p>
      </div>

      {/* Action */}
      <button
        onClick={onOpenSettings}
        className="font-mono text-[11px] text-white/80 hover:bg-white/[0.12] rounded transition-colors"
        style={{
          height: '28px',
          padding: '0 12px',
          background: 'rgba(255,255,255,0.08)',
          outline: 'none',
          boxShadow: 'none',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        Open Settings
      </button>
    </div>
  );
}
