import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * MCP-SCORE-WORKER — Single-phase full evaluation via Cerebras
 *
 * Called by QStash (dispatched from mcp-orchestrate).
 * Each invocation:
 *   1. Receives up to 250 pairs + aiConfig
 *   2. Makes 1 Cerebras call (scores + reasoning + risks in one shot)
 *   3. Writes fully evaluated results to mcp_evaluations (eval_status='reasoned')
 *   4. Calls complete_shard RPC → job marked complete when all shards done
 *
 * Fallback chain: Cerebras → Groq → Azure
 * Returns 200 always (QStash retries on non-200).
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

interface EvalPair {
  evalId: string;
  demand: {
    key: string;
    company?: string;
    who?: string;
    wants: string;
    why_now?: string;
    industry?: string;
  };
  supply: {
    key: string;
    company?: string;
    who?: string;
    offers: string;
    industry?: string;
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

interface EvalResult {
  evalId: string;
  demandKey: string;
  supplyKey: string;
  scores: { fit: number; timing: number; combined: number };
  vetoed: boolean;
  vetoReason: string | null;
  reasoning: string;
  risks: string[];
  classification: "PASS" | "MARGINAL" | "QUARANTINE" | "HARD_DROP";
  readiness: "READY" | "WARMING" | "NOT_YET";
  framing: string;
  similarity: number | null;
  rank: number | null;
}

interface RequestBody {
  pairs: EvalPair[];
  aiConfig?: AIConfig;
  ai?: AIConfig;
  jobId: string;
  shardIndex?: number;
}

// =============================================================================
// SYSTEM PROMPT — Proven in Cerebras playground, scores + reasons in one call
// =============================================================================

const SYSTEM_PROMPT = `Score and evaluate these demand-supply pairs for business introductions.

Return a JSON array. One object per pair. Use the exact id from each pair.
Each object: {"id","fit","timing","vetoed","vetoReason","reasoning","risks","framing"}

fit: How well does the supply's offering address the demand's specific need? (0.00-1.00)
  1.0 = exact match (recruiter for clinical ops ↔ company hiring clinical ops director)
  0.5 = tangential overlap
  0.0 = no relevance

timing: How urgent or time-sensitive is this match? (0.00-1.00)
  1.0 = actively hiring RIGHT NOW, role is live
  0.5 = general need, no urgency signal
  0.0 = speculative, no timing evidence

vetoed: true ONLY if demand and supply are direct competitors, have a conflict of interest, or the match is nonsensical. Default false.
vetoReason: If vetoed, one sentence explaining why. Otherwise null.

reasoning: 2-3 sentences. Name both companies. Be specific about WHY they match or don't. CONTEXT is raw background — infer the actual business need. TRIGGER is the timing event. CAPABILITY is what supply delivers.

risks: Array of strings. What could go wrong with this introduction? Empty array if none.

framing: One short sentence (max 20 words). Name both companies.
- If fit >= 0.30: name the trigger event, then the supply capability it activates. WHY NOW is the trigger, not the need — infer what demand actually needs from the supply's offering.
- If fit >= 0.05 but < 0.30: "Light overlap: [X] does [capability], [Y] is in [area]."
- If fit < 0.05: "Low fit."
- Empty string ONLY if vetoed.

Rules:
- A recruiter matching to a hiring company is strong
- A CRO/service provider matching to a hiring need is WEAK — they provide services, not candidates
- A PR firm matching to a hiring need is VETOED
- Never say: aligns well with, well-positioned, synergy, comprehensive, robust, leveraging, holistic, dynamic, directly addressing, operational scope, functional requirements, specializes in, making them a, making them an, strong alignment, expertise aligns
- Be honest. Most pairs are mediocre. Only obvious matches score above 0.8
- Industry alignment matters. Cross-industry matches score lower.
- Be precise. A financial services recruiter matching to a biotech company hiring a finance role is 0.4 fit, not 0.8.

No prose outside JSON. Only valid JSON array.`;

// =============================================================================
// PROMPT BUILDER
// =============================================================================

function buildUserPrompt(pairs: EvalPair[]): string {
  const lines: string[] = [`Evaluate these ${pairs.length} pairs:\n`];
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    const dName = p.demand.company || p.demand.who || "Unknown";
    const sName = p.supply.company || p.supply.who || "Unknown";
    lines.push(
      `[${i + 1}] id: ${p.evalId}`,
      `DEMAND: "${dName}" CONTEXT: "${p.demand.wants}"${p.demand.why_now ? ` TRIGGER: "${p.demand.why_now}"` : ""}${p.demand.industry ? ` [${p.demand.industry}]` : ""}`,
      `SUPPLY: "${sName}" CAPABILITY: "${p.supply.offers}"${p.supply.industry ? ` [${p.supply.industry}]` : ""}`,
      "",
    );
  }
  return lines.join("\n");
}

// =============================================================================
// AI CALL — Cerebras primary (~2900 t/s) → Groq → Azure
// =============================================================================

async function callEvalModel(
  ai: AIConfig,
  userPrompt: string,
  pairCount: number,
): Promise<{ status: number; content: string; provider: string }> {
  // ~150 tokens per pair for full eval (scores + reasoning + risks + framing)
  const maxTokens = Math.min(32000, Math.max(2000, pairCount * 150));

  // Cerebras primary — wafer-scale chip, ~2900 t/s
  const CEREBRAS_KEY = Deno.env.get("CEREBRAS_API_KEY");
  if (CEREBRAS_KEY) {
    try {
      const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CEREBRAS_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-oss-120b",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const tokens = data.usage?.total_tokens || "?";
        const speed = data.usage?.completion_tokens && data.usage?.completion_time
          ? Math.round(data.usage.completion_tokens / data.usage.completion_time)
          : "?";
        console.log(`[eval-worker] Cerebras: ${pairCount} pairs, ${tokens} tokens, ${speed} t/s`);
        return { status: 200, content: data.choices?.[0]?.message?.content || "", provider: "cerebras" };
      }
      const errText = await res.text();
      console.log(`[eval-worker] Cerebras ${res.status}: ${errText.slice(0, 100)}, falling back`);
    } catch (e) {
      console.log(`[eval-worker] Cerebras error: ${(e as Error).message}, falling back`);
    }
  }

