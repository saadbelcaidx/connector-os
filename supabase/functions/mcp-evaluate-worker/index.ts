import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * MCP-EVALUATE-WORKER — V5 QStash-delivered shard processor
 *
 * Called by QStash (not directly by orchestrate). Each invocation:
 *   1. Verifies QStash signature
 *   2. Receives 25 pairs + aiConfig
 *   3. Makes 1 AI call (BYOK)
 *   4. Writes results to mcp_evaluations
 *   5. Updates mcp_shards + mcp_jobs progress
 *
 * QStash provides: 3 retries, deduplication, guaranteed delivery.
 * UNIQUE(eval_id, job_id) on mcp_evaluations prevents duplicates.
 *
 * Always returns 200 on success (so QStash doesn't retry).
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
    company: string;
    wants: string;
    why_now: string;
    constraints: string[];
    segment: string;
    industry: string;
    keywords: string[];
    proof: string;
    title: string;
  };
  supply: {
    key: string;
    who: string;
    company: string;
    offers: string;
    segment: string;
    industry: string;
    keywords: string[];
    proof: string;
    title: string;
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

interface RequestBody {
  pairs: MCPEvaluationInput[];
  aiConfig?: AIConfig;
  ai?: AIConfig;
  jobId: string;
  shardIndex?: number;
  mode?: "full" | "reasoning_only";
}

interface ReasoningPair extends MCPEvaluationInput {
  existingScores?: { fit: number; timing: number; combined: number };
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
- FRAMING: One sentence an operator can paste into an intro email. Must name both companies. Must state the specific need and the specific capability. Leave empty if score is too low to justify an introduction. No generic phrases.
- REASONING: 2-3 sentences. Must follow the rules below.

═══ BANNED PHRASES — applies to BOTH reasoning AND framing ═══
Never use any of these phrases in reasoning or framing. If any appear, the entire output is rejected:
- "aligns well with"
- "aligning well"
- "specializes in"
- "well-positioned to"
- "well-suited"
- "strong alignment"
- "synergy"
- "leveraging"
- "expertise aligns"
- "making them a"
- "making them an"

═══ REASONING RULES ═══
1. Name both companies in every reasoning.
2. State what the demand company SPECIFICALLY needs (role, seniority, function).
3. State what the supply company SPECIFICALLY does that addresses that need.
4. State WHY NOW — what makes the timing relevant (posting date, deadline, urgency signal).
5. Write like a senior analyst briefing a partner, not like a chatbot summarizing a match.
6. Every reasoning must be unique. If you find yourself repeating a phrase across pairs, you are being lazy. Vary your language.
7. The banned phrases above apply to reasoning. Do not use them.

═══ FRAMING RULES ═══
1. Name both companies in the framing sentence.
2. State the specific need and the specific capability.
3. The banned phrases above apply to framing. Do not use them.
4. Operator voice — not "my client" or "I work with".
5. No filler. Every word must carry information.

EXAMPLES:

EXAMPLE 1 (HIGH - combined 0.78):
DEMAND: "Need 3 biostatisticians with SAS/R for FDA Phase III submission, Q2 deadline"
SUPPLY OFFERS: "Biostatistics staffing for pharma, placed 40+ FDA-facing statisticians last year"
→ {"id":"ex1","fit":0.82,"timing":0.72,"vetoed":false,"veto_reason":null,"framing":"[DemandCo] has a Q2 FDA submission deadline requiring 3 biostatisticians — [SupplyCo] placed 40+ FDA-facing statisticians last year and has active bench.","reasoning":"[DemandCo] needs 3 SAS/R biostatisticians for a Phase III FDA submission due Q2. [SupplyCo] placed 40+ FDA-facing statisticians last year and operates a dedicated biostatistics bench. The Q2 deadline is a hard constraint — timing is live."}

EXAMPLE 2 (LOW - combined 0.32):
DEMAND: "Need 3 biostatisticians with SAS/R for FDA Phase III submission"
SUPPLY OFFERS: "Full-service clinical recruiting across all therapeutic areas"
→ {"id":"ex2","fit":0.35,"timing":0.28,"vetoed":false,"veto_reason":null,"framing":"","reasoning":"[DemandCo] needs SAS/R biostatisticians for FDA Phase III work. [SupplyCo] recruits broadly across clinical roles but shows no biostatistics specialization or FDA-specific placements. Generic clinical recruiting does not cover this need."}

EXAMPLE 3 (VETO):
DEMAND: "Need clinical trial recruitment support for oncology trials"
SUPPLY OFFERS: "Clinical trial patient recruitment for oncology and rare disease"
→ {"id":"ex3","fit":0.10,"timing":0.50,"vetoed":true,"veto_reason":"Both recruit patients for clinical trials — potential competitor, not a buyer/seller pair.","framing":"","reasoning":"Both [DemandCo] and [SupplyCo] recruit patients for clinical trials in oncology. Same service, same market. This is a competitor pair, not a buyer-seller pair."}

EXAMPLE 4 (MARGINAL - combined 0.52):
DEMAND: "Scaling regulatory affairs team, 5 hires across EU and US"
SUPPLY OFFERS: "Life science executive search, regulatory and medical affairs focus, US-based"
→ {"id":"ex4","fit":0.58,"timing":0.44,"vetoed":false,"veto_reason":null,"framing":"","reasoning":"[DemandCo] is scaling regulatory affairs with 5 hires across EU and US. [SupplyCo] runs life science executive search with regulatory focus but operates US-only. Covers half the geographic need — EU gap limits the fit."}

Use these examples to calibrate your scoring. Generic industry overlap without specific capability match = below 0.5. Specific capability + evidence = above 0.7. If both sides offer the same service to the same market, veto.

Rules:
- Scores are decimals 0.00 to 1.00
- If companies are competitors: vetoed=true, explain in veto_reason
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
      `DEMAND: "${p.demand.company}" (${p.demand.industry || "unknown"}) wants "${p.demand.wants}"`,
      `WHO: ${p.demand.who || p.demand.company}${p.demand.title ? " — " + p.demand.title : ""}`,
      `WHY NOW: "${p.demand.why_now}"`,
      `KEYWORDS: ${(p.demand.keywords || []).join(", ") || "none"}`,
      `PROOF: ${p.demand.proof || "none"}`,
      `CONSTRAINTS: ${(p.demand.constraints || []).join(", ") || "none"}`,
      `SUPPLY: "${p.supply.company}" (${p.supply.industry || "unknown"}) offers "${p.supply.offers}"`,
      `WHO: ${p.supply.who || p.supply.company}${p.supply.title ? " — " + p.supply.title : ""}`,
      `KEYWORDS: ${(p.supply.keywords || []).join(", ") || "none"}`,
      `PROOF: ${p.supply.proof || "none"}`,
      "",
    );
  }
  return lines.join("\n");
}

