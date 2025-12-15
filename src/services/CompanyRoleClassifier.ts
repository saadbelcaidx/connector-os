/**
 * CompanyRoleClassifier.ts
 *
 * Classifies companies as DEMAND or SUPPLY based on signals.
 *
 * DEMAND = Companies hiring for themselves (internal roles)
 * SUPPLY = Companies that provide talent/services to others (agencies, staffing, consulting)
 *
 * This is deterministic and explainable.
 */

import { safeLower } from './SignalsClient';

export type CompanyRole = 'demand' | 'supply';

export type HireCategory = 'engineering' | 'sales' | 'marketing' | 'operations' | 'finance' | 'unknown';

export interface ClassificationResult {
  role: CompanyRole;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  hireCategory: HireCategory;
}

// Supply indicator keywords - companies offering services TO others
const SUPPLY_INDICATORS = [
  // Service language
  'we place', 'we staff', 'we provide', 'for our clients', 'for clients',
  'staffing', 'recruiting', 'outsourcing', 'consulting', 'consultancy',
  'talent solutions', 'workforce solutions', 'hiring solutions',
  'placement services', 'recruitment agency', 'staffing agency',
  'contract staffing', 'temp staffing', 'executive search',
  'headhunting', 'talent acquisition services', 'hr consulting',
  'managed services', 'staff augmentation', 'team augmentation',
  // Industry tags
  'staffing and recruiting', 'human resources services', 'employment services',
  'professional employer organization', 'hr services', 'recruitment services',
];

// Demand indicator keywords - companies hiring for themselves
const DEMAND_INDICATORS = [
  'we are hiring', 'join our team', 'join us', 'careers at',
  'work with us', 'our team is growing', 'we\'re looking for',
  'internal role', 'full-time position', 'permanent position',
];

/**
 * Classify a company as DEMAND or SUPPLY based on available signals
 */
export function classifyCompany(
  companyName: string,
  description?: string,
  industry?: string,
  jobPostings?: Array<{ title: string; description?: string }>,
  tags?: string[]
): ClassificationResult {
  const reasons: string[] = [];
  let supplyScore = 0;
  let demandScore = 0;

  const nameLower = safeLower(companyName);
  const descLower = safeLower(description);
  const industryLower = safeLower(industry);
  const tagsLower = (tags || []).map(t => safeLower(t)).join(' ');
  const allText = `${nameLower} ${descLower} ${industryLower} ${tagsLower}`;

  // Check company name for supply indicators
  if (/staffing|recruiting|talent|consulting|solutions|agency|partners/.test(nameLower)) {
    supplyScore += 3;
    reasons.push(`Company name suggests service provider: "${companyName}"`);
  }

  // Check description for supply indicators
  for (const indicator of SUPPLY_INDICATORS) {
    if (allText.includes(indicator)) {
      supplyScore += 2;
      reasons.push(`Description contains supply indicator: "${indicator}"`);
      break; // Only count once
    }
  }

  // Check industry classification
  if (/staffing|recruiting|human resources|employment services|hr services/.test(industryLower)) {
    supplyScore += 4;
    reasons.push(`Industry is service-based: "${industry}"`);
  }

  // Check for demand indicators
  for (const indicator of DEMAND_INDICATORS) {
    if (allText.includes(indicator)) {
      demandScore += 2;
      reasons.push(`Contains demand indicator: "${indicator}"`);
      break;
    }
  }

  // Analyze job postings if available
  if (jobPostings && jobPostings.length > 0) {
    const jobTexts = jobPostings.map(j =>
      `${safeLower(j.title)} ${safeLower(j.description)}`
    ).join(' ');

    // Check if jobs are "for clients" (supply behavior)
    if (/for our client|for client|client opportunity|client position/.test(jobTexts)) {
      supplyScore += 5;
      reasons.push('Job postings mention "for client" - agency behavior');
    } else {
      // Jobs appear to be internal - demand behavior
      demandScore += 2;
      reasons.push('Job postings appear to be internal roles');
    }
  }

  // Default bias toward demand if no clear signals
  if (supplyScore === 0 && demandScore === 0) {
    demandScore = 1;
    reasons.push('No clear supply signals - defaulting to demand');
  }

  // Determine role and confidence
  const role: CompanyRole = supplyScore > demandScore ? 'supply' : 'demand';
  const scoreDiff = Math.abs(supplyScore - demandScore);
  const confidence = scoreDiff >= 4 ? 'high' : scoreDiff >= 2 ? 'medium' : 'low';

  // Determine hire category from job postings or description
  const hireCategory = extractHireCategory(jobPostings, description);

  return {
    role,
    confidence,
    reasons,
    hireCategory,
  };
}

/**
 * Extract hire category from job titles or description
 */
