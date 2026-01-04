/**
 * INSTANTLY SENDER ADAPTER
 *
 * Wraps existing InstantlyService logic.
 * No behavior change from original implementation.
 */

import { SenderAdapter, SenderConfig, SendLeadParams, SendResult } from './SenderAdapter';
import { sendToInstantly, DualSendParams } from '../InstantlyService';

export const InstantlySender: SenderAdapter = {
  id: 'instantly',
  name: 'Instantly',

  validateConfig(config: SenderConfig): string | null {
    if (!config.apiKey) {
      return 'Instantly API key required';
    }
    if (!config.demandCampaignId && !config.supplyCampaignId) {
      return 'At least one campaign ID required';
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

    return {
      success: result.success,
      leadId: result.leadId,
      status: result.success ? 'added' : 'error',
      error: result.error,
    };
  },

  supportsCampaigns(): boolean {
    return true;
  },
};
