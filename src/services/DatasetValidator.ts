/**
 * DatasetValidator.ts
 *
 * Validates and analyzes Apify dataset URLs before saving.
 * Shows field coverage, detects field mappings, and previews data.
 */

export interface FieldMapping {
  email: string | null;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  domain: string | null;
  title: string | null;
  linkedin: string | null;
}

export interface DatasetAnalysis {
  isValid: boolean;
  error?: string;
  totalRecords: number;
  sampleRecords: any[];

  // Field detection
  detectedFields: string[];
  fieldMapping: FieldMapping;

  // Coverage stats
  coverage: {
    withEmail: number;
    withName: number;
    withCompany: number;
    withDomain: number;
    withTitle: number;
    withLinkedin: number;
  };

  // Percentages
  percentages: {
    email: number;
    name: number;
    company: number;
    domain: number;
  };

  // Data type detection
  dataType: 'companies' | 'people' | 'mixed' | 'unknown';

  // Nested objects detected (e.g., hiring_contact)
  nestedObjects: string[];

  // Enrichment cost estimation (Apollo: $59/mo = 2,500 credits, 1 credit = 1 verified email)
  enrichmentEstimate: {
    recordsNeedingEnrichment: number;
    creditsRequired: number;
    percentOfMonthlyBudget: number;  // Based on 2,500 credits/month
    estimatedCost: number;           // Based on $0.024/credit ($59/2500)
  };
}

// Field name patterns for auto-detection
const FIELD_PATTERNS = {
  email: [
    'email', 'contact_email', 'contactEmail', 'work_email', 'workEmail',
    'hiring_contact.email', 'hiringContact.email',  // Wellfound
    'recruiter_email', 'recruiterEmail',
  ],
  firstName: ['first_name', 'firstName', 'fname', 'hiring_contact.first_name', 'hiringContact.firstName'],
  lastName: ['last_name', 'lastName', 'lname', 'hiring_contact.last_name', 'hiringContact.lastName'],
  name: [
    'name', 'full_name', 'fullName', 'contact_name', 'contactName', 'person_name', 'personName',
    'hiring_contact', 'hiringContact',  // Wellfound - might be string directly
    'hiring_contact.name', 'hiringContact.name',  // Wellfound - nested object
    'hiring_contact.full_name', 'hiringContact.fullName',
    'hiring_contact_name', 'hiringContactName',
    'contact', 'contact_person',
  ],
  company: [
    'company', 'companyName', 'company_name',
    'organization', 'organization_name', 'organizationName',
    'agency_name', 'agencyName',
  ],
  domain: ['domain', 'website', 'url', 'company_url', 'companyUrl', 'homepage', 'site', 'web'],
  title: [
    'title', 'job_title', 'jobTitle', 'position', 'role',
    'hiring_contact.title', 'hiringContact.title',  // Wellfound
    'hiring_contact.role', 'hiringContact.role',
  ],
  linkedin: [
    'linkedin', 'linkedin_url', 'linkedinUrl', 'person_linkedin_url', 'contact_linkedin',
    'hiring_contact.linkedin', 'hiringContact.linkedin',  // Wellfound
    'hiring_contact.linkedin_url', 'hiringContact.linkedinUrl',
  ],
};

// Helper to convert to camelCase (hiring_contact -> hiringContact)
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Helper to convert to snake_case (hiringContact -> hiring_contact)
function toSnakeCase(str: string): string {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Get value from record, trying multiple casings for nested fields
 * Also handles cases where a field (like hiring_contact) might be a string or an object
 */
function getFieldValue(record: any, pattern: string): any {
  if (!pattern.includes('.')) {
    // Simple field - try direct, camelCase, and snake_case
    let value = record[pattern] ?? record[toCamelCase(pattern)] ?? record[toSnakeCase(pattern)];

    // If value is an object with a 'name' property, extract it (for patterns like 'hiring_contact')
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Check if it has name-like fields
      const nameValue = value.name || value.full_name || value.fullName;
      if (nameValue) return nameValue;
      // If it's an object but no name field, still return it as "exists"
      return value;
    }

    return value;
  }

  // Nested field like hiring_contact.email
  let value = getNestedValue(record, pattern);

  if (value === undefined) {
    const parts = pattern.split('.');
    if (parts.length === 2) {
      const [obj, key] = parts;
      // Try different casings for the parent object
      const nestedObj = record[obj] || record[toCamelCase(obj)] || record[toSnakeCase(obj)];
      if (nestedObj && typeof nestedObj === 'object') {
        // Try different casings for the key
        value = nestedObj[key] ?? nestedObj[toCamelCase(key)] ?? nestedObj[toSnakeCase(key)];
      }
    }
  }

  return value;
}

