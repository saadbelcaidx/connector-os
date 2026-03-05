import { type ReactNode } from 'react';

interface StationSourcePanelProps {
  mode: 'market' | 'yourdata';
  onModeChange: (mode: 'market' | 'yourdata') => void;
  children: ReactNode;
}

const MODES = [
  { key: 'market' as const, title: 'Prebuilt Market', subtitle: 'Pick a market pack or build custom filters.' },
  { key: 'yourdata' as const, title: 'Your Data', subtitle: 'Inject your dataset ID from Apify.' },
] as const;

export default function StationSourcePanel({ mode, onModeChange, children }: StationSourcePanelProps) {
  return (
    <div>
      <div className="flex gap-4 mb-8">
        {MODES.map((m) => {
          const selected = mode === m.key;
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
              <p className={`font-mono text-[11px] ${selected ? 'text-white/90' : 'text-white/70'}`}>
                {m.title}
              </p>
              <p className="font-mono text-[10px] text-white/30 mt-1.5">
                {m.subtitle}
              </p>
            </button>
          );
        })}
      </div>
      {children}
    </div>
  );
}
