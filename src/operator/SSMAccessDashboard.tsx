import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Check, X, RefreshCw, Users, Clock, CheckCircle, XCircle, Mail, Key, MoreHorizontal, Plus, ShieldCheck, Eye, EyeOff, LogOut, Zap, Activity, Coins } from 'lucide-react';
import { useAuth } from '../AuthContext';

interface SSMAccessRow {
  id: string;
  email: string;
  full_name: string | null;
  status: 'pending' | 'approved' | 'revoked';
  approved_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Connector Agent Backend
const CONNECTOR_AGENT_URL = window.location.hostname === 'localhost' ? 'http://localhost:8000' : 'https://api.connector-os.com';
const CONNECTOR_AGENT_SECRET = 'connector-admin-2024';

interface ConnectorAgentStatus {
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

interface ConnectorAgentHealth {
  status: string;
  mode: string;
  mailtester: string;
  queue_depth: number;
}

async function fetchAccessList(): Promise<SSMAccessRow[]> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/ssm-access/list`, {
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.rows || [];
  } catch (error) {
    console.error('[SSM Dashboard] Fetch error:', error);
    return [];
  }
}

async function approveAccess(email: string): Promise<boolean> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/ssm-access/approve`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function revokeAccess(email: string): Promise<boolean> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/ssm-access/revoke`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function sendMagicLink(email: string): Promise<boolean> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-magic-link`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, type: 'magiclink', redirectTo: 'https://app.connector-os.com/auth/callback' }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function sendPasswordReset(email: string): Promise<boolean> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-magic-link`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, type: 'recovery', redirectTo: 'https://app.connector-os.com/auth/callback' }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function addMemberManually(email: string, fullName: string, sendEmail: boolean): Promise<boolean> {
  try {
    // Add via edge function (bypasses RLS)
    const response = await fetch(`${SUPABASE_URL}/functions/v1/ssm-access/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email.toLowerCase().trim(),
        full_name: fullName.trim(),
      }),
    });

    if (!response.ok) {
      console.error('Failed to add member:', await response.text());
      return false;
    }

    // Send magic link if requested
    if (sendEmail) {
      await sendMagicLink(email);
    }

    return true;
  } catch {
    return false;
  }
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function SSMAccessDashboard() {
  const navigate = useNavigate();
  const { user, setPassword, signOut } = useAuth();
  const [rows, setRows] = useState<SSMAccessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'approved' | 'pending'>('all');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);
  const [addingMember, setAddingMember] = useState(false);

  // Operator account state
  const [showMyAccount, setShowMyAccount] = useState(false);
  const [myPassword, setMyPassword] = useState('');
  const [myConfirmPassword, setMyConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Connector Agent state
  const [agentStatus, setAgentStatus] = useState<ConnectorAgentStatus | null>(null);
  const [agentHealth, setAgentHealth] = useState<ConnectorAgentHealth | null>(null);
  const [agentOnline, setAgentOnline] = useState(false);
  const [mailtesterKey, setMailtesterKey] = useState('');
  const [updatingKey, setUpdatingKey] = useState(false);
  const [keyUpdateResult, setKeyUpdateResult] = useState<{ success: boolean; message: string } | null>(null);

  // Token adjustment state
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenEmail, setTokenEmail] = useState('');
  const [tokenQuota, setTokenQuota] = useState<{ used: number; limit: number; remaining: number } | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [newLimit, setNewLimit] = useState('');
  const [adjustingTokens, setAdjustingTokens] = useState(false);

  const openTokenModal = async (email: string) => {
    setTokenEmail(email);
    setShowTokenModal(true);
    setTokenQuota(null);
    setNewLimit('');
    setTokenLoading(true);
    try {
      const res = await fetch(`${CONNECTOR_AGENT_URL}/admin/tokens/quota?email=${encodeURIComponent(email)}`, {
        headers: { 'x-admin-secret': CONNECTOR_AGENT_SECRET },
      });
      if (res.ok) {
        const data = await res.json();
        setTokenQuota({ used: data.used, limit: data.limit, remaining: data.remaining });
        setNewLimit(String(data.limit));
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to fetch quota' }));
        setToast({ message: err.error || 'Failed to fetch quota', type: 'error' });
        setShowTokenModal(false);
      }
    } catch {
      setToast({ message: 'Connector Agent unreachable', type: 'error' });
      setShowTokenModal(false);
    } finally {
      setTokenLoading(false);
    }
  };

  const handleSetLimit = async () => {
    const limit = parseInt(newLimit, 10);
    if (isNaN(limit) || limit < 0) return;
    setAdjustingTokens(true);
    try {
      const res = await fetch(`${CONNECTOR_AGENT_URL}/admin/tokens/set-limit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': CONNECTOR_AGENT_SECRET },
        body: JSON.stringify({ email: tokenEmail, monthly_limit: limit }),
      });
      if (res.ok) {
        const data = await res.json();
        setToast({ message: `Limit updated: ${data.previous_limit.toLocaleString()} → ${data.new_limit.toLocaleString()}`, type: 'success' });
        setShowTokenModal(false);
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to set limit' }));
        setToast({ message: err.error || 'Failed to set limit', type: 'error' });
      }
    } catch {
      setToast({ message: 'Connector Agent unreachable', type: 'error' });
    } finally {
      setAdjustingTokens(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    const data = await fetchAccessList();
    setRows(data);
    setLoading(false);
  };

  const loadAgentStatus = async () => {
    try {
      // Fetch health (public)
      const healthRes = await fetch(`${CONNECTOR_AGENT_URL}/health`);
      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setAgentHealth(healthData);
        setAgentOnline(true);
      } else {
        setAgentOnline(false);
      }

      // Fetch detailed status (admin)
      const statusRes = await fetch(`${CONNECTOR_AGENT_URL}/admin/status`, {
        headers: { 'x-admin-secret': CONNECTOR_AGENT_SECRET },
      });
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setAgentStatus(statusData);
      }
    } catch {
      setAgentOnline(false);
    }
  };

  const updateMailtesterKey = async () => {
    if (!mailtesterKey.trim()) return;

    setUpdatingKey(true);
    setKeyUpdateResult(null);

    try {
      const res = await fetch(`${CONNECTOR_AGENT_URL}/admin/mailtester/key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': CONNECTOR_AGENT_SECRET,
        },
        body: JSON.stringify({ api_key: mailtesterKey.trim().replace(/[{}]/g, '') }),
      });

      const data = await res.json();

      if (data.success) {
        setKeyUpdateResult({ success: true, message: `Key updated: ${data.key_prefix}` });
        setMailtesterKey('');
        loadAgentStatus();
      } else {
        setKeyUpdateResult({ success: false, message: data.error || 'Update failed' });
      }
    } catch {
      setKeyUpdateResult({ success: false, message: 'Connection failed' });
    } finally {
      setUpdatingKey(false);
    }
  };

  useEffect(() => {
    loadData();
    loadAgentStatus();
    const interval = setInterval(loadAgentStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleApprove = async (email: string) => {
    setActionLoading(email);
    const ok = await approveAccess(email);
    if (ok) {
      setRows((prev) =>
        prev.map((r) =>
          r.email === email
            ? { ...r, status: 'approved', approved_at: new Date().toISOString() }
            : r
        )
      );
    }
    setActionLoading(null);
  };

  const handleRevoke = async (email: string) => {
    setActionLoading(email);
    const ok = await revokeAccess(email);
    if (ok) {
      setRows((prev) =>
        prev.map((r) =>
          r.email === email
            ? { ...r, status: 'revoked', revoked_at: new Date().toISOString() }
            : r
        )
      );
    }
    setActionLoading(null);
  };

  const handleSendMagicLink = async (email: string) => {
    setActionLoading(email);
    setOpenMenu(null);
    const ok = await sendMagicLink(email);
    if (ok) {
      setToast({ message: `Magic link sent to ${email}`, type: 'success' });
    } else {
      setToast({ message: 'Failed to send magic link', type: 'error' });
    }
    setActionLoading(null);
    setTimeout(() => setToast(null), 3000);
  };

  const handleSendPasswordReset = async (email: string) => {
    setActionLoading(email);
    setOpenMenu(null);
    const ok = await sendPasswordReset(email);
    if (ok) {
      setToast({ message: `Password reset sent to ${email}`, type: 'success' });
    } else {
      setToast({ message: 'Failed to send password reset', type: 'error' });
    }
    setActionLoading(null);
    setTimeout(() => setToast(null), 3000);
  };

  const handleAddMember = async () => {
    if (!newEmail.includes('@') || !newName.trim()) return;

    setAddingMember(true);
    const ok = await addMemberManually(newEmail, newName, sendWelcomeEmail);

    if (ok) {
      setToast({ message: `${newName} added successfully${sendWelcomeEmail ? ' — magic link sent' : ''}`, type: 'success' });
      setShowAddModal(false);
      setNewEmail('');
      setNewName('');
      loadData();
    } else {
      setToast({ message: 'Failed to add member (may already exist)', type: 'error' });
    }

    setAddingMember(false);
    setTimeout(() => setToast(null), 3000);
  };

  const handleMyPasswordChange = async () => {
    if (myPassword.length < 6) {
      setToast({ message: 'Password must be at least 6 characters', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    if (myPassword !== myConfirmPassword) {
      setToast({ message: 'Passwords do not match', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setChangingPassword(true);
    const result = await setPassword(myPassword);

    if (result.error) {
      setToast({ message: result.error, type: 'error' });
    } else {
      setToast({ message: 'Password updated', type: 'success' });
      setShowMyAccount(false);
      setMyPassword('');
      setMyConfirmPassword('');
    }

    setChangingPassword(false);
    setTimeout(() => setToast(null), 3000);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const pendingRows = rows.filter((r) => r.status === 'pending');
  const approvedRows = rows.filter((r) => r.status === 'approved');
  const filteredRows = filter === 'all' ? rows : filter === 'approved' ? approvedRows : pendingRows;

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Header */}
      <header className="border-b border-white/[0.06] bg-[#0A0A0A]/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/launcher')}
              className="p-1.5 -ml-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-all"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="h-4 w-px bg-white/[0.08]" />
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-white/50" />
              <h1 className="text-[15px] font-medium text-white/90">Access</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMyAccount(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-lg text-white/50 hover:text-white/70 hover:bg-white/[0.06] transition-all"
            >
              <Key size={14} />
              My Account
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-lg bg-white/[0.08] hover:bg-white/[0.12] text-white/90 transition-all"
            >
              <Plus size={14} />
              Add member
            </button>
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-all"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 pt-8 pb-24">
        {/* Stats row */}
        <div className="flex items-center gap-6 mb-8">
          <button
            onClick={() => setFilter('all')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${
              filter === 'all'
                ? 'bg-white/[0.08] text-white'
                : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
            }`}
          >
            <Users size={16} />
            <span className="text-[14px] font-medium">All</span>
            <span className="text-[13px] text-white/40 ml-1">{rows.length}</span>
          </button>
          <button
            onClick={() => setFilter('approved')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${
              filter === 'approved'
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
            }`}
          >
            <CheckCircle size={16} />
            <span className="text-[14px] font-medium">Approved</span>
            <span className="text-[13px] opacity-60 ml-1">{approvedRows.length}</span>
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${
              filter === 'pending'
                ? 'bg-amber-500/15 text-amber-400'
                : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
            }`}
          >
            <Clock size={16} />
            <span className="text-[14px] font-medium">Pending</span>
            {pendingRows.length > 0 && (
              <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-black text-[11px] font-semibold ml-1">
                {pendingRows.length}
              </span>
            )}
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 size={24} className="animate-spin text-white/30" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="w-12 h-12 rounded-full bg-white/[0.04] flex items-center justify-center mb-4">
              <Users size={24} className="text-white/20" />
            </div>
            <p className="text-[15px] text-white/40">No {filter === 'all' ? 'members' : filter} yet</p>
          </div>
        ) : (
          <div className="border border-white/[0.06] rounded-xl overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-12 gap-4 px-5 py-3 bg-white/[0.02] border-b border-white/[0.06]">
              <div className="col-span-5 text-[11px] uppercase tracking-wider text-white/30 font-medium">Member</div>
              <div className="col-span-2 text-[11px] uppercase tracking-wider text-white/30 font-medium">Status</div>
              <div className="col-span-3 text-[11px] uppercase tracking-wider text-white/30 font-medium">Added</div>
              <div className="col-span-2 text-[11px] uppercase tracking-wider text-white/30 font-medium text-right">Actions</div>
            </div>

            {/* Table rows */}
            <div className="divide-y divide-white/[0.04]">
              {filteredRows.map((row) => (
                <div
                  key={row.id}
                  className="grid grid-cols-12 gap-4 px-5 py-4 items-center hover:bg-white/[0.02] transition-colors"
                >
                  {/* Member */}
                  <div className="col-span-5 min-w-0">
                    <p className="text-[14px] text-white/90 truncate">
                      {row.full_name || row.email.split('@')[0]}
                    </p>
                    <p className="text-[13px] text-white/30 truncate">{row.email}</p>
                  </div>

                  {/* Status */}
                  <div className="col-span-2">
                    {row.status === 'approved' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[12px] font-medium">
                        <CheckCircle size={12} />
                        Approved
                      </span>
                    )}
                    {row.status === 'pending' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 text-[12px] font-medium">
                        <Clock size={12} />
                        Pending
                      </span>
                    )}
                    {row.status === 'revoked' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 text-[12px] font-medium">
                        <XCircle size={12} />
                        Revoked
                      </span>
                    )}
                  </div>

                  {/* Added timestamp */}
                  <div className="col-span-3">
                    <p className="text-[13px] text-white/40">
                      {formatTimeAgo(row.approved_at || row.created_at)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="col-span-2 flex justify-end gap-2">
                    {row.status === 'pending' && (
                      <button
                        onClick={() => handleApprove(row.email)}
                        disabled={actionLoading === row.email}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 transition-all"
                      >
                        {actionLoading === row.email ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Check size={12} />
                        )}
                        Approve
                      </button>
                    )}

                    {row.status === 'revoked' && (
                      <button
                        onClick={() => handleApprove(row.email)}
                        disabled={actionLoading === row.email}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-all"
                      >
                        {actionLoading === row.email ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Check size={12} />
                        )}
                        Restore
                      </button>
                    )}

                    {/* More actions dropdown */}
                    <div className="relative">
                      <button
                        onClick={() => setOpenMenu(openMenu === row.id ? null : row.id)}
                        className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-all"
                      >
                        <MoreHorizontal size={16} />
                      </button>

                      {openMenu === row.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setOpenMenu(null)}
                          />
                          <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-[#141414] border border-white/[0.08] rounded-xl shadow-xl overflow-hidden">
                            <button
                              onClick={() => handleSendMagicLink(row.email)}
                              disabled={actionLoading === row.email}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-white/70 hover:text-white hover:bg-white/[0.06] transition-all text-left"
                            >
                              <Mail size={14} />
                              Send magic link
                            </button>
                            <button
                              onClick={() => handleSendPasswordReset(row.email)}
                              disabled={actionLoading === row.email}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-white/70 hover:text-white hover:bg-white/[0.06] transition-all text-left"
                            >
                              <Key size={14} />
                              Reset password
                            </button>
                            <button
                              onClick={() => { setOpenMenu(null); openTokenModal(row.email); }}
                              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-white/70 hover:text-white hover:bg-white/[0.06] transition-all text-left"
                            >
                              <Coins size={14} />
                              Adjust tokens
                            </button>
                            <div className="h-px bg-white/[0.06]" />
                            {row.status === 'approved' && (
                              <button
                                onClick={() => { setOpenMenu(null); handleRevoke(row.email); }}
                                disabled={actionLoading === row.email}
                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-all text-left"
                              >
                                <X size={14} />
                                Revoke access
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Connector Agent Section */}
        <div className="mt-12 pt-8 border-t border-white/[0.06]">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-500/10">
                <Zap size={16} className="text-violet-400" />
              </div>
              <div>
                <h2 className="text-[15px] font-medium text-white/90">Connector Agent</h2>
                <p className="text-[12px] text-white/40">Email verification backend</p>
              </div>
            </div>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-medium ${
              agentOnline ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${agentOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
              {agentOnline ? 'Online' : 'Offline'}
            </div>
          </div>

          {!agentOnline ? (
            <div className="p-8 rounded-xl border border-white/[0.06] bg-white/[0.02] text-center">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                <Activity size={20} className="text-red-400/50" />
              </div>
              <h3 className="text-[14px] font-medium text-white/70 mb-2">Backend Offline</h3>
              <p className="text-[13px] text-white/40 mb-4">
                Start the backend server at localhost:8000
              </p>
              <code className="text-[12px] bg-white/[0.04] px-3 py-2 rounded-lg text-white/50 font-mono">
                cd connector-agent-backend && npm start
              </code>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Status Cards */}
              <div className="grid grid-cols-4 gap-3">
                {/* Mode */}
                <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <div className="flex items-center gap-1.5 text-white/30 text-[10px] uppercase tracking-wider mb-1.5">
                    <Activity size={12} />
                    MODE
                  </div>
                  <div className={`text-[18px] font-semibold ${
                    agentHealth?.mode === 'NORMAL' ? 'text-emerald-400' :
                    agentHealth?.mode === 'DEGRADED' ? 'text-amber-400' :
                    agentHealth?.mode === 'RESTRICTED' ? 'text-red-400' : 'text-white/50'
                  }`}>
                    {agentHealth?.mode || '—'}
                  </div>
                </div>

                {/* MailTester */}
                <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <div className="flex items-center gap-1.5 text-white/30 text-[10px] uppercase tracking-wider mb-1.5">
                    <Zap size={12} />
                    MAILTESTER
                  </div>
                  <div className={`text-[18px] font-semibold ${
                    agentHealth?.mailtester === 'reachable' ? 'text-emerald-400' :
                    agentHealth?.mailtester === 'degraded' ? 'text-amber-400' :
                    agentHealth?.mailtester === 'down' ? 'text-red-400' : 'text-white/50'
                  }`}>
                    {agentHealth?.mailtester || '—'}
                  </div>
                </div>

                {/* Queue */}
                <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <div className="flex items-center gap-1.5 text-white/30 text-[10px] uppercase tracking-wider mb-1.5">
                    <Users size={12} />
                    QUEUE
                  </div>
                  <div className="text-[18px] font-semibold text-white">
                    {agentHealth?.queue_depth ?? '—'}
                  </div>
                </div>

                {/* Rate */}
                <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <div className="flex items-center gap-1.5 text-white/30 text-[10px] uppercase tracking-wider mb-1.5">
                    <RefreshCw size={12} />
                    RATE
                  </div>
                  <div className="text-[18px] font-semibold text-white">
                    {agentStatus?.rate_limit?.rate || '2/sec'}
                  </div>
                </div>
              </div>

              {/* API Key Update */}
              <div className="p-5 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Key size={14} className="text-white/40" />
                    <span className="text-[13px] font-medium text-white/70">MailTester API Key</span>
                  </div>
                  {agentStatus?.mailtester?.key_configured && (
                    <span className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                      <CheckCircle size={12} />
                      Configured
                    </span>
                  )}
                </div>

                <div className="flex gap-3">
                  <input
                    type="text"
                    value={mailtesterKey}
                    onChange={(e) => setMailtesterKey(e.target.value)}
                    placeholder="Paste new API key (with or without braces)"
                    className="flex-1 h-10 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08]
                      text-[13px] text-white placeholder-white/25 focus:outline-none focus:border-white/20
                      font-mono tracking-tight"
                  />
                  <button
                    onClick={updateMailtesterKey}
                    disabled={updatingKey || !mailtesterKey.trim()}
                    className="h-10 px-5 rounded-lg bg-white text-black text-[13px] font-medium
                      hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed
                      transition-all"
                  >
                    {updatingKey ? 'Updating...' : 'Update'}
                  </button>
                </div>

                {keyUpdateResult && (
                  <div className={`mt-3 text-[12px] ${keyUpdateResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
                    {keyUpdateResult.message}
                  </div>
                )}

                {agentStatus?.mailtester?.token_expires_in && (
                  <div className="mt-3 text-[11px] text-white/30">
                    Token expires in: {agentStatus.mailtester.token_expires_in}
                  </div>
                )}
              </div>

              {/* Metrics (Last 60s) */}
              {agentStatus?.metrics_60s && (
                <div className="p-5 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <div className="text-[12px] font-medium text-white/50 mb-3">Last 60 Seconds</div>
                  <div className="grid grid-cols-6 gap-3">
                    <div className="text-center">
                      <div className="text-[20px] font-semibold text-emerald-400">{agentStatus.metrics_60s.ok}</div>
                      <div className="text-[10px] text-white/30 uppercase tracking-wider mt-0.5">OK</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[20px] font-semibold text-red-400">{agentStatus.metrics_60s.ko}</div>
                      <div className="text-[10px] text-white/30 uppercase tracking-wider mt-0.5">KO</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[20px] font-semibold text-amber-400">{agentStatus.metrics_60s.mb}</div>
                      <div className="text-[10px] text-white/30 uppercase tracking-wider mt-0.5">MB</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[20px] font-semibold text-white/40">{agentStatus.metrics_60s.timeout}</div>
                      <div className="text-[10px] text-white/30 uppercase tracking-wider mt-0.5">Timeout</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[20px] font-semibold text-white/40">{agentStatus.metrics_60s.error}</div>
                      <div className="text-[10px] text-white/30 uppercase tracking-wider mt-0.5">Error</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[20px] font-semibold text-violet-400">{agentStatus.metrics_60s.limited}</div>
                      <div className="text-[10px] text-white/30 uppercase tracking-wider mt-0.5">Limited</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="text-[11px] text-white/20 text-center">
                Auto-refreshes every 5 seconds
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Member Modal - Portal to body */}
      {showAddModal && createPortal(
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998]"
            onClick={() => setShowAddModal(false)}
          />
          <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
            <div className="bg-[#141414] border border-white/[0.08] rounded-2xl w-[400px] overflow-hidden shadow-2xl pointer-events-auto">
              <div className="px-6 py-5 border-b border-white/[0.06]">
                <h2 className="text-[17px] font-semibold text-white/90">Add member</h2>
                <p className="text-[13px] text-white/40 mt-0.5">Manually add someone with access</p>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-[12px] text-white/40 mb-1.5">Full name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full h-10 px-3 rounded-lg bg-white/[0.06] border border-white/[0.08] text-[14px] text-white placeholder-white/30 focus:outline-none focus:border-white/20"
                  />
                </div>
                <div>
                  <label className="block text-[12px] text-white/40 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="john@example.com"
                    className="w-full h-10 px-3 rounded-lg bg-white/[0.06] border border-white/[0.08] text-[14px] text-white placeholder-white/30 focus:outline-none focus:border-white/20"
                  />
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={sendWelcomeEmail}
                      onChange={(e) => setSendWelcomeEmail(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`w-9 h-5 rounded-full transition-colors ${sendWelcomeEmail ? 'bg-emerald-500' : 'bg-white/10'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${sendWelcomeEmail ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </div>
                  </div>
                  <span className="text-[13px] text-white/70">Send magic link email</span>
                </label>
              </div>
              <div className="px-6 py-4 bg-white/[0.02] border-t border-white/[0.06] flex justify-end gap-3">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-[13px] font-medium text-white/50 hover:text-white/70 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddMember}
                  disabled={!newEmail.includes('@') || !newName.trim() || addingMember}
                  className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-lg bg-white text-black hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {addingMember && <Loader2 size={14} className="animate-spin" />}
                  Add member
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

      {/* Token Adjustment Modal - Portal to body */}
      {showTokenModal && createPortal(
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998]"
            onClick={() => setShowTokenModal(false)}
          />
          <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
            <div className="bg-[#141414] border border-white/[0.08] rounded-2xl w-[400px] overflow-hidden shadow-2xl pointer-events-auto">
              <div className="px-6 py-5 border-b border-white/[0.06]">
                <h2 className="text-[17px] font-semibold text-white/90">Adjust tokens</h2>
                <p className="text-[13px] text-white/40 mt-0.5">{tokenEmail}</p>
              </div>
              <div className="px-6 py-5 space-y-4">
                {tokenLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 size={20} className="animate-spin text-white/40" />
                  </div>
                ) : tokenQuota ? (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                        <div className="text-[11px] text-white/40 mb-1">Used</div>
                        <div className="text-[17px] font-semibold text-white/90">{tokenQuota.used.toLocaleString()}</div>
                      </div>
                      <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                        <div className="text-[11px] text-white/40 mb-1">Limit</div>
                        <div className="text-[17px] font-semibold text-white/90">{tokenQuota.limit.toLocaleString()}</div>
                      </div>
                      <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                        <div className="text-[11px] text-white/40 mb-1">Remaining</div>
                        <div className="text-[17px] font-semibold text-emerald-400/90">{tokenQuota.remaining.toLocaleString()}</div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[12px] text-white/40 mb-1.5">New monthly limit</label>
                      <input
                        type="number"
                        value={newLimit}
                        onChange={(e) => setNewLimit(e.target.value)}
                        min={0}
                        step={1000}
                        placeholder="20000"
                        className="w-full h-10 px-3 rounded-lg bg-white/[0.06] border border-white/[0.08] text-[14px] text-white placeholder-white/30 focus:outline-none focus:border-white/20"
                      />
                    </div>
                  </>
                ) : null}
              </div>
              <div className="px-6 py-4 bg-white/[0.02] border-t border-white/[0.06] flex justify-end gap-3">
                <button
                  onClick={() => setShowTokenModal(false)}
                  className="px-4 py-2 text-[13px] font-medium text-white/50 hover:text-white/70 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSetLimit}
                  disabled={!newLimit || adjustingTokens || tokenLoading}
                  className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-lg bg-white text-black hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {adjustingTokens && <Loader2 size={14} className="animate-spin" />}
                  Set limit
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

      {/* My Account Modal - Portal to body */}
      {showMyAccount && createPortal(
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998]"
            onClick={() => setShowMyAccount(false)}
          />
          <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
            <div className="bg-[#141414] border border-white/[0.08] rounded-2xl w-[400px] overflow-hidden shadow-2xl pointer-events-auto">
              <div className="px-6 py-5 border-b border-white/[0.06]">
                <h2 className="text-[17px] font-semibold text-white/90">My Account</h2>
                {user?.email && <p className="text-[13px] text-white/40 mt-0.5">{user.email}</p>}
              </div>
              <div className="px-6 py-5 space-y-4">
                <div className="text-[11px] font-semibold text-white/30 uppercase tracking-wide">Change Password</div>
                <div className="relative">
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    value={myPassword}
                    onChange={(e) => setMyPassword(e.target.value)}
                    placeholder="New password"
                    className="w-full h-10 px-3 pr-10 rounded-lg bg-white/[0.06] border border-white/[0.08] text-[14px] text-white placeholder-white/30 focus:outline-none focus:border-white/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords(!showPasswords)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/50"
                  >
                    {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  value={myConfirmPassword}
                  onChange={(e) => setMyConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  className="w-full h-10 px-3 rounded-lg bg-white/[0.06] border border-white/[0.08] text-[14px] text-white placeholder-white/30 focus:outline-none focus:border-white/20"
                />
              </div>
              <div className="px-6 py-4 bg-white/[0.02] border-t border-white/[0.06] flex justify-between">
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium text-red-400/70 hover:text-red-400 transition-colors"
                >
                  <LogOut size={14} />
                  Sign Out
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowMyAccount(false); setMyPassword(''); setMyConfirmPassword(''); }}
                    className="px-4 py-2 text-[13px] font-medium text-white/50 hover:text-white/70 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleMyPasswordChange}
                    disabled={!myPassword || !myConfirmPassword || changingPassword}
                    className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-lg bg-white text-black hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {changingPassword && <Loader2 size={14} className="animate-spin" />}
                    Update Password
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

      {/* Toast notification - Portal to body */}
      {toast && createPortal(
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl border shadow-lg flex items-center gap-2 text-[13px] font-medium z-[9999] ${
            toast.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
          style={{ animation: 'fadeInUp 0.2s ease-out' }}
        >
          {toast.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
          {toast.message}
          <style>{`
            @keyframes fadeInUp {
              from { opacity: 0; transform: translate(-50%, 10px); }
              to { opacity: 1; transform: translate(-50%, 0); }
            }
          `}</style>
        </div>,
        document.body
      )}
    </div>
  );
}

export default SSMAccessDashboard;
