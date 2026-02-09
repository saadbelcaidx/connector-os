import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Loader2, Network, X, ChevronRight,
  Send, MessageSquare, Calendar, Trophy, XCircle,
  Clock, DollarSign, BarChart3, Eye, MousePointer, Mail, ExternalLink,
} from 'lucide-react';
import { useAuth } from './AuthContext';
import { supabase } from './lib/supabase';
import {
  listIntroductions,
  getIntroStats,
  markMeetingBooked,
  markOutcome,
  updateIntroStatus,
  getLearningByTier,
  getIntroFunnel,
  type Introduction,
  type IntroStats,
  type IntroStatus,
  type ListOptions,
  type TierLearning,
  type FunnelData,
} from './services/IntroductionsService';

// ============================================================================
// CONSTANTS
// ============================================================================

type FilterTab = 'all' | 'sent' | 'replied' | 'meeting' | 'closed';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  prepared: { label: 'Prepared', color: 'text-white/50', bg: 'bg-white/[0.04]', border: 'border-white/[0.08]' },
  sent: { label: 'Sent', color: 'text-blue-400', bg: 'bg-blue-500/[0.08]', border: 'border-blue-500/[0.15]' },
  delivered: { label: 'Delivered', color: 'text-blue-400', bg: 'bg-blue-500/[0.08]', border: 'border-blue-500/[0.15]' },
  replied: { label: 'Replied', color: 'text-amber-400', bg: 'bg-amber-500/[0.08]', border: 'border-amber-500/[0.15]' },
  meeting: { label: 'Meeting', color: 'text-amber-300', bg: 'bg-amber-500/[0.10]', border: 'border-amber-500/[0.20]' },
  closed_won: { label: 'Won', color: 'text-emerald-400', bg: 'bg-emerald-500/[0.08]', border: 'border-emerald-500/[0.15]' },
  closed_lost: { label: 'Lost', color: 'text-red-400', bg: 'bg-red-500/[0.08]', border: 'border-red-500/[0.15]' },
  stale: { label: 'Stale', color: 'text-white/30', bg: 'bg-white/[0.03]', border: 'border-white/[0.06]' },
};

const TIER_CONFIG: Record<string, { label: string; color: string }> = {
  strong: { label: 'Strong', color: 'text-emerald-400' },
  good: { label: 'Good', color: 'text-blue-400' },
  open: { label: 'Open', color: 'text-white/50' },
};

// ============================================================================
// HELPERS
// ============================================================================

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function pct(num: number, denom: number): string {
  if (denom === 0) return '0%';
  return `${Math.round((num / denom) * 100)}%`;
}

// ============================================================================
// STAT CARD
// ============================================================================

function StatCard({ label, value, sub, icon: Icon }: {
  label: string;
  value: string | number;
  sub?: string;
  icon: typeof Send;
}) {
  return (
    <div className="flex-1 min-w-[140px] p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className="text-white/30" />
        <span className="text-[11px] text-white/40 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-white/90 tracking-tight">{value}</div>
      {sub && <div className="text-[11px] text-white/30 mt-0.5">{sub}</div>}
    </div>
  );
}

// ============================================================================
// STATUS PILL
// ============================================================================

