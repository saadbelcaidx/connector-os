/**
 * CONTACT COMPLETION — VALIDATION + ENRICHMENT
 *
 * Decision maker exists. Email is the gate.
 * Validate → Enrich (if needed) → Block (if still missing).
 */

import type { CanonicalEntity, Evidence, BlockReason } from './types';
import type { CachedDecisionMaker, CachedEmail } from './cache';
import { cacheLookup, cacheStore, mergeFromCache, entityToCachedDM } from './cache';

// =============================================================================
// VALIDATION RESULT
// =============================================================================

export interface ValidationResult {
  email: string;
  valid: boolean;
  status: 'valid' | 'invalid' | 'unknown' | 'catch_all' | 'disposable';
  checkedAt: string;
}

export interface ContactStageOutput {
  entities: CanonicalEntity[];
  blocked: BlockReason[];
  metrics: {
    cacheHits: number;
    cacheMisses: number;
    validated: number;
    enriched: number;
    readyToSend: number;
    blockedNoEmail: number;
    processingMs: number;
  };
}

// =============================================================================
// EMAIL VALIDATION
// =============================================================================

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Basic email format validation.
 * For full validation, use external service.
 */
export function validateEmailFormat(email: string): boolean {
  return emailRegex.test(email);
}

/**
 * Validate emails on a decision maker.
 * Returns list of validated emails.
 */
export async function validateEmails(
  emails: string[],
  config?: { apiKey?: string }
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  const now = new Date().toISOString();

  for (const email of emails) {
    // Basic format check first
    if (!validateEmailFormat(email)) {
      results.push({
        email,
        valid: false,
        status: 'invalid',
        checkedAt: now,
      });
      continue;
    }

    // For now, assume valid if format passes
    // Full validation would call Anymail API here
    results.push({
      email,
      valid: true,
      status: 'valid',
      checkedAt: now,
    });
  }

  return results;
}

/**
 * Get first valid email from entity.
 */
export function getValidEmail(entity: CanonicalEntity): string | null {
  for (const email of entity.contacts.emails) {
    if (validateEmailFormat(email)) {
      return email;
    }
  }
  return null;
}

/**
 * Check if entity has valid email (is routable).
 */
export function isRoutable(entity: CanonicalEntity): boolean {
  return getValidEmail(entity) !== null;
}

// =============================================================================
// ENRICHMENT (STUB FOR NOW)
// =============================================================================

export interface EnrichmentConfig {
  apolloApiKey?: string;
  anymailApiKey?: string;
  enabled: boolean;
}

export interface EnrichmentResult {
  success: boolean;
  email?: string;
  name?: string;
  title?: string;
  source: 'apollo' | 'anymail';
  error?: string;
}

/**
 * Enrich decision maker to find missing email.
 * Only called when no valid email exists.
 */
export async function enrichDecisionMaker(
  entity: CanonicalEntity,
  config: EnrichmentConfig
): Promise<EnrichmentResult> {
  if (!config.enabled) {
    console.log('[Enrich] Disabled, skipping:', entity.company.domain);
    return { success: false, source: 'apollo', error: 'Enrichment disabled' };
  }

  const domain = entity.company.domain;
  const name = entity.person?.fullName;

  if (!domain) {
    return { success: false, source: 'apollo', error: 'No domain' };
  }

  console.log('[Enrich] Starting for:', domain, name || '(no name)');

  // Apollo enrichment would go here
  // For now, return stub
  console.log('[Enrich] Not yet implemented');
  return { success: false, source: 'apollo', error: 'Not implemented' };
}

// =============================================================================
// CONTACT COMPLETION STAGE
// =============================================================================

/**
 * Complete contacts for matched entities.
 *
 * Flow:
 * 1. Cache lookup
 * 2. Merge cached contacts
 * 3. Validate emails
 * 4. Enrich if no valid email
 * 5. Cache persist
 * 6. Block if still no valid email
 */
export async function stageContactCompletion(
  entities: CanonicalEntity[],
  enrichmentConfig: EnrichmentConfig
): Promise<ContactStageOutput> {
  const startMs = Date.now();
  console.log('[Pipeline:contact] Starting for', entities.length, 'entities');

  const completed: CanonicalEntity[] = [];
  const blocked: BlockReason[] = [];

  let cacheHits = 0;
  let cacheMisses = 0;
  let validated = 0;
  let enriched = 0;
  let readyToSend = 0;
  let blockedNoEmail = 0;

  for (const entity of entities) {
    let current = entity;

    // Step 1: Cache lookup
    const cached = cacheLookup(entity);
    if (cached) {
      cacheHits++;
      current = mergeFromCache(entity, cached);
    } else {
      cacheMisses++;
    }

    // Step 2: Validate emails
    const validationResults = await validateEmails(current.contacts.emails);
    validated += validationResults.length;

    // Keep only valid emails
    const validEmails = validationResults
      .filter(r => r.valid)
      .map(r => r.email);

    current = {
      ...current,
      contacts: {
        ...current.contacts,
        emails: validEmails,
      },
    };

    // Step 3: Enrich if no valid email
    if (validEmails.length === 0) {
      const enrichResult = await enrichDecisionMaker(current, enrichmentConfig);

      if (enrichResult.success && enrichResult.email) {
        enriched++;
        current = {
          ...current,
          contacts: {
            ...current.contacts,
            emails: [enrichResult.email],
          },
          person: {
            ...current.person,
            fullName: enrichResult.name || current.person?.fullName,
            title: enrichResult.title || current.person?.title,
          },
          evidence: [
            ...current.evidence,
            {
              field: 'contacts.emails',
              value: enrichResult.email,
              sourcePath: `enrichment:${enrichResult.source}`,
              extractor: `${enrichResult.source}@1.0.0`,
              confidence: 0.85,
            },
          ],
        };
      }
    }

    // Step 4: Cache persist
    if (current.contacts.emails.length > 0) {
      const dm = entityToCachedDM(current, 'apify');
      cacheStore(dm);
    }

    // Step 5: Check if ready to send
    if (isRoutable(current)) {
      readyToSend++;
      completed.push(current);
    } else {
      blockedNoEmail++;
      blocked.push({
        stage: 'Enrich',
        code: 'NO_EMAIL_FOUND',
        message: `No valid email for: ${current.company.domain || current.company.name}`,
        details: {
          entityId: current.entityId,
          domain: current.company.domain,
          name: current.person?.fullName,
          triedEnrichment: enrichmentConfig.enabled,
        },
      });
    }
  }

  const elapsedMs = Date.now() - startMs;

  console.log('[Pipeline:contact] Complete:', {
    input: entities.length,
    cacheHits,
    cacheMisses,
    validated,
    enriched,
    readyToSend,
    blockedNoEmail,
    ms: elapsedMs,
  });

  return {
    entities: completed,
    blocked,
    metrics: {
      cacheHits,
      cacheMisses,
      validated,
      enriched,
      readyToSend,
      blockedNoEmail,
      processingMs: elapsedMs,
    },
  };
}
