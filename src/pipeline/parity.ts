/**
 * PARITY RESOLUTION — FIRST-DIVERGENCE TRACING
 *
 * Structured diff per stage to identify first divergence point.
 * Goal: Turn DIVERGENCE → PARITY.
 */

import type { CanonicalEntity, BlockReason } from './types';
import type { MatchResult } from './match';
import type { IntroDraft } from './intro';
import type { LegacySnapshot, PipelineSnapshot } from './integration';

// =============================================================================
// STAGE DIFF TYPES
// =============================================================================

export interface StageDiff {
  stage: string;
  legacyCount: number;
  pipelineCount: number;
  overlapCount: number;
  overlapPercent: number;
  onlyInLegacy: string[];
  onlyInPipeline: string[];
  isParity: boolean;
}

export interface ParityReport {
  stages: StageDiff[];
  firstDivergence: string | null;
  overallParity: boolean;
  divergenceDetails?: {
    stage: string;
    reason: string;
    examples: string[];
  };
}

// =============================================================================
// SET DIFF HELPER
// =============================================================================

function diffSets(
  legacy: Set<string>,
  pipeline: Set<string>
): { overlap: string[]; onlyLegacy: string[]; onlyPipeline: string[] } {
  const overlap: string[] = [];
  const onlyLegacy: string[] = [];
  const onlyPipeline: string[] = [];

  for (const item of legacy) {
    if (pipeline.has(item)) {
      overlap.push(item);
    } else {
      onlyLegacy.push(item);
    }
  }

  for (const item of pipeline) {
    if (!legacy.has(item)) {
      onlyPipeline.push(item);
    }
  }

  return { overlap, onlyLegacy, onlyPipeline };
}

// =============================================================================
// DOMAIN NORMALIZATION (ALIGNED WITH LEGACY)
// =============================================================================

/**
 * Normalize domain to match legacy behavior exactly.
 * Key rules:
 * - strip protocol (http/https)
 * - strip www
 * - lowercase
 * - remove path/query/hash
 * - remove trailing dots
 * - remove port
 */
