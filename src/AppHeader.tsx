import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, LogOut, Shield, Zap, X, Check, Bell, Globe } from 'lucide-react';
import { useAuth, AccessTier, SAAS_MODE } from './AuthContext';
import { getUnreadCount } from './services/NotificationsService';

const TIER_COLORS: Record<AccessTier, string> = {
  FREE: 'rgba(255,255,255,0.4)',
  CORE: 'rgba(255,255,255,0.6)',
  ADVANCED: 'rgba(255,255,255,0.8)',
  OPERATOR: 'rgba(255,255,255,0.9)',
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
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#0a0a0a] rounded-2xl p-6 border border-white/[0.08] max-w-3xl w-full relative"
        style={{ boxShadow: '0 24px 48px rgba(0, 0, 0, 0.4)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/30 hover:text-white/60 transition-colors"
        >
          <X size={18} />
        </button>

        <h2 className="text-xl font-medium text-white/90 mb-1">Choose Your Tier</h2>
        <p className="text-[13px] text-white/40 mb-6">
          Unlock more features with a higher tier
        </p>

        <div className="grid md:grid-cols-4 gap-3">
          {(['FREE', 'CORE', 'ADVANCED', 'OPERATOR'] as AccessTier[]).map((tier) => {
            const Icon = TIER_ICONS[tier];
            return (
              <div
                key={tier}
                className="bg-white/[0.02] rounded-xl p-4 border border-white/[0.06] hover:border-white/[0.12] transition-all duration-200"
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
                  style={{ background: 'rgba(255, 255, 255, 0.04)' }}
                >
                  <Icon size={16} style={{ color: TIER_COLORS[tier] }} />
                </div>
                <div className="text-[13px] font-medium text-white/80 mb-0.5">
                  {tier}
                </div>
                <div className="text-[11px] text-white/40 mb-3">
                  {tier === 'FREE' && '$0/mo'}
                  {tier === 'CORE' && '$49/mo'}
                  {tier === 'ADVANCED' && '$99/mo'}
                  {tier === 'OPERATOR' && '$199/mo'}
                </div>
                <div className="space-y-1.5 mb-4">
                  {TIER_FEATURES[tier].map((feature, index) => (
                    <div key={index} className="flex items-start gap-1.5">
                      <Check size={10} className="text-white/40 mt-0.5" />
                      <span className="text-[10px] text-white/50 leading-tight">{feature}</span>
                    </div>
                  ))}
                </div>
                <button
                  className="w-full py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.06] text-white/60 hover:bg-white/[0.1] hover:text-white/80 transition-colors"
                >
                  Select
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-4 text-center text-[10px] text-white/25">
          Contact admin@operatoros.dev to upgrade
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
    return null;
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
      <div className="fixed top-6 right-6 z-40 flex items-center gap-2">
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/[0.08] cursor-pointer hover:border-white/[0.15] transition-all duration-200"
          style={{
            background: 'rgba(12, 12, 12, 0.85)',
            backdropFilter: 'blur(20px)',
          }}
          onClick={() => setShowUpgradeModal(true)}
        >
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(255, 255, 255, 0.06)' }}
          >
            <Icon size={14} style={{ color: TIER_COLORS[user.tier] }} />
          </div>
          <div>
            <div className="text-[9px] text-white/40 uppercase tracking-wide leading-none mb-0.5">
              {user.tier}
            </div>
            <div className="text-[11px] text-white/70 leading-none">{user.username}</div>
          </div>
        </div>

        {user.isAdmin && (
          <button
            onClick={() => navigate('/admin')}
            className="p-2 rounded-xl border border-white/[0.08] hover:border-white/[0.15] transition-all duration-200"
            style={{
              background: 'rgba(12, 12, 12, 0.85)',
              backdropFilter: 'blur(20px)',
            }}
          >
            <Shield size={16} className="text-white/60" />
          </button>
        )}

        <button
          onClick={() => navigate('/site')}
          className="p-2 rounded-xl border border-white/[0.08] hover:border-white/[0.15] transition-all duration-200"
          style={{
            background: 'rgba(12, 12, 12, 0.85)',
            backdropFilter: 'blur(20px)',
          }}
          title="View site"
        >
          <Globe size={16} className="text-white/60" />
        </button>

        <button
          onClick={handleLogout}
          className="p-2 rounded-xl border border-white/[0.08] hover:border-white/[0.15] transition-all duration-200"
          style={{
            background: 'rgba(12, 12, 12, 0.85)',
            backdropFilter: 'blur(20px)',
          }}
        >
          <LogOut size={16} className="text-white/60" />
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
