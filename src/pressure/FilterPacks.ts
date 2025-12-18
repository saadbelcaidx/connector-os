/**
 * FilterPacks.ts
 *
 * DETERMINISTIC FILTER PACK REGISTRY
 *
 * This module defines pre-configured filter sets (packs) for different
 * counterparty categories and vertical hints.
 *
 * Each pack is a template that gets selected based on:
 * - Primary key: counterparty category
 * - Secondary key: vertical hint
 * - Tertiary: roleType (for fine-tuning)
 *
 * NO AI. NO NETWORK CALLS. Pure data registry.
 */

import type { CounterpartyCategory, RoleType } from './InversionTable';

// ============================================================================
// TYPES
// ============================================================================

export type VerticalHint =
  | 'generic'
  | 'recruitment'
  | 'wealth_management'
  | 'biotech'
  | 'saas'
  | 'unknown';

export interface FilterPack {
  jobTitlesInclude: string[];
  jobTitlesExclude: string[];
  industriesInclude: string[];
  industriesExclude: string[];
  companySizeInclude: string[];
  keywordsInclude: string[];
  keywordsExclude: string[];
  whyTemplate: string; // Template for the 'why' field
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

export const DEFAULT_COMPANY_SIZES = ['11-50', '51-200', '201-500'];

const EMPTY_PACK: FilterPack = {
  jobTitlesInclude: [],
  jobTitlesExclude: [],
  industriesInclude: [],
  industriesExclude: [],
  companySizeInclude: DEFAULT_COMPANY_SIZES,
  keywordsInclude: [],
  keywordsExclude: [],
  whyTemplate: 'No matching filter pack found.'
};

// ============================================================================
// PACK DEFINITIONS
// ============================================================================

/**
 * Pack A — tech_recruitment (generic + recruitment)
 *
 * For engineering hiring pressure → tech recruitment counterparty
 */
const PACK_TECH_RECRUITMENT_GENERIC: FilterPack = {
  jobTitlesInclude: [
    // Leadership
    'Founder',
    'Co-Founder',
    'CEO',
    'Managing Director',
    'Partner',
    // Recruitment Leadership
    'Recruitment Director',
    'Head of Recruitment',
    'Head of Talent',
    'Director of Talent Acquisition',
    'VP of Talent',
    // Senior Recruiters
    'Principal Recruiter',
    'Lead Recruiter',
    'Senior Recruiter',
    // Tech-Specific Recruiters
    'Engineering Recruiter',
    'Technical Recruiter',
    'Technology Recruiter',
    'Software Recruiter'
  ],
  jobTitlesExclude: [
    // Junior roles
    'Junior Recruiter',
    'Recruitment Coordinator',
    'Talent Sourcer',
    'Sourcing Specialist',
    // Internal/Corporate HR
    'HR Generalist',
    'People Partner',
    'People Operations',
    'Internal Recruiter',
    'In-house Recruiter',
    'Corporate Recruiter'
  ],
  industriesInclude: [
    'Staffing & Recruiting',
    'Staffing and Recruiting',
    'Human Resources',
    'Recruiting'
  ],
  industriesExclude: [],
  companySizeInclude: DEFAULT_COMPANY_SIZES,
  keywordsInclude: [
    'technical recruitment',
    'engineering recruitment',
    'software recruitment',
    'tech recruitment',
    'devops recruitment',
    'backend recruitment',
    'full stack recruitment',
    'developer recruitment',
    'technology staffing',
    'IT recruitment'
  ],
  keywordsExclude: [
    'internal',
    'in-house',
    'corporate',
    'freelance platform',
    'outsourcing platform',
    'nearshore',
    'offshore',
    'contractor marketplace'
  ],
  whyTemplate: 'Hiring pressure detected for {roleType} roles. Counterparty = tech_recruitment. Filters target technical recruiters and staffing agencies.'
};

/**
 * Pack B — sales_recruitment (generic)
 */
const PACK_SALES_RECRUITMENT_GENERIC: FilterPack = {
  jobTitlesInclude: [
    'Founder',
    'Co-Founder',
    'CEO',
    'Managing Director',
    'Partner',
    'Recruitment Director',
    'Head of Recruitment',
    'Head of Talent',
    'Sales Recruiter',
    'Revenue Recruiter',
    'GTM Recruiter',
    'Senior Recruiter'
  ],
  jobTitlesExclude: [
    'Junior Recruiter',
    'Recruitment Coordinator',
    'Talent Sourcer',
    'HR Generalist',
    'People Partner',
    'Internal Recruiter',
    'In-house Recruiter'
  ],
  industriesInclude: [
    'Staffing & Recruiting',
    'Staffing and Recruiting'
  ],
  industriesExclude: [],
  companySizeInclude: DEFAULT_COMPANY_SIZES,
  keywordsInclude: [
    'sales recruitment',
    'revenue recruitment',
    'GTM recruitment',
    'account executive recruitment',
    'sales staffing',
    'commercial recruitment'
  ],
  keywordsExclude: [
    'internal',
    'in-house',
    'corporate'
  ],
  whyTemplate: 'Hiring pressure detected for {roleType} roles. Counterparty = sales_recruitment. Filters target sales/revenue recruiters.'
};

/**
 * Pack C — marketing_recruitment (generic)
 */
const PACK_MARKETING_RECRUITMENT_GENERIC: FilterPack = {
  jobTitlesInclude: [
    'Founder',
    'Co-Founder',
    'CEO',
    'Managing Director',
    'Partner',
    'Recruitment Director',
    'Head of Recruitment',
    'Marketing Recruiter',
    'Creative Recruiter',
    'Digital Recruiter',
    'Senior Recruiter'
  ],
  jobTitlesExclude: [
    'Junior Recruiter',
    'Recruitment Coordinator',
    'Talent Sourcer',
    'HR Generalist',
    'Internal Recruiter',
    'In-house Recruiter'
  ],
  industriesInclude: [
    'Staffing & Recruiting',
    'Staffing and Recruiting'
  ],
  industriesExclude: [],
  companySizeInclude: DEFAULT_COMPANY_SIZES,
  keywordsInclude: [
    'marketing recruitment',
    'creative recruitment',
    'digital recruitment',
    'growth recruitment',
    'marketing staffing'
  ],
  keywordsExclude: [
    'internal',
    'in-house',
    'corporate'
  ],
  whyTemplate: 'Hiring pressure detected for {roleType} roles. Counterparty = marketing_recruitment. Filters target marketing/creative recruiters.'
};

/**
 * Pack D — executive_search (generic)
 */
const PACK_EXECUTIVE_SEARCH_GENERIC: FilterPack = {
  jobTitlesInclude: [
    'Founder',
    'Co-Founder',
    'CEO',
    'Managing Director',
    'Managing Partner',
    'Partner',
    'Principal',
    'Director',
    'Executive Search Consultant',
    'Senior Consultant',
    'Head of Practice'
  ],
  jobTitlesExclude: [
    'Research Associate',
    'Research Analyst',
    'Junior Consultant',
    'Coordinator',
    'Assistant'
  ],
  industriesInclude: [
    'Staffing & Recruiting',
    'Executive Search',
    'Management Consulting'
  ],
  industriesExclude: [],
  companySizeInclude: ['11-50', '51-200'],
  keywordsInclude: [
    'executive search',
    'retained search',
    'C-suite recruitment',
    'board recruitment',
    'leadership recruitment',
    'senior hire',
    'executive recruitment'
  ],
  keywordsExclude: [
    'contingent',
    'temp',
    'contract staffing'
  ],
  whyTemplate: 'Hiring pressure detected for {roleType} roles. Counterparty = executive_search. Filters target executive search firms.'
};

/**
 * Pack E — compliance_consulting (generic)
 */
const PACK_COMPLIANCE_CONSULTING_GENERIC: FilterPack = {
  jobTitlesInclude: [
    'Founder',
    'Co-Founder',
    'CEO',
    'Managing Director',
    'Partner',
    'Principal',
    'Director',
    'Head of Compliance',
    'Compliance Director',
    'Senior Consultant',
    'Managing Consultant'
  ],
  jobTitlesExclude: [
    'Junior Consultant',
    'Analyst',
    'Coordinator',
    'Assistant'
  ],
  industriesInclude: [
    'Management Consulting',
    'Legal Services',
    'Financial Services'
  ],
  industriesExclude: [],
  companySizeInclude: DEFAULT_COMPANY_SIZES,
  keywordsInclude: [
    'compliance consulting',
    'regulatory consulting',
    'risk consulting',
    'GRC consulting',
    'audit consulting'
  ],
  keywordsExclude: [
    'software vendor',
    'SaaS'
  ],
  whyTemplate: 'Hiring pressure detected for {roleType} roles. Counterparty = compliance_consulting. Filters target compliance/regulatory consultants.'
};

/**
 * Pack F — cloud_consulting (generic)
 */
const PACK_CLOUD_CONSULTING_GENERIC: FilterPack = {
  jobTitlesInclude: [
    'Founder',
    'Co-Founder',
    'CEO',
    'Managing Director',
    'Partner',
    'Principal',
    'Director',
    'Head of Cloud',
    'Cloud Practice Lead',
    'Senior Consultant',
    'Solutions Architect'
  ],
  jobTitlesExclude: [
    'Junior Consultant',
    'Associate',
    'Coordinator'
  ],
  industriesInclude: [
    'Information Technology & Services',
    'IT Services and IT Consulting',
    'Management Consulting'
  ],
  industriesExclude: [],
  companySizeInclude: DEFAULT_COMPANY_SIZES,
  keywordsInclude: [
    'cloud consulting',
    'AWS consulting',
    'Azure consulting',
    'GCP consulting',
    'cloud migration',
    'cloud services',
    'DevOps consulting'
  ],
  keywordsExclude: [
    'reseller',
    'hardware'
  ],
  whyTemplate: 'Hiring pressure detected for {roleType} roles. Counterparty = cloud_consulting. Filters target cloud/infrastructure consultants.'
};

// ============================================================================
// PACK REGISTRY
// Key format: `${counterparty}:${verticalHint}`
// ============================================================================

const PACK_REGISTRY: Record<string, FilterPack> = {
  // tech_recruitment
  'tech_recruitment:generic': PACK_TECH_RECRUITMENT_GENERIC,
  'tech_recruitment:recruitment': PACK_TECH_RECRUITMENT_GENERIC,
  'tech_recruitment:saas': PACK_TECH_RECRUITMENT_GENERIC,
  'tech_recruitment:biotech': PACK_TECH_RECRUITMENT_GENERIC,

  // sales_recruitment
  'sales_recruitment:generic': PACK_SALES_RECRUITMENT_GENERIC,
  'sales_recruitment:recruitment': PACK_SALES_RECRUITMENT_GENERIC,
  'sales_recruitment:saas': PACK_SALES_RECRUITMENT_GENERIC,

  // marketing_recruitment
  'marketing_recruitment:generic': PACK_MARKETING_RECRUITMENT_GENERIC,
  'marketing_recruitment:recruitment': PACK_MARKETING_RECRUITMENT_GENERIC,

  // executive_search
  'executive_search:generic': PACK_EXECUTIVE_SEARCH_GENERIC,
  'executive_search:recruitment': PACK_EXECUTIVE_SEARCH_GENERIC,
  'executive_search:wealth_management': PACK_EXECUTIVE_SEARCH_GENERIC,

  // compliance_consulting
  'compliance_consulting:generic': PACK_COMPLIANCE_CONSULTING_GENERIC,
  'compliance_consulting:wealth_management': PACK_COMPLIANCE_CONSULTING_GENERIC,

  // cloud_consulting
  'cloud_consulting:generic': PACK_CLOUD_CONSULTING_GENERIC,
  'cloud_consulting:saas': PACK_CLOUD_CONSULTING_GENERIC
};

// ============================================================================
// LOOKUP FUNCTION
// ============================================================================

/**
 * Get a filter pack by counterparty and vertical hint
 *
 * Resolution order:
 * 1. Exact match: `${counterparty}:${verticalHint}`
 * 2. Fallback: `${counterparty}:generic`
 * 3. Empty pack
 */
export function getFilterPack(
  counterparty: CounterpartyCategory,
  verticalHint: VerticalHint = 'generic'
): FilterPack {
  // Try exact match
  const exactKey = `${counterparty}:${verticalHint}`;
  if (PACK_REGISTRY[exactKey]) {
    return PACK_REGISTRY[exactKey];
  }

  // Fallback to generic
  const genericKey = `${counterparty}:generic`;
  if (PACK_REGISTRY[genericKey]) {
    return PACK_REGISTRY[genericKey];
  }

  // No pack found
  return EMPTY_PACK;
}
