import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import pLimit from "npm:p-limit@5.0.0";
import { redis } from "../_shared/redis.ts";
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

interface AIConfig {
  provider: "openai" | "azure" | "anthropic";
  openaiApiKey?: string;
  azureApiKey?: string;
  azureEndpoint?: string;
  azureChatDeployment?: string;
  anthropicApiKey?: string;
  model?: string;
}

interface OrchestrateRequest {
  jobId: string;
  demandKeys: string[];
  supplyKeys: string[];
  fulfillmentKey?: string;           // @deprecated — use clientKey (REPLACE semantics)
  fulfillmentSide?: "demand" | "supply"; // @deprecated — use clientSide
  clientKey?: string;                // Client canonical key — APPENDED to the correct side
  clientSide?: "demand" | "supply";  // Which side to append clientKey to
  aiConfig: AIConfig;
  topK?: number;
}

interface CanonicalRow {
  record_key: string;
  canonical: {
    role?: string;
    who?: string;
    wants?: string;
    offers?: string;
    why_now?: string;
    constraints?: string[];
    company?: string;
    domain?: string;
    confidence?: number;
    industry?: string;
    keywords?: string[];
    proof?: string;
    title?: string;
    seniority?: string;
    entity_type?: string;
  };
}

interface CandidatePair {
  demandKey: string;
  supplyKey: string;
  similarity: number;
  rank: number;
}

interface EvalInput {
  evalId: string;
  demandKey: string;
  supplyKey: string;
  demand: {
    company: string;
    who: string;
    wants: string;
    industry: string;
    why_now: string;
    keywords: string[];
    proof: string;
    title: string;
    constraints: string[];
  };
  supply: {
    company: string;
    who: string;
    offers: string;
    industry: string;
    keywords: string[];
    proof: string;
    title: string;
  };
  similarity: number;
  rank: number;
}

interface ScoredResult extends EvalInput {
  fit: number;
  timing: number;
  combined: number;
  vetoed: boolean;
  vetoReason: string | null;
}

// =============================================================================
// HELPERS
// =============================================================================

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    h = ((h << 5) - h) + char;
    h = h & h;
  }
  return Math.abs(h).toString(36);
}

/** SHA-256 content hash of sorted record keys — stable across runs for same dataset */
async function datasetHash(recordKeys: string[]): Promise<string> {
  const sorted = [...recordKeys].sort();
  const payload = JSON.stringify(sorted);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function classifyDirect(combined: number, vetoed: boolean): string {
  if (vetoed) return "HARD_DROP";
  if (combined >= 0.50) return "PASS";
  if (combined >= 0.30) return "MARGINAL";
  return "QUARANTINE";
}

function readinessDirect(combined: number, fit: number): string {
  if (combined >= 0.65 && fit >= 0.65) return "READY";
  if (combined >= 0.4) return "WARMING";
  return "NOT_YET";
}

// =============================================================================
// PHASE 1: EMBED (if not cached)
// =============================================================================

/**
 * phaseEmbed — uses a STABLE embedJobId (content hash) so embeddings persist across runs.
 * Returns the embedJobId so callers can read embeddings by that key.
 */
async function phaseEmbed(
  supabase: ReturnType<typeof createClient>,
  canonicals: CanonicalRow[],
): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const allKeys = canonicals.map((c) => c.record_key);

  // Stable embed key: SHA-256 of sorted record keys — same dataset = same key forever
  const hash = await datasetHash(allKeys);
  const embedJobId = `embed-${hash}`;
  const redisFlagKey = `embed_done:${hash}`;

  // Fast path: Redis flag means all embeddings exist under embedJobId
  const embedCached = await redis.get(redisFlagKey);
  if (embedCached) {
    console.log(`[embed] All ${allKeys.length} cached (Redis flag, embedJobId=${embedJobId})`);
    return embedJobId;
  }

  // Slow path: check DB for missing embeddings
  const { data: existingRows } = await supabase
    .from("signal_embeddings")
    .select("record_key")
    .eq("job_id", embedJobId)
    .in("record_key", allKeys);

  const existingKeys = new Set((existingRows || []).map((r: { record_key: string }) => r.record_key));
  const missing = canonicals.filter((c) => !existingKeys.has(c.record_key));

  if (missing.length === 0) {
    console.log(`[embed] All ${allKeys.length} cached (DB check, embedJobId=${embedJobId})`);
    await redis.set(redisFlagKey, "done", { ex: 2592000 }); // 30 days
    return embedJobId;
  }

  console.log(`[embed] ${missing.length} missing (${existingKeys.size} cached, embedJobId=${embedJobId})`);

  const demand = missing.filter((c) => (c.canonical.role || "demand") === "demand");
  const supply = missing.filter((c) => (c.canonical.role || "demand") === "supply");

  const EMBED_URL = `${supabaseUrl}/functions/v1/embed-signals`;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CHUNK = 100;
  let embedSuccess = true;

  for (let i = 0; i < demand.length; i += CHUNK) {
    const ch = demand.slice(i, i + CHUNK);
    const res = await fetch(EMBED_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        signals: ch.map((c) => ({
          record_key: c.record_key,
          text: `${c.canonical.wants || ""} ${c.canonical.why_now || ""}`.trim(),
        })),
        jobId: embedJobId,
        side: "demand",
      }),
    });
    const data = await res.json();
    if (data.error) {
      console.error(`[embed] Demand error: ${data.error}`);
      embedSuccess = false;
    }
  }

  for (let i = 0; i < supply.length; i += CHUNK) {
    const ch = supply.slice(i, i + CHUNK);
    const res = await fetch(EMBED_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        signals: ch.map((c) => ({
          record_key: c.record_key,
          text: c.canonical.offers || c.canonical.wants || "",
        })),
        jobId: embedJobId,
        side: "supply",
      }),
    });
    const data = await res.json();
    if (data.error) {
      console.error(`[embed] Supply error: ${data.error}`);
      embedSuccess = false;
    }
  }

  // Only cache success — failed embeds must retry next run
  if (embedSuccess) {
    await redis.set(redisFlagKey, "done", { ex: 2592000 });
  }
  return embedJobId;
}

// =============================================================================
// MOVE 1: PRE-COMPUTE SIMILARITY MATRIX
// =============================================================================

function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function parseEmbedding(raw: unknown): number[] | null {
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return null;
}

