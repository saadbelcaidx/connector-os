export type EnrichmentStatus = 'none' | 'found_no_contact' | 'contact_unverified' | 'ready' | 'not_found';
export type EnrichmentOutcome = 'exact_match' | 'fallback_match' | 'no_public_contact' | 'no_good_match';

export interface PersonData {
  name: string | null;
  title: string | null;
  email: string | null;
  linkedin: string | null;
  confidence: number | null;
  status?: EnrichmentStatus;
  enrichedAt?: Date;
  enrichmentOutcome?: EnrichmentOutcome;
  notFoundReason?: string;
}

export interface EnrichmentConfig {
  provider: 'apollo' | 'pdl' | 'ssm' | 'none';
  apiKey?: string;
  endpointUrl?: string;
}

// === NEW SELECTION LOGIC TYPES AND HELPERS ===

export type EnrichedPerson = {
  name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  email?: string;
  linkedin_url?: string;
  organization?: {
    name?: string;
    website_url?: string;
    domain?: string;
    primary_domain?: string;
    estimated_num_employees?: number;
  };
  organization_domain?: string;
  organization_name?: string;
  seniority?: string;
  id?: string;
};

function normalizeDomain(input?: string): string {
  if (!input) return "";
  return input
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .trim();
}

function cleanTitle(t?: string): string {
  return (t || "").toLowerCase().trim();
}

function isFounderTitle(title?: string): boolean {
  const t = cleanTitle(title);
  return t.includes("founder") || t.includes("co-founder");
}

function looksLikeRightOrg(person: EnrichedPerson, companyDomain: string, companyName: string): { matches: boolean; matchType: 'email' | 'org_domain' | 'org_name' | 'none' } {
  const d = normalizeDomain(companyDomain);
  const emailDomain = normalizeDomain(person.email?.split("@")[1]);
  const orgDomain = normalizeDomain(person.organization?.domain || person.organization?.primary_domain || person.organization?.website_url || person.organization_domain);

  // Strong match: email domain matches company domain
  if (emailDomain && d && emailDomain === d) {
    return { matches: true, matchType: 'email' };
  }

  // Accept org domain match if available
  if (orgDomain && d && orgDomain === d) {
    return { matches: true, matchType: 'org_domain' };
  }

  // Check for subdomain match (e.g., app.company.com matches company.com)
  if (orgDomain && d) {
    const orgBase = orgDomain.split('.').slice(-2).join('.');
    const targetBase = d.split('.').slice(-2).join('.');
    if (orgBase === targetBase) {
      return { matches: true, matchType: 'org_domain' };
    }
  }

  // Weak match: org name contains company name token (only if nothing else)
  const orgName = (person.organization?.name || person.organization_name || "").toLowerCase();
  const cn = (companyName || "").toLowerCase();
  const domainWithoutTld = d.split('.')[0];

  if (orgName && cn && (orgName.includes(cn) || cn.includes(orgName))) {
    return { matches: true, matchType: 'org_name' };
  }

  // Also check if org name matches domain prefix
  if (orgName && domainWithoutTld && (orgName.includes(domainWithoutTld) || domainWithoutTld.includes(orgName.replace(/\s+/g, '')))) {
    return { matches: true, matchType: 'org_name' };
  }

  return { matches: false, matchType: 'none' };
}

export function roleCategoryFromJobTitle(jobTitle?: string): string {
  const t = (jobTitle || "").toLowerCase();
  if (!t) return "unknown";
  if (t.includes("engineer") || t.includes("developer") || t.includes("software") || t.includes("cto") || t.includes("technical")) return "engineering";
  if (t.includes("account executive") || t.includes("sales") || t.includes("sdr") || t.includes("bdr") || t.includes("revenue")) return "sales";
  if (t.includes("marketing") || t.includes("growth") || t.includes("content") || t.includes("demand gen")) return "marketing";
  if (t.includes("revops") || t.includes("ops") || t.includes("operations") || t.includes("coo")) return "operations";
  if (t.includes("hr") || t.includes("people") || t.includes("talent") || t.includes("recruiting")) return "people";
  if (t.includes("finance") || t.includes("cfo") || t.includes("accounting")) return "finance";
  return "unknown";
}

function getPreferredTitles(signalType: string, jobCategory: string): string[] {
  // Match the *signal/job* category, not the person's current title
  if (signalType === "jobs" || signalType === "hiring") {
    if (jobCategory === "engineering") {
      return ["vp engineering", "head of engineering", "director of engineering", "engineering manager", "principal engineer"];
    }
    if (jobCategory === "sales") {
      return ["vp sales", "head of sales", "sales director", "director of sales", "sales manager"];
    }
    if (jobCategory === "marketing") {
      return ["vp marketing", "head of marketing", "marketing director", "director of marketing", "marketing manager"];
    }
    if (jobCategory === "operations") {
      return ["vp operations", "head of ops", "operations director", "director of operations", "operations manager"];
    }
    if (jobCategory === "people") {
      return ["vp people", "head of people", "hr director", "director of people", "talent acquisition"];
    }
    if (jobCategory === "finance") {
      return ["vp finance", "head of finance", "finance director", "controller", "finance manager"];
    }
    // Default for unknown category
    return ["vp", "head", "director", "manager"];
  }

  // Funding: finance/executive focus
  if (signalType === "funding") {
    return ["vp finance", "head of finance", "finance director", "vp operations", "controller"];
  }

  // Layoffs: operations/people focus
  if (signalType === "layoffs") {
    return ["vp operations", "head of ops", "vp people", "head of people", "hr director"];
  }

  // Tech adoption: engineering focus
  if (signalType === "tech" || signalType === "tool_adoption") {
    return ["vp engineering", "head of engineering", "director of engineering", "engineering manager", "principal engineer"];
  }

  // Default
  return ["vp", "head", "director", "manager"];
}

