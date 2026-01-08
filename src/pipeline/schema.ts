/**
 * SCHEMA DISCOVERY — NO HARDCODED FIELD LISTS
 *
 * Walks any JSON structure, discovers paths, scores them by signals.
 * Produces candidate mappings without persisting.
 */

import type { SchemaProfile, CandidatePath, MappingSpec, Evidence, BlockReason, CanonicalEntity } from './types';

// =============================================================================
// PATH WALKING
// =============================================================================

interface PathEntry {
  path: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null';
  values: unknown[];
}

/**
 * Walk object keys recursively up to maxDepth.
 * Returns flat list of JSONPaths with sample values.
 */
function walkPaths(
  obj: unknown,
  prefix: string = '$',
  depth: number = 0,
  maxDepth: number = 4,
  paths: Map<string, PathEntry> = new Map()
): Map<string, PathEntry> {
  if (depth > maxDepth) return paths;

  if (obj === null || obj === undefined) {
    return paths;
  }

  if (Array.isArray(obj)) {
    // Sample first few items
    const sample = obj.slice(0, 3);
    for (const item of sample) {
      walkPaths(item, prefix, depth + 1, maxDepth, paths);
    }
    return paths;
  }

  if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      const path = `${prefix}.${key}`;
      const type = getType(value);

      if (!paths.has(path)) {
        paths.set(path, { path, type, values: [] });
      }

      const entry = paths.get(path)!;
      if (entry.values.length < 5 && value !== null && value !== undefined) {
        entry.values.push(value);
      }

      // Recurse into nested objects
      if (typeof value === 'object' && value !== null) {
        walkPaths(value, path, depth + 1, maxDepth, paths);
      }
    }
  }

  return paths;
}

function getType(value: unknown): PathEntry['type'] {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value as PathEntry['type'];
}

// =============================================================================
// DERIVE SCHEMA
// =============================================================================

/**
 * Derive schema from sample items.
 * No hardcoded field lists — purely structural analysis.
 */
export function deriveSchema(
  items: unknown[],
  maxDepth: number = 4,
  maxPaths: number = 500
): SchemaProfile {
  console.log('[Schema] Deriving schema from', items.length, 'items');

  const allPaths = new Map<string, PathEntry>();
  const sampleSize = Math.min(items.length, 20);

  // Walk sample items
  for (let i = 0; i < sampleSize; i++) {
    walkPaths(items[i], '$', 0, maxDepth, allPaths);
  }

  console.log('[Schema] Found', allPaths.size, 'unique paths');

  // Convert to CandidatePath with scoring
  const candidates: CandidatePath[] = [];

  for (const [path, entry] of allPaths) {
    if (candidates.length >= maxPaths) break;

    const sampleValues = entry.values
      .filter((v): v is string => typeof v === 'string')
      .slice(0, 5);

    // Count frequency (how many items have this path with non-null value)
    const frequency = entry.values.length / sampleSize;

    candidates.push({
      path,
      type: entry.type,
      sampleValues,
      frequency,
      score: 0, // Will be scored per field type
    });
  }

  // Score and categorize paths
  const profile: SchemaProfile = {
    totalItems: items.length,
    sampledItems: sampleSize,
    candidatePaths: {
      emails: scorePaths(candidates, scoreEmailPath),
      websites: scorePaths(candidates, scoreWebsitePath),
      domains: scorePaths(candidates, scoreDomainPath),
      companyNames: scorePaths(candidates, scoreCompanyNamePath),
      personNames: scorePaths(candidates, scorePersonNamePath),
      titles: scorePaths(candidates, scoreTitlePath),
      linkedinUrls: scorePaths(candidates, scoreLinkedinPath),
      phones: scorePaths(candidates, scorePhonePath),
    },
    allPaths: candidates,
  };

  return profile;
}

// =============================================================================
// PATH SCORING (SIGNAL-BASED, NO FIELD LISTS)
// =============================================================================

type PathScorer = (path: string, values: string[]) => number;

