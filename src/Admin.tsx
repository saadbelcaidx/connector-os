import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Activity, Shield, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth, AccessTier, supabase } from './AuthContext';
import Dock from './Dock';
import AppHeader from './AppHeader';

interface User {
  id: string;
  username: string;
  email: string | null;
  tier: AccessTier;
  is_admin: boolean;
  created_at: string;
  last_login: string | null;
}

interface UsageLog {
  id: string;
  user_id: string;
  tool_name: string;
  signal_strength: number;
  pressure_forecast: string | null;
  momentum_score: number;
  intro_generated: boolean;
  created_at: string;
}

const TIER_COLORS: Record<AccessTier, string> = {
  FREE: '#666666',
  CORE: '#3A9CFF',
  ADVANCED: '#26F7C7',
  OPERATOR: '#FFD700',
};

function Admin() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'logs'>('users');
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUser?.isAdmin) {
      navigate('/launcher');
      return;
    }

    loadData();
  }, [currentUser, navigate]);

  const loadData = async () => {
    try {
      const [usersRes, logsRes] = await Promise.all([
        supabase.from('users').select('*').order('created_at', { ascending: false }),
        supabase
          .from('usage_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100),
      ]);

      if (usersRes.data) setUsers(usersRes.data);
      if (logsRes.data) setUsageLogs(logsRes.data);
    } catch (error) {
      console.error('Error loading admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateUserTier = async (userId: string, newTier: AccessTier) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ tier: newTier })
        .eq('id', userId);

      if (error) throw error;

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, tier: newTier } : u))
      );
    } catch (error) {
      console.error('Error updating user tier:', error);
    }
  };

  const toggleLogExpanded = (logId: string) => {
    setExpandedLogs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0E0E0E] to-[#0A0A0A] flex items-center justify-center">
        <div className="text-white text-opacity-60">Loading...</div>
      </div>
    );
  }

  const stats = {
    totalUsers: users.length,
    activeUsers: users.filter((u) => u.last_login).length,
    totalLogs: usageLogs.length,
    avgSignalStrength:
      usageLogs.length > 0
        ? Math.round(
            usageLogs.reduce((sum, log) => sum + log.signal_strength, 0) / usageLogs.length
          )
        : 0,
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0E0E0E] to-[#0A0A0A] text-white px-8 py-12">
      <div className="max-w-[1400px] mx-auto">
        <button
          onClick={() => navigate('/launcher')}
          className="flex items-center gap-2 mb-6 text-sm text-gray-400 hover:text-gray-200 transition-colors duration-200"
        >
          <ArrowLeft size={16} />
          Back to Connector OS
        </button>

        <div className="mb-8">
          <div className="inline-block px-2.5 py-1 bg-[#0F1B17] text-[#3A9CFF] text-[10px] font-medium rounded-full mb-2 border-b border-[#3A9CFF] border-opacity-30">
            Operator OS V4
          </div>
          <h1 className="text-[32px] font-medium text-white mb-1.5">Admin Dashboard</h1>
          <p className="text-[17px] font-light text-white text-opacity-75">
            Manage users, tiers, and monitor platform usage
          </p>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-[#0C0C0C] rounded-[10px] p-5 border border-[#1C1C1C]">
            <div className="flex items-center gap-2 mb-2">
              <Users size={16} style={{ color: '#3A9CFF' }} />
              <div className="text-[11px] text-white text-opacity-50 uppercase tracking-wider">
                Total Users
              </div>
            </div>
            <div className="text-[28px] font-medium text-[#3A9CFF]">{stats.totalUsers}</div>
          </div>

          <div className="bg-[#0C0C0C] rounded-[10px] p-5 border border-[#1C1C1C]">
            <div className="flex items-center gap-2 mb-2">
              <Activity size={16} style={{ color: '#26F7C7' }} />
              <div className="text-[11px] text-white text-opacity-50 uppercase tracking-wider">
                Active Users
              </div>
            </div>
            <div className="text-[28px] font-medium text-[#26F7C7]">{stats.activeUsers}</div>
          </div>

          <div className="bg-[#0C0C0C] rounded-[10px] p-5 border border-[#1C1C1C]">
            <div className="flex items-center gap-2 mb-2">
              <Activity size={16} style={{ color: '#3A9CFF' }} />
              <div className="text-[11px] text-white text-opacity-50 uppercase tracking-wider">
                Total Usage
              </div>
            </div>
            <div className="text-[28px] font-medium text-[#3A9CFF]">{stats.totalLogs}</div>
          </div>

          <div className="bg-[#0C0C0C] rounded-[10px] p-5 border border-[#1C1C1C]">
            <div className="flex items-center gap-2 mb-2">
              <Shield size={16} style={{ color: '#26F7C7' }} />
              <div className="text-[11px] text-white text-opacity-50 uppercase tracking-wider">
                Avg Signal
              </div>
            </div>
            <div className="text-[28px] font-medium text-[#26F7C7]">{stats.avgSignalStrength}</div>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
              activeTab === 'users'
                ? 'bg-[#3A9CFF] bg-opacity-20 text-[#3A9CFF] border border-[#3A9CFF]'
                : 'bg-[#0C0C0C] text-white text-opacity-60 border border-[#1C1C1C] hover:border-[#262626]'
            }`}
          >
            Users
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
              activeTab === 'logs'
                ? 'bg-[#3A9CFF] bg-opacity-20 text-[#3A9CFF] border border-[#3A9CFF]'
                : 'bg-[#0C0C0C] text-white text-opacity-60 border border-[#1C1C1C] hover:border-[#262626]'
            }`}
          >
            Usage Logs
          </button>
        </div>

        {activeTab === 'users' && (
          <div className="bg-[#0C0C0C] rounded-[10px] p-6 border border-[#1C1C1C]">
            <h2 className="text-[16px] font-medium text-white mb-4">User Management</h2>
            <div className="space-y-3">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="bg-[#0F0F0F] rounded-lg p-4 border border-[#1C1C1C] flex items-center justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div className="text-[14px] font-medium text-white">{user.username}</div>
                      {user.is_admin && (
                        <div className="px-2 py-0.5 bg-[#3A9CFF] bg-opacity-20 text-[#3A9CFF] text-[10px] rounded-full border border-[#3A9CFF] border-opacity-40">
                          ADMIN
                        </div>
                      )}
                    </div>
                    <div className="text-[12px] text-white text-opacity-40 mt-1">
                      {user.email || 'No email'} • Joined {formatDate(user.created_at)}
                      {user.last_login && ` • Last login ${formatDate(user.last_login)}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      value={user.tier}
                      onChange={(e) => updateUserTier(user.id, e.target.value as AccessTier)}
                      className="px-3 py-2 rounded-lg text-[13px] font-medium border bg-[#0C0C0C] transition-all duration-150"
                      style={{
                        color: TIER_COLORS[user.tier],
                        borderColor: `${TIER_COLORS[user.tier]}40`,
                        background: `${TIER_COLORS[user.tier]}10`,
                      }}
                    >
                      <option value="FREE">FREE</option>
                      <option value="CORE">CORE</option>
                      <option value="ADVANCED">ADVANCED</option>
                      <option value="OPERATOR">OPERATOR</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="bg-[#0C0C0C] rounded-[10px] p-6 border border-[#1C1C1C]">
            <h2 className="text-[16px] font-medium text-white mb-4">Usage Logs</h2>
            <div className="space-y-2">
              {usageLogs.map((log) => {
                const isExpanded = expandedLogs.has(log.id);
                return (
                  <div
                    key={log.id}
                    className="bg-[#0F0F0F] rounded-lg border border-[#1C1C1C]"
                  >
                    <div
                      className="p-4 cursor-pointer hover:bg-[#0C0C0C] transition-colors"
                      onClick={() => toggleLogExpanded(log.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <div className="text-[13px] font-medium text-white">{log.tool_name}</div>
                            <div className="text-[11px] text-white text-opacity-40">
                              Signal: {log.signal_strength}
                            </div>
                            {log.pressure_forecast && (
                              <div
                                className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                                style={{
                                  background:
                                    log.pressure_forecast === 'rising'
                                      ? 'rgba(38, 247, 199, 0.2)'
                                      : 'rgba(58, 156, 255, 0.2)',
                                  color:
                                    log.pressure_forecast === 'rising' ? '#26F7C7' : '#3A9CFF',
                                }}
                              >
                                {log.pressure_forecast}
                              </div>
                            )}
                          </div>
                          <div className="text-[11px] text-white text-opacity-40 mt-1">
                            {formatDate(log.created_at)}
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp size={16} className="text-white opacity-40" />
                        ) : (
                          <ChevronDown size={16} className="text-white opacity-40" />
                        )}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-0 border-t border-[#1C1C1C]">
                        <div className="grid grid-cols-2 gap-3 mt-3">
                          <div>
                            <div className="text-[10px] text-white text-opacity-40 uppercase tracking-wider mb-1">
                              Momentum Score
                            </div>
                            <div className="text-[13px] text-white text-opacity-70">
                              {log.momentum_score}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-white text-opacity-40 uppercase tracking-wider mb-1">
                              Intro Generated
                            </div>
                            <div className="text-[13px] text-white text-opacity-70">
                              {log.intro_generated ? 'Yes' : 'No'}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-6 right-6 text-[11px] text-white opacity-60 font-light">
        Admin Dashboard • Operator OS V4
      </div>

      <AppHeader />
      <Dock />
    </div>
  );
}

export default Admin;
