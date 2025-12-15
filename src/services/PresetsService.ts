export interface SignalPresetConfig {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body: Record<string, any>;
  apiKey: string;
  provider: string;
  description: string;
  expectedFormat: string;
  exampleResponse: string;
  apiCost: string;
  cooldown: string;
  requiredFields: string[];
}

export interface NichePreset {
  name: string;
  description: string;
  jobs: SignalPresetConfig;
  funding: SignalPresetConfig;
  layoffs: SignalPresetConfig;
  hiring: SignalPresetConfig;
  tech: SignalPresetConfig;
}

const SAAS_PRESET: NichePreset = {
  name: 'SaaS / RevOps',
  description: 'Track SaaS sales roles, funding rounds, and CRM migrations',
  jobs: {
    provider: 'JSearch (RapidAPI)',
    url: 'https://jsearch.p.rapidapi.com/search?query=<KEYWORD>&page=1&num_pages=1&country=us&date_posted=all',
    method: 'GET',
    headers: {
      'X-RapidAPI-Key': '<YOUR_API_KEY>',
      'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
    },
    body: {},
    apiKey: '',
    description: 'Search job postings by keyword, location, and date. Supports remote/onsite filtering.',
    expectedFormat: '{ "data": [{ "job_title": "", "company_name": "", ... }] }',
    exampleResponse: '241 sales jobs in last 7 days',
    apiCost: '$5/month for 1000 requests',
    cooldown: 'None',
    requiredFields: ['X-RapidAPI-Key in headers', 'query parameter with <KEYWORD>'],
  },
  funding: {
    provider: 'Intellizence',
    url: 'https://api.intellizence.com/api/v2/dataset/fundraising',
    method: 'POST',
    headers: {},
    body: { limit: 5 },
    apiKey: '<YOUR_API_KEY>',
    description: 'Real-time funding events, Series A-D rounds, venture capital deals',
    expectedFormat: '{ "data": [{ "company": "", "round": "", "amount": ... }] }',
    exampleResponse: '17 Series A/B raises in past 10 days',
    apiCost: '$99/month for 10k events',
    cooldown: '1 hour recommended',
    requiredFields: ['x-api-key header'],
  },
  layoffs: {
    provider: 'Layoffs.fyi',
    url: 'https://layoffs.fyi/api/latest',
    method: 'GET',
    headers: {},
    body: {},
    apiKey: '',
    description: 'Track tech layoffs, downsizing events, and restructuring announcements',
    expectedFormat: '{ "layoffs": [{ "company": "", "count": ... }] }',
    exampleResponse: '3,200 layoffs across tech/security',
    apiCost: 'Free',
    cooldown: 'None',
    requiredFields: [],
  },
  hiring: {
    provider: 'Custom Endpoint',
    url: 'https://api.example.com/hiring-velocity',
    method: 'GET',
    headers: {},
    body: {},
    apiKey: '',
    description: 'Placeholder for custom hiring velocity data endpoint',
    expectedFormat: '{ "velocity": "up", "percentage": 22, "industry": "" }',
    exampleResponse: '↑ 22% in climate tech this month',
    apiCost: 'Varies',
    cooldown: 'Daily recommended',
    requiredFields: [],
  },
  tech: {
    provider: 'Wappalyzer',
    url: 'https://api.wappalyzer.com/v2/lookup/?urls=<COMPANY_DOMAIN>',
    method: 'GET',
    headers: {
      'x-api-key': '<YOUR_API_KEY>',
    },
    body: {},
    apiKey: '<YOUR_API_KEY>',
    description: 'Detect tech stacks, CRM systems, marketing tools on company websites',
    expectedFormat: '{ "technologies": [{ "name": "", "categories": [] }] }',
    exampleResponse: 'HubSpot → Salesforce migrations up 11%',
    apiCost: '$250/month for 10k lookups',
    cooldown: '1 request per domain per day',
    requiredFields: ['x-api-key header', 'urls parameter with company domain'],
  },
};

