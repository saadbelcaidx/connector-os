/**
 * INTRO GENERATION STAGE
 *
 * Input: READY_TO_SEND decision makers (email valid)
 * Output: IntroDraft or BlockReason
 *
 * AI is additive, never blocking.
 */

import type { CanonicalEntity, Evidence, BlockReason } from './types';
import type { MatchResult } from './match';
import { isRoutable } from './contact';
import { composeIntro } from '../copy/introDoctrine';

// =============================================================================
// INTRO TYPES
// =============================================================================

export interface IntroDraft {
  demandEntityId: string;
  supplyEntityId: string;

  // Content
  subject: string;
  body: string;

  // Metadata
  tone: 'casual' | 'formal' | 'direct';
  generatedAt: string;
  source: 'template' | 'ai';

  // Traceability
  matchRationale: string;
  evidenceRefs: string[];
}

export type SendReadiness = 'READY_TO_SEND' | 'BLOCKED_NO_EMAIL' | 'BLOCKED_INTRO';

export interface IntroStageOutput {
  intros: IntroDraft[];
  blocked: BlockReason[];
  readiness: Map<string, SendReadiness>;
  metrics: {
    inputCount: number;
    introGenerated: number;
    introFailed: number;
    templateFallback: number;
    readyToSend: number;
    processingMs: number;
  };
}

// =============================================================================
// INTRO CACHE — KEYED BY (demandId + supplyId)
// =============================================================================

/**
 * INTRO CACHE INVARIANT (ABSOLUTE):
 * - Intro = f(demandEntity, supplyEntity)
 * - Cache key = demandId + supplyId (BOTH required)
 * - NEVER cache by supply alone
 * - NEVER reuse intro across different demands
 */
const introCache = new Map<string, IntroDraft>();

/**
 * Generate composite cache key for (demand, supply) pair.
 * INVARIANT: Both IDs required, order matters.
 */
function introCacheKey(demandId: string, supplyId: string): string {
  return `${demandId}::${supplyId}`;
}

/**
 * Get cached intro for (demand, supply) pair.
 */
export function getCachedIntro(demandId: string, supplyId: string): IntroDraft | null {
  const key = introCacheKey(demandId, supplyId);
  return introCache.get(key) || null;
}

/**
 * Store intro in cache for (demand, supply) pair.
 */
export function cacheIntro(intro: IntroDraft): void {
  const key = introCacheKey(intro.demandEntityId, intro.supplyEntityId);
  introCache.set(key, intro);
}

/**
 * Clear intro cache (for testing/reset).
 */
export function clearIntroCache(): void {
  introCache.clear();
}

// =============================================================================
// TEMPLATE INTROS (DETERMINISTIC FALLBACK)
// =============================================================================

/**
 * Generate deterministic template intro.
 * Used when AI fails or is disabled.
 * PHASE 6: Routes through introDoctrine.composeIntro() for canonical output.
 */
function generateTemplateIntro(
  demand: CanonicalEntity,
  supply: CanonicalEntity,
  matchRationale: string
): IntroDraft {
  const demandName = demand.person?.firstName ||
                     demand.person?.fullName?.split(' ')[0] ||
                     'there';
  const demandCompany = demand.company.name || demand.company.domain || 'your company';

  const subject = `Quick intro - ${demandCompany}`;

  // CANONICAL: Route through introDoctrine for doctrine-compliant output
  const body = composeIntro({
    side: 'demand',
    mode: 'b2b_general',
    ctx: {
      firstName: demandName,
      company: demandCompany,
    },
  });

  return {
    demandEntityId: demand.entityId,
    supplyEntityId: supply.entityId,
    subject,
    body,
    tone: 'casual',
    generatedAt: new Date().toISOString(),
    source: 'template',
    matchRationale,
    evidenceRefs: demand.evidence.map(e => e.sourcePath).slice(0, 3),
  };
}

// =============================================================================
// AI INTRO GENERATION (OPTIONAL, WRAPPED)
// =============================================================================

export interface AIIntroConfig {
  enabled: boolean;
  apiKey?: string;
  endpoint?: string;
  timeout?: number;
}

/**
 * Generate AI intro.
 * NEVER throws. Returns null on failure.
 */
async function generateAIIntro(
  demand: CanonicalEntity,
  supply: CanonicalEntity,
  matchRationale: string,
  config: AIIntroConfig
): Promise<IntroDraft | null> {
  if (!config.enabled || !config.apiKey) {
    return null;
  }

  try {
    console.log('[Intro:AI] Generating for:', demand.company.domain);

    // AI generation would go here
    // For now, return null to use template fallback
    console.log('[Intro:AI] Not yet implemented, using template');
    return null;

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Intro:AI] Failed:', errorMsg);
    return null;
  }
}

