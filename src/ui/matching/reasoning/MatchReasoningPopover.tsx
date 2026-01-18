/**
 * MATCH REASONING POPOVER — Human Reasoning Layer
 *
 * Surgical info icon that shows WHY a match was routed.
 * 2-3 lines of operator-grade language on demand.
 *
 * Visual placement: Next to tier badge (🔵 ⓘ)
 * Trigger: Hover (desktop) + Click (mobile)
 * Close: Mouse leave, tap-outside, scroll
 *
 * CRITICAL: Uses Portal to escape overflow-hidden parent containers.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import type { Match } from '../../../matching';
import { translateToOperatorLanguage, getTierDisplayInfo } from './translator';

// =============================================================================
// PROPS
// =============================================================================

export interface MatchReasoningPopoverProps {
  match: Match;
  className?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export const MatchReasoningPopover: React.FC<MatchReasoningPopoverProps> = ({
  match,
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Detect touch device
  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window);
  }, []);

  // Calculate position when visible
  useEffect(() => {
    if (!isVisible || !triggerRef.current) return;

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Position above the trigger, centered
      setPosition({
        top: rect.top + window.scrollY - 8, // 8px gap above trigger
        left: rect.left + window.scrollX + rect.width / 2,
      });
    };

    updatePosition();

    // Update on resize
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [isVisible]);

  // Close on scroll
  useEffect(() => {
    if (!isVisible) return;

    const handleScroll = () => {
      setIsVisible(false);
    };

    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isVisible]);

  // Close on click outside (mobile)
  useEffect(() => {
    if (!isVisible || !isTouchDevice) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setIsVisible(false);
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isVisible, isTouchDevice]);

  // Handlers
  const handleMouseEnter = useCallback(() => {
    if (!isTouchDevice) setIsVisible(true);
  }, [isTouchDevice]);

  const handleMouseLeave = useCallback(() => {
    if (!isTouchDevice) setIsVisible(false);
  }, [isTouchDevice]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTouchDevice) setIsVisible(v => !v);
  }, [isTouchDevice]);

  // Get reasoning lines
  const reasoning = translateToOperatorLanguage(match);
  const tierInfo = getTierDisplayInfo(match.tier);

  // Popover content (rendered via Portal)
  const popoverContent = isVisible ? (
    <div
      ref={popoverRef}
      className="fixed z-[9999] pointer-events-auto"
      style={{
        top: position.top,
        left: position.left,
        transform: 'translate(-50%, -100%)',
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className="
          p-3 space-y-1
          bg-zinc-900/95 backdrop-blur-sm
          border border-white/10
          rounded-xl
          shadow-2xl shadow-black/50
          min-w-[220px] max-w-[320px]
          animate-in fade-in-0 zoom-in-95 duration-150
        "
      >
        {/* Line 1: Strategic context */}
        <p className="text-[13px] text-white/70 leading-relaxed">
          {reasoning.line1}
        </p>

        {/* Line 2: Provider specialty */}
        <p className="text-[13px] text-white/90 leading-relaxed font-medium">
          {reasoning.line2}
        </p>

        {/* Line 3: Routing confidence (only for Good/Exploratory) */}
        {reasoning.line3 && (
          <p className="text-xs text-white/50 leading-relaxed font-mono">
            {reasoning.line3}
          </p>
        )}
      </div>

      {/* Arrow pointing down */}
      <div
        className="
          absolute top-full left-1/2 -translate-x-1/2
          w-0 h-0
          border-l-[6px] border-l-transparent
          border-r-[6px] border-r-transparent
          border-t-[6px] border-t-zinc-900/95
        "
      />
    </div>
  ) : null;

  return (
    <div
      className={`relative inline-flex ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Trigger — Info icon */}
      <button
        ref={triggerRef}
        onClick={handleClick}
        className="
          p-0.5 rounded-md
          text-white/50 hover:text-white/80
          transition-colors duration-150
          focus:outline-none focus:ring-1 focus:ring-white/20
        "
        aria-label={`Match reasoning: ${tierInfo.label} tier`}
        aria-expanded={isVisible}
        aria-haspopup="true"
      >
        <Info size={14} strokeWidth={2} />
      </button>

      {/* Popover via Portal — escapes overflow-hidden */}
      {createPortal(popoverContent, document.body)}
    </div>
  );
};

export default MatchReasoningPopover;