/**
 * Maps signal type + job category to Apollo departments for targeted search
 * This ensures we find people who actually do the work, not random contacts
 */
function getApolloSearchParams(signalType: string, jobCategory: string): {
  departments: string[];
  seniorities: string[];
  titles: string[];
} {
  // Job categories → Apollo department names
  const departmentMap: Record<string, string[]> = {
    engineering: ['engineering', 'information_technology'],
    sales: ['sales'],
    marketing: ['marketing'],
    operations: ['operations'],
    people: ['human_resources'],
    finance: ['finance', 'accounting'],
    unknown: ['engineering', 'operations', 'sales'], // Default spread
  };

  // Signal-based department overrides
  const signalDepartments: Record<string, string[]> = {
    funding: ['finance', 'accounting', 'operations'],
    layoffs: ['human_resources', 'operations', 'finance'],
    tech: ['engineering', 'information_technology'],
    tool_adoption: ['engineering', 'information_technology'],
    hiring: departmentMap[jobCategory] || departmentMap.unknown,
    jobs: departmentMap[jobCategory] || departmentMap.unknown,
  };

  // Seniorities for people who own the function
  const functionalSeniorities = ['vp', 'director', 'manager', 'head'];

  const departments = signalDepartments[signalType] || departmentMap[jobCategory] || departmentMap.unknown;
  const titles = getPreferredTitles(signalType, jobCategory);

  return {
    departments,
    seniorities: functionalSeniorities,
    titles,
  };
}

function scorePerson(person: EnrichedPerson, preferredTitleTokens: string[], companySize: number): number {
  let score = 0;
  const t = cleanTitle(person.title);

  // Must have email to be "ready"
  if (person.email) score += 25;

  // Title match scoring - higher score for matches with preferred titles
  for (const tok of preferredTitleTokens) {
    if (t.includes(tok.toLowerCase())) {
      score += 50; // Strong bonus for matching the functional role we're looking for
      break;
    }
  }

  // Functional leader scoring (people who actually do the work)
  const s = (person.seniority || "").toLowerCase();

  // VPs and Directors who own functions - highest priority
  if (s.includes("vp") || t.includes("vp ") || t.includes("vice president")) score += 25;
  if (s.includes("director") || t.includes("director")) score += 22;
  if (s.includes("head") || t.includes("head of")) score += 20;

  // Managers - still good, they own teams
  if (s.includes("manager") || t.includes("manager")) score += 15;

  // C-suite: good for small companies, but often too removed at larger ones
  if (s.includes("c_suite") || s.includes("cxo") || t.includes("chief")) {
    if (companySize < 50) {
      score += 20; // Small company: C-suite is hands-on
    } else if (companySize < 200) {
      score += 10; // Mid-size: still relevant
    } else {
      score += 5; // Enterprise: probably not the right person for most signals
    }
  }

  // HARD PENALTY: Founder at big company is almost always wrong
  const isBigCompany = companySize >= 200;
  if (isFounderTitle(person.title)) {
    if (isBigCompany) {
      score -= 100; // Severe penalty for founders at enterprise
    } else if (companySize >= 50) {
      score -= 30; // Moderate penalty for mid-size
    }
    // Small companies (<50): no penalty, founders are often the right contact
  }

  // Penalty for generic/junior titles
  if (t.includes("intern") || t.includes("assistant") || t.includes("associate")) {
    score -= 50;
  }

  // LinkedIn presence
  if (person.linkedin_url) score += 5;

  return score;
}

export interface SelectionResult {
  status: 'ready' | 'not_found';
  person?: EnrichedPerson;
  reason?: string;
  candidateCount?: number;
  filteredCount?: number;
  matchType?: 'email' | 'org_domain' | 'org_name' | 'none';
}

/**
 * Select the best person from Apollo results based on:
 * - Organization match (email domain, org domain, or org name)
 * - Signal type and job category
 * - Company size (penalize founders at enterprise)
 * - Title match with preferred titles
 */
