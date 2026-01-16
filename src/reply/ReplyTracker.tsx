import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, MessageSquare, Clock, RefreshCw, Mail, ExternalLink, Eye, MousePointer } from 'lucide-react';
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

interface VslEngagement {
  thread_id: string;
  clicked_at: string | null;
  watched_at: string | null;
  vsl_url: string | null;
}

type StatusFilter = 'all' | 'new' | 'handled';

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 400, damping: 30 }
  }
};

const statsVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 400, damping: 25 }
  }
};

const expandVariants = {
  hidden: { opacity: 0, height: 0 },
  visible: {
    opacity: 1,
    height: 'auto',
    transition: { type: 'spring', stiffness: 300, damping: 30 }
  },
  exit: {
    opacity: 0,
    height: 0,
    transition: { duration: 0.2 }
  }
};

export default function ReplyTracker() {
  const navigate = useNavigate();
  const [replies, setReplies] = useState<Reply[]>([]);
  const [stats, setStats] = useState<ReplyStats>({ today: 0, thisWeek: 0, thisMonth: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [selectedReply, setSelectedReply] = useState<Reply | null>(null);
  const [engagementMap, setEngagementMap] = useState<Record<string, VslEngagement>>({});

  const fetchEngagement = async (threadIds: string[]) => {
    if (threadIds.length === 0) return;
    console.log('[ReplyTracker] Fetching engagement for threads:', threadIds);
    try {
      const { data, error } = await supabase
        .from('vsl_engagement_by_thread')
        .select('thread_id, clicked_at, watched_at, vsl_url')
        .in('thread_id', threadIds);

      console.log('[ReplyTracker] Engagement response:', { data, error });

      if (!error && data) {
        const map: Record<string, VslEngagement> = {};
        data.forEach((e: VslEngagement) => { map[e.thread_id] = e; });
        console.log('[ReplyTracker] Engagement map:', map);
        setEngagementMap(map);
      }
    } catch (err) {
      console.error('[ReplyTracker] Engagement exception:', err);
    }
  };

  const fetchReplies = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('replies')
        .select('*')
        .eq('direction', 'inbound')
        .order('replied_at', { ascending: false })
        .limit(100);

      if (!error && data) {
        setReplies(data);
        calculateStats(data);
        const threadIds = [...new Set(data.map(r => r.thread_id).filter(Boolean))];
        await fetchEngagement(threadIds);
      }
    } catch (err) {
      console.error('[ReplyTracker] Exception:', err);
    }
    setLoading(false);
  };

  const calculateStats = (data: Reply[]) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const s: ReplyStats = { today: 0, thisWeek: 0, thisMonth: 0, total: data.length };
    data.forEach(reply => {
      const d = new Date(reply.replied_at);
      if (d >= todayStart) s.today++;
      if (d >= weekStart) s.thisWeek++;
      if (d >= monthStart) s.thisMonth++;
    });
    setStats(s);
  };

  useEffect(() => {
    fetchReplies();

    const repliesChannel = supabase
      .channel('reply-tracker')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'replies', filter: 'direction=eq.inbound' }, (payload) => {
        const newReply = payload.new as Reply;
        setReplies(prev => [newReply, ...prev]);
        setStats(prev => ({ ...prev, today: prev.today + 1, thisWeek: prev.thisWeek + 1, thisMonth: prev.thisMonth + 1, total: prev.total + 1 }));
      })
      .subscribe();

    const vslChannel = supabase
      .channel('vsl-engagement-tracker')
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
              }
            };
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(repliesChannel);
      supabase.removeChannel(vslChannel);
    };
  }, []);

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

  const formatTime = (dateStr: string): string => new Date(dateStr).toLocaleString();
  const getEmailName = (email: string): string => email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const getEmailDomain = (email: string): string => email.split('@')[1] || '';
  const getEngagementStatus = (threadId: string): 'watched' | 'clicked' | 'none' => {
    const e = engagementMap[threadId];
    if (!e) return 'none';
    if (e.watched_at) return 'watched';
    if (e.clicked_at) return 'clicked';
    return 'none';
  };

  const statCards = [
    { label: 'Today', value: stats.today, gradient: 'from-emerald-500/20 to-emerald-500/5', text: 'text-emerald-400', border: 'border-emerald-500/20' },
    { label: 'This Week', value: stats.thisWeek, gradient: 'from-blue-500/20 to-blue-500/5', text: 'text-blue-400', border: 'border-blue-500/20' },
    { label: 'This Month', value: stats.thisMonth, gradient: 'from-purple-500/20 to-purple-500/5', text: 'text-purple-400', border: 'border-purple-500/20' },
    { label: 'All Time', value: stats.total, gradient: 'from-white/10 to-white/5', text: 'text-white/80', border: 'border-white/10' },
  ];

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Ambient background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-purple-500/[0.03] rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-500/[0.03] rounded-full blur-[120px]" />
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
          className="px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10 pb-6"
        >
          <div className="max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div className="flex items-center gap-3 sm:gap-4">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate('/')}
                  className="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] transition-colors"
                >
                  <ArrowLeft size={18} className="text-white/50" />
                </motion.button>
                <div>
                  <div className="flex items-center gap-2">
                    <MessageSquare size={20} className="text-white/40" />
                    <h1 className="text-lg sm:text-xl font-semibold text-white/90 tracking-[-0.02em]">Inbound</h1>
                  </div>
                  <p className="text-xs sm:text-[13px] text-white/40 mt-0.5">Intros becoming deals</p>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={fetchReplies}
                disabled={loading}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] transition-all group"
              >
                <RefreshCw size={14} className={`text-white/50 group-hover:text-white/70 transition-colors ${loading ? 'animate-spin' : ''}`} />
                <span className="text-xs text-white/50 group-hover:text-white/70 font-medium transition-colors">Refresh</span>
              </motion.button>
            </div>

            {/* Stats Grid */}
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8"
            >
              {statCards.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  variants={statsVariants}
                  whileHover={{ scale: 1.02, y: -2 }}
                  className={`relative p-4 sm:p-5 rounded-2xl border ${stat.border} bg-gradient-to-b ${stat.gradient} backdrop-blur-sm overflow-hidden group cursor-default`}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <motion.div
                    className={`text-2xl sm:text-3xl font-semibold tracking-tight ${stat.text}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + i * 0.1 }}
                  >
                    {stat.value}
                  </motion.div>
                  <div className="text-[10px] sm:text-[11px] text-white/40 font-medium mt-1 uppercase tracking-wider">{stat.label}</div>
                </motion.div>
              ))}
            </motion.div>

            {/* Filter Tabs */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="flex items-center gap-1 sm:gap-2 mb-6 overflow-x-auto pb-2"
            >
              {(['all', 'new', 'handled'] as StatusFilter[]).map((f) => (
                <motion.button
                  key={f}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setFilter(f)}
                  className={`px-3 sm:px-4 py-2 rounded-full text-[11px] sm:text-[12px] font-medium transition-all whitespace-nowrap ${
                    filter === f
                      ? 'bg-white/10 text-white border border-white/20 shadow-[0_0_20px_rgba(255,255,255,0.05)]'
                      : 'text-white/40 hover:text-white/60 hover:bg-white/[0.03] border border-transparent'
                  }`}
                >
                  {f === 'all' ? 'All Replies' : f === 'new' ? 'New' : 'Handled'}
                </motion.button>
              ))}
            </motion.div>
          </div>
        </motion.div>

        {/* Reply List */}
        <div className="px-4 sm:px-6 lg:px-8 pb-32">
          <div className="max-w-5xl mx-auto">
            {loading ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-center py-20"
              >
                <div className="text-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-10 h-10 rounded-full border border-white/[0.08] border-t-white/30 mx-auto mb-4"
                  />
                  <p className="text-[13px] text-white/40">Loading replies...</p>
                </div>
              </motion.div>
            ) : replies.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="flex items-center justify-center py-20"
              >
                <div className="text-center">
                  <motion.div
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                    className="w-16 h-16 rounded-2xl bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/[0.06] flex items-center justify-center mx-auto mb-4"
                  >
                    <MessageSquare size={28} className="text-white/20" />
                  </motion.div>
                  <p className="text-[15px] text-white/60 font-medium mb-1">No replies yet</p>
                  <p className="text-[12px] text-white/30 max-w-[200px] mx-auto">Replies will appear here when contacts respond to your outreach</p>
                </div>
              </motion.div>
            ) : (
              <div className="space-y-2">
                {replies.map((reply, index) => (
                  <div
                    key={reply.id}
                    onClick={() => setSelectedReply(selectedReply?.id === reply.id ? null : reply)}
                    className={`group p-4 rounded-xl border transition-all duration-300 cursor-pointer ${
                      selectedReply?.id === reply.id
                        ? 'bg-white/[0.04] border-white/[0.15] shadow-[0_0_30px_rgba(255,255,255,0.03)]'
                        : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.1]'
                    }`}
                    style={{ animationDelay: `${index * 0.03}s` }}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        {/* Avatar */}
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-white/10 to-white/5 border border-white/[0.08] flex items-center justify-center flex-shrink-0 hover:scale-105 transition-transform">
                          <span className="text-[14px] font-semibold text-white/60">
                            {reply.lead_email.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-[14px] font-medium text-white/80 truncate">
                              {getEmailName(reply.lead_email)}
                            </span>
                            <span className="text-[11px] text-white/30 truncate">
                              @{getEmailDomain(reply.lead_email)}
                            </span>
                          </div>
                          {reply.reply_body && (
                            <p className="text-[12px] text-white/40 mt-1 line-clamp-2 leading-relaxed">
                              {reply.reply_body.slice(0, 150)}{reply.reply_body.length > 150 ? '...' : ''}
                            </p>
                          )}
                          {/* Tags */}
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            {reply.campaign_id && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-blue-500/10 text-blue-400/70 border border-blue-500/20">
                                {reply.campaign_id.slice(0, 8)}...
                              </span>
                            )}
                            {/* Engagement badge - renders for threads with VSL events */}
                            {engagementMap[reply.thread_id] && (engagementMap[reply.thread_id].watched_at || engagementMap[reply.thread_id].clicked_at) && (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                  engagementMap[reply.thread_id].watched_at
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                }`}
                              >
                                {engagementMap[reply.thread_id].watched_at ? <Eye size={10} /> : <MousePointer size={10} />}
                                {engagementMap[reply.thread_id].watched_at ? 'Watched' : 'Clicked'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Time */}
                      <div className="flex items-center gap-1.5 text-white/30 sm:flex-shrink-0 ml-[52px] sm:ml-0">
                        <Clock size={12} />
                        <span className="text-[11px] font-medium">{formatRelativeTime(reply.replied_at)}</span>
                      </div>
                    </div>

                    {/* Expanded Content */}
                    <AnimatePresence>
                      {selectedReply?.id === reply.id && (
                        <motion.div
                          variants={expandVariants}
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                          className="overflow-hidden"
                        >
                          <div className="mt-4 pt-4 border-t border-white/[0.06]">
                            {/* VSL Engagement Details */}
                            {engagementMap[reply.thread_id] && (
                              <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className="mb-4 p-3 rounded-xl bg-gradient-to-b from-white/[0.03] to-transparent border border-white/[0.06]"
                              >
                                <div className="text-[10px] text-white/30 uppercase tracking-wider mb-2 font-medium">VSL Engagement</div>
                                <div className="flex flex-wrap items-center gap-4 text-[12px]">
                                  {engagementMap[reply.thread_id].clicked_at && (
                                    <motion.div
                                      initial={{ opacity: 0, x: -10 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      className="flex items-center gap-1.5 text-amber-400/80"
                                    >
                                      <MousePointer size={12} />
                                      <span>Clicked {formatRelativeTime(engagementMap[reply.thread_id].clicked_at!)}</span>
                                    </motion.div>
                                  )}
                                  {engagementMap[reply.thread_id].watched_at && (
                                    <motion.div
                                      initial={{ opacity: 0, x: -10 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ delay: 0.05 }}
                                      className="flex items-center gap-1.5 text-emerald-400/80"
                                    >
                                      <Eye size={12} />
                                      <span>Watched {formatRelativeTime(engagementMap[reply.thread_id].watched_at!)}</span>
                                    </motion.div>
                                  )}
                                </div>
                              </motion.div>
                            )}

                            {reply.reply_body && (
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.15 }}
                              >
                                <div className="text-[10px] text-white/30 uppercase tracking-wider mb-2 font-medium">Full Reply</div>
                                <p className="text-[13px] text-white/50 leading-relaxed whitespace-pre-wrap">
                                  {reply.reply_body}
                                </p>
                              </motion.div>
                            )}

                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.2 }}
                              className="flex flex-wrap items-center gap-2 sm:gap-3 mt-4"
                            >
                              <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={(e) => { e.stopPropagation(); navigate('/msg-sim'); }}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.12] transition-all"
                              >
                                <Mail size={12} className="text-white/50" />
                                <span className="text-[11px] text-white/60 font-medium">Open in Msg Sim</span>
                              </motion.button>
                              <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={(e) => { e.stopPropagation(); window.open(`mailto:${reply.lead_email}`, '_blank'); }}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.12] transition-all"
                              >
                                <ExternalLink size={12} className="text-white/50" />
                                <span className="text-[11px] text-white/60 font-medium">Email directly</span>
                              </motion.button>
                            </motion.div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Dock />
    </div>
  );
}
