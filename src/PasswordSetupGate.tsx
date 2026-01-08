import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, Loader2, Lock } from 'lucide-react';
import { useAuth } from './AuthContext';

// Routes where password setup should NOT be enforced
const EXEMPT_ROUTES = ['/login', '/auth/callback', '/', '/site', '/library'];

/**
 * PasswordSetupGate - Forces new users to set a password before accessing the app
 */
export default function PasswordSetupGate({ children }: { children: React.ReactNode }) {
  const { user, setPassword } = useAuth();
  const location = useLocation();
  const [password, setPasswordValue] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Skip gate for exempt routes (login, callback, public pages)
  const isExemptRoute = EXEMPT_ROUTES.some(route => location.pathname === route || location.pathname.startsWith(route + '/'));

  // If no user, exempt route, or password setup complete, render children
  if (!user || isExemptRoute || !user.needsPasswordSetup) {
    return <>{children}</>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsSubmitting(true);

    const result = await setPassword(password);

    if (result.error) {
      setError(result.error);
      setIsSubmitting(false);
      return;
    }

    // Success - user state will update and this gate will pass through
  };

  return (
    <div className="fixed inset-0 bg-[#0A0A0A] flex items-center justify-center p-4 z-50">
      <div className="w-full max-w-[380px] animate-fade-in">
        {/* Icon */}
        <div className="w-16 h-16 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-6">
          <Lock size={28} className="text-white/60" />
        </div>

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-[22px] font-semibold text-white mb-2">
            Set your password
          </h1>
          <p className="text-[14px] text-white/40">
            Create a password for quick access next time
          </p>
          {user.email && (
            <p className="text-[13px] text-white/50 mt-2">
              {user.email}
            </p>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPasswordValue(e.target.value)}
              placeholder="Create password"
              autoFocus
              className="w-full h-[48px] px-4 pr-12 rounded-xl bg-white/[0.06] border border-white/[0.08] text-[15px] text-white placeholder-white/30 focus:outline-none focus:border-white/20 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/30 hover:text-white/50 transition-colors"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <input
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm password"
            className="w-full h-[48px] px-4 rounded-xl bg-white/[0.06] border border-white/[0.08] text-[15px] text-white placeholder-white/30 focus:outline-none focus:border-white/20 transition-colors"
          />

          {error && (
            <p className="text-[13px] text-red-400 text-center py-1">{error}</p>
          )}

          <button
            type="submit"
            disabled={!password || !confirmPassword || isSubmitting}
            className="w-full h-[48px] flex items-center justify-center gap-2 rounded-xl bg-white text-black text-[15px] font-semibold hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isSubmitting ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>
                Continue
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <p className="text-[12px] text-white/30 text-center mt-6">
          You'll use this password to sign in on future visits
        </p>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
