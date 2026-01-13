/**
 * fetchWithTimeout.ts
 *
 * Shared fetch wrapper with AbortController timeout, bounded retries,
 * normalized error objects, and per-request correlation IDs.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface FetchError {
  code: string;
  message: string;
  status?: number;
  retriable: boolean;
  url: string;
  correlationId: string;
  cause?: any;
}

export interface FetchJsonOptions extends RequestInit {
  timeoutMs: number;
  retries?: number;
  retryDelayMs?: number;
  retryOn?: (err: FetchError, attempt: number) => boolean;
  correlationId?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_RETRIES = 0;
const DEFAULT_RETRY_DELAY_MS = 300;

// Status codes that are retriable
const RETRIABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

// Status codes that are never retriable
const NON_RETRIABLE_STATUS_CODES = new Set([400, 401, 403, 404]);

// =============================================================================
// HELPERS
// =============================================================================

function isRetriableStatus(status: number): boolean {
  if (NON_RETRIABLE_STATUS_CODES.has(status)) return false;
  if (RETRIABLE_STATUS_CODES.has(status)) return true;
  // 5xx range is retriable
  return status >= 500 && status < 600;
}

function createFetchError(
  code: string,
  message: string,
  url: string,
  correlationId: string,
  retriable: boolean,
  status?: number,
  cause?: any
): FetchError {
  return { code, message, status, retriable, url, correlationId, cause };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Fetch JSON with timeout, retries, and normalized errors.
 */
export async function fetchJson<T>(
  url: string,
  options: FetchJsonOptions
): Promise<T> {
  const {
    timeoutMs,
    retries = DEFAULT_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    retryOn,
    correlationId = `cid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...fetchInit
  } = options;

  let lastError: FetchError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchInit,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle non-2xx responses
      if (!response.ok) {
        const retriable = isRetriableStatus(response.status);
        const error = createFetchError(
          `HTTP_${response.status}`,
          `HTTP ${response.status}: ${response.statusText}`,
          url,
          correlationId,
          retriable,
          response.status
        );

        // Check if we should retry
        if (attempt < retries && retriable) {
          const shouldRetry = retryOn ? retryOn(error, attempt) : true;
          if (shouldRetry) {
            lastError = error;
            const delay = retryDelayMs * (attempt + 1);
            await sleep(delay);
            continue;
          }
        }

        throw error;
      }

      // Parse JSON
      let data: T;
      try {
        data = await response.json();
      } catch (parseError) {
        const retriable = response.status >= 500;
        throw createFetchError(
          'BAD_JSON',
          'Failed to parse JSON response',
          url,
          correlationId,
          retriable,
          response.status,
          parseError
        );
      }

      return data;

    } catch (err: any) {
      clearTimeout(timeoutId);

      // Already a FetchError - check retry
      if (err && typeof err === 'object' && 'code' in err && 'retriable' in err) {
        const fetchErr = err as FetchError;
        if (attempt < retries && fetchErr.retriable) {
          const shouldRetry = retryOn ? retryOn(fetchErr, attempt) : true;
          if (shouldRetry) {
            lastError = fetchErr;
            const delay = retryDelayMs * (attempt + 1);
            await sleep(delay);
            continue;
          }
        }
        throw fetchErr;
      }

      // Abort/timeout error
      if (err.name === 'AbortError') {
        const error = createFetchError(
          'TIMEOUT',
          `Request timed out after ${timeoutMs}ms`,
          url,
          correlationId,
          true,
          undefined,
          err
        );

        if (attempt < retries) {
          const shouldRetry = retryOn ? retryOn(error, attempt) : true;
          if (shouldRetry) {
            lastError = error;
            const delay = retryDelayMs * (attempt + 1);
            await sleep(delay);
            continue;
          }
        }

        throw error;
      }

      // Network error (fetch failed entirely)
      const error = createFetchError(
        'NETWORK_ERROR',
        err.message || 'Network request failed',
        url,
        correlationId,
        true,
        undefined,
        err
      );

      if (attempt < retries) {
        const shouldRetry = retryOn ? retryOn(error, attempt) : true;
        if (shouldRetry) {
          lastError = error;
          const delay = retryDelayMs * (attempt + 1);
          await sleep(delay);
          continue;
        }
      }

      throw error;
    }
  }

  // Should not reach here, but if we do, throw last error
  throw lastError || createFetchError(
    'UNKNOWN',
    'Unknown error',
    url,
    correlationId,
    false
  );
}

/**
 * Check if an error is a FetchError.
 */
export function isFetchError(err: unknown): err is FetchError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    'retriable' in err &&
    'correlationId' in err
  );
}