// =============================================================================
// INTRO STAGE
// =============================================================================

/**
 * Generate intros for ready-to-send entities.
 *
 * Input contract:
 * - Only entities with valid email (READY_TO_SEND)
 * - Match result with rationale
 *
 * Output:
 * - IntroDraft per entity
 * - BlockReason for failures
 * - Readiness state per entity
 */
export async function stageIntroGeneration(
  demandEntities: CanonicalEntity[],
  supplyEntities: CanonicalEntity[],
  matches: MatchResult[],
  aiConfig: AIIntroConfig
): Promise<IntroStageOutput> {
  const startMs = Date.now();
  console.log('[Pipeline:intro] Starting for', demandEntities.length, 'entities');

  const intros: IntroDraft[] = [];
  const blocked: BlockReason[] = [];
  const readiness = new Map<string, SendReadiness>();

  let introGenerated = 0;
  let introFailed = 0;
  let templateFallback = 0;

  // Build supply lookup
  const supplyById = new Map<string, CanonicalEntity>();
  for (const s of supplyEntities) {
    supplyById.set(s.entityId, s);
  }

  // Build match lookup (demand -> supply + rationale)
  const matchByDemand = new Map<string, { supplyId: string; rationale: string }>();
  for (const m of matches) {
    matchByDemand.set(m.demandId, {
      supplyId: m.supplyId,
      rationale: m.reason,
    });
  }

  for (const demand of demandEntities) {
    // Gate 1: Must be routable (have valid email)
    if (!isRoutable(demand)) {
      readiness.set(demand.entityId, 'BLOCKED_NO_EMAIL');
      blocked.push({
        stage: 'Intro',
        code: 'NO_EMAIL_FOUND',
        message: `Cannot generate intro: no valid email for ${demand.company.domain}`,
        details: { entityId: demand.entityId },
      });
      continue;
    }

    // Gate 2: Must have a match
    const matchInfo = matchByDemand.get(demand.entityId);
    if (!matchInfo) {
      readiness.set(demand.entityId, 'BLOCKED_INTRO');
      blocked.push({
        stage: 'Intro',
        code: 'MATCH_FAILED',
        message: `No match found for ${demand.company.domain}`,
        details: { entityId: demand.entityId },
      });
      introFailed++;
      continue;
    }

    // Gate 3: Must have supply entity
    const supply = supplyById.get(matchInfo.supplyId);
    if (!supply) {
      readiness.set(demand.entityId, 'BLOCKED_INTRO');
      blocked.push({
        stage: 'Intro',
        code: 'MATCH_FAILED',
        message: `Supply entity not found: ${matchInfo.supplyId}`,
        details: { entityId: demand.entityId, supplyId: matchInfo.supplyId },
      });
      introFailed++;
      continue;
    }

    // Check cache first (keyed by demandId + supplyId)
    const cached = getCachedIntro(demand.entityId, supply.entityId);
    if (cached) {
      intros.push(cached);
      readiness.set(demand.entityId, 'READY_TO_SEND');
      introGenerated++;
      continue;
    }

    // Try AI intro first
    let intro = await generateAIIntro(demand, supply, matchInfo.rationale, aiConfig);

    // Fall back to template
    if (!intro) {
      intro = generateTemplateIntro(demand, supply, matchInfo.rationale);
      templateFallback++;
    }

    if (intro) {
      // Cache the intro for this (demand, supply) pair
      cacheIntro(intro);
      intros.push(intro);
      readiness.set(demand.entityId, 'READY_TO_SEND');
      introGenerated++;
    } else {
      readiness.set(demand.entityId, 'BLOCKED_INTRO');
      blocked.push({
        stage: 'Intro',
        code: 'UNKNOWN_ERROR',
        message: `Intro generation failed for ${demand.company.domain}`,
        details: { entityId: demand.entityId },
      });
      introFailed++;
    }
  }

  const elapsedMs = Date.now() - startMs;
  const readyToSend = Array.from(readiness.values()).filter(r => r === 'READY_TO_SEND').length;

  console.log('[Pipeline:intro] Complete:', {
    input: demandEntities.length,
    generated: introGenerated,
    failed: introFailed,
    templateFallback,
    readyToSend,
    ms: elapsedMs,
  });

  return {
    intros,
    blocked,
    readiness,
    metrics: {
      inputCount: demandEntities.length,
      introGenerated,
      introFailed,
      templateFallback,
      readyToSend,
      processingMs: elapsedMs,
    },
  };
}