async function precomputeSimilarityMatrix(
  supabase: ReturnType<typeof createClient>,
  embedJobId: string,
  demandKeys: string[],
  supplyKeys: string[],
): Promise<void> {
  // Cache key uses embedJobId (content hash) — stable across runs
  const cacheKey = `simmatrix:${embedJobId}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    console.log("[matrix] Already computed, skipping");
    return;
  }

  const total = demandKeys.length * supplyKeys.length;
  console.log(`[matrix] Computing ${demandKeys.length}×${supplyKeys.length} = ${total} cosine scores`);

  // Fetch all demand embeddings in one query (using stable embedJobId)
  const { data: demandRows, error: dErr } = await supabase
    .from("signal_embeddings")
    .select("record_key, embedding")
    .eq("job_id", embedJobId)
    .eq("side", "demand")
    .in("record_key", demandKeys);

  if (dErr) throw new Error(`Fetch demand embeddings: ${dErr.message}`);

  // Fetch all supply embeddings in one query
  const { data: supplyRows, error: sErr } = await supabase
    .from("signal_embeddings")
    .select("record_key, embedding")
    .eq("job_id", embedJobId)
    .eq("side", "supply")
    .in("record_key", supplyKeys);

  if (sErr) throw new Error(`Fetch supply embeddings: ${sErr.message}`);

  // Parse embeddings
  const demandEmbs: Array<{ key: string; emb: number[] }> = [];
  for (const row of (demandRows || [])) {
    const emb = parseEmbedding(row.embedding);
    if (emb) demandEmbs.push({ key: row.record_key, emb });
  }

  const supplyEmbs: Array<{ key: string; emb: number[] }> = [];
  for (const row of (supplyRows || [])) {
    const emb = parseEmbedding(row.embedding);
    if (emb) supplyEmbs.push({ key: row.record_key, emb });
  }

  console.log(`[matrix] Loaded ${demandEmbs.length} demand, ${supplyEmbs.length} supply embeddings`);

  // Compute full cross-join similarity (dot product for normalized vectors = cosine)
  const byDemand = new Map<string, Array<{ supply: string; score: number }>>();

  for (const d of demandEmbs) {
    const scores: Array<{ supply: string; score: number }> = [];
    for (const s of supplyEmbs) {
      scores.push({ supply: s.key, score: dotProduct(d.emb, s.emb) });
    }
    scores.sort((a, b) => b.score - a.score);
    byDemand.set(d.key, scores.slice(0, 50));
  }

  // Store each demand's top-50 in Redis (parallel writes, 30-day TTL)
  const writes: Promise<void>[] = [];
  for (const [dk, supplies] of byDemand) {
    writes.push(redis.set(`sim:${embedJobId}:${dk}`, supplies, { ex: 2592000 }));
  }
  await Promise.all(writes);

  await redis.set(cacheKey, "done", { ex: 2592000 });
  console.log(`[matrix] Stored top-50 for ${byDemand.size} demand keys`);
}

// =============================================================================
// MOVE 1: GET TOP-K FROM REDIS (replaces 193 sequential pgvector queries)
// =============================================================================

async function getTopKPairs(
  embedJobId: string,
  demandKeys: string[],
  topK: number,
): Promise<CandidatePair[]> {
  const keys = demandKeys.map((k) => `sim:${embedJobId}:${k}`);
  const results = await redis.mget<Array<{ supply: string; score: number }>>(...keys);

  const pairs: CandidatePair[] = [];
  for (let i = 0; i < demandKeys.length; i++) {
    const supplies = results[i];
    if (!supplies || !Array.isArray(supplies)) continue;
    const limited = supplies.slice(0, topK);
    for (let j = 0; j < limited.length; j++) {
      pairs.push({
        demandKey: demandKeys[i],
        supplyKey: limited[j].supply,
        similarity: limited[j].score,
        rank: j + 1,
      });
    }
  }

  return pairs;
}

// =============================================================================
// MOVE 3: WARM-UP (eliminates 1.2s cold-start penalty)
// =============================================================================

async function warmUpCerebras(cerebrasKey: string): Promise<void> {
  try {
    await fetch("https://api.cerebras.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cerebrasKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
    });
  } catch {
    // Warm-up failure is non-fatal
  }
}

// =============================================================================
// MOVE 2: PASS 1 — SCORING (llama-3.1-8b, 5000 t/s)
// =============================================================================

const SCORING_PROMPT = `Score demand-supply pairs. Return JSON: { "results": [...] }
Each result: { "fit": 0.0-1.0, "timing": 0.0-1.0, "vetoed": boolean, "vetoReason": null or string }

fit: How well supply's capability addresses the business need implied by demand's context + trigger.
  1.0 = exact capability match, 0.5 = tangential, 0.0 = none
timing: How urgent/time-sensitive.
  1.0 = actively needed now, 0.5 = general need, 0.0 = speculative
Be honest. Most pairs are mediocre.
A service provider matching a hiring need is WEAK — they sell services, not candidates.
Read through surface signals to actual business needs.

VETO RULES (strict — do NOT over-veto):
- Veto ONLY if: they are direct competitors selling the same thing to the same buyers, OR supply literally cannot serve demand (e.g. a food distributor matched with a cybersecurity need).
- Do NOT veto for "industry mismatch" alone. Services companies (consulting, staffing, IT, HR, recruiting, analytics) serve ALL industries. Cross-industry matches are often the BEST matches.
- When in doubt, score low (fit=0.1) instead of vetoing. Veto is a hard kill — use it sparingly.`;

async function callCerebrasScoring(
  batch: EvalInput[],
  cerebrasKey: string,
): Promise<ScoredResult[]> {
  const userContent = JSON.stringify(
    batch.map((p) => ({
      demand: { company: p.demand.company, context: p.demand.wants, industry: p.demand.industry, trigger: p.demand.why_now, keywords: p.demand.keywords },
      supply: { company: p.supply.company, capability: p.supply.offers, industry: p.supply.industry, keywords: p.supply.keywords },
    })),
  );

  // Cerebras primary (8B — 5000 t/s)
  if (cerebrasKey) {
    try {
      const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cerebrasKey}`,
          "Content-Type": "application/json",
          Connection: "keep-alive",
        },
        body: JSON.stringify({
          model: "gpt-oss-120b",
          messages: [
            { role: "system", content: SCORING_PROMPT },
            { role: "user", content: userContent },
          ],
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const parsed = JSON.parse(data.choices[0].message.content);
        const results = Array.isArray(parsed) ? parsed : (parsed.results || [parsed]);
        return results.slice(0, batch.length).map((r: Record<string, unknown>, i: number) => {
          const fit = Math.max(0, Math.min(1, Number(r.fit) || 0));
          const timing = Math.max(0, Math.min(1, Number(r.timing) || 0));
          const combined = Math.round((0.7 * fit + 0.3 * timing) * 1000) / 1000;
          // Server override: if model scored >= 0.3 combined, it sees a match — veto is contradictory
          const vetoed = combined >= 0.3 ? false : !!r.vetoed;
          return {
            ...batch[i],
            fit,
            timing,
            combined,
            vetoed,
            vetoReason: vetoed && typeof r.vetoReason === "string"
              ? (r.vetoReason as string).slice(0, 200)
              : null,
          };
        });
      }
      const errBody = await res.text().catch(() => '');
      console.error(`[scoring] Cerebras ${res.status}: ${errBody.slice(0, 200)}`);
    } catch (e) {
      console.log(`[scoring] Cerebras error: ${(e as Error).message}`);
    }
  }

  // Groq fallback
  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (groqKey) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          messages: [
            { role: "system", content: SCORING_PROMPT },
            { role: "user", content: userContent },
          ],
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const parsed = JSON.parse(data.choices[0].message.content);
        const results = Array.isArray(parsed) ? parsed : (parsed.results || [parsed]);
        return results.slice(0, batch.length).map((r: Record<string, unknown>, i: number) => {
          const fit = Math.max(0, Math.min(1, Number(r.fit) || 0));
          const timing = Math.max(0, Math.min(1, Number(r.timing) || 0));
          const combined = Math.round((0.7 * fit + 0.3 * timing) * 1000) / 1000;
          const vetoed = combined >= 0.3 ? false : !!r.vetoed;
          return {
            ...batch[i],
            fit,
            timing,
            combined,
            vetoed,
            vetoReason: vetoed && typeof r.vetoReason === "string"
              ? (r.vetoReason as string).slice(0, 200)
              : null,
          };
        });
      }
      const errBody = await res.text().catch(() => '');
      console.error(`[scoring] Groq ${res.status}: ${errBody.slice(0, 200)}`);
    } catch (e) {
      console.log(`[scoring] Groq error: ${(e as Error).message}`);
    }
  }

  // Total failure — return zeros
  console.error(`[scoring] FALLBACK: both Cerebras and Groq failed for batch of ${batch.length} — returning zeros`);
  return batch.map((p) => ({
    ...p,
    fit: 0,
    timing: 0,
    combined: 0,
    vetoed: false,
    vetoReason: null,
  }));
}

