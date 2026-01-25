import { supabase } from '../lib/supabase';
import { composeIntroWithEdge } from '../edge';
import type { IntroSide, IntroContext, Match } from '../edge';

interface InstantlyLeadPayload {
  campaign: string;  // Note: "campaign" not "campaign_id"
  email: string;
  first_name: string;
  last_name: string;
  company_name: string;
  website: string;
  personalization: string;
  skip_if_in_workspace: boolean;
  skip_if_in_campaign: boolean;
  skip_if_in_list: boolean;
  custom_variables?: Record<string, any>;
}

// =============================================================================
// RICH RESULT TYPES — Apple-style language (no "failure" words)
// =============================================================================

export type SendStatus = 'new' | 'existing' | 'needs_attention';

export interface RichSendResult {
  success: boolean;
  status: SendStatus;
  leadId?: string;
  detail?: string;  // Human-readable detail for UI
}

// UUID v4 format validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate campaign ID format before sending
 */
export function validateCampaignId(campaignId: string): { valid: boolean; message?: string } {
  if (!campaignId) {
    return { valid: false, message: 'Campaign ID is required' };
  }
  if (!UUID_REGEX.test(campaignId)) {
    return { valid: false, message: 'Campaign ID format is invalid' };
  }
  return { valid: true };
}

export interface DualSendParams {
  campaignId: string;
  email: string;
  first_name: string;
  last_name: string;
  company_name: string;
  website?: string;
  type: 'DEMAND' | 'SUPPLY';
  signal_metadata?: Record<string, any>;
  contact_title?: string;
  company_domain?: string;
  intro_text?: string;
  // Scoring telemetry (separated)
  operator_fit_score?: number;      // Old: demand → operator fit (0-100)
  supply_match_score?: number;      // New: demand → supply fit (45-70+)
  supply_match_reasoning?: string;  // Operator-style reasoning for match
  supply_domain?: string;           // Which provider was selected
}

/**
 * Generate fallback intro text when AI is not configured.
 * PHASE 7: Routes through edge module — PROBE intro (safe, permission-asking).
 */
function generateIntroText(type: 'DEMAND' | 'SUPPLY', firstName: string, companyName: string, _signal?: string): string {
  const ctx: IntroContext = {
    firstName: firstName || 'there',
    company: companyName || 'a company',
    summary: null,
  };

  const match: Match = {
    mode: 'b2b_broad',
    demand: { domain: 'unknown', summary: null },
    supply: { domain: 'unknown', summary: null },
    edge: null, // No edge = PROBE intro
  };

  const result = composeIntroWithEdge(type === 'DEMAND' ? 'demand' : 'supply', match, ctx);
  return result.intro || '';
}

export async function sendToInstantly(
  apiKey: string,
  params: DualSendParams
): Promise<RichSendResult> {
  console.log(`[InstantlyService] Sending ${params.type} lead to campaign ${params.campaignId}`);
  console.log(`[InstantlyService] Contact: ${params.email} (${params.first_name} ${params.last_name})`);

  // Pre-flight: Validate campaign ID format
  const validation = validateCampaignId(params.campaignId);
  if (!validation.valid) {
    return {
      success: false,
      status: 'needs_attention',
      detail: validation.message,
    };
  }

  try {
    const introText = params.intro_text || generateIntroText(
      params.type,
      params.first_name,
      params.company_name,
      params.signal_metadata?.signal_type
    );

    console.log(`[InstantlyService] ${params.intro_text ? 'Using provided' : 'Generated'} intro text:`, introText);

    const payload: InstantlyLeadPayload = {
      campaign: params.campaignId,
      email: params.email,
      first_name: params.first_name,
      last_name: params.last_name,
      company_name: params.company_name,
      website: params.website || '',
      personalization: introText,
      skip_if_in_workspace: true,
      skip_if_in_campaign: true,
      skip_if_in_list: true,
      custom_variables: {
        send_type: params.type,
        signal_metadata: JSON.stringify(params.signal_metadata || {})
      }
    };

    console.log(`[InstantlyService] Full payload:`, JSON.stringify(payload, null, 2));

    const result = await createInstantlyLeadRich(apiKey, payload);

    if (result.success) {
      // Fire-and-forget - don't block send on DB logging
      recordSend(params, introText);
    }

    return result;
  } catch (error) {
    console.error(`[InstantlyService] Exception in sendToInstantly:`, error);
    return {
      success: false,
      status: 'needs_attention',
      detail: error instanceof Error ? error.message : 'Something went wrong',
    };
  }
}

