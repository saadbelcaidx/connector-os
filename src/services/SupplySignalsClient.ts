/**
 * SupplySignalsClient.ts
 *
 * Dynamic discovery of SUPPLY companies from public signals.
 *
 * Supply = Companies that provide talent/services (agencies, staffing, consulting)
 *
 * Sources:
 * - Apify scrapers (Clutch directories, G2 listings, LinkedIn company scrapers)
 * - Any dataset URL that returns company data
 *
 * NO hardcoded providers. Everything is signal-driven.
 */

import { safeLower, safeText, normalizeToItems, FETCH_LIMITS, FetchOptions, buildApifyUrl, SignalsConfig, getCsvData } from './SignalsClient';
import { classifyCompany, HireCategory, ClassificationResult, extractSupplyCategory } from './CompanyRoleClassifier';
import { cleanCompanyName } from './IntroBuilder';
import { DetectedNiche } from './AIService';

/**
 * Build URL with pagination parameters for Apify
 */
function buildPaginatedUrl(baseUrl: string, options?: FetchOptions): string {
  if (!options?.limit && !options?.offset) return baseUrl;

  const url = new URL(baseUrl);
  if (options.limit) {
    url.searchParams.set('limit', String(options.limit));
  }
  if (options.offset) {
    url.searchParams.set('offset', String(options.offset));
  }
  return url.toString();
}

export interface SupplyCompany {
  name: string;
  domain: string;
  description?: string;
  industry?: string;
  specialty?: string;
  techStack?: string[];
  hireCategory: HireCategory;
  classification: ClassificationResult;
  raw: any;
  // Pre-extracted contact info from Apify (if available)
  existingContact?: {
    name?: string;
    email?: string;
    title?: string;
    linkedin?: string;
  };
  // Quality ranking fields (populated by SupplyQualityRanker when pressure detected)
  qualityScore?: number;
  rankingReason?: string[];
}

export interface SupplySignalData {
  companies: SupplyCompany[];
  isLive: boolean;
  lastUpdated?: string;
  totalDiscovered: number;
  totalClassifiedAsSupply: number;
  rawPayload?: any;
}

/**
 * Extract company-like fields from any Apify scraper output
 * Works with: Clutch, G2, LinkedIn Companies, Agency directories, etc.
 */