const BIOTECH_PRESET: NichePreset = {
  name: 'Biotech',
  description: 'Track biotech R&D roles, clinical trial funding, and lab equipment adoption',
  jobs: {
    provider: 'JSearch (RapidAPI)',
    url: 'https://jsearch.p.rapidapi.com/search?query=biotech%20research&page=1&num_pages=1&country=us&date_posted=week',
    method: 'GET',
    headers: {
      'X-RapidAPI-Key': '<YOUR_API_KEY>',
      'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
    },
    body: {},
    apiKey: '',
    description: 'Biotech research scientist, lab technician, clinical research roles',
    expectedFormat: '{ "data": [{ "job_title": "", "company_name": "", ... }] }',
    exampleResponse: '89 biotech research roles in last week',
    apiCost: '$5/month for 1000 requests',
    cooldown: 'None',
    requiredFields: ['X-RapidAPI-Key in headers'],
  },
  funding: {
    provider: 'Intellizence',
    url: 'https://api.intellizence.com/api/v2/dataset/fundraising',
    method: 'POST',
    headers: {},
    body: { limit: 5, industry: 'biotech' },
    apiKey: '<YOUR_API_KEY>',
    description: 'Biotech funding rounds, grants, clinical trial financing',
    expectedFormat: '{ "data": [{ "company": "", "round": "", "amount": ... }] }',
    exampleResponse: '12 biotech Series A rounds in Q4',
    apiCost: '$99/month for 10k events',
    cooldown: '1 hour recommended',
    requiredFields: ['x-api-key header'],
  },
  layoffs: {
    provider: 'Layoffs.fyi',
    url: 'https://layoffs.fyi/api/latest',
    method: 'GET',
    headers: {},
    body: {},
    apiKey: '',
    description: 'Track biotech/pharma layoffs and restructuring',
    expectedFormat: '{ "layoffs": [{ "company": "", "count": ... }] }',
    exampleResponse: '890 biotech layoffs in Nov-Dec',
    apiCost: 'Free',
    cooldown: 'None',
    requiredFields: [],
  },
  hiring: {
    provider: 'Custom Endpoint',
    url: 'https://api.example.com/hiring-velocity',
    method: 'GET',
    headers: {},
    body: {},
    apiKey: '',
    description: 'Biotech hiring trends and velocity metrics',
    expectedFormat: '{ "velocity": "up", "percentage": 15, "industry": "biotech" }',
    exampleResponse: '↑ 15% biotech hiring this quarter',
    apiCost: 'Varies',
    cooldown: 'Daily recommended',
    requiredFields: [],
  },
  tech: {
    provider: 'BuiltWith',
    url: 'https://api.builtwith.com/v20/api.json?KEY=<YOUR_API_KEY>&LOOKUP=<COMPANY_DOMAIN>',
    method: 'GET',
    headers: {},
    body: {},
    apiKey: '<YOUR_API_KEY>',
    description: 'Track lab management systems, ERP adoption in biotech companies',
    expectedFormat: '{ "Results": [{ "Result": { "Paths": [] } }] }',
    exampleResponse: 'Benchling adoption up 18% in Q4',
    apiCost: '$295/month for API access',
    cooldown: 'Rate limited to 1 req/sec',
    requiredFields: ['API KEY parameter'],
  },
};

const LOGISTICS_PRESET: NichePreset = {
  name: 'Logistics / Supply Chain',
  description: 'Track supply chain ops roles, logistics tech funding, and WMS adoption',
  jobs: {
    provider: 'JSearch (RapidAPI)',
    url: 'https://jsearch.p.rapidapi.com/search?query=supply%20chain%20manager&page=1&num_pages=1&country=us&date_posted=all',
    method: 'GET',
    headers: {
      'X-RapidAPI-Key': '<YOUR_API_KEY>',
      'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
    },
    body: {},
    apiKey: '',
    description: 'Supply chain, logistics coordinator, warehouse manager roles',
    expectedFormat: '{ "data": [{ "job_title": "", "company_name": "", ... }] }',
    exampleResponse: '156 supply chain roles open',
    apiCost: '$5/month for 1000 requests',
    cooldown: 'None',
    requiredFields: ['X-RapidAPI-Key in headers'],
  },
  funding: {
    provider: 'Intellizence',
    url: 'https://api.intellizence.com/api/v2/dataset/fundraising',
    method: 'POST',
    headers: {},
    body: { limit: 5, industry: 'logistics' },
    apiKey: '<YOUR_API_KEY>',
    description: 'Logistics tech funding, supply chain SaaS raises',
    expectedFormat: '{ "data": [{ "company": "", "round": "", "amount": ... }] }',
    exampleResponse: '9 logistics tech Series B rounds',
    apiCost: '$99/month for 10k events',
    cooldown: '1 hour recommended',
    requiredFields: ['x-api-key header'],
  },
  layoffs: {
    provider: 'Layoffs.fyi',
    url: 'https://layoffs.fyi/api/latest',
    method: 'GET',
    headers: {},
    body: {},
    apiKey: '',
    description: 'Track logistics and supply chain layoffs',
    expectedFormat: '{ "layoffs": [{ "company": "", "count": ... }] }',
    exampleResponse: '1,240 logistics layoffs in Q4',
    apiCost: 'Free',
    cooldown: 'None',
    requiredFields: [],
  },
  hiring: {
    provider: 'Custom Endpoint',
    url: 'https://api.example.com/hiring-velocity',
    method: 'GET',
    headers: {},
    body: {},
    apiKey: '',
    description: 'Supply chain hiring velocity metrics',
    expectedFormat: '{ "velocity": "down", "percentage": -8, "industry": "logistics" }',
    exampleResponse: '↓ 8% in logistics hiring',
    apiCost: 'Varies',
    cooldown: 'Daily recommended',
    requiredFields: [],
  },
  tech: {
    provider: 'BuiltWith',
    url: 'https://api.builtwith.com/v20/api.json?KEY=<YOUR_API_KEY>&LOOKUP=<COMPANY_DOMAIN>',
    method: 'GET',
    headers: {},
    body: {},
    apiKey: '<YOUR_API_KEY>',
    description: 'Track WMS, TMS, and supply chain software adoption',
    expectedFormat: '{ "Results": [{ "Result": { "Paths": [] } }] }',
    exampleResponse: 'NetSuite → SAP migrations up 14%',
    apiCost: '$295/month for API access',
    cooldown: 'Rate limited to 1 req/sec',
    requiredFields: ['API KEY parameter'],
  },
};