/**
 * Check if a value is "real" (not null/empty/placeholder)
 */
function isRealValue(value: any): boolean {
  if (value === undefined || value === null || value === '') return false;
  // Object with at least one key is real
  if (typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value).length > 0;
  }
  // Array with items is real
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
}

/**
 * Detect which field in the data matches a pattern
 * Now checks if field EXISTS in at least 10% of records (even if null sometimes)
 * Tries multiple casings (camelCase, snake_case)
 */
function detectField(sampleRecords: any[], patterns: string[]): string | null {
  for (const pattern of patterns) {
    let existsCount = 0;
    let hasValueCount = 0;

    for (const record of sampleRecords) {
      const value = getFieldValue(record, pattern);

      // Check if field exists (even if null)
      if (value !== undefined) {
        existsCount++;
        // Check if it has a real value
        if (isRealValue(value)) {
          hasValueCount++;
        }
      }
    }

    // Field is detected if:
    // - At least 5% of records have it with a value (lowered threshold), OR
    // - At least 20% of records have the field (even if null)
    const existsRatio = existsCount / sampleRecords.length;
    const hasValueRatio = hasValueCount / sampleRecords.length;

    if (hasValueRatio >= 0.05 || existsRatio >= 0.2) {
      return pattern;
    }
  }
  return null;
}

/**
 * Detect nested objects like hiring_contact and extract their sub-fields
 */
function detectNestedObjects(sampleRecords: any[]): string[] {
  const nestedFields: string[] = [];
  const objectFields = new Set<string>();

  // Find fields that are objects
  for (const record of sampleRecords) {
    if (!record || typeof record !== 'object') continue;
    for (const [key, value] of Object.entries(record)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        objectFields.add(key);
      }
    }
  }

  // For each object field, list its sub-fields
  for (const objField of objectFields) {
    for (const record of sampleRecords) {
      const obj = record[objField];
      if (obj && typeof obj === 'object') {
        for (const subKey of Object.keys(obj)) {
          const fullPath = `${objField}.${subKey}`;
          if (!nestedFields.includes(fullPath)) {
            nestedFields.push(fullPath);
          }
        }
      }
    }
  }

  return nestedFields;
}

/**
 * Count records that have a valid value for a field
 * Uses same logic as detectField for consistency
 */
function countWithField(records: any[], fieldPath: string | null): number {
  if (!fieldPath) return 0;

  return records.filter(record => {
    const value = getFieldValue(record, fieldPath);
    return isRealValue(value);
  }).length;
}

/**
 * Get all unique field names from records (including nested)
 */
function getAllFields(records: any[], prefix = ''): string[] {
  const fields = new Set<string>();

  for (const record of records) {
    if (!record || typeof record !== 'object') continue;

    for (const [key, value] of Object.entries(record)) {
      const fieldPath = prefix ? `${prefix}.${key}` : key;
      fields.add(fieldPath);

      // Check one level of nesting
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const nestedKey of Object.keys(value)) {
          fields.add(`${fieldPath}.${nestedKey}`);
        }
      }
    }
  }

  return Array.from(fields).sort();
}

/**
 * Detect if this is company data, people data, or mixed
 */
function detectDataType(fieldMapping: FieldMapping, records: any[]): 'companies' | 'people' | 'mixed' | 'unknown' {
  const hasPersonFields = !!(fieldMapping.firstName || fieldMapping.lastName);
  const hasCompanyFields = !!(fieldMapping.company || fieldMapping.domain);

  // Check for typical company-only fields
  const companyOnlyFields = ['services', 'specialties', 'employees', 'founded', 'headquarters'];
  const hasCompanyOnlyFields = records.some(r =>
    companyOnlyFields.some(f => r[f] !== undefined)
  );

  if (hasPersonFields && hasCompanyFields) return 'mixed';
  if (hasPersonFields) return 'people';
  if (hasCompanyFields || hasCompanyOnlyFields) return 'companies';

  return 'unknown';
}

/**
 * Validate and analyze an Apify dataset URL
 */