function extractCompanyFields(item: any): {
  name: string;
  domain: string;
  description: string;
  industry: string;
  tags: string[];
  techStack: string[];
  raw: any;
  existingContact?: {
    name?: string;
    email?: string;
    title?: string;
    linkedin?: string;
  };
} {
  if (!item || typeof item !== 'object') {
    return { name: '', domain: '', description: '', industry: '', tags: [], techStack: [], raw: item };
  }

  // Company name candidates
  // Note: item.title is used as fallback BUT only if no first_name/last_name (to avoid using person's job title)
  const hasPersonData = !!(item.first_name || item.firstName || item.last_name || item.lastName);
  const name = safeText(
    item.name ??
    item.companyName ??
    item.company_name ??
    item.organization_name ??  // Apollo scraper company name
    item.organizationName ??
    item.organization ??
    item.agency_name ??
    item.agencyName ??
    (hasPersonData ? '' : item.title) ??  // Only use title if no person data
    ''
  );

  // Domain/URL candidates - expanded to handle many Apify scraper formats
  // Also check nested objects (company.website, companyInfo.domain, etc.)
  let domain = safeText(
    item.domain ??
    item.website ??
    item.website_url ??
    item.websiteUrl ??
    item.company_website ??
    item.companyWebsite ??
    item.company_domain ??
    item.companyDomain ??
    item.url ??
    item.company_url ??
    item.companyUrl ??
    item.homepage ??
    item.homepage_url ??
    item.homepageUrl ??
    item.site ??
    item.site_url ??
    item.siteUrl ??
    item.web ??
    item.web_url ??
    item.webUrl ??
    item.primaryDomain ??
    item.primary_domain ??
    item.main_website ??
    item.mainWebsite ??
    // Nested structures
    item.company?.website ??
    item.company?.domain ??
    item.company?.url ??
    item.companyInfo?.website ??
    item.companyInfo?.domain ??
    item.organization?.website ??
    item.organization?.domain ??
    ''
  );

  // Clean domain
  if (domain) {
    try {
      if (domain.startsWith('http')) {
        const u = new URL(domain);
        domain = u.hostname.replace(/^www\./, '');
      } else {
        domain = domain.replace(/^www\./, '');
      }
    } catch {
      domain = domain.replace(/^(https?:\/\/)?(www\.)?/, '');
    }
  }

  // If no domain, generate from name
  if (!domain && name) {
    domain = safeLower(name).replace(/[^a-z0-9]/g, '') + '.com';
  }

  // Description candidates
  const description = safeText(
    item.description ??
    item.summary ??
    item.about ??
    item.overview ??
    item.bio ??
    item.tagline ??
    item.shortDescription ??
    ''
  );

  // Industry candidates
  const industry = safeText(
    item.industry ??
    item.sector ??
    item.category ??
    item.vertical ??
    item.type ??
    ''
  );

  // Tags/categories
  const tagsRaw = item.tags ?? item.categories ?? item.services ?? item.specialties ?? [];
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.map(t => safeText(t)).filter(Boolean)
    : safeText(tagsRaw).split(',').map(t => t.trim()).filter(Boolean);

  // Tech stack candidates
  const techRaw = item.tech_stack ?? item.techStack ?? item.technologies ?? item.tech ?? item.stack ?? item.tools ?? [];
  const techStack = Array.isArray(techRaw)
    ? techRaw.map(t => safeText(t)).filter(Boolean)
    : safeText(techRaw).split(',').map(t => t.trim()).filter(Boolean);

  // Extract existing contact info if available
  // Sources: Apify Apollo scraper (first_name/last_name/email), Wellfound (hiring_contact), Clutch, etc.

  // Email - Apollo scraper puts it directly on item, Wellfound in hiring_contact
  const contactEmail = safeText(
    item.email ??
    item.personal_email ??     // Fallback to personal email if work email missing
    item.personalEmail ??
    item.work_email ??
    item.workEmail ??
    item.contact_email ??
    item.contactEmail ??
    item.hiring_contact?.email ??
    item.hiringContact?.email ??
    item.recruiter_email ??
    item.recruiterEmail ??
    ''
  );

  // Name - Apollo scraper has first_name/last_name, Wellfound has hiring_contact.name
  const firstName = safeText(item.first_name ?? item.firstName ?? '');
  const lastName = safeText(item.last_name ?? item.lastName ?? '');
  const fullNameFromParts = (firstName && lastName) ? `${firstName} ${lastName}` : (firstName || lastName);

  const contactName = fullNameFromParts || safeText(
    item.full_name ??          // Direct full_name field
    item.fullName ??
    item.contact_name ??
    item.contactName ??
    item.hiring_contact?.name ??
    item.hiringContact?.name ??
    item.hiring_contact_name ??
    item.hiringContactName ??
    item.recruiter_name ??
    item.recruiterName ??
    item.contact ??
    ''
  );

  // Title - Apollo scraper has it directly (only use if we have person data to avoid conflict with company title)
  const contactTitle = safeText(
    (fullNameFromParts ? item.title : null) ?? // Only use item.title if we have first_name/last_name
    item.job_title ??          // Common field name for job title
    item.jobTitle ??
    item.contact_title ??
    item.contactTitle ??
    item.hiring_contact?.title ??
    item.hiringContact?.title ??
    item.recruiter_title ??
    item.recruiterTitle ??
    ''
  );

  // LinkedIn - various formats
  const contactLinkedin = safeText(
    item.linkedin ??           // Direct linkedin field
    item.person_linkedin_url ??
    item.linkedin_url ??
    item.linkedinUrl ??
    item.contact_linkedin ??
    item.contactLinkedin ??
    item.hiring_contact?.linkedin ??
    item.hiringContact?.linkedin ??
    ''
  );

  // Build existing contact object if any info found
  const existingContact = (contactEmail || contactName) ? {
    name: contactName || undefined,
    email: contactEmail || undefined,
    title: contactTitle || undefined,
    linkedin: contactLinkedin || undefined,
  } : undefined;

  return {
    name: name.trim() || 'Unknown Company',
    domain: domain.trim(),
    description: description.trim(),
    industry: industry.trim(),
    tags,
    techStack,
    raw: item,
    existingContact,
  };
}

