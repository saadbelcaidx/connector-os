/**
 * ALERT PANEL — Premium UX Component
 *
 * Displays validation errors, warnings, and info with:
 * - Severity-based styling (info/warning/error/blocking)
 * - Clear title and reason
 * - Actionable fix steps
 * - CTA buttons
 * - Collapsible details section
 */

import React, { useState } from 'react';
import {
  Info,
  AlertTriangle,
  AlertCircle,
  XOctagon,
  ChevronDown,
  ChevronUp,
  Settings,
  ExternalLink,
  Copy,
  Download,
  RefreshCw,
  Mail,
  X,
} from 'lucide-react';
import type { UXSeverity, UXAction, UXExplanation } from '../services/Explainability';

// =============================================================================
// TYPES
// =============================================================================

export interface AlertPanelProps {
  severity: UXSeverity;
  title: string;
  children?: React.ReactNode;
  reason?: string;
  fix?: string[];
  actions?: UXAction[];
  details?: {
    technical?: string;
    context?: Record<string, unknown>;
  };
  onAction?: (action: UXAction) => void;
  onDismiss?: () => void;
  className?: string;
}

// =============================================================================
// STYLING
// =============================================================================

const severityStyles: Record<UXSeverity, {
  bg: string;
  border: string;
  icon: string;
  title: string;
}> = {
  info: {
    bg: 'bg-blue-500/[0.08]',
    border: 'border-blue-500/20',
    icon: 'text-blue-400',
    title: 'text-blue-300',
  },
  warning: {
    bg: 'bg-amber-500/[0.08]',
    border: 'border-amber-500/20',
    icon: 'text-amber-400',
    title: 'text-amber-300',
  },
  error: {
    bg: 'bg-red-500/[0.08]',
    border: 'border-red-500/20',
    icon: 'text-red-400',
    title: 'text-red-300',
  },
  blocking: {
    bg: 'bg-red-500/[0.12]',
    border: 'border-red-500/30',
    icon: 'text-red-400',
    title: 'text-red-200',
  },
};

const SeverityIcon: React.FC<{ severity: UXSeverity; className?: string }> = ({ severity, className }) => {
  const iconClass = `w-5 h-5 ${severityStyles[severity].icon} ${className || ''}`;
  switch (severity) {
    case 'info':
      return <Info className={iconClass} />;
    case 'warning':
      return <AlertTriangle className={iconClass} />;
    case 'error':
      return <AlertCircle className={iconClass} />;
    case 'blocking':
      return <XOctagon className={iconClass} />;
  }
};

// =============================================================================
// ACTION BUTTON
// =============================================================================

const ActionButton: React.FC<{
  action: UXAction;
  onClick: () => void;
}> = ({ action, onClick }) => {
  const iconClass = 'w-3.5 h-3.5';

  const getIcon = () => {
    switch (action.kind) {
      case 'open_settings':
        return <Settings className={iconClass} />;
      case 'open_docs':
        return <ExternalLink className={iconClass} />;
      case 'copy_to_clipboard':
        return <Copy className={iconClass} />;
      case 'export_audit':
        return <Download className={iconClass} />;
      case 'retry':
        return <RefreshCw className={iconClass} />;
      case 'contact_support':
        return <Mail className={iconClass} />;
    }
  };

  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
        bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1]
        rounded-lg transition-all duration-200 text-white/80 hover:text-white"
    >
      {getIcon()}
      {action.label}
    </button>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const AlertPanel: React.FC<AlertPanelProps> = ({
  severity,
  title,
  children,
  reason,
  fix,
  actions,
  details,
  onAction,
  onDismiss,
  className = '',
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const styles = severityStyles[severity];

  const handleAction = (action: UXAction) => {
    if (onAction) {
      onAction(action);
    } else {
      // Default handlers
      switch (action.kind) {
        case 'open_docs':
          window.open(action.url, '_blank', 'noopener,noreferrer');
          break;
        case 'copy_to_clipboard':
          navigator.clipboard.writeText(action.text);
          break;
      }
    }
  };

  return (
    <div
      className={`
        rounded-xl border ${styles.bg} ${styles.border}
        p-4 ${className}
      `}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <SeverityIcon severity={severity} className="flex-shrink-0 mt-0.5" />

        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center justify-between gap-2">
            <h4 className={`text-sm font-medium ${styles.title}`}>
              {title}
            </h4>
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="p-1 rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-white/60 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Reason */}
          {reason && (
            <p className="mt-1 text-sm text-white/60 leading-relaxed">
              {reason}
            </p>
          )}

          {/* Custom children */}
          {children && (
            <div className="mt-2 text-sm text-white/60">
              {children}
            </div>
          )}

          {/* Fix steps */}
          {fix && fix.length > 0 && (
            <ul className="mt-3 space-y-1">
              {fix.map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-white/70">
                  <span className="text-white/30 select-none">•</span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Actions */}
          {actions && actions.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {actions.map((action, i) => (
                <ActionButton
                  key={i}
                  action={action}
                  onClick={() => handleAction(action)}
                />
              ))}
            </div>
          )}

          {/* Details toggle */}
          {details && (details.technical || details.context) && (
            <div className="mt-4">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-1 text-xs text-white/40 hover:text-white/60 transition-colors"
              >
                {showDetails ? (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    Hide details
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    Show details
                  </>
                )}
              </button>

              {showDetails && (
                <div className="mt-2 p-3 rounded-lg bg-black/20 border border-white/[0.06]">
                  {details.technical && (
                    <pre className="text-xs text-white/50 font-mono whitespace-pre-wrap break-all">
                      {details.technical}
                    </pre>
                  )}
                  {details.context && (
                    <pre className="text-xs text-white/50 font-mono whitespace-pre-wrap break-all mt-2">
                      {JSON.stringify(details.context, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// CONVENIENCE WRAPPER
// =============================================================================

export const AlertFromExplanation: React.FC<{
  explanation: UXExplanation;
  onAction?: (action: UXAction) => void;
  onDismiss?: () => void;
  className?: string;
}> = ({ explanation, onAction, onDismiss, className }) => {
  return (
    <AlertPanel
      severity={explanation.severity}
      title={explanation.title}
      reason={explanation.reason}
      fix={explanation.fix}
      actions={explanation.actions}
      details={explanation.details}
      onAction={onAction}
      onDismiss={onDismiss}
      className={className}
    />
  );
};

export default AlertPanel;
