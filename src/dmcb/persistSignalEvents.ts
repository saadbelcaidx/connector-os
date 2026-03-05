/**
 * persistSignalEvents — Write signal classifications to signal_events table.
 *
 * Separate from persistCanonicals. Signal persistence is not part of canonical persistence.
 * Uses monotonic upsert via RPC: pack > classified > unknown.
 * - Pack is never overwritten.
 * - Classified can overwrite classified if signal_type differs (correction).
 * - Same signal_type from classified = no-op (idempotent).
 * - Records that can't be classified are simply not inserted.
 *
 * Falls back to simple .upsert() if the RPC function doesn't exist yet
 * (migration not applied). Simple upsert loses monotonic guarantees but
 * doesn't block ingestion.
 */

import { supabase } from '../lib/supabase';
import type { SignalClassification } from './classifySignal';

const BATCH_SIZE = 100;

export async function persistSignalEvents(
  eventMetaMap: Map<string, SignalClassification>,
  sourceSystem: 'instantly_pack' | 'apify' | 'manual' | 'unknown' = 'unknown',
): Promise<{ persisted: number }> {
  const entries = Array.from(eventMetaMap.entries());
  if (entries.length === 0) return { persisted: 0 };

  let persisted = 0;
  let useRpc = true;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);

    if (useRpc) {
      // Try RPC for first entry to detect if function exists
      const [firstKey, firstSc] = batch[0];
      const { error: probeErr } = await supabase.rpc('upsert_signal_event', {
        p_record_key: firstKey,
        p_signal_type: firstSc.signalType,
        p_signal_group: firstSc.signalGroup,
        p_signal_label: firstSc.signalLabel,
        p_source: firstSc.source,
        p_source_system: sourceSystem,
      });

      if (probeErr) {
        console.warn('[persistSignalEvents] RPC not available, falling back to simple upsert');
        useRpc = false;
      } else {
        persisted++;
        // Process rest of batch via RPC
        const results = await Promise.allSettled(
          batch.slice(1).map(([key, sc]) =>
            supabase.rpc('upsert_signal_event', {
              p_record_key: key,
              p_signal_type: sc.signalType,
              p_signal_group: sc.signalGroup,
              p_signal_label: sc.signalLabel,
              p_source: sc.source,
              p_source_system: sourceSystem,
            }),
          ),
        );
        persisted += results.filter(r => r.status === 'fulfilled' && !(r.value as { error: unknown }).error).length;
        continue;
      }
    }

    // Fallback: simple upsert (no monotonic guarantees)
    const rows = batch.map(([key, sc]) => ({
      record_key: key,
      signal_type: sc.signalType,
      signal_group: sc.signalGroup,
      signal_label: sc.signalLabel,
      source: sc.source,
      source_system: sourceSystem,
    }));

    const { error } = await supabase
      .from('signal_events')
      .upsert(rows, { onConflict: 'record_key' });

    if (error) {
      console.warn(`[persistSignalEvents] Batch upsert failed: ${error.message}`);
    } else {
      persisted += rows.length;
    }
  }

  return { persisted };
}
