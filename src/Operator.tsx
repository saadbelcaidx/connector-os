/**
 * Operator Console — myoProcess Pipeline Dashboard
 *
 * Hidden route: /operator
 * JP Morgan energy. Bloomberg darkness. Real numbers.
 */

import { useState, useEffect } from 'react';
import { ArrowDown, TrendingUp, Activity, Target, DollarSign } from 'lucide-react';

// =============================================================================
// DATA — Edit these numbers manually
// =============================================================================

const PIPELINE_DATA = {
  totalDealFlow: 875000,
  routesMade: 47,
  standardsMet: 41,
  activeRoutes: 12,
  opportunitiesTracked: 200,

  topRoutes: [
    { category: 'M&A Advisory', value: 85000 },
    { category: 'Executive Recruiting', value: 40000 },
    { category: 'Capital Introduction', value: 60000 },
    { category: 'SaaS Sales Hire', value: 35000 },
  ],

  recentActivity: [
    { time: '2:34 PM', type: 'closed', desc: 'M&A Advisory route  ·  $85K' },
    { time: '11:22 AM', type: 'intro', desc: 'Biotech CFO ↔ Licensing Partner' },
    { time: '9:15 AM', type: 'reply', desc: 'Capital intro  ·  "Let\'s talk Thursday"' },
    { time: 'Yesterday', type: 'closed', desc: 'Executive search  ·  $40K' },
  ],
};

// =============================================================================
// COMPONENTS
// =============================================================================

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toLocaleString()}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function AnimatedCounter({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const duration = 2000;
    const steps = 60;
    const increment = value / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setDisplay(value);
        clearInterval(timer);
      } else {
        setDisplay(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value]);

  return (
    <span className="tabular-nums">
      {prefix}{display >= 1000000
        ? `${(display / 1000000).toFixed(1)}M`
        : display >= 1000
          ? `${Math.floor(display / 1000)}K`
          : display.toLocaleString()
      }{suffix}
    </span>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function Operator() {
  const data = PIPELINE_DATA;
  const avgRouteValue = Math.round(data.totalDealFlow / data.routesMade);
  const standardsRate = Math.round((data.standardsMet / data.routesMade) * 100);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-white/[0.06] px-8 py-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/image.png" alt="myoProcess" className="w-8 h-8 rounded-lg" />
            <div>
              <div className="text-[15px] font-semibold text-white/90">myoProcess</div>
              <div className="text-[11px] text-white/40 tracking-wide">OPERATOR CONSOLE</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] text-white/40 font-mono">LIVE</span>
          </div>
        </div>
      </header>

      {/* Hero — The Big Number */}
      <section className="px-8 py-16 border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto text-center">
          <div className="text-[11px] text-white/40 tracking-widest uppercase mb-4">
            Total Deal Flow Routed
          </div>
          <div className="text-[72px] font-bold tracking-tight text-white leading-none mb-2">
            $<AnimatedCounter value={data.totalDealFlow} />
          </div>
          <div className="text-[13px] text-white/30">
            Lifetime value routed through the system
          </div>
        </div>
      </section>

      {/* Stats Row */}
      <section className="px-8 py-8 border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto grid grid-cols-4 gap-6">
          {[
            { label: 'Routes Made', value: data.routesMade, icon: Activity },
            { label: 'Standards Met', value: `${data.standardsMet}/${data.routesMade}`, sub: `${standardsRate}%`, icon: Target },
            { label: 'Active Routes', value: data.activeRoutes, icon: TrendingUp },
            { label: 'Avg. Route Value', value: formatCurrency(avgRouteValue), icon: DollarSign },
          ].map((stat, i) => (
            <div key={i} className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center gap-2 mb-3">
                <stat.icon className="w-4 h-4 text-white/30" />
                <span className="text-[11px] text-white/40 uppercase tracking-wider">{stat.label}</span>
              </div>
              <div className="text-[28px] font-semibold text-white/90 tabular-nums">
                {stat.value}
              </div>
              {stat.sub && (
                <div className="text-[12px] text-emerald-400/80 mt-1">{stat.sub}</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Two Column: Top Routes + Funnel */}
      <section className="px-8 py-8">
        <div className="max-w-6xl mx-auto grid grid-cols-2 gap-8">

          {/* Top Routes */}
          <div className="p-6 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[11px] text-white/40 uppercase tracking-wider mb-6">Top Routes</div>
            <div className="space-y-4">
              {data.topRoutes.map((route, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-[12px] text-white/30">→</span>
                    <span className="text-[14px] text-white/70">{route.category}</span>
                  </div>
                  <span className="text-[14px] font-semibold text-white/90 tabular-nums font-mono">
                    {formatCurrency(route.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Q4 Funnel */}
          <div className="p-6 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[11px] text-white/40 uppercase tracking-wider mb-6">Q4 2025 Routing Metrics</div>
            <div className="space-y-3">
              {[
                { label: 'Opportunities Tracked', value: `${data.opportunitiesTracked}+`, note: null },
                { label: 'Routes Made', value: data.routesMade, note: 'filtered' },
                { label: 'Standards Met', value: data.standardsMet, note: 'executed' },
                { label: 'Total Deal Flow', value: formatCurrency(data.totalDealFlow), note: 'outcomes' },
              ].map((step, i, arr) => (
                <div key={i}>
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[13px] text-white/60">{step.label}</span>
                    <span className="text-[15px] font-semibold text-white/90 tabular-nums font-mono">
                      {step.value}
                    </span>
                  </div>
                  {i < arr.length - 1 && (
                    <div className="flex items-center gap-2 py-1 pl-4">
                      <ArrowDown className="w-3 h-3 text-white/20" />
                      <span className="text-[10px] text-white/30">({step.note})</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* Live Activity Feed */}
      <section className="px-8 py-8 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="text-[11px] text-white/40 uppercase tracking-wider mb-4">Recent Activity</div>
          <div className="space-y-2">
            {data.recentActivity.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-4 py-2 px-3 rounded-lg hover:bg-white/[0.02] transition-colors"
              >
                <span className="text-[11px] text-white/30 font-mono w-20">{item.time}</span>
                <span className={`text-[9px] px-2 py-0.5 rounded uppercase font-semibold tracking-wider ${
                  item.type === 'closed'
                    ? 'bg-emerald-500/[0.15] text-emerald-400'
                    : item.type === 'reply'
                    ? 'bg-blue-500/[0.15] text-blue-400'
                    : 'bg-white/[0.06] text-white/40'
                }`}>
                  {item.type}
                </span>
                <span className="text-[13px] text-white/60">{item.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-8 py-6 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-[11px] text-white/30">
          <span>myoProcess · Operator Console</span>
          <span className="font-mono">Last updated: {new Date().toLocaleDateString()}</span>
        </div>
      </footer>
    </div>
  );
}