/**
 * Process CSV data through the same pipeline as Apify data
 * Reuses extractCompanyFields and classifyCompany
 */
function processCsvSupplyData(
  csvData: any[],
  filterCategory?: HireCategory
): SupplySignalData & { hasMore?: boolean } {
  try {
    console.log('[Supply][CSV] Processing', csvData.length, 'records from CSV');

    const supplyCompanies: SupplyCompany[] = [];
    const seen = new Set<string>();

    for (const item of csvData) {
      const extracted = extractCompanyFields(item);

      // Skip if no name or already seen
      if (!extracted.name || extracted.name === 'Unknown Company') continue;
      if (seen.has(safeLower(extracted.domain))) continue;
      seen.add(safeLower(extracted.domain));

      // Classify the company
      const classification = classifyCompany(
        extracted.name,
        extracted.description,
        extracted.industry,
        undefined,
        extracted.tags
      );

      // Only include companies classified as SUPPLY
      if (classification.role === 'supply') {
        const supplyCategory = extractSupplyCategory(
          extracted.name,
          extracted.description,
          extracted.industry,
          extracted.tags
        );

        const finalCategory = supplyCategory !== 'unknown' ? supplyCategory : classification.hireCategory;

        // Apply category filter if specified
        if (filterCategory && filterCategory !== 'unknown') {
          if (finalCategory !== filterCategory && finalCategory !== 'unknown') {
            continue;
          }
        }

        supplyCompanies.push({
          name: cleanCompanyName(extracted.name),
          domain: extracted.domain,
          description: extracted.description,
          industry: extracted.industry,
          specialty: extracted.tags.slice(0, 3).join(', ') || extracted.description.slice(0, 100),
          techStack: extracted.techStack,
          hireCategory: finalCategory,
          classification: { ...classification, hireCategory: finalCategory },
          raw: extracted.raw,
          existingContact: extracted.existingContact,
        });
      }
    }

    const withContactEmail = supplyCompanies.filter(s => s.existingContact?.email).length;
    console.log(`[Supply][CSV] Classified ${supplyCompanies.length}/${csvData.length} as supply (${withContactEmail} with contact email)`);

    return {
      companies: supplyCompanies,
      isLive: true,
      lastUpdated: new Date().toISOString(),
      totalDiscovered: csvData.length,
      totalClassifiedAsSupply: supplyCompanies.length,
      rawPayload: { data: csvData, source: 'csv' },
    };
  } catch (error) {
    console.error('[Supply][CSV] Processing failed:', error);
    return {
      companies: [],
      isLive: false,
      totalDiscovered: 0,
      totalClassifiedAsSupply: 0,
    };
  }
}

/**
 * Fetch and classify supply companies from an Apify dataset URL OR CSV upload
 *
 * This is the main entry point for supply discovery.
 * Works with ANY Apify scraper output - no assumed schema.
 * Priority: CSV data > Apify dataset
 */
