/**
 * ApolloDemandEnrichmentService.ts
 *
 * Enriches demand-side contacts (people at companies with hiring signals).
 * This is SEPARATE from supply-side enrichment (people at provider companies).
 *
 * INVARIANT: Demand contacts are at the HIRING company (e.g., United Airlines)
 *            Supply contacts are at the PROVIDER company (e.g., Toptal)
 *            They are NEVER the same person or company.
 *
 * IMPORTANT: Uses Supabase Edge Function proxy to avoid CORS issues with Apollo API.
 */

// Get the Supabase URL from environment - this is where the Apollo proxy lives
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const APOLLO_PROXY_URL = `${SUPABASE_URL}/functions/v1/apollo-enrichment`;

export interface DemandContact {
  name: string;
  email: string;
  title: string;
  linkedin?: string;
  company: string;
  domain: string;
  confidence: number;
}

interface ApolloPersonResult {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  title: string;
  email: string;
  linkedin_url?: string;
  organization?: {
    name: string;
    primary_domain?: string;
  };
  seniority?: string;
}

/**
 * Check if an email is a real, usable email (not a placeholder)
 * Apollo returns placeholder emails like "email_not_unlocked@domain.com" when email isn't revealed
 */
function isRealEmail(email: string | null | undefined): boolean {
  if (!email) return false;

  const emailLower = email.toLowerCase();

  // Reject obvious placeholder patterns from Apollo
  if (emailLower.includes('not_unlocked')) return false;
  if (emailLower.includes('email_not_')) return false;
  if (emailLower.includes('placeholder')) return false;
  if (emailLower.includes('noemail')) return false;
  if (emailLower.includes('no_email')) return false;
  if (emailLower.includes('unknown@')) return false;
  if (emailLower.includes('redacted')) return false;

  // Must have @ and domain
  if (!email.includes('@')) return false;
  const parts = email.split('@');
  if (parts.length !== 2 || !parts[1].includes('.')) return false;

  // Basic format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return false;

  return true;
}

/**
 * Hire category type - matches CONNECTOR_DATABASE
 * Exported for use by callers
 */
export type DemandHireCategory = 'engineering' | 'sales' | 'marketing' | 'operations' | 'funding' | 'unknown';

// Alias for internal use
type HireCategory = DemandHireCategory;

/**
 * HARD EXCLUSION FILTERS BY CATEGORY
 * If a person's title contains ANY of these words, they are EXCLUDED for that category.
 * This prevents VP Marketing from being selected for engineering hires.
 */
const CATEGORY_EXCLUSIONS: Record<HireCategory, RegExp> = {
  engineering: /\b(marketing|growth|sales|hr\b|people|talent|recruiter|recruiting|operations|finance|accounting|legal|admin|customer success|support)\b/i,
  sales: /\b(engineering|developer|software|marketing|hr\b|people|talent|recruiter|recruiting|finance|accounting|legal|admin)\b/i,
  marketing: /\b(engineering|developer|software|sales|hr\b|people|talent|recruiter|recruiting|finance|accounting|legal|admin)\b/i,
  operations: /\b(engineering|developer|software|sales|marketing|growth|hr\b|people|talent|recruiter|recruiting)\b/i,
  funding: /\b(engineering|developer|software|sales|marketing|growth|hr\b|people|talent|recruiter|recruiting)\b/i,
  unknown: /^$/, // No exclusions for unknown - but this should rarely happen
};

/**
 * REQUIRED TITLE PATTERNS BY CATEGORY
 * At least one of these patterns MUST match for a valid demand contact.
 */
const CATEGORY_REQUIRED_PATTERNS: Record<HireCategory, RegExp> = {
  engineering: /\b(cto|chief technology|vp engineer|vp of engineer|head of engineer|director.*engineer|engineering manager|engineering lead|tech lead|platform lead|software.*manager|development.*manager|architect)\b/i,
  sales: /\b(cro|chief revenue|vp sales|vp of sales|head of sales|director.*sales|sales manager|sales lead|revenue)\b/i,
  marketing: /\b(cmo|chief marketing|vp marketing|vp of marketing|head of marketing|director.*marketing|marketing manager|growth lead)\b/i,
  operations: /\b(coo|chief operating|vp operations|vp of operations|head of operations|director.*operations|operations manager)\b/i,
  funding: /\b(ceo|cfo|chief executive|chief financial|founder|co-founder|president|vp finance|head of finance|director.*finance)\b/i,
  unknown: /\b(cto|ceo|vp|head of|director|manager|lead)\b/i, // Broad match for unknown
};

