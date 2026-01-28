/**
 * INSTANTLY RATE LIMITER — Token Bucket + Queued Sender
 *
 * CONTRACT (user.txt):
 * - 80 requests / 10 seconds (hard cap)
 * - 480 requests / minute (hard cap)
 * - Max concurrency: 4
 * - Shared across all sends (demand + supply)
 * - 429 → pause + retry with exponential backoff (2s start, 30s max)
 *
 * TARGET THROUGHPUT:
 * - 1,000 leads ≤ 15 minutes
 * - System must never hard-block the Instantly workspace
 *
 * MATH PROOF:
 * - 480 req/min = 8 req/sec sustained
 * - 1000 leads / 8 req/sec = 125 seconds = ~2.1 minutes (theoretical min)
 * - With network latency (~200ms avg) and concurrency=4: ~4-5 minutes realistic
 * - 15 minute target: 3x safety margin ✓
 */

import { SenderConfig, SendLeadParams, SendResult } from './senders/SenderAdapter';
import { InstantlySender } from './senders/InstantlySender';

// =============================================================================
// TOKEN BUCKET IMPLEMENTATION
// =============================================================================

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRate: number; // tokens per second
}

/**
 * Dual token bucket for Instantly rate limits:
 * - Bucket A: 80 tokens / 10 seconds (burst protection)
 * - Bucket B: 480 tokens / 60 seconds (sustained rate)
 *
 * Request only proceeds if BOTH buckets have tokens.
 */
class DualTokenBucket {
  private burstBucket: TokenBucket;   // 80 / 10s
  private sustainedBucket: TokenBucket; // 480 / 60s

  constructor() {
    const now = Date.now();

    // Burst bucket: 80 tokens, refills at 8/sec
    this.burstBucket = {
      tokens: 80,
      lastRefill: now,
      maxTokens: 80,
      refillRate: 8, // 80 tokens / 10 seconds
    };

    // Sustained bucket: 480 tokens, refills at 8/sec
    this.sustainedBucket = {
      tokens: 480,
      lastRefill: now,
      maxTokens: 480,
      refillRate: 8, // 480 tokens / 60 seconds
    };
  }