  // Groq fallback — ~500 t/s on 120B
  const GROQ_KEY = Deno.env.get("GROQ_API_KEY");
  if (GROQ_KEY) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        console.log(`[eval-worker] Groq: ${pairCount} pairs, ${data.usage?.total_tokens || "?"} tokens`);
        return { status: 200, content: data.choices?.[0]?.message?.content || "", provider: "groq" };
      }
      console.log(`[eval-worker] Groq ${res.status}, falling back to Azure`);
    } catch (e) {
      console.log(`[eval-worker] Groq error: ${(e as Error).message}, falling back to Azure`);
    }
  }

  // Azure fallback
  if (ai.provider === "azure" && ai.azureEndpoint && ai.azureApiKey) {
    const deployment = ai.azureChatDeployment || "gpt-4o";
    const endpoint = `${ai.azureEndpoint}/openai/deployments/${deployment}/chat/completions?api-version=2025-01-01-preview`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "api-key": ai.azureApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return { status: res.status, content: t.slice(0, 200), provider: "azure-fail" };
    }
    const data = await res.json();
    return { status: 200, content: data.choices?.[0]?.message?.content || "", provider: "azure" };
  }

  return { status: 400, content: "No provider available", provider: "none" };
}

// =============================================================================
// PARSE FULL EVALUATION RESPONSE
// =============================================================================

function parseEvalResponse(raw: string, pairs: EvalPair[]): EvalResult[] {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let parsed: unknown[];
  try {
    const json = JSON.parse(cleaned);
    parsed = Array.isArray(json) ? json : (json.results || json.pairs || json.evaluations || [json]);
  } catch {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start !== -1 && end > start) {
      try {
        parsed = JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return pairs.map((p) => fallbackResult(p));
      }
    } else {
      return pairs.map((p) => fallbackResult(p));
    }
  }

  if (!Array.isArray(parsed)) {
    return pairs.map((p) => fallbackResult(p));
  }

  // Build lookup by id
  const resultById = new Map<string, Record<string, unknown>>();
  for (const item of parsed) {
    if (item && typeof item === "object" && "id" in (item as object)) {
      resultById.set(
        String((item as Record<string, unknown>).id),
        item as Record<string, unknown>,
      );
    }
  }

  return pairs.map((pair, index) => {
    const r = resultById.get(pair.evalId) ||
      (parsed[index] as Record<string, unknown> | undefined);

    if (!r || typeof r !== "object") return fallbackResult(pair);

    const fit = Math.max(0, Math.min(1, Number(r.fit) || 0));
    const timing = Math.max(0, Math.min(1, Number(r.timing) || 0));
    // Server computes combined — never trust AI arithmetic
    const combined = Math.round((0.6 * fit + 0.4 * timing) * 1000) / 1000;
    const vetoed = !!r.vetoed;
    const vetoReason = vetoed
      ? (typeof r.vetoReason === "string" ? r.vetoReason.slice(0, 200)
        : typeof r.veto_reason === "string" ? (r.veto_reason as string).slice(0, 200) : null)
      : null;

    const reasoning = typeof r.reasoning === "string" ? r.reasoning.slice(0, 500) : "";
    const framing = typeof r.framing === "string" ? r.framing.slice(0, 300) : "";
    const risks = Array.isArray(r.risks)
      ? (r.risks as unknown[]).filter((x) => typeof x === "string").map((x) => (x as string).slice(0, 200)).slice(0, 5)
      : [];

    return {
      evalId: pair.evalId,
      demandKey: pair.demand.key,
      supplyKey: pair.supply.key,
      scores: { fit, timing, combined },
      vetoed,
      vetoReason,
      reasoning,
      risks,
      framing: vetoed ? "" : framing,
      classification: classify(combined, vetoed),
      readiness: deriveReadiness(combined),
      similarity: pair.similarity || null,
      rank: pair.rank || null,
    };
  });
}

