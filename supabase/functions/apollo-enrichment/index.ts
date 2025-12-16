import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, x-client-info, apikey, x-api-key",
};

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
        JSON.stringify({ error: 'Missing required parameters: type and apiKey' }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    console.log('[Apollo Proxy] Request type:', type);
    console.log('[Apollo Proxy] Parameters:', JSON.stringify(params, null, 2));

    let apolloUrl: string;
    let apolloMethod: string;
    let apolloPayload: any = null;

    switch (type) {
      case 'org_search':
        apolloUrl = 'https://api.apollo.io/api/v1/organizations/search';
        apolloMethod = 'POST';
        apolloPayload = params.payload;
        break;

      case 'org_enrich':
        apolloUrl = `https://api.apollo.io/api/v1/organizations/enrich?domain=${encodeURIComponent(params.domain)}`;
        apolloMethod = 'GET';
        break;

      case 'people_match':
        apolloUrl = 'https://api.apollo.io/api/v1/people/match';
        apolloMethod = 'POST';
        apolloPayload = params.payload;
        break;

      case 'people_search':
        apolloUrl = 'https://api.apollo.io/v1/mixed_people/search';
        apolloMethod = 'POST';

        const { domain, organization_name, titles, seniorities, departments, keywords } = params;
        apolloPayload = {
          page: 1,
          per_page: 25
        };

        // Support searching by either domain OR organization name
        // Use organization_name when domain is fake/auto-generated
        if (organization_name) {
          // Search by company name (useful when no valid domain exists)
          apolloPayload.q_organization_name = organization_name;
          console.log('[Apollo Proxy] Searching by organization name:', organization_name);
        } else if (domain) {
          // Search by domain (preferred when domain is real)
          apolloPayload.q_organization_domains_list = [domain];
          console.log('[Apollo Proxy] Searching by domain:', domain);
        } else {
          return new Response(
            JSON.stringify({ error: 'people_search requires either domain or organization_name' }),
            {
              status: 400,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
              },
            }
          );
        }

        // Use departments for functional targeting (e.g., engineering, sales, marketing)
        if (departments && departments.length > 0) {
          apolloPayload.person_departments = departments;
        }

        // Use person_titles for specific role targeting
        if (titles && titles.length > 0) {
          apolloPayload.person_titles = titles;
          apolloPayload.include_similar_titles = true;
        }

        // Use seniorities as a filter layer
        if (seniorities && seniorities.length > 0) {
          apolloPayload.person_seniorities = seniorities;
        }

        // Free-text keyword search for additional precision
        if (keywords) {
          apolloPayload.q_keywords = keywords;
        }

        // Default: if nothing specified, target decision makers
        if (!titles?.length && !seniorities?.length && !departments?.length) {
          apolloPayload.person_seniorities = ['c_suite', 'vp', 'director', 'manager'];
        }
        break;

      case 'work_owner_search':
        // New: Work Owner Search using mixed_people/search with keywords
        apolloUrl = 'https://api.apollo.io/v1/mixed_people/search';
        apolloMethod = 'POST';

        apolloPayload = {
          page: 1,
          per_page: 10,
          person_titles: [],
          include_similar_titles: false,
          q_keywords: params.keywords || '',
          q_organization_domains_list: [params.domain],
        };

        console.log('[Apollo Proxy] Work Owner Search payload:', JSON.stringify(apolloPayload, null, 2));
        break;

      default:
        return new Response(
          JSON.stringify({ error: `Unknown request type: ${type}` }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        );
    }

    console.log('[Apollo Proxy] Calling Apollo API:', apolloUrl);
    if (apolloPayload) {
      console.log('[Apollo Proxy] Apollo API payload:', JSON.stringify(apolloPayload, null, 2));
    }

    const fetchOptions: RequestInit = {
      method: apolloMethod,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
    };

    if (apolloPayload) {
      fetchOptions.body = JSON.stringify(apolloPayload);
    }

    const apolloResponse = await fetch(apolloUrl, fetchOptions);

    if (!apolloResponse.ok) {
      const errorText = await apolloResponse.text();
      console.error('[Apollo Proxy] Apollo API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Apollo API request failed', details: errorText }),
        {
          status: apolloResponse.status,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const apolloData = await apolloResponse.json();
    console.log('[Apollo Proxy] Apollo API response received successfully');

    return new Response(
      JSON.stringify(apolloData),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('[Apollo Proxy] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
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