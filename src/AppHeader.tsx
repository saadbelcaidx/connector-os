import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, LogOut, Shield, Zap, X, Check, Bell } from 'lucide-react';
import { useAuth, AccessTier, SAAS_MODE } from './AuthContext';
import { getUnreadCount } from './services/NotificationsService';

const TIER_COLORS: Record<AccessTier, string> = {
  FREE: '#666666',
  CORE: '#3A9CFF',
  ADVANCED: '#26F7C7',
  OPERATOR: '#FFD700',
};

const TIER_ICONS: Record<AccessTier, typeof Crown> = {
  FREE: Shield,
  CORE: Zap,
  ADVANCED: Crown,
  OPERATOR: Crown,
};

const TIER_FEATURES: Record<AccessTier, string[]> = {
  FREE: ['Calculator', 'Library'],
  CORE: ['Calculator', 'Library', 'Matching Engine V1', 'Mental Models'],
  ADVANCED: [
    'All CORE features',
    'Matching Engine V3',
    'Pressure Forecasting',
    'Suggested Intro Templates',
  ],
  OPERATOR: [
    'All ADVANCED features',
    'Background Signal Sync',
    'Email Alerts',
    'Usage Analytics',
    'Admin Access',
  ],
};

function UpgradeModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={onClose}
    >
      <div
        className="bg-[#0C0C0C] rounded-[16px] p-8 border border-[#1C1C1C] max-w-4xl w-full relative"
        style={{
          boxShadow: '0 0 40px rgba(58, 156, 255, 0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white text-opacity-40 hover:text-opacity-100 transition-opacity"
        >
          <X size={20} />
        </button>

        <h2 className="text-[28px] font-medium text-white mb-2">Choose Your Tier</h2>
        <p className="text-[14px] text-white text-opacity-60 mb-8">
          Unlock more features and capabilities with a higher tier
        </p>

        <div className="grid md:grid-cols-4 gap-4">
          {(['FREE', 'CORE', 'ADVANCED', 'OPERATOR'] as AccessTier[]).map((tier) => {
            const Icon = TIER_ICONS[tier];
            return (
              <div
                key={tier}
                className="bg-[#0F0F0F] rounded-[12px] p-5 border transition-all duration-200 hover:scale-105"
                style={{
                  borderColor: `${TIER_COLORS[tier]}40`,
                  boxShadow: `0 0 20px ${TIER_COLORS[tier]}10`,
                }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
                  style={{
                    background: `${TIER_COLORS[tier]}20`,
                    border: `1px solid ${TIER_COLORS[tier]}40`,
                  }}
                >
                  <Icon size={20} style={{ color: TIER_COLORS[tier] }} />
                </div>
                <div
                  className="text-[16px] font-medium mb-1"
                  style={{ color: TIER_COLORS[tier] }}
                >
                  {tier}
                </div>
                <div className="text-[11px] text-white text-opacity-40 mb-4">
                  {tier === 'FREE' && '$0/mo'}
                  {tier === 'CORE' && '$49/mo'}
                  {tier === 'ADVANCED' && '$99/mo'}
                  {tier === 'OPERATOR' && '$199/mo'}
                </div>
                <div className="space-y-2 mb-4">
                  {TIER_FEATURES[tier].map((feature, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <Check size={12} style={{ color: TIER_COLORS[tier], marginTop: '2px' }} />
                      <span className="text-[11px] text-white text-opacity-60 leading-tight">{feature}</span>
                    </div>
                  ))}
                </div>
                <button
                  className="w-full h-[32px] rounded-lg text-[12px] font-medium transition-all duration-150"
                  style={{
                    background: `${TIER_COLORS[tier]}20`,
                    color: TIER_COLORS[tier],
                    border: `1px solid ${TIER_COLORS[tier]}40`,
                  }}
                >
                  Select
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-6 text-center text-[11px] text-white text-opacity-30">
          Contact admin@operatoros.dev to upgrade your account
        </div>
      </div>
    </div>
  );
}

function AppHeader() {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    loadUnreadCount();

    const interval = setInterval(() => {
      loadUnreadCount();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const loadUnreadCount = async () => {
    const count = await getUnreadCount();
    setUnreadCount(count);
  };

  if (!SAAS_MODE) {
    return (
      <div className="fixed top-6 right-6 z-40">
        <button
          onClick={() => navigate('/notifications')}
          className="relative p-2 rounded-lg border border-[#1C1C1C] hover:border-[#26F7C7] transition-all duration-150"
          style={{
            background: 'rgba(12, 12, 12, 0.9)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <Bell size={16} className="text-white opacity-60" />
          {unreadCount > 0 && (
            <div
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
              style={{
                background: '#26F7C7',
                color: '#0A0A0A',
                boxShadow: '0 0 12px rgba(38, 247, 199, 0.6)',
              }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </div>
          )}
        </button>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  const Icon = TIER_ICONS[user.tier];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      <div className="fixed top-6 right-6 z-40 flex items-center gap-3">
        <button
          onClick={() => navigate('/notifications')}
          className="relative p-2 rounded-lg border border-[#1C1C1C] hover:border-[#26F7C7] transition-all duration-150"
          style={{
            background: 'rgba(12, 12, 12, 0.9)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <Bell size={16} className="text-white opacity-60" />
          {unreadCount > 0 && (
            <div
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
              style={{
                background: '#26F7C7',
                color: '#0A0A0A',
                boxShadow: '0 0 12px rgba(38, 247, 199, 0.6)',
              }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </div>
          )}
        </button>

        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer hover:border-opacity-60 transition-all duration-150"
          style={{
            background: 'rgba(12, 12, 12, 0.9)',
            backdropFilter: 'blur(12px)',
            borderColor: `${TIER_COLORS[user.tier]}40`,
            boxShadow: `0 0 20px ${TIER_COLORS[user.tier]}15`,
          }}
          onClick={() => setShowUpgradeModal(true)}
        >
          <div
            className="w-6 h-6 rounded flex items-center justify-center"
            style={{
              background: `${TIER_COLORS[user.tier]}20`,
            }}
          >
            <Icon size={14} style={{ color: TIER_COLORS[user.tier] }} />
          </div>
          <div>
            <div className="text-[10px] text-white text-opacity-40 uppercase tracking-wider leading-none mb-0.5">
              {user.tier}
            </div>
            <div className="text-[11px] text-white text-opacity-70 leading-none">{user.username}</div>
          </div>
        </div>

        {user.isAdmin && (
          <button
            onClick={() => navigate('/admin')}
            className="p-2 rounded-lg border border-[#1C1C1C] hover:border-[#3A9CFF] transition-all duration-150"
            style={{
              background: 'rgba(12, 12, 12, 0.9)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <Shield size={16} style={{ color: '#3A9CFF' }} />
          </button>
        )}

        <button
          onClick={handleLogout}
          className="p-2 rounded-lg border border-[#1C1C1C] hover:border-red-500 transition-all duration-150"
          style={{
            background: 'rgba(12, 12, 12, 0.9)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <LogOut size={16} className="text-white opacity-60" />
        </button>
      </div>

      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
      />
    </>
  );
}

export default AppHeader;