/**
 * Check if a person's title is VALID for the given hire category
 * Returns false if the title should be excluded (wrong department)
 */
function isTitleValidForCategory(title: string, hireCategory: HireCategory): boolean {
  if (!title) return false;
  const titleLower = title.toLowerCase();

  // First check: Does title contain excluded words for this category?
  const exclusionPattern = CATEGORY_EXCLUSIONS[hireCategory];
  if (exclusionPattern && exclusionPattern.test(titleLower)) {
    console.log(`[DemandEnrichment] EXCLUDED: "${title}" contains excluded word for ${hireCategory}`);
    return false;
  }

  // Second check: Does title match required pattern for this category?
  const requiredPattern = CATEGORY_REQUIRED_PATTERNS[hireCategory];
  if (requiredPattern && !requiredPattern.test(titleLower)) {
    console.log(`[DemandEnrichment] EXCLUDED: "${title}" doesn't match required pattern for ${hireCategory}`);
    return false;
  }

  return true;
}

/**
 * Score a person for demand-side relevance
 * Higher score = better fit for being a demand contact (decision maker, hiring manager)
 *
 * CRITICAL: This only scores people who have PASSED the category filter.
 * Wrong-category titles should be filtered BEFORE scoring.
 */
function scoreDemandContact(person: ApolloPersonResult, targetTitles: string[], hireCategory: HireCategory): number {
  let score = 0;
  const titleLower = (person.title || '').toLowerCase();
  const seniority = (person.seniority || '').toLowerCase();

  // Check if title matches any target titles (highest priority)
  for (const target of targetTitles) {
    if (titleLower.includes(target.toLowerCase())) {
      score += 15; // Increased from 10
      break;
    }
  }

  // Category-specific scoring bonuses
  if (hireCategory === 'engineering') {
    // Technical leadership titles get highest score
    if (/cto|chief technology/.test(titleLower)) score += 20;
    else if (/vp.*engineer|head of engineer/.test(titleLower)) score += 15;
    else if (/director.*engineer/.test(titleLower)) score += 12;
    else if (/engineering manager|tech lead|platform lead/.test(titleLower)) score += 10;
  } else if (hireCategory === 'sales') {
    if (/cro|chief revenue/.test(titleLower)) score += 20;
    else if (/vp.*sales|head of sales/.test(titleLower)) score += 15;
    else if (/director.*sales/.test(titleLower)) score += 12;
    else if (/sales manager/.test(titleLower)) score += 10;
  } else if (hireCategory === 'marketing') {
    if (/cmo|chief marketing/.test(titleLower)) score += 20;
    else if (/vp.*marketing|head of marketing/.test(titleLower)) score += 15;
    else if (/director.*marketing/.test(titleLower)) score += 12;
    else if (/marketing manager/.test(titleLower)) score += 10;
  }

  // Seniority bonus
  if (/vp|director|c_suite|founder|owner/.test(seniority)) {
    score += 5;
  } else if (/manager|senior/.test(seniority)) {
    score += 2;
  }

  // Negative signals - avoid juniors
  if (/intern|assistant|coordinator|associate|junior/.test(titleLower)) score -= 10;

  // Must have real email (not placeholder)
  if (!isRealEmail(person.email)) score -= 15;

  return score;
}

/**
 * Find the best demand contact at a hiring company
 *
 * CRITICAL: This function enforces STRICT role alignment.
 * For engineering hires, ONLY engineering leaders will be returned.
 * Marketing/Sales/HR executives are HARD EXCLUDED for engineering signals.
 *
 * @param apolloApiKey - Apollo API key
 * @param companyDomain - Domain of the hiring company (e.g., "united.com")
 * @param companyName - Name of the hiring company (e.g., "United Airlines")
 * @param targetTitles - Preferred titles to search for based on signal type
 * @param hireCategory - The category of role being hired for (CRITICAL for filtering)
 */
