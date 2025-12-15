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

import { safeLower, safeText, normalizeToItems } from './SignalsClient';
import { classifyCompany, HireCategory, ClassificationResult, extractSupplyCategory } from './CompanyRoleClassifier';

export interface SupplyCompany {
  name: string;
  domain: string;
  description?: string;
  industry?: string;
  specialty?: string;
  hireCategory: HireCategory;
  classification: ClassificationResult;
  raw: any;
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
  raw: any;
} {
  if (!item || typeof item !== 'object') {
    return { name: '', domain: '', description: '', industry: '', tags: [], raw: item };
  }

  // Company name candidates
  const name = safeText(
    item.name ??
    item.companyName ??
    item.company_name ??
    item.title ??
    item.organization ??
    item.agency_name ??
    item.agencyName ??
    ''
  );

  // Domain/URL candidates
  let domain = safeText(
    item.domain ??
    item.website ??
    item.url ??
    item.company_url ??
    item.companyUrl ??
    item.homepage ??
    item.site ??
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

  return {
    name: name.trim() || 'Unknown Company',
    domain: domain.trim(),
    description: description.trim(),
    industry: industry.trim(),
    tags,
    raw: item,
  };
}

/**
 * Fetch and classify supply companies from an Apify dataset URL
 *
 * This is the main entry point for supply discovery.
 * Works with ANY Apify scraper output - no assumed schema.
 */
export async function fetchSupplySignals(
  datasetUrl: string,
  filterCategory?: HireCategory
): Promise<SupplySignalData> {
  console.log('[Supply][Apify] URL:', datasetUrl || '(none)');

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
    console.log('[Supply][Apify] Fetching:', datasetUrl);

    const response = await fetch(datasetUrl);

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
          name: extracted.name,
          domain: extracted.domain,
          description: extracted.description,
          industry: extracted.industry,
          specialty: extracted.tags.slice(0, 3).join(', ') || extracted.description.slice(0, 100),
          hireCategory: finalCategory,
          classification: { ...classification, hireCategory: finalCategory },
          raw: extracted.raw,
        });
      }
    }

    console.log(`[Supply][Apify] Classified ${supplyCompanies.length}/${items.length} as supply`);

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

/**
 * Find matching supply companies for a demand company's hire category
 * STRICT MATCHING: Only returns exact category matches
 * NO fallback to unknown/generic - those are excluded
 */
export function findMatchingSupply(
  supplyCompanies: SupplyCompany[],
  demandCategory: HireCategory,
  limit: number = 5
): SupplyCompany[] {
  // STRICT: Only exact category matches
  const exactMatches: SupplyCompany[] = [];

  for (const supply of supplyCompanies) {
    // SKIP all unknown category supply companies
    if (supply.hireCategory === 'unknown') {
      continue;
    }

    if (demandCategory === 'unknown') {
      // If demand category is unknown, accept any categorized supply
      exactMatches.push(supply);
    } else if (supply.hireCategory === demandCategory) {
      // Exact category match only
      exactMatches.push(supply);
    }
    // SKIP mismatched categories (no fallback)
  }

  // Sort by confidence
  const confOrder = { high: 3, medium: 2, low: 1 };
  exactMatches.sort((a, b) =>
    confOrder[b.classification.confidence] - confOrder[a.classification.confidence]
  );

  const result = exactMatches.slice(0, limit);

  console.log(`[Supply] STRICT matching for ${demandCategory}: ${exactMatches.length} exact matches, returning ${result.length}`);

  return result;
}

/**
 * Get default Apollo titles for enriching supply contacts
 */
export function getSupplyEnrichmentTitles(hireCategory: HireCategory): string[] {
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
