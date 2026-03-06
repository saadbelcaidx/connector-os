import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mail, ArrowRight, Loader2, Clock, RefreshCw, Eye, EyeOff, KeyRound, CheckCircle } from 'lucide-react';
import { useAuth } from './AuthContext';

type LoginState = 'email' | 'password' | 'sending_magic' | 'sending_reset' | 'magic_sent' | 'reset_sent' | 'error';

const RESEND_COOLDOWN = 60;

// Station input style (matches AuthModal)
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

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, signInWithEmail, signInWithPassword, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [state, setState] = useState<LoginState>('email');
  const [resendTimer, setResendTimer] = useState(0);

  // Store where user came from
  useEffect(() => {
    const from = (location.state as { from?: string })?.from;
    if (from) {
      sessionStorage.setItem('auth_return_to', from);
    }
  }, [location]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const returnTo = sessionStorage.getItem('auth_return_to') || '/launcher';
      sessionStorage.removeItem('auth_return_to');
      navigate(returnTo, { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Resend countdown
  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => setResendTimer(t => t - 1), 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  // Step 1: Email submitted → show password input
  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) return;
    setError('');
    setState('password');
  };

  // Step 2a: Password submitted → try password login
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setError('');

    const result = await signInWithPassword(email, password);

    if (result.error) {
      setError(result.error);
    }
  };

  // Step 2b: Use magic link instead of password
  const handleUseMagicLink = async () => {
    setError('');
    setState('sending_magic');

    const result = await signInWithEmail(email);

    if (result.error) {
      setError(result.error);
      setState('error');
    } else {
      setState('magic_sent');
      setResendTimer(RESEND_COOLDOWN);
    }
  };

  // Step 2c: Forgot password → send reset link
  const handleForgotPassword = async () => {
    setError('');
    setState('sending_reset');

    const result = await resetPassword(email);

    if (result.error) {
      setError(result.error);
      setState('password');
    } else {
      setState('reset_sent');
      setResendTimer(RESEND_COOLDOWN);
    }
  };

  // Resend magic link
  const handleResendMagic = async () => {
    if (resendTimer > 0) return;
    setState('sending_magic');
    const result = await signInWithEmail(email);
    if (result.error) {
      setError(result.error);
      setState('error');
    } else {
      setState('magic_sent');
      setResendTimer(RESEND_COOLDOWN);
    }
  };

  // Resend reset link
  const handleResendReset = async () => {
    if (resendTimer > 0) return;
    setState('sending_reset');
    const result = await resetPassword(email);
    if (result.error) {
      setError(result.error);
      setState('password');
    } else {
      setState('reset_sent');
      setResendTimer(RESEND_COOLDOWN);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center px-4">
      <div className="w-full max-w-[380px]" style={{ animation: 'authScaleIn 0.25s ease-out' }}>
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-10 h-10 rounded flex items-center justify-center mx-auto mb-3 bg-white/[0.03] border border-white/[0.06]">
            {state === 'password' || state === 'sending_reset' ? (
              <KeyRound size={16} style={{ color: 'rgba(255,255,255,0.4)', strokeWidth: 1.5 }} />
            ) : (
              <Mail size={16} style={{ color: 'rgba(255,255,255,0.4)', strokeWidth: 1.5 }} />
            )}
          </div>
          <h1 className="font-mono text-[12px] font-medium text-white/70 uppercase tracking-wider">
            {state === 'reset_sent' ? 'Check Your Inbox' : 'Sign In'}
          </h1>
        </div>

        {/* Card */}
        <div
          className="bg-[#09090b] border border-white/[0.06] overflow-hidden"
          style={{ borderRadius: '2px' }}
        >
          <div className="px-6 py-6">

            {/* Email Input State */}
            {state === 'email' && (
              <div style={{ animation: 'authFadeIn 0.2s ease-out' }}>
                <p className="font-mono text-[10px] text-white/30 text-center mb-5">
                  Enter your email to continue
                </p>

                <form onSubmit={handleEmailSubmit}>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    autoFocus
                    required
                    style={{ ...inputStyle, marginBottom: '10px' }}
                    onFocus={e => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; }}
                    onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.06)'; }}
                  />

                  <button
                    type="submit"
                    disabled={!email.includes('@')}
                    style={{
                      ...btnPrimaryStyle,
                      opacity: !email.includes('@') ? 0.3 : 1,
                    }}
                  >
                    Continue
                    <ArrowRight size={12} />
                  </button>
                </form>
              </div>
            )}

            {/* Password Input State */}
            {state === 'password' && (
              <div style={{ animation: 'authFadeIn 0.2s ease-out' }}>
                <p className="font-mono text-[10px] text-white/30 text-center mb-5">
                  {email}
                </p>

                <form onSubmit={handlePasswordSubmit}>
                  <div className="relative" style={{ marginBottom: '8px' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      autoFocus
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

                  {error && (
                    <p className="font-mono text-[10px] text-white/30 mb-2 text-center">{error}</p>
                  )}

                  <button
                    type="submit"
                    disabled={!password}
                    style={{
                      ...btnPrimaryStyle,
                      opacity: !password ? 0.3 : 1,
                    }}
                  >
                    Sign In
                    <ArrowRight size={12} />
                  </button>
                </form>

                {/* Forgot Password */}
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="w-full mt-2.5 font-mono text-[10px] text-white/25 hover:text-white/40 transition-colors"
                >
                  Forgot password?
                </button>

                {/* Divider */}
                <div className="mt-4 pt-4 border-t border-white/[0.06]">
                  <p className="font-mono text-[9px] text-white/20 text-center uppercase tracking-widest mb-2.5">
                    Or sign in with
                  </p>

                  {/* Magic Link Option */}
                  <button
                    type="button"
                    onClick={handleUseMagicLink}
                    style={btnSecondaryStyle}
                  >
                    <Mail size={12} />
                    Magic Link
                  </button>
                </div>

                {/* Back to email */}
                <div className="mt-4 pt-3 border-t border-white/[0.04] text-center">
                  <button
                    type="button"
                    onClick={() => { setState('email'); setPassword(''); setError(''); }}
                    className="font-mono text-[10px] text-white/20 hover:text-white/40 transition-colors"
                  >
                    Use a different email
                  </button>
                </div>
              </div>
            )}

            {/* Sending Magic Link State */}
            {state === 'sending_magic' && (
              <div className="py-6 text-center" style={{ animation: 'authFadeIn 0.2s ease-out' }}>
                <Loader2 size={18} className="text-white/30 animate-spin mx-auto mb-3" />
                <p className="font-mono text-[10px] text-white/30">
                  Sending magic link...
                </p>
              </div>
            )}

            {/* Sending Reset Link State */}
            {state === 'sending_reset' && (
              <div className="py-6 text-center" style={{ animation: 'authFadeIn 0.2s ease-out' }}>
                <Loader2 size={18} className="text-white/30 animate-spin mx-auto mb-3" />
                <p className="font-mono text-[10px] text-white/30">
                  Sending reset link...
                </p>
              </div>
            )}

            {/* Magic Link Sent State */}
            {state === 'magic_sent' && (
              <div className="text-center" style={{ animation: 'authFadeIn 0.2s ease-out' }}>
                <div className="w-10 h-10 rounded bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle size={18} className="text-emerald-400/70" />
                </div>
                <p className="font-mono text-[11px] text-white/60 font-medium mb-1">
                  Check your inbox
                </p>
                <p className="font-mono text-[10px] text-white/30 mb-5">
                  Login link sent to <span className="text-white/50">{email}</span>
                </p>

                <div className="p-3 rounded bg-white/[0.02] border border-white/[0.06] mb-5">
                  <p className="font-mono text-[10px] text-white/30">
                    Click the link to sign in
                  </p>
                </div>

                <button
                  onClick={handleResendMagic}
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
                      Resend magic link
                    </>
                  )}
                </button>

                <div className="mt-4 pt-3 border-t border-white/[0.04] text-center">
                  <button
                    onClick={() => { setState('email'); setEmail(''); setPassword(''); }}
                    className="font-mono text-[10px] text-white/20 hover:text-white/40 transition-colors"
                  >
                    Use a different email
                  </button>
                </div>
              </div>
            )}

            {/* Reset Link Sent State */}
            {state === 'reset_sent' && (
              <div className="text-center" style={{ animation: 'authFadeIn 0.2s ease-out' }}>
                <div className="w-10 h-10 rounded bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                  <KeyRound size={16} className="text-white/40" />
                </div>
                <p className="font-mono text-[11px] text-white/60 font-medium mb-1">
                  Reset link sent
                </p>
                <p className="font-mono text-[10px] text-white/30 mb-5">
                  Reset link sent to <span className="text-white/50">{email}</span>
                </p>

                <div className="p-3 rounded bg-white/[0.02] border border-white/[0.06] mb-5">
                  <p className="font-mono text-[10px] text-white/30">
                    Click the link to create a new password. Expires in 24 hours.
                  </p>
                </div>

                <button
                  onClick={handleResendReset}
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
                      Resend reset link
                    </>
                  )}
                </button>

                <div className="mt-4 pt-3 border-t border-white/[0.04] text-center">
                  <button
                    onClick={() => { setState('password'); setPassword(''); }}
                    className="font-mono text-[10px] text-white/20 hover:text-white/40 transition-colors"
                  >
                    Back to login
                  </button>
                </div>
              </div>
            )}

            {/* Error State */}
            {state === 'error' && (
              <div className="py-4 text-center" style={{ animation: 'authFadeIn 0.2s ease-out' }}>
                <div className="w-10 h-10 rounded bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                  <Mail size={16} className="text-white/40" />
                </div>
                <p className="font-mono text-[11px] text-white/60 font-medium mb-1">
                  Something went wrong
                </p>
                <p className="font-mono text-[10px] text-white/30 mb-5">
                  {error}
                </p>
                <button
                  onClick={() => { setState('email'); setError(''); }}
                  style={btnPrimaryStyle}
                >
                  Try again
                </button>
              </div>
            )}

          </div>
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
      `}</style>
    </div>
  );
}

export default Login;
