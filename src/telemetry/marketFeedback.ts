/**
 * MARKET FEEDBACK INTELLIGENCE — Phase 29
 *
 * Detects which market conditions actually produce replies.
 * Groups outcomes by edge_type, readiness, and tier.
 * Pure computation. No mutation. No persistence. No APIs.
 */

import type { Evaluation } from '../evaluation/Evaluation';

interface IntroEntryLike {
  sentAt?: string;
  outcomeType?: 'replied' | 'no_response' | 'meeting_booked' | 'declined';
  evaluationId?: string;
}

export interface EdgePerformance {
  edge_type: string;
  sent: number;
  replies: number;
  replyRate: number;
}

export interface ReadinessPerformance {
  readiness: 'READY' | 'WARMING' | 'NOT_YET';
  sent: number;
  replies: number;
  replyRate: number;
}

export interface TierPerformance {
  tier: 'A' | 'B' | 'C';
  sent: number;
  replies: number;
  replyRate: number;
}

export interface MarketFeedbackReport {
  edgePerformance: EdgePerformance[];
  readinessPerformance: ReadinessPerformance[];
  tierPerformance: TierPerformance[];
}

function isReply(outcome: string | undefined): boolean {
  return outcome === 'replied' || outcome === 'meeting_booked';
}

function rate(num: number, denom: number): number {
  return denom > 0 ? num / denom : 0;
}

export function computeMarketFeedback(
  demandIntros: Map<string, IntroEntryLike>,
  supplyIntros: Map<string, IntroEntryLike>,
  evaluations: Evaluation[],
): MarketFeedbackReport {
  const evalById = new Map<string, Evaluation>();
  for (const ev of evaluations) evalById.set(ev.id, ev);

  // Collect rows from sent intros
  interface Row {
    edge_type: string;
    readiness: string;
    tier: string;
    replied: boolean;
  }

  const rows: Row[] = [];

  const process = (entries: Map<string, IntroEntryLike>) => {
    for (const entry of entries.values()) {
      if (!entry.sentAt) continue;
      if (!entry.evaluationId) continue;
      const ev = evalById.get(entry.evaluationId);
      if (!ev) continue;

      rows.push({
        edge_type: ev.reasoning.edge_type || 'UNKNOWN',
        readiness: ev.scores.readiness,
        tier: ev.reasoning.tier,
        replied: isReply(entry.outcomeType),
      });
    }
  };

  process(demandIntros);
  process(supplyIntros);

  // Group by edge_type
  const edgeGroups = new Map<string, { sent: number; replies: number }>();
  for (const r of rows) {
    const g = edgeGroups.get(r.edge_type) || { sent: 0, replies: 0 };
    g.sent++;
    if (r.replied) g.replies++;
    edgeGroups.set(r.edge_type, g);
  }
  const edgePerformance: EdgePerformance[] = [];
  for (const [edge_type, g] of edgeGroups) {
    if (g.sent < 5) continue;
    edgePerformance.push({ edge_type, sent: g.sent, replies: g.replies, replyRate: rate(g.replies, g.sent) });
  }
  edgePerformance.sort((a, b) => b.sent - a.sent);

  // Group by readiness
  const readinessGroups = new Map<string, { sent: number; replies: number }>();
  for (const r of rows) {
    const g = readinessGroups.get(r.readiness) || { sent: 0, replies: 0 };
    g.sent++;
    if (r.replied) g.replies++;
    readinessGroups.set(r.readiness, g);
  }
  const readinessPerformance: ReadinessPerformance[] = [];
  for (const [readiness, g] of readinessGroups) {
    if (g.sent < 5) continue;
    readinessPerformance.push({ readiness: readiness as 'READY' | 'WARMING' | 'NOT_YET', sent: g.sent, replies: g.replies, replyRate: rate(g.replies, g.sent) });
  }
  readinessPerformance.sort((a, b) => b.sent - a.sent);

  // Group by tier
  const tierGroups = new Map<string, { sent: number; replies: number }>();
  for (const r of rows) {
    const g = tierGroups.get(r.tier) || { sent: 0, replies: 0 };
    g.sent++;
    if (r.replied) g.replies++;
    tierGroups.set(r.tier, g);
  }
  const tierPerformance: TierPerformance[] = [];
  for (const [tier, g] of tierGroups) {
    if (g.sent < 5) continue;
    tierPerformance.push({ tier: tier as 'A' | 'B' | 'C', sent: g.sent, replies: g.replies, replyRate: rate(g.replies, g.sent) });
  }
  tierPerformance.sort((a, b) => b.sent - a.sent);

  return { edgePerformance, readinessPerformance, tierPerformance };
}