export async function fetchSupplySignals(
  datasetIdOrUrl: string,
  filterCategory?: HireCategory,
  options?: FetchOptions,
  apifyToken?: string
): Promise<SupplySignalData & { hasMore?: boolean }> {
  // Check for CSV data first (takes priority over Apify)
  const csvData = getCsvData('supply');
  if (csvData && csvData.length > 0) {
    console.log('[Supply][CSV] Using CSV data:', csvData.length, 'records');
    return processCsvSupplyData(csvData, filterCategory);
  }

  // Only apply limit/offset if explicitly specified
  const effectiveOptions: FetchOptions = {
    limit: options?.limit,
    offset: options?.offset ?? 0,
  };

  // Build URL from dataset ID + token
  const datasetUrl = buildApifyUrl(datasetIdOrUrl, apifyToken);

  console.log('[Supply][Apify] URL:', datasetUrl || '(none)', 'Limit:', effectiveOptions.limit || 'all', 'Offset:', effectiveOptions.offset);

  if (!datasetUrl || datasetUrl.trim() === '') {
    console.log('[Supply][Apify] No URL configured');
    return {
      companies: [],
      isLive: false,
      totalDiscovered: 0,
      totalClassifiedAsSupply: 0,
    };
  }

  try {
    const url = buildPaginatedUrl(datasetUrl, effectiveOptions);
    console.log('[Supply][Apify] Fetching:', url);

    const response = await fetch(url);

    if (!response.ok) {
      console.error(`[Supply][Apify] HTTP ${response.status}`);
      return {
        companies: [],
        isLive: false,
        totalDiscovered: 0,
        totalClassifiedAsSupply: 0,
      };
    }

    const rawData = await response.json();
    console.log('[Supply][Apify] Response received');

    // Normalize to array of items
    const items = normalizeToItems(rawData);
    console.log('[Supply][Apify] Normalized items:', items.length);

    // Debug: Log available fields from first item to help with field mapping
    if (items.length > 0) {
      const sampleItem = items[0];
      const allKeys = Object.keys(sampleItem || {}).filter(k => sampleItem[k] != null);
      console.log('[Supply][Apify] Sample item keys:', allKeys.join(', '));

      // DEBUG: Check email field specifically
      console.log('[Supply][Apify] DEBUG email check:', {
        hasEmailField: 'email' in sampleItem,
        emailValue: sampleItem.email,
        emailType: typeof sampleItem.email,
        first3Emails: items.slice(0, 3).map(i => i.email)
      });

      // Check if website-like fields exist
      const websiteFields = allKeys.filter(k =>
        k.toLowerCase().includes('url') ||
        k.toLowerCase().includes('website') ||
        k.toLowerCase().includes('domain') ||
        k.toLowerCase().includes('site') ||
        k.toLowerCase().includes('web') ||
        k.toLowerCase().includes('homepage')
      );
      if (websiteFields.length > 0) {
        console.log('[Supply][Apify] Detected website-like fields:', websiteFields.join(', '));
      } else {
        console.warn('[Supply][Apify] ⚠️ No website/domain fields detected! Domains will be auto-generated from company names.');
        console.warn('[Supply][Apify] Available fields:', allKeys.join(', '));
      }
    }

    if (items.length === 0) {
      return {
        companies: [],
        isLive: true,
        lastUpdated: new Date().toISOString(),
        totalDiscovered: 0,
        totalClassifiedAsSupply: 0,
        rawPayload: rawData,
      };
    }

    // Extract and classify each company
    const supplyCompanies: SupplyCompany[] = [];
    const seen = new Set<string>();

    for (const item of items) {
      const extracted = extractCompanyFields(item);

      // Skip if no name or already seen
      if (!extracted.name || extracted.name === 'Unknown Company') continue;
      if (seen.has(safeLower(extracted.domain))) continue;
      seen.add(safeLower(extracted.domain));

      // Classify the company
      const classification = classifyCompany(
        extracted.name,
        extracted.description,
        extracted.industry,
        undefined, // No job postings for supply companies typically
        extracted.tags
      );

      // Only include companies classified as SUPPLY
      if (classification.role === 'supply') {
        // Use specialized supply category detection for better matching
        const supplyCategory = extractSupplyCategory(
          extracted.name,
          extracted.description,
          extracted.industry,
          extracted.tags
        );

        // Override classification's hireCategory with more specific supply category
        const finalCategory = supplyCategory !== 'unknown' ? supplyCategory : classification.hireCategory;

        // Apply category filter if specified
        if (filterCategory && filterCategory !== 'unknown') {
          if (finalCategory !== filterCategory && finalCategory !== 'unknown') {
            continue; // Skip non-matching categories
          }
        }

        supplyCompanies.push({
          name: cleanCompanyName(extracted.name),
          domain: extracted.domain,
          description: extracted.description,
          industry: extracted.industry,
          specialty: extracted.tags.slice(0, 3).join(', ') || extracted.description.slice(0, 100),
          techStack: extracted.techStack,
          hireCategory: finalCategory,
          classification: { ...classification, hireCategory: finalCategory },
          raw: extracted.raw,
          existingContact: extracted.existingContact,
        });
      }
    }

    // DEBUG: Count how many have existingContact.email
    const withContactEmail = supplyCompanies.filter(s => s.existingContact?.email).length;
    console.log(`[Supply][Apify] Classified ${supplyCompanies.length}/${items.length} as supply (${withContactEmail} with contact email)`);

    return {
      companies: supplyCompanies,
      isLive: true,
      lastUpdated: new Date().toISOString(),
      totalDiscovered: items.length,
      totalClassifiedAsSupply: supplyCompanies.length,
      rawPayload: rawData,
    };
  } catch (error) {
    console.error('[Supply][Apify] Fetch failed:', error);
    return {
      companies: [],
      isLive: false,
      totalDiscovered: 0,
      totalClassifiedAsSupply: 0,
    };
  }
}