async function recordSend(params: DualSendParams, introText: string, retryCount = 0): Promise<void> {
  const MAX_RETRIES = 2;
  const RETRY_DELAY_MS = 1000;

  try {
    const { error } = await supabase
      .from('connector_sends')
      .insert({
        user_id: 'default',
        send_type: params.type,
        campaign_id: params.campaignId,
        company_name: params.company_name,
        company_domain: params.company_domain,
        contact_email: params.email,
        contact_name: `${params.first_name} ${params.last_name}`,
        contact_title: params.contact_title,
        intro_text: introText,
        signal_metadata: params.signal_metadata || {},
        instantly_status: 'sent',
        sent_at: new Date().toISOString(),
        // Scoring telemetry (separated)
        operator_fit_score: params.operator_fit_score ?? null,
        supply_match_score: params.supply_match_score ?? null,
        supply_match_reasoning: params.supply_match_reasoning ?? null,
        supply_domain: params.supply_domain ?? null,
      });

    if (error) {
      console.error('[InstantlyService] Failed to record send:', error);
      // Retry on transient errors
      if (retryCount < MAX_RETRIES && (error.code === 'PGRST301' || error.message?.includes('network'))) {
        console.log(`[InstantlyService] Retrying recordSend (${retryCount + 1}/${MAX_RETRIES})...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (retryCount + 1)));
        return recordSend(params, introText, retryCount + 1);
      }
    } else {
      const scoreLog = params.supply_match_score !== undefined ? ` (supply_match: ${params.supply_match_score})` : '';
      console.log(`[InstantlyService] Recorded ${params.type} send to ${params.email}${scoreLog}`);
    }
  } catch (error) {
    console.error('[InstantlyService] Exception recording send:', error);
    // Retry on network exceptions
    if (retryCount < MAX_RETRIES) {
      console.log(`[InstantlyService] Retrying recordSend after exception (${retryCount + 1}/${MAX_RETRIES})...`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (retryCount + 1)));
      return recordSend(params, introText, retryCount + 1);
    }
  }
}

export interface InstantlyLeadResult {
  success: boolean;
  resultStatus: 'added' | 'skipped' | 'skipped_existing' | 'skipped_campaign' | 'error' | string;
  rawResponse?: any;
  error?: string;
}

// TEMPORARY: Set to true to disable skip flags for testing
const DISABLE_SKIPS_FOR_TESTING = false;

export async function createInstantlyLead(
  apiKey: string,
  payload: InstantlyLeadPayload,
  options?: { validateCampaign?: boolean; disableSkips?: boolean }
): Promise<boolean> {
  const result = await createInstantlyLeadRich(apiKey, payload, options);
  return result.success;
}

/**
 * Rich version of createInstantlyLead — returns detailed status for UI
 * Instantly API v2 response (observed 2025-01-25):
 *   SUCCESS: { id: "uuid", status: 1, ... }
 *   EXISTING: { id: "uuid", status: 0, ... } (lead already in campaign)
 *   ERROR: HTTP 4xx with error details
 */
export async function createInstantlyLeadRich(
  apiKey: string,
  payload: InstantlyLeadPayload,
  options?: { validateCampaign?: boolean; disableSkips?: boolean }
): Promise<RichSendResult> {
  console.log('[InstantlyService] Starting lead creation via edge function');

  try {
    const edgeFunctionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instantly-proxy`;

    const disableSkips = options?.disableSkips ?? DISABLE_SKIPS_FOR_TESTING;
    const validateCampaign = options?.validateCampaign ?? false;

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        apiKey,
        payload,
        validateCampaign,
        disableSkips
      })
    });

    console.log(`[InstantlyService] Response status: ${response.status}`);

    // HTTP error responses
    if (!response.ok) {
      const error = await response.json();
      console.error('[InstantlyService] API error:', error);

      // Map HTTP status to user-friendly message
      const detail = response.status === 401
        ? 'Check your Instantly API key in Settings'
        : response.status === 404
        ? 'Campaign not found — check campaign ID'
        : response.status === 429
        ? 'Rate limited — try again shortly'
        : error.details || 'Something went wrong';

      return {
        success: false,
        status: 'needs_attention',
        detail,
      };
    }

    const result = await response.json();
    console.log('[InstantlyService] Response:', JSON.stringify(result, null, 2));

    // SUCCESS: Lead has an ID and status === 1
    if (result.id && result.status === 1) {
      console.log('[InstantlyService] ✓ New lead:', result.id);
      return {
        success: true,
        status: 'new',
        leadId: result.id,
      };
    }

    // EXISTING: Lead has ID but status !== 1 (already in campaign/workspace)
    if (result.id && result.status !== 1) {
      console.log('[InstantlyService] ○ Existing lead:', result.id);
      return {
        success: true,
        status: 'existing',
        leadId: result.id,
        detail: 'Already in campaign',
      };
    }

    // No ID returned — unexpected
    if (!result.id) {
      console.error('[InstantlyService] No lead ID in response:', result);
      return {
        success: false,
        status: 'needs_attention',
        detail: 'Unexpected response from Instantly',
      };
    }

    // Fallback
    return {
      success: true,
      status: 'new',
      leadId: result.id,
    };

  } catch (error) {
    console.error('[InstantlyService] Exception:', error);
    return {
      success: false,
      status: 'needs_attention',
      detail: error instanceof Error ? error.message : 'Connection issue',
    };
  }
}

