/**
 * Dataset Intelligence Service
 *
 * Analyzes datasets and generates counterparty scraper filters.
 * This is the "Claude brain" for matching - it does automatically what
 * Claude did manually when analyzing the pharma/recruiter datasets.
 */

import { callAI, type AIConfig } from './AIService';

export interface DatasetHealth {
  totalContacts: number;
  withEmail: number;
  emailCoverage: number;  // 0-100
  industries: string[];
  topIndustry: string;
  roles: string[];
  decisionMakerPercent: number;  // 0-100
  datasetType: 'demand' | 'supply' | 'unknown';
  niche: string;
  sampleCompanies: { name: string; industry: string }[];
  // Enrichment cost estimate
  enrichmentEstimate: {
    recordsNeedingEnrichment: number;
    creditsRequired: number;
    estimatedCost: number;  // USD based on $0.024/credit (Apollo $59/2500)
  };
}

export interface CounterpartyFilters {
  description: string;  // "Pharma/Biotech Recruiters"
  jobTitlesInclude: string[];
  jobTitlesExclude: string[];
  industriesInclude: string[];
  keywordsInclude: string[];
  keywordsExclude: string[];
  linkedInSearchUrl?: string;  // Pre-built search URL
}

export interface MatchPrediction {
  demandContacts: number;
  demandWithEmail: number;
  supplyContacts: number;
  supplyWithEmail: number;
  matchRate: number;  // 0-100
  matchQuality: 'excellent' | 'good' | 'partial' | 'poor';
  introsPossible: number;
  enrichmentNeeded: number;
  estimatedCost: number;  // USD
  reasoning: string;
}

// Decision maker title patterns
const DECISION_MAKER_PATTERNS = [
  /\b(ceo|cto|cfo|coo|cmo|cpo|cro)\b/i,
  /\b(founder|co-founder|cofounder)\b/i,
  /\b(president|owner)\b/i,
  /\b(partner|managing\s+director|md)\b/i,
  /\b(vp|vice\s+president)\b/i,
  /\b(director|head\s+of)\b/i,
  /\b(chief)\b/i,
  /\b(principal)\b/i,
];

// Supply-side indicators (recruiters, agencies, consultants)
const SUPPLY_INDICATORS = [
  'recruiting', 'staffing', 'talent', 'headhunter', 'search firm',
  'placement', 'consulting', 'agency', 'services', 'solutions',
  'outsourcing', 'contractor', 'freelance', 'fractional'
];

// Niche detection patterns (when industry field is missing)
const NICHE_PATTERNS: Record<string, string[]> = {
  'Pharma/Biotech': ['pharma', 'biotech', 'clinical', 'medical device', 'life science', 'healthcare', 'therapeutics', 'drug', 'fda', 'regulatory'],
  'SaaS/Tech': ['saas', 'software', 'tech', 'cloud', 'platform', 'api', 'developer', 'engineering', 'startup', 'ai', 'machine learning', 'data'],
  'FinTech': ['fintech', 'payments', 'banking', 'financial', 'crypto', 'blockchain', 'trading', 'investment', 'wealth'],
  'Finance': ['finance', 'accounting', 'cfo', 'controller', 'fp&a', 'audit', 'tax'],
  'Real Estate': ['real estate', 'property', 'commercial real estate', 'cre', 'construction', 'development', 'reit'],
  'Healthcare': ['healthcare', 'hospital', 'clinic', 'patient', 'medical', 'health system', 'nursing'],
  'Legal': ['legal', 'law firm', 'attorney', 'lawyer', 'litigation', 'compliance', 'counsel'],
  'Marketing': ['marketing', 'growth', 'brand', 'digital marketing', 'seo', 'content', 'advertising', 'creative'],
  'Sales': ['sales', 'revenue', 'account executive', 'business development', 'partnerships', 'enterprise'],
  'HR/People': ['hr', 'human resources', 'people ops', 'talent acquisition', 'recruiting', 'culture'],
  'Manufacturing': ['manufacturing', 'production', 'supply chain', 'logistics', 'operations', 'factory', 'industrial'],
  'E-commerce': ['ecommerce', 'e-commerce', 'retail', 'dtc', 'shopify', 'amazon', 'marketplace'],
  'Cybersecurity': ['security', 'cybersecurity', 'infosec', 'compliance', 'soc', 'penetration', 'vulnerability'],
};

