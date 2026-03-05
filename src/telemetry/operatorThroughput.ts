/**
 * OPERATOR THROUGHPUT ANALYTICS — Phase 28
 *
 * Measures how fast operators convert evaluations → revenue actions.
 * Pure derived computation. No mutation. No persistence. No APIs.
 */

import type { Evaluation } from '../evaluation/Evaluation';

interface IntroEntryLike {
  sentAt?: string;
  outcomeType?: 'replied' | 'no_response' | 'meeting_booked' | 'declined';
  outcomeAt?: string;
  evaluationId?: string;
}

export interface OperatorThroughputReport {
  totals: {
    proposed: number;
    approved: number;
    consumed: number;
    replied: number;
    meetings: number;
  };

  rates: {
    approvalRate: number;
    sendRate: number;
    replyRate: number;
    meetingRate: number;
  };

  timing: {
    medianApprovalMinutes: number | null;
    medianSendMinutes: number | null;
    medianReplyMinutes: number | null;
  };
}

function rate(num: number, denom: number): number {
  return denom > 0 ? num / denom : 0;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function minutesBetween(isoA: string, isoB: string): number | null {
  const a = Date.parse(isoA);
  const b = Date.parse(isoB);
  if (isNaN(a) || isNaN(b)) return null;
  const diff = b - a;
  if (diff < 0) return null;
  return diff / 60000;
}

export function computeOperatorThroughput(
  demandIntros: Map<string, IntroEntryLike>,
  supplyIntros: Map<string, IntroEntryLike>,
  evaluations: Evaluation[],
): OperatorThroughputReport {
  // Funnel counts from evaluation status
  const proposed = evaluations.length;
  const approved = evaluations.filter(e =>
    e.status === 'approved' || e.status === 'consumed' || e.status === 'scored'
  ).length;
  const consumed = evaluations.filter(e =>
    e.status === 'consumed' || e.status === 'scored'
  ).length;

  // Build eval lookup for timing
  const evalById = new Map<string, Evaluation>();
  for (const ev of evaluations) evalById.set(ev.id, ev);

  // Collect intro outcomes
  let replied = 0;
  let meetings = 0;

  const approvalTimes: number[] = [];
  const sendTimes: number[] = [];
  const replyTimes: number[] = [];

  const process = (entries: Map<string, IntroEntryLike>) => {
    for (const entry of entries.values()) {
      if (!entry.sentAt) continue;
      if (!entry.evaluationId) continue;
      const ev = evalById.get(entry.evaluationId);
      if (!ev) continue;

      const isReply = entry.outcomeType === 'replied' || entry.outcomeType === 'meeting_booked';
      if (isReply) replied++;
      if (entry.outcomeType === 'meeting_booked') meetings++;

      // Reply time: outcomeAt - sentAt
      if (isReply && entry.outcomeAt) {
        const mins = minutesBetween(entry.sentAt, entry.outcomeAt);
        if (mins != null) replyTimes.push(mins);
      }
    }
  };

  process(demandIntros);
  process(supplyIntros);

  // Approval times: updated_at - created_at for approved+ evaluations
  for (const ev of evaluations) {
    if (ev.status === 'proposed' || ev.status === 'skipped') continue;
    const mins = minutesBetween(ev.created_at, ev.updated_at);
    if (mins != null) approvalTimes.push(mins);
  }

  // Send times: sentAt - evaluation.updated_at (approval timestamp)
  const allIntros = [...demandIntros.values(), ...supplyIntros.values()];
  for (const entry of allIntros) {
    if (!entry.sentAt || !entry.evaluationId) continue;
    const ev = evalById.get(entry.evaluationId);
    if (!ev || ev.status === 'proposed' || ev.status === 'skipped') continue;
    const mins = minutesBetween(ev.updated_at, entry.sentAt);
    if (mins != null) sendTimes.push(mins);
  }

  return {
    totals: { proposed, approved, consumed, replied, meetings },
    rates: {
      approvalRate: rate(approved, proposed),
      sendRate: rate(consumed, approved),
      replyRate: rate(replied, consumed),
      meetingRate: rate(meetings, consumed),
    },
    timing: {
      medianApprovalMinutes: median(approvalTimes),
      medianSendMinutes: median(sendTimes),
      medianReplyMinutes: median(replyTimes),
    },
  };
}