export async function sendToDemand(
  apiKey: string,
  campaignId: string,
  contact: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    companyName: string;
    domain?: string;
  },
  connector: {
    name: string;
    company: string;
    specialty: string;
  },
  signal: {
    detail: string;
    type?: string;
  },
  aiConfig: any
): Promise<{ success: boolean; error?: string }> {
  console.log('[InstantlyService] sendToDemand called');

  try {
    const { generateDemandIntro } = await import('./AIService');

    const intro = await generateDemandIntro(
      aiConfig,
      {
        firstName: contact.firstName,
        companyName: contact.companyName,
        signalDetail: signal.detail
      },
      connector
    );

    const params: DualSendParams = {
      campaignId,
      email: contact.email,
      first_name: contact.firstName,
      last_name: contact.lastName,
      company_name: contact.companyName,
      website: contact.domain,
      type: 'DEMAND',
      signal_metadata: { signal_type: signal.type },
      intro_text: intro
    };

    const result = await sendToInstantly(apiKey, params);

    if (result.success) {
      await supabase
        .from('signal_history')
        .update({
          demand_status: 'sent',
          demand_sent_at: new Date().toISOString()
        })
        .eq('id', contact.id);

      console.log('[InstantlyService] Demand sent and status updated');
    }

    return result;
  } catch (error) {
    console.error('[InstantlyService] sendToDemand failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function sendToSupply(
  apiKey: string,
  campaignId: string,
  contact: {
    id: number;
    demand_status?: string;
    companyName: string;
    personName: string;
    title: string;
  },
  connector: {
    name: string;
    email: string;
  },
  signal: {
    summary: string;
    fitReason: string;
  },
  aiConfig: any
): Promise<{ success: boolean; error?: string }> {
  console.log('[InstantlyService] sendToSupply called');
  console.log('[InstantlyService] Supply send - no interest gate, sending immediately');

  try {
    const { generateSupplyIntro } = await import('./AIService');

    const intro = await generateSupplyIntro(
      aiConfig,
      {
        company_name: contact.companyName,
        person_name: contact.personName,
        title: contact.title
      },
      signal,
      connector
    );

    const connectorFirstName = connector.name.split(' ')[0];
    const connectorLastName = connector.name.split(' ').slice(1).join(' ') || '';

    const params: DualSendParams = {
      campaignId,
      email: connector.email,
      first_name: connectorFirstName,
      last_name: connectorLastName,
      company_name: contact.companyName,
      type: 'SUPPLY',
      intro_text: intro
    };

    const result = await sendToInstantly(apiKey, params);

    if (result.success) {
      await supabase
        .from('signal_history')
        .update({
          supply_status: 'sent',
          supply_sent_at: new Date().toISOString()
        })
        .eq('id', contact.id);

      console.log('[InstantlyService] Supply sent and status updated');
    }

    return result;
  } catch (error) {
    console.error('[InstantlyService] sendToSupply failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
