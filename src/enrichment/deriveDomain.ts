/**
 * DERIVE DOMAIN — Foundation for Enrichment Router
 *
 * PHILEMON: Domain derivation is explicit, never guessed.
 *
 * Output: { domain, source }
 * - explicit: domain came directly from data (website, domain field)
 * - inferred: domain derived from organization permalink (requires verification)
 * - none: no domain could be derived
 *
 * INVARIANT: Inferred domains must pass verification before credit-spending calls.
 */

// =============================================================================
// TYPES
// =============================================================================

export type DomainSource = 'explicit' | 'inferred' | 'none';

export type DerivedDomain = {
  domain: string | null;
  source: DomainSource;
  /** When source is 'inferred', this explains how */
  inferenceMethod?: 'permalink' | 'company_name';
  /** Original value before cleaning (for debugging) */
  rawValue?: string;
};

// =============================================================================
// DOMAIN CLEANING
// =============================================================================

/**
 * Clean a URL or domain string to pure domain.
 * "https://www.example.com/path" → "example.com"
 */
function cleanDomain(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;

  let domain = raw.trim();
  if (!domain) return null;

  // Remove protocol
  domain = domain.replace(/^https?:\/\//, '');
  // Remove www.
  domain = domain.replace(/^www\./, '');
  // Remove path, query, fragment
  domain = domain.split('/')[0].split('?')[0].split('#')[0];
  // Remove port
  domain = domain.split(':')[0];
  // Lowercase
  domain = domain.toLowerCase();

  // Validate: must have at least one dot and no spaces
  if (!domain.includes('.') || domain.includes(' ')) {
    return null;
  }

  return domain || null;
}

/**
 * Derive domain from organization permalink.
 * "prosper-marketplace" → "prospermarketplace.com" (INFERRED, not verified)
 *
 * This is a heuristic. PHILEMON marks it as inferred.
 */
function domainFromPermalink(permalink: string | null | undefined): string | null {
  if (!permalink || typeof permalink !== 'string') return null;

  // Clean: remove hyphens, lowercase, add .com
  const cleaned = permalink
    .toLowerCase()
    .replace(/-/g, '')
    .replace(/[^a-z0-9]/g, '');

  if (cleaned.length < 2) return null;

  return `${cleaned}.com`;
}

/**
 * Derive domain from company name (last resort, low confidence).
 * "Prosper Marketplace" → "prospermarketplace.com" (INFERRED)
 */
function domainFromCompanyName(company: string | null | undefined): string | null {
  if (!company || typeof company !== 'string') return null;

  const cleaned = company
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '')
    .replace(/(inc|llc|ltd|corp|co|company)$/i, '');

  if (cleaned.length < 2) return null;

  return `${cleaned}.com`;
}

// =============================================================================
// MAIN DERIVATION FUNCTION
// =============================================================================

/**
 * Derive domain from any record shape.
 *
 * Priority (explicit first, then inferred):
 * 1. record.domain (explicit)
 * 2. record.website (explicit)
 * 3. record.raw?.domain (explicit)
 * 4. record.raw?.website (explicit)
 * 5. record.raw?.website?.value (Crunchbase pattern, explicit)
 * 6. record.raw?.primary_organization?.permalink (inferred)
 * 7. record.raw?.current_organizations[0]?.permalink (inferred)
 * 8. record.company → derive from name (inferred, lowest confidence)
 *
 * @returns DerivedDomain with source indicating confidence level
 */
