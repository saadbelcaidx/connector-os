/**
 * SEGMENT LIFT — Phase 25
 *
 * Measures AI lift per signal segment (edge_type) using existing telemetry.
 * Pure derived computation. No mutation. No persistence. No APIs.
 */

import type { Evaluation } from '../evaluation/Evaluation';

interface IntroEntryLike {
  sentAt?: string;
  usedAIFraming?: boolean;
  outcomeType?: 'replied' | 'no_response' | 'meeting_booked' | 'declined';
  replyLatencyMs?: number;
  evaluationId?: string;
}

export interface SegmentLift {
  segment: string;
  totalSent: number;
  replies: number;
  replyRate: number;
  aiReplyRate: number;
  nonAiReplyRate: number;
  lift: number;
  avgLatencyMs?: number;
  avgConfidenceAI?: number;
}

function isReply(outcome: string | undefined): boolean {
  return outcome === 'replied' || outcome === 'meeting_booked';
}

function rate(num: number, denom: number): number {
  return denom > 0 ? num / denom : 0;
}

function avg(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function computeSegmentLift(
  demandIntros: Map<string, IntroEntryLike>,
  supplyIntros: Map<string, IntroEntryLike>,
  evaluations: Evaluation[],
): SegmentLift[] {
  // Build evaluation lookup
  const evalById = new Map<string, Evaluation>();
  for (const ev of evaluations) {
    evalById.set(ev.id, ev);
  }

  // Collect all sent entries with their segment
  interface Row {
    segment: string;
    usedAI: boolean;
    replied: boolean;
    latencyMs?: number;
    confidenceAI?: number;
  }

  const rows: Row[] = [];

  const process = (entries: Map<string, IntroEntryLike>) => {
    for (const entry of entries.values()) {
      if (!entry.sentAt) continue;
      if (!entry.evaluationId) continue;
      const ev = evalById.get(entry.evaluationId);
      if (!ev) continue;

      const segment = ev.reasoning.edge_type || 'UNKNOWN';
      rows.push({
        segment,
        usedAI: entry.usedAIFraming === true,
        replied: isReply(entry.outcomeType),
        latencyMs: typeof entry.replyLatencyMs === 'number' ? entry.replyLatencyMs : undefined,
        confidenceAI: ev.ai?.confidence_ai ?? undefined,
      });
    }
  };

  process(demandIntros);
  process(supplyIntros);

  // Group by segment
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const arr = groups.get(row.segment);
    if (arr) arr.push(row);
    else groups.set(row.segment, [row]);
  }

  // Compute per segment (noise filter: totalSent >= 5)
  const results: SegmentLift[] = [];

  for (const [segment, segRows] of groups) {
    if (segRows.length < 5) continue;

    const totalSent = segRows.length;
    const replies = segRows.filter(r => r.replied).length;
    const replyRate = rate(replies, totalSent);

    const aiRows = segRows.filter(r => r.usedAI);
    const nonAiRows = segRows.filter(r => !r.usedAI);

    const aiReplies = aiRows.filter(r => r.replied).length;
    const nonAiReplies = nonAiRows.filter(r => r.replied).length;

    const aiReplyRate = rate(aiReplies, aiRows.length);
    const nonAiReplyRate = rate(nonAiReplies, nonAiRows.length);

    const latencies = segRows
      .filter(r => r.replied && r.latencyMs != null)
      .map(r => r.latencyMs!);

    const confidences = segRows
      .filter(r => r.confidenceAI != null)
      .map(r => r.confidenceAI!);

    results.push({
      segment,
      totalSent,
      replies,
      replyRate,
      aiReplyRate,
      nonAiReplyRate,
      lift: aiReplyRate - nonAiReplyRate,
      avgLatencyMs: avg(latencies),
      avgConfidenceAI: avg(confidences),
    });
  }

  // Sort by totalSent descending
  results.sort((a, b) => b.totalSent - a.totalSent);

  return results;
}
