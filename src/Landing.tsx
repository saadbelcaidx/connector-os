import { useNavigate } from 'react-router-dom';
import { ArrowRight, Zap, Users, Clock, ArrowUpRight, ChevronRight, Trophy, Bot, Sparkles, Flame, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// Scroll-triggered animation hook
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

// Animated section wrapper
function AnimatedSection({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, isVisible } = useScrollReveal();

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(40px)',
        transition: `opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const [showBanner, setShowBanner] = useState(true);

  // Check if banner was dismissed
  useEffect(() => {
    const dismissed = localStorage.getItem('reply_brain_banner_dismissed');
    if (dismissed) setShowBanner(false);
  }, []);

  const dismissBanner = () => {
    setShowBanner(false);
    localStorage.setItem('reply_brain_banner_dismissed', 'true');
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white overflow-x-hidden">

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06] bg-[#09090b]/80">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/image.png" alt="Connector OS" className="w-6 h-6" style={{ borderRadius: '2px' }} />
            <span className="font-mono text-[12px] font-medium text-white/90">connector OS</span>
          </div>

          <div className="flex items-center gap-6">
            <button
              onClick={() => navigate('/library?page=architecture')}
              className="font-mono text-[11px] text-white/40 hover:text-white/60 transition-colors"
            >
              User's Manual
            </button>
            <button
              onClick={() => navigate('/station')}
              className="px-4 py-1.5 font-mono text-[11px] font-medium text-black bg-white hover:bg-white/90 transition-colors"
              style={{ borderRadius: '2px' }}
            >
              Get access
            </button>
          </div>
        </div>
      </nav>

      {/* Announcement Banner */}
      {showBanner && (
        <div
          className="fixed top-14 left-0 right-0 z-40"
          style={{ animation: 'slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
          <div className="relative bg-white/[0.02] border-b border-white/[0.06]">
            <div className="max-w-6xl mx-auto px-6 py-1.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1.5 px-1.5 py-0.5 bg-white/[0.06]" style={{ borderRadius: '2px' }}>
                  <span className="font-mono text-[9px] font-medium text-white/50 uppercase tracking-widest">New</span>
                </div>

                <p className="font-mono text-[11px] text-white/40">
                  <span className="font-medium text-white/60">Client Fulfillment</span>
                  <span className="mx-1.5 text-white/15">—</span>
                  <span className="hidden sm:inline">Plug in your client. </span>We find who needs them.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate('/station')}
                  className="group flex items-center gap-1 px-2.5 py-1 font-mono text-[10px] font-medium text-white/50 hover:text-white/70 bg-white/[0.06] hover:bg-white/[0.08] transition-all"
                  style={{ borderRadius: '2px' }}
                >
                  Try it
                  <ArrowRight size={10} className="group-hover:translate-x-0.5 transition-transform" />
                </button>

                <button
                  onClick={dismissBanner}
                  className="p-0.5 text-white/20 hover:text-white/50 transition-colors"
                  aria-label="Dismiss"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className={`relative pb-16 px-6 ${showBanner ? 'pt-36' : 'pt-28'}`} style={{ transition: 'padding-top 0.3s ease' }}>
        <div className="max-w-5xl mx-auto">
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/[0.03] border border-white/[0.06] mb-6"
            style={{
              borderRadius: '2px',
              animation: 'fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-[10px] text-white/40 tracking-wider">Built by founder of <a href="https://myoprocess.com" target="_blank" rel="noopener noreferrer" className="text-white/50 hover:text-white/70 transition-colors underline underline-offset-2 decoration-white/20">myoProcess</a> — 1 billion routed</span>
          </div>

          <h1
            className="font-mono text-[42px] leading-[1.1] font-medium tracking-[-0.02em] text-white/90 mb-5"
            style={{ animation: 'fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both' }}
          >
            The infrastructure
            <br />for connectors
          </h1>

          <p
            className="font-mono text-[13px] leading-relaxed text-white/35 max-w-lg mb-8"
            style={{ animation: 'fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.3s both' }}
          >
            Find who needs who, at the right time & Get paid.
          </p>

          <div
            className="flex items-center gap-5"
            style={{ animation: 'fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.4s both' }}
          >
            <button
              onClick={() => navigate('/station')}
              className="px-4 py-2 bg-white text-black font-mono text-[11px] font-medium hover:bg-white/90 transition-colors"
              style={{ borderRadius: '2px' }}
            >
              Get access
            </button>
            <button
              onClick={() => navigate('/library')}
              className="group flex items-center gap-1.5 font-mono text-[11px] text-white/40 hover:text-white/60 transition-colors"
            >
              See how the money moves
              <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </section>

      {/* Product Screenshot — Station RunDetail */}
      <AnimatedSection className="px-6 pb-24">
        <div className="max-w-5xl mx-auto">
          <div className="relative">
            {/* Screenshot container */}
            <div className="relative rounded border border-white/[0.06] bg-[#09090b] overflow-hidden">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.04] bg-white/[0.01]">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-white/[0.06]" />
                  <div className="w-2 h-2 rounded-full bg-white/[0.06]" />
                  <div className="w-2 h-2 rounded-full bg-white/[0.06]" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="px-3 py-0.5 rounded font-mono text-[9px] text-white/20">
                    app.connector-os.com/station/run/v5-2a8f
                  </div>
                </div>
              </div>

              {/* Station header */}
              <div className="px-5 py-3 border-b border-white/[0.04]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-mono text-[9px] text-white/25">
                    <span>Station</span>
                    <span className="text-white/10">{'>'}</span>
                    <span>Runs</span>
                    <span className="text-white/10">{'>'}</span>
                    <span className="text-white/40">SaaS Hiring → AI Staffing</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <div className="w-1 h-1 rounded-full bg-emerald-400" />
                      complete
                    </div>
                    <span className="font-mono text-[8px] text-white/15">82 shards · 1.2s</span>
                  </div>
                </div>
              </div>

              {/* Two-panel Station layout */}
              <div className="flex" style={{ height: '380px' }}>
                {/* Left: Match list */}
                <div className="w-[280px] flex-shrink-0 border-r border-white/[0.04] flex flex-col">
                  {/* Filter tabs */}
                  <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/[0.03]">
                    {[{ l: 'All', n: '42' }, { l: 'Strong', n: '8' }, { l: 'Good', n: '18' }].map((tab, i) => (
                      <div key={tab.l} className={`px-2 py-0.5 rounded font-mono text-[8px] ${i === 0 ? 'bg-white/[0.06] text-white/60' : 'text-white/20'}`}>
                        {tab.l} <span className="text-white/15">{tab.n}</span>
                      </div>
                    ))}
                  </div>

                  {/* Match rows */}
                  <div className="flex-1 overflow-hidden">
                    {[
                      { d: 'Meridian Health', s: 'Apex Recruiting', score: 0.91, tier: 'strong' },
                      { d: 'Pinnacle Logistics', s: 'DataBridge AI', score: 0.87, tier: 'strong' },
                      { d: 'Vertex Capital', s: 'CloudScale Ops', score: 0.82, tier: 'good', active: true },
                      { d: 'Horizon Biotech', s: 'TalentForge', score: 0.78, tier: 'good' },
                      { d: 'Stratos Energy', s: 'NexGen Systems', score: 0.74, tier: 'good' },
                      { d: 'Atlas Manufacturing', s: 'ProcessIQ', score: 0.71, tier: 'good' },
                      { d: 'Quantum Finance', s: 'SecureNet Pro', score: 0.68, tier: 'weak' },
                    ].map((m, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2.5 px-3 py-2 border-b border-white/[0.03] cursor-pointer"
                        style={{
                          background: m.active ? 'rgba(255,255,255,0.03)' : 'transparent',
                          borderLeft: m.active ? '2px solid rgba(255,255,255,0.12)' : '2px solid transparent',
                        }}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          m.tier === 'strong' ? 'bg-emerald-400' : m.tier === 'good' ? 'bg-white/30' : 'bg-white/15'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-[9px] text-white/50 truncate">{m.d}</div>
                          <div className="font-mono text-[8px] text-white/20 truncate">{m.s}</div>
                        </div>
                        <span className="font-mono text-[9px] text-white/25 flex-shrink-0">{m.score.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: Match detail */}
                <div className="flex-1 p-5 overflow-hidden">
                  <div className="max-w-[400px]">
                    {/* Classification badge */}
                    <div className="flex items-center gap-2 mb-4">
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <div className="w-1 h-1 rounded-full bg-emerald-400" />
                        PASS
                      </div>
                      <span className="font-mono text-[8px] text-white/15">0.82 relevance</span>
                    </div>

                    {/* Demand card */}
                    <div className="mb-3 p-3 rounded border border-white/[0.06] bg-white/[0.02]">
                      <div className="font-mono text-[8px] text-white/20 uppercase tracking-widest mb-1.5">Demand</div>
                      <div className="font-mono text-[10px] text-white/60 font-medium">Vertex Capital</div>
                      <div className="font-mono text-[8px] text-white/25 mt-1">Scaling operations team, hiring 3 data engineers post Series B</div>
                    </div>

                    {/* Supply card */}
                    <div className="mb-3 p-3 rounded border border-white/[0.06] bg-white/[0.02]">
                      <div className="font-mono text-[8px] text-white/20 uppercase tracking-widest mb-1.5">Supply</div>
                      <div className="font-mono text-[10px] text-white/60 font-medium">CloudScale Ops</div>
                      <div className="font-mono text-[8px] text-white/25 mt-1">Infrastructure consulting for post-funding scale-ups</div>
                    </div>

                    {/* Reasoning */}
                    <div className="mb-3 p-3 rounded border border-white/[0.06] bg-white/[0.02]">
                      <div className="font-mono text-[8px] text-white/20 uppercase tracking-widest mb-1.5">Why relevant</div>
                      <div className="font-mono text-[8px] text-white/35 leading-relaxed">
                        Vertex just closed Series B and is hiring data engineers — classic infrastructure scaling signal. CloudScale specializes in exactly this transition point. Timing is strong.
                      </div>
                    </div>

                    {/* Score bars */}
                    <div className="grid grid-cols-3 gap-2">
                      {[{ l: 'Alignment', v: 0.85 }, { l: 'Timing', v: 0.91 }, { l: 'Capability', v: 0.78 }].map(s => (
                        <div key={s.l}>
                          <div className="font-mono text-[7px] text-white/15 uppercase tracking-widest mb-1">{s.l}</div>
                          <div className="h-1 rounded-full bg-white/[0.04] overflow-hidden">
                            <div className="h-full bg-emerald-400/40 rounded-full" style={{ width: `${s.v * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom gradient fade */}
            <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#09090b] to-transparent pointer-events-none" />
          </div>
        </div>
      </AnimatedSection>

      {/* The routing */}
      <AnimatedSection className="px-6 py-20 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 font-mono text-[10px] text-white/25 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
            The routing
          </div>
          <h2 className="font-mono text-[28px] font-medium tracking-[-0.02em] text-white/90 mb-4">
            Both sides get messaged.<br />Whoever replies first — wins.
          </h2>
          <p className="font-mono text-[12px] text-white/35 max-w-lg mb-12">
            You're not convincing anyone. You're finding people who are already looking. The system shows you who — you just reach out.
          </p>

          <div className="grid grid-cols-3 gap-6">
            <div className="group">
              <div className="w-10 h-10 rounded bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4 group-hover:border-white/[0.12] transition-colors">
                <Zap size={16} className="text-white/40" />
              </div>
              <h3 className="font-mono text-[11px] font-medium text-white/60 uppercase tracking-wider mb-2">Signals come in</h3>
              <p className="font-mono text-[11px] text-white/35 leading-relaxed">
                Companies hiring, raising, expanding. The system pulls them. You don't search — you scan.
              </p>
            </div>

            <div className="group">
              <div className="w-10 h-10 rounded bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4 group-hover:border-white/[0.12] transition-colors">
                <Users size={16} className="text-white/40" />
              </div>
              <h3 className="font-mono text-[11px] font-medium text-white/60 uppercase tracking-wider mb-2">Matches surface</h3>
              <p className="font-mono text-[11px] text-white/35 leading-relaxed">
                For every demand, there's supply waiting. The system pairs them. You approve or skip.
              </p>
            </div>

            <div className="group">
              <div className="w-10 h-10 rounded bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4 group-hover:border-white/[0.12] transition-colors">
                <Clock size={16} className="text-white/40" />
              </div>
              <h3 className="font-mono text-[11px] font-medium text-white/60 uppercase tracking-wider mb-2">You route</h3>
              <p className="font-mono text-[11px] text-white/35 leading-relaxed">
                One click. The intro goes. If they connect, you're in the room. If they don't, next.
              </p>
            </div>
          </div>
        </div>
      </AnimatedSection>

      {/* The model */}
      <AnimatedSection className="px-6 py-20 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 gap-16 items-center">
            <div>
              <div className="flex items-center gap-2 font-mono text-[10px] text-white/25 mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                The model
              </div>
              <h2 className="font-mono text-[28px] font-medium tracking-[-0.02em] text-white/90 mb-4">
                You didn't create the problem.<br />You controlled the intro.
              </h2>
              <p className="font-mono text-[12px] text-white/35 mb-6">
                Demand chases supply. Supply begs demand. Everyone competes. Nobody has leverage. You sit above that game entirely.
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded bg-white/[0.04] flex items-center justify-center">
                    <ChevronRight size={10} className="text-white/30" />
                  </div>
                  <span className="font-mono text-[11px] text-white/50">Access fees</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded bg-white/[0.04] flex items-center justify-center">
                    <ChevronRight size={10} className="text-white/30" />
                  </div>
                  <span className="font-mono text-[11px] text-white/50">Retainers</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded bg-white/[0.04] flex items-center justify-center">
                    <ChevronRight size={10} className="text-white/30" />
                  </div>
                  <span className="font-mono text-[11px] text-white/50">Commissions from both sides</span>
                </div>
              </div>
            </div>

            {/* Flow diagram */}
            <div className="relative p-8">
              <div className="flex flex-col items-center gap-4">
                {/* Demand */}
                <div className="flex items-center gap-4 w-full">
                  <div className="flex-1 p-4 rounded border border-white/[0.06] bg-white/[0.02] text-center">
                    <div className="font-mono text-[9px] text-white/25 uppercase tracking-widest mb-1">Demand</div>
                    <div className="font-mono text-[11px] text-white/50">Companies with needs</div>
                  </div>
                  <div className="w-8 h-px bg-white/[0.08]" />
                </div>

                {/* You */}
                <div className="relative z-10 px-6 py-4 rounded border border-white/[0.1] bg-white/[0.04]">
                  <div className="font-mono text-[11px] font-medium text-white/70">You</div>
                  <div className="font-mono text-[10px] text-white/30">Control the intro</div>
                </div>

                {/* Supply */}
                <div className="flex items-center gap-4 w-full">
                  <div className="flex-1 p-4 rounded border border-white/[0.06] bg-white/[0.02] text-center">
                    <div className="font-mono text-[9px] text-white/25 uppercase tracking-widest mb-1">Supply</div>
                    <div className="font-mono text-[11px] text-white/50">People who solve it</div>
                  </div>
                  <div className="w-8 h-px bg-white/[0.08]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </AnimatedSection>

      {/* Daily routine */}
      <AnimatedSection className="px-6 py-20 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 font-mono text-[10px] text-white/25 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
            $25,000–$50,000/month
          </div>
          <h2 className="font-mono text-[28px] font-medium tracking-[-0.02em] text-white/90 mb-12">
            10 minutes in the morning.<br />Replies come to you.
          </h2>

          <div className="grid grid-cols-2 gap-8">
            <div className="p-6 rounded border border-white/[0.06] bg-white/[0.02]">
              <div className="font-mono text-[9px] text-white/25 uppercase tracking-widest mb-4">Morning</div>
              <div className="space-y-3">
                {['Open Connector OS', 'Scan for pressure', 'Let the system match', 'Send intros', 'Leave'].map((step, i) => (
                  <div key={step} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded bg-white/[0.04] flex items-center justify-center font-mono text-[9px] text-white/30">
                      {i + 1}
                    </div>
                    <span className="font-mono text-[11px] text-white/50">{step}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 rounded border border-white/[0.06] bg-white/[0.02]">
              <div className="font-mono text-[9px] text-white/25 uppercase tracking-widest mb-4">Later</div>
              <div className="space-y-3">
                {['Replies arrive in Inbound', 'You decide who meets', 'Connect or wait'].map((step) => (
                  <div key={step} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded bg-white/[0.04] flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-white/30" />
                    </div>
                    <span className="font-mono text-[11px] text-white/50">{step}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 pt-4 border-t border-white/[0.06]">
                <p className="font-mono text-[10px] text-white/25 italic">No content. No ads. No explaining.</p>
              </div>
            </div>
          </div>
        </div>
      </AnimatedSection>

      {/* Built for section */}
      <AnimatedSection className="px-6 py-20 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 font-mono text-[10px] text-white/25 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
            Built for
          </div>
          <h2 className="font-mono text-[28px] font-medium tracking-[-0.02em] text-white/90 mb-12">
            Anyone ready to route and collect
          </h2>

          <div className="grid grid-cols-3 gap-6">
            <div className="group p-6 rounded border border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1] transition-colors">
              <div className="w-10 h-10 rounded bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                <Bot size={16} className="text-white/40" />
              </div>
              <h3 className="font-mono text-[11px] font-medium text-white/60 uppercase tracking-wider mb-2">AI builders</h3>
              <p className="font-mono text-[11px] text-white/35 leading-relaxed">
                You build automation/AI. You're good at it. But you're tired of the delivery treadmill. This lets you route deals instead of fulfilling them.
              </p>
            </div>

            <div className="group p-6 rounded border border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1] transition-colors">
              <div className="w-10 h-10 rounded bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                <Sparkles size={16} className="text-white/40" />
              </div>
              <h3 className="font-mono text-[11px] font-medium text-white/60 uppercase tracking-wider mb-2">Day one</h3>
              <p className="font-mono text-[11px] text-white/35 leading-relaxed">
                Never closed a deal. Never sent an outreach message. Doesn't matter. The system tells you what to do and when.
              </p>
            </div>

            <div className="group p-6 rounded border border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1] transition-colors">
              <div className="w-10 h-10 rounded bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                <Flame size={16} className="text-white/40" />
              </div>
              <h3 className="font-mono text-[11px] font-medium text-white/60 uppercase tracking-wider mb-2">Hungry</h3>
              <p className="font-mono text-[11px] text-white/35 leading-relaxed">
                You want to make money. Real money. You have a laptop. You have time. That's enough. The rest is execution.
              </p>
            </div>
          </div>
        </div>
      </AnimatedSection>

      {/* What makes this different */}
      <AnimatedSection className="px-6 py-20 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 gap-16 items-start">
            <div>
              <div className="flex items-center gap-2 font-mono text-[10px] text-white/25 mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                What makes this different
              </div>
              <h2 className="font-mono text-[28px] font-medium tracking-[-0.02em] text-white/90 mb-4">
                You're not selling anyone.<br />You're routing interest.
              </h2>
              <p className="font-mono text-[12px] text-white/35 mb-6">
                Most people chase. They pitch. They beg. You don't do any of that. You detect pressure, find matching supply, and control when they meet.
              </p>
              <div className="p-4 rounded border border-white/[0.06] bg-white/[0.02]">
                <p className="font-mono text-[11px] text-white/40 italic">
                  "The connector doesn't sell. The connector routes. The sale happens because the fit was already there."
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-5 rounded border border-white/[0.06] bg-white/[0.02]">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded bg-white/[0.04] border border-white/[0.06] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="font-mono text-[10px] text-white/30">✕</span>
                  </div>
                  <div>
                    <h4 className="font-mono text-[11px] font-medium text-white/50 mb-1">Without Connector OS</h4>
                    <p className="font-mono text-[10px] text-white/30 leading-relaxed">
                      No signals. No matching. You're guessing who needs what. Clay gives you data — not matches. Apollo gives you contacts — not timing. Nothing else connects demand to supply. Nothing.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-5 rounded border border-emerald-500/10 bg-emerald-500/[0.02]">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="font-mono text-[10px] text-emerald-400/60">✓</span>
                  </div>
                  <div>
                    <h4 className="font-mono text-[11px] font-medium text-white/50 mb-1">With Connector OS</h4>
                    <p className="font-mono text-[10px] text-white/30 leading-relaxed">
                      Signals flow in. The system matches them to supply. You see who needs what — and who can deliver. One click to intro. That's it.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AnimatedSection>

      {/* Social Proof Banner */}
      <AnimatedSection className="px-6 py-16 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={() => navigate('/library?page=winners')}
            className="w-full group p-8 rounded border border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1] transition-all text-left"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <Trophy size={16} className="text-emerald-400/60" />
                  <span className="font-mono text-[9px] text-white/25 uppercase tracking-widest font-medium">Wall of Winners</span>
                </div>
                <div className="font-mono text-[28px] font-medium text-emerald-400 tracking-tight">
                  $826,745
                </div>
                <div className="font-mono text-[11px] text-white/30 mt-1">
                  Cash collected by SSM members
                </div>
              </div>
              <div className="flex items-center gap-2 font-mono text-[10px] text-white/30 group-hover:text-white/50 transition-colors">
                See results
                <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>
        </div>
      </AnimatedSection>

      {/* Numbers/Stats */}
      <AnimatedSection className="px-6 py-20 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-4 gap-8">
            <div className="text-center">
              <div className="font-mono text-[32px] font-medium tracking-tight text-white/80 mb-1">10</div>
              <div className="font-mono text-[10px] text-white/25 uppercase tracking-widest">Minutes per day</div>
            </div>
            <div className="text-center">
              <div className="font-mono text-[32px] font-medium tracking-tight text-white/80 mb-1">0</div>
              <div className="font-mono text-[10px] text-white/25 uppercase tracking-widest">Cold calls</div>
            </div>
            <div className="text-center">
              <div className="font-mono text-[32px] font-medium tracking-tight text-white/80 mb-1">∞</div>
              <div className="font-mono text-[10px] text-white/25 uppercase tracking-widest">Leverage</div>
            </div>
            <div className="text-center">
              <div className="font-mono text-[32px] font-medium tracking-tight text-emerald-400 mb-1">$25K+</div>
              <div className="font-mono text-[10px] text-white/25 uppercase tracking-widest">Monthly potential</div>
            </div>
          </div>
        </div>
      </AnimatedSection>

      {/* Divider */}
      <div className="h-px max-w-4xl mx-auto bg-white/[0.06]" />

      {/* CTA */}
      <AnimatedSection className="px-6 py-24">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-mono text-[24px] font-medium tracking-[-0.02em] text-white/90 mb-4">
            Stop selling. Start routing.
          </h2>
          <p className="font-mono text-[12px] text-white/35 mb-8">
            The connector model, systematized.
          </p>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => navigate('/station')}
              className="group px-5 py-2.5 bg-white text-black font-mono text-[11px] font-medium hover:bg-white/90 transition-colors flex items-center gap-2"
              style={{ borderRadius: '2px' }}
            >
              Get access
              <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
            <button
              onClick={() => navigate('/library?page=architecture')}
              className="group flex items-center gap-1.5 font-mono text-[11px] text-white/40 hover:text-white/60 transition-colors"
            >
              Read the manual
              <ArrowUpRight size={12} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </AnimatedSection>

      {/* Footer */}
      <footer className="px-6 py-12 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-4 gap-8 mb-12">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img src="/image.png" alt="" className="w-5 h-5 opacity-70" style={{ borderRadius: '2px' }} />
                <span className="font-mono text-[11px] font-medium text-white/50">connector OS</span>
              </div>
              <p className="font-mono text-[10px] text-white/25 leading-relaxed">
                The infrastructure for connectors.
              </p>
            </div>

            {/* Product */}
            <div>
              <div className="font-mono text-[9px] text-white/25 uppercase tracking-widest mb-4">Product</div>
              <div className="space-y-2.5">
                <button onClick={() => navigate('/library?page=architecture')} className="block font-mono text-[11px] text-white/30 hover:text-white/50 transition-colors">
                  User's Manual
                </button>
                <button onClick={() => navigate('/station')} className="block font-mono text-[11px] text-white/30 hover:text-white/50 transition-colors">
                  Get access
                </button>
              </div>
            </div>

            {/* Learn */}
            <div>
              <div className="font-mono text-[9px] text-white/25 uppercase tracking-widest mb-4">Learn</div>
              <div className="space-y-2.5">
                <button onClick={() => navigate('/library')} className="block font-mono text-[11px] text-white/30 hover:text-white/50 transition-colors">
                  Philosophy
                </button>
                <button onClick={() => navigate('/library')} className="block font-mono text-[11px] text-white/30 hover:text-white/50 transition-colors">
                  System docs
                </button>
              </div>
            </div>

            {/* System */}
            <div>
              <div className="font-mono text-[9px] text-white/25 uppercase tracking-widest mb-4">System</div>
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="font-mono text-[11px] text-white/30">All systems operational</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="pt-6 border-t border-white/[0.04] flex items-center justify-between">
            <div className="font-mono text-[10px] text-white/15">
              © 2024 Connector OS
            </div>
            <a
              href="https://www.skool.com/ssmasters"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 opacity-40 hover:opacity-70 transition-opacity"
            >
              <img src="/ssm-logo.png" alt="SSM" className="w-4 h-4" style={{ borderRadius: '2px' }} />
            </a>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
