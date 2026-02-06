/**
 * RATE LIMITED SENDER — Generic Provider-Agnostic Rate Limiter
 *
 * Wraps any SenderAdapter with token bucket rate limiting.
 * Configured per-provider with different rate limit profiles.
 *
 * STRIPE DOCTRINE:
 * - One class, multiple instances
 * - Provider logic lives in SenderAdapter, not here
 * - This class only knows about tokens and queues
 */

import type { SenderAdapter, SenderConfig, SendLeadParams, SendResult } from './SenderAdapter';

// =============================================================================
// RATE LIMIT PROFILES
// =============================================================================

export interface RateLimitProfile {
  /** Max tokens in bucket */
  maxTokens: number;
  /** Tokens added per second */
  refillRate: number;
  /** Max concurrent in-flight requests */
  maxConcurrency: number;
  /** Initial backoff on 429 (ms) */
  initialBackoffMs: number;
  /** Max backoff on 429 (ms) */
  maxBackoffMs: number;
  /** Max retries before giving up */
  maxRetries: number;
}

/** Instantly: 80/10s burst, 480/60s sustained → use conservative 8/sec */
export const INSTANTLY_PROFILE: RateLimitProfile = {
  maxTokens: 80,
  refillRate: 8,
  maxConcurrency: 4,
  initialBackoffMs: 2000,
  maxBackoffMs: 30000,
  maxRetries: 5,
};

/** Plusvibe: 5/sec strict */
export const PLUSVIBE_PROFILE: RateLimitProfile = {
  maxTokens: 5,
  refillRate: 5,
  maxConcurrency: 2,
  initialBackoffMs: 1000,
  maxBackoffMs: 10000,
  maxRetries: 5,
};

// =============================================================================
// TOKEN BUCKET
// =============================================================================

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;

  constructor(maxTokens: number, refillRate: number) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
    this.maxTokens = maxTokens;
    this.refillRate = refillRate;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const newTokens = elapsed * this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }

  tryConsume(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  timeUntilToken(): number {
    this.refill();
    if (this.tokens >= 1) return 0;
    return ((1 - this.tokens) / this.refillRate) * 1000;
  }

  pause(): void {
    this.tokens = 0;
  }

  getStatus(): { tokens: number; max: number } {
    this.refill();
    return { tokens: Math.floor(this.tokens), max: this.maxTokens };
  }
}

// =============================================================================
// QUEUE TYPES
// =============================================================================

interface QueuedItem {
  id: string;
  config: SenderConfig;
  params: SendLeadParams;
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

// =============================================================================
// RATE LIMITED SENDER
// =============================================================================

export class RateLimitedSender {
  private readonly sender: SenderAdapter;
  private readonly profile: RateLimitProfile;
  private readonly bucket: TokenBucket;

  private queue: QueuedItem[] = [];
  private inFlight = 0;
  private completed = 0;
  private total = 0;
  private isProcessing = false;
  private aborted = false;
  private progressCallback: ProgressCallback | null = null;

  constructor(sender: SenderAdapter, profile: RateLimitProfile) {
    this.sender = sender;
    this.profile = profile;
    this.bucket = new TokenBucket(profile.maxTokens, profile.refillRate);
  }

  /** Reset queue state for new batch run. Tokens persist. */
  reset(): void {
    this.queue = [];
    this.inFlight = 0;
    this.completed = 0;
    this.total = 0;
    this.isProcessing = false;
    this.aborted = false;
    this.progressCallback = null;
  }

  /** Abort all pending sends. */
  abort(): void {
    this.aborted = true;
    for (const item of this.queue) {
      item.reject(new Error('Aborted'));
    }
    this.queue = [];
  }

  /** Set progress callback for UI updates. */
  setProgressCallback(callback: ProgressCallback | null): void {
    this.progressCallback = callback;
  }

  /** Enqueue a send request. Returns promise that resolves when sent. */
  enqueue(config: SenderConfig, params: SendLeadParams): Promise<SendResult> {
    return new Promise((resolve, reject) => {
      const item: QueuedItem = {
        id: `${params.type}:${params.email}:${Date.now()}`,
        config,
        params,
        resolve,
        reject,
        retryCount: 0,
      };

      this.queue.push(item);
      this.total++;
      this.emitProgress();

      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0 && !this.aborted) {
      // Wait for concurrency slot
      if (this.inFlight >= this.profile.maxConcurrency) {
        await this.sleep(50);
        continue;
      }

      // Wait for rate limit token
      if (!this.bucket.tryConsume()) {
        const waitTime = this.bucket.timeUntilToken();
        console.log(`[RateLimitedSender:${this.sender.id}] Rate limited, waiting ${Math.ceil(waitTime)}ms`);
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

  private async executeRequest(item: QueuedItem): Promise<void> {
    try {
      const result = await this.sender.sendLead(item.config, item.params);

      // Check for rate limit in result
      if (result.status === 'needs_attention' && result.detail?.toLowerCase().includes('rate limit')) {
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
      if (item.retryCount < this.profile.maxRetries) {
        await this.retryWithBackoff(item);
      } else {
        this.inFlight--;
        this.completed++;
        this.emitProgress();
        item.resolve({
          success: false,
          status: 'needs_attention',
          detail: `Failed after ${this.profile.maxRetries} retries`,
        });
      }
    }
  }

  private async handle429(item: QueuedItem): Promise<void> {
    console.log(`[RateLimitedSender:${this.sender.id}] 429 received, pausing bucket`);
    this.bucket.pause();
    this.inFlight--;
    this.emitProgress();
    await this.retryWithBackoff(item);
  }

  private async retryWithBackoff(item: QueuedItem): Promise<void> {
    if (this.aborted) {
      item.reject(new Error('Aborted'));
      return;
    }

    item.retryCount++;
    const backoff = Math.min(
      this.profile.initialBackoffMs * Math.pow(2, item.retryCount - 1),
      this.profile.maxBackoffMs
    );

    console.log(`[RateLimitedSender:${this.sender.id}] Retry ${item.retryCount}/${this.profile.maxRetries} in ${backoff}ms`);

    await this.sleep(backoff);

    // Re-queue at front for priority
    this.queue.unshift(item);

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

  /** Get limiter status for debugging. */
  getStatus(): { bucket: { tokens: number; max: number }; queue: number; inFlight: number } {
    return {
      bucket: this.bucket.getStatus(),
      queue: this.queue.length,
      inFlight: this.inFlight,
    };
  }
}
