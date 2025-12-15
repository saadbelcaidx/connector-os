/**
 * ApolloWorkOwnerService
 *
 * Finds the "work owner" at a company using Apollo's mixed_people/api_search.
 * This runs BEFORE the existing contact enrichment pipeline.
 * If it fails or returns nothing, we silently fall back to existing behavior.
 *
 * CRITICAL: Enforces STRICT role alignment.
 * For engineering hires, ONLY engineering leaders will be returned.
 * Marketing/Sales/HR executives are HARD EXCLUDED for engineering signals.
 */

export interface WorkOwnerSettings {
  work_owner_departments: string; // raw comma-separated text from DB
  work_owner_keywords: string;    // raw comma-separated text from DB
}

/**
 * Hire category type for strict filtering
 */
export type WorkOwnerHireCategory = 'engineering' | 'sales' | 'marketing' | 'operations' | 'funding' | 'unknown';

/**
 * HARD EXCLUSION FILTERS BY CATEGORY
 * If a person's title contains ANY of these words, they are EXCLUDED for that category.
 * This prevents VP Marketing from being selected for engineering hires.
 */
const CATEGORY_EXCLUSIONS: Record<WorkOwnerHireCategory, RegExp> = {
  engineering: /\b(marketing|growth|sales|hr\b|people|talent|recruiter|recruiting|operations|finance|accounting|legal|admin|customer success|support)\b/i,
  sales: /\b(engineering|developer|software|marketing|hr\b|people|talent|recruiter|recruiting|finance|accounting|legal|admin)\b/i,
  marketing: /\b(engineering|developer|software|sales|hr\b|people|talent|recruiter|recruiting|finance|accounting|legal|admin)\b/i,
  operations: /\b(engineering|developer|software|sales|marketing|growth|hr\b|people|talent|recruiter|recruiting)\b/i,
  funding: /\b(engineering|developer|software|sales|marketing|growth|hr\b|people|talent|recruiter|recruiting)\b/i,
  unknown: /^$/, // No exclusions for unknown
};

/**
 * REQUIRED TITLE PATTERNS BY CATEGORY
 * At least one of these patterns MUST match for a valid work owner contact.
 */
