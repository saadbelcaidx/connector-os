/**
 * EDGE DETECTOR
 *
 * Detects verifiable edges (timing signals) from demand records.
 * Deterministic rules only - no AI, no web calls.
 *
 * Returns null if no verifiable edge exists.
 * Evidence strings are factual and pasteable into intro text.
 */

import type { DemandRecord } from '../schemas/DemandRecord';
import type { Edge } from '../schemas/Edge';

// =============================================================================
// EDGE TYPES (priority order: highest first)
// =============================================================================

const EDGE_PRIORITY = [
  'SCALING',
  'FUNDING_RECENT',  // Crunchbase: recent funding event (within 90 days)
  'GROWTH',
  'EXPANSION',
  'LEADERSHIP_GAP',
  'HIRING_PRESSURE',
  'SUCCESSION',
] as const;

type EdgeType = typeof EDGE_PRIORITY[number];

// =============================================================================
// EDGE CLASSIFICATION — PRIMARY vs CONTEXTUAL
// =============================================================================

/**
 * PRIMARY EDGES: Route-eligible. Can trigger COMPOSE on their own.
 * These represent actionable demand with clear intent.
 */
const PRIMARY_EDGES: EdgeType[] = [
  'SCALING',
  'GROWTH',
  'EXPANSION',
  'LEADERSHIP_GAP',
  'HIRING_PRESSURE',
  'SUCCESSION',
];

/**
 * CONTEXTUAL EDGES: Never route alone. Amplify primary edges.
 * These represent context (funding, stage) not intent.
 *
 * DOCTRINE: Funding ≠ actionable demand. Funding is context, not intent.
 * Routing on funding alone produces weak intros and kills trust.
 */
const CONTEXTUAL_EDGES: EdgeType[] = [
  'FUNDING_RECENT',
];

// Crunchbase funding window (days)
const FUNDING_WINDOW_DAYS = 90;

// =============================================================================
// CONFIDENCE VALUES
// =============================================================================

const CONFIDENCE = {
  HIGH: 0.9,
  MEDIUM: 0.7,
  LOW: 0.5,
} as const;

// =============================================================================
// DETECTION FUNCTIONS
// =============================================================================

interface DetectedEdge {
  type: EdgeType;
  evidence: string;
  confidence: number;
}

/**
 * Check for SCALING edge.
 * Condition: Has funding signal AND multiple open roles.
 */
function detectScaling(demand: DemandRecord): DetectedEdge | null {
  const hasFunding = demand.signals.some(
    s => s.type === 'FUNDING' || s.type === 'funding'
  ) || demand.metadata.hasFunding === true;

  const hasMultipleRoles = demand.signals.some(
    s => s.type === 'MULTIPLE_OPEN_ROLES' || s.type === 'multiple_open_roles'
  ) || (demand.metadata.openRolesCount && demand.metadata.openRolesCount >= 3);

  if (hasFunding && hasMultipleRoles) {
    return {
      type: 'SCALING',
      evidence: 'raised funding and is hiring across teams',
      confidence: CONFIDENCE.HIGH,
    };
  }

  return null;
}

/**
 * Check for FUNDING_RECENT edge.
 * Condition: Crunchbase provenance + funding date within WINDOW_DAYS (90).
 *
 * DOCTRINE: Only fire for Crunchbase data with verified funding event.
 * Evidence MUST be exact and factual (date + type if available).
 */
