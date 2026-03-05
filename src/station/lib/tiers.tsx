/**
 * Tier system — human-readable labels instead of raw scores.
 * Used across all station UI components.
 */

export type Tier = 'strong' | 'good' | 'weak' | 'none' | 'conflict';

export function getTier(match: { vetoed: boolean; scores: { combined: number } }): Tier {
  if (match.vetoed) return 'conflict';
  const score = match.scores.combined;
  if (score >= 0.7) return 'strong';
  if (score >= 0.5) return 'good';
  if (score >= 0.3) return 'weak';
  return 'none';
}

export const tierConfig: Record<Tier, {
  label: string;
  dot: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
  subtitle: string;
}> = {
  strong: {
    label: 'Strong fit',
    dot: '\u25CF',
    textColor: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
    subtitle: 'Ready to act',
  },
  good: {
    label: 'Good fit',
    dot: '\u25CF',
    textColor: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
    subtitle: 'Worth a look',
  },
  weak: {
    label: 'Weak fit',
    dot: '\u25CB',
    textColor: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20',
    subtitle: 'Low confidence',
  },
  none: {
    label: 'No fit',
    dot: '\u00B7',
    textColor: 'text-white/30',
    bgColor: 'bg-white/[0.02]',
    borderColor: 'border-white/[0.04]',
    subtitle: '',
  },
  conflict: {
    label: 'Conflict',
    dot: '\u2715',
    textColor: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/20',
    subtitle: 'Auto-filtered',
  },
};

/** Parse structured reasoning (SIGNAL: ...\nEDGE: ...) or fall back to raw string. */
export function parseReasoning(raw: string): { signal: string; edge: string } | null {
  if (!raw) return null;
  const signalMatch = raw.match(/^SIGNAL:\s*(.+)/m);
  const edgeMatch = raw.match(/^EDGE:\s*(.+)/m);
  if (signalMatch || edgeMatch) {
    return {
      signal: signalMatch?.[1]?.trim() || '',
      edge: edgeMatch?.[1]?.trim() || '',
    };
  }
  return null; // old-format reasoning — caller displays raw
}

export function TierBadge({ tier }: { tier: Tier }) {
  const c = tierConfig[tier];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${c.bgColor} ${c.textColor} border ${c.borderColor}`}>
      <span>{c.dot}</span>
      {c.label}
    </span>
  );
}
