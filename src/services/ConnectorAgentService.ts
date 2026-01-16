/**
 * ConnectorAgentService.ts
 *
 * Integration with Connector Agent API for email verification and finding.
 * Replaces SSM verify/find as the primary provider in Flow enrichment.
 */

import { fetchJson, FetchError, isFetchError } from '../utils/fetchWithTimeout';

// Use centralized API config - same as ConnectorAgent.tsx
const CONNECTOR_AGENT_API = import.meta.env.VITE_CONNECTOR_AGENT_API || 'https://api.connector-os.com';

// Timeouts
const VERIFY_TIMEOUT_MS = 12_000;
const FIND_TIMEOUT_MS = 18_000;
const RETRIES = 1;

export interface ConnectorAgentVerifyResult {
  success: boolean;
  email?: string;
  verdict?: 'VALID' | 'INVALID' | 'UNKNOWN';
}

export interface ConnectorAgentFindResult {
  success: boolean;
  email?: string;
}

interface VerifyResponse {
  success?: boolean;
  email?: string;
  verdict?: string;
  status?: string;
}

interface FindResponse {
  success?: boolean;
  email?: string | null;
}

/**
 * Verify a single email using Connector Agent
 */
export async function connectorAgentVerify(
  apiKey: string,
  email: string,
  correlationId?: string
): Promise<ConnectorAgentVerifyResult> {
  const startMs = Date.now();
  const cid = correlationId || `verify-${Date.now()}`;

  if (!apiKey || !email) {
    console.log(`[Enrichment] cid=${cid} step=VERIFY provider=connectorAgent ms=0 ok=0 code=MISSING_PARAMS`);
    return { success: false };
  }

  try {
    const data = await fetchJson<VerifyResponse>(
      `${CONNECTOR_AGENT_API}/api/email/v2/verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ email }),
        timeoutMs: VERIFY_TIMEOUT_MS,
        retries: RETRIES,
        correlationId: cid,
      }
    );

    const ms = Date.now() - startMs;

    // Handle response - check both patterns (success+verdict or email+status)
    if (data.email && (data.status === 'valid' || data.verdict === 'VALID')) {
      console.log(`[Enrichment] cid=${cid} step=VERIFY provider=connectorAgent ms=${ms} ok=1`);
      return {
        success: true,
        email: data.email || email,
        verdict: 'VALID',
      };
    }

    if (data.success && data.verdict) {
      console.log(`[Enrichment] cid=${cid} step=VERIFY provider=connectorAgent ms=${ms} ok=${data.verdict === 'VALID' ? 1 : 0}`);
      return {
        success: true,
        email: data.email || email,
        verdict: data.verdict as 'VALID' | 'INVALID' | 'UNKNOWN',
      };
    }

    console.log(`[Enrichment] cid=${cid} step=VERIFY provider=connectorAgent ms=${ms} ok=0 code=NO_VERDICT`);
    return { success: false };

  } catch (err) {
    const ms = Date.now() - startMs;
    const code = isFetchError(err) ? err.code : 'ERROR';
    console.log(`[Enrichment] cid=${cid} step=VERIFY provider=connectorAgent ms=${ms} ok=0 code=${code}`);
    return { success: false };
  }
}

/**
 * Find email by name + domain using Connector Agent
 */
export async function connectorAgentFind(
  apiKey: string,
  firstName: string,
  lastName: string,
  domain: string,
  correlationId?: string
): Promise<ConnectorAgentFindResult> {
  const startMs = Date.now();
  const cid = correlationId || `find-${Date.now()}`;

  if (!apiKey || !firstName || !lastName || !domain) {
    console.log(`[Enrichment] cid=${cid} step=FIND provider=connectorAgent ms=0 ok=0 code=MISSING_PARAMS`);
    return { success: false };
  }

  try {
    const data = await fetchJson<FindResponse>(
      `${CONNECTOR_AGENT_API}/api/email/v2/find`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ firstName, lastName, domain }),
        timeoutMs: FIND_TIMEOUT_MS,
        retries: RETRIES,
        correlationId: cid,
      }
    );

    const ms = Date.now() - startMs;

    if (data.email) {
      console.log(`[Enrichment] cid=${cid} step=FIND provider=connectorAgent ms=${ms} ok=1`);
      return {
        success: true,
        email: data.email,
      };
    }

    console.log(`[Enrichment] cid=${cid} step=FIND provider=connectorAgent ms=${ms} ok=0 code=NOT_FOUND`);
    return { success: false };

  } catch (err) {
    const ms = Date.now() - startMs;
    const code = isFetchError(err) ? err.code : 'ERROR';
    console.log(`[Enrichment] cid=${cid} step=FIND provider=connectorAgent ms=${ms} ok=0 code=${code}`);
    return { success: false };
  }
}
