import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, BookOpen, Code, FileText, ChevronLeft } from 'lucide-react';
import Dock from './Dock';

interface DocCard {
  id: string;
  title: string;
  description: string;
  route: string;
}

interface DocCategory {
  id: string;
  title: string;
  description: string;
  icon: typeof Brain;
  docs: DocCard[];
}

const categories: DocCategory[] = [
  {
    id: 'mental-models',
    title: 'Mental Models',
    description: 'Philosophy for operator thinking.',
    icon: Brain,
    docs: [
      {
        id: 'initiation',
        title: 'Your Initiation',
        description: 'Understanding your place as the Axis Mundi — the bridge between worlds.',
        route: '/docs/initiation',
      },
      {
        id: 'need-power',
        title: 'Understanding Need & Power',
        description: 'The two worlds of business — and why you stand between them.',
        route: '/docs/need-power',
      },
    ],
  },
  {
    id: 'documentation',
    title: 'Documentation & Resources',
    description: 'How to use the Operator OS tools.',
    icon: FileText,
    docs: [
      {
        id: 'signals-guide',
        title: 'Signals & API Guide',
        description: 'How to use Connector Matching Engine with external signal sources.',
        route: '/docs/signals-guide',
      },
    ],
  },
  {
    id: 'playbooks',
    title: 'Playbooks',
    description: 'Step-by-step execution guides',
    icon: BookOpen,
    docs: [],
  },
];

function Library() {
  const navigate = useNavigate();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [hologramOffset, setHologramOffset] = useState({ x: 0, y: 0 });
  const [isAnyCardHovered, setIsAnyCardHovered] = useState(false);

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

  return (
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
          </svg>
        </div>
      </div>

      <div className="relative z-10 container mx-auto px-6 py-16 animate-fade-in">
        <button
          onClick={() => navigate('/launcher')}
          className="flex items-center gap-2 text-sm mb-12 transition-colors"
          style={{ color: '#A1A1A1' }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#E5E5E5'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#A1A1A1'}
        >
          <ChevronLeft size={18} />
          <span>Back to Launcher</span>
        </button>

        <div className="flex justify-center mb-16">
          <div
            className="px-5 py-2 rounded-full text-[11px] font-semibold tracking-widest text-[#0EA5E9] uppercase"
            style={{
              backgroundColor: 'rgba(14, 165, 233, 0.08)',
              boxShadow: '0 0 1px rgba(14, 165, 233, 0.8)',
              border: '1px solid rgba(14, 165, 233, 0.2)',
            }}
          >
            OS Library
          </div>
        </div>

        <h1
          className="text-4xl font-bold text-center mb-4"
          style={{ color: '#E5E5E5', fontFamily: 'Inter, system-ui, sans-serif' }}
        >
          Documentation & Resources
        </h1>
        <p
          className="text-center mb-16 text-lg"
          style={{ color: '#A1A1A1', maxWidth: '600px', margin: '0 auto 4rem' }}
        >
          Mental models, playbooks, and guides for operators.
        </p>

        <div className="max-w-6xl mx-auto space-y-16">
          {categories.map((category, categoryIndex) => (
            <div key={category.id} className="space-y-6">
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="p-2 rounded-lg"
                  style={{
                    background: 'rgba(14, 165, 233, 0.08)',
                    border: '1px solid rgba(14, 165, 233, 0.2)',
                  }}
                >
                  <category.icon size={20} style={{ color: '#0EA5E9', strokeWidth: 1.5 }} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold" style={{ color: '#E5E5E5' }}>
                    {category.title}
                  </h2>
                  <p className="text-sm" style={{ color: '#A1A1A1' }}>
                    {category.description}
                  </p>
                </div>
              </div>

              {category.docs.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {category.docs.map((doc, docIndex) => (
                    <DocCardComponent
                      key={doc.id}
                      doc={doc}
                      onClick={() => navigate(doc.route)}
                      index={categoryIndex * 10 + docIndex}
                      onHoverChange={setIsAnyCardHovered}
                    />
                  ))}
                </div>
              ) : (
                <div
                  className="text-center py-12 rounded-xl"
                  style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                  }}
                >
                  <p className="text-sm" style={{ color: '#666' }}>
                    Coming soon
                  </p>
                </div>
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
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fade-in 600ms ease-out forwards;
        }
      `}</style>

      <Dock />
    </div>
  );
}

function DocCardComponent({
  doc,
  onClick,
  index,
  onHoverChange,
}: {
  doc: DocCard;
  onClick: () => void;
  index: number;
  onHoverChange: (isHovered: boolean) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const handleMouseEnter = () => {
    setIsHovered(true);
    onHoverChange(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    onHoverChange(false);
  };

  const handleMouseDown = () => {
    setIsPressed(true);
  };

  const handleMouseUp = () => {
    setIsPressed(false);
  };

  return (
    <div
      className="relative group cursor-pointer"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onClick={onClick}
      style={{
        animation: `card-fade-in 0.6s ease-out forwards ${index * 0.08}s`,
        opacity: 0,
      }}
    >
      <div
        className="relative p-5 rounded-xl h-full"
        style={{
          background: 'rgba(255, 255, 255, 0.03)',
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(14, 165, 233, 0.2)',
          boxShadow: isHovered
            ? '0 0 22px rgba(14, 165, 233, 0.2)'
            : '0 0 1px rgba(14, 165, 233, 0.1)',
          transform: `scale(${isPressed ? 0.98 : isHovered ? 1.03 : 1})`,
          transition: isPressed ? 'transform 0.12s ease' : 'transform 0.18s ease, box-shadow 0.18s ease',
        }}
      >
        <h3
          className="text-lg font-semibold mb-2"
          style={{
            color: '#E5E5E5',
          }}
        >
          {doc.title}
        </h3>

        <p
          className="text-sm leading-relaxed"
          style={{
            color: '#A1A1A1',
          }}
        >
          {doc.description}
        </p>
      </div>
    </div>
  );
}

export default Library;
