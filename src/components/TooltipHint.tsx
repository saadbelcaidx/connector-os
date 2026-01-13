/**
 * TOOLTIP HINT — Lightweight hover/tap tooltip
 *
 * Works on desktop (hover) and mobile (tap).
 * No heavy dependencies.
 */

import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';

export interface TooltipHintProps {
  content: React.ReactNode;
  children?: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  maxWidth?: number;
  className?: string;
  iconClassName?: string;
  showIcon?: boolean;
}

export const TooltipHint: React.FC<TooltipHintProps> = ({
  content,
  children,
  position = 'top',
  maxWidth = 320,
  className = '',
  iconClassName = '',
  showIcon = true,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Detect touch device
  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window);
  }, []);

  // Close tooltip when clicking outside (mobile)
  useEffect(() => {
    if (!isVisible || !isTouchDevice) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node)
      ) {
        setIsVisible(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isVisible, isTouchDevice]);

  const handleMouseEnter = () => {
    if (!isTouchDevice) setIsVisible(true);
  };

  const handleMouseLeave = () => {
    if (!isTouchDevice) setIsVisible(false);
  };

  const handleClick = () => {
    if (isTouchDevice) setIsVisible(!isVisible);
  };

  // Position styles
  const positionStyles: Record<string, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  // Arrow styles
  const arrowStyles: Record<string, string> = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-white/10 border-x-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-white/10 border-x-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-white/10 border-y-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-white/10 border-y-transparent border-l-transparent',
  };

  return (
    <div
      ref={triggerRef}
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {children || (
        showIcon && (
          <HelpCircle
            className={`w-4 h-4 text-white/30 hover:text-white/50 cursor-help transition-colors ${iconClassName}`}
          />
        )
      )}

      {/* Tooltip */}
      {isVisible && (
        <div
          ref={tooltipRef}
          className={`
            absolute z-50 ${positionStyles[position]}
            animate-in fade-in-0 zoom-in-95 duration-150
          `}
          style={{ width: maxWidth }}
        >
          <div
            className="
              px-4 py-3 text-[13px] text-white/70 leading-[1.5]
              bg-gradient-to-b from-[#1c1c1c] to-[#161616]
              border border-white/[0.08] rounded-xl
              shadow-2xl shadow-black/50
              whitespace-normal
            "
          >
            {content}
          </div>
          {/* Arrow */}
          <div
            className={`
              absolute w-0 h-0
              border-[6px] ${arrowStyles[position]}
            `}
          />
        </div>
      )}
    </div>
  );
};

// =============================================================================
// LABEL WITH TOOLTIP
// =============================================================================

export const LabelWithHint: React.FC<{
  label: string;
  hint: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  className?: string;
}> = ({ label, hint, htmlFor, required, className = '' }) => {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-white/70"
      >
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <TooltipHint content={hint} />
    </div>
  );
};

export default TooltipHint;
