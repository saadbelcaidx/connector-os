/**
 * Piloterr Crunchbase Funding Rounds API
 *
 * Calls Supabase Edge Function proxy to avoid CORS.
 * Uses supabase.functions.invoke() to ensure Authorization header is set.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface FundingRound {
  companyName: string;
  amount: number;
  round: string;
  date: string;
  investors?: string[];
  industry?: string;
}

export interface PiloterrFundingResult {
  rounds: FundingRound[];
  total: number;
  isLive: boolean;
}

export async function fetchPiloterrFunding(
  piloterrApiKey: string,
  params: {
    days_since_announcement?: number;
    investment_type?: string;
    limit?: number;
  }
): Promise<PiloterrFundingResult> {

  console.log('[Funding][Piloterr] Using key?', !!piloterrApiKey);
  console.log('[Funding][Piloterr] Query:', params);

  if (!piloterrApiKey || piloterrApiKey.trim() === '') {
    console.log('[Funding][Piloterr] No API key configured');
    return { rounds: [], total: 0, isLive: false };
  }

  // Build query string for proxy
  const qs = new URLSearchParams();
  if (params.days_since_announcement != null) {
    qs.set('days_since_announcement', String(params.days_since_announcement));
  }
  if (params.investment_type) {
    qs.set('investment_type', params.investment_type);
  }
  if (params.limit) {
    qs.set('limit', String(params.limit));
  }

  // Debug logs
  console.log('[Piloterr] Query params:', qs.toString());
  console.log('[Piloterr] Using piloterr key:', !!piloterrApiKey);

  try {
    // Use supabase.functions.invoke() - automatically includes Authorization header
    const { data, error } = await supabase.functions.invoke(`piloterr-proxy?${qs.toString()}`, {
      method: 'GET',
      headers: {
        'x-piloterr-key': piloterrApiKey,
      },
    });

    if (error) {
      console.error('[Funding][Piloterr] Invoke error:', error);
      return { rounds: [], total: 0, isLive: false };
    }

    if (data?.error) {
      console.error('[Funding][Piloterr] API error:', data.error, 'Status:', data.status, 'Details:', data.details);
      return { rounds: [], total: 0, isLive: false };
    }

    const rounds = parseResponse(data);
    console.log('[Funding][Piloterr] Results:', rounds.length);

    return {
      rounds,
      total: rounds.length,
      isLive: rounds.length > 0,
    };
  } catch (error) {
    console.error('[Funding][Piloterr] Fetch failed:', error);
    return { rounds: [], total: 0, isLive: false };
  }
}

function parseResponse(data: any): FundingRound[] {
  const items = data.results || data.data || data.funding_rounds || data || [];

  if (!Array.isArray(items)) {
    console.log('[Funding][Piloterr] Unexpected response format:', typeof data);
    return [];
  }

  // Debug: log first item to see actual structure
  if (items.length > 0) {
    console.log('[Funding][Piloterr] Sample item structure:', JSON.stringify(items[0], null, 2));
  }

  return items.map((item: any) => ({
    companyName: item.organization_name || item.funded_organization_identifier || item.company_name || item.name || 'Unknown',
    amount: parseAmount(item.money_raised_usd || item.money_raised?.value_usd || item.money_raised?.value || item.money_raised || item.amount || 0),
    round: formatRound(item.investment_type || item.round || item.funding_round || 'Unknown'),
    date: item.announced_on || item.date || new Date().toISOString().split('T')[0],
    investors: parseInvestors(item.investors || item.lead_investors || []),
    industry: item.organization_categories?.[0] || item.industry || '',
  }));
}

function parseAmount(value: any): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.]/g, '');
    return parseFloat(cleaned) || 0;
  }
  return 0;
}

function formatRound(type: string): string {
  const roundMap: Record<string, string> = {
    'series_a': 'Series A',
    'series_b': 'Series B',
    'series_c': 'Series C',
    'series_d': 'Series D',
    'series_e': 'Series E',
    'seed': 'Seed',
    'pre_seed': 'Pre-Seed',
    'angel': 'Angel',
    'venture': 'Venture',
    'private_equity': 'Private Equity',
    'debt_financing': 'Debt',
    'grant': 'Grant',
    'corporate_round': 'Corporate',
  };
  const lower = type.toLowerCase().replace(/[\s-]/g, '_');
  return roundMap[lower] || type;
}

function parseInvestors(investors: any): string[] {
  if (Array.isArray(investors)) {
    return investors.map((inv: any) => {
      if (typeof inv === 'string') return inv;
      return inv.name || inv.investor_name || '';
    }).filter(Boolean);
  }
  return [];
}

export function formatFundingSummary(result: PiloterrFundingResult): string {
  if (!result.isLive || result.rounds.length === 0) {
    return 'No recent funding rounds';
  }

  const totalAmount = result.rounds.reduce((sum, r) => sum + r.amount, 0);
  const totalM = Math.round(totalAmount / 1_000_000);

  const roundCounts: Record<string, number> = {};
  result.rounds.forEach(r => {
    roundCounts[r.round] = (roundCounts[r.round] || 0) + 1;
  });

  const roundSummary = Object.entries(roundCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([round, count]) => `${count} ${round}`)
    .join(', ');

  return `$${totalM}M across ${result.total} rounds (${roundSummary})`;
}
