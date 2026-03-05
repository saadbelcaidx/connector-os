import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * DMCB-EXTRACT — Canonical Intent Extraction Edge Function (Phase 37)
 *
 * Given raw demand/supply records, extracts canonical intent objects via AI.
 * Provider-agnostic: reuses ai-proxy credential pattern (client sends keys).
 * Always returns 200 with per-item results/errors — never 401/404.
 *
 * Batch-safe: up to 25 items per request.
 * Non-blocking: if one item fails, others still succeed.
 * Per-item isolation: each item gets its own try/catch.
 *
 * V2 additions:
 *   - Redis per-item caching (24hr TTL) — re-runs are instant
 *   - Groq primary model (llama-3.3-70b-versatile) with Azure fallback
 */

import { redis } from "../_shared/redis.ts";

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// =============================================================================
// TYPES
// =============================================================================

interface RawItem {
  id: string;
  side: "demand" | "supply";
  raw: unknown;
  context?: string;  // operator's dataset description for AI interpretation
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

interface Canonical {
  domain: string | null;
  company: string | null;
  who: string;
  wants: string;
  offers: string;
  role: "demand" | "supply";
  why_now: string;
  constraints: string[];
  proof: string;
  confidence: number;
  industry: string | null;
  title: string | null;
  seniority: string | null;
  keywords: string[];
  entity_type: "person" | "organization";
}

interface ItemResult {
  id: string;
  canonical?: Canonical;
  error?: { code: string; message: string };
}

interface RequestBody {
  items: RawItem[];
  ai: AIConfig;
}

// =============================================================================
// AI PROVIDER CALLS (same pattern as mcp-enhance)
// =============================================================================

async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
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
      max_tokens: 260,
      temperature: 0.2,
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
  userPrompt: string
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
      max_tokens: 260,
      temperature: 0.2,
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
  userPrompt: string
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
      max_tokens: 260,
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
// GROQ INFERENCE (primary extraction model — faster, free tier)
// =============================================================================

async function callGroq(
  systemPrompt: string,
  userPrompt: string,
): Promise<{ status: number; content: string }> {
  if (!GROQ_API_KEY) {
    return { status: 0, content: "GROQ_API_KEY not set" };
  }
  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    },
  );
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

// =============================================================================
// PAYLOAD BOUNDARY — safeSerializeForLLM
// Prunes object BEFORE serialization. Always valid JSON. No broken syntax.
// =============================================================================

function safeSerializeForLLM(obj: unknown, maxChars = 1500): string {
  const fullJson = JSON.stringify(obj ?? null);
  if (obj === null || obj === undefined || typeof obj !== "object") return fullJson;
  if (fullJson.length <= maxChars) return fullJson;

  if (Array.isArray(obj)) {
    const kept: unknown[] = [];
    let size = 2;
    for (const item of obj) {
      const s = JSON.stringify(item);
      const oh = kept.length === 0 ? 0 : 1;
      if (size + s.length + oh > maxChars) continue;
      kept.push(item);
      size += s.length + oh;
    }
    return JSON.stringify(kept);
  }

  const kept: Record<string, unknown> = {};
  let size = 2;
  let fc = 0;
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    const ks = JSON.stringify(key);
    const vs = JSON.stringify(value);
    const ps = ks.length + 1 + vs.length;
    const oh = fc === 0 ? 0 : 1;
    if (size + ps + oh > maxChars) continue;
    kept[key] = value;
    size += ps + oh;
    fc++;
  }
  return JSON.stringify(kept);
}

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