// ============================================================================
// SCORED MATCHING SYSTEM
// ============================================================================

/**
 * Scored match result - replaces implicit first-match-wins behavior
 */
export interface ScoredSupplyMatch {
  supply: SupplyCompany;
  score: number;
  reasoning: string;
}

/**
 * Demand context for scoring (passed from MatchingEngine)
 */
export interface DemandContext {
  companyName: string;
  domain: string;
  category: HireCategory;
  painPoints?: string[];
  industry?: string;
  signalStrength?: number;
}

/**
 * Scoring weights (adjustable)
 */
const SCORING_WEIGHTS = {
  CATEGORY_MATCH: 40,      // Required - no category match = excluded
  PAIN_ALIGNMENT: 30,      // Semantic pain alignment
  INDUSTRY_MATCH: 0,       // Stub: future factor
  DEAL_SIZE_FIT: 0,        // Stub: future factor
  SENIORITY_MATCH: 0,      // Stub: future factor
};

/**
 * Pain keywords by category for semantic matching
 */
const CATEGORY_PAIN_KEYWORDS: Record<HireCategory, string[]> = {
  engineering: ['scale', 'technical debt', 'hiring engineers', 'development speed', 'infrastructure', 'devops', 'backend', 'frontend', 'full stack', 'ml', 'ai', 'data'],
  sales: ['revenue', 'pipeline', 'quota', 'leads', 'closing', 'sales cycle', 'account executive', 'sdr', 'bdr', 'enterprise sales'],
  marketing: ['brand', 'awareness', 'demand gen', 'content', 'seo', 'paid', 'growth', 'conversion', 'acquisition'],
  operations: ['efficiency', 'process', 'scale', 'automation', 'ops', 'supply chain', 'logistics'],
  finance: ['budget', 'forecasting', 'accounting', 'compliance', 'audit', 'reporting', 'cash flow'],
  compliance: ['regulatory', 'audit', 'risk', 'legal', 'gdpr', 'sox', 'hipaa'],
  unknown: [],
};

/**
 * Score a single demand-supply match
 */
export function scoreMatch(
  demand: DemandContext,
  supply: SupplyCompany
): { score: number; factors: Record<string, number>; reasoning: string } | null {
  const factors: Record<string, number> = {};
  let totalScore = 0;

  // Category scoring (not exclusion) - allow unknown categories with lower score
  if (supply.hireCategory === 'unknown') {
    // Unknown category: can match anyone, but lower priority
    factors.categoryMatch = 10; // Lower score for unknown
    totalScore += factors.categoryMatch;
  } else if (demand.category !== 'unknown' && supply.hireCategory !== demand.category) {
    // Explicit mismatch: exclude
    return null;
  } else {
    // Exact match or demand is unknown
    factors.categoryMatch = SCORING_WEIGHTS.CATEGORY_MATCH;
    totalScore += factors.categoryMatch;
  }

  // 2. Pain Alignment (semantic, +0-30)
  factors.painAlignment = scorePainAlignment(demand, supply);
  totalScore += factors.painAlignment;

  // 3. Industry Match (stub for future)
  factors.industryMatch = scoreIndustryMatch(demand, supply);
  totalScore += factors.industryMatch;

  // 4. Deal Size Fit (stub for future)
  factors.dealSizeFit = scoreDealSizeFit(demand, supply);
  totalScore += factors.dealSizeFit;

  // 5. Seniority Match (stub for future)
  factors.seniorityMatch = scoreSeniorityMatch(demand, supply);
  totalScore += factors.seniorityMatch;

  // Generate reasoning from factors (NOT raw pain text)
  const reasoning = generateMatchReasoning(demand, supply, factors, totalScore);

  return { score: totalScore, factors, reasoning };
}

