import { type ReactNode } from 'react';

interface StationSourcePanelProps {
  mode: 'market' | 'yourdata';
  onModeChange: (mode: 'market' | 'yourdata') => void;
  marketLocked?: boolean;
  children: ReactNode;
}

const MODES = [
  { key: 'market' as const, title: 'Prebuilt Market', subtitle: 'Pick a market pack or build custom filters.' },
  { key: 'yourdata' as const, title: 'Your Data', subtitle: 'Inject your dataset ID from Apify.' },
] as const;

export default function StationSourcePanel({ mode, onModeChange, marketLocked, children }: StationSourcePanelProps) {
  return (
    <div>
      <div className="flex gap-4 mb-8">
        {MODES.map((m) => {
          const selected = mode === m.key;
          const locked = m.key === 'market' && marketLocked;
          return (
            <button
              key={m.key}
              onClick={() => onModeChange(m.key)}
              className={`flex-1 px-5 py-4 rounded-sm border transition-colors cursor-pointer text-left ${
                selected
                  ? 'border-white/[0.12] bg-white/[0.04]'
                  : 'border-white/[0.06] bg-transparent hover:bg-white/[0.02]'
              }`}
              style={{ outline: 'none', boxShadow: 'none' }}
            >
              <div className="flex items-center gap-2">
                <p className={`font-mono text-[11px] ${selected ? 'text-white/90' : 'text-white/70'}`}>
                  {m.title}
                </p>
                {locked && (
                  <span
                    className="font-mono text-[8px] uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                    style={{ lineHeight: 1, background: 'rgba(251, 191, 36, 0.1)', color: 'rgba(251, 191, 36, 0.8)' }}
                  >
                    SSM
                  </span>
                )}
              </div>
              <p className="font-mono text-[10px] text-white/30 mt-1.5">
                {locked ? 'SSM members only. Click to verify access.' : m.subtitle}
              </p>
            </button>
          );
        })}
      </div>
      {children}
    </div>
  );
}
