/**
 * ITEMIZATION — TURN ANY PAYLOAD INTO items[]
 *
 * Handles:
 * - Array → items = payload
 * - { data: [...] } → items = payload.data
 * - { items: [...] } → items = payload.items
 * - { results: [...] } → items = payload.results
 * - single object → items = [payload]
 */

import type { RawEnvelope, RawEnvelopeSource, RawEnvelopeMeta } from './types';

// =============================================================================
// ITEMIZE FUNCTION
// =============================================================================

export interface ItemizeResult {
  items: unknown[];
  meta: RawEnvelopeMeta;
}

/**
 * Extract items array from any payload structure.
 * Never returns empty without explanation in meta.
 */
export function itemize(payload: unknown): ItemizeResult {
  const wrapperKeysDetected: string[] = [];

  // Case 1: Already an array
  if (Array.isArray(payload)) {
    console.log('[Itemize] Payload is array, count:', payload.length);
    return {
      items: payload,
      meta: {
        itemizationMethod: 'array',
        itemCount: payload.length,
        wrapperKeysDetected,
      },
    };
  }

  // Case 2: Null/undefined
  if (payload === null || payload === undefined) {
    console.log('[Itemize] Payload is null/undefined');
    return {
      items: [],
      meta: {
        itemizationMethod: 'empty',
        itemCount: 0,
        wrapperKeysDetected,
      },
    };
  }

  // Case 3: Object with wrapper keys
  if (typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    const keys = Object.keys(obj);
    wrapperKeysDetected.push(...keys);

    // Try common wrapper keys in priority order
    const wrapperKeys = ['data', 'items', 'results', 'records', 'rows', 'entries', 'list'];

    for (const key of wrapperKeys) {
      if (key in obj && Array.isArray(obj[key])) {
        const items = obj[key] as unknown[];
        console.log(`[Itemize] Found wrapper key "${key}", count:`, items.length);
        return {
          items,
          meta: {
            itemizationMethod: key as RawEnvelopeMeta['itemizationMethod'],
            itemCount: items.length,
            wrapperKeysDetected,
          },
        };
      }
    }

    // No wrapper found, treat as single-object mode
    console.log('[Itemize] No wrapper key found, treating as single object. Keys:', keys.slice(0, 10));
    return {
      items: [payload],
      meta: {
        itemizationMethod: 'single',
        itemCount: 1,
        wrapperKeysDetected,
      },
    };
  }

  // Case 4: Primitive (string, number, etc.) - shouldn't happen but handle gracefully
  console.log('[Itemize] Payload is primitive type:', typeof payload);
  return {
    items: [],
    meta: {
      itemizationMethod: 'empty',
      itemCount: 0,
      wrapperKeysDetected: [],
    },
  };
}

// =============================================================================
// CREATE RAW ENVELOPE
// =============================================================================

/**
 * Create a RawEnvelope from any payload.
 * This is the canonical way to prepare data for the pipeline.
 */
export function createRawEnvelope(
  payload: unknown,
  source: Partial<RawEnvelopeSource>
): RawEnvelope {
  const { items, meta } = itemize(payload);

  return {
    source: {
      provider: source.provider || 'apify',
      sourceId: source.sourceId,
      datasetType: source.datasetType,
      fetchedAt: source.fetchedAt || new Date().toISOString(),
    },
    payload,
    items,
    meta,
  };
}

// =============================================================================
// LOGGING / METRICS
// =============================================================================

let itemizeCounter = 0;

export function getItemizeMetrics() {
  return { totalCalls: itemizeCounter };
}

export function resetItemizeMetrics() {
  itemizeCounter = 0;
}
