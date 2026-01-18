/**
 * csvStableKeys.ts — Cross-Upload Deduplication
 *
 * CSV Phase 2: Detect and persist stableKeys for cross-upload deduplication.
 *
 * TABLE SCHEMA (Supabase):
 * CREATE TABLE csv_stable_keys (
 *   user_id UUID NOT NULL,
 *   stable_key TEXT NOT NULL,
 *   source_side TEXT NOT NULL,
 *   first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 *   last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 *   PRIMARY KEY (user_id, stable_key, source_side)
 * );
 *
 * INVARIANT: Cross-upload duplicates are detected without mutating existing data.
 */

import { supabase } from '../lib/supabase';

// =============================================================================
// TYPES (LOCAL ONLY)
// =============================================================================

type CsvSide = 'demand' | 'supply';

/** Result of duplicate check */
export interface DedupCheckResult {
  newKeys: string[];
  duplicateKeys: string[];
  totalNew: number;
  totalDuplicates: number;
}

// =============================================================================
// DEDUP CHECK (READ-ONLY)
// =============================================================================

/**
 * Check which stableKeys already exist for this user.
 *
 * @param userId - User's UUID
 * @param stableKeys - Array of stableKeys from current upload
 * @param side - 'demand' or 'supply'
 * @returns DedupCheckResult with new vs duplicate keys
 *
 * INVARIANT: Read-only operation, no database writes.
 */
export async function checkCsvDuplicates(params: {
  userId: string;
  stableKeys: string[];
  side: CsvSide;
}): Promise<DedupCheckResult> {
  const { userId, stableKeys, side } = params;

  if (stableKeys.length === 0) {
    return {
      newKeys: [],
      duplicateKeys: [],
      totalNew: 0,
      totalDuplicates: 0,
    };
  }

  try {
    // Query existing stableKeys for this user and side
    const { data, error } = await supabase
      .from('csv_stable_keys')
      .select('stable_key')
      .eq('user_id', userId)
      .eq('source_side', side)
      .in('stable_key', stableKeys);

    if (error) {
      // If table doesn't exist yet, treat all as new
      console.warn('[CsvDedup] Table query failed, treating all as new:', error.message);
      return {
        newKeys: stableKeys,
        duplicateKeys: [],
        totalNew: stableKeys.length,
        totalDuplicates: 0,
      };
    }

    const existingKeys = new Set((data || []).map(row => row.stable_key));
    const newKeys: string[] = [];
    const duplicateKeys: string[] = [];

    for (const key of stableKeys) {
      if (existingKeys.has(key)) {
        duplicateKeys.push(key);
      } else {
        newKeys.push(key);
      }
    }

    return {
      newKeys,
      duplicateKeys,
      totalNew: newKeys.length,
      totalDuplicates: duplicateKeys.length,
    };
  } catch (err) {
    // On any error, treat all as new (fail open for usability)
    console.warn('[CsvDedup] Check failed, treating all as new:', err);
    return {
      newKeys: stableKeys,
      duplicateKeys: [],
      totalNew: stableKeys.length,
      totalDuplicates: 0,
    };
  }
}

// =============================================================================
// PERSIST STABLEKEYS (WRITE)
// =============================================================================

/**
 * Persist new stableKeys after user confirmation.
 *
 * @param userId - User's UUID
 * @param stableKeys - Array of NEW stableKeys to persist
 * @param side - 'demand' or 'supply'
 *
 * RULES:
 * - Insert only after user confirmation
 * - No deletes
 * - No overwrites (upsert updates last_seen_at only)
 */
export async function persistCsvStableKeys(params: {
  userId: string;
  stableKeys: string[];
  side: CsvSide;
}): Promise<void> {
  const { userId, stableKeys, side } = params;

  if (stableKeys.length === 0) {
    return;
  }

  try {
    const rows = stableKeys.map(key => ({
      user_id: userId,
      stable_key: key,
      source_side: side,
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    }));

    // Upsert: insert new, update last_seen_at for existing
    const { error } = await supabase
      .from('csv_stable_keys')
      .upsert(rows, {
        onConflict: 'user_id,stable_key,source_side',
        ignoreDuplicates: false, // Update last_seen_at on conflict
      });

    if (error) {
      // Log but don't throw - dedup persistence is non-critical
      console.warn('[CsvDedup] Persist failed:', error.message);
    } else {
      console.log(`[CsvDedup] Persisted ${stableKeys.length} stableKeys for ${side}`);
    }
  } catch (err) {
    // Log but don't throw - dedup persistence is non-critical
    console.warn('[CsvDedup] Persist error:', err);
  }
}
