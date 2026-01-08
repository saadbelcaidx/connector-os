import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, CheckCircle, AlertCircle, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { supabase } from './lib/supabase';
import { useAuth } from './AuthContext';

type CallbackState = 'processing' | 'success' | 'set_password' | 'setting_password' | 'error';

/**
 * AuthCallback - Handles magic link redirect with smooth transition
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setPassword } = useAuth();
  const [state, setState] = useState<CallbackState>('processing');
  const [error, setError] = useState<string | null>(null);
  const [password, setPasswordValue] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Check for error in URL params
        const params = new URLSearchParams(location.search);
        const errorParam = params.get('error');
        const errorDescription = params.get('error_description');

        if (errorParam) {
          setError(errorDescription || errorParam);
          setState('error');
          return;
        }

        // Check the hash fragment for flow type
        const hash = window.location.hash;
        const isRecoveryFlow = hash.includes('type=recovery');
        const isInviteFlow = hash.includes('type=invite') || hash.includes('type=signup');
        setIsRecovery(isRecoveryFlow);

        console.log('[AuthCallback] Hash:', hash);
        console.log('[AuthCallback] Flow type:', isRecoveryFlow ? 'recovery' : isInviteFlow ? 'invite' : 'magiclink');

        // Wait for Supabase to process the hash
        // Try multiple times to get the session
        let session = null;
        let sessionError = null;

        for (let attempt = 0; attempt < 5; attempt++) {
          const result = await supabase.auth.getSession();
          session = result.data.session;
          sessionError = result.error;

          if (session || sessionError) break;

          // Wait a bit and retry
          await new Promise(r => setTimeout(r, 200));
        }

        if (sessionError) {
          console.error('[AuthCallback] Session error:', sessionError);
          setError(sessionError.message);
          setState('error');
          return;
        }

        if (session) {
          console.log('[AuthCallback] Authenticated:', session.user.email);
          console.log('[AuthCallback] User created at:', session.user.created_at);
          console.log('[AuthCallback] Last sign in:', session.user.last_sign_in_at);
          setUserEmail(session.user.email || null);

          // ALWAYS show password setup screen for new users
          // They MUST set a password before proceeding
          setState('set_password');
        } else {
          // No session - try to exchange the hash manually
          console.log('[AuthCallback] No session, trying to exchange hash...');

          // Check if there's an access token in the hash
          if (hash.includes('access_token')) {
            // Supabase should have auto-exchanged, wait a bit more
            await new Promise(r => setTimeout(r, 500));
            const retry = await supabase.auth.getSession();

            if (retry.data.session) {
              console.log('[AuthCallback] Got session on retry:', retry.data.session.user.email);
              setUserEmail(retry.data.session.user.email || null);
              setState('set_password');
              return;
            }
          }

          setError('This link has expired. Please request a new one.');
          setState('error');
        }
      } catch (err) {
        console.error('[AuthCallback] Error:', err);
        setError('Something went wrong. Please try again.');
        setState('error');
      }
    };

    // Run immediately - no delay
    handleCallback();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    // Validate password
    if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setState('setting_password');

    try {
      const result = await setPassword(password);

      if (result.error) {
        console.error('[AuthCallback] Password set error:', result.error);
        setPasswordError(result.error || 'Failed to set password. Please try again.');
        setState('set_password');
        return;
      }
    } catch (err) {
      console.error('[AuthCallback] Password set exception:', err);
      setPasswordError('Something went wrong. Please try again.');
      setState('set_password');
      return;
    }

    setState('success');
    // Redirect after brief success display
    setTimeout(() => {
      const returnTo = sessionStorage.getItem('auth_return_to') || '/launcher';
      sessionStorage.removeItem('auth_return_to');
      navigate(returnTo, { replace: true });
    }, 600);
  };

  const handleSkipPassword = () => {
    setState('success');
    // Redirect after brief success display
    setTimeout(() => {
      const returnTo = sessionStorage.getItem('auth_return_to') || '/launcher';
      sessionStorage.removeItem('auth_return_to');
      navigate(returnTo, { replace: true });
    }, 600);
  };

  return (
    <div className="fixed inset-0 bg-[#0A0A0A] flex items-center justify-center p-4">
      <div className="text-center animate-fade-in w-full max-w-[400px]">
        {state === 'processing' && (
          <>
            <div className="w-16 h-16 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-6">
              <Loader2 size={28} className="text-white/50 animate-spin" />
            </div>
            <h1 className="text-[18px] font-medium text-white mb-1">
              Signing you in
            </h1>
            <p className="text-[14px] text-white/40">
              One moment...
            </p>
          </>
        )}

        {state === 'set_password' && (
          <div className="w-full max-w-[360px] mx-auto">
            <div className="w-16 h-16 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={28} className="text-emerald-400" />
            </div>
            <h1 className="text-[20px] font-semibold text-white mb-2">
              {isRecovery ? 'Reset your password' : "You're in"}
            </h1>
            <p className="text-[14px] text-white/40 mb-6">
              {isRecovery ? 'Enter a new password below' : 'Set up a password for quick access next time'}
            </p>

            {userEmail && (
              <p className="text-[13px] text-white/50 mb-4">
                {isRecovery ? '' : 'Signed in as '}<span className="text-white/70">{userEmail}</span>
              </p>
            )}

            <form onSubmit={handleSetPassword} className="text-left">
              <div className="relative mb-3">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPasswordValue(e.target.value)}
                  placeholder={isRecovery ? 'New password' : 'Create password'}
                  autoFocus
                  className="input-field h-[48px] text-[15px] pr-12"
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
                className="input-field h-[48px] text-[15px] mb-3"
              />

              {passwordError && (
                <p className="text-[13px] text-red-400 mb-3 text-center">{passwordError}</p>
              )}

              <button
                type="submit"
                disabled={!password || !confirmPassword}
                className="w-full h-[48px] btn-primary text-[15px]"
              >
                {isRecovery ? 'Update Password' : 'Set Password'}
                <ArrowRight size={16} />
              </button>
            </form>

          </div>
        )}

        {state === 'setting_password' && (
          <>
            <div className="w-16 h-16 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-6">
              <Loader2 size={28} className="text-white/50 animate-spin" />
            </div>
            <h1 className="text-[18px] font-medium text-white mb-1">
              Setting up password
            </h1>
            <p className="text-[14px] text-white/40">
              One moment...
            </p>
          </>
        )}

        {state === 'success' && (
          <>
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-6 animate-success-pop">
              <CheckCircle size={32} className="text-emerald-400" />
            </div>
            <h1 className="text-[20px] font-semibold text-white mb-1">
              Welcome back
            </h1>
            <p className="text-[14px] text-white/40">
              Redirecting...
            </p>
          </>
        )}

        {state === 'error' && (
          <>
            <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={28} className="text-red-400" />
            </div>
            <h1 className="text-[18px] font-semibold text-white mb-2">
              Couldn't sign you in
            </h1>
            <p className="text-[14px] text-red-400/80 mb-6 max-w-xs mx-auto">
              {error}
            </p>
            <button
              onClick={() => navigate('/login')}
              className="px-6 py-3 rounded-xl bg-white text-black text-[14px] font-semibold hover:bg-white/90 transition-all"
            >
              Try again
            </button>
          </>
        )}
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes success-pop {
          0% { transform: scale(0.8); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        .animate-success-pop {
          animation: success-pop 0.4s ease-out;
        }
      `}</style>
    </div>
  );
}
