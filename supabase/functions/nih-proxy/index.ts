import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * NIH Reporter API Proxy
 *
 * NIH Reporter has no CORS support — browser will block direct calls.
 * This proxy routes requests server-side to avoid CORS issues.
 *
 * No logic changes. No schema changes. Transport only.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const NIH_API_URL = 'https://api.reporter.nih.gov/v2/projects/search';

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const body = await req.json();

    console.log('[nih-proxy] Forwarding request to NIH Reporter API');

    const response = await fetch(NIH_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[nih-proxy] NIH API error:', response.status, errorText.slice(0, 200));
      return new Response(
        JSON.stringify({ error: `NIH API error: ${response.status}`, details: errorText.slice(0, 500) }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const resultCount = data.results?.length || 0;
    console.log('[nih-proxy] Success, results:', resultCount);

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[nih-proxy] Exception:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
