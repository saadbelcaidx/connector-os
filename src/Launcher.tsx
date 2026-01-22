import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Filter, Mail, Network, Radar, BookOpen, Zap, MessageSquare, Lock, Workflow, Eye } from 'lucide-react';
import { FEATURES } from './config/features';

// Chess King Icon — Strategic moves, the operator makes the play
function KingIcon({ size = 24, style }: { size?: number; style?: React.CSSProperties }) {
  const color = (style?.color as string) || 'currentColor';
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="2" x2="12" y2="5" />
      <line x1="10.5" y1="3.5" x2="13.5" y2="3.5" />
      <path d="M7 8C7 6.5 9 5 12 5C15 5 17 6.5 17 8C17 9 16.5 9.5 16 10H8C7.5 9.5 7 9 7 8Z" />
      <path d="M8 10V14C8 14 8.5 15 12 15C15.5 15 16 14 16 14V10" />
      <path d="M6 18C6 16.5 8 15 12 15C16 15 18 16.5 18 18V19C18 19.5 17.5 20 17 20H7C6.5 20 6 19.5 6 19V18Z" />
      <path d="M5 20H19V21C19 21.5 18.5 22 18 22H6C5.5 22 5 21.5 5 21V20Z" />
    </svg>
  );
}

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
  // 1. Start here
  {
    id: 'quick-start',
    title: 'Setup Wizard',
    description: 'Get configured in 5 minutes',
    icon: Zap,
    route: '/setup',
  },
  // 2. Find matches (core product)
  {
    id: 'matching',
    title: 'Flow',
    description: 'Who needs who — instantly.',
    icon: Workflow,
    route: '/flow',
  },
  // 2.5. Lead database — make your move (SSM only)
  {
    id: 'hub',
    title: 'Connector Hub',
    description: '9M+ contacts. Query. Select. Route to Flow.',
    icon: KingIcon,
    route: '/hub',
    ssmOnly: true,
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
  // 4. Track replies (see results)
  {
    id: 'reply-tracker',
    title: 'Inbound',
    description: 'Watch intros turn into deals.',
    icon: MessageSquare,
    route: '/reply-tracker',
    ssmOnly: true,
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

      <div className="min-h-screen bg-black relative overflow-hidden">
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
            className="px-3 py-1 rounded-full text-[9px] font-medium tracking-[0.12em] uppercase hover:bg-white/[0.06] transition-colors cursor-pointer"
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
        className="relative p-5 rounded-2xl"
        style={{
          background: isHovered && isClickable
            ? 'rgba(255, 255, 255, 0.05)'
            : 'rgba(255, 255, 255, 0.02)',
          border: `1px solid ${isHovered && isClickable ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.06)'}`,
          transform: `scale(${isPressed ? 0.97 : 1}) translateY(${isHovered && isClickable ? -2 : 0}px) rotateX(${tilt.x * 0.3}deg) rotateY(${tilt.y * 0.3}deg)`,
          transition: 'all 400ms cubic-bezier(0.16, 1, 0.3, 1)',
          boxShadow: isHovered && isClickable ? '0 8px 32px rgba(0, 0, 0, 0.15)' : 'none',
        }}
      >
        <div className="flex items-start justify-between mb-4">
          <div
            className="p-2 rounded-xl"
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
              className="text-[9px] font-medium tracking-wide uppercase px-2 py-0.5 rounded-full"
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
              className="flex items-center gap-1 text-[9px] font-medium tracking-wide uppercase px-2 py-0.5 rounded-full"
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
          className="text-[15px] font-medium mb-1.5 tracking-tight"
          style={{
            color: isDisabled ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.85)',
          }}
        >
          {app.title}
        </h3>

        <p
          className="text-[13px] leading-relaxed"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm">
      <div
        className="relative max-w-md w-full rounded-2xl p-6"
        style={{
          background: 'rgba(12, 12, 12, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.4)',
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-6 h-6 flex items-center justify-center text-white/30 hover:text-white/60 transition-colors text-lg"
        >
          ×
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255, 255, 255, 0.06)' }}
          >
            <Zap size={20} className="text-white/70" />
          </div>
          <div>
            <h2 className="text-[15px] font-medium text-white/90">Quick Start</h2>
            <p className="text-[12px] text-white/40">3 steps to your first match</p>
          </div>
        </div>

        <div className="space-y-3">
          {steps.map((step) => (
            <div
              key={step.number}
              className="p-4 rounded-xl border border-white/[0.06] hover:border-white/[0.12] transition-colors"
              style={{ background: 'rgba(255, 255, 255, 0.02)' }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-medium"
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    color: 'rgba(255, 255, 255, 0.5)',
                  }}
                >
                  {step.number}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-[13px] text-white/80 font-medium mb-0.5">{step.title}</h3>
                  <p className="text-[12px] text-white/40 mb-2">{step.description}</p>

                  <button
                    onClick={step.action}
                    className="text-[11px] px-3 py-1.5 rounded-lg font-medium transition-colors"
                    style={{
                      background: 'rgba(255, 255, 255, 0.06)',
                      color: 'rgba(255, 255, 255, 0.6)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                      e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
                    }}
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
