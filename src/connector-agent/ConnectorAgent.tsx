/**
 * Connector Agent — Premium Email Finder & Verifier
 *
 * Sleek operator animations with Framer Motion.
 * Linear-style UI, consistent with Connector OS design system.
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../AuthContext';
import { supabase } from '../lib/supabase';
import { FEATURES } from '../config/features';
import ComingSoon from '../components/ComingSoon';
import {
  Copy,
  Check,
  Search,
  ShieldCheck,
  Key,
  AlertCircle,
  ArrowLeft,
  Loader2,
  Trash2,
  Code2,
  ExternalLink,
  Sparkles,
  Globe,
  Mail,
  Activity,
  Eye,
  Zap
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

interface QuotaData {
  remaining: number;
  used: number;
  limit: number;
  percentage_used: number;
}

interface ApiKeyData {
  key_id: string;
  key_prefix: string;
  status: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

interface FindResult {
  email: string | null;
}

interface VerifyResult {
  email: string | null;
}

// ============================================================
// CONFIG & ANIMATIONS
// ============================================================

const API_BASE = import.meta.env.VITE_CONNECTOR_AGENT_API || 'https://api.connector-os.com';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 24 }
  }
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 400, damping: 25 }
  }
};

const slideIn = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring', stiffness: 300, damping: 24 }
  }
};

// ============================================================
// SSM GATE
// ============================================================

function SSMGateLocal({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    const checkAccess = async () => {
      if (!user?.email) {
        setIsChecking(false);
        setHasAccess(false);
        return;
      }

      try {
        const { data } = await supabase
          .from('ssm_access')
          .select('status')
          .eq('email', user.email)
          .single();

        setHasAccess(data?.status === 'approved');
      } catch {
        setHasAccess(false);
      } finally {
        setIsChecking(false);
      }
    };

    checkAccess();
  }, [user]);

  if (isChecking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          <Loader2 className="w-5 h-5 text-white/40" />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen bg-black flex flex-col items-center justify-center px-6"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="text-center max-w-md"
        >
          <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-5">
            <Eye className="w-7 h-7 text-white/50" />
          </div>
          <h1 className="text-[17px] font-semibold text-white/90 mb-2">Authentication Required</h1>
          <p className="text-[13px] text-white/50 mb-6">Sign in to access Connector Agent.</p>
          <button
            onClick={() => navigate('/login')}
            className="h-[40px] px-6 btn-primary text-[13px]"
          >
            Sign In
          </button>
        </motion.div>
      </motion.div>
    );
  }

  if (!hasAccess) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen bg-black flex flex-col items-center justify-center px-6"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="text-center max-w-md"
        >
          <div className="w-14 h-14 rounded-2xl bg-amber-500/[0.08] border border-amber-500/[0.15] flex items-center justify-center mx-auto mb-5">
            <AlertCircle className="w-7 h-7 text-amber-500/70" />
          </div>
          <h1 className="text-[17px] font-semibold text-white/90 mb-2">SSM Access Required</h1>
          <p className="text-[13px] text-white/50 mb-6">Connector Agent is available exclusively to SSM members.</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => navigate('/launcher')}
              className="h-[40px] px-5 btn-secondary text-[13px] flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <a
              href="https://www.skool.com/ssmasters"
              target="_blank"
              rel="noopener noreferrer"
              className="h-[40px] px-5 btn-primary text-[13px]"
            >
              Join SSM
            </a>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  return <>{children}</>;
}

// ============================================================
// API SERVICE
// ============================================================

class ConnectorAgentAPI {
  private apiKey: string | null = null;
  private userId: string;
  private userEmail: string;

  constructor(userId: string, userEmail: string) {
    this.userId = userId;
    this.userEmail = userEmail;
    this.apiKey = localStorage.getItem(`connector_api_key`);
  }

  private async fetchWithAuth(endpoint: string, options: RequestInit = {}) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-user-id': this.userId,
      'x-user-email': this.userEmail,
      ...(options.headers as Record<string, string> || {}),
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
      return response.json();
    } catch (err) {
      console.warn(`[ConnectorAgent] Backend unavailable: ${endpoint}`);
      return { success: false, error: 'Backend unavailable' };
    }
  }

  setApiKey(key: string) {
    this.apiKey = key;
    localStorage.setItem(`connector_api_key`, key);
  }

  clearApiKey() {
    this.apiKey = null;
    localStorage.removeItem(`connector_api_key`);
  }

  hasApiKey() { return !!this.apiKey; }
  getApiKey() { return this.apiKey; }

  async generateKey() { return this.fetchWithAuth('/api/keys/generate', { method: 'POST' }); }
  async getActiveKey() { return this.fetchWithAuth('/api/keys/active'); }
  async revokeKey(keyId: string) { return this.fetchWithAuth(`/api/keys/${keyId}`, { method: 'DELETE' }); }

  async getQuota() {
    // Quota works with user headers even without API key
    return this.fetchWithAuth('/api/email/v2/quota');
  }

  async findEmail(firstName: string, lastName: string, domain: string): Promise<FindResult> {
    // API key optional - backend accepts x-user-id header
    return this.fetchWithAuth('/api/email/v2/find', {
      method: 'POST',
      body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), domain: domain.trim().toLowerCase() }),
    });
  }

  async verifyEmail(email: string): Promise<VerifyResult> {
    // Quota works with user headers even without API key
    return this.fetchWithAuth('/api/email/v2/verify', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }
}

// ============================================================
// PROGRESS BAR COMPONENT
// ============================================================

function AnimatedProgressBar({ value, max, color = 'blue' }: { value: number; max: number; color?: string }) {
  const percentage = Math.min((value / max) * 100, 100);
  const remaining = 100 - percentage;

  const colorMap: Record<string, string> = {
    blue: 'from-blue-500 to-cyan-400',
    emerald: 'from-emerald-500 to-teal-400',
    amber: 'from-amber-500 to-orange-400',
    red: 'from-red-500 to-rose-400',
  };

  return (
    <div className="relative h-2 bg-white/[0.06] rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${remaining}%` }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        className={`absolute inset-y-0 left-0 bg-gradient-to-r ${colorMap[color]} rounded-full`}
      />
      {/* Shimmer effect */}
      <motion.div
        initial={{ x: '-100%' }}
        animate={{ x: '200%' }}
        transition={{ duration: 2, repeat: Infinity, repeatDelay: 3, ease: 'linear' }}
        className="absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-white/20 to-transparent"
      />
    </div>
  );
}