export function selectBestPerson(
  candidates: EnrichedPerson[],
  companyDomain: string,
  companyName: string,
  companySize: number,
  signalType: string,
  jobCategory: string
): SelectionResult {
  const normalizedDomain = normalizeDomain(companyDomain);
  const preferredTitles = getPreferredTitles(signalType, jobCategory);

  console.log("[Apollo Pick] Starting selection:", {
    company: companyName,
    domain: normalizedDomain,
    signalType,
    jobCategory,
    companySize,
    preferredTitles,
    candidateCount: candidates.length,
  });

  if (candidates.length === 0) {
    return {
      status: 'not_found',
      reason: 'Apollo returned no candidates for this domain',
      candidateCount: 0,
      filteredCount: 0,
    };
  }

  // Step 1: Filter by organization match
  const withOrgMatch = candidates.map(p => ({
    person: p,
    orgMatch: looksLikeRightOrg(p, normalizedDomain, companyName),
  }));

  const orgMatched = withOrgMatch.filter(x => x.orgMatch.matches);
  const orgMismatched = withOrgMatch.filter(x => !x.orgMatch.matches);

  console.log("[Apollo Pick] Org validation:", {
    matched: orgMatched.length,
    mismatched: orgMismatched.length,
  });

  if (orgMismatched.length > 0) {
    console.log("[Apollo Pick] Filtered out (wrong org):", orgMismatched.slice(0, 3).map(x => ({
      name: x.person.name || `${x.person.first_name} ${x.person.last_name}`,
      title: x.person.title,
      org: x.person.organization?.name || x.person.organization_name,
    })));
  }

  // Step 2: Filter by email presence (required for "ready" status)
  const withEmail = orgMatched.filter(x => !!x.person.email);
  console.log("[Apollo Pick] With email:", withEmail.length);

  if (withEmail.length === 0) {
    // Check if we have org matches but no emails
    if (orgMatched.length > 0) {
      return {
        status: 'not_found',
        reason: 'Found people at company but none have verified emails',
        candidateCount: candidates.length,
        filteredCount: 0,
      };
    }
    return {
      status: 'not_found',
      reason: 'No candidates matched the target organization',
      candidateCount: candidates.length,
      filteredCount: 0,
    };
  }

  // Step 3: HARD RULE - if company is big (200+), filter out founders
  const isBigCompany = companySize >= 200;
  let finalCandidates = withEmail;

  if (isBigCompany) {
    const nonFounders = withEmail.filter(x => !isFounderTitle(x.person.title));
    console.log("[Apollo Pick] Enterprise filter (size >= 200):", {
      before: withEmail.length,
      afterRemovingFounders: nonFounders.length,
    });

    if (nonFounders.length > 0) {
      finalCandidates = nonFounders;
    } else {
      console.log("[Apollo Pick] ⚠️ Only founders found at enterprise company - this is likely wrong data");
    }
  }

  // Step 4: Score and rank remaining candidates
  const scored = finalCandidates.map(x => ({
    ...x,
    score: scorePerson(x.person, preferredTitles, companySize),
  })).sort((a, b) => b.score - a.score);

  console.log("[Apollo Pick] Scored candidates (top 5):", scored.slice(0, 5).map(x => ({
    name: x.person.name || `${x.person.first_name} ${x.person.last_name}`,
    title: x.person.title,
    email: x.person.email,
    org: x.person.organization?.name || x.person.organization_name,
    score: x.score,
    matchType: x.orgMatch.matchType,
  })));

  const best = scored[0];

  if (!best || best.score < -50) {
    // Score too low means we only have bad matches (e.g., founders at enterprise)
    return {
      status: 'not_found',
      reason: isBigCompany
        ? 'Only found founders/co-founders at enterprise company - need functional leader'
        : 'No suitable decision maker found for this signal type',
      candidateCount: candidates.length,
      filteredCount: finalCandidates.length,
    };
  }

  console.log("[Apollo Pick] ✅ Selected:", {
    name: best.person.name || `${best.person.first_name} ${best.person.last_name}`,
    title: best.person.title,
    email: best.person.email,
    org: best.person.organization?.name,
    score: best.score,
    matchType: best.orgMatch.matchType,
  });

  return {
    status: 'ready',
    person: best.person,
    candidateCount: candidates.length,
    filteredCount: finalCandidates.length,
    matchType: best.orgMatch.matchType,
  };
}

const SENIORITY_ORDER = ['founder', 'c_suite', 'vp', 'head', 'director', 'manager', 'senior', 'entry'];
const SENIORITY_RANK: Record<string, number> = {
  'founder': 0,
  'c_suite': 1,
  'vp': 2,
  'head': 3,
  'director': 4,
  'manager': 5,
  'senior': 6,
  'entry': 7
};

/**
 * APOLLO DISCOVERY TRUTH (NON-NEGOTIABLE):
 *
 * Titles = fuzzy, human-described, reliable for discovery
 * Seniorities = strict, internal ontology, unreliable alone
 *
 * Founders are NOT consistently tagged as c_suite in Apollo.
 * Seniority-only queries WILL miss decision makers.
 * Apollo UI hides this mismatch — the API exposes it.
 *
 * DECISION-MAKER DISCOVERY (DO NOT MODIFY):
 * Primary discovery MUST be title-first, not seniority-first.
 * Seniority is a refinement tool, NOT a discovery gate.
 *
 * These titles capture real decision-authority regardless of Apollo's internal tagging.
 * Removing any of these will cause false negatives for many organizations.
 */
const APOLLO_DECISION_MAKER_TITLES = ['founder', 'co-founder', 'ceo'] as const;

const SIGNAL_TO_DEPARTMENT: Record<string, string[]> = {
  'jobs_engineering': ['engineering', 'operations', 'technology'],
  'jobs_sales': ['sales', 'growth', 'revenue'],
  'jobs_hr': ['hr', 'people', 'human resources'],
  'funding': ['executive', 'finance', 'growth'],
  'layoffs': ['finance', 'hr', 'operations'],
  'hiring_velocity': ['engineering', 'operations', 'technology'],
  'tool_adoption': ['engineering', 'it', 'technology']
};

const WHO_ROLE_PRIORITY = [
  'ceo',
  'chief executive',
  'founder',
  'co-founder',
  'president',
  'cto',
  'chief technology',
  'vp engineering',
  'vp of engineering',
  'vice president engineering',
  'head of engineering',
  'director of engineering',
  'engineering manager',
  'technical lead',
  'lead engineer'
];

function inferSeniorityFromTitle(title: string): string {
  const lower = title.toLowerCase();

  if (lower.includes('ceo') || lower.includes('chief') || lower.includes('founder') || lower.includes('president')) {
    return 'c_suite';
  }
  if (lower.includes('vp') || lower.includes('vice president') || lower.includes('v.p.')) {
    return 'vp';
  }
  if (lower.includes('head of') || lower.includes('head,')) {
    return 'head';
  }
  if (lower.includes('director')) {
    return 'director';
  }
  if (lower.includes('manager')) {
    return 'manager';
  }
  if (lower.includes('senior') || lower.includes('sr.') || lower.includes('lead')) {
    return 'senior';
  }

  return 'entry';
}