async function scoringPass(
  evalInputs: EvalInput[],
  cerebrasKey: string,
): Promise<ScoredResult[]> {
  const BATCH_SIZE = 20;
  const limit = pLimit(80);
  const batches = chunk(evalInputs, BATCH_SIZE);

  console.log(`[scoring] ${evalInputs.length} pairs → ${batches.length} batches, p-limit(40)`);

  const results = await Promise.allSettled(
    batches.map((batch) =>
      limit(() => callCerebrasScoring(batch, cerebrasKey))
    ),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<ScoredResult[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);
}

// =============================================================================
// MOVE 2: PASS 2 — REASONING (llama-3.3-70b, top 20 only)
// =============================================================================

const REASONING_PROMPT = `You are an intelligence analyst briefing a market operator. Each input is a demand-supply pair that scored well on fit. Your job: explain the NON-OBVIOUS connection.

Return JSON: { "results": [...] }
Each result: {
  "signal": "1-2 sentences. The specific fact that makes this pair interesting. NOT what each company does — the operator sees that already. Focus on timing (why_now), hiring urgency (applicant count), or market context.",
  "edge": "1 sentence. What makes THIS supply better than other options for THIS demand? Name a specific capability, track record, or niche. NEVER say 'X can support Y's needs' — that's meaningless. If no real edge exists, say 'Weak signal — generic industry overlap only'.",
  "risk": "1 sentence. The single biggest reason this could fail. Be concrete — geography, size mismatch, specialization gap, etc. NEVER say 'may not align' — say WHY it won't align. Empty string if no real risk.",
  "classification": "PASS or MARGINAL"
}

RULES:
- NEVER restate what both companies do. The operator already sees that.
- Signal: Focus ONLY on timing, urgency, or market context. "Posted 2 weeks ago with 25 applicants" is good. "Company X is hiring for Y" is BAD — the operator already sees this.
- Edge: Name a SPECIFIC differentiator. "Dermatology expertise in Phase 2 trials" is good. "Services are a good match" is BANNED. If you can't name a specific differentiator, MUST say "Weak signal — generic industry overlap only".
- Risk: State the concrete obstacle. "Indero focuses on dermatology, Kura is oncology — wrong therapeutic area" is good. "May not fully align" or "may hinder" is BANNED.
- The edge test: if you could swap the supply company name and the sentence still works, it's too generic. Rewrite it.
- Keep total output per pair under 80 words

BANNED PHRASES:
aligns well with, well-positioned, synergy, synergies, synergistic, comprehensive, robust,
leveraging, leverage, holistic, dynamic, directly addressing, directly addresses, directly matches,
operational scope, functional requirements, functional need, well-suited, ideally positioned,
strategically positioned, uniquely positioned, poised to, seamlessly, seamless, scalable solution,
value proposition, deep expertise, strategic alignment, core competency, value-add, innovative approach,
transformative, empower, empowering, optimize, streamline, actionable insights, impactful,
end-to-end, cutting-edge, state-of-the-art, best-in-class, industry-leading, world-class,
turnkey, mission-critical, game-changer, disruptive, proactive, operationalize, bandwidth,
ecosystem, paradigm, thought leader, go-to-market, stakeholder alignment, low-hanging fruit,
move the needle, take it to the next level, pain points, deep dive, circle back, touch base,
closely aligns, strong alignment, natural fit, clear match, perfectly positioned, facilitate, utilize,
comprehensive suite, robust platform, key player, well-established, solutions provider,
can aid, in its endeavors, research endeavors, ensure compliance, work together to achieve,
can support, could support, may support, services can, services could, services may,
X's needs, Y's needs, broader needs, specific needs, clinical needs, research needs,
may not align, may exist, may hinder, indicating urgent`;

interface ReasonedResult {
  evalId: string;
  reasoning: string;
  risks: string[];
  classification: string;
}

/** Convert new signal/edge format → stored reasoning string.
 *  Format: "SIGNAL: ...\nEDGE: ..." — client can split on prefixes.
 *  Falls back to old "reasoning" field if model returns that instead. */
function formatReasoning(r: Record<string, unknown>): string {
  const signal = typeof r.signal === "string" ? (r.signal as string).trim() : "";
  const edge = typeof r.edge === "string" ? (r.edge as string).trim() : "";
  if (signal || edge) {
    const parts: string[] = [];
    if (signal) parts.push(`SIGNAL: ${signal}`);
    if (edge) parts.push(`EDGE: ${edge}`);
    return parts.join("\n").slice(0, 500);
  }
  // Fallback: model returned old-style "reasoning" field
  return typeof r.reasoning === "string" ? (r.reasoning as string).slice(0, 500) : "";
}

/** Convert new risk string → risks array.
 *  New format returns single "risk" string; old format returns "risks" array. */
function formatRisks(r: Record<string, unknown>): string[] {
  // New format: single risk string
  if (typeof r.risk === "string" && (r.risk as string).trim()) {
    return [(r.risk as string).trim()];
  }
  // Old format: risks array
  if (Array.isArray(r.risks)) {
    return (r.risks as string[]).slice(0, 5);
  }
  return [];
}

async function callReasoningBatch(
  batchPairs: ScoredResult[],
  cerebrasKey: string,
): Promise<ReasonedResult[]> {
  const userContent = JSON.stringify(
    batchPairs.map((p) => ({
      demand: { company: p.demand.company, who: p.demand.who, context: p.demand.wants, industry: p.demand.industry, trigger: p.demand.why_now || "", keywords: p.demand.keywords, proof: p.demand.proof, title: p.demand.title, constraints: p.demand.constraints },
      supply: { company: p.supply.company, who: p.supply.who, capability: p.supply.offers, industry: p.supply.industry, keywords: p.supply.keywords, proof: p.supply.proof, title: p.supply.title },
      scores: { fit: p.fit, timing: p.timing, combined: p.combined },
    })),
  );
  const maxTokens = Math.max(2000, batchPairs.length * 200);

  // Cerebras primary (70B)
  if (cerebrasKey) {
    try {
      const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cerebrasKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b",
          messages: [
            { role: "system", content: REASONING_PROMPT },
            { role: "user", content: userContent },
          ],
          max_tokens: maxTokens,
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const speed = data.usage?.completion_tokens && data.usage?.completion_time
          ? Math.round(data.usage.completion_tokens / data.usage.completion_time)
          : "?";
        console.log(`[reasoning] Cerebras 70B: ${batchPairs.length} pairs, ${speed} t/s`);
        const parsed = JSON.parse(data.choices[0].message.content);
        const results = Array.isArray(parsed) ? parsed : (parsed.results || [parsed]);
        return results.slice(0, batchPairs.length).map((r: Record<string, unknown>, i: number) => ({
          evalId: batchPairs[i].evalId,
          reasoning: formatReasoning(r),
          risks: formatRisks(r),
          classification: typeof r.classification === "string" ? r.classification as string : "PASS",
        }));
      }
      console.log(`[reasoning] Cerebras ${res.status}, falling back`);
    } catch (e) {
      console.log(`[reasoning] Cerebras error: ${(e as Error).message}`);
    }
  }

  // Groq fallback (70B)
  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (groqKey) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: REASONING_PROMPT },
            { role: "user", content: userContent },
          ],
          max_tokens: maxTokens,
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const parsed = JSON.parse(data.choices[0].message.content);
        const results = Array.isArray(parsed) ? parsed : (parsed.results || [parsed]);
        return results.slice(0, batchPairs.length).map((r: Record<string, unknown>, i: number) => ({
          evalId: batchPairs[i].evalId,
          reasoning: formatReasoning(r),
          risks: formatRisks(r),
          classification: typeof r.classification === "string" ? r.classification as string : "PASS",
        }));
      }
    } catch (e) {
      console.log(`[reasoning] Groq error: ${(e as Error).message}`);
    }
  }

  // Total failure
  return batchPairs.map((p) => ({
    evalId: p.evalId,
    reasoning: "",
    risks: [],
    classification: "PASS",
  }));
}

