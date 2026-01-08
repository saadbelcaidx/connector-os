/**
 * SENDER RESOLUTION
 *
 * Resolves exactly one sender based on settings.
 * Called once at start of send flow.
 */

export type { SenderAdapter, SenderConfig, SendLeadParams, SendResult, SenderId } from './SenderAdapter';
export { InstantlySender } from './InstantlySender';
export { PlusvibeSender } from './PlusvibeSender';

import type { SenderAdapter, SenderId, SenderConfig } from './SenderAdapter';
import { InstantlySender } from './InstantlySender';
import { PlusvibeSender } from './PlusvibeSender';

const SENDERS: Record<SenderId, SenderAdapter> = {
  instantly: InstantlySender,
  plusvibe: PlusvibeSender,
};

/**
 * Resolve sender by ID.
 * Returns null if sender ID is invalid.
 */
export function resolveSender(senderId: SenderId | undefined): SenderAdapter | null {
  if (!senderId) return null;
  return SENDERS[senderId] || null;
}

/**
 * Build sender config from settings.
 */
export function buildSenderConfig(settings: {
  instantlyApiKey?: string;
  plusvibeApiKey?: string;
  plusvibeWorkspaceId?: string;
  demandCampaignId?: string;
  supplyCampaignId?: string;
  sendingProvider?: SenderId;
}): SenderConfig {
  const provider = settings.sendingProvider || 'instantly';

  return {
    apiKey: provider === 'plusvibe' ? (settings.plusvibeApiKey || '') : (settings.instantlyApiKey || ''),
    demandCampaignId: settings.demandCampaignId || null,
    supplyCampaignId: settings.supplyCampaignId || null,
    workspaceId: settings.plusvibeWorkspaceId,
  };
}
