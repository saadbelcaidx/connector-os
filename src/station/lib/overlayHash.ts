/**
 * OVERLAY HASH — deterministic fingerprint of an OverlaySpec
 *
 * Same config = same hash, always. Used to group performance data
 * by actual overlay configuration rather than version number.
 * Version numbers reference localStorage and can be edited/lost.
 * Hash of actual OverlaySpec JSON at send time = immutable proof.
 */

import type { OverlaySpec } from '../../types/station';

/**
 * Recursively sort object keys for deterministic JSON output.
 */
function sortKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}

/**
 * Compute a deterministic hash of an OverlaySpec.
 * Returns first 12 hex chars of SHA-256.
 */
export async function hashOverlaySpec(spec: OverlaySpec): Promise<string> {
  const canonical = JSON.stringify(sortKeys(spec));
  const encoded = new TextEncoder().encode(canonical);
  const buffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(buffer));
  const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 12);
}

/**
 * Synchronous version using a simple djb2-like hash.
 * Fallback for contexts where async is inconvenient.
 * Still deterministic: same spec = same hash.
 */
export function hashOverlaySpecSync(spec: OverlaySpec): string {
  const canonical = JSON.stringify(sortKeys(spec));
  let hash = 5381;
  for (let i = 0; i < canonical.length; i++) {
    hash = ((hash << 5) + hash + canonical.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
