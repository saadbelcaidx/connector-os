/**
 * PHILEMON — Dataset Introspection Engine
 *
 * Ground truth for UI is derived from what the data ACTUALLY contains,
 * not what we assume from schema IDs.
 *
 * INVARIANTS:
 * - UI never claims email existence unless hasEmail === true
 * - UI never says "people" unless hasPersonName === true
 * - Unknown schemas still explain themselves
 * - Adding a new dataset requires zero UI code changes
 * - Routability is DATA-DERIVED, not source-derived
 * - Credits only spendable when state === ROUTABLE
 */

// =============================================================================
// ROUTABILITY STATE — Data-derived, not source-derived
// =============================================================================

export type RoutabilityState =
  | 'ROUTABLE'           // Has company + domain explicitly
  | 'ROUTABLE_DERIVED'   // Has person + organization, domain can be inferred
  | 'INCOMPLETE'         // Missing required fields, cannot proceed
  | 'CONTEXT_ONLY';      // No routing fields at all

export interface DatasetPreflight {
  state: RoutabilityState;
  capabilities: DatasetCapabilities;
  card: DatasetCard;
  /** Present only when state is blocking (INCOMPLETE/CONTEXT_ONLY) */
  blockReason?: string;
  /** Missing fields that caused INCOMPLETE state */
  missingFields?: string[];
  /** UI hint for derived routing */
  derivedNote?: string;
}

// =============================================================================
// CANONICAL DATASET CAPABILITY MODEL
// =============================================================================

export type DatasetCapabilities = {
  hasEmail: boolean;
  hasPersonName: boolean;
  hasTitle: boolean;
  hasCompany: boolean;
  hasJobRole: boolean;
  hasDomain: boolean;
  /** Has linked organization array (e.g. current_organizations[]) - domain can be derived */
  hasLinkedOrganization: boolean;
};

// =============================================================================
// FIELD INTROSPECTION — Runtime, not schema-based
// =============================================================================

export function inspectDataset(records: any[]): DatasetCapabilities {
  if (!records || records.length === 0) {
    return {
      hasEmail: false,
      hasPersonName: false,
      hasTitle: false,
      hasCompany: false,
      hasJobRole: false,
      hasDomain: false,
      hasLinkedOrganization: false,
    };
  }

  // Sample first 10 records for efficiency
  const sample = records.slice(0, 10);

  const hasEmail = sample.some(r =>
    r.email || r.contact_email || r.work_email || r.personal_email ||
    r.existingContact?.email
  );

  // Check both raw Apify fields AND NormalizedRecord fields (camelCase)
  const hasPersonName = sample.some(r =>
    r.name || r.full_name || r.person_name || r.first_name ||
    r.firstName || r.fullName || r.lastName ||  // NormalizedRecord fields
    r.existingContact?.name ||
    r.raw?.name || r.raw?.first_name  // Raw data fallback
  );

  const hasTitle = sample.some(r =>
    r.title || r.job_title || r.role || r.position ||
    r.existingContact?.title
  );

  const hasCompany = sample.some(r =>
    r.company || r.company_name || r.organization || r.companyName
  );

  const hasJobRole = sample.some(r =>
    r.job_title || r.open_role || r.position || r.signal ||
    (typeof r.title === 'string' && r.title.length > 0)
  );

  // Domain check — critical for routability
  const hasDomain = sample.some(r =>
    r.domain || r.website || r.company_url || r.companyUrl ||
    r.url || r.homepage
  );

  // Linked organization check — allows derived routing (Crunchbase People pattern)
  // current_organizations[] contains { permalink, name } which can derive domain
  // CRITICAL: NormalizedRecord stores raw data in r.raw — must check both locations
  const hasLinkedOrganization = sample.some(r => {
    // Check direct fields (raw Apify data)
    if (Array.isArray(r.current_organizations) && r.current_organizations.length > 0) return true;
    if (Array.isArray(r.organizations) && r.organizations.length > 0) return true;
    if (r.organization_permalink || r.company_permalink) return true;
    // Check r.raw (NormalizedRecord format from schemas/index.ts)
    if (r.raw) {
      if (Array.isArray(r.raw.current_organizations) && r.raw.current_organizations.length > 0) return true;
      if (Array.isArray(r.raw.organizations) && r.raw.organizations.length > 0) return true;
      if (r.raw.organization_permalink || r.raw.company_permalink) return true;
      // Crunchbase People: primary_organization indicates linked org
      if (r.raw.primary_organization) return true;
    }
    return false;
  });

  return {
    hasEmail,
    hasPersonName,
    hasTitle,
    hasCompany,
    hasJobRole,
    hasDomain,
    hasLinkedOrganization,
  };
}