function scorePaths(candidates: CandidatePath[], scorer: PathScorer): CandidatePath[] {
  return candidates
    .map(c => ({
      ...c,
      score: scorer(c.path, c.sampleValues) * c.frequency,
    }))
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

// Email: Contains @ in values
function scoreEmailPath(path: string, values: string[]): number {
  let score = 0;

  // Value signals (strongest)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emailMatches = values.filter(v => emailRegex.test(v)).length;
  score += emailMatches * 40;

  // At-sign presence
  const atMatches = values.filter(v => v.includes('@')).length;
  score += atMatches * 20;

  // Path name signals
  const pathLower = path.toLowerCase();
  if (pathLower.includes('email')) score += 30;
  if (pathLower.includes('mail')) score += 15;
  if (pathLower.includes('contact')) score += 10;

  return Math.min(score, 100);
}

// Website: Starts with http or contains www
function scoreWebsitePath(path: string, values: string[]): number {
  let score = 0;

  // Value signals
  const urlMatches = values.filter(v =>
    v.startsWith('http://') || v.startsWith('https://') || v.includes('www.')
  ).length;
  score += urlMatches * 40;

  // Path name signals
  const pathLower = path.toLowerCase();
  if (pathLower.includes('website')) score += 30;
  if (pathLower.includes('url')) score += 25;
  if (pathLower.includes('homepage')) score += 20;
  if (pathLower.includes('link')) score += 10;

  // Negative: linkedin/social paths
  if (pathLower.includes('linkedin')) score -= 50;
  if (pathLower.includes('twitter')) score -= 50;
  if (pathLower.includes('facebook')) score -= 50;

  return Math.max(0, Math.min(score, 100));
}

// Domain: Host-like tokens with TLD
function scoreDomainPath(path: string, values: string[]): number {
  let score = 0;

  // Value signals: looks like domain (word.tld pattern)
  const domainRegex = /^[a-z0-9][a-z0-9-]*\.[a-z]{2,}$/i;
  const domainMatches = values.filter(v => domainRegex.test(v)).length;
  score += domainMatches * 50;

  // Value signals: can extract domain from URL
  const urlDomainMatches = values.filter(v => {
    try {
      if (v.startsWith('http')) {
        new URL(v);
        return true;
      }
    } catch {}
    return false;
  }).length;
  score += urlDomainMatches * 30;

  // Path name signals
  const pathLower = path.toLowerCase();
  if (pathLower.includes('domain')) score += 40;
  if (pathLower.includes('company_domain')) score += 50;
  if (pathLower.includes('website')) score += 20;
  if (pathLower.includes('host')) score += 15;

  // Negative: social media URLs are NOT company domains
  if (pathLower.includes('linkedin')) score -= 50;
  if (pathLower.includes('twitter')) score -= 50;
  if (pathLower.includes('facebook')) score -= 50;

  // Negative: values containing social media domains
  const socialMediaHits = values.filter(v =>
    v.includes('linkedin.com') ||
    v.includes('twitter.com') ||
    v.includes('facebook.com') ||
    v.includes('instagram.com')
  ).length;
  score -= socialMediaHits * 40;

  return Math.max(0, Math.min(score, 100));
}

// Company name: Org suffixes or "company" in path
function scoreCompanyNamePath(path: string, values: string[]): number {
  let score = 0;

  // Value signals: org suffixes
  const orgSuffixes = /\b(inc|llc|ltd|corp|co|company|group|holdings|partners|gmbh|sa|ag)\b/i;
  const orgMatches = values.filter(v => orgSuffixes.test(v)).length;
  score += orgMatches * 30;

  // Value signals: capitalized multi-word (likely company)
  const capitalizedMatches = values.filter(v =>
    v.length > 3 && /^[A-Z]/.test(v) && v.split(/\s+/).length <= 6
  ).length;
  score += capitalizedMatches * 15;

  // Path name signals
  const pathLower = path.toLowerCase();
  if (pathLower.includes('company_name')) score += 50;
  if (pathLower.includes('companyname')) score += 50;
  if (pathLower.includes('company')) score += 30;
  if (pathLower.includes('employer')) score += 30;
  if (pathLower.includes('organization')) score += 30;
  if (pathLower.includes('org_name')) score += 30;
  if (pathLower.includes('business')) score += 20;
  if (pathLower.includes('firm')) score += 20;

  // Negative: person paths
  if (pathLower.includes('person')) score -= 20;
  if (pathLower.includes('full_name') && !pathLower.includes('company')) score -= 30;

  return Math.max(0, Math.min(score, 100));
}

// Person name: First/last/full name patterns
function scorePersonNamePath(path: string, values: string[]): number {
  let score = 0;

  // Value signals: 2-4 word capitalized names
  const nameMatches = values.filter(v => {
    const words = v.trim().split(/\s+/);
    return words.length >= 1 && words.length <= 4 &&
      words.every(w => /^[A-Z][a-z]+$/.test(w));
  }).length;
  score += nameMatches * 25;

  // Path name signals
  const pathLower = path.toLowerCase();
  if (pathLower.includes('full_name')) score += 50;
  if (pathLower.includes('fullname')) score += 50;
  if (pathLower.includes('person_name')) score += 45;
  if (pathLower.includes('first_name')) score += 40;
  if (pathLower.includes('last_name')) score += 40;
  if (pathLower.includes('firstname')) score += 40;
  if (pathLower.includes('lastname')) score += 40;
  if (pathLower.endsWith('.name')) score += 25;
  if (pathLower.includes('contact_name')) score += 35;

  // Negative: company paths
  if (pathLower.includes('company')) score -= 30;

  return Math.max(0, Math.min(score, 100));
}

// Title: Job title patterns
function scoreTitlePath(path: string, values: string[]): number {
  let score = 0;

  // Value signals: job title keywords
  const titleKeywords = /\b(ceo|cto|cfo|vp|director|manager|lead|head|chief|founder|partner|engineer|developer|analyst|consultant|specialist)\b/i;
  const titleMatches = values.filter(v => titleKeywords.test(v)).length;
  score += titleMatches * 35;

  // Path name signals
  const pathLower = path.toLowerCase();
  if (pathLower.includes('job_title')) score += 50;
  if (pathLower.includes('jobtitle')) score += 50;
  if (pathLower.includes('title') && !pathLower.includes('subtitle')) score += 30;
  if (pathLower.includes('position')) score += 40;
  if (pathLower.includes('role')) score += 30;
  if (pathLower.includes('headline')) score += 25;
  if (pathLower.includes('occupation')) score += 35;

  return Math.min(score, 100);
}

// LinkedIn: Contains linkedin.com
function scoreLinkedinPath(path: string, values: string[]): number {
  let score = 0;

  // Value signals: linkedin URLs
  const linkedinMatches = values.filter(v =>
    v.includes('linkedin.com')
  ).length;
  score += linkedinMatches * 50;

  // Path name signals
  const pathLower = path.toLowerCase();
  if (pathLower.includes('linkedin')) score += 40;
  if (pathLower.includes('li_url')) score += 30;

  return Math.min(score, 100);
}

// Phone: Phone number patterns
function scorePhonePath(path: string, values: string[]): number {
  let score = 0;

  // Value signals: phone patterns
  const phoneRegex = /^[\d\s\-\+\(\)\.]{7,20}$/;
  const phoneMatches = values.filter(v => phoneRegex.test(v.replace(/\s/g, ''))).length;
  score += phoneMatches * 40;

  // Path name signals
  const pathLower = path.toLowerCase();
  if (pathLower.includes('phone')) score += 40;
  if (pathLower.includes('mobile')) score += 35;
  if (pathLower.includes('tel')) score += 30;
  if (pathLower.includes('cell')) score += 30;
  if (pathLower.includes('number') && !pathLower.includes('employee')) score += 15;

  return Math.min(score, 100);
}

// =============================================================================
// AUTO-MAPPING (DRAFT ONLY)
// =============================================================================

/**
 * Generate draft mapping spec from schema profile.
 * Does NOT persist. Returns draft for preview/approval.
 */
export function generateDraftMapping(
  profile: SchemaProfile,
  sourceId: string,
  datasetType: string
): MappingSpec {
  const pickTop = (paths: CandidatePath[]): string[] =>
    paths.slice(0, 3).map(p => p.path);

  const avgConfidence = (paths: CandidatePath[]): number => {
    if (paths.length === 0) return 0;
    return paths.slice(0, 3).reduce((sum, p) => sum + p.score, 0) / Math.min(paths.length, 3) / 100;
  };

  const mappings: MappingSpec['mappings'] = {};

  if (profile.candidatePaths.domains.length > 0) {
    mappings['company.domain'] = pickTop(profile.candidatePaths.domains);
  }
  if (profile.candidatePaths.websites.length > 0) {
    mappings['company.website'] = pickTop(profile.candidatePaths.websites);
  }
  if (profile.candidatePaths.companyNames.length > 0) {
    mappings['company.name'] = pickTop(profile.candidatePaths.companyNames);
  }
  if (profile.candidatePaths.linkedinUrls.length > 0) {
    mappings['company.linkedinCompanyUrl'] = pickTop(profile.candidatePaths.linkedinUrls);
  }
  if (profile.candidatePaths.personNames.length > 0) {
    mappings['person.fullName'] = pickTop(profile.candidatePaths.personNames);
  }
  if (profile.candidatePaths.titles.length > 0) {
    mappings['person.title'] = pickTop(profile.candidatePaths.titles);
  }
  if (profile.candidatePaths.emails.length > 0) {
    mappings['contacts.emails'] = pickTop(profile.candidatePaths.emails);
  }
  if (profile.candidatePaths.phones.length > 0) {
    mappings['contacts.phones'] = pickTop(profile.candidatePaths.phones);
  }

  // Calculate overall confidence
  const allConfidences = [
    avgConfidence(profile.candidatePaths.domains),
    avgConfidence(profile.candidatePaths.emails),
    avgConfidence(profile.candidatePaths.companyNames),
    avgConfidence(profile.candidatePaths.personNames),
  ].filter(c => c > 0);

  const overallConfidence = allConfidences.length > 0
    ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length
    : 0;

  return {
    id: `draft-${sourceId}-${datasetType}-${Date.now()}`,
    sourceId,
    datasetType,
    version: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDraft: true,
    mappings,
    transforms: {
      normalizeDomainFromWebsite: true,
      splitFullName: true,
      dedupeEmails: true,
      extractDomainFromEmail: false, // FORBIDDEN: domain must come from explicit URL/website
    },
    confidence: overallConfidence,
  };
}

// =============================================================================
// APPLY MAPPING
// =============================================================================

/**
 * Extract value from item using JSONPath.
 * Simple implementation for paths like $.company.name or $.company_domain
 */
function getValueByPath(item: unknown, path: string): unknown {
  if (!path.startsWith('$')) return undefined;

  const parts = path.slice(2).split('.'); // Remove '$.' and split
  let current: unknown = item;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Apply mapping spec to extract values from item.
 * Returns extracted values with evidence.
 */
export function applyMapping(
  item: unknown,
  spec: MappingSpec
): { values: Record<string, string | string[]>; evidence: Evidence[] } {
  const values: Record<string, string | string[]> = {};
  const evidence: Evidence[] = [];

  for (const [field, paths] of Object.entries(spec.mappings)) {
    if (!paths || paths.length === 0) continue;

    for (const path of paths) {
      const value = getValueByPath(item, path);

      if (value !== null && value !== undefined && value !== '') {
        const stringValue = String(value);

        // Store value
        if (field.startsWith('contacts.')) {
          // Contacts are arrays - but VALIDATE before adding
          if (field === 'contacts.emails') {
            // ONLY add if it looks like an email (contains @ and has valid format)
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (emailRegex.test(stringValue.trim())) {
              if (!values[field]) values[field] = [];
              (values[field] as string[]).push(stringValue.trim());
            } else {
              // NOT a valid email - skip silently (don't pollute with descriptions)
              console.log(`[Schema] Skipped invalid email value: "${stringValue.slice(0, 50)}..."`);
            }
          } else {
            // Other contacts (phones, etc.)
            if (!values[field]) values[field] = [];
            (values[field] as string[]).push(stringValue);
          }
        } else {
          values[field] = stringValue;
        }

        // Record evidence
        evidence.push({
          field,
          value: stringValue,
          sourcePath: path,
          extractor: spec.isDraft ? 'AutoMapping@1.0.0' : 'MappingSpec@1.0.0',
          confidence: spec.confidence,
        });

        // Use first valid value for non-array fields
        if (!field.startsWith('contacts.')) break;
      }
    }
  }

  return { values, evidence };
}

// =============================================================================
// BLOCK REASONS
// =============================================================================

/**
 * Check schema profile and generate block reasons if critical paths are missing.
 */
export function checkSchemaForBlocks(profile: SchemaProfile): BlockReason[] {
  const blocks: BlockReason[] = [];

  // No domain paths found
  if (profile.candidatePaths.domains.length === 0 &&
      profile.candidatePaths.websites.length === 0) {
    blocks.push({
      stage: 'Map',
      code: 'NO_DOMAIN_FOUND',
      message: 'No domain or website paths detected in schema',
      details: {
        topPaths: profile.allPaths.slice(0, 10).map(p => p.path),
        sampledItems: profile.sampledItems,
      },
    });
  }

  return blocks;
}

// =============================================================================
// DEBUG / LOGGING
// =============================================================================

/**
 * Print schema profile to console for debugging.
 */
export function logSchemaProfile(profile: SchemaProfile, label: string = 'Schema'): void {
  console.group(`[${label}] SchemaProfile (${profile.sampledItems}/${profile.totalItems} items)`);

  const logPaths = (name: string, paths: CandidatePath[]) => {
    if (paths.length === 0) {
      console.log(`  ${name}: (none)`);
    } else {
      console.log(`  ${name}:`);
      paths.slice(0, 5).forEach((p, i) => {
        console.log(`    ${i + 1}. ${p.path} (score: ${p.score.toFixed(1)}, samples: ${p.sampleValues.slice(0, 2).join(', ')})`);
      });
    }
  };

  logPaths('Domains', profile.candidatePaths.domains);
  logPaths('Websites', profile.candidatePaths.websites);
  logPaths('Emails', profile.candidatePaths.emails);
  logPaths('Company Names', profile.candidatePaths.companyNames);
  logPaths('Person Names', profile.candidatePaths.personNames);
  logPaths('Titles', profile.candidatePaths.titles);
  logPaths('LinkedIn', profile.candidatePaths.linkedinUrls);

  console.groupEnd();
}

// =============================================================================
// ITEMS TO CANONICAL ENTITIES
// =============================================================================

/**
 * Convert raw items to CanonicalEntity[] using mapping spec.
 * Returns entities + block reasons for items that couldn't be converted.
 */
export function itemsToEntities(
  items: unknown[],
  spec: MappingSpec,
  entityType: 'demand' | 'supply',
  sourceProvider: 'apify' | 'api' | 'upload' = 'apify'
): { entities: CanonicalEntity[]; blocked: BlockReason[] } {
  const entities: CanonicalEntity[] = [];
  const blocked: BlockReason[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { values, evidence } = applyMapping(item, spec);

    // =================================================================
    // DOMAIN EXTRACTION — LEGACY PARITY (CANONICAL CONTRACT)
    // 1. Company URL / website (EXACT legacy field list, in order)
    // 2. Explicit domain field
    // 3. Email domain (only if company email, NOT public)
    // 4. Slugified company name (LAST RESORT - MUST NOT override valid URL)
    // =================================================================

    // Filter functions
    const isSocialMediaDomain = (d: string | undefined): boolean => {
      if (!d) return false;
      const lower = d.toLowerCase();
      return lower.includes('linkedin.com') ||
             lower.includes('twitter.com') ||
             lower.includes('facebook.com') ||
             lower.includes('instagram.com') ||
             lower.includes('youtube.com');
    };

    const isPublicEmailProvider = (d: string | undefined): boolean => {
      if (!d) return false;
      const lower = d.toLowerCase();
      return lower === 'gmail.com' ||
             lower === 'yahoo.com' ||
             lower === 'hotmail.com' ||
             lower === 'outlook.com' ||
             lower === 'aol.com' ||
             lower === 'icloud.com' ||
             lower === 'proton.me' ||
             lower === 'protonmail.com' ||
             lower === 'live.com' ||
             lower === 'msn.com';
    };

    const isInvalidDomain = (d: string | undefined): boolean => {
      return isSocialMediaDomain(d) || isPublicEmailProvider(d);
    };

    // Normalize URL to domain (legacy parity)
    const urlToDomain = (url: string | undefined): string | undefined => {
      if (!url) return undefined;
      try {
        let d = url.trim();
        // Handle full URLs
        if (d.startsWith('http://') || d.startsWith('https://')) {
          const u = new URL(d);
          d = u.hostname;
        }
        // Strip www
        d = d.replace(/^www\./i, '');
        // Remove path/query if still present
        d = d.split('/')[0].split('?')[0].split('#')[0].split(':')[0];
        return d || undefined;
      } catch {
        // Fallback: string manipulation
        return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] || undefined;
      }
    };

    // LEGACY FIELD LIST — EXACT ORDER FROM SignalsClient.ts extractJobLikeFields
    // These are the paths legacy tries, in order
    const legacyUrlPaths = [
      '$.company.url',
      '$.company.website',
      '$.companyUrl',
      '$.company_url',
      '$.company_website',
      '$.companyWebsite',
      '$.employer_website',
      '$.employerWebsite',
      '$.website',
      '$.url',
      '$.hiringOrganization.url',
      // Also check raw.* prefix (nested structure)
      '$.raw.company.url',
      '$.raw.company.website',
      '$.raw.companyUrl',
      '$.raw.company_url',
      '$.raw.company_website',
      '$.raw.companyWebsite',
      '$.raw.employer_website',
      '$.raw.employerWebsite',
      '$.raw.website',
      '$.raw.url',
    ];

    // Explicit domain field paths
    const legacyDomainPaths = [
      '$.company_domain',
      '$.companyDomain',
      '$.domain',
      '$.host',
      '$.raw.company_domain',
      '$.raw.companyDomain',
      '$.raw.domain',
    ];

    let domain: string | undefined = undefined;

    // STEP 1: Try all URL paths (explicit website/URL fields only)
    for (const path of legacyUrlPaths) {
      if (domain) break;
      const rawValue = getValueByPath(item, path);
      if (rawValue && typeof rawValue === 'string' && rawValue.trim()) {
        const normalized = urlToDomain(rawValue);
        if (normalized && !isInvalidDomain(normalized)) {
          domain = normalized;
          break;
        }
      }
    }

    // STEP 2: Try explicit domain fields
    if (!domain) {
      for (const path of legacyDomainPaths) {
        if (domain) break;
        const rawValue = getValueByPath(item, path);
        if (rawValue && typeof rawValue === 'string' && rawValue.trim()) {
          const normalized = urlToDomain(rawValue);
          if (normalized && !isInvalidDomain(normalized)) {
            domain = normalized;
            break;
          }
        }
      }
    }

    // CANONICAL GATE (APPLIES TO BOTH SUPPLY AND DEMAND):
    // Must have DOMAIN or COMPANY NAME
    // If neither → PREMIUM BLOCK

    const website = values['company.website'] as string | undefined;
    const companyName = values['company.name'] as string | undefined;
    const emails = (values['contacts.emails'] as string[] | undefined) || [];

    // GATE: Reject if BOTH name AND domain are missing
    if (!domain && !companyName) {
      blocked.push({
        stage: 'Ingest',
        code: 'NO_COMPANY_NAME_OR_DOMAIN',
        message: 'You need a company name or domain to proceed.',
        details: {
          index: i,
          entityType,
          side: entityType.toUpperCase(),
        },
      });
      continue;
    }

    // ENRICHMENT FLAG:
    // - Has DOMAIN → no enrichment needed
    // - No DOMAIN but has COMPANY NAME → needs enrichment to find domain
    const needsEnrichment = !domain && !!companyName;

    // Calculate confidence
    const hasDomain = !!domain;
    const hasEmail = emails.length > 0;
    const hasName = !!(values['company.name'] || values['person.fullName']);

    const domainConfidence = hasDomain ? 0.9 : 0;
    const emailConfidence = hasEmail ? 0.8 : 0;
    const personConfidence = hasName ? 0.7 : 0;
    const overallConfidence = Math.max(domainConfidence, emailConfidence, personConfidence) * spec.confidence;

    // Generate entity ID
    const entityId = generateEntityId(
      sourceProvider,
      spec.datasetType,
      domain || (values['company.name'] as string) || `item-${i}`
    );

    // Create entity
    const entity: CanonicalEntity = {
      entityId,
      entityType,
      company: {
        name: values['company.name'] as string | undefined,
        domain,
        website,
        linkedinCompanyUrl: values['company.linkedinCompanyUrl'] as string | undefined,
      },
      person: {
        fullName: values['person.fullName'] as string | undefined,
        firstName: values['person.firstName'] as string | undefined,
        lastName: values['person.lastName'] as string | undefined,
        title: values['person.title'] as string | undefined,
        linkedinUrl: values['person.linkedinUrl'] as string | undefined,
      },
      contacts: {
        emails: spec.transforms.dedupeEmails ? [...new Set(emails)] : emails,
        phones: (values['contacts.phones'] as string[] | undefined) || [],
      },
      source: {
        provider: sourceProvider,
        datasetType: spec.datasetType,
        sourceId: spec.sourceId,
        rawIndex: i,
      },
      confidence: {
        domain: domainConfidence,
        email: emailConfidence,
        person: personConfidence,
        overall: overallConfidence,
      },
      evidence,
      raw: item,
      // ROUTING STATUS: true if NAME but no DOMAIN (needs enrichment to proceed)
      needsEnrichment,
    };

    entities.push(entity);
  }

  console.log('[Schema:itemsToEntities]', {
    input: items.length,
    entities: entities.length,
    blocked: blocked.length,
    entityType,
  });

  return { entities, blocked };
}

/**
 * Generate stable entity ID from source + key fields.
 */
function generateEntityId(
  provider: string,
  datasetType: string,
  key: string
): string {
  // Simple hash for now
  const input = `${provider}:${datasetType}:${key}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `${provider}-${Math.abs(hash).toString(36)}`;
}
