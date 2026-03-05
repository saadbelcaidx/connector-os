/**
 * NEXT BEST MARKET MOVE — Phase 30
 *
 * Turns telemetry into 3 operator-grade actions.
 * Pure derived recommendations. No mutation. No persistence. No APIs.
 */

import type { MarketFeedbackReport } from './marketFeedback';
import type { CalibrationDriftReport } from './calibrationDrift';
import type { OperatorThroughputReport } from './operatorThroughput';
import type { StationMetrics } from './metrics';

export interface NextMove {
  title: string;
  why: string;
  action: string;
  evidence: string[];
}

export function computeNextMoves(
  marketFeedback: MarketFeedbackReport,
  calibration: CalibrationDriftReport,
  throughput: OperatorThroughputReport,
  metrics: StationMetrics,
): NextMove[] {
  return [
    moveA(marketFeedback),
    moveB(calibration),
    moveC(throughput, metrics),
  ];
}

// ─── Move A: Double down ────────────────────────────────────────────────────

function moveA(mf: MarketFeedbackReport): NextMove {
  // Best edge_type by replyRate with sent >= 10
  const qualified = mf.edgePerformance.filter(e => e.sent >= 10);
  const bestEdge = qualified.length > 0
    ? qualified.reduce((a, b) => b.replyRate > a.replyRate ? b : a)
    : null;

  if (bestEdge) {
    return {
      title: 'Double down',
      why: `${bestEdge.edge_type} has the highest reply rate with real volume`,
      action: 'run the next batch in this segment and bias approvals toward this condition',
      evidence: [
        `edge: ${bestEdge.edge_type}`,
        `reply rate: ${(bestEdge.replyRate * 100).toFixed(0)}%`,
        `sent: ${bestEdge.sent}`,
        `replies: ${bestEdge.replies}`,
      ],
    };
  }

  // Fallback: best readiness bucket
  const bestReadiness = mf.readinessPerformance.length > 0
    ? mf.readinessPerformance.reduce((a, b) => b.replyRate > a.replyRate ? b : a)
    : null;

  if (bestReadiness) {
    return {
      title: 'Double down',
      why: `${bestReadiness.readiness} evaluations have the highest reply rate`,
      action: 'bias approvals toward this readiness level',
      evidence: [
        `readiness: ${bestReadiness.readiness}`,
        `reply rate: ${(bestReadiness.replyRate * 100).toFixed(0)}%`,
        `sent: ${bestReadiness.sent}`,
        `replies: ${bestReadiness.replies}`,
      ],
    };
  }

  return {
    title: 'Double down',
    why: 'insufficient data to identify best segment',
    action: 'send more and collect outcomes before optimizing',
    evidence: ['no segments with enough volume yet'],
  };
}

// ─── Move B: Fix calibration ────────────────────────────────────────────────

function moveB(cal: CalibrationDriftReport): NextMove {
  const driftPct = `${(cal.overallDrift * 100).toFixed(1)}%`;

  if (cal.status === 'overconfident') {
    const worst = cal.buckets.length > 0
      ? cal.buckets.reduce((a, b) => b.drift < a.drift ? b : a)
      : null;
    return {
      title: 'Stop trusting high confidence',
      why: 'AI confidence exceeds actual reply rates',
      action: 'adjust MCP prompt or confidence interpretation next run',
      evidence: [
        `status: ${cal.status}`,
        `overall drift: ${driftPct}`,
        `samples: ${cal.totalSamples}`,
        ...(worst ? [`worst bucket: ${worst.range} (drift ${(worst.drift * 100).toFixed(1)}%)`] : []),
      ],
    };
  }

  if (cal.status === 'underconfident') {
    const worst = cal.buckets.length > 0
      ? cal.buckets.reduce((a, b) => b.drift > a.drift ? b : a)
      : null;
    return {
      title: 'Confidence is too conservative',
      why: 'actual reply rates exceed AI confidence predictions',
      action: 'adjust MCP prompt or confidence interpretation next run',
      evidence: [
        `status: ${cal.status}`,
        `overall drift: ${driftPct}`,
        `samples: ${cal.totalSamples}`,
        ...(worst ? [`most underestimated: ${worst.range} (drift +${(worst.drift * 100).toFixed(1)}%)`] : []),
      ],
    };
  }

  return {
    title: 'Keep calibration stable',
    why: 'AI confidence matches real outcomes',
    action: 'no prompt changes; keep collecting outcomes',
    evidence: [
      `status: ${cal.status}`,
      `overall drift: ${driftPct}`,
      `samples: ${cal.totalSamples}`,
    ],
  };
}

// ─── Move C: Increase throughput ────────────────────────────────────────────

function moveC(tp: OperatorThroughputReport, metrics: StationMetrics): NextMove {
  const approvalMins = tp.timing.medianApprovalMinutes;
  const sendMins = tp.timing.medianSendMinutes;

  if (approvalMins == null || approvalMins > 30) {
    return {
      title: 'Approve faster',
      why: 'time from proposal to approval is too slow',
      action: 'use A/S + J/K, approve top READY first',
      evidence: [
        `median approval: ${approvalMins != null ? `${approvalMins.toFixed(1)}m` : 'no data'}`,
        `approval rate: ${(tp.rates.approvalRate * 100).toFixed(0)}%`,
        `proposed: ${tp.totals.proposed}`,
        `approved: ${tp.totals.approved}`,
      ],
    };
  }

  if (sendMins == null || sendMins > 30) {
    return {
      title: 'Send faster',
      why: 'approved evaluations sit too long before sending',
      action: 'approve fewer, send immediately after approve',
      evidence: [
        `median send: ${sendMins != null ? `${sendMins.toFixed(1)}m` : 'no data'}`,
        `send rate: ${(tp.rates.sendRate * 100).toFixed(0)}%`,
        `approved: ${tp.totals.approved}`,
        `consumed: ${tp.totals.consumed}`,
      ],
    };
  }

  return {
    title: 'Scale volume',
    why: 'approval and send timing are healthy',
    action: 'increase daily sent target by +20%',
    evidence: [
      `today sent: ${metrics.sent}`,
      `reply rate: ${(metrics.replyRate * 100).toFixed(0)}%`,
      ...(metrics.aiAdoptionRate > 0 ? [`ai adoption: ${(metrics.aiAdoptionRate * 100).toFixed(0)}%`] : []),
      `median approval: ${approvalMins.toFixed(1)}m`,
    ],
  };
}