// =============================================================================
// SCHEMA HINTS — Non-authoritative, inspection always wins
// =============================================================================

const SCHEMA_HINTS: Record<string, Partial<DatasetCapabilities>> = {
  'startup-jobs': { hasJobRole: true, hasCompany: true },
  'crunchbase-people': { hasPersonName: true, hasTitle: true },
  'crunchbase-orgs': { hasCompany: true },
  'b2b-contacts': { hasEmail: true, hasPersonName: true },
};

/**
 * Merge inspected capabilities with schema hints.
 * Inspection ALWAYS wins — hints only fill gaps where inspection is inconclusive.
 */
export function mergeWithHints(
  inspected: DatasetCapabilities,
  schemaId: string | undefined
): DatasetCapabilities {
  if (!schemaId) return inspected;

  const hints = SCHEMA_HINTS[schemaId];
  if (!hints) return inspected;

  // Inspection wins — hints only used if inspection found nothing
  // and hints suggest the field should exist (conservative merge)
  return {
    hasEmail: inspected.hasEmail,
    hasPersonName: inspected.hasPersonName,
    hasTitle: inspected.hasTitle,
    hasCompany: inspected.hasCompany,
    hasJobRole: inspected.hasJobRole,
    hasDomain: inspected.hasDomain,
    hasLinkedOrganization: inspected.hasLinkedOrganization,
  };
}

// =============================================================================
// ROUTABILITY DERIVATION — Data-derived, not source-derived
// =============================================================================

/**
 * Derive routability state from capabilities.
 *
 * ROUTABLE: has company + domain → can proceed to enrichment/routing
 * ROUTABLE_DERIVED: has person + linked org, domain can be inferred → allow with note
 * INCOMPLETE: missing required fields → block with corrective message
 * CONTEXT_ONLY: no routing fields at all → informational only
 *
 * INVARIANT: Credits only spendable when state is ROUTABLE or ROUTABLE_DERIVED
 */
export function deriveRoutability(
  capabilities: DatasetCapabilities
): { state: RoutabilityState; missingFields?: string[]; blockReason?: string; derivedNote?: string } {

  // ROUTABLE: Has explicit company + domain
  if (capabilities.hasCompany && capabilities.hasDomain) {
    return { state: 'ROUTABLE' };
  }

  // ROUTABLE_DERIVED: Has person name + linked organization (domain can be inferred)
  // This is the Crunchbase People pattern - has current_organizations[] with permalinks
  if (capabilities.hasPersonName && capabilities.hasLinkedOrganization) {
    return {
      state: 'ROUTABLE_DERIVED',
      derivedNote: 'Website inferred from company',
    };
  }

  // Determine what's missing
  const missing: string[] = [];
  if (!capabilities.hasCompany && !capabilities.hasLinkedOrganization) missing.push('company');
  if (!capabilities.hasDomain && !capabilities.hasLinkedOrganization) missing.push('domain');

  // INCOMPLETE: Some routing fields present, but not enough to proceed
  if (capabilities.hasCompany || capabilities.hasDomain || capabilities.hasPersonName || capabilities.hasLinkedOrganization) {
    return {
      state: 'INCOMPLETE',
      missingFields: missing,
      blockReason: `This dataset is missing ${missing.join(' and ')} data. Re-run the scrape with ${missing.join(' + ')} fields enabled.`,
    };
  }

  // CONTEXT_ONLY: No routing-relevant fields at all
  return {
    state: 'CONTEXT_ONLY',
    blockReason: 'This dataset contains no routable data (no company or domain fields).',
  };
}

