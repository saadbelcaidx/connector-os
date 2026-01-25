/**
 * SENDER ADAPTER CONTRACT
 *
 * All sending providers must implement this interface.
 * Flow resolves exactly one sender per run.
 */

export type SenderId = 'instantly' | 'plusvibe';

export interface SenderConfig {
  apiKey: string;
  demandCampaignId: string | null;
  supplyCampaignId: string | null;
  // Provider-specific (optional)
  workspaceId?: string;
}

export interface SendLeadParams {
  type: 'DEMAND' | 'SUPPLY';
  campaignId: string;
  email: string;
  firstName: string;
  lastName: string;
  companyName: string;
  companyDomain: string;
  introText: string;
  contactTitle?: string;
  signalMetadata?: Record<string, any>;
}

// Apple-style status language (no "failure" words)
export type SendStatus = 'new' | 'existing' | 'needs_attention';

export interface SendResult {
  success: boolean;
  leadId?: string;
  status: SendStatus;
  detail?: string;  // Human-readable detail for UI
}

export interface SenderAdapter {
  readonly id: SenderId;
  readonly name: string;
  validateConfig(config: SenderConfig): string | null;
  sendLead(config: SenderConfig, params: SendLeadParams): Promise<SendResult>;
  supportsCampaigns(): boolean;
}
