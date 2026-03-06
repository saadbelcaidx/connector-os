import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Filter, Mail, Network, Radar, BookOpen, Zap, Lock, Eye, Globe, Radio } from 'lucide-react';
import { FEATURES } from './config/features';

import Dock from './Dock';
import { useAuth } from './AuthContext';
import { supabase } from './lib/supabase';

interface AppCard {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties; strokeWidth?: number }>;
  route?: string;
  comingSoon?: boolean;
  ssmOnly?: boolean; // Requires SSM access
}

const apps: AppCard[] = [
  // 0. Station — the operator cockpit (core product)
  {
    id: 'station',
    title: 'Station',
    description: 'Signal → Syndicate → Match → Route → Print',
    icon: Radio,
    route: '/station',
  },
  // 3. Send intros (convert matches)
  {
    id: 'email',
    title: 'Msg Simulator',
    description: 'Matching Engine finds million dollar opportunities. Msg Simulator converts them.',
    icon: Mail,
    route: '/msg-sim',
    ssmOnly: true,
  },
  // 4. Introduction lifecycle — track from match to deal (includes inbound replies)
  {
    id: 'introductions',
    title: 'Introductions',
    description: 'Track intros from match to deal.',
    icon: Network,
    ssmOnly: true,
    comingSoon: true,
  },
  // 5. See the money
  {
    id: 'calculator',
    title: 'Revenue Calculator',
    description: 'See how much you could earn per month.',
    icon: TrendingUp,
    route: '/calculator',
  },
  // 6. Advanced: see where deals stall
  {
    id: 'dealflow',
    title: 'Dealflow Visualizer',
    description: 'Map where the flow breaks.',
    icon: Filter,
    comingSoon: true,
    ssmOnly: true,
  },
  // 7. Domain health
  {
    id: 'warmup',
    title: 'Domain Warmup Radar',
    description: 'Know which senders are burning.',
    icon: Radar,
    comingSoon: true,
  },
  // 8. Learn more
  {
    id: 'library',
    title: 'OS Library',
    description: 'Playbooks, docs, and mental models.',
    icon: BookOpen,
    route: '/library',
  },
  // 9. Connector Agent — Find & verify emails (SSM only, isolated)
  {
    id: 'connector-agent',
    title: 'Connector Agent',
    description: 'Locate & confirm contacts',
    icon: Eye,
    route: '/connector-agent',
    ssmOnly: true,
    comingSoon: !FEATURES.CONNECTOR_AGENT_ENABLED,
  },
  // 10. Strategic Alignment Platform — White-labeled live demo tool (SSM only)
  {
    id: 'strategic-platform',
    title: 'Strategic Platform',
    description: 'Access-controlled network intelligence',
    icon: Globe,
    route: '/platform-dashboard',
    ssmOnly: true,
  },
  // Ask Insights removed from Launcher — operator-only, access via /operator/assistant-insights
];

