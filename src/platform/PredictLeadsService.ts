/**
 * PREDICTLEADS SERVICE
 *
 * Client-side service for fetching company intel on click.
 * Called when user selects a company node to get deep profile data.
 */

const PREDICTLEADS_BASE = 'https://predictleads.com/api/v3/companies';

export interface PredictLeadsKeys {
  apiKey: string;
  apiToken: string;
}

export interface CompanyProfile {
  name: string;
  domain: string;
  description: string;
  location: string;
  employeeCount: number | null;
  industry: string;
  founded: string | null;
  logoUrl: string | null;
  linkedinUrl: string | null;
  twitterUrl: string | null;
  competitors: string[];
}

export interface JobOpening {
  title: string;
  location: string;
  department: string;
  postedDate: string | null;
  url: string;
}

export interface NewsEvent {
  title: string;
  summary: string;
  date: string;
  type: string;
  url: string;
}

export interface FinancingEvent {
  type: string;
  amount: string | null;
  date: string;
  investors: string[];
}

export interface TechDetection {
  name: string;
  category: string;
}

export interface CompanyIntel {
  profile: CompanyProfile | null;
  jobOpenings: JobOpening[];
  newsEvents: NewsEvent[];
  financingEvents: FinancingEvent[];
  techStack: TechDetection[];
  hasHiringSignal: boolean;
  hasFundingSignal: boolean;
  summary: IntelSummary;
}

export interface IntelSummary {
  description: string;
  location: string;
  hiringSignal: string;
  fundingStatus: string;
  recentNews: string[];
  competitors: string[];
  techStack: string[];
  timingSignal: string;
  openingLine: string;
}

/**
 * Check if PredictLeads is configured
 */
export function isPredictLeadsConfigured(keys: PredictLeadsKeys): boolean {
  return !!(keys.apiKey && keys.apiToken);
}

/**
 * Fetch company profile
 */