/**
 * Score pain alignment (semantic, not string match)
 * Returns 0-30 based on keyword overlap between demand pain and supply specialty
 */
function scorePainAlignment(demand: DemandContext, supply: SupplyCompany): number {
  if (!demand.painPoints || demand.painPoints.length === 0) {
    // No pain data - give partial credit if supply has relevant specialty
    if (supply.specialty && supply.specialty.length > 10) {
      return 10; // Some specialty info exists
    }
    return 5; // Baseline
  }

  // Get category keywords
  const categoryKeywords = CATEGORY_PAIN_KEYWORDS[demand.category] || [];

  // Combine demand pain text
  const demandPainText = demand.painPoints.join(' ').toLowerCase();

  // Combine supply description + specialty
  const supplyText = [
    supply.description || '',
    supply.specialty || '',
    supply.industry || ''
  ].join(' ').toLowerCase();

  // Count keyword matches
  let keywordMatches = 0;
  for (const keyword of categoryKeywords) {
    const inDemand = demandPainText.includes(keyword);
    const inSupply = supplyText.includes(keyword);
    if (inDemand && inSupply) {
      keywordMatches += 2; // Both have it - strong signal
    } else if (inSupply) {
      keywordMatches += 1; // Supply covers it
    }
  }

  // Normalize to 0-30 scale
  const maxKeywords = Math.min(categoryKeywords.length, 10);
  const normalizedScore = Math.min(30, Math.round((keywordMatches / maxKeywords) * 30));

  return normalizedScore;
}

/**
 * Score industry match (STUB - returns 0)
 */
function scoreIndustryMatch(_demand: DemandContext, _supply: SupplyCompany): number {
  // TODO: Implement when industry data available
  return SCORING_WEIGHTS.INDUSTRY_MATCH;
}

/**
 * Score deal size fit (STUB - returns 0)
 */
function scoreDealSizeFit(_demand: DemandContext, _supply: SupplyCompany): number {
  // TODO: Implement when deal size data available
  return SCORING_WEIGHTS.DEAL_SIZE_FIT;
}

/**
 * Score seniority match (STUB - returns 0)
 */
function scoreSeniorityMatch(_demand: DemandContext, _supply: SupplyCompany): number {
  // TODO: Implement when seniority data available
  return SCORING_WEIGHTS.SENIORITY_MATCH;
}

/**
 * Generate match reasoning from scoring factors
 * Sounds like operator judgment, NOT AI analysis or raw pain text
 */
function generateMatchReasoning(
  demand: DemandContext,
  supply: SupplyCompany,
  factors: Record<string, number>,
  totalScore: number
): string {
  const parts: string[] = [];
  const categoryLabel = formatCategory(demand.category);

  // Strong fit (70+)
  if (totalScore >= 70) {
    parts.push(`Strong fit`);
  } else if (totalScore >= 55) {
    parts.push(`Good fit`);
  } else {
    parts.push(`Potential fit`);
  }

  // Category alignment
  parts.push(`— ${supply.name} places ${categoryLabel} roles`);

  // Pain alignment contribution
  if (factors.painAlignment >= 20) {
    parts.push(`and aligns well with current needs`);
  } else if (factors.painAlignment >= 10) {
    parts.push(`with relevant experience`);
  }

  // Add confidence qualifier
  if (supply.classification.confidence === 'high') {
    parts.push(`(high confidence)`);
  }

  return parts.join(' ');
}