export async function analyzeDataset(url: string): Promise<DatasetAnalysis> {
  const emptyResult: DatasetAnalysis = {
    isValid: false,
    error: '',
    totalRecords: 0,
    sampleRecords: [],
    detectedFields: [],
    fieldMapping: { email: null, name: null, firstName: null, lastName: null, company: null, domain: null, title: null, linkedin: null },
    coverage: { withEmail: 0, withName: 0, withCompany: 0, withDomain: 0, withTitle: 0, withLinkedin: 0 },
    percentages: { email: 0, name: 0, company: 0, domain: 0 },
    dataType: 'unknown',
    nestedObjects: [],
    enrichmentEstimate: { recordsNeedingEnrichment: 0, creditsRequired: 0, percentOfMonthlyBudget: 0, estimatedCost: 0 },
  };

  // Basic URL validation
  if (!url || url.trim() === '') {
    return { ...emptyResult, error: 'No URL provided' };
  }

  // Check URL format
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { ...emptyResult, error: 'Invalid URL format - must start with http:// or https://' };
  }

  try {
    // Fetch the dataset
    const response = await fetch(url);

    if (!response.ok) {
      return {
        ...emptyResult,
        error: `HTTP ${response.status} - ${response.status === 404 ? 'Dataset not found (may have expired)' : 'Failed to fetch'}`,
      };
    }

    const data = await response.json();

    // Normalize to array
    let records: any[] = [];
    if (Array.isArray(data)) {
      records = data;
    } else if (data.items && Array.isArray(data.items)) {
      records = data.items;
    } else if (data.data && Array.isArray(data.data)) {
      records = data.data;
    } else if (data.results && Array.isArray(data.results)) {
      records = data.results;
    } else if (typeof data === 'object') {
      records = [data];
    }

    if (records.length === 0) {
      return { ...emptyResult, isValid: true, error: 'Dataset is empty (0 records)' };
    }

    // Get sample for analysis (first 100 records max)
    const sampleRecords = records.slice(0, 100);

    // Detect all fields
    const detectedFields = getAllFields(sampleRecords);

    // Auto-detect field mappings
    const fieldMapping: FieldMapping = {
      email: detectField(sampleRecords, FIELD_PATTERNS.email),
      name: detectField(sampleRecords, FIELD_PATTERNS.name),
      firstName: detectField(sampleRecords, FIELD_PATTERNS.firstName),
      lastName: detectField(sampleRecords, FIELD_PATTERNS.lastName),
      company: detectField(sampleRecords, FIELD_PATTERNS.company),
      domain: detectField(sampleRecords, FIELD_PATTERNS.domain),
      title: detectField(sampleRecords, FIELD_PATTERNS.title),
      linkedin: detectField(sampleRecords, FIELD_PATTERNS.linkedin),
    };

    // Calculate coverage (on full dataset)
    const coverage = {
      withEmail: countWithField(records, fieldMapping.email),
      withName: countWithField(records, fieldMapping.name) ||
                countWithField(records, fieldMapping.firstName), // Count firstName if no full name
      withCompany: countWithField(records, fieldMapping.company),
      withDomain: countWithField(records, fieldMapping.domain),
      withTitle: countWithField(records, fieldMapping.title),
      withLinkedin: countWithField(records, fieldMapping.linkedin),
    };

    const total = records.length;
    const percentages = {
      email: total > 0 ? Math.round((coverage.withEmail / total) * 100) : 0,
      name: total > 0 ? Math.round((coverage.withName / total) * 100) : 0,
      company: total > 0 ? Math.round((coverage.withCompany / total) * 100) : 0,
      domain: total > 0 ? Math.round((coverage.withDomain / total) * 100) : 0,
    };

    // Detect data type
    const dataType = detectDataType(fieldMapping, sampleRecords);

    // Detect nested objects like hiring_contact
    const nestedObjects = detectNestedObjects(sampleRecords);

    // Calculate enrichment cost estimate
    // Apollo: $59/mo = 2,500 credits, 1 credit = 1 verified email
    const MONTHLY_CREDITS = 2500;
    const COST_PER_CREDIT = 0.024; // $59 / 2500
    const recordsNeedingEnrichment = total - coverage.withEmail;
    const creditsRequired = recordsNeedingEnrichment; // 1 credit per email
    const percentOfMonthlyBudget = MONTHLY_CREDITS > 0 ? Math.round((creditsRequired / MONTHLY_CREDITS) * 100) : 0;
    const estimatedCost = Math.round(creditsRequired * COST_PER_CREDIT * 100) / 100; // Round to 2 decimals

    const enrichmentEstimate = {
      recordsNeedingEnrichment,
      creditsRequired,
      percentOfMonthlyBudget,
      estimatedCost,
    };

    return {
      isValid: true,
      totalRecords: records.length,
      sampleRecords: sampleRecords.slice(0, 50), // Return 50 for pressure detection
      detectedFields,
      fieldMapping,
      coverage,
      percentages,
      dataType,
      nestedObjects,
      enrichmentEstimate,
    };

  } catch (error: any) {
    return { ...emptyResult, error: error.message || 'Failed to analyze dataset' };
  }
}