function checkDepartmentMatch(title: string, departments: string[]): boolean {
  const lower = title.toLowerCase();

  for (const dept of departments) {
    if (lower.includes(dept.toLowerCase())) {
      return true;
    }
  }

  return false;
}

export function calculateEnrichmentStatus(person: PersonData | null): EnrichmentStatus {
  if (!person) return 'none';

  if (!person.name && !person.title) return 'none';

  const hasEmail = !!person.email;
  const hasLinkedIn = !!person.linkedin;
  const confidence = person.confidence ?? 0;

  if (!hasEmail && !hasLinkedIn) return 'found_no_contact';

  if (confidence < 70) return 'contact_unverified';

  return 'ready';
}

function rankCandidatesBySeniorityAndDepartment(
  candidates: PersonData[],
  targetDepartments: string[]
): PersonData | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const scored = candidates.map(candidate => {
    let score = 0;

    if (!candidate.title) {
      return { candidate, score: -1000 };
    }

    const departmentMatch = checkDepartmentMatch(candidate.title, targetDepartments);
    if (departmentMatch) {
      score += 1000;
    }

    const seniority = inferSeniorityFromTitle(candidate.title);
    const seniorityRank = SENIORITY_RANK[seniority] || 99;
    score -= seniorityRank * 10;

    if (candidate.email) {
      score += 100;
    }

    if (candidate.linkedin) {
      score += 50;
    }

    if (candidate.confidence && candidate.confidence > 80) {
      score += 20;
    }

    return { candidate, score };
  });

  scored.sort((a, b) => b.score - a.score);

  console.log('[PersonEnrichment] Ranked candidates:', scored.map(s => ({
    name: s.candidate.name,
    title: s.candidate.title,
    score: s.score
  })));

  return scored[0].candidate;
}

function getSeniorityScore(title: string | null | undefined, targetTitles: string[] = []): number {
  if (!title) return 999;

  const lower = title.toLowerCase();
  const targetLower = targetTitles.map(t => t.toLowerCase());

  // If we have specific target titles and this title matches one, give it priority
  const hasExactMatch = targetLower.some(target =>
    lower.includes(target) || target.includes(lower)
  );

  // Check if target titles explicitly include founder-related terms
  const targetWantsFounder = targetLower.some(t =>
    t.includes('founder') || t.includes('ceo') || t.includes('chief executive')
  );

  // If target titles don't want founders and this is a founder, deprioritize
  const isFounder = lower.includes('founder') || lower.includes('co-founder');
  if (isFounder && !targetWantsFounder && targetTitles.length > 0) {
    return 50; // Deprioritize founders when not explicitly requested
  }

  // Exact match with target titles gets highest priority
  if (hasExactMatch) return 0;

  if (lower.includes('ceo') || lower.includes('chief executive')) return 2;
  if (lower.includes('cto') || lower.includes('chief technology') || lower.includes('chief technical')) return 3;
  if (lower.includes('coo') || lower.includes('chief operating')) return 3;
  if (lower.includes('cfo') || lower.includes('chief financial')) return 3;
  if (lower.includes('cmo') || lower.includes('chief marketing')) return 3;
  if (lower.includes('chief')) return 3;
  if (lower.includes('founder')) return 4; // Founders ranked below C-suite when not explicitly requested
  if (lower.includes('vp') || lower.includes('vice president') || lower.includes('v.p.')) return 5;
  if (lower.includes('head of') || lower.includes('head,')) return 6;
  if (lower.includes('director')) return 7;
  if (lower.includes('manager')) return 8;
  if (lower.includes('lead') || lower.includes('senior') || lower.includes('sr.')) return 9;

  return 10;
}

/**
 * Validates that a person's organization matches the target domain
 * Returns true if the person works at the target company
 */
function validateCompanyMatch(person: any, targetDomain: string): { matches: boolean; reason: string } {
  if (!targetDomain) {
    return { matches: true, reason: 'No target domain to validate' };
  }

  const normalizedTarget = targetDomain.toLowerCase().replace(/^www\./, '');

  // Check organization domain
  const orgDomain = person.organization?.primary_domain || person.organization_domain || '';
  const normalizedOrgDomain = orgDomain.toLowerCase().replace(/^www\./, '');

  if (normalizedOrgDomain && normalizedOrgDomain === normalizedTarget) {
    return { matches: true, reason: 'Domain exact match' };
  }

  // Check if domains share the same base (e.g., company.com vs app.company.com)
  if (normalizedOrgDomain && normalizedTarget) {
    const targetBase = normalizedTarget.split('.').slice(-2).join('.');
    const orgBase = normalizedOrgDomain.split('.').slice(-2).join('.');
    if (targetBase === orgBase) {
      return { matches: true, reason: 'Domain base match' };
    }
  }

  // Check organization website
  const orgWebsite = person.organization?.website_url || '';
  if (orgWebsite) {
    const websiteDomain = orgWebsite.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
    if (websiteDomain === normalizedTarget) {
      return { matches: true, reason: 'Website match' };
    }
  }

  // If no domain info available, check organization name similarity with domain
  const orgName = (person.organization?.name || person.organization_name || '').toLowerCase();
  const domainWithoutTld = normalizedTarget.split('.')[0];

  if (orgName && domainWithoutTld) {
    // Simple check: does org name contain domain prefix or vice versa?
    if (orgName.includes(domainWithoutTld) || domainWithoutTld.includes(orgName.replace(/\s+/g, ''))) {
      return { matches: true, reason: 'Organization name matches domain' };
    }
  }

  // No match found
  return {
    matches: false,
    reason: `Organization mismatch: person at "${orgDomain || orgName || 'unknown'}" vs target "${normalizedTarget}"`
  };
}

