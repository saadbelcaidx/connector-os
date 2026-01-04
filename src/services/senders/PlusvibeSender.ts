/**
 * PLUSVIBE SENDER ADAPTER
 *
 * Implements SenderAdapter for Plusvibe.
 * Uses edge function proxy for API calls.
 */

import { SenderAdapter, SenderConfig, SendLeadParams, SendResult } from './SenderAdapter';

export const PlusvibeSender: SenderAdapter = {
  id: 'plusvibe',
  name: 'Plusvibe',

  validateConfig(config: SenderConfig): string | null {
    if (!config.apiKey) {
      return 'Plusvibe API key required';
    }
    if (!config.workspaceId) {
      return 'Plusvibe workspace ID required';
    }
    if (!config.demandCampaignId && !config.supplyCampaignId) {
      return 'At least one campaign ID required';
    }
    return null;
  },

  async sendLead(config: SenderConfig, params: SendLeadParams): Promise<SendResult> {
    console.log(`[PlusvibeSender] Sending ${params.type} lead to campaign ${params.campaignId}`);

    try {
      const edgeFunctionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/plusvibe-proxy`;

      const payload = {
        campaign_id: params.campaignId,
        email: params.email,
        first_name: params.firstName,
        last_name: params.lastName,
        company: params.companyName,
        website: params.companyDomain,
        personalization: params.introText,
        custom_fields: {
          send_type: params.type,
          contact_title: params.contactTitle || '',
        },
      };

      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          apiKey: config.apiKey,
          workspaceId: config.workspaceId,
          payload,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('[PlusvibeSender] Error:', error);
        return {
          success: false,
          status: 'error',
          error: error.details || error.error || 'Failed to create lead',
        };
      }

      const result = await response.json();
      console.log('[PlusvibeSender] Result:', result);

      if (result.resultStatus === 'added') {
        return {
          success: true,
          leadId: result.id || `${params.email}-${Date.now()}`,
          status: 'added',
        };
      } else if (result.resultStatus === 'skipped') {
        return {
          success: true,
          status: 'skipped',
        };
      } else {
        return {
          success: false,
          status: 'error',
          error: result.error || 'Unknown error',
        };
      }
    } catch (error) {
      console.error('[PlusvibeSender] Exception:', error);
      return {
        success: false,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },

  supportsCampaigns(): boolean {
    return true;
  },
};
