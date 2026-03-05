/**
 * STATION TYPES
 *
 * One OS station — not a wizard. Operator sees and decides.
 * Records move through stages manually.
 */

import type { MatchingResult } from '../matching/index';
import type { EnrichmentResult } from '../enrichment/router';
import type { IntroAIConfig } from '../services/IntroAI';

// =============================================================================
// STEP / PANEL STATE MACHINE
// =============================================================================

export type StationStep = 'load' | 'station';
export type StationPanel = 'match_review' | 'enriching' | 'route';

// =============================================================================
// ROW LIFECYCLE — per-row phase marker (user requirement)
// =============================================================================

export type RowPhase = 'matched' | 'enriching' | 'enriched' | 'generated' | 'sent';

// =============================================================================
// INTRO ENTRY — defined locally (IntroEntry is private in Flow.tsx)
// =============================================================================

export interface IntroEntry {
  text: string;
  source: 'template' | 'ai' | 'ai-fallback';
}

// =============================================================================
// DEAL — print layer (localStorage, no DB)
// =============================================================================

export interface Deal {
  id: string;
  demandCompany: string;
  supplyCompany: string;
  introSentAt: string;
  accessFee?: number;
  supplyAccessFee?: number;
  revSharePercent?: number;
  dealSize?: number;
  status: 'intro_sent' | 'replied' | 'call_booked' | 'access_fee_paid' | 'deal_closed';
  notes?: string;
}

// =============================================================================
// CONNECTOR CLIENT — fulfillment mode / client lens (Slice 5, deferred)
// =============================================================================

export interface ConnectorClient {
  id: string;
  name: string;
  icp: {
    targetedBy: string;
    capability: string;
    identityDescription: string;
    idealPriorMatch: string;
    notAFit: string;
    triggerEvent: string;
    howToDescribe: string;
    meetingContact: string;
  };
  buckets: {
    ready: string[];    // recordKeys
    warming: string[];
    notYet: string[];
  };
}

// =============================================================================
// OVERLAY ARCHITECTURE — §5 of Fulfillment Overlay Architecture Plan
// Overlays are additive and isolated. They only affect scoring and visibility.
// =============================================================================

export interface OverlayFilterInclude {
  industries?: string[];
  titles?: string[];
  signals?: string[];
  signalGroups?: string[];   // ['growth', 'capital', 'product', 'deals', 'risk', 'other', 'unknown']
  geo?: string[];
  employeeRange?: [number, number];
  revenueRange?: [number, number];
}

export interface OverlayFilterExclude {
  companies?: string[];
  industries?: string[];
  titles?: string[];
  signals?: string[];
  signalGroups?: string[];   // ['risk', 'unknown']
}

export interface OverlayFilters {
  include: OverlayFilterInclude;
  exclude: OverlayFilterExclude;
}

export interface OverlayWeights {
  signalWeight?: Record<string, number>;   // signal kind → 0-5
  titleMatch?: number;
  industryMatch?: number;
  domainPresent?: number;
  emailPresent?: number;
  tierBoost?: {
    strong?: number;
    good?: number;
    open?: number;
  };
  recencyDays?: {
    '0_7'?: number;
    '8_30'?: number;
    '31_90'?: number;
  };
}

export interface OverlayExclusions {
  supplyMaxUsagePerRun?: number;
  blockIfMissingDomainWhenOnlyConnectorAgent?: boolean;
}

export interface OverlayRouting {
  anonymizeDemandOnSupply?: boolean;
  anonymizeSupplyOnDemand?: boolean;
}

export interface OverlaySpec {
  filters: OverlayFilters;
  weights: OverlayWeights;
  exclusions: OverlayExclusions;
  routing: OverlayRouting;
  roleMode?: 'client_is_demand' | 'client_is_supply';
}

// =============================================================================
// CLIENT PROFILE — onboarding data from Typeform briefs / manual entry
// =============================================================================

export interface ClientProfile {
  // Identity
  companyDescription?: string;        // "Twin Focus Capital Partners is..."
  specialization?: string;            // "Multi-family office", "Creative production SaaS"

