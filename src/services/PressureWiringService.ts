/**
 * PressureWiringService.ts
 *
 * WIRING LAYER - Connects PressureInversionEngine modules to app flow.
 *
 * This service DOES NOT contain business logic - it's pure orchestration.
 * All detection logic lives in src/pressure/ modules.
 *
 * Flow:
 * 1. Receive raw jobs dataset
 * 2. Call detectHiringPressure (PressureDetector)
 * 3. Call invertRoleTypeToCounterparty (InversionTable)
 * 4. Call synthesizeFilters (FilterSynthesizer)
 * 5. Return results for storage/display
 */

import { detectHiringPressure, ObservedDataset, PressureDetectionResult } from '../pressure/PressureDetector';
import { invertRoleTypeToCounterparty, CounterpartyCategory } from '../pressure/InversionTable';
import { synthesizeFilters, ScraperFilters, VerticalHint } from '../pressure/FilterSynthesizer';

// ============================================================================
// TYPES
// ============================================================================

export interface PressureWiringResult {
  detection: PressureDetectionResult;
  counterparty: CounterpartyCategory;
  filters: ScraperFilters;
}

// ============================================================================
// MAIN WIRING FUNCTION
// ============================================================================

/**
 * Process a jobs dataset through the PressureInversionEngine.
 *
 * This is the ONLY entry point for pressure detection in the app.
 * Call this ONCE after a jobs dataset is loaded/validated.
 *
 * @param rawJobsItems - Array of raw job items from Apify dataset
 * @param verticalHint - Optional vertical hint for filter pack selection
 * @param geoInclude - Optional geography filter
 * @returns PressureWiringResult with detection, counterparty, and filters
 */
export function processJobsDatasetForPressure(
  rawJobsItems: any[],
  verticalHint: VerticalHint = 'generic',
  geoInclude?: string[]
): PressureWiringResult {
  // Step 1: Detect hiring pressure from jobs
  const dataset: ObservedDataset = {
    source: 'jobs',
    rawItems: rawJobsItems
  };
  const detection = detectHiringPressure(dataset);

  // Step 2: Invert to counterparty (even if no pressure, we get 'unknown')
  const counterparty = invertRoleTypeToCounterparty(detection.roleType);

  // Step 3: Synthesize filters (handles no-pressure case internally)
  const filters = synthesizeFilters({
    detection,
    counterparty,
    verticalHint,
    geoInclude
  });

  console.log('[PressureWiring] Processed dataset:', {
    itemCount: rawJobsItems.length,
    pressureDetected: detection.pressureDetected,
    roleType: detection.roleType,
    confidence: detection.confidence,
    counterparty,
    filtersGenerated: detection.pressureDetected
  });

  return {
    detection,
    counterparty,
    filters
  };
}

/**
 * Humanize roleType for display
 */
export function humanizeRoleType(roleType: string): string {
  const map: Record<string, string> = {
    engineering: 'Engineering',
    sales: 'Sales',
    marketing: 'Marketing',
    operations: 'Operations',
    finance: 'Finance',
    compliance: 'Compliance',
    unknown: 'General'
  };
  return map[roleType] || 'General';
}

/**
 * Get proper plural form for role types
 * e.g., "engineers", "salespeople", "marketers" (NOT "marketings")
 */
export function getRolePlural(roleType: string): string {
  const plurals: Record<string, string> = {
    engineering: 'engineers',
    sales: 'salespeople',
    marketing: 'marketers',
    operations: 'ops talent',
    finance: 'finance pros',
    compliance: 'compliance specialists',
    unknown: 'talent'
  };
  return plurals[roleType] || 'talent';
}

/**
 * Humanize counterparty for display
 */
export function humanizeCounterparty(counterparty: CounterpartyCategory): string {
  const map: Record<CounterpartyCategory, string> = {
    tech_recruitment: 'Technical Recruiters',
    sales_recruitment: 'Sales Recruiters',
    marketing_recruitment: 'Marketing Recruiters',
    executive_search: 'Executive Search',
    compliance_consulting: 'Compliance Consulting',
    cloud_consulting: 'Cloud Consulting',
    unknown: 'General Providers'
  };
  return map[counterparty] || 'Service Providers';
}