function Launcher() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [hologramOffset, setHologramOffset] = useState({ x: 0, y: 0 });
  const [isAnyCardHovered, setIsAnyCardHovered] = useState(false);
  const [showQuickStart, setShowQuickStart] = useState(false);
  const [hasSSMAccess, setHasSSMAccess] = useState(false);

  // Check SSM access on mount
  useEffect(() => {
    const checkSSMAccess = async () => {
      const userEmail = user?.email;
      if (!userEmail) {
        setHasSSMAccess(false);
        return;
      }

      try {
        const { data } = await supabase
          .from('ssm_access')
          .select('status')
          .eq('email', userEmail)
          .single();

        setHasSSMAccess(data?.status === 'approved');
      } catch {
        setHasSSMAccess(false);
      }
    };

    checkSSMAccess();
  }, [user]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      setMousePosition({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    const targetX = -mousePosition.x * 8;
    const targetY = -mousePosition.y * 8;

    const timer = setTimeout(() => {
      setHologramOffset({ x: targetX, y: targetY });
    }, 50);

    return () => clearTimeout(timer);
  }, [mousePosition]);

  const handleCardClick = (app: AppCard) => {
    if (app.comingSoon) return;
    if (app.route) {
      navigate(app.route);
    }
  };

  return (
    <>
      {showQuickStart && (
        <QuickStartModal onClose={() => setShowQuickStart(false)} navigate={navigate} />
      )}

      <div className="min-h-screen bg-[#09090b] relative overflow-hidden">
      {/* Subtle gradient orb - Apple style */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden"
        style={{
          opacity: 0.4,
        }}
      >
        <div
          style={{
            width: '600px',
            height: '600px',
            background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%)',
            transform: `translate(${hologramOffset.x * 0.5}px, ${hologramOffset.y * 0.5}px)`,
            transition: 'transform 600ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </div>

      <div className="relative z-10 container mx-auto px-6 py-16 animate-fade-in">
        <div className="flex flex-col items-center mb-10 gap-3">
          {/* Logo - Apple-sized, clickable to go home */}
          <button
            onClick={() => navigate('/site')}
            className="w-12 h-12 rounded-xl overflow-hidden bg-white/[0.02] border border-white/[0.06] shadow-md hover:border-white/[0.12] hover:scale-105 active:scale-95 transition-all duration-200"
            title="View homepage"
          >
            <img
              src="/image.png"
              alt="Connector OS"
              className="w-full h-full object-cover"
            />
          </button>
          {/* Badge */}
          <button
            onClick={() => navigate('/site')}
            className="px-3 py-1 rounded-full text-[9px] font-mono tracking-[0.12em] uppercase hover:bg-white/[0.06] transition-colors cursor-pointer"
            style={{
              color: 'rgba(255, 255, 255, 0.45)',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            Connector OS
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-6xl mx-auto">
          {apps.map((app, index) => (
            <div key={app.id} className="relative">
              <AppCardComponent
                app={app}
                onClick={() => handleCardClick(app)}
                index={index}
                onHoverChange={setIsAnyCardHovered}
                hasSSMAccess={hasSSMAccess}
              />
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes card-flow-in {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .animate-fade-in {
          animation: card-flow-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      <Dock />
      </div>
    </>
  );
}

function AppCardComponent({
  app,
  onClick,
  index,
  onHoverChange,
  hasSSMAccess
}: {
  app: AppCard;
  onClick: () => void;
  index: number;
  onHoverChange: (isHovered: boolean) => void;
  hasSSMAccess: boolean;
}) {
  // SSM-only apps are locked for non-SSM users
  const isSSMLocked = app.ssmOnly && !hasSSMAccess;
  const isDisabled = app.comingSoon;
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  // Show Lock icon for SSM-locked features, normal icon when approved
  const Icon = isSSMLocked ? Lock : app.icon;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isClickable) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const tiltX = ((y - centerY) / centerY) * -3;
    const tiltY = ((x - centerX) / centerX) * 3;

    setTilt({ x: tiltX, y: tiltY });
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    onHoverChange(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setTilt({ x: 0, y: 0 });
    onHoverChange(false);
  };

  const handleMouseDown = () => {
    if (isClickable) {
      setIsPressed(true);
    }
  };

  const handleMouseUp = () => {
    setIsPressed(false);
  };

  // SSM-locked apps are still clickable - they navigate to the SSMGate
  const isClickable = !app.comingSoon;

  return (
    <div
      className={`relative group ${isClickable ? 'cursor-pointer' : 'cursor-not-allowed'}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onClick={isClickable ? onClick : undefined}
      style={{
        opacity: 0,
        animation: `card-flow-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards`,
        animationDelay: `${index * 0.07}s`,
      }}
    >
      <div
        className="relative p-5"
        style={{
          background: isHovered && isClickable
            ? 'rgba(255, 255, 255, 0.05)'
            : 'rgba(255, 255, 255, 0.02)',
          borderRadius: '10px',
          border: `1px solid ${isHovered && isClickable ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.04)'}`,
          transform: `scale(${isPressed ? 0.97 : 1}) translateY(${isHovered && isClickable ? -2 : 0}px) rotateX(${tilt.x * 0.3}deg) rotateY(${tilt.y * 0.3}deg)`,
          transition: 'all 400ms cubic-bezier(0.16, 1, 0.3, 1)',
          boxShadow: isHovered && isClickable ? '0 8px 32px rgba(0, 0, 0, 0.15)' : 'none',
        }}
      >
        <div className="flex items-start justify-between mb-4">
          <div
            className="p-2 rounded-lg"
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
            }}
          >
            <Icon
              size={20}
              style={{
                color: isDisabled ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.7)',
                strokeWidth: 1.5,
              }}
            />
          </div>
          {app.comingSoon && (
            <span
              className="text-[9px] font-mono tracking-wide uppercase px-2 py-0.5 rounded-full"
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                color: 'rgba(255, 255, 255, 0.3)',
              }}
            >
              Soon
            </span>
          )}
          {app.ssmOnly && !app.comingSoon && (
            <span
              className="flex items-center gap-1 text-[9px] font-mono tracking-wide uppercase px-2 py-0.5 rounded-full"
              style={{
                background: 'rgba(251, 191, 36, 0.1)',
                color: 'rgba(251, 191, 36, 0.8)',
              }}
            >
              {isSSMLocked && <Lock size={10} />}
              SSM
            </span>
          )}
        </div>

        <h3
          className="text-[13px] font-mono mb-1.5"
          style={{
            color: isDisabled ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.85)',
          }}
        >
          {app.title}
        </h3>

        <p
          className="text-[11px] font-mono leading-relaxed"
          style={{
            color: isDisabled ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.45)',
          }}
        >
          {app.description}
        </p>
      </div>
    </div>
  );
}

