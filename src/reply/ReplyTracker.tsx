import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageSquare, Clock, CheckCircle, AlertCircle, RefreshCw, Mail, ExternalLink } from 'lucide-react';
import Dock from '../Dock';
import { supabase } from '../lib/supabase';

interface Reply {
  id: string;
  lead_email: string;
  campaign_id: string | null;
  thread_id: string;
  replied_at: string;
  direction: string;
  reply_body: string | null;
  created_at: string;
}

interface ReplyStats {
  today: number;
  thisWeek: number;
  thisMonth: number;
  total: number;
}

type StatusFilter = 'all' | 'new' | 'handled';

/**
 * ReplyTracker - Deal flow visualizer for reply tracking
 *
 * Shows all inbound replies with status, timeline, and actions.
 * Apple-style design matching the rest of Connector OS.
 */
export default function ReplyTracker() {
  const navigate = useNavigate();
  const [replies, setReplies] = useState<Reply[]>([]);
  const [stats, setStats] = useState<ReplyStats>({ today: 0, thisWeek: 0, thisMonth: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [selectedReply, setSelectedReply] = useState<Reply | null>(null);

  // Fetch replies from Supabase
  const fetchReplies = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('replies')
        .select('*')
        .eq('direction', 'inbound')
        .order('replied_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('[ReplyTracker] Fetch error:', error);
        setReplies([]);
      } else {
        setReplies(data || []);
        calculateStats(data || []);
      }
    } catch (err) {
      console.error('[ReplyTracker] Exception:', err);
    }
    setLoading(false);
  };

  // Calculate stats from replies
  const calculateStats = (data: Reply[]) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const stats: ReplyStats = {
      today: 0,
      thisWeek: 0,
      thisMonth: 0,
      total: data.length,
    };

    data.forEach(reply => {
      const replyDate = new Date(reply.replied_at);
      if (replyDate >= todayStart) stats.today++;
      if (replyDate >= weekStart) stats.thisWeek++;
      if (replyDate >= monthStart) stats.thisMonth++;
    });

    setStats(stats);
  };

  useEffect(() => {
    fetchReplies();

    // Set up realtime subscription
    const channel = supabase
      .channel('reply-tracker')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'replies',
        filter: 'direction=eq.inbound',
      }, (payload) => {
        const newReply = payload.new as Reply;
        setReplies(prev => [newReply, ...prev]);
        setStats(prev => ({
          ...prev,
          today: prev.today + 1,
          thisWeek: prev.thisWeek + 1,
          thisMonth: prev.thisMonth + 1,
          total: prev.total + 1,
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Format relative time
  const formatRelativeTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Get email username
  const getEmailName = (email: string): string => {
    return email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  // Get email domain
  const getEmailDomain = (email: string): string => {
    return email.split('@')[1] || '';
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0E0E0E] to-[#0A0A0A] text-white">
      {/* Header */}
      <div className="px-8 pt-10 pb-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="p-2 rounded-xl hover:bg-white/[0.04] transition-colors"
              >
                <ArrowLeft size={18} className="text-white/50" />
              </button>
              <div>
                <h1 className="text-[20px] font-semibold text-white/90 tracking-[-0.01em]">Inbound</h1>
                <p className="text-[13px] text-white/40 mt-0.5">Intros becoming deals</p>
              </div>
            </div>
            <button
              onClick={fetchReplies}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-all"
            >
              <RefreshCw size={14} className={`text-white/50 ${loading ? 'animate-spin' : ''}`} />
              <span className="text-[12px] text-white/60 font-medium">Refresh</span>
            </button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Today', value: stats.today, color: 'emerald' },
              { label: 'This Week', value: stats.thisWeek, color: 'blue' },
              { label: 'This Month', value: stats.thisMonth, color: 'purple' },
              { label: 'All Time', value: stats.total, color: 'white' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="p-4 rounded-2xl border border-white/[0.06]"
                style={{ background: 'rgba(255,255,255,0.015)' }}
              >
                <div className={`text-[28px] font-semibold tracking-tight ${
                  stat.color === 'emerald' ? 'text-emerald-400' :
                  stat.color === 'blue' ? 'text-blue-400' :
                  stat.color === 'purple' ? 'text-purple-400' :
                  'text-white/80'
                }`}>
                  {stat.value}
                </div>
                <div className="text-[11px] text-white/40 font-medium mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-2 mb-6">
            {(['all', 'new', 'handled'] as StatusFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-full text-[12px] font-medium transition-all ${
                  filter === f
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'text-white/40 hover:text-white/60 border border-transparent'
                }`}
              >
                {f === 'all' ? 'All Replies' : f === 'new' ? 'New' : 'Handled'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Reply List */}
      <div className="px-8 pb-32">
        <div className="max-w-5xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="w-10 h-10 rounded-full border border-white/[0.08] flex items-center justify-center mx-auto mb-4">
                  <RefreshCw size={18} className="animate-spin text-white/40" />
                </div>
                <p className="text-[13px] text-white/40">Loading replies...</p>
              </div>
            </div>
          ) : replies.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                  <MessageSquare size={24} className="text-white/30" />
                </div>
                <p className="text-[15px] text-white/60 font-medium mb-1">No replies yet</p>
                <p className="text-[12px] text-white/30">Replies will appear here when contacts respond</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {replies.map((reply) => (
                <div
                  key={reply.id}
                  onClick={() => setSelectedReply(selectedReply?.id === reply.id ? null : reply)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    selectedReply?.id === reply.id
                      ? 'bg-white/[0.04] border-white/[0.12]'
                      : 'bg-white/[0.015] border-white/[0.06] hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center flex-shrink-0">
                        <span className="text-[14px] font-semibold text-white/60">
                          {reply.lead_email.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      {/* Content */}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] font-medium text-white/80">
                            {getEmailName(reply.lead_email)}
                          </span>
                          <span className="text-[11px] text-white/30">
                            @{getEmailDomain(reply.lead_email)}
                          </span>
                        </div>
                        {reply.reply_body && (
                          <p className="text-[12px] text-white/50 mt-1 line-clamp-2 max-w-md">
                            {reply.reply_body.slice(0, 150)}{reply.reply_body.length > 150 ? '...' : ''}
                          </p>
                        )}
                        {/* Tags */}
                        <div className="flex items-center gap-2 mt-2">
                          {reply.campaign_id && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-blue-500/10 text-blue-400/80 border border-blue-500/20">
                              {reply.campaign_id.slice(0, 8)}...
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Time */}
                    <div className="flex items-center gap-1.5 text-white/30">
                      <Clock size={12} />
                      <span className="text-[11px] font-medium">{formatRelativeTime(reply.replied_at)}</span>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {selectedReply?.id === reply.id && reply.reply_body && (
                    <div className="mt-4 pt-4 border-t border-white/[0.06]">
                      <div className="text-[10px] text-white/30 uppercase tracking-wide mb-2">Full Reply</div>
                      <p className="text-[13px] text-white/60 leading-relaxed whitespace-pre-wrap">
                        {reply.reply_body}
                      </p>
                      <div className="flex items-center gap-3 mt-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate('/msg-sim');
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] transition-colors"
                        >
                          <Mail size={12} className="text-white/50" />
                          <span className="text-[11px] text-white/60 font-medium">Open in Msg Sim</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(`mailto:${reply.lead_email}`, '_blank');
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] transition-colors"
                        >
                          <ExternalLink size={12} className="text-white/50" />
                          <span className="text-[11px] text-white/60 font-medium">Email directly</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dock />
    </div>
  );
}
