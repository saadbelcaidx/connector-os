/**
 * CSV EXPORT — Phase 22
 *
 * Returns CSV string. No file writing. No network.
 */

import type { Evaluation } from '../evaluation/Evaluation';
import type { MetricsWindow } from './metrics';

interface IntroEntryLike {
  sentAt?: string;
  usedAIFraming?: boolean;
  outcomeType?: 'replied' | 'no_response' | 'meeting_booked' | 'declined';
  outcomeAt?: string;
  replyLatencyMs?: number;
  evaluationId?: string;
}

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

function escapeCsv(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function exportMetricsCsv(
  evaluations: Evaluation[],
  demandIntros: Map<string, IntroEntryLike>,
  supplyIntros: Map<string, IntroEntryLike>,
  window: MetricsWindow,
): string {
  const header = 'sentAt,side,evaluationId,usedAIFraming,usedAIWhy,usedAIRisks,confidenceAI,outcomeType,outcomeAt,replyLatencyMs';
  const rows: string[] = [header];

  // Build evaluation lookup for Phase 23 columns
  const evalById = new Map<string, Evaluation>();
  for (const ev of evaluations) {
    evalById.set(ev.id, ev);
  }

  const addRows = (entries: Map<string, IntroEntryLike>, side: 'demand' | 'supply') => {
    for (const entry of entries.values()) {
      if (!withinWindow(entry.sentAt, window)) continue;
      const ev = entry.evaluationId ? evalById.get(entry.evaluationId) : undefined;
      const usedAIWhy = ev?.ai?.why_match_ai ? 'true' : 'false';
      const usedAIRisks = ev?.ai?.risks_ai && ev.ai.risks_ai.length > 0 ? 'true' : 'false';
      const confidenceAI = ev?.ai?.confidence_ai != null ? String(ev.ai.confidence_ai) : '';
      rows.push([
        escapeCsv(entry.sentAt || ''),
        side,
        escapeCsv(entry.evaluationId || ''),
        String(entry.usedAIFraming ?? ''),
        usedAIWhy,
        usedAIRisks,
        confidenceAI,
        escapeCsv(entry.outcomeType || ''),
        escapeCsv(entry.outcomeAt || ''),
        entry.replyLatencyMs != null ? String(entry.replyLatencyMs) : '',
      ].join(','));
    }
  };

  addRows(demandIntros, 'demand');
  addRows(supplyIntros, 'supply');

  return rows.join('\n');
}
