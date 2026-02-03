/**
 * HTTP Utilities for Edge Functions
 *
 * Provides CORS handling and JSON response helpers.
 * Used by widget-config, widget-simulate, and other edge functions.
 */

// =============================================================================
// CORS CONFIGURATION
// =============================================================================

/**
 * CORS headers for widget embedding.
 * Allows any origin since widgets are embedded on customer sites.
 */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400', // 24 hours preflight cache
};

// =============================================================================
// CORS WRAPPER
// =============================================================================

/**
 * Wraps an edge function handler with CORS support.
 *
 * Handles OPTIONS preflight requests automatically.
 * Adds CORS headers to all responses.
 *
 * @example
 * ```ts
 * export default withCors(async (req) => {
 *   return jsonResponse({ ok: true });
 * });
 * ```
 */
export function withCors(
  handler: (req: Request) => Promise<Response>
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    try {
      // Call the actual handler
      const response = await handler(req);

      // Add CORS headers to response
      const newHeaders = new Headers(response.headers);
      Object.entries(CORS_HEADERS).forEach(([key, value]) => {
        newHeaders.set(key, value);
      });

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    } catch (error) {
      // Handle uncaught errors with CORS headers
      console.error('[withCors] Uncaught error:', error);
      return jsonResponse(
        { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
        { status: 500 }
      );
    }
  };
}

// =============================================================================
// JSON RESPONSE HELPERS
// =============================================================================

interface JsonResponseOptions {
  status?: number;
  headers?: Record<string, string>;
}

/**
 * Creates a JSON response with CORS headers.
 *
 * @example
 * ```ts
 * return jsonResponse({ data: matches });
 * return jsonResponse({ error: 'NOT_FOUND' }, { status: 404 });
 * ```
 */
export function jsonResponse(
  data: unknown,
  options?: JsonResponseOptions
): Response {
  const status = options?.status ?? 200;
  const additionalHeaders = options?.headers ?? {};

  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      ...additionalHeaders,
    },
  });
}

/**
 * Creates an error response with consistent format.
 *
 * @example
 * ```ts
 * return errorResponse('RATE_LIMITED', 'Too many requests', 429);
 * return errorResponse('INVALID_KEY', 'API key is invalid', 401);
 * ```
 */
export function errorResponse(
  code: string,
  message: string,
  status: number = 400
): Response {
  return jsonResponse(
    {
      error: code,
      message,
    },
    { status }
  );
}

// =============================================================================
// REQUEST PARSING HELPERS
// =============================================================================

/**
 * Safely parses JSON body from request.
 * Returns null if parsing fails.
 */
export async function parseJsonBody<T = unknown>(
  req: Request
): Promise<T | null> {
  try {
    const body = await req.json();
    return body as T;
  } catch {
    return null;
  }
}

/**
 * Extracts query parameters from URL.
 */
export function getQueryParams(req: Request): URLSearchParams {
  const url = new URL(req.url);
  return url.searchParams;
}

/**
 * Gets a single query parameter, or undefined if not present.
 */
export function getQueryParam(req: Request, key: string): string | undefined {
  const params = getQueryParams(req);
  return params.get(key) ?? undefined;
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Validates that required fields are present in an object.
 * Returns array of missing field names.
 */
export function validateRequired(
  obj: Record<string, unknown>,
  requiredFields: string[]
): string[] {
  return requiredFields.filter(
    (field) => obj[field] === undefined || obj[field] === null || obj[field] === ''
  );
}

/**
 * Validates subdomain format.
 * 3-30 chars, alphanumeric + hyphens, no leading/trailing hyphens.
 */
export function isValidSubdomain(subdomain: string): boolean {
  const pattern = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
  return pattern.test(subdomain.toLowerCase());
}

/**
 * List of reserved subdomains that cannot be used.
 */
export const RESERVED_SUBDOMAINS = [
  'www',
  'api',
  'app',
  'admin',
  'help',
  'support',
  'widget',
  'test',
  'demo',
  'staging',
  'mail',
  'ftp',
  'docs',
  'status',
];

/**
 * Checks if subdomain is reserved.
 */
export function isReservedSubdomain(subdomain: string): boolean {
  return RESERVED_SUBDOMAINS.includes(subdomain.toLowerCase());
}

// =============================================================================
// RATE LIMITING HELPERS
// =============================================================================

/**
 * Gets the current hour bucket for rate limiting.
 * Truncates timestamp to the start of the hour.
 */
export function getCurrentHourBucket(): Date {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return now;
}

/**
 * Formats date as ISO string for database storage.
 */
export function formatHourBucket(date: Date): string {
  return date.toISOString();
}
