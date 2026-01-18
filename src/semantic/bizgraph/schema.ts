/**
 * BIZGRAPH Schema — Business Domain Semantic Graph
 *
 * Compact JSON schema for semantic expansion bundle.
 * Code-owned, deterministic, auditable.
 */

// =============================================================================
// TAG TYPES
// =============================================================================

export type TagType =
  | 'domain'    // Business domain (tech, finance, healthcare)
  | 'function'  // Business function (recruiting, sales, marketing)
  | 'service'   // Service offering (staffing, consulting)
  | 'role'      // Job role (recruiter, SDR, VP Engineering)
  | 'industry'  // Industry vertical (fintech, web3, biotech)
  | 'intent'    // Business intent (hiring, scaling, funding)
  | 'activity'  // Business activity (outbound, team building)
  | 'signal'    // Business signal (funding raised, compliance issue, product launch)
  | 'need';     // Business need (growth marketing, legal advisory, GTM strategy)

// =============================================================================
// DOMAIN TYPES
// =============================================================================

export type Domain =
  | 'hr'        // HR / Recruiting / Talent
  | 'sales'     // Sales / Business Development
  | 'tech'      // Technology / Engineering
  | 'finance'   // Finance / Fintech
  | 'marketing' // Marketing / Growth / Brand
  | 'legal'     // Legal / Compliance / Regulatory
  | 'ops'       // Operations / Scaling / Process
  | 'product'   // Product / GTM / Launch
  | 'security'  // Security / Cybersecurity / InfoSec
  | 'general';  // General / Cross-domain

// =============================================================================
// EDGE RELATION TYPES
// =============================================================================

export type EdgeRelation =
  | 'equivalent'    // Bidirectional equivalence (recruiting ↔ hiring)
  | 'specializes'   // A is a specialization of B (technical recruiting → recruiting)
  | 'related'       // General semantic relationship
  | 'fulfills'      // A fulfills/serves B (recruiting fulfills hiring)
  | 'role_variant'  // Role variant (VP Engineering ↔ Head of Engineering)
  | 'indicates';    // Signal indicates need (funding raised → growth marketing need)

// =============================================================================
// CONCEPT STRUCTURE
// =============================================================================

export interface BizGraphConcept {
  /** Tag type: domain, function, service, role, industry, intent, activity */
  t: TagType;
  /** Domain: hr, sales, tech, finance, general */
  d: Domain;
  /** Labels: canonical label + aliases (all lowercase, trimmed) */
  l: string[];
  /** Aliases: additional alternate spellings/forms */
  a: string[];
}

// =============================================================================
// EDGE STRUCTURE
// =============================================================================

/**
 * Edge tuple: [fromId, relation, toId, weight, source]
 */
export type BizGraphEdge = [
  string,       // fromId
  EdgeRelation, // relation
  string,       // toId
  number,       // weight (0-1)
  string        // source (e.g., "manual_core", "onet", "esco")
];

// =============================================================================
// BUNDLE STRUCTURE
// =============================================================================

export interface BizGraphBundle {
  /** Schema version */
  version: string;
  /** Build timestamp ISO */
  built_at: string;
  /** Build hash for determinism verification */
  build_hash: string;
  /** Metadata counts */
  meta: {
    concept_count: number;
    edge_count: number;
    label_count: number;
    sources: string[];
  };
  /** Concepts keyed by stable ID */
  concepts: Record<string, BizGraphConcept>;
  /** Edges array (sorted for determinism) */
  edges: BizGraphEdge[];
}

// =============================================================================
// RUNTIME LOOKUP STRUCTURES
// =============================================================================

export interface LabelIndex {
  /** Map from canonical label to concept ID */
  labelToId: Map<string, string>;
  /** Map from concept ID to all labels */
  idToLabels: Map<string, string[]>;
}

export interface EdgeIndex {
  /** Map from concept ID to outgoing edges */
  outgoing: Map<string, BizGraphEdge[]>;
  /** Map from concept ID to incoming edges */
  incoming: Map<string, BizGraphEdge[]>;
}

// =============================================================================
// EXPANSION EVIDENCE
// =============================================================================

export interface ExpansionEvidence {
  from: string;      // Source token/concept
  to: string;        // Target expansion
  rel: EdgeRelation; // Relationship type
  w: number;         // Weight
  source: string;    // Data source (manual_core, onet, esco)
}

export interface ExpansionResult {
  /** Original tokens */
  original: string[];
  /** Expanded tokens (includes original + expansions) */
  expanded: string[];
  /** Evidence trail for audit */
  evidence: ExpansionEvidence[];
}

// =============================================================================
// CANONICALIZATION
// =============================================================================

/**
 * Canonicalize a label: lowercase, trim, collapse whitespace, strip punctuation except hyphen.
 */
export function canonicalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')  // Remove punctuation except hyphen
    .replace(/\s+/g, ' ')      // Collapse whitespace
    .trim();
}

/**
 * Generate stable concept ID from tag, domain, and canonical label.
 * Uses simple hash for determinism.
 */
export function generateConceptId(tag: TagType, domain: Domain, label: string): string {
  const canonical = canonicalizeLabel(label);
  const input = `${tag}:${domain}:${canonical}`;
  // Simple hash (djb2)
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to hex, ensure positive
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  return `biz_${hex}`;
}
