/**
 * MATCH CARD — Linear clean, hover lift, light feel
 */

import { TrendingUp, Heart, GraduationCap, Landmark, Users } from 'lucide-react';
import type { StrategicAlignment, SignalSource } from './types';

interface MatchCardProps {
  alignment: StrategicAlignment;
  index: number;
}

const ICONS: Record<SignalSource, React.ComponentType<{ className?: string }>> = {
  funded_startups: TrendingUp,
  clinical_trials: Heart,
  nih_grants: GraduationCap,
  federal_contracts: Landmark,
  job_signals: Users,
};

const TIER_STYLES = {
  premier: {
    badge: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
  },
  strong: {
    badge: 'bg-blue-500/10 text-blue-400 ring-blue-500/20',
  },
  good: {
    badge: 'bg-white/[0.04] text-white/50 ring-white/[0.08]',
  },
};

export default function MatchCard({ alignment }: MatchCardProps) {
  const tier = TIER_STYLES[alignment.tier] || TIER_STYLES.good;

  return (
    <div
      className="
        group px-4 py-4 rounded-xl
        bg-white/[0.02] border border-white/[0.04]
        hover:bg-white/[0.04] hover:border-white/[0.08]
        hover:shadow-[0_4px_20px_rgba(0,0,0,0.3)]
        transition-all duration-200 ease-out
        cursor-default
      "
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3.5">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium text-white/90 group-hover:text-white transition-colors">
            {alignment.contactName || alignment.company}
          </div>
          {alignment.contactTitle && (
            <div className="text-[13px] text-white/40 mt-0.5">
              {alignment.contactTitle}
            </div>
          )}
          <div className="text-[13px] text-white/25 mt-0.5">
            {alignment.company}
          </div>
        </div>

        {/* Score badge */}
        <div className={`
          px-2.5 py-1 rounded-lg text-[13px] font-medium
          ring-1 transition-all duration-200
          ${tier.badge}
        `}>
          {alignment.score}%
        </div>
      </div>

      {/* Signals */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {alignment.signals.map((signal, i) => {
          const Icon = ICONS[signal.type as SignalSource] || TrendingUp;
          return (
            <div
              key={i}
              className="
                flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
                bg-white/[0.03] text-[12px] text-white/45
                transition-colors duration-150
                group-hover:bg-white/[0.05] group-hover:text-white/55
              "
            >
              <Icon className="w-3 h-3 text-white/30" />
              {signal.title}
            </div>
          );
        })}
      </div>

      {/* Rationale */}
      {alignment.rationale && alignment.rationale.length > 0 && (
        <div className="pt-3.5 border-t border-white/[0.04]">
          <div className="text-[11px] font-medium text-white/25 uppercase tracking-wider mb-2">
            Alignment
          </div>
          <ul className="space-y-1.5">
            {alignment.rationale.slice(0, 2).map((reason, i) => (
              <li key={i} className="text-[13px] text-white/40 flex items-start gap-2">
                <span className="text-white/15 mt-0.5">•</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Mock data for testing
export const MOCK_ALIGNMENTS: StrategicAlignment[] = [
  {
    company: 'Acme Therapeutics',
    domain: 'acmetherapeutics.com',
    contactName: 'Sarah Chen',
    contactTitle: 'VP Business Development',
    score: 92,
    tier: 'premier',
    signals: [
      { type: 'clinical_trials', title: 'Phase 2 active', date: new Date().toISOString() },
      { type: 'funded_startups', title: '$15M Series B', amount: 15000000, date: new Date().toISOString() },
    ],
    matchReason: 'Strong growth signals',
    rationale: ['Phase 2 trial indicates growth phase', 'Recent funding enables partnerships'],
  },
  {
    company: 'DataFlow Systems',
    domain: 'dataflowsystems.com',
    contactName: 'Michael Rodriguez',
    contactTitle: 'Chief Technology Officer',
    score: 87,
    tier: 'strong',
    signals: [
      { type: 'funded_startups', title: '$8M Series A', amount: 8000000, date: new Date().toISOString() },
      { type: 'job_signals', title: 'Hiring engineers', date: new Date().toISOString() },
    ],
    matchReason: 'Tech expansion',
    rationale: ['Series A indicates scaling', 'Engineering hiring suggests expansion'],
  },
  {
    company: 'Vertex Research Labs',
    domain: 'vertexresearch.edu',
    contactName: 'Dr. Amanda Foster',
    contactTitle: 'Principal Investigator',
    score: 78,
    tier: 'strong',
    signals: [
      { type: 'nih_grants', title: '$2.1M NIH R01', amount: 2100000, date: new Date().toISOString() },
    ],
    matchReason: 'Active research',
    rationale: ['NIH R01 indicates sustained research', 'Academic partnership opportunity'],
  },
  {
    company: 'Federal Solutions Inc',
    domain: 'federalsolutions.com',
    contactName: 'James Thompson',
    contactTitle: 'Director BD',
    score: 71,
    tier: 'good',
    signals: [
      { type: 'federal_contracts', title: '$4.2M DOD', amount: 4200000, date: new Date().toISOString() },
    ],
    matchReason: 'Government growth',
    rationale: ['DOD contract signals expansion'],
  },
];