function rankByWHOPriority(
  candidates: PersonData[],
  targetTitles: string[]
): PersonData | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Check if we're explicitly looking for founders
  const targetWantsFounder = targetTitles.some(t => {
    const lower = t.toLowerCase();
    return lower.includes('founder') || lower === 'ceo' || lower.includes('chief executive');
  });

  const ranked = [...candidates].sort((a, b) => {
    const aTitleLower = (a.title || '').toLowerCase();
    const bTitleLower = (b.title || '').toLowerCase();

    // Exact match with target titles is highest priority
    const aExactMatch = targetTitles.some(t =>
      aTitleLower.includes(t.toLowerCase()) || t.toLowerCase().includes(aTitleLower)
    );
    const bExactMatch = targetTitles.some(t =>
      bTitleLower.includes(t.toLowerCase()) || t.toLowerCase().includes(bTitleLower)
    );

    if (aExactMatch && !bExactMatch) return -1;
    if (!aExactMatch && bExactMatch) return 1;

    // Use updated seniority score that respects target titles
    const aSeniority = getSeniorityScore(a.title, targetTitles);
    const bSeniority = getSeniorityScore(b.title, targetTitles);
    if (aSeniority !== bSeniority) return aSeniority - bSeniority;

    // Prefer candidates with contact info
    const aContact = !!(a.email || a.linkedin);
    const bContact = !!(b.email || b.linkedin);
    if (aContact && !bContact) return -1;
    if (!aContact && bContact) return 1;

    return 0;
  });

  console.log('[PersonEnrichment] WHO-ranked candidates (top 5):', ranked.slice(0, 5).map(c => ({
    name: c.name,
    title: c.title,
    seniority: getSeniorityScore(c.title, targetTitles),
    hasContact: !!(c.email || c.linkedin)
  })));

  // Log if we're deprioritizing founders
  if (!targetWantsFounder && ranked[0]?.title?.toLowerCase().includes('founder')) {
    console.log('[PersonEnrichment] ⚠️ Warning: Selected founder even though not explicitly requested. Check if better matches available.');
  }

  return ranked[0];
}

export function rankCandidatesByRole(candidates: PersonData[], targetTitles: string[]): PersonData | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  let bestCandidate = candidates[0];
  let bestPriority = 9999;

  for (const candidate of candidates) {
    if (!candidate.title) continue;

    const titleLower = candidate.title.toLowerCase();

    for (let i = 0; i < WHO_ROLE_PRIORITY.length; i++) {
      const rolePattern = WHO_ROLE_PRIORITY[i];
      if (titleLower.includes(rolePattern)) {
        if (i < bestPriority) {
          bestPriority = i;
          bestCandidate = candidate;
        }
        break;
      }
    }
  }

  return bestCandidate;
}

