/**
 * PiloterrFundingService - Stub
 *
 * Placeholder for Piloterr funding API integration.
 * Returns mock data until API is configured.
 */

export interface FundingRound {
  company: string;
  amount: number;
  type: string;
  date: string;
}

export interface FundingResult {
  isLive: boolean;
  rounds: FundingRound[];
}

export async function fetchPiloterrFunding(
  _apiKey: string,
  _options: { days_since_announcement?: number; limit?: number }
): Promise<FundingResult> {
  // Stub - returns empty result
  console.log('[Piloterr] Stub - no API configured');
  return {
    isLive: false,
    rounds: [],
  };
}

export function formatFundingSummary(result: FundingResult): string {
  if (!result.isLive || result.rounds.length === 0) {
    return 'No recent funding data';
  }
  return `${result.rounds.length} funding rounds`;
}
