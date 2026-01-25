/**
 * INSTANTLY SENDER ADAPTER
 *
 * Wraps InstantlyService with rich result passthrough.
 * Returns Apple-style status: new | existing | needs_attention
 */

import { SenderAdapter, SenderConfig, SendLeadParams, SendResult } from './SenderAdapter';
import { sendToInstantly, validateCampaignId, DualSendParams } from '../InstantlyService';

export const InstantlySender: SenderAdapter = {
  id: 'instantly',
  name: 'Instantly',

  validateConfig(config: SenderConfig): string | null {
    if (!config.apiKey) {
      return 'Add your Instantly API key in Settings';
    }
    if (!config.demandCampaignId && !config.supplyCampaignId) {
      return 'Add at least one campaign ID in Settings';
    }
    // Validate campaign ID formats
    if (config.demandCampaignId) {
      const validation = validateCampaignId(config.demandCampaignId);
      if (!validation.valid) {
        return `Demand campaign: ${validation.message}`;
      }
    }
    if (config.supplyCampaignId) {
      const validation = validateCampaignId(config.supplyCampaignId);
      if (!validation.valid) {
        return `Supply campaign: ${validation.message}`;
      }
    }
    return null;
  },

  async sendLead(config: SenderConfig, params: SendLeadParams): Promise<SendResult> {
    const dualParams: DualSendParams = {
      campaignId: params.campaignId,
      email: params.email,
      first_name: params.firstName,
      last_name: params.lastName,
      company_name: params.companyName,
      website: params.companyDomain,
      type: params.type,
      contact_title: params.contactTitle,
      company_domain: params.companyDomain,
      intro_text: params.introText,
      signal_metadata: params.signalMetadata,
    };

    const result = await sendToInstantly(config.apiKey, dualParams);

    // Pass through rich result directly (same interface)
    return {
      success: result.success,
      leadId: result.leadId,
      status: result.status,
      detail: result.detail,
    };
  },

  supportsCampaigns(): boolean {
    return true;
  },
};