// =============================================================================
// REASONING-ONLY PROMPT BUILDER (Phase 2)
// =============================================================================

function buildReasoningOnlyPrompt(pairs: ReasoningPair[]): string {
  const lines: string[] = [
    `Generate reasoning, risks, classification, and framing for these ${pairs.length} pre-scored pairs.\n`,
    `Each pair has already been scored. Your job is to explain WHY the score is correct (or flag if you disagree). Focus on specifics.\n`,
  ];
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    const scores = p.existingScores || { fit: 0, timing: 0, combined: 0 };
    lines.push(
      `[${i + 1}] id: ${p.evalId}`,
      `PRE-SCORED: fit=${scores.fit.toFixed(2)}, timing=${scores.timing.toFixed(2)}, combined=${scores.combined.toFixed(3)}`,
      `DEMAND: "${p.demand.company}" (${p.demand.industry || "unknown"}) wants "${p.demand.wants}"`,
      `WHO: ${p.demand.who || p.demand.company}${p.demand.title ? " — " + p.demand.title : ""}`,
      `WHY NOW: "${p.demand.why_now}"`,
      `KEYWORDS: ${(p.demand.keywords || []).join(", ") || "none"}`,
      `PROOF: ${p.demand.proof || "none"}`,
      `CONSTRAINTS: ${(p.demand.constraints || []).join(", ") || "none"}`,
      `SUPPLY: "${p.supply.company}" (${p.supply.industry || "unknown"}) offers "${p.supply.offers}"`,
      `WHO: ${p.supply.who || p.supply.company}${p.supply.title ? " — " + p.supply.title : ""}`,
      `KEYWORDS: ${(p.supply.keywords || []).join(", ") || "none"}`,
      `PROOF: ${p.supply.proof || "none"}`,
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
// BANNED PHRASE ENFORCEMENT (deterministic, server-side)
// =============================================================================

const BANNED_PHRASES = [
  "aligns well with",
  "aligning well",
  "align with",
  "aligned with",
  "specializes in",
  "well-positioned to",
  "well-suited",
  "strong alignment",
  "synergy",
  "synergize",
  "leveraging",
  "leverage",
  "expertise aligns",
  "making them a",
  "making them an",
  "operational scope",
  "functional requirements",
  "directly addressing",
  "ideally positioned",
  "comprehensive",
  "robust",
  "holistic",
  "dynamic",
];

function sanitizeBannedPhrases(text: string): string {
  if (!text) return text;
  let result = text;
  for (const phrase of BANNED_PHRASES) {
    // Case-insensitive replacement — remove the banned phrase and clean up
    const regex = new RegExp(phrase, "gi");
    result = result.replace(regex, "");
  }
  // Clean up double spaces and leading/trailing whitespace
  return result.replace(/\s{2,}/g, " ").replace(/\s+([.,;])/g, "$1").trim();
}

// =============================================================================
// PARSE + CLASSIFY (server-side score computation)
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
    const raw_parsed = JSON.parse(cleaned);
    // Handle single object response — wrap in array
    if (raw_parsed && !Array.isArray(raw_parsed) && typeof raw_parsed === "object") {
      // Check if it's a wrapper like {"results": [...]} or {"picks": [...]}
      const arrKey = Object.keys(raw_parsed).find(k => Array.isArray(raw_parsed[k]));
      if (arrKey) {
        parsed = raw_parsed[arrKey];
      } else if ("id" in raw_parsed || "fit" in raw_parsed) {
        // Single eval result object — wrap in array
        parsed = [raw_parsed];
      } else {
        parsed = [raw_parsed];
      }
    } else {
      parsed = raw_parsed;
    }
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
    const rawFraming = typeof r.framing === "string" ? r.framing.slice(0, 300) : "";
    const rawReasoning = typeof r.reasoning === "string"
      ? r.reasoning.slice(0, 500)
      : "No reasoning provided";
    const framing = sanitizeBannedPhrases(rawFraming);
    const reasoning = sanitizeBannedPhrases(rawReasoning);

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

  // Cerebras primary — gpt-oss-120b at ~2900 t/s (wafer-scale chip)
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
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.3,
          response_format: { type: "json_object" },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || "";
        // Validate: must contain a JSON array with at least one object with "fit" field
        if (content && content.includes('"fit"') && content.includes("[")) {
          console.log(`[worker] Cerebras reasoning done: ${data.usage?.total_tokens || '?'} tokens`);
          return { status: 200, content };
        }
        console.log(`[worker] Cerebras returned 200 but no valid eval array (${content.length} chars), falling back`);
      } else {
        console.log(`[worker] Cerebras returned ${res.status}, falling back`);
      }
    } catch (e) {
      console.log(`[worker] Cerebras error: ${(e as Error).message}, falling back`);
    }
  }

  // Groq fallback — gpt-oss-120b at 500 t/s
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
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.3,
          response_format: { type: "json_object" },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || "";
        if (content && content.includes('"fit"') && content.includes("[")) {
          console.log(`[worker] Groq reasoning done: ${data.usage?.total_tokens || '?'} tokens`);
          return { status: 200, content };
        }
        console.log(`[worker] Groq returned 200 but no valid eval array (${content.length} chars), falling back to BYOK`);
      } else {
        console.log(`[worker] Groq returned ${res.status}, falling back to BYOK`);
      }
    } catch (e) {
      console.log(`[worker] Groq error: ${(e as Error).message}, falling back to BYOK`);
    }
  }

  // BYOK fallback
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
// MAIN HANDLER — Worker: evaluate shard + write to DB
// =============================================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  // Read body as text first for QStash signature verification
  const rawBody = await req.text();

  // Verify QStash signature if present (using HMAC-SHA256)
  const signature = req.headers.get("Upstash-Signature");
  if (signature) {
    const currentSigningKey = Deno.env.get("QSTASH_CURRENT_SIGNING_KEY");
    if (currentSigningKey) {
      try {
        // QStash JWT signature — decode and verify
        const [headerB64, payloadB64, sigB64] = signature.split(".");
        const payload = JSON.parse(atob(payloadB64));
        // Check expiry
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
          throw new Error("Signature expired");
        }
        // Check body hash matches
        const bodyHash = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(rawBody),
        );
        const bodyHashB64 = btoa(String.fromCharCode(...new Uint8Array(bodyHash)));
        if (payload.body !== bodyHashB64) {
          throw new Error("Body hash mismatch");
        }
        console.log("[worker] QStash signature verified");
      } catch (err) {
        console.error("[worker] QStash signature check failed:", (err as Error).message);
        // Log but don't reject — allow processing to continue
        // QStash retries on non-200, so rejecting valid messages is worse than accepting unverified ones
      }
    }
  }

  try {
    const body: RequestBody = JSON.parse(rawBody);
    const pairs = body.pairs;
    const jobId = body.jobId;
    const aiConfig = body.aiConfig || body.ai;
    const shardIndex = body.shardIndex;
    const mode = body.mode || "full";

    console.log(
      `[worker] Shard ${shardIndex ?? '?'}: ${pairs?.length || 0} pairs, job=${jobId}, mode=${mode}`,
    );

    if (!pairs || pairs.length === 0) {
      return new Response(
        JSON.stringify({ succeeded: 0, failed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Validate AI config
    const aiError = validateAIConfig(aiConfig!);
    if (aiError) {
      console.error(`[worker] AI config error: ${aiError.message}`);
      return new Response(
        JSON.stringify({ succeeded: 0, failed: pairs.length, error: aiError.message }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build prompt based on mode
    const userPrompt = mode === "reasoning_only"
      ? buildReasoningOnlyPrompt(pairs as ReasoningPair[])
      : buildBatchedUserPrompt(pairs);

    let result = await callBYOK(aiConfig!, SYSTEM_PROMPT, userPrompt, pairs.length);

    // Retry once on non-200
    if (result.status !== 200) {
      console.log(`[worker] First attempt failed (${result.status}), retrying...`);
      result = await callBYOK(aiConfig!, SYSTEM_PROMPT, userPrompt, pairs.length);
    }

    if (result.status !== 200) {
      console.error(`[worker] AI call failed: ${result.status}`);
      if (shardIndex !== undefined) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const sb = createClient(supabaseUrl, supabaseServiceKey);
        await sb.from("mcp_shards")
          .update({ status: "failed", error: `AI returned ${result.status}`, completed_at: new Date().toISOString() })
          .eq("job_id", jobId).eq("shard_index", shardIndex);
      }
      return new Response(
        JSON.stringify({ succeeded: 0, failed: pairs.length, error: `AI returned ${result.status}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Parse response
    let results = parseBatchedResponse(result.content, pairs);

    // Retry once on total parse failure
    const allParseErrors = results.every((r) => r.error?.startsWith("PARSE_ERROR"));
    if (allParseErrors) {
      console.log("[worker] Total parse failure, retrying...");
      const retry = await callBYOK(aiConfig!, SYSTEM_PROMPT, userPrompt, pairs.length);
      if (retry.status === 200) {
        const retryResults = parseBatchedResponse(retry.content, pairs);
        if (!retryResults.every((r) => r.error?.startsWith("PARSE_ERROR"))) {
          results = retryResults;
        }
      }
    }

    // Write results to mcp_evaluations via service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let succeeded = 0;
    let failed = 0;

    if (mode === "reasoning_only") {
      // ═══ REASONING-ONLY MODE (Phase 2) ═══
      // UPDATE existing scored rows — add reasoning, framing, risks, classification
      // Preserve existing scores, set eval_status = 'reasoned'
      for (const r of results) {
        const reasoningPair = (pairs as ReasoningPair[]).find((p) => p.evalId === r.evalId);
        const existingScores = reasoningPair?.existingScores || r.scores;

        const { error: updateErr } = await supabase
          .from("mcp_evaluations")
          .update({
            reasoning: r.reasoning,
            framing: r.framing,
            risks: r.risks,
            classification: r.classification,
            readiness: r.readiness,
            // Preserve pre-computed scores from Phase 1
            scores: existingScores,
            eval_status: "reasoned",
            evaluated_at: new Date().toISOString(),
          })
          .eq("job_id", jobId)
          .eq("eval_id", r.evalId);

        if (updateErr) {
          console.error(`[worker] Update error for ${r.evalId}: ${updateErr.message}`);
          failed++;
        } else {
          succeeded++;
        }
      }
    } else {
      // ═══ FULL MODE (legacy V5 / single-phase) ═══
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
          eval_status: "reasoned",
          evaluated_at: new Date().toISOString(),
        };
      });

      const { error: upsertError } = await supabase
        .from("mcp_evaluations")
        .upsert(rows, { onConflict: "eval_id,job_id" });

      if (upsertError) {
        console.error(`[worker] Upsert error: ${upsertError.message}`);
        failed = results.length;
      } else {
        succeeded = results.filter((r) => !r.error).length;
        failed = results.filter((r) => !!r.error).length;
      }
    }

    // Complete shard + derive job progress from truth (one transaction)
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
          console.log(`[worker] Job ${jobId}: ${rpcResult[0].completed_pairs} pairs, status=${rpcResult[0].job_status}`);
        }
      }
    }

    console.log(`[worker] Shard ${shardIndex ?? '?'} done (${mode}): ${succeeded} ok, ${failed} failed`);

    return new Response(
      JSON.stringify({ succeeded, failed }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[worker] Fatal:", error);
    return new Response(
      JSON.stringify({ succeeded: 0, failed: 0, error: (error as Error).message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
