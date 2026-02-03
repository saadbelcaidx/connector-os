/**
 * Widget Utilities — Signal to Icon Mapping
 *
 * Converts enrichment signals from Apollo to visual RationaleItem[]
 * for display in MatchCard components.
 */

import {
  Users,
  TrendingUp,
  Target,
  Shield,
  Building2,
  Briefcase,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

export interface CompanySignals {
  hiring?: boolean | { count: number; roles?: string[] };
  funding?: { stage: string; amount: string; date?: string };
  techStack?: string[];
  industry?: string;
  size?: string | number;
  growth?: boolean | { percentage: number };
  verified?: boolean;
}

export interface SupplyProvider {
  company: string;
  specialization?: string;
  industry?: string;
  capabilities?: string[];
}

export interface RationaleItem {
  icon: LucideIcon;
  text: string;
  color: string;
}

// =============================================================================
// SIGNAL ICON MAPPING
// =============================================================================

const SIGNAL_CONFIG = {
  hiring: {
    icon: Users,
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
  },
  funding: {
    icon: TrendingUp,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  techStack: {
    icon: Target,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
  },
  industry: {
    icon: Building2,
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/10',
  },
  growth: {
    icon: TrendingUp,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
  },
  verified: {
    icon: Shield,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
  },
  size: {
    icon: Briefcase,
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/10',
  },
} as const;

// =============================================================================
// RATIONALE GENERATION
// =============================================================================

/**
 * Generate strategic rationale from company signals.
 * Returns max 3 items for clean card display.
 *
 * ENTERPRISE LANGUAGE: Uses JP Morgan-style phrasing.
 * NO CASUAL LANGUAGE: "Active talent acquisition" not "They're hiring"
 */
export function generateRationale(
  signals: CompanySignals,
  supplyProvider?: SupplyProvider
): RationaleItem[] {
  const rationale: RationaleItem[] = [];

  // 1. Hiring signal (highest priority)
  if (signals.hiring) {
    const count = typeof signals.hiring === 'object'
      ? signals.hiring.count
      : undefined;
    const roles = typeof signals.hiring === 'object' && signals.hiring.roles
      ? signals.hiring.roles.slice(0, 2).join(', ')
      : undefined;

    let text = 'Active talent acquisition';
    if (count) text += ` — ${count} open position${count > 1 ? 's' : ''}`;
    if (roles) text += ` (${roles})`;

    rationale.push({
      icon: SIGNAL_CONFIG.hiring.icon,
      text,
      color: SIGNAL_CONFIG.hiring.color,
    });
  }

  // 2. Funding signal
  if (signals.funding) {
    const { stage, amount } = signals.funding;
    rationale.push({
      icon: SIGNAL_CONFIG.funding.icon,
      text: `Recent ${stage} funding (${amount})`,
      color: SIGNAL_CONFIG.funding.color,
    });
  }

  // 3. Tech stack alignment
  if (signals.techStack && signals.techStack.length > 0) {
    const techList = signals.techStack.slice(0, 3).join(', ');
    rationale.push({
      icon: SIGNAL_CONFIG.techStack.icon,
      text: `Technology infrastructure alignment — ${techList}`,
      color: SIGNAL_CONFIG.techStack.color,
    });
  }

  // 4. Industry alignment (if supply provider matches)
  if (signals.industry && supplyProvider?.industry) {
    if (signals.industry.toLowerCase() === supplyProvider.industry.toLowerCase()) {
      rationale.push({
        icon: SIGNAL_CONFIG.industry.icon,
        text: `Industry alignment — ${signals.industry} specialization`,
        color: SIGNAL_CONFIG.industry.color,
      });
    }
  }

  // 5. Growth signal
  if (signals.growth) {
    const percentage = typeof signals.growth === 'object'
      ? signals.growth.percentage
      : undefined;
    const text = percentage
      ? `Growth trajectory — ${percentage}% YoY expansion`
      : 'Demonstrated growth trajectory';

    rationale.push({
      icon: SIGNAL_CONFIG.growth.icon,
      text,
      color: SIGNAL_CONFIG.growth.color,
    });
  }

  // 6. Verified organization
  if (signals.verified) {
    rationale.push({
      icon: SIGNAL_CONFIG.verified.icon,
      text: 'Verified organization profile',
      color: SIGNAL_CONFIG.verified.color,
    });
  }

  // Return max 3 items for clean card layout
  return rationale.slice(0, 3);
}

// =============================================================================
// TIER CALCULATION
// =============================================================================

export type MatchTier = 'A' | 'B' | 'C';

export interface TierInfo {
  tier: MatchTier;
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}

const TIER_CONFIG: Record<MatchTier, Omit<TierInfo, 'tier'>> = {
  A: {
    label: 'Strong alignment',
    bgClass: 'bg-green-500/10',
    textClass: 'text-green-400',
    borderClass: 'border-green-500/25',
  },
  B: {
    label: 'Good alignment',
    bgClass: 'bg-blue-500/10',
    textClass: 'text-blue-400',
    borderClass: 'border-blue-500/25',
  },
  C: {
    label: 'Potential alignment',
    bgClass: 'bg-gray-500/10',
    textClass: 'text-gray-400',
    borderClass: 'border-gray-500/25',
  },
};

/**
 * Calculate match tier from score.
 *
 * Tier A: 70-100 (Strong alignment)
 * Tier B: 45-69 (Good alignment)
 * Tier C: 0-44 (Potential alignment)
 */
export function calculateTier(score: number): TierInfo {
  let tier: MatchTier;

  if (score >= 70) {
    tier = 'A';
  } else if (score >= 45) {
    tier = 'B';
  } else {
    tier = 'C';
  }

  return {
    tier,
    ...TIER_CONFIG[tier],
  };
}

/**
 * Calculate match score from signals.
 * Weighted scoring based on signal strength.
 */
export function calculateMatchScore(
  signals: CompanySignals,
  supplyProvider?: SupplyProvider
): number {
  let score = 0;

  // Hiring: 25 points (strong intent signal)
  if (signals.hiring) {
    const count = typeof signals.hiring === 'object' ? signals.hiring.count : 1;
    score += Math.min(25, 10 + count * 3);
  }

  // Funding: 25 points (growth capital)
  if (signals.funding) {
    score += 25;
  }

  // Tech stack: 20 points (capability alignment)
  if (signals.techStack && signals.techStack.length > 0) {
    score += Math.min(20, signals.techStack.length * 5);
  }

  // Industry match: 15 points (market fit)
  if (signals.industry && supplyProvider?.industry) {
    if (signals.industry.toLowerCase() === supplyProvider.industry.toLowerCase()) {
      score += 15;
    }
  }

  // Growth: 10 points (trajectory)
  if (signals.growth) {
    score += 10;
  }

  // Verified: 5 points (data quality)
  if (signals.verified) {
    score += 5;
  }

  return Math.min(100, score);
}

// =============================================================================
// ENTERPRISE LANGUAGE HELPERS
// =============================================================================

/**
 * Format employee count with enterprise language.
 */
export function formatEmployeeCount(size: string | number | undefined): string {
  if (!size) return '';

  const num = typeof size === 'string' ? parseInt(size, 10) : size;

  if (num >= 10000) return 'Enterprise organization (10,000+ employees)';
  if (num >= 1000) return 'Large organization (1,000+ employees)';
  if (num >= 200) return 'Mid-market organization (200+ employees)';
  if (num >= 50) return 'Growth-stage organization (50+ employees)';
  return 'Emerging organization';
}

/**
 * Format funding stage with enterprise language.
 */
export function formatFundingStage(stage: string): string {
  const stageMap: Record<string, string> = {
    'seed': 'Seed',
    'series_a': 'Series A',
    'series_b': 'Series B',
    'series_c': 'Series C',
    'series_d': 'Series D',
    'series_e': 'Series E+',
    'ipo': 'Public',
    'acquired': 'Acquired',
  };

  return stageMap[stage.toLowerCase()] || stage;
}

/**
 * Format currency amount with enterprise style.
 */
export function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (num >= 1_000_000_000) {
    return `$${(num / 1_000_000_000).toFixed(1)}B`;
  }
  if (num >= 1_000_000) {
    return `$${(num / 1_000_000).toFixed(0)}M`;
  }
  if (num >= 1_000) {
    return `$${(num / 1_000).toFixed(0)}K`;
  }
  return `$${num}`;
}