async function reasoningPass(
  topPairs: ScoredResult[],
  cerebrasKey: string,
): Promise<ReasonedResult[]> {
  // Chunk into batches of 10 — each fits comfortably in 8192 token window
  const REASON_BATCH = 10;
  const batches = chunk(topPairs, REASON_BATCH);

  console.log(`[reasoning] ${topPairs.length} pairs → ${batches.length} batches of ≤${REASON_BATCH}`);

  // Fire all batches in parallel (only 1-3 batches, no need for p-limit)
  const results = await Promise.allSettled(
    batches.map((batch) => callReasoningBatch(batch, cerebrasKey)),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<ReasonedResult[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);
}

// =============================================================================
// CURATION LAYER — Replaces reasoning pass
// Dedup in code (280→85) then AI pick-and-annotate (85→12-15)
// =============================================================================

const CURATION_PROMPT = `You are a senior analyst writing internal briefing notes for a deal-curation team. Your job is to look at a list of demand-supply pairs, rank them by combined_score, and output only the highest-priority ones in strict JSON.

Output format (must be followed exactly):
{
  "picks": [
    {
      "id": <int matching input id>,
      "framing": "<one sentence: what demand needs + what supply delivers>",
      "note": "<2-3 clause analyst note using keywords/proof/industry>",
      "urgency": "URGENT" or "NORMAL",
      "risk": "<one actionable sentence>" or null
    }
  ]
}

Only these fields. No explanations. No extra keys.

Style for framing:
- Pattern: "<Demand company> [recent trigger event] – <Supply company> <verb> <specific capability relevant to what follows from the trigger>."
- WHY NOW is the trigger, not the need. Don't restate it as the need. Infer what demand actually needs from the supply's offering.
- One sentence, 15-25 words. Name both companies. Be specific — use the keywords and industry, not generic descriptions.
- Good: "Acme's Series B raises founder wealth complexity – Vanguard Partners delivers integrated advisory framework for this stage."
- Bad: "Acme needs Biotech Funding – Vanguard Partners offers wealth management services."

Style for the note:
- Pattern: "<Demand> <trigger context>; <Supply> <verb> <capability relevant to that stage>."
- Reference keywords, proof, or industry details when available to make the note specific.
- Demand context: recently raised, just expanded, entering growth phase, post-acquisition
- Supply verbs: runs, offers, delivers, specializes in
- Do NOT use "requires" or "provides"
- 2-3 clauses, ~20-30 words max

Positive example:
{"id": 1, "framing": "Acumen's trial-management expansion triggers clinical ops demand – Scian runs biostatistics across 40+ oncology trials.", "note": "Acumen expanding trial-management ops; Scian runs oncology biostatistics on 40+ trials.", "urgency": "URGENT", "risk": null}

Negative example (DO NOT write like this):
{"id": 99, "framing": "Acumen needs services from Scian.", "note": "Acumen requires services and Scian provides biostatistics.", "urgency": "URGENT", "risk": null}

Urgency rules:
- Job posting closing within 30 days → URGENT
- High applicant count (20+) → URGENT
- Recent funding announced → URGENT
- No timing signal → NORMAL

Risk rules:
- Only flag if operator needs to CHECK something
- "Confirm they handle human trials" = good
- "May cause integration challenges" = useless, skip
- If no real risk, return null

Select exactly the top 15 pairs (or fewer if list is shorter). Only use IDs from the input list.`;

interface CurationPick {
  id: number;
  framing: string;
  note: string;
  urgency: "URGENT" | "NORMAL";
  risk: string | null;
}

/** Dedup PASS pairs: group by demand_key, keep top 2 per demand by combined score */
function dedupPairs(
  pairs: Array<{ eval_id: string; demand_key: string; supply_key: string; scores: { fit: number; timing: number; combined: number }; [key: string]: unknown }>,
): typeof pairs {
  const groups = new Map<string, typeof pairs>();
  for (const p of pairs) {
    const group = groups.get(p.demand_key) || [];
    group.push(p);
    groups.set(p.demand_key, group);
  }

  const result: typeof pairs = [];
  for (const [, group] of groups) {
    group.sort((a, b) => (b.scores?.combined || 0) - (a.scores?.combined || 0));
    result.push(...group.slice(0, 2));
  }

  return result.sort((a, b) => (b.scores?.combined || 0) - (a.scores?.combined || 0));
}

interface CurationAttempt {
  attempt: number;
  status: "ok" | "http_error" | "parse_error" | "network_error";
  ms: number;
  detail: string;
  picks?: number;
}

interface CurationAIResult {
  picks: CurationPick[];
  log: CurationAttempt[];
}

/** Call curation AI — Cerebras (Qwen3 235B MoE), 1 retry on failure */
async function callCurationAI(
  pairsPayload: string,
  cerebrasKey: string,
): Promise<CurationAIResult> {
  const log: CurationAttempt[] = [];

  if (!cerebrasKey) {
    log.push({ attempt: 0, status: "network_error", ms: 0, detail: "No CEREBRAS_API_KEY" });
    console.log("[curation] No CEREBRAS_API_KEY — skipping curation");
    return { picks: [], log };
  }

  const MAX_ATTEMPTS = 2;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const t0 = Date.now();
    try {
      console.log(`[curation] Attempt ${attempt}/${MAX_ATTEMPTS} — Cerebras gpt-oss-120b`);
      const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cerebrasKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-oss-120b",
          messages: [
            { role: "system", content: CURATION_PROMPT },
            { role: "user", content: pairsPayload },
          ],
          max_tokens: 8192,
          temperature: 0.0,
          response_format: { type: "json_object" },
        }),
      });

      const ms = Date.now() - t0;

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const detail = `HTTP ${res.status}: ${body.slice(0, 200)}`;
        log.push({ attempt, status: "http_error", ms, detail });
        console.log(`[curation] Attempt ${attempt} failed: ${detail} (${ms}ms)`);
        continue;
      }

      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content;
      if (!raw || typeof raw !== "string") {
        const finishReason = data.choices?.[0]?.finish_reason || "unknown";
        const detail = `content=${typeof raw}, finish_reason=${finishReason}`;
        log.push({ attempt, status: "parse_error", ms: Date.now() - t0, detail });
        console.error(`[curation] Attempt ${attempt}: response content is ${typeof raw}, finish_reason=${finishReason}, raw keys=${Object.keys(data).join(",")}`);
        continue;
      }
      const parsed = JSON.parse(raw);
      const picks = Array.isArray(parsed.picks) ? parsed.picks : [];

      log.push({ attempt, status: "ok", ms, detail: `${picks.length} picks`, picks: picks.length });
      console.log(`[curation] Attempt ${attempt} ok: ${picks.length} picks in ${ms}ms`);
      return { picks, log };
    } catch (e) {
      const ms = Date.now() - t0;
      const detail = (e as Error).message?.slice(0, 200) || "unknown";
      log.push({ attempt, status: raw_is_fetch(e) ? "network_error" : "parse_error", ms, detail });
      console.log(`[curation] Attempt ${attempt} error: ${detail} (${ms}ms)`);
      continue;
    }
  }

  return { picks: [], log };
}

