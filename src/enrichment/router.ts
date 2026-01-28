/**
 * ENRICHMENT ROUTER — Input-Driven, Schema-Agnostic
 *
 * This is the ONLY enrichment model.
 * No schema-based logic is allowed outside normalize().
 *
 * ARCHITECTURE:
 * 1. Classify inputs → determine ACTION
 * 2. Get providers that support this ACTION
 * 3. Filter by user's configured providers
 * 4. Waterfall through available providers
 * 5. Return OUTCOME (never collapse to boolean)
 *
 * INVARIANTS:
 * - VERIFY is terminal: once email exists, never try other providers
 * - Providers MUST NOT be called outside their declared capabilities
 * - Outcomes MUST be preserved end-to-end (no boolean collapse)
 */

// =============================================================================
// CANONICAL TYPES
// =============================================================================

/**
 * Canonical inputs (schema-agnostic).
 * These are the ONLY inputs that matter for enrichment.
 */
export type EnrichmentInputs = {
  email?: string | null;
  domain?: string | null;
  person_name?: string | null;
  company?: string | null;
};

/**
 * Canonical actions.
 * Determined purely from what inputs are present.
 */
export type EnrichmentAction =
  | 'VERIFY'              // email exists → verify only
  | 'FIND_PERSON'         // domain + person_name → find this person's email
  | 'FIND_COMPANY_CONTACT'// domain only → find any decision maker
  | 'SEARCH_PERSON'       // company + person_name (no domain) → search
  | 'SEARCH_COMPANY'      // company only → search for any contact
  | 'CANNOT_ROUTE';       // no usable inputs

/**
 * Canonical outcomes.
 * MUST be preserved end-to-end. Never collapse to boolean.
 */
export type EnrichmentOutcome =
  | 'ENRICHED'           // Email found by provider
  | 'VERIFIED'           // Existing email verified
  | 'INVALID'            // Existing email failed verification
  | 'NO_CANDIDATES'      // Providers searched, no email found
  | 'NOT_FOUND'          // Person/company not in provider DB
  | 'MISSING_INPUT'      // Inputs insufficient for any action
  | 'NO_PROVIDERS'       // No providers configured for this action
  | 'AUTH_ERROR'         // Provider auth failed (401)
  | 'CREDITS_EXHAUSTED'  // Provider credits exhausted (422)
  | 'RATE_LIMITED'       // Provider rate limited (429)
  | 'ERROR';             // Unexpected error

export type ProviderName = 'connectorAgent' | 'anymail' | 'apollo';

// =============================================================================
// PROVIDER CAPABILITY MATRIX (TRUTH TABLE)
// =============================================================================

/**
 * Providers MUST NOT be called outside their declared capabilities.
 * This is the canonical truth table.
 */
export const PROVIDER_CAPABILITIES: Record<ProviderName, EnrichmentAction[]> = {
  connectorAgent: ['VERIFY', 'FIND_PERSON'],
  anymail: ['VERIFY', 'FIND_PERSON', 'FIND_COMPANY_CONTACT', 'SEARCH_PERSON'],
  apollo: ['FIND_PERSON', 'FIND_COMPANY_CONTACT', 'SEARCH_PERSON', 'SEARCH_COMPANY'],
};

/**
 * Provider priority order for each action.
 * First provider in list is tried first.
 */
const PROVIDER_PRIORITY: Record<EnrichmentAction, ProviderName[]> = {
  'VERIFY': ['connectorAgent', 'anymail'],
  'FIND_PERSON': ['anymail', 'connectorAgent', 'apollo'],
  'FIND_COMPANY_CONTACT': ['apollo', 'anymail'],  // Apollo FREE first, then Anymail fallback
  'SEARCH_PERSON': ['anymail', 'apollo'],
  'SEARCH_COMPANY': ['apollo'],
  'CANNOT_ROUTE': [],
};

// =============================================================================
// SENIORITY RANKING — For FIND_COMPANY_CONTACT person selection
// =============================================================================

/**
 * Seniority ranking for picking best decision maker.
 * Higher score = more senior = better target.
 */
const SENIORITY_RANKS: Record<string, number> = {
  'founder': 100,
  'co-founder': 99,
  'owner': 98,
  'partner': 95,
  'principal': 94,
  'managing director': 92,
  'ceo': 90, 'cfo': 89, 'cto': 88, 'coo': 87, 'cmo': 86, 'cro': 85,
  'president': 84,
  'vp': 70, 'vice president': 70,
  'director': 60,
  'head': 55,
  'manager': 40,
  'lead': 35,
  'senior': 30,
};

function scoreSeniority(title: string): number {
  const t = (title || '').toLowerCase();
  for (const [keyword, score] of Object.entries(SENIORITY_RANKS)) {
    if (t.includes(keyword)) return score;
  }
  return 10; // default for unknown titles
}

