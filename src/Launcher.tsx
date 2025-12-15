import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Filter, Mail, Network, Radar, BookOpen, Zap } from 'lucide-react';
import Dock from './Dock';
import { useOnboarding } from './OnboardingContext';
import { WelcomeModal, TourTooltip } from './Onboarding';

interface AppCard {
  id: string;
  title: string;
  description: string;
  icon: typeof TrendingUp;
  route?: string;
  comingSoon?: boolean;
}

const apps: AppCard[] = [
  {
    id: 'quick-start',
    title: 'Quick Start',
    description: '3 steps to generate your first match',
    icon: Zap,
  },
  {
    id: 'calculator',
    title: 'Operator Revenue Calculator',
    description: 'See what your distribution engine prints.',
    icon: TrendingUp,
    route: '/calculator',
  },
  {
    id: 'dealflow',
    title: 'Dealflow Visualizer',
    description: 'Map where the flow breaks.',
    icon: Filter,
    comingSoon: true,
  },
  {
    id: 'email',
    title: 'Connector Msg Simulator',
    description: 'Stress-test your inbox logic.',
    icon: Mail,
    comingSoon: true,
  },
  {
    id: 'matching',
    title: 'Connector Matching Engine',
    description: 'Who needs who — instantly.',
    icon: Network,
    route: '/matching-engine',
  },
  {
    id: 'warmup',
    title: 'Domain Warmup Radar',
    description: 'Know which senders are burning.',
    icon: Radar,
    comingSoon: true,
  },
  {
    id: 'library',
    title: 'OS Library',
    description: 'Playbooks, docs, and mental models.',
    icon: BookOpen,
    route: '/library',
  },
];