export function normalizeDomainForParity(input: string | undefined): string {
  if (!input) return '';

  let domain = input.toLowerCase().trim();

  // Remove protocol
  domain = domain.replace(/^https?:\/\//, '');

  // Remove www
  domain = domain.replace(/^www\./, '');

  // Remove path/query/hash
  domain = domain.split('/')[0].split('?')[0].split('#')[0];

  // Remove port
  domain = domain.split(':')[0];

  // Remove trailing dots
  domain = domain.replace(/\.+$/, '');

  return domain;
}

// =============================================================================
// STAGE DIFF COMPUTATION
// =============================================================================

export interface PipelineStageData {
  itemCount: number;
  demandEntities: CanonicalEntity[];
  supplyEntities: CanonicalEntity[];
  matches: MatchResult[];
  readyEntities: CanonicalEntity[];
  intros: IntroDraft[];
}

export interface LegacyStageData {
  matchingResults: { domain: string; companyName: string }[];
  enrichedDomains: Set<string>;
  readyToSendCount: number;
}

/**
 * Compute structured diff per stage.
 *
 * PARITY RULE (ASYMMETRIC):
 * - Pipeline entities = truth (explicit domains only, no fallbacks)
 * - Legacy may have extras (fallback-generated) - IGNORED
 * - Pipeline extras not in legacy = BUG (needs investigation)
 *
 * So parity is achieved when:
 * - All pipeline entities exist in legacy (subset relationship)
 * - Legacy extras are acceptable (fallback-generated, silently ignored)
 */
export function computeParityReport(
  legacy: LegacyStageData,
  pipeline: PipelineStageData
): ParityReport {
  const stages: StageDiff[] = [];
  let firstDivergence: string | null = null;

  // Stage 1: Entity Count
  // ASYMMETRIC: Pipeline must be subset of legacy. Legacy extras are fallbacks (ignored).
  const legacyDomains = new Set(
    legacy.matchingResults.map(r => normalizeDomainForParity(r.domain))
  );
  const pipelineDemandDomains = new Set(
    pipeline.demandEntities.map(e => normalizeDomainForParity(e.company.domain))
  );

  const domainDiff = diffSets(legacyDomains, pipelineDemandDomains);

  // PARITY: All pipeline entities exist in legacy (onlyInPipeline = 0)
  // Legacy extras are OK (fallback-generated, ignored)
  const entityParity = domainDiff.onlyPipeline.length === 0;

  stages.push({
    stage: 'entities',
    legacyCount: legacyDomains.size,
    pipelineCount: pipelineDemandDomains.size,
    overlapCount: domainDiff.overlap.length,
    overlapPercent: legacyDomains.size > 0
      ? Math.round(domainDiff.overlap.length / legacyDomains.size * 100)
      : 0,
    onlyInLegacy: domainDiff.onlyLegacy.slice(0, 10),
    onlyInPipeline: domainDiff.onlyPipeline.slice(0, 10),
    isParity: entityParity,
  });

  if (!entityParity && !firstDivergence) {
    firstDivergence = 'entities';
  }

  // Stage 2: Matches
  const legacyMatchDomains = new Set(
    legacy.matchingResults.map(r => normalizeDomainForParity(r.domain))
  );
  const pipelineMatchDomains = new Set(
    pipeline.matches.map(m => normalizeDomainForParity(m.demandDomain))
  );

  const matchDiff = diffSets(legacyMatchDomains, pipelineMatchDomains);
  const matchParity = matchDiff.onlyLegacy.length === 0 &&
                      matchDiff.onlyPipeline.length === 0;

  stages.push({
    stage: 'matches',
    legacyCount: legacyMatchDomains.size,
    pipelineCount: pipelineMatchDomains.size,
    overlapCount: matchDiff.overlap.length,
    overlapPercent: legacyMatchDomains.size > 0
      ? Math.round(matchDiff.overlap.length / legacyMatchDomains.size * 100)
      : 0,
    onlyInLegacy: matchDiff.onlyLegacy.slice(0, 10),
    onlyInPipeline: matchDiff.onlyPipeline.slice(0, 10),
    isParity: matchParity,
  });

  if (!matchParity && !firstDivergence) {
    firstDivergence = 'matches';
  }

  // Stage 3: Ready to Send
  const pipelineReadyDomains = new Set(
    pipeline.readyEntities.map(e => normalizeDomainForParity(e.company.domain))
  );

  stages.push({
    stage: 'ready',
    legacyCount: legacy.readyToSendCount,
    pipelineCount: pipelineReadyDomains.size,
    overlapCount: Math.min(legacy.readyToSendCount, pipelineReadyDomains.size),
    overlapPercent: legacy.readyToSendCount > 0
      ? Math.round(Math.min(legacy.readyToSendCount, pipelineReadyDomains.size) / legacy.readyToSendCount * 100)
      : 0,
    onlyInLegacy: [],
    onlyInPipeline: [],
    isParity: legacy.readyToSendCount === pipelineReadyDomains.size,
  });

  if (legacy.readyToSendCount !== pipelineReadyDomains.size && !firstDivergence) {
    firstDivergence = 'ready';
  }

  // Stage 4: Intros
  const introParity = pipeline.intros.length === pipeline.readyEntities.length;

  stages.push({
    stage: 'intros',
    legacyCount: legacy.readyToSendCount, // Assuming legacy generates intros for ready
    pipelineCount: pipeline.intros.length,
    overlapCount: pipeline.intros.length,
    overlapPercent: 100,
    onlyInLegacy: [],
    onlyInPipeline: [],
    isParity: introParity,
  });

  if (!introParity && !firstDivergence) {
    firstDivergence = 'intros';
  }

  // Overall parity
  const overallParity = stages.every(s => s.isParity);

  return {
    stages,
    firstDivergence,
    overallParity,
    divergenceDetails: firstDivergence ? {
      stage: firstDivergence,
      reason: getDivergenceReason(stages.find(s => s.stage === firstDivergence)!),
      examples: stages.find(s => s.stage === firstDivergence)!.onlyInLegacy.slice(0, 3),
    } : undefined,
  };
}

function getDivergenceReason(diff: StageDiff): string {
  if (diff.onlyInLegacy.length > 0 && diff.onlyInPipeline.length > 0) {
    return `Both sides have unique items: ${diff.onlyInLegacy.length} only in legacy, ${diff.onlyInPipeline.length} only in pipeline`;
  }
  if (diff.onlyInLegacy.length > 0) {
    return `${diff.onlyInLegacy.length} items only in legacy`;
  }
  if (diff.onlyInPipeline.length > 0) {
    return `${diff.onlyInPipeline.length} items only in pipeline`;
  }
  return 'Count mismatch';
}

// =============================================================================
// PARITY LOGGING
// =============================================================================

/**
 * Log parity report to console.
 */
export function logParityReport(report: ParityReport): void {
  console.group('[Parity] Report');

  for (const stage of report.stages) {
    const status = stage.isParity ? '✅' : '❌';
    console.log(
      `${status} ${stage.stage}: legacy=${stage.legacyCount}, pipeline=${stage.pipelineCount}, overlap=${stage.overlapPercent}%`
    );

    if (!stage.isParity) {
      if (stage.onlyInLegacy.length > 0) {
        console.log(`   Only in legacy: ${stage.onlyInLegacy.slice(0, 5).join(', ')}`);
      }
      if (stage.onlyInPipeline.length > 0) {
        console.log(`   Only in pipeline: ${stage.onlyInPipeline.slice(0, 5).join(', ')}`);
      }
    }
  }

  console.log(`\nOverall: ${report.overallParity ? '✅ PARITY' : '❌ DIVERGENCE'}`);

  if (report.firstDivergence) {
    console.log(`First divergence at: ${report.firstDivergence}`);
    if (report.divergenceDetails) {
      console.log(`Reason: ${report.divergenceDetails.reason}`);
    }
  }

  console.groupEnd();
}

// =============================================================================
// PARITY TRACKER (CONSECUTIVE RUNS)
// =============================================================================

let consecutiveParityCount = 0;
let lastParityStatus: boolean | null = null;

export function trackParityRun(isParity: boolean): {
  consecutiveCount: number;
  isStable: boolean;
} {
  if (isParity) {
    if (lastParityStatus === true) {
      consecutiveParityCount++;
    } else {
      consecutiveParityCount = 1;
    }
  } else {
    consecutiveParityCount = 0;
  }

  lastParityStatus = isParity;

  return {
    consecutiveCount: consecutiveParityCount,
    isStable: consecutiveParityCount >= 3,
  };
}

export function getParityStability(): {
  consecutiveCount: number;
  isStable: boolean;
} {
  return {
    consecutiveCount: consecutiveParityCount,
    isStable: consecutiveParityCount >= 3,
  };
}

export function resetParityTracker(): void {
  consecutiveParityCount = 0;
  lastParityStatus = null;
}