// Job role → supply niche mapping (for JOBS datasets)
const JOB_ROLE_TO_NICHE: Record<string, string[]> = {
  'sales': ['account executive', 'ae', 'sdr', 'bdr', 'sales', 'partnerships', 'business development', 'revenue', 'account manager'],
  'tech': ['engineer', 'developer', 'swe', 'software', 'frontend', 'backend', 'fullstack', 'devops', 'sre', 'data scientist', 'ml engineer'],
  'finance': ['cfo', 'finance', 'controller', 'accountant', 'fp&a', 'financial analyst', 'treasurer'],
  'hr': ['recruiter', 'talent', 'hr', 'human resources', 'people ops', 'people operations'],
  'marketing': ['marketing', 'cmo', 'growth', 'content', 'brand', 'demand gen'],
  'product': ['product manager', 'product owner', 'pm', 'product lead'],
};

/**
 * Detect niche from job roles (for JOBS datasets only)
 * Returns niche string if jobs dataset with clear role, null otherwise
 */
function detectJobsDatasetNiche(items: any[]): string | null {
  // Check if this looks like a jobs dataset
  const hasJobFields = items.slice(0, 10).some(item =>
    item.job_title || item.job_name || item.job_id || item.job_listing_posted || item.job_url
  );

  if (!hasJobFields) {
    return null; // Not a jobs dataset, use existing logic
  }

  console.log('[DatasetIntelligence] Detected JOBS dataset, using role-based niche detection');

  // Extract job titles
  const jobTitles = items.slice(0, 30).map(item =>
    (item.job_title || item.job_name || item.title || item.position || '').toLowerCase()
  ).filter(Boolean);

  if (jobTitles.length === 0) {
    return null;
  }

  // Score each niche by job role matches
  const scores: Record<string, number> = {};
  for (const [niche, keywords] of Object.entries(JOB_ROLE_TO_NICHE)) {
    scores[niche] = jobTitles.reduce((score, title) => {
      const matches = keywords.filter(kw => title.includes(kw)).length;
      return score + matches;
    }, 0);
  }

  // Find dominant role
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sorted[0] && sorted[0][1] >= 2) {
    console.log('[DatasetIntelligence] Job role niche:', sorted[0][0], 'score:', sorted[0][1]);
    return sorted[0][0];
  }

  return null; // No clear role match, fall back to existing logic
}

/**
 * Detect niche from text content (job titles, descriptions, company names)
 */
function detectNicheFromText(items: any[]): string {
  // Build a text blob from first 20 items
  const textBlob = items.slice(0, 20).map(item => {
    return [
      item.job_title || item.title || item.position || '',
      item.company_name || item.companyName || item.company || '',
      item.description || item.job_description || '',
      item.industry || item.company_industry || '',
    ].join(' ');
  }).join(' ').toLowerCase();

  // Score each niche
  const scores: Record<string, number> = {};
  for (const [niche, keywords] of Object.entries(NICHE_PATTERNS)) {
    scores[niche] = keywords.reduce((score, kw) => {
      const matches = (textBlob.match(new RegExp(kw, 'gi')) || []).length;
      return score + matches;
    }, 0);
  }

  // Find top scoring niche
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sorted[0] && sorted[0][1] >= 3) {
    return sorted[0][0];
  }

  return 'General';
}

/**
 * Analyze a dataset and return health metrics
 */
