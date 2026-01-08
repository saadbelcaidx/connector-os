/**
 * PIPELINE BRIDGE
 *
 * Connects new pipeline to existing UI state.
 * Maps pipeline stages to UI visual states.
 */

import type {
  PipelineItem,
  PipelineStage,
  RawInput,
  MatchResult,
  CacheEntry,
  ValidationResult,
  EnrichmentResult,
  Intro,
  SendResult,
} from './contract';

// =============================================================================
// UI STATE (what the existing UI expects)
// =============================================================================

export type UIVisualState =
  | 'setup'      // No data
  | 'matching'   // Scanning animation
  | 'results'    // Show matches
  | 'enriching'  // Finding decision makers
  | 'ready';     // Ready to route

// =============================================================================
// MAP PIPELINE STAGE TO UI STATE
// =============================================================================

export function pipelineStageToUIState(stage: PipelineStage | 'idle'): UIVisualState {
  switch (stage) {
    case 'idle':
    case 'input':
      return 'setup';
    case 'match':
      return 'matching';
    case 'cache':
    case 'validate':
    case 'enrich':
    case 'store':
      return 'enriching';
    case 'intro':
    case 'send':
      return 'ready';
    default:
      return 'setup';
  }
}

// =============================================================================
// EXTRACT UI DATA FROM PIPELINE ITEMS
// =============================================================================

export interface UIMatchResult {
  domain: string;
  companyName: string;
  supplyDomain: string;
  supplyName: string;
  matchReason: string;
  confidence: number;
  signals: string[];
}

export function pipelineItemToUIMatch(item: PipelineItem): UIMatchResult {
  return {
    domain: item.demand.domain || '',
    companyName: item.demand.companyName || item.demand.domain || '',
    supplyDomain: item.supply.domain || '',
    supplyName: item.supply.companyName || item.supply.domain || '',
    matchReason: item.match?.reason || '',
    confidence: item.match?.confidence || 0,
    signals: item.demand.signals || [],
  };
}

// =============================================================================
// EXTRACT CONTACT DATA
// =============================================================================

export interface UIContact {
  email: string;
  name: string;
  title: string;
  linkedin?: string;
  source: 'apollo' | 'anymail' | 'dataset' | 'cache';
}

export function extractDemandContact(item: PipelineItem): UIContact | null {
  // Priority: enrichment > cache > raw input
  if (item.demandEnrichment?.success) {
    return {
      email: item.demandEnrichment.email || '',
      name: item.demandEnrichment.name || '',
      title: item.demandEnrichment.title || '',
      linkedin: item.demandEnrichment.linkedin,
      source: item.demandEnrichment.source,
    };
  }
  if (item.demandCache?.email) {
    return {
      email: item.demandCache.email,
      name: item.demandCache.name || '',
      title: item.demandCache.title || '',
      source: 'cache',
    };
  }
  if (item.demand.email) {
    return {
      email: item.demand.email,
      name: item.demand.name || '',
      title: item.demand.title || '',
      linkedin: item.demand.linkedin,
      source: 'dataset',
    };
  }
  return null;
}

export function extractSupplyContact(item: PipelineItem): UIContact | null {
  if (item.supplyEnrichment?.success) {
    return {
      email: item.supplyEnrichment.email || '',
      name: item.supplyEnrichment.name || '',
      title: item.supplyEnrichment.title || '',
      linkedin: item.supplyEnrichment.linkedin,
      source: item.supplyEnrichment.source,
    };
  }
  if (item.supplyCache?.email) {
    return {
      email: item.supplyCache.email,
      name: item.supplyCache.name || '',
      title: item.supplyCache.title || '',
      source: 'cache',
    };
  }
  if (item.supply.email) {
    return {
      email: item.supply.email,
      name: item.supply.name || '',
      title: item.supply.title || '',
      linkedin: item.supply.linkedin,
      source: 'dataset',
    };
  }
  return null;
}

// =============================================================================
// PROGRESS TRACKING
// =============================================================================

export interface UIProgress {
  stage: UIVisualState;
  total: number;
  completed: number;
  percent: number;
  currentItem?: string;
}

export function calculateProgress(items: PipelineItem[], stage: PipelineStage | 'idle'): UIProgress {
  const total = items.length;

  // Count completed based on current stage
  let completed = 0;
  let stageIndex = ['input', 'match', 'cache', 'validate', 'enrich', 'store', 'intro', 'send'].indexOf(stage);

  for (const item of items) {
    if (item.blocked) continue;
    const itemStageIndex = ['input', 'match', 'cache', 'validate', 'enrich', 'store', 'intro', 'send'].indexOf(item.currentStage);
    if (itemStageIndex >= stageIndex) {
      completed++;
    }
  }

  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    stage: pipelineStageToUIState(stage),
    total,
    completed,
    percent,
    currentItem: items.find(i => !i.blocked && i.currentStage === stage)?.demand.companyName,
  };
}

// =============================================================================
// READY COUNT (for routing)
// =============================================================================

export function getReadyToRouteCount(items: PipelineItem[]): number {
  return items.filter(i =>
    !i.blocked &&
    i.intro &&
    extractDemandContact(i) &&
    extractSupplyContact(i)
  ).length;
}

// =============================================================================
// BLOCKED ITEMS
// =============================================================================

export function getBlockedItems(items: PipelineItem[]): PipelineItem[] {
  return items.filter(i => i.blocked);
}

// =============================================================================
// INTROS FOR UI
// =============================================================================

export interface UIIntro {
  demandDomain: string;
  supplyDomain: string;
  demandIntro: string;
  supplyIntro: string;
  matchContext: string;
}

export function extractIntros(items: PipelineItem[]): UIIntro[] {
  return items
    .filter(i => i.intro && !i.blocked)
    .map(i => ({
      demandDomain: i.demand.domain || '',
      supplyDomain: i.supply.domain || '',
      demandIntro: i.intro!.demandIntro,
      supplyIntro: i.intro!.supplyIntro,
      matchContext: i.intro!.matchContext,
    }));
}

// =============================================================================
// SEND STATUS
// =============================================================================

export interface UISendStatus {
  demandDomain: string;
  supplyDomain: string;
  demandSent: boolean;
  supplySent: boolean;
  error?: string;
}

export function extractSendStatus(items: PipelineItem[]): UISendStatus[] {
  return items
    .filter(i => i.send)
    .map(i => ({
      demandDomain: i.demand.domain || '',
      supplyDomain: i.supply.domain || '',
      demandSent: i.send!.demandSent,
      supplySent: i.send!.supplySent,
      error: i.send!.error,
    }));
}
