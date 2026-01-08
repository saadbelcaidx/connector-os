import { useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import AuthModal from './AuthModal';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface SSMGateProps {
  children: ReactNode;
  featureName: string;
}

type AccessStatus = 'loading' | 'approved' | 'needs_auth';

/**
 * SSMGate - Seamless access gating with modal overlay
 *
 * Shows the feature content behind a blur with auth modal on top.
 * User never loses context - everything happens in one place.
 */
const DEV_BYPASS = window.location.hostname === 'localhost';

export default function SSMGate({ children, featureName }: SSMGateProps) {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<AccessStatus>('loading');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // Dev bypass
    if (DEV_BYPASS) {
      setStatus('approved');
      return;
    }

    // Wait for auth to load
    if (authLoading) {
      setStatus('loading');
      return;
    }

    // Not logged in - needs auth
    if (!user?.email) {
      setStatus('needs_auth');
      setShowModal(true);
      return;
    }

    // Check access
    checkAccess(user.email);
  }, [user, authLoading]);

  const checkAccess = async (emailToCheck: string) => {
    const normalizedEmail = emailToCheck.toLowerCase().trim();

    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/ssm-access/check?email=${encodeURIComponent(normalizedEmail)}`
      );

      if (!response.ok) {
        console.error('[SSM Gate] Check endpoint failed:', response.status);
        setStatus('needs_auth');
        setShowModal(true);
        return;
      }

      const data = await response.json();
      console.log('[SSM Gate] SSMGate check:', normalizedEmail, '→', data.status);

      if (data.status === 'approved') {
        setStatus('approved');
        setShowModal(false);
      } else {
        // pending, none, or other status
        setStatus('needs_auth');
        setShowModal(true);
      }
    } catch (err) {
      console.error('[SSMGate] Check error:', err);
      setStatus('needs_auth');
      setShowModal(true);
    }
  };

  const handleSuccess = () => {
    setStatus('approved');
    setShowModal(false);
  };

  const handleBack = () => {
    // Navigate back to console/launcher
    navigate('/launcher');
  };

  // Loading - show a subtle loading state
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0E0E0E] to-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/10 border-t-white/40 rounded-full animate-spin" />
      </div>
    );
  }

  // Approved - render children directly
  if (status === 'approved') {
    return <>{children}</>;
  }

  // Needs auth - show blurred preview with modal
  return (
    <div className="relative min-h-screen bg-[#0A0A0A]">
      {/* Blurred preview of the feature - visible enough to show value */}
      <div className="filter blur-[6px] opacity-60 pointer-events-none select-none saturate-50">
        {children}
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showModal}
        onClose={handleBack}
        onSuccess={handleSuccess}
        featureName={featureName}
      />
    </div>
  );
}
