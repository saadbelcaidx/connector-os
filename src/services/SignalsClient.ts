import { supabase } from '../lib/supabase';
export { supabase };

// =============================================================================
// UNIVERSAL SAFE STRING HANDLERS - Use these EVERYWHERE, never call .toLowerCase() directly
// =============================================================================

/**
 * Universal safe lowercase - handles ANY input type
 * ALWAYS use this instead of .toLowerCase()
 */
export function safeLower(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.toLowerCase();
  if (typeof v === "number" || typeof v === "boolean") return String(v).toLowerCase();
  if (Array.isArray(v)) return v.map(x => safeLower(x)).filter(Boolean).join(" ").trim();
  if (typeof v === "object") {
    const o = v as any;
    return safeLower(o.name ?? o.title ?? o.value ?? o.label ?? "");
  }
  return "";
}

/**
 * Universal safe text extraction - returns string without lowercasing
 * ALWAYS use this when extracting text from unknown values
 */
export function safeText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(x => safeText(x)).filter(Boolean).join(" ").trim();
  if (typeof v === "object") {
    const o = v as any;
    return safeText(o.name ?? o.title ?? o.value ?? o.label ?? "");
  }
  return "";
}

// =============================================================================
// UNIVERSAL APIFY PAYLOAD NORMALIZERS
// =============================================================================

/**
 * Universal payload normalizer - handles ANY Apify/API response shape
 * Returns an array of items regardless of response structure
 */
export function normalizeToItems(payload: any): any[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  // Try common response shapes from various Apify actors
  const candidates = [
    payload.items,
    payload.data,
    payload.results,
    payload.dataset?.items,
    payload.dataset?.data,
    payload.response?.items,
    payload.response?.data,
    payload.jobs,
    payload.listings,
    payload.records,
    payload.rows,
  ];

  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }

  // If object but no obvious array, return [payload] as last resort
  if (typeof payload === "object" && Object.keys(payload).length > 0) {
    return [payload];
  }

  return [];
}

/**
 * Universal job field extractor - handles ANY job/company object shape from any Apify scraper
 * Works with: LinkedIn, Indeed, Wellfound, Glassdoor, ZipRecruiter, etc.
 */
export function extractJobLikeFields(item: any): {
  companyName: string;
  companyUrl: string;
  title: string;
  locationText: string;
  raw: any;
} {
  if (!item || typeof item !== "object") {
    return { companyName: "", companyUrl: "", title: "", locationText: "", raw: item };
  }

  // Company name candidates (order matters - most specific first)
  const companyName = safeText(
    item.company?.name ??
    item.companyName ??
    item.company_name ??
    item.employer_name ??
    item.employerName ??
    item.organization_name ??
    item.organizationName ??
    item.organization?.name ??
    item.company ??
    item.employer ??
    item.organization ??
    item.hiringOrganization?.name ??
    ""
  );

  // Company URL candidates
  const companyUrl = safeText(
    item.company?.url ??
    item.company?.website ??
    item.companyUrl ??
    item.company_url ??
    item.company_website ??
    item.companyWebsite ??
    item.employer_website ??
    item.employerWebsite ??
    item.website ??
    item.url ??
    item.hiringOrganization?.url ??
    ""
  );

  // Job title candidates
  const title = safeText(
    item.job_title ??
    item.jobTitle ??
    item.title ??
    item.position ??
    item.positionName ??
    item.role ??
    item.name ??
    ""
  );

  // Location candidates - handle arrays and strings
  const locationRaw =
    item.job_location ??
    item.jobLocation ??
    item.location ??
    item.locations ??
    item.city ??
    item.jobCity ??
    item.addressLocality ??
    "";

  const locationText = Array.isArray(locationRaw)
    ? locationRaw.map(l => safeText(l)).filter(Boolean).join(", ")
    : safeText(locationRaw);

  return {
    companyName: companyName.trim() || "Unknown Company",
    companyUrl: companyUrl.trim(),
    title: title.trim() || "Role",
    locationText: locationText.trim(),
    raw: item
  };
}

// =============================================================================
// INTERFACES
// =============================================================================

export interface JobSignalInsight {
  count: number;
  keyword: string;
  locationSummary: string;
  seniorityMix: string;
  remoteMix: string;
  salaryBand: string;
  companySummary: string;
  industryMatch: "high" | "medium" | "low";
  displaySummary: string;
  subtitle: string;
}

export interface SignalData {
  value: string;
  isLive: boolean;
  lastUpdated?: string;
  metadata?: JobSignalInsight;
  rawPayload?: any;
}

