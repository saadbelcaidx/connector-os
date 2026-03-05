import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * MCP-ORCHESTRATE-PHASE2 — Reasoning for top matches
 *
 * Triggered by complete_shard RPC (via pg_net) when all scoring shards done.
 *   1. Loads top 50 scored evaluations (combined >= 0.5, not vetoed)
 *   2. Loads canonical data for context
 *   3. Creates reasoning shards → dispatches to mcp-evaluate-worker (mode='reasoning_only')
 *
 * Always returns 200.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// =============================================================================
// TYPES
// =============================================================================

interface RequestBody {
  jobId: string;
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body: RequestBody = await req.json();
    const jobId = body.jobId;

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: "Missing jobId" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[phase2] Starting reasoning phase for job ${jobId}`);

    // =========================================================================
    // 1. Load top scored evaluations
    // =========================================================================

    // Supabase doesn't support JSONB field ordering well via REST API,
    // so load all scored, sort in JS, take top 200
    const { data: allScored, error: loadError } = await supabase
      .from("mcp_evaluations")
      .select("eval_id, demand_key, supply_key, scores, vetoed, classification, readiness, similarity, rank")
      .eq("job_id", jobId)
      .eq("eval_status", "scored")
      .eq("vetoed", false);

    if (loadError) {
      throw new Error(`Failed to load scored evaluations: ${loadError.message}`);
    }

    if (!allScored || allScored.length === 0) {
      console.log("[phase2] No scored evaluations found — marking job complete");
      await supabase.from("mcp_jobs").update({
        reasoning_status: "complete",
        status: "complete",
        completed_at: new Date().toISOString(),
      }).eq("job_id", jobId);

      return new Response(
        JSON.stringify({ reasoned: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Sort by combined score desc, filter >= 0.5, take top 50
    // Operator reads top 10-20. 50 with full reasoning is generous.
    // Rest have scores — operator can request reasoning on-demand.
    const topMatches = allScored
      .filter((e) => {
        const combined = e.scores?.combined ?? 0;
        return combined >= 0.5;
      })
      .sort((a, b) => (b.scores?.combined ?? 0) - (a.scores?.combined ?? 0))
      .slice(0, 50);

    if (topMatches.length === 0) {
      console.log("[phase2] No matches above 0.5 threshold — marking job complete");
      await supabase.from("mcp_jobs").update({
        reasoning_status: "complete",
        status: "complete",
        completed_at: new Date().toISOString(),
      }).eq("job_id", jobId);

      return new Response(
        JSON.stringify({ reasoned: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[phase2] ${topMatches.length} matches above 0.5 (from ${allScored.length} total scored)`);

    // =========================================================================
    // 2. Load AI config from job + canonicals for context
    // =========================================================================

    const { data: jobRow } = await supabase
      .from("mcp_jobs")
      .select("config")
      .eq("job_id", jobId)
      .single();

    if (!jobRow?.config?.aiConfig) {
      throw new Error("Job has no AI config");
    }

    const aiConfig = jobRow.config.aiConfig;

    // Collect all unique demand/supply keys
    const demandKeys = [...new Set(topMatches.map((m) => m.demand_key))];
    const supplyKeys = [...new Set(topMatches.map((m) => m.supply_key))];
    const allKeys = [...demandKeys, ...supplyKeys];

    const { data: canonicals } = await supabase
      .from("dmcb_canonicals")
      .select("record_key, canonical")
      .in("record_key", allKeys);

    const canonicalMap = new Map(
      (canonicals || []).map((c: { record_key: string; canonical: Record<string, unknown> }) =>
        [c.record_key, c.canonical]
      ),
    );

    // =========================================================================
    // 3. Build reasoning pairs with canonical context + existing scores
    // =========================================================================

    const reasoningPairs = topMatches.map((m) => {
      const dc = (canonicalMap.get(m.demand_key) || {}) as Record<string, unknown>;
      const sc = (canonicalMap.get(m.supply_key) || {}) as Record<string, unknown>;

      return {
        evalId: m.eval_id,
        demand: {
          key: m.demand_key,
          who: (dc.who as string) || "",
          company: (dc.company as string) || (dc.who as string) || "",
          wants: (dc.wants as string) || "",
          why_now: (dc.why_now as string) || "",
          constraints: (dc.constraints as string[]) || [],
          segment: (dc.who as string) || "",
          industry: (dc.industry as string) || "",
        },
        supply: {
          key: m.supply_key,
          who: (sc.who as string) || "",
          company: (sc.company as string) || (sc.who as string) || "",
          offers: (sc.offers as string) || (sc.wants as string) || "",
          segment: (sc.who as string) || "",
          industry: (sc.industry as string) || "",
        },
        existingScores: m.scores,
        similarity: m.similarity,
        rank: m.rank,
      };
    });

    // =========================================================================
    // 4. Create reasoning shards + dispatch to evaluate-worker
    // =========================================================================

    const SHARD_SIZE = 25;
    const shardRows = [];
    const qstashToken = Deno.env.get("QSTASH_TOKEN");
    const qstashBaseUrl = Deno.env.get("QSTASH_URL") || "https://qstash.upstash.io";
    const workerUrl = `${supabaseUrl}/functions/v1/mcp-evaluate-worker`;

    if (!qstashToken) {
      throw new Error("QSTASH_TOKEN not configured");
    }

    for (let i = 0; i < reasoningPairs.length; i += SHARD_SIZE) {
      const chunk = reasoningPairs.slice(i, i + SHARD_SIZE);
      const shardIndex = 1000 + Math.floor(i / SHARD_SIZE); // Offset to avoid collision with scoring shards

      shardRows.push({
        job_id: jobId,
        shard_index: shardIndex,
        status: "pending",
        pairs: chunk,
        pair_count: chunk.length,
        shard_type: "reasoning",
      });

      // Dispatch to evaluate-worker with reasoning_only mode
      const publishUrl = `${qstashBaseUrl}/v2/publish/${workerUrl}`;
      const res = await fetch(publishUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${qstashToken}`,
          "Content-Type": "application/json",
          "Upstash-Retries": "3",
          "Upstash-Deduplication-Id": `${jobId}-reasoning-${shardIndex}`,
        },
        body: JSON.stringify({
          jobId,
          shardIndex,
          pairs: chunk,
          aiConfig,
          mode: "reasoning_only",
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(
          `[phase2] QStash publish failed shard ${shardIndex}: ${res.status} ${errText.slice(0, 200)}`,
        );
      }
    }

    // Insert reasoning shards to mcp_shards
    if (shardRows.length > 0) {
      const { error: shardError } = await supabase
        .from("mcp_shards")
        .insert(shardRows);

      if (shardError) {
        console.error(`[phase2] Shard insert error: ${shardError.message}`);
      }
    }

    // Update job status
    await supabase.from("mcp_jobs").update({
      reasoning_status: "reasoning",
    }).eq("job_id", jobId);

    console.log(
      `[phase2] Job ${jobId}: ${shardRows.length} reasoning shards dispatched for ${topMatches.length} top matches`,
    );

    return new Response(
      JSON.stringify({
        reasoningShards: shardRows.length,
        topMatches: topMatches.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[phase2] Fatal:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