const AGENCIES_PRESET: NichePreset = {
  name: 'Agencies',
  description: 'Track creative, marketing, and consulting agency signals',
  jobs: {
    provider: 'JSearch (RapidAPI)',
    url: 'https://jsearch.p.rapidapi.com/search?query=marketing%20manager&page=1&num_pages=1&country=us&date_posted=all',
    method: 'GET',
    headers: {
      'X-RapidAPI-Key': '<YOUR_API_KEY>',
      'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
    },
    body: {},
    apiKey: '',
    description: 'Creative director, account manager, marketing strategist roles',
    expectedFormat: '{ "data": [{ "job_title": "", "company_name": "", ... }] }',
    exampleResponse: '203 agency roles posted this week',
    apiCost: '$5/month for 1000 requests',
    cooldown: 'None',
    requiredFields: ['X-RapidAPI-Key in headers'],
  },
  funding: {
    provider: 'Intellizence',
    url: 'https://api.intellizence.com/api/v2/dataset/fundraising',
    method: 'POST',
    headers: {},
    body: { limit: 5, industry: 'marketing' },
    apiKey: '<YOUR_API_KEY>',
    description: 'MarTech, AdTech, and agency platform funding',
    expectedFormat: '{ "data": [{ "company": "", "round": "", "amount": ... }] }',
    exampleResponse: '14 MarTech Series A raises',
    apiCost: '$99/month for 10k events',
    cooldown: '1 hour recommended',
    requiredFields: ['x-api-key header'],
  },
  layoffs: {
    provider: 'Layoffs.fyi',
    url: 'https://layoffs.fyi/api/latest',
    method: 'GET',
    headers: {},
    body: {},
    apiKey: '',
    description: 'Track agency and marketing tech layoffs',
    expectedFormat: '{ "layoffs": [{ "company": "", "count": ... }] }',
    exampleResponse: '780 agency layoffs in Nov',
    apiCost: 'Free',
    cooldown: 'None',
    requiredFields: [],
  },
  hiring: {
    provider: 'Custom Endpoint',
    url: 'https://api.example.com/hiring-velocity',
    method: 'GET',
    headers: {},
    body: {},
    apiKey: '',
    description: 'Agency hiring trends and velocity',
    expectedFormat: '{ "velocity": "up", "percentage": 12, "industry": "agencies" }',
    exampleResponse: '↑ 12% in agency hiring',
    apiCost: 'Varies',
    cooldown: 'Daily recommended',
    requiredFields: [],
  },
  tech: {
    provider: 'Wappalyzer',
    url: 'https://api.wappalyzer.com/v2/lookup/?urls=<COMPANY_DOMAIN>',
    method: 'GET',
    headers: {
      'x-api-key': '<YOUR_API_KEY>',
    },
    body: {},
    apiKey: '<YOUR_API_KEY>',
    description: 'Track CMS, marketing automation, and analytics tool adoption',
    expectedFormat: '{ "technologies": [{ "name": "", "categories": [] }] }',
    exampleResponse: 'Marketo → HubSpot migrations up 9%',
    apiCost: '$250/month for 10k lookups',
    cooldown: '1 request per domain per day',
    requiredFields: ['x-api-key header'],
  },
};

