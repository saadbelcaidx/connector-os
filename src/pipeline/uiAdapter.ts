/**
 * UI ADAPTER — PIPELINE TO LEGACY UI STATE
 *
 * Maps PipelineRunSnapshot → existing UI state shape.
 * Read-only transformation, no side effects.
 */

import type { PipelineRunSnapshot } from './snapshot';
import type { CanonicalEntity } from './types';
import type { MatchResult } from './match';
import type { IntroDraft } from './intro';

// =============================================================================
// Stage 5: Feature flags removed - pipeline is the system
// =============================================================================

// =============================================================================
// LEGACY UI STATE SHAPES (FROM MatchingEngineV3)
// =============================================================================

export interface LegacyMatchingResult {
  id: string;
  companyName: string;
  domain: string;
  signalSummary: string;
  windowStatus: string;
  signalStrength: number;
  operatorFitScore: number;
  matchReasons: string[];
  qualityScore: {
    total: number;
    tier: 'A' | 'B' | 'C';
    breakdown: {
      persistence: number;
      density: number;
      velocity: number;
      stacking: number;
    };
    reasons: string[];
  };
}

export interface LegacyDemandState {
  domain: string;
  personData?: {
    email?: string;
    name?: string;
    title?: string;
    linkedin?: string;
  };
  enriched: boolean;
  aiGeneratedIntro?: string;
  readyToSend: boolean;
}

export interface LegacySupplyContact {
  email: string;
  name?: string;
  title?: string;
  domain: string;
  companyName?: string;
}

// =============================================================================
// SNAPSHOT TO LEGACY MATCHING RESULTS
// =============================================================================

/**
 * Convert pipeline snapshot to legacy matchingResults array.
 * Stage 5: Shows ALL demand entities (not just matched ones) so UI has data to display.
 */
export function snapshotToMatchingResults(
  snapshot: PipelineRunSnapshot
): LegacyMatchingResult[] {
  // Show all demand entities, with match info if available
  return snapshot.demandEntities.map((entity, index) => {
    // Find match for this entity (if any)
    const match = snapshot.matches.find(m => m.demandId === entity.entityId);

    const domain = entity.company.domain || '';
    const companyName = entity.company.name || domain;

    // Calculate tier from match confidence, or default to C if no match
    const confidence = match?.confidence ?? 0.4;
    const tier: 'A' | 'B' | 'C' = confidence >= 0.7 ? 'A' : confidence >= 0.45 ? 'B' : 'C';
    const total = Math.round(confidence * 100);

    const reason = match?.reason || 'Demand signal detected';

    return {
      id: entity.entityId || `demand-${index}`,
      companyName,
      domain,
      signalSummary: reason,
      windowStatus: 'OPEN',
      signalStrength: total,
      operatorFitScore: match ? 70 : 50,
      matchReasons: [reason],
      qualityScore: {
        total,
        tier,
        breakdown: {
          persistence: 20,
          density: 20,
          velocity: 20,
          stacking: Math.round(confidence * 40),
        },
        reasons: [reason],
      },
    };
  });
}

// =============================================================================
// SNAPSHOT TO DEMAND STATES
// =============================================================================

/**
 * Convert pipeline snapshot to legacy demandStates map.
 */
export function snapshotToDemandStates(
  snapshot: PipelineRunSnapshot
): Map<string, LegacyDemandState> {
  const states = new Map<string, LegacyDemandState>();

  for (const entity of snapshot.readyEntities) {
    const domain = entity.company.domain || '';
    const intro = snapshot.intros.find(i => i.demandEntityId === entity.entityId);

    states.set(domain, {
      domain,
      personData: {
        email: entity.contacts.emails[0],
        name: entity.person?.fullName,
        title: entity.person?.title,
        linkedin: entity.person?.linkedinUrl,
      },
      enriched: true,
      aiGeneratedIntro: intro?.body,
      readyToSend: true,
    });
  }

  // Add blocked entities as not ready
  for (const { entity } of snapshot.blockedEntities) {
    const domain = entity.company.domain || '';
    if (!states.has(domain)) {
      states.set(domain, {
        domain,
        personData: {
          email: entity.contacts.emails[0],
          name: entity.person?.fullName,
          title: entity.person?.title,
        },
        enriched: entity.contacts.emails.length > 0,
        readyToSend: false,
      });
    }
  }

  return states;
}

// =============================================================================
// SNAPSHOT TO SUPPLY MAPPING
// =============================================================================

/**
 * Convert pipeline snapshot to legacy selectedSupplyByDemandDomain.
 */
export function snapshotToSupplyMapping(
  snapshot: PipelineRunSnapshot
): Map<string, LegacySupplyContact> {
  const mapping = new Map<string, LegacySupplyContact>();

  for (const match of snapshot.matches) {
    const supplyEntity = snapshot.supplyEntities.find(
      e => e.entityId === match.supplyId
    );

    if (supplyEntity) {
      mapping.set(match.demandDomain, {
        email: supplyEntity.contacts.emails[0] || '',
        name: supplyEntity.person?.fullName,
        title: supplyEntity.person?.title,
        domain: supplyEntity.company.domain || '',
        companyName: supplyEntity.company.name,
      });
    }
  }

  return mapping;
}

// =============================================================================
// SNAPSHOT TO READY COUNT
// =============================================================================

/**
 * Get ready-to-send count from snapshot.
 */
export function snapshotToReadyCount(snapshot: PipelineRunSnapshot): number {
  return snapshot.metrics.readyToSend;
}

// =============================================================================
// SNAPSHOT TO INTRO PREVIEWS
// =============================================================================

export interface IntroPreview {
  domain: string;
  subject: string;
  body: string;
  recipientEmail: string;
  recipientName?: string;
}

/**
 * Convert pipeline intros to preview format.
 */
export function snapshotToIntroPreviews(
  snapshot: PipelineRunSnapshot
): IntroPreview[] {
  return snapshot.intros.map(intro => {
    const entity = snapshot.readyEntities.find(
      e => e.entityId === intro.demandEntityId
    );

    return {
      domain: entity?.company.domain || '',
      subject: intro.subject,
      body: intro.body,
      recipientEmail: entity?.contacts.emails[0] || '',
      recipientName: entity?.person?.fullName,
    };
  });
}

// =============================================================================
// FULL UI STATE ADAPTER
// =============================================================================

export interface PipelineUIState {
  matchingResults: LegacyMatchingResult[];
  demandStates: Map<string, LegacyDemandState>;
  supplyMapping: Map<string, LegacySupplyContact>;
  readyCount: number;
  introPreviews: IntroPreview[];
  isParity: boolean;
  parityDetails?: PipelineRunSnapshot['parityDetails'];
}

/**
 * Convert full pipeline snapshot to UI state.
 */
export function snapshotToUIState(snapshot: PipelineRunSnapshot): PipelineUIState {
  return {
    matchingResults: snapshotToMatchingResults(snapshot),
    demandStates: snapshotToDemandStates(snapshot),
    supplyMapping: snapshotToSupplyMapping(snapshot),
    readyCount: snapshotToReadyCount(snapshot),
    introPreviews: snapshotToIntroPreviews(snapshot),
    isParity: snapshot.parityStatus === 'PARITY',
    parityDetails: snapshot.parityDetails,
  };
}

// =============================================================================
// Stage 5: Pipeline is always active - no parity checks needed
// =============================================================================

/**
 * Check if snapshot is ready for UI.
 * Stage 5: Always returns true if snapshot exists (pipeline is the system).
 */
export function shouldFlipToPipeline(snapshot: PipelineRunSnapshot | null): boolean {
  return snapshot !== null;
}
