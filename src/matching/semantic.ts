/**
 * MATCH-1: Semantic Expansion Layer
 *
 * Fixes literal-matching failures (e.g., recruiting agencies scoring low for hiring needs)
 * by expanding tokens with semantic equivalents BEFORE scoring.
 *
 * GOVERNANCE: Code-owned taxonomy. No admin UI. No runtime edits.
 * Changes require code review + deploy.
 */

// =============================================================================
// FEATURE FLAG
// =============================================================================

export const SEMANTIC_MATCHING_ENABLED = true;

// =============================================================================
// MATCH-1A: Capability & Need Taxonomy
// =============================================================================

/**
 * Supply capability expansions.
 * Maps what a supply company DOES to semantic equivalents.
 */
export const SUPPLY_CAPABILITY_EXPANSIONS: Record<string, string[]> = {
  recruiting: [
    'hiring',
    'talent acquisition',
    'staffing',
    'headhunting',
    'recruiter',
    'placement',
    'sourcing',
    'talent',
    'hire',
    'engineer',
    'engineers',
    'engineering',
    'developer',
    'software',
    'sales',
    'marketing'
  ],
  recruit: [
    'hiring',
    'talent',
    'staffing',
    'hire'
  ],
  staffing: [
    'recruiting',
    'hiring',
    'talent',
    'hire'
  ],
  talent: [
    'recruiting',
    'hiring',
    'staffing',
    'hire'
  ],
  engineering_recruiting: [
    'technical hiring',
    'hire engineers',
    'engineering hires',
    'tech hiring',
    'developer hiring',
    'engineer',
    'software'
  ],
  sales_recruiting: [
    'sales hiring',
    'hire salespeople',
    'sales hires',
    'revenue hiring'
  ],
  marketing_recruiting: [
    'marketing hiring',
    'hire marketers',
    'marketing hires'
  ],
  executive_recruiting: [
    'executive hiring',
    'leadership hiring',
    'c-suite hiring',
    'executive search'
  ]
};

/**
 * Demand need expansions.
 * Maps what a demand company NEEDS to semantic equivalents.
 */
export const DEMAND_NEED_EXPANSIONS: Record<string, string[]> = {
  hiring: [
    'recruiting',
    'talent acquisition',
    'staffing',
    'team building',
    'headcount',
    'recruit',
    'recruiter'
  ],
  engineer: [
    'recruiting',
    'staffing',
    'talent',
    'hire',
    'hiring',
    'technical hiring'
  ],
  engineers: [
    'recruiting',
    'staffing',
    'talent',
    'hire',
    'hiring'
  ],
  engineering: [
    'recruiting',
    'staffing',
    'talent',
    'hire',
    'hiring',
    'engineering hires',
    'hire engineers',
    'technical hiring',
    'developer',
    'software engineer',
    'tech talent'
  ],
  software: [
    'recruiting',
    'staffing',
    'talent',
    'hire',
    'engineering'
  ],
  developer: [
    'recruiting',
    'staffing',
    'talent',
    'hire',
    'engineering'
  ],
  sales: [
    'recruiting',
    'staffing',
    'talent',
    'hire',
    'hiring',
    'sales hires',
    'hire salespeople',
    'sales talent',
    'revenue team'
  ],
  marketing: [
    'recruiting',
    'staffing',
    'talent',
    'hire',
    'hiring',
    'marketing hires',
    'hire marketers',
    'marketing talent'
  ],
  operations: [
    'recruiting',
    'staffing',
    'talent',
    'hire',
    'operations hires',
    'hire ops',
    'ops talent'
  ],
  finance: [
    'recruiting',
    'staffing',
    'talent',
    'hire',
    'finance hires',
    'hire finance',
    'accounting talent'
  ]
};

// =============================================================================
// MATCH-1B: Ambiguity Resolution (Context Gate)
// =============================================================================

/**
 * Resolve ambiguous terms based on context.
 * Returns 'need' | 'capability' | null
 */
export function resolveAmbiguousTerm(
  term: string,
  ctx: {
    side: 'demand' | 'supply';
    text: string;
  }
): 'need' | 'capability' | null {
  const lowerTerm = term.toLowerCase();
  const lowerText = ctx.text.toLowerCase();

  // Hiring context indicators
  const hasHiringContext = /\b(hire|hiring|team|headcount|recruit|talent|staffing|placement)\b/.test(lowerText);
  const hasRecruitingContext = /\b(recruit|staffing|talent|headhunt|placement|sourcing)\b/.test(lowerText);

  // ENGINEERING
  if (lowerTerm === 'engineering' || lowerTerm === 'engineer' || lowerTerm === 'engineers') {
    if (ctx.side === 'demand' && hasHiringContext) {
      return 'need'; // Demand + hiring context → NEED
    }
    if (ctx.side === 'supply' && hasRecruitingContext) {
      return 'capability'; // Supply + recruiting context → CAPABILITY (engineering recruiting)
    }
    // Else → treat as software capability, do NOT map to hiring
    return null;
  }

  // SALES
  if (lowerTerm === 'sales') {
    if (ctx.side === 'demand' && hasHiringContext) {
      return 'need';
    }
    if (ctx.side === 'supply' && hasRecruitingContext) {
      return 'capability';
    }
    return null;
  }

  // MARKETING
  if (lowerTerm === 'marketing') {
    if (ctx.side === 'demand' && hasHiringContext) {
      return 'need';
    }
    if (ctx.side === 'supply' && hasRecruitingContext) {
      return 'capability';
    }
    return null;
  }

  // GROWTH
  if (lowerTerm === 'growth') {
    // Expand into hiring ONLY if text includes hiring indicators
    if (hasHiringContext) {
      return ctx.side === 'demand' ? 'need' : 'capability';
    }
    // Ambiguous + no context → do not expand
    return null;
  }

  // Not an ambiguous term
  return null;
}

