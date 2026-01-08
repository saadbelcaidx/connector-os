/**
 * Sentry Frontend Integration (OUROBOROS v2)
 *
 * Captures errors with PII-safe breadcrumbs.
 * NO raw pastedReply, NO API keys in logs.
 */

import * as Sentry from '@sentry/react';

// Hash function for safe logging (no PII)
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).substring(0, 8);
}

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    console.log('[Sentry] No DSN configured, skipping init');
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE || 'development',
    release: import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA || 'local',

    // Performance
    tracesSampleRate: 0.1, // 10% of transactions
    replaysSessionSampleRate: 0.0, // No session replays
    replaysOnErrorSampleRate: 0.1, // 10% replay on error

    // Sanitize breadcrumbs - NO PII
    beforeBreadcrumb(breadcrumb) {
      // Remove any sensitive data from fetch breadcrumbs
      if (breadcrumb.category === 'fetch' && breadcrumb.data) {
        // Mask API keys in URLs
        if (breadcrumb.data.url) {
          breadcrumb.data.url = breadcrumb.data.url
            .replace(/apikey=[^&]+/gi, 'apikey=[REDACTED]')
            .replace(/api_key=[^&]+/gi, 'api_key=[REDACTED]');
        }
        // Don't log request/response bodies
        delete breadcrumb.data.request_body;
        delete breadcrumb.data.response_body;
      }
      return breadcrumb;
    },

    // Sanitize events - NO PII
    beforeSend(event) {
      // Remove any potential PII from error messages
      if (event.message) {
        event.message = event.message
          .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
          .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]');
      }

      // Sanitize breadcrumb data
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map(bc => {
          if (bc.data?.pastedReply) {
            bc.data.pastedReply = '[REDACTED]';
          }
          if (bc.data?.apiKey) {
            bc.data.apiKey = '[REDACTED]';
          }
          return bc;
        });
      }

      return event;
    },

    // Ignore common non-errors
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured',
      /Loading chunk \d+ failed/,
    ],
  });

  console.log('[Sentry] Initialized');
}

/**
 * Capture Reply Brain context safely (no PII)
 */
export function captureReplyBrainBreadcrumb(data: {
  stagePrimary: string;
  stageSecondary?: string[];
  runtimeMode: 'guest' | 'auth';
  version: string;
  inputHash?: string;
  replyHash?: string;
  anchorQuality?: string;
  pricingOverride?: boolean;
}) {
  Sentry.addBreadcrumb({
    category: 'reply-brain',
    message: `Stage: ${data.stagePrimary}`,
    level: 'info',
    data: {
      stagePrimary: data.stagePrimary,
      stageSecondary: data.stageSecondary?.join(',') || '',
      runtimeMode: data.runtimeMode,
      version: data.version,
      inputHash: data.inputHash || '',
      replyHash: data.replyHash || '',
      anchorQuality: data.anchorQuality || '',
      pricingOverride: data.pricingOverride || false,
    },
  });
}

/**
 * Generate safe hash for logging (no raw text)
 */
export function safeHash(text: string): string {
  return hashString(text);
}

/**
 * Capture error with safe context
 */
export function captureError(error: Error, context?: Record<string, unknown>) {
  Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Capture drift alert event (DIRECT KNOWING Cosmic Level)
 */
export function captureDriftAlert(alert: {
  metric: string;
  threshold: number;
  actual: number;
  baseline: number;
  rollbackTriggered?: boolean;
}) {
  Sentry.captureMessage(`Drift Alert: ${alert.metric}`, {
    level: alert.rollbackTriggered ? 'error' : 'warning',
    tags: {
      metric: alert.metric,
      rollback: alert.rollbackTriggered ? 'yes' : 'no',
    },
    extra: {
      threshold: alert.threshold,
      actual: alert.actual,
      baseline: alert.baseline,
      delta: alert.actual - alert.baseline,
    },
  });
}

/**
 * Capture forbidden hit spike (auto-rollback trigger)
 */
export function captureForbiddenHitSpike(data: {
  rate: number;
  threshold: number;
  version: string;
}) {
  Sentry.captureMessage(`CRITICAL: Forbidden hit spike - auto-rollback triggered`, {
    level: 'error',
    tags: {
      alert_type: 'forbidden_hit_spike',
      version: data.version,
    },
    extra: {
      rate_percent: data.rate.toFixed(3),
      threshold_percent: data.threshold.toFixed(3),
    },
  });
}

/**
 * Capture rollback event
 */
export function captureRollback(data: {
  fromVersion: string;
  toVersion: string;
  reason: string;
}) {
  Sentry.captureMessage(`ROLLBACK: ${data.fromVersion} → ${data.toVersion}`, {
    level: 'warning',
    tags: {
      alert_type: 'rollback',
      from_version: data.fromVersion,
      to_version: data.toVersion,
    },
    extra: {
      reason: data.reason,
    },
  });
}

// Re-export Sentry for ErrorBoundary usage
export { Sentry };
