/**
 * SIGNAL ROUTER SERVICE
 *
 * Routes queries to appropriate signal sources based on criteria.
 * Prioritizes free sources before paid sources.
 *
 * Source Priority:
 * 1. Free: NIH Reporter, ClinicalTrials.gov, SAM.gov
 * 2. Rate Limited: Public APIs
 * 3. Paid: Apollo, Clearbit (fallback only)
 */

import type { SignalSource, SearchCriteria, StrategicAlignment, Signal } from '../platform/types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// =============================================================================
// TYPES
// =============================================================================

interface SignalQueryResult {
  source: SignalSource;
  results: StrategicAlignment[];
  queryTimeMs: number;
  error?: string;
}

interface RouteResult {
  alignments: StrategicAlignment[];
  stats: {
    total_scanned: number;
    total_matched: number;
    sources_queried: SignalSource[];
    query_time_ms: number;
  };
}

// =============================================================================
// SOURCE PRIORITY CONFIGURATION
// =============================================================================

const SOURCE_PRIORITY: Record<SignalSource, 'free' | 'rate_limited' | 'paid'> = {
  nih_grants: 'free',
  clinical_trials: 'free',
  federal_contracts: 'free',
  funded_startups: 'rate_limited',
  job_signals: 'rate_limited',
};

// =============================================================================
// SIGNAL ROUTER
// =============================================================================

export class SignalRouter {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Route a search query to appropriate signal sources.
   * Returns strategic alignments sorted by score.
   */
  async route(criteria: SearchCriteria): Promise<RouteResult> {
    const startTime = Date.now();
    const allAlignments: StrategicAlignment[] = [];
    const queriedSources: SignalSource[] = [];
    let totalScanned = 0;

    // Determine which sources to query based on criteria
    const sourcesToQuery = this.selectSources(criteria);

    // Query sources in priority order
    const freeResults = await this.querySourcesByPriority(sourcesToQuery, 'free', criteria);
    allAlignments.push(...freeResults.alignments);
    totalScanned += freeResults.scanned;
    queriedSources.push(...freeResults.sources);

    // If we have enough results, skip paid sources
    if (allAlignments.length < 5) {
      const limitedResults = await this.querySourcesByPriority(sourcesToQuery, 'rate_limited', criteria);
      allAlignments.push(...limitedResults.alignments);
      totalScanned += limitedResults.scanned;
      queriedSources.push(...limitedResults.sources);
    }

    // Paid fallback only if still under threshold
    if (allAlignments.length < 3) {
      const paidResults = await this.querySourcesByPriority(sourcesToQuery, 'paid', criteria);
      allAlignments.push(...paidResults.alignments);
      totalScanned += paidResults.scanned;
      queriedSources.push(...paidResults.sources);
    }

    // Dedupe and rank
    const rankedAlignments = this.rankAlignments(allAlignments);

    return {
      alignments: rankedAlignments.slice(0, 5), // Top 5
      stats: {
        total_scanned: totalScanned,
        total_matched: rankedAlignments.length,
        sources_queried: queriedSources,
        query_time_ms: Date.now() - startTime,
      },
    };
  }

  /**
   * Select which sources to query based on criteria.
   */
  private selectSources(criteria: SearchCriteria): SignalSource[] {
    // If specific sources requested, use those
    if (criteria.signalSources.length > 0) {
      return criteria.signalSources;
    }

    // Default: query all enabled sources
    return Object.keys(SOURCE_PRIORITY) as SignalSource[];
  }

  /**
   * Query sources of a specific priority tier.
   */
  private async querySourcesByPriority(
    sources: SignalSource[],
    priority: 'free' | 'rate_limited' | 'paid',
    criteria: SearchCriteria
  ): Promise<{ alignments: StrategicAlignment[]; scanned: number; sources: SignalSource[] }> {
    const matchingSources = sources.filter(s => SOURCE_PRIORITY[s] === priority);

    if (matchingSources.length === 0) {
      return { alignments: [], scanned: 0, sources: [] };
    }

    // Query in parallel
    const results = await Promise.all(
      matchingSources.map(source => this.querySource(source, criteria))
    );

    const alignments: StrategicAlignment[] = [];
    let scanned = 0;

    for (const result of results) {
      if (!result.error) {
        alignments.push(...result.results);
        scanned += result.results.length;
      }
    }

    return {
      alignments,
      scanned,
      sources: matchingSources,
    };
  }

  /**
   * Query a single signal source.
   */
  private async querySource(
    source: SignalSource,
    criteria: SearchCriteria
  ): Promise<SignalQueryResult> {
    const startTime = Date.now();

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/platform-simulate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source,
          criteria,
          userId: this.userId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Source query failed: ${response.status}`);
      }

      const data = await response.json();

      return {
        source,
        results: data.alignments || [],
        queryTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error(`[SignalRouter] Error querying ${source}:`, error);
      return {
        source,
        results: [],
        queryTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Rank alignments by composite score.
   * Score factors: signal count, freshness, strength, relevance
   */
  private rankAlignments(alignments: StrategicAlignment[]): StrategicAlignment[] {
    // Dedupe by company domain
    const seen = new Set<string>();
    const unique = alignments.filter(a => {
      const key = a.domain || a.company;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by score descending
    return unique.sort((a, b) => b.score - a.score);
  }
}

// =============================================================================
// SCORING UTILITIES
// =============================================================================

/**
 * Calculate composite score for a match.
 */
export function calculateMatchScore(signals: Signal[]): number {
  if (signals.length === 0) return 0;

  // Signal count: 0-30 points
  const countScore = Math.min(signals.length * 10, 30);

  // Signal freshness: 0-25 points (based on date)
  const freshnessScore = signals.reduce((score, signal) => {
    if (!signal.date) return score + 10;
    const daysSince = daysBetween(new Date(signal.date), new Date());
    if (daysSince <= 7) return score + 25;
    if (daysSince <= 30) return score + 20;
    if (daysSince <= 90) return score + 10;
    return score + 5;
  }, 0) / signals.length;

  // Signal strength: 0-25 points (based on amount/phase)
  const strengthScore = signals.reduce((score, signal) => {
    if (signal.amount) {
      if (signal.amount >= 50_000_000) return score + 25;
      if (signal.amount >= 10_000_000) return score + 20;
      if (signal.amount >= 1_000_000) return score + 15;
      return score + 10;
    }
    return score + 15;
  }, 0) / signals.length;

  // Base relevance: 20 points
  const relevanceScore = 20;

  return Math.round(countScore + freshnessScore + strengthScore + relevanceScore);
}

/**
 * Determine tier based on score.
 */
export function calculateTier(score: number): 'premier' | 'strong' | 'good' {
  if (score >= 80) return 'premier';
  if (score >= 60) return 'strong';
  return 'good';
}

/**
 * Calculate days between two dates.
 */
function daysBetween(date1: Date, date2: Date): number {
  const diff = Math.abs(date2.getTime() - date1.getTime());
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export function createSignalRouter(userId: string): SignalRouter {
  return new SignalRouter(userId);
}
