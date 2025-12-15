/**
 * ApolloSupplyEnrichmentService.ts
 *
 * Enriches supply-side contacts (people at provider companies like Toptal, Terminal, etc.)
 * This is SEPARATE from demand-side enrichment (people at companies with hiring signals).
 *
 * TWO-PASS ENRICHMENT:
 * PASS 1: Wide net query - get candidates from domain with broad title filter
 * PASS 2: Local scoring - rank candidates and return best match with email
 *
 * IMPORTANT: Uses Supabase Edge Function proxy to avoid CORS issues with Apollo API.
 */

// Get the Supabase URL from environment - this is where the Apollo proxy lives
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const APOLLO_PROXY_URL = `${SUPABASE_URL}/functions/v1/apollo-enrichment`;

export interface SupplyContact {
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
 * PASS 2: Score a person for supply-side relevance
 *
 * Priority order:
 * 1. Recruiter/Talent Acquisition (highest)
 * 2. Partnerships/Partner
 * 3. Business Development
 * 4. Sales/Account Executive
 *
 * Seniority bonuses:
 * - Head/Director/VP: +4
 * - Manager/Lead: +2
 *
 * CRITICAL: Must have email or score is heavily penalized
 */
function scoreSupplyContact(person: ApolloPersonResult): number {
  let score = 0;
  const titleLower = (person.title || '').toLowerCase();
  const seniorityLower = (person.seniority || '').toLowerCase();

  // === ROLE SCORING (priority order) ===
  // Recruiter/Talent is BEST for supply outreach
  if (/recruiter|recruiting|talent acquisition|talent partner|staffing/.test(titleLower)) {
    score += 10;
  }
  // Partnerships is second best
  else if (/partnership|partner(?!ship)|alliances/.test(titleLower)) {
    score += 8;
  }
  // Business development is good
  else if (/business development|biz dev|bd\s|bdm/.test(titleLower)) {
    score += 6;
  }
  // Sales/AE is acceptable
  else if (/\bsales\b|account executive|\bae\b|account manager/.test(titleLower)) {
    score += 4;
  }
  // General talent mention
  else if (/talent/.test(titleLower)) {
    score += 3;
  }

  // === SENIORITY SCORING ===
  // Check both title and seniority field
  const combinedText = `${titleLower} ${seniorityLower}`;

  if (/\bhead\b|director|vp\b|vice president/.test(combinedText)) {
    score += 4;
  } else if (/manager|lead\b|senior/.test(combinedText)) {
    score += 2;
  }

  // === NEGATIVE SIGNALS (avoid wrong people) ===
  if (/founder|ceo|cto|cfo|coo|chief/.test(titleLower)) {
    score -= 8; // C-suite usually won't respond to cold outreach
  }
  if (/engineer|developer|software|design|product\s+manager|data\s+scientist/.test(titleLower)) {
    score -= 6; // Technical roles, not decision-makers for partnerships
  }
  if (/intern|coordinator|assistant|associate/.test(titleLower)) {
    score -= 4; // Too junior
  }

  // NOTE: Don't penalize for missing email here - we'll try to reveal it later
  // Only use role/seniority scoring for candidate ranking

  return score;
}

/**
 * PASS 1: Search Apollo for supply-side contacts
 * Multi-stage search with increasing broadness
 */
async function wideNetSearch(
  apolloApiKey: string,
  domain: string
): Promise<ApolloPersonResult[]> {

  // Stage 1: Try with specific titles (like demand does)
  const targetTitles = [
    'recruiter',
    'talent acquisition',
    'partnership',
    'business development',
    'sales',
    'account executive',
    'account manager'
  ];

  console.log('[SupplyEnrichment] Stage 1 - Searching with titles:', { domain, titles: targetTitles });

  let proxyPayload: any = {
    type: 'people_search',
    apiKey: apolloApiKey,
    domain: domain,
    titles: targetTitles,
    per_page: 25,
  };

  let response = await fetch(APOLLO_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(proxyPayload),
  });

  if (response.ok) {
    const data = await response.json();
    if (!data.error && data.people && data.people.length > 0) {
      console.log(`[SupplyEnrichment] Stage 1 found ${data.people.length} people`);
      return data.people;
    }
  }

  // Stage 2: Try with just domain (get anyone at company)
  console.log('[SupplyEnrichment] Stage 2 - Broader search (decision makers at domain)...');

  proxyPayload = {
    type: 'people_search',
    apiKey: apolloApiKey,
    domain: domain,
    seniorities: ['vp', 'director', 'manager', 'senior', 'c_suite'],
    per_page: 25,
  };

  response = await fetch(APOLLO_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(proxyPayload),
  });

  if (response.ok) {
    const data = await response.json();
    if (!data.error && data.people && data.people.length > 0) {
      console.log(`[SupplyEnrichment] Stage 2 found ${data.people.length} people`);
      return data.people;
    }
  }

  // Stage 3: Most broad - just domain, no filters
  console.log('[SupplyEnrichment] Stage 3 - Broadest search (anyone at domain)...');

  proxyPayload = {
    type: 'people_search',
    apiKey: apolloApiKey,
    domain: domain,
    per_page: 25,
  };

  response = await fetch(APOLLO_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(proxyPayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[SupplyEnrichment] Apollo proxy error:', response.status, errorText);
    return [];
  }

  const data = await response.json();

  if (data.error) {
    console.error('[SupplyEnrichment] Apollo proxy returned error:', data.error);
    return [];
  }

  console.log(`[SupplyEnrichment] Stage 3 found ${(data.people || []).length} people`);
  return data.people || [];
}

/**
 * Reveal/enrich a person's email using Apollo people/match endpoint
 * This is required because mixed_people/search often doesn't return emails
 */
