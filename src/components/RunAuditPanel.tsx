/**
 * RunAuditPanel.tsx
 *
 * INLINE OBSERVABILITY FOR CONNECTOR RUNS
 *
 * Shows:
 * - Run summary with health status
 * - Mode + registry version
 * - Demand/Supply counts breakdown
 * - Validator failures (top reasons)
 * - Instantly payload size
 * - Skipped reasons
 * - Exportable JSON (basic + debug bundle with redaction)
 *
 * Design: Linear monochrome with collapsible sections
 */

import React, { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Download,
  AlertTriangle,
  CheckCircle,
  XCircle,
  FileJson,
  Activity,
  Bug,
  Shield,
  Copy,
} from 'lucide-react';
import {
  type ConnectorMode,
  MODE_REGISTRY_VERSION,
  getModeContract,
} from '../services/ConnectorModeRegistry';
import type { CopyValidationResult } from '../services/CopyValidator';

// =============================================================================
// TYPES
// =============================================================================

export interface RunAuditData {
  // Mode info
  mode: ConnectorMode;
  registryVersion: string;

  // Counts
  demandCount: number;
  supplyCount: number;
  enrichedCount: number;
  matchedCount: number;

  // Validation
  demandValidationFailures: ValidationFailure[];
  supplyValidationFailures: ValidationFailure[];
  copyValidationFailures: CopyValidationResult[];

  // Send info
  instantlyPayloadSize: number;
  sentCount: number;
  skippedReasons: SkippedReason[];

  // Timing
  runStartedAt: Date;
  runCompletedAt?: Date;

  // Debug context (for debug bundle export)
  debugContext?: DebugContext;
}

export interface DebugContext {
  // Settings (will be redacted)
  apifyToken?: string;
  apolloApiKey?: string;
  anymailApiKey?: string;
  instantlyApiKey?: string;
  openaiApiKey?: string;
  azureApiKey?: string;
  claudeApiKey?: string;

  // Dataset info
  demandDatasetId?: string;
  supplyDatasetId?: string;

  // AI config
  aiProvider?: string;
  aiModel?: string;

  // Campaigns
  demandCampaignId?: string;
  supplyCampaignId?: string;

  // Browser/environment
  userAgent?: string;
  timestamp?: string;

  // Raw errors
  rawErrors?: string[];
}

export interface ValidationFailure {
  domain: string;
  reason: string;
  field?: string;
}

export interface SkippedReason {
  domain: string;
  reason: string;
  count: number;
}

interface RunAuditPanelProps {
  data: RunAuditData;
  className?: string;
}

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