export function deriveDomain(record: any): DerivedDomain {
  if (!record || typeof record !== 'object') {
    return { domain: null, source: 'none' };
  }

  // ==========================================================================
  // EXPLICIT SOURCES (high confidence, no verification needed)
  // ==========================================================================

  // 1. Direct domain field
  const directDomain = cleanDomain(record.domain);
  if (directDomain) {
    return { domain: directDomain, source: 'explicit', rawValue: record.domain };
  }

  // 2. Website field
  const websiteDomain = cleanDomain(record.website);
  if (websiteDomain) {
    return { domain: websiteDomain, source: 'explicit', rawValue: record.website };
  }

  // 3. Raw domain field
  const rawDomain = cleanDomain(record.raw?.domain);
  if (rawDomain) {
    return { domain: rawDomain, source: 'explicit', rawValue: record.raw?.domain };
  }

  // 4. Raw website field (string)
  const rawWebsite = cleanDomain(record.raw?.website);
  if (rawWebsite) {
    return { domain: rawWebsite, source: 'explicit', rawValue: record.raw?.website };
  }

  // 5. Raw website.value (Crunchbase nested pattern)
  const rawWebsiteValue = cleanDomain(record.raw?.website?.value);
  if (rawWebsiteValue) {
    return { domain: rawWebsiteValue, source: 'explicit', rawValue: record.raw?.website?.value };
  }

  // 6. company_url / companyUrl patterns
  const companyUrl = cleanDomain(record.company_url || record.companyUrl || record.raw?.company_url);
  if (companyUrl) {
    return { domain: companyUrl, source: 'explicit', rawValue: record.company_url || record.companyUrl };
  }

  // ==========================================================================
  // INFERRED SOURCES (lower confidence, should verify before spending credits)
  // ==========================================================================

  // 7. Primary organization permalink (Crunchbase People)
  const primaryOrgPermalink = record.raw?.primary_organization?.permalink;
  if (primaryOrgPermalink) {
    const inferred = domainFromPermalink(primaryOrgPermalink);
    if (inferred) {
      return {
        domain: inferred,
        source: 'inferred',
        inferenceMethod: 'permalink',
        rawValue: primaryOrgPermalink
      };
    }
  }

  // 8. Current organizations permalink (first one)
  const currentOrgs = record.raw?.current_organizations;
  if (Array.isArray(currentOrgs) && currentOrgs.length > 0) {
    const firstOrgPermalink = currentOrgs[0]?.permalink;
    if (firstOrgPermalink) {
      const inferred = domainFromPermalink(firstOrgPermalink);
      if (inferred) {
        return {
          domain: inferred,
          source: 'inferred',
          inferenceMethod: 'permalink',
          rawValue: firstOrgPermalink
        };
      }
    }
  }

  // 9. Company name derivation (lowest confidence)
  const companyName = record.company || record.raw?.company || record.raw?.name;
  if (companyName && typeof companyName === 'string') {
    const inferred = domainFromCompanyName(companyName);
    if (inferred) {
      return {
        domain: inferred,
        source: 'inferred',
        inferenceMethod: 'company_name',
        rawValue: companyName
      };
    }
  }

  // ==========================================================================
  // NO DOMAIN FOUND
  // ==========================================================================

  return { domain: null, source: 'none' };
}

// =============================================================================
// BATCH DERIVATION
// =============================================================================

/**
 * Derive domains for a batch of records.
 * Returns Map<recordIndex, DerivedDomain> for O(1) lookup.
 */
export function deriveDomainBatch(records: any[]): Map<number, DerivedDomain> {
  const results = new Map<number, DerivedDomain>();

  for (let i = 0; i < records.length; i++) {
    results.set(i, deriveDomain(records[i]));
  }

  return results;
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Check if domain is explicit (high confidence, no verification needed).
 */
export function isExplicitDomain(derived: DerivedDomain): boolean {
  return derived.source === 'explicit' && derived.domain !== null;
}

/**
 * Check if domain is inferred (needs verification before credit-spending).
 */
export function isInferredDomain(derived: DerivedDomain): boolean {
  return derived.source === 'inferred' && derived.domain !== null;
}

/**
 * Check if any domain exists (explicit or inferred).
 */
export function hasDomain(derived: DerivedDomain): boolean {
  return derived.domain !== null;
}
