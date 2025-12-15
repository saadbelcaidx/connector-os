import { ReactNode, useState } from 'react';
import { useAuth, AccessTier, SAAS_MODE } from './AuthContext';
import { Lock, X, Check, Zap } from 'lucide-react';

interface AccessControlProps {
  children: ReactNode;
  requiredTier: AccessTier;
  featureName: string;
}

const TIER_FEATURES: Record<AccessTier, string[]> = {
  FREE: ['Calculator', 'Library'],
  CORE: ['Calculator', 'Library', 'Matching Engine V1', 'Mental Models'],
  ADVANCED: [
    'Calculator',
    'Library',
    'Matching Engine V1',
    'Mental Models',
    'Matching Engine V3',
    'Pressure Forecasting',
    'Suggested Intro Templates',
  ],
  OPERATOR: [
    'All Features',
    'Background Signal Sync',
    'Email Alerts',
    'Usage Analytics',
    'Priority Support',
  ],
};

const TIER_COLORS: Record<AccessTier, string> = {
  FREE: '#666666',
  CORE: '#3A9CFF',
  ADVANCED: '#26F7C7',
  OPERATOR: '#FFD700',
};

function UpgradeModal({
  isOpen,
  onClose,
  featureName,
  requiredTier,
  currentTier,
}: {
  isOpen: boolean;
  onClose: () => void;
  featureName: string;
  requiredTier: AccessTier;
  currentTier: AccessTier;
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
        className="bg-[#0C0C0C] rounded-[16px] p-8 border border-[#1C1C1C] max-w-lg w-full relative"
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

        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-12 h-12 rounded-lg flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${TIER_COLORS[requiredTier]}20 0%, ${TIER_COLORS[requiredTier]}10 100%)`,
              border: `1px solid ${TIER_COLORS[requiredTier]}40`,
            }}
          >
            <Lock size={24} style={{ color: TIER_COLORS[requiredTier] }} />
          </div>
          <div>
            <h2 className="text-[22px] font-medium text-white">Feature Locked</h2>
            <p className="text-[13px] text-white text-opacity-50">Upgrade to unlock</p>
          </div>
        </div>

        <div className="mb-6 p-4 bg-[#0F0F0F] rounded-lg border border-[#1C1C1C]">
          <div className="text-[14px] text-white text-opacity-70 mb-1">
            <span className="font-medium">{featureName}</span> requires
          </div>
          <div
            className="inline-block px-3 py-1 rounded-full text-[13px] font-medium"
            style={{
              background: `${TIER_COLORS[requiredTier]}20`,
              color: TIER_COLORS[requiredTier],
              border: `1px solid ${TIER_COLORS[requiredTier]}40`,
            }}
          >
            {requiredTier} TIER
          </div>
        </div>

        <div className="mb-6">
          <div className="text-[12px] text-white text-opacity-50 uppercase tracking-wider mb-3">
            Your Current Tier: {currentTier}
          </div>
          <div className="space-y-2">
            {TIER_FEATURES[requiredTier].map((feature, index) => (
              <div key={index} className="flex items-center gap-2">
                <Check size={14} style={{ color: TIER_COLORS[requiredTier] }} />
                <span className="text-[13px] text-white text-opacity-70">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full h-[44px] rounded-lg font-medium text-[15px] transition-all duration-150 flex items-center justify-center gap-2"
          style={{
            background: `linear-gradient(135deg, ${TIER_COLORS[requiredTier]} 0%, ${TIER_COLORS[requiredTier]}CC 100%)`,
            color: '#FFFFFF',
            boxShadow: `0 0 20px ${TIER_COLORS[requiredTier]}40`,
          }}
        >
          <Zap size={18} />
          Upgrade to {requiredTier}
        </button>

        <div className="mt-4 text-center text-[11px] text-white text-opacity-30">
          Contact admin to upgrade your account tier
        </div>
      </div>
    </div>
  );
}

function AccessControl({ children, requiredTier, featureName }: AccessControlProps) {
  const { hasTierAccess, user } = useAuth();
  const [showModal, setShowModal] = useState(false);

  if (!SAAS_MODE) {
    return <>{children}</>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0E0E0E] to-[#0A0A0A] flex items-center justify-center">
        <div className="text-white text-opacity-60">Loading...</div>
      </div>
    );
  }

  if (!hasTierAccess(requiredTier)) {
    return (
      <>
        <div
          className="min-h-screen bg-gradient-to-b from-[#0E0E0E] to-[#0A0A0A] flex items-center justify-center px-8 py-12"
          onClick={() => setShowModal(true)}
        >
          <div
            className="max-w-md bg-[#0C0C0C] rounded-[16px] p-8 border border-[#1C1C1C] text-center cursor-pointer hover:border-[#3A9CFF] transition-all duration-200"
            style={{
              boxShadow: '0 0 30px rgba(58, 156, 255, 0.1)',
            }}
          >
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${TIER_COLORS[requiredTier]}20 0%, ${TIER_COLORS[requiredTier]}10 100%)`,
                border: `1px solid ${TIER_COLORS[requiredTier]}40`,
              }}
            >
              <Lock size={32} style={{ color: TIER_COLORS[requiredTier] }} />
            </div>
            <h2 className="text-[24px] font-medium text-white mb-2">{featureName}</h2>
            <p className="text-[14px] text-white text-opacity-60 mb-6">
              This feature requires {requiredTier} tier or higher
            </p>
            <div
              className="inline-block px-4 py-2 rounded-full text-[13px] font-medium mb-4"
              style={{
                background: `${TIER_COLORS[requiredTier]}20`,
                color: TIER_COLORS[requiredTier],
                border: `1px solid ${TIER_COLORS[requiredTier]}40`,
              }}
            >
              Your tier: {user.tier}
            </div>
            <div className="text-[12px] text-white text-opacity-40">
              Click to view upgrade options
            </div>
          </div>
        </div>

        <UpgradeModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          featureName={featureName}
          requiredTier={requiredTier}
          currentTier={user.tier}
        />
      </>
    );
  }

  return <>{children}</>;
}

export default AccessControl;
