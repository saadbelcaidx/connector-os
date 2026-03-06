import { useState, useEffect, useCallback } from 'react';
import { Loader2, CheckCircle, ArrowRight, X, Clock, Send, RefreshCw, Mail, Key, Eye, EyeOff } from 'lucide-react';
import { useAuth } from './AuthContext';

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
  | 'loading'
  | 'email_input'
  | 'sending'
  | 'email_sent'
  | 'request_access'
  | 'requesting'
  | 'pending'
  | 'success';

const RESEND_COOLDOWN = 60;

// Station input style
const inputStyle: React.CSSProperties = {
  width: '100%',
  height: '36px',
  padding: '0 12px',
  fontFamily: 'monospace',
  fontSize: '11px',
  color: 'rgba(255,255,255,0.8)',
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '2px',
  outline: 'none',
  transition: 'border-color 0.2s',
};

// Station primary button style
const btnPrimaryStyle: React.CSSProperties = {
  width: '100%',
  height: '36px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  fontFamily: 'monospace',
  fontSize: '11px',
  fontWeight: 500,
  color: '#000',
  background: '#fff',
  border: 'none',
  borderRadius: '2px',
  cursor: 'pointer',
  transition: 'opacity 0.2s',
};

// Station secondary button style
const btnSecondaryStyle: React.CSSProperties = {
  width: '100%',
  height: '36px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  fontFamily: 'monospace',
  fontSize: '11px',
  color: 'rgba(255,255,255,0.5)',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '2px',
  cursor: 'pointer',
  transition: 'border-color 0.2s',
};