/**
 * Format category for human-readable reasoning
 */
function formatCategory(category: HireCategory): string {
  const labels: Record<HireCategory, string> = {
    engineering: 'engineering',
    sales: 'sales',
    marketing: 'marketing',
    operations: 'operations',
    finance: 'finance',
    compliance: 'compliance',
    unknown: 'general',
  };
  return labels[category] || 'general';
}

/**
 * Find matching supply companies with scoring
 * Returns top 3 ranked matches with scores and reasoning
 */
export function findMatchingSupply(
  supplyCompanies: SupplyCompany[],
  demandCategory: HireCategory,
  limit: number = 3,
  demandContext?: DemandContext
): SupplyCompany[] {
  // Use scored matching if context provided
  if (demandContext) {
    const scoredMatches = findScoredMatches(supplyCompanies, demandContext, limit);
    return scoredMatches.map(m => m.supply);
  }

  // Fallback to basic category matching (backwards compatible)
  const matches = supplyCompanies.filter(s =>
    s.hireCategory !== 'unknown' &&
    (demandCategory === 'unknown' || s.hireCategory === demandCategory)
  );

  // Sort by classification confidence
  const confOrder = { high: 3, medium: 2, low: 1 };
  matches.sort((a, b) =>
    confOrder[b.classification.confidence] - confOrder[a.classification.confidence]
  );

  return matches.slice(0, limit);
}

/**
 * Find scored matches - main entry point for new matching system
 * Returns top N matches sorted by score DESC with reasoning
 */
export function findScoredMatches(
  supplyCompanies: SupplyCompany[],
  demandContext: DemandContext,
  limit: number = 3
): ScoredSupplyMatch[] {
  const scoredMatches: ScoredSupplyMatch[] = [];

  for (const supply of supplyCompanies) {
    const result = scoreMatch(demandContext, supply);

    if (result && result.score > 0) {
      scoredMatches.push({
        supply,
        score: result.score,
        reasoning: result.reasoning,
      });
    }
  }

  // Sort by score DESC
  scoredMatches.sort((a, b) => b.score - a.score);

  const topMatches = scoredMatches.slice(0, limit);

  console.log(`[Supply] Scored matching for ${demandContext.category}: ${scoredMatches.length} valid, returning top ${topMatches.length}`);
  if (topMatches.length > 0) {
    console.log(`[Supply] Top match: ${topMatches[0].supply.name} (score: ${topMatches[0].score})`);
  }

  return topMatches;
}

/**
 * Get default Apollo titles for enriching supply contacts
 */
/**
 * Get supply-side contact titles for enrichment.
 * NICHE-AWARE: Uses detectedNiche.contactTargets.supplyTitles when available.
 * Falls back to HireCategory-based titles for backwards compatibility.
 */
export function getSupplyEnrichmentTitles(
  hireCategory: HireCategory,
  detectedNiche?: DetectedNiche | null
): string[] {
  // NICHE-AWARE: Use niche-specific titles when available
  if (detectedNiche?.contactTargets?.supplyTitles?.length) {
    console.log(`[SupplySignals] Using niche-based supply titles for "${detectedNiche.niche}":`, detectedNiche.contactTargets.supplyTitles);
    return detectedNiche.contactTargets.supplyTitles;
  }

  // FALLBACK: Recruiting-specific titles (legacy behavior)
  // Supply-side contacts are typically recruiters, talent leads, or partnerships
  const baseTitles = ['recruiter', 'talent acquisition', 'partnerships', 'business development'];

  // Add category-specific titles
  switch (hireCategory) {
    case 'engineering':
      return ['technical recruiter', 'engineering recruiter', ...baseTitles];
    case 'sales':
      return ['sales recruiter', 'revenue recruiter', ...baseTitles];
    case 'marketing':
      return ['marketing recruiter', ...baseTitles];
    case 'operations':
      return ['operations recruiter', ...baseTitles];
    case 'finance':
      return ['finance recruiter', ...baseTitles];
    default:
      return baseTitles;
  }
}
