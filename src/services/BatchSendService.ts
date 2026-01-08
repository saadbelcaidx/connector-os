/**
 * BatchSendService.ts
 *
 * BATCH SEND MODE v0 (Rate-Limit Safe, 200–300 Scale)
 *
 * Executes batch sends with:
 * - Single queue executor (no concurrency)
 * - Throttled sends (1 per 150-200ms)
 * - Rate-limit error handling (pause 5-10s, resume)
 * - Rotation-aware demand/supply selection
 *
 * Instantly API limits:
 * - Max 100 requests / 10 seconds
 * - Max 600 requests / minute
 *
 * Safe throughput: ~6-7 sends/second = 360-420/minute (well under limit)
 */

import { sendToInstantly, DualSendParams } from './InstantlyService';

// ============================================================================
// TYPES
// ============================================================================

export interface BatchSendItem {
  id: string;
  type: 'DEMAND' | 'SUPPLY';
  params: DualSendParams;
  demandDomain: string;
  supplyDomain?: string;
}

export interface BatchProgress {
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  currentItem?: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'cancelled';
  pauseReason?: string;
}

export interface BatchResult {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  durationMs: number;
  errors: Array<{ domain: string; error: string }>;
}

export type BatchProgressCallback = (progress: BatchProgress) => void;

// ============================================================================
// CONSTANTS
// ============================================================================

const THROTTLE_MS = 125; // 8 sends/second, 20% margin under Instantly's 10/s limit
const RATE_LIMIT_PAUSE_MS = 7000; // 7 second pause on rate limit
const MAX_CONSECUTIVE_ERRORS = 5; // Stop if 5 errors in a row
const PARALLEL_BATCH_SIZE = 8; // Send 8 in parallel (Instantly allows 10/s, we use ~1.3/s)

// ============================================================================
// BATCH QUEUE EXECUTOR
// ============================================================================

export class BatchSendExecutor {
  private queue: BatchSendItem[] = [];
  private enqueuedEmails: Set<string> = new Set(); // Deduplication by email
  private isRunning = false;
  private isCancelled = false;
  private progress: BatchProgress = {
    total: 0,
    completed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    status: 'idle'
  };
  private onProgress?: BatchProgressCallback;
  private instantlyApiKey: string;
  private consecutiveErrors = 0;
  private errors: Array<{ domain: string; error: string }> = [];
  private startTime = 0;

  constructor(instantlyApiKey: string, onProgress?: BatchProgressCallback) {
    this.instantlyApiKey = instantlyApiKey;
    this.onProgress = onProgress;
  }

  /**
   * Add items to the queue with deduplication by email
   */
  enqueue(items: BatchSendItem[]): void {
    let added = 0;
    let skipped = 0;

    for (const item of items) {
      const email = item.params.email?.toLowerCase();
      if (!email) {
        console.warn('[BatchSend] Skipping item with no email:', item.demandDomain);
        skipped++;
        this.progress.skipped++; // Track in progress too
        continue;
      }

      // Deduplicate by email
      if (this.enqueuedEmails.has(email)) {
        console.log('[BatchSend] Skipping duplicate email:', email);
        skipped++;
        this.progress.skipped++;
        continue;
      }

      this.enqueuedEmails.add(email);
      this.queue.push(item);
      added++;
    }

    this.progress.total = this.queue.length;
    console.log(`[BatchSend] Enqueued ${added} items (${skipped} duplicates skipped)`);
    this.notifyProgress();
  }