export function isEnrichmentStale(enrichedAt: Date | null | undefined): boolean {
  if (!enrichedAt) return false;
  const now = new Date();
  const daysSince = (now.getTime() - new Date(enrichedAt).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince > 14;
}

export function getDaysSinceEnrichment(enrichedAt: Date | null | undefined): number {
  if (!enrichedAt) return Infinity;
  const now = new Date();
  return (now.getTime() - new Date(enrichedAt).getTime()) / (1000 * 60 * 60 * 24);
}

export type OutboundReadiness = 'blocked' | 'needs_review' | 'ready';

export function calculateOutboundReadiness(person: PersonData | null): OutboundReadiness {
  if (!person || !person.status) return 'blocked';

  const daysSince = getDaysSinceEnrichment(person.enrichedAt);

  if (person.status !== 'ready' || daysSince > 14) {
    return 'needs_review';
  }

  if (person.status === 'ready' && daysSince <= 14) {
    return 'ready';
  }

  return 'needs_review';
}

export function validateCopyQuality(person: PersonData | null, intro: string): { valid: boolean; reason?: string } {
  if (!person?.name) {
    return { valid: false, reason: 'Person name is required' };
  }

  if (person.status !== 'ready') {
    return { valid: false, reason: 'Contact must be verified (status: ready)' };
  }

  if (!intro || intro.trim().length === 0) {
    return { valid: false, reason: 'Intro message is required' };
  }

  if (intro.length > 140) {
    return { valid: false, reason: 'Intro must be 140 characters or less' };
  }

  const sentenceCount = intro.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
  if (sentenceCount > 1) {
    return { valid: false, reason: 'Intro must be one sentence only' };
  }

  return { valid: true };
}

export interface EnrichmentContext {
  signalType?: string;      // 'jobs', 'funding', 'layoffs', etc.
  jobCategory?: string;     // 'engineering', 'sales', etc. (inferred from job titles being hired)
  companyName?: string;
  companySize?: number;
  // Work Owner Search settings (from user config)
  workOwnerDepartments?: string[];
  workOwnerKeywords?: string[];
}

export async function enrichPerson(
  domain: string,
  titles: string[],
  config: EnrichmentConfig,
  whoRoles: string[] = [],
  context: EnrichmentContext = {}
): Promise<PersonData | null> {
  if (!config || config.provider === 'none') {
    console.log('[PersonEnrichment] Enrichment disabled');
    return null;
  }

  if (!domain) {
    console.log('[PersonEnrichment] Missing domain');
    return null;
  }

  try {
    console.log(`[PersonEnrichment] === Canonical Enrichment Flow for ${domain} ===`);
    console.log(`[PersonEnrichment] Provider: ${config.provider}, Title hints:`, titles);
    console.log(`[PersonEnrichment] Context:`, {
      signalType: context.signalType || 'unknown',
      jobCategory: context.jobCategory || 'unknown',
      companyName: context.companyName || domain,
      companySize: context.companySize || 0,
    });

    let result: PersonData | null = null;

    switch (config.provider) {
      case 'apollo':
        result = await fetchFromApollo(domain, titles, config.apiKey!, whoRoles, context);
        break;
      case 'pdl':
        result = await fetchFromPDL(domain, titles, config.apiKey!);
        break;
      case 'ssm':
        result = await fetchFromSSM(domain, titles, config.endpointUrl!, config.apiKey);
        break;
      default:
        console.warn('[PersonEnrichment] Unknown provider:', config.provider);
        return null;
    }

    if (result) {
      result.enrichedAt = new Date();

      // Handle 'not_found' status from selection logic
      if (result.status === 'not_found') {
        console.log('[PersonEnrichment] === NO GOOD MATCH FOUND ===');
        console.log('[PersonEnrichment] Reason:', result.notFoundReason);
        result.enrichmentOutcome = 'no_good_match';
        return result;
      }

      result.status = calculateEnrichmentStatus(result);
      result.enrichmentOutcome = 'exact_match';
      console.log('[PersonEnrichment] === SUCCESS: Contact found ===');
      console.log('[PersonEnrichment] Name:', result.name, '| Title:', result.title, '| Status:', result.status);
      return result;
    }

    console.log('[PersonEnrichment] ℹ️ Provider returned zero people (valid outcome, not an error)');
    return null;
  } catch (err) {
    console.error('[PersonEnrichment] Enrichment failed:', err);
    return null;
  }
}

interface OrganizationData {
  name: string | null;
  domain: string | null;
  employeeCount: number | null;
  industry: string | null;
  exists: boolean;
  apolloOrgId?: string | null;
}

async function apolloResolveOrganization(domainOrName: string, apiKey: string): Promise<OrganizationData | null> {
  if (!apiKey) {
    console.warn('[PersonEnrichment] Apollo API key missing for org resolution');
    return null;
  }

  try {
    console.log(`[PersonEnrichment] Step 1: Resolving organization for "${domainOrName}"`);

    const searchPayload = {
      q_organization_keyword_tags: [domainOrName],
      page: 1,
      per_page: 1
    };

    const res = await callApolloProxy('org_search', apiKey, { payload: searchPayload });

    if (!res.ok) {
      console.warn('[PersonEnrichment] Organization search failed:', res.status);
      return null;
    }

    const data = await res.json();
    const orgs = data?.organizations || [];

    if (orgs.length === 0) {
      console.log('[PersonEnrichment] ❌ Apollo has no indexed organization for this input');
      return null;
    }

    const org = orgs[0];
    console.log(`[PersonEnrichment] ✅ Resolved organization: ${org.name} (ID: ${org.id})`);
    console.log(`[PersonEnrichment]    Domain: ${org.primary_domain || 'none'}, Employees: ${org.estimated_num_employees || 'unknown'}`);

    return {
      name: org.name || null,
      domain: org.primary_domain || null,
      employeeCount: org.estimated_num_employees || null,
      industry: org.industry || null,
      exists: true,
      apolloOrgId: org.id || null
    };
  } catch (error) {
    console.error('[PersonEnrichment] Organization resolution error:', error);
    return null;
  }
}

async function apolloEnrichOrganization(domain: string, apiKey: string): Promise<OrganizationData | null> {
  if (!apiKey) {
    return null;
  }

  try {
    const res = await callApolloProxy('org_enrich', apiKey, { domain });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const org = data?.organization;

    if (!org) {
      return null;
    }

    return {
      name: org.name || null,
      domain: org.primary_domain || domain,
      employeeCount: org.estimated_num_employees || null,
      industry: org.industry || null,
      exists: true,
      apolloOrgId: org.id || null
    };
  } catch (error) {
    return null;
  }
}

async function apolloMatchPerson(person: any, domain: string, apiKey: string): Promise<PersonData | null> {
  if (!apiKey) {
    console.warn('[PersonEnrichment] Apollo API key missing for match');
    return null;
  }

  try {
    const matchPayload: any = {
      reveal_personal_emails: false,
      reveal_phone_number: false
    };

    if (person.id) {
      matchPayload.id = person.id;
    } else {
      const fullName = `${person.first_name || ''} ${person.last_name || ''}`.trim();
      if (fullName) matchPayload.name = fullName;
      if (domain) matchPayload.domain = domain;
      if (person.organization_name) matchPayload.organization_name = person.organization_name;
      if (person.linkedin_url) matchPayload.linkedin_url = person.linkedin_url;
    }

    console.log('[PersonEnrichment] Matching person via Apollo /people/match');

    const res = await callApolloProxy('people_match', apiKey, { payload: matchPayload });

    if (!res.ok) {
      console.warn('[PersonEnrichment] Apollo match request failed:', res.status);
      return null;
    }

    const data = await res.json();
    const matched = data?.person;

    if (!matched) {
      console.log('[PersonEnrichment] No match result from Apollo');
      return null;
    }

    const email = matched.email || null;
    const linkedin = matched.linkedin_url || null;
    const confidence = matched.email_status === 'verified' ? 95 :
                       matched.email_status === 'likely_valid' ? 85 :
                       matched.email ? 75 : 70;

    return {
      name: `${matched.first_name || ''} ${matched.last_name || ''}`.trim() || null,
      title: matched.title || null,
      email: email,
      linkedin: linkedin,
      confidence: confidence
    };
  } catch (error) {
    console.error('[PersonEnrichment] Apollo match error:', error);
    return null;
  }
}

function createApolloHeaders(apiKey: string): Record<string, string> {
  if (apiKey.toLowerCase().startsWith('bearer ')) {
    console.error('[PersonEnrichment] CRITICAL: Apollo API keys must NOT use Bearer tokens!');
    console.error('[PersonEnrichment] Remove "Bearer " prefix and use x-api-key header instead');
    throw new Error('Apollo API does not accept Bearer tokens - use x-api-key header');
  }

  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Cache-Control': 'no-cache',
    'x-api-key': apiKey
  };
}

