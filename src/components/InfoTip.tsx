/**
 * InfoTip — Progressive disclosure tooltip
 *
 * Hover to see hint. Clean by default.
 */

import { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';

interface InfoTipProps {
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export function InfoTip({ content, position = 'top' }: InfoTipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      const trigger = triggerRef.current.getBoundingClientRect();
      const tooltip = tooltipRef.current.getBoundingClientRect();

      let x = 0;
      let y = 0;

      switch (position) {
        case 'top':
          x = trigger.left + trigger.width / 2 - tooltip.width / 2;
          y = trigger.top - tooltip.height - 8;
          break;
        case 'bottom':
          x = trigger.left + trigger.width / 2 - tooltip.width / 2;
          y = trigger.bottom + 8;
          break;
        case 'left':
          x = trigger.left - tooltip.width - 8;
          y = trigger.top + trigger.height / 2 - tooltip.height / 2;
          break;
        case 'right':
          x = trigger.right + 8;
          y = trigger.top + trigger.height / 2 - tooltip.height / 2;
          break;
      }

      // Keep within viewport
      x = Math.max(8, Math.min(x, window.innerWidth - tooltip.width - 8));
      y = Math.max(8, Math.min(y, window.innerHeight - tooltip.height - 8));

      setCoords({ x, y });
    }
  }, [isVisible, position]);

  return (
    <>
      <button
        ref={triggerRef}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        className="p-0.5 rounded-full text-white/30 hover:text-white/50 transition-colors focus:outline-none focus:ring-1 focus:ring-white/20"
        aria-label="More info"
      >
        <HelpCircle size={14} strokeWidth={1.5} />
      </button>

      {isVisible && (
        <div
          ref={tooltipRef}
          className="fixed z-[100] pointer-events-none"
          style={{
            left: coords.x,
            top: coords.y,
            animation: 'tooltip-fade-in 150ms ease-out',
          }}
        >
          <div className="px-3 py-2 rounded-lg bg-[#1a1a1a] border border-white/[0.08] shadow-xl max-w-[240px]">
            <p className="text-[12px] text-white/70 leading-relaxed">{content}</p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes tooltip-fade-in {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}

export default InfoTip;
