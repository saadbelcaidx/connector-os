import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * MCP-ENHANCE V2 — Batched Pair Evaluation Edge Function
 *
 * KEY CHANGE: 100 pairs per prompt, not 1 pair per AI call.
 * BYOK: uses whatever provider/model the user configured.
 *
 * Rules:
 *  1. wants↔offers = complements (match). context↔context = competitors.
 *  2. AI sees synthesized meaning only. No raw payloads.
 *  3. Veto overrides score. Always. 0.95 match between competitors = HARD DROP.
 *  4. Supply side labeled "offers" in prompts. Never "wants."
 *  5. Server computes combined score. Never trust AI arithmetic.
 *  6. framing field is the product — what operator pastes into intro email.
 *  7. Embeddings are platform infrastructure. Evaluation is BYOK.
 *
 * Always returns 200 with { results: MCPEvalResult[] }.
 */

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
    offers: string; // Rule 4: always "offers", never "wants"
    segment: string;
  };
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
  scores: {
    fit: number;
    timing: number;
    combined: number;
  };
  classification: "PASS" | "MARGINAL" | "QUARANTINE" | "HARD_DROP";
  readiness: "READY" | "WARMING" | "NOT_YET";
  vetoed: boolean;
  veto_reason: string | null;
  risks: string[];
  framing: string;
  reasoning: string;
  error?: string;
}

interface RequestBody {
  pairs: MCPEvaluationInput[];
  ai: AIConfig;
}

// =============================================================================
// AI PROVIDER CALLS — BYOK, model-agnostic
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
// SYSTEM PROMPT — Batched evaluation (from spec section 3)
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
// BUILD BATCHED USER PROMPT
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
// VALIDATE AI CONFIG
// =============================================================================

function validateAIConfig(
  ai: AIConfig,
): { code: string; message: string } | null {
  if (!ai || !ai.provider) {
    return { code: "AI_SETUP_INCOMPLETE", message: "No provider configured" };
  }
  if (ai.provider === "openai" && !ai.openaiApiKey) {
    return { code: "AI_SETUP_INCOMPLETE", message: "Missing openaiApiKey" };
  }
  if (
    ai.provider === "azure" &&
    (!ai.azureApiKey || !ai.azureEndpoint || !ai.azureChatDeployment)
  ) {
    return { code: "AI_SETUP_INCOMPLETE", message: "Missing Azure config" };
  }
  if (ai.provider === "anthropic" && !ai.anthropicApiKey) {
    return { code: "AI_SETUP_INCOMPLETE", message: "Missing anthropicApiKey" };
  }
  return null;
}

