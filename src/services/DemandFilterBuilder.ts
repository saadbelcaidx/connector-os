/**
 * DemandFilterBuilder.ts
 *
 * DETERMINISTIC DEMAND FILTER BUILDER
 *
 * Inputs: ConnectorMode, operator filters
 * Outputs: strict filters
 *
 * - Never include forbidden industries/keywords
 * - Never infer staffing/hiring unless mode is recruiting
 * - Validates output against registry
 */

import {
  type ConnectorMode,
  getModeContract,
} from './ConnectorModeRegistry';

// =============================================================================
// TYPES
// =============================================================================

export interface DemandFilters {
  description: string;
  industriesInclude: string[];
  industriesExclude: string[];
  titlesInclude: string[];
  titlesExclude: string[];
  keywordsInclude: string[];
  keywordsExclude: string[];
  companySizeMin?: number;
  companySizeMax?: number;
}

export interface DemandFilterValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// =============================================================================
// FILTER BUILDER
// =============================================================================

/**
 * Build demand filters for a mode.
 * Returns deterministic filters based on registry.
 */
export function buildDemandFilters(mode: ConnectorMode): DemandFilters {
  const contract = getModeContract(mode);

  return {
    description: `${contract.label} - Demand Side`,
    industriesInclude: [...contract.demand.allowedIndustries],
    industriesExclude: [...contract.demand.forbiddenIndustries],
    titlesInclude: [...contract.demand.defaultTitles],
    titlesExclude: [
      'Intern',
      'Assistant',
      'Coordinator',
      'Junior',
      'Entry Level',
    ],
    keywordsInclude: [...contract.vocabulary.allowed],
    keywordsExclude: [...contract.vocabulary.forbidden],
  };
}

/**
 * Validate demand filters against mode contract.
 */
export function validateDemandFilters(
  filters: DemandFilters,
  mode: ConnectorMode
): DemandFilterValidation {
  const contract = getModeContract(mode);
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check forbidden industries
  for (const industry of filters.industriesInclude) {
    const industryLower = industry.toLowerCase();
    for (const forbidden of contract.demand.forbiddenIndustries) {
      if (industryLower.includes(forbidden.toLowerCase())) {
        errors.push(`Demand industry "${industry}" is forbidden in ${contract.label} mode`);
      }
    }
  }

  // Check forbidden keywords
  for (const keyword of filters.keywordsInclude) {
    const keywordLower = keyword.toLowerCase();
    for (const forbidden of contract.vocabulary.forbidden) {
      if (keywordLower.includes(forbidden.toLowerCase())) {
        errors.push(`Keyword "${keyword}" is forbidden in ${contract.label} mode`);
      }
    }
  }

  // Warnings for empty filters
  if (filters.titlesInclude.length === 0) {
    warnings.push('No title filters specified - may get low-quality matches');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate a single demand record against mode.
 */
export function validateDemandRecord(
  record: {
    industry?: string;
    company?: string;
    title?: string;
  },
  mode: ConnectorMode
): { valid: boolean; reason?: string } {
  const contract = getModeContract(mode);

  // Check industry against forbidden list
  if (record.industry) {
    const industryLower = record.industry.toLowerCase();
    for (const forbidden of contract.demand.forbiddenIndustries) {
      if (industryLower.includes(forbidden.toLowerCase())) {
        return {
          valid: false,
          reason: `Industry "${record.industry}" is forbidden in ${contract.label} mode`,
        };
      }
    }

    // If allowlist exists and industry not in it, warn
    if (contract.demand.allowedIndustries.length > 0) {
      const isAllowed = contract.demand.allowedIndustries.some(
        allowed => industryLower.includes(allowed.toLowerCase())
      );
      if (!isAllowed) {
        return {
          valid: false,
          reason: `Industry "${record.industry}" not in allowed list for ${contract.label} mode`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Filter demand records by mode.
 * Returns only records that pass validation.
 */
export function filterDemandRecords<T extends { industry?: string; company?: string; title?: string }>(
  records: T[],
  mode: ConnectorMode
): { valid: T[]; invalid: { record: T; reason: string }[] } {
  const valid: T[] = [];
  const invalid: { record: T; reason: string }[] = [];

  for (const record of records) {
    const validation = validateDemandRecord(record, mode);
    if (validation.valid) {
      valid.push(record);
    } else {
      invalid.push({ record, reason: validation.reason || 'Unknown reason' });
    }
  }

  return { valid, invalid };
}

// =============================================================================
// MERGE WITH OPERATOR FILTERS
// =============================================================================

/**
 * Merge operator-provided filters with mode defaults.
 * Operator filters ADD to defaults, but cannot override forbidden items.
 */
export function mergeWithOperatorFilters(
  modeFilters: DemandFilters,
  operatorFilters: Partial<DemandFilters>,
  mode: ConnectorMode
): { merged: DemandFilters; validation: DemandFilterValidation } {
  const contract = getModeContract(mode);

  // Start with mode defaults
  const merged: DemandFilters = { ...modeFilters };

  // Merge operator additions
  if (operatorFilters.industriesInclude) {
    merged.industriesInclude = [
      ...new Set([...merged.industriesInclude, ...operatorFilters.industriesInclude]),
    ];
  }

  if (operatorFilters.titlesInclude) {
    merged.titlesInclude = [
      ...new Set([...merged.titlesInclude, ...operatorFilters.titlesInclude]),
    ];
  }

  if (operatorFilters.keywordsInclude) {
    merged.keywordsInclude = [
      ...new Set([...merged.keywordsInclude, ...operatorFilters.keywordsInclude]),
    ];
  }

  // Always keep mode forbidden items
  merged.industriesExclude = [
    ...new Set([...merged.industriesExclude, ...contract.demand.forbiddenIndustries]),
  ];

  merged.keywordsExclude = [
    ...new Set([...merged.keywordsExclude, ...contract.vocabulary.forbidden]),
  ];

  // Size constraints
  if (operatorFilters.companySizeMin !== undefined) {
    merged.companySizeMin = operatorFilters.companySizeMin;
  }
  if (operatorFilters.companySizeMax !== undefined) {
    merged.companySizeMax = operatorFilters.companySizeMax;
  }

  // Validate merged result
  const validation = validateDemandFilters(merged, mode);

  return { merged, validation };
}
