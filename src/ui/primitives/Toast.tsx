/**
 * TOAST — Apple-style notification
 *
 * SINGLE SOURCE OF TRUTH for toast notifications across the app.
 * Design: Glassmorphism, spring animations, centered floating.
 * Used for: restore messages, success notifications, warnings.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { ReactNode } from 'react';

// Apple easing curve
const APPLE_EASE = [0.16, 1, 0.3, 1] as const;

export type ToastVariant = 'success' | 'warning' | 'info';

export interface ToastProps {
  visible: boolean;
  title: string;
  description?: string;
  variant?: ToastVariant;
  onDismiss?: () => void;
  icon?: ReactNode;
}

const VARIANT_ICONS: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  warning: AlertCircle,
  info: Info,
};

/**
 * Apple-style floating toast notification.
 * Renders in a fixed position at the top of the viewport.
 */
export function Toast({
  visible,
  title,
  description,
  variant = 'success',
  onDismiss,
  icon,
}: ToastProps) {
  const Icon = VARIANT_ICONS[variant];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.98 }}
          transition={{ duration: 0.4, ease: APPLE_EASE }}
          className="fixed top-6 left-0 right-0 z-50 flex justify-center pointer-events-none"
        >
          <div className="pointer-events-auto px-5 py-3.5 rounded-2xl bg-[#1c1c1e]/95 backdrop-blur-xl border border-white/[0.06] shadow-2xl shadow-black/50">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0">
                {icon || <Icon size={16} className="text-white/70" />}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-white/90 tracking-[-0.01em]">
                  {title}
                </p>
                {description && (
                  <p className="text-[12px] text-white/50 mt-0.5 leading-relaxed">
                    {description}
                  </p>
                )}
              </div>
              {onDismiss && (
                <button
                  onClick={onDismiss}
                  className="p-2 hover:bg-white/[0.08] rounded-xl transition-all duration-200 flex-shrink-0"
                >
                  <X size={14} className="text-white/40" />
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Inline toast variant for embedding within content (not fixed position).
 */
export function InlineToast({
  visible,
  title,
  description,
  variant = 'info',
  onDismiss,
  icon,
}: ToastProps) {
  const Icon = VARIANT_ICONS[variant];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -5, scale: 0.99 }}
          transition={{ duration: 0.3, ease: APPLE_EASE }}
          className="px-5 py-3.5 rounded-2xl bg-[#1c1c1e]/80 backdrop-blur-xl border border-white/[0.06]"
        >
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0">
              {icon || <Icon size={16} className="text-white/70" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-white/90 tracking-[-0.01em]">
                {title}
              </p>
              {description && (
                <p className="text-[12px] text-white/50 mt-0.5 leading-relaxed">
                  {description}
                </p>
              )}
            </div>
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="p-2 hover:bg-white/[0.08] rounded-xl transition-all duration-200 flex-shrink-0"
              >
                <X size={14} className="text-white/40" />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