export async function analyzeDatasetHealth(
  items: any[],
  aiConfig?: AIConfig | null
): Promise<DatasetHealth> {
  if (!items || items.length === 0) {
    return {
      totalContacts: 0,
      withEmail: 0,
      emailCoverage: 0,
      industries: [],
      topIndustry: 'Unknown',
      roles: [],
      decisionMakerPercent: 0,
      datasetType: 'unknown',
      niche: 'Unknown',
      sampleCompanies: [],
      enrichmentEstimate: {
        recordsNeedingEnrichment: 0,
        creditsRequired: 0,
        estimatedCost: 0,
      },
    };
  }

  // Count emails
  const withEmail = items.filter(item =>
    item.email || item.personal_email || item.work_email
  ).length;

  // Extract industries
  const industryMap = new Map<string, number>();
  items.forEach(item => {
    const industry = item.industry || item.company_industry || '';
    if (industry) {
      industryMap.set(industry, (industryMap.get(industry) || 0) + 1);
    }
  });
  const industries = Array.from(industryMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([ind]) => ind);
  const topIndustry = industries[0] || 'Unknown';

  // Extract roles and count decision makers
  const roles: string[] = [];
  let decisionMakers = 0;
  items.forEach(item => {
    const title = item.job_title || item.title || item.position || '';
    if (title && !roles.includes(title)) {
      roles.push(title);
    }
    if (DECISION_MAKER_PATTERNS.some(p => p.test(title))) {
      decisionMakers++;
    }
  });

  // Detect if this is supply or demand
  let supplyScore = 0;
  let demandScore = 0;
  items.slice(0, 20).forEach(item => {
    const text = JSON.stringify(item).toLowerCase();
    SUPPLY_INDICATORS.forEach(indicator => {
      if (text.includes(indicator)) supplyScore++;
    });
    // Demand indicators: product companies, not service providers
    if (text.includes('product') || text.includes('platform') || text.includes('software')) {
      demandScore++;
    }
  });
  const datasetType = supplyScore > demandScore * 2 ? 'supply' : 'demand';

  // Sample companies
  const sampleCompanies = items.slice(0, 10).map(item => ({
    name: item.company_name || item.companyName || item.company || 'Unknown',
    industry: item.industry || item.company_industry || 'Unknown',
  }));

  // Detect niche - multiple fallback layers
  // Layer 0: For JOBS datasets, job role determines niche (not company industry)
  const jobsNiche = detectJobsDatasetNiche(items);
  let niche = jobsNiche || topIndustry;

  // Layer 1: If still unknown/empty, try text-based detection
  if (!niche || niche === 'Unknown' || niche.toLowerCase() === 'unknown') {
    niche = detectNicheFromText(items);
    console.log('[DatasetIntelligence] Text-based niche detection:', niche);
  }

  // Layer 2: Try AI if available and still no good niche
  if (aiConfig && (!niche || niche === 'General' || niche === 'Unknown')) {
    try {
      const sampleData = items.slice(0, 5).map(item => ({
        company: item.company_name || item.companyName,
        industry: item.industry,
        title: item.job_title || item.title,
        description: (item.description || item.job_description || '').slice(0, 200),
      }));

      const prompt = `Analyze this dataset sample and identify the business niche in 2-3 words.

${JSON.stringify(sampleData, null, 2)}

Respond with ONLY the niche name. Examples: "Pharma/Biotech", "SaaS/Tech", "Real Estate", "FinTech", "Healthcare", "Legal", "E-commerce".
Do NOT respond with "Unknown" or "General" - always identify the most likely niche.`;

      const result = await callAI(aiConfig, prompt);
      if (result && result.length < 30 && !result.toLowerCase().includes('unknown')) {
        niche = result.trim().replace(/['"]/g, '');
        console.log('[DatasetIntelligence] AI niche detection:', niche);
      }
    } catch (e) {
      console.warn('[DatasetIntelligence] AI niche detection failed:', e);
    }
  }

  // Layer 3: Final fallback
  if (!niche || niche === 'Unknown') {
    niche = 'General';
  }

  // Calculate enrichment cost estimate
  // Apollo: $59/mo = 2,500 credits, 1 credit = 1 verified email
  const COST_PER_CREDIT = 0.024; // $59 / 2500
  const recordsNeedingEnrichment = items.length - withEmail;
  const creditsRequired = recordsNeedingEnrichment;
  const estimatedCost = Math.round(creditsRequired * COST_PER_CREDIT * 100) / 100;

  return {
    totalContacts: items.length,
    withEmail,
    emailCoverage: Math.round((withEmail / items.length) * 100),
    industries,
    topIndustry,
    roles: roles.slice(0, 20),
    decisionMakerPercent: Math.round((decisionMakers / items.length) * 100),
    datasetType,
    niche,
    sampleCompanies,
    enrichmentEstimate: {
      recordsNeedingEnrichment,
      creditsRequired,
      estimatedCost,
    },
  };
}

/**
 * Generate counterparty scraper filters based on demand dataset
 */
export async function generateCounterpartyFilters(
  demandHealth: DatasetHealth,
  aiConfig?: AIConfig | null
): Promise<CounterpartyFilters> {
  // Default filters based on niche heuristics
  const nicheFilters: Record<string, CounterpartyFilters> = {
    'pharma': {
      description: 'Life Sciences Recruiters',
      jobTitlesInclude: ['Partner', 'Managing Director', 'Director', 'Founder', 'CEO', 'President', 'Principal', 'VP Recruiting', 'Head of Talent'],
      jobTitlesExclude: ['Intern', 'Coordinator', 'Assistant', 'Junior', 'Associate', 'Analyst', 'Specialist'],
      industriesInclude: ['Staffing and Recruiting', 'Human Resources', 'Executive Search'],
      keywordsInclude: ['pharma', 'biotech', 'life sciences', 'pharmaceutical', 'medical device', 'clinical', 'healthcare recruiting'],
      keywordsExclude: ['internal', 'in-house', 'corporate HR', 'freelance platform'],
    },
    'biotech': {
      description: 'Life Sciences Recruiters',
      jobTitlesInclude: ['Partner', 'Managing Director', 'Director', 'Founder', 'CEO', 'President', 'Principal'],
      jobTitlesExclude: ['Intern', 'Coordinator', 'Assistant', 'Junior', 'Associate'],
      industriesInclude: ['Staffing and Recruiting', 'Biotechnology', 'Executive Search'],
      keywordsInclude: ['biotech', 'life sciences', 'pharma', 'clinical', 'R&D', 'scientific recruiting'],
      keywordsExclude: ['internal', 'in-house'],
    },
    'saas': {
      description: 'Tech Recruiters & Fractional Executives',
      jobTitlesInclude: ['Partner', 'Managing Director', 'Director', 'Founder', 'CEO', 'Fractional CTO', 'Fractional VP'],
      jobTitlesExclude: ['Intern', 'Coordinator', 'Assistant', 'Junior', 'Associate'],
      industriesInclude: ['Staffing and Recruiting', 'Information Technology', 'Executive Search'],
      keywordsInclude: ['tech recruiting', 'software', 'engineering', 'SaaS', 'startup', 'venture'],
      keywordsExclude: ['internal', 'in-house', 'freelance platform'],
    },
    'tech': {
      description: 'Tech Recruiters & Talent Partners',
      jobTitlesInclude: ['Partner', 'Managing Director', 'Director', 'Founder', 'CEO', 'Head of Talent'],
      jobTitlesExclude: ['Intern', 'Coordinator', 'Assistant', 'Junior', 'Associate'],
      industriesInclude: ['Staffing and Recruiting', 'Information Technology', 'Software Development'],
      keywordsInclude: ['tech recruiting', 'software engineers', 'developers', 'engineering talent', 'startup hiring'],
      keywordsExclude: ['internal', 'in-house'],
    },
    'fintech': {
      description: 'FinTech Recruiters & Advisors',
      jobTitlesInclude: ['Partner', 'Managing Director', 'Director', 'Founder', 'CEO', 'Principal'],
      jobTitlesExclude: ['Intern', 'Coordinator', 'Assistant', 'Junior', 'Associate'],
      industriesInclude: ['Staffing and Recruiting', 'Financial Services', 'Information Technology'],
      keywordsInclude: ['fintech recruiting', 'payments', 'banking tech', 'crypto', 'blockchain talent'],
      keywordsExclude: ['internal', 'in-house'],
    },
    'finance': {
      description: 'Finance Recruiters & Fractional CFOs',
      jobTitlesInclude: ['Partner', 'Managing Director', 'Director', 'Founder', 'CEO', 'Fractional CFO', 'Principal'],
      jobTitlesExclude: ['Intern', 'Coordinator', 'Assistant', 'Junior', 'Analyst'],
      industriesInclude: ['Staffing and Recruiting', 'Financial Services', 'Executive Search'],
      keywordsInclude: ['finance recruiting', 'CFO', 'accounting', 'FP&A', 'controller'],
      keywordsExclude: ['internal', 'in-house'],
    },
    'real estate': {
      description: 'Real Estate Recruiters & Brokers',
      jobTitlesInclude: ['Partner', 'Managing Director', 'Director', 'Broker', 'Founder', 'CEO', 'Principal'],
      jobTitlesExclude: ['Intern', 'Coordinator', 'Assistant', 'Junior', 'Agent trainee'],
      industriesInclude: ['Staffing and Recruiting', 'Real Estate', 'Commercial Real Estate'],
      keywordsInclude: ['real estate recruiting', 'CRE', 'commercial', 'property', 'construction'],
      keywordsExclude: ['residential agent', 'rental'],
    },
    'healthcare': {
      description: 'Healthcare Recruiters & Staffing',
      jobTitlesInclude: ['Partner', 'Managing Director', 'Director', 'Founder', 'CEO', 'President'],
      jobTitlesExclude: ['Intern', 'Coordinator', 'Assistant', 'Junior', 'Associate'],
      industriesInclude: ['Staffing and Recruiting', 'Healthcare', 'Hospital & Health Care'],
      keywordsInclude: ['healthcare recruiting', 'medical staffing', 'nursing', 'clinical', 'hospital'],
      keywordsExclude: ['internal', 'in-house'],
    },
    'legal': {
      description: 'Legal Recruiters & Consultants',
      jobTitlesInclude: ['Partner', 'Managing Director', 'Director', 'Founder', 'CEO', 'Principal'],
      jobTitlesExclude: ['Intern', 'Coordinator', 'Assistant', 'Paralegal', 'Associate'],
      industriesInclude: ['Staffing and Recruiting', 'Legal Services', 'Law Practice'],
      keywordsInclude: ['legal recruiting', 'law firm', 'attorney', 'lawyer placement', 'legal staffing'],
      keywordsExclude: ['internal', 'in-house'],
    },
    'marketing': {
      description: 'Marketing Agencies & Fractional CMOs',
      jobTitlesInclude: ['Partner', 'Managing Director', 'Director', 'Founder', 'CEO', 'Fractional CMO'],
      jobTitlesExclude: ['Intern', 'Coordinator', 'Assistant', 'Junior', 'Associate'],
      industriesInclude: ['Marketing and Advertising', 'Marketing Services', 'Digital Marketing'],
      keywordsInclude: ['marketing agency', 'growth agency', 'brand consulting', 'digital marketing', 'CMO services'],
      keywordsExclude: ['internal', 'in-house', 'freelance platform'],
    },
    'sales': {
      description: 'Sales Recruiters & Fractional CROs',
      jobTitlesInclude: ['Partner', 'Managing Director', 'Director', 'Founder', 'CEO', 'Fractional CRO'],
      jobTitlesExclude: ['Intern', 'Coordinator', 'Assistant', 'Junior', 'Associate', 'SDR', 'BDR'],
      industriesInclude: ['Staffing and Recruiting', 'Sales', 'Business Development'],
      keywordsInclude: ['sales recruiting', 'revenue leaders', 'VP Sales', 'CRO', 'sales talent'],
      keywordsExclude: ['internal', 'in-house'],
    },
    'hr': {
      description: 'HR Consultants & Fractional CHROs',
      jobTitlesInclude: ['Partner', 'Managing Director', 'Director', 'Founder', 'CEO', 'Fractional CHRO'],
      jobTitlesExclude: ['Intern', 'Coordinator', 'Assistant', 'Junior', 'Associate'],
      industriesInclude: ['Human Resources', 'HR Consulting', 'Management Consulting'],
      keywordsInclude: ['HR consulting', 'people ops', 'talent strategy', 'CHRO services', 'culture consulting'],
      keywordsExclude: ['internal', 'in-house'],
    },
    'manufacturing': {
      description: 'Manufacturing Recruiters & Consultants',
      jobTitlesInclude: ['Partner', 'Managing Director', 'Director', 'Founder', 'CEO', 'Principal'],
      jobTitlesExclude: ['Intern', 'Coordinator', 'Assistant', 'Junior', 'Operator'],
      industriesInclude: ['Staffing and Recruiting', 'Manufacturing', 'Industrial'],
      keywordsInclude: ['manufacturing recruiting', 'operations', 'supply chain', 'industrial', 'plant manager'],
      keywordsExclude: ['internal', 'in-house'],
    },
    'ecommerce': {
      description: 'E-commerce Agencies & Consultants',
      jobTitlesInclude: ['Partner', 'Managing Director', 'Director', 'Founder', 'CEO', 'Principal'],
      jobTitlesExclude: ['Intern', 'Coordinator', 'Assistant', 'Junior', 'Associate'],
      industriesInclude: ['Marketing and Advertising', 'E-commerce', 'Retail'],
      keywordsInclude: ['ecommerce agency', 'shopify', 'amazon', 'DTC', 'marketplace', 'retail consulting'],
      keywordsExclude: ['internal', 'in-house'],
    },
    'cybersecurity': {
      description: 'Security Recruiters & Consultants',
      jobTitlesInclude: ['Partner', 'Managing Director', 'Director', 'Founder', 'CEO', 'CISO', 'Principal'],
      jobTitlesExclude: ['Intern', 'Coordinator', 'Assistant', 'Junior', 'Analyst'],
      industriesInclude: ['Staffing and Recruiting', 'Computer & Network Security', 'Information Technology'],
      keywordsInclude: ['security recruiting', 'cybersecurity', 'CISO', 'infosec', 'security consulting'],
      keywordsExclude: ['internal', 'in-house'],
    },
    'general': {
      description: 'Executive Recruiters & Consultants',
      jobTitlesInclude: ['Partner', 'Managing Director', 'Director', 'Founder', 'CEO', 'President', 'Principal'],
      jobTitlesExclude: ['Intern', 'Coordinator', 'Assistant', 'Junior', 'Associate', 'Analyst'],
      industriesInclude: ['Staffing and Recruiting', 'Management Consulting', 'Executive Search'],
      keywordsInclude: ['executive search', 'recruiting', 'talent', 'consulting', 'staffing'],
      keywordsExclude: ['internal', 'in-house', 'corporate HR'],
    },
  };

  // Try to match niche
  const nicheLower = demandHealth.niche.toLowerCase();
  let filters: CounterpartyFilters | null = null;

  for (const [key, value] of Object.entries(nicheFilters)) {
    if (nicheLower.includes(key)) {
      filters = value;
      break;
    }
  }

  // If no match and AI available, generate custom filters for ANY niche
  if (!filters && aiConfig) {
    try {
      const prompt = `You are a connector matching expert. Given a DEMAND dataset, generate scraper filters to find the SUPPLY (service providers who monetize this need).

DEMAND PROFILE:
- Detected Niche: ${demandHealth.niche}
- Top Industry: ${demandHealth.topIndustry}
- Sample Companies: ${demandHealth.sampleCompanies.slice(0, 5).map(c => `${c.name} (${c.industry})`).join(', ')}
- Decision Maker Roles: ${demandHealth.roles.slice(0, 8).join(', ')}

THE CONNECTOR MODEL:
- Demand = companies/people with a NEED (hiring, scaling, buying, seeking)
- Supply = service providers who FULFILL that need (agencies, consultants, recruiters, advisors)
- The connector routes signals between them

EXAMPLES OF DEMAND → SUPPLY MAPPING:
- Pharma companies hiring → Life Sciences Recruiters
- Startups scaling → Tech Recruiters, Fractional CTOs
- HNW individuals → Wealth Managers, Family Offices
- E-commerce brands → Shopify Agencies, Growth Consultants
- Companies with security needs → CISO Consultants, Security Firms
- Real estate investors → CRE Brokers, Property Managers

YOUR TASK:
For the demand profile above, identify WHO MONETIZES this need. Generate LinkedIn scraper filters.

Respond with JSON only (no markdown):
{
  "description": "<2-4 word label for the supply type, e.g. 'Wealth Management Advisors'>",
  "jobTitlesInclude": ["Partner", "Managing Director", "Director", "Founder", "CEO", "President", "Principal", "<add 8-10 more senior titles specific to this niche>"],
  "jobTitlesExclude": ["Intern", "Coordinator", "Assistant", "Junior", "Associate", "Analyst", "Trainee", "Entry"],
  "industriesInclude": ["<3-5 LinkedIn industries where these providers work>"],
  "keywordsInclude": ["<12-15 keywords that identify providers in this space - be specific to the niche>"],
  "keywordsExclude": ["internal", "in-house", "corporate", "<add 3-5 more exclusions>"]
}

IMPORTANT:
- Be SPECIFIC to the niche, not generic
- jobTitlesInclude should have 12-15 titles
- keywordsInclude should have 12-15 niche-specific terms
- Think: "Who gets PAID when this demand is fulfilled?"`;

      const result = await callAI(aiConfig, prompt);
      if (result) {
        const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        // Validate the response has required fields
        if (parsed.description && parsed.jobTitlesInclude && parsed.keywordsInclude) {
          filters = parsed;
          console.log('[DatasetIntelligence] AI generated custom filters for:', demandHealth.niche);
        }
      }
    } catch (e) {
      console.warn('[DatasetIntelligence] AI filter generation failed:', e);
    }
  }

  // Fallback to generic filters
  if (!filters) {
    filters = {
      description: `${demandHealth.niche} Service Providers`,
      jobTitlesInclude: ['Partner', 'Managing Director', 'Director', 'Founder', 'CEO', 'President', 'Principal', 'VP', 'Head of'],
      jobTitlesExclude: ['Intern', 'Coordinator', 'Assistant', 'Junior', 'Associate', 'Analyst'],
      industriesInclude: ['Staffing and Recruiting', 'Management Consulting', 'Professional Services'],
      keywordsInclude: [demandHealth.niche.toLowerCase(), 'consulting', 'services', 'recruiting', 'staffing'],
      keywordsExclude: ['internal', 'in-house', 'corporate'],
    };
  }

  return filters;
}

/**
 * Predict match quality and intro count
 */
export function predictMatch(
  demandHealth: DatasetHealth,
  supplyHealth: DatasetHealth
): MatchPrediction {
  const demandWithEmail = demandHealth.withEmail;
  const supplyWithEmail = supplyHealth.withEmail;

  // Calculate match rate based on industry overlap
  const demandIndustries = new Set(demandHealth.industries.map(i => i.toLowerCase()));
  const supplyKeywords = supplyHealth.industries.map(i => i.toLowerCase()).join(' ');

  let matchRate = 50; // Base rate for curated lists

  // Boost if supply looks like recruiters/agencies
  if (supplyHealth.datasetType === 'supply') {
    matchRate += 30;
  }

  // Boost if industries align
  if (demandIndustries.size > 0) {
    const industryMatch = Array.from(demandIndustries).some(ind =>
      supplyKeywords.includes(ind) || supplyKeywords.includes('recruit') || supplyKeywords.includes('staff')
    );
    if (industryMatch) matchRate += 20;
  }

  matchRate = Math.min(100, matchRate);

  // Determine match quality
  let matchQuality: 'excellent' | 'good' | 'partial' | 'poor';
  if (matchRate >= 80) matchQuality = 'excellent';
  else if (matchRate >= 60) matchQuality = 'good';
  else if (matchRate >= 40) matchQuality = 'partial';
  else matchQuality = 'poor';

  // Calculate intros possible (min of emails on each side)
  const introsPossible = Math.min(demandWithEmail, supplyWithEmail * 5); // Each supply can handle multiple demands

  // Enrichment needed (contacts without emails)
  const enrichmentNeeded = (demandHealth.totalContacts - demandWithEmail) +
                          (supplyHealth.totalContacts - supplyWithEmail);

  // Cost estimate: $0.015 per intro (AI) + $0.05 per enrichment
  const estimatedCost = (introsPossible * 0.015) + (enrichmentNeeded * 0.05);

  // Generate reasoning
  let reasoning = '';
  if (matchRate >= 80) {
    reasoning = `Excellent match: ${demandHealth.niche} companies paired with ${supplyHealth.niche || 'service providers'}. `;
  } else if (matchRate >= 60) {
    reasoning = `Good match potential. `;
  } else {
    reasoning = `Partial match - consider refining supply dataset. `;
  }

  reasoning += `${demandWithEmail} demand contacts and ${supplyWithEmail} supply contacts have emails.`;

  return {
    demandContacts: demandHealth.totalContacts,
    demandWithEmail,
    supplyContacts: supplyHealth.totalContacts,
    supplyWithEmail,
    matchRate,
    matchQuality,
    introsPossible,
    enrichmentNeeded,
    estimatedCost: Math.round(estimatedCost * 100) / 100,
    reasoning,
  };
}

/**
 * Format filters for clipboard (copy-paste to scraper)
 */
export function formatFiltersForScraper(filters: CounterpartyFilters): string {
  return `=== ${filters.description} ===

JOB TITLES (Include):
${filters.jobTitlesInclude.join(', ')}

JOB TITLES (Exclude):
${filters.jobTitlesExclude.join(', ')}

INDUSTRIES:
${filters.industriesInclude.join(', ')}

KEYWORDS (Include):
${filters.keywordsInclude.join(', ')}

KEYWORDS (Exclude):
${filters.keywordsExclude.join(', ')}
`;
}

// =============================================================================
// LEADS FINDER JSON FORMATTER
// =============================================================================

/**
 * Exact allowed industry values for Leads Finder scraper
 * Must match exactly (lowercase with &)
 */
const LEADS_FINDER_INDUSTRIES: string[] = [
  "information technology & services", "construction", "marketing & advertising",
  "real estate", "health, wellness & fitness", "management consulting",
  "computer software", "internet", "retail", "financial services",
  "consumer services", "hospital & health care", "automotive", "restaurants",
  "education management", "food & beverages", "design", "hospitality",
  "accounting", "events services", "nonprofit organization management",
  "entertainment", "electrical/electronic manufacturing", "leisure, travel & tourism",
  "professional training & coaching", "transportation/trucking/railroad",
  "law practice", "apparel & fashion", "architecture & planning",
  "mechanical or industrial engineering", "insurance", "telecommunications",
  "human resources", "staffing & recruiting", "sports", "legal services",
  "oil & energy", "media production", "machinery", "wholesale", "consumer goods",
  "music", "photography", "medical practice", "cosmetics", "environmental services",
  "graphic design", "business supplies & equipment", "renewables & environment",
  "facilities services", "publishing", "food production", "arts & crafts",
  "building materials", "civil engineering", "religious institutions",
  "public relations & communications", "higher education", "printing",
  "furniture", "mining & metals", "logistics & supply chain", "research",
  "pharmaceuticals", "individual & family services", "medical devices",
  "civic & social organization", "e-learning", "security & investigations",
  "chemicals", "government administration", "online media", "investment management",
  "farming", "writing & editing", "textiles", "mental health care",
  "primary/secondary education", "broadcast media", "biotechnology",
  "information services", "international trade & development",
  "motion pictures & film", "consumer electronics", "banking", "import & export",
  "industrial automation", "recreational facilities & services", "performing arts",
  "utilities", "sporting goods", "fine art", "airlines/aviation",
  "computer & network security", "maritime", "luxury goods & jewelry",
  "veterinary", "venture capital & private equity", "wine & spirits", "plastics",
  "aviation & aerospace", "commercial real estate", "computer games",
  "packaging & containers", "executive office", "computer hardware",
  "computer networking", "market research", "outsourcing/offshoring",
  "program development", "translation & localization", "philanthropy",
  "public safety", "alternative medicine", "museums & institutions",
  "warehousing", "defense & space", "newspapers", "paper & forest products",
  "law enforcement", "investment banking", "government relations", "fund-raising",
  "think tanks", "glass, ceramics & concrete", "capital markets", "semiconductors",
  "animation", "political organization", "package/freight delivery", "wireless",
  "international affairs", "public policy", "libraries", "gambling & casinos",
  "railroad manufacture", "ranching", "military", "fishery", "supermarkets",
  "dairy", "tobacco", "shipbuilding", "judiciary", "alternative dispute resolution",
  "nanotechnology", "agriculture", "legislative office"
];

/**
 * Map analyzer industry to Leads Finder exact enum value
 */
function mapToLeadsFinderIndustry(industry: string): string | null {
  const normalized = industry.toLowerCase().replace(/ and /g, ' & ');

  // Direct match
  if (LEADS_FINDER_INDUSTRIES.includes(normalized)) {
    return normalized;
  }

  // Fuzzy match - find closest
  for (const lfIndustry of LEADS_FINDER_INDUSTRIES) {
    if (lfIndustry.includes(normalized) || normalized.includes(lfIndustry)) {
      return lfIndustry;
    }
  }

  // Common mappings
  const mappings: Record<string, string> = {
    'staffing and recruiting': 'staffing & recruiting',
    'human resources': 'human resources',
    'executive search': 'staffing & recruiting',
    'it services': 'information technology & services',
    'software': 'computer software',
    'saas': 'computer software',
    'tech': 'information technology & services',
    'healthcare': 'hospital & health care',
    'biotech': 'biotechnology',
    'pharma': 'pharmaceuticals',
    'legal': 'legal services',
    'finance': 'financial services',
    'marketing': 'marketing & advertising',
    'advertising': 'marketing & advertising',
    'consulting': 'management consulting',
  };

  const lowerIndustry = industry.toLowerCase();
  for (const [key, value] of Object.entries(mappings)) {
    if (lowerIndustry.includes(key)) {
      return value;
    }
  }

  return null; // Can't map - omit
}

/**
 * Format filters as Leads Finder JSON (copy-paste ready)
 */
export function formatFiltersForLeadsFinder(filters: CounterpartyFilters): string {
  // Map industries to exact Leads Finder values
  const mappedIndustries = filters.industriesInclude
    .map(mapToLeadsFinderIndustry)
    .filter((i): i is string => i !== null);

  // Lowercase job titles
  const jobTitles = filters.jobTitlesInclude.map(t => t.toLowerCase());

  // Build Leads Finder config object
  const config: Record<string, any> = {};

  // Only include fields with values
  if (mappedIndustries.length > 0) {
    config.company_industry = mappedIndustries;
  }

  if (filters.keywordsInclude.length > 0) {
    config.company_keywords = filters.keywordsInclude.map(k => k.toLowerCase());
  }

  if (filters.keywordsExclude.length > 0) {
    config.company_not_keywords = filters.keywordsExclude.map(k => k.toLowerCase());
  }

  if (jobTitles.length > 0) {
    config.contact_job_title = jobTitles;
  }

  // Sane defaults
  config.email_status = ["validated"];
  config.fetch_count = 100;

  // contact_location: intentionally omitted - user adds manually
  // funding, size, revenue: omitted - can't confidently infer

  return JSON.stringify(config, null, 2);
}