function Launcher() {
  const navigate = useNavigate();
  const { currentStep, nextStep, skipOnboarding } = useOnboarding();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [hologramOffset, setHologramOffset] = useState({ x: 0, y: 0 });
  const [isAnyCardHovered, setIsAnyCardHovered] = useState(false);
  const [showQuickStart, setShowQuickStart] = useState(false);

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
    if (app.id === 'quick-start') {
      setShowQuickStart(true);
      return;
    }
    if (app.route) {
      navigate(app.route);
    }
  };

  return (
    <>
      <WelcomeModal />

      {showQuickStart && (
        <QuickStartModal onClose={() => setShowQuickStart(false)} navigate={navigate} />
      )}

      <div className="min-h-screen bg-black relative overflow-hidden">
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{
          opacity: isAnyCardHovered ? 0.14 : 0.1,
          transform: `translate(${hologramOffset.x}px, ${hologramOffset.y}px)`,
          transition: 'opacity 200ms ease-out, transform 400ms ease-out',
        }}
      >
        <div
          className="relative"
          style={{
            width: 'min(600px, 70vw)',
            height: 'min(600px, 70vw)',
          }}
        >
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 600 600"
            className="absolute inset-0"
            style={{
              animation: 'rotate 60s linear infinite, breathe 20s ease-in-out infinite',
              filter: 'blur(1.5px)',
            }}
          >
            <circle
              cx="300"
              cy="300"
              r="200"
              fill="none"
              stroke="#0EA5E9"
              strokeWidth="0.5"
              opacity="0.6"
            />
            <circle
              cx="300"
              cy="300"
              r="260"
              fill="none"
              stroke="#0EA5E9"
              strokeWidth="0.5"
              opacity="0.4"
            />
            <circle
              cx="300"
              cy="300"
              r="320"
              fill="none"
              stroke="#0EA5E9"
              strokeWidth="0.5"
              opacity="0.3"
            />

            {Array.from({ length: 32 }).map((_, i) => {
              const angle = (i * 11.25 * Math.PI) / 180;
              const radius = 200;
              const x1 = 300 + radius * Math.cos(angle);
              const y1 = 300 + radius * Math.sin(angle);
              const length = Math.random() * 3 + 2;
              const x2 = 300 + (radius + length) * Math.cos(angle);
              const y2 = 300 + (radius + length) * Math.sin(angle);
              return (
                <line
                  key={`tick-${i}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#0EA5E9"
                  strokeWidth="0.5"
                  opacity="0.15"
                />
              );
            })}
          </svg>
        </div>
      </div>

      <div className="relative z-10 container mx-auto px-6 py-16 animate-fade-in">
        <div className="flex justify-center mb-16">
          <div
            className="px-5 py-2 rounded-full text-[11px] font-semibold tracking-widest text-[#0EA5E9] uppercase"
            style={{
              backgroundColor: 'rgba(14, 165, 233, 0.08)',
              boxShadow: '0 0 1px rgba(14, 165, 233, 0.8)',
              border: '1px solid rgba(14, 165, 233, 0.2)',
            }}
          >
            Connector OS — Operator Console
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {apps.map((app, index) => (
            <div key={app.id} className="relative">
              <AppCardComponent
                app={app}
                onClick={() => handleCardClick(app)}
                index={index}
                onHoverChange={setIsAnyCardHovered}
              />
              {currentStep === 'launcher' && app.id === 'matching' && (
                <TourTooltip
                  step="Step 1 of 4"
                  title="Operator Radar"
                  description="This is your Operator Radar. It shows who has pressure and when to act."
                  onNext={nextStep}
                  onSkip={skipOnboarding}
                  position="bottom"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes rotate {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes breathe {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.03);
            opacity: 1.05;
          }
        }

        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes card-fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-2px);
          }
        }

        .animate-fade-in {
          animation: fade-in 600ms ease-out forwards;
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
  onHoverChange
}: {
  app: AppCard;
  onClick: () => void;
  index: number;
  onHoverChange: (isHovered: boolean) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const Icon = app.icon;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (app.comingSoon) return;

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
    if (!app.comingSoon) {
      setIsPressed(true);
    }
  };

  const handleMouseUp = () => {
    setIsPressed(false);
  };

  return (
    <div
      className={`relative group ${app.comingSoon ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onClick={onClick}
      style={{
        animation: `float 8s ease-in-out infinite, card-fade-in 0.6s ease-out forwards ${index * 0.08}s`,
        animationDelay: `${index * 0.3}s, ${index * 0.08}s`,
      }}
    >
      <div
        className="relative p-6 rounded-xl"
        style={{
          background: 'rgba(255, 255, 255, 0.03)',
          backdropFilter: 'blur(4px)',
          border: app.id === 'quick-start'
            ? '1px solid rgba(38, 247, 199, 0.3)'
            : '1px solid rgba(14, 165, 233, 0.2)',
          boxShadow: isHovered && !app.comingSoon
            ? app.id === 'quick-start'
              ? '0 0 22px rgba(38, 247, 199, 0.2)'
              : '0 0 22px rgba(14, 165, 233, 0.2)'
            : app.id === 'quick-start'
              ? '0 0 1px rgba(38, 247, 199, 0.1)'
              : '0 0 1px rgba(14, 165, 233, 0.1)',
          transformStyle: 'preserve-3d',
          perspective: 1000,
          transform: `scale(${isPressed ? 0.98 : (isHovered && !app.comingSoon ? 1.04 : 1)}) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transition: isPressed ? 'transform 0.12s ease' : 'transform 0.18s ease',
        }}
      >
        <div className="flex items-start gap-4 mb-4">
          <div
            className="p-2.5 rounded-lg"
            style={{
              background: app.id === 'quick-start'
                ? 'rgba(38, 247, 199, 0.08)'
                : 'rgba(14, 165, 233, 0.08)',
              border: app.id === 'quick-start'
                ? '1px solid rgba(38, 247, 199, 0.2)'
                : '1px solid rgba(14, 165, 233, 0.2)',
            }}
          >
            <Icon
              size={24}
              style={{
                color: app.id === 'quick-start' ? '#26F7C7' : '#0EA5E9',
                strokeWidth: 1.5,
              }}
            />
          </div>
          {app.comingSoon && (
            <span
              className="text-[9px] font-medium tracking-wider uppercase px-2 py-0.5 rounded"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                color: '#999',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              Coming Soon
            </span>
          )}
        </div>

        <h3
          className="text-lg font-semibold mb-2"
          style={{
            color: '#E5E5E5',
            opacity: app.comingSoon ? 0.5 : 0.9,
          }}
        >
          {app.title}
        </h3>

        <p
          className="text-sm leading-relaxed"
          style={{
            color: '#A1A1A1',
            opacity: app.comingSoon ? 0.4 : 0.8,
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
      title: 'Configure your capabilities',
      description: 'Set up your API key and provider metadata',
      action: () => {
        onClose();
        navigate('/settings');
      },
      buttonText: 'Go to Settings',
    },
    {
      number: '2',
      title: 'Run your first match',
      description: 'See who has pressure and when to act',
      action: () => {
        onClose();
        navigate('/matching-engine');
      },
      buttonText: 'Open Matching Engine',
    },
    {
      number: '3',
      title: 'Copy the intro template',
      description: 'Use the AI-generated outbound asset',
      action: () => {
        onClose();
        navigate('/matching-engine');
      },
      buttonText: 'View Intro Templates',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 backdrop-blur-sm bg-black/60">
      <div
        className="relative max-w-2xl w-full rounded-[20px] p-8 border border-[#26F7C7]/30"
        style={{
          background: 'linear-gradient(135deg, rgba(12, 12, 12, 0.95) 0%, rgba(10, 10, 10, 0.95) 100%)',
          backdropFilter: 'blur(24px)',
          boxShadow: '0 0 40px rgba(38, 247, 199, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-white/40 hover:text-white/80 transition-colors"
        >
          <div className="w-6 h-6 flex items-center justify-center">×</div>
        </button>

        <div
          className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(38, 247, 199, 0.2) 0%, rgba(38, 247, 199, 0.05) 100%)',
            border: '1px solid rgba(38, 247, 199, 0.3)',
            boxShadow: '0 0 30px rgba(38, 247, 199, 0.2)',
          }}
        >
          <Zap size={32} className="text-[#26F7C7]" />
        </div>

        <h2
          className="text-2xl font-semibold text-center mb-3"
          style={{
            background: 'linear-gradient(135deg, #FFFFFF 0%, rgba(255, 255, 255, 0.7) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Quick Start Guide
        </h2>

        <p className="text-white/60 text-center mb-8 leading-relaxed">
          3 steps to generate your first match
        </p>

        <div className="space-y-4">
          {steps.map((step) => (
            <div
              key={step.number}
              className="p-5 rounded-xl border border-white/10 hover:border-[#26F7C7]/30 transition-all duration-200"
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
              }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-semibold"
                  style={{
                    background: 'linear-gradient(135deg, rgba(38, 247, 199, 0.15) 0%, rgba(38, 247, 199, 0.05) 100%)',
                    border: '1px solid rgba(38, 247, 199, 0.3)',
                    color: '#26F7C7',
                  }}
                >
                  {step.number}
                </div>

                <div className="flex-1">
                  <h3 className="text-white font-semibold mb-1">{step.title}</h3>
                  <p className="text-white/60 text-sm mb-3">{step.description}</p>

                  <button
                    onClick={step.action}
                    className="text-sm px-4 py-2 rounded-lg font-medium transition-all duration-200"
                    style={{
                      background: 'linear-gradient(135deg, rgba(38, 247, 199, 0.1) 0%, rgba(38, 247, 199, 0.05) 100%)',
                      border: '1px solid rgba(38, 247, 199, 0.2)',
                      color: '#26F7C7',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(38, 247, 199, 0.2) 0%, rgba(38, 247, 199, 0.1) 100%)';
                      e.currentTarget.style.borderColor = 'rgba(38, 247, 199, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(38, 247, 199, 0.1) 0%, rgba(38, 247, 199, 0.05) 100%)';
                      e.currentTarget.style.borderColor = 'rgba(38, 247, 199, 0.2)';
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
