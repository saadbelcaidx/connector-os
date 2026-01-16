/**
 * EnrichedContactsCache.ts
 *
 * Shared contact cache across all users.
 * Same arbitrage as Apollo - cache everything, skip paid lookups for known contacts.
 *
 * Flow:
 * 1. Check cache before Apollo
 * 2. If found → skip Apollo, just verify email
 * 3. If not found → call Apollo, save to cache
 */

import { supabase } from '../lib/supabase';

export interface CachedContact {
  domain: string;
  email: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  source: 'apollo' | 'anymail' | 'existing';
  enriched_at: string;
  verified: boolean;
}

// 30 days in milliseconds
const STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Check if a contact's enrichment is stale (>30 days old)
 */
export function isVerificationStale(contact: CachedContact): boolean {
  if (!contact.enriched_at) return true;
  const enrichedAt = new Date(contact.enriched_at).getTime();
  const age = Date.now() - enrichedAt;
  return age > STALE_THRESHOLD_MS;
}

/**
 * Check if we have a cached contact for this domain
 * Returns the best contact (verified first, newest first)
 * Also indicates if re-verification is needed (stale > 30 days)
 */
export async function getCachedContact(domain: string): Promise<CachedContact | null> {
  try {
    const cleanDomain = domain.toLowerCase().replace(/^www\./, '');

    const { data, error } = await supabase
      .from('enriched_contacts')
      .select('*')
      .eq('domain', cleanDomain)
      .order('verified', { ascending: false }) // verified=true first
      .order('enriched_at', { ascending: false }) // newest first
      .limit(1);

    // Don't use .single() - it throws 406 when no rows found
    if (error || !data || data.length === 0) {
      return null;
    }

    const contact = data[0] as CachedContact;
    const stale = isVerificationStale(contact);

    if (stale) {
      console.log(`[ContactCache] ✓ HIT (STALE) for ${domain}: ${contact.email} - needs re-verification`);
    } else {
      console.log(`[ContactCache] ✓ HIT for ${domain}: ${contact.email} (verified: ${contact.verified})`);
    }

    return contact;
  } catch (err) {
    console.warn('[ContactCache] Lookup error:', err);
    return null;
  }
}

/**
 * Save a contact to the shared cache
 * Called after successful Apollo/Anymail enrichment
 */
export async function saveToCache(contact: {
  domain: string;
  email: string;
  name?: string;
  title?: string;
  linkedin?: string;
  companyName?: string;
  source: 'apollo' | 'anymailfinder' | 'apify';
  verificationStatus?: 'verified' | 'risky' | 'invalid' | 'unverified';
}): Promise<void> {
  try {
    const cleanDomain = contact.domain.toLowerCase().replace(/^www\./, '');

    // Parse name into first/last (table schema uses separate columns)
    let firstName: string | undefined;
    let lastName: string | undefined;
    if (contact.name) {
      const parts = contact.name.trim().split(/\s+/);
      firstName = parts[0];
      lastName = parts.length > 1 ? parts.slice(1).join(' ') : undefined;
    }

    // Map source to table's allowed values ('apollo', 'anymail', 'existing')
    const sourceMap: Record<string, string> = {
      'apollo': 'apollo',
      'anymailfinder': 'anymail',
      'apify': 'existing',
    };

    const { error } = await supabase
      .from('enriched_contacts')
      .upsert({
        domain: cleanDomain,
        email: contact.email.toLowerCase(),
        first_name: firstName,
        last_name: lastName,
        title: contact.title,
        source: sourceMap[contact.source] || 'apollo',
        verified: contact.verificationStatus === 'verified',
      }, {
        onConflict: 'domain',
      });

    if (error) {
      console.warn('[ContactCache] Save error:', error);
    } else {
      console.log(`[ContactCache] ✓ SAVED ${contact.email} for ${cleanDomain}`);
    }
  } catch (err) {
    console.warn('[ContactCache] Save error:', err);
  }
}

/**
 * Update verification status for a cached contact
 */
export async function updateVerificationStatus(
  domain: string,
  email: string,
  status: 'verified' | 'risky' | 'invalid'
): Promise<void> {
  try {
    const cleanDomain = domain.toLowerCase().replace(/^www\./, '');

    await supabase
      .from('enriched_contacts')
      .update({
        verified: status === 'verified',
      })
      .eq('domain', cleanDomain)
      .eq('email', email.toLowerCase());
  } catch (err) {
    console.warn('[ContactCache] Update verification error:', err);
  }
}
