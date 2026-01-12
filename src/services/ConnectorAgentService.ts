/**
 * ConnectorAgentService.ts
 *
 * Integration with Connector Agent API for email verification and finding.
 * Replaces SSM verify/find as the primary provider in Flow enrichment.
 */

// Use centralized API config - same as ConnectorAgent.tsx
const CONNECTOR_AGENT_API = import.meta.env.VITE_CONNECTOR_AGENT_API || 'https://api.connector-os.com';

export interface ConnectorAgentVerifyResult {
  success: boolean;
  email?: string;
  verdict?: 'VALID' | 'INVALID' | 'UNKNOWN';
}

export interface ConnectorAgentFindResult {
  success: boolean;
  email?: string;
}

/**
 * Verify a single email using Connector Agent
 */
export async function connectorAgentVerify(
  apiKey: string,
  email: string
): Promise<ConnectorAgentVerifyResult> {
  console.log(`[ConnectorAgent] Verifying: ${email}`);

  if (!apiKey || !email) {
    console.error('[ConnectorAgent] Missing required parameters');
    return { success: false };
  }

  try {
    const response = await fetch(`${CONNECTOR_AGENT_API}/api/email/v2/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      console.error('[ConnectorAgent] API error:', response.status);
      return { success: false };
    }

    const data = await response.json();

    if (data.success && data.verdict) {
      console.log(`[ConnectorAgent] Verified ${email}: ${data.verdict}`);
      return {
        success: true,
        email: data.email || email,
        verdict: data.verdict,
      };
    }

    return { success: false };
  } catch (err) {
    console.error('[ConnectorAgent] Verify error:', err);
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
  domain: string
): Promise<ConnectorAgentFindResult> {
  console.log(`[ConnectorAgent] Finding: ${firstName} ${lastName} @ ${domain}`);

  if (!apiKey || !firstName || !lastName || !domain) {
    console.error('[ConnectorAgent] Missing required parameters');
    return { success: false };
  }

  try {
    const response = await fetch(`${CONNECTOR_AGENT_API}/api/email/v2/find`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ firstName, lastName, domain }),
    });

    if (!response.ok) {
      console.error('[ConnectorAgent] API error:', response.status);
      return { success: false };
    }

    const data = await response.json();

    if (data.success && data.email) {
      console.log(`[ConnectorAgent] Found: ${data.email}`);
      return {
        success: true,
        email: data.email,
      };
    }

    console.log(`[ConnectorAgent] Not found for ${firstName} ${lastName} @ ${domain}`);
    return { success: false };
  } catch (err) {
    console.error('[ConnectorAgent] Find error:', err);
    return { success: false };
  }
}