function pickBestPerson(people: Array<{ id?: string; first_name?: string; last_name?: string; title?: string }>): { id: string; firstName: string; lastName: string; title: string } | null {
  if (!people || people.length === 0) return null;

  const sorted = [...people].sort((a, b) => scoreSeniority(b.title || '') - scoreSeniority(a.title || ''));
  const best = sorted[0];

  // Must have ID for enrich-by-ID flow
  if (!best.id) {
    console.log(`[Router] Best person has no ID, cannot enrich`);
    return null;
  }

  console.log(`[Router] Seniority ranking: ${people.length} candidates, best=${best.first_name} ${best.last_name} (${best.title}, score=${scoreSeniority(best.title || '')}, id=${best.id})`);

  return {
    id: best.id,
    firstName: best.first_name || '',
    lastName: best.last_name || '',
    title: best.title || '',
  };
}

// =============================================================================
// ACTION CLASSIFIER
// =============================================================================

/**
 * Check if person_name is a FULL name (first + last, minimum 2 words).
 * Anymail API requires full name for FIND_PERSON endpoint.
 * Single-word names (e.g., "Ivelisse") should fallback to FIND_COMPANY_CONTACT.
 */
function isFullName(personName: string | null | undefined): boolean {
  if (!personName) return false;
  const words = personName.trim().split(/\s+/);
  return words.length >= 2;
}

/**
 * Classify inputs to determine action.
 *
 * ROUTING RULES:
 * - email exists                        → VERIFY
 * - domain + full name (2+ words)       → FIND_PERSON
 * - domain only (or partial name)       → FIND_COMPANY_CONTACT
 * - company + full name (2+ words)      → SEARCH_PERSON
 * - company only (or partial name)      → SEARCH_COMPANY
 * - nothing usable                      → CANNOT_ROUTE
 */
export function classifyInputs(inputs: EnrichmentInputs): EnrichmentAction {
  if (inputs.email) return 'VERIFY';

  const hasFullName = isFullName(inputs.person_name);

  if (inputs.domain && hasFullName) return 'FIND_PERSON';
  if (inputs.domain) return 'FIND_COMPANY_CONTACT';
  if (inputs.company && hasFullName) return 'SEARCH_PERSON';
  if (inputs.company) return 'SEARCH_COMPANY';
  return 'CANNOT_ROUTE';
}

// =============================================================================
// ROUTER CONFIG
// =============================================================================

export type RouterConfig = {
  connectorAgentApiKey?: string;
  anymailApiKey?: string;
  apolloApiKey?: string;
  supabaseFunctionsUrl: string;
  timeoutMs?: number;
};

// =============================================================================
// ENRICHMENT RESULT
// =============================================================================

export type EnrichmentResult = {
  /** The action that was attempted */
  action: EnrichmentAction;
  /** The outcome of the attempt */
  outcome: EnrichmentOutcome;
  /** Email found/verified (null if none) */
  email: string | null;
  /** Person details (from provider or input) */
  firstName: string;
  lastName: string;
  title: string;
  /** Was email verified? */
  verified: boolean;
  /** Which provider succeeded (if any) */
  source: ProviderName | 'existing' | 'none';
  /** Inputs that were available */
  inputsPresent: {
    email: boolean;
    domain: boolean;
    person_name: boolean;
    company: boolean;
  };
  /** Providers attempted (in order) */
  providersAttempted: ProviderName[];
  /** Per-provider results */
  providerResults: Record<ProviderName, {
    attempted: boolean;
    result?: 'success' | 'not_found' | 'invalid' | 'error' | 'skipped';
    reason?: string;
  }>;
  /** Time taken (ms) */
  durationMs: number;
};

// =============================================================================
// PROVIDER CALL FUNCTIONS
// =============================================================================

/**
 * Verify email with ConnectorAgent.
 */
async function verifyWithConnectorAgent(
  email: string,
  config: RouterConfig
): Promise<{ valid: boolean; error?: any }> {
  try {
    const response = await fetch('https://api.connector-os.com/api/email/v2/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.connectorAgentApiKey}`,
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      return { valid: false, error: { status: response.status } };
    }

    const data = await response.json();
    return { valid: data.status === 'valid' };
  } catch (error) {
    return { valid: false, error };
  }
}

/**
 * Verify email with Anymail.
 */
