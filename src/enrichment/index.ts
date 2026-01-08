/**
 * ENRICHMENT — Smart Email Resolution
 *
 * Three providers. Waterfall pattern.
 *
 * B2B Contacts: email exists → verify (Anymail/SSM) → continue/discard
 * Startup Jobs: no email → Apollo → Anymail → SSM fallback
 *
 * CACHE LAYER: Check cache first. More users = richer cache = less API spend.
 */

import { NormalizedRecord, Schema } from '../schemas';
import { supabase } from '../lib/supabase';
import { ssmVerifyEmail, ssmFindEmail } from '../services/SSMVerifyService';

// =============================================================================
// TYPES
// =============================================================================

export interface EnrichmentConfig {
  apolloApiKey?: string;
  anymailApiKey?: string;
  ssmApiKey?: string;
}

export interface EnrichmentResult {
  success: boolean;
  email: string | null;
  firstName: string;
  lastName: string;
  title: string;
  verified: boolean;
  source: 'existing' | 'anymail' | 'apollo';
}

// =============================================================================
// CACHE LAYER
// =============================================================================

const CACHE_TTL_DAYS = 90;

interface CachedContact {
  domain: string;
  email: string;
  first_name: string;
  last_name: string;
  title: string;
  source: string;
  enriched_at: string;
}

/**
 * Check cache for existing enrichment.
 */
async function checkCache(domain: string): Promise<EnrichmentResult | null> {
  try {
    const { data, error } = await supabase
      .from('enriched_contacts')
      .select('*')
      .eq('domain', domain.toLowerCase())
      .maybeSingle();

    if (error || !data) return null;

    // Check TTL
    const enrichedAt = new Date(data.enriched_at);
    const daysSince = (Date.now() - enrichedAt.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSince > CACHE_TTL_DAYS) {
      console.log(`[Cache] Stale entry for ${domain} (${Math.round(daysSince)} days old)`);
      return null; // Stale, re-enrich
    }

    console.log(`[Cache] HIT for ${domain}`);
    return {
      success: true,
      email: data.email,
      firstName: data.first_name,
      lastName: data.last_name,
      title: data.title,
      verified: true,
      source: data.source as 'apollo' | 'anymail' | 'existing',
    };
  } catch (err) {
    console.error('[Cache] Check failed:', err);
    return null;
  }
}

/**
 * Store enrichment result in cache.
 */
async function storeInCache(domain: string, result: EnrichmentResult): Promise<void> {
  if (!result.success || !result.email) return;

  try {
    await supabase
      .from('enriched_contacts')
      .upsert({
        domain: domain.toLowerCase(),
        email: result.email,
        first_name: result.firstName,
        last_name: result.lastName,
        title: result.title,
        source: result.source,
        enriched_at: new Date().toISOString(),
      }, { onConflict: 'domain,email' });

    console.log(`[Cache] Stored ${domain}`);
  } catch (err) {
    console.error('[Cache] Store failed:', err);
  }
}

// =============================================================================
// MAIN ENRICHMENT FUNCTION
// =============================================================================

/**
 * Get verified email for a record.
 *
 * FLOW:
 * 1. Check cache → HIT: return cached
 * 2. B2B Contacts: verify existing email or Anymail lookup
 * 3. Startup Jobs: Apollo → Anymail fallback
 * 4. Store result in cache
 */