function QuickStartModal({ onClose, navigate }: { onClose: () => void; navigate: (path: string) => void }) {
  const steps = [
    {
      number: '1',
      title: 'Configure your supply',
      description: 'Set up your API key and what you bring to the table',
      action: () => { onClose(); navigate('/settings'); },
      buttonText: 'Settings',
    },
    {
      number: '2',
      title: 'Run your first match',
      description: 'See who needs who — supply meets demand',
      action: () => { onClose(); navigate('/matching-engine'); },
      buttonText: 'Matching Engine',
    },
    {
      number: '3',
      title: 'Send the intro',
      description: 'Copy the generated intro and make the connection',
      action: () => { onClose(); navigate('/matching-engine'); },
      buttonText: 'View Intros',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
      <div
        className="relative max-w-md w-full p-6"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '12px',
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-6 h-6 flex items-center justify-center font-mono text-white/20 hover:text-white/40 transition-colors text-lg"
          style={{ background: 'none', border: 'none', outline: 'none', cursor: 'pointer' }}
        >
          ×
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            <Zap size={20} className="text-white/70" />
          </div>
          <div>
            <h2 className="text-[13px] font-mono text-white/70">Quick Start</h2>
            <p className="text-[10px] font-mono text-white/25">3 steps to your first match</p>
          </div>
        </div>

        <div className="space-y-3">
          {steps.map((step) => (
            <div
              key={step.number}
              className="p-4 border border-white/[0.04] hover:border-white/[0.08] transition-colors"
              style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-[10px] font-mono"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    color: 'rgba(255,255,255,0.40)',
                  }}
                >
                  {step.number}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-[12px] font-mono text-white/70 mb-0.5">{step.title}</h3>
                  <p className="text-[10px] font-mono text-white/30 mb-2">{step.description}</p>

                  <button
                    onClick={step.action}
                    className="text-[10px] font-mono px-3 py-1.5 transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      color: 'rgba(255,255,255,0.50)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '6px',
                      outline: 'none',
                      cursor: 'pointer',
                      transform: 'scale(1)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                      e.currentTarget.style.color = 'rgba(255,255,255,0.70)';
                      e.currentTarget.style.transform = 'scale(1.02)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                      e.currentTarget.style.color = 'rgba(255,255,255,0.50)';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
                    onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; }}
                  >
                    {step.buttonText} →
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Launcher;