async function verifyWithAnymail(
  email: string,
  config: RouterConfig
): Promise<{ valid: boolean; error?: any }> {
  try {
    const response = await fetch(`${config.supabaseFunctionsUrl}/anymail-finder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'verify_email',
        apiKey: config.anymailApiKey,
        email,
      }),
    });

    if (!response.ok) {
      return { valid: false, error: { status: response.status } };
    }

    const data = await response.json();
    return { valid: data.verification_status === 'verified' || data.email_status === 'valid' };
  } catch (error) {
    return { valid: false, error };
  }
}

/**
 * Find person's email with Anymail (find_person endpoint).
 */
async function findPersonWithAnymail(
  domainOrCompany: { domain?: string | null; company_name?: string | null },
  personName: string,
  config: RouterConfig
): Promise<{ email: string | null; firstName?: string; lastName?: string; title?: string; error?: any }> {
  try {
    const payload: any = {
      type: 'find_person',
      apiKey: config.anymailApiKey,
      full_name: personName,
    };
    if (domainOrCompany.domain) {
      payload.domain = domainOrCompany.domain;
    } else if (domainOrCompany.company_name) {
      payload.company_name = domainOrCompany.company_name;
    }
    // DEBUG: Log exact payload being sent to anymail-finder
    console.log(`[Router] findPersonWithAnymail payload:`, {
      full_name: payload.full_name,
      domain: payload.domain,
      company_name: payload.company_name,
      hasApiKey: !!payload.apiKey,
    });
    const response = await fetch(`${config.supabaseFunctionsUrl}/anymail-finder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      // DEBUG: Capture full error response
      const errorBody = await response.text().catch(() => 'failed to read body');
      console.log(`[Router] anymail-finder error ${response.status}:`, errorBody);
      return { email: null, error: { status: response.status, body: errorBody } };
    }

    const data = await response.json();
    return {
      email: data.email || null,
      firstName: data.first_name,
      lastName: data.last_name,
      title: data.title,
    };
  } catch (error) {
    return { email: null, error };
  }
}

/**
 * Find company contact with Anymail (find_decision_maker endpoint).
 */
async function findCompanyContactWithAnymail(
  domain: string,
  config: RouterConfig
): Promise<{ email: string | null; firstName?: string; lastName?: string; title?: string; error?: any }> {
  // DEBUG: Log exact domain being sent to Anymail Finder
  console.log(`[Router] findCompanyContactWithAnymail DOMAIN_SENT:`, {
    domain,
    domainLength: domain?.length,
    domainType: typeof domain,
  });

  try {
    const response = await fetch(`${config.supabaseFunctionsUrl}/anymail-finder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'find_decision_maker',
        apiKey: config.anymailApiKey,
        domain,
        categories: ['ceo', 'sales', 'marketing', 'operations'],
      }),
    });

    if (!response.ok) {
      return { email: null, error: { status: response.status } };
    }

    const data = await response.json();
    let firstName = '';
    let lastName = '';
    if (data.name) {
      const parts = data.name.split(' ');
      firstName = parts[0] || '';
      lastName = parts.slice(1).join(' ') || '';
    }
    return {
      email: data.email || null,
      firstName,
      lastName,
      title: data.title,
    };
  } catch (error) {
    return { email: null, error };
  }
}

/**
 * Find person with ConnectorAgent.
 */
async function findPersonWithConnectorAgent(
  domain: string,
  firstName: string,
  lastName: string,
  config: RouterConfig
): Promise<{ email: string | null; error?: any }> {
  try {
    const response = await fetch('https://api.connector-os.com/api/email/v2/find', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.connectorAgentApiKey}`,
      },
      body: JSON.stringify({
        domain,
        firstName,
        lastName,
      }),
    });

    if (!response.ok) {
      return { email: null, error: { status: response.status } };
    }

    const data = await response.json();
    return { email: data.email || null };
  } catch (error) {
    return { email: null, error };
  }
}

/**
 * FIND_COMPANY_CONTACT via Apollo FREE search → pick best → paid email lookup.
 *
 * Flow:
 * 1. Apollo people_search (FREE) — get candidates at domain
 * 2. Rank by seniority — pick best (founder > partner > c-suite > vp > director)
 * 3. Apollo people_match (1 credit) — get email for chosen person
 *
 * Returns { noCandidates: true } if Apollo FREE returns 0 people.
 * Caller should fallback to Anymail find_decision_maker.
 */