export interface SignalsConfig {
  apiKey: string;
  // Demand - Jobs (Apify)
  jobsApiUrl?: string;  // Apify dataset URL for demand companies
  jobRoleFilter?: string;
  jobIndustryFilter?: string;
  // Supply - Providers (Apify)
  supplyApiUrl?: string;  // Apify dataset URL for supply discovery
  // Piloterr Funding
  piloterrApiKey?: string;
  fundingApiKey?: string;
  fundingDaysSince?: number;
  fundingInvestmentTypes?: string[];
  // Layoffs
  layoffsApiUrl?: string;
  layoffsApiKey?: string;
  // Hiring Velocity
  hiringApiUrl?: string;
  hiringApiKey?: string;
  // Tech/Tool Adoption
  techApiUrl?: string;
  techApiKey?: string;
}

const MOCK_DATA = {
  jobs: 'No jobs data - configure Apify dataset URL',
  jobsSubtitle: 'Add an Apify dataset URL in Settings to see live job signals',
  funding: 'No funding data - configure Piloterr API',
  layoffs: 'No layoffs data',
  hiringVelocity: 'No hiring velocity data',
  toolAdoption: 'No tech adoption data',
};

// =============================================================================
// CONFIG LOADER
// =============================================================================

export async function loadSignalsConfig(): Promise<SignalsConfig> {
  try {
    const { data, error } = await supabase
      .from('operator_settings')
      .select('*')
      .eq('user_id', 'default')
      .maybeSingle();

    if (error) throw error;

    return {
      apiKey: data?.signals_api_key || '',
      // Demand - Jobs (Apify)
      jobsApiUrl: data?.jobs_api_url || '',
      jobRoleFilter: data?.job_role_filter || '',
      jobIndustryFilter: data?.job_industry_filter || '',
      // Supply - Providers (Apify)
      supplyApiUrl: data?.supply_api_url || '',
      // Funding
      piloterrApiKey: data?.piloterr_api_key || '',
      fundingApiKey: data?.funding_api_key || data?.piloterr_api_key || '',
      fundingDaysSince: data?.funding_days_since || 30,
      fundingInvestmentTypes: data?.funding_investment_types || ['series_a', 'series_b'],
      // Other signals
      layoffsApiUrl: data?.layoffs_api_url || '',
      layoffsApiKey: data?.layoffs_api_key || '',
      hiringApiUrl: data?.hiring_api_url || '',
      hiringApiKey: data?.hiring_api_key || '',
      techApiUrl: data?.tech_api_url || '',
      techApiKey: data?.tech_api_key || '',
    };
  } catch (error) {
    console.error('Error loading signals config:', error);
    return {
      apiKey: '',
      jobsApiUrl: '',
      jobRoleFilter: '',
      jobIndustryFilter: '',
      supplyApiUrl: '',
      piloterrApiKey: '',
      fundingApiKey: '',
      fundingDaysSince: 30,
      fundingInvestmentTypes: ['series_a', 'series_b'],
      layoffsApiUrl: '',
      layoffsApiKey: '',
      hiringApiUrl: '',
      hiringApiKey: '',
      techApiUrl: '',
      techApiKey: '',
    };
  }
}

// =============================================================================
// APIFY JOBS FETCHER (Universal - works with ANY Apify scraper)
// =============================================================================

/**
 * Fetch jobs from ANY Apify dataset URL
 * Handles any JSON structure - LinkedIn, Indeed, Wellfound, etc.
 */
