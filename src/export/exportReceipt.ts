/**
 * EXPORT RECEIPT — Trust Layer
 *
 * Explains what was filtered and why.
 * Users see counts + reasons BEFORE downloading CSV.
 *
 * DOCTRINE: Export must be explainable. No silent filtering.
 */

import type { EnrichmentResult } from '../enrichment';
import { recordKey } from '../enrichment';

// =============================================================================
// TYPES
// =============================================================================

export type FilterReason =
  | 'NO_MATCH'              // Not in matching results
  | 'NO_EMAIL'              // Enrichment didn't find email
  | 'NOT_VERIFIED'          // Email exists but not verified
  | 'NO_INTRO'              // Intro not generated
  | 'DUPLICATE_DOMAIN'      // Same domain already exported
  | 'ENRICHMENT_FAILED'     // Enrichment threw error
  | 'USER_EXCLUDED'         // User manually excluded
  | 'BUYER_SELLER_MISMATCH'; // Supply Truth Constraint: supply doesn't sell to demand type

export interface FilteredRecord {
  domain: string;
  reason: FilterReason;
}

export interface ExportReceipt {
  // Counts
  totalMatched: number;
  totalEnriched: number;
  totalWithEmail: number;
  totalWithIntro: number;
  totalExported: number;

  // Breakdown by reason
  filtered: {
    reason: FilterReason;
    count: number;
    examples: string[]; // First 3 domains for each reason
  }[];

  // Validation
  isValid: boolean; // Sum of filtered counts === totalMatched - totalExported
  delta: number;    // totalMatched - totalExported
}

// =============================================================================
// RECEIPT BUILDER — Demand Side
// =============================================================================

export interface DemandExportInput {
  matches: Array<{ demand: { domain?: string | null; company?: string | null; fullName?: string | null; companyName?: string; raw?: { uuid?: string } | null } }>;
  enriched: Map<string, EnrichmentResult>;
  intros: Map<string, string>;
}

export function buildDemandReceipt(input: DemandExportInput): ExportReceipt {
  const { matches, enriched, intros } = input;

  const filtered: FilteredRecord[] = [];
  const seenKeys = new Set<string>();

  let totalWithEmail = 0;
  let totalWithIntro = 0;
  let totalExported = 0;

  for (const match of matches) {
    const key = recordKey(match.demand);
    const domain = match.demand.domain || key; // Use key as display fallback

    // Check duplicate
    if (seenKeys.has(key)) {
      filtered.push({ domain, reason: 'DUPLICATE_DOMAIN' });
      continue;
    }
    seenKeys.add(key);

    // Check enrichment
    const enrichResult = enriched.get(key);
    if (!enrichResult) {
      filtered.push({ domain, reason: 'ENRICHMENT_FAILED' });
      continue;
    }

    // Check email
    if (!enrichResult.email) {
      filtered.push({ domain, reason: 'NO_EMAIL' });
      continue;
    }

    // Check verified
    if (!enrichResult.verified) {
      filtered.push({ domain, reason: 'NOT_VERIFIED' });
      continue;
    }

    totalWithEmail++;

    // Check intro
    const intro = intros.get(key);
    if (!intro) {
      filtered.push({ domain, reason: 'NO_INTRO' });
      continue;
    }

    totalWithIntro++;
    totalExported++;
  }

  // Build reason breakdown
  const reasonCounts = new Map<FilterReason, { count: number; examples: string[] }>();

  for (const f of filtered) {
    const existing = reasonCounts.get(f.reason) || { count: 0, examples: [] };
    existing.count++;
    if (existing.examples.length < 3) {
      existing.examples.push(f.domain);
    }
    reasonCounts.set(f.reason, existing);
  }

  const filteredBreakdown = Array.from(reasonCounts.entries()).map(([reason, data]) => ({
    reason,
    count: data.count,
    examples: data.examples,
  }));

  const delta = matches.length - totalExported;
  const filteredSum = filteredBreakdown.reduce((sum, f) => sum + f.count, 0);

  return {
    totalMatched: matches.length,
    totalEnriched: enriched.size,
    totalWithEmail,
    totalWithIntro,
    totalExported,
    filtered: filteredBreakdown,
    isValid: filteredSum === delta,
    delta,
  };
}

