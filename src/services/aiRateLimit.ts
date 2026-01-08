/**
 * AI RATE LIMIT — Per-user soft limit, in-memory
 *
 * No persistence. No retries. Silent fallback.
 */

const userAICalls = new Map<string, { count: number; resetAt: number }>();

const TTL_MS = 60000; // 60 second window

export function allowAICall(userId: string, limit: number): boolean {
  const now = Date.now();
  const entry = userAICalls.get(userId);

  // Reset if TTL expired
  if (!entry || now > entry.resetAt) {
    userAICalls.set(userId, { count: 1, resetAt: now + TTL_MS });
    return true;
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count++;
  return true;
}

// Tier limits
export const AI_LIMITS = {
  guest: 5,
  paid: 50,
  internal: Infinity,
} as const;
