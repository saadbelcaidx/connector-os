import type { CanonicalSignal } from '../../dmcb/types';

interface IntentCardPreviewProps {
  signal?: CanonicalSignal | null;
}

function ReadinessBadge({ confidence }: { confidence: string }) {
  if (confidence === 'high') {
    return (
      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">
        READY
      </span>
    );
  }
  if (confidence === 'medium') {
    return (
      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-blue-400/10 text-blue-400 border border-blue-400/20">
        WARMING
      </span>
    );
  }
  return (
    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-white/[0.04] text-white/30 border border-white/[0.08]">
      NOT YET
    </span>
  );
}

export default function IntentCardPreview({ signal }: IntentCardPreviewProps) {
  if (!signal) return null;

  const fields: Array<{ label: string; value: React.ReactNode }> = [
    { label: 'WHO', value: signal.intent.who },
    { label: 'WANTS', value: signal.intent.wants },
    { label: 'WHY NOW', value: signal.intent.why_now || '\u2014' },
    { label: 'CONF', value: <ReadinessBadge confidence={signal.intent.confidence} /> },
    { label: 'SEGMENT', value: signal.segment },
    { label: 'PARTY', value: signal.party.domain || signal.party.company || '\u2014' },
  ];

  return (
    <div className="px-4 py-3 bg-white/[0.02] border border-white/[0.06] rounded-sm">
      <div className="text-[9px] font-mono text-white/20 tracking-widest uppercase mb-3">
        CANONICAL INTENT
      </div>
      <div className="space-y-2">
        {fields.map((field) => (
          <div key={field.label} className="flex items-start gap-3">
            <span className="w-16 shrink-0 text-[10px] font-mono text-white/40 tracking-widest uppercase">
              {field.label}
            </span>
            <span className="text-[11px] font-mono text-white/60">
              {field.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
