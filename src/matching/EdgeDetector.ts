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
  'GROWTH',
  'EXPANSION',
  'LEADERSHIP_GAP',
  'HIRING_PRESSURE',
  'SUCCESSION',
] as const;

type EdgeType = typeof EDGE_PRIORITY[number];

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
 * @param demand - DemandRecord to analyze
 * @returns Edge if verifiable signal exists, null otherwise
 */
export function detectEdge(demand: DemandRecord): Edge | null {
  // Run all detectors
  const detectors = [
    detectScaling,
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

  // Sort by priority (EDGE_PRIORITY order)
  detected.sort((a, b) => {
    const aIndex = EDGE_PRIORITY.indexOf(a.type);
    const bIndex = EDGE_PRIORITY.indexOf(b.type);
    return aIndex - bIndex;
  });

  // Return highest priority edge
  const best = detected[0];
  return {
    type: best.type,
    evidence: best.evidence,
    confidence: best.confidence,
  };
}
