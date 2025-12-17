import { useState, useEffect } from 'react';
import { ArrowLeft, TrendingUp, Users, Mail, Zap, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './lib/supabase';

interface DashboardMetrics {
  today: {
    signalsDetected: number;
    highFitCompanies: number;
    contactsEnriched: number;
    introsGenerated: number;
    sentToInstantly: number;
  };
  thisWeek: {
    totalOpportunities: number;
    matchRate: number;
    enrichmentRate: number;
    sendRate: number;
  };
  campaigns: {
    demandLeads: number;
    supplyLeads: number;
  };
  signals: {
    hiring: number;
    funding: number;
    layoffs: number;
  };
}

export function Dashboard() {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    today: {
      signalsDetected: 0,
      highFitCompanies: 0,
      contactsEnriched: 0,
      introsGenerated: 0,
      sentToInstantly: 0,
    },
    thisWeek: {
      totalOpportunities: 0,
      matchRate: 0,
      enrichmentRate: 0,
      sendRate: 0,
    },
    campaigns: {
      demandLeads: 0,
      supplyLeads: 0,
    },
    signals: {
      hiring: 0,
      funding: 0,
      layoffs: 0,
    },
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    try {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - 7);

      const { data: sendsToday } = await supabase
        .from('connector_sends')
        .select('send_type')
        .gte('created_at', startOfToday.toISOString());

      const { data: sendsThisWeek } = await supabase
        .from('connector_sends')
        .select('*')
        .gte('created_at', startOfWeek.toISOString());

      const { data: signalsToday } = await supabase
        .from('signal_history')
        .select('*')
        .gte('created_at', startOfToday.toISOString());

      const { data: signalsThisWeek } = await supabase
        .from('signal_history')
        .select('*')
        .gte('created_at', startOfWeek.toISOString());

      const demandLeads = (sendsToday || []).filter(s => s.send_type === 'DEMAND').length;
      const supplyLeads = (sendsToday || []).filter(s => s.send_type === 'SUPPLY').length;

      const totalWeekSends = sendsThisWeek?.length || 0;
      const totalWeekSignals = signalsThisWeek?.length || 0;

      setMetrics({
        today: {
          signalsDetected: signalsToday?.length || 0,
          highFitCompanies: signalsToday?.filter(s => s.signal_strength > 70).length || 0,
          contactsEnriched: signalsToday?.filter(s => s.person_email).length || 0,
          introsGenerated: signalsToday?.filter(s => s.person_email).length || 0,
          sentToInstantly: (sendsToday?.length || 0),
        },
        thisWeek: {
          totalOpportunities: totalWeekSignals,
          matchRate: totalWeekSignals > 0 ? Math.round((totalWeekSignals / totalWeekSignals) * 100) : 0,
          enrichmentRate: totalWeekSignals > 0
            ? Math.round(((signalsThisWeek?.filter(s => s.person_email).length || 0) / totalWeekSignals) * 100)
            : 0,
          sendRate: totalWeekSignals > 0
            ? Math.round((totalWeekSends / totalWeekSignals) * 100)
            : 0,
        },
        campaigns: {
          demandLeads,
          supplyLeads,
        },
        signals: {
          hiring: signalsToday?.filter(s => s.jobs_count > 0).length || 0,
          funding: signalsToday?.filter(s => s.funding_amount > 0).length || 0,
          layoffs: signalsToday?.filter(s => s.layoffs_count > 0).length || 0,
        },
      });
    } catch (error) {
      console.error('Error loading metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const MetricCard = ({ title, value, subtitle, icon: Icon, color }: {
    title: string;
    value: number | string;
    subtitle?: string;
    icon: any;
    color: string;
  }) => (
    <div className="bg-[#0C0C0C] rounded-lg p-6 border border-[#1C1C1C] relative overflow-hidden">
      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-${color} to-transparent opacity-10 rounded-full blur-3xl`}></div>
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <Icon size={20} className={`text-${color}`} />
        </div>
        <div className="text-3xl font-semibold text-white mb-1">{value}</div>
        <div className="text-sm text-white/60">{title}</div>
        {subtitle && <div className="text-xs text-white/40 mt-1">{subtitle}</div>}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0E0E0E] to-[#0A0A0A] text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0E0E0E] to-[#0A0A0A] text-white px-8 py-12">
      <div className="max-w-[1200px] mx-auto">
        <button
          onClick={() => navigate('/launcher')}
          className="flex items-center gap-2 mb-6 text-sm text-gray-400 hover:text-gray-200 transition-colors duration-200"
        >
          <ArrowLeft size={16} />
          Back to Connector OS
        </button>

        <div className="mb-8">
          <div className="inline-block px-2.5 py-1 bg-[#0F1B17] text-[#3A9CFF] text-[10px] font-medium rounded-full mb-2 border-b border-[#3A9CFF] border-opacity-30">
            Connector OS
          </div>
          <h1 className="text-[32px] font-medium text-white mb-1.5">Operator Dashboard</h1>
          <p className="text-[17px] font-light text-white text-opacity-75">
            Did I build real leverage today?
          </p>
        </div>

        <div className="space-y-8">
          <section>
            <h2 className="text-lg font-medium text-white/90 mb-4">Today</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <MetricCard
                title="Signals Detected"
                value={metrics.today.signalsDetected}
                icon={TrendingUp}
                color="blue-400"
              />
              <MetricCard
                title="High-Fit Companies"
                value={metrics.today.highFitCompanies}
                icon={AlertCircle}
                color="emerald-400"
              />
              <MetricCard
                title="Contacts Enriched"
                value={metrics.today.contactsEnriched}
                icon={Users}
                color="amber-400"
              />
              <MetricCard
                title="Intros Generated"
                value={metrics.today.introsGenerated}
                icon={Mail}
                color="violet-400"
              />
              <MetricCard
                title="Sent to Instantly"
                value={metrics.today.sentToInstantly}
                icon={Zap}
                color="emerald-400"
              />
            </div>
          </section>

          <section>
            <h2 className="text-lg font-medium text-white/90 mb-4">This Week</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                title="Total Opportunities"
                value={metrics.thisWeek.totalOpportunities}
                icon={TrendingUp}
                color="blue-400"
              />
              <MetricCard
                title="Match Rate"
                value={`${metrics.thisWeek.matchRate}%`}
                icon={AlertCircle}
                color="emerald-400"
              />
              <MetricCard
                title="Enrichment Rate"
                value={`${metrics.thisWeek.enrichmentRate}%`}
                icon={Users}
                color="amber-400"
              />
              <MetricCard
                title="Send Rate"
                value={`${metrics.thisWeek.sendRate}%`}
                icon={Zap}
                color="violet-400"
              />
            </div>
          </section>

          <section>
            <h2 className="text-lg font-medium text-white/90 mb-4">Campaign Breakdown</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <MetricCard
                title="Demand Campaign Leads"
                value={metrics.campaigns.demandLeads}
                subtitle="Companies that need help"
                icon={Users}
                color="blue-400"
              />
              <MetricCard
                title="Supply Campaign Leads"
                value={metrics.campaigns.supplyLeads}
                subtitle="Providers you connected"
                icon={Users}
                color="emerald-400"
              />
            </div>
          </section>

          <section>
            <h2 className="text-lg font-medium text-white/90 mb-4">Signal Breakdown</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <MetricCard
                title="Hiring Signals"
                value={metrics.signals.hiring}
                icon={TrendingUp}
                color="blue-400"
              />
              <MetricCard
                title="Funding Signals"
                value={metrics.signals.funding}
                icon={TrendingUp}
                color="emerald-400"
              />
              <MetricCard
                title="Layoff Signals"
                value={metrics.signals.layoffs}
                icon={AlertCircle}
                color="orange-400"
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
