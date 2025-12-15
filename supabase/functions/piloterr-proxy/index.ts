// Deploy with: npx supabase functions deploy piloterr-proxy --no-verify-jwt
// OR: Dashboard → Edge Functions → piloterr-proxy → Settings → Disable "Verify JWT"

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-piloterr-key, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

serve(async (req) => {
  // ALWAYS allow preflight - no JWT check here
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const url = new URL(req.url);
    const params = url.searchParams.toString();

    const piloterrKey = req.headers.get("x-piloterr-key");
    if (!piloterrKey) {
      return new Response(
        JSON.stringify({ error: "Missing Piloterr API key" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const upstream = `https://piloterr.com/api/v2/crunchbase/funding_rounds?${params}`;

    console.log("[piloterr-proxy] Forwarding:", upstream);

    const res = await fetch(upstream, {
      method: "GET",
      headers: {
        "x-api-key": piloterrKey,
        "Accept": "application/json",
      },
    });

    const body = await res.text();

    if (!res.ok) {
      console.error("[piloterr-proxy] Upstream error:", res.status, body);
      return new Response(
        JSON.stringify({
          error: "Piloterr upstream error",
          status: res.status,
          details: body.substring(0, 500)
        }),
        {
          status: 200, // Return 200 so client can read the error details
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(body, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[piloterr-proxy] Fatal error:", err);
    return new Response(
      JSON.stringify({ error: "Proxy failure" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
