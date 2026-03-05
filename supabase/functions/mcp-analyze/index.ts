import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * MCP-ANALYZE — Market analysis edge function
 *
 * Receives a set of I Layer canonical signals for a market,
 * aggregates them, calls AI once to produce a market summary,
 * caches the result in mcp_market_analyses, and returns it.
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

interface Canonical {
  company?: string;
  who?: string;
  wants?: string;
  offers?: string;
  why_now?: string;
  constraints?: string[];
  domain?: string;
  confidence?: number;
}

interface Signal {
  recordKey: string;
  side: "demand" | "supply";
  canonical: Canonical;
}

interface AnalyzeRequest {
  marketId: string;
  signals: Signal[];
}

interface MarketAnalysis {
  market_id: string;
  demand_summary: string;
  supply_summary: string;
  demand_segments: { name: string; count: number }[];
  supply_segments: { name: string; count: number }[];
  data_quality: {
    totalSignals: number;
    withCompanyName: number;
    enrichmentReady: number;
  };
  created_at?: string;
  updated_at?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Check if a cached analysis exists and is fresh (< 1 hour old).
 */
async function getCachedAnalysis(
  supabase: ReturnType<typeof createClient>,
  marketId: string,
): Promise<MarketAnalysis | null> {
  const { data, error } = await supabase
    .from("mcp_market_analyses")
    .select("*")
    .eq("market_id", marketId)
    .single();

  if (error || !data) return null;

  const updatedAt = new Date(data.updated_at).getTime();
  const oneHourAgo = Date.now() - 60 * 60 * 1000;

  if (updatedAt > oneHourAgo) {
    return data as MarketAnalysis;
  }

  return null;
}

/**
 * Aggregate signals into a text summary for the AI prompt.
 * Groups by common themes from canonical.wants (demand) and canonical.offers (supply).
 */
function aggregateSignals(signals: Signal[]): {
  demandSignals: Signal[];
  supplySignals: Signal[];
  demandThemes: Map<string, number>;
  supplyThemes: Map<string, number>;
  aggregateText: string;
} {
  const demandSignals = signals.filter((s) => s.side === "demand");
  const supplySignals = signals.filter((s) => s.side === "supply");

  // Group demand by wants
  const demandThemes = new Map<string, number>();
  for (const s of demandSignals) {
    const theme = s.canonical.wants?.trim() || "Unspecified";
    // Normalize to first 80 chars to group similar wants
    const key = theme.slice(0, 80).toLowerCase();
    demandThemes.set(key, (demandThemes.get(key) || 0) + 1);
  }

  // Group supply by offers
  const supplyThemes = new Map<string, number>();
  for (const s of supplySignals) {
    const theme = s.canonical.offers?.trim() || s.canonical.wants?.trim() || "Unspecified";
    const key = theme.slice(0, 80).toLowerCase();
    supplyThemes.set(key, (supplyThemes.get(key) || 0) + 1);
  }

  // Build top themes for the prompt (top 20 each, sorted by count)
  const sortedDemand = [...demandThemes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  const sortedSupply = [...supplyThemes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  let aggregateText = `MARKET DATA:\n`;
  aggregateText += `Total signals: ${signals.length} (${demandSignals.length} demand, ${supplySignals.length} supply)\n\n`;

  aggregateText += `DEMAND THEMES (what companies are looking for):\n`;
  for (const [theme, count] of sortedDemand) {
    aggregateText += `- "${theme}" (${count} signals)\n`;
  }

  aggregateText += `\nSUPPLY THEMES (what providers offer):\n`;
  for (const [theme, count] of sortedSupply) {
    aggregateText += `- "${theme}" (${count} signals)\n`;
  }

  // Add sample companies for context (up to 10 demand, 10 supply)
  const sampleDemand = demandSignals
    .filter((s) => s.canonical.company)
    .slice(0, 10);
  const sampleSupply = supplySignals
    .filter((s) => s.canonical.company)
    .slice(0, 10);

  if (sampleDemand.length > 0) {
    aggregateText += `\nSAMPLE DEMAND COMPANIES:\n`;
    for (const s of sampleDemand) {
      aggregateText += `- ${s.canonical.company}: ${s.canonical.wants || "N/A"} (${s.canonical.why_now || "no urgency signal"})\n`;
    }
  }

  if (sampleSupply.length > 0) {
    aggregateText += `\nSAMPLE SUPPLY PROVIDERS:\n`;
    for (const s of sampleSupply) {
      aggregateText += `- ${s.canonical.company}: ${s.canonical.offers || s.canonical.wants || "N/A"}\n`;
    }
  }

  return { demandSignals, supplySignals, demandThemes, supplyThemes, aggregateText };
}

/**
 * Compute data quality metrics from signals (server-side, no AI needed).
 */
function computeDataQuality(signals: Signal[]): {
  totalSignals: number;
  withCompanyName: number;
  enrichmentReady: number;
} {
  const totalSignals = signals.length;
  const withCompanyName = signals.filter(
    (s) => s.canonical.company && s.canonical.company.trim().length > 0,
  ).length;
  // Enrichment ready = has company + has domain + confidence >= 0.5
  const enrichmentReady = signals.filter(
    (s) =>
      s.canonical.company &&
      s.canonical.company.trim().length > 0 &&
      s.canonical.domain &&
      s.canonical.domain.trim().length > 0 &&
      (s.canonical.confidence || 0) >= 0.5,
  ).length;

  return { totalSignals, withCompanyName, enrichmentReady };
}

/**
 * Call Azure OpenAI to generate market analysis.
 */
async function callAI(aggregateText: string): Promise<{
  demandSummary: string;
  supplySummary: string;
  demandSegments: { name: string; count: number }[];
  supplySegments: { name: string; count: number }[];
}> {
  const endpoint = "https://outreachking.openai.azure.com";
  const apiKey = Deno.env.get("AZURE_API_KEY");
  if (!apiKey) {
    throw new Error("AZURE_API_KEY not configured");
  }
  const deployment = "gpt-4o";
  const apiVersion = "2025-01-01-preview";

  const systemPrompt =
    "You are summarizing a market dataset for a business user. Write in plain, confident language. No jargon. No qualifiers. State what exists.";

  const userPrompt = `Analyze this market data and return a JSON object with exactly these fields:
- "demandSummary": 2-3 sentences describing the demand side (what companies are looking for)
- "supplySummary": 2-3 sentences describing the supply side (what providers offer)
- "demandSegments": array of { "name": string, "count": number } grouping demand into named segments with counts
- "supplySegments": array of { "name": string, "count": number } grouping supply into named segments with counts

Group similar themes into clear segment names. Use proper capitalization for segment names. Counts should reflect the actual signal data.

${aggregateText}`;

  const res = await fetch(
    `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Azure AI call failed: ${res.status} ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("AI returned empty content");
  }

  const parsed = JSON.parse(content);

  return {
    demandSummary: parsed.demandSummary || "No demand summary available.",
    supplySummary: parsed.supplySummary || "No supply summary available.",
    demandSegments: Array.isArray(parsed.demandSegments) ? parsed.demandSegments : [],
    supplySegments: Array.isArray(parsed.supplySegments) ? parsed.supplySegments : [],
  };
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
    const body: AnalyzeRequest = await req.json();
    const { marketId, signals } = body;

    if (!marketId) {
      return new Response(
        JSON.stringify({ error: "marketId is required" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!signals || signals.length === 0) {
      return new Response(
        JSON.stringify({ error: "signals array is required and must not be empty" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[mcp-analyze] Market ${marketId}: ${signals.length} signals`);

    // =========================================================================
    // CHECK CACHE
    // =========================================================================

    const cached = await getCachedAnalysis(supabase, marketId);
    if (cached) {
      console.log(`[mcp-analyze] Cache hit for market ${marketId}`);
      return new Response(
        JSON.stringify({
          marketId: cached.market_id,
          demandSummary: cached.demand_summary,
          supplySummary: cached.supply_summary,
          demandSegments: cached.demand_segments,
          supplySegments: cached.supply_segments,
          dataQuality: cached.data_quality,
          cached: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // =========================================================================
    // AGGREGATE SIGNALS
    // =========================================================================

    const { aggregateText } = aggregateSignals(signals);

    // =========================================================================
    // COMPUTE DATA QUALITY (server-side)
    // =========================================================================

    const dataQuality = computeDataQuality(signals);

    // =========================================================================
    // AI CALL
    // =========================================================================

    console.log(`[mcp-analyze] Calling AI for market ${marketId}`);
    const aiResult = await callAI(aggregateText);

    // =========================================================================
    // UPSERT TO CACHE
    // =========================================================================

    const row = {
      market_id: marketId,
      demand_summary: aiResult.demandSummary,
      supply_summary: aiResult.supplySummary,
      demand_segments: aiResult.demandSegments,
      supply_segments: aiResult.supplySegments,
      data_quality: dataQuality,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from("mcp_market_analyses")
      .upsert(row, { onConflict: "market_id" });

    if (upsertError) {
      console.error(`[mcp-analyze] Upsert error: ${upsertError.message}`);
      // Still return the result even if caching fails
    }

    console.log(`[mcp-analyze] Market ${marketId} analysis complete`);

    return new Response(
      JSON.stringify({
        marketId,
        demandSummary: aiResult.demandSummary,
        supplySummary: aiResult.supplySummary,
        demandSegments: aiResult.demandSegments,
        supplySegments: aiResult.supplySegments,
        dataQuality,
        cached: false,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[mcp-analyze] Fatal:", error);

    return new Response(
      JSON.stringify({
        error: (error as Error).message?.slice(0, 200) || "Unknown error",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
