import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * ClinicalTrials.gov API Proxy
 *
 * ClinicalTrials.gov API v2 — browser CORS issues.
 * This proxy routes requests server-side to avoid CORS issues.
 *
 * Endpoint: https://clinicaltrials.gov/api/v2/studies
 * Pagination: pageSize + nextPageToken
 * No authentication required.
 *
 * Key fields:
 * - protocolSection.contactsLocationsModule.centralContacts[].email (93% coverage)
 * - protocolSection.sponsorCollaboratorsModule.leadSponsor.name (100% coverage)
 * - protocolSection.statusModule.overallStatus (RECRUITING, COMPLETED, etc.)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const CT_API_URL = 'https://clinicaltrials.gov/api/v2/studies';

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Parse query parameters from request body or URL
    let params: {
      pageSize?: number;
      pageToken?: string;
      'filter.overallStatus'?: string;
      'query.cond'?: string;
      'query.term'?: string;
    } = {};

    if (req.method === 'POST') {
      params = await req.json();
    } else {
      const url = new URL(req.url);
      params = {
        pageSize: url.searchParams.get('pageSize') ? parseInt(url.searchParams.get('pageSize')!) : undefined,
        pageToken: url.searchParams.get('pageToken') || undefined,
        'filter.overallStatus': url.searchParams.get('filter.overallStatus') || undefined,
        'query.cond': url.searchParams.get('query.cond') || undefined,
        'query.term': url.searchParams.get('query.term') || undefined,
      };
    }

    // Build ClinicalTrials API URL with query params
    const ctUrl = new URL(CT_API_URL);
    if (params.pageSize) ctUrl.searchParams.set('pageSize', params.pageSize.toString());
    if (params.pageToken) ctUrl.searchParams.set('pageToken', params.pageToken);
    if (params['filter.overallStatus']) ctUrl.searchParams.set('filter.overallStatus', params['filter.overallStatus']);
    if (params['query.cond']) ctUrl.searchParams.set('query.cond', params['query.cond']);
    if (params['query.term']) ctUrl.searchParams.set('query.term', params['query.term']);

    console.log('[clinicaltrials-proxy] Forwarding request to ClinicalTrials.gov API');

    const response = await fetch(ctUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[clinicaltrials-proxy] CT API error:', response.status, errorText.slice(0, 200));
      return new Response(
        JSON.stringify({ error: `ClinicalTrials API error: ${response.status}`, details: errorText.slice(0, 500) }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const resultCount = data.studies?.length || 0;
    console.log('[clinicaltrials-proxy] Success, results:', resultCount, 'nextPageToken:', !!data.nextPageToken);

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[clinicaltrials-proxy] Exception:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