function detectFundingRecent(demand: DemandRecord): DetectedEdge | null {
  // ONLY fire for Crunchbase provenance
  if (!demand.metadata.crunchbaseProvenance) {
    return null;
  }

  // Check for FUNDING_RECENT signal from Crunchbase
  const fundingSignal = demand.signals.find(
    s => s.type === 'FUNDING_RECENT' && s.source === 'crunchbase'
  );

  const fundingDate = fundingSignal?.value || demand.metadata.fundingDate;
  const fundingType = demand.metadata.fundingType;

  if (!fundingDate) {
    return null;
  }

  // Parse and validate funding date
  const fundingDateParsed = new Date(fundingDate);
  if (isNaN(fundingDateParsed.getTime())) {
    return null;  // Invalid date → NO_EDGE
  }

  // Check if within window
  const now = new Date();
  const daysSinceFunding = Math.floor(
    (now.getTime() - fundingDateParsed.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceFunding > FUNDING_WINDOW_DAYS) {
    return null;  // Too old → NO_EDGE
  }

  // Build factual evidence string
  const dateStr = fundingDateParsed.toISOString().split('T')[0];  // YYYY-MM-DD
  let evidence: string;

  if (fundingType) {
    evidence = `raised ${fundingType} funding on ${dateStr}`;
  } else {
    evidence = `raised funding on ${dateStr}`;
  }

  return {
    type: 'FUNDING_RECENT',
    evidence,
    confidence: CONFIDENCE.HIGH,
  };
}

/**
 * Check for GROWTH edge.
 * Condition: Inc 5000 signal OR revenue growth indicator.
 */
function detectGrowth(demand: DemandRecord): DetectedEdge | null {
  const hasInc5000 = demand.signals.some(
    s => s.type === 'INC_5000' || s.type === 'inc_5000'
  ) || demand.metadata.inc5000 === true;

  const hasRevenueGrowth = demand.metadata.revenueGrowth === true;

  if (hasInc5000) {
    return {
      type: 'GROWTH',
      evidence: 'shows clear growth signals',
      confidence: CONFIDENCE.HIGH,
    };
  }

  if (hasRevenueGrowth) {
    return {
      type: 'GROWTH',
      evidence: 'shows revenue growth',
      confidence: CONFIDENCE.MEDIUM,
    };
  }

  return null;
}

/**
 * Check for EXPANSION edge.
 * Condition: New location/market signal.
 */
function detectExpansion(demand: DemandRecord): DetectedEdge | null {
  const hasNewLocation = demand.signals.some(
    s => s.type === 'NEW_LOCATION' || s.type === 'new_location'
  ) || demand.metadata.newMarkets === true || demand.metadata.newLocation === true;

  if (hasNewLocation) {
    return {
      type: 'EXPANSION',
      evidence: 'is expanding into new markets',
      confidence: CONFIDENCE.MEDIUM,
    };
  }

  return null;
}

/**
 * Check for LEADERSHIP_GAP edge.
 * Condition: C-level or VP role open FROM JOB POSTING PROVENANCE ONLY.
 *
 * DOCTRINE: A role is only "open" if it comes from a job-posting schema.
 * Contact titles (B2B_CONTACTS) represent CURRENT roles, not open positions.
 */
function detectLeadershipGap(demand: DemandRecord): DetectedEdge | null {
  // Only allow leadership gaps from JOB POSTING provenance
  const hasLeadershipSignalFromJobPosting = demand.signals.some(
    s =>
      (s.type === 'C_LEVEL_OPEN' ||
       s.type === 'VP_OPEN' ||
       s.type === 'LEADERSHIP_OPEN') &&
      s.source === 'job_posting'
  );

  const metadataIndicatesLeadershipFromJobPosting =
    demand.metadata.jobPostingProvenance === true &&
    (demand.metadata.hasLeadershipRole === true ||
     demand.metadata.cLevelOpen === true ||
     demand.metadata.vpOpen === true);

  if (hasLeadershipSignalFromJobPosting || metadataIndicatesLeadershipFromJobPosting) {
    return {
      type: 'LEADERSHIP_GAP',
      evidence: 'has an open leadership role',
      confidence: CONFIDENCE.HIGH,
    };
  }

  return null;
}

/**
 * Check for HIRING_PRESSURE edge.
 * Condition: Roles open 30+ days.
 */
function detectHiringPressure(demand: DemandRecord): DetectedEdge | null {
  const hasHiringSignal = demand.signals.some(
    s => s.type === 'HIRING_OPEN_ROLES_30D' ||
         s.type === 'hiring_open_roles_30d' ||
         s.type === 'HIRING_PRESSURE' ||
         s.type === 'hiring_pressure'
  );

  const metadataIndicatesHiring =
    (demand.metadata.openRolesDays && demand.metadata.openRolesDays >= 30) ||
    demand.metadata.hiringPressure === true;

  if (hasHiringSignal || metadataIndicatesHiring) {
    const days = demand.metadata.openRolesDays || 30;
    return {
      type: 'HIRING_PRESSURE',
      evidence: `has roles open for ${days}+ days`,
      confidence: CONFIDENCE.MEDIUM,
    };
  }

  return null;
}

/**
 * Check for SUCCESSION edge.
 * Condition: Owner tenure 10+ years AND no successor signal.
 */
function detectSuccession(demand: DemandRecord): DetectedEdge | null {
  const ownerTenure = demand.metadata.ownerTenureYears;
  const noSuccessor = demand.metadata.noSuccessorSignal === true;

  if (ownerTenure && ownerTenure >= 10 && noSuccessor) {
    return {
      type: 'SUCCESSION',
      evidence: 'owner tenure suggests succession planning',
      confidence: CONFIDENCE.LOW,
    };
  }

  return null;
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

/**
 * Detect the highest-priority edge from a demand record.
 *
 * DOCTRINE: Contextual edges (FUNDING_RECENT) cannot route alone.
 * They amplify primary edges but never initiate routing.
 *
 * @param demand - DemandRecord to analyze
 * @returns Edge if verifiable PRIMARY signal exists, null otherwise
 */
export function detectEdge(demand: DemandRecord): Edge | null {
  // Run all detectors
  const detectors = [
    detectScaling,
    detectFundingRecent,  // Crunchbase: recent funding event
    detectGrowth,
    detectExpansion,
    detectLeadershipGap,
    detectHiringPressure,
    detectSuccession,
  ];

  const detected: DetectedEdge[] = [];

  for (const detector of detectors) {
    const result = detector(demand);
    if (result) {
      detected.push(result);
    }
  }

  if (detected.length === 0) {
    return null;
  }

  // ==========================================================================
  // CONTEXTUAL EDGE GATE
  // ==========================================================================
  // Separate primary edges from contextual edges
  const primaryEdges = detected.filter(e => PRIMARY_EDGES.includes(e.type));
  const contextualEdges = detected.filter(e => CONTEXTUAL_EDGES.includes(e.type));

  // If ONLY contextual edges exist, return null (NO_EDGE)
  // Contextual edges (funding) cannot trigger routing alone
  if (primaryEdges.length === 0) {
    return null;
  }

  // ==========================================================================
  // RETURN HIGHEST PRIORITY PRIMARY EDGE
  // ==========================================================================
  // Sort primary edges by priority (EDGE_PRIORITY order)
  primaryEdges.sort((a, b) => {
    const aIndex = EDGE_PRIORITY.indexOf(a.type);
    const bIndex = EDGE_PRIORITY.indexOf(b.type);
    return aIndex - bIndex;
  });

  // Return highest priority primary edge
  // NOTE: Contextual edges (FUNDING_RECENT) can still be used for:
  // - Evidence copy ("Given your recent Series B raise...")
  // - Confidence modifiers
  // - Intro personalization
  // These are accessed via demand.metadata.fundingType, demand.metadata.fundingDate
  const best = primaryEdges[0];
  return {
    type: best.type,
    evidence: best.evidence,
    confidence: best.confidence,
  };
}
