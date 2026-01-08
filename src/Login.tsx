import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mail, AlertCircle, CheckCircle, ArrowRight, Loader2, Clock, RefreshCw, Eye, EyeOff, KeyRound } from 'lucide-react';
import { useAuth } from './AuthContext';

type LoginState = 'email' | 'password' | 'sending_magic' | 'sending_reset' | 'magic_sent' | 'reset_sent' | 'error';

const RESEND_COOLDOWN = 60;

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
      // Don't change state - let them retry or use magic link
    }
    // If successful, the useEffect will redirect
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
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4">
      <div className="w-full max-w-md animate-fade-in">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/15 to-cyan-500/15 border border-blue-500/20 flex items-center justify-center mx-auto mb-5">
            {state === 'password' || state === 'sending_reset' ? (
              <KeyRound size={28} className="text-blue-400" />
            ) : (
              <Mail size={28} className="text-blue-400" />
            )}
          </div>
          <h1 className="text-[28px] font-semibold text-white mb-2 tracking-[-0.02em]">
            {state === 'reset_sent' ? 'Check your inbox' : 'Sign in to Connector OS'}
          </h1>
          <p className="text-[15px] text-white/45">
            {state === 'email' && 'Enter your email to continue'}
            {state === 'password' && email}
            {state === 'reset_sent' && 'We sent you a password reset link'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-[#111] rounded-2xl p-8 border border-white/[0.06]">

          {/* Email Input State */}
          {state === 'email' && (
            <form onSubmit={handleEmailSubmit}>
              <div className="mb-5">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  autoFocus
                  required
                  className="w-full h-[52px] bg-white/[0.04] text-white text-[15px] px-4 rounded-xl border border-white/[0.08] hover:border-white/[0.12] focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-white/30"
                />
              </div>

              <button
                type="submit"
                disabled={!email.includes('@')}
                className="w-full h-[52px] bg-white text-black text-[15px] font-semibold rounded-xl hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 group"
              >
                Continue
                <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
              </button>
            </form>
          )}

          {/* Password Input State */}
          {state === 'password' && (
            <form onSubmit={handlePasswordSubmit}>
              <div className="relative mb-4">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoFocus
                  className="w-full h-[52px] bg-white/[0.04] text-white text-[15px] px-4 pr-12 rounded-xl border border-white/[0.08] hover:border-white/[0.12] focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-white/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-white/30 hover:text-white/50 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2">
                  <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                  <p className="text-[13px] text-red-400">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={!password}
                className="w-full h-[52px] bg-white text-black text-[15px] font-semibold rounded-xl hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 group"
              >
                Sign in
                <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
              </button>

              {/* Forgot Password */}
              <button
                type="button"
                onClick={handleForgotPassword}
                className="w-full mt-4 text-[13px] text-blue-400/80 hover:text-blue-400 transition-colors"
              >
                Forgot password?
              </button>

              {/* Divider */}
              <div className="flex items-center gap-4 my-5">
                <div className="flex-1 h-px bg-white/[0.08]" />
                <span className="text-[12px] text-white/30">or</span>
                <div className="flex-1 h-px bg-white/[0.08]" />
              </div>

              {/* Magic Link Option */}
              <button
                type="button"
                onClick={handleUseMagicLink}
                className="w-full h-[48px] bg-white/[0.04] text-white/70 text-[14px] font-medium rounded-xl border border-white/[0.08] hover:bg-white/[0.06] hover:text-white transition-all flex items-center justify-center gap-2"
              >
                <Mail size={16} />
                Sign in with magic link
              </button>

              {/* Back to email */}
              <button
                type="button"
                onClick={() => { setState('email'); setPassword(''); setError(''); }}
                className="w-full mt-3 text-[12px] text-white/30 hover:text-white/50 transition-colors"
              >
                Use a different email
              </button>
            </form>
          )}

          {/* Sending Magic Link State */}
          {state === 'sending_magic' && (
            <div className="py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-4">
                <Loader2 size={22} className="text-white/60 animate-spin" />
              </div>
              <p className="text-[15px] text-white/60">
                Sending magic link...
              </p>
            </div>
          )}

          {/* Sending Reset Link State */}
          {state === 'sending_reset' && (
            <div className="py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-4">
                <Loader2 size={22} className="text-white/60 animate-spin" />
              </div>
              <p className="text-[15px] text-white/60">
                Sending reset link...
              </p>
            </div>
          )}

          {/* Magic Link Sent State */}
          {state === 'magic_sent' && (
            <div className="py-4 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-5">
                <CheckCircle size={26} className="text-emerald-400" />
              </div>
              <h2 className="text-[18px] font-semibold text-white mb-2">
                Check your inbox
              </h2>
              <p className="text-[14px] text-white/50 mb-1">
                We sent a magic link to
              </p>
              <p className="text-[15px] text-white/80 font-medium mb-6">
                {email}
              </p>

              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] mb-5">
                <p className="text-[13px] text-white/50">
                  Click the link in the email to sign in.
                  <br />
                  <span className="text-white/30">Check spam if you don't see it.</span>
                </p>
              </div>

              <button
                onClick={handleResendMagic}
                disabled={resendTimer > 0}
                className="inline-flex items-center gap-2 text-[13px] text-white/50 hover:text-white/70 disabled:text-white/30 disabled:cursor-not-allowed transition-colors"
              >
                {resendTimer > 0 ? (
                  <>
                    <Clock size={14} />
                    Resend in {resendTimer}s
                  </>
                ) : (
                  <>
                    <RefreshCw size={14} />
                    Resend magic link
                  </>
                )}
              </button>

              <button
                onClick={() => { setState('email'); setEmail(''); setPassword(''); }}
                className="block w-full mt-3 text-[12px] text-white/30 hover:text-white/50 transition-colors"
              >
                Use a different email
              </button>
            </div>
          )}

          {/* Reset Link Sent State */}
          {state === 'reset_sent' && (
            <div className="py-4 text-center">
              <div className="w-14 h-14 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-5">
                <KeyRound size={26} className="text-blue-400" />
              </div>
              <h2 className="text-[18px] font-semibold text-white mb-2">
                Reset link sent
              </h2>
              <p className="text-[14px] text-white/50 mb-1">
                We sent a password reset link to
              </p>
              <p className="text-[15px] text-white/80 font-medium mb-6">
                {email}
              </p>

              <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 mb-5">
                <p className="text-[13px] text-white/50">
                  Click the link to create a new password.
                  <br />
                  <span className="text-white/30">The link expires in 24 hours.</span>
                </p>
              </div>

              <button
                onClick={handleResendReset}
                disabled={resendTimer > 0}
                className="inline-flex items-center gap-2 text-[13px] text-white/50 hover:text-white/70 disabled:text-white/30 disabled:cursor-not-allowed transition-colors"
              >
                {resendTimer > 0 ? (
                  <>
                    <Clock size={14} />
                    Resend in {resendTimer}s
                  </>
                ) : (
                  <>
                    <RefreshCw size={14} />
                    Resend reset link
                  </>
                )}
              </button>

              <button
                onClick={() => { setState('password'); setPassword(''); }}
                className="block w-full mt-3 text-[12px] text-white/30 hover:text-white/50 transition-colors"
              >
                Back to login
              </button>
            </div>
          )}

          {/* Error State */}
          {state === 'error' && (
            <div className="py-4 text-center">
              <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-5">
                <AlertCircle size={26} className="text-red-400" />
              </div>
              <h2 className="text-[18px] font-semibold text-white mb-2">
                Something went wrong
              </h2>
              <p className="text-[14px] text-red-400/80 mb-6">
                {error}
              </p>
              <button
                onClick={() => { setState('email'); setError(''); }}
                className="px-6 py-3 rounded-xl bg-white text-black text-[14px] font-semibold hover:bg-white/90 transition-all"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-[12px] text-white/25">
            {state === 'email' ? 'Enter your email to get started' : ''}
          </p>
        </div>
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

export default Login;
