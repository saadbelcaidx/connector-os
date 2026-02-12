import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, x-client-info, apikey, x-api-key",
};

const ANYMAIL_BASE_URL = "https://api.anymailfinder.com/v5.1";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { type, apiKey, ...params } = await req.json();

    if (!type || !apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required parameters: type and apiKey' }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    console.log('[Anymail Proxy] Request type:', type);

    let anymailUrl: string;
    let anymailPayload: any = {};

    switch (type) {
      case 'find_person':
        // Find email by person name + domain OR company_name
        // Anymail API requires: (domain OR company_name) AND (full_name OR first_name+last_name)
        if ((!params.domain && !params.company_name) || (!params.full_name && !params.first_name)) {
          return new Response(
            JSON.stringify({ success: false, error: 'find_person requires (domain or company_name) and (full_name or first_name+last_name)' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        anymailUrl = `${ANYMAIL_BASE_URL}/find-email/person`;
        anymailPayload = {};
        if (params.domain) {
          anymailPayload.domain = params.domain;
        } else {
          anymailPayload.company_name = params.company_name;
        }
        if (params.full_name) {
          anymailPayload.full_name = params.full_name;
        } else {
          anymailPayload.first_name = params.first_name;
          anymailPayload.last_name = params.last_name;
        }
        break;

      case 'find_decision_maker':
        // Find decision maker by category
        if (!params.domain && !params.company_name) {
          return new Response(
            JSON.stringify({ success: false, error: 'find_decision_maker requires domain or company_name' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        anymailUrl = `${ANYMAIL_BASE_URL}/find-email/decision-maker`;
        anymailPayload = {
          decision_maker_category: params.categories || ['ceo'],
        };
        if (params.domain) {
          anymailPayload.domain = params.domain;
        } else {
          anymailPayload.company_name = params.company_name;
        }
        break;

      case 'search_domain':
        // Search all emails at a domain/company
        if (!params.domain) {
          return new Response(
            JSON.stringify({ success: false, error: 'search_domain requires domain' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        anymailUrl = `${ANYMAIL_BASE_URL}/find-email/company`;
        anymailPayload = {
          domain: params.domain,
        };
        break;

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown request type: ${type}` }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        );
    }

    console.log('[Anymail Proxy] Calling:', anymailUrl);
    console.log('[Anymail Proxy] Payload:', JSON.stringify(anymailPayload));

    const anymailResponse = await fetch(anymailUrl, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(anymailPayload),
    });

    const responseText = await anymailResponse.text();
    console.log('[Anymail Proxy] Response status:', anymailResponse.status);
    console.log('[Anymail Proxy] Response:', responseText);

    let anymailData;
    try {
      anymailData = JSON.parse(responseText);
    } catch {
      anymailData = { raw: responseText };
    }

    if (!anymailResponse.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Anymail API request failed',
          details: anymailData,
          status: anymailResponse.status
        }),
        {
          status: anymailResponse.status,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Normalize response format - Anymail API uses person_full_name, person_job_title, etc.
    const normalizedResponse = {
      success: true,
      email: anymailData.email || anymailData.valid_email || anymailData.result?.email || null,
      emails: anymailData.emails || anymailData.results?.map((r: any) => r.email) || [],
      name: anymailData.person_full_name || anymailData.name || anymailData.result?.name || null,
      title: anymailData.person_job_title || anymailData.title || anymailData.result?.title || null,
      linkedin: anymailData.person_linkedin_url || anymailData.linkedin || null,
      confidence: anymailData.confidence || anymailData.result?.confidence || null,
      credits_used: anymailData.credits_used || 1,
      raw: anymailData,
    };

    return new Response(
      JSON.stringify(normalizedResponse),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('[Anymail Proxy] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error', details: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
