import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { apiKey, payload } = await req.json();

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Instantly API key required' }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    console.log('[Instantly Proxy] Calling Instantly API with payload:', payload);

    const instantlyResponse = await fetch('https://api.instantly.ai/api/v2/leads', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!instantlyResponse.ok) {
      const errorText = await instantlyResponse.text();
      console.error('[Instantly Proxy] API Error:', instantlyResponse.status, errorText);
      console.error('[Instantly Proxy] Request payload was:', JSON.stringify(payload));
      console.error('[Instantly Proxy] API Key (first 10 chars):', apiKey.substring(0, 10) + '...');

      let errorDetails = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorDetails = errorJson.message || errorJson.error || errorText;
      } catch {
        errorDetails = errorText;
      }

      return new Response(
        JSON.stringify({
          error: `Instantly API error: ${instantlyResponse.status}`,
          details: errorDetails,
          rawError: errorText
        }),
        {
          status: instantlyResponse.status,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    const data = await instantlyResponse.json();
    console.log('[Instantly Proxy] Success:', data);

    return new Response(JSON.stringify(data), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('[Instantly Proxy] Exception:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
});