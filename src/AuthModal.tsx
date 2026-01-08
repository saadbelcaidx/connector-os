import { useState, useEffect, useCallback } from 'react';
import { Mail, Loader2, CheckCircle, ArrowRight, X, Clock, Send, RefreshCw, MessageSquare, Network, Key, Eye, EyeOff } from 'lucide-react';
import { useAuth } from './AuthContext';
import { supabase } from './lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

/**
 * Check SSM access status via edge function (bypasses RLS)
 * Returns: 'approved' | 'pending' | 'none' | 'error'
 */
async function checkSSMStatus(email: string): Promise<{ status: 'approved' | 'pending' | 'none' | 'error'; error?: string }> {
  const normalizedEmail = email.toLowerCase().trim();

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/ssm-access/check?email=${encodeURIComponent(normalizedEmail)}`
    );

    if (!response.ok) {
      console.error('[SSM Gate] Check endpoint failed:', response.status);
      return { status: 'error', error: 'Failed to check access status' };
    }

    const data = await response.json();
    const status = data.status as string;

    // Map to our enum (handle 'revoked' as 'none' - they can re-request)
    if (status === 'approved') {
      console.log('[SSM Gate] Status check:', normalizedEmail, '→ approved');
      return { status: 'approved' };
    } else if (status === 'pending') {
      console.log('[SSM Gate] Status check:', normalizedEmail, '→ pending');
      return { status: 'pending' };
    } else {
      console.log('[SSM Gate] Status check:', normalizedEmail, '→ none');
      return { status: 'none' };
    }
  } catch (err) {
    console.error('[SSM Gate] Network error checking status:', err);
    return { status: 'error', error: 'Network error. Please try again.' };
  }
}

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  featureName: string;
}

type ModalState =
  | 'loading'          // Initial check
  | 'email_input'      // Enter email
  | 'sending'          // Sending magic link
  | 'email_sent'       // Check your email
  | 'request_access'   // User logged in but needs to request access
  | 'requesting'       // Sending access request
  | 'pending'          // Access request pending
  | 'success';         // Access granted

const RESEND_COOLDOWN = 60;

// Feature icons mapping
const featureIcons: Record<string, typeof Mail> = {
  'Msg Simulator': Mail,
  'Inbound': MessageSquare,
  'Matching Engine': Network,
};

export default function AuthModal({ isOpen, onClose, onSuccess, featureName }: AuthModalProps) {
  const { user, signInWithEmail, signInWithPassword, signUpWithPassword, loading: authLoading } = useAuth();
  const [state, setState] = useState<ModalState>('loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(false); // true = "Already in SSM" flow
  const [isResetMode, setIsResetMode] = useState(false); // true = "Forgot password" flow
  const [error, setError] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(0);

  const FeatureIcon = featureIcons[featureName] || Mail;

  // Check access when modal opens or user changes
  useEffect(() => {
    if (!isOpen) return;

    if (authLoading) {
      setState('loading');
      return;
    }

    if (user?.email) {
      checkAccess(user.email);
    } else {
      setState('email_input');
    }
  }, [user, authLoading, isOpen]);

  // Resend countdown timer
  useEffect(() => {
    if (resendTimer <= 0) return;

    const interval = setInterval(() => {
      setResendTimer(t => t - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [resendTimer]);

  const checkAccess = async (emailToCheck: string) => {
    setState('loading');

    const result = await checkSSMStatus(emailToCheck);
    console.log('[SSM Gate] checkAccess decision:', emailToCheck, '→', result.status);

    if (result.status === 'approved') {
      setState('success');
      setTimeout(onSuccess, 600);
    } else if (result.status === 'pending') {
      setState('pending');
    } else if (result.status === 'error') {
      // Network failure - do NOT auto-request, show error
      setError(result.error || 'Failed to check access');
      setState('request_access');
    } else {
      // status === 'none'
      setState('request_access');
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) return;

    setError(null);
    setState('sending');

    const normalizedEmail = email.toLowerCase().trim();

    // Check status via edge function (bypasses RLS, works regardless of auth state)
    const checkResult = await checkSSMStatus(normalizedEmail);
    console.log('[SSM Gate] handleEmailSubmit decision:', normalizedEmail, '→', checkResult.status);

    // Guard: Network failure - never fall through to request
    if (checkResult.status === 'error') {
      setError(checkResult.error || 'Failed to check access status');
      setState('email_input');
      return;
    }

    if (isLoginMode) {
      // LOGIN MODE: User claims they're already in SSM
      if (checkResult.status === 'approved') {
        // Verified - send magic link
        sessionStorage.setItem('auth_return_to', window.location.pathname);
        const result = await signInWithEmail(normalizedEmail);
        if (result.error) {
          setError(result.error);
          setState('email_input');
        } else {
          setState('email_sent');
          setResendTimer(RESEND_COOLDOWN);
        }
      } else if (checkResult.status === 'pending') {
        setError("Your access is still pending approval.");
        setState('email_input');
      } else {
        setError("This email isn't in SSM. Request access first.");
        setState('email_input');
        setIsLoginMode(false);
        setUsePassword(false);
      }
    } else {
      // REQUEST MODE: User wants to request access
      // Guard: Approved emails NEVER hit ssm-request
      if (checkResult.status === 'approved') {
        console.log('[SSM Gate] Blocked ssm-request for approved email:', normalizedEmail);
        setError("You're already in SSM! Click 'Already in SSM?' below to sign in.");
        setState('email_input');
        return;
      }

      if (checkResult.status === 'pending') {
        setState('pending');
        return;
      }

      // status === 'none' - allow new request
      console.log('[SSM Gate] Allowing ssm-request for new email:', normalizedEmail);
      try {
        const response = await fetch(
          `${SUPABASE_URL}/functions/v1/ssm-request`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: normalizedEmail,
              full_name: fullName.trim() || null,
            }),
          }
        );

        const result = await response.json();
        if (response.ok) {
          // If auto-approved (SSM member), show success and redirect to email_sent
          if (result.status === 'approved' && result.auto_approved) {
            setState('email_sent');
            setResendTimer(RESEND_COOLDOWN);
          } else {
            setState('pending');
          }
        } else {
          setError(result.error || 'Request failed');
          setState('email_input');
        }
      } catch (err) {
        console.error('[AuthModal] Request error:', err);
        setError('Network error. Please try again.');
        setState('email_input');
      }
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@') || !password) return;

    setError(null);
    setState('sending');

    const normalizedEmail = email.toLowerCase().trim();

    try {
      // Try to sign in with password
      const result = await signInWithPassword(normalizedEmail, password);

      if (result.error) {
        // Wrong password or no account
        setError('Invalid email or password');
        setState('email_input');
      } else {
        // Auth succeeded
        setState('success');
        setTimeout(onSuccess, 600);
      }
    } catch (err) {
      console.error('[AuthModal] Password login error:', err);
      setError('Invalid email or password');
      setState('email_input');
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;

    setError(null);
    setState('sending');

    const result = await signInWithEmail(email.toLowerCase().trim());

    if (result.error) {
      setError(result.error);
      setState('email_sent');
    } else {
      setState('email_sent');
      setResendTimer(RESEND_COOLDOWN);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) return;

    setError(null);
    setState('sending');

    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/send-magic-link`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.toLowerCase().trim(),
            type: 'recovery',
            redirectTo: `${window.location.origin}/auth/callback`,
          }),
        }
      );

      if (!response.ok) {
        const result = await response.json();
        setError(result.error || 'Failed to send reset link');
        setState('email_input');
      } else {
        setState('email_sent');
      }
    } catch (err) {
      console.error('[AuthModal] Reset password error:', err);
      setError('Network error. Please try again.');
      setState('email_input');
    }
  };

  const handleRequestAccess = async () => {
    if (!user?.email) return;

    setState('requesting');
    setError(null);

    const normalizedEmail = user.email.toLowerCase().trim();

    // Check status first - guard against approved emails hitting ssm-request
    const checkResult = await checkSSMStatus(normalizedEmail);
    console.log('[SSM Gate] handleRequestAccess decision:', normalizedEmail, '→', checkResult.status);

    // Guard: Network failure - don't auto-request
    if (checkResult.status === 'error') {
      setError(checkResult.error || 'Failed to check access status');
      setState('request_access');
      return;
    }

    // Guard: Approved emails NEVER hit ssm-request
    if (checkResult.status === 'approved') {
      console.log('[SSM Gate] Blocked ssm-request for approved email:', normalizedEmail);
      setState('success');
      setTimeout(onSuccess, 600);
      return;
    }

    if (checkResult.status === 'pending') {
      setState('pending');
      return;
    }

    // status === 'none' - allow new request
    console.log('[SSM Gate] Allowing ssm-request for new email:', normalizedEmail);
    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/ssm-request`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: normalizedEmail,
            full_name: fullName.trim() || null,
          }),
        }
      );

      const result = await response.json();
      if (response.ok) {
        // If auto-approved (SSM member), show success
        if (result.status === 'approved' && result.auto_approved) {
          setState('success');
          setTimeout(onSuccess, 600);
        } else {
          setState('pending');
        }
      } else {
        setError(result.error || 'Request failed');
        setState('request_access');
      }
    } catch (err) {
      console.error('[AuthModal] Request error:', err);
      setError('Network error - please try again');
      setState('request_access');
    }
  };

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={handleClose}
        style={{ animation: 'fadeIn 0.2s ease-out' }}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-[400px] bg-[#0C0C0C] rounded-2xl border border-white/[0.08] overflow-hidden"
        style={{
          animation: 'scaleIn 0.25s ease-out',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
        }}
      >
        {/* Header with feature icon - minimal like Linear */}
        <div className="pt-6 pb-4 px-6 text-center">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3"
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
            }}
          >
            <FeatureIcon size={18} style={{ color: 'rgba(255, 255, 255, 0.6)', strokeWidth: 1.5 }} />
          </div>
          <h2 className="text-[15px] font-medium text-white/90">
            {featureName}
          </h2>
        </div>

        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 text-white/30 hover:text-white/60 transition-colors"
        >
          <X size={18} />
        </button>

        <div className="p-6">
          {/* Loading State */}
          {state === 'loading' && (
            <div className="py-6 text-center">
              <Loader2 size={22} className="text-white/40 animate-spin mx-auto mb-3" />
              <p className="text-[13px] text-white/40">Checking access...</p>
            </div>
          )}

          {/* Email Input State */}
          {state === 'email_input' && (
            <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
              <p className="text-[12px] text-white/40 text-center mb-5">
                {isResetMode
                  ? 'Enter your email to reset password'
                  : isLoginMode
                    ? 'Sign in to continue'
                    : 'Enter your email to get access'}
              </p>

              <form onSubmit={isResetMode ? handleResetPassword : (usePassword ? handlePasswordLogin : handleEmailSubmit)}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  autoFocus
                  required
                  className="input-field h-[44px] text-[14px] mb-2.5"
                />

                {/* Full name - required when requesting access (not login/reset) */}
                {!isLoginMode && !isResetMode && (
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Full name"
                    required
                    className="input-field h-[44px] text-[14px] mb-2.5"
                  />
                )}

                {usePassword && !isResetMode && (
                  <div className="relative mb-2.5">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      required
                      className="input-field h-[44px] text-[14px] pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/30 hover:text-white/50 transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                )}

                {error && (
                  <p className="text-[12px] text-red-400/90 mb-2.5 text-center">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={!email.includes('@') || (usePassword && !isResetMode && !password) || (!isLoginMode && !isResetMode && !fullName.trim())}
                  className="w-full h-[44px] btn-primary text-[14px]"
                >
                  {isResetMode
                    ? 'Send Reset Link'
                    : usePassword
                      ? 'Sign In'
                      : (isLoginMode ? 'Send Magic Link' : 'Request Access')}
                  <ArrowRight size={15} />
                </button>
              </form>

              {/* Reset mode: just show back link */}
              {isResetMode ? (
                <div className="mt-5 pt-3 border-t border-white/[0.04] text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setIsResetMode(false);
                      setError(null);
                    }}
                    className="text-[11px] text-white/25 hover:text-white/45 transition-colors"
                  >
                    ← Back to Sign In
                  </button>
                </div>
              ) : (
                <>
                  {/* Auth method options */}
                  <div className="mt-4 pt-4 border-t border-white/[0.06]">
                    {isLoginMode ? (
                      <p className="text-[10px] text-white/25 text-center uppercase tracking-wider mb-2.5">
                        Or sign in with
                      </p>
                    ) : (
                      <p className="text-[11px] text-white/35 text-center mb-2.5">
                        Already in SSM?
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (!isLoginMode) {
                          // Entering login mode
                          setIsLoginMode(true);
                          setUsePassword(true);
                        } else {
                          // Toggle between password and magic link
                          setUsePassword(!usePassword);
                        }
                        setError(null);
                      }}
                      className="w-full h-[40px] btn-secondary text-[12px]"
                    >
                      {isLoginMode ? (
                        usePassword ? (
                          <>
                            <Mail size={14} />
                            Magic Link
                          </>
                        ) : (
                          <>
                            <Key size={14} />
                            Password
                          </>
                        )
                      ) : (
                        <>
                          <Key size={14} />
                          Login with Password
                        </>
                      )}
                    </button>

                    {usePassword && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsResetMode(true);
                          setUsePassword(false);
                          setPassword('');
                          setError(null);
                        }}
                        className="w-full mt-2.5 text-[11px] text-white/35 hover:text-white/55 transition-colors"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>

                  {/* Back links */}
                  <div className="mt-5 pt-3 border-t border-white/[0.04] flex justify-between">
                    {isLoginMode && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsLoginMode(false);
                          setUsePassword(false);
                          setError(null);
                        }}
                        className="text-[11px] text-white/25 hover:text-white/45 transition-colors"
                      >
                        ← Request Access
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleClose}
                      className={`text-[11px] text-white/25 hover:text-white/45 transition-colors ${!isLoginMode ? 'w-full text-center' : 'ml-auto'}`}
                    >
                      {isLoginMode ? 'Back to Console' : '← Back to Console'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Sending State */}
          {state === 'sending' && (
            <div className="py-6 text-center" style={{ animation: 'fadeIn 0.2s ease-out' }}>
              <Loader2 size={24} className="text-white/50 animate-spin mx-auto mb-3" />
              <p className="text-[14px] text-white/50">One moment...</p>
            </div>
          )}

          {/* Email Sent State */}
          {state === 'email_sent' && (
            <div className="text-center" style={{ animation: 'fadeIn 0.2s ease-out' }}>
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={22} className="text-emerald-400" />
              </div>
              <p className="text-[15px] text-white/80 font-medium mb-1">
                Check your inbox
              </p>
              <p className="text-[13px] text-white/40 mb-5">
                {isResetMode
                  ? <>We sent a reset link to <span className="text-white/60">{email}</span></>
                  : <>We sent a login link to <span className="text-white/60">{email}</span></>
                }
              </p>

              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] mb-5">
                <p className="text-[12px] text-white/40">
                  {isResetMode ? "Click the link to reset your password" : "Click the link to sign in"}
                </p>
              </div>

              <button
                onClick={handleResend}
                disabled={resendTimer > 0}
                className="inline-flex items-center gap-2 text-[13px] text-white/40 hover:text-white/60 disabled:text-white/25 disabled:cursor-not-allowed transition-colors"
              >
                {resendTimer > 0 ? (
                  <>
                    <Clock size={14} />
                    Resend in {resendTimer}s
                  </>
                ) : (
                  <>
                    <RefreshCw size={14} />
                    Resend link
                  </>
                )}
              </button>
            </div>
          )}

          {/* Request Access State */}
          {state === 'request_access' && (
            <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
              <p className="text-[14px] text-white/50 text-center mb-6">
                This feature requires approval
              </p>

              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] mb-4">
                <p className="text-[13px] text-white/50">
                  Signed in as <span className="text-white/70">{user?.email}</span>
                </p>
              </div>

              {error && (
                <p className="text-[13px] text-red-400 mb-4 text-center">{error}</p>
              )}

              <button
                onClick={handleRequestAccess}
                className="w-full h-[48px] btn-primary text-[15px]"
              >
                <Send size={16} />
                Request Access
              </button>

              <p className="text-[12px] text-white/25 text-center mt-4">
                Your request will be reviewed shortly
              </p>
            </div>
          )}

          {/* Requesting State */}
          {state === 'requesting' && (
            <div className="py-6 text-center" style={{ animation: 'fadeIn 0.2s ease-out' }}>
              <Loader2 size={24} className="text-white/50 animate-spin mx-auto mb-3" />
              <p className="text-[14px] text-white/50">Submitting request...</p>
            </div>
          )}

          {/* Pending State */}
          {state === 'pending' && (
            <div className="text-center" style={{ animation: 'fadeIn 0.2s ease-out' }}>
              <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
                <Clock size={20} className="text-amber-400" />
              </div>
              <p className="text-[15px] text-white/80 font-medium mb-1">
                Request submitted
              </p>
              <p className="text-[13px] text-white/40 mb-5">
                We're reviewing your request for access
              </p>

              {email && (
                <p className="text-[12px] text-white/50 mb-4">
                  <span className="text-white/70">{email}</span>
                </p>
              )}

              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] mb-5">
                <p className="text-[12px] text-white/40">
                  Once approved, you'll receive a sign-in link via email
                </p>
              </div>

              <button
                onClick={handleClose}
                className="text-[13px] text-white/40 hover:text-white/60 transition-colors"
              >
                Got it
              </button>
            </div>
          )}

          {/* Success State */}
          {state === 'success' && (
            <div className="py-6 text-center" style={{ animation: 'fadeIn 0.2s ease-out' }}>
              <div
                className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4"
                style={{ animation: 'successPop 0.3s ease-out' }}
              >
                <CheckCircle size={24} className="text-emerald-400" />
              </div>
              <p className="text-[15px] text-white/80 font-medium">
                Access granted
              </p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes successPop {
          0% { transform: scale(0.8); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
