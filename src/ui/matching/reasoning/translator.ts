/**
 * TRANSLATOR — Match Reasoning to Operator Language
 *
 * Converts technical match data into 2-3 line operator-grade explanations.
 * Used by the InfoIcon popover next to tier badges.
 *
 * Design rules:
 * - Strong tier: 2 lines (obvious match, needs less explanation)
 * - Good/Exploratory: 3 lines (explain why routed + confidence)
 * - Language: Premium, operator-grade (not consumer, not jargon)
 */

import type { Match, NeedProfile, CapabilityProfile, ConfidenceTier } from '../../../matching';

// =============================================================================
// TYPES
// =============================================================================

export enum MatchPattern {
  FUNDING_GROWTH = 'FUNDING_GROWTH',
  COMPLIANCE_LEGAL = 'COMPLIANCE_LEGAL',
  TECHNICAL_ENG = 'TECHNICAL_ENG',
  PRODUCT_GTM = 'PRODUCT_GTM',
  RECRUITING_HIRING = 'RECRUITING_HIRING',
  SALES_REVENUE = 'SALES_REVENUE',
  MARKETING_GROWTH = 'MARKETING_GROWTH',
  GENERIC = 'GENERIC',
}

export interface ReasoningLines {
  line1: string;  // Strategic context (why timing/need matters)
  line2: string;  // Provider specialty (what they do)
  line3?: string; // Routing metadata (confidence% + tag) — only for Good/Exploratory
}

// =============================================================================
// PATTERN TEMPLATES — Operator Language
// =============================================================================

const MATCH_PATTERNS: Record<MatchPattern, {
  context: string;
  specialtyFormat: string;
}> = {
  [MatchPattern.FUNDING_GROWTH]: {
    context: 'Post-seed teams invest in growth',
    specialtyFormat: 'early-stage growth specialist',
  },
  [MatchPattern.COMPLIANCE_LEGAL]: {
    context: 'Regulatory gaps scale fast',
    specialtyFormat: 'compliance & legal specialist',
  },
  [MatchPattern.TECHNICAL_ENG]: {
    context: 'Technical debt compounds with scale',
    specialtyFormat: 'engineering specialist',
  },
  [MatchPattern.PRODUCT_GTM]: {
    context: 'Launch windows close fast',
    specialtyFormat: 'product & GTM specialist',
  },
  [MatchPattern.RECRUITING_HIRING]: {
    context: 'Open roles cost momentum',
    specialtyFormat: 'recruiting specialist',
  },
  [MatchPattern.SALES_REVENUE]: {
    context: 'Revenue gaps compound quarterly',
    specialtyFormat: 'sales & revenue specialist',
  },
  [MatchPattern.MARKETING_GROWTH]: {
    context: 'Market timing is everything',
    specialtyFormat: 'marketing & growth specialist',
  },
  [MatchPattern.GENERIC]: {
    context: 'Industry signal detected',
    specialtyFormat: 'related capability match',
  },
};

// =============================================================================
// PATTERN DETECTION
// =============================================================================

/**
 * Signal keywords that map to match patterns.
 * Order matters — more specific patterns checked first.
 */
const PATTERN_SIGNALS: Record<MatchPattern, string[]> = {
  [MatchPattern.FUNDING_GROWTH]: [
    'seed', 'series', 'raised', 'funding', 'venture', 'investor', 'capital', 'growth'
  ],
  [MatchPattern.COMPLIANCE_LEGAL]: [
    'compliance', 'regulatory', 'gdpr', 'privacy', 'legal', 'counsel', 'attorney', 'law'
  ],
  [MatchPattern.TECHNICAL_ENG]: [
    'engineer', 'developer', 'technical', 'software', 'backend', 'frontend', 'devops', 'ml', 'ai'
  ],
  [MatchPattern.PRODUCT_GTM]: [
    'product', 'launch', 'gtm', 'go-to-market', 'release', 'roadmap', 'feature'
  ],
  [MatchPattern.RECRUITING_HIRING]: [
    'hiring', 'recruit', 'talent', 'staffing', 'headcount', 'roles', 'positions'
  ],
  [MatchPattern.SALES_REVENUE]: [
    'sales', 'revenue', 'deals', 'pipeline', 'quota', 'account', 'enterprise'
  ],
  [MatchPattern.MARKETING_GROWTH]: [
    'marketing', 'brand', 'demand gen', 'content', 'seo', 'paid', 'growth marketing'
  ],
  [MatchPattern.GENERIC]: [], // Fallback — never matches on keywords
};

/**
 * Detect match pattern from match data.
 * Uses tierReason, needProfile, capabilityProfile, and reasons array.
 */
export function detectMatchPattern(match: Match): MatchPattern {
  // Build searchable text from all available match data
  const searchText = [
    match.tierReason || '',
    match.needProfile?.category || '',
    match.needProfile?.source || '',
    match.capabilityProfile?.category || '',
    match.capabilityProfile?.source || '',
    ...(match.reasons || []),
    ...(match.needProfile?.specifics || []),
    ...(match.capabilityProfile?.specifics || []),
  ].join(' ').toLowerCase();

  // Check each pattern's keywords (order = priority)
  const patternOrder: MatchPattern[] = [
    MatchPattern.FUNDING_GROWTH,
    MatchPattern.COMPLIANCE_LEGAL,
    MatchPattern.RECRUITING_HIRING,
    MatchPattern.TECHNICAL_ENG,
    MatchPattern.PRODUCT_GTM,
    MatchPattern.SALES_REVENUE,
    MatchPattern.MARKETING_GROWTH,
  ];

  for (const pattern of patternOrder) {
    const keywords = PATTERN_SIGNALS[pattern];
    const hasMatch = keywords.some(kw => searchText.includes(kw));
    if (hasMatch) {
      return pattern;
    }
  }

  return MatchPattern.GENERIC;
}