function raw_is_fetch(e: unknown): boolean {
  return e instanceof TypeError && String(e).includes("fetch");
}

/** Curation pass: dedup → AI pick → DB write */
async function curationPass(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
): Promise<{ deduped: number; curated: number }> {
  const CEREBRAS_KEY = Deno.env.get("CEREBRAS_API_KEY") || "";

  // 1. Query top non-vetoed rows for this job (all classifications)
  const { data: passRows, error: queryError } = await supabase
    .from("mcp_evaluations")
    .select("eval_id, demand_key, supply_key, scores, classification, vetoed")
    .eq("job_id", jobId)
    .eq("vetoed", false)
    .order("scores->combined", { ascending: false })
    .limit(200);

  if (queryError || !passRows) {
    console.error(`[curation] Query error: ${queryError?.message}`);
    return { deduped: 0, curated: 0 };
  }

  console.log(`[curation] ${passRows.length} top pairs (pre-dedup) for job ${jobId}`);

  // 2. Dedup: top 2 per demand_key, then floor with starvation fallback
  const rawDeduped = dedupPairs(passRows);
  let deduped = rawDeduped.filter(p => (p.scores?.combined ?? 0) >= 0.30).slice(0, 50);
  if (deduped.length < 15) {
    console.warn(`[curation] STARVATION: ${deduped.length} after floor — dropping floor, using raw dedup`);
    deduped = rawDeduped.slice(0, 50);
  }
  console.log(`[curation] Deduped: ${passRows.length} → ${rawDeduped.length} → ${deduped.length} (after floor)`);

  if (deduped.length === 0) return { deduped: 0, curated: 0 };

  // 3. Load canonicals for deduped pairs
  const allKeys = [...new Set(deduped.flatMap((p) => [p.demand_key, p.supply_key]))];
  const { data: canonRows } = await supabase
    .from("dmcb_canonicals")
    .select("record_key, canonical")
    .in("record_key", allKeys);

  const canonMap = new Map((canonRows || []).map((r: CanonicalRow) => [r.record_key, r.canonical]));

  // 4. Build numbered payload — shuffle to mitigate position bias
  const shuffled = [...deduped].sort(() => Math.random() - 0.5);
  const idMap = new Map<number, string>(); // sequentialId → eval_id

  const pairsForAI = shuffled.map((p, i) => {
    const seqId = i + 1;
    idMap.set(seqId, p.eval_id);
    const dc = canonMap.get(p.demand_key) || {} as CanonicalRow["canonical"];
    const sc = canonMap.get(p.supply_key) || {} as CanonicalRow["canonical"];
    return {
      id: seqId,
      demand: {
        company: dc.company || dc.who || p.demand_key,
        context: dc.wants || "",
        trigger: dc.why_now || "",
        industry: dc.industry || "",
        keywords: dc.keywords || [],
      },
      supply: {
        company: sc.company || sc.who || p.supply_key,
        capability: sc.offers || sc.wants || "",
        industry: sc.industry || "",
        keywords: sc.keywords || [],
      },
      scores: p.scores,
    };
  });

  const pairsPayload = JSON.stringify(pairsForAI);
  console.log(`[curation] Sending ${pairsForAI.length} pairs to AI (payload: ${pairsPayload.length} chars)`);

  // 5. Call AI (1 retry on failure, full audit log)
  const { picks, log: curationLog } = await callCurationAI(pairsPayload, CEREBRAS_KEY);

  // 6. Validate picks — drop hallucinated IDs
  const validPicks: Array<CurationPick & { evalId: string }> = [];
  for (const pick of picks) {
    const evalId = idMap.get(pick.id);
    if (!evalId) {
      console.log(`[curation] Dropping hallucinated ID: ${pick.id}`);
      continue;
    }
    validPicks.push({
      ...pick,
      evalId,
      framing: typeof pick.framing === "string" ? pick.framing.slice(0, 500) : "",
      urgency: pick.urgency === "URGENT" ? "URGENT" : "NORMAL",
      note: typeof pick.note === "string" ? pick.note.slice(0, 500) : "",
      risk: typeof pick.risk === "string" ? pick.risk.slice(0, 300) : null,
    });
  }

  console.log(`[curation] ${validPicks.length} valid picks (${picks.length - validPicks.length} dropped)`);

  // 7. Write curation audit log to mcp_jobs (survives log truncation)
  const { data: jobRow } = await supabase.from("mcp_jobs").select("config").eq("job_id", jobId).single();
  const existingConfig = jobRow?.config || {};
  await supabase.from("mcp_jobs").update({
    config: {
      ...existingConfig,
      curation_log: curationLog,
      curation_summary: {
        top_pairs: passRows.length,
        deduped: deduped.length,
        ai_picks: picks.length,
        valid_picks: validPicks.length,
        dropped: picks.length - validPicks.length,
      },
    },
  }).eq("job_id", jobId);

  // 8. Write curated results to DB
  await Promise.all(
    validPicks.map(async (pick) => {
      const { error } = await supabase
        .from("mcp_evaluations")
        .update({
          reasoning: typeof pick.note === "string" ? pick.note.slice(0, 500) : "",
          framing: pick.framing,
          risks: pick.risk ? [pick.risk] : [],
          eval_status: "curated",
        })
        .eq("eval_id", pick.evalId)
        .eq("job_id", jobId);
      if (error) console.error(`[curation] DB update error for ${pick.evalId}: ${error.message}`);
    }),
  );

  return { deduped: deduped.length, curated: validPicks.length };
}

// =============================================================================
// DB HELPERS
// =============================================================================

async function bulkInsertScored(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  scored: ScoredResult[],
): Promise<void> {
  const rows = scored.map((s) => ({
    eval_id: s.evalId,
    job_id: jobId,
    demand_key: s.demandKey,
    supply_key: s.supplyKey,
    scores: { fit: s.fit, timing: s.timing, combined: s.combined },
    classification: classifyDirect(s.combined, s.vetoed),
    readiness: readinessDirect(s.combined, s.fit),
    vetoed: s.vetoed,
    veto_reason: s.vetoReason,
    risks: [],
    framing: "",
    reasoning: "",
    similarity: s.similarity,
    rank: s.rank,
    eval_status: "scored",
    evaluated_at: new Date().toISOString(),
  }));

  // Chunk at 500 to stay within Supabase limits — fire all chunks in parallel
  const chunks = chunk(rows, 500);
  await Promise.all(
    chunks.map(async (ch) => {
      const { error } = await supabase
        .from("mcp_evaluations")
        .upsert(ch, { onConflict: "eval_id,job_id" });
      if (error) console.error(`[db] Bulk insert error: ${error.message}`);
    }),
  );
}

