/**
 * CANONICAL PIPELINE CONTRACT
 *
 * Input → Match → Cache → Validate → Enrich → Store → Intro → Send
 *
 * One direction. One truth. One path.
 * NO shortcuts. NO fast paths. NO optimizations.
 */

// =============================================================================
// RAW INPUT (normalized from any source)
// =============================================================================

export interface RawInput {
  id: string;
  source: 'apify' | 'api' | 'upload';
  side: 'demand' | 'supply';
  raw: Record<string, unknown>;

  // Extracted fields (may be missing)
  name?: string;
  companyName?: string;
  domain?: string;
  email?: string;
  title?: string;
  linkedin?: string;

  // Signal data (for matching)
  signals?: string[];
}

// =============================================================================
// PIPELINE STAGES
// =============================================================================

export type PipelineStage =
  | 'input'
  | 'match'
  | 'cache'
  | 'validate'
  | 'enrich'
  | 'store'
  | 'intro'
  | 'send';

// =============================================================================
// MATCH RESULT
// =============================================================================

export interface MatchResult {
  demandId: string;
  supplyId: string;
  confidence: number;
  reason: string;
}

// =============================================================================
// CACHE ENTRY
// =============================================================================

export interface CacheEntry {
  id: string;
  domain: string;
  email?: string;
  name?: string;
  title?: string;
  validated: boolean;
  enrichedAt?: string;
  source: 'apollo' | 'anymail' | 'dataset' | 'manual';
}

// =============================================================================
// VALIDATION RESULT
// =============================================================================

export interface ValidationResult {
  email: string;
  valid: boolean;
  status: 'verified' | 'risky' | 'invalid' | 'unknown';
}

// =============================================================================
// ENRICHMENT RESULT
// =============================================================================

export interface EnrichmentResult {
  success: boolean;
  email?: string;
  name?: string;
  title?: string;
  linkedin?: string;
  source: 'apollo' | 'anymail';
  endpoint: 'person' | 'decision_maker' | 'company_emails';
}

// =============================================================================
// INTRO
// =============================================================================

export interface Intro {
  demandId: string;
  supplyId: string;
  demandIntro: string;
  supplyIntro: string;
  matchContext: string;
}

// =============================================================================
// SEND RESULT
// =============================================================================

export interface SendResult {
  demandId: string;
  supplyId: string;
  demandSent: boolean;
  supplySent: boolean;
  demandCampaignId?: string;
  supplyCampaignId?: string;
  error?: string;
}

// =============================================================================
// PIPELINE ITEM (tracks progress through stages)
// =============================================================================

export interface PipelineItem {
  demand: RawInput;
  supply: RawInput;

  // Stage tracking
  currentStage: PipelineStage;
  completedStages: PipelineStage[];

  // Results at each stage
  match?: MatchResult;
  demandCache?: CacheEntry;
  supplyCache?: CacheEntry;
  demandValidation?: ValidationResult;
  supplyValidation?: ValidationResult;
  demandEnrichment?: EnrichmentResult;
  supplyEnrichment?: EnrichmentResult;
  intro?: Intro;
  send?: SendResult;

  // Blocking
  blocked: boolean;
  blockReason?: string;
}

// =============================================================================
// PIPELINE STATE
// =============================================================================

export interface PipelineState {
  items: PipelineItem[];
  stage: PipelineStage;
  processing: boolean;
  error?: string;
}

// =============================================================================
// PIPELINE METRICS (for instrumentation)
// =============================================================================

export interface PipelineMetrics {
  inputCount: number;
  matchCount: number;
  cacheHits: number;
  cacheMisses: number;
  validationPass: number;
  validationFail: number;
  apolloAttempts: number;
  apolloSuccess: number;
  anymailAttempts: number;
  anymailSuccess: number;
  introsGenerated: number;
  sendSuccess: number;
  sendFail: number;
  blocked: number;
}

// =============================================================================
// RULES (enforced, not optional)
// =============================================================================

/**
 * ABSOLUTE RULES:
 *
 * 1. NO state skipping
 * 2. NO fast paths
 * 3. NO optimizations
 * 4. NO UI-driven logic
 * 5. NO inferred readiness
 *
 * DATA ≠ READY
 * ENRICHMENT NEVER IMPLIES MATCH
 * MATCH ALWAYS COMES FIRST
 *
 * If a step is skipped → system is WRONG.
 */
