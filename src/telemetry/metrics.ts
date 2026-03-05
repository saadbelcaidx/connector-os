/**
 * INTELLIGENCE MEASUREMENT LAYER — Phase 22
 *
 * Pure computation. No UI. No network. No persistence.
 * Measures MCP value without changing routing.
 */

import type { Evaluation } from '../evaluation/Evaluation';

// =============================================================================
// TYPES
// =============================================================================

export type MetricsWindow = 'today' | '7d' | '30d' | 'all';

export interface StationMetrics {
  window: MetricsWindow;
  generatedAt: string;

  sent: number;
  replied: number;
  meetings: number;
  declined: number;
  noResponse: number;

  replyRate: number;
  meetingRate: number;

  medianReplyLatencyMs?: number;
  p75ReplyLatencyMs?: number;

  ai: {
    sent: number;
    replied: number;
    meetings: number;
    replyRate: number;
    meetingRate: number;
    medianReplyLatencyMs?: number;
  };

  nonAi: {
    sent: number;
    replied: number;
    meetings: number;
    replyRate: number;
    meetingRate: number;
    medianReplyLatencyMs?: number;
  };

  lift: {
    replyRateAbs: number;
    meetingRateAbs: number;
    replyRateMul?: number;
    meetingRateMul?: number;
  };

  // Phase 23 — AI adoption
  aiAdoptionRate: number;       // % sent where usedAIFraming true
  avgConfidenceAI?: number;     // avg confidence_ai for AI cohort (ignoring blanks)
}

// =============================================================================
// INTRO ENTRY SHAPE (matches Flow.tsx IntroEntry)
// =============================================================================

interface IntroEntryLike {
  sentAt?: string;
  usedAIFraming?: boolean;
  outcomeType?: 'replied' | 'no_response' | 'meeting_booked' | 'declined';
  replyLatencyMs?: number;
  evaluationId?: string;
}

// =============================================================================
// PERCENTILE HELPERS
// =============================================================================

function percentile(sorted: number[], p: number): number | undefined {
  if (sorted.length === 0) return undefined;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return percentile(sorted, 50);
}

function p75(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return percentile(sorted, 75);
}

// =============================================================================
// WINDOW FILTER
// =============================================================================

function withinWindow(sentAt: string | undefined, window: MetricsWindow): boolean {
  if (!sentAt) return false;
  if (window === 'all') return true;

  const sentMs = Date.parse(sentAt);
  if (isNaN(sentMs)) return false;

  const now = Date.now();

  if (window === 'today') {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return sentMs >= todayStart.getTime();
  }

  if (window === '7d') return sentMs >= now - 7 * 24 * 60 * 60 * 1000;
  if (window === '30d') return sentMs >= now - 30 * 24 * 60 * 60 * 1000;

  return true;
}

// =============================================================================
// SAFE RATE
// =============================================================================

function rate(num: number, denom: number): number {
  return denom > 0 ? num / denom : 0;
}

// =============================================================================
// COMPUTE
// =============================================================================

interface ComputeInput {
  evaluations: Evaluation[];
  demandIntros: Map<string, IntroEntryLike>;
  supplyIntros: Map<string, IntroEntryLike>;
  window: MetricsWindow;
}

function computeCohort(entries: IntroEntryLike[]) {
  const sent = entries.length;
  const replied = entries.filter(e => e.outcomeType === 'replied').length;
  const meetings = entries.filter(e => e.outcomeType === 'meeting_booked').length;
  const declined = entries.filter(e => e.outcomeType === 'declined').length;
  const noResponse = entries.filter(e => e.outcomeType === 'no_response').length;

  const latencies = entries
    .filter(e => (e.outcomeType === 'replied' || e.outcomeType === 'meeting_booked') && typeof e.replyLatencyMs === 'number')
    .map(e => e.replyLatencyMs!);

  return {
    sent,
    replied,
    meetings,
    declined,
    noResponse,
    replyRate: rate(replied, sent),
    meetingRate: rate(meetings, sent),
    medianReplyLatencyMs: median(latencies),
    latencies,
  };
}

export function computeStationMetrics(input: ComputeInput): StationMetrics {
  const { evaluations, demandIntros, supplyIntros, window } = input;

  // Collect all IntroEntries within window
  const allEntries: IntroEntryLike[] = [];
  for (const entry of demandIntros.values()) {
    if (withinWindow(entry.sentAt, window)) allEntries.push(entry);
  }
  for (const entry of supplyIntros.values()) {
    if (withinWindow(entry.sentAt, window)) allEntries.push(entry);
  }

  // Split cohorts
  const aiEntries = allEntries.filter(e => e.usedAIFraming === true);
  const nonAiEntries = allEntries.filter(e => !e.usedAIFraming);

  // Compute
  const total = computeCohort(allEntries);
  const ai = computeCohort(aiEntries);
  const nonAi = computeCohort(nonAiEntries);

  // All latencies for global percentiles
  const allLatencies = total.latencies;

  // Phase 23 — AI adoption rate + avg confidenceAI
  const aiAdoptionRate = rate(aiEntries.length, allEntries.length);

  // Build evaluation lookup for confidenceAI
  const evalById = new Map<string, Evaluation>();
  for (const ev of evaluations) {
    evalById.set(ev.id, ev);
  }

  // Avg confidenceAI for AI cohort (ignore blanks)
  const confidenceValues: number[] = [];
  for (const entry of aiEntries) {
    if (!entry.evaluationId) continue;
    const ev = evalById.get(entry.evaluationId);
    if (ev?.ai?.confidence_ai != null) {
      confidenceValues.push(ev.ai.confidence_ai);
    }
  }
  const avgConfidenceAI = confidenceValues.length > 0
    ? confidenceValues.reduce((sum, v) => sum + v, 0) / confidenceValues.length
    : undefined;

  return {
    window,
    generatedAt: new Date().toISOString(),

    sent: total.sent,
    replied: total.replied,
    meetings: total.meetings,
    declined: total.declined,
    noResponse: total.noResponse,

    replyRate: total.replyRate,
    meetingRate: total.meetingRate,

    medianReplyLatencyMs: median(allLatencies),
    p75ReplyLatencyMs: p75(allLatencies),

    ai: {
      sent: ai.sent,
      replied: ai.replied,
      meetings: ai.meetings,
      replyRate: ai.replyRate,
      meetingRate: ai.meetingRate,
      medianReplyLatencyMs: ai.medianReplyLatencyMs,
    },

    nonAi: {
      sent: nonAi.sent,
      replied: nonAi.replied,
      meetings: nonAi.meetings,
      replyRate: nonAi.replyRate,
      meetingRate: nonAi.meetingRate,
      medianReplyLatencyMs: nonAi.medianReplyLatencyMs,
    },

    lift: {
      replyRateAbs: ai.replyRate - nonAi.replyRate,
      meetingRateAbs: ai.meetingRate - nonAi.meetingRate,
      replyRateMul: nonAi.replyRate > 0 ? ai.replyRate / nonAi.replyRate : undefined,
      meetingRateMul: nonAi.meetingRate > 0 ? ai.meetingRate / nonAi.meetingRate : undefined,
    },

    aiAdoptionRate,
    avgConfidenceAI,
  };
}
