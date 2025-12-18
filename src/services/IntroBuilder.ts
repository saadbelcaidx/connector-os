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
 * Removes: LLC, Inc, Corp, Ltd, Co, Limited, Corporation, etc.
 */
export function cleanCompanyName(name: string): string {
  if (!name) return name;

  // Remove common business suffixes (case-insensitive)
  const suffixes = [
    /,?\s*(LLC|L\.L\.C\.|L\.L\.C)\.?$/i,
    /,?\s*(Inc|INC|Incorporated)\.?$/i,
    /,?\s*(Corp|Corporation|CORP)\.?$/i,
    /,?\s*(Ltd|LTD|Limited)\.?$/i,
    /,?\s*(Co|CO|Company)\.?$/i,
    /,?\s*(LP|L\.P\.|LLP|L\.L\.P\.)\.?$/i,
    /,?\s*(PLC|plc)\.?$/i,
    /,?\s*(GmbH|AG|S\.A\.|SA)\.?$/i,
    /,?\s*(Pty|PTY)\.?$/i,
    /,?\s*(PLLC|P\.L\.L\.C\.)\.?$/i,
  ];

  let cleaned = name.trim();
  for (const suffix of suffixes) {
    cleaned = cleaned.replace(suffix, '');
  }

  return cleaned.trim();
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
