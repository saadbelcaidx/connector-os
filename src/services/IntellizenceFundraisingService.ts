import { SignalsConfig } from './SignalsClient';

/**
 * Intellizence Fundraising API Filter Options
 *
 * All filters are passed in the POST body (NOT query string).
 * See: https://api.intellizence.com/api/v2/dataset/fundraising
 */
export interface IntellizenceFundraisingFilters {
  // Required filters
  dateType: 'ANNOUNCED' | 'CREATED' | 'MODIFIED' | 'LAST-MODIFIED';
  startDate: string;  // YYYY-MM-DD format
  endDate: string;    // YYYY-MM-DD format
  limit: number;      // Max records to return

  // Optional filters
  dealAmount?: string;                    // e.g., ">=10000000" or "1000000-50000000"
  companyType?: string | string[];        // e.g., "Startup", "Private"
  fundingRound?: string | string[];       // e.g., ["Series A", "Series B"]
  companyIndustry?: string | string[];    // e.g., ["bio-technology", "healthcare"]
  companyLocation?: string | string[];    // e.g., "United States", "California"
  investorName?: string | string[];       // Filter by investor
  companyName?: string | string[];        // Filter by company name
  currency?: string;                      // e.g., "USD"
}

export async function fetchIntellizenceFundraising(
  config: SignalsConfig
): Promise<any> {
  const apiKey = config.fundingApiKey || config.apiKey;
  // Base URL only - NO query params, this is a POST-body-only API
  let url = config.fundingApiUrl || 'https://api.intellizence.com/api/v2/dataset/fundraising';

  if (!apiKey || apiKey.trim() === '' || apiKey === '<YOUR_API_KEY>') {
    console.log('[Intellizence] No API key configured, cannot fetch fundraising data');
    return null;
  }

  if (!url || url.trim() === '') {
    console.log('[Intellizence] No URL configured, cannot fetch fundraising data');
    return null;
  }

  // Clean URL - remove whitespace and any query params (they belong in body)
  url = url.replace(/\s+/g, '').split('?')[0];
  console.log('[Intellizence] Using endpoint:', url);

  // Parse user-provided filters from fundingApiBody (JSON string) or fundingBody (object)
  let userFilters: Record<string, any> = {};

  // First try fundingBody (object form)
  if (config.fundingBody && typeof config.fundingBody === 'object' && Object.keys(config.fundingBody).length > 0) {
    userFilters = { ...config.fundingBody };
    console.log('[Intellizence] Using fundingBody filters:', Object.keys(userFilters));
  }

  // Then try fundingApiBody (JSON string form) - this takes precedence if both exist
  if (config.fundingApiBody && typeof config.fundingApiBody === 'string' && config.fundingApiBody.trim() !== '') {
    try {
      const parsed = JSON.parse(config.fundingApiBody);
      userFilters = { ...userFilters, ...parsed };
      console.log('[Intellizence] Merged fundingApiBody filters:', Object.keys(parsed));
    } catch (parseError) {
      console.error('[Intellizence] Invalid JSON in fundingApiBody:', parseError);
      throw new Error('Funding filters must be valid JSON. Example: {"fundingRound": ["Series A", "Series B"], "limit": 50}');
    }
  }

  // Calculate default date range: from Jan 1 of current year to today
  const now = new Date();
  const currentYear = now.getFullYear();
  const defaultStartDate = `${currentYear}-01-01`;
  const defaultEndDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format

  // Build the complete POST body payload
  // Required fields have defaults, optional fields are only included if provided
  const payload: Record<string, any> = {
    // Required fields with defaults
    dateType: userFilters.dateType || 'ANNOUNCED',
    startDate: userFilters.startDate || defaultStartDate,
    endDate: userFilters.endDate || defaultEndDate,
    limit: userFilters.limit ?? 50,
  };

  // Add optional filters only if user provided them
  // These support strings, arrays, and operators (e.g., ">=10000000")
  const optionalFields = [
    'dealAmount',
    'companyType',
    'fundingRound',
    'companyIndustry',
    'companyLocation',
    'investorName',
    'companyName',
    'currency'
  ];

  for (const field of optionalFields) {
    const value = userFilters[field];
    if (value !== undefined && value !== null && value !== '') {
      // Pass arrays and strings directly - API handles both
      payload[field] = value;
    }
  }

  console.log('[Funding] Using API Key:', apiKey.slice(0, 4) + '****', `(length: ${apiKey.length})`);
  console.log('[Funding] POST', url);
  console.log('[Funding] Payload:', JSON.stringify(payload, null, 2));

  const makeRequest = async (attemptPayload: Record<string, any>): Promise<Response> => {
    return fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(attemptPayload),
    });
  };

  try {
    let res = await makeRequest(payload);

    if (!res.ok && res.status === 500) {
      console.warn('[Intellizence] 500 error, retrying with minimal payload...');
      const minimalPayload = {
        dateType: 'ANNOUNCED',
        startDate: defaultStartDate,
        endDate: defaultEndDate,
        limit: 50,
      };
      res = await makeRequest(minimalPayload);
    }

    if (!res.ok) {
      const text = await res.text();
      console.warn('[Intellizence] Skipped — API unavailable or unstable');
      console.warn('[Intellizence] Status:', res.status, 'Response:', text.substring(0, 200));

      if (res.status === 401 || res.status === 403) {
        console.error('[Intellizence] Authentication failed. Check your API key.');
      }

      return null;
    }

    const data = await res.json();
    const dataset = data.dataset || [];
    const recordCount = Array.isArray(dataset) ? dataset.length : 0;

    if (recordCount > 0) {
      console.log('[Funding] ✓ Received', recordCount, 'fundraising events');
    } else {
      console.log('[Funding] No results (filters may be too strict or no recent activity)');
    }

    return dataset;
  } catch (error) {
    console.warn('[Funding] Skipped — Intellizence unstable or no results');
    return null;
  }
}
