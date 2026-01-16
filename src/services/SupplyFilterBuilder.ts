/**
 * SupplyFilterBuilder.ts
 *
 * DETERMINISTIC SUPPLY FILTER BUILDER
 *
 * Uses ConnectorModeRegistry as single source of truth.
 *
 * - Never include forbidden industries/keywords
 * - Never infer staffing/hiring unless mode is recruiting
 * - Validation fails hard if filters contain banned items
 */

import {
  type ConnectorMode,
  getModeContract,
  isSupplyIndustryForbidden,
  getAvailableModes,
} from './ConnectorModeRegistry';

// Re-export ConnectorMode for backwards compatibility
export type { ConnectorMode } from './ConnectorModeRegistry';

// =============================================================================
// TYPES
// =============================================================================

export interface SupplyFilters {
  description: string;
  jobTitlesInclude: string[];
  jobTitlesExclude: string[];
  industriesInclude: string[];
  industriesBan: string[];
  keywordsInclude: string[];
  keywordsBan: string[];
  companySizeMin?: number;
}

export interface SupplyFilterValidation {
  valid: boolean;
  errors: string[];
}

// =============================================================================
// FILTER BUILDER (from registry)
// =============================================================================

/**
 * Build supply filters for the given connector mode.
 * Returns deterministic filters from registry - no LLM guessing.
 */
