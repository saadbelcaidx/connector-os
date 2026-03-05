/**
 * CALIBRATION DRIFT DETECTION — Phase 27
 *
 * Detects when AI confidence stops matching real outcomes.
 * Pure analytics. No mutation. No persistence. No APIs.
 */

import type { Evaluation } from '../evaluation/Evaluation';

interface IntroEntryLike {
  sentAt?: string;
  outcomeType?: 'replied' | 'no_response' | 'meeting_booked' | 'declined';
  evaluationId?: string;
}

export interface CalibrationBucket {
  range: string;
  avgConfidence: number;
  actualReplyRate: number;
  drift: number;
  samples: number;
}

export interface CalibrationDriftReport {
  totalSamples: number;
  buckets: CalibrationBucket[];
  overallDrift: number;
  status: 'calibrated' | 'overconfident' | 'underconfident';
}

function isReply(outcome: string | undefined): boolean {
  return outcome === 'replied' || outcome === 'meeting_booked';
}

const RANGES: { label: string; lo: number; hi: number }[] = [
  { label: '0.0–0.4', lo: 0.0, hi: 0.4 },
  { label: '0.4–0.6', lo: 0.4, hi: 0.6 },
  { label: '0.6–0.8', lo: 0.6, hi: 0.8 },
  { label: '0.8–1.0', lo: 0.8, hi: 1.0 },
];

export function computeCalibrationDrift(
  demandIntros: Map<string, IntroEntryLike>,
  supplyIntros: Map<string, IntroEntryLike>,
  evaluations: Evaluation[],
): CalibrationDriftReport {
  const evalById = new Map<string, Evaluation>();
  for (const ev of evaluations) evalById.set(ev.id, ev);

  // Collect rows with confidence
  interface Row {
    confidence: number;
    replied: boolean;
  }

  const rows: Row[] = [];

  const process = (entries: Map<string, IntroEntryLike>) => {
    for (const entry of entries.values()) {
      if (!entry.sentAt) continue;
      if (!entry.evaluationId) continue;
      const ev = evalById.get(entry.evaluationId);
      if (!ev) continue;
      if (ev.ai?.confidence_ai == null) continue;

      rows.push({
        confidence: ev.ai.confidence_ai,
        replied: isReply(entry.outcomeType),
      });
    }
  };

  process(demandIntros);
  process(supplyIntros);

  // Bucket rows
  const bucketData = RANGES.map(r => ({
    range: r,
    confidences: [] as number[],
    replies: 0,
    sent: 0,
  }));

  for (const row of rows) {
    for (const b of bucketData) {
      if (row.confidence >= b.range.lo && (row.confidence < b.range.hi || (b.range.hi === 1.0 && row.confidence <= 1.0))) {
        b.confidences.push(row.confidence);
        b.sent++;
        if (row.replied) b.replies++;
        break;
      }
    }
  }

  // Compute per bucket
  const buckets: CalibrationBucket[] = bucketData
    .filter(b => b.sent > 0)
    .map(b => {
      const avgConfidence = b.confidences.reduce((s, v) => s + v, 0) / b.confidences.length;
      const actualReplyRate = b.replies / b.sent;
      return {
        range: b.range.label,
        avgConfidence,
        actualReplyRate,
        drift: actualReplyRate - avgConfidence,
        samples: b.sent,
      };
    });

  // Weighted mean drift
  const totalSamples = rows.length;
  let overallDrift = 0;
  if (totalSamples > 0) {
    let weightedSum = 0;
    let weightTotal = 0;
    for (const b of buckets) {
      weightedSum += b.drift * b.samples;
      weightTotal += b.samples;
    }
    overallDrift = weightTotal > 0 ? weightedSum / weightTotal : 0;
  }

  // Status
  let status: 'calibrated' | 'overconfident' | 'underconfident';
  if (Math.abs(overallDrift) <= 0.05) {
    status = 'calibrated';
  } else if (overallDrift < -0.05) {
    status = 'overconfident';
  } else {
    status = 'underconfident';
  }

  return { totalSamples, buckets, overallDrift, status };
}