function StatusPill({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.sent;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${config.color} ${config.bg} ${config.border}`}>
      {config.label}
    </span>
  );
}

// ============================================================================
// TIER BADGE
// ============================================================================

function TierBadge({ tier, score }: { tier: string | null; score: number | null }) {
  if (!tier) return <span className="text-white/20 text-xs">-</span>;
  const config = TIER_CONFIG[tier] || TIER_CONFIG.open;
  return (
    <span className={`text-xs font-medium ${config.color}`}>
      {config.label}{score !== null ? ` ${score}` : ''}
    </span>
  );
}

// ============================================================================
// VSL ENGAGEMENT TYPE
// ============================================================================

interface VslEngagement {
  thread_id: string;
  clicked_at: string | null;
  watched_at: string | null;
  vsl_url: string | null;
}

// ============================================================================
// DETAIL MODAL
// ============================================================================

function IntroDetailModal({ intro, onClose, onAction, engagement }: {
  intro: Introduction;
  onClose: () => void;
  onAction: (action: string, data?: Record<string, unknown>) => void;
  engagement?: VslEngagement | null;
}) {
  const navigate = useNavigate();
  const [dealValue, setDealValue] = useState(intro.dealValue?.toString() || '');
  const [outcomeNotes, setOutcomeNotes] = useState(intro.outcomeNotes || '');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState<string | null>(null);
  const [replyLoading, setReplyLoading] = useState(false);

  // Fetch reply body when modal opens for replied intros
  useEffect(() => {
    if (!intro.threadId || !intro.firstReplyAt) return;
    let cancelled = false;
    async function fetchReply() {
      setReplyLoading(true);
      const { data } = await supabase
        .from('replies')
        .select('reply_body')
        .eq('thread_id', intro.threadId!)
        .order('replied_at', { ascending: false })
        .limit(1);
      if (!cancelled && data && data.length > 0) {
        setReplyBody(data[0].reply_body);
      }
      if (!cancelled) setReplyLoading(false);
    }
    fetchReply();
    return () => { cancelled = true; };
  }, [intro.threadId, intro.firstReplyAt]);

  const handleAction = async (action: string, data?: Record<string, unknown>) => {
    setActionLoading(action);
    await onAction(action, data);
    setActionLoading(null);
  };

  // Timeline steps
  const timelineSteps = [
    { label: 'Created', time: intro.createdAt, active: true },
    { label: 'Sent', time: intro.sentAt, active: !!intro.sentAt },
    { label: 'Replied', time: intro.firstReplyAt, active: !!intro.firstReplyAt },
    { label: 'Meeting', time: intro.meetingBookedAt, active: !!intro.meetingBookedAt },
    { label: 'Outcome', time: intro.outcomeAt, active: !!intro.outcomeAt },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-[#0A0A0A] border border-white/[0.08] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#0A0A0A] border-b border-white/[0.06] px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white/90">
              {intro.demandCompany || intro.demandDomain}
              <span className="text-white/30 mx-2">&rarr;</span>
              {intro.supplyCompany || intro.supplyDomain}
            </h2>
            <div className="flex items-center gap-3 mt-1">
              <StatusPill status={intro.status} />
              <TierBadge tier={intro.matchTier} score={intro.matchScore} />
              <span className="text-[11px] text-white/30">{formatTimeAgo(intro.createdAt)}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors">
            <X size={16} className="text-white/40" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Timeline */}
          <div>
            <h3 className="text-[11px] text-white/40 uppercase tracking-wider mb-3">Timeline</h3>
            <div className="flex items-center gap-1">
              {timelineSteps.map((step, i) => (
                <div key={step.label} className="flex items-center gap-1">
                  <div className={`flex flex-col items-center ${step.active ? '' : 'opacity-30'}`}>
                    <div className={`w-2 h-2 rounded-full ${step.active ? 'bg-emerald-400' : 'bg-white/20'}`} />
                    <span className="text-[10px] text-white/50 mt-1">{step.label}</span>
                    {step.time && (
                      <span className="text-[9px] text-white/25">{formatTimeAgo(step.time)}</span>
                    )}
                  </div>
                  {i < timelineSteps.length - 1 && (
                    <div className={`w-8 h-px mt-[-12px] ${step.active ? 'bg-emerald-500/30' : 'bg-white/[0.06]'}`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Match context */}
          <div>
            <h3 className="text-[11px] text-white/40 uppercase tracking-wider mb-3">Match context</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div className="text-[10px] text-white/30 mb-1">Need</div>
                <div className="text-xs text-white/70">{intro.needCategory || '-'}</div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div className="text-[10px] text-white/30 mb-1">Capability</div>
                <div className="text-xs text-white/70">{intro.capabilityCategory || '-'}</div>
              </div>
            </div>
            {intro.matchTierReason && (
              <p className="text-[11px] text-white/40 mt-2">{intro.matchTierReason}</p>
            )}
            {intro.matchReasons.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {intro.matchReasons.map((r, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full text-[10px] text-white/40 bg-white/[0.04] border border-white/[0.06]">
                    {r}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Demand side */}
          <div>
            <h3 className="text-[11px] text-blue-400/60 uppercase tracking-wider mb-3">Demand side</h3>
            <div className="p-3 rounded-xl bg-blue-500/[0.03] border border-blue-500/[0.08] space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-white/80 font-medium">{intro.demandCompany || intro.demandDomain}</span>
                {intro.demandReplyStage && (
                  <span className="text-[10px] text-amber-400/70 bg-amber-500/[0.08] px-1.5 py-0.5 rounded">{intro.demandReplyStage}</span>
                )}
              </div>
              {intro.demandContactName && <p className="text-xs text-white/50">{intro.demandContactName}{intro.demandContactTitle ? ` — ${intro.demandContactTitle}` : ''}</p>}
              {intro.demandContactEmail && <p className="text-[11px] text-white/30 font-mono">{intro.demandContactEmail}</p>}
              {intro.demandRepliedAt && <p className="text-[10px] text-amber-400/50">Replied {formatTimeAgo(intro.demandRepliedAt)}</p>}
              {intro.demandIntroText && (
                <div className="mt-2 p-2.5 rounded-lg bg-black/30 border border-white/[0.04]">
                  <p className="text-[11px] text-white/50 leading-relaxed whitespace-pre-wrap">{intro.demandIntroText}</p>
                </div>
              )}
            </div>
          </div>

          {/* Supply side */}
          <div>
            <h3 className="text-[11px] text-violet-400/60 uppercase tracking-wider mb-3">Supply side</h3>
            <div className="p-3 rounded-xl bg-violet-500/[0.03] border border-violet-500/[0.08] space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-white/80 font-medium">{intro.supplyCompany || intro.supplyDomain}</span>
                {intro.supplyReplyStage && (
                  <span className="text-[10px] text-amber-400/70 bg-amber-500/[0.08] px-1.5 py-0.5 rounded">{intro.supplyReplyStage}</span>
                )}
              </div>
              {intro.supplyContactName && <p className="text-xs text-white/50">{intro.supplyContactName}{intro.supplyContactTitle ? ` — ${intro.supplyContactTitle}` : ''}</p>}
              {intro.supplyContactEmail && <p className="text-[11px] text-white/30 font-mono">{intro.supplyContactEmail}</p>}
              {intro.supplyRepliedAt && <p className="text-[10px] text-amber-400/50">Replied {formatTimeAgo(intro.supplyRepliedAt)}</p>}
              {intro.supplyIntroText && (
                <div className="mt-2 p-2.5 rounded-lg bg-black/30 border border-white/[0.04]">
                  <p className="text-[11px] text-white/50 leading-relaxed whitespace-pre-wrap">{intro.supplyIntroText}</p>
                </div>
              )}
            </div>
          </div>

          {/* VSL Engagement */}
          {engagement && (engagement.clicked_at || engagement.watched_at) && (
            <div>
              <h3 className="text-[11px] text-white/40 uppercase tracking-wider mb-3">VSL engagement</h3>
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div className="flex flex-wrap items-center gap-4 text-[12px]">
                  {engagement.clicked_at && (
                    <div className="flex items-center gap-1.5 text-amber-400/80">
                      <MousePointer size={12} />
                      <span>Clicked {formatTimeAgo(engagement.clicked_at)}</span>
                    </div>
                  )}
                  {engagement.watched_at && (
                    <div className="flex items-center gap-1.5 text-emerald-400/80">
                      <Eye size={12} />
                      <span>Watched {formatTimeAgo(engagement.watched_at)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Reply body */}
          {intro.firstReplyAt && (
            <div>
              <h3 className="text-[11px] text-white/40 uppercase tracking-wider mb-3">Reply</h3>
              {replyLoading ? (
                <div className="flex items-center gap-2 py-3">
                  <Loader2 size={12} className="animate-spin text-white/20" />
                  <span className="text-[11px] text-white/25">Loading reply...</span>
                </div>
              ) : replyBody ? (
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <p className="text-[12px] text-white/50 leading-relaxed whitespace-pre-wrap">{replyBody}</p>
                </div>
              ) : (
                <p className="text-[11px] text-white/25">No reply body available</p>
              )}
            </div>
          )}

          {/* Quick actions — Msg Sim + Email */}
          {intro.firstReplyAt && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => navigate('/msg-sim')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.12] transition-all text-xs text-white/60"
              >
                <Mail size={12} className="text-white/50" />
                Open in Msg Sim
              </button>
              {(intro.demandContactEmail || intro.supplyContactEmail) && (
                <button
                  onClick={() => {
                    const email = intro.demandRepliedAt ? intro.demandContactEmail : intro.supplyContactEmail;
                    if (email) window.open(`mailto:${email}`, '_blank');
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.12] transition-all text-xs text-white/60"
                >
                  <ExternalLink size={12} className="text-white/50" />
                  Email directly
                </button>
              )}
            </div>
          )}

          {/* Actions */}
          {!['closed_won', 'closed_lost', 'stale'].includes(intro.status) && (
            <div>
              <h3 className="text-[11px] text-white/40 uppercase tracking-wider mb-3">Actions</h3>
              <div className="flex flex-wrap gap-2">
                {intro.status !== 'meeting' && (
                  <button
                    onClick={() => handleAction('meeting')}
                    disabled={actionLoading !== null}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/[0.08] border border-amber-500/[0.15] text-amber-400 text-xs hover:bg-amber-500/[0.12] transition-colors disabled:opacity-50"
                  >
                    {actionLoading === 'meeting' ? <Loader2 size={12} className="animate-spin" /> : <Calendar size={12} />}
                    Mark meeting
                  </button>
                )}
                <button
                  onClick={() => handleAction('closed_won', {
                    notes: outcomeNotes || undefined,
                    dealValue: dealValue ? parseFloat(dealValue) : undefined,
                  })}
                  disabled={actionLoading !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/[0.08] border border-emerald-500/[0.15] text-emerald-400 text-xs hover:bg-emerald-500/[0.12] transition-colors disabled:opacity-50"
                >
                  {actionLoading === 'closed_won' ? <Loader2 size={12} className="animate-spin" /> : <Trophy size={12} />}
                  Won
                </button>
                <button
                  onClick={() => handleAction('closed_lost', { notes: outcomeNotes || undefined })}
                  disabled={actionLoading !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/[0.08] border border-red-500/[0.15] text-red-400 text-xs hover:bg-red-500/[0.12] transition-colors disabled:opacity-50"
                >
                  {actionLoading === 'closed_lost' ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                  Lost
                </button>
                <button
                  onClick={() => handleAction('stale')}
                  disabled={actionLoading !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/40 text-xs hover:bg-white/[0.06] transition-colors disabled:opacity-50"
                >
                  {actionLoading === 'stale' ? <Loader2 size={12} className="animate-spin" /> : <Clock size={12} />}
                  Stale
                </button>
              </div>

              {/* Deal value + notes (shown when meeting or about to close) */}
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-white/30 block mb-1">Deal value</label>
                  <input
                    type="number"
                    value={dealValue}
                    onChange={e => setDealValue(e.target.value)}
                    placeholder="$10,000"
                    className="w-full h-9 px-3 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-white/70 placeholder-white/20 focus:outline-none focus:border-white/[0.15]"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white/30 block mb-1">Notes</label>
                  <input
                    type="text"
                    value={outcomeNotes}
                    onChange={e => setOutcomeNotes(e.target.value)}
                    placeholder="Optional notes"
                    className="w-full h-9 px-3 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-white/70 placeholder-white/20 focus:outline-none focus:border-white/[0.15]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ============================================================================
// INSIGHTS PANEL (Phase 3)
// ============================================================================

function InsightsPanel({ operatorId }: { operatorId: string }) {
  const [tierData, setTierData] = useState<TierLearning[]>([]);
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [t, f] = await Promise.all([
        getLearningByTier(operatorId),
        getIntroFunnel(operatorId),
      ]);
      if (cancelled) return;
      setTierData(t);
      setFunnel(f);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [operatorId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 size={16} className="animate-spin text-white/20" />
      </div>
    );
  }

  if (!funnel && tierData.length === 0) return null;

  return (
    <div className="mt-6 p-4 rounded-xl bg-white/[0.015] border border-white/[0.05]">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={14} className="text-white/30" />
        <h3 className="text-[11px] text-white/40 uppercase tracking-wider">Insights</h3>
      </div>

      {/* Funnel */}
      {funnel && funnel.total > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-16 h-1.5 rounded-full bg-blue-500/30" />
              <span className="text-white/50">{funnel.total} sent</span>
            </div>
            <ChevronRight size={10} className="text-white/15" />
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 rounded-full bg-amber-500/30" style={{ width: `${Math.max(12, (funnel.replied / Math.max(funnel.total, 1)) * 64)}px` }} />
              <span className="text-white/50">{funnel.replied} replied</span>
              <span className="text-white/25">({funnel.replyRatePct}%)</span>
            </div>
            <ChevronRight size={10} className="text-white/15" />
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 rounded-full bg-amber-400/30" style={{ width: `${Math.max(8, (funnel.meetings / Math.max(funnel.total, 1)) * 64)}px` }} />
              <span className="text-white/50">{funnel.meetings} meetings</span>
              <span className="text-white/25">({funnel.meetingRatePct}%)</span>
            </div>
            <ChevronRight size={10} className="text-white/15" />
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 rounded-full bg-emerald-500/30" style={{ width: `${Math.max(6, (funnel.closedWon / Math.max(funnel.total, 1)) * 64)}px` }} />
              <span className="text-white/50">{funnel.closedWon} won</span>
              <span className="text-white/25">({funnel.winRatePct}%)</span>
            </div>
          </div>
        </div>
      )}

      {/* Tier performance */}
      {tierData.length > 0 && (
        <div className="space-y-1.5">
          {tierData.map(t => {
            const tierConf = TIER_CONFIG[t.tier] || TIER_CONFIG.open;
            return (
              <div key={t.tier} className="flex items-center gap-3 text-xs">
                <span className={`w-14 font-medium ${tierConf.color}`}>{tierConf.label}</span>
                <span className="text-white/30 w-12">{t.totalSent} sent</span>
                <span className="text-white/50 w-20">{t.replyRatePct}% reply</span>
                <span className="text-white/50 w-24">{t.meetingRatePct}% meeting</span>
                <span className="text-emerald-400/60 w-16">{t.winRatePct}% won</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function Introductions() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  // URL param: ?filter=replied (from /reply-tracker redirect)
  const initialFilter = (searchParams.get('filter') === 'replied' ? 'replied' : 'all') as FilterTab;

  // Data
  const [intros, setIntros] = useState<Introduction[]>([]);
  const [stats, setStats] = useState<IntroStats | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [engagementMap, setEngagementMap] = useState<Record<string, VslEngagement>>({});

  // UI state
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>(initialFilter);
  const [selectedIntro, setSelectedIntro] = useState<Introduction | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  const loadData = useCallback(async () => {
    if (!user?.id) return;

    setLoading(true);

    const statusFilter: IntroStatus | undefined = (() => {
      switch (filter) {
        case 'sent': return 'sent';
        case 'replied': return 'replied';
        case 'meeting': return 'meeting';
        default: return undefined;
      }
    })();

    const options: ListOptions = {
      status: statusFilter,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    };

    // For "closed" tab, we need a different approach — fetch all and filter client-side
    // since the API expects a single status. We'll fetch without status filter and filter.
    if (filter === 'closed') {
      delete options.status;
    }

    const [result, statsResult] = await Promise.all([
      listIntroductions(user.id, options),
      page === 0 ? getIntroStats(user.id) : Promise.resolve(null),
    ]);

    let filtered = result.data;
    let count = result.count;

    if (filter === 'closed') {
      filtered = result.data.filter(i => ['closed_won', 'closed_lost', 'stale'].includes(i.status));
      count = filtered.length;
    }

    setIntros(filtered);
    setTotalCount(count);
    if (statsResult) setStats(statsResult);
    setLoading(false);
  }, [user?.id, filter, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Fetch VSL engagement for visible intros
  useEffect(() => {
    const threadIds = intros
      .map(i => i.threadId)
      .filter((t): t is string => !!t);
    if (threadIds.length === 0) return;

    async function fetchEngagement() {
      const { data, error } = await supabase
        .from('vsl_engagement_by_thread')
        .select('thread_id, clicked_at, watched_at, vsl_url')
        .in('thread_id', threadIds);

      if (!error && data) {
        const map: Record<string, VslEngagement> = {};
        data.forEach((e: VslEngagement) => { map[e.thread_id] = e; });
        setEngagementMap(map);
      }
    }
    fetchEngagement();
  }, [intros]);

  // Real-time VSL events subscription
  useEffect(() => {
    const channel = supabase
      .channel('intro-vsl-engagement')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vsl_events' }, (payload) => {
        const event = payload.new as { thread_id: string; event_type: string; created_at: string; vsl_url: string };
        if (event.thread_id) {
          setEngagementMap(prev => {
            const existing = prev[event.thread_id] || { thread_id: event.thread_id, clicked_at: null, watched_at: null, vsl_url: null };
            return {
              ...prev,
              [event.thread_id]: {
                ...existing,
                clicked_at: event.event_type === 'clicked' ? event.created_at : existing.clicked_at,
                watched_at: event.event_type === 'watched' ? event.created_at : existing.watched_at,
                vsl_url: event.vsl_url || existing.vsl_url,
              },
            };
          });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ============================================================================
  // ACTIONS
  // ============================================================================

  const handleAction = async (action: string, data?: Record<string, unknown>) => {
    if (!selectedIntro) return;

    let success = false;

    switch (action) {
      case 'meeting':
        success = await markMeetingBooked(selectedIntro.id);
        break;
      case 'closed_won':
        success = await markOutcome(
          selectedIntro.id,
          'closed_won',
          data?.notes as string | undefined,
          data?.dealValue as number | undefined,
        );
        break;
      case 'closed_lost':
        success = await markOutcome(
          selectedIntro.id,
          'closed_lost',
          data?.notes as string | undefined,
        );
        break;
      case 'stale':
        success = await updateIntroStatus(selectedIntro.id, 'stale');
        break;
    }

    if (success) {
      setSelectedIntro(null);
      loadData();
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/launcher')}
            className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors"
          >
            <ArrowLeft size={18} className="text-white/40" />
          </button>
          <Network size={20} className="text-white/50" />
          <h1 className="text-lg font-semibold text-white/90 tracking-tight">Introductions</h1>
        </div>

        {/* Stats strip */}
        {stats && (
          <div className="flex gap-3 mb-6 overflow-x-auto">
            <StatCard
              label="Total"
              value={stats.total}
              icon={Send}
            />
            <StatCard
              label="Reply rate"
              value={pct(stats.replied, stats.total)}
              sub={`${stats.replied} replied`}
              icon={MessageSquare}
            />
            <StatCard
              label="Meeting rate"
              value={pct(stats.meetings, stats.total)}
              sub={`${stats.meetings} meetings`}
              icon={Calendar}
            />
            <StatCard
              label="Pipeline"
              value={stats.pipelineValue > 0 ? `$${stats.pipelineValue.toLocaleString()}` : '-'}
              sub={stats.closedWon > 0 ? `${stats.closedWon} won` : undefined}
              icon={DollarSign}
            />
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex items-center gap-1 mb-4 border-b border-white/[0.06] pb-px">
          {(['all', 'sent', 'replied', 'meeting', 'closed'] as FilterTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => { setFilter(tab); setPage(0); }}
              className={`px-3 py-2 text-xs font-medium transition-colors relative ${
                filter === tab
                  ? 'text-white/90'
                  : 'text-white/30 hover:text-white/50'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {filter === tab && (
                <div className="absolute bottom-0 left-0 right-0 h-px bg-white/50" />
              )}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={20} className="animate-spin text-white/20" />
          </div>
        ) : intros.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Network size={32} className="text-white/10 mb-3" />
            <p className="text-sm text-white/30">No introductions yet</p>
            <p className="text-xs text-white/20 mt-1">Send matches from Flow to start tracking</p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[10px] text-white/25 uppercase tracking-wider">
              <div className="col-span-2">Date</div>
              <div className="col-span-3">Demand</div>
              <div className="col-span-3">Supply</div>
              <div className="col-span-2">Match</div>
              <div className="col-span-2">Status</div>
            </div>

            {/* Table rows */}
            <div className="space-y-px">
              {intros.map((intro, i) => (
                <button
                  key={intro.id}
                  onClick={() => setSelectedIntro(intro)}
                  className="w-full grid grid-cols-12 gap-2 px-3 py-2.5 rounded-lg hover:bg-white/[0.03] transition-colors text-left"
                  style={{ animation: `rowFadeIn 0.3s ease ${i * 0.015}s both` }}
                >
                  <div className="col-span-2 text-[11px] text-white/30">
                    {formatTimeAgo(intro.createdAt)}
                  </div>
                  <div className="col-span-3">
                    <div className="text-xs text-white/70 truncate">{intro.demandCompany || intro.demandDomain}</div>
                    {intro.demandContactName && (
                      <div className="text-[10px] text-white/30 truncate">{intro.demandContactName}</div>
                    )}
                  </div>
                  <div className="col-span-3">
                    <div className="text-xs text-white/70 truncate">{intro.supplyCompany || intro.supplyDomain}</div>
                    {intro.supplyContactName && (
                      <div className="text-[10px] text-white/30 truncate">{intro.supplyContactName}</div>
                    )}
                  </div>
                  <div className="col-span-2">
                    <TierBadge tier={intro.matchTier} score={intro.matchScore} />
                  </div>
                  <div className="col-span-2 flex items-center gap-1.5">
                    <StatusPill status={intro.status} />
                    {intro.threadId && engagementMap[intro.threadId] && (engagementMap[intro.threadId].watched_at || engagementMap[intro.threadId].clicked_at) && (
                      <span
                        className={`inline-flex items-center px-1 py-0.5 rounded text-[9px] ${
                          engagementMap[intro.threadId].watched_at
                            ? 'text-emerald-400/70'
                            : 'text-amber-400/70'
                        }`}
                        title={engagementMap[intro.threadId].watched_at ? 'VSL watched' : 'VSL clicked'}
                      >
                        {engagementMap[intro.threadId].watched_at ? <Eye size={10} /> : <MousePointer size={10} />}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Pagination */}
            {totalCount > PAGE_SIZE && (
              <div className="flex items-center justify-between mt-4 px-3">
                <span className="text-[11px] text-white/25">
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1 text-xs text-white/40 hover:text-white/60 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={(page + 1) * PAGE_SIZE >= totalCount}
                    className="px-3 py-1 text-xs text-white/40 hover:text-white/60 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Insights panel removed — operator-only data, access via /operator */}
      </div>

      {/* Detail modal */}
      {selectedIntro && (
        <IntroDetailModal
          intro={selectedIntro}
          onClose={() => setSelectedIntro(null)}
          onAction={handleAction}
          engagement={selectedIntro.threadId ? engagementMap[selectedIntro.threadId] : null}
        />
      )}

      {/* Row fade-in animation */}
      <style>{`
        @keyframes rowFadeIn {
          0% { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
