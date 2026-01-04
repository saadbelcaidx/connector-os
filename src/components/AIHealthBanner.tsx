import { useEffect, useState } from 'react';
import { AlertTriangle, Settings, X } from 'lucide-react';
import { getDisabledProvider, AIHealthStatus, setProviderDisabledCallback } from '../services/AIService';

interface AIHealthBannerProps {
  onFixConfig?: () => void;
  className?: string;
}

const providerLabels: Record<string, string> = {
  azure: 'Azure OpenAI',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

// Convert raw error to human-readable message
function getHumanReadableError(error: string): string {
  if (error.includes('Invalid Azure endpoint format')) {
    return 'Invalid endpoint URL';
  }
  if (error.includes('CORS') || error.includes('cors')) {
    return 'Connection blocked';
  }
  if (error.includes('401') || error.includes('Unauthorized')) {
    return 'Invalid API key';
  }
  if (error.includes('404') || error.includes('not found')) {
    return 'Endpoint not found';
  }
  if (error.includes('timeout') || error.includes('Timeout')) {
    return 'Connection timeout';
  }
  if (error.includes('network') || error.includes('Network')) {
    return 'Network error';
  }
  // Keep it short and clean
  if (error.length > 30) {
    return 'Configuration issue';
  }
  return error;
}

export function AIHealthBanner({ onFixConfig, className = '' }: AIHealthBannerProps) {
  const [disabledProvider, setDisabledProvider] = useState<AIHealthStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check initial state
    setDisabledProvider(getDisabledProvider());

    // Listen for new failures
    setProviderDisabledCallback((provider, error) => {
      setDisabledProvider({
        provider: provider as 'azure' | 'openai' | 'anthropic',
        status: 'disabled',
        error,
      });
      setDismissed(false); // Show banner again on new failure
    });

    // Poll for changes (in case cache expires)
    const interval = setInterval(() => {
      const current = getDisabledProvider();
      if (!current) {
        setDisabledProvider(null);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  if (!disabledProvider || dismissed) {
    return null;
  }

  const providerName = providerLabels[disabledProvider.provider] || disabledProvider.provider;
  const errorMessage = disabledProvider.error || 'Configuration error';
  const displayError = getHumanReadableError(errorMessage);

  return (
    <div
      className={`
        flex items-center gap-3 px-3 py-2.5
        bg-amber-500/[0.06] rounded-lg
        ${className}
      `}
    >
      {/* Icon */}
      <div className="flex-shrink-0">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400/70" />
      </div>

      {/* Message */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-white/50 tracking-tight">
          <span className="text-white/70">{providerName}</span>
          {' · '}
          {displayError}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {onFixConfig && (
          <button
            onClick={onFixConfig}
            className="
              px-2 py-1 text-[11px] font-medium
              text-amber-400/80 hover:text-amber-300
              hover:bg-white/[0.04] rounded
              transition-colors duration-150
            "
          >
            Fix
          </button>
        )}

        <button
          onClick={() => setDismissed(true)}
          className="
            p-1 text-white/30 hover:text-white/50
            hover:bg-white/[0.04] rounded
            transition-colors duration-150
          "
          title="Dismiss"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