  private refillBucket(bucket: TokenBucket): void {
    const now = Date.now();
    const elapsed = (now - bucket.lastRefill) / 1000; // seconds
    const newTokens = elapsed * bucket.refillRate;
    bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + newTokens);
    bucket.lastRefill = now;
  }

  /**
   * Try to consume a token from both buckets.
   * Returns true if token consumed, false if rate limited.
   */
  tryConsume(): boolean {
    this.refillBucket(this.burstBucket);
    this.refillBucket(this.sustainedBucket);

    if (this.burstBucket.tokens >= 1 && this.sustainedBucket.tokens >= 1) {
      this.burstBucket.tokens -= 1;
      this.sustainedBucket.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Time in ms until a token will be available.
   */
  timeUntilToken(): number {
    this.refillBucket(this.burstBucket);
    this.refillBucket(this.sustainedBucket);

    const burstWait = this.burstBucket.tokens < 1
      ? ((1 - this.burstBucket.tokens) / this.burstBucket.refillRate) * 1000
      : 0;

    const sustainedWait = this.sustainedBucket.tokens < 1
      ? ((1 - this.sustainedBucket.tokens) / this.sustainedBucket.refillRate) * 1000
      : 0;

    return Math.max(burstWait, sustainedWait);
  }

  /**
   * Pause the bucket (on 429) - drain tokens to force wait.
   */
  pause(): void {
    this.burstBucket.tokens = 0;
    this.sustainedBucket.tokens = 0;
  }

  /**
   * Get current token counts for debugging.
   */
  getStatus(): { burst: number; sustained: number } {
    this.refillBucket(this.burstBucket);
    this.refillBucket(this.sustainedBucket);
    return {
      burst: Math.floor(this.burstBucket.tokens),
      sustained: Math.floor(this.sustainedBucket.tokens),
    };
  }
}

// =============================================================================
// QUEUED SENDER
// =============================================================================

export interface QueuedSendItem {
  id: string;
  params: SendLeadParams;
  config: SenderConfig;
  resolve: (result: SendResult) => void;
  reject: (error: Error) => void;
  retryCount: number;
}

export interface QueueProgress {
  queued: number;
  inFlight: number;
  completed: number;
  total: number;
}

export type ProgressCallback = (progress: QueueProgress) => void;

/**
 * Global Instantly rate limiter instance.
 * Singleton - shared across all sends in the Flow.
 */
class InstantlyQueuedSender {
  private bucket: DualTokenBucket;
  private queue: QueuedSendItem[] = [];
  private inFlight: number = 0;
  private completed: number = 0;
  private total: number = 0;
  private isProcessing: boolean = false;
  private aborted: boolean = false;
  private progressCallback: ProgressCallback | null = null;

  // Config
  private readonly MAX_CONCURRENCY = 4;
  private readonly INITIAL_BACKOFF_MS = 2000;
  private readonly MAX_BACKOFF_MS = 30000;
  private readonly MAX_RETRIES = 5;

  constructor() {
    this.bucket = new DualTokenBucket();
  }

  /**
   * Reset the queue for a new batch run.
   */
  reset(): void {
    this.queue = [];
    this.inFlight = 0;
    this.completed = 0;
    this.total = 0;
    this.isProcessing = false;
    this.aborted = false;
    this.progressCallback = null;
    // Don't reset bucket - tokens persist across runs
  }

  /**
   * Abort all pending sends.
   */
  abort(): void {
    this.aborted = true;
    // Reject all queued items
    for (const item of this.queue) {
      item.reject(new Error('Aborted'));
    }
    this.queue = [];
  }

  /**
   * Set progress callback for UI updates.
   */
  setProgressCallback(callback: ProgressCallback | null): void {
    this.progressCallback = callback;
  }

  /**
   * Enqueue a send request. Returns a promise that resolves when sent.
   * ALL Instantly calls MUST go through this method.
   */
  enqueue(config: SenderConfig, params: SendLeadParams): Promise<SendResult> {
    return new Promise((resolve, reject) => {
      const item: QueuedSendItem = {
        id: `${params.type}:${params.email}:${Date.now()}`,
        params,
        config,
        resolve,
        reject,
        retryCount: 0,
      };

      this.queue.push(item);
      this.total++;
      this.emitProgress();

      // Start processing if not already running
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process the queue with rate limiting and concurrency control.
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0 && !this.aborted) {
      // Wait for concurrency slot
      if (this.inFlight >= this.MAX_CONCURRENCY) {
        await this.sleep(50);
        continue;
      }

      // Wait for rate limit token
      if (!this.bucket.tryConsume()) {
        const waitTime = this.bucket.timeUntilToken();
        console.log(`[InstantlyLimiter] Rate limited, waiting ${Math.ceil(waitTime)}ms`);
        await this.sleep(Math.max(waitTime, 100));
        continue;
      }

      // Dequeue and process
      const item = this.queue.shift();
      if (!item) continue;

      this.inFlight++;
      this.emitProgress();

      // Fire request (don't await - process concurrently)
      this.executeRequest(item);
    }

    this.isProcessing = false;
  }

  /**
   * Execute a single request with retry logic.
   */
  private async executeRequest(item: QueuedSendItem): Promise<void> {
    try {
      const result = await InstantlySender.sendLead(item.config, item.params);

      // Check for 429 in the result
      if (result.status === 'needs_attention' && result.detail?.includes('Rate limited')) {
        await this.handle429(item);
        return;
      }

      // Success or non-retryable error
      this.inFlight--;
      this.completed++;
      this.emitProgress();
      item.resolve(result);

    } catch (error) {
      // Network error - retry with backoff
      if (item.retryCount < this.MAX_RETRIES) {
        await this.retryWithBackoff(item);
      } else {
        this.inFlight--;
        this.completed++;
        this.emitProgress();
        item.resolve({
          success: false,
          status: 'needs_attention',
          detail: `Failed after ${this.MAX_RETRIES} retries`,
        });
      }
    }
  }

  /**
   * Handle 429 rate limit response.
   * Pause bucket and retry with exponential backoff.
   */
  private async handle429(item: QueuedSendItem): Promise<void> {
    console.log(`[InstantlyLimiter] 429 received, pausing bucket and retrying`);

    // Pause bucket to drain tokens
    this.bucket.pause();
    this.inFlight--;
    this.emitProgress();

    // Retry with backoff
    await this.retryWithBackoff(item);
  }

  /**
   * Retry a request with exponential backoff.
   */
  private async retryWithBackoff(item: QueuedSendItem): Promise<void> {
    if (this.aborted) {
      item.reject(new Error('Aborted'));
      return;
    }

    item.retryCount++;
    const backoff = Math.min(
      this.INITIAL_BACKOFF_MS * Math.pow(2, item.retryCount - 1),
      this.MAX_BACKOFF_MS
    );

    console.log(`[InstantlyLimiter] Retry ${item.retryCount}/${this.MAX_RETRIES} for ${item.params.email} in ${backoff}ms`);

    await this.sleep(backoff);

    // Re-queue at front for priority
    this.queue.unshift(item);

    // Restart processing if needed
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  private emitProgress(): void {
    if (this.progressCallback) {
      this.progressCallback({
        queued: this.queue.length,
        inFlight: this.inFlight,
        completed: this.completed,
        total: this.total,
      });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current limiter status for debugging.
   */
  getStatus(): { bucket: { burst: number; sustained: number }; queue: number; inFlight: number } {
    return {
      bucket: this.bucket.getStatus(),
      queue: this.queue.length,
      inFlight: this.inFlight,
    };
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

/**
 * Global rate limiter instance.
 * Use this for ALL Instantly sends - never call InstantlySender directly.
 */
export const instantlyLimiter = new InstantlyQueuedSender();

// =============================================================================
// TODO: BATCH ENDPOINT
// =============================================================================
// When Instantly supports batch lead creation, plug in here:
//
// async enqueueBatch(config: SenderConfig, leads: SendLeadParams[]): Promise<SendResult[]> {
//   // 1. Check if batch endpoint available
//   // 2. Group leads into batches of N
//   // 3. Each batch consumes 1 token (or N tokens based on API design)
//   // 4. Fire batch request
//   // 5. Map results back to individual leads
// }
//
// This would reduce API calls from N to N/batchSize.
// =============================================================================
