import { useState } from 'react';

interface DmcbStatusBarProps {
  accepted: number;
  quarantined: number;
  avgConfidence: number;
  quarantinedRecords?: Array<{ recordKey: string; payload: any }>;
}

function deriveReason(payload: any): string {
  if (!payload) return 'Low confidence';
  const domain = payload.domain || payload.website || payload.companyUrl;
  const company = payload.company || payload.companyName || payload.company_name;
  if (!domain && !company) return 'Missing identity';
  const label = payload.signalLabel || payload.label || payload.title || '';
  if (typeof label === 'string' && label.trim().split(/\s+/).length <= 1) return 'Intent too weak';
  return 'Low confidence';
}

export default function DmcbStatusBar({ accepted, quarantined, avgConfidence, quarantinedRecords }: DmcbStatusBarProps) {
  const [showQuarantine, setShowQuarantine] = useState(false);

  if (accepted === 0 && quarantined === 0) return null;

  return (
    <>
      <div className="flex items-center gap-5 px-4 py-1.5 border-b border-white/[0.04] bg-white/[0.01]">
        <span className="text-[9px] font-mono text-white/20 tracking-widest uppercase">
          INTENT SYNTHESIS
        </span>
        <span className="text-[10px] font-mono text-white/40">
          Accepted: <span className="text-white/60">{accepted}</span>
        </span>
        <span
          className="text-[10px] font-mono text-white/40 cursor-pointer hover:text-white/70"
          onClick={() => setShowQuarantine(true)}
        >
          Quarantined: <span className="text-white/60">{quarantined}</span>
        </span>
        <span className="text-[10px] font-mono text-white/40">
          Confidence: <span className="text-white/60">{avgConfidence.toFixed(2)}</span>
        </span>
        <span className="text-[10px] font-mono text-white/20">
          Source: DMCB
        </span>
      </div>

      {showQuarantine && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setShowQuarantine(false)}
        >
          <div
            className="w-[480px] max-h-[60vh] overflow-y-auto bg-[#09090b] border border-white/[0.10] rounded-sm [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <span className="text-[10px] font-mono text-white/40 tracking-widest uppercase">
                QUARANTINED SIGNALS
              </span>
              <button
                className="text-[11px] text-white/30 hover:text-white/60"
                onClick={() => setShowQuarantine(false)}
              >
                x
              </button>
            </div>
            <div className="p-5">
              {(!quarantinedRecords || quarantinedRecords.length === 0) ? (
                <span className="text-[11px] font-mono text-white/20">No quarantined signals</span>
              ) : (
                quarantinedRecords.map((record, i) => (
                  <div
                    key={record.recordKey + '-' + i}
                    className="py-2 border-b border-white/[0.04] last:border-0"
                  >
                    <span className="text-[11px] font-mono text-white/50">{record.recordKey}</span>
                    <span className="text-[11px] font-mono text-white/30 ml-3">{deriveReason(record.payload)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
