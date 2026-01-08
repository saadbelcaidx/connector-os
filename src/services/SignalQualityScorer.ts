/**
 * SignalQualityScorer - Scores signal quality for ANY demand/supply matching
 *
 * Works for any niche:
 * - Recruiters ↔ Hiring companies
 * - Wealth managers ↔ HNW individuals
 * - Biotech ↔ Pharma partners
 * - SaaS vendors ↔ Implementation partners
 * - Any two industries that need each other
 *
 * This is SEPARATE from matchScore (which measures operator fit).
 * Quality score measures how strong/actionable the signal itself is.
 *
 * Factors:
 * - Persistence: How long has this need been unfilled? (gated by liveness)
 * - Density: How many signals from this source?
 * - Velocity: Is signal activity accelerating?
 * - Stacking: Multiple signal types = stronger
 */

import { safeLower, safeText } from './SignalsClient';

// =============================================================================
// TYPES
// =============================================================================

export interface SignalQualityScore {
  total: number;           // 0-100 composite score
  tier: 'A' | 'B' | 'C';   // Quick tier classification
  breakdown: {
    persistence: number;   // 0-30 points (was "freshness", now inverted)
    density: number;       // 0-30 points
    velocity: number;      // 0-20 points
    stacking: number;      // 0-20 points
  };
  reasons: string[];       // Human-readable explanations
}

export interface CompanySignalData {
  domain: string;
  companyName: string;
  signals: SignalItem[];          // Generic signals, not just "jobs"
  secondarySignals?: {            // Additional signal types for stacking
    hasFunding?: boolean;
    fundingRecency?: number;
    hasLayoffs?: boolean;
    hasGrowth?: boolean;
    headcountGrowth?: number;
    customSignals?: string[];     // Any other signals: "acquisition", "expansion", etc.
  };
}

export interface SignalItem {
  title?: string;                 // What the signal is about
  postedAt?: Date | string | null;
  scrapedAt?: Date | string | null;
  raw?: any;
}

// Keep old interface name for backwards compatibility
export type JobSignalItem = SignalItem;

// =============================================================================
// DATE EXTRACTION
// =============================================================================

/**
 * Extract posting date from raw job data
 * Handles various field names from different Apify scrapers
 */
function extractPostedDate(raw: any): Date | null {
  if (!raw || typeof raw !== 'object') return null;

  // Common date field names across scrapers
  const dateFields = [
    'postedAt',
    'posted_at',
    'datePosted',
    'date_posted',
    'publishedAt',
    'published_at',
    'createdAt',
    'created_at',
    'postDate',
    'post_date',
    'jobPostedAt',
    'listingDate',
    'posting_date',
    'scrapedAt',      // Fallback: when Apify scraped it
    'scraped_at',
    'timestamp',
  ];

  for (const field of dateFields) {
    const value = raw[field];
    if (value) {
      const parsed = parseDate(value);
      if (parsed) return parsed;
    }
  }

  return null;
}

/**
 * Parse various date formats into Date object
 */
