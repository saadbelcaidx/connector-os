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
  name?: string;
  title?: string;
  linkedin?: string;
  company_name?: string;
  source: 'apollo' | 'anymailfinder' | 'apify';
  enriched_at: string;
  last_verified_at?: string;
  verification_status: 'verified' | 'risky' | 'invalid' | 'unverified';
}

// 30 days in milliseconds
const STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Check if a contact's verification is stale (>30 days old)
 */
export function isVerificationStale(contact: CachedContact): boolean {
  if (!contact.last_verified_at) return true;
  const verifiedAt = new Date(contact.last_verified_at).getTime();
  const age = Date.now() - verifiedAt;
  return age > STALE_THRESHOLD_MS;
}

/**
 * Check if we have a cached contact for this domain
 * Returns the best contact (verified > risky > unverified, newest first)
 * Also indicates if re-verification is needed (stale > 30 days)
 */
export async function getCachedContact(domain: string): Promise<CachedContact | null> {
  try {
    const cleanDomain = domain.toLowerCase().replace(/^www\./, '');

    const { data, error } = await supabase
      .from('enriched_contacts')
      .select('*')
      .eq('domain', cleanDomain)
      .order('verification_status', { ascending: true }) // verified first
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
      console.log(`[ContactCache] ✓ HIT for ${domain}: ${contact.email} (${contact.verification_status})`);
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

    const { error } = await supabase
      .from('enriched_contacts')
      .upsert({
        domain: cleanDomain,
        email: contact.email.toLowerCase(),
        name: contact.name,
        title: contact.title,
        linkedin: contact.linkedin,
        company_name: contact.companyName,
        source: contact.source,
        verification_status: contact.verificationStatus || 'unverified',
        last_verified_at: contact.verificationStatus === 'verified' ? new Date().toISOString() : null,
      }, {
        onConflict: 'domain,email',
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
        verification_status: status,
        last_verified_at: new Date().toISOString(),
      })
      .eq('domain', cleanDomain)
      .eq('email', email.toLowerCase());
  } catch (err) {
    console.warn('[ContactCache] Update verification error:', err);
  }
}