const FINANCE_PRESET: NichePreset = {
  name: 'Finance / Wealth',
  description: 'Track fintech roles, wealth management funding, and financial software adoption',
  jobs: {
    provider: 'JSearch (RapidAPI)',
    url: 'https://jsearch.p.rapidapi.com/search?query=financial%20analyst&page=1&num_pages=1&country=us&date_posted=all',
    method: 'GET',
    headers: {
      'X-RapidAPI-Key': '<YOUR_API_KEY>',
      'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
    },
    body: {},
    apiKey: '',
    description: 'Financial analyst, wealth advisor, fintech product manager roles',
    expectedFormat: '{ "data": [{ "job_title": "", "company_name": "", ... }] }',
    exampleResponse: '178 finance roles this month',
    apiCost: '$5/month for 1000 requests',
    cooldown: 'None',
    requiredFields: ['X-RapidAPI-Key in headers'],
  },
  funding: {
    provider: 'Intellizence',
    url: 'https://api.intellizence.com/api/v2/dataset/fundraising',
    method: 'POST',
    headers: {},
    body: { limit: 5, industry: 'fintech' },
    apiKey: '<YOUR_API_KEY>',
    description: 'Fintech funding, wealth management platform raises',
    expectedFormat: '{ "data": [{ "company": "", "round": "", "amount": ... }] }',
    exampleResponse: '21 fintech Series A/B rounds',
    apiCost: '$99/month for 10k events',
    cooldown: '1 hour recommended',
    requiredFields: ['x-api-key header'],
  },
  layoffs: {
    provider: 'Layoffs.fyi',
    url: 'https://layoffs.fyi/api/latest',
    method: 'GET',
    headers: {},
    body: {},
    apiKey: '',
    description: 'Track fintech and banking layoffs',
    expectedFormat: '{ "layoffs": [{ "company": "", "count": ... }] }',
    exampleResponse: '2,100 fintech layoffs in Q4',
    apiCost: 'Free',
    cooldown: 'None',
    requiredFields: [],
  },
  hiring: {
    provider: 'Custom Endpoint',
    url: 'https://api.example.com/hiring-velocity',
    method: 'GET',
    headers: {},
    body: {},
    apiKey: '',
    description: 'Finance industry hiring velocity',
    expectedFormat: '{ "velocity": "up", "percentage": 7, "industry": "finance" }',
    exampleResponse: '↑ 7% in wealth management hiring',
    apiCost: 'Varies',
    cooldown: 'Daily recommended',
    requiredFields: [],
  },
  tech: {
    provider: 'BuiltWith',
    url: 'https://api.builtwith.com/v20/api.json?KEY=<YOUR_API_KEY>&LOOKUP=<COMPANY_DOMAIN>',
    method: 'GET',
    headers: {},
    body: {},
    apiKey: '<YOUR_API_KEY>',
    description: 'Track CRM, portfolio management, and financial software adoption',
    expectedFormat: '{ "Results": [{ "Result": { "Paths": [] } }] }',
    exampleResponse: 'Salesforce Financial Services Cloud adoption up 13%',
    apiCost: '$295/month for API access',
    cooldown: 'Rate limited to 1 req/sec',
    requiredFields: ['API KEY parameter'],
  },
};

export const PRESET_PACKS: NichePreset[] = [
  SAAS_PRESET,
  BIOTECH_PRESET,
  LOGISTICS_PRESET,
  AGENCIES_PRESET,
  FINANCE_PRESET,
];

export function getPresetByName(name: string): NichePreset | undefined {
  return PRESET_PACKS.find(p => p.name === name);
}

export function validateUrl(url: string): { valid: boolean; error?: string } {
  if (!url || url.trim() === '') {
    return { valid: false, error: 'URL is required' };
  }

  try {
    const urlObj = new URL(url.replace('<KEYWORD>', 'test').replace('<COMPANY_DOMAIN>', 'example.com').replace('<DATE>', '2024-01-01').replace('<YOUR_API_KEY>', 'test-key'));
    if (!urlObj.protocol.startsWith('http')) {
      return { valid: false, error: 'URL must use HTTP or HTTPS' };
    }
    return { valid: true };
  } catch (e) {
    return { valid: false, error: 'Invalid URL format' };
  }
}

export function validateJson(jsonString: string): { valid: boolean; error?: string } {
  if (!jsonString || jsonString.trim() === '') {
    return { valid: true };
  }

  try {
    JSON.parse(jsonString);
    return { valid: true };
  } catch (e) {
    return { valid: false, error: 'Invalid JSON format' };
  }
}

export function validateMethod(method: string): { valid: boolean; error?: string } {
  const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  if (!validMethods.includes(method.toUpperCase())) {
    return { valid: false, error: 'Method must be GET, POST, PUT, PATCH, or DELETE' };
  }
  return { valid: true };
}