export async function findDemandContact(
  apolloApiKey: string,
  companyDomain: string,
  companyName: string,
  targetTitles: string[] = ['engineering manager', 'head of engineering', 'vp engineering', 'cto', 'director of engineering'],
  hireCategory: HireCategory = 'engineering'
): Promise<DemandContact | null> {
  console.log(`[DemandEnrichment] Finding ${hireCategory.toUpperCase()} contact at ${companyName} (${companyDomain})`);

  if (!apolloApiKey) {
    console.error('[DemandEnrichment] No Apollo API key provided');
    return null;
  }

  if (!companyDomain) {
    console.error('[DemandEnrichment] No company domain provided');
    return null;
  }

  try {
    // Build search keywords from target titles
    const keywords = targetTitles.length > 0
      ? targetTitles.slice(0, 5).join(' OR ')
      : 'engineering manager OR head of engineering OR vp engineering OR director';

    // Use the Supabase Edge Function proxy to avoid CORS issues
    const proxyPayload = {
      type: 'people_search',
      apiKey: apolloApiKey,
      domain: companyDomain,
      keywords: keywords,
      // Target decision-maker titles
      titles: targetTitles.length > 0 ? targetTitles : ['engineering manager', 'head of engineering', 'vp engineering', 'director'],
      seniorities: ['vp', 'director', 'manager', 'c_suite'],
    };

    console.log('[DemandEnrichment] Calling Apollo proxy with:', { domain: companyDomain, keywords });

    const response = await fetch(APOLLO_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(proxyPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[DemandEnrichment] Apollo proxy error:', response.status, errorText);
      return null;
    }

    const data = await response.json();

    if (data.error) {
      console.error('[DemandEnrichment] Apollo proxy returned error:', data.error);
      return null;
    }

    const people: ApolloPersonResult[] = data.people || [];

    console.log(`[DemandEnrichment] Found ${people.length} people at ${companyDomain}`);

    if (people.length === 0) {
      console.log('[DemandEnrichment] No people found at this domain');
      return null;
    }

    // STEP 1: HARD FILTER by category
    // This is NON-NEGOTIABLE. Wrong-category titles are EXCLUDED entirely.
    const validForCategory = people.filter(person => {
      const isValid = isTitleValidForCategory(person.title, hireCategory);
      if (!isValid) {
        console.log(`[DemandEnrichment] HARD FILTERED: ${person.name} (${person.title}) - wrong category for ${hireCategory}`);
      }
      return isValid;
    });

    console.log(`[DemandEnrichment] After category filter: ${validForCategory.length} of ${people.length} candidates valid for ${hireCategory}`);

    if (validForCategory.length === 0) {
      console.log(`[DemandEnrichment] NO VALID ${hireCategory.toUpperCase()} DECISION-MAKER FOUND`);
      console.log('[DemandEnrichment] All candidates were filtered out due to wrong department/category');
      return null; // Do NOT return a wrong-category contact
    }

    // STEP 2: Score and sort ONLY the valid candidates
    const scoredPeople = validForCategory
      .map(person => ({ person, score: scoreDemandContact(person, targetTitles, hireCategory) }))
      .filter(({ score }) => score > 0) // Must have positive score
      .sort((a, b) => b.score - a.score);

    console.log('[DemandEnrichment] Scored candidates:', scoredPeople.map(({ person, score }) =>
      `${person.name} (${person.title}) = ${score}`
    ));

    if (scoredPeople.length === 0) {
      console.log(`[DemandEnrichment] No suitable ${hireCategory} candidates after scoring`);
      return null;
    }

    const bestMatch = scoredPeople[0];
    const { person } = bestMatch;

    // If no real email, try to enrich
    let email = person.email;
    if (!isRealEmail(email) && person.id) {
      console.log('[DemandEnrichment] No valid email, attempting to enrich person:', person.id);
      email = await enrichPersonEmail(apolloApiKey, person.id);
    }

    if (!isRealEmail(email)) {
      console.log('[DemandEnrichment] Could not get valid email for best match, trying next candidate');
      // Try next candidates
      for (let i = 1; i < Math.min(scoredPeople.length, 3); i++) {
        const candidate = scoredPeople[i].person;
        if (isRealEmail(candidate.email)) {
          console.log(`[DemandEnrichment] Using fallback candidate: ${candidate.name}`);
          return {
            name: candidate.name || `${candidate.first_name} ${candidate.last_name}`,
            email: candidate.email,
            title: candidate.title || 'Unknown',
            linkedin: candidate.linkedin_url,
            company: companyName,
            domain: companyDomain,
            confidence: 70,
          };
        }
      }
      return null;
    }

    const demandContact: DemandContact = {
      name: person.name || `${person.first_name} ${person.last_name}`,
      email,
      title: person.title || 'Unknown',
      linkedin: person.linkedin_url,
      company: companyName,
      domain: companyDomain,
      confidence: bestMatch.score > 5 ? 90 : bestMatch.score > 0 ? 75 : 60,
    };

    console.log('[DemandEnrichment] Best demand contact:', demandContact);
    return demandContact;

  } catch (error) {
    console.error('[DemandEnrichment] Error finding demand contact:', error);
    return null;
  }
}

/**
 * Enrich a specific person to get their email
 * Uses Supabase proxy to avoid CORS
 */
async function enrichPersonEmail(apolloApiKey: string, personId: string): Promise<string | null> {
  try {
    const proxyPayload = {
      type: 'people_match',
      apiKey: apolloApiKey,
      payload: {
        id: personId,
        reveal_personal_emails: false,
      },
    };

    const response = await fetch(APOLLO_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(proxyPayload),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const email = data.person?.email;

    // Validate that this is a real email, not a placeholder
    if (email && isRealEmail(email)) {
      return email;
    } else if (email) {
      console.log(`[DemandEnrichment] Rejected placeholder email: ${email}`);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get target titles AND hire category based on signal type and job category
 * Returns both so callers can pass the category to findDemandContact
 */
export function getDemandTargetTitlesAndCategory(
  signalType: string,
  jobCategory?: string,
  signalSummary?: string
): { titles: string[]; hireCategory: DemandHireCategory } {
  const signalLower = signalType.toLowerCase();
  const categoryLower = (jobCategory || '').toLowerCase();
  const summaryLower = (signalSummary || '').toLowerCase();

  // Check category first, then signal summary, then signal type

  // Sales roles - check FIRST (before engineering, since "sales engineer" should be sales)
  if (categoryLower.includes('sales') || categoryLower.includes('account') ||
      /\bsales\b|account exec|sdr\b|bdr\b|closer|revenue|business develop|\bae\b|account manager/.test(summaryLower)) {
    return {
      titles: ['head of sales', 'vp sales', 'cro', 'director of sales', 'sales manager'],
      hireCategory: 'sales'
    };
  }

  // Engineering roles
  if (categoryLower.includes('engineer') || categoryLower.includes('developer') ||
      /engineer|developer|software|frontend|backend|fullstack|full-stack|devops|sre|architect|programmer|data scientist|ml |machine learning/.test(summaryLower)) {
    return {
      titles: ['cto', 'vp engineering', 'head of engineering', 'director of engineering', 'engineering manager', 'tech lead'],
      hireCategory: 'engineering'
    };
  }

  // Marketing roles
  if (categoryLower.includes('marketing') || categoryLower.includes('growth') ||
      /marketing|growth|seo|content|brand|demand gen|social media/.test(summaryLower)) {
    return {
      titles: ['cmo', 'vp marketing', 'head of marketing', 'director of marketing', 'marketing manager'],
      hireCategory: 'marketing'
    };
  }

  // Operations roles
  if (categoryLower.includes('ops') || categoryLower.includes('operations') ||
      /\bops\b|revops|operations|finance|hr\b|human resources|people ops/.test(summaryLower)) {
    return {
      titles: ['coo', 'vp operations', 'head of operations', 'director of operations', 'operations manager'],
      hireCategory: 'operations'
    };
  }

  // Funding signal - target executives
  if (signalLower.includes('fund') || signalLower.includes('series') || signalLower.includes('raise')) {
    return {
      titles: ['ceo', 'cfo', 'founder', 'head of finance', 'vp finance'],
      hireCategory: 'funding'
    };
  }

  // Default to engineering (most common) but mark as unknown so filtering is less strict
  console.log('[DemandEnrichment] Could not determine hire category, defaulting to engineering');
  return {
    titles: ['cto', 'vp engineering', 'head of engineering', 'director of engineering', 'engineering manager'],
    hireCategory: 'engineering' // Default to engineering for job signals
  };
}

/**
 * Legacy function - returns only titles for backwards compatibility
 * @deprecated Use getDemandTargetTitlesAndCategory instead
 */
export function getDemandTargetTitles(signalType: string, jobCategory?: string): string[] {
  return getDemandTargetTitlesAndCategory(signalType, jobCategory).titles;
}