async function revealPersonEmail(
  apolloApiKey: string,
  person: ApolloPersonResult
): Promise<string | null> {
  try {
    // Build match payload - use ID if available, otherwise use identifying info
    const matchPayload: Record<string, any> = {
      reveal_personal_emails: false,
      reveal_phone_number: false,
    };

    if (person.id) {
      matchPayload.id = person.id;
    } else {
      // Fallback to other identifiers
      const fullName = person.name || `${person.first_name || ''} ${person.last_name || ''}`.trim();
      if (fullName) matchPayload.name = fullName;
      if (person.organization?.primary_domain) matchPayload.domain = person.organization.primary_domain;
      if (person.linkedin_url) matchPayload.linkedin_url = person.linkedin_url;
    }

    console.log(`[SupplyEnrichment] Revealing email for: ${person.name || person.id}`);

    const proxyPayload = {
      type: 'people_match',
      apiKey: apolloApiKey,
      payload: matchPayload,
    };

    const response = await fetch(APOLLO_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(proxyPayload),
    });

    if (!response.ok) {
      console.warn('[SupplyEnrichment] Email reveal failed:', response.status);
      return null;
    }

    const data = await response.json();
    const email = data.person?.email;

    // Validate that this is a real email, not a placeholder
    if (email && isRealEmail(email)) {
      console.log(`[SupplyEnrichment] Email revealed: ${email}`);
      return email;
    } else if (email) {
      console.log(`[SupplyEnrichment] Rejected placeholder email: ${email}`);
      return null;
    } else {
      console.log('[SupplyEnrichment] No email returned from match');
      return null;
    }
  } catch (error) {
    console.error('[SupplyEnrichment] Error revealing email:', error);
    return null;
  }
}

/**
 * Find the best supply contact at a provider company
 *
 * TWO-PASS APPROACH:
 * 1. Wide net query to get candidates
 * 2. Local scoring to find best match
 *
 * @param apolloApiKey - Apollo API key
 * @param connectorDomain - Domain of the provider company (e.g. "toptal.com")
 * @param connectorCompany - Name of the provider company (e.g. "Toptal")
 * @param _preferredTitles - Ignored (we use standardized titles for supply)
 */
export async function findSupplyContact(
  apolloApiKey: string,
  connectorDomain: string,
  connectorCompany: string,
  _preferredTitles?: string[]
): Promise<SupplyContact | null> {
  console.log(`[SupplyEnrichment] === Finding contact at ${connectorCompany} (${connectorDomain}) ===`);

  if (!apolloApiKey) {
    console.error('[SupplyEnrichment] No Apollo API key provided');
    return null;
  }

  if (!connectorDomain) {
    console.error('[SupplyEnrichment] No connector domain provided');
    return null;
  }

  try {
    // === PASS 1: Wide Net Search ===
    const people = await wideNetSearch(apolloApiKey, connectorDomain);

    console.log(`[SupplyEnrichment] PASS 1 returned ${people.length} candidates`);

    if (people.length === 0) {
      console.log('[SupplyEnrichment] No people found at this domain');
      return null;
    }

    // === PASS 2: Local Scoring ===
    console.log('[SupplyEnrichment] PASS 2 - Scoring candidates locally...');

    const scoredPeople = people
      .map(person => ({
        person,
        score: scoreSupplyContact(person),
        hasEmail: isRealEmail(person.email)
      }))
      .sort((a, b) => b.score - a.score);

    // Log all scored candidates for debugging
    console.log('[SupplyEnrichment] Scored candidates:');
    scoredPeople.slice(0, 10).forEach(({ person, score, hasEmail }, i) => {
      console.log(`  ${i + 1}. ${person.name} | ${person.title} | score=${score} | email=${hasEmail ? 'YES' : 'NO'}`);
    });

    // === PASS 3: Email Revelation ===
    // Apollo mixed_people/search often doesn't return emails
    // We need to use people/match to reveal the email for top candidates
    console.log('[SupplyEnrichment] PASS 3 - Revealing emails for top candidates...');

    // Try more candidates - we'll attempt email reveal for top 10
    // Only skip truly bad matches (C-suite + very junior combined)
    const topCandidates = scoredPeople
      .filter(({ score }) => score > -15) // More permissive filter
      .slice(0, 10); // Try top 10

    console.log(`[SupplyEnrichment] Will attempt email reveal for ${topCandidates.length} candidates`);

    for (const { person, score } of topCandidates) {
      let email = person.email;

      // If no real email from search, try to reveal it
      if (!isRealEmail(email)) {
        console.log(`[SupplyEnrichment] No valid email for ${person.name}, attempting reveal...`);
        email = await revealPersonEmail(apolloApiKey, person);
      }

      // Only accept real emails (not placeholders)
      if (isRealEmail(email)) {
        const supplyContact: SupplyContact = {
          name: person.name || `${person.first_name} ${person.last_name}`,
          email,
          title: person.title || 'Unknown',
          linkedin: person.linkedin_url,
          company: connectorCompany,
          domain: connectorDomain,
          confidence: score > 8 ? 95 : score > 5 ? 85 : score > 2 ? 75 : 60,
        };

        console.log(`[SupplyEnrichment] === BEST MATCH: ${supplyContact.name} (${supplyContact.title}) @ ${supplyContact.company} ===`);
        console.log(`[SupplyEnrichment] Email: ${email}`);
        return supplyContact;
      }
    }

    console.log('[SupplyEnrichment] Could not get email for any candidates');
    return null;

  } catch (error) {
    console.error('[SupplyEnrichment] Error finding supply contact:', error);
    return null;
  }
}
