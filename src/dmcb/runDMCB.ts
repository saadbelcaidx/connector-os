import type { RawRecord, CanonicalSignal } from './types';
import type { DMCBAIConfig, DMCBCanonical } from './dmcbAiExtract';
import { dmcbExtractCanonical } from './dmcbAiExtract';
import { synthesizeIntent } from './synthesizeIntent';
import { isMinimumViable } from './minimumViability';
import { buildPartyStub } from './buildPartyStub';

export function hash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// =============================================================================
// Phase 1: AI extraction only (batched, with progress callback)
// =============================================================================

export async function extractCanonicals(args: {
  raw: RawRecord[];
  ai: DMCBAIConfig;
  onProgress?: (done: number, total: number) => void;
}): Promise<{
  canonicalMap: Map<string, DMCBCanonical>;
  errors: Array<{ id: string; error: { code: string; message: string } }>;
}> {
  const items = args.raw.map(rr => ({
    id: rr.recordKey,
    side: rr.side,
    raw: rr.payload,
    ...(rr.context ? { context: rr.context } : {}),
  }));

  const canonicalMap = new Map<string, DMCBCanonical>();
  const errors: Array<{ id: string; error: { code: string; message: string } }> = [];
  const total = items.length;
  let done = 0;

  const CONCURRENCY = 3;
  const batches: (typeof items)[] = [];
  for (let i = 0; i < items.length; i += 25) {
    batches.push(items.slice(i, i + 25));
  }

  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(batch => dmcbExtractCanonical(batch, args.ai))
    );
    for (const results of chunkResults) {
      for (const r of results) {
        if (r.canonical) {
          canonicalMap.set(r.id, r.canonical);
        } else if (r.error) {
          errors.push({ id: r.id, error: r.error });
        }
      }
    }
    done = Math.min((i + CONCURRENCY) * 25, total);
    args.onProgress?.(done, total);
  }

  return { canonicalMap, errors };
}

// =============================================================================
// Phase 2: Pure signal building from cached canonical map (zero AI calls)
// =============================================================================

export function buildSignalsFromCanonicals(args: {
  raw: RawRecord[];
  canonicalMap: Map<string, DMCBCanonical>;
}): { signals: CanonicalSignal[]; quarantined: RawRecord[] } {
  const signals: CanonicalSignal[] = [];
  const quarantined: RawRecord[] = [];

  for (const rr of args.raw) {
    const canonical = args.canonicalMap.get(rr.recordKey);
    const party = buildPartyStub(canonical);
    const intent = synthesizeIntent(canonical);

    if (!isMinimumViable(party, intent)) {
      quarantined.push(rr);
      continue;
    }

    const segment = canonical?.who || 'UNKNOWN';

    signals.push({
      id: `sig_${hash(rr.id)}`,
      side: rr.side,
      segment,
      freshness: 0.5,
      confidence: canonical?.confidence ?? 0,
      party,
      intent,
      recordKey: rr.recordKey,
      source: rr.source,
    });
  }

  return { signals, quarantined };
}

// =============================================================================
// Original runDMCB — composition of both phases. Zero impact on Prebuilt Markets.
// =============================================================================

export async function runDMCB(args: {
  raw: RawRecord[];
  ai: DMCBAIConfig;
}): Promise<{ signals: CanonicalSignal[]; quarantined: RawRecord[] }> {
  const { canonicalMap } = await extractCanonicals({ raw: args.raw, ai: args.ai });
  return buildSignalsFromCanonicals({ raw: args.raw, canonicalMap });
}