// ============================================================
// ANIMATED COUNTER
// ============================================================

function AnimatedCounter({ value, duration = 1 }: { value: number; duration?: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTime: number;
    let animationFrame: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);

      // Ease out expo
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.floor(eased * value));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [value, duration]);

  return <>{displayValue.toLocaleString()}</>;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

function ConnectorAgentInner() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // useMemo ensures API is recreated if user changes (fixes race condition)
  const api = useMemo(() => new ConnectorAgentAPI(user!.id, user!.email!), [user?.id, user?.email]);
  const [activeKey, setActiveKey] = useState<ApiKeyData | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [activeTab, setActiveTab] = useState<'find' | 'verify' | 'integrate'>('find');
  const [result, setResult] = useState<any>(null);
  const [integratePlatform, setIntegratePlatform] = useState<'make' | 'n8n' | 'zapier'>('make');

  const [findFirstName, setFindFirstName] = useState('');
  const [findLastName, setFindLastName] = useState('');
  const [findDomain, setFindDomain] = useState('');
  const [verifyEmailInput, setVerifyEmailInput] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        const keyResult = await api.getActiveKey();
        if (keyResult.success && keyResult.key) setActiveKey(keyResult.key);
        // Always fetch quota (works with user headers)
        const quotaResult = await api.getQuota();
        if (quotaResult.success && quotaResult.quota) setQuota(quotaResult.quota);
      } catch (err) {
        console.error('[ConnectorAgent] Load error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [api]);

  const handleGenerateKey = async () => {
    setIsProcessing(true);
    try {
      const result = await api.generateKey();
      if (result.success && result.key) {
        api.setApiKey(result.key);
        setNewKey(result.key);
        const keyResult = await api.getActiveKey();
        if (keyResult.success && keyResult.key) setActiveKey(keyResult.key);
        const quotaResult = await api.getQuota();
        if (quotaResult.success && quotaResult.quota) setQuota(quotaResult.quota);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRevokeKey = async () => {
    if (!activeKey || !confirm('Revoke this API key?')) return;
    setIsProcessing(true);
    try {
      const result = await api.revokeKey(activeKey.key_id);
      if (result.success) {
        api.clearApiKey();
        setActiveKey(null);
        setNewKey(null);
        setQuota(null);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleFind = async () => {
    if (!findFirstName || !findLastName || !findDomain) return;
    if (!findDomain.includes('.')) {
      alert('Domain must include TLD (e.g. company.com)');
      return;
    }
    setIsProcessing(true);
    setResult(null);
    try {
      const res = await api.findEmail(findFirstName, findLastName, findDomain);
      setResult({ type: 'find', ...res });
      const quotaResult = await api.getQuota();
      if (quotaResult.success && quotaResult.quota) setQuota(quotaResult.quota);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVerify = async () => {
    if (!verifyEmailInput) return;
    setIsProcessing(true);
    setResult(null);
    try {
      const res = await api.verifyEmail(verifyEmailInput);
      setResult({ type: 'verify', ...res });
      const quotaResult = await api.getQuota();
      if (quotaResult.success && quotaResult.quota) setQuota(quotaResult.quota);
    } finally {
      setIsProcessing(false);
    }
  };

  const getVerdictDisplay = (verdict: string) => {
    if (verdict === 'VALID' || verdict === 'SAFE') return { label: 'Valid', color: 'emerald' };
    if (verdict === 'INVALID' || verdict === 'BLOCKED') return { label: 'Invalid', color: 'red' };
    return { label: 'Unknown', color: 'amber' };
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          <Loader2 className="w-5 h-5 text-white/40" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black noise-bg">
      {/* Animated gradient orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            x: [0, 100, 0],
            y: [0, -50, 0],
            scale: [1, 1.2, 1]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          className="absolute -top-1/2 -left-1/4 w-[800px] h-[800px] bg-blue-500/[0.03] rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            x: [0, -100, 0],
            y: [0, 50, 0],
            scale: [1, 1.1, 1]
          }}
          transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
          className="absolute -bottom-1/2 -right-1/4 w-[800px] h-[800px] bg-violet-500/[0.03] rounded-full blur-3xl"
        />
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative max-w-4xl mx-auto px-6 py-10"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/launcher')}
              className="w-10 h-10 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] flex items-center justify-center transition-all"
            >
              <ArrowLeft className="w-4 h-4 text-white/50" />
            </button>
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center border border-white/[0.08]">
                  <Eye className="w-5 h-5 text-white/80" />
                </div>
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-violet-500 rounded-full border-2 border-black"
                />
              </div>
              <div>
                <h1 className="text-[15px] font-semibold text-white/90 tracking-tight">Connector Agent</h1>
                <p className="text-[11px] text-white/40">Locate & confirm contacts</p>
              </div>
            </div>
          </div>

          {/* Active indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/[0.1] border border-violet-500/[0.2]">
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full bg-violet-500"
            />
            <span className="text-[10px] font-medium text-violet-400 uppercase tracking-wider">Active</span>
          </div>
        </motion.div>

        {/* Quota Card */}
        {quota && (
          <motion.div variants={itemVariants} className="mb-6 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-white/40" />
                <span className="text-[12px] font-medium text-white/60 uppercase tracking-wider">Token Usage</span>
              </div>
              <div className="text-right">
                <span className="text-[13px] font-semibold text-white/90">
                  <AnimatedCounter value={quota.remaining} />
                </span>
                <span className="text-[11px] text-white/40 ml-1">/ {quota.limit.toLocaleString()}</span>
              </div>
            </div>
            <AnimatedProgressBar
              value={quota.used}
              max={quota.limit}
              color={quota.percentage_used > 80 ? 'red' : quota.percentage_used > 50 ? 'amber' : 'blue'}
            />
            <div className="flex justify-between mt-2">
              <span className="text-[10px] text-white/30">{quota.used.toLocaleString()} used</span>
              <span className="text-[10px] text-white/30">{100 - quota.percentage_used}% remaining</span>
            </div>
          </motion.div>
        )}

        {/* API Key Card */}
        <motion.div variants={itemVariants} className="mb-6 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-white/40" />
              <span className="text-[12px] font-medium text-white/60 uppercase tracking-wider">API Key</span>
            </div>
            {activeKey && (
              <button
                onClick={handleRevokeKey}
                disabled={isProcessing}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-red-500/[0.08] text-red-400 hover:bg-red-500/[0.15] transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 className="w-3 h-3" />
                Revoke
              </button>
            )}
          </div>

          <AnimatePresence mode="wait">
            {!activeKey ? (
              <motion.button
                key="generate"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                onClick={handleGenerateKey}
                disabled={isProcessing}
                className="w-full h-[44px] btn-primary text-[13px] flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                    <Loader2 className="w-4 h-4" />
                  </motion.div>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate API Key
                  </>
                )}
              </motion.button>
            ) : (
              <motion.div
                key="keyDisplay"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                {/* Always show full key from localStorage */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-violet-500/[0.15] flex items-center justify-center">
                      <Key className="w-4 h-4 text-violet-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-[11px] text-white/80 font-mono truncate max-w-[280px]">
                          {api.getApiKey() || activeKey.key_prefix}
                        </code>
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-medium bg-emerald-500/[0.15] text-emerald-400 uppercase tracking-wider flex-shrink-0">Active</span>
                      </div>
                      <div className="text-[10px] text-white/30 mt-1">
                        Last used: {activeKey.last_used_at ? new Date(activeKey.last_used_at).toLocaleDateString() : 'Never'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const keyToCopy = api.getApiKey();
                      if (keyToCopy) {
                        handleCopy(keyToCopy, 'apikey');
                      } else {
                        alert('API key not available. Generate a new key to copy.');
                      }
                    }}
                    className="h-9 w-9 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center transition-colors flex-shrink-0 ml-3"
                  >
                    {copied === 'apikey' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-white/50" />}
                  </button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </motion.div>

        {/* Tabs & Content */}
        {activeKey && (
          <>
            <motion.div variants={itemVariants} className="flex gap-1 mb-5 p-1 rounded-xl bg-white/[0.02] border border-white/[0.06] w-fit">
              {[
                { id: 'find', label: 'Find', icon: Search },
                { id: 'verify', label: 'Verify', icon: ShieldCheck },
                { id: 'integrate', label: 'Integrate', icon: Code2 },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id as any); setResult(null); }}
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-medium transition-all ${
                    activeTab === tab.id ? 'text-white/90' : 'text-white/40 hover:text-white/60'
                  }`}
                >
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-0 bg-white/[0.08] rounded-lg"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <tab.icon className="w-4 h-4 relative z-10" />
                  <span className="relative z-10">{tab.label}</span>
                </button>
              ))}
            </motion.div>

            <motion.div variants={itemVariants} className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
              <AnimatePresence mode="wait">
                {activeTab === 'find' && (
                  <motion.div
                    key="find"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-4"
                  >
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'First Name', value: findFirstName, onChange: setFindFirstName, placeholder: 'John' },
                        { label: 'Last Name', value: findLastName, onChange: setFindLastName, placeholder: 'Doe' },
                        { label: 'Domain', value: findDomain, onChange: setFindDomain, placeholder: 'company.com' },
                      ].map((field, i) => (
                        <div key={field.label}>
                          <label className="block text-[10px] text-white/40 mb-1.5 uppercase tracking-wider">{field.label}</label>
                          <input
                            type="text"
                            value={field.value}
                            onChange={(e) => field.onChange(e.target.value)}
                            placeholder={field.placeholder}
                            className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/90 text-[13px] placeholder:text-white/20 focus:outline-none focus:border-white/[0.15] transition-all"
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={handleFind}
                      disabled={isProcessing || !findFirstName || !findLastName || !findDomain}
                      className="w-full h-[44px] btn-primary text-[13px] flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      {isProcessing ? (
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                          <Loader2 className="w-4 h-4" />
                        </motion.div>
                      ) : (
                        <>
                          <Search className="w-4 h-4" />
                          Find Email
                        </>
                      )}
                    </button>
                  </motion.div>
                )}

                {activeTab === 'verify' && (
                  <motion.div
                    key="verify"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-4"
                  >
                    <div>
                      <label className="block text-[10px] text-white/40 mb-1.5 uppercase tracking-wider">Email Address</label>
                      <input
                        type="email"
                        value={verifyEmailInput}
                        onChange={(e) => setVerifyEmailInput(e.target.value)}
                        placeholder="john@company.com"
                        className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/90 text-[13px] placeholder:text-white/20 focus:outline-none focus:border-white/[0.15] transition-all"
                      />
                    </div>
                    <button
                      onClick={handleVerify}
                      disabled={isProcessing || !verifyEmailInput}
                      className="w-full h-[44px] btn-primary text-[13px] flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      {isProcessing ? (
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                          <Loader2 className="w-4 h-4" />
                        </motion.div>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4" />
                          Verify Email
                        </>
                      )}
                    </button>
                  </motion.div>
                )}

                {activeTab === 'integrate' && (
                  <motion.div
                    key="integrate"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="space-y-5"
                  >
                    {/* Your API Key - Prominent */}
                    <div className="p-4 rounded-xl bg-gradient-to-br from-violet-500/[0.08] to-fuchsia-500/[0.04] border border-violet-500/[0.15]">
                      <div className="flex items-center gap-2 mb-2">
                        <Key className="w-4 h-4 text-violet-400" />
                        <span className="text-[11px] font-semibold text-white/80 uppercase tracking-wider">Your API Key</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 px-3 py-2 rounded-lg bg-black/40 text-[12px] font-mono text-white/90 truncate">
                          {api.getApiKey() || 'Generate a key above'}
                        </code>
                        <button
                          onClick={() => {
                            const key = api.getApiKey();
                            if (key) handleCopy(key, 'integrate-key');
                          }}
                          disabled={!api.getApiKey()}
                          className="h-9 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] disabled:opacity-40 flex items-center gap-2 transition-colors"
                        >
                          {copied === 'integrate-key' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-white/50" />}
                          <span className="text-[11px] text-white/60">{copied === 'integrate-key' ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Platform Tabs */}
                    <div className="flex gap-1 p-1 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                      {[
                        { id: 'make' as const, label: 'Make.com', icon: Globe },
                        { id: 'n8n' as const, label: 'n8n', icon: Zap },
                        { id: 'zapier' as const, label: 'Zapier', icon: Zap },
                      ].map(platform => (
                        <button
                          key={platform.id}
                          onClick={() => setIntegratePlatform(platform.id)}
                          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium transition-all ${
                            integratePlatform === platform.id
                              ? 'bg-white/[0.08] text-white/90'
                              : 'text-white/40 hover:text-white/60'
                          }`}
                        >
                          <platform.icon className="w-3.5 h-3.5" />
                          {platform.label}
                        </button>
                      ))}
                    </div>

                    {/* Platform-specific instructions */}
                    <div className="space-y-4">
                      {integratePlatform === 'make' && (
                        <div className="space-y-4">
                          <div className="text-[13px] text-white/70 leading-relaxed">
                            Connect to Make.com using the HTTP module.
                          </div>

                          {/* Step 1 */}
                          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="w-5 h-5 rounded-full bg-blue-500/[0.2] text-blue-400 text-[10px] font-bold flex items-center justify-center">1</span>
                              <span className="text-[12px] font-medium text-white/80">Add HTTP Module</span>
                            </div>
                            <p className="text-[11px] text-white/50 mb-3">Add "HTTP - Make a request" module to your scenario</p>
                          </div>

                          {/* Step 2 */}
                          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="w-5 h-5 rounded-full bg-blue-500/[0.2] text-blue-400 text-[10px] font-bold flex items-center justify-center">2</span>
                              <span className="text-[12px] font-medium text-white/80">Configure Request</span>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between p-2 rounded-lg bg-black/40">
                                <span className="text-[10px] text-white/40">URL</span>
                                <div className="flex items-center gap-2">
                                  <code className="text-[10px] text-white/70 font-mono">{API_BASE}/api/email/v2/find</code>
                                  <button onClick={() => handleCopy(`${API_BASE}/api/email/v2/find`, 'make-url')} className="text-white/30 hover:text-white/60">
                                    {copied === 'make-url' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                  </button>
                                </div>
                              </div>
                              <div className="flex items-center justify-between p-2 rounded-lg bg-black/40">
                                <span className="text-[10px] text-white/40">Method</span>
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-500/[0.2] text-blue-400">POST</span>
                              </div>
                            </div>
                          </div>

                          {/* Step 3 - Headers */}
                          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="w-5 h-5 rounded-full bg-blue-500/[0.2] text-blue-400 text-[10px] font-bold flex items-center justify-center">3</span>
                              <span className="text-[12px] font-medium text-white/80">Set Headers</span>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between p-2 rounded-lg bg-black/40">
                                <span className="text-[10px] text-white/40">Authorization</span>
                                <div className="flex items-center gap-2">
                                  <code className="text-[10px] text-white/70 font-mono">Bearer {api.getApiKey()?.slice(0, 12) || 'YOUR_KEY'}...</code>
                                  <button onClick={() => handleCopy(`Bearer ${api.getApiKey() || 'YOUR_API_KEY'}`, 'make-auth')} className="text-white/30 hover:text-white/60">
                                    {copied === 'make-auth' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                  </button>
                                </div>
                              </div>
                              <div className="flex items-center justify-between p-2 rounded-lg bg-black/40">
                                <span className="text-[10px] text-white/40">Content-Type</span>
                                <div className="flex items-center gap-2">
                                  <code className="text-[10px] text-white/70 font-mono">application/json</code>
                                  <button onClick={() => handleCopy('application/json', 'make-ct')} className="text-white/30 hover:text-white/60">
                                    {copied === 'make-ct' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Step 4 - Body */}
                          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-blue-500/[0.2] text-blue-400 text-[10px] font-bold flex items-center justify-center">4</span>
                                <span className="text-[12px] font-medium text-white/80">Request Body (JSON)</span>
                              </div>
                              <button
                                onClick={() => handleCopy('{"firstName": "John", "lastName": "Doe", "domain": "company.com"}', 'make-body')}
                                className="text-[10px] text-white/40 hover:text-white/60 flex items-center gap-1"
                              >
                                {copied === 'make-body' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                Copy
                              </button>
                            </div>
                            <pre className="p-3 rounded-lg bg-black/60 text-[10px] text-white/60 font-mono overflow-x-auto">
{`{
  "firstName": "John",
  "lastName": "Doe",
  "domain": "company.com"
}`}
                            </pre>
                          </div>

                          {/* Response */}
                          <div className="p-4 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/[0.1]">
                            <div className="flex items-center gap-2 mb-3">
                              <Check className="w-4 h-4 text-emerald-400" />
                              <span className="text-[12px] font-medium text-white/80">Response</span>
                            </div>
                            <pre className="p-3 rounded-lg bg-black/40 text-[10px] text-emerald-400/80 font-mono">
{`{ "email": "john.doe@company.com" }`}
                            </pre>
                            <p className="text-[10px] text-white/40 mt-2">Returns <code className="text-white/60">null</code> if no email found</p>
                          </div>
                        </div>
                      )}

                      {integratePlatform === 'n8n' && (
                        <div className="space-y-4">
                          <div className="text-[13px] text-white/70 leading-relaxed">
                            Connect to n8n using the HTTP Request node.
                          </div>

                          {/* Step 1 */}
                          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="w-5 h-5 rounded-full bg-orange-500/[0.2] text-orange-400 text-[10px] font-bold flex items-center justify-center">1</span>
                              <span className="text-[12px] font-medium text-white/80">Add HTTP Request Node</span>
                            </div>
                            <p className="text-[11px] text-white/50">Add an "HTTP Request" node to your workflow</p>
                          </div>

                          {/* Step 2 */}
                          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="w-5 h-5 rounded-full bg-orange-500/[0.2] text-orange-400 text-[10px] font-bold flex items-center justify-center">2</span>
                              <span className="text-[12px] font-medium text-white/80">Configure</span>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between p-2 rounded-lg bg-black/40">
                                <span className="text-[10px] text-white/40">Method</span>
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-500/[0.2] text-blue-400">POST</span>
                              </div>
                              <div className="flex items-center justify-between p-2 rounded-lg bg-black/40">
                                <span className="text-[10px] text-white/40">URL</span>
                                <div className="flex items-center gap-2">
                                  <code className="text-[10px] text-white/70 font-mono">{API_BASE}/api/email/v2/find</code>
                                  <button onClick={() => handleCopy(`${API_BASE}/api/email/v2/find`, 'n8n-url')} className="text-white/30 hover:text-white/60">
                                    {copied === 'n8n-url' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                  </button>
                                </div>
                              </div>
                              <div className="flex items-center justify-between p-2 rounded-lg bg-black/40">
                                <span className="text-[10px] text-white/40">Authentication</span>
                                <span className="text-[10px] text-white/70">Generic Credential Type → Header Auth</span>
                              </div>
                              <div className="flex items-center justify-between p-2 rounded-lg bg-black/40">
                                <span className="text-[10px] text-white/40">Header Name</span>
                                <code className="text-[10px] text-white/70 font-mono">Authorization</code>
                              </div>
                              <div className="flex items-center justify-between p-2 rounded-lg bg-black/40">
                                <span className="text-[10px] text-white/40">Header Value</span>
                                <div className="flex items-center gap-2">
                                  <code className="text-[10px] text-white/70 font-mono">Bearer {api.getApiKey()?.slice(0, 8) || 'YOUR'}...</code>
                                  <button onClick={() => handleCopy(`Bearer ${api.getApiKey() || 'YOUR_API_KEY'}`, 'n8n-auth')} className="text-white/30 hover:text-white/60">
                                    {copied === 'n8n-auth' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Step 3 - Body */}
                          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-orange-500/[0.2] text-orange-400 text-[10px] font-bold flex items-center justify-center">3</span>
                                <span className="text-[12px] font-medium text-white/80">Body Parameters</span>
                              </div>
                              <button
                                onClick={() => handleCopy('{"firstName": "{{$json.firstName}}", "lastName": "{{$json.lastName}}", "domain": "{{$json.domain}}"}', 'n8n-body')}
                                className="text-[10px] text-white/40 hover:text-white/60 flex items-center gap-1"
                              >
                                {copied === 'n8n-body' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                Copy
                              </button>
                            </div>
                            <pre className="p-3 rounded-lg bg-black/60 text-[10px] text-white/60 font-mono overflow-x-auto">
{`{
  "firstName": "{{$json.firstName}}",
  "lastName": "{{$json.lastName}}",
  "domain": "{{$json.domain}}"
}`}
                            </pre>
                          </div>

                          {/* Response */}
                          <div className="p-4 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/[0.1]">
                            <div className="flex items-center gap-2 mb-3">
                              <Check className="w-4 h-4 text-emerald-400" />
                              <span className="text-[12px] font-medium text-white/80">Response</span>
                            </div>
                            <pre className="p-3 rounded-lg bg-black/40 text-[10px] text-emerald-400/80 font-mono">
{`{ "email": "john.doe@company.com" }`}
                            </pre>
                          </div>
                        </div>
                      )}

                      {integratePlatform === 'zapier' && (
                        <div className="space-y-4">
                          <div className="text-[13px] text-white/70 leading-relaxed">
                            Connect to Zapier using Webhooks by Zapier.
                          </div>

                          {/* Step 1 */}
                          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="w-5 h-5 rounded-full bg-orange-500/[0.2] text-orange-400 text-[10px] font-bold flex items-center justify-center">1</span>
                              <span className="text-[12px] font-medium text-white/80">Add Webhooks Action</span>
                            </div>
                            <p className="text-[11px] text-white/50">Search for "Webhooks by Zapier" and select "Custom Request"</p>
                          </div>

                          {/* Step 2 */}
                          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="w-5 h-5 rounded-full bg-orange-500/[0.2] text-orange-400 text-[10px] font-bold flex items-center justify-center">2</span>
                              <span className="text-[12px] font-medium text-white/80">Configure Request</span>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between p-2 rounded-lg bg-black/40">
                                <span className="text-[10px] text-white/40">Method</span>
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-500/[0.2] text-blue-400">POST</span>
                              </div>
                              <div className="flex items-center justify-between p-2 rounded-lg bg-black/40">
                                <span className="text-[10px] text-white/40">URL</span>
                                <div className="flex items-center gap-2">
                                  <code className="text-[10px] text-white/70 font-mono">{API_BASE}/api/email/v2/find</code>
                                  <button onClick={() => handleCopy(`${API_BASE}/api/email/v2/find`, 'zap-url')} className="text-white/30 hover:text-white/60">
                                    {copied === 'zap-url' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Step 3 - Headers */}
                          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="w-5 h-5 rounded-full bg-orange-500/[0.2] text-orange-400 text-[10px] font-bold flex items-center justify-center">3</span>
                              <span className="text-[12px] font-medium text-white/80">Headers</span>
                            </div>
                            <div className="space-y-2">
                              <div className="p-2 rounded-lg bg-black/40">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-white/40">Authorization</span>
                                  <button onClick={() => handleCopy(`Bearer ${api.getApiKey() || 'YOUR_API_KEY'}`, 'zap-auth')} className="text-white/30 hover:text-white/60">
                                    {copied === 'zap-auth' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                  </button>
                                </div>
                                <code className="text-[10px] text-white/70 font-mono">Bearer {api.getApiKey()?.slice(0, 12) || 'YOUR_KEY'}...</code>
                              </div>
                              <div className="p-2 rounded-lg bg-black/40">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-white/40">Content-Type</span>
                                  <button onClick={() => handleCopy('application/json', 'zap-ct')} className="text-white/30 hover:text-white/60">
                                    {copied === 'zap-ct' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                  </button>
                                </div>
                                <code className="text-[10px] text-white/70 font-mono">application/json</code>
                              </div>
                            </div>
                          </div>

                          {/* Step 4 - Data */}
                          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-orange-500/[0.2] text-orange-400 text-[10px] font-bold flex items-center justify-center">4</span>
                                <span className="text-[12px] font-medium text-white/80">Data (Raw JSON)</span>
                              </div>
                              <button
                                onClick={() => handleCopy('{"firstName": "John", "lastName": "Doe", "domain": "company.com"}', 'zap-body')}
                                className="text-[10px] text-white/40 hover:text-white/60 flex items-center gap-1"
                              >
                                {copied === 'zap-body' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                Copy
                              </button>
                            </div>
                            <pre className="p-3 rounded-lg bg-black/60 text-[10px] text-white/60 font-mono overflow-x-auto">
{`{
  "firstName": "John",
  "lastName": "Doe",
  "domain": "company.com"
}`}
                            </pre>
                          </div>

                          {/* Response */}
                          <div className="p-4 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/[0.1]">
                            <div className="flex items-center gap-2 mb-3">
                              <Check className="w-4 h-4 text-emerald-400" />
                              <span className="text-[12px] font-medium text-white/80">Response</span>
                            </div>
                            <pre className="p-3 rounded-lg bg-black/40 text-[10px] text-emerald-400/80 font-mono">
{`{ "email": "john.doe@company.com" }`}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Verify Endpoint Note */}
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                      <div className="flex items-center gap-2 mb-2">
                        <ShieldCheck className="w-4 h-4 text-white/40" />
                        <span className="text-[11px] font-medium text-white/60">Verify Endpoint</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <code className="text-[10px] text-white/50 font-mono">/api/email/v2/verify</code>
                        <button onClick={() => handleCopy(`${API_BASE}/api/email/v2/verify`, 'verify-url')} className="text-[10px] text-white/40 hover:text-white/60 flex items-center gap-1">
                          {copied === 'verify-url' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          Copy URL
                        </button>
                      </div>
                      <p className="text-[10px] text-white/40 mt-2">Body: <code className="text-white/50">{`{"email": "john@company.com"}`}</code></p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Result */}
              <AnimatePresence>
                {result && (activeTab === 'find' || activeTab === 'verify') && (
                  <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    className={`mt-5 p-4 rounded-xl border ${
                      result.email
                        ? 'bg-emerald-500/[0.04] border-emerald-500/[0.1]'
                        : 'bg-white/[0.02] border-white/[0.06]'
                    }`}
                  >
                    {result.email ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 25, delay: 0.1 }}
                            className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-500/[0.15]"
                          >
                            <Mail className="w-5 h-5 text-emerald-400" />
                          </motion.div>
                          <div>
                            <code className="text-[13px] font-mono text-white/90">{result.email}</code>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-emerald-500/[0.15] text-emerald-400">
                                Valid
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleCopy(result.email!, 'result-email')}
                          className="h-9 w-9 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center transition-colors"
                        >
                          {copied === 'result-email' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-white/50" />}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center">
                          <AlertCircle className="w-5 h-5 text-white/30" />
                        </div>
                        <div>
                          <p className="text-[13px] text-white/70">No email found</p>
                          <p className="text-[11px] text-white/40 mt-0.5">Could not find a valid email</p>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </>
        )}

      </motion.div>
    </div>
  );
}

// ============================================================
// EXPORT
// ============================================================

export default function ConnectorAgent() {
  if (!FEATURES.CONNECTOR_AGENT_ENABLED) {
    return (
      <ComingSoon
        title="Connector Agent"
        description="Locate & confirm contacts. Coming soon."
      />
    );
  }

  return (
    <SSMGateLocal>
      <ConnectorAgentInner />
    </SSMGateLocal>
  );
}
