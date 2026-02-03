/**
 * PLATFORM CONFIG EDGE FUNCTION
 *
 * Returns platform configuration by slug.
 * Public endpoint — no auth required (config is needed to render platform).
 *
 * GET /platform-config?slug=acme-corp
 *
 * Uses direct REST API for fast cold starts (no supabase-js import).
 */

import { withCors, jsonResponse, errorResponse, getQueryParam } from '../_shared/http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// =============================================================================
// HANDLER
// =============================================================================

export default withCors(async (req: Request): Promise<Response> => {
  // Only allow GET
  if (req.method !== 'GET') {
    return errorResponse('METHOD_NOT_ALLOWED', 'Only GET requests allowed', 405);
  }

  // Get slug from query params
  const slug = getQueryParam(req, 'slug');

  if (!slug) {
    return errorResponse('MISSING_SLUG', 'Slug parameter is required', 400);
  }

  // Normalize slug
  const normalizedSlug = slug.toLowerCase().trim();

  // Validate slug format (3-30 chars, alphanumeric + hyphens)
  const slugPattern = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
  if (!slugPattern.test(normalizedSlug)) {
    return errorResponse('INVALID_SLUG', 'Invalid slug format', 400);
  }

  try {
    // Direct REST API call (faster cold start than supabase-js)
    const url = `${SUPABASE_URL}/rest/v1/platform_configs?slug=eq.${encodeURIComponent(normalizedSlug)}&enabled=eq.true&select=id,slug,brand_name,logo_url,primary_color,headline,cta_text&limit=1`;

    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('[platform-config] REST API error:', response.status, await response.text());
      return errorResponse('DATABASE_ERROR', 'Failed to fetch configuration', 500);
    }

    const configs = await response.json();
    const config = configs[0] || null;

    if (!config) {
      return errorResponse('NOT_FOUND', 'Platform configuration not found', 404);
    }

    // Return config
    return jsonResponse({
      config: {
        id: config.id,
        slug: config.slug,
        brand_name: config.brand_name,
        logo_url: config.logo_url,
        primary_color: config.primary_color,
        headline: config.headline,
        cta_text: config.cta_text,
      },
    });
  } catch (error) {
    console.error('[platform-config] Unexpected error:', error);
    return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
});
