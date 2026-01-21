/**
 * FlowLeaveWarning — Navigation warning modal for Flow
 *
 * PERSIST-1D: Warns user when navigating away from an in-progress flow
 * Never blocks — gives user the choice to stay or leave.
 *
 * Operator-grade language: calm, directive, non-alarming
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle } from 'lucide-react';

interface FlowLeaveWarningProps {
  isOpen: boolean;
  onStay: () => void;
  onLeave: () => void;
}

export function FlowLeaveWarning({ isOpen, onStay, onLeave }: FlowLeaveWarningProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998]"
            onClick={onStay}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-0 flex items-center justify-center z-[9999] pointer-events-none"
          >
            <div
              className="pointer-events-auto w-full max-w-[380px] bg-[#0C0C0C] rounded-2xl border border-white/[0.08] overflow-hidden"
              style={{
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              }}
            >
              {/* Header */}
              <div className="pt-6 pb-4 px-6 text-center">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-5 h-5 text-amber-400" />
                </div>
                <h2 className="text-[17px] font-semibold text-white/90 mb-2">
                  Flow in progress
                </h2>
                <p className="text-[14px] text-white/50 leading-relaxed">
                  Your matching is saved. Resume anytime from Settings → Recent flows.
                </p>
              </div>

              {/* Actions */}
              <div className="px-6 pb-6 flex gap-3">
                <button
                  onClick={onLeave}
                  className="flex-1 h-11 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-[14px] font-medium text-white/60 hover:text-white/80 transition-colors"
                >
                  Leave (resume later)
                </button>
                <button
                  onClick={onStay}
                  className="flex-1 h-11 rounded-xl bg-white/90 hover:bg-white text-[14px] font-medium text-black transition-colors"
                >
                  Stay
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default FlowLeaveWarning;