export async function fetchJobSignals(config: SignalsConfig, providerNiche?: string): Promise<SignalData> {
  const url = config.jobsApiUrl;

  console.log('[Jobs][Apify] URL:', url || '(none)');

  if (!url || url.trim() === '') {
    console.log('[Jobs][Apify] No URL configured');
    return {
      value: MOCK_DATA.jobs,
      isLive: false,
      metadata: createMockJobMetadata(),
    };
  }

  try {
    console.log('[Jobs][Apify] Fetching:', url);

    const response = await fetch(url);

    if (!response.ok) {
      console.error(`[Jobs][Apify] HTTP ${response.status}`);
      return {
        value: `Error: HTTP ${response.status}`,
        isLive: false,
        rawPayload: null,
      };
    }

    const rawData = await response.json();
    console.log('[Jobs][Apify] Response received');

    // Normalize to array of items
    const items = normalizeToItems(rawData);
    console.log('[Jobs][Apify] Normalized items:', items.length);

    if (items.length === 0) {
      return {
        value: 'No jobs found in Apify dataset',
        isLive: true,
        lastUpdated: new Date().toISOString(),
        rawPayload: rawData,
      };
    }

    // Extract job fields from each item
    const jobs = items.map(item => extractJobLikeFields(item));

    // Apply filters if configured
    let filteredJobs = jobs;

    if (config.jobRoleFilter && config.jobRoleFilter.trim()) {
      const filterKeywords = safeLower(config.jobRoleFilter).split(/[,\s]+/).filter(k => k.length > 0);
      filteredJobs = filteredJobs.filter(job => {
        const titleLower = safeLower(job.title);
        return filterKeywords.some(kw => titleLower.includes(kw));
      });
      // If filter removed all jobs, fall back to unfiltered
      if (filteredJobs.length === 0) filteredJobs = jobs;
    }

    if (config.jobIndustryFilter && config.jobIndustryFilter.trim()) {
      const filterKeywords = safeLower(config.jobIndustryFilter).split(/[,\s]+/).filter(k => k.length > 0);
      const beforeFilter = filteredJobs.length;
      filteredJobs = filteredJobs.filter(job => {
        const combined = safeLower(job.companyName) + ' ' + safeLower(job.title);
        return filterKeywords.some(kw => combined.includes(kw));
      });
      // If filter removed all jobs, fall back to previous
      if (filteredJobs.length === 0) filteredJobs = jobs.slice(0, beforeFilter);
    }

    // Build insight from extracted data
    const insight = buildJobInsight(filteredJobs, providerNiche);

    console.log('[Jobs][Apify] Processed:', filteredJobs.length, 'jobs from', insight.companySummary);

    // Transform to format MatchingEngineV3 expects
    const normalizedJobs = filteredJobs.map(job => ({
      company: { name: job.companyName, url: job.companyUrl },
      company_name: job.companyName,
      employer_name: job.companyName,
      job_title: job.title,
      title: job.title,
      location: job.locationText,
      raw: job.raw,
    }));

    return {
      value: insight.displaySummary,
      isLive: true,
      lastUpdated: new Date().toISOString(),
      metadata: insight,
      rawPayload: { data: normalizedJobs, original: rawData },
    };
  } catch (error) {
    console.error('[Jobs][Apify] Fetch failed:', error);
    return {
      value: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      isLive: false,
      rawPayload: null,
    };
  }
}

function createMockJobMetadata(): JobSignalInsight {
  return {
    count: 0,
    keyword: 'roles',
    locationSummary: '',
    seniorityMix: '',
    remoteMix: '',
    salaryBand: '',
    companySummary: '',
    industryMatch: 'low',
    displaySummary: MOCK_DATA.jobs,
    subtitle: MOCK_DATA.jobsSubtitle,
  };
}

function buildJobInsight(
  jobs: Array<{ companyName: string; companyUrl: string; title: string; locationText: string; raw: any }>,
  providerNiche?: string
): JobSignalInsight {
  const count = jobs.length;

  // Count companies
  const companyCounts: Record<string, number> = {};
  jobs.forEach(job => {
    const company = job.companyName || 'Unknown';
    companyCounts[company] = (companyCounts[company] || 0) + 1;
  });
  const companies = Object.entries(companyCounts).sort((a, b) => b[1] - a[1]);
  const companyCount = companies.length;
  const topCompanies = companies.slice(0, 5).map(c => c[0]);

  // Extract most common keyword from titles
  const keyword = extractKeywordFromTitles(jobs.map(j => j.title));

  // Build seniority mix
  const seniorityMix = calculateSeniorityMix(jobs.map(j => j.title));

  // Build remote mix
  const remoteMix = calculateRemoteMix(jobs);

  // Build location summary
  const locationSummary = buildLocationSummary(jobs.map(j => j.locationText));

  // Company summary
  const companySummary = companyCount === 1
    ? `at ${topCompanies[0]}`
    : companyCount <= 3
    ? `across ${companyCount} companies`
    : `across ${companyCount}+ companies`;

  // Industry match
  const industryMatch = determineIndustryMatch(jobs, providerNiche);

  // Display summary: "X companies hiring (Company1, Company2, ...)"
  const displaySummary = companyCount === 1
    ? `${count} roles at ${topCompanies[0]}`
    : `${companyCount} companies hiring (${topCompanies.join(', ')})`;

  // Subtitle
  const subtitleParts: string[] = [];
  if (seniorityMix) subtitleParts.push(seniorityMix);
  if (remoteMix) subtitleParts.push(remoteMix);
  if (companySummary) subtitleParts.push(companySummary);
  const subtitle = subtitleParts.slice(0, 3).join(' • ');

  return {
    count,
    keyword,
    locationSummary,
    seniorityMix,
    remoteMix,
    salaryBand: '',
    companySummary,
    industryMatch,
    displaySummary,
    subtitle,
  };
}