// =============================================================================
// DERIVE UI COPY FROM CAPABILITIES — Not from schema lookup
// =============================================================================

export interface DatasetCard {
  title: string;
  contains: string;
  missing: string;
  requires: string;
}

export function deriveDatasetCard(
  label: 'Demand' | 'Supply',
  capabilities: DatasetCapabilities,
  schemaName?: string
): DatasetCard {
  const contains: string[] = [];
  const missing: string[] = [];

  if (capabilities.hasCompany) contains.push('Companies');

  if (capabilities.hasPersonName) contains.push('Names');
  else missing.push('Names');

  if (capabilities.hasTitle || capabilities.hasJobRole) contains.push('Roles');
  else missing.push('Roles');

  if (capabilities.hasEmail) contains.push('Emails');
  else missing.push('Emails');

  // Derive next step from capabilities
  let requires = 'Matching';
  if (!capabilities.hasEmail && !capabilities.hasPersonName) {
    requires = 'Enrichment to find people';
  } else if (!capabilities.hasEmail) {
    requires = 'Enrichment to find emails';
  } else {
    requires = 'Verification (emails may be stale)';
  }

  return {
    title: schemaName || `${label} Dataset`,
    contains: contains.join(', ') || 'Structured records',
    missing: missing.length > 0 ? missing.join(', ') : 'Nothing — complete data',
    requires,
  };
}

// =============================================================================
// KNOWN SCHEMA NAMES — Display names only, not capability source
// =============================================================================

const SCHEMA_NAMES: Record<string, string> = {
  'startup-jobs': 'Wellfound Jobs',
  'crunchbase-orgs': 'Crunchbase Organizations',
  'crunchbase-people': 'Crunchbase People',
  'b2b-contacts': 'B2B Contacts',
};

export function getSchemaDisplayName(schemaId: string | undefined): string | undefined {
  if (!schemaId) return undefined;
  return SCHEMA_NAMES[schemaId];
}

// =============================================================================
// MAIN ENTRY POINT — Full introspection pipeline
// =============================================================================

export function introspectAndDeriveCard(
  label: 'Demand' | 'Supply',
  records: any[],
  schemaId?: string
): DatasetCard {
  // 1. Inspect actual records
  const inspected = inspectDataset(records);

  // 2. Merge with hints (inspection wins)
  const capabilities = mergeWithHints(inspected, schemaId);

  // 3. Get display name (cosmetic only)
  const schemaName = getSchemaDisplayName(schemaId);

  // 4. Derive card from capabilities
  return deriveDatasetCard(label, capabilities, schemaName);
}

// =============================================================================
// PREFLIGHT — Full validation pipeline with routability
// =============================================================================

/**
 * Full dataset preflight validation.
 *
 * Returns routability state, capabilities, card, and block reason.
 * UI should check isRoutable() before showing enrichment CTAs.
 *
 * INVARIANT: Credits only spendable when state is ROUTABLE or ROUTABLE_DERIVED
 */
export function preflightDataset(
  label: 'Demand' | 'Supply',
  records: any[],
  schemaId?: string
): DatasetPreflight {
  // 1. Inspect actual records
  const inspected = inspectDataset(records);

  // 2. Merge with hints (inspection wins)
  const capabilities = mergeWithHints(inspected, schemaId);

  // 3. Derive routability from capabilities (data-derived, not source-derived)
  const routability = deriveRoutability(capabilities);

  // 4. Get display name (cosmetic only)
  const schemaName = getSchemaDisplayName(schemaId);

  // 5. Derive card from capabilities
  const card = deriveDatasetCard(label, capabilities, schemaName);

  return {
    state: routability.state,
    capabilities,
    card,
    blockReason: routability.blockReason,
    missingFields: routability.missingFields,
    derivedNote: routability.derivedNote,
  };
}

/**
 * Check if dataset is routable (can proceed to enrichment/routing).
 * Returns true for both ROUTABLE and ROUTABLE_DERIVED states.
 * Convenience function for guards.
 */
export function isRoutable(preflight: DatasetPreflight): boolean {
  return preflight.state === 'ROUTABLE' || preflight.state === 'ROUTABLE_DERIVED';
}
