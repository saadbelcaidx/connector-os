/**
 * SESSION SNAPSHOT PRIMITIVE — Phase 31
 *
 * Pure derived snapshot of Station intelligence for the current session.
 * Frozen, immutable, read-only. No persistence. No APIs. No side effects.
 */

import type { StationMetrics } from './metrics';
import type { SegmentLift } from './segmentLift';
import type { EvaluationQualityReport } from './evaluationQuality';
import type { CalibrationDriftReport } from './calibrationDrift';
import type { OperatorThroughputReport } from './operatorThroughput';
import type { MarketFeedbackReport } from './marketFeedback';
import type { NextMove } from './nextMoves';

export interface StationSnapshot {
  id: string;
  createdAt: string;

  metrics: StationMetrics;
  segmentLift: SegmentLift[];

  evaluationQuality: EvaluationQualityReport;
  calibration: CalibrationDriftReport;
  throughput: OperatorThroughputReport;
  marketFeedback: MarketFeedbackReport;

  nextMoves: NextMove[];
}

export function buildSessionSnapshot(
  metrics: StationMetrics,
  segmentLift: SegmentLift[],
  evaluationQuality: EvaluationQualityReport,
  calibration: CalibrationDriftReport,
  throughput: OperatorThroughputReport,
  marketFeedback: MarketFeedbackReport,
  nextMoves: NextMove[],
): StationSnapshot {
  const now = new Date().toISOString();

  const snapshot: StationSnapshot = {
    id: `snapshot_${Date.now()}`,
    createdAt: now,

    metrics,
    segmentLift,

    evaluationQuality,
    calibration,
    throughput,
    marketFeedback,

    nextMoves,
  };

  return Object.freeze(snapshot);
}
