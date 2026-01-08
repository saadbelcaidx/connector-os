import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function Portal() {
  const navigate = useNavigate();
  const [isHovering, setIsHovering] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
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
    const targetX = -mousePosition.x * 8;
    const targetY = -mousePosition.y * 8;

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
    setIsPressed(true);
    setTimeout(() => {
      navigate('/launcher');
    }, 150);
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center relative overflow-hidden">
      {/* Subtle gradient orb - Apple style */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{ opacity: 0.4 }}
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

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6 animate-fade-in">
        {/* Logo */}
        <div
          className="w-16 h-16 rounded-2xl overflow-hidden mb-2"
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <img
            src="/image.png"
            alt="Connector OS"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Badge */}
        <div
          className="px-3 py-1 rounded-full text-[9px] font-medium tracking-[0.12em] uppercase"
          style={{
            color: 'rgba(255, 255, 255, 0.45)',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          Connector OS
        </div>

        {/* Title */}
        <h1
          className="text-[28px] font-semibold tracking-[-0.02em] text-center"
          style={{ color: 'rgba(255, 255, 255, 0.85)' }}
        >
          Enter Connector OS
        </h1>

        {/* Subtitle */}
        <p
          className="text-[14px] text-center max-w-xs"
          style={{ color: 'rgba(255, 255, 255, 0.4)' }}
        >
          Find who needs who — instantly.
        </p>

        {/* Enter Button */}
        <button
          onClick={handleEnter}
          className="mt-4 btn-primary px-8 py-3"
          style={{
            transform: isPressed ? 'scale(0.97)' : 'scale(1)',
          }}
        >
          Enter
        </button>

        {/* Hint */}
        <p
          className="text-[11px] mt-2"
          style={{ color: 'rgba(255, 255, 255, 0.25)' }}
        >
          Press Enter ↵
        </p>
      </div>

      <style>{`
        @keyframes fade-in {
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
          animation: fade-in 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
      `}</style>
    </div>
  );
}

export default Portal;