async function findCompanyContactWithApolloFree(
  domain: string,
  config: RouterConfig
): Promise<{ email: string | null; firstName?: string; lastName?: string; title?: string; error?: any; noCandidates?: boolean }> {
  try {
    // STEP 1: FREE search to find people at domain
    console.log(`[Router] Apollo FREE search: finding decision makers at ${domain}`);

    const searchResponse = await fetch(`${config.supabaseFunctionsUrl}/apollo-enrichment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'people_search',
        apiKey: config.apolloApiKey,
        domain: domain,
        seniorities: ['c_suite', 'founder', 'owner', 'partner', 'vp', 'director'],
      }),
    });

    if (!searchResponse.ok) {
      const errorBody = await searchResponse.text().catch(() => 'failed to read');
      console.log(`[Router] Apollo FREE search error ${searchResponse.status}:`, errorBody);
      return { email: null, error: { status: searchResponse.status, body: errorBody } };
    }

    const searchData = await searchResponse.json();
    const people = searchData.people || [];

    console.log(`[Router] Apollo FREE search: found ${people.length} people at ${domain} (0 credits used)`);

    if (people.length === 0) {
      console.log(`[Router] Apollo FREE search: no candidates at ${domain}, will fallback to Anymail`);
      return { email: null, noCandidates: true };
    }

    // STEP 2: Rank and pick best person by seniority
    const best = pickBestPerson(people);
    if (!best) {
      return { email: null, noCandidates: true };
    }

    console.log(`[Router] Selected best: ${best.firstName} ${best.lastName} (${best.title}, id=${best.id}) at ${domain}`);

    // STEP 3: PAID enrich by ID to get email (1 credit)
    console.log(`[Router] Apollo PAID enrich: getting email for ID ${best.id} (1 credit)`);

    const enrichResponse = await fetch(`${config.supabaseFunctionsUrl}/apollo-enrichment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'people_enrich',
        apiKey: config.apolloApiKey,
        id: best.id,
      }),
    });

    if (!enrichResponse.ok) {
      const errorBody = await enrichResponse.text().catch(() => 'failed to read');
      console.log(`[Router] Apollo PAID enrich error ${enrichResponse.status}:`, errorBody);
      return { email: null, firstName: best.firstName, lastName: best.lastName, title: best.title, error: { status: enrichResponse.status, body: errorBody } };
    }

    const enrichData = await enrichResponse.json();
    const email = enrichData.person?.email;

    if (email) {
      console.log(`[Router] Apollo PAID enrich: found email ${email} for ${best.firstName} ${best.lastName} (1 credit used)`);
    } else {
      console.log(`[Router] Apollo PAID enrich: no email for ${best.firstName} ${best.lastName} (1 credit used, no result)`);
    }

    return {
      email: email || null,
      firstName: best.firstName,
      lastName: best.lastName,
      title: best.title,
    };
  } catch (error) {
    console.error(`[Router] Apollo FREE flow error:`, error);
    return { email: null, error };
  }
}

/**
 * Find/search with Apollo.
 * Supports: domain, company+person, company only.
 *
 * CREDIT OPTIMIZATION:
 * - mixed_people/api_search = FREE (no emails returned)
 * - people/match = 1 credit (even if no email found!)
 *
 * Strategy: Use free search first to confirm person exists,
 * only then call paid match endpoint.
 */
