/**
 * EVALUATION QUALITY FEEDBACK LOOP — Phase 26
 *
 * Read-only diagnostics: do outcomes validate evaluation calibration?
 * Pure computation. No mutation. No persistence. No APIs.
 */

import type { Evaluation } from '../evaluation/Evaluation';

interface IntroEntryLike {
  sentAt?: string;
  usedAIFraming?: boolean;
  outcomeType?: 'replied' | 'no_response' | 'meeting_booked' | 'declined';
  replyLatencyMs?: number;
  evaluationId?: string;
}

export interface BucketStats {
  sent: number;
  replies: number;
  replyRate: number;
}

export interface EvaluationQualityReport {
  totalEvaluations: number;
  approvedRate: number;
  consumedRate: number;
  replyRate: number;
  meetingRate: number;

  readinessBreakdown: Record<string, BucketStats>;
  tierBreakdown: Record<string, BucketStats>;

  confidenceBuckets: {
    low: BucketStats;
    mid: BucketStats;
    high: BucketStats;
  };
}

function rate(num: number, denom: number): number {
  return denom > 0 ? num / denom : 0;
}

function isReply(outcome: string | undefined): boolean {
  return outcome === 'replied' || outcome === 'meeting_booked';
}

function bucket(stats: { sent: number; replies: number }): BucketStats {
  return { sent: stats.sent, replies: stats.replies, replyRate: rate(stats.replies, stats.sent) };
}

export function computeEvaluationQuality(
  demandIntros: Map<string, IntroEntryLike>,
  supplyIntros: Map<string, IntroEntryLike>,
  evaluations: Evaluation[],
): EvaluationQualityReport {
  const totalEvaluations = evaluations.length;
  const approved = evaluations.filter(e => e.status !== 'proposed' && e.status !== 'skipped').length;
  const consumed = evaluations.filter(e => e.status === 'consumed' || e.status === 'scored').length;

  // Build eval lookup
  const evalById = new Map<string, Evaluation>();
  for (const ev of evaluations) evalById.set(ev.id, ev);

  // Collect sent intros with evaluation cross-ref
  interface Row {
    replied: boolean;
    meeting: boolean;
    readiness: string;
    tier: string;
    confidenceAI?: number;
  }

  const rows: Row[] = [];

  const process = (entries: Map<string, IntroEntryLike>) => {
    for (const entry of entries.values()) {
      if (!entry.sentAt) continue;
      if (!entry.evaluationId) continue;
      const ev = evalById.get(entry.evaluationId);
      if (!ev) continue;

      rows.push({
        replied: isReply(entry.outcomeType),
        meeting: entry.outcomeType === 'meeting_booked',
        readiness: ev.scores.readiness,
        tier: ev.reasoning.tier,
        confidenceAI: ev.ai?.confidence_ai ?? undefined,
      });
    }
  };

  process(demandIntros);
  process(supplyIntros);

  const totalSent = rows.length;
  const totalReplies = rows.filter(r => r.replied).length;
  const totalMeetings = rows.filter(r => r.meeting).length;

  // Readiness breakdown
  const readinessGroups = new Map<string, { sent: number; replies: number }>();
  for (const r of rows) {
    const g = readinessGroups.get(r.readiness) || { sent: 0, replies: 0 };
    g.sent++;
    if (r.replied) g.replies++;
    readinessGroups.set(r.readiness, g);
  }
  const readinessBreakdown: Record<string, BucketStats> = {};
  for (const [key, stats] of readinessGroups) {
    readinessBreakdown[key] = bucket(stats);
  }

  // Tier breakdown
  const tierGroups = new Map<string, { sent: number; replies: number }>();
  for (const r of rows) {
    const g = tierGroups.get(r.tier) || { sent: 0, replies: 0 };
    g.sent++;
    if (r.replied) g.replies++;
    tierGroups.set(r.tier, g);
  }
  const tierBreakdown: Record<string, BucketStats> = {};
  for (const [key, stats] of tierGroups) {
    tierBreakdown[key] = bucket(stats);
  }

  // Confidence buckets (ignore missing)
  const confLow = { sent: 0, replies: 0 };
  const confMid = { sent: 0, replies: 0 };
  const confHigh = { sent: 0, replies: 0 };

  for (const r of rows) {
    if (r.confidenceAI == null) continue;
    const target = r.confidenceAI < 0.5 ? confLow : r.confidenceAI <= 0.75 ? confMid : confHigh;
    target.sent++;
    if (r.replied) target.replies++;
  }

  return {
    totalEvaluations,
    approvedRate: rate(approved, totalEvaluations),
    consumedRate: rate(consumed, totalEvaluations),
    replyRate: rate(totalReplies, totalSent),
    meetingRate: rate(totalMeetings, totalSent),
    readinessBreakdown,
    tierBreakdown,
    confidenceBuckets: {
      low: bucket(confLow),
      mid: bucket(confMid),
      high: bucket(confHigh),
    },
  };
}