async function bulkUpdateReasoned(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  reasoned: ReasonedResult[],
): Promise<void> {
  // Fire all 50 updates in parallel (each is a small single-row update)
  await Promise.all(
    reasoned.map(async (r) => {
      const { error } = await supabase
        .from("mcp_evaluations")
        .update({
          reasoning: r.reasoning,
          risks: r.risks,
          classification: r.classification,
          eval_status: "reasoned",
        })
        .eq("eval_id", r.evalId)
        .eq("job_id", jobId);
      if (error) console.error(`[db] Update reasoned error: ${error.message}`);
    }),
  );
}

// =============================================================================
// EVALUATE DIRECT — Two-pass Cerebras (the complete orchestrator)
// =============================================================================

interface TimingBreakdown {
  warmupMs: number;
  buildInputsMs: number;
  scoringMs: number;
  calibrationMs: number;
  dbWriteScoredMs: number;
  reasoningMs: number;
  dbWriteReasonedMs: number;
  markCompleteMs: number;
  totalMs: number;
}

async function evaluateDirect(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  pairs: CandidatePair[],
  canonicals: CanonicalRow[],
): Promise<{ scored: number; reasoned: number; timing: TimingBreakdown }> {
  const CEREBRAS_KEY = Deno.env.get("CEREBRAS_API_KEY") || "";
  const t0 = Date.now();
  const timing: TimingBreakdown = {
    warmupMs: 0, buildInputsMs: 0, scoringMs: 0, calibrationMs: 0,
    dbWriteScoredMs: 0, reasoningMs: 0, dbWriteReasonedMs: 0, markCompleteMs: 0, totalMs: 0,
  };

  // 0. Warm up Cerebras
  await warmUpCerebras(CEREBRAS_KEY);
  timing.warmupMs = Date.now() - t0;

  // Build eval inputs from pairs + canonicals
  const tBuild = Date.now();
  const canonMap = new Map(canonicals.map((c) => [c.record_key, c]));
  const evalInputs: EvalInput[] = pairs.map((p) => {
    const d = canonMap.get(p.demandKey);
    const s = canonMap.get(p.supplyKey);
    const dc = d?.canonical || {};
    const sc = s?.canonical || {};
    return {
      evalId: `v5_${simpleHash(`${p.demandKey}|${p.supplyKey}`)}`,
      demandKey: p.demandKey,
      supplyKey: p.supplyKey,
      demand: {
        company: dc.company || dc.who || "",
        who: dc.who || "",
        wants: dc.wants || "",
        industry: dc.industry || "",
        why_now: dc.why_now || "",
        keywords: dc.keywords || [],
        proof: dc.proof || "",
        title: dc.title || "",
        constraints: dc.constraints || [],
      },
      supply: {
        company: sc.company || sc.who || "",
        who: sc.who || "",
        offers: sc.offers || sc.wants || "",
        industry: sc.industry || "",
        keywords: sc.keywords || [],
        proof: sc.proof || "",
        title: sc.title || "",
      },
      similarity: p.similarity,
      rank: p.rank,
    };
  });
  timing.buildInputsMs = Date.now() - tBuild;

  // 1. Scoring pass — ALL pairs, 8B model
  await supabase.from("mcp_jobs").update({
    status: "evaluating",
    total_pairs: pairs.length,
    scoring_status: "scoring",
  }).eq("job_id", jobId);

  const tScoring = Date.now();
  const rawScored = await scoringPass(evalInputs, CEREBRAS_KEY);
  timing.scoringMs = Date.now() - tScoring;

  // 1a. Score histogram for observability
  {
    const sorted = [...rawScored].map(s => s.combined ?? 0).sort((a, b) => a - b);
    const uniqueEffective = new Set(sorted.map(v => Math.round(v * 1000))).size;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / sorted.length;
    const variance = sorted.reduce((a, v) => a + (v - mean) ** 2, 0) / sorted.length;
    const stddev = Math.sqrt(variance);
    console.log(`[scoring] HISTOGRAM: n=${sorted.length}, unique=${uniqueEffective}, min=${sorted[0]?.toFixed(4)}, max=${sorted[sorted.length-1]?.toFixed(4)}, mean=${mean.toFixed(4)}, stddev=${stddev.toFixed(4)}, >=0.5: ${sorted.filter(s => s >= 0.5).length}, >=0.3: ${sorted.filter(s => s >= 0.3).length}`);
  }

  // 1b. 120B scores — no calibration needed (raw scores are well-distributed)
  const scored = rawScored;
  timing.calibrationMs = 0;

  // 2. Bulk insert ALL scored pairs
  const tDbWrite = Date.now();
  await supabase.from("mcp_jobs").update({
    scoring_status: "complete",
    completed_pairs: scored.length,
  }).eq("job_id", jobId);
  await bulkInsertScored(supabase, jobId, scored);
  timing.dbWriteScoredMs = Date.now() - tDbWrite;

  // 3. Curation pass — dedup + AI pick-and-annotate (replaces reasoning)
  const tReason = Date.now();
  await supabase.from("mcp_jobs").update({
    reasoning_status: "reasoning",
  }).eq("job_id", jobId);
  const { deduped, curated } = await curationPass(supabase, jobId);
  timing.reasoningMs = Date.now() - tReason;

  // No separate DB write step — curationPass writes directly
  timing.dbWriteReasonedMs = 0;

  console.log(`[direct] Curation: ${deduped} deduped → ${curated} curated picks`);

  // 4. Mark complete
  const tComplete = Date.now();
  await supabase.from("mcp_jobs").update({
    status: "complete",
    completed_pairs: scored.length,
    reasoning_status: "complete",
    completed_at: new Date().toISOString(),
  }).eq("job_id", jobId);
  timing.markCompleteMs = Date.now() - tComplete;

  timing.totalMs = Date.now() - t0;
  console.log(`[orchestrate] direct_mode_latency_ms=${timing.totalMs}`);
  console.log(`[direct] TIMING: ${JSON.stringify(timing)}`);
  return { scored: scored.length, reasoned: curated, timing };
}

// =============================================================================
// SHARD MODE — QStash dispatch for large datasets (>5000 pairs)
// =============================================================================

// =============================================================================
// BATCH DISPATCH HELPERS
// =============================================================================

interface BatchMessage {
  destination: string;
  queue?: string;
  headers: Record<string, string>;
  body: string | Record<string, unknown>;
}

/** SHA-256 content hash for deterministic dedup IDs — same logical shard = same hash across retries */
async function shardDedupId(jobId: string, evalIds: string[]): Promise<string> {
  const sorted = [...evalIds].sort();
  const data = new TextEncoder().encode(sorted.join("|"));
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  return `${jobId}-shard-${hex}`;
}