async function findWithApollo(
  params: { domain?: string; company?: string; firstName?: string; lastName?: string; title?: string },
  config: RouterConfig
): Promise<{ email: string | null; firstName?: string; lastName?: string; title?: string; error?: any }> {
  try {
    const hasPersonName = params.firstName || params.lastName;

    // =========================================================================
    // PATH 1: SEARCH_PERSON — company name + person name
    // =========================================================================
    if (hasPersonName && params.company) {
      console.log(`[Apollo] SEARCH_PERSON: ${params.firstName} ${params.lastName} at company "${params.company}"`);

      // STEP 1: FREE search by company name
      const searchResponse = await fetch(`${config.supabaseFunctionsUrl}/apollo-enrichment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'people_search',
          apiKey: config.apolloApiKey,
          organization_name: params.company,
        }),
      });

      if (!searchResponse.ok) {
        const errorBody = await searchResponse.text().catch(() => 'failed to read body');
        console.log(`[Apollo] FREE search error ${searchResponse.status}:`, errorBody);
        return { email: null, error: { status: searchResponse.status, body: errorBody } };
      }

      const searchData = await searchResponse.json();
      const people = searchData.people || [];

      // Look for name match in search results
      const targetFirst = (params.firstName || '').toLowerCase();
      const targetLast = (params.lastName || '').toLowerCase();

      const matchedPerson = people.find((p: any) => {
        const pFirst = (p.first_name || '').toLowerCase();
        const pLast = (p.last_name || '').toLowerCase();
        return pFirst === targetFirst && pLast === targetLast;
      });

      if (!matchedPerson) {
        console.log(`[Apollo] FREE search: person not found in ${people.length} results (0 credits used)`);
        return { email: null };
      }

      console.log(`[Apollo] FREE search: found ${matchedPerson.first_name} ${matchedPerson.last_name}, now enriching...`);

      // STEP 2: PAID match to get email (1 credit)
      const matchPayload: any = {
        first_name: params.firstName || '',
        last_name: params.lastName || '',
        organization_name: params.company,
        reveal_personal_emails: true,
      };

      const matchResponse = await fetch(`${config.supabaseFunctionsUrl}/apollo-enrichment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'people_match',
          apiKey: config.apolloApiKey,
          payload: matchPayload,
        }),
      });

      if (!matchResponse.ok) {
        const errorBody = await matchResponse.text().catch(() => 'failed to read body');
        console.log(`[Apollo] people_match error ${matchResponse.status}:`, errorBody);
        return { email: null, error: { status: matchResponse.status, body: errorBody } };
      }

      const matchData = await matchResponse.json();
      const person = matchData.person;

      if (!person?.email) {
        console.log(`[Apollo] people_match: no email for ${params.firstName} ${params.lastName} (1 credit used)`);
        return { email: null };
      }

      console.log(`[Apollo] people_match: found email for ${params.firstName} ${params.lastName} (1 credit used)`);
      return {
        email: person.email,
        firstName: person.first_name,
        lastName: person.last_name,
        title: person.title,
      };
    }

    // =========================================================================
    // PATH 2: FIND_PERSON — domain + person name (NEW)
    // =========================================================================
    if (hasPersonName && params.domain) {
      console.log(`[Apollo] FIND_PERSON: ${params.firstName} ${params.lastName} at domain "${params.domain}"`);

      // STEP 1: FREE search by domain to find people
      const searchResponse = await fetch(`${config.supabaseFunctionsUrl}/apollo-enrichment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'people_search',
          apiKey: config.apolloApiKey,
          domain: params.domain,
        }),
      });

      if (!searchResponse.ok) {
        const errorBody = await searchResponse.text().catch(() => 'failed to read body');
        console.log(`[Apollo] FREE search error ${searchResponse.status}:`, errorBody);
        return { email: null, error: { status: searchResponse.status, body: errorBody } };
      }

      const searchData = await searchResponse.json();
      const people = searchData.people || [];

      console.log(`[Apollo] FREE search: found ${people.length} people at ${params.domain} (0 credits used)`);

      // Look for name match in search results
      const targetFirst = (params.firstName || '').toLowerCase();
      const targetLast = (params.lastName || '').toLowerCase();

      const matchedPerson = people.find((p: any) => {
        const pFirst = (p.first_name || '').toLowerCase();
        const pLast = (p.last_name || '').toLowerCase();
        return pFirst === targetFirst && pLast === targetLast;
      });

      if (!matchedPerson) {
        console.log(`[Apollo] FREE search: ${params.firstName} ${params.lastName} not found in ${people.length} results`);
        return { email: null };
      }

      console.log(`[Apollo] FREE search: found ${matchedPerson.first_name} ${matchedPerson.last_name}, now enriching...`);

      // STEP 2: PAID match to get email (1 credit)
      const matchPayload: any = {
        first_name: params.firstName || '',
        last_name: params.lastName || '',
        domain: params.domain,
        reveal_personal_emails: true,
      };

      const matchResponse = await fetch(`${config.supabaseFunctionsUrl}/apollo-enrichment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'people_match',
          apiKey: config.apolloApiKey,
          payload: matchPayload,
        }),
      });

      if (!matchResponse.ok) {
        const errorBody = await matchResponse.text().catch(() => 'failed to read body');
        console.log(`[Apollo] people_match error ${matchResponse.status}:`, errorBody);
        return { email: null, error: { status: matchResponse.status, body: errorBody } };
      }

      const matchData = await matchResponse.json();
      const person = matchData.person;

      if (!person?.email) {
        console.log(`[Apollo] people_match: no email for ${params.firstName} ${params.lastName} (1 credit used)`);
        return { email: null };
      }

      console.log(`[Apollo] people_match: found email for ${params.firstName} ${params.lastName} (1 credit used)`);
      return {
        email: person.email,
        firstName: person.first_name,
        lastName: person.last_name,
        title: person.title,
      };
    }

    // =========================================================================
    // PATH 3: FIND_COMPANY_CONTACT — just domain, find any decision maker
    // =========================================================================
    if (params.domain) {
      console.log(`[Apollo] FIND_COMPANY_CONTACT: finding decision maker at "${params.domain}"`);

      // Use people_search with seniority filter to find decision makers
      const searchResponse = await fetch(`${config.supabaseFunctionsUrl}/apollo-enrichment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'people_search',
          apiKey: config.apolloApiKey,
          domain: params.domain,
          seniorities: ['c_suite', 'founder', 'owner', 'partner', 'vp', 'director'],
        }),
      });

      if (!searchResponse.ok) {
        const errorBody = await searchResponse.text().catch(() => 'failed to read body');
        console.log(`[Apollo] people_search error ${searchResponse.status}:`, errorBody);
        return { email: null, error: { status: searchResponse.status, body: errorBody } };
      }

      const searchData = await searchResponse.json();
      const people = searchData.people || [];

      if (people.length === 0) {
        console.log(`[Apollo] people_search: no decision makers found at ${params.domain}`);
        return { email: null };
      }

      // Pick best person by seniority (first one is usually best due to Apollo's ranking)
      const bestPerson = people[0];
      console.log(`[Apollo] Found ${people.length} decision makers, picking: ${bestPerson.first_name} ${bestPerson.last_name}`);

      // If person already has email in search results, return it (no credit used)
      if (bestPerson.email) {
        console.log(`[Apollo] Email found in FREE search (0 credits used)`);
        return {
          email: bestPerson.email,
          firstName: bestPerson.first_name,
          lastName: bestPerson.last_name,
          title: bestPerson.title,
        };
      }

      // Otherwise, use PAID match to get email (1 credit)
      const matchPayload: any = {
        first_name: bestPerson.first_name || '',
        last_name: bestPerson.last_name || '',
        domain: params.domain,
        reveal_personal_emails: true,
      };

      const matchResponse = await fetch(`${config.supabaseFunctionsUrl}/apollo-enrichment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'people_match',
          apiKey: config.apolloApiKey,
          payload: matchPayload,
        }),
      });

      if (!matchResponse.ok) {
        const errorBody = await matchResponse.text().catch(() => 'failed to read body');
        console.log(`[Apollo] people_match error ${matchResponse.status}:`, errorBody);
        return { email: null, error: { status: matchResponse.status, body: errorBody } };
      }

      const matchData = await matchResponse.json();
      const person = matchData.person;

      if (!person?.email) {
        console.log(`[Apollo] people_match: no email for ${bestPerson.first_name} ${bestPerson.last_name} (1 credit used)`);
        return { email: null };
      }

      console.log(`[Apollo] people_match: found email (1 credit used)`);
      return {
        email: person.email,
        firstName: person.first_name,
        lastName: person.last_name,
        title: person.title,
      };
    }

    // No valid inputs
    console.log(`[Apollo] No valid inputs provided`);
    return { email: null };
  } catch (error) {
    return { email: null, error };
  }
}

