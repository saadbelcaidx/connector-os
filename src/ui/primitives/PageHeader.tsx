/**
 * PAGE HEADER — Fixed height header with 3-zone layout
 *
 * SINGLE SOURCE OF TRUTH for page headers across the app.
 * Design: Fixed height (h-16), left/center/right zones.
 * - Left: Back button or navigation
 * - Center: Absolute-positioned (doesn't affect siblings)
 * - Right: Reserved width to prevent layout shifts
 */

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BTN } from './Button';

export interface PageHeaderProps {
  /** Back navigation target (default: /launcher) */
  backTo?: string;
  /** Custom back button click handler */
  onBack?: () => void;
  /** Hide the back button */
  hideBack?: boolean;
  /** Center content (absolute-positioned, doesn't affect layout) */
  center?: ReactNode;
  /** Right content */
  right?: ReactNode;
  /** Additional className for the header container */
  className?: string;
}

/**
 * Fixed-height page header with consistent 3-zone layout.
 * Center zone uses absolute positioning to not affect left/right spacing.
 */
export function PageHeader({
  backTo = '/launcher',
  onBack,
  hideBack = false,
  center,
  right,
  className = '',
}: PageHeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(backTo);
    }
  };

  return (
    <div className={`h-16 px-8 flex items-center justify-between flex-shrink-0 relative ${className}`}>
      {/* Left: Back button */}
      {!hideBack ? (
        <button onClick={handleBack} className={BTN.icon}>
          <ArrowLeft size={18} className="text-white/50" />
        </button>
      ) : (
        <div className="w-10" /> // Spacer when back is hidden
      )}

      {/* Center: Absolute-positioned (doesn't affect siblings) */}
      {center && (
        <div className="absolute left-1/2 -translate-x-1/2">
          {center}
        </div>
      )}

      {/* Right: Reserved width to prevent layout shifts */}
      <div className="w-16 flex justify-end">
        {right}
      </div>
    </div>
  );
}

/**
 * Processing indicator for active operations.
 * Shows pulsing dot with status text.
 */
export interface ProcessingIndicatorProps {
  visible: boolean;
  text?: string;
}

export function ProcessingIndicator({
  visible,
  text = 'Processing — keep this tab open',
}: ProcessingIndicatorProps) {
  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex items-center gap-2"
    >
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 animate-pulse" />
      <span className="text-[11px] text-white/40 tracking-wide whitespace-nowrap">
        {text}
      </span>
    </motion.div>
  );
}

/**
 * Text link button for header actions (e.g., "Start over").
 */
export interface HeaderLinkProps {
  onClick: () => void;
  children: ReactNode;
  visible?: boolean;
}

export function HeaderLink({ onClick, children, visible = true }: HeaderLinkProps) {
  if (!visible) return null;

  return (
    <motion.button
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className={BTN.link + ' whitespace-nowrap'}
    >
      {children}
    </motion.button>
  );
}
