/**
 * CsvIntroQualityBadge.tsx — CSV Intro Quality Indicator
 *
 * CSV Phase 3: Visual badge showing intro quality tier.
 *
 * BADGE MAPPING:
 * - T1 → BASIC (yellow/amber) — Warning, generic intro
 * - T2 → STANDARD (blue) — Good quality
 * - T3 → RICH (green/emerald) — Best quality
 *
 * INVARIANT: Users always see intro quality before sending.
 */

import { AlertTriangle, Check, Star } from 'lucide-react';
import type { CsvSignalTier } from '../intro-generation/csvSignalTier';

// =============================================================================
// TYPES
// =============================================================================

interface CsvIntroQualityBadgeProps {
  tier: CsvSignalTier;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

interface CsvBatchQualityWarningProps {
  t1Count: number;
  t2Count: number;
  t3Count: number;
  totalCsv: number;
}

// =============================================================================
// BADGE COMPONENT
// =============================================================================

/**
 * Single record quality badge.
 *
 * T1 → ⚠️ BASIC (yellow)
 * T2 → ✅ STANDARD (blue)
 * T3 → ⭐ RICH (green)
 */
export function CsvIntroQualityBadge({
  tier,
  showLabel = true,
  size = 'sm',
}: CsvIntroQualityBadgeProps) {
  const iconSize = size === 'sm' ? 12 : 14;
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs';
  const padding = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-1';

  switch (tier) {
    case 'T1':
      return (
        <span
          className={`
            inline-flex items-center gap-1 ${padding} rounded-md
            bg-amber-500/[0.12] border border-amber-500/[0.2]
            ${textSize} font-medium text-amber-400
          `}
          title="Basic intro — limited personalization due to missing data"
        >
          <AlertTriangle size={iconSize} />
          {showLabel && 'BASIC'}
        </span>
      );

    case 'T2':
      return (
        <span
          className={`
            inline-flex items-center gap-1 ${padding} rounded-md
            bg-blue-500/[0.12] border border-blue-500/[0.2]
            ${textSize} font-medium text-blue-400
          `}
          title="Standard intro — good personalization"
        >
          <Check size={iconSize} />
          {showLabel && 'STANDARD'}
        </span>
      );

    case 'T3':
      return (
        <span
          className={`
            inline-flex items-center gap-1 ${padding} rounded-md
            bg-emerald-500/[0.12] border border-emerald-500/[0.2]
            ${textSize} font-medium text-emerald-400
          `}
          title="Rich intro — best personalization"
        >
          <Star size={iconSize} />
          {showLabel && 'RICH'}
        </span>
      );
  }
}

// =============================================================================
// BATCH WARNING COMPONENT
// =============================================================================

/**
 * Warning banner for CSV batch quality.
 *
 * Apple HIG: One title. One message. No suggestion line.
 *
 * PRIORITY ORDER:
 * 1. BLOCKING (t1Count > 0): Email missing — intros won't generate
 * 2. QUALITY (t2Count > 0): Context missing — intros will be basic
 * 3. All T3: No warning
 *
 * TIER REMINDER:
 * - T1 = no email (BLOCKING)
 * - T2 = email but no context (QUALITY)
 * - T3 = email + context (RICH)
 */
export function CsvBatchQualityWarning({
  t1Count,
  t2Count,
  t3Count,
  totalCsv,
}: CsvBatchQualityWarningProps) {
  // All T3 = no warning
  if (t1Count === 0 && t2Count === 0) {
    return null;
  }

  // BLOCKING: T1 records have no email — intros won't generate
  if (t1Count > 0) {
    return (
      <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/[0.06] border border-red-500/[0.12]">
        <div className="w-7 h-7 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
          <AlertTriangle size={14} className="text-red-400" />
        </div>
        <div className="space-y-1 flex-1">
          <p className="text-sm font-medium text-white/90">
            Email required
          </p>
          <p className="text-xs text-white/60">
            {t1Count} record{t1Count !== 1 ? 's' : ''} missing email — intros won't generate.
          </p>
        </div>
      </div>
    );
  }

  // QUALITY: T2 records have email but no context — intros will be basic
  if (t2Count > 0) {
    return (
      <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/[0.12]">
        <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
          <AlertTriangle size={14} className="text-amber-400" />
        </div>
        <div className="space-y-1 flex-1">
          <p className="text-sm font-medium text-white/90">
            Add descriptions for richer intros
          </p>
          <p className="text-xs text-white/60">
            {t2Count} record{t2Count !== 1 ? 's' : ''} {t2Count !== 1 ? 'have' : 'has'} basic intros.
          </p>
        </div>
      </div>
    );
  }

  return null;
}

// =============================================================================
// BATCH SUMMARY COMPONENT
// =============================================================================

/**
 * Compact quality summary for batch display.
 */
export function CsvBatchQualitySummary({
  t1Count,
  t2Count,
  t3Count,
  totalCsv,
}: CsvBatchQualityWarningProps) {
  if (totalCsv === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-white/40">CSV Quality:</span>
      {t3Count > 0 && (
        <span className="flex items-center gap-1 text-emerald-400">
          <Star size={10} />
          {t3Count}
        </span>
      )}
      {t2Count > 0 && (
        <span className="flex items-center gap-1 text-blue-400">
          <Check size={10} />
          {t2Count}
        </span>
      )}
      {t1Count > 0 && (
        <span className="flex items-center gap-1 text-amber-400">
          <AlertTriangle size={10} />
          {t1Count}
        </span>
      )}
    </div>
  );
}

export default CsvIntroQualityBadge;