// =============================================================================
// HELPER: Parse HTTP errors
// =============================================================================

function parseHttpError(error: any): 'AUTH_ERROR' | 'CREDITS_EXHAUSTED' | 'RATE_LIMITED' | 'NOT_FOUND' | 'ERROR' {
  const status = error?.status || error?.response?.status;
  const message = (error?.message || String(error)).toLowerCase();

  if (status === 401 || message.includes('401') || message.includes('unauthorized')) {
    return 'AUTH_ERROR';
  }
  if (status === 422 || message.includes('422') || message.includes('credit') || message.includes('quota') || message.includes('limit exceeded')) {
    return 'CREDITS_EXHAUSTED';
  }
  if (status === 429 || message.includes('429') || message.includes('rate limit')) {
    return 'RATE_LIMITED';
  }
  if (status === 404 || message.includes('not found')) {
    return 'NOT_FOUND';
  }
  return 'ERROR';
}

// =============================================================================
// MAIN ROUTER
// =============================================================================

/**
 * Route enrichment based on available inputs.
 *
 * ALGORITHM:
 * 1. Classify inputs → determine ACTION
 * 2. Get providers that support this ACTION (filtered by config)
 * 3. VERIFY is terminal: only verify, never cascade to find
 * 4. Waterfall through capable providers until success
 * 5. Return OUTCOME (never boolean)
 */