function buildSystemPrompt(side: "demand" | "supply", context?: string): string {
  let prompt: string;
  if (side === "supply") {
    prompt = `You are a canonicalizer. Given an untrusted JSON blob representing a supply record, infer identity and capability. Return JSON exactly matching this schema: {domain: string|null, company: string|null, who: string, offers: string, why_now: string, constraints: string[], proof: string, confidence: number, industry: string|null, title: string|null, seniority: string|null, keywords: string[], entity_type: "person"|"organization"}.

"entity_type" = classify the primary entity. "person" if the record is centered on an individual (has person name, job title, personal details as subject). "organization" if centered on a company/firm/institution. Default to "organization" when ambiguous.
"who" = the primary person associated with this record. If the record contains a person name (in fields like name, founder_identifiers, contact_name, first_name/last_name, or similar), use it as "Firstname Lastname". If no person name exists, use the company name. Never fabricate names. Never use generic labels like "Founders" or "Team".
"offers" = the economic capability or monetization role this company provides. This is NOT a description of the company. It describes what they deliver to clients — the transaction, advisory, or management function they perform. Output as a 2–4 word plain phrase. Use everyday language. No verbs. Banned words: "Services", "Solutions", "Specialized", "End-To-End", "Strategic". Good: "Wealth Advisory", "M&A Advisory", "Portfolio Management", "Executive Recruiting". Bad: "Full-Service Financial Planning Solutions", "Specialized Talent Acquisition Services".
"industry" = the company's primary industry. Extract from the 'industries' or 'industry' field in the raw data. If not present, infer from company description. Examples: Biotechnology, Pharmaceuticals, Clinical Research, Recruiting & Staffing, IT Services.
"title" = the person's current job title. Extract verbatim from 'title' or 'job_title' field. Examples: Global VP Business Development, Director of Recruiting, Head of Clinical Operations.
"seniority" = seniority level. Extract from 'seniorityLevel' or 'seniority_level'. Normalize to exactly one of: Executive, VP, Director, Manager, IC.
"keywords" = 3-8 capability keywords. Extract from 'keywords' field if present. Otherwise extract from expertise or description. Examples: ["clinical trial management", "regulatory submissions", "FDA experience"].

Use Title Case for all string field values (e.g. "Talent Acquisition", not "talent acquisition"; "Active Hiring", not "active hiring").

Prefer domain and company when present in any field. If uncertain, set domain/company null, reduce confidence. No prose, only valid JSON.`;
  } else {
    prompt = `You are a canonicalizer. Given an untrusted JSON blob representing a demand record, infer identity and intent. Return JSON exactly matching this schema: {domain: string|null, company: string|null, who: string, wants: string, why_now: string, constraints: string[], proof: string, confidence: number, industry: string|null, title: string|null, seniority: string|null, keywords: string[], entity_type: "person"|"organization"}.

"entity_type" = classify the primary entity. "person" if the record is centered on an individual (has person name, job title, personal details as subject). "organization" if centered on a company/firm/institution. Default to "organization" when ambiguous.
"who" = the primary person associated with this record. If the record contains a person name (in fields like name, founder_identifiers, contact_name, first_name/last_name, or similar), use it as "Firstname Lastname". If no person name exists, use the company name. Never fabricate names. Never use generic labels like "Founders" or "Team".

Before generating "wants", classify the company's dominant intent (do NOT output the classification — use it internally to guide "wants"):
1. Transactional (buy/sell/raise/merge/exit)
2. Hiring (adding capability via people)
3. Operational (improving or running a function)
4. Advisory (seeking expertise or guidance)
5. Product/Service Execution (core business activity)

"wants" = the economic outcome or business objective this company is actively pursuing, written as a 2–4 word plain phrase grounded in the intent classification above. This is NOT a job title and NOT a person. No verbs. Use everyday language. Banned words: "Services", "Solutions", "Specialized", "End-To-End", "Strategic". Prefer the specific asset class, activity, or vertical over generic finance words. The phrase must directly exist or logically derive from the company's activity, industry, or signal. If it introduces a generic financial concept (e.g. "Investment Opportunities", "Growth Capital") not supported by input evidence, regenerate with the specific asset or activity instead. Good: "Real Estate Investment", "Acquisition Targets", "Exit Advisory", "Cybersecurity Talent", "Clinical Trial Oversight". Bad: "Financial Leader", "Investment Opportunities", "Strategic Hiring Solutions".
"industry" = the company's primary industry. Extract from the 'industries' or 'industry' field in the raw data. If not present, infer from company description. Examples: Biotechnology, Pharmaceuticals, Clinical Research, Recruiting & Staffing, IT Services.
"title" = the role being hired for. Extract verbatim from 'title' or 'job_title' field. Examples: Head of Clinical Operations, VP Business Development, Director of Recruiting.
"seniority" = seniority level. Extract from 'seniorityLevel' or 'seniority_level'. Normalize to exactly one of: Executive, VP, Director, Manager, IC.
"keywords" = 3-8 requirement keywords. Extract from job requirements or role description. Examples: ["biostatistics", "SAS/R", "Phase III", "FDA submission"].

Use Title Case for all string field values (e.g. "Talent Acquisition", not "talent acquisition"; "Active Hiring", not "active hiring").

Prefer domain and company when present in any field. If uncertain, set domain/company null, reduce confidence. No prose, only valid JSON.`;
  }

  if (context) {
    prompt += `\n\nDATASET CONTEXT (HIGH PRIORITY):\n\nThe operator curated this ${side} dataset for the following purpose:\n"${context}"\n\nInterpret every company THROUGH this lens.\n\nIf company descriptions are generic or ambiguous, prefer interpretations consistent with this context.\n\nDo not copy the wording directly. Use it only to disambiguate intent and specialization.`;
  }

  return prompt;
}

