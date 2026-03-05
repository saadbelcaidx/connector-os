import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * instantly-intel — Proxy for Instantly hidden company intel endpoints
 *
 * BYOK: Operator provides their Instantly API key.
 * Platform provides: X-Org-Auth JWT (INSTANTLY_ORG_AUTH env var).
 *
 * Request body: { apiKey: string, domain: string, type: string }
 *   type = "Company+Description" | "Pain+Points" | "Competitors" | "Customer+Profiles"
 *
 * Response: { result: string | null }
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const VALID_TYPES = [
  "Company+Description",
  "Competitors",
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const orgAuth = Deno.env.get("INSTANTLY_ORG_AUTH");
  if (!orgAuth) {
    console.error("[instantly-intel] Missing INSTANTLY_ORG_AUTH env var");
    return new Response(
      JSON.stringify({ error: "Intel endpoint not configured" }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const { apiKey, domain, type } = await req.json();

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Instantly API key required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!domain || typeof domain !== "string" || !domain.includes(".")) {
      return new Response(
        JSON.stringify({ error: "Valid domain required (e.g. acme.com)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!type || !VALID_TYPES.includes(type)) {
      return new Response(
        JSON.stringify({ error: `Invalid type. Use: ${VALID_TYPES.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const url = `https://app.instantly.ai/backend/api/v1/companies/${encodeURIComponent(domain)}/ai/info?type=${type}`;

    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
        "X-Org-Auth": orgAuth,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[instantly-intel] ${res.status} for ${domain} type=${type}: ${text}`);
      return new Response(
        JSON.stringify({ result: null, status: res.status }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await res.json();

    return new Response(
      JSON.stringify({ result: data.result || null }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[instantly-intel] Exception:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
