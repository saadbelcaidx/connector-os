import { supabase } from '../lib/supabase';
import type { DMCBCanonical } from './dmcbAiExtract';

const BATCH_SIZE = 100;

/**
 * Upsert canonical intent objects to dmcb_canonicals in batches.
 * Throws on any batch failure — caller must catch.
 */
export async function persistCanonicals(
  canonicalMap: Map<string, DMCBCanonical>,
  jobId: string,
): Promise<{ persisted: number }> {
  const entries = Array.from(canonicalMap.entries());
  let persisted = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE).map(([key, canonical]) => ({
      record_key: key,
      job_id: jobId,
      canonical,
      extracted_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('dmcb_canonicals')
      .upsert(batch, { onConflict: 'record_key,job_id' });

    if (error) {
      throw new Error(
        `persistCanonicals batch ${i / BATCH_SIZE + 1} failed: ${error.message}`,
      );
    }

    persisted += batch.length;
  }

  return { persisted };
}