async function fetchProfile(domain: string, keys: PredictLeadsKeys): Promise<CompanyProfile | null> {
  try {
    const response = await fetch(`${PREDICTLEADS_BASE}/${domain}`, {
      headers: {
        'X-Api-Key': keys.apiKey,
        'X-Api-Token': keys.apiToken,
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    // API returns array: data.data[0].attributes
    const company = data.data?.[0]?.attributes;
    if (!company) return null;

    // Get lookalikes from included array
    const lookalikes = (data.included || [])
      .filter((item: any) => item.type === 'company')
      .map((item: any) => item.attributes?.company_name)
      .filter(Boolean)
      .slice(0, 5);

    return {
      name: company.company_name || company.friendly_company_name || domain,
      domain: company.domain || domain,
      description: company.description || company.description_short || '',
      location: company.location || '',
      employeeCount: company.employee_count || null,
      industry: company.industry || '',
      founded: company.founded || null,
      logoUrl: company.logo_url || null,
      linkedinUrl: company.linkedin_url || null,
      twitterUrl: company.twitter_url || null,
      competitors: lookalikes,
    };
  } catch (e) {
    console.error('[PredictLeads] Profile fetch failed:', e);
    return null;
  }
}

/**
 * Fetch job openings
 */
async function fetchJobOpenings(domain: string, keys: PredictLeadsKeys): Promise<JobOpening[]> {
  try {
    const response = await fetch(`${PREDICTLEADS_BASE}/${domain}/job_openings`, {
      headers: {
        'X-Api-Key': keys.apiKey,
        'X-Api-Token': keys.apiToken,
      },
    });

    if (!response.ok) return [];

    const data = await response.json();
    // API returns array: data.data[].attributes
    const jobs = (data.data || []).map((item: any) => item.attributes).filter(Boolean);

    return jobs.slice(0, 10).map((job: any) => ({
      title: job.title || 'Unknown',
      location: job.location || '',
      department: job.department || '',
      postedDate: job.first_seen || null,
      url: job.url || '',
    }));
  } catch (e) {
    console.error('[PredictLeads] Jobs fetch failed:', e);
    return [];
  }
}

/**
 * Fetch news events
 */
async function fetchNewsEvents(domain: string, keys: PredictLeadsKeys): Promise<NewsEvent[]> {
  try {
    const response = await fetch(`${PREDICTLEADS_BASE}/${domain}/news_events`, {
      headers: {
        'X-Api-Key': keys.apiKey,
        'X-Api-Token': keys.apiToken,
      },
    });

    if (!response.ok) return [];

    const data = await response.json();
    // API returns array: data.data[].attributes
    const events = (data.data || []).map((item: any) => item.attributes).filter(Boolean);

    return events.slice(0, 5).map((event: any) => ({
      title: event.title || '',
      summary: event.summary || '',
      date: event.date || '',
      type: event.type || 'news',
      url: event.url || '',
    }));
  } catch (e) {
    console.error('[PredictLeads] News fetch failed:', e);
    return [];
  }
}

/**
 * Fetch financing events
 */
async function fetchFinancingEvents(domain: string, keys: PredictLeadsKeys): Promise<FinancingEvent[]> {
  try {
    const response = await fetch(`${PREDICTLEADS_BASE}/${domain}/financing_events`, {
      headers: {
        'X-Api-Key': keys.apiKey,
        'X-Api-Token': keys.apiToken,
      },
    });

    if (!response.ok) return [];

    const data = await response.json();
    // API returns array: data.data[].attributes
    const events = (data.data || []).map((item: any) => item.attributes).filter(Boolean);

    return events.slice(0, 5).map((event: any) => ({
      type: event.type || 'funding',
      amount: event.amount || null,
      date: event.date || '',
      investors: event.investors || [],
    }));
  } catch (e) {
    console.error('[PredictLeads] Financing fetch failed:', e);
    return [];
  }
}

/**
 * Fetch tech stack
 */
async function fetchTechStack(domain: string, keys: PredictLeadsKeys): Promise<TechDetection[]> {
  try {
    const response = await fetch(`${PREDICTLEADS_BASE}/${domain}/technology_detections`, {
      headers: {
        'X-Api-Key': keys.apiKey,
        'X-Api-Token': keys.apiToken,
      },
    });

    if (!response.ok) return [];

    const data = await response.json();
    // API returns array: data.data[].attributes
    const techs = (data.data || []).map((item: any) => item.attributes).filter(Boolean);

    return techs.slice(0, 10).map((tech: any) => ({
      name: tech.name || '',
      category: tech.category || '',
    }));
  } catch (e) {
    console.error('[PredictLeads] Tech fetch failed:', e);
    return [];
  }
}

/**
 * Generate summary from intel data
 */
function generateSummary(
  profile: CompanyProfile | null,
  jobs: JobOpening[],
  news: NewsEvent[],
  financing: FinancingEvent[],
  tech: TechDetection[]
): IntelSummary {
  const hasHiring = jobs.length > 0;
  const hasFunding = financing.length > 0;
  const latestFunding = financing[0];
  const latestNews = news.slice(0, 3).map(n => n.title);

  // Hiring signal
  let hiringSignal = 'No active hiring detected';
  if (hasHiring) {
    const count = jobs.length;
    const roles = jobs.slice(0, 3).map(j => j.title).join(', ');
    hiringSignal = `${count} open role${count > 1 ? 's' : ''}: ${roles}`;
  }

  // Funding status
  let fundingStatus = 'No recent funding';
  if (hasFunding && latestFunding) {
    fundingStatus = latestFunding.amount
      ? `${latestFunding.type}: ${latestFunding.amount}`
      : latestFunding.type;
  }

  // Timing signal
  let timingSignal = 'Stable — no urgent signals';
  if (hasHiring && hasFunding) {
    timingSignal = 'High activity — hiring + recent funding';
  } else if (hasHiring) {
    timingSignal = 'Active hiring — deploying capital now';
  } else if (hasFunding) {
    timingSignal = 'Recently funded — likely scaling';
  }

  // Opening line
  let openingLine = `Noticed ${profile?.name || 'your company'} is ${profile?.description?.slice(0, 50) || 'growing'}...`;
  if (hasHiring) {
    const topJob = jobs[0];
    openingLine = `Saw you're hiring a ${topJob.title} — I know people in that space.`;
  } else if (hasFunding) {
    openingLine = `Congrats on the ${latestFunding?.type || 'funding'} — usually means you're scaling the team.`;
  }

  return {
    description: profile?.description || '',
    location: profile?.location || '',
    hiringSignal,
    fundingStatus,
    recentNews: latestNews,
    competitors: profile?.competitors || [],
    techStack: tech.slice(0, 5).map(t => t.name),
    timingSignal,
    openingLine,
  };
}

/**
 * Fetch all company intel (called on node click)
 */
export async function getCompanyIntel(domain: string, keys: PredictLeadsKeys): Promise<CompanyIntel> {
  console.log('[PredictLeads] Fetching intel for:', domain);

  // Fetch all data in parallel
  const [profile, jobOpenings, newsEvents, financingEvents, techStack] = await Promise.all([
    fetchProfile(domain, keys),
    fetchJobOpenings(domain, keys),
    fetchNewsEvents(domain, keys),
    fetchFinancingEvents(domain, keys),
    fetchTechStack(domain, keys),
  ]);

  const hasHiringSignal = jobOpenings.length > 0;
  const hasFundingSignal = financingEvents.length > 0;

  const summary = generateSummary(profile, jobOpenings, newsEvents, financingEvents, techStack);

  console.log('[PredictLeads] Intel complete:', {
    hasProfile: !!profile,
    jobs: jobOpenings.length,
    news: newsEvents.length,
    funding: financingEvents.length,
    tech: techStack.length,
  });

  return {
    profile,
    jobOpenings,
    newsEvents,
    financingEvents,
    techStack,
    hasHiringSignal,
    hasFundingSignal,
    summary,
  };
}
