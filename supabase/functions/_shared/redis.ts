/**
 * Upstash Redis REST client — zero dependencies
 *
 * Uses plain fetch against Upstash REST API.
 * No third-party modules — compatible with Supabase Edge Functions.
 *
 * Secrets: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 */

const REDIS_URL = Deno.env.get("UPSTASH_REDIS_REST_URL") || "";
const REDIS_TOKEN = Deno.env.get("UPSTASH_REDIS_REST_TOKEN") || "";

async function redisCommand<T = unknown>(...args: (string | number)[]): Promise<T | null> {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const res = await fetch(`${REDIS_URL}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.result ?? null;
  } catch {
    return null;
  }
}

export const redis = {
  async get<T = unknown>(key: string): Promise<T | null> {
    const raw = await redisCommand<string>("GET", key);
    if (raw === null || raw === undefined) return null;
    try {
      return JSON.parse(raw as string) as T;
    } catch {
      return raw as unknown as T;
    }
  },

  async set(key: string, value: unknown, opts?: { ex?: number }): Promise<void> {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    if (opts?.ex) {
      await redisCommand("SET", key, serialized, "EX", opts.ex);
    } else {
      await redisCommand("SET", key, serialized);
    }
  },

  async mget<T = unknown>(...keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];
    const raw = await redisCommand<(string | null)[]>("MGET", ...keys);
    if (!raw || !Array.isArray(raw)) return keys.map(() => null);
    return raw.map((v) => {
      if (v === null || v === undefined) return null;
      try {
        return JSON.parse(v as string) as T;
      } catch {
        return v as unknown as T;
      }
    });
  },
};