export async function enrichRecord(
  record: NormalizedRecord,
  schema: Schema,
  config: EnrichmentConfig,
  signal?: string  // For Apollo role-based search
): Promise<EnrichmentResult> {

  // STEP 1: Check cache first
  const cached = await checkCache(record.domain);
  if (cached) {
    return cached;
  }

  let result: EnrichmentResult;

  // B2B Contacts - has contact info
  if (schema.hasContacts) {

    if (record.email) {
      // Has email → verify
      const verified = await verifyEmail(record.email, config);

      if (verified) {
        result = {
          success: true,
          email: record.email,
          firstName: record.firstName,
          lastName: record.lastName,
          title: record.title,
          verified: true,
          source: 'existing',
        };
        // Don't cache existing emails, only enriched ones
        return result;
      }

      // Email invalid, try Anymail with name + domain
      result = await anymailEnrich(record.fullName, record.domain, config);
      if (result.success) {
        await storeInCache(record.domain, result);
        return result;
      }

      // Anymail failed, try SSM
      result = await ssmEnrich(record.firstName, record.lastName, record.domain, config);
      await storeInCache(record.domain, result);
      return result;
    }

    // No email, but has name + domain → Anymail → SSM
    if (record.fullName && record.domain) {
      result = await anymailEnrich(record.fullName, record.domain, config);
      if (result.success) {
        await storeInCache(record.domain, result);
        return result;
      }

      // Anymail failed, try SSM
      result = await ssmEnrich(record.firstName, record.lastName, record.domain, config);
      await storeInCache(record.domain, result);
      return result;
    }

    // Nothing to work with
    return { success: false, email: null, firstName: '', lastName: '', title: '', verified: false, source: 'existing' };
  }

  // Startup Jobs - no contact, need to find by role
  result = await apolloEnrich(record.domain, signal || record.signal, config);
  await storeInCache(record.domain, result);
  return result;
}

// =============================================================================
// VERIFICATION
// =============================================================================

/**
 * Verify an email using SSM or Anymail.
 *
 * DOCTRINE (fixed order):
 * 1. SSM Verify first (if user has SSM)
 * 2. Anymail Verify fallback (if user has Anymail)
 * 3. If both fail → return false (discard email)
 *
 * NO regex-only checks. NO blind trust.
 */
async function verifyEmail(email: string, config: EnrichmentConfig): Promise<boolean> {
  if (!email || !email.includes('@')) return false;

  console.log(`[Enrichment] Verifying email: ${email}`);

  // STEP 1: Try SSM first (if available)
  if (config.ssmApiKey) {
    try {
      console.log(`[Enrichment] Trying SSM verify for: ${email}`);
      const result = await ssmVerifyEmail(config.ssmApiKey, email);
      if (result.success) {
        if (result.status === 'verified') {
          console.log(`[Enrichment] SSM verified: ${email}`);
          return true;
        } else {
          console.log(`[Enrichment] SSM rejected: ${email} (status: ${result.status})`);
          // Don't return false yet - try Anymail fallback
        }
      }
    } catch (err) {
      console.error('[Enrichment] SSM verification error:', err);
      // Continue to Anymail fallback
    }
  }

  // STEP 2: Try Anymail verify (if available)
  if (config.anymailApiKey) {
    try {
      console.log(`[Enrichment] Trying Anymail verify for: ${email}`);
      const response = await fetch(
        `https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/anymail-finder`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'verify_email',
            apiKey: config.anymailApiKey,
            email,
          }),
        }
      );

      const data = await response.json();
      console.log(`[Enrichment] Anymail verify response:`, data);

      if (data.success && data.verification_status === 'verified') {
        console.log(`[Enrichment] Anymail verified: ${email}`);
        return true;
      } else if (data.success) {
        console.log(`[Enrichment] Anymail rejected: ${email} (status: ${data.verification_status})`);
        return false;
      }
    } catch (err) {
      console.error('[Enrichment] Anymail verification error:', err);
    }
  }

  // STEP 3: No provider available or both failed
  if (!config.ssmApiKey && !config.anymailApiKey) {
    console.log(`[Enrichment] No verification provider configured, cannot verify: ${email}`);
    return false; // Cannot verify = fail
  }

  console.log(`[Enrichment] Verification failed for: ${email}`);
  return false; // Both providers failed = discard
}

// =============================================================================
// ANYMAIL ENRICHMENT
// =============================================================================

/**
 * Find email using Anymail Finder (name + domain).
 * Anymail finds AND verifies in one step.
 */
