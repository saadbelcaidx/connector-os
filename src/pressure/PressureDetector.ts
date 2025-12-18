/**
 * PressureDetector.ts
 *
 * HIRING PRESSURE DETECTOR
 *
 * This module inspects observed job datasets and:
 * - Confirms whether hiring pressure exists
 * - Extracts roleType primitives for inversion
 * - Outputs clean, explainable results
 *
 * NO AI. NO COMPLEX HEURISTICS.
 * Simple, deterministic rules based on job title keywords.
 */

import { RoleType } from './InversionTable';

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface ObservedDataset {
  source: 'jobs';
  rawItems: any[];
}

// ============================================================================
// OUTPUT TYPES
// ============================================================================

export interface PressureDetectionResult {
  pressureDetected: boolean;
  pressureType: 'hiring';
  roleType: RoleType;
  confidence: 'high' | 'medium' | 'low';
}

// ============================================================================
// KEYWORD MAPPINGS
// Simple, explicit rules for role detection from job titles
// ============================================================================

const ROLE_KEYWORDS: Record<Exclude<RoleType, 'unknown'>, string[]> = {
  engineering: [
    'engineer',
    'developer',
    'devops',
    'backend',
    'frontend',
    'full stack',
    'fullstack',
    'software',
    'sre',
    'architect'
  ],
  sales: [
    'sales',
    'account executive',
    'business development',
    'bdr',
    'sdr',
    'ae '
  ],
  marketing: [
    'marketing',
    'growth',
    'demand gen',
    'content',
    'brand'
  ],
  operations: [
    'operations',
    ' ops',
    'supply chain',
    'logistics',
    'procurement'
  ],
  finance: [
    'finance',
    'accounting',
    'controller',
    'cfo',
    'financial',
    'accountant'
  ],
  compliance: [
    'compliance',
    'regulatory',
    'risk',
    'legal',
    'audit'
  ]
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract job title from a raw job item
 * Handles various field names from different job board exports
 */
function extractJobTitle(item: any): string {
  if (!item || typeof item !== 'object') return '';

  const title = (
    item.title ??
    item.job_title ??
    item.jobTitle ??
    item.position ??
    item.role ??
    item.name ??
    ''
  );

  return typeof title === 'string' ? title.toLowerCase() : '';
}

/**
 * Detect roleType from a single job title using keyword matching
 */
function detectRoleFromTitle(title: string): RoleType {
  const lowerTitle = title.toLowerCase();

  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerTitle.includes(keyword)) {
        return role as RoleType;
      }
    }
  }

  return 'unknown';
}

/**
 * Calculate confidence based on number of job postings
 */
function calculateConfidence(count: number): 'high' | 'medium' | 'low' {
  if (count >= 3) return 'high';
  if (count === 2) return 'medium';
  return 'low';
}

/**
 * Find the most frequent roleType from a list
 */
function getMostFrequentRole(roles: RoleType[]): RoleType {
  const counts: Record<RoleType, number> = {
    engineering: 0,
    sales: 0,
    marketing: 0,
    operations: 0,
    finance: 0,
    compliance: 0,
    unknown: 0
  };

  for (const role of roles) {
    counts[role]++;
  }

  // Find the role with highest count (excluding 'unknown' if others exist)
  let maxRole: RoleType = 'unknown';
  let maxCount = 0;

  for (const [role, count] of Object.entries(counts)) {
    if (role !== 'unknown' && count > maxCount) {
      maxRole = role as RoleType;
      maxCount = count;
    }
  }

  // If no non-unknown roles found, return unknown
  if (maxCount === 0) {
    return 'unknown';
  }

  return maxRole;
}

// ============================================================================
// PRIMARY FUNCTION
// ============================================================================

/**
 * Detect hiring pressure from a jobs dataset
 *
 * Rules:
 * - pressureDetected = true if rawItems.length >= 1
 * - roleType = most frequent role detected from job titles
 * - confidence = high (3+), medium (2), low (1)
 *
 * @param dataset - The observed jobs dataset
 * @returns PressureDetectionResult with pressure analysis
 */
export function detectHiringPressure(
  dataset: ObservedDataset
): PressureDetectionResult {
  const { rawItems } = dataset;

  // No items = no pressure
  if (!rawItems || rawItems.length === 0) {
    return {
      pressureDetected: false,
      pressureType: 'hiring',
      roleType: 'unknown',
      confidence: 'low'
    };
  }

  // Pressure detected (presence = pressure)
  const pressureDetected = true;

  // Extract roleType from each job title
  const detectedRoles: RoleType[] = rawItems.map(item => {
    const title = extractJobTitle(item);
    return detectRoleFromTitle(title);
  });

  // Get the most frequent role
  const roleType = getMostFrequentRole(detectedRoles);

  // Calculate confidence based on count
  const confidence = calculateConfidence(rawItems.length);

  return {
    pressureDetected,
    pressureType: 'hiring',
    roleType,
    confidence
  };
}