export default function AuthModal({ isOpen, onClose, onSuccess, featureName }: AuthModalProps) {
  const { user, signInWithEmail, signInWithPassword, signUpWithPassword, loading: authLoading } = useAuth();
  const [state, setState] = useState<ModalState>('loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(0);

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
      setError(result.error || 'Failed to check access');
      setState('request_access');
    } else {
      setState('request_access');
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) return;

    setError(null);
    setState('sending');

    const normalizedEmail = email.toLowerCase().trim();

    const checkResult = await checkSSMStatus(normalizedEmail);
    console.log('[SSM Gate] handleEmailSubmit decision:', normalizedEmail, '→', checkResult.status);

    if (checkResult.status === 'error') {
      setError(checkResult.error || 'Failed to check access status');
      setState('email_input');
      return;
    }

    if (isLoginMode) {
      if (checkResult.status === 'approved') {
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
      const result = await signInWithPassword(normalizedEmail, password);

      if (result.error) {
        setError('Invalid email or password');
        setState('email_input');
      } else {
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

    const checkResult = await checkSSMStatus(normalizedEmail);
    console.log('[SSM Gate] handleRequestAccess decision:', normalizedEmail, '→', checkResult.status);

    if (checkResult.status === 'error') {
      setError(checkResult.error || 'Failed to check access status');
      setState('request_access');
      return;
    }

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
        className="absolute inset-0 bg-black/70"
        onClick={handleClose}
        style={{ animation: 'authFadeIn 0.2s ease-out' }}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-[380px] bg-[#09090b] border border-white/[0.06] overflow-hidden"
        style={{
          borderRadius: '2px',
          animation: 'authScaleIn 0.25s ease-out',
        }}
      >
        {/* Header */}
        <div className="pt-6 pb-4 px-6 text-center">
          <div
            className="w-10 h-10 rounded flex items-center justify-center mx-auto mb-3 bg-white/[0.03] border border-white/[0.06]"
          >
            <Mail size={16} style={{ color: 'rgba(255, 255, 255, 0.4)', strokeWidth: 1.5 }} />
          </div>
          <h2 className="font-mono text-[12px] font-medium text-white/70 uppercase tracking-wider">
            {featureName}
          </h2>
        </div>

        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-1.5 text-white/20 hover:text-white/50 transition-colors"
        >
          <X size={14} />
        </button>

        <div className="px-6 pb-6">
          {/* Loading State */}
          {state === 'loading' && (
            <div className="py-6 text-center">
              <Loader2 size={18} className="text-white/30 animate-spin mx-auto mb-3" />
              <p className="font-mono text-[10px] text-white/30">Checking access...</p>
            </div>
          )}

          {/* Email Input State */}
          {state === 'email_input' && (
            <div style={{ animation: 'authFadeIn 0.2s ease-out' }}>
              <p className="font-mono text-[10px] text-white/30 text-center mb-5">
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
                  style={{ ...inputStyle, marginBottom: '8px' }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.06)'; }}
                />

                {!isLoginMode && !isResetMode && (
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Full name"
                    required
                    style={{ ...inputStyle, marginBottom: '8px' }}
                    onFocus={e => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                    onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.06)'; }}
                  />
                )}

                {usePassword && !isResetMode && (
                  <div className="relative" style={{ marginBottom: '8px' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      required
                      style={{ ...inputStyle, paddingRight: '36px' }}
                      onFocus={e => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                      onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.06)'; }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/20 hover:text-white/40 transition-colors"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                )}

                {error && (
                  <p className="font-mono text-[10px] text-white/30 mb-2 text-center">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={!email.includes('@') || (usePassword && !isResetMode && !password) || (!isLoginMode && !isResetMode && !fullName.trim())}
                  style={{
                    ...btnPrimaryStyle,
                    opacity: (!email.includes('@') || (usePassword && !isResetMode && !password) || (!isLoginMode && !isResetMode && !fullName.trim())) ? 0.3 : 1,
                  }}
                >
                  {isResetMode
                    ? 'Send Reset Link'
                    : usePassword
                      ? 'Sign In'
                      : (isLoginMode ? 'Send Magic Link' : 'Request Access')}
                  <ArrowRight size={12} />
                </button>
              </form>

              {isResetMode ? (
                <div className="mt-4 pt-3 border-t border-white/[0.04] text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setIsResetMode(false);
                      setError(null);
                    }}
                    className="font-mono text-[10px] text-white/20 hover:text-white/40 transition-colors"
                  >
                    Back to Sign In
                  </button>
                </div>
              ) : (
                <>
                  <div className="mt-4 pt-4 border-t border-white/[0.06]">
                    {isLoginMode ? (
                      <p className="font-mono text-[9px] text-white/20 text-center uppercase tracking-widest mb-2.5">
                        Or sign in with
                      </p>
                    ) : (
                      <p className="font-mono text-[10px] text-white/30 text-center mb-2.5">
                        Already in SSM?
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (!isLoginMode) {
                          setIsLoginMode(true);
                          setUsePassword(true);
                        } else {
                          setUsePassword(!usePassword);
                        }
                        setError(null);
                      }}
                      style={btnSecondaryStyle}
                    >
                      {isLoginMode ? (
                        usePassword ? (
                          <>
                            <Mail size={12} />
                            Magic Link
                          </>
                        ) : (
                          <>
                            <Key size={12} />
                            Password
                          </>
                        )
                      ) : (
                        <>
                          <Key size={12} />
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
                        className="w-full mt-2.5 font-mono text-[10px] text-white/25 hover:text-white/40 transition-colors"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/[0.04] flex justify-between">
                    {isLoginMode && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsLoginMode(false);
                          setUsePassword(false);
                          setError(null);
                        }}
                        className="font-mono text-[10px] text-white/20 hover:text-white/40 transition-colors"
                      >
                        Request Access
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleClose}
                      className={`font-mono text-[10px] text-white/20 hover:text-white/40 transition-colors ${!isLoginMode ? 'w-full text-center' : 'ml-auto'}`}
                    >
                      Back
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Sending State */}
          {state === 'sending' && (
            <div className="py-6 text-center" style={{ animation: 'authFadeIn 0.2s ease-out' }}>
              <Loader2 size={18} className="text-white/30 animate-spin mx-auto mb-3" />
              <p className="font-mono text-[10px] text-white/30">One moment...</p>
            </div>
          )}

          {/* Email Sent State */}
          {state === 'email_sent' && (
            <div className="text-center" style={{ animation: 'authFadeIn 0.2s ease-out' }}>
              <div className="w-10 h-10 rounded bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={18} className="text-emerald-400/70" />
              </div>
              <p className="font-mono text-[11px] text-white/60 font-medium mb-1">
                Check your inbox
              </p>
              <p className="font-mono text-[10px] text-white/30 mb-5">
                {isResetMode
                  ? <>Reset link sent to <span className="text-white/50">{email}</span></>
                  : <>Login link sent to <span className="text-white/50">{email}</span></>
                }
              </p>

              <div className="p-3 rounded bg-white/[0.02] border border-white/[0.06] mb-5">
                <p className="font-mono text-[10px] text-white/30">
                  {isResetMode ? "Click the link to reset your password" : "Click the link to sign in"}
                </p>
              </div>

              <button
                onClick={handleResend}
                disabled={resendTimer > 0}
                className="inline-flex items-center gap-2 font-mono text-[10px] text-white/30 hover:text-white/50 disabled:text-white/15 disabled:cursor-not-allowed transition-colors"
              >
                {resendTimer > 0 ? (
                  <>
                    <Clock size={12} />
                    Resend in {resendTimer}s
                  </>
                ) : (
                  <>
                    <RefreshCw size={12} />
                    Resend link
                  </>
                )}
              </button>
            </div>
          )}

          {/* Request Access State */}
          {state === 'request_access' && (
            <div style={{ animation: 'authFadeIn 0.2s ease-out' }}>
              <p className="font-mono text-[10px] text-white/30 text-center mb-5">
                This feature requires approval
              </p>

              <div className="p-3 rounded bg-white/[0.02] border border-white/[0.06] mb-4">
                <p className="font-mono text-[10px] text-white/40">
                  Signed in as <span className="text-white/60">{user?.email}</span>
                </p>
              </div>

              {error && (
                <p className="font-mono text-[10px] text-white/30 mb-4 text-center">{error}</p>
              )}

              <button
                onClick={handleRequestAccess}
                style={btnPrimaryStyle}
              >
                <Send size={12} />
                Request Access
              </button>

              <p className="font-mono text-[9px] text-white/20 text-center mt-4">
                Your request will be reviewed shortly
              </p>
            </div>
          )}

          {/* Requesting State */}
          {state === 'requesting' && (
            <div className="py-6 text-center" style={{ animation: 'authFadeIn 0.2s ease-out' }}>
              <Loader2 size={18} className="text-white/30 animate-spin mx-auto mb-3" />
              <p className="font-mono text-[10px] text-white/30">Submitting request...</p>
            </div>
          )}

          {/* Pending State */}
          {state === 'pending' && (
            <div className="text-center" style={{ animation: 'authFadeIn 0.2s ease-out' }}>
              <div className="w-10 h-10 rounded bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                <Clock size={16} className="text-white/40" />
              </div>
              <p className="font-mono text-[11px] text-white/60 font-medium mb-1">
                Request submitted
              </p>
              <p className="font-mono text-[10px] text-white/30 mb-5">
                We're reviewing your request for access
              </p>

              {email && (
                <p className="font-mono text-[10px] text-white/40 mb-4">
                  <span className="text-white/60">{email}</span>
                </p>
              )}

              <div className="p-3 rounded bg-white/[0.02] border border-white/[0.06] mb-5">
                <p className="font-mono text-[10px] text-white/30">
                  Once approved, you'll receive a sign-in link via email
                </p>
              </div>

              <button
                onClick={handleClose}
                className="font-mono text-[10px] text-white/30 hover:text-white/50 transition-colors"
              >
                Got it
              </button>
            </div>
          )}

          {/* Success State */}
          {state === 'success' && (
            <div className="py-6 text-center" style={{ animation: 'authFadeIn 0.2s ease-out' }}>
              <div
                className="w-10 h-10 rounded bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center mx-auto mb-4"
                style={{ animation: 'authSuccessPop 0.3s ease-out' }}
              >
                <CheckCircle size={18} className="text-emerald-400/70" />
              </div>
              <p className="font-mono text-[11px] text-white/60 font-medium">
                Access granted
              </p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes authFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes authScaleIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes authSuccessPop {
          0% { transform: scale(0.8); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
