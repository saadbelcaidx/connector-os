/**
 * PIPELINE SNAPSHOT STORE
 *
 * Immutable snapshot of pipeline state per run.
 * Stage 5: Single source of truth for UI - pipeline is the system.
 */

import type { CanonicalEntity, BlockReason, Evidence } from './types';
import type { MatchResult } from './match';
import type { IntroDraft, SendReadiness } from './intro';

// =============================================================================
// PIPELINE SNAPSHOT (IMMUTABLE)
// =============================================================================

// Data health (Apple-style gate feedback)
export interface DataHealth {
  demand: { total: number; withName: number; withDomain: number; quality: 'good' | 'partial' | 'poor' };
  supply: { total: number; withName: number; withEmail: number; quality: 'good' | 'partial' | 'poor' };
}

export interface PipelineRunSnapshot {
  // Run metadata
  runId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;

  // Execution mode (from PIPELINE_CONTRACT.md)
  mode: 'MATCHING_ONLY' | 'ACTION';

  // Data health (validate at the gate)
  dataHealth: DataHealth;

  // Entities
  demandEntities: CanonicalEntity[];
  supplyEntities: CanonicalEntity[];

  // Matches
  matches: MatchResult[];

  // Contact completion
  readyEntities: CanonicalEntity[];
  blockedEntities: {
    entity: CanonicalEntity;
    reason: BlockReason;
  }[];

  // Intros
  intros: IntroDraft[];

  // Readiness
  readinessMap: Record<string, SendReadiness>;

  // Aggregate metrics
  metrics: {
    totalDemand: number;
    totalSupply: number;
    matchCount: number;
    cacheHits: number;
    enriched: number;
    readyToSend: number;
    blocked: number;
    introGenerated: number;
  };

  // All block reasons
  allBlocks: BlockReason[];

  // Parity status
  parityStatus: 'PARITY' | 'DIVERGENCE' | 'UNKNOWN';
  parityDetails?: {
    legacyMatchCount: number;
    pipelineMatchCount: number;
    domainOverlap: number;
    divergentDomains: string[];
  };
}

// =============================================================================
// SNAPSHOT STORAGE
// =============================================================================

let currentSnapshot: PipelineRunSnapshot | null = null;
let snapshotHistory: PipelineRunSnapshot[] = [];
const MAX_HISTORY = 5;

/**
 * Store new pipeline snapshot.
 */
export function storeSnapshot(snapshot: PipelineRunSnapshot): void {
  currentSnapshot = snapshot;
  snapshotHistory.unshift(snapshot);
  if (snapshotHistory.length > MAX_HISTORY) {
    snapshotHistory.pop();
  }
  console.log('[Snapshot] Stored run:', snapshot.runId, {
    matches: snapshot.metrics.matchCount,
    ready: snapshot.metrics.readyToSend,
    parity: snapshot.parityStatus,
  });
}

/**
 * Get current snapshot.
 */
export function getCurrentSnapshot(): PipelineRunSnapshot | null {
  return currentSnapshot;
}

/**
 * Get snapshot history.
 */
export function getSnapshotHistory(): PipelineRunSnapshot[] {
  return snapshotHistory;
}

/**
 * Clear snapshots (for testing).
 */
export function clearSnapshots(): void {
  currentSnapshot = null;
  snapshotHistory = [];
}

// =============================================================================
// SNAPSHOT BUILDER
// =============================================================================

export interface SnapshotBuilderInput {
  mode: 'MATCHING_ONLY' | 'ACTION';
  demandEntities: CanonicalEntity[];
  supplyEntities: CanonicalEntity[];
  matches: MatchResult[];
  readyEntities: CanonicalEntity[];
  blockedEntities: { entity: CanonicalEntity; reason: BlockReason }[];
  intros: IntroDraft[];
  readinessMap: Map<string, SendReadiness>;
  allBlocks: BlockReason[];
  metrics: {
    cacheHits: number;
    enriched: number;
  };
  parityStatus: 'PARITY' | 'DIVERGENCE' | 'UNKNOWN';
  parityDetails?: PipelineRunSnapshot['parityDetails'];
  startedAt: Date;
}

/**
 * Calculate data health from entities (Apple-style gate validation).
 */
function calculateDataHealth(demand: CanonicalEntity[], supply: CanonicalEntity[]): DataHealth {
  const demandWithName = demand.filter(e => e.company.name && !e.company.name.includes('.')).length;
  const demandWithDomain = demand.filter(e => e.company.domain).length;
  const demandQuality = demandWithName >= demand.length * 0.8 ? 'good' : demandWithName >= demand.length * 0.5 ? 'partial' : 'poor';

  const supplyWithName = supply.filter(e => e.company.name && !e.company.name.includes('.')).length;
  const supplyWithEmail = supply.filter(e => e.contacts.emails.length > 0).length;
  const supplyQuality = supplyWithName >= supply.length * 0.8 ? 'good' : supplyWithName >= supply.length * 0.5 ? 'partial' : 'poor';

  return {
    demand: { total: demand.length, withName: demandWithName, withDomain: demandWithDomain, quality: demandQuality },
    supply: { total: supply.length, withName: supplyWithName, withEmail: supplyWithEmail, quality: supplyQuality }
  };
}

/**
 * Build immutable snapshot from pipeline run.
 */
export function buildSnapshot(input: SnapshotBuilderInput): PipelineRunSnapshot {
  const completedAt = new Date();
  const durationMs = completedAt.getTime() - input.startedAt.getTime();

  return {
    runId: `run-${input.startedAt.getTime()}`,
    startedAt: input.startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs,

    // Execution mode (from contract)
    mode: input.mode,

    // Data health (Apple-style gate validation)
    dataHealth: calculateDataHealth(input.demandEntities, input.supplyEntities),

    demandEntities: input.demandEntities,
    supplyEntities: input.supplyEntities,
    matches: input.matches,
    readyEntities: input.readyEntities,
    blockedEntities: input.blockedEntities,
    intros: input.intros,
    readinessMap: Object.fromEntries(input.readinessMap),
    allBlocks: input.allBlocks,

    metrics: {
      totalDemand: input.demandEntities.length,
      totalSupply: input.supplyEntities.length,
      matchCount: input.matches.length,
      cacheHits: input.metrics.cacheHits,
      enriched: input.metrics.enriched,
      readyToSend: input.readyEntities.length,
      blocked: input.blockedEntities.length,
      introGenerated: input.intros.length,
    },

    parityStatus: input.parityStatus,
    parityDetails: input.parityDetails,
  };
}