// =============================================================================
// CAPABILITY EXTRACTION
// =============================================================================

/**
 * Extract provider specialty from capability profile or tierReason.
 * Falls back to pattern-based default.
 */
function extractProviderSpecialty(match: Match, pattern: MatchPattern): string {
  // Try capabilityProfile first
  if (match.capabilityProfile) {
    const { category, specifics } = match.capabilityProfile;
    if (specifics?.length > 0) {
      return `${specifics[0]} ${category}`;
    }
    if (category && category !== 'general') {
      return `${category} specialist`;
    }
  }

  // Try to extract from tierReason ("Raised seed → Provider" format)
  if (match.tierReason) {
    const arrowParts = match.tierReason.split('→');
    if (arrowParts.length > 1) {
      const providerPart = arrowParts[1].trim().toLowerCase();
      if (providerPart && providerPart !== 'provider') {
        return providerPart;
      }
    }
  }

  // Fallback to pattern default
  return MATCH_PATTERNS[pattern].specialtyFormat;
}

// =============================================================================
// ROUTING TAG EXTRACTION
// =============================================================================

/**
 * Extract routing tag from match data.
 * Returns category-based tag that answers: "What evidence bucket?"
 */
export function extractRoutingTag(
  reasons: string[],
  needProfile?: { category?: string },
  capabilityProfile?: { category?: string }
): string {
  // Priority 1: Use capability category (what provider does)
  if (capabilityProfile?.category && capabilityProfile.category !== 'general') {
    return capabilityProfile.category;
  }

  // Priority 2: Use need category (what demand needs)
  if (needProfile?.category && needProfile.category !== 'general') {
    return needProfile.category;
  }

  // Priority 3: Extract from reasons
  if (reasons?.length) {
    const firstReason = reasons[0].toLowerCase();

    if (firstReason.includes('bizgraph')) return 'bizgraph';
    if (firstReason.includes('semantic')) return 'semantic';
    if (firstReason.includes('industry')) return 'industry';
  }

  // Fallback: exploratory (honest about low signal)
  return 'exploratory';
}

// =============================================================================
// CONFIDENCE FORMATTING
// =============================================================================

/**
 * Format confidence as percentage string.
 * Uses needProfile confidence, capabilityProfile confidence, or score-based estimate.
 */
export function formatConfidence(match: Match): string {
  // Try needProfile confidence first (0-1 scale)
  const needConf = match.needProfile?.confidence;
  if (typeof needConf === 'number' && !isNaN(needConf)) {
    return `${Math.round(needConf * 100)}%`;
  }

  // Try capabilityProfile confidence (0-1 scale)
  const capConf = match.capabilityProfile?.confidence;
  if (typeof capConf === 'number' && !isNaN(capConf)) {
    return `${Math.round(capConf * 100)}%`;
  }

  // Fallback to score (0-100 scale)
  const score = match.score;
  if (typeof score === 'number' && !isNaN(score)) {
    return `${Math.round(score)}%`;
  }

  // Last resort — no confidence data available
  return '—';
}

// =============================================================================
// MAIN TRANSLATOR
// =============================================================================

/**
 * Translate match data to operator-grade reasoning lines.
 *
 * @param match - The match object with tier, tierReason, needProfile, etc.
 * @returns ReasoningLines object with 2-3 lines based on tier
 */
export function translateToOperatorLanguage(match: Match): ReasoningLines {
  const pattern = detectMatchPattern(match);
  const template = MATCH_PATTERNS[pattern];
  const tier = match.tier || 'open';

  // Line 1: Strategic context
  const line1 = template.context;

  // Line 2: Provider specialty
  const specialty = extractProviderSpecialty(match, pattern);
  const line2 = `Provider: ${specialty}`;

  // Strong tier: 2 lines only (obvious match, needs less explanation)
  if (tier === 'strong') {
    return { line1, line2 };
  }

  // Good/Exploratory tier: 3 lines (include confidence + routing tag)
  const confidence = formatConfidence(match);
  const tag = extractRoutingTag(match.reasons, match.needProfile, match.capabilityProfile);
  const line3 = `Routing confidence: ${confidence} (${tag})`;

  return { line1, line2, line3 };
}

// =============================================================================
// UTILITY: Get tier display info
// =============================================================================

export interface TierDisplayInfo {
  label: string;
  emoji: string;
  description: string;
}

export function getTierDisplayInfo(tier: ConfidenceTier): TierDisplayInfo {
  switch (tier) {
    case 'strong':
      return {
        label: 'Strong',
        emoji: '🟣',
        description: 'High-confidence match with clear signal alignment',
      };
    case 'good':
      return {
        label: 'Good',
        emoji: '🔵',
        description: 'Solid match with supporting evidence',
      };
    case 'open':
    default:
      return {
        label: 'Exploratory',
        emoji: '⚪',
        description: 'Worth exploring — signal detected but lower confidence',
      };
  }
}