async function anymailEnrich(
  fullName: string,
  domain: string,
  config: EnrichmentConfig
): Promise<EnrichmentResult> {

  if (!config.anymailApiKey) {
    return { success: false, email: null, firstName: '', lastName: '', title: '', verified: false, source: 'anymail' };
  }

  try {
    const response = await fetch(
      `https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/anymail-finder`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'find_person',  // Correct param name for edge function
          apiKey: config.anymailApiKey,
          domain,
          full_name: fullName,  // Edge function expects full_name, not fullName
        }),
      }
    );

    const data = await response.json();
    console.log('[Enrichment] Anymail find response:', data);

    if (data.success && data.email) {
      const nameParts = fullName.split(' ');
      return {
        success: true,
        email: data.email,
        firstName: data.name?.split(' ')[0] || nameParts[0] || '',
        lastName: data.name?.split(' ').slice(1).join(' ') || nameParts.slice(1).join(' ') || '',
        title: data.title || '',
        verified: true, // Anymail verifies when finding
        source: 'anymail',
      };
    }
  } catch (err) {
    console.error('[Enrichment] Anymail find failed:', err);
  }

  return { success: false, email: null, firstName: '', lastName: '', title: '', verified: false, source: 'anymail' };
}

// =============================================================================
// SSM ENRICHMENT
// =============================================================================

/**
 * Find email using SSMasters (name + domain).
 * Used as final fallback when Apollo and Anymail fail.
 */
async function ssmEnrich(
  firstName: string,
  lastName: string,
  domain: string,
  config: EnrichmentConfig
): Promise<EnrichmentResult> {

  if (!config.ssmApiKey) {
    return { success: false, email: null, firstName: '', lastName: '', title: '', verified: false, source: 'existing' };
  }

  try {
    // SSM requires first and last name separately
    // If we don't have them, we can't use SSM for finding
    if (!firstName && !lastName) {
      console.log('[Enrichment] SSM skipped - no name provided');
      return { success: false, email: null, firstName: '', lastName: '', title: '', verified: false, source: 'existing' };
    }

    const result = await ssmFindEmail(config.ssmApiKey, firstName, lastName, domain);

    if (result.success && result.email) {
      console.log(`[Enrichment] SSM found: ${result.email}`);
      return {
        success: true,
        email: result.email,
        firstName: firstName,
        lastName: lastName,
        title: '',
        verified: true,
        source: 'existing', // SSM verifies when finding
      };
    }
  } catch (err) {
    console.error('[Enrichment] SSM failed:', err);
  }

  return { success: false, email: null, firstName: '', lastName: '', title: '', verified: false, source: 'existing' };
}

// =============================================================================
// APOLLO ENRICHMENT
// =============================================================================

/**
 * Find decision maker using Apollo (by role/signal).
 *
 * TWO-STEP PROCESS:
 * 1. people_search → Find person (returns name, title, has_email)
 * 2. people_match → Reveal email (requires name + domain)
 *
 * Falls back to Anymail/SSM if Apollo fails.
 */
async function apolloEnrich(
  domain: string,
  signal: string,
  config: EnrichmentConfig
): Promise<EnrichmentResult> {

  if (!config.apolloApiKey) {
    // No Apollo, try Anymail directly
    return await anymailEnrich('', domain, config);
  }

  try {
    // STEP 1: Find decision maker via people_search
    const targetTitles = inferTargetTitles(signal);

    const searchResponse = await fetch(
      `https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/apollo-enrichment`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'people_search',
          apiKey: config.apolloApiKey,
          domain,
          titles: targetTitles,
        }),
      }
    );

    const searchData = await searchResponse.json();
    console.log('[Enrichment] Apollo search response:', JSON.stringify(searchData).slice(0, 500));

    const people = searchData.people || [];

    // Find best candidate (has_email: true preferred)
    const candidate = people.find((p: any) => p.has_email === true || p.has_email === 'Yes') || people[0];

    if (!candidate) {
      console.log('[Enrichment] Apollo found no people at', domain);
      // Fall through to Anymail/SSM
    } else {
      const firstName = candidate.first_name;
      const lastName = candidate.last_name || candidate.last_name_obfuscated?.replace(/\*+/g, '') || '';

      // If search already returned email, use it
      const directEmail = candidate.email || candidate.email_from_pdl;
      if (directEmail && firstName) {
        console.log('[Enrichment] Apollo search returned email directly');
        return {
          success: true,
          email: directEmail,
          firstName,
          lastName,
          title: candidate.title || '',
          verified: true,
          source: 'apollo',
        };
      }

      // STEP 2: Reveal email via people_match (if has_email but no email returned)
      if (firstName && (candidate.has_email === true || candidate.has_email === 'Yes')) {
        console.log('[Enrichment] Apollo revealing email for:', firstName, lastName, '@', domain);

        const matchResponse = await fetch(
          `https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/apollo-enrichment`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'people_match',
              apiKey: config.apolloApiKey,
              payload: {
                first_name: firstName,
                last_name: lastName,
                organization_domain: domain,
                reveal_personal_emails: true,
              },
            }),
          }
        );

        const matchData = await matchResponse.json();
        console.log('[Enrichment] Apollo match response:', JSON.stringify(matchData).slice(0, 300));

        const matchedPerson = matchData.person;
        if (matchedPerson?.email) {
          return {
            success: true,
            email: matchedPerson.email,
            firstName: matchedPerson.first_name || firstName,
            lastName: matchedPerson.last_name || lastName,
            title: matchedPerson.title || candidate.title || '',
            verified: true,
            source: 'apollo',
          };
        }
      }

      // Have name but couldn't get email - try Anymail with the name we found
      if (firstName) {
        const fullName = `${firstName} ${lastName}`.trim();
        console.log('[Enrichment] Apollo had name, trying Anymail:', fullName);
        const anymailResult = await anymailEnrich(fullName, domain, config);
        if (anymailResult.success) {
          return anymailResult;
        }

        // Try SSM with the name
        const ssmResult = await ssmEnrich(firstName, lastName, domain, config);
        if (ssmResult.success) {
          return ssmResult;
        }
      }
    }
  } catch (err) {
    console.error('[Enrichment] Apollo failed:', err);
  }

  // Apollo failed completely, try Anymail as fallback (no name)
  const anymailResult = await anymailEnrich('', domain, config);
  if (anymailResult.success) {
    return anymailResult;
  }

  // Anymail also failed, try SSM as final fallback
  return await ssmEnrich('', '', domain, config);
}

