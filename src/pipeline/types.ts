/**
 * PIPELINE TYPES — CANONICAL DATA MODEL
 *
 * Single source of truth for all pipeline data structures.
 * No hardcoded field lists. Schema-agnostic extraction.
 */

// =============================================================================
// EXECUTION MODE
// =============================================================================

/**
 * MATCHING_ONLY: Both sides complete (domain + email present)
 *   → Load → Match → Verify → Intros → Send
 *
 * ACTION: Either side partial (needs enrichment)
 *   → Load → Enrich BOTH → Match → Verify → Intros → Send
 */
export type ExecutionMode = 'MATCHING_ONLY' | 'ACTION';

// =============================================================================
// RAW ENVELOPE (CONNECTOR OUTPUT)
// =============================================================================

export interface RawEnvelopeSource {
  provider: 'apify' | 'api' | 'upload';
  sourceId?: string;
  datasetType?: string;
  fetchedAt: string;
}

export interface RawEnvelopeMeta {
  itemizationMethod: 'array' | 'data' | 'items' | 'results' | 'single' | 'empty';
  itemCount: number;
  wrapperKeysDetected: string[];
}

export interface RawEnvelope {
  source: RawEnvelopeSource;
  payload: unknown;
  items: unknown[];
  meta: RawEnvelopeMeta;
}

// =============================================================================
// EVIDENCE (TRACEABILITY)
// =============================================================================

export interface Evidence {
  field: string;
  value: string;
  sourcePath: string;  // JSONPath or 'fallback_scan' or 'regex_scan'
  extractor: string;   // e.g., 'DomainExtractor@1.0.0', 'MappingSpec', 'AutoMapping'
  confidence: number;  // 0..1
  alternatives?: string[];  // Other values found for same field
}

// =============================================================================
// BLOCK REASON (WHY BLOCKED)
// =============================================================================

export type BlockStage =
  | 'Ingest'
  | 'Itemize'
  | 'Map'
  | 'Extract'
  | 'Normalize'
  | 'Match'
  | 'Cache'
  | 'Validate'
  | 'Enrich'
  | 'Store'
  | 'Intro'
  | 'Send';

export type BlockCode =
  | 'NO_ITEMS'
  | 'NO_DOMAIN_FOUND'
  | 'NO_EMAIL_FOUND'
  | 'NO_COMPANY_NAME'
  | 'INVALID_DOMAIN'
  | 'INVALID_EMAIL'
  | 'ENRICHMENT_FAILED'
  | 'VALIDATION_FAILED'
  | 'MATCH_FAILED'
  | 'SEND_FAILED'
  | 'UNKNOWN_ERROR';

export interface BlockReason {
  stage: BlockStage;
  code: BlockCode;
  message: string;
  details?: Record<string, unknown>;
}

// =============================================================================
// CANONICAL ENTITY (PIPELINE CURRENCY)
// =============================================================================

export interface CanonicalCompany {
  name?: string;
  domain?: string;
  website?: string;
  linkedinCompanyUrl?: string;
}

export interface CanonicalPerson {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  linkedinUrl?: string;
}

export interface CanonicalContacts {
  emails: string[];
  phones: string[];
}

export interface CanonicalConfidence {
  domain: number;
  email: number;
  person: number;
  overall: number;
}

export interface CanonicalSource {
  provider: 'apify' | 'api' | 'upload';
  datasetType?: string;
  sourceId?: string;
  rawIndex: number;  // Index in original items array
}

export interface CanonicalEntity {
  entityId: string;
  entityType: 'demand' | 'supply';
  company: CanonicalCompany;
  person?: CanonicalPerson;
  contacts: CanonicalContacts;
  source: CanonicalSource;
  confidence: CanonicalConfidence;
  evidence: Evidence[];
  raw: unknown;  // Reference to original item

  // ROUTING STATUS
  // true = Has NAME but no DOMAIN - needs enrichment to discover domain
  // false/undefined = Has DOMAIN - can proceed to routing
  needsEnrichment?: boolean;
}

// =============================================================================
// ADAPTER OUTPUT (HARD CONTRACT)
// =============================================================================

export interface AdapterOutput {
  entities: CanonicalEntity[];
  blocked: BlockReason[];
  meta: {
    inputCount: number;
    extractedCount: number;
    blockedCount: number;
    processingMs: number;
  };
}

// =============================================================================
// MAPPING SPEC (USER/AUTO MAPPING)
// =============================================================================

export interface MappingSpec {
  id: string;
  sourceId: string;
  datasetType: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  isDraft: boolean;
  mappings: {
    'company.domain'?: string[];
    'company.website'?: string[];
    'company.name'?: string[];
    'company.linkedinCompanyUrl'?: string[];
    'person.fullName'?: string[];
    'person.firstName'?: string[];
    'person.lastName'?: string[];
    'person.title'?: string[];
    'person.linkedinUrl'?: string[];
    'contacts.emails'?: string[];
    'contacts.phones'?: string[];
  };
  transforms: {
    normalizeDomainFromWebsite: boolean;
    splitFullName: boolean;
    dedupeEmails: boolean;
    extractDomainFromEmail: boolean;
  };
  confidence: number;
}

// =============================================================================
// SCHEMA PROFILE (AUTO-DISCOVERY)
// =============================================================================

export interface CandidatePath {
  path: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null';
  sampleValues: string[];
  frequency: number;  // How many items have this path
  score: number;      // Relevance score for this field type
}

export interface SchemaProfile {
  totalItems: number;
  sampledItems: number;
  candidatePaths: {
    emails: CandidatePath[];
    websites: CandidatePath[];
    domains: CandidatePath[];
    companyNames: CandidatePath[];
    personNames: CandidatePath[];
    titles: CandidatePath[];
    linkedinUrls: CandidatePath[];
    phones: CandidatePath[];
  };
  allPaths: CandidatePath[];
}
