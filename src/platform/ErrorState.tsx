/**
 * ERROR STATE — Minimal, clean, Linear feel
 */

import { AlertCircle, RefreshCw, Settings, ChevronLeft } from 'lucide-react';

export type ErrorType = 'no_results' | 'source_unavailable' | 'config_not_found' | 'network_error';

interface ErrorStateProps {
  type: ErrorType;
  onRetry?: () => void;
  onBack?: () => void;
  onSettings?: () => void;
}

const ERRORS: Record<ErrorType, { title: string; description: string }> = {
  no_results: {
    title: 'No alignments found',
    description: 'Try adjusting your criteria or expanding parameters.',
  },
  source_unavailable: {
    title: 'Source unavailable',
    description: 'One or more signal sources are temporarily unavailable.',
  },
  config_not_found: {
    title: 'Platform not configured',
    description: 'Complete platform setup in Settings.',
  },
  network_error: {
    title: 'Connection error',
    description: 'Check your connection and try again.',
  },
};

export default function ErrorState({ type, onRetry, onBack, onSettings }: ErrorStateProps) {
  const error = ERRORS[type];

  return (
    <div className="text-center max-w-xs mx-auto">
      {/* Icon */}
      <div className="w-12 h-12 rounded-xl bg-white/[0.03] flex items-center justify-center mx-auto mb-5">
        <AlertCircle className="w-5 h-5 text-white/25" />
      </div>

      {/* Text */}
      <h3 className="text-[16px] font-medium text-white/90 mb-1.5">
        {error.title}
      </h3>
      <p className="text-[14px] text-white/40 leading-relaxed mb-8">
        {error.description}
      </p>

      {/* Actions */}
      <div className="flex gap-2.5 justify-center">
        {type === 'config_not_found' && onSettings && (
          <button
            onClick={onSettings}
            className="
              h-10 px-5 rounded-xl flex items-center gap-2
              text-[14px] font-medium
              bg-white text-[#08090a]
              hover:scale-[1.02] active:scale-[0.98]
              shadow-[0_0_20px_rgba(255,255,255,0.08)]
              transition-all duration-150
            "
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
        )}

        {type !== 'config_not_found' && (
          <>
            {onBack && (
              <button
                onClick={onBack}
                className="
                  h-10 px-4 rounded-xl flex items-center gap-1.5
                  text-[14px] text-white/45
                  hover:text-white/70 hover:bg-white/[0.04]
                  active:scale-[0.98]
                  transition-all duration-150
                "
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            )}
            {onRetry && (
              <button
                onClick={onRetry}
                className="
                  h-10 px-5 rounded-xl flex items-center gap-2
                  text-[14px] font-medium
                  bg-white text-[#08090a]
                  hover:scale-[1.02] active:scale-[0.98]
                  shadow-[0_0_20px_rgba(255,255,255,0.08)]
                  transition-all duration-150
                "
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