/**
 * Infer target job titles based on the signal.
 *
 * "hiring engineers" → VP Engineering, CTO, Engineering Manager
 * "hiring sales" → VP Sales, Head of Sales, Sales Director
 */
function inferTargetTitles(signal: string): string[] {
  const lowerSignal = signal.toLowerCase();

  // Engineering roles
  if (lowerSignal.includes('engineer') || lowerSignal.includes('developer') || lowerSignal.includes('software')) {
    return ['VP Engineering', 'CTO', 'Engineering Manager', 'Head of Engineering', 'Director of Engineering'];
  }

  // Sales roles
  if (lowerSignal.includes('sales') || lowerSignal.includes('account executive') || lowerSignal.includes('sdr')) {
    return ['VP Sales', 'Head of Sales', 'Sales Director', 'CRO', 'Chief Revenue Officer'];
  }

  // Marketing roles
  if (lowerSignal.includes('marketing') || lowerSignal.includes('growth')) {
    return ['VP Marketing', 'CMO', 'Head of Marketing', 'Director of Marketing', 'Head of Growth'];
  }

  // HR/Recruiting roles
  if (lowerSignal.includes('recruiter') || lowerSignal.includes('hr') || lowerSignal.includes('talent')) {
    return ['VP HR', 'Head of Talent', 'Director of HR', 'Chief People Officer', 'Head of People'];
  }

  // Finance roles
  if (lowerSignal.includes('finance') || lowerSignal.includes('accounting') || lowerSignal.includes('cfo')) {
    return ['CFO', 'VP Finance', 'Head of Finance', 'Controller', 'Director of Finance'];
  }

  // Product roles
  if (lowerSignal.includes('product') || lowerSignal.includes('pm')) {
    return ['VP Product', 'CPO', 'Head of Product', 'Director of Product', 'Product Manager'];
  }

  // Default to C-level / founders
  return ['CEO', 'Founder', 'Co-Founder', 'COO', 'Managing Director'];
}

// =============================================================================
// BATCH ENRICHMENT
// =============================================================================

/**
 * Enrich multiple records.
 */
export async function enrichBatch(
  records: NormalizedRecord[],
  schema: Schema,
  config: EnrichmentConfig,
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, EnrichmentResult>> {

  const results = new Map<string, EnrichmentResult>();

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const result = await enrichRecord(record, schema, config, record.signal);

    // Key by domain for deduplication
    results.set(record.domain, result);

    if (onProgress) {
      onProgress(i + 1, records.length);
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return results;
}
