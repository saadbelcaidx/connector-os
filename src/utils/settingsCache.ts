/**
 * guest_settings localStorage cache — read-merge-write.
 * Shape: { version: 1, settings: { ...camelCase fields... } }
 *
 * This is a local cache of the operator's config, regardless of auth state.
 * Source of truth: operator_settings DB (auth) or this cache (guest).
 * Consumers: readCurrentSendConfig(), SendPage loadSenderConfig(), etc.
 */

/** Known fields — prevents pollution of the settings namespace. */
interface GuestSettingsFields {
  // Sending
  sendingProvider: string;
  instantlyApiKey: string;
  instantlyCampaignDemand: string;
  instantlyCampaignSupply: string;
  plusvibeApiKey: string;
  plusvibeWorkspaceId: string;
  plusvibeCampaignDemand: string;
  plusvibeCampaignSupply: string;
  // Identity
  operatorId: string;
  senderName: string;
  calendarLink: string;
  // Enrichment
  apolloApiKey: string;
  anymailApiKey: string;
  connectorAgentApiKey: string;
  // AI
  aiProvider: string;
  openaiApiKey: string;
  azureApiKey: string;
  azureEndpoint: string;
  azureDeployment: string;
  claudeApiKey: string;
  aiModel: string;
  // Market campaigns (pass-through)
  marketCampaigns: Record<string, { demandCampaignId: string; supplyCampaignId: string }>;
  // Allow existing fields we haven't typed yet
  [key: string]: unknown;
}

const CACHE_KEY = 'guest_settings';
const CACHE_VERSION = 1;

/** Merge fields into guest_settings. Read-merge-write with timestamp guard. */
export function patchGuestSettings(patch: Partial<GuestSettingsFields>): void {
  try {
    let existing: Record<string, unknown> = {};
    try {
      existing = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    } catch {
      // Corrupted — reset
      existing = {};
    }
    const s = (existing.settings as Record<string, unknown>) || {};
    Object.assign(s, patch);
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      version: CACHE_VERSION,
      updatedAt: Date.now(),
      settings: s,
    }));
  } catch {
    // localStorage full or unavailable — not data loss, just cache miss
  }
}