// =============================================================================
// RECEIPT BUILDER — Supply Side
// =============================================================================

export interface SupplyExportInput {
  aggregates: Array<{ supply: { domain?: string | null; company?: string | null; fullName?: string | null; companyName?: string; raw?: { uuid?: string } | null }; matchCount: number }>;
  enriched: Map<string, EnrichmentResult>;
  intros: Map<string, string>;
}

export function buildSupplyReceipt(input: SupplyExportInput): ExportReceipt {
  const { aggregates, enriched, intros } = input;

  const filtered: FilteredRecord[] = [];
  const seenKeys = new Set<string>();

  let totalWithEmail = 0;
  let totalWithIntro = 0;
  let totalExported = 0;

  for (const agg of aggregates) {
    const key = recordKey(agg.supply);
    const domain = agg.supply.domain || key; // Use key as display fallback

    // Check duplicate
    if (seenKeys.has(key)) {
      filtered.push({ domain, reason: 'DUPLICATE_DOMAIN' });
      continue;
    }
    seenKeys.add(key);

    // Check enrichment
    const enrichResult = enriched.get(key);
    if (!enrichResult) {
      filtered.push({ domain, reason: 'ENRICHMENT_FAILED' });
      continue;
    }

    // Check email
    if (!enrichResult.email) {
      filtered.push({ domain, reason: 'NO_EMAIL' });
      continue;
    }

    // Check verified
    if (!enrichResult.verified) {
      filtered.push({ domain, reason: 'NOT_VERIFIED' });
      continue;
    }

    totalWithEmail++;

    // Check intro
    const intro = intros.get(key);
    if (!intro) {
      filtered.push({ domain, reason: 'NO_INTRO' });
      continue;
    }

    totalWithIntro++;
    totalExported++;
  }

  // Build reason breakdown
  const reasonCounts = new Map<FilterReason, { count: number; examples: string[] }>();

  for (const f of filtered) {
    const existing = reasonCounts.get(f.reason) || { count: 0, examples: [] };
    existing.count++;
    if (existing.examples.length < 3) {
      existing.examples.push(f.domain);
    }
    reasonCounts.set(f.reason, existing);
  }

  const filteredBreakdown = Array.from(reasonCounts.entries()).map(([reason, data]) => ({
    reason,
    count: data.count,
    examples: data.examples,
  }));

  const delta = aggregates.length - totalExported;
  const filteredSum = filteredBreakdown.reduce((sum, f) => sum + f.count, 0);

  return {
    totalMatched: aggregates.length,
    totalEnriched: enriched.size,
    totalWithEmail,
    totalWithIntro,
    totalExported,
    filtered: filteredBreakdown,
    isValid: filteredSum === delta,
    delta,
  };
}

// =============================================================================
// HUMAN-READABLE REASON LABELS
// =============================================================================

// Apple-style labels — no "failed" or "missing" language
export const REASON_LABELS: Record<FilterReason, string> = {
  NO_MATCH: 'Not matched',
  NO_EMAIL: 'Need email',
  NOT_VERIFIED: 'Email unverified',
  NO_INTRO: 'Need intro',
  DUPLICATE_DOMAIN: 'Duplicate',
  ENRICHMENT_FAILED: 'Need enrichment',
  USER_EXCLUDED: 'Excluded',
  BUYER_SELLER_MISMATCH: 'Type mismatch',
};

/**
 * Format receipt as human-readable summary.
 */
export function formatReceiptSummary(receipt: ExportReceipt, side: 'demand' | 'supply'): string {
  const lines: string[] = [];

  lines.push(`Exporting ${receipt.totalExported} of ${receipt.totalMatched} ${side} records`);
  lines.push('');

  if (receipt.filtered.length > 0) {
    lines.push('Filtered out:');
    for (const f of receipt.filtered) {
      const label = REASON_LABELS[f.reason];
      lines.push(`  • ${f.count} ${label}`);
    }
  }

  if (!receipt.isValid) {
    lines.push('');
    lines.push(`⚠️ Validation mismatch: delta=${receipt.delta}, filtered=${receipt.filtered.reduce((s, f) => s + f.count, 0)}`);
  }

  return lines.join('\n');
}
