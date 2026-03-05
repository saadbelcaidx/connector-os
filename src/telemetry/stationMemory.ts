/**
 * STATION MEMORY — Phase 32
 *
 * Persists read-only session snapshots to localStorage.
 * Memory failure must never affect operator flow.
 * No Supabase. No APIs. No UI. Silent persistence only.
 */

import type { StationSnapshot } from './sessionSnapshot';

const STORAGE_KEY = 'connectoros.station.memory';
const MAX_SNAPSHOTS = 20;

export function saveSnapshot(snapshot: StationSnapshot): void {
  try {
    const existing = loadSnapshots();
    existing.push(snapshot);
    // FIFO trim
    while (existing.length > MAX_SNAPSHOTS) {
      existing.shift();
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  } catch {
    // Swallow — memory failure must never affect operator flow
  }
}

export function loadSnapshots(): StationSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Minimal shape validation: each item must have id and createdAt
    return parsed.filter(
      (s: unknown) => s && typeof s === 'object' && typeof (s as any).id === 'string' && typeof (s as any).createdAt === 'string'
    );
  } catch {
    return [];
  }
}

export function getLatestSnapshot(): StationSnapshot | null {
  const all = loadSnapshots();
  return all.length > 0 ? all[all.length - 1] : null;
}