function parseDate(value: any): Date | null {
  if (!value) return null;

  // Already a Date
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  // ISO string or parseable string
  if (typeof value === 'string') {
    // Handle relative dates like "2 days ago", "1 week ago"
    const relative = parseRelativeDate(value);
    if (relative) return relative;

    // Try standard parsing
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // Unix timestamp (seconds or milliseconds)
  if (typeof value === 'number') {
    const ts = value > 1e12 ? value : value * 1000;
    const parsed = new Date(ts);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

/**
 * Parse relative date strings like "2 days ago"
 */
function parseRelativeDate(str: string): Date | null {
  const lower = str.toLowerCase().trim();
  const now = new Date();

  // "X days ago"
  const daysMatch = lower.match(/(\d+)\s*days?\s*ago/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  // "X weeks ago"
  const weeksMatch = lower.match(/(\d+)\s*weeks?\s*ago/);
  if (weeksMatch) {
    const weeks = parseInt(weeksMatch[1], 10);
    return new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
  }

  // "X months ago"
  const monthsMatch = lower.match(/(\d+)\s*months?\s*ago/);
  if (monthsMatch) {
    const months = parseInt(monthsMatch[1], 10);
    const result = new Date(now);
    result.setMonth(result.getMonth() - months);
    return result;
  }

  // "yesterday"
  if (lower === 'yesterday') {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  // "today" or "just now"
  if (lower === 'today' || lower.includes('just now') || lower.includes('hour')) {
    return now;
  }

  return null;
}

// =============================================================================
// SCORING FUNCTIONS
// =============================================================================

/**
 * Extract scrape/crawl timestamp from raw job data
 * This tells us when the job was "seen", not when it was posted
 */
function extractScrapeDate(raw: any): Date | null {
  if (!raw || typeof raw !== 'object') return null;

  const scrapeFields = [
    'scrapedAt',
    'scraped_at',
    'crawledAt',
    'crawled_at',
    'fetchedAt',
    'fetched_at',
    'retrievedAt',
    'timestamp',
    '_ts',
    'createdAt',  // Apify dataset item creation
    'created_at',
  ];

  for (const field of scrapeFields) {
    const value = raw[field];
    if (value) {
      const parsed = parseDate(value);
      if (parsed) return parsed;
    }
  }

  return null;
}

/**
 * Calculate PERSISTENCE score - how long has the need been unfilled?
 * Max 30 points
 *
 * Key insight: Old + still active = PRESSURE (they can't fill the need)
 *
 * Strategy:
 * 1. Gate by liveness: Must have been seen recently (scrape date)
 * 2. If live, score by how long signal has been ACTIVE (posted date)
 * 3. Longer unfilled duration = higher pressure = higher score
 * 4. Very fresh = unknown urgency = moderate score
 *
 * Works for any signal type: job postings, RFPs, partnership searches, etc.
 */
function scorePersistence(signals: SignalItem[]): { score: number; reason: string } {
  if (signals.length === 0) {
    return { score: 0, reason: 'No signals' };
  }

  const now = new Date();
  const LIVENESS_THRESHOLD_DAYS = 14; // Must be seen within 2 weeks to be "live"

  // Collect dates
  const signalsWithDates: { posted: Date | null; scraped: Date | null }[] = [];

  for (const signal of signals) {
    const posted = signal.postedAt
      ? parseDate(signal.postedAt)
      : extractPostedDate(signal.raw);
    const scraped = extractScrapeDate(signal.raw);
    signalsWithDates.push({ posted, scraped });
  }

  // Find most recent scrape date (liveness check)
  const scrapeDates = signalsWithDates
    .map(j => j.scraped)
    .filter((d): d is Date => d !== null);

  const mostRecentScrape = scrapeDates.length > 0
    ? Math.max(...scrapeDates.map(d => d.getTime()))
    : null;

  // LIVENESS GATE: If not seen recently, signal is dead
  if (mostRecentScrape) {
    const daysSinceSeen = (now.getTime() - mostRecentScrape) / (1000 * 60 * 60 * 24);
    if (daysSinceSeen > LIVENESS_THRESHOLD_DAYS) {
      return { score: 0, reason: 'Signal gone cold (not seen recently)' };
    }
  }

  // Find oldest posted date (unfilled duration)
  const postedDates = signalsWithDates
    .map(j => j.posted)
    .filter((d): d is Date => d !== null);

  // BEST CASE: We have posted dates - score by unfilled duration
  if (postedDates.length > 0) {
    const oldestPosting = Math.min(...postedDates.map(d => d.getTime()));
    const daysUnfilled = (now.getTime() - oldestPosting) / (1000 * 60 * 60 * 24);

    let score: number;
    let reason: string;

    // INVERTED: Longer unfilled = more pressure = higher score
    if (daysUnfilled >= 60) {
      score = 30;
      reason = 'High pressure (unfilled 2+ months)';
    } else if (daysUnfilled >= 30) {
      score = 26;
      reason = 'Strong pressure (unfilled 1+ month)';
    } else if (daysUnfilled >= 14) {
      score = 20;
      reason = 'Building pressure (unfilled 2+ weeks)';
    } else if (daysUnfilled >= 7) {
      score = 14;
      reason = 'Active search (1-2 weeks)';
    } else {
      score = 8;
      reason = 'New listing (under a week)';
    }

    return { score, reason };
  }

  // FALLBACK: Only scrape dates - we know it's live but not how long it's been open
  if (scrapeDates.length > 0) {
    // Give moderate score since we confirmed liveness but can't measure persistence
    return { score: 12, reason: 'Active signal (duration unknown)' };
  }

  // NO DATES: Can't determine anything
  return { score: 0, reason: 'No timing data' };
}

/**
 * Calculate density score based on signal volume
 * Max 30 points
 *
 * Works for any signal type: jobs, RFPs, listings, etc.
 */
function scoreDensity(signals: SignalItem[]): { score: number; reason: string } {
  const count = signals.length;

  if (count === 0) {
    return { score: 0, reason: 'No signals detected' };
  }

  // Scoring tiers
  let score: number;
  let reason: string;

  if (count >= 10) {
    score = 30;
    reason = `High density: ${count} signals`;
  } else if (count >= 5) {
    score = 24;
    reason = `Good density: ${count} signals`;
  } else if (count >= 3) {
    score = 18;
    reason = `Moderate density: ${count} signals`;
  } else if (count === 2) {
    score = 12;
    reason = '2 signals detected';
  } else {
    score = 6;
    reason = 'Single signal detected';
  }

  return { score, reason };
}

/**
 * Calculate velocity score based on signal acceleration
 * Max 20 points
 *
 * Works for any signal type: jobs, RFPs, listings, etc.
 */
function scoreVelocity(signals: SignalItem[]): { score: number; reason: string } {
  if (signals.length < 2) {
    return { score: 5, reason: 'Not enough data for velocity' };
  }

  const now = new Date();
  const dates: number[] = [];

  for (const signal of signals) {
    const posted = signal.postedAt
      ? parseDate(signal.postedAt)
      : extractPostedDate(signal.raw);
    if (posted) dates.push(posted.getTime());
  }

  if (dates.length < 2) {
    return { score: 5, reason: 'Velocity unknown (no dates)' };
  }

  // Sort dates oldest to newest
  dates.sort((a, b) => a - b);

  // Calculate recent vs older signals
  const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const recentCount = dates.filter(d => d >= thirtyDaysAgo).length;
  const olderCount = dates.filter(d => d < thirtyDaysAgo).length;

  // Check for acceleration
  let score: number;
  let reason: string;

  if (recentCount >= 3 && recentCount > olderCount) {
    score = 20;
    reason = 'Accelerating activity';
  } else if (recentCount >= 2) {
    score = 14;
    reason = 'Consistent activity';
  } else if (recentCount >= 1) {
    score = 8;
    reason = 'Some recent activity';
  } else {
    score = 3;
    reason = 'Activity slowing';
  }

  return { score, reason };
}

/**
 * Calculate stacking score based on multiple signal types
 * Max 20 points
 *
 * Works for any niche - stacking means multiple indicators of need
 */
function scoreStacking(data: CompanySignalData): { score: number; reason: string } {
  const signalTypes: string[] = [];

  // Primary signals
  if (data.signals.length > 0) {
    signalTypes.push('primary signal');
  }

  // Secondary signals (funding, growth, etc.)
  const secondary = data.secondarySignals;
  if (secondary) {
    if (secondary.hasFunding) {
      if (secondary.fundingRecency !== undefined && secondary.fundingRecency <= 90) {
        signalTypes.push('recent funding');
      } else {
        signalTypes.push('funding');
      }
    }

    if (secondary.hasGrowth || (secondary.headcountGrowth !== undefined && secondary.headcountGrowth > 20)) {
      signalTypes.push('growth');
    }

    if (secondary.hasLayoffs) {
      signalTypes.push('restructuring');
    }

    // Custom signals (acquisition, expansion, new market, etc.)
    if (secondary.customSignals?.length) {
      signalTypes.push(...secondary.customSignals);
    }
  }

  // Score based on signal type count
  let score: number;
  let reason: string;

  if (signalTypes.length >= 3) {
    score = 20;
    reason = `Strong stacking: ${signalTypes.slice(0, 3).join(' + ')}`;
  } else if (signalTypes.length === 2) {
    score = 14;
    reason = `Signal stacking: ${signalTypes.join(' + ')}`;
  } else if (signalTypes.length === 1) {
    score = 6;
    reason = signalTypes[0];
  } else {
    score = 0;
    reason = 'No signals detected';
  }

  return { score, reason };
}

// =============================================================================
// MAIN SCORER
// =============================================================================

/**
 * Calculate overall signal quality score for a company/entity
 *
 * Works for any demand/supply matching niche
 */
export function scoreSignalQuality(data: CompanySignalData): SignalQualityScore {
  const persistence = scorePersistence(data.signals);
  const density = scoreDensity(data.signals);
  const velocity = scoreVelocity(data.signals);
  const stacking = scoreStacking(data);

  const total = persistence.score + density.score + velocity.score + stacking.score;

  // Determine tier
  let tier: 'A' | 'B' | 'C';
  if (total >= 70) {
    tier = 'A';
  } else if (total >= 45) {
    tier = 'B';
  } else {
    tier = 'C';
  }

  // Collect non-trivial reasons
  const reasons: string[] = [];
  if (persistence.score > 0) reasons.push(persistence.reason);
  if (density.score > 0) reasons.push(density.reason);
  if (velocity.score >= 10) reasons.push(velocity.reason);
  if (stacking.score >= 10) reasons.push(stacking.reason);

  return {
    total,
    tier,
    breakdown: {
      persistence: persistence.score,
      density: density.score,
      velocity: velocity.score,
      stacking: stacking.score,
    },
    reasons,
  };
}

/**
 * Batch score multiple companies and sort by quality
 */
export function rankBySignalQuality<T extends { domain: string }>(
  companies: T[],
  getSignalData: (company: T) => CompanySignalData
): (T & { qualityScore: SignalQualityScore })[] {
  return companies
    .map(company => ({
      ...company,
      qualityScore: scoreSignalQuality(getSignalData(company)),
    }))
    .sort((a, b) => b.qualityScore.total - a.qualityScore.total);
}

/**
 * Quick tier assignment without full breakdown
 */
export function getQuickTier(jobCount: number, hasFunding: boolean = false): 'A' | 'B' | 'C' {
  const densityBoost = jobCount >= 5 ? 2 : jobCount >= 3 ? 1 : 0;
  const fundingBoost = hasFunding ? 1 : 0;
  const totalBoost = densityBoost + fundingBoost;

  if (totalBoost >= 2) return 'A';
  if (totalBoost >= 1) return 'B';
  return 'C';
}