  // ICP — who they want to reach
  icpTitles?: string[];               // ["CEO", "Founder", "CFO"]
  icpIndustries?: string[];           // ["Technology", "Finance", "Biotech"]
  icpCompanySize?: string;            // "50M+ net worth", "5-50 people"
  icpGeography?: string;              // "US-based", "North America"
  icpDescription?: string;            // Free-text ICP summary

  // Pain & Outcome
  painPoints?: string[];              // ["Scattered investments", "No unified strategy"]
  desiredOutcomes?: string[];         // ["Consolidated wealth plan", "Tax optimization"]

  // Proof
  caseStudy?: string;                 // Free-text: "Tech founder, $200M exit..."
  differentiators?: string[];         // ["Direct PE access", "In-house tax team"]

  // Messaging
  messagingTone?: string;             // "Professional, discreet, exclusive"
  prospectingQuestions?: string[];     // ["What does your current wealth setup look like?"]

  // Raw brief (paste full doc here)
  fullBrief?: string;                 // Full Typeform/brief text dump
}

// =============================================================================
// FULFILLMENT CLIENT — the entity that receives the overlay lens
// =============================================================================

export interface FulfillmentClient {
  id: string;
  name: string;
  economicSide: 'demand' | 'supply' | 'both';
  market?: string;
  status: 'active' | 'paused' | 'archived';
  createdAt: string;
  lockedManual?: boolean;           // per-client governance: disable suggestions entirely
  suggestionDismissals?: Record<string, string>;  // { suggestionId: ISO dismissedUntil }
  profile?: ClientProfile;
}

// =============================================================================
// CLIENT TARGET SET — named group of titles/industries for overlay reuse
// localStorage key: client_target_sets_v1
// =============================================================================

export interface ClientTargetSet {
  id: string;
  name: string;                  // "Senior Eng Buyers"
  titles?: string[];             // ["CTO", "VP Engineering"]
  industries?: string[];         // ["SaaS", "FinTech"]
  createdAt: string;
}

// =============================================================================
// CLIENT OVERLAY — versioned overlay per (client). Append-only.
// Rollback = activate a previous version row.
// =============================================================================

export interface ClientOverlay {
  id: string;
  clientId: string;
  laneId?: string;        // optional in V1 localStorage mode
  targetSetId?: string;   // references ClientTargetSet.id
  version: number;
  isActive: boolean;
  overlay: OverlaySpec;
  createdAt: string;
  createdBy?: string;
  activatedAt?: string;   // ISO — when this version became active
  deactivatedAt?: string; // ISO — when this version was replaced
}

// =============================================================================
// OVERLAY AUDIT ENTRY — immutable record of overlay changes
// =============================================================================

export interface OverlayAuditEntry {
  id: string;
  overlayId: string;
  event: 'created' | 'updated' | 'activated' | 'reverted';
  diff?: unknown;
  createdAt: string;
  actor?: string;
}

// =============================================================================
// STATION STATE
// =============================================================================

export interface StationState {
  step: StationStep;
  panel: StationPanel;

  // Data
  matchingResult: MatchingResult | null;

  // Operator selection (by match index — each Match row is one pair)
  selectedMatchIndices: Set<number>;

  // Per-row lifecycle phases — keyed by match index (string of number)
  rowPhases: Map<string, RowPhase>;

  // Enrichment results — keyed by domain
  enrichedDemand: Map<string, EnrichmentResult>;
  enrichedSupply: Map<string, EnrichmentResult>;

  // Intro results — keyed by match index
  demandIntros: Map<string, IntroEntry>;
  supplyIntros: Map<string, IntroEntry>;

  // Send status per row — keyed by match index
  demandSendStatus: Map<string, 'idle' | 'sending' | 'sent' | 'error'>;
  supplySendStatus: Map<string, 'idle' | 'sending' | 'sent' | 'error'>;

  // Enrichment progress
  enrichProgress: {
    demand: number;
    demandTotal: number;
    supply: number;
    supplyTotal: number;
  };

  // Client lens (null = all signals, Slice 5 deferred)
  activeClientId: string | null;
  clients: ConnectorClient[];

  // Settings loaded on mount
  instantlyApiKey: string | null;
  demandCampaignId: string | null;
  supplyCampaignId: string | null;
  aiConfig: IntroAIConfig | null;

  error: string | null;
}