export async function routeEnrichment(
  record: {
    email?: string | null;
    domain?: string | null;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    name?: string;
    company?: string;
    title?: string;
  },
  config: RouterConfig
): Promise<EnrichmentResult> {
  const startTime = Date.now();
  const providersAttempted: ProviderName[] = [];
  const providerResults: EnrichmentResult['providerResults'] = {
    connectorAgent: { attempted: false },
    anymail: { attempted: false },
    apollo: { attempted: false },
  };

  // Build canonical inputs
  const personName = record.fullName || record.name ||
    [record.firstName, record.lastName].filter(Boolean).join(' ').trim() || null;

  const inputs: EnrichmentInputs = {
    email: record.email || null,
    domain: record.domain || null,
    person_name: personName,
    company: record.company || null,
  };

  const inputsPresent = {
    email: !!inputs.email,
    domain: !!inputs.domain,
    person_name: !!inputs.person_name,
    company: !!inputs.company,
  };

  // Helper to build result
  const buildResult = (
    action: EnrichmentAction,
    outcome: EnrichmentOutcome,
    email: string | null,
    source: ProviderName | 'existing' | 'none',
    verified: boolean,
    firstName: string = '',
    lastName: string = '',
    title: string = ''
  ): EnrichmentResult => ({
    action,
    outcome,
    email,
    firstName: firstName || record.firstName || '',
    lastName: lastName || record.lastName || '',
    title: title || record.title || '',
    verified,
    source,
    inputsPresent,
    providersAttempted,
    providerResults,
    durationMs: Date.now() - startTime,
  });

  // ==========================================================================
  // STEP 1: Classify inputs → determine ACTION
  // ==========================================================================

  const action = classifyInputs(inputs);
  console.log(`[Router] ACTION=${action} inputs=${JSON.stringify(inputsPresent)}`);

  // ==========================================================================
  // STEP 2: Handle CANNOT_ROUTE
  // ==========================================================================

  if (action === 'CANNOT_ROUTE') {
    return buildResult(action, 'MISSING_INPUT', null, 'none', false);
  }

  // ==========================================================================
  // STEP 3: Get configured providers for this action
  // ==========================================================================

  const configuredProviders: ProviderName[] = [];
  if (config.connectorAgentApiKey) configuredProviders.push('connectorAgent');
  if (config.anymailApiKey) configuredProviders.push('anymail');
  if (config.apolloApiKey) configuredProviders.push('apollo');

  // Get providers that can handle this action, in priority order
  const capableProviders = PROVIDER_PRIORITY[action].filter(p =>
    configuredProviders.includes(p) && PROVIDER_CAPABILITIES[p].includes(action)
  );

  if (capableProviders.length === 0) {
    return buildResult(action, 'NO_PROVIDERS', null, 'none', false);
  }

  console.log(`[Router] Capable providers for ${action}: [${capableProviders.join(', ')}]`);

  // ==========================================================================
  // STEP 4: VERIFY is terminal — only verify, never cascade
  // ==========================================================================

  if (action === 'VERIFY') {
    const email = inputs.email!;

    for (const provider of capableProviders) {
      providersAttempted.push(provider);
      providerResults[provider].attempted = true;

      let result: { valid: boolean; error?: any };

      if (provider === 'connectorAgent') {
        result = await verifyWithConnectorAgent(email, config);
      } else if (provider === 'anymail') {
        result = await verifyWithAnymail(email, config);
      } else {
        continue; // Apollo can't verify
      }

      if (result.error) {
        const errorType = parseHttpError(result.error);
        providerResults[provider].result = 'error';
        providerResults[provider].reason = errorType;

        if (errorType === 'AUTH_ERROR' || errorType === 'CREDITS_EXHAUSTED' || errorType === 'RATE_LIMITED') {
          continue; // Try next provider
        }
      }

      if (result.valid) {
        providerResults[provider].result = 'success';
        return buildResult(action, 'VERIFIED', email, 'existing', true);
      } else {
        providerResults[provider].result = 'invalid';
      }
    }

    // All verification attempts failed — email is invalid or unverifiable
    // Still return the email but mark as INVALID
    return buildResult(action, 'INVALID', inputs.email!, 'existing', false);
  }

  // ==========================================================================
  // STEP 5: FIND/SEARCH actions — waterfall through providers
  // ==========================================================================

  const firstName = record.firstName || (personName?.split(' ')[0]) || '';
  const lastName = record.lastName || (personName?.split(' ').slice(1).join(' ')) || '';

  for (const provider of capableProviders) {
    providersAttempted.push(provider);
    providerResults[provider].attempted = true;

    let result: { email: string | null; firstName?: string; lastName?: string; title?: string; error?: any };

    // Call appropriate provider method based on action
    switch (provider) {
      case 'anymail':
        if (action === 'FIND_PERSON') {
          // Pass both domain AND company_name — Anymail uses domain first, falls back to company_name
          result = await findPersonWithAnymail({ domain: inputs.domain, company_name: inputs.company }, inputs.person_name!, config);
        } else if (action === 'FIND_COMPANY_CONTACT') {
          result = await findCompanyContactWithAnymail(inputs.domain!, config);
        } else if (action === 'SEARCH_PERSON') {
          // DEBUG: Log actual values before SEARCH_PERSON call
          console.log(`[Router] SEARCH_PERSON values:`, {
            company: inputs.company,
            person_name: inputs.person_name,
            companyType: typeof inputs.company,
            personNameType: typeof inputs.person_name,
          });
          result = await findPersonWithAnymail({ company_name: inputs.company }, inputs.person_name!, config);
        } else {
          providerResults[provider].result = 'skipped';
          providerResults[provider].reason = `Anymail cannot handle ${action}`;
          continue;
        }
        break;

      case 'connectorAgent':
        if (action === 'FIND_PERSON') {
          result = await findPersonWithConnectorAgent(inputs.domain!, firstName, lastName, config);
        } else {
          providerResults[provider].result = 'skipped';
          providerResults[provider].reason = `ConnectorAgent cannot handle ${action}`;
          continue;
        }
        break;

      case 'apollo':
        if (action === 'FIND_COMPANY_CONTACT') {
          // NEW: Apollo FREE → pick best → Apollo PAID flow
          const apolloFreeResult = await findCompanyContactWithApolloFree(inputs.domain!, config);

          if (apolloFreeResult.noCandidates) {
            // No people at domain — fallback to Anymail find_decision_maker
            providerResults[provider].result = 'not_found';
            providerResults[provider].reason = 'No people found at domain (0 credits used)';
            console.log(`[Router] Apollo FREE: no candidates, falling back to Anymail`);
            continue; // Try next provider (Anymail)
          }

          if (apolloFreeResult.error) {
            result = apolloFreeResult;
          } else if (apolloFreeResult.email) {
            // Success — Apollo found email
            result = apolloFreeResult;
          } else {
            // Apollo found person but no email — let waterfall continue to Anymail find_decision_maker
            console.log(`[Router] Apollo PAID enrich: no email, falling back to next provider`);
            result = { email: null, firstName: apolloFreeResult.firstName, lastName: apolloFreeResult.lastName, title: apolloFreeResult.title };
          }
        } else if (action === 'FIND_PERSON') {
          result = await findWithApollo({
            domain: inputs.domain || undefined,
            firstName,
            lastName,
            title: record.title,
          }, config);
        } else if (action === 'SEARCH_PERSON') {
          result = await findWithApollo({
            company: inputs.company || undefined,
            firstName,
            lastName,
            title: record.title,
          }, config);
        } else if (action === 'SEARCH_COMPANY') {
          result = await findWithApollo({
            company: inputs.company || undefined,
          }, config);
        } else {
          providerResults[provider].result = 'skipped';
          providerResults[provider].reason = `Apollo cannot handle ${action}`;
          continue;
        }
        break;

      default:
        continue;
    }

    // Handle result
    if (result.error) {
      const errorType = parseHttpError(result.error);
      providerResults[provider].result = 'error';
      providerResults[provider].reason = errorType;

      if (errorType === 'AUTH_ERROR') {
        continue; // Provider dead for session, try next
      }
      if (errorType === 'CREDITS_EXHAUSTED') {
        continue; // Provider out of credits, try next
      }
      if (errorType === 'RATE_LIMITED') {
        continue; // Try next provider
      }
      // Other errors, try next provider
      continue;
    }

    if (result.email) {
      providerResults[provider].result = 'success';
      return buildResult(
        action,
        'ENRICHED',
        result.email,
        provider,
        true,
        result.firstName || firstName,
        result.lastName || lastName,
        result.title || record.title || ''
      );
    }

    // No email found, try next provider
    providerResults[provider].result = 'not_found';
  }

  // ==========================================================================
  // STEP 6: All providers exhausted, no email found
  // ==========================================================================

  return buildResult(action, 'NO_CANDIDATES', null, 'none', false, firstName, lastName, record.title || '');
}