// =============================================================================
// PARSE BATCHED AI RESPONSE + SERVER-SIDE SCORE COMPUTATION (Rule 5)
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
  // Clean markdown fences
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  // Try parsing as JSON array
  let parsed: unknown[];
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Attempt to recover: find first [ and last ]
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start !== -1 && end > start) {
      try {
        parsed = JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        // Total parse failure — return errors for all
        return inputPairs.map((p) => ({
          evalId: p.evalId,
          scores: { fit: 0, timing: 0, combined: 0 },
          classification: "QUARANTINE" as const,
          readiness: "NOT_YET" as const,
          vetoed: false,
          veto_reason: null,
          risks: [],
          framing: "",
          reasoning: "",
          error: "PARSE_ERROR: Failed to parse batched AI response",
        }));
      }
    } else {
      return inputPairs.map((p) => ({
        evalId: p.evalId,
        scores: { fit: 0, timing: 0, combined: 0 },
        classification: "QUARANTINE" as const,
        readiness: "NOT_YET" as const,
        vetoed: false,
        veto_reason: null,
        risks: [],
        framing: "",
        reasoning: "",
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
      vetoed: false,
      veto_reason: null,
      risks: [],
      framing: "",
      reasoning: "",
      error: "PARSE_ERROR: AI response is not an array",
    }));
  }

  // Build lookup by id
  const resultById = new Map<string, Record<string, unknown>>();
  for (const item of parsed) {
    if (item && typeof item === "object" && "id" in (item as object)) {
      resultById.set(String((item as Record<string, unknown>).id), item as Record<string, unknown>);
    }
  }

  // Map results back to input pairs (by order and by id)
  return inputPairs.map((pair, index) => {
    // Try by id first, then by index
    const r = resultById.get(pair.evalId) || (parsed[index] as Record<string, unknown> | undefined);

    if (!r || typeof r !== "object") {
      return {
        evalId: pair.evalId,
        scores: { fit: 0, timing: 0, combined: 0 },
        classification: "QUARANTINE" as const,
        readiness: "NOT_YET" as const,
        vetoed: false,
        veto_reason: null,
        risks: [],
        framing: "",
        reasoning: "",
        error: "ID_MISMATCH: No matching result from AI",
      };
    }

    // Clamp fit/timing to [0,1]
    const fit = Math.max(0, Math.min(1, Number(r.fit) || 0));
    const timing = Math.max(0, Math.min(1, Number(r.timing) || 0));

    // Rule 5: Server computes combined score
    const combined = Math.round((0.6 * fit + 0.4 * timing) * 1000) / 1000;

    // Rule 3: Veto overrides score
    const vetoed = !!r.vetoed;
    const veto_reason = vetoed && typeof r.veto_reason === "string"
      ? r.veto_reason.slice(0, 200)
      : null;

    // Truncate framing (300 chars) and reasoning (500 chars)
    const framing = typeof r.framing === "string"
      ? r.framing.slice(0, 300)
      : "";
    const reasoning = typeof r.reasoning === "string"
      ? r.reasoning.slice(0, 500)
      : "No reasoning provided";

    // Classify and derive readiness
    const cls = classify(combined, vetoed);
    const readiness = deriveReadiness(combined);

    return {
      evalId: pair.evalId,
      scores: { fit, timing, combined },
      classification: cls,
      readiness,
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
    (ai.provider === "anthropic"
      ? "claude-haiku-4-5-20251001"
      : "gpt-4o-mini");

  // Scale max_tokens to pair count: ~120 tokens per pair output
  const maxTokens = Math.min(16000, Math.max(2000, pairCount * 150));

  if (ai.provider === "openai") {
    return callOpenAI(ai.openaiApiKey!, model, systemPrompt, userPrompt, maxTokens);
  } else if (ai.provider === "azure") {
    return callAzure(
      ai.azureEndpoint!,
      ai.azureApiKey!,
      ai.azureChatDeployment!,
      systemPrompt,
      userPrompt,
      maxTokens,
    );
  } else {
    // Anthropic max_tokens cap at 8192
    const clampedTokens = Math.min(8192, maxTokens);
    return callAnthropic(
      ai.anthropicApiKey!,
      model,
      systemPrompt,
      userPrompt,
      clampedTokens,
    );
  }
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

    // Support both old (items) and new (pairs) field names
    const pairs = body.pairs || (body as unknown as { items: MCPEvaluationInput[] }).items;

    console.log(
      "[mcp-enhance] Request:",
      JSON.stringify({
        pairCount: pairs?.length,
        provider: body.ai?.provider || "none",
      }),
    );

    // No pairs → empty results
    if (!pairs || !Array.isArray(pairs) || pairs.length === 0) {
      return new Response(
        JSON.stringify({ results: [] }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Validate AI config
    const aiError = validateAIConfig(body.ai);
    if (aiError) {
      const results: MCPEvalResult[] = pairs.map((p) => ({
        evalId: p.evalId,
        scores: { fit: 0, timing: 0, combined: 0 },
        classification: "QUARANTINE" as const,
        readiness: "NOT_YET" as const,
        vetoed: false,
        veto_reason: null,
        risks: [],
        framing: "",
        reasoning: "",
        error: `${aiError.code}: ${aiError.message}`,
      }));
      return new Response(
        JSON.stringify({ results }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Build batched prompt and call AI (single call for entire batch)
    const userPrompt = buildBatchedUserPrompt(pairs);
    const result = await callBYOK(body.ai, SYSTEM_PROMPT, userPrompt, pairs.length);

    if (result.status === 429) {
      const results: MCPEvalResult[] = pairs.map((p) => ({
        evalId: p.evalId,
        scores: { fit: 0, timing: 0, combined: 0 },
        classification: "QUARANTINE" as const,
        readiness: "NOT_YET" as const,
        vetoed: false,
        veto_reason: null,
        risks: [],
        framing: "",
        reasoning: "",
        error: "RATE_LIMITED: Provider returned 429",
      }));
      return new Response(
        JSON.stringify({ results }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (result.status !== 200) {
      const results: MCPEvalResult[] = pairs.map((p) => ({
        evalId: p.evalId,
        scores: { fit: 0, timing: 0, combined: 0 },
        classification: "QUARANTINE" as const,
        readiness: "NOT_YET" as const,
        vetoed: false,
        veto_reason: null,
        risks: [],
        framing: "",
        reasoning: "",
        error: `UPSTREAM_ERROR: Provider returned ${result.status}`,
      }));
      return new Response(
        JSON.stringify({ results }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Parse batched response + server-side score computation
    const results = parseBatchedResponse(result.content, pairs);

    // Retry once on total parse failure
    const allErrors = results.every((r) => r.error?.startsWith("PARSE_ERROR"));
    if (allErrors && pairs.length > 0) {
      console.log("[mcp-enhance] Total parse failure, retrying once...");
      const retry = await callBYOK(body.ai, SYSTEM_PROMPT, userPrompt, pairs.length);
      if (retry.status === 200) {
        const retryResults = parseBatchedResponse(retry.content, pairs);
        const retryAllErrors = retryResults.every((r) => r.error?.startsWith("PARSE_ERROR"));
        if (!retryAllErrors) {
          const succeeded = retryResults.filter((r) => !r.error).length;
          const vetoed = retryResults.filter((r) => r.vetoed).length;
          console.log(
            `[mcp-enhance] Retry succeeded: ${retryResults.length} pairs, ${succeeded} ok, ${vetoed} vetoed`,
          );
          return new Response(
            JSON.stringify({ results: retryResults }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }
    }

    const succeeded = results.filter((r) => !r.error).length;
    const vetoed = results.filter((r) => r.vetoed).length;
    console.log(
      `[mcp-enhance] Processed: ${results.length} pairs, ${succeeded} ok, ${vetoed} vetoed`,
    );

    return new Response(
      JSON.stringify({ results }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[mcp-enhance] Fatal:", error);
    return new Response(
      JSON.stringify({ results: [] }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
