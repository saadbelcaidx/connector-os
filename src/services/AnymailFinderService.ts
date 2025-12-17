/**
 * AnymailFinderService.ts
 *
 * Fallback email enrichment when Apollo doesn't find contacts.
 *
 * Endpoints:
 * 1. Find Person Email - domain + full_name
 * 2. Find Decision Maker - domain/company + category (ceo, engineering, sales, etc.)
 * 3. Domain Search - pull all emails from a domain
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const ANYMAIL_PROXY_URL = `${SUPABASE_URL}/functions/v1/anymail-finder`;

// Decision maker categories supported by Anymail Finder
export type DecisionMakerCategory =
  | 'ceo'
  | 'engineering'
  | 'finance'
  | 'hr'
  | 'it'
  | 'logistics'
  | 'marketing'
  | 'operations'
  | 'buyer'
  | 'sales';

// Map our hire categories to Anymail Finder categories
export function mapHireCategoryToAnymail(hireCategory: string): DecisionMakerCategory[] {
  switch (hireCategory) {
    case 'engineering':
      return ['engineering', 'ceo'];
    case 'sales':
      return ['sales', 'ceo'];
    case 'marketing':
      return ['marketing', 'ceo'];
    case 'finance':
      return ['finance', 'ceo'];
    case 'operations':
      return ['operations', 'ceo'];
    default:
      return ['ceo', 'hr']; // Default to CEO or HR
  }
}

export interface AnymailContact {
  email: string;
  name?: string;
  title?: string;
  linkedin?: string;
  confidence?: number;
  source: 'anymail_person' | 'anymail_decision_maker' | 'anymail_domain';
}

export interface AnymailResponse {
  success: boolean;
  email?: string;
  emails?: string[];
  error?: string;
  credits_used?: number;
}

/**
 * Find email for a specific person by name + domain
 */
export async function findPersonEmail(
  apiKey: string,
  domain: string,
  fullName: string
): Promise<AnymailContact | null> {
  console.log(`[AnymailFinder] Finding email for ${fullName} at ${domain}`);

  if (!apiKey || !domain || !fullName) {
    console.error('[AnymailFinder] Missing required parameters');
    return null;
  }

  try {
    const response = await fetch(ANYMAIL_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        type: 'find_person',
        apiKey,
        domain,
        full_name: fullName,
      }),
    });

    if (!response.ok) {
      console.error('[AnymailFinder] API error:', response.status);
      return null;
    }

    const data: AnymailResponse = await response.json();

    if (data.success && data.email) {
      console.log(`[AnymailFinder] Found email: ${data.email}`);
      return {
        email: data.email,
        name: fullName,
        source: 'anymail_person',
        confidence: 85,
      };
    }

    console.log('[AnymailFinder] No email found for person');
    return null;
  } catch (error) {
    console.error('[AnymailFinder] Error:', error);
    return null;
  }
}

/**
 * Find decision maker email by category
 */
export async function findDecisionMaker(
  apiKey: string,
  domain: string,
  categories: DecisionMakerCategory[],
  companyName?: string
): Promise<AnymailContact | null> {
  console.log(`[AnymailFinder] Finding decision maker at ${domain || companyName}, categories:`, categories);

  if (!apiKey || (!domain && !companyName)) {
    console.error('[AnymailFinder] Missing required parameters');
    return null;
  }

  try {
    const response = await fetch(ANYMAIL_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        type: 'find_decision_maker',
        apiKey,
        domain,
        company_name: companyName,
        categories,
      }),
    });

    if (!response.ok) {
      console.error('[AnymailFinder] API error:', response.status);
      return null;
    }

    const data: AnymailResponse = await response.json();

    if (data.success && data.email) {
      console.log(`[AnymailFinder] Found decision maker: ${data.email}`);
      return {
        email: data.email,
        title: categories[0], // Use first category as title hint
        source: 'anymail_decision_maker',
        confidence: 80,
      };
    }

    console.log('[AnymailFinder] No decision maker found');
    return null;
  } catch (error) {
    console.error('[AnymailFinder] Error:', error);
    return null;
  }
}

/**
 * Search for all emails at a domain
 */
export async function searchDomainEmails(
  apiKey: string,
  domain: string,
  limit: number = 10
): Promise<AnymailContact[]> {
  console.log(`[AnymailFinder] Searching emails at domain: ${domain}`);

  if (!apiKey || !domain) {
    console.error('[AnymailFinder] Missing required parameters');
    return [];
  }

  try {
    const response = await fetch(ANYMAIL_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        type: 'search_domain',
        apiKey,
        domain,
        limit,
      }),
    });

    if (!response.ok) {
      console.error('[AnymailFinder] API error:', response.status);
      return [];
    }

    const data: AnymailResponse = await response.json();

    if (data.success && data.emails && data.emails.length > 0) {
      console.log(`[AnymailFinder] Found ${data.emails.length} emails at domain`);
      return data.emails.map(email => ({
        email,
        source: 'anymail_domain' as const,
        confidence: 70,
      }));
    }

    console.log('[AnymailFinder] No emails found at domain');
    return [];
  } catch (error) {
    console.error('[AnymailFinder] Error:', error);
    return [];
  }
}

/**
 * Smart fallback: Try multiple strategies to find an email
 * 1. If we have name + domain → find person
 * 2. If we have domain + category → find decision maker
 * 3. If we only have domain → search domain
 */
export async function findEmailWithFallback(
  apiKey: string,
  options: {
    domain?: string;
    companyName?: string;
    fullName?: string;
    hireCategory?: string;
  }
): Promise<AnymailContact | null> {
  const { domain, companyName, fullName, hireCategory } = options;

  console.log('[AnymailFinder] Smart fallback search:', options);

  // Strategy 1: Person search (most accurate if we have name)
  if (fullName && domain) {
    const personResult = await findPersonEmail(apiKey, domain, fullName);
    if (personResult) return personResult;
  }

  // Strategy 2: Decision maker search (if we have category)
  if ((domain || companyName) && hireCategory) {
    const categories = mapHireCategoryToAnymail(hireCategory);
    const dmResult = await findDecisionMaker(apiKey, domain || '', categories, companyName);
    if (dmResult) return dmResult;
  }

  // Strategy 3: Domain search (last resort)
  if (domain) {
    const domainResults = await searchDomainEmails(apiKey, domain, 1);
    if (domainResults.length > 0) return domainResults[0];
  }

  console.log('[AnymailFinder] All strategies exhausted, no email found');
  return null;
}
