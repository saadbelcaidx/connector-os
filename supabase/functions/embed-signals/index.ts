import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * EMBED-SIGNALS — Platform Embedding Infrastructure
 *
 * Embeds canonical signal intent text using text-embedding-3-small.
 * This is PLATFORM infrastructure — uses OUR API key, not the user's BYOK key.
 *
 * Rules:
 *   - Demand: embed(wants + " " + why_now)
 *   - Supply: embed(offers)
 *   - NEVER embed context fields
 *   - NEVER use user's BYOK key for embeddings
 *
 * Cost: ~$0.001 per 600 records. Under $0.10/month at scale.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { redis } from "../_shared/redis.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// =============================================================================
// TYPES
// =============================================================================

interface SignalInput {
  record_key: string;
  text: string;
}

interface RequestBody {
  signals: SignalInput[];
  jobId: string;
  side: "demand" | "supply";
}

interface EmbeddingResult {
  record_key: string;
  embedding: number[];
}

// =============================================================================
// CONTENT HASH (for Redis cache key)
// =============================================================================

async function hashText(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// =============================================================================
// AZURE OPENAI EMBEDDINGS API (platform key)
// Uses text-embedding-3-small-2 deployment on Azure
// =============================================================================

async function callAzureEmbeddings(
  endpoint: string,
  apiKey: string,
  deployment: string,
  texts: string[],
): Promise<number[][]> {
  const url = `${endpoint}/openai/deployments/${deployment}/embeddings?api-version=2024-02-01`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: texts,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Azure embeddings API returned ${response.status}: ${errorText.slice(0, 200)}`,
    );
  }

  const data = await response.json();
  // Response: { data: [{ embedding: number[], index: number }, ...] }
  const sorted = data.data.sort(
    (a: { index: number }, b: { index: number }) => a.index - b.index,
  );
  return sorted.map((d: { embedding: number[] }) => d.embedding);
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  try {
    const body: RequestBody = await req.json();

    console.log(
      "[embed-signals] Request:",
      JSON.stringify({
        signalCount: body.signals?.length,
        jobId: body.jobId,
        side: body.side,
      }),
    );

    // Validate
    if (
      !body.signals || !Array.isArray(body.signals) ||
      body.signals.length === 0
    ) {
      return new Response(
        JSON.stringify({ embeddings: [] }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!body.jobId || !body.side) {
      return new Response(
        JSON.stringify({ error: "Missing jobId or side" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Get platform Azure config from Supabase secrets
    const azureEndpoint = Deno.env.get("PLATFORM_AZURE_ENDPOINT");
    const azureApiKey = Deno.env.get("PLATFORM_AZURE_API_KEY");
    const azureDeployment = Deno.env.get("PLATFORM_AZURE_EMBED_DEPLOYMENT") || "text-embedding-3-small-2";

    if (!azureEndpoint || !azureApiKey) {
      return new Response(
        JSON.stringify({
          error: "PLATFORM_AZURE_ENDPOINT or PLATFORM_AZURE_API_KEY not configured",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Extract texts, truncate to 8000 chars each (embedding model limit)
    const texts = body.signals.map((s) => s.text.slice(0, 8000));

    // =========================================================================
    // REDIS EMBEDDING CACHE — 30-day TTL
    // Hash each text → check Redis → only call Azure for misses
    // =========================================================================

    const CACHE_TTL = 2592000; // 30 days in seconds
    const hashes = await Promise.all(texts.map((t) => hashText(t)));
    const cacheKeys = hashes.map((h) => `emb:${h}`);

    // Check Redis for all texts in parallel
    const cached = await Promise.all(
      cacheKeys.map((key) => redis.get<number[]>(key)),
    );

    let cacheHits = 0;
    const allEmbeddings: (number[] | null)[] = cached.map((c) => {
      if (c && Array.isArray(c) && c.length > 0) {
        cacheHits++;
        return c;
      }
      return null;
    });

    // Collect uncached indices
    const uncachedIndices: number[] = [];
    for (let i = 0; i < allEmbeddings.length; i++) {
      if (!allEmbeddings[i]) uncachedIndices.push(i);
    }

    console.log(
      `[embed-signals] Cache: ${cacheHits} hits, ${uncachedIndices.length} misses (of ${texts.length} total)`,
    );

    // Call Azure only for cache misses, in batches of 100
    if (uncachedIndices.length > 0) {
      const EMBED_BATCH = 100;
      const uncachedTexts = uncachedIndices.map((i) => texts[i]);

      const freshEmbeddings: number[][] = [];
      for (let i = 0; i < uncachedTexts.length; i += EMBED_BATCH) {
        const chunk = uncachedTexts.slice(i, i + EMBED_BATCH);
        const embeddings = await callAzureEmbeddings(azureEndpoint, azureApiKey, azureDeployment, chunk);
        freshEmbeddings.push(...embeddings);
      }

      // Fill in the gaps + cache new embeddings
      const cacheWrites: Promise<void>[] = [];
      for (let j = 0; j < uncachedIndices.length; j++) {
        const idx = uncachedIndices[j];
        allEmbeddings[idx] = freshEmbeddings[j];
        cacheWrites.push(redis.set(cacheKeys[idx], freshEmbeddings[j], { ex: CACHE_TTL }));
      }

      // Fire cache writes in parallel, don't block response
      await Promise.all(cacheWrites).catch((e) =>
        console.log(`[embed-signals] Redis cache write error: ${e}`)
      );
    }

    // Build results (all slots filled — cached or fresh)
    const results: EmbeddingResult[] = body.signals.map((s, i) => ({
      record_key: s.record_key,
      embedding: allEmbeddings[i]!,
    }));

    // Upsert to signal_embeddings via Supabase service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const rows = results.map((r) => ({
      record_key: r.record_key,
      job_id: body.jobId,
      side: body.side,
      embedding: JSON.stringify(r.embedding),
      created_at: new Date().toISOString(),
    }));

    // Batch upsert (Supabase handles array upsert)
    const { error: upsertError } = await supabase
      .from("signal_embeddings")
      .upsert(rows, { onConflict: "record_key,job_id" });

    if (upsertError) {
      console.error("[embed-signals] Upsert error:", upsertError.message);
      return new Response(
        JSON.stringify({
          error: `DB_ERROR: ${upsertError.message}`,
          embeddings: results,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      `[embed-signals] Stored ${results.length} embeddings for job ${body.jobId}`,
    );

    return new Response(
      JSON.stringify({ embeddings: results }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[embed-signals] Fatal:", error);
    return new Response(
      JSON.stringify({
        error: `INTERNAL: ${(error as Error).message?.slice(0, 200)}`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