const CATEGORY_REQUIRED_PATTERNS: Record<WorkOwnerHireCategory, RegExp> = {
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
function isTitleValidForCategory(title: string | undefined, hireCategory: WorkOwnerHireCategory): boolean {
  if (!title) return false;
  const titleLower = title.toLowerCase();

  // First check: Does title contain excluded words for this category?
  const exclusionPattern = CATEGORY_EXCLUSIONS[hireCategory];
  if (exclusionPattern && exclusionPattern.test(titleLower)) {
    console.log(`[ApolloWorkOwner] EXCLUDED: "${title}" contains excluded word for ${hireCategory}`);
    return false;
  }

  // Second check: Does title match required pattern for this category?
  const requiredPattern = CATEGORY_REQUIRED_PATTERNS[hireCategory];
  if (requiredPattern && !requiredPattern.test(titleLower)) {
    console.log(`[ApolloWorkOwner] EXCLUDED: "${title}" doesn't match required pattern for ${hireCategory}`);
    return false;
  }

  return true;
}

export interface ApolloPerson {
  id?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  title?: string;
  email?: string;
  linkedin_url?: string;
  organization?: {
    name?: string;
    website_url?: string;
    primary_domain?: string;
  };
  seniority?: string;
}

export interface WorkOwnerContact {
  name: string | null;
  title: string | null;
  email: string | null;
  linkedin: string | null;
  confidence: number;
  source: 'work_owner_search';
}

/**
 * Strip protocol and www from domain
 */
function normalizeDomain(domain: string): string {
  return domain
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .trim();
}

/**
 * Parse comma-separated settings into clean array
 */
function parseCommaSeparated(raw: string): string[] {
  return raw
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Score a person based on how well their title matches departments/keywords
 */
function scorePerson(
  person: ApolloPerson,
  departments: string[],
  keywords: string[]
): number {
  const title = (person.title || '').toLowerCase();
  let score = 0;

  // +2 for department match in title
  if (departments.some(d => title.includes(d))) {
    score += 2;
  }

  // +1 for keyword match in title
  if (keywords.some(k => title.includes(k))) {
    score += 1;
  }

  // Bonus for having email
  if (person.email) {
    score += 1;
  }

  return score;
}

/**
 * Map Apollo person to the contact shape used by the rest of the app
 */
function mapToContact(person: ApolloPerson): WorkOwnerContact {
  const name = person.name ||
    `${person.first_name || ''} ${person.last_name || ''}`.trim() ||
    null;

  return {
    name,
    title: person.title || null,
    email: person.email || null,
    linkedin: person.linkedin_url || null,
    confidence: person.email ? 85 : 70,
    source: 'work_owner_search',
  };
}

/**
 * Call Apollo's mixed_people/api_search via our Supabase proxy
 */
async function callApolloWorkOwnerSearch(
  domain: string,
  keywords: string[],
  apiKey: string
): Promise<ApolloPerson[]> {
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/apollo-enrichment`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'work_owner_search',
      apiKey,
      domain: normalizeDomain(domain),
      keywords: keywords.join(' OR '),
    }),
  });

  if (!response.ok) {
    console.warn('[ApolloWorkOwner] API request failed:', response.status);
    return [];
  }

  const data = await response.json();
  return data?.people || [];
}

/**
 * Find the work owner for a domain using Apollo mixed_people/api_search.
 *
 * CRITICAL: Enforces STRICT role alignment via hireCategory.
 * For engineering hires, ONLY engineering leaders will be returned.
 * Marketing/Sales/HR executives are HARD EXCLUDED.
 *
 * Returns null if:
 * - Keywords are empty (user hasn't configured work owner search)
 * - Apollo returns no results
 * - All candidates are filtered out due to wrong category
 * - Any error occurs
 *
 * On null, the caller should fall back to existing contact enrichment.
 *
 * @param domain - Company domain to search
 * @param settings - Work owner settings with departments/keywords
 * @param apiKey - Apollo API key
 * @param hireCategory - CRITICAL: The category of role being hired for (determines hard filtering)
 */
export async function findWorkOwnerByDomain(
  domain: string,
  settings: WorkOwnerSettings,
  apiKey: string,
  hireCategory: WorkOwnerHireCategory = 'engineering'
): Promise<WorkOwnerContact | null> {
  try {
    // Parse settings
    const departments = parseCommaSeparated(settings.work_owner_departments);
    const keywords = parseCommaSeparated(settings.work_owner_keywords);

    // If no keywords configured, immediately fall back to existing behavior
    if (keywords.length === 0) {
      console.log('[ApolloWorkOwner] No keywords configured, skipping work owner search');
      return null;
    }

    console.log('[ApolloWorkOwner] Searching for work owner:', {
      domain: normalizeDomain(domain),
      departments,
      keywords,
      hireCategory,
    });

    // Call Apollo
    const people = await callApolloWorkOwnerSearch(domain, keywords, apiKey);

    if (people.length === 0) {
      console.log('[ApolloWorkOwner] No candidates found, falling back to existing enrichment');
      return null;
    }

    console.log(`[ApolloWorkOwner] Found ${people.length} candidates`);

    // STEP 1: HARD FILTER by category
    // This is NON-NEGOTIABLE. Wrong-category titles are EXCLUDED entirely.
    const validForCategory = people.filter(person => {
      const isValid = isTitleValidForCategory(person.title, hireCategory);
      if (!isValid) {
        console.log(`[ApolloWorkOwner] HARD FILTERED: ${person.name || person.first_name} (${person.title}) - wrong category for ${hireCategory}`);
      }
      return isValid;
    });

    console.log(`[ApolloWorkOwner] After category filter: ${validForCategory.length} of ${people.length} candidates valid for ${hireCategory}`);

    if (validForCategory.length === 0) {
      console.log(`[ApolloWorkOwner] NO VALID ${hireCategory.toUpperCase()} DECISION-MAKER FOUND`);
      console.log('[ApolloWorkOwner] All candidates were filtered out due to wrong department/category');
      return null; // Do NOT return a wrong-category contact
    }

    // STEP 2: Score and sort ONLY the valid candidates
    const scored = validForCategory
      .map(p => ({ person: p, score: scorePerson(p, departments, keywords) }))
      .sort((a, b) => b.score - a.score);

    // Log top candidates for debugging
    console.log('[ApolloWorkOwner] Top valid candidates:', scored.slice(0, 3).map(s => ({
      name: s.person.name || `${s.person.first_name} ${s.person.last_name}`,
      title: s.person.title,
      email: s.person.email,
      score: s.score,
    })));

    const best = scored[0];

    // If best score is 0, the match isn't great - still use it but log warning
    if (best.score === 0) {
      console.log('[ApolloWorkOwner] Best candidate has score 0 (no keyword/dept match in title)');
    }

    const contact = mapToContact(best.person);

    console.log('[ApolloWorkOwner] Selected work owner:', {
      name: contact.name,
      title: contact.title,
      email: contact.email,
      hireCategory,
    });

    return contact;
  } catch (error) {
    // Never throw - silently fall back to existing behavior
    console.error('[ApolloWorkOwner] Error during work owner search:', error);
    return null;
  }
}

/**
 * Check if work owner search is configured
 */
export function isWorkOwnerSearchConfigured(settings: WorkOwnerSettings): boolean {
  const keywords = parseCommaSeparated(settings.work_owner_keywords);
  return keywords.length > 0;
}
