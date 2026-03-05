import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * MCP-WORKER — pg_cron-triggered shard processor (V4)
 *
 * Called every 2 seconds by pg_cron via pg_net.
 * Claims pending shards from mcp_shards, processes them (AI evaluation),
 * writes results to mcp_evaluations, marks shards complete.
 *
 * Guarantees:
 *   - Zero pairs lost (work is durable rows in Postgres)
 *   - Stale recovery (shards stuck >60s reset to pending)
 *   - Duplicate safe (UNIQUE eval_id,job_id on mcp_evaluations)
 *   - FOR UPDATE SKIP LOCKED prevents double-claiming
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

interface MCPEvaluationInput {
  evalId: string;
  demand: {
    key: string;
    who: string;
    wants: string;
    why_now: string;
    constraints: string[];
    segment: string;
  };
  supply: {
    key: string;
    who: string;
    offers: string;
    segment: string;
  };
  similarity?: number;
  rank?: number;
}

interface AIConfig {
  provider: "openai" | "azure" | "anthropic";
  openaiApiKey?: string;
  azureApiKey?: string;
  azureEndpoint?: string;
  azureChatDeployment?: string;
  anthropicApiKey?: string;
  model?: string;
}

interface MCPEvalResult {
  evalId: string;
  scores: { fit: number; timing: number; combined: number };
  classification: "PASS" | "MARGINAL" | "QUARANTINE" | "HARD_DROP";
  readiness: "READY" | "WARMING" | "NOT_YET";
  vetoed: boolean;
  veto_reason: string | null;
  risks: string[];
  framing: string;
  reasoning: string;
  error?: string;
}

interface ShardRow {
  id: string;
  job_id: string;
  shard_index: number;
  status: string;
  pairs: MCPEvaluationInput[];
  pair_count: number;
  claimed_at: string | null;
}

// =============================================================================
// AI PROVIDER CALLS — BYOK
// =============================================================================

async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<{ status: number; content: string }> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
  });
  if (!response.ok) {
    const t = await response.text();
    return { status: response.status, content: t.slice(0, 200) };
  }
  const data = await response.json();
  return {
    status: 200,
    content: data.choices?.[0]?.message?.content || "",
  };
}

