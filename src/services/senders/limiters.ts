/**
 * PROVIDER LIMITERS — Singleton instances per provider
 *
 * STRIPE DOCTRINE:
 * - One limiter per provider
 * - Configured at module load
 * - getLimiter() returns the right one based on senderId
 */

import type { SenderId } from './SenderAdapter';
import { InstantlySender } from './InstantlySender';
import { PlusvibeSender } from './PlusvibeSender';
import {
  RateLimitedSender,
  INSTANTLY_PROFILE,
  PLUSVIBE_PROFILE,
} from './RateLimitedSender';

// =============================================================================
// SINGLETON INSTANCES
// =============================================================================

const instantlyLimiter = new RateLimitedSender(InstantlySender, INSTANTLY_PROFILE);
const plusvibeLimiter = new RateLimitedSender(PlusvibeSender, PLUSVIBE_PROFILE);

// =============================================================================
// EXPORTS
// =============================================================================

export type { QueueProgress, ProgressCallback } from './RateLimitedSender';

/**
 * Get the rate limiter for a provider.
 * Returns Instantly limiter as default.
 */
export function getLimiter(senderId: SenderId | undefined): RateLimitedSender {
  switch (senderId) {
    case 'plusvibe':
      return plusvibeLimiter;
    case 'instantly':
    default:
      return instantlyLimiter;
  }
}

/**
 * Legacy export for backwards compatibility.
 * @deprecated Use getLimiter('instantly') instead.
 */
export { instantlyLimiter };
