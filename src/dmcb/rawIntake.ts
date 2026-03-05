import type { RawRecord, Side } from './types';
import type { NormalizedRecord } from '../schemas';
import { hash } from './runDMCB';

export function toRawRecords(
  records: NormalizedRecord[],
  source: 'csv' | 'markets'
): RawRecord[] {
  const now = Date.now();
  return records.map((r) => ({
    id: `${source}:${r.recordKey}`,
    source,
    side: r.side,
    recordKey: r.recordKey,
    payload: r,
    receivedAt: now,
  }));
}

/**
 * Convert raw Apify dataset items into RawRecords with stamped side + generated recordKey.
 * Used by the "Your Data" Analyze flow — Apify objects lack recordKey and side.
 */
export function toRawRecordsFromApify(
  demandItems: any[],
  supplyItems: any[],
  opts?: { demandContext?: string; supplyContext?: string },
): RawRecord[] {
  const now = Date.now();

  const stamp = (items: any[], side: Side, prefix: string, context?: string): RawRecord[] =>
    items.map((item, i) => {
      const key = `${prefix}_${hash(JSON.stringify(item) + i)}`;
      return {
        id: `apify:${key}`,
        source: 'csv' as const,
        side,
        recordKey: key,
        payload: item,
        receivedAt: now,
        ...(context ? { context } : {}),
      };
    });

  return [
    ...stamp(demandItems, 'demand', 'd', opts?.demandContext),
    ...stamp(supplyItems, 'supply', 's', opts?.supplyContext),
  ];
}
