import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// =============================================================================
// PLUSVIBE CONFIG — CANONICAL BASE URL
// =============================================================================

const PLUSVIBE_BASE_URL = 'https://api.plusvibe.ai/api/v1';

// Startup assertion: prevent misconfiguration
// DNS error happens if someone uses api.plusvibe.com (doesn't exist)
if (PLUSVIBE_BASE_URL.includes('plusvibe.com')) {
  throw new Error('CONFIG_INVALID: PlusVibe base URL must be api.plusvibe.ai/api/v1, not plusvibe.com');
}

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
    const { apiKey, workspaceId, payload } = await req.json();

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Plusvibe API key required', resultStatus: 'error' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (!workspaceId) {
      return new Response(
        JSON.stringify({ error: 'Plusvibe workspace ID required', resultStatus: 'error' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('[Plusvibe Proxy] Received payload:', JSON.stringify(payload, null, 2));

    // Map Connector OS lead format → Plusvibe format
    const plusvibePayload = {
      workspace_id: workspaceId,
      campaign_id: payload.campaign_id,
      skip_if_in_workspace: true,
      skip_lead_in_active_pause_camp: true,
      leads: [{
        email: payload.email,
        first_name: payload.first_name || '',
        last_name: payload.last_name || '',
        company_name: payload.company || '',
        company_website: payload.website || '',
        custom_variables: {
          personalization: payload.personalization || '',
          send_type: payload.custom_fields?.send_type || '',
          contact_title: payload.custom_fields?.contact_title || '',
        },
      }],
    };

    console.log('[Plusvibe Proxy] Mapped to Plusvibe format:', JSON.stringify(plusvibePayload, null, 2));

    // Plusvibe API endpoint for adding leads (per API docs)
    const plusvibeResponse = await fetch(`${PLUSVIBE_BASE_URL}/lead/add`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(plusvibePayload)
    });

    const rawResponseText = await plusvibeResponse.text();
    console.log('[Plusvibe Proxy] Raw response:', rawResponseText);

    if (!plusvibeResponse.ok) {
      console.error('[Plusvibe Proxy] API Error:', plusvibeResponse.status);

      let errorDetails = rawResponseText;
      try {
        const errorJson = JSON.parse(rawResponseText);
        errorDetails = errorJson.message || errorJson.error || rawResponseText;
      } catch {
        // Keep as text
      }

      return new Response(
        JSON.stringify({
          error: `Plusvibe API error: ${plusvibeResponse.status}`,
          details: errorDetails,
          resultStatus: 'error'
        }),
        {
          status: plusvibeResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    let data: any = {};
    try {
      data = JSON.parse(rawResponseText);
    } catch {
      console.warn('[Plusvibe Proxy] Response was not JSON:', rawResponseText);
      data = { raw: rawResponseText };
    }

    console.log('[Plusvibe Proxy] Parsed response:', JSON.stringify(data, null, 2));

    // Determine result status
    let resultStatus = 'added';
    if (data.skipped || data.duplicate) {
      resultStatus = 'skipped';
    } else if (data.error) {
      resultStatus = 'error';
    }

    return new Response(JSON.stringify({
      ...data,
      resultStatus
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Plusvibe Proxy] Exception:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        resultStatus: 'error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