function fallbackResult(pair: EvalPair): EvalResult {
  return {
    evalId: pair.evalId,
    demandKey: pair.demand.key,
    supplyKey: pair.supply.key,
    scores: { fit: 0, timing: 0, combined: 0 },
    vetoed: false,
    vetoReason: null,
    reasoning: "",
    risks: [],
    framing: "",
    classification: "QUARANTINE",
    readiness: "NOT_YET",
    similarity: pair.similarity || null,
    rank: pair.rank || null,
  };
}

// =============================================================================
// CLASSIFICATION (server-side)
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

// =============================================================================
// MAIN HANDLER
// =============================================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  const rawBody = await req.text();

  try {
    const body: RequestBody = JSON.parse(rawBody);
    const pairs = body.pairs;
    const jobId = body.jobId;
    const aiConfig = body.aiConfig || body.ai;
    const shardIndex = body.shardIndex;

    console.log(
      `[eval-worker] Shard ${shardIndex ?? "?"}: ${pairs?.length || 0} pairs, job=${jobId}`,
    );

    if (!pairs || pairs.length === 0) {
      return new Response(
        JSON.stringify({ evaluated: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!aiConfig) {
      return new Response(
        JSON.stringify({ evaluated: 0, error: "No AI config" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build prompt + call AI
    const userPrompt = buildUserPrompt(pairs);
    let result = await callEvalModel(aiConfig, userPrompt, pairs.length);

    // Retry once on non-200
    if (result.status !== 200) {
      console.log(`[eval-worker] First attempt failed (${result.status}), retrying...`);
      result = await callEvalModel(aiConfig, userPrompt, pairs.length);
    }

    if (result.status !== 200) {
      console.error(`[eval-worker] AI call failed: ${result.status} via ${result.provider}`);
      if (shardIndex !== undefined) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const sb = createClient(supabaseUrl, supabaseServiceKey);
        await sb.from("mcp_shards")
          .update({ status: "failed", error: `AI returned ${result.status}`, completed_at: new Date().toISOString() })
          .eq("job_id", jobId).eq("shard_index", shardIndex);
      }
      return new Response(
        JSON.stringify({ evaluated: 0, error: `AI returned ${result.status}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Parse response
    let results = parseEvalResponse(result.content, pairs);

    // Retry once on total parse failure
    const allZero = results.every((r) => r.scores.combined === 0 && !r.vetoed);
    if (allZero) {
      console.log("[eval-worker] Total parse failure, retrying...");
      const retry = await callEvalModel(aiConfig, userPrompt, pairs.length);
      if (retry.status === 200) {
        const retryResults = parseEvalResponse(retry.content, pairs);
        if (!retryResults.every((r) => r.scores.combined === 0 && !r.vetoed)) {
          results = retryResults;
        }
      }
    }

    // Write fully evaluated results to DB
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const rows = results.map((r) => ({
      eval_id: r.evalId,
      job_id: jobId,
      demand_key: r.demandKey,
      supply_key: r.supplyKey,
      scores: r.scores,
      classification: r.classification,
      readiness: r.readiness,
      vetoed: r.vetoed,
      veto_reason: r.vetoReason,
      risks: r.risks,
      framing: r.framing,
      reasoning: r.reasoning,
      similarity: r.similarity,
      rank: r.rank,
      eval_status: "reasoned",
      evaluated_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await supabase
      .from("mcp_evaluations")
      .upsert(rows, { onConflict: "eval_id,job_id" });

    if (upsertError) {
      console.error(`[eval-worker] Upsert error: ${upsertError.message}`);
    }

    const succeeded = upsertError ? 0 : results.length;

    // Complete shard → triggers job complete when all done
    if (shardIndex !== undefined) {
      const { data: shardRow } = await supabase
        .from("mcp_shards")
        .select("id")
        .eq("job_id", jobId)
        .eq("shard_index", shardIndex)
        .single();

      if (shardRow) {
        const { data: rpcResult } = await supabase.rpc("complete_shard", {
          p_shard_id: shardRow.id,
          p_job_id: jobId,
        });
        if (rpcResult && rpcResult.length > 0) {
          console.log(
            `[eval-worker] Job ${jobId}: ${rpcResult[0].completed_pairs} pairs, status=${rpcResult[0].job_status}`,
          );
        }
      }
    }

    console.log(`[eval-worker] Shard ${shardIndex ?? "?"} done: ${succeeded} evaluated via ${result.provider}`);

    return new Response(
      JSON.stringify({ evaluated: succeeded, provider: result.provider }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[eval-worker] Fatal:", error);
    return new Response(
      JSON.stringify({ evaluated: 0, error: (error as Error).message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