// =============================================================================
// BATCH ROUTER
// =============================================================================

export type BatchEnrichmentProgress = {
  total: number;
  completed: number;
  enriched: number;
  verified: number;
  noCandidates: number;
  errors: number;
};

/**
 * Route a batch of records through enrichment.
 */
export async function routeEnrichmentBatch(
  records: Array<{
    email?: string | null;
    domain?: string | null;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    name?: string;
    company?: string;
    title?: string;
  }>,
  config: RouterConfig,
  onProgress?: (progress: BatchEnrichmentProgress) => void,
  concurrency: number = 3
): Promise<EnrichmentResult[]> {
  const results: EnrichmentResult[] = new Array(records.length);
  const progress: BatchEnrichmentProgress = {
    total: records.length,
    completed: 0,
    enriched: 0,
    verified: 0,
    noCandidates: 0,
    errors: 0,
  };

  // Process in chunks for concurrency control
  for (let i = 0; i < records.length; i += concurrency) {
    const chunk = records.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((record, j) => routeEnrichment(record, config).then(result => {
        results[i + j] = result;
        return result;
      }))
    );

    // Update progress
    for (const result of chunkResults) {
      progress.completed++;
      switch (result.outcome) {
        case 'ENRICHED':
          progress.enriched++;
          break;
        case 'VERIFIED':
          progress.verified++;
          break;
        case 'NO_CANDIDATES':
        case 'NOT_FOUND':
        case 'INVALID':
          progress.noCandidates++;
          break;
        default:
          progress.errors++;
      }
    }

    onProgress?.(progress);
  }

  return results;
}

// =============================================================================
// UI HELPERS (render from outcome + inputs, no inference)
// =============================================================================

/**
 * Get human-readable explanation for outcome.
 * UI must render directly from outcome + inputs present.
 * No guessing. No heuristics.
 */
export function getOutcomeExplanation(result: EnrichmentResult): string {
  switch (result.outcome) {
    case 'ENRICHED':
      return 'Email found.';
    case 'VERIFIED':
      return 'Email verified.';
    case 'INVALID':
      return 'Email could not be verified.';
    case 'NO_CANDIDATES':
      return 'No public email exists.';
    case 'NOT_FOUND':
      return 'Person or company not found.';
    case 'MISSING_INPUT':
      if (!result.inputsPresent.domain && !result.inputsPresent.company) {
        return 'No website or company name found.';
      }
      if (!result.inputsPresent.domain) {
        return "We don't have a website yet.";
      }
      return 'Missing required information.';
    case 'NO_PROVIDERS':
      return 'No search providers configured.';
    case 'AUTH_ERROR':
      return 'API key invalid.';
    case 'CREDITS_EXHAUSTED':
      return 'Provider credits exhausted.';
    case 'RATE_LIMITED':
      return 'Provider temporarily unavailable.';
    case 'ERROR':
      return 'Provider error.';
    default:
      return 'Unknown status.';
  }
}

/**
 * Get action explanation for UI.
 */
export function getActionExplanation(result: EnrichmentResult): string {
  switch (result.action) {
    case 'VERIFY':
      return 'Verifying existing email.';
    case 'FIND_PERSON':
      return 'Looking for this person at this company.';
    case 'FIND_COMPANY_CONTACT':
      return "We found a website, but no person name — we'll try company contacts.";
    case 'SEARCH_PERSON':
      return "We don't have a website — searching by company and name.";
    case 'SEARCH_COMPANY':
      return "We only have a company name — searching for any contact.";
    case 'CANNOT_ROUTE':
      return "We don't have enough information to search.";
    default:
      return '';
  }
}