function extractKeywordFromTitles(titles: string[]): string {
  const excludedWords = ['jobs', 'in', 'the', 'senior', 'sr', 'jr', 'junior', 'mid', 'entry', 'level', 'lead', 'staff', 'principal', 'head', 'vp', 'director', 'manager', 'remote', 'onsite', 'on-site', 'hybrid', 'role', 'position'];
  const wordCounts: Record<string, number> = {};

  titles.forEach(title => {
    const words = safeLower(title).split(/[\s\-_]+/).filter(w => w.length > 2 && !excludedWords.includes(w));
    words.forEach(word => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });
  });

  const sorted = Object.entries(wordCounts).sort((a, b) => b[1] - a[1]);
  return sorted.length > 0 ? sorted[0][0] : 'roles';
}

function calculateSeniorityMix(titles: string[]): string {
  const buckets = { junior: 0, mid: 0, senior: 0, exec: 0 };

  titles.forEach(title => {
    const t = safeLower(title);
    if (/\b(junior|jr|intern|trainee|entry)\b/.test(t)) {
      buckets.junior++;
    } else if (/\b(head|vp|vice president|director|chief|cxo|cto|cfo|coo|ceo)\b/.test(t)) {
      buckets.exec++;
    } else if (/\b(senior|sr|lead|principal|staff)\b/.test(t)) {
      buckets.senior++;
    } else {
      buckets.mid++;
    }
  });

  const total = titles.length || 1;
  const percentages = {
    junior: Math.round((buckets.junior / total) * 100),
    mid: Math.round((buckets.mid / total) * 100),
    senior: Math.round((buckets.senior / total) * 100),
    exec: Math.round((buckets.exec / total) * 100),
  };

  const sorted = Object.entries(percentages).sort((a, b) => b[1] - a[1]);

  if (sorted[0][1] >= 70) {
    return `mostly ${sorted[0][0]} roles`;
  }
  if (sorted[0][1] > 0 && sorted[1][1] > 20) {
    return `mix of ${sorted[0][0]}/${sorted[1][0]}`;
  }
  return 'mixed levels';
}

function calculateRemoteMix(jobs: Array<{ title: string; raw: any }>): string {
  let remote = 0;
  let hybrid = 0;
  let onsite = 0;

  jobs.forEach(job => {
    const raw = job.raw || {};
    const isRemoteField = raw.is_remote || raw.isRemote || raw.job_is_remote || raw.remote || false;
    const title = safeLower(job.title);
    const location = safeLower(raw.location ?? raw.job_location ?? '');
    const combined = title + ' ' + location;

    if (isRemoteField || /\b(remote|work from home|wfh)\b/.test(combined)) {
      if (/\b(hybrid|flexible)\b/.test(combined)) {
        hybrid++;
      } else {
        remote++;
      }
    } else if (/\b(hybrid|flexible)\b/.test(combined)) {
      hybrid++;
    } else {
      onsite++;
    }
  });

  const total = jobs.length || 1;
  const remotePct = Math.round(((remote + hybrid * 0.5) / total) * 100);
  const onsitePct = 100 - remotePct;

  if (remotePct >= 60) return `${Math.round(remotePct / 10) * 10}% remote`;
  if (onsitePct >= 60) return `${Math.round(onsitePct / 10) * 10}% onsite`;
  return 'mix of remote/onsite';
}

function buildLocationSummary(locations: string[]): string {
  const locationCounts: Record<string, number> = {};

  locations.forEach(loc => {
    if (loc && loc.length > 0) {
      locationCounts[loc] = (locationCounts[loc] || 0) + 1;
    }
  });

  const sorted = Object.entries(locationCounts).sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) return '';
  if (sorted[0][1] >= locations.length * 0.3) {
    return `in ${sorted[0][0]}`;
  }
  return sorted.length > 3 ? 'multiple locations' : '';
}

function determineIndustryMatch(
  jobs: Array<{ companyName: string; title: string; raw: any }>,
  providerNiche?: string
): 'high' | 'medium' | 'low' {
  if (!providerNiche) return 'medium';

  const nicheLower = safeLower(providerNiche);
  let matchCount = 0;

  jobs.forEach(job => {
    const combined = safeLower(job.companyName) + ' ' + safeLower(job.title);
    const raw = job.raw || {};
    const industry = safeLower(raw.industry ?? raw.job_industry ?? raw.sector ?? '');
    const allText = combined + ' ' + industry;

    // Check for common industry keywords
    if (nicheLower.includes('saas') && /\b(saas|software|product|b2b)\b/.test(allText)) matchCount++;
    if (nicheLower.includes('logistics') && /\b(logistics|trucking|warehouse|transport|supply chain)\b/.test(allText)) matchCount++;
    if (nicheLower.includes('fintech') && /\b(fintech|finance|banking|financial)\b/.test(allText)) matchCount++;
    if (nicheLower.includes('health') && /\b(health|healthcare|healthtech|medical)\b/.test(allText)) matchCount++;
  });

  const matchRate = matchCount / (jobs.length || 1);
  if (matchRate >= 0.5) return 'high';
  if (matchRate >= 0.2) return 'medium';
  return 'low';
}

