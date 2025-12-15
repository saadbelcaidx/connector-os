import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function Portal() {
  const navigate = useNavigate();
  const [isHovering, setIsHovering] = useState(false);
  const [isClicking, setIsClicking] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [hologramOffset, setHologramOffset] = useState({ x: 0, y: 0 });

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
    const targetX = -mousePosition.x * 10;
    const targetY = -mousePosition.y * 10;

    const timer = setTimeout(() => {
      setHologramOffset({ x: targetX, y: targetY });
    }, 50);

    return () => clearTimeout(timer);
  }, [mousePosition]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleEnter();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleEnter = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      const lowOsc = audioContext.createOscillator();
      const lowGain = audioContext.createGain();
      lowOsc.type = 'sine';
      lowOsc.frequency.setValueAtTime(550, audioContext.currentTime);
      lowOsc.connect(lowGain);
      lowGain.connect(audioContext.destination);

      lowGain.gain.setValueAtTime(0, audioContext.currentTime);
      lowGain.gain.linearRampToValueAtTime(0.22, audioContext.currentTime + 0.008);
      lowGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.18);

      const highOsc = audioContext.createOscillator();
      const highGain = audioContext.createGain();
      highOsc.type = 'sine';
      highOsc.frequency.setValueAtTime(2750, audioContext.currentTime);
      highOsc.connect(highGain);
      highGain.connect(audioContext.destination);

      highGain.gain.setValueAtTime(0, audioContext.currentTime);
      highGain.gain.linearRampToValueAtTime(0.04, audioContext.currentTime + 0.006);
      highGain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.14);

      lowOsc.start(audioContext.currentTime);
      highOsc.start(audioContext.currentTime);

      setTimeout(() => {
        lowOsc.stop();
        highOsc.stop();
      }, 200);
    } catch (e) {
      console.log('Audio not available');
    }

    setIsClicking(true);
    setTimeout(() => {
      navigate('/launcher');
    }, 150);
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center relative overflow-hidden">
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{
          opacity: isHovering ? 0.16 : 0.08,
          transition: 'opacity 200ms ease-out',
          transform: `translate(${hologramOffset.x}px, ${hologramOffset.y}px)`,
          transitionProperty: 'opacity, transform',
          transitionDuration: '200ms, 400ms',
          transitionTimingFunction: 'ease-out, ease-out',
        }}
      >
        <div
          className={`relative ${isClicking ? 'animate-pulse' : ''}`}
          style={{
            width: 'min(520px, 60vw)',
            height: 'min(520px, 60vw)',
            animation: isClicking ? 'pulse 0.15s ease-out' : 'none',
          }}
        >
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 520 520"
            className="absolute inset-0"
            style={{
              animation: 'rotate 45s linear infinite, pulse-opacity 5s ease-in-out infinite, breathe 18s ease-in-out infinite',
              filter: 'blur(1px)',
            }}
          >
            <circle
              cx="260"
              cy="260"
              r="180"
              fill="none"
              stroke="#0EA5E9"
              strokeWidth="1"
              opacity="0.8"
            />
            <circle
              cx="260"
              cy="260"
              r="220"
              fill="none"
              stroke="#0EA5E9"
              strokeWidth="1"
              opacity="0.6"
            />
            <circle
              cx="260"
              cy="260"
              r="260"
              fill="none"
              stroke="#0EA5E9"
              strokeWidth="1"
              opacity="0.4"
            />

            {Array.from({ length: 24 }).map((_, i) => {
              const angle = (i * 15 * Math.PI) / 180;
              const radius = 180;
              const x1 = 260 + radius * Math.cos(angle);
              const y1 = 260 + radius * Math.sin(angle);
              const length = Math.random() * 4 + 2;
              const x2 = 260 + (radius + length) * Math.cos(angle);
              const y2 = 260 + (radius + length) * Math.sin(angle);
              return (
                <line
                  key={`tick-1-${i}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#0EA5E9"
                  strokeWidth="1"
                  opacity="0.1"
                />
              );
            })}

            {Array.from({ length: 28 }).map((_, i) => {
              const angle = (i * 12.86 * Math.PI) / 180;
              const radius = 220;
              const x1 = 260 + radius * Math.cos(angle);
              const y1 = 260 + radius * Math.sin(angle);
              const length = Math.random() * 4 + 2;
              const x2 = 260 + (radius + length) * Math.cos(angle);
              const y2 = 260 + (radius + length) * Math.sin(angle);
              return (
                <line
                  key={`tick-2-${i}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#0EA5E9"
                  strokeWidth="1"
                  opacity="0.1"
                />
              );
            })}

            {Array.from({ length: 36 }).map((_, i) => {
              const angle = (i * 10 * Math.PI) / 180;
              const radius = 260;
              const x1 = 260 + radius * Math.cos(angle);
              const y1 = 260 + radius * Math.sin(angle);
              const length = Math.random() * 4 + 2;
              const x2 = 260 + (radius + length) * Math.cos(angle);
              const y2 = 260 + (radius + length) * Math.sin(angle);
              return (
                <line
                  key={`tick-3-${i}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#0EA5E9"
                  strokeWidth="1"
                  opacity="0.1"
                />
              );
            })}
          </svg>
        </div>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8 animate-hero-in">
        <div
          className="px-4 py-1.5 rounded-full text-[10px] font-semibold tracking-widest text-[#0EA5E9] uppercase"
          style={{
            backgroundColor: 'rgba(14, 165, 233, 0.08)',
            boxShadow: '0 0 1px rgba(14, 165, 233, 0.8)',
            border: '1px solid rgba(14, 165, 233, 0.2)',
          }}
        >
          Connector OS — Operator Console
        </div>

        <h1
          className="text-3xl font-semibold tracking-tight"
          style={{
            color: '#E5E5E5',
            opacity: 0.85,
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          ENTER Connector OS
        </h1>

        <button
          onClick={handleEnter}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          className="px-8 py-2.5 rounded-full text-sm font-medium transition-all ease-out"
          style={{
            backgroundColor: '#0A0A0A',
            border: '1px solid #1F1F1F',
            color: '#E5E5E5',
            opacity: 0.9,
            boxShadow: isHovering
              ? '0 0 12px rgba(14, 165, 233, 0.22)'
              : 'none',
            transitionDuration: '200ms',
          }}
        >
          Enter
        </button>
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

        @keyframes pulse-opacity {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 1.5;
          }
        }

        @keyframes breathe {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.025);
            opacity: 1.04;
          }
        }

        @keyframes hero-in {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-hero-in {
          animation: hero-in 850ms ease-out forwards;
          animation-delay: 120ms;
          opacity: 0;
        }
      `}</style>
    </div>
  );
}

export default Portal;
