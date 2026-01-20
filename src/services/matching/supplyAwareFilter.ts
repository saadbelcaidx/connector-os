/**
 * SUPPLY-AWARE FILTER — Filter demand by supply capability
 *
 * Shows operators which demand signals their supply can actually serve.
 * "147 signals → 23 match your supply (16%)"
 *
 * Uses BIZGRAPH for semantic matching when available.
 */

import type { NormalizedRecord } from '../../schemas';
import { getBizGraph, hasConceptMatch, BIZGRAPH_ENABLED } from '../../semantic/bizgraph';

// =============================================================================
// TYPES
// =============================================================================

export interface FilterResult {
  totalDemand: number;
  matchableDemand: number;
  filteredDemand: NormalizedRecord[];
  supplyGaps: string[];
  matchPercentage: number;
}

// =============================================================================
// CAPABILITY EXTRACTION
// =============================================================================

/**
 * Extract capabilities from supply records.
 * Capabilities are what a supplier CAN do.
 */
function extractSupplyCapabilities(supply: NormalizedRecord[]): Set<string> {
  const capabilities = new Set<string>();

  for (const s of supply) {
    // Extract from title, specialty, vertical fields
    if (s.title) {
      capabilities.add(normalizeCapability(s.title));
    }
    if (s.raw?.specialty) {
      capabilities.add(normalizeCapability(s.raw.specialty));
    }
    if (s.raw?.vertical) {
      capabilities.add(normalizeCapability(s.raw.vertical));
    }
    if (s.industry) {
      const industries = Array.isArray(s.industry) ? s.industry : [s.industry];
      industries.forEach(ind => capabilities.add(normalizeCapability(ind)));
    }
    // Service description (common in supply CSVs)
    if (s.raw?.serviceDescription) {
      // Extract key terms from service description
      const terms = extractKeyTerms(s.raw.serviceDescription);
      terms.forEach(t => capabilities.add(t));
    }
    if (s.raw?.['Service Description']) {
      const terms = extractKeyTerms(s.raw['Service Description']);
      terms.forEach(t => capabilities.add(t));
    }
  }

  return capabilities;
}

/**
 * Extract key terms from a text description.
 */
function extractKeyTerms(text: string): string[] {
  const terms: string[] = [];
  const normalized = text.toLowerCase();

  // Common capability keywords
  const keywords = [
    'recruiting', 'recruitment', 'staffing', 'hiring',
    'sales', 'revenue', 'gtm', 'go-to-market',
    'marketing', 'growth', 'brand', 'digital',
    'engineering', 'tech', 'software', 'development',
    'finance', 'accounting', 'cfo', 'financial',
    'operations', 'ops', 'supply chain', 'logistics',
    'consulting', 'advisory', 'strategy',
    'saas', 'b2b', 'enterprise', 'startup',
    'healthcare', 'pharma', 'biotech', 'life science',
    'fintech', 'crypto', 'blockchain',
    'real estate', 'property', 'construction',
  ];

  for (const kw of keywords) {
    if (normalized.includes(kw)) {
      terms.push(normalizeCapability(kw));
    }
  }

  return terms;
}

/**
 * Check if any supply can serve a demand signal.
 */
function canAnySupplyServe(
  demand: NormalizedRecord,
  capabilities: Set<string>
): boolean {
  // Extract demand signals to check
  const demandSignals = [
    demand.title,
    demand.signal,
    demand.signalDetail,
    demand.industry,
    demand.raw?.roleType,
    demand.raw?.vertical,
  ]
    .filter(Boolean)
    .flatMap(s => Array.isArray(s) ? s : [s])
    .map(s => normalizeCapability(s as string));

  // Try exact matching first
  for (const signal of demandSignals) {
    if (capabilities.has(signal)) {
      return true;
    }
  }

  // Try partial matching (substring)
  for (const signal of demandSignals) {
    for (const cap of capabilities) {
      // Either contains the other
      if (signal.includes(cap) || cap.includes(signal)) {
        return true;
      }
    }
  }

  // Try BIZGRAPH semantic matching if available
  if (BIZGRAPH_ENABLED) {
    const bizgraph = getBizGraph();
    if (bizgraph) {
      for (const signal of demandSignals) {
        for (const cap of capabilities) {
          // Use hasConceptMatch for semantic similarity
          if (hasConceptMatch(signal, [cap])) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Normalize a capability string for matching.
 */
function normalizeCapability(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

// =============================================================================
// MAIN FILTER FUNCTION
// =============================================================================

/**
 * Filter demand records by supply capability.
 *
 * Returns which demands can be served by the available supply,
 * and which demands have no matching supply (gaps).
 */
export function filterDemandBySupplyCapability(
  demand: NormalizedRecord[],
  supply: NormalizedRecord[]
): FilterResult {
  if (supply.length === 0) {
    return {
      totalDemand: demand.length,
      matchableDemand: 0,
      filteredDemand: [],
      supplyGaps: demand.slice(0, 20).map(d =>
        `${d.company}: No supply loaded`
      ),
      matchPercentage: 0,
    };
  }

  // Extract what supply CAN serve
  const supplyCapabilities = extractSupplyCapabilities(supply);

  console.log('[SupplyAwareFilter] Capabilities extracted:', supplyCapabilities.size);

  // Filter demand to only matchable
  const filteredDemand: NormalizedRecord[] = [];
  const supplyGaps: string[] = [];

  for (const d of demand) {
    if (canAnySupplyServe(d, supplyCapabilities)) {
      filteredDemand.push(d);
    } else {
      // Track gaps (limit to 20 for UI)
      if (supplyGaps.length < 20) {
        const signal = d.signal || d.title || 'Unknown need';
        supplyGaps.push(`${d.company}: ${signal}`);
      }
    }
  }

  const matchPercentage = demand.length > 0
    ? Math.round((filteredDemand.length / demand.length) * 100)
    : 0;

  console.log('[SupplyAwareFilter] Result:', {
    total: demand.length,
    matchable: filteredDemand.length,
    percentage: matchPercentage,
    gaps: supplyGaps.length,
  });

  return {
    totalDemand: demand.length,
    matchableDemand: filteredDemand.length,
    filteredDemand,
    supplyGaps,
    matchPercentage,
  };
}
