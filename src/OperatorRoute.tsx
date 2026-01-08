import { useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, ArrowLeft, Loader2 } from 'lucide-react';
import Dock from './Dock';

/**
 * OperatorRoute - Secure gate for operator-only routes
 *
 * SECURITY: Uses a secret passphrase stored in .env
 * Non-operators get a 403-style locked screen
 *
 * Usage: Wrap any operator route with <OperatorRoute>...</OperatorRoute>
 */

const OPERATOR_SECRET_KEY = 'operator_secret_verified';
const OPERATOR_SECRET = import.meta.env.VITE_OPERATOR_SECRET || '';

// If no secret is set in env, block all access (fail closed)
const OPERATOR_ENABLED = OPERATOR_SECRET.length > 0;

interface OperatorRouteProps {
  children: ReactNode;
}

export default function OperatorRoute({ children }: OperatorRouteProps) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'locked' | 'unlocked'>('loading');
  const [inputSecret, setInputSecret] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if operator is already verified
    const verified = localStorage.getItem(OPERATOR_SECRET_KEY);

    if (!OPERATOR_ENABLED) {
      // No secret configured - fail closed (block access)
      console.warn('[OperatorRoute] No VITE_OPERATOR_SECRET configured - access blocked');
      setStatus('locked');
      return;
    }

    if (verified === 'true') {
      setStatus('unlocked');
    } else {
      setStatus('locked');
    }
  }, []);

  const handleUnlock = () => {
    if (inputSecret === OPERATOR_SECRET) {
      localStorage.setItem(OPERATOR_SECRET_KEY, 'true');
      setStatus('unlocked');
      setError(null);
    } else {
      setError('Invalid passphrase');
      setInputSecret('');
    }
  };

  // Loading state
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border border-white/[0.08] flex items-center justify-center mx-auto mb-4">
            <Loader2 size={18} className="animate-spin text-white/50" />
          </div>
          <p className="text-[13px] text-white/40 font-medium">Verifying access</p>
        </div>
        <Dock />
      </div>
    );
  }

  // Locked state
  if (status === 'locked') {
    return (
      <div className="min-h-screen bg-[#0A0A0A]">
        <div className="max-w-sm mx-auto px-6 pt-32">
          <div className="flex justify-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-red-500/[0.08] border border-red-500/20 flex items-center justify-center">
              <Lock size={20} className="text-red-400/60" />
            </div>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-[17px] font-semibold text-white/90 mb-2 tracking-[-0.01em]">
              Operator Access Required
            </h1>
            <p className="text-[13px] text-white/35 leading-relaxed">
              {OPERATOR_ENABLED
                ? 'Enter the operator passphrase to continue.'
                : 'Operator access is not configured.'}
            </p>
          </div>

          {OPERATOR_ENABLED && (
            <div className="space-y-3">
              <input
                type="password"
                value={inputSecret}
                onChange={(e) => setInputSecret(e.target.value)}
                placeholder="Operator passphrase"
                className="w-full bg-white/[0.02] text-white/90 text-[13px] px-4 py-3 rounded-lg border border-white/[0.06] hover:border-white/[0.10] focus:border-white/15 focus:outline-none transition-all placeholder:text-white/20"
                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                autoFocus
              />

              {error && (
                <p className="text-[12px] text-red-400/80 px-1">{error}</p>
              )}

              <button
                onClick={handleUnlock}
                disabled={!inputSecret.trim()}
                className={`w-full py-2.5 rounded-lg text-[13px] font-semibold transition-all ${
                  !inputSecret.trim()
                    ? 'bg-white/[0.03] text-white/20 cursor-not-allowed'
                    : 'bg-white text-[#0A0A0A] hover:bg-white/95'
                }`}
              >
                Unlock
              </button>
            </div>
          )}

          <button
            onClick={() => navigate('/launcher')}
            className="flex items-center gap-1.5 text-white/20 hover:text-white/50 transition-colors mt-10 mx-auto text-[11px] font-medium"
          >
            <ArrowLeft size={12} />
            Back to Launcher
          </button>
        </div>
        <Dock />
      </div>
    );
  }

  // Unlocked - render children
  return <>{children}</>;
}

// Export a function to clear operator access (for logout)
export function clearOperatorAccess() {
  localStorage.removeItem(OPERATOR_SECRET_KEY);
}