/** Chunk messages by exact serialized size — measures full JSON including all overhead */
function chunkBySize(messages: BatchMessage[]): BatchMessage[][] {
  const MAX_BATCH_BYTES = 512 * 1024; // 512KB safe margin under 1MB QStash limit
  const chunks: BatchMessage[][] = [];
  let current: BatchMessage[] = [];

  for (const msg of messages) {
    const candidate = [...current, msg];
    const candidateBytes = new TextEncoder().encode(JSON.stringify(candidate)).length;
    if (current.length > 0 && candidateBytes > MAX_BATCH_BYTES) {
      chunks.push(current);
      current = [msg];
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** Send chunked batch to QStash, retry failed messages once, fatal on unrecoverable */
async function dispatchBatch(
  batchUrl: string,
  qstashToken: string,
  messages: BatchMessage[],
): Promise<number> {
  const chunks = chunkBySize(messages);
  let totalPublished = 0;
  const allFailed: BatchMessage[] = [];

  for (const chunk of chunks) {
    const res = await fetch(batchUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${qstashToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chunk),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`QStash batch failed: ${res.status} ${errText.slice(0, 300)}`);
    }

    const results = await res.json();
    if (Array.isArray(results)) {
      for (let i = 0; i < results.length; i++) {
        if (results[i].error) {
          allFailed.push(chunk[i]);
        } else {
          totalPublished++;
        }
      }
    } else {
      totalPublished += chunk.length;
    }
  }

  // Retry failed messages once — chunked, same as first pass
  if (allFailed.length > 0) {
    console.warn(`[shard] Retrying ${allFailed.length} failed messages`);
    const retryChunks = chunkBySize(allFailed);
    const stillFailed: BatchMessage[] = [];

    for (const retryChunk of retryChunks) {
      const retryRes = await fetch(batchUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${qstashToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(retryChunk),
      });

      if (!retryRes.ok) {
        throw new Error(`QStash retry batch failed: ${retryRes.status}`);
      }

      const retryResults = await retryRes.json();
      if (Array.isArray(retryResults)) {
        for (let i = 0; i < retryResults.length; i++) {
          if (retryResults[i].error) {
            stillFailed.push(retryChunk[i]);
          } else {
            totalPublished++;
          }
        }
      } else {
        totalPublished += retryChunk.length;
      }
    }

    if (stillFailed.length > 0) {
      const failedIds = stillFailed.map((m) =>
        m.headers["Upstash-Deduplication-Id"] ?? "unknown"
      );
      throw new Error(
        `FATAL: ${stillFailed.length} shards failed after retry: ${failedIds.join(", ")}`
      );
    }
  }

  return totalPublished;
}

// =============================================================================
// SHARD MODE — QStash batch dispatch for large datasets (>5000 pairs)
// =============================================================================

async function buildAndPublishShards(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  jobId: string,
  pairs: CandidatePair[],
  canonicals: CanonicalRow[],
  aiConfig: AIConfig,
): Promise<{ shardCount: number }> {
  const SHARD_SIZE = 50;
  const canonMap = new Map(canonicals.map((c) => [c.record_key, c]));

  const evalInputs = pairs.map((p) => {
    const d = canonMap.get(p.demandKey);
    const s = canonMap.get(p.supplyKey);
    const dc = d?.canonical || {};
    const sc = s?.canonical || {};
    return {
      evalId: `v5_${simpleHash(`${p.demandKey}|${p.supplyKey}`)}`,
      demand: {
        key: p.demandKey,
        who: dc.who || "",
        company: dc.company || dc.who || "",
        wants: dc.wants || "",
        why_now: dc.why_now || "",
        constraints: dc.constraints || [],
        segment: dc.who || "",
        industry: dc.industry || "",
        keywords: dc.keywords || [],
        proof: dc.proof || "",
        title: dc.title || "",
      },
      supply: {
        key: p.supplyKey,
        who: sc.who || "",
        company: sc.company || sc.who || "",
        offers: sc.offers || sc.wants || "",
        segment: sc.who || "",
        industry: sc.industry || "",
        keywords: sc.keywords || [],
        proof: sc.proof || "",
        title: sc.title || "",
      },
      similarity: p.similarity,
      rank: p.rank,
    };
  });

  // Build shards + DB rows
  const shardRows = [];
  const shardPairs: { pairs: unknown[]; evalIds: string[] }[] = [];
  for (let i = 0; i < evalInputs.length; i += SHARD_SIZE) {
    const shard = evalInputs.slice(i, i + SHARD_SIZE);
    const index = Math.floor(i / SHARD_SIZE);
    shardPairs.push({
      pairs: shard,
      evalIds: shard.map((p) => p.evalId),
    });
    shardRows.push({
      job_id: jobId,
      shard_index: index,
      status: "pending",
      pairs: shard,
      pair_count: shard.length,
      shard_type: "scoring",
    });
  }

  console.log(`[shard] Writing ${shardPairs.length} shards`);
  const { error: shardError } = await supabase
    .from("mcp_shards")
    .insert(shardRows);

  if (shardError) throw new Error(`Failed to insert shards: ${shardError.message}`);

  const qstashToken = Deno.env.get("QSTASH_TOKEN");
  if (!qstashToken) throw new Error("QSTASH_TOKEN not configured");

  const qstashBaseUrl = Deno.env.get("QSTASH_URL") || "https://qstash.upstash.io";
  const workerUrl = `${supabaseUrl}/functions/v1/mcp-score-worker`;
  const QUEUE_THRESHOLD = 200;
  const QUEUE_NAME = "mcp-eval";
  const PARALLELISM = 100;
  const batchUrl = `${qstashBaseUrl}/v2/batch`;

  const useQueue = shardPairs.length >= QUEUE_THRESHOLD;

  // If using queue mode, ensure queue exists first (single fetch)
  if (useQueue) {
    await fetch(`${qstashBaseUrl}/v2/queues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${qstashToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ queueName: QUEUE_NAME, parallelism: PARALLELISM }),
    });
  }

  // Build batch messages with content-hashed dedup IDs
  const messages: BatchMessage[] = [];
  for (let i = 0; i < shardPairs.length; i++) {
    const shard = shardPairs[i];
    const dedupId = await shardDedupId(jobId, shard.evalIds);
    const msg: BatchMessage = {
      destination: workerUrl,
      headers: {
        "Content-Type": "application/json",
        "Upstash-Retries": "3",
        "Upstash-Deduplication-Id": dedupId,
      },
      body: { jobId, shardIndex: i, pairs: shard.pairs, aiConfig },
    };
    if (useQueue) {
      msg.queue = QUEUE_NAME;
    }
    messages.push(msg);
  }

  // Dispatch via batch API — chunked by byte size, with partial failure retry
  const published = await dispatchBatch(batchUrl, qstashToken, messages);

  console.log(`[shard] ${published} shards dispatched via batch (${useQueue ? "queue" : "direct"})`);
  return { shardCount: shardPairs.length };
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

  let jobId = "";

  try {
    const body: OrchestrateRequest = await req.json();
    jobId = body.jobId;
    const topK = body.topK || 10;
    const t0 = Date.now();

    // Client injection: APPEND client to the correct side, never REPLACE.
    // Pipeline evaluates full matrix (market + client). Lens filters in the UI.
    const cKey = body.clientKey || body.fulfillmentKey;   // backwards compat
    const cSide = body.clientSide || body.fulfillmentSide;
    let effectiveDemandKeys: string[];
    let effectiveSupplyKeys: string[];
    if (cKey && cSide === "supply") {
      effectiveSupplyKeys = [...new Set([...body.supplyKeys, cKey])];
      effectiveDemandKeys = body.demandKeys;
    } else if (cKey && cSide === "demand") {
      effectiveDemandKeys = [...new Set([...body.demandKeys, cKey])];
      effectiveSupplyKeys = body.supplyKeys;
    } else {
      effectiveDemandKeys = body.demandKeys;
      effectiveSupplyKeys = body.supplyKeys;
    }
    if (effectiveDemandKeys.length === 0 || effectiveSupplyKeys.length === 0) {
      throw new Error(`Empty side: ${effectiveDemandKeys.length} demand × ${effectiveSupplyKeys.length} supply`);
    }
    const isFulfillment = !!cKey;

    console.log(`[orchestrate] Job ${jobId}: ${effectiveDemandKeys.length} demand × ${effectiveSupplyKeys.length} supply${cKey ? ` (client=${cKey}, side=${cSide})` : ""}, K=${topK}`);

    // Create job record
    await supabase.from("mcp_jobs").upsert(
      {
        job_id: jobId,
        status: "embedding",
        total_pairs: 0,
        completed_pairs: 0,
        scoring_status: "pending",
        reasoning_status: "pending",
        started_at: new Date().toISOString(),
        config: {
          demandCount: effectiveDemandKeys.length,
          supplyCount: effectiveSupplyKeys.length,
          topK,
          provider: body.aiConfig.provider,
          aiConfig: body.aiConfig,
          fulfillment: isFulfillment ? { key: body.fulfillmentKey, side: body.fulfillmentSide } : undefined,
        },
      },
      { onConflict: "job_id" },
    );

    // Load canonicals
    const allKeys = [...effectiveDemandKeys, ...effectiveSupplyKeys];
    const { data: canonicals, error: loadError } = await supabase
      .from("dmcb_canonicals")
      .select("record_key, canonical")
      .in("record_key", allKeys);

    if (loadError || !canonicals) {
      throw new Error(`Failed to load canonicals: ${loadError?.message}`);
    }

    const validCanonicals = (canonicals as CanonicalRow[]).filter((c) => {
      const can = c.canonical;
      if (!can || (!can.company && !can.domain)) return false;
      const side = can.role || "demand";
      const text = side === "supply"
        ? (can.offers || can.wants || "")
        : (can.wants || "");
      return text.trim().length >= 8 && (can.confidence || 0) >= 0.4;
    });

    const tLoadCanon = Date.now();
    console.log(`[orchestrate] ${validCanonicals.length} valid canonicals — ${Date.now() - t0}ms`);
    const loadCanonicalsMs = Date.now() - tLoadCanon + (tLoadCanon - t0);

    // =========================================================================
    // PHASE 1: EMBED
    // =========================================================================

    await supabase.from("mcp_jobs").update({ status: "embedding" }).eq("job_id", jobId);
    const tEmbed = Date.now();
    // phaseEmbed returns a stable embedJobId (content hash) — same dataset = same key forever
    const embedJobId = await phaseEmbed(supabase, validCanonicals);
    const embedMs = Date.now() - tEmbed;
    console.log(`[orchestrate] Embed done — ${embedMs}ms (embedJobId=${embedJobId})`);

    // =========================================================================
    // PHASE 2: SIMILARITY MATRIX + TOP-K (both use stable embedJobId)
    // =========================================================================

    await supabase.from("mcp_jobs").update({ status: "retrieving" }).eq("job_id", jobId);

    // In fulfillment mode, effective keys already constrain one side to the client.
    // In market routing, discover sides from canonical roles.
    const demandKeys = isFulfillment
      ? effectiveDemandKeys
      : validCanonicals.filter((c) => (c.canonical.role || "demand") === "demand").map((c) => c.record_key);

    const supplyKeys = isFulfillment
      ? effectiveSupplyKeys
      : validCanonicals.filter((c) => (c.canonical.role || "demand") === "supply").map((c) => c.record_key);

    // MOVE 1: ONE cross-join → Redis cache (keyed by stable embedJobId)
    const tMatrix = Date.now();
    await precomputeSimilarityMatrix(supabase, embedJobId, demandKeys, supplyKeys);
    const matrixMs = Date.now() - tMatrix;
    console.log(`[orchestrate] Matrix done — ${matrixMs}ms`);

    // ONE Redis MGET → all pairs (keyed by stable embedJobId)
    const tTopK = Date.now();
    const pairs = await getTopKPairs(embedJobId, demandKeys, topK);
    const topKMs = Date.now() - tTopK;
    console.log(`[orchestrate] Top-K: ${pairs.length} pairs from Redis — ${topKMs}ms`);

    // Update job with pair count
    await supabase.from("mcp_jobs").update({
      status: "evaluating",
      total_pairs: pairs.length,
      scoring_status: "scoring",
    }).eq("job_id", jobId);

    if (pairs.length === 0) {
      await supabase.from("mcp_jobs").update({
        status: "complete",
        completed_at: new Date().toISOString(),
        total_pairs: 0,
        completed_pairs: 0,
      }).eq("job_id", jobId);

      return new Response(
        JSON.stringify({ jobId, status: "complete", totalPairs: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // =========================================================================
    // PHASE 3: EVALUATE — Direct mode (<5000) or Shard mode (>5000)
    // =========================================================================

    const DIRECT_MODE_THRESHOLD = 5000;

    if (pairs.length <= DIRECT_MODE_THRESHOLD) {
      console.log(`[orchestrate] DIRECT MODE: ${pairs.length} pairs`);

      const { scored, reasoned, timing: evalTiming } = await evaluateDirect(
        supabase, jobId, pairs, validCanonicals,
      );

      const totalMs = Date.now() - t0;
      const timing = {
        loadCanonicalsMs,
        embedMs,
        matrixMs,
        topKMs,
        ...evalTiming,
        orchestrateTotalMs: totalMs,
      };

      console.log(`[orchestrate] Job ${jobId}: ${scored} scored, ${reasoned} reasoned — DONE ${totalMs}ms`);
      console.log(`[orchestrate] TIMING: ${JSON.stringify(timing)}`);

      return new Response(
        JSON.stringify({
          jobId,
          status: "complete",
          totalPairs: pairs.length,
          scored,
          reasoned,
          mode: "direct",
          timing,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // SHARD MODE: QStash dispatch for large datasets
    console.log(`[orchestrate] SHARD MODE: ${pairs.length} pairs`);

    const { shardCount } = await buildAndPublishShards(
      supabase, supabaseUrl, jobId, pairs, validCanonicals, body.aiConfig,
    );

    return new Response(
      JSON.stringify({
        jobId,
        status: "evaluating",
        totalPairs: pairs.length,
        totalShards: shardCount,
        mode: "shard",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[orchestrate] Fatal:", error);

    if (jobId) {
      await supabase.from("mcp_jobs").update({
        status: "failed",
        error: (error as Error).message?.slice(0, 500),
        completed_at: new Date().toISOString(),
      }).eq("job_id", jobId).then(({ error: e }) => { if (e) console.error("[orchestrate] Failed to mark job failed:", e.message); });
    }

    return new Response(
      JSON.stringify({
        jobId,
        status: "failed",
        error: (error as Error).message?.slice(0, 200),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
