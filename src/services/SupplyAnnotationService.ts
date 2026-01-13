/**
 * Supply Annotation Service
 *
 * Persists operator JUDGMENT about suppliers, not raw supply data.
 * Annotations are applied at render time only — zero impact on matching logic.
 *
 * Principle: Raw supply is stateless and always re-fetched.
 * Only operator decisions (stars, exclusions, notes) persist.
 */

import { supabase } from '../lib/supabase';

// ============================================================
// TYPES
// ============================================================

export interface SupplyAnnotation {
  id?: string;
  user_id?: string;
  supplier_fingerprint: string;
  starred: boolean;
  excluded: boolean;
  notes: string | null;
  tags: string[];
  created_at?: string;
  updated_at?: string;
}

export interface AnnotatedSupplier {
  // Original supply data (not persisted)
  domain: string;
  companyName: string;
  email?: string;
  contactName?: string;

  // Computed fingerprint
  fingerprint: string;

  // Annotation (persisted)
  annotation?: SupplyAnnotation;
}

// ============================================================
// FINGERPRINT COMPUTATION
// ============================================================

/**
 * Compute a stable fingerprint for a supplier.
 * Uses domain + email (preferred) or domain + contact name.
 *
 * This allows annotations to survive dataset refreshes as long as
 * the underlying supplier identity (domain + person) remains the same.
 */
export function computeSupplierFingerprint(
  domain: string,
  emailOrName: string
): string {
  // Normalize inputs
  const normalizedDomain = (domain || '').toLowerCase().trim().replace(/^www\./, '');
  const normalizedIdentifier = (emailOrName || '').toLowerCase().trim();

  // Simple hash: domain::identifier
  // Using :: as separator to avoid collisions
  const raw = `${normalizedDomain}::${normalizedIdentifier}`;

  // For now, use the raw string as fingerprint (readable, debuggable)
  // Could hash with crypto.subtle if we need shorter keys
  return raw;
}

/**
 * Extract fingerprint from a supply entity.
 * Prefers email, falls back to contact name, then company name.
 */
export function fingerprintFromSupply(supply: {
  domain?: string;
  companyDomain?: string;
  email?: string;
  contactEmail?: string;
  contactName?: string;
  companyName?: string;
}): string {
  const domain = supply.domain || supply.companyDomain || '';

  // Prefer email (most stable identifier)
  const identifier =
    supply.email ||
    supply.contactEmail ||
    supply.contactName ||
    supply.companyName ||
    '';

  return computeSupplierFingerprint(domain, identifier);
}

// ============================================================
// CRUD OPERATIONS
// ============================================================

/**
 * Fetch annotations for a list of fingerprints.
 * Returns a map for O(1) lookup during render.
 */
export async function fetchAnnotations(
  fingerprints: string[]
): Promise<Map<string, SupplyAnnotation>> {
  const map = new Map<string, SupplyAnnotation>();

  if (fingerprints.length === 0) {
    return map;
  }

  const { data, error } = await supabase
    .from('operator_supply_annotations')
    .select('*')
    .in('supplier_fingerprint', fingerprints);

  if (error) {
    console.error('[SupplyAnnotations] Fetch error:', error);
    return map;
  }

  for (const annotation of data || []) {
    map.set(annotation.supplier_fingerprint, annotation);
  }

  return map;
}

/**
 * Fetch all annotations for the current user.
 * Useful for pre-loading before supply fetch completes.
 */
export async function fetchAllUserAnnotations(): Promise<Map<string, SupplyAnnotation>> {
  const map = new Map<string, SupplyAnnotation>();

  const { data, error } = await supabase
    .from('operator_supply_annotations')
    .select('*');

  if (error) {
    console.error('[SupplyAnnotations] Fetch all error:', error);
    return map;
  }

  for (const annotation of data || []) {
    map.set(annotation.supplier_fingerprint, annotation);
  }

  return map;
}

/**
 * Upsert an annotation (create or update).
 */
export async function upsertAnnotation(
  fingerprint: string,
  updates: Partial<Pick<SupplyAnnotation, 'starred' | 'excluded' | 'notes' | 'tags'>>
): Promise<SupplyAnnotation | null> {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    console.warn('[SupplyAnnotations] No user, cannot save annotation');
    return null;
  }

  const { data, error } = await supabase
    .from('operator_supply_annotations')
    .upsert({
      user_id: user.id,
      supplier_fingerprint: fingerprint,
      starred: updates.starred ?? false,
      excluded: updates.excluded ?? false,
      notes: updates.notes ?? null,
      tags: updates.tags ?? [],
    }, {
      onConflict: 'user_id,supplier_fingerprint',
    })
    .select()
    .single();

  if (error) {
    console.error('[SupplyAnnotations] Upsert error:', error);
    return null;
  }

  return data;
}

/**
 * Toggle starred status for a supplier.
 */
export async function toggleStarred(
  fingerprint: string,
  currentValue: boolean
): Promise<boolean> {
  const result = await upsertAnnotation(fingerprint, { starred: !currentValue });
  return result?.starred ?? currentValue;
}

/**
 * Toggle excluded status for a supplier.
 */
export async function toggleExcluded(
  fingerprint: string,
  currentValue: boolean
): Promise<boolean> {
  const result = await upsertAnnotation(fingerprint, { excluded: !currentValue });
  return result?.excluded ?? currentValue;
}

/**
 * Update notes for a supplier.
 */
export async function updateNotes(
  fingerprint: string,
  notes: string
): Promise<void> {
  await upsertAnnotation(fingerprint, { notes });
}

/**
 * Update tags for a supplier.
 */
export async function updateTags(
  fingerprint: string,
  tags: string[]
): Promise<void> {
  await upsertAnnotation(fingerprint, { tags });
}

/**
 * Delete an annotation entirely.
 */
export async function deleteAnnotation(fingerprint: string): Promise<void> {
  const { error } = await supabase
    .from('operator_supply_annotations')
    .delete()
    .eq('supplier_fingerprint', fingerprint);

  if (error) {
    console.error('[SupplyAnnotations] Delete error:', error);
  }
}

// ============================================================
// GUEST MODE (localStorage fallback)
// ============================================================

const GUEST_ANNOTATIONS_KEY = 'guest_supply_annotations';

/**
 * Get guest annotations from localStorage.
 */
export function getGuestAnnotations(): Map<string, SupplyAnnotation> {
  const map = new Map<string, SupplyAnnotation>();

  try {
    const stored = localStorage.getItem(GUEST_ANNOTATIONS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Record<string, SupplyAnnotation>;
      for (const [key, value] of Object.entries(parsed)) {
        map.set(key, value);
      }
    }
  } catch (e) {
    console.warn('[SupplyAnnotations] Failed to parse guest annotations');
  }

  return map;
}

/**
 * Save guest annotation to localStorage.
 */
export function saveGuestAnnotation(
  fingerprint: string,
  updates: Partial<Pick<SupplyAnnotation, 'starred' | 'excluded' | 'notes' | 'tags'>>
): void {
  const current = getGuestAnnotations();

  const existing = current.get(fingerprint) || {
    supplier_fingerprint: fingerprint,
    starred: false,
    excluded: false,
    notes: null,
    tags: [],
  };

  const updated: SupplyAnnotation = {
    ...existing,
    ...updates,
    supplier_fingerprint: fingerprint,
  };

  current.set(fingerprint, updated);

  // Convert to object for JSON storage
  const obj: Record<string, SupplyAnnotation> = {};
  current.forEach((v, k) => { obj[k] = v; });

  localStorage.setItem(GUEST_ANNOTATIONS_KEY, JSON.stringify(obj));
}