function Section({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
  badge,
  badgeColor = 'white',
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string | number;
  badgeColor?: 'white' | 'red' | 'emerald' | 'amber';
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const badgeColorClasses = {
    white: 'bg-white/[0.08] text-white/70',
    red: 'bg-red-500/[0.12] text-red-400',
    emerald: 'bg-emerald-500/[0.12] text-emerald-400',
    amber: 'bg-amber-500/[0.12] text-amber-400',
  };

  return (
    <div className="border-b border-white/[0.06] last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/[0.02] transition-colors"
      >
        {isOpen ? (
          <ChevronDown size={14} className="text-white/40" />
        ) : (
          <ChevronRight size={14} className="text-white/40" />
        )}
        <Icon size={14} className="text-white/50" />
        <span className="text-xs font-medium text-white/70 flex-1 text-left">
          {title}
        </span>
        {badge !== undefined && (
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${badgeColorClasses[badgeColor]}`}
          >
            {badge}
          </span>
        )}
      </button>
      {isOpen && (
        <div className="px-3 pb-3 pt-1 animate-in slide-in-from-top-1 duration-150">
          {children}
        </div>
      )}
    </div>
  );
}

function StatRow({
  label,
  value,
  subValue,
  status,
}: {
  label: string;
  value: string | number;
  subValue?: string;
  status?: 'success' | 'warning' | 'error';
}) {
  const statusColors = {
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    error: 'text-red-400',
  };

  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[11px] text-white/50">{label}</span>
      <div className="flex items-center gap-2">
        {subValue && (
          <span className="text-[10px] text-white/30">{subValue}</span>
        )}
        <span
          className={`text-[11px] font-medium ${
            status ? statusColors[status] : 'text-white/80'
          }`}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

function FailureList({
  failures,
  maxShow = 5,
}: {
  failures: { reason: string; count?: number }[];
  maxShow?: number;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of failures) {
      const count = f.count || 1;
      map.set(f.reason, (map.get(f.reason) || 0) + count);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxShow);
  }, [failures, maxShow]);

  if (grouped.length === 0) {
    return (
      <div className="flex items-center gap-2 text-emerald-400/70 text-[11px]">
        <CheckCircle size={12} />
        <span>No failures</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {grouped.map(([reason, count], i) => (
        <div
          key={i}
          className="flex items-start gap-2 text-[11px] text-white/60"
        >
          <XCircle size={11} className="text-red-400/70 mt-0.5 shrink-0" />
          <span className="flex-1 leading-tight">{reason}</span>
          <span className="text-white/30 shrink-0">×{count}</span>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

// =============================================================================
// REDACTION HELPER
// =============================================================================

const REDACT_KEYS = [
  'apifyToken',
  'apolloApiKey',
  'anymailApiKey',
  'instantlyApiKey',
  'openaiApiKey',
  'azureApiKey',
  'claudeApiKey',
  'apiKey',
  'token',
  'secret',
  'password',
];

function redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Check if key should be redacted
    const shouldRedact = REDACT_KEYS.some(
      (redactKey) => key.toLowerCase().includes(redactKey.toLowerCase())
    );

    if (shouldRedact && typeof value === 'string' && value.length > 0) {
      // Show first 4 and last 4 chars
      if (value.length > 12) {
        result[key] = `${value.slice(0, 4)}...${value.slice(-4)} [REDACTED]`;
      } else {
        result[key] = '[REDACTED]';
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactSensitive(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

// =============================================================================
// HEALTH STATUS CALCULATOR
// =============================================================================

type HealthStatus = 'healthy' | 'degraded' | 'critical';

function calculateHealthStatus(data: RunAuditData): {
  status: HealthStatus;
  message: string;
} {
  const totalFailures =
    data.demandValidationFailures.length +
    data.supplyValidationFailures.length +
    data.copyValidationFailures.filter((v) => !v.valid).length;

  const skipRate =
    data.matchedCount > 0
      ? data.skippedReasons.reduce((sum, r) => sum + r.count, 0) / data.matchedCount
      : 0;

  const enrichRate =
    data.matchedCount > 0 ? data.enrichedCount / data.matchedCount : 0;

  // Critical: No sends, high failure rate, or very low enrichment
  if (data.sentCount === 0 && data.matchedCount > 0) {
    return { status: 'critical', message: 'No contacts routed' };
  }
  if (totalFailures > 10) {
    return { status: 'critical', message: `${totalFailures} validation failures` };
  }
  if (enrichRate < 0.3 && data.matchedCount > 5) {
    return { status: 'critical', message: 'Low enrichment rate' };
  }

  // Degraded: Some failures or moderate skip rate
  if (totalFailures > 0) {
    return { status: 'degraded', message: `${totalFailures} issues detected` };
  }
  if (skipRate > 0.2) {
    return { status: 'degraded', message: 'High skip rate' };
  }

  // Healthy
  return { status: 'healthy', message: 'All systems nominal' };
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function RunAuditPanel({ data, className = '' }: RunAuditPanelProps) {
  const [copied, setCopied] = useState(false);
  const contract = getModeContract(data.mode);

  const totalFailures =
    data.demandValidationFailures.length +
    data.supplyValidationFailures.length +
    data.copyValidationFailures.filter((v) => !v.valid).length;

  const duration = data.runCompletedAt
    ? Math.round(
        (data.runCompletedAt.getTime() - data.runStartedAt.getTime()) / 1000
      )
    : null;

  const healthStatus = useMemo(() => calculateHealthStatus(data), [data]);

  // Basic export (no sensitive data)
  const handleExportJson = () => {
    const exportData = {
      mode: data.mode,
      modeLabel: contract.label,
      registryVersion: data.registryVersion,
      counts: {
        demand: data.demandCount,
        supply: data.supplyCount,
        enriched: data.enrichedCount,
        matched: data.matchedCount,
        sent: data.sentCount,
      },
      failures: {
        demand: data.demandValidationFailures,
        supply: data.supplyValidationFailures,
        copy: data.copyValidationFailures.filter((v) => !v.valid),
      },
      skipped: data.skippedReasons,
      timing: {
        startedAt: data.runStartedAt.toISOString(),
        completedAt: data.runCompletedAt?.toISOString(),
        durationSeconds: duration,
      },
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `run-audit-${data.mode}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Debug bundle export (with redacted sensitive data)
  const handleExportDebugBundle = () => {
    const debugBundle = {
      _notice: 'SENSITIVE DATA HAS BEEN REDACTED. Safe to share with support.',
      _generatedAt: new Date().toISOString(),

      // Run info
      run: {
        mode: data.mode,
        modeLabel: contract.label,
        registryVersion: data.registryVersion,
        healthStatus: healthStatus.status,
        healthMessage: healthStatus.message,
      },

      // Counts
      counts: {
        demandLoaded: data.demandCount,
        supplyLoaded: data.supplyCount,
        matched: data.matchedCount,
        enriched: data.enrichedCount,
        sent: data.sentCount,
        payloadSize: data.instantlyPayloadSize,
      },

      // Failures (detailed)
      failures: {
        total: totalFailures,
        demand: data.demandValidationFailures,
        supply: data.supplyValidationFailures,
        copy: data.copyValidationFailures
          .filter((v) => !v.valid)
          .map((v) => ({
            errors: v.errors,
            warnings: v.warnings,
            mode: v.mode,
            side: v.side,
          })),
      },

      // Skipped reasons
      skipped: data.skippedReasons,

      // Timing
      timing: {
        startedAt: data.runStartedAt.toISOString(),
        completedAt: data.runCompletedAt?.toISOString(),
        durationSeconds: duration,
      },

      // Debug context (redacted)
      config: data.debugContext
        ? redactSensitive(data.debugContext as Record<string, unknown>)
        : null,

      // Environment
      environment: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        timestamp: new Date().toISOString(),
      },
    };

    const blob = new Blob([JSON.stringify(debugBundle, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-bundle-${data.mode}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Copy summary to clipboard
  const handleCopySummary = () => {
    const summary = `Run Audit Summary
Mode: ${contract.label} (v${data.registryVersion})
Status: ${healthStatus.status.toUpperCase()} - ${healthStatus.message}

Counts:
- Demand: ${data.demandCount}
- Supply: ${data.supplyCount}
- Matched: ${data.matchedCount}
- Enriched: ${data.enrichedCount}
- Sent: ${data.sentCount}

Failures: ${totalFailures}
Duration: ${duration ? `${duration}s` : 'in progress'}
`;

    navigator.clipboard.writeText(summary).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Health status colors
  const healthColors = {
    healthy: {
      bg: 'bg-emerald-500/[0.08]',
      border: 'border-emerald-500/20',
      text: 'text-emerald-400',
      icon: <CheckCircle size={14} className="text-emerald-400" />,
    },
    degraded: {
      bg: 'bg-amber-500/[0.08]',
      border: 'border-amber-500/20',
      text: 'text-amber-400',
      icon: <AlertTriangle size={14} className="text-amber-400" />,
    },
    critical: {
      bg: 'bg-red-500/[0.08]',
      border: 'border-red-500/20',
      text: 'text-red-400',
      icon: <XCircle size={14} className="text-red-400" />,
    },
  };

  const statusStyle = healthColors[healthStatus.status];

  return (
    <div
      className={`bg-[#0A0A0A] border border-white/[0.06] rounded-xl overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-white/50" />
          <span className="text-xs font-medium text-white/80">Run Audit</span>
          <span className="text-[10px] text-white/30 font-mono">
            v{data.registryVersion}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Copy summary */}
          <button
            onClick={handleCopySummary}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] transition-colors text-white/60 hover:text-white/80"
            title="Copy summary to clipboard"
          >
            <Copy size={11} />
            <span className="text-[10px]">{copied ? 'Copied!' : 'Copy'}</span>
          </button>
          {/* Basic export */}
          <button
            onClick={handleExportJson}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] transition-colors text-white/60 hover:text-white/80"
            title="Export audit JSON"
          >
            <FileJson size={11} />
            <span className="text-[10px]">Export</span>
          </button>
          {/* Debug bundle */}
          <button
            onClick={handleExportDebugBundle}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] transition-colors text-white/60 hover:text-white/80"
            title="Export debug bundle (safe to share - sensitive data redacted)"
          >
            <Bug size={11} />
            <span className="text-[10px]">Debug</span>
          </button>
        </div>
      </div>

      {/* Summary Section — Health Status */}
      <div className={`px-3 py-3 border-b border-white/[0.06] ${statusStyle.bg}`}>
        <div className="flex items-center gap-2 mb-2">
          {statusStyle.icon}
          <span className={`text-xs font-medium ${statusStyle.text}`}>
            {healthStatus.status.charAt(0).toUpperCase() + healthStatus.status.slice(1)}
          </span>
          <span className="text-[11px] text-white/50">
            {healthStatus.message}
          </span>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <div className="flex items-center gap-1">
            <span className="text-white/40">Mode:</span>
            <span className="text-white/70 font-medium">{contract.label}</span>
          </div>
          {duration !== null && (
            <div className="flex items-center gap-1">
              <span className="text-white/40">Duration:</span>
              <span className="text-white/60">{duration}s</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <span className="text-white/40">Sent:</span>
            <span className={data.sentCount > 0 ? 'text-emerald-400' : 'text-white/60'}>
              {data.sentCount}
            </span>
          </div>
        </div>
      </div>

      {/* Counts Section */}
      <Section title="Counts" icon={Activity} defaultOpen={true}>
        <StatRow label="Demand loaded" value={data.demandCount} />
        <StatRow label="Supply loaded" value={data.supplyCount} />
        <StatRow
          label="Matched"
          value={data.matchedCount}
          status={data.matchedCount > 0 ? 'success' : 'warning'}
        />
        <StatRow label="Enriched" value={data.enrichedCount} />
        <StatRow
          label="Sent"
          value={data.sentCount}
          subValue={`of ${data.instantlyPayloadSize}`}
          status={data.sentCount > 0 ? 'success' : undefined}
        />
      </Section>

      {/* Validation Failures */}
      <Section
        title="Validation Failures"
        icon={AlertTriangle}
        defaultOpen={totalFailures > 0}
        badge={totalFailures}
        badgeColor={totalFailures > 0 ? 'red' : 'emerald'}
      >
        {data.demandValidationFailures.length > 0 && (
          <div className="mb-2">
            <div className="text-[10px] text-white/40 mb-1 uppercase tracking-wide">
              Demand
            </div>
            <FailureList failures={data.demandValidationFailures} />
          </div>
        )}

        {data.supplyValidationFailures.length > 0 && (
          <div className="mb-2">
            <div className="text-[10px] text-white/40 mb-1 uppercase tracking-wide">
              Supply
            </div>
            <FailureList failures={data.supplyValidationFailures} />
          </div>
        )}

        {data.copyValidationFailures.filter((v) => !v.valid).length > 0 && (
          <div>
            <div className="text-[10px] text-white/40 mb-1 uppercase tracking-wide">
              Copy
            </div>
            <FailureList
              failures={data.copyValidationFailures
                .filter((v) => !v.valid)
                .flatMap((v) => v.errors.map((e) => ({ reason: e })))}
            />
          </div>
        )}

        {totalFailures === 0 && (
          <div className="flex items-center gap-2 text-emerald-400/70 text-[11px]">
            <CheckCircle size={12} />
            <span>All validations passed</span>
          </div>
        )}
      </Section>

      {/* Skipped Reasons */}
      {data.skippedReasons.length > 0 && (
        <Section
          title="Skipped"
          icon={XCircle}
          defaultOpen={false}
          badge={data.skippedReasons.reduce((sum, r) => sum + r.count, 0)}
          badgeColor="amber"
        >
          <FailureList
            failures={data.skippedReasons.map((r) => ({
              reason: r.reason,
              count: r.count,
            }))}
          />
        </Section>
      )}
    </div>
  );
}

// =============================================================================
// EMPTY STATE BUILDER
// =============================================================================

export function createEmptyAuditData(mode: ConnectorMode): RunAuditData {
  return {
    mode,
    registryVersion: MODE_REGISTRY_VERSION,
    demandCount: 0,
    supplyCount: 0,
    enrichedCount: 0,
    matchedCount: 0,
    demandValidationFailures: [],
    supplyValidationFailures: [],
    copyValidationFailures: [],
    instantlyPayloadSize: 0,
    sentCount: 0,
    skippedReasons: [],
    runStartedAt: new Date(),
  };
}

export default RunAuditPanel;
