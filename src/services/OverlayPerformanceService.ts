/**
 * OVERLAY PERFORMANCE SERVICE
 *
 * Queries intro_learning_by_overlay view and builds performance snapshots.
 * Groups by overlay_hash (config truth). Version number is display label only.
 *
 * Activation window filtering is CLIENT-SIDE — DB can't see localStorage
 * timestamps. buildPerformanceSnapshot() accepts optional activationWindows
 * and filters intros by created_at within each version's active window.
 */

import { supabase } from '../lib/supabase';
import type { OverlayIntroRow } from './IntroductionsService';
import { getIntrosForOverlayAnalysis } from './IntroductionsService';

// ============================================================================
// TYPES
// ============================================================================

export interface OverlayVersionPerformance {
  overlayClientId: string;
  overlayClientName: string | null;
  overlayHash: string;
  overlayVersion: number;
  totalSent: number;
  totalReplied: number;
  totalMeetings: number;
  totalWon: number;
  totalDealValue: number;
  avgDealValue: number;
  replyRatePct: number;
  meetingRatePct: number;
  winRatePct: number;
}

export interface ActivationWindow {
  activatedAt?: string;   // ISO
  deactivatedAt?: string; // ISO
}

export interface PerformanceSnapshot {
  versions: OverlayVersionPerformance[];
  bestVersion: OverlayVersionPerformance | null;
  worstVersion: OverlayVersionPerformance | null;
  trend: 'improving' | 'declining' | 'stable' | 'insufficient';
}

const REPLIED_STATUSES = new Set(['replied', 'meeting', 'closed_won', 'closed_lost']);
const MEETING_STATUSES = new Set(['meeting', 'closed_won']);

// ============================================================================
// DB VIEW QUERY (all-time fallback)
// ============================================================================

export async function getOverlayPerformance(
  operatorId: string,
  clientId?: string
): Promise<OverlayVersionPerformance[]> {
  try {
    let query = supabase
      .from('intro_learning_by_overlay')
      .select('*')
      .eq('operator_id', operatorId);

    if (clientId) {
      query = query.eq('overlay_client_id', clientId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[OverlayPerformance] Failed to query view:', error);
      return [];
    }

    return (data || []).map(row => ({
      overlayClientId: row.overlay_client_id,
      overlayClientName: row.overlay_client_name,
      overlayHash: row.overlay_hash,
      overlayVersion: row.overlay_version,
      totalSent: row.total_sent,
      totalReplied: row.total_replied,
      totalMeetings: row.total_meetings,
      totalWon: row.total_won,
      totalDealValue: Number(row.total_deal_value),
      avgDealValue: Number(row.avg_deal_value),
      replyRatePct: Number(row.reply_rate_pct),
      meetingRatePct: Number(row.meeting_rate_pct),
      winRatePct: Number(row.win_rate_pct),
    }));

  } catch (err) {
    console.error('[OverlayPerformance] Error:', err);
    return [];
  }
}

// ============================================================================
// SNAPSHOT BUILDER (with optional activation window filtering)
// ============================================================================

function computeRatesFromIntros(
  intros: OverlayIntroRow[],
  hash: string,
  window?: ActivationWindow
): OverlayVersionPerformance | null {
  let filtered = intros.filter(i => i.overlayHash === hash);

  if (window) {
    filtered = filtered.filter(i => {
      const t = new Date(i.createdAt).getTime();
      if (window.activatedAt && t < new Date(window.activatedAt).getTime()) return false;
      if (window.deactivatedAt && t > new Date(window.deactivatedAt).getTime()) return false;
      return true;
    });
  }

  if (filtered.length < 5) return null;

  const totalSent = filtered.length;
  const totalReplied = filtered.filter(i => REPLIED_STATUSES.has(i.status)).length;
  const totalMeetings = filtered.filter(i => MEETING_STATUSES.has(i.status)).length;
  const totalWon = filtered.filter(i => i.status === 'closed_won').length;
  const wonValues = filtered.filter(i => i.status === 'closed_won' && i.dealValue).map(i => i.dealValue!);
  const totalDealValue = wonValues.reduce((s, v) => s + v, 0);
  const avgDealValue = wonValues.length > 0 ? totalDealValue / wonValues.length : 0;

  return {
    overlayClientId: '',
    overlayClientName: null,
    overlayHash: hash,
    overlayVersion: Math.max(...filtered.map(i => i.overlayVersion || 0)),
    totalSent,
    totalReplied,
    totalMeetings,
    totalWon,
    totalDealValue,
    avgDealValue,
    replyRatePct: Math.round(totalReplied / totalSent * 1000) / 10,
    meetingRatePct: Math.round(totalMeetings / totalSent * 1000) / 10,
    winRatePct: Math.round(totalWon / totalSent * 1000) / 10,
  };
}

export async function buildPerformanceSnapshot(
  operatorId: string,
  clientId: string,
  clientName: string,
  hashes: string[],
  activationWindows?: Record<string, ActivationWindow>
): Promise<PerformanceSnapshot> {
  const insufficient: PerformanceSnapshot = {
    versions: [],
    bestVersion: null,
    worstVersion: null,
    trend: 'insufficient',
  };

  if (hashes.length === 0) return insufficient;

  // If activation windows provided, use raw intros + client-side filtering
  if (activationWindows) {
    const intros = await getIntrosForOverlayAnalysis(operatorId, clientId);
    if (intros.length === 0) return insufficient;

    const versions: OverlayVersionPerformance[] = [];
    for (const hash of hashes) {
      const perf = computeRatesFromIntros(intros, hash, activationWindows[hash]);
      if (perf) {
        perf.overlayClientId = clientId;
        perf.overlayClientName = clientName;
        versions.push(perf);
      }
    }

    return buildFromVersions(versions);
  }

  // Fallback: use DB view (all-time aggregation)
  const allPerf = await getOverlayPerformance(operatorId, clientId);
  const versions = allPerf.filter(p => hashes.includes(p.overlayHash));
  return buildFromVersions(versions);
}

function buildFromVersions(versions: OverlayVersionPerformance[]): PerformanceSnapshot {
  if (versions.length === 0) {
    return { versions, bestVersion: null, worstVersion: null, trend: 'insufficient' };
  }

  // Sort by version desc for display
  versions.sort((a, b) => b.overlayVersion - a.overlayVersion);

  // Best/worst by reply rate (minimum 5 samples enforced upstream)
  const qualified = versions.filter(v => v.totalSent >= 5);
  const bestVersion = qualified.length > 0
    ? qualified.reduce((best, v) => v.replyRatePct > best.replyRatePct ? v : best)
    : null;
  const worstVersion = qualified.length > 0
    ? qualified.reduce((worst, v) => v.replyRatePct < worst.replyRatePct ? v : worst)
    : null;

  // Trend: compare last 2 qualified versions
  let trend: 'improving' | 'declining' | 'stable' | 'insufficient' = 'insufficient';
  if (qualified.length >= 2) {
    const delta = qualified[0].replyRatePct - qualified[1].replyRatePct;
    if (delta > 2) trend = 'improving';
    else if (delta < -2) trend = 'declining';
    else trend = 'stable';
  }

  return { versions, bestVersion, worstVersion, trend };
}