// =============================================================================
// MATCH-1C: Semantic Expansion Function
// =============================================================================

/**
 * Expand tokens with semantic equivalents.
 *
 * @param tokens - Original tokens to expand
 * @param ctx - Context for ambiguity resolution
 * @returns base tokens + expanded tokens + reasons
 */
export function expandSemanticSignals(
  tokens: string[],
  ctx: {
    side: 'demand' | 'supply';
    text: string;
  }
): {
  base: Set<string>;
  expanded: Set<string>;
  reasons: Map<string, string[]>;
} {
  const base = new Set(tokens.map(t => t.toLowerCase()));
  const expanded = new Set(base);
  const reasons = new Map<string, string[]>();

  // If feature flag disabled, return base only
  if (!SEMANTIC_MATCHING_ENABLED) {
    return { base, expanded, reasons };
  }

  const lowerText = ctx.text.toLowerCase();

  // Select expansion map based on side
  const expansionMap = ctx.side === 'demand'
    ? DEMAND_NEED_EXPANSIONS
    : SUPPLY_CAPABILITY_EXPANSIONS;

  // Process each token
  for (const token of tokens) {
    const lowerToken = token.toLowerCase();

    // Check direct taxonomy match
    if (expansionMap[lowerToken]) {
      for (const expansion of expansionMap[lowerToken]) {
        expanded.add(expansion.toLowerCase());
        if (!reasons.has(expansion)) {
          reasons.set(expansion, []);
        }
        reasons.get(expansion)!.push(`taxonomy:${lowerToken}`);
      }
    }

    // Check ambiguity resolution
    const resolution = resolveAmbiguousTerm(lowerToken, ctx);
    if (resolution) {
      // Add cross-functional expansions based on resolution
      if (resolution === 'need' && ctx.side === 'demand') {
        // Demand needs hiring help → add recruiting equivalents
        const hiringExpansions = DEMAND_NEED_EXPANSIONS['hiring'] || [];
        for (const exp of hiringExpansions) {
          expanded.add(exp.toLowerCase());
          if (!reasons.has(exp)) {
            reasons.set(exp, []);
          }
          reasons.get(exp)!.push(`ambiguity:${lowerToken}→need`);
        }
      }
      if (resolution === 'capability' && ctx.side === 'supply') {
        // Supply does recruiting → add hiring equivalents
        const recruitingExpansions = SUPPLY_CAPABILITY_EXPANSIONS['recruiting'] || [];
        for (const exp of recruitingExpansions) {
          expanded.add(exp.toLowerCase());
          if (!reasons.has(exp)) {
            reasons.set(exp, []);
          }
          reasons.get(exp)!.push(`ambiguity:${lowerToken}→capability`);
        }
      }
    }
  }

  // Also check for recruiting/hiring keywords in text and expand
  if (ctx.side === 'supply') {
    if (/\b(recruit|recruiting|staffing|talent|headhunt|placement)\b/.test(lowerText)) {
      const recruitingExpansions = SUPPLY_CAPABILITY_EXPANSIONS['recruiting'] || [];
      for (const exp of recruitingExpansions) {
        if (!expanded.has(exp.toLowerCase())) {
          expanded.add(exp.toLowerCase());
          if (!reasons.has(exp)) {
            reasons.set(exp, []);
          }
          reasons.get(exp)!.push('text:recruiting_detected');
        }
      }
    }
  }

  if (ctx.side === 'demand') {
    if (/\b(hiring|hire|hires|team building|headcount)\b/.test(lowerText)) {
      const hiringExpansions = DEMAND_NEED_EXPANSIONS['hiring'] || [];
      for (const exp of hiringExpansions) {
        if (!expanded.has(exp.toLowerCase())) {
          expanded.add(exp.toLowerCase());
          if (!reasons.has(exp)) {
            reasons.set(exp, []);
          }
          reasons.get(exp)!.push('text:hiring_detected');
        }
      }
    }
  }

  return { base, expanded, reasons };
}

// =============================================================================
// UTILITY: Extract tokens from text
// =============================================================================

/**
 * Extract meaningful tokens from text for matching.
 * Simple tokenization - splits on whitespace and punctuation.
 */
export function extractTokens(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2); // Skip very short tokens
}

/**
 * Compute semantic overlap between two token sets.
 * Returns overlap count and matched tokens.
 */
export function computeSemanticOverlap(
  demandTokens: Set<string>,
  supplyTokens: Set<string>
): {
  overlapCount: number;
  matchedTokens: string[];
} {
  const matched: string[] = [];
  for (const token of demandTokens) {
    if (supplyTokens.has(token)) {
      matched.push(token);
    }
  }
  return {
    overlapCount: matched.length,
    matchedTokens: matched
  };
}