async function callApolloProxy(type: string, apiKey: string, params: any): Promise<Response> {
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/apollo-enrichment`;
  return await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type,
      apiKey,
      ...params
    })
  });
}

function inferDepartmentKeywords(titles: string[]): string {
  const titleStr = titles.join(' ').toLowerCase();
  const keywords: string[] = [];

  if (titleStr.includes('engineer') || titleStr.includes('cto') || titleStr.includes('technical')) {
    keywords.push('engineering');
  }
  if (titleStr.includes('operation') || titleStr.includes('coo') || titleStr.includes('ops')) {
    keywords.push('operations');
  }
  if (titleStr.includes('growth') || titleStr.includes('marketing') || titleStr.includes('cmo')) {
    keywords.push('growth', 'marketing');
  }
  if (titleStr.includes('finance') || titleStr.includes('cfo') || titleStr.includes('accounting')) {
    keywords.push('finance');
  }
  if (titleStr.includes('hr') || titleStr.includes('people') || titleStr.includes('human resources') || titleStr.includes('chro')) {
    keywords.push('people', 'human resources');
  }

  if (keywords.length === 0) {
    keywords.push('engineering', 'operations', 'finance', 'growth', 'executive');
  }

  return keywords.join(' OR ');
}

async function fetchFromApollo(
  domain: string,
  titles: string[],
  apiKey: string,
  whoRoles: string[] = [],
  context: EnrichmentContext = {}
): Promise<PersonData | null> {
  if (!apiKey) {
    console.warn('[PersonEnrichment] Apollo API key missing');
    return null;
  }

  const companyName = context.companyName || domain;
  const companySize = context.companySize || 0;
  const signalType = context.signalType || 'jobs';
  const jobCategory = context.jobCategory || 'unknown';

  try {
    console.log('[PersonEnrichment] WHO context:', whoRoles.length > 0 ? whoRoles : 'none provided');
    console.log('[PersonEnrichment] Step 1: Organization resolution (context only, never blocks)');
    const orgData = await apolloResolveOrganization(domain, apiKey);

    // Use org data for company size if not provided
    const effectiveCompanySize = companySize || orgData?.employeeCount || 0;

    if (orgData?.apolloOrgId) {
      console.log(`[PersonEnrichment] ℹ️ Organization context: ${orgData.apolloOrgId} (${orgData.employeeCount || 'unknown'} employees)`);
    } else {
      console.log('[PersonEnrichment] ℹ️ No organization context available (proceeding with domain-based discovery)');
    }

    console.log('[PersonEnrichment] Step 2: WORK OWNER SEARCH (department + keywords + seniority)');
    console.log('[PersonEnrichment] CANONICAL STRATEGY: Domain → User Departments → Keywords → Seniority → Best Selection');

    // Use user-configured work owner settings if provided, otherwise fall back to signal-based defaults
    const hasUserDepartments = context.workOwnerDepartments && context.workOwnerDepartments.length > 0;
    const hasUserKeywords = context.workOwnerKeywords && context.workOwnerKeywords.length > 0;

    // Build targeted search params based on signal type and job category (as fallback)
    const signalParams = getApolloSearchParams(signalType, jobCategory);

    // Priority: User settings > Signal-inferred settings
    const effectiveDepartments = hasUserDepartments
      ? context.workOwnerDepartments!
      : signalParams.departments;

    const effectiveKeywords = hasUserKeywords
      ? context.workOwnerKeywords!.join(' OR ')
      : null;

    // Override with WHO-derived titles if provided
    const effectiveTitles = (titles && titles.length > 0) ? titles : signalParams.titles;

    console.log('[PersonEnrichment] Work Owner Search config:', {
      source: hasUserDepartments ? 'user_settings' : 'signal_inferred',
      departments: effectiveDepartments,
      keywords: effectiveKeywords || '(none)',
      titles: effectiveTitles,
      seniorities: signalParams.seniorities,
    });

    const searchPayload: any = {
      domain,
      departments: effectiveDepartments,
      seniorities: signalParams.seniorities,
      titles: effectiveTitles,
    };

    // Add keywords if provided (q_keywords for free-text search)
    if (effectiveKeywords) {
      searchPayload.keywords = effectiveKeywords;
    }

    const res = await callApolloProxy('people_search', apiKey, searchPayload);

    if (!res.ok) {
      console.warn('[PersonEnrichment] Apollo people search failed:', res.status);
      return null;
    }

    const data = await res.json();
    let people: EnrichedPerson[] = data?.people || [];
    let searchStrategy = 'primary';

    if (people.length === 0) {
      console.log('[PersonEnrichment] ℹ️ Primary search returned zero people');
      console.log('[PersonEnrichment] Step 2b: FALLBACK - Broader department search with seniority filter');

      // Fallback: keep departments but relax title/keyword requirements
      const fbRes = await callApolloProxy('people_search', apiKey, {
        domain,
        departments: effectiveDepartments,
        seniorities: ['vp', 'director', 'manager', 'head'],
      });

      if (fbRes.ok) {
        const fbData = await fbRes.json();
        people = fbData?.people || [];
        if (people.length > 0) {
          console.log(`[PersonEnrichment] ✅ Department fallback returned ${people.length} people`);
          searchStrategy = 'fallback_department';
        }
      }

      // Final fallback: any senior person at domain
      if (people.length === 0) {
        console.log('[PersonEnrichment] Step 2c: FINAL FALLBACK - Any senior person at domain');
        const finalRes = await callApolloProxy('people_search', apiKey, {
          domain,
          seniorities: ['c_suite', 'vp', 'director', 'head'],
        });

        if (finalRes.ok) {
          const finalData = await finalRes.json();
          people = finalData?.people || [];
          if (people.length > 0) {
            console.log(`[PersonEnrichment] ✅ Seniority fallback returned ${people.length} people`);
            searchStrategy = 'fallback_seniority';
          }
        }
      }
    }

    if (people.length === 0) {
      console.log('[PersonEnrichment] ℹ️ All search strategies returned zero people');
      return {
        name: null,
        title: null,
        email: null,
        linkedin: null,
        confidence: null,
        status: 'not_found',
        notFoundReason: 'Apollo has no indexed contacts for this domain',
      };
    }

    console.log(`[PersonEnrichment] ✅ Search returned ${people.length} people (strategy: ${searchStrategy})`);
    console.log('[PersonEnrichment] Step 3: Best person selection (org match + scoring)');

    // Use the new deterministic selection logic
    const selection = selectBestPerson(
      people,
      domain,
      companyName,
      effectiveCompanySize,
      signalType,
      jobCategory
    );

    if (selection.status === 'not_found') {
      console.log('[PersonEnrichment] ❌ No good decision maker found');
      console.log('[PersonEnrichment] Reason:', selection.reason);
      return {
        name: null,
        title: null,
        email: null,
        linkedin: null,
        confidence: null,
        status: 'not_found',
        notFoundReason: selection.reason,
      };
    }

    const bestPerson = selection.person!;
    console.log('[PersonEnrichment] Step 4: Optional enrichment via Match API');

    // Try to get better contact info via Match API
    const matched = await apolloMatchPerson(bestPerson, domain, apiKey);

    const finalPerson: PersonData = matched || {
      name: bestPerson.name || `${bestPerson.first_name || ''} ${bestPerson.last_name || ''}`.trim() || null,
      title: bestPerson.title || null,
      email: bestPerson.email || null,
      linkedin: bestPerson.linkedin_url || null,
      confidence: matched?.confidence || (selection.matchType === 'email' ? 95 : selection.matchType === 'org_domain' ? 90 : 75),
    };

    (finalPerson as any).searchStrategy = searchStrategy;
    (finalPerson as any).matchType = selection.matchType;

    console.log('[PersonEnrichment] ✅ Final selection:', {
      name: finalPerson.name,
      title: finalPerson.title,
      email: finalPerson.email,
      confidence: finalPerson.confidence,
      matchType: selection.matchType,
    });

    return finalPerson;
  } catch (error) {
    console.error('[PersonEnrichment] Apollo fetch error:', error);
    return null;
  }
}

async function fetchFromPDL(domain: string, titles: string[], apiKey: string): Promise<PersonData | null> {
  if (!apiKey) {
    console.warn('[PersonEnrichment] PDL API key missing');
    return null;
  }

  try {
    const query: any = {
      query: {
        bool: {
          must: [
            { term: { 'job_company_website': domain } }
          ]
        }
      },
      size: 1
    };

    if (titles.length > 0) {
      query.query.bool.should = titles.map(title => ({
        match: { 'job_title': title }
      }));
      query.query.bool.minimum_should_match = 1;
    }

    const res = await fetch('https://api.peopledatalabs.com/v5/person/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey
      },
      body: JSON.stringify(query)
    });

    if (!res.ok) {
      console.warn('[PersonEnrichment] PDL API request failed:', res.status);
      return null;
    }

    const data = await res.json();
    const person = data?.data?.[0];

    if (!person) {
      console.log('[PersonEnrichment] No person found from PDL');
      return null;
    }

    return {
      name: person.full_name || null,
      title: person.job_title || null,
      email: person.emails?.[0] || null,
      linkedin: person.linkedin_url || null,
      confidence: person.likelihood ? Math.round(person.likelihood * 100) : 85
    };
  } catch (error) {
    console.error('[PersonEnrichment] PDL fetch error:', error);
    return null;
  }
}

async function fetchFromSSM(domain: string, titles: string[], endpointUrl: string, apiKey?: string): Promise<PersonData | null> {
  if (!endpointUrl) {
    console.warn('[PersonEnrichment] SSM endpoint URL missing');
    return null;
  }

  try {
    const headers: any = {
      'Content-Type': 'application/json'
    };

    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const body: any = { domain };
    if (titles.length > 0) {
      body.titles = titles;
    }

    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      console.warn('[PersonEnrichment] SSM API request failed:', res.status);
      return null;
    }

    const person = await res.json();

    if (!person || !person.name) {
      console.log('[PersonEnrichment] No person found from SSM');
      return null;
    }

    return {
      name: person.name || null,
      title: person.title || null,
      email: person.email || null,
      linkedin: person.linkedin || null,
      confidence: person.confidence || 70
    };
  } catch (error) {
    console.error('[PersonEnrichment] SSM fetch error:', error);
    return null;
  }
}

export function isEnrichmentConfigured(config: EnrichmentConfig): boolean {
  if (!config || config.provider === 'none') {
    return false;
  }

  switch (config.provider) {
    case 'apollo':
    case 'pdl':
      return !!config.apiKey;
    case 'ssm':
      return !!config.endpointUrl;
    default:
      return false;
  }
}

export function getHighestMatchingTitle(
  personTitle: string,
  targetTitles: string[]
): number {
  const normalizedPersonTitle = personTitle.toLowerCase();

  for (let i = 0; i < targetTitles.length; i++) {
    const targetTitle = targetTitles[i].toLowerCase();
    if (normalizedPersonTitle.includes(targetTitle) || targetTitle.includes(normalizedPersonTitle)) {
      return i;
    }
  }

  return targetTitles.length;
}