export function extractHireCategory(
  jobPostings?: Array<{ title: string; description?: string }>,
  description?: string
): HireCategory {
  const jobTitles = (jobPostings || []).map(j => j.title);
  const text = safeLower([...jobTitles, description || ''].join(' '));

  // Engineering - expanded patterns
  if (/engineer|developer|software|frontend|backend|fullstack|full-stack|devops|sre|architect|programmer|data scientist|ml\b|machine learning|technical|tech talent|it staff|it consult|technology consult|software consult|dev team|development team|tech team|coding|programmers/.test(text)) {
    return 'engineering';
  }

  // Sales
  if (/\bsales\b|account exec|sdr\b|bdr\b|closer|revenue|business develop|\bae\b|account manager|sales talent|sales recruit|sales staff/.test(text)) {
    return 'sales';
  }

  // Marketing
  if (/marketing|growth|seo|content|brand|demand gen|social media|communications|creative|advertising|media buying|digital market/.test(text)) {
    return 'marketing';
  }

  // Operations
  if (/\bops\b|revops|operations|supply chain|logistics|project manager|office|administrative|admin staff/.test(text)) {
    return 'operations';
  }

  // Finance
  if (/finance|accounting|cfo|controller|financial analyst|treasury|bookkeep|tax|audit|credit|banking|investment/.test(text)) {
    return 'finance';
  }

  return 'unknown';
}

/**
 * STRICT supply category detection
 * Returns 'unknown' if no clear category match - these will be EXCLUDED from matching
 */
export function extractSupplyCategory(
  companyName: string,
  description?: string,
  industry?: string,
  tags?: string[]
): HireCategory {
  const text = safeLower([companyName, description || '', industry || '', ...(tags || [])].join(' '));

  // ENGINEERING STAFFING - MUST contain one of these specific patterns
  const engineeringPatterns = [
    'engineering staff', 'technical recruit', 'tech recruit', 'it recruit',
    'software recruit', 'developer recruit', 'hire engineer', 'remote engineer',
    'dev team', 'software talent', 'tech talent', 'it staff', 'software staff',
    'software developer', 'technical staff', 'engineering talent',
    'full.?stack', 'frontend', 'backend', 'devops', 'data engineer',
    'machine learning', 'ai talent', 'cloud engineer', 'sre', 'infrastructure',
    'mobile developer', 'web developer', 'app developer', 'programmer',
    'software consult', 'technology consult', 'it consult', 'tech consult',
    'cyber', 'infosec', 'security engineer'
  ];

  for (const pattern of engineeringPatterns) {
    if (text.includes(pattern) || new RegExp(pattern.replace('.?', '.?')).test(text)) {
      return 'engineering';
    }
  }

  // SALES STAFFING - MUST contain one of these
  const salesPatterns = [
    'sales recruit', 'sales staff', 'sales talent', 'revenue recruit',
    'sdr recruit', 'bdr recruit', 'ae recruit', 'account exec',
    'sales hire', 'revenue talent', 'sales consult', 'business develop staff'
  ];

  for (const pattern of salesPatterns) {
    if (text.includes(pattern)) {
      return 'sales';
    }
  }

  // MARKETING STAFFING - MUST contain one of these
  const marketingPatterns = [
    'marketing recruit', 'marketing staff', 'marketing talent',
    'growth market', 'performance market', 'creative recruit', 'creative staff',
    'digital market staff', 'content market', 'brand consult', 'advertising agency',
    'media agency', 'pr agency', 'social media staff'
  ];

  for (const pattern of marketingPatterns) {
    if (text.includes(pattern)) {
      return 'marketing';
    }
  }

  // OPERATIONS STAFFING
  const operationsPatterns = [
    'operations staff', 'admin staff', 'office staff', 'temp staff',
    'administrative recruit', 'executive assist', 'virtual assist',
    'operations recruit', 'office recruit'
  ];

  for (const pattern of operationsPatterns) {
    if (text.includes(pattern)) {
      return 'operations';
    }
  }

  // FINANCE STAFFING
  const financePatterns = [
    'finance recruit', 'finance staff', 'accounting recruit', 'accounting staff',
    'financial recruit', 'cpa staff', 'bookkeep', 'finance talent',
    'accounting talent', 'financial staff'
  ];

  for (const pattern of financePatterns) {
    if (text.includes(pattern)) {
      return 'finance';
    }
  }

  // NO MATCH - return unknown (will be excluded from matching)
  return 'unknown';
}

/**
 * Check if two companies can be matched (same category)
 */
export function canMatch(
  demandCategory: HireCategory,
  supplyCategory: HireCategory
): boolean {
  // Unknown can match with anything
  if (demandCategory === 'unknown' || supplyCategory === 'unknown') {
    return true;
  }

  // Must be same category
  return demandCategory === supplyCategory;
}

/**
 * Get human-readable explanation for classification
 */
export function explainClassification(result: ClassificationResult): string {
  const roleLabel = result.role === 'demand' ? 'Hiring Company' : 'Service Provider';
  const confidenceLabel = result.confidence === 'high' ? 'Confident' :
                          result.confidence === 'medium' ? 'Likely' : 'Uncertain';

  return `${confidenceLabel} ${roleLabel} (${result.hireCategory}) - ${result.reasons[0] || 'No specific reason'}`;
}
