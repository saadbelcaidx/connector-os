import { supabase } from '../lib/supabase';

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
}

function generateIntroText(type: 'DEMAND' | 'SUPPLY', firstName: string, companyName: string, signal?: string): string {
  const name = firstName.toLowerCase();

  if (type === 'DEMAND') {
    const signalContext = signal === 'hiring'
      ? "noticed you've got an open role"
      : signal === 'funding'
      ? "saw the recent funding news"
      : "saw you're scaling the team";

    return `hey ${name} — ${signalContext}.\nwhen teams stretch, that's usually a real need, not noise.\ni know someone who helps in this spot. want me to connect you?`;
  } else {
    const opportunityContext = signal === 'hiring'
      ? "with hiring pressure right now"
      : signal === 'funding'
      ? "that just raised and is expanding"
      : "that's scaling quickly";

    return `hey ${name} — found a company ${opportunityContext}.\nfeels like the exact kind of problem you already solve.\nwant an intro?`;
  }
}

export async function sendToInstantly(
  apiKey: string,
  params: DualSendParams
): Promise<{ success: boolean; leadId?: string; error?: string }> {
  console.log(`[InstantlyService] Sending ${params.type} lead to campaign ${params.campaignId}`);
  console.log(`[InstantlyService] Contact: ${params.email} (${params.first_name} ${params.last_name})`);

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

    const success = await createInstantlyLead(apiKey, payload);

    if (success) {
      console.log(`[InstantlyService] Lead created successfully, recording send...`);
      await recordSend(params, introText);
      return { success: true, leadId: `${params.email}-${Date.now()}` };
    } else {
      console.error(`[InstantlyService] Lead creation failed`);
      return { success: false, error: 'Failed to create lead in Instantly' };
    }
  } catch (error) {
    console.error(`[InstantlyService] Exception in sendToInstantly:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

async function recordSend(params: DualSendParams, introText: string): Promise<void> {
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
      });

    if (error) {
      console.error('[InstantlyService] Failed to record send:', error);
    } else {
      console.log(`[InstantlyService] Recorded ${params.type} send to ${params.email}`);
    }
  } catch (error) {
    console.error('[InstantlyService] Exception recording send:', error);
  }
}

export async function createInstantlyLead(
  apiKey: string,
  payload: InstantlyLeadPayload
): Promise<boolean> {
  console.log('[InstantlyService] Starting lead creation via edge function');
  console.log('[InstantlyService] Payload:', payload);

  try {
    const edgeFunctionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instantly-proxy`;
    console.log('[InstantlyService] Calling edge function:', edgeFunctionUrl);

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        apiKey,
        payload
      })
    });

    console.log(`[InstantlyService] Edge function response status: ${response.status}`);

    if (!response.ok) {
      const error = await response.json();
      console.error('[InstantlyService] Edge function error:', error);
      console.error('[InstantlyService] Instantly API error details:', error.details);

      const errorMessage = error.details || error.error || 'Failed to create lead';
      throw new Error(`Instantly API error: ${errorMessage}`);
    }

    const result = await response.json();
    console.log('[InstantlyService] Lead created successfully:', result);
    return true;

  } catch (error) {
    console.error('[InstantlyService] Exception:', error);
    console.error('[InstantlyService] Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('[InstantlyService] Error message:', (error as Error).message);
    return false;
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