// =============================================================================
// PARSE + VALIDATE AI RESPONSE
// =============================================================================

function parseAndValidate(raw: string, side: "demand" | "supply"): {
  canonical: Canonical | null;
  error: { code: string; message: string } | null;
} {
  try {
    let cleaned = raw.trim();
    // Strip markdown code fences if present
    if (cleaned.startsWith("```")) {
      cleaned = cleaned
        .replace(/^```(?:json)?\n?/, "")
        .replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(cleaned);

    // Validate and extract fields with truncation
    const domain =
      typeof parsed.domain === "string" ? parsed.domain : null;
    const company =
      typeof parsed.company === "string" ? parsed.company : null;
    const who =
      typeof parsed.who === "string"
        ? parsed.who.slice(0, 120)
        : "";
    const wants =
      typeof parsed.wants === "string" ? parsed.wants : "";
    const offers =
      typeof parsed.offers === "string" ? parsed.offers : "";
    const why_now =
      typeof parsed.why_now === "string"
        ? parsed.why_now.slice(0, 180)
        : "";

    // Validate constraints: max 6 items, each <= 60 chars
    let constraints: string[] = [];
    if (Array.isArray(parsed.constraints)) {
      constraints = parsed.constraints
        .filter((c: unknown) => typeof c === "string")
        .slice(0, 6)
        .map((c: string) => c.slice(0, 60));
    }

    const proof =
      typeof parsed.proof === "string"
        ? parsed.proof.slice(0, 200)
        : "";

    // Validate confidence: must be 0-1
    let confidence = 0.5;
    if (typeof parsed.confidence === "number") {
      confidence = Math.max(0, Math.min(1, parsed.confidence));
    }

    // New fields: industry, title, seniority, keywords
    const industry =
      typeof parsed.industry === "string" && parsed.industry.trim()
        ? parsed.industry.trim().slice(0, 100)
        : null;
    const title =
      typeof parsed.title === "string" && parsed.title.trim()
        ? parsed.title.trim().slice(0, 120)
        : null;

    let seniority: string | null = null;
    if (typeof parsed.seniority === "string" && parsed.seniority.trim()) {
      const raw = parsed.seniority.trim();
      const valid = ["Executive", "VP", "Director", "Manager", "IC"];
      const matched = valid.find(
        (v) => raw.toLowerCase().includes(v.toLowerCase()),
      );
      seniority = matched || raw.slice(0, 30);
    }

    let keywords: string[] = [];
    if (Array.isArray(parsed.keywords)) {
      keywords = parsed.keywords
        .filter((k: unknown): k is string => typeof k === "string" && k.trim().length > 0)
        .slice(0, 8)
        .map((k: string) => k.trim().slice(0, 60));
    }

    // Entity type: default to "organization" if missing or invalid
    const entity_type: "person" | "organization" =
      parsed.entity_type === "person" ? "person" : "organization";

    // Role-aware intent validation
    if (side === "demand" && wants.length < 8) {
      return {
        canonical: null,
        error: {
          code: "BAD_JSON",
          message: "AI extraction produced insufficient intent (wants)",
        },
      };
    }
    if (side === "supply" && offers.length < 8) {
      return {
        canonical: null,
        error: {
          code: "BAD_JSON",
          message: "AI extraction produced insufficient capability (offers)",
        },
      };
    }

    return {
      canonical: {
        domain,
        company,
        who,
        wants,
        offers,
        role: side,
        why_now,
        constraints,
        proof,
        confidence,
        industry,
        title,
        seniority,
        keywords,
        entity_type,
      },
      error: null,
    };
  } catch {
    return {
      canonical: null,
      error: {
        code: "BAD_JSON",
        message: "Failed to parse AI response as JSON",
      },
    };
  }
}

// =============================================================================
// VALIDATE AI CONFIG — check required keys per provider
// =============================================================================

function validateAIConfig(
  ai: AIConfig
): { code: string; message: string } | null {
  if (!ai || !ai.provider) {
    return {
      code: "AI_SETUP_INCOMPLETE",
      message: "No provider configured",
    };
  }

  if (ai.provider === "openai") {
    if (!ai.openaiApiKey) {
      return {
        code: "AI_SETUP_INCOMPLETE",
        message: "Missing openaiApiKey",
      };
    }
  } else if (ai.provider === "azure") {
    if (!ai.azureApiKey || !ai.azureEndpoint || !ai.azureChatDeployment) {
      return {
        code: "AI_SETUP_INCOMPLETE",
        message:
          "Missing Azure config (azureApiKey, azureEndpoint, azureChatDeployment)",
      };
    }
  } else if (ai.provider === "anthropic") {
    if (!ai.anthropicApiKey) {
      return {
        code: "AI_SETUP_INCOMPLETE",
        message: "Missing anthropicApiKey",
      };
    }
  } else {
    return {
      code: "AI_SETUP_INCOMPLETE",
      message: `Unknown provider: ${ai.provider}`,
    };
  }

  return null;
}

// =============================================================================
// PROCESS SINGLE ITEM
// =============================================================================

async function processItem(
  item: RawItem,
  ai: AIConfig
): Promise<ItemResult> {
  // ── Redis cache check ──────────────────────────────────────────────
  const cacheKey = `dmcb:extract:${item.id}`;
  try {
    const cached = await redis.get<Canonical>(cacheKey);
    if (cached && typeof cached === "object" && (cached as Canonical).who) {
      return { id: item.id, canonical: cached as Canonical };
    }
  } catch (e) {
    // Cache miss or Redis unavailable — continue with extraction
    console.log(`[dmcb-extract] Cache miss for ${item.id}: ${(e as Error).message}`);
  }

  const systemPrompt = buildSystemPrompt(item.side, item.context);
  const userPrompt = safeSerializeForLLM(item.raw, 1500);
  const model =
    ai.model ||
    (ai.provider === "anthropic" ? "claude-haiku-4-5-20251001" : "gpt-4o-mini");

  // ── Groq-first, then BYOK fallback ────────────────────────────────
  async function callAI(): Promise<{ status: number; content: string }> {
    // Try Groq first (faster, free tier)
    if (GROQ_API_KEY) {
      try {
        const groqResult = await callGroq(systemPrompt, userPrompt);
        if (groqResult.status === 200) {
          return groqResult;
        }
        console.log(`[dmcb-extract] Groq failed (${groqResult.status}), falling back to ${ai.provider}`);
      } catch (e) {
        console.log(`[dmcb-extract] Groq error, falling back: ${(e as Error).message}`);
      }
    }

    // Fallback to configured provider
    if (ai.provider === "openai") {
      return callOpenAI(ai.openaiApiKey!, model, systemPrompt, userPrompt);
    } else if (ai.provider === "azure") {
      return callAzure(
        ai.azureEndpoint!,
        ai.azureApiKey!,
        ai.azureChatDeployment!,
        systemPrompt,
        userPrompt
      );
    } else {
      return callAnthropic(ai.anthropicApiKey!, model, systemPrompt, userPrompt);
    }
  }

  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await callAI();

      // Upstream errors — no retry
      if (result.status !== 200) {
        if (result.status === 429) {
          return {
            id: item.id,
            error: {
              code: "RATE_LIMITED",
              message: `Provider returned 429: ${result.content}`,
            },
          };
        }
        return {
          id: item.id,
          error: {
            code: "UPSTREAM_ERROR",
            message: `Provider returned ${result.status}: ${result.content}`,
          },
        };
      }

      // Parse and validate the AI response
      const { canonical, error } = parseAndValidate(result.content, item.side);

      // Parse/validation error — no retry
      if (!canonical) {
        return { id: item.id, error: error! };
      }

      // Identity check: company AND domain both missing (null or empty string)
      if (!canonical.company && !canonical.domain) {
        if (attempt === 1) {
          // Retry once — AI non-determinism
          console.log(
            `[dmcb-extract] Retry ${item.id}: identity missing on attempt 1`
          );
          continue;
        }
        // Second attempt also failed identity — quarantine
        return {
          id: item.id,
          error: {
            code: "IDENTITY_EXTRACTION_FAILED",
            message: "AI could not extract company or domain after retry",
          },
        };
      }

      // ── Cache successful extraction (24hr TTL) ──────────────────────
      try {
        await redis.set(cacheKey, canonical, { ex: 86400 });
      } catch {
        // Cache write failure is non-fatal
      }

      return { id: item.id, canonical };
    }

    // Unreachable — loop always returns
    return {
      id: item.id,
      error: { code: "UPSTREAM_ERROR", message: "Unexpected flow" },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return {
      id: item.id,
      error: {
        code: "UPSTREAM_ERROR",
        message: msg.slice(0, 200),
      },
    };
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

Deno.serve(async (req: Request) => {
  // CORS preflight — MUST return 200 before reading req.json()
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  try {
    const body: RequestBody = await req.json();

    console.log(
      "[dmcb-extract] Request:",
      JSON.stringify({
        itemCount: body.items?.length,
        provider: body.ai?.provider || "none",
      })
    );

    // No items → empty array
    if (!body.items || !Array.isArray(body.items)) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate AI config once (applies to all items)
    const aiError = validateAIConfig(body.ai);

    // Validate items first, then process valid ones in parallel
    const toProcess: { index: number; item: RawItem }[] = [];
    const results: ItemResult[] = new Array(body.items.length);

    for (let i = 0; i < body.items.length; i++) {
      const rawItem = body.items[i];

      if (i >= 25) {
        results[i] = {
          id: (rawItem as RawItem)?.id || `unknown_${i}`,
          error: { code: "BATCH_LIMIT", message: `Item at index ${i} exceeds batch limit of 25` },
        };
        continue;
      }

      if (!rawItem || typeof rawItem !== "object" || typeof rawItem.id !== "string" || !rawItem.id) {
        results[i] = {
          id: (rawItem as any)?.id || `unknown_${i}`,
          error: { code: "BAD_JSON", message: `items[${i}]: missing or invalid id` },
        };
        continue;
      }

      if (rawItem.side !== "demand" && rawItem.side !== "supply") {
        results[i] = {
          id: rawItem.id,
          error: { code: "BAD_JSON", message: `items[${i}]: side must be "demand" or "supply"` },
        };
        continue;
      }

      if (aiError) {
        results[i] = { id: rawItem.id, error: aiError };
        continue;
      }

      toProcess.push({ index: i, item: rawItem });
    }

    // Process items with concurrency limit (8 at a time)
    const CONCURRENCY = 8;
    for (let c = 0; c < toProcess.length; c += CONCURRENCY) {
      const chunk = toProcess.slice(c, c + CONCURRENCY);
      const processed = await Promise.all(
        chunk.map(({ index, item }) =>
          processItem(item, body.ai).then((r) => ({ index, result: r }))
        )
      );
      for (const { index, result } of processed) {
        results[index] = result;
      }
    }

    console.log(
      "[dmcb-extract] Processed:",
      results.length,
      "items,",
      results.filter((r) => r.canonical).length,
      "succeeded"
    );

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[dmcb-extract] Fatal:", error);
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
