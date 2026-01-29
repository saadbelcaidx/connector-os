import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * FDA Drug Approvals API Proxy
 *
 * FDA API has no CORS support — browser will block direct calls.
 * This proxy routes requests server-side to avoid CORS issues.
 *
 * Endpoint: https://api.fda.gov/drug/drugsfda.json
 * Pagination: limit + skip parameters
 * No authentication required.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const FDA_API_URL = 'https://api.fda.gov/drug/drugsfda.json';

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    // Parse query parameters from request body or URL
    let params: { limit?: number; skip?: number; search?: string } = {};

    if (req.method === 'POST') {
      params = await req.json();
    } else {
      const url = new URL(req.url);
      params = {
        limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : undefined,
        skip: url.searchParams.get('skip') ? parseInt(url.searchParams.get('skip')!) : undefined,
        search: url.searchParams.get('search') || undefined,
      };
    }

    // Build FDA API URL with query params
    const fdaUrl = new URL(FDA_API_URL);
    if (params.limit) fdaUrl.searchParams.set('limit', params.limit.toString());
    if (params.skip) fdaUrl.searchParams.set('skip', params.skip.toString());
    if (params.search) fdaUrl.searchParams.set('search', params.search);

    console.log('[fda-proxy] Forwarding request to FDA API:', fdaUrl.toString());

    const response = await fetch(fdaUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[fda-proxy] FDA API error:', response.status, errorText.slice(0, 200));
      return new Response(
        JSON.stringify({ error: `FDA API error: ${response.status}`, details: errorText.slice(0, 500) }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const resultCount = data.results?.length || 0;
    console.log('[fda-proxy] Success, results:', resultCount);

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[fda-proxy] Exception:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