async function callAzure(
  endpoint: string,
  apiKey: string,
  deployment: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<{ status: number; content: string }> {
  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2025-01-01-preview`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
  });
  if (!response.ok) {
    const t = await response.text();
    return { status: response.status, content: t.slice(0, 200) };
  }
  const data = await response.json();
  return {
    status: 200,
    content: data.choices?.[0]?.message?.content || "",
  };
}

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<{ status: number; content: string }> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      max_tokens: maxTokens,
    }),
  });
  if (!response.ok) {
    const t = await response.text();
    return { status: response.status, content: t.slice(0, 200) };
  }
  const data = await response.json();
  return { status: 200, content: data.content?.[0]?.text || "" };
}

// =============================================================================
// SYSTEM PROMPT — Calibrated with few-shot examples
// =============================================================================

const SYSTEM_PROMPT = `You are the MCP — Market Context Processor.
Evaluate whether each demand/supply pair is a good match for a business introduction.

For each pair, assess:
- FIT: Does supply's offering match demand's need? (0.00-1.00)
- TIMING: Is demand's urgency real? Evidence of action now? (0.00-1.00)
- COMPETITOR CHECK: Are these companies competitors? If yes, veto.
- FRAMING: One sentence an operator can paste into an intro email. Leave empty if score is too low to justify an introduction.
- REASONING: 1-2 sentences explaining the score.

EXAMPLES:

EXAMPLE 1 (HIGH - combined 0.78):
DEMAND: "Need 3 biostatisticians with SAS/R for FDA Phase III submission, Q2 deadline"
SUPPLY OFFERS: "Biostatistics staffing for pharma, placed 40+ FDA-facing statisticians last year"
→ {"id":"ex1","fit":0.82,"timing":0.72,"vetoed":false,"veto_reason":null,"framing":"Your Q2 submission timeline matches their bench of FDA-experienced biostatisticians.","reasoning":"Specific capability match. Supply's track record in FDA biostatistics directly serves demand's Phase III need."}

EXAMPLE 2 (LOW - combined 0.32):
DEMAND: "Need 3 biostatisticians with SAS/R for FDA Phase III submission"
SUPPLY OFFERS: "Full-service clinical recruiting across all therapeutic areas"
→ {"id":"ex2","fit":0.35,"timing":0.28,"vetoed":false,"veto_reason":null,"framing":"","reasoning":"Supply recruits broadly in clinical space but has no demonstrated biostatistics specialization. Generic category overlap without specific capability alignment."}

EXAMPLE 3 (VETO):
DEMAND: "Need clinical trial recruitment support for oncology trials"
SUPPLY OFFERS: "Clinical trial patient recruitment for oncology and rare disease"
→ {"id":"ex3","fit":0.10,"timing":0.50,"vetoed":true,"veto_reason":"Both recruit patients for clinical trials — potential competitor, not a buyer/seller pair.","framing":"","reasoning":"Both parties offer the same service to the same market. This is a competitor pair, not a buyer-seller pair."}

EXAMPLE 4 (MARGINAL - combined 0.52):
DEMAND: "Scaling regulatory affairs team, 5 hires across EU and US"
SUPPLY OFFERS: "Life science executive search, regulatory and medical affairs focus, US-based"
→ {"id":"ex4","fit":0.58,"timing":0.44,"vetoed":false,"veto_reason":null,"framing":"","reasoning":"Partial alignment — supply covers regulatory hiring but US only. Demand needs EU+US. Geographic gap limits fit."}

Use these examples to calibrate your scoring. Generic industry overlap without specific capability match = below 0.5. Specific capability + evidence = above 0.7. If both sides offer the same service to the same market, veto.

Rules:
- Scores are decimals 0.00 to 1.00
- If companies are competitors: vetoed=true, explain in veto_reason
- Framing: operator voice, not "my client" or "I work with"
- If insufficient data to evaluate: fit=0.00, explain in reasoning

Respond with a JSON array. One object per pair.
Match the order of input pairs. Use the exact id from each pair.
Each object: {"id","fit","timing","vetoed","veto_reason","framing","reasoning"}

No prose outside JSON. Only valid JSON array.`;

// =============================================================================
// PROMPT BUILDER
// =============================================================================

function buildBatchedUserPrompt(pairs: MCPEvaluationInput[]): string {
  const lines: string[] = [`Evaluate these ${pairs.length} pairs:\n`];
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    lines.push(
      `[${i + 1}] id: ${p.evalId}`,
      `DEMAND: "${p.demand.who}" wants "${p.demand.wants}"`,
      `WHY NOW: "${p.demand.why_now}"`,
      `SUPPLY OFFERS: "${p.supply.who}" offers "${p.supply.offers}"`,
      "",
    );
  }
  return lines.join("\n");
}

// =============================================================================
// PARSE + CLASSIFY (server-side score computation — Rule 5)
// =============================================================================

function classify(
  combined: number,
  vetoed: boolean,
): "PASS" | "MARGINAL" | "QUARANTINE" | "HARD_DROP" {
  if (vetoed) return "HARD_DROP";
  if (combined >= 0.5) return "PASS";
  if (combined >= 0.3) return "MARGINAL";
  return "QUARANTINE";
}

function deriveReadiness(combined: number): "READY" | "WARMING" | "NOT_YET" {
  if (combined >= 0.7) return "READY";
  if (combined >= 0.4) return "WARMING";
  return "NOT_YET";
}

function parseBatchedResponse(
  raw: string,
  inputPairs: MCPEvaluationInput[],
): MCPEvalResult[] {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let parsed: unknown[];
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start !== -1 && end > start) {
      try {
        parsed = JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return inputPairs.map((p) => ({
          evalId: p.evalId,
          scores: { fit: 0, timing: 0, combined: 0 },
          classification: "QUARANTINE" as const,
          readiness: "NOT_YET" as const,
          vetoed: false, veto_reason: null, risks: [], framing: "", reasoning: "",
          error: "PARSE_ERROR: Failed to parse batched AI response",
        }));
      }
    } else {
      return inputPairs.map((p) => ({
        evalId: p.evalId,
        scores: { fit: 0, timing: 0, combined: 0 },
        classification: "QUARANTINE" as const,
        readiness: "NOT_YET" as const,
        vetoed: false, veto_reason: null, risks: [], framing: "", reasoning: "",
        error: "PARSE_ERROR: No JSON array found in AI response",
      }));
    }
  }

  if (!Array.isArray(parsed)) {
    return inputPairs.map((p) => ({
      evalId: p.evalId,
      scores: { fit: 0, timing: 0, combined: 0 },
      classification: "QUARANTINE" as const,
      readiness: "NOT_YET" as const,
      vetoed: false, veto_reason: null, risks: [], framing: "", reasoning: "",
      error: "PARSE_ERROR: AI response is not an array",
    }));
  }

  const resultById = new Map<string, Record<string, unknown>>();
  for (const item of parsed) {
    if (item && typeof item === "object" && "id" in (item as object)) {
      resultById.set(
        String((item as Record<string, unknown>).id),
        item as Record<string, unknown>,
      );
    }
  }

  return inputPairs.map((pair, index) => {
    const r = resultById.get(pair.evalId) ||
      (parsed[index] as Record<string, unknown> | undefined);

    if (!r || typeof r !== "object") {
      return {
        evalId: pair.evalId,
        scores: { fit: 0, timing: 0, combined: 0 },
        classification: "QUARANTINE" as const,
        readiness: "NOT_YET" as const,
        vetoed: false, veto_reason: null, risks: [], framing: "", reasoning: "",
        error: "ID_MISMATCH: No matching result from AI",
      };
    }

    const fit = Math.max(0, Math.min(1, Number(r.fit) || 0));
    const timing = Math.max(0, Math.min(1, Number(r.timing) || 0));
    const combined = Math.round((0.6 * fit + 0.4 * timing) * 1000) / 1000;
    const vetoed = !!r.vetoed;
    const veto_reason = vetoed && typeof r.veto_reason === "string"
      ? r.veto_reason.slice(0, 200)
      : null;
    const framing = typeof r.framing === "string" ? r.framing.slice(0, 300) : "";
    const reasoning = typeof r.reasoning === "string"
      ? r.reasoning.slice(0, 500)
      : "No reasoning provided";

    return {
      evalId: pair.evalId,
      scores: { fit, timing, combined },
      classification: classify(combined, vetoed),
      readiness: deriveReadiness(combined),
      vetoed,
      veto_reason,
      risks: [],
      framing,
      reasoning,
    };
  });
}

// =============================================================================
// CALL AI (BYOK routing)
// =============================================================================

async function callBYOK(
  ai: AIConfig,
  systemPrompt: string,
  userPrompt: string,
  pairCount: number,
): Promise<{ status: number; content: string }> {
  const model = ai.model ||
    (ai.provider === "anthropic" ? "claude-haiku-4-5-20251001" : "gpt-4o-mini");
  const maxTokens = Math.min(16000, Math.max(2000, pairCount * 150));

  if (ai.provider === "openai") {
    return callOpenAI(ai.openaiApiKey!, model, systemPrompt, userPrompt, maxTokens);
  } else if (ai.provider === "azure") {
    return callAzure(
      ai.azureEndpoint!, ai.azureApiKey!, ai.azureChatDeployment!,
      systemPrompt, userPrompt, maxTokens,
    );
  } else {
    return callAnthropic(
      ai.anthropicApiKey!, model, systemPrompt, userPrompt,
      Math.min(8192, maxTokens),
    );
  }
}

// =============================================================================
// PROCESS A SINGLE SHARD
// =============================================================================

async function processShard(
  supabase: ReturnType<typeof createClient>,
  shard: ShardRow,
  aiConfig: AIConfig,
): Promise<{ succeeded: number; failed: number }> {
  const pairs = shard.pairs as MCPEvaluationInput[];
  const jobId = shard.job_id;

  // Build prompt + call AI
  const userPrompt = buildBatchedUserPrompt(pairs);
  let result = await callBYOK(aiConfig, SYSTEM_PROMPT, userPrompt, pairs.length);

  // Retry once on non-200
  if (result.status !== 200) {
    console.log(`[mcp-worker] Shard ${shard.shard_index} AI failed (${result.status}), retrying...`);
    result = await callBYOK(aiConfig, SYSTEM_PROMPT, userPrompt, pairs.length);
  }

  if (result.status !== 200) {
    // Mark shard as failed
    await supabase
      .from("mcp_shards")
      .update({ status: "failed", error: `AI returned ${result.status}`, completed_at: new Date().toISOString() })
      .eq("id", shard.id);
    return { succeeded: 0, failed: pairs.length };
  }

  // Parse response
  let results = parseBatchedResponse(result.content, pairs);

  // Retry once on total parse failure
  const allParseErrors = results.every((r) => r.error?.startsWith("PARSE_ERROR"));
  if (allParseErrors) {
    console.log(`[mcp-worker] Shard ${shard.shard_index} parse failure, retrying...`);
    const retry = await callBYOK(aiConfig, SYSTEM_PROMPT, userPrompt, pairs.length);
    if (retry.status === 200) {
      const retryResults = parseBatchedResponse(retry.content, pairs);
      if (!retryResults.every((r) => r.error?.startsWith("PARSE_ERROR"))) {
        results = retryResults;
      }
    }
  }

  // Build rows for upsert
  const rows = results.map((r, i) => {
    const pair = pairs[i];
    return {
      eval_id: r.evalId,
      job_id: jobId,
      demand_key: pair.demand.key,
      supply_key: pair.supply.key,
      scores: r.scores,
      classification: r.classification,
      readiness: r.readiness,
      vetoed: r.vetoed,
      veto_reason: r.veto_reason,
      risks: r.risks,
      framing: r.framing,
      reasoning: r.reasoning,
      similarity: pair.similarity || null,
      rank: pair.rank || null,
      evaluated_at: new Date().toISOString(),
    };
  });

  // Upsert results — UNIQUE(eval_id, job_id) prevents duplicates
  const { error: upsertError } = await supabase
    .from("mcp_evaluations")
    .upsert(rows, { onConflict: "eval_id,job_id" });

  if (upsertError) {
    console.error(`[mcp-worker] Shard ${shard.shard_index} upsert error: ${upsertError.message}`);
    await supabase
      .from("mcp_shards")
      .update({ status: "failed", error: upsertError.message, completed_at: new Date().toISOString() })
      .eq("id", shard.id);
    return { succeeded: 0, failed: pairs.length };
  }

  const succeeded = results.filter((r) => !r.error).length;
  const failed = results.filter((r) => !!r.error).length;

  // Mark shard complete
  await supabase
    .from("mcp_shards")
    .update({ status: "complete", completed_at: new Date().toISOString() })
    .eq("id", shard.id);

  // Increment completed_pairs on mcp_jobs
  const { data: jobRow } = await supabase
    .from("mcp_jobs")
    .select("completed_pairs, total_pairs")
    .eq("job_id", jobId)
    .single();

  if (jobRow) {
    const newCompleted = (jobRow.completed_pairs || 0) + shard.pair_count;
    await supabase
      .from("mcp_jobs")
      .update({ completed_pairs: newCompleted })
      .eq("job_id", jobId);
  }

  return { succeeded, failed };
}

// =============================================================================
// MAIN HANDLER — Called by pg_cron every 2 seconds
// =============================================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // =========================================================================
    // STEP 1: STALE RECOVERY — reset shards stuck in processing > 60s
    // =========================================================================

    const { data: staleCount } = await supabase.rpc("recover_stale_shards");
    if (staleCount && staleCount > 0) {
      console.log(`[mcp-worker] Recovered ${staleCount} stale shards`);
    }

    // =========================================================================
    // STEP 2: CLAIM shards — atomic, FOR UPDATE SKIP LOCKED
    // =========================================================================

    const { data: claimed, error: claimError } = await supabase.rpc("claim_shards", {
      p_limit: 5,
    });

    if (claimError) {
      console.error(`[mcp-worker] Claim error: ${claimError.message}`);
      return new Response(
        JSON.stringify({ error: claimError.message }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!claimed || claimed.length === 0) {
      // No work available — this is normal, just return
      return new Response(
        JSON.stringify({ status: "idle", claimed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(
      `[mcp-worker] Claimed ${claimed.length} shards: [${claimed.map((s: ShardRow) => s.shard_index).join(",")}]`,
    );

    // =========================================================================
    // STEP 3: LOAD AI CONFIG from mcp_jobs
    // =========================================================================

    // Group claimed shards by job_id (usually just one job)
    const jobIds = [...new Set(claimed.map((s: ShardRow) => s.job_id))];
    const aiConfigMap = new Map<string, AIConfig>();

    for (const jid of jobIds) {
      const { data: job } = await supabase
        .from("mcp_jobs")
        .select("config")
        .eq("job_id", jid)
        .single();

      if (job?.config?.aiConfig) {
        aiConfigMap.set(jid as string, job.config.aiConfig as AIConfig);
      }
    }

    // =========================================================================
    // STEP 4: PROCESS all claimed shards concurrently
    // =========================================================================

    const results = await Promise.allSettled(
      (claimed as ShardRow[]).map(async (shard) => {
        const aiConfig = aiConfigMap.get(shard.job_id);
        if (!aiConfig) {
          console.error(`[mcp-worker] No aiConfig for job ${shard.job_id}`);
          await supabase
            .from("mcp_shards")
            .update({ status: "failed", error: "No aiConfig in mcp_jobs", completed_at: new Date().toISOString() })
            .eq("id", shard.id);
          return { succeeded: 0, failed: shard.pair_count };
        }
        return processShard(supabase, shard, aiConfig);
      }),
    );

    let totalSucceeded = 0;
    let totalFailed = 0;
    for (const r of results) {
      if (r.status === "fulfilled") {
        totalSucceeded += r.value.succeeded;
        totalFailed += r.value.failed;
      } else {
        console.error(`[mcp-worker] Shard processing error:`, r.reason);
        totalFailed += 25; // approximate
      }
    }

    // =========================================================================
    // STEP 5: JOB COMPLETION CHECK
    // =========================================================================

    for (const jid of jobIds) {
      const { count } = await supabase
        .from("mcp_shards")
        .select("*", { count: "exact", head: true })
        .eq("job_id", jid)
        .in("status", ["pending", "processing"]);

      if (count === 0) {
        console.log(`[mcp-worker] Job ${jid} complete — all shards done`);
        await supabase
          .from("mcp_jobs")
          .update({
            status: "complete",
            completed_at: new Date().toISOString(),
          })
          .eq("job_id", jid);
      }
    }

    console.log(
      `[mcp-worker] Done: ${totalSucceeded} succeeded, ${totalFailed} failed`,
    );

    return new Response(
      JSON.stringify({
        status: "processed",
        claimed: claimed.length,
        succeeded: totalSucceeded,
        failed: totalFailed,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[mcp-worker] Fatal:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