// =============================================================================
// FUNDING SIGNALS (Piloterr)
// =============================================================================

export async function fetchFundingSignals(config: SignalsConfig): Promise<SignalData & { fundingRounds?: any[] }> {
  const apiKey = config.fundingApiKey || config.piloterrApiKey || config.apiKey;

  console.log('[Funding][Piloterr] API Key:', apiKey ? 'yes' : 'no');

  if (!apiKey || apiKey.trim() === '') {
    console.log('[Funding][Piloterr] No API key configured');
    return {
      value: MOCK_DATA.funding,
      isLive: false,
      rawPayload: null,
    };
  }

  try {
    const { fetchPiloterrFunding, formatFundingSummary } = await import('./PiloterrFundingService');

    const result = await fetchPiloterrFunding(apiKey, {
      days_since_announcement: config.fundingDaysSince || 30,
      limit: 10,
    });

    if (!result.isLive || result.rounds.length === 0) {
      console.log('[Funding][Piloterr] No results');
      return {
        value: MOCK_DATA.funding,
        isLive: false,
        rawPayload: null,
      };
    }

    const summary = formatFundingSummary(result);
    console.log('[Funding][Piloterr] Summary:', summary);

    return {
      value: summary,
      isLive: true,
      lastUpdated: new Date().toISOString(),
      rawPayload: result.rounds,
      fundingRounds: result.rounds,
    };
  } catch (error) {
    console.error('[Funding][Piloterr] Fetch failed:', error);
    return {
      value: MOCK_DATA.funding,
      isLive: false,
      rawPayload: null,
    };
  }
}

// =============================================================================
// OTHER SIGNALS (Layoffs, Hiring Velocity, Tech)
// =============================================================================

async function callGenericApi(
  url: string | undefined,
  apiKey: string | undefined,
  mockValue: string,
  signalType: string
): Promise<{ value: string; isLive: boolean; rawPayload?: any }> {
  if (!url || url.trim() === '') {
    console.log(`[${signalType}] No URL configured`);
    return { value: mockValue, isLive: false, rawPayload: null };
  }

  try {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };

    if (apiKey && apiKey.trim() !== '') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      console.error(`[${signalType}] HTTP ${response.status}`);
      return { value: mockValue, isLive: false, rawPayload: null };
    }

    const data = await response.json();

    // Extract summary from response
    const value = safeText(data.summary ?? data.value ?? data.message) ||
                  (data.count ? `${data.count} records` : mockValue);

    return { value, isLive: true, rawPayload: data };
  } catch (error) {
    console.error(`[${signalType}] Fetch failed:`, error);
    return { value: mockValue, isLive: false, rawPayload: null };
  }
}

export async function fetchLayoffSignals(config: SignalsConfig): Promise<SignalData> {
  const result = await callGenericApi(
    config.layoffsApiUrl,
    config.layoffsApiKey || config.apiKey,
    MOCK_DATA.layoffs,
    'Layoffs'
  );

  return {
    value: result.value,
    isLive: result.isLive,
    lastUpdated: result.isLive ? new Date().toISOString() : undefined,
    rawPayload: result.rawPayload,
  };
}

export async function fetchHiringVelocitySignals(config: SignalsConfig): Promise<SignalData> {
  const result = await callGenericApi(
    config.hiringApiUrl,
    config.hiringApiKey || config.apiKey,
    MOCK_DATA.hiringVelocity,
    'Hiring'
  );

  return {
    value: result.value,
    isLive: result.isLive,
    lastUpdated: result.isLive ? new Date().toISOString() : undefined,
    rawPayload: result.rawPayload,
  };
}

export async function fetchToolAdoptionSignals(config: SignalsConfig): Promise<SignalData> {
  const result = await callGenericApi(
    config.techApiUrl,
    config.techApiKey || config.apiKey,
    MOCK_DATA.toolAdoption,
    'Tech'
  );

  return {
    value: result.value,
    isLive: result.isLive,
    lastUpdated: result.isLive ? new Date().toISOString() : undefined,
    rawPayload: result.rawPayload,
  };
}
