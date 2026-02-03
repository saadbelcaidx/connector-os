/**
 * LOADING STATE — Smooth, immersive, Linear feel
 */

import { useState, useEffect } from 'react';
import { Search, Database, Brain, CheckCircle, Loader2 } from 'lucide-react';

interface LoadingStateProps {
  onComplete: () => void;
}

const STEPS = [
  { icon: Search, label: 'Analyzing requirements', duration: 800 },
  { icon: Database, label: 'Querying signal sources', duration: 1000 },
  { icon: Brain, label: 'Identifying alignments', duration: 1200 },
  { icon: CheckCircle, label: 'Ranking results', duration: 500 },
];

export default function LoadingState({ onComplete }: LoadingStateProps) {
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState<number[]>([]);

  useEffect(() => {
    if (step >= STEPS.length) {
      setTimeout(onComplete, 300);
      return;
    }

    const timer = setTimeout(() => {
      setCompleted(prev => [...prev, step]);
      setStep(prev => prev + 1);
    }, STEPS[step].duration);

    return () => clearTimeout(timer);
  }, [step, onComplete]);

  return (
    <div className="w-full max-w-xs">
      <div className="space-y-1.5">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === step;
          const isDone = completed.includes(i);
          const isPending = i > step;

          return (
            <div
              key={i}
              className={`
                flex items-center gap-3.5 px-3.5 py-3 rounded-xl
                transition-all duration-300 ease-out
                ${isActive ? 'bg-white/[0.04]' : ''}
              `}
              style={{
                opacity: isPending ? 0.4 : 1,
                transform: isActive ? 'scale(1.01)' : 'scale(1)',
              }}
            >
              {/* Icon container */}
              <div className={`
                w-8 h-8 rounded-lg flex items-center justify-center
                transition-all duration-300
                ${isDone
                  ? 'bg-emerald-500/10'
                  : isActive
                    ? 'bg-white/[0.06]'
                    : 'bg-white/[0.02]'
                }
              `}>
                {isActive ? (
                  <Loader2 className="w-4 h-4 text-white/60 animate-spin" />
                ) : (
                  <Icon className={`
                    w-4 h-4 transition-colors duration-300
                    ${isDone ? 'text-emerald-400' : 'text-white/20'}
                  `} />
                )}
              </div>

              {/* Label */}
              <span className={`
                text-[14px] transition-colors duration-300
                ${isDone
                  ? 'text-white/50'
                  : isActive
                    ? 'text-white/80'
                    : 'text-white/25'
                }
              `}>
                {s.label}
              </span>

              {/* Checkmark */}
              {isDone && (
                <CheckCircle className="w-4 h-4 text-emerald-400 ml-auto" />
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="mt-6 h-1 bg-white/[0.04] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-white/20 to-white/40 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${(step / STEPS.length) * 100}%` }}
        />
      </div>

      {/* Status text */}
      <p className="mt-4 text-center text-[12px] text-white/25">
        {step < STEPS.length ? STEPS[step].label : 'Complete'}
      </p>
    </div>
  );
}
