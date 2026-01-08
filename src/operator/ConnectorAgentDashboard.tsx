/**
 * Connector Agent Dashboard
 *
 * Operator control panel for email verification backend.
 * Linear-style dark UI.
 */

import { useState, useEffect } from 'react';
import { Key, Activity, RefreshCw, CheckCircle, AlertCircle, Zap, Users } from 'lucide-react';

const BACKEND_URL = 'http://localhost:8000';
const ADMIN_SECRET = 'connector-admin-2024';

interface SystemStatus {
  mode: 'NORMAL' | 'DEGRADED' | 'RESTRICTED';
  mailtester: {
    key_configured: boolean;
    token_valid: boolean;
    token_expires_in: string | null;
  };
  rate_limit: {
    tokens_available: string;
    max_burst: number;
    rate: string;
  };
  queue_depth: number;
  metrics_60s: {
    ok: number;
    ko: number;
    mb: number;
    timeout: number;
    error: number;
    limited: number;
  };
}

interface HealthStatus {
  status: string;
  mode: string;
  mailtester: string;
  queue_depth: number;
}

export default function ConnectorAgentDashboard() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<{ success: boolean; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [backendOnline, setBackendOnline] = useState(false);

  const fetchStatus = async () => {
    try {
      // Fetch health (public)
      const healthRes = await fetch(`${BACKEND_URL}/health`);
      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setHealth(healthData);
        setBackendOnline(true);
      }

      // Fetch detailed status (admin)
      const statusRes = await fetch(`${BACKEND_URL}/admin/status`, {
        headers: { 'x-admin-secret': ADMIN_SECRET },
      });
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setStatus(statusData);
      }
    } catch (err) {
      setBackendOnline(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, []);

  const updateApiKey = async () => {
    if (!apiKey.trim()) return;

    setUpdating(true);
    setUpdateResult(null);

    try {
      const res = await fetch(`${BACKEND_URL}/admin/mailtester/key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': ADMIN_SECRET,
        },
        body: JSON.stringify({ api_key: apiKey.trim().replace(/[{}]/g, '') }),
      });

      const data = await res.json();

      if (data.success) {
        setUpdateResult({ success: true, message: `Key updated: ${data.key_prefix}` });
        setApiKey('');
        fetchStatus();
      } else {
        setUpdateResult({ success: false, message: data.error || 'Update failed' });
      }
    } catch (err) {
      setUpdateResult({ success: false, message: 'Connection failed' });
    } finally {
      setUpdating(false);
    }
  };

  const getModeColor = (mode: string) => {
    switch (mode) {
      case 'NORMAL': return 'text-emerald-400';
      case 'DEGRADED': return 'text-amber-400';
      case 'RESTRICTED': return 'text-red-400';
      default: return 'text-white/50';
    }
  };

  const getMailtesterColor = (status: string) => {
    switch (status) {
      case 'reachable': return 'text-emerald-400';
      case 'degraded': return 'text-amber-400';
      case 'down': return 'text-red-400';
      default: return 'text-white/50';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-white/30 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-white p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Connector Agent</h1>
            <p className="text-white/50 text-sm mt-1">Email verification backend control</p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
              backendOnline ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${backendOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
              {backendOnline ? 'Online' : 'Offline'}
            </div>
          </div>
        </div>

        {!backendOnline ? (
          <div className="p-8 rounded-xl border border-white/[0.06] bg-white/[0.02] text-center">
            <AlertCircle className="w-12 h-12 text-red-400/50 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Backend Offline</h3>
            <p className="text-white/50 text-sm mb-4">
              Start the backend server at localhost:8000
            </p>
            <code className="text-xs bg-white/[0.06] px-3 py-2 rounded-lg text-white/70 font-mono">
              cd connector-agent-backend && npm start
            </code>
          </div>
        ) : (
          <>
            {/* Status Cards */}
            <div className="grid grid-cols-4 gap-4">
              {/* Mode */}
              <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <div className="flex items-center gap-2 text-white/40 text-xs mb-2">
                  <Activity className="w-3.5 h-3.5" />
                  MODE
                </div>
                <div className={`text-xl font-semibold ${getModeColor(health?.mode || '')}`}>
                  {health?.mode || '—'}
                </div>
              </div>

              {/* MailTester */}
              <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <div className="flex items-center gap-2 text-white/40 text-xs mb-2">
                  <Zap className="w-3.5 h-3.5" />
                  MAILTESTER
                </div>
                <div className={`text-xl font-semibold ${getMailtesterColor(health?.mailtester || '')}`}>
                  {health?.mailtester || '—'}
                </div>
              </div>

              {/* Queue */}
              <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <div className="flex items-center gap-2 text-white/40 text-xs mb-2">
                  <Users className="w-3.5 h-3.5" />
                  QUEUE
                </div>
                <div className="text-xl font-semibold text-white">
                  {health?.queue_depth ?? '—'}
                </div>
              </div>

              {/* Rate Limit */}
              <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <div className="flex items-center gap-2 text-white/40 text-xs mb-2">
                  <RefreshCw className="w-3.5 h-3.5" />
                  RATE
                </div>
                <div className="text-xl font-semibold text-white">
                  {status?.rate_limit?.rate || '2/sec'}
                </div>
              </div>
            </div>

            {/* API Key Update */}
            <div className="p-6 rounded-xl border border-white/[0.06] bg-white/[0.02]">
              <div className="flex items-center gap-2 mb-4">
                <Key className="w-4 h-4 text-white/40" />
                <h3 className="font-medium">MailTester API Key</h3>
                {status?.mailtester?.key_configured && (
                  <span className="ml-auto text-xs text-emerald-400 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Configured
                  </span>
                )}
              </div>

              <div className="flex gap-3">
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Paste new API key (with or without braces)"
                  className="flex-1 h-10 px-4 rounded-lg bg-white/[0.04] border border-white/[0.08]
                    text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/20
                    font-mono tracking-tight"
                />
                <button
                  onClick={updateApiKey}
                  disabled={updating || !apiKey.trim()}
                  className="h-10 px-5 rounded-lg bg-white text-black text-sm font-medium
                    hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed
                    transition-all"
                >
                  {updating ? 'Updating...' : 'Update Key'}
                </button>
              </div>

              {updateResult && (
                <div className={`mt-3 text-sm ${updateResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
                  {updateResult.message}
                </div>
              )}

              {status?.mailtester?.token_expires_in && (
                <div className="mt-3 text-xs text-white/40">
                  Token expires in: {status.mailtester.token_expires_in}
                </div>
              )}
            </div>

            {/* Metrics (Last 60s) */}
            {status?.metrics_60s && (
              <div className="p-6 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <h3 className="font-medium mb-4">Last 60 Seconds</h3>
                <div className="grid grid-cols-6 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-semibold text-emerald-400">{status.metrics_60s.ok}</div>
                    <div className="text-xs text-white/40 mt-1">OK</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-semibold text-red-400">{status.metrics_60s.ko}</div>
                    <div className="text-xs text-white/40 mt-1">KO</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-semibold text-amber-400">{status.metrics_60s.mb}</div>
                    <div className="text-xs text-white/40 mt-1">MB</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-semibold text-white/50">{status.metrics_60s.timeout}</div>
                    <div className="text-xs text-white/40 mt-1">Timeout</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-semibold text-white/50">{status.metrics_60s.error}</div>
                    <div className="text-xs text-white/40 mt-1">Error</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-semibold text-violet-400">{status.metrics_60s.limited}</div>
                    <div className="text-xs text-white/40 mt-1">Limited</div>
                  </div>
                </div>
              </div>
            )}

            {/* Info */}
            <div className="text-xs text-white/30 text-center">
              Auto-refreshes every 5 seconds • Backend at localhost:8000
            </div>
          </>
        )}
      </div>
    </div>
  );
}
