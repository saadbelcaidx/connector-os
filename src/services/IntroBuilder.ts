/**
 * IntroBuilder.ts
 *
 * Builds intro context for AI-generated messages.
 *
 * NO hardcoded connectors. Supply companies are discovered dynamically.
 * This module only handles hire category extraction and provides type interfaces.
 */

import { HireCategory, extractHireCategory } from './CompanyRoleClassifier';
import type { SupplyCompany } from './SupplySignalsClient';

/**
 * Clean company name for professional appearance in intros
 *
 * Strategy:
 * - ABBREVIATE: "Limited Partners" → "LP", "Limited Partnership" → "LP"
 * - REMOVE: LLC, Corp, Corporation, Company, PLC, GmbH (noise)
 * - KEEP SHORT: If already short (LP, Inc, Ltd), keep as-is
 *
 * Examples:
 * - "MyoProcess Limited Partners" → "MyoProcess LP"
 * - "Acme Corporation LLC" → "Acme"
 * - "TechFlow Inc." → "TechFlow"
 * - "Global Solutions Limited" → "Global Solutions"
 */
export function cleanCompanyName(name: string): string {
  if (!name) return name;

  let cleaned = name.trim();

  // Remove HTML-like tags (e.g., <it>, <i>, <b>, etc.)
  cleaned = cleaned.replace(/<[^>]*>/g, '');

  // STEP 0: Convert ALL CAPS to Title Case
  // Check if >80% of letters are uppercase (ignoring suffixes like LP, LLC)
  const lettersOnly = cleaned.replace(/[^a-zA-Z]/g, '');
  const uppercaseCount = (lettersOnly.match(/[A-Z]/g) || []).length;
  const isAllCaps = lettersOnly.length > 3 && uppercaseCount / lettersOnly.length > 0.8;

  if (isAllCaps) {
    // Convert to Title Case, preserving common acronyms
    const acronyms = new Set(['LP', 'LLC', 'LLP', 'GP', 'INC', 'CORP', 'LTD', 'CO', 'USA', 'UK', 'NYC', 'LA', 'SF', 'AI', 'ML', 'IT', 'HR', 'VP', 'CEO', 'CFO', 'CTO', 'COO']);
    cleaned = cleaned
      .toLowerCase()
      .split(/(\s+)/)
      .map(word => {
        const upper = word.toUpperCase();
        if (acronyms.has(upper)) return upper;
        // Title case: capitalize first letter
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join('');
  }

  // Remove common garbage patterns from scraped data
  cleaned = cleaned.replace(/Pro\/source/gi, '');
  cleaned = cleaned.replace(/\s*\/\s*source/gi, '');

  // STEP 1: Abbreviate long forms FIRST (before removal)
  const abbreviations: [RegExp, string][] = [
    // "Limited Partners" or "Limited Partnership" → "LP"
    [/,?\s*Limited\s+Partner(s|ship)?\.?$/i, ' LP'],
    // "General Partners" or "General Partnership" → "GP"
    [/,?\s*General\s+Partner(s|ship)?\.?$/i, ' GP'],
    // "Professional Limited Liability Company" → remove (too long)
    [/,?\s*Professional\s+Limited\s+Liability\s+Company\.?$/i, ''],
    // "Limited Liability Partnership" → "LLP"
    [/,?\s*Limited\s+Liability\s+Partnership\.?$/i, ' LLP'],
    // "Limited Liability Company" → remove (same as LLC)
    [/,?\s*Limited\s+Liability\s+Company\.?$/i, ''],
  ];

  for (const [pattern, replacement] of abbreviations) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  // STEP 2: Remove noise suffixes completely
  const removeCompletely = [
    /,?\s*(LLC|L\.L\.C\.|L\.L\.C)\.?$/i,
    /,?\s*(Inc|INC|Incorporated)\.?$/i,
    /,?\s*(Corp|Corporation|CORP)\.?$/i,
    /,?\s*(Ltd|LTD|Limited)\.?$/i,
    /,?\s*(Co|CO|Company)\.?$/i,
    /,?\s*(PLC|plc)\.?$/i,
    /,?\s*(GmbH|AG|S\.A\.|SA|S\.A|BV|B\.V\.)\.?$/i,
    /,?\s*(Pty|PTY|Pty\s*Ltd)\.?$/i,
    /,?\s*(PLLC|P\.L\.L\.C\.)\.?$/i,
    /,?\s*(N\.V\.|NV)\.?$/i,
    /,?\s*(Holdings?)\.?$/i,
    /,?\s*(Group)\.?$/i,
    /,?\s*(International|Intl)\.?$/i,
  ];

  for (const suffix of removeCompletely) {
    cleaned = cleaned.replace(suffix, '');
  }

  // STEP 3: Keep LP, LLP, GP if they're meaningful (already abbreviated)
  // These were added in step 1, so they stay

  // Clean up multiple spaces and trim
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Remove trailing punctuation
  cleaned = cleaned.replace(/[,.\-_]+$/, '').trim();

  // If name became empty or too short after cleaning, return original
  if (cleaned.length < 2) {
    return name.trim();
  }

  return cleaned;
}

interface Signal {
  type: string;
  details?: string;
  jobTitles?: string[]; // Job titles being HIRED (from signal data)
}

export interface IntroResult {
  supply: SupplyCompany;
  hireCategory: HireCategory;
}

export interface BlockedResult {
  blocked: true;
  reason: string;
}

/**
 * Connector interface for backward compatibility with AIService
 * Maps to SupplyCompany fields
 */
export interface Connector {
  name: string;
  domain: string;
  specialty: string;
  type?: string;
}

/**
 * Convert a SupplyCompany to a Connector (for AIService compatibility)
 */
export function supplyToConnector(supply: SupplyCompany): Connector {
  return {
    name: supply.name,
    domain: supply.domain,
    specialty: supply.specialty || supply.description || 'provides talent solutions',
    type: 'supply',
  };
}

/**
 * Extract hire category from signal
 */
export function getHireCategoryFromSignal(signal: Signal): HireCategory {
  const jobTitles = signal.jobTitles || extractJobTitlesFromDetails(signal.details || '');

  // Build job postings array for the classifier
  const jobPostings = jobTitles.map(title => ({ title }));

  return extractHireCategory(jobPostings, signal.details);
}

/**
 * Extract job titles from signal details
 * Example: "5 Software Engineer roles, 2 DevOps positions" -> ["Software Engineer", "DevOps"]
 * Example: "hiring for sales roles" -> ["sales"]
 */
function extractJobTitlesFromDetails(details: string): string[] {
  const titles: string[] = [];

  // Common patterns for job titles in signal details
  const patterns = [
    /(\d+)\s+([A-Za-z\s]+?)\s+(?:roles?|positions?|openings?)/gi,  // "5 sales roles"
    /hiring\s+for\s+([A-Za-z\s]+?)\s+(?:roles?|positions?)/gi,     // "hiring for sales roles"
    /hiring\s+([A-Za-z\s]+?)(?:\s+at|\s*,|\s*$)/gi,                // "hiring engineers at..."
    /looking for\s+([A-Za-z\s]+?)(?:\s+to|\s*,|\s*$)/gi,           // "looking for developers"
    /([A-Za-z\s]+?)\s+(?:roles?|positions?|openings?)\s+open/gi,   // "sales roles open"
    /open\s+([A-Za-z\s]+?)\s+(?:roles?|positions?)/gi,             // "open sales roles"
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(details)) !== null) {
      const title = match[2] || match[1];
      if (title && title.trim() && title.trim().length > 1) {
        titles.push(title.trim());
      }
    }
  }

  // If no patterns matched, try to extract any recognizable job titles
  if (titles.length === 0) {
    const knownTitles = [
      // Engineering
      'software engineer', 'engineer', 'developer', 'frontend', 'backend', 'fullstack',
      'devops', 'sre', 'data scientist', 'ml engineer', 'architect', 'engineering',
      // Sales
      'sales', 'account executive', 'sales rep', 'sdr', 'bdr', 'account manager', 'ae',
      // Marketing
      'marketing', 'marketing manager', 'growth', 'content', 'seo',
      // Operations
      'operations', 'ops', 'revops', 'finance', 'hr'
    ];

    const detailsLower = details.toLowerCase();
    for (const title of knownTitles) {
      if (detailsLower.includes(title)) {
        titles.push(title);
        break; // Take first match to avoid duplicates
      }
    }
  }

  return titles;
}

// Re-export HireCategory for backward compatibility
export type { HireCategory };
