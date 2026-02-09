import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  MessageCircle,
  ThumbsUp,
  ThumbsDown,
  Clock,
  HelpCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import Dock from '../Dock';

// =============================================================================
// TYPES
// =============================================================================

interface QuestionRow {
  id: string;
  user_id: string;
  user_email: string | null;
  question: string;
  answer: string | null;
  feedback: 'up' | 'down' | null;
  latency_ms: number | null;
  created_at: string;
}

type TimeFilter = 'today' | '7d' | '30d' | 'all';

// =============================================================================
// HELPERS
// =============================================================================

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getCutoffDate(filter: TimeFilter): string | null {
  const now = new Date();
  switch (filter) {
    case 'today': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return start.toISOString();
    }
    case '7d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d.toISOString();
    }
    case '30d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return d.toISOString();
    }
    case 'all':
      return null;
  }
}

function formatLatency(ms: number | null): string {
  if (ms === null || ms === undefined) return '--';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function AssistantInsights() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('7d');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('assistant_questions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      const cutoff = getCutoffDate(timeFilter);
      if (cutoff) {
        query = query.gte('created_at', cutoff);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[AssistantInsights] Fetch error:', error.message);
        setQuestions([]);
      } else {
        setQuestions(data || []);
      }
    } catch (err) {
      console.error('[AssistantInsights] Unexpected error:', err);
      setQuestions([]);
    }
    setLoading(false);
  }, [timeFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Stats
  const totalQuestions = questions.length;
  const withFeedback = questions.filter(q => q.feedback !== null);
  const helpful = withFeedback.filter(q => q.feedback === 'up').length;
  const notHelpful = withFeedback.filter(q => q.feedback === 'down').length;
  const helpfulPct = withFeedback.length > 0 ? Math.round((helpful / withFeedback.length) * 100) : 0;
  const notHelpfulPct = withFeedback.length > 0 ? Math.round((notHelpful / withFeedback.length) * 100) : 0;

  const latencies = questions.filter(q => q.latency_ms !== null).map(q => q.latency_ms!);
  const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;

  const timeFilters: { key: TimeFilter; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: '7d', label: '7d' },
    { key: '30d', label: '30d' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/launcher')}
              className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-500/[0.08] border border-violet-500/20 flex items-center justify-center">
                <MessageCircle size={16} className="text-violet-400/80" />
              </div>
              <div>
                <h1 className="text-[17px] font-semibold text-white/90 tracking-[-0.01em]">
                  Ask Insights
                </h1>
                <p className="text-[11px] text-white/35">
                  What members are asking
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Time filter */}
            <div className="flex items-center bg-white/[0.03] border border-white/[0.06] rounded-lg overflow-hidden">
              {timeFilters.map(f => (
                <button
                  key={f.key}
                  onClick={() => setTimeFilter(f.key)}
                  className={`px-3 py-1.5 text-[11px] font-medium transition-all ${
                    timeFilter === f.key
                      ? 'bg-white/[0.08] text-white/80'
                      : 'text-white/30 hover:text-white/50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all disabled:opacity-30"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={<HelpCircle size={14} className="text-white/40" />}
            label="Total questions"
            value={totalQuestions.toString()}
          />
          <StatCard
            icon={<ThumbsUp size={14} className="text-emerald-400/70" />}
            label="Helpful"
            value={helpful.toString()}
            sub={withFeedback.length > 0 ? `${helpfulPct}%` : undefined}
            accent="emerald"
          />
          <StatCard
            icon={<ThumbsDown size={14} className="text-red-400/70" />}
            label="Not helpful"
            value={notHelpful.toString()}
            sub={withFeedback.length > 0 ? `${notHelpfulPct}%` : undefined}
            accent="red"
          />
          <StatCard
            icon={<Clock size={14} className="text-white/40" />}
            label="Avg response"
            value={formatLatency(avgLatency)}
          />
        </div>

        {/* Questions table */}
        <div className="border border-white/[0.06] rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-white/[0.06] bg-white/[0.02]">
            <div className="col-span-5 text-[10px] font-medium text-white/30 uppercase tracking-wider">
              Question
            </div>
            <div className="col-span-3 text-[10px] font-medium text-white/30 uppercase tracking-wider">
              Answer
            </div>
            <div className="col-span-1 text-[10px] font-medium text-white/30 uppercase tracking-wider text-center">
              Feedback
            </div>
            <div className="col-span-1 text-[10px] font-medium text-white/30 uppercase tracking-wider text-right">
              Latency
            </div>
            <div className="col-span-2 text-[10px] font-medium text-white/30 uppercase tracking-wider text-right">
              Time
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={18} className="animate-spin text-white/30" />
            </div>
          )}

          {/* Empty state */}
          {!loading && questions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <MessageCircle size={24} className="text-white/15 mb-3" />
              <p className="text-[13px] text-white/30">No questions yet</p>
              <p className="text-[11px] text-white/20 mt-1">
                Questions from ConnectorAsk will appear here
              </p>
            </div>
          )}

          {/* Rows */}
          {!loading && questions.map(q => (
            <div key={q.id}>
              <button
                onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                className="w-full grid grid-cols-12 gap-2 px-5 py-3.5 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors text-left"
              >
                {/* Question */}
                <div className="col-span-5 flex items-start gap-2 min-w-0">
                  {expandedId === q.id
                    ? <ChevronDown size={12} className="text-white/20 mt-0.5 flex-shrink-0" />
                    : <ChevronRight size={12} className="text-white/20 mt-0.5 flex-shrink-0" />
                  }
                  <span className="text-[13px] text-white/70 truncate">
                    {q.question}
                  </span>
                </div>

                {/* Answer preview */}
                <div className="col-span-3 min-w-0">
                  <span className="text-[12px] text-white/35 truncate block">
                    {q.answer ? q.answer.slice(0, 80) + (q.answer.length > 80 ? '...' : '') : '--'}
                  </span>
                </div>

                {/* Feedback */}
                <div className="col-span-1 flex justify-center">
                  {q.feedback === 'up' && <ThumbsUp size={13} className="text-emerald-400/70" />}
                  {q.feedback === 'down' && <ThumbsDown size={13} className="text-red-400/70" />}
                  {!q.feedback && <span className="text-[11px] text-white/15">--</span>}
                </div>

                {/* Latency */}
                <div className="col-span-1 text-right">
                  <span className="text-[11px] text-white/30 font-mono">
                    {formatLatency(q.latency_ms)}
                  </span>
                </div>

                {/* Time */}
                <div className="col-span-2 text-right">
                  <span className="text-[11px] text-white/30">
                    {formatTimeAgo(q.created_at)}
                  </span>
                </div>
              </button>

              {/* Expanded answer */}
              {expandedId === q.id && q.answer && (
                <div className="px-5 py-4 border-b border-white/[0.04] bg-white/[0.015]">
                  <div className="ml-5">
                    <div className="text-[10px] font-medium text-white/25 uppercase tracking-wider mb-2">
                      Full answer
                    </div>
                    <div className="text-[12px] text-white/50 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                      {q.answer}
                    </div>
                    {q.user_email && (
                      <div className="mt-3 text-[10px] text-white/20">
                        Asked by {q.user_email}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <Dock />
    </div>
  );
}

// =============================================================================
// STAT CARD
// =============================================================================

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: 'emerald' | 'red';
}) {
  return (
    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[10px] font-medium text-white/30 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[22px] font-semibold text-white/85 tracking-tight">
          {value}
        </span>
        {sub && (
          <span className={`text-[11px] font-medium ${
            accent === 'emerald' ? 'text-emerald-400/60' :
            accent === 'red' ? 'text-red-400/60' :
            'text-white/30'
          }`}>
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}
