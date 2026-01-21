/**
 * RecentFlows — Saved flows list with resume/delete actions
 *
 * PERSIST-1E: Shows up to 5 recent flows from localStorage
 * Allows resume (navigates to /flow?resumeFlowId=...) or delete
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Play, Trash2, ChevronRight } from 'lucide-react';
import { listFlows, deleteFlow, FlowIndexEntry } from '../services/FlowStateStore';

/**
 * Format relative time: '2h ago', 'yesterday', '3 days ago'
 */
function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

interface RecentFlowsProps {
  className?: string;
  onResume?: (flowId: string) => void; // Optional callback instead of navigation
}

export function RecentFlows({ className = '', onResume }: RecentFlowsProps) {
  const navigate = useNavigate();
  const [flows, setFlows] = useState<FlowIndexEntry[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Load flows on mount
  useEffect(() => {
    const loadedFlows = listFlows();
    setFlows(loadedFlows.slice(0, 5)); // Max 5
  }, []);

  // Refresh flows when storage changes (from other tabs)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key?.startsWith('flow:')) {
        setFlows(listFlows().slice(0, 5));
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const handleResume = useCallback((flowId: string) => {
    if (onResume) {
      onResume(flowId);
    } else {
      navigate(`/flow?resumeFlowId=${flowId}`);
    }
  }, [navigate, onResume]);

  const handleDelete = useCallback((flowId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteFlow(flowId);
    setFlows(prev => prev.filter(f => f.flowId !== flowId));
  }, []);

  if (flows.length === 0) {
    return null; // Don't show if no saved flows
  }

  return (
    <div className={`${className}`}>
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between px-3 py-2 text-[12px] font-medium text-white/40 hover:text-white/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5" />
          <span>Recent flows</span>
          <span className="text-white/20">({flows.length})</span>
        </div>
        <ChevronRight
          className={`w-3.5 h-3.5 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
        />
      </button>

      {/* Flow list */}
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-1 px-2 pb-2">
              {flows.map((flow, index) => (
                <motion.div
                  key={flow.flowId}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="group flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.04] transition-colors cursor-pointer"
                  onClick={() => handleResume(flow.flowId)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-white/70 truncate">
                      {flow.name || 'Untitled flow'}
                    </p>
                    <p className="text-[11px] text-white/30">
                      {formatRelativeTime(flow.updatedAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleResume(flow.flowId);
                      }}
                      className="p-1.5 rounded-md hover:bg-white/[0.08] text-white/40 hover:text-emerald-400 transition-colors"
                      title="Resume"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDelete(flow.flowId, e)}
                      className="p-1.5 rounded-md hover:bg-white/[0.08] text-white/40 hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default RecentFlows;