  /**
   * Start executing the queue (PARALLEL batches of 8)
   */
  async start(): Promise<BatchResult> {
    if (this.isRunning) {
      throw new Error('Batch already running');
    }

    this.isRunning = true;
    this.isCancelled = false;
    this.progress.status = 'running';
    this.startTime = Date.now();
    this.notifyProgress();

    console.log(`[BatchSend] Starting batch of ${this.queue.length} sends (${PARALLEL_BATCH_SIZE} parallel)`);

    while (this.queue.length > 0 && !this.isCancelled) {
      // Take up to PARALLEL_BATCH_SIZE items
      const batch = this.queue.splice(0, PARALLEL_BATCH_SIZE);
      this.progress.currentItem = `${batch.length} sends in parallel`;
      this.notifyProgress();

      console.log(`[BatchSend] Processing ${batch.length} sends in parallel...`);

      // Send all in parallel
      const results = await Promise.all(
        batch.map(async (item) => {
          try {
            const result = await this.sendItem(item);
            return { item, result, error: null };
          } catch (error) {
            return { item, result: null, error };
          }
        })
      );

      // Process results
      let batchRateLimited = false;
      const retryItems: BatchSendItem[] = [];

      for (const { item, result, error } of results) {
        if (error) {
          console.error('[BatchSend] Send error:', error);
          this.progress.failed++;
          this.consecutiveErrors++;
          this.errors.push({
            domain: item.demandDomain,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        } else if (result?.success) {
          this.progress.succeeded++;
          this.consecutiveErrors = 0;
        } else if (result?.rateLimited) {
          batchRateLimited = true;
          retryItems.push(item);
        } else {
          this.progress.failed++;
          this.consecutiveErrors++;
          this.errors.push({ domain: item.demandDomain, error: result?.error || 'Unknown error' });
        }

        this.progress.completed++;
      }

      this.notifyProgress();

      // Handle rate limiting
      if (batchRateLimited && retryItems.length > 0) {
        console.log(`[BatchSend] Rate limited, pausing ${RATE_LIMIT_PAUSE_MS}ms before retry...`);
        this.progress.status = 'paused';
        this.progress.pauseReason = 'Rate limit reached, resuming shortly...';
        this.notifyProgress();

        await this.sleep(RATE_LIMIT_PAUSE_MS);

        // Re-queue rate-limited items
        this.queue.unshift(...retryItems);
        this.progress.completed -= retryItems.length; // Don't count as completed
        this.progress.status = 'running';
        this.progress.pauseReason = undefined;
        this.notifyProgress();
      }

      // Stop if too many consecutive errors
      if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error('[BatchSend] Too many consecutive errors, stopping batch');
        break;
      }

      // Small delay between parallel batches
      if (this.queue.length > 0 && !this.isCancelled) {
        await this.sleep(THROTTLE_MS);
      }
    }

    this.isRunning = false;
    this.progress.status = this.isCancelled ? 'cancelled' : 'completed';
    this.progress.currentItem = undefined;
    this.notifyProgress();

    const durationMs = Date.now() - this.startTime;
    console.log(`[BatchSend] Completed: ${this.progress.succeeded} succeeded, ${this.progress.failed} failed in ${Math.round(durationMs / 1000)}s`);

    return {
      total: this.progress.total,
      succeeded: this.progress.succeeded,
      failed: this.progress.failed,
      skipped: this.progress.skipped,
      durationMs,
      errors: this.errors
    };
  }

  /**
   * Cancel the batch
   */
  cancel(): void {
    this.isCancelled = true;
    console.log('[BatchSend] Batch cancelled');
  }

  /**
   * Get current progress
   */
  getProgress(): BatchProgress {
    return { ...this.progress };
  }

  /**
   * Send a single item
   */
  private async sendItem(item: BatchSendItem): Promise<{ success: boolean; rateLimited?: boolean; error?: string }> {
    try {
      const result = await sendToInstantly(this.instantlyApiKey, item.params);

      if (!result.success) {
        // Check for rate limit error
        const errorStr = String(result.error || '').toLowerCase();
        if (errorStr.includes('rate') || errorStr.includes('limit') || errorStr.includes('429') || errorStr.includes('too many')) {
          return { success: false, rateLimited: true, error: result.error };
        }
        return { success: false, error: result.error };
      }

      return { success: true };
    } catch (error) {
      const errorStr = String(error).toLowerCase();
      if (errorStr.includes('rate') || errorStr.includes('limit') || errorStr.includes('429')) {
        return { success: false, rateLimited: true, error: String(error) };
      }
      return { success: false, error: String(error) };
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Notify progress callback
   */
  private notifyProgress(): void {
    if (this.onProgress) {
      this.onProgress({ ...this.progress });
    }
  }
}

// ============================================================================
// BATCH BUILDER HELPERS
// ============================================================================

export interface BatchBuildContext {
  instantlyApiKey: string;
  campaignDemand?: string;
  campaignSupply?: string;
}

/**
 * Create a batch send item for demand
 */
export function createDemandBatchItem(
  demandDomain: string,
  email: string,
  firstName: string,
  lastName: string,
  companyName: string,
  introText: string,
  campaignId: string,
  metadata?: Record<string, unknown>
): BatchSendItem {
  return {
    id: `demand-${demandDomain}-${Date.now()}`,
    type: 'DEMAND',
    demandDomain,
    params: {
      campaignId,
      email,
      first_name: firstName,
      last_name: lastName,
      company_name: companyName,
      website: demandDomain,
      type: 'DEMAND',
      signal_metadata: metadata,
      intro_text: introText
    }
  };
}

/**
 * Create a batch send item for supply
 */
export function createSupplyBatchItem(
  demandDomain: string,
  supplyDomain: string,
  email: string,
  firstName: string,
  lastName: string,
  companyName: string,
  introText: string,
  campaignId: string,
  metadata?: Record<string, unknown>
): BatchSendItem {
  return {
    id: `supply-${supplyDomain}-${Date.now()}`,
    type: 'SUPPLY',
    demandDomain,
    supplyDomain,
    params: {
      campaignId,
      email,
      first_name: firstName,
      last_name: lastName,
      company_name: companyName,
      website: supplyDomain,
      type: 'SUPPLY',
      signal_metadata: metadata,
      intro_text: introText
    }
  };
}

// ============================================================================
// SUPPLY AGGREGATION HELPERS
// ============================================================================

export interface SupplyMatchGroup {
  email: string;
  firstName: string;
  lastName: string;
  companyName: string;
  supplyDomain: string;
  specialty?: string;
  matches: Array<{
    demandDomain: string;
    demandCompanyName: string;
    signal: string;
  }>;
}

/**
 * Group supply batch items by email for aggregated intros.
 *
 * When the same supply contact matches multiple demand companies,
 * we send ONE email showing deal flow instead of multiple emails.
 *
 * Input: [
 *   { email: 'recruiter@x.com', demandDomain: 'companyA.com', ... },
 *   { email: 'recruiter@x.com', demandDomain: 'companyB.com', ... },
 *   { email: 'other@y.com', demandDomain: 'companyC.com', ... },
 * ]
 *
 * Output: [
 *   { email: 'recruiter@x.com', matches: [companyA, companyB] },  // 2 matches = aggregated
 *   { email: 'other@y.com', matches: [companyC] },                // 1 match = single
 * ]
 */
export function groupSupplyByEmail(
  items: BatchSendItem[],
  getSignal?: (demandDomain: string) => string,
  getCompanyName?: (demandDomain: string) => string
): SupplyMatchGroup[] {
  const groups = new Map<string, SupplyMatchGroup>();

  for (const item of items) {
    if (item.type !== 'SUPPLY') continue;

    const email = item.params.email?.toLowerCase();
    if (!email) continue;

    const existing = groups.get(email);
    const demandDomain = item.demandDomain;
    const demandCompanyName = getCompanyName?.(demandDomain) || demandDomain;
    const signal = getSignal?.(demandDomain) || 'active opportunity';

    if (existing) {
      // Add to existing group
      existing.matches.push({
        demandDomain,
        demandCompanyName,
        signal,
      });
    } else {
      // Create new group
      groups.set(email, {
        email,
        firstName: item.params.first_name || '',
        lastName: item.params.last_name || '',
        companyName: item.params.company_name || '',
        supplyDomain: item.supplyDomain || '',
        matches: [{
          demandDomain,
          demandCompanyName,
          signal,
        }],
      });
    }
  }

  return Array.from(groups.values());
}

/**
 * Determine the common category across multiple demand matches.
 * Used for aggregated intro generation.
 */
export function detectCommonCategory(signals: string[]): string {
  const categories: Record<string, number> = {};

  for (const signal of signals) {
    const lower = signal.toLowerCase();

    if (lower.includes('engineer') || lower.includes('developer') || lower.includes('tech')) {
      categories['engineering'] = (categories['engineering'] || 0) + 1;
    } else if (lower.includes('sales') || lower.includes('account executive') || lower.includes('sdr')) {
      categories['sales'] = (categories['sales'] || 0) + 1;
    } else if (lower.includes('marketing') || lower.includes('growth')) {
      categories['marketing'] = (categories['marketing'] || 0) + 1;
    } else if (lower.includes('product') || lower.includes('pm')) {
      categories['product'] = (categories['product'] || 0) + 1;
    } else if (lower.includes('design') || lower.includes('ux')) {
      categories['design'] = (categories['design'] || 0) + 1;
    } else if (lower.includes('ops') || lower.includes('operations')) {
      categories['operations'] = (categories['operations'] || 0) + 1;
    } else if (lower.includes('finance') || lower.includes('accounting')) {
      categories['finance'] = (categories['finance'] || 0) + 1;
    } else if (lower.includes('hr') || lower.includes('people') || lower.includes('recruiting')) {
      categories['talent'] = (categories['talent'] || 0) + 1;
    }
  }

  // Return the most common category, or generic fallback
  const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || 'your space';
}

/**
 * Check if a supply group should use aggregated intro (3+ matches)
 */
export function shouldUseAggregatedIntro(group: SupplyMatchGroup): boolean {
  return group.matches.length >= 3;
}

// ============================================================================
// RATE LIMIT CALCULATOR
// ============================================================================

/**
 * Calculate estimated time for batch
 */
export function estimateBatchDuration(sendCount: number): { seconds: number; formatted: string } {
  const seconds = Math.ceil((sendCount * THROTTLE_MS) / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  const formatted = minutes > 0
    ? `~${minutes}m ${remainingSeconds}s`
    : `~${seconds}s`;

  return { seconds, formatted };
}

/**
 * Check if batch size is safe for rate limits
 */
export function isBatchSizeSafe(sendCount: number): { safe: boolean; warning?: string } {
  // With 125ms throttle, we do 8 sends/second
  // Instantly allows 10/second, 20% safety margin

  if (sendCount > 500) {
    return {
      safe: false,
      warning: 'Batch size exceeds recommended maximum (500). Consider splitting into smaller batches.'
    };
  }

  if (sendCount > 300) {
    return {
      safe: true,
      warning: 'Large batch. Estimated time: ' + estimateBatchDuration(sendCount).formatted
    };
  }

  return { safe: true };
}
