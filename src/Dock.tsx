import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { TrendingUp, Filter, Mail, BookOpen } from 'lucide-react';

interface DockApp {
  id: string;
  name: string;
  icon: typeof TrendingUp;
  route: string;
  comingSoon?: boolean;
}

const dockApps: DockApp[] = [
  {
    id: 'calculator',
    name: 'Calculator',
    icon: TrendingUp,
    route: '/calculator',
  },
  {
    id: 'dealflow',
    name: 'Dealflow',
    icon: Filter,
    route: '/dealflow',
    comingSoon: true,
  },
  {
    id: 'email',
    name: 'Msg Sim',
    icon: Mail,
    route: '/email',
    comingSoon: true,
  },
  {
    id: 'library',
    name: 'Library',
    icon: BookOpen,
    route: '/library',
    comingSoon: true,
  },
];

function Dock() {
  const navigate = useNavigate();
  const location = useLocation();
  const [hoveredApp, setHoveredApp] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState<string | null>(null);

  const handleAppClick = (app: DockApp) => {
    if (app.comingSoon) {
      setShowTooltip(app.id);
      setTimeout(() => setShowTooltip(null), 1500);
      return;
    }
    navigate(app.route);
  };

  return (
    <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50">
      <div
        className="flex items-center gap-3 px-4 py-2.5 rounded-full"
        style={{
          background: 'rgba(15, 15, 15, 0.9)',
          backdropFilter: 'blur(8px)',
          border: '1px solid #1F1F1F',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
          animation: 'dock-fade-in 0.4s ease-out 0.2s forwards',
          opacity: 0,
        }}
      >
        {dockApps.map((app) => {
          const Icon = app.icon;
          const isActive = location.pathname === app.route;

          return (
            <div key={app.id} className="relative">
              <button
                onClick={() => handleAppClick(app)}
                onMouseEnter={() => setHoveredApp(app.id)}
                onMouseLeave={() => setHoveredApp(null)}
                className="relative flex flex-col items-center gap-1 p-2 rounded-lg transition-all duration-[140ms]"
                style={{
                  cursor: app.comingSoon ? 'not-allowed' : 'pointer',
                  transform: hoveredApp === app.id && !app.comingSoon ? 'scale(1.08)' : 'scale(1)',
                }}
              >
                <Icon
                  size={20}
                  style={{
                    color: isActive ? '#0EA5E9' : '#A0A0A0',
                    strokeWidth: isActive ? 2 : 1.5,
                    opacity: app.comingSoon ? 0.7 : 1,
                    transition: 'all 140ms ease-out',
                  }}
                />
                <span
                  className="text-[9px] font-medium"
                  style={{
                    color: isActive ? '#0EA5E9' : '#A0A0A0',
                    opacity: app.comingSoon ? 0.7 : 1,
                    transition: 'all 140ms ease-out',
                  }}
                >
                  {app.name}
                </span>
                {isActive && (
                  <div
                    className="absolute -bottom-1"
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: '50%',
                      background: '#0EA5E9',
                      boxShadow: '0 0 8px rgba(14, 165, 233, 0.6)',
                    }}
                  />
                )}
              </button>

              {showTooltip === app.id && (
                <div
                  className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 whitespace-nowrap px-2 py-1 rounded text-[10px]"
                  style={{
                    background: 'rgba(20, 20, 20, 0.95)',
                    border: '1px solid #2A2A2A',
                    color: '#999',
                    animation: 'tooltip-fade-in 0.2s ease-out forwards',
                  }}
                >
                  Coming soon
                </div>
              )}
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes dock-fade-in {
          from {
            opacity: 0;
            transform: translateY(100px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes tooltip-fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

export default Dock;