export function buildSupplyFilters(mode: ConnectorMode): SupplyFilters {
  const contract = getModeContract(mode);

  return {
    description: `${contract.label} - Supply Side`,
    jobTitlesInclude: [...contract.supply.defaultTitles],
    jobTitlesExclude: [
      'Intern',
      'Coordinator',
      'Assistant',
      'Junior',
      'Associate',
      'Analyst',
      'Specialist',
      'Entry Level',
    ],
    industriesInclude: [...contract.supply.allowedIndustries],
    industriesBan: [...contract.supply.forbiddenIndustries],
    keywordsInclude: [...contract.vocabulary.allowed],
    keywordsBan: [...contract.vocabulary.forbidden],
    companySizeMin: contract.supply.companySizeMin,
  };
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate supply filters against mode-specific rules.
 * Returns validation result with errors if invalid.
 */
export function validateSupplyFilters(
  filters: SupplyFilters,
  mode: ConnectorMode
): SupplyFilterValidation {
  const errors: string[] = [];
  const contract = getModeContract(mode);

  // Check for forbidden industries
  for (const industry of filters.industriesInclude) {
    const check = isSupplyIndustryForbidden(mode, industry);
    if (check.forbidden) {
      errors.push(check.reason || `Industry "${industry}" is forbidden in ${mode} mode`);
    }
  }

  // Check for forbidden keywords
  for (const keyword of filters.keywordsInclude) {
    const keywordLower = keyword.toLowerCase();
    for (const forbidden of contract.vocabulary.forbidden) {
      if (keywordLower.includes(forbidden.toLowerCase())) {
        errors.push(`Keyword "${keyword}" is forbidden in ${contract.label} mode`);
      }
    }
  }

  // Mode-specific validation
  if (mode === 'biotech_licensing') {
    // Must include pharmaceuticals
    const hasPharma = filters.industriesInclude.some(
      ind => ind.toLowerCase().includes('pharma')
    );
    if (!hasPharma && contract.supply.allowedIndustries.length > 0) {
      errors.push('biotech_licensing mode requires "Pharmaceuticals" in industries');
    }

    // Must NOT include staffing
    const hasStaffing = filters.industriesInclude.some(
      ind => ind.toLowerCase().includes('staffing') || ind.toLowerCase().includes('recruiting')
    );
    if (hasStaffing) {
      errors.push('biotech_licensing mode cannot include staffing/recruiting industries');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a supply record against mode rules.
 * Used during matching to filter out invalid supply matches.
 */
export function validateSupplyRecord(
  record: {
    industry?: string;
    company?: string;
    title?: string;
  },
  mode: ConnectorMode
): { valid: boolean; reason?: string } {
  const contract = getModeContract(mode);
  const filters = buildSupplyFilters(mode);

  // Check industry against forbidden list
  if (record.industry) {
    const check = isSupplyIndustryForbidden(mode, record.industry);
    if (check.forbidden) {
      return { valid: false, reason: check.reason };
    }
  }

  // Check company name against keyword bans
  if (record.company) {
    const companyLower = record.company.toLowerCase();
    for (const banned of filters.keywordsBan) {
      if (companyLower.includes(banned.toLowerCase())) {
        return {
          valid: false,
          reason: `Company "${record.company}" contains banned keyword "${banned}"`,
        };
      }
    }
  }

  // Check title against exclude list
  if (record.title) {
    const titleLower = record.title.toLowerCase();
    for (const excluded of filters.jobTitlesExclude) {
      if (titleLower.includes(excluded.toLowerCase())) {
        return {
          valid: false,
          reason: `Title "${record.title}" is excluded in ${contract.label} mode`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Filter supply records by mode.
 * Returns only records that pass validation.
 */
export function filterSupplyRecords<T extends { industry?: string; company?: string; title?: string }>(
  records: T[],
  mode: ConnectorMode
): { valid: T[]; invalid: { record: T; reason: string }[] } {
  const valid: T[] = [];
  const invalid: { record: T; reason: string }[] = [];

  for (const record of records) {
    const validation = validateSupplyRecord(record, mode);
    if (validation.valid) {
      valid.push(record);
    } else {
      invalid.push({ record, reason: validation.reason || 'Unknown reason' });
    }
  }

  return { valid, invalid };
}

// =============================================================================
// MODE DETECTION (deprecated - use registry)
// =============================================================================

/**
 * Auto-detect connector mode from demand dataset characteristics.
 * Returns null if mode cannot be confidently inferred (force user selection).
 *
 * @deprecated Use ConnectorModeRegistry.getAvailableModes() and let user select
 */
export function detectConnectorMode(demandData: {
  industries: string[];
  keywords: string[];
  signals: string[];
}): ConnectorMode | null {
  const { industries, keywords, signals } = demandData;

  // Combine all text for analysis
  const allText = [...industries, ...keywords, ...signals]
    .join(' ')
    .toLowerCase();

  // Biotech/Pharma licensing signals
  const biotechSignals = [
    'biotech', 'biotechnology', 'clinical', 'therapeutics', 'drug discovery',
    'pharma', 'pharmaceutical', 'life science', 'pipeline', 'phase i',
    'phase ii', 'phase iii', 'fda', 'regulatory', 'in-licensing', 'out-licensing',
  ];

  // Recruiting signals (job-filling)
  const recruitingSignals = [
    'hiring', 'open position', 'job posting', 'talent', 'candidate', 'recruiter', 'staffing',
  ];

  const biotechScore = biotechSignals.filter(s => allText.includes(s)).length;
  const recruitingScore = recruitingSignals.filter(s => allText.includes(s)).length;

  // Strong biotech signal without strong recruiting signal → biotech_licensing
  if (biotechScore >= 3 && recruitingScore < 2) {
    return 'biotech_licensing';
  }

  // Strong recruiting signal → recruiting
  if (recruitingScore >= 2) {
    return 'recruiting';
  }

  // Cannot confidently infer - force user selection
  return null;
}

// =============================================================================
// MODE LABELS (UI) - now from registry
// =============================================================================

/**
 * Get all available modes with labels
 */
export function getModesForUI(): { id: ConnectorMode; label: string; description: string }[] {
  return getAvailableModes();
}

/**
 * Get human-readable label for mode
 */
export function getModeLabel(mode: ConnectorMode): string {
  const contract = getModeContract(mode);
  return contract.label;
}

// Backwards compatibility export (updated labels)
export const MODE_LABELS = {
  recruiting: { label: 'Recruiting', description: 'Companies hiring → Recruiters' },
  biotech_licensing: { label: 'Biotech/Pharma', description: 'Biotech → Pharma partners' },
  wealth_management: { label: 'Wealth', description: 'Wealthy People → Advisors' },
  real_estate_capital: { label: 'Real Estate', description: 'Deals → Capital' },
  enterprise_partnerships: { label: 'General B2B', description: 'Any market → Any partners' },
  logistics: { label: 'Logistics', description: 'Supply Chain → Partners' },
  crypto: { label: 'Crypto/Web3', description: 'Crypto → Partners' },
  custom: { label: 'Custom', description: 'You define the rules' },
};
