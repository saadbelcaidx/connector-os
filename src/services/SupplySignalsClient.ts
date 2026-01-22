/**
 * SupplySignalsClient.ts — CSV-ONLY Supply Data
 *
 * ARCHITECTURAL DECISION (LOCKED):
 * Connector OS is CSV-ONLY. All Apify, dataset, scraper, and external
 * ingestion paths have been permanently removed.
 *
 * This file provides:
 * - SupplyCompany interface (used by other services)
 * - Supply matching utilities
 *
 * Data loading is handled via:
 * getCsvData('supply') → normalizeDataset() in schemas/index.ts
 */

import { safeLower } from './SignalsClient';

// =============================================================================
// TYPES
// =============================================================================

/** Hire category classification */
export type HireCategory = 'engineering' | 'sales' | 'marketing' | 'finance' | 'operations' | 'hr' | 'design' | 'product' | 'legal' | 'other' | 'unknown';

/** Classification result for a supply company */
export interface ClassificationResult {
  category: HireCategory;
  confidence: number;
  signals: string[];
  hireCategory: HireCategory;
}

/**
 * SupplyCompany — Represents a supply-side entity (service provider, recruiter, etc.)
 * This interface is used by IntroBuilder, SupplyQualityRanker, TrustedSupplyPools.
 */
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
  existingContact?: {
    name?: string;
    email?: string;
    title?: string;
    linkedin?: string;
  };
  qualityScore?: number;
  rankingReason?: string[];
}

// =============================================================================
// CATEGORY CLASSIFICATION
// =============================================================================

const CATEGORY_KEYWORDS: Record<HireCategory, string[]> = {
  engineering: ['engineer', 'developer', 'software', 'devops', 'backend', 'frontend', 'fullstack', 'tech', 'code', 'programming', 'architect', 'sre', 'data engineer', 'ml engineer', 'ai engineer'],
  sales: ['sales', 'account executive', 'ae', 'sdr', 'bdr', 'revenue', 'business development', 'partnerships', 'gtm', 'go-to-market'],
  marketing: ['marketing', 'growth', 'brand', 'content', 'seo', 'sem', 'demand gen', 'product marketing', 'communications', 'pr'],
  finance: ['finance', 'accounting', 'cfo', 'controller', 'fp&a', 'treasury', 'audit', 'tax'],
  operations: ['operations', 'ops', 'supply chain', 'logistics', 'procurement', 'facilities'],
  hr: ['hr', 'human resources', 'people', 'talent', 'recruiting', 'recruitment', 'staffing', 'headhunter'],
  design: ['design', 'ux', 'ui', 'product design', 'graphic design', 'creative'],
  product: ['product', 'product manager', 'pm', 'product owner'],
  legal: ['legal', 'lawyer', 'attorney', 'counsel', 'compliance', 'regulatory'],
  other: [],
  unknown: [],
};

/**
 * Classify a company into a hire category based on text analysis.
 */
export function classifyCompany(text: string): ClassificationResult {
  const lower = safeLower(text);
  const scores: Record<HireCategory, number> = {
    engineering: 0, sales: 0, marketing: 0, finance: 0, operations: 0,
    hr: 0, design: 0, product: 0, legal: 0, other: 0, unknown: 0,
  };
  const signals: string[] = [];

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        scores[category as HireCategory] += 1;
        signals.push(`${category}: ${keyword}`);
      }
    }
  }

  // Find highest scoring category
  let maxCategory: HireCategory = 'unknown';
  let maxScore = 0;
  for (const [category, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      maxCategory = category as HireCategory;
    }
  }

  const confidence = maxScore > 0 ? Math.min(maxScore / 3, 1) : 0;

  return {
    category: maxCategory,
    confidence,
    signals,
    hireCategory: maxCategory,
  };
}

// =============================================================================
// MATCHING UTILITIES
// =============================================================================

export interface ScoredSupplyMatch {
  supply: SupplyCompany;
  score: number;
  tier: 'strong' | 'good' | 'exploratory';
  reasons: string[];
}

export interface DemandContext {
  company: string;
  domain: string;
  signal: string;
  title?: string;
  industry?: string;
}

/**
 * Score a potential match between demand and supply.
 */
export function scoreMatch(demand: DemandContext, supply: SupplyCompany): ScoredSupplyMatch {
  let score = 50; // Base score
  const reasons: string[] = [];

  // Industry alignment
  if (demand.industry && supply.industry) {
    const demandIndustry = safeLower(demand.industry);
    const supplyIndustry = safeLower(supply.industry);
    if (demandIndustry.includes(supplyIndustry) || supplyIndustry.includes(demandIndustry)) {
      score += 20;
      reasons.push('Industry match');
    }
  }

  // Category alignment from signal
  const demandClassification = classifyCompany(demand.signal + ' ' + (demand.title || ''));
  if (demandClassification.category === supply.hireCategory && supply.hireCategory !== 'unknown') {
    score += 30;
    reasons.push(`Category match: ${supply.hireCategory}`);
  }

  // Determine tier
  let tier: 'strong' | 'good' | 'exploratory';
  if (score >= 80) {
    tier = 'strong';
  } else if (score >= 60) {
    tier = 'good';
  } else {
    tier = 'exploratory';
  }

  return { supply, score, tier, reasons };
}

/**
 * Find matching supply companies for a demand context.
 */
export function findMatchingSupply(
  demand: DemandContext,
  supplyList: SupplyCompany[]
): SupplyCompany | null {
  if (supplyList.length === 0) return null;

  const scored = supplyList.map(s => scoreMatch(demand, s));
  scored.sort((a, b) => b.score - a.score);

  return scored[0]?.supply || null;
}

/**
 * Find all scored matches for a demand context.
 */
export function findScoredMatches(
  demand: DemandContext,
  supplyList: SupplyCompany[]
): ScoredSupplyMatch[] {
  return supplyList
    .map(s => scoreMatch(demand, s))
    .sort((a, b) => b.score - a.score);
}
