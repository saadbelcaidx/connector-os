/**
 * ADAPTER LAYER
 *
 * Settings → RawInput[]
 *
 * All sources funnel into ONE ingestion path.
 * Settings provides data. Pipeline provides meaning.
 */

import type { RawInput } from './contract';

// =============================================================================
// NORMALIZE ANY JSON TO RAW INPUT
// =============================================================================

/**
 * Extract common fields from any JSON shape.
 * Does NOT infer readiness. Does NOT skip steps.
 */
function extractFields(raw: Record<string, unknown>): Partial<RawInput> {
  const fields: Partial<RawInput> = {};

  // Name extraction (try multiple field names)
  const nameFields = ['name', 'full_name', 'fullName', 'person_name', 'contact_name'];
  for (const f of nameFields) {
    if (raw[f] && typeof raw[f] === 'string') {
      fields.name = raw[f] as string;
      break;
    }
  }

  // Company extraction
  const companyFields = ['company', 'companyName', 'company_name', 'organization', 'employer'];
  for (const f of companyFields) {
    if (raw[f] && typeof raw[f] === 'string') {
      fields.companyName = raw[f] as string;
      break;
    }
  }

  // Domain extraction
  const domainFields = ['domain', 'website', 'url', 'company_url', 'companyUrl'];
  for (const f of domainFields) {
    if (raw[f] && typeof raw[f] === 'string') {
      let domain = raw[f] as string;
      domain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      if (domain) {
        fields.domain = domain;
        break;
      }
    }
  }

  // Email extraction
  const emailFields = ['email', 'emailAddress', 'email_address', 'contact_email', 'work_email'];
  for (const f of emailFields) {
    if (raw[f] && typeof raw[f] === 'string' && (raw[f] as string).includes('@')) {
      fields.email = raw[f] as string;
      break;
    }
  }

  // Title extraction
  const titleFields = ['title', 'jobTitle', 'job_title', 'position', 'role'];
  for (const f of titleFields) {
    if (raw[f] && typeof raw[f] === 'string') {
      fields.title = raw[f] as string;
      break;
    }
  }

  // LinkedIn extraction
  const linkedinFields = ['linkedin', 'linkedinUrl', 'linkedin_url', 'linkedIn'];
  for (const f of linkedinFields) {
    if (raw[f] && typeof raw[f] === 'string' && (raw[f] as string).includes('linkedin')) {
      fields.linkedin = raw[f] as string;
      break;
    }
  }

  // Signal extraction (job postings, funding, etc.)
  const signals: string[] = [];
  const signalFields = ['signal', 'signals', 'job_title', 'jobTitle', 'funding', 'trigger'];
  for (const f of signalFields) {
    const val = raw[f];
    if (typeof val === 'string') {
      signals.push(val);
    } else if (Array.isArray(val)) {
      signals.push(...val.filter((v): v is string => typeof v === 'string'));
    }
  }
  if (signals.length > 0) {
    fields.signals = signals;
  }

  return fields;
}

// =============================================================================
// NORMALIZE APIFY DATASET
// =============================================================================

export function normalizeApifyDataset(
  data: unknown[],
  side: 'demand' | 'supply'
): RawInput[] {
  if (!Array.isArray(data)) return [];

  return data.map((item, index) => {
    const raw = typeof item === 'object' && item !== null ? item as Record<string, unknown> : {};
    const extracted = extractFields(raw);

    return {
      id: `${side}-${index}-${Date.now()}`,
      source: 'apify' as const,
      side,
      raw,
      ...extracted,
    };
  });
}

// =============================================================================
// NORMALIZE API RESPONSE
// =============================================================================

export function normalizeApiResponse(
  data: unknown[],
  side: 'demand' | 'supply'
): RawInput[] {
  if (!Array.isArray(data)) return [];

  return data.map((item, index) => {
    const raw = typeof item === 'object' && item !== null ? item as Record<string, unknown> : {};
    const extracted = extractFields(raw);

    return {
      id: `${side}-api-${index}-${Date.now()}`,
      source: 'api' as const,
      side,
      raw,
      ...extracted,
    };
  });
}

// =============================================================================
// NORMALIZE UPLOAD (CSV/JSON)
// =============================================================================

export function normalizeUpload(
  data: unknown[],
  side: 'demand' | 'supply'
): RawInput[] {
  if (!Array.isArray(data)) return [];

  return data.map((item, index) => {
    const raw = typeof item === 'object' && item !== null ? item as Record<string, unknown> : {};
    const extracted = extractFields(raw);

    return {
      id: `${side}-upload-${index}-${Date.now()}`,
      source: 'upload' as const,
      side,
      raw,
      ...extracted,
    };
  });
}

// =============================================================================
// UNIFIED NORMALIZER
// =============================================================================

export function normalizeInput(
  data: unknown[],
  source: 'apify' | 'api' | 'upload',
  side: 'demand' | 'supply'
): RawInput[] {
  switch (source) {
    case 'apify':
      return normalizeApifyDataset(data, side);
    case 'api':
      return normalizeApiResponse(data, side);
    case 'upload':
      return normalizeUpload(data, side);
    default:
      return [];
  }
}
