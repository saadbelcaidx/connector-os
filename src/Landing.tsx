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

// Staggered grid items
function StaggeredItem({ children, index }: { children: React.ReactNode; index: number }) {
  const { ref, isVisible } = useScrollReveal();

  return (
    <div
      ref={ref}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(30px)',
        transition: `opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${index * 100}ms, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${index * 100}ms`,
      }}
    >
      {children}
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const [scrollY, setScrollY] = useState(0);
  const [showBanner, setShowBanner] = useState(true);

  // Parallax scroll effect
  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
      {/* Animated gradient background with parallax */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-purple-500/[0.03] rounded-full blur-[120px]"
          style={{ transform: `translateY(${scrollY * 0.1}px)` }}
        />
        <div
          className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-blue-500/[0.03] rounded-full blur-[120px]"
          style={{ transform: `translateY(${scrollY * 0.15}px)` }}
        />
        <div
          className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] bg-emerald-500/[0.02] rounded-full blur-[100px]"
          style={{ transform: `translateY(${scrollY * 0.05}px)` }}
        />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06] bg-[#09090b]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/image.png" alt="Connector OS" className="w-6 h-6 rounded-md" />
            <span className="text-[14px] font-medium text-white/90">connector OS</span>
          </div>

          <div className="flex items-center gap-6">
            <button
              onClick={() => navigate('/library?page=architecture')}
              className="text-[13px] text-white/45 hover:text-white/75 transition-colors"
            >
              User's Manual
            </button>
            <button
              onClick={() => navigate('/flow')}
              className="px-4 py-1.5 bg-white text-black text-[13px] font-medium rounded-md hover:bg-white/90 transition-colors"
            >
              Get access
            </button>
          </div>
        </div>
      </nav>

      {/* Enterprise Announcement Banner - Compact */}
      {showBanner && (
        <div
          className="fixed top-14 left-0 right-0 z-40"
          style={{ animation: 'slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
          <div className="relative bg-gradient-to-r from-violet-500/[0.08] via-fuchsia-500/[0.06] to-violet-500/[0.08] border-b border-violet-500/15">
            <div className="max-w-6xl mx-auto px-6 py-1.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-orange-500/20">
                  <span className="text-[10px] text-orange-400">◆</span>
                  <span className="text-[9px] font-bold text-orange-400 uppercase">New</span>
                </div>

                <p className="text-[12px] text-white/60">
                  <span className="font-medium text-white/80">Connector Agent</span>
                  <span className="mx-1.5 text-white/20">—</span>
                  <span className="hidden sm:inline">Find & verify contacts at scale </span>using private SMTP infra
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate('/msg-sim')}
                  className="group flex items-center gap-1 px-2.5 py-1 rounded bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 text-[11px] font-medium transition-all"
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
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] mb-6"
            style={{
              opacity: 1,
              animation: 'fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] text-white/50 tracking-wider">Built by founder of myoProcess — 1 billion routed</span>
          </div>

          <h1
            className="text-[52px] leading-[1.08] font-bold tracking-[-0.032em] text-white mb-5"
            style={{ animation: 'fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both' }}
          >
            The infrastructure for
            <br />a connector
          </h1>

          <p
            className="text-[15px] leading-relaxed text-white/40 max-w-lg mb-8"
            style={{ animation: 'fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.3s both' }}
          >
            Find who needs who, at the right time & Get paid.
          </p>

          <div
            className="flex items-center gap-5"
            style={{ animation: 'fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.4s both' }}
          >
            <button
              onClick={() => navigate('/flow')}
              className="px-4 py-2 bg-white text-black text-[13px] font-medium rounded-md hover:bg-white/90 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
            >
              Get access
            </button>
            <button
              onClick={() => navigate('/library')}
              className="group flex items-center gap-1.5 text-[13px] text-white/45 hover:text-white/75 transition-colors"
            >
              See how the money moves
              <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </section>

      {/* Product Screenshot */}
      <AnimatedSection className="px-6 pb-24">
        <div className="max-w-5xl mx-auto">
          <div className="relative">
            {/* Gradient glow */}
            <div className="absolute -inset-px bg-gradient-to-b from-white/[0.08] to-transparent rounded-xl blur-sm" />

            {/* Screenshot container */}
            <div className="relative rounded-xl border border-white/[0.08] bg-[#0c0c0e] overflow-hidden">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="px-3 py-0.5 rounded bg-white/[0.03] text-[10px] text-white/25">
                    app.connector-os.com
                  </div>
                </div>
              </div>

              {/* Dashboard mockup */}
              <div className="aspect-[16/9] bg-[#09090b] p-6">
                <div className="h-full flex gap-4">
                  {/* Sidebar */}
                  <div className="w-48 flex-shrink-0 bg-white/[0.02] rounded-lg border border-white/[0.04] p-3">
                    <div className="flex items-center gap-2 mb-4">
                      <img src="/image.png" alt="" className="w-5 h-5 rounded" />
                      <span className="text-[10px] text-white/50">Connector OS</span>
                    </div>
                    <div className="space-y-1">
                      {['Matching', 'Inbound', 'Outbound', 'Settings'].map((item, i) => (
                        <div key={item} className={`px-2 py-1.5 rounded text-[11px] ${i === 0 ? 'bg-white/[0.06] text-white/70' : 'text-white/30'}`}>
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Main content */}
                  <div className="flex-1 flex gap-4">
                    {/* Demand column */}
                    <div className="flex-1 bg-white/[0.02] rounded-lg border border-white/[0.04] p-3">
                      <div className="text-[10px] text-white/30 uppercase tracking-wider mb-3">Demand Signals</div>
                      <div className="space-y-2">
                        {[
                          { company: 'Acme Corp', signal: 'Hiring 5 AI engineers' },
                          { company: 'TechStart', signal: 'Series A closed $4M' },
                          { company: 'DataFlow', signal: 'New VP of Engineering' },
                          { company: 'Nexus AI', signal: 'Hiring automation lead' },
                        ].map((item, i) => (
                          <div key={i} className="p-2 rounded bg-white/[0.03] border border-white/[0.04]">
                            <div className="text-[10px] text-white/60 font-medium">{item.company}</div>
                            <div className="text-[9px] text-white/35 mt-0.5">{item.signal}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Supply column */}
                    <div className="flex-1 bg-white/[0.02] rounded-lg border border-white/[0.04] p-3">
                      <div className="text-[10px] text-white/30 uppercase tracking-wider mb-3">Supply Pool</div>
                      <div className="space-y-2">
                        {[
                          { name: 'Alex M.', skill: 'AI Automation Expert' },
                          { name: 'Sarah K.', skill: 'ML Infrastructure' },
                          { name: 'James T.', skill: 'Data Pipeline Specialist' },
                        ].map((item, i) => (
                          <div key={i} className="p-2 rounded bg-white/[0.03] border border-white/[0.04]">
                            <div className="text-[10px] text-white/60 font-medium">{item.name}</div>
                            <div className="text-[9px] text-white/35 mt-0.5">{item.skill}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Match + Intro panel */}
                    <div className="w-64 bg-white/[0.02] rounded-lg border border-emerald-500/20 p-3">
                      <div className="text-[10px] text-emerald-400/60 uppercase tracking-wider mb-3">Match Found</div>
                      <div className="p-2.5 rounded bg-emerald-500/[0.08] border border-emerald-500/20 mb-3">
                        <div className="text-[10px] text-emerald-300 font-medium">Acme Corp → Alex M.</div>
                        <div className="text-[9px] text-emerald-400/50 mt-0.5">AI hiring ↔ AI Expert</div>
                        <div className="flex gap-1.5 mt-2">
                          <div className="px-2 py-1 rounded bg-emerald-500/20 text-[9px] text-emerald-400">95% match</div>
                        </div>
                      </div>
                      {/* Intro preview */}
                      <div className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Intro Ready</div>
                      <div className="p-2 rounded bg-white/[0.03] border border-white/[0.06] text-[9px] text-white/40 leading-relaxed">
                        <span className="text-white/60">To: Acme Corp</span>
                        <div className="mt-1">"Noticed you're hiring AI engineers — I know someone who built this exact stack at Stripe."</div>
                      </div>
                      <button className="mt-2 w-full py-1.5 rounded bg-emerald-500/20 text-[9px] text-emerald-400 font-medium">
                        Send Intro →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom gradient fade */}
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#09090b] to-transparent pointer-events-none" />
          </div>
        </div>
      </AnimatedSection>

      {/* The routing */}
      <AnimatedSection className="px-6 py-20 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 text-[12px] text-white/30 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
            The routing
          </div>
          <h2 className="text-[32px] font-bold tracking-[-0.02em] text-white mb-4">
            Both sides get messaged.<br />Whoever replies first — wins.
          </h2>
          <p className="text-[15px] text-white/40 max-w-lg mb-12">
            You're not convincing anyone. You're finding people who are already looking. The system shows you who — you just reach out.
          </p>

          <div className="grid grid-cols-3 gap-6">
            <div className="group">
              <div className="w-10 h-10 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4 group-hover:border-white/[0.12] transition-colors">
                <Zap size={18} className="text-white/40" />
              </div>
              <h3 className="text-[14px] font-semibold text-white mb-2">Signals come in</h3>
              <p className="text-[13px] text-white/40 leading-relaxed">
                Companies hiring, raising, expanding. The system pulls them. You don't search — you scan.
              </p>
            </div>

            <div className="group">
              <div className="w-10 h-10 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4 group-hover:border-white/[0.12] transition-colors">
                <Users size={18} className="text-white/40" />
              </div>
              <h3 className="text-[14px] font-semibold text-white mb-2">Matches surface</h3>
              <p className="text-[13px] text-white/40 leading-relaxed">
                For every demand, there's supply waiting. The system pairs them. You approve or skip.
              </p>
            </div>

            <div className="group">
              <div className="w-10 h-10 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4 group-hover:border-white/[0.12] transition-colors">
                <Clock size={18} className="text-white/40" />
              </div>
              <h3 className="text-[14px] font-semibold text-white mb-2">You route</h3>
              <p className="text-[13px] text-white/40 leading-relaxed">
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
              <div className="flex items-center gap-2 text-[12px] text-white/30 mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
                The model
              </div>
              <h2 className="text-[32px] font-bold tracking-[-0.02em] text-white mb-4">
                You didn't create the problem.<br />You controlled the intro.
              </h2>
              <p className="text-[15px] text-white/40 mb-6">
                Demand chases supply. Supply begs demand. Everyone competes. Nobody has leverage. You sit above that game entirely.
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-[13px]">
                  <div className="w-5 h-5 rounded bg-white/[0.04] flex items-center justify-center">
                    <ChevronRight size={12} className="text-white/40" />
                  </div>
                  <span className="text-white/60">Access fees</span>
                </div>
                <div className="flex items-center gap-3 text-[13px]">
                  <div className="w-5 h-5 rounded bg-white/[0.04] flex items-center justify-center">
                    <ChevronRight size={12} className="text-white/40" />
                  </div>
                  <span className="text-white/60">Retainers</span>
                </div>
                <div className="flex items-center gap-3 text-[13px]">
                  <div className="w-5 h-5 rounded bg-white/[0.04] flex items-center justify-center">
                    <ChevronRight size={12} className="text-white/40" />
                  </div>
                  <span className="text-white/60">Commissions from both sides</span>
                </div>
              </div>
            </div>

            {/* Flow diagram */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-radial from-white/[0.02] to-transparent" />
              <div className="relative p-8">
                <div className="flex flex-col items-center gap-4">
                  {/* Demand */}
                  <div className="flex items-center gap-4 w-full">
                    <div className="flex-1 p-4 rounded-lg bg-white/[0.03] border border-white/[0.06] text-center">
                      <div className="text-[11px] text-white/30 uppercase tracking-wider mb-1">Demand</div>
                      <div className="text-[13px] text-white/70">Companies with needs</div>
                    </div>
                    <div className="w-8 h-px bg-gradient-to-r from-white/20 to-transparent" />
                  </div>

                  {/* You */}
                  <div className="relative z-10 px-6 py-4 rounded-xl bg-white/[0.06] border border-white/[0.1]">
                    <div className="text-[13px] font-medium text-white">You</div>
                    <div className="text-[11px] text-white/40">Control the intro</div>
                  </div>

                  {/* Supply */}
                  <div className="flex items-center gap-4 w-full">
                    <div className="flex-1 p-4 rounded-lg bg-white/[0.03] border border-white/[0.06] text-center">
                      <div className="text-[11px] text-white/30 uppercase tracking-wider mb-1">Supply</div>
                      <div className="text-[13px] text-white/70">People who solve it</div>
                    </div>
                    <div className="w-8 h-px bg-gradient-to-r from-white/20 to-transparent" />
                  </div>

                  {/* Arrows */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
                    <defs>
                      <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
                        <stop offset="50%" stopColor="rgba(255,255,255,0.3)" />
                        <stop offset="100%" stopColor="rgba(255,255,255,0.15)" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AnimatedSection>

      {/* Daily routine */}
      <AnimatedSection className="px-6 py-20 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 text-[12px] text-white/30 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
            $25,000–$50,000/month
          </div>
          <h2 className="text-[32px] font-bold tracking-[-0.02em] text-white mb-12">
            10 minutes in the morning.<br />Replies come to you.
          </h2>

          <div className="grid grid-cols-2 gap-8">
            <div className="p-6 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[11px] text-white/30 uppercase tracking-wider mb-4">Morning</div>
              <div className="space-y-3">
                {['Open Connector OS', 'Scan for pressure', 'Let the system match', 'Send intros', 'Leave'].map((step, i) => (
                  <div key={step} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-white/[0.04] flex items-center justify-center text-[10px] text-white/40">
                      {i + 1}
                    </div>
                    <span className="text-[13px] text-white/60">{step}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[11px] text-white/30 uppercase tracking-wider mb-4">Later</div>
              <div className="space-y-3">
                {['Replies arrive in Inbound', 'You decide who meets', 'Connect or wait'].map((step, i) => (
                  <div key={step} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-white/[0.04] flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                    </div>
                    <span className="text-[13px] text-white/60">{step}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 pt-4 border-t border-white/[0.06]">
                <p className="text-[12px] text-white/30 italic">No content. No ads. No explaining.</p>
              </div>
            </div>
          </div>
        </div>
      </AnimatedSection>

      {/* Built for section */}
      <AnimatedSection className="px-6 py-20 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 text-[12px] text-white/30 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
            Built for
          </div>
          <h2 className="text-[32px] font-bold tracking-[-0.02em] text-white mb-12">
            Anyone ready to route and collect
          </h2>

          <div className="grid grid-cols-3 gap-6">
            <div className="group p-6 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.1] transition-colors">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-purple-500/5 border border-purple-500/20 flex items-center justify-center mb-4">
                <Bot size={18} className="text-purple-400/80" />
              </div>
              <h3 className="text-[14px] font-semibold text-white mb-2">AI builders</h3>
              <p className="text-[13px] text-white/40 leading-relaxed">
                You build automation/AI. You're good at it. But you're tired of the delivery treadmill. This lets you route deals instead of fulfilling them.
              </p>
            </div>

            <div className="group p-6 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.1] transition-colors">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-500/5 border border-blue-500/20 flex items-center justify-center mb-4">
                <Sparkles size={18} className="text-blue-400/80" />
              </div>
              <h3 className="text-[14px] font-semibold text-white mb-2">Day one</h3>
              <p className="text-[13px] text-white/40 leading-relaxed">
                Never closed a deal. Never sent an outreach message. Doesn't matter. The system tells you what to do and when.
              </p>
            </div>

            <div className="group p-6 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.1] transition-colors">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500/20 to-orange-500/5 border border-orange-500/20 flex items-center justify-center mb-4">
                <Flame size={18} className="text-orange-400/80" />
              </div>
              <h3 className="text-[14px] font-semibold text-white mb-2">Hungry</h3>
              <p className="text-[13px] text-white/40 leading-relaxed">
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
              <div className="flex items-center gap-2 text-[12px] text-white/30 mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
                What makes this different
              </div>
              <h2 className="text-[32px] font-bold tracking-[-0.02em] text-white mb-4">
                You're not selling anyone.<br />You're routing interest.
              </h2>
              <p className="text-[15px] text-white/40 mb-6">
                Most people chase. They pitch. They beg. You don't do any of that. You detect pressure, find matching supply, and control when they meet.
              </p>
              <div className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                <p className="text-[13px] text-white/50 italic">
                  "The connector doesn't sell. The connector routes. The sale happens because the fit was already there."
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[12px] text-red-400">✕</span>
                  </div>
                  <div>
                    <h4 className="text-[13px] font-medium text-white/70 mb-1">Without Connector OS</h4>
                    <p className="text-[12px] text-white/40 leading-relaxed">
                      No signals. No matching. You're guessing who needs what. Clay gives you data — not matches. Apollo gives you contacts — not timing. Nothing else connects demand to supply. Nothing.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-5 rounded-xl bg-emerald-500/[0.03] border border-emerald-500/20">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[12px] text-emerald-400">✓</span>
                  </div>
                  <div>
                    <h4 className="text-[13px] font-medium text-white/70 mb-1">With Connector OS</h4>
                    <p className="text-[12px] text-white/40 leading-relaxed">
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
            className="w-full group p-8 rounded-2xl bg-gradient-to-br from-emerald-500/[0.08] to-emerald-500/[0.02] border border-emerald-500/20 hover:border-emerald-500/30 transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="text-left">
                <div className="flex items-center gap-3 mb-2">
                  <Trophy size={20} className="text-emerald-400" />
                  <span className="text-[12px] text-emerald-400/70 uppercase tracking-wider font-medium">Wall of Winners</span>
                </div>
                <div className="text-[32px] font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-300">
                  $826,745
                </div>
                <div className="text-[14px] text-white/40 mt-1">
                  Cash collected by SSM members
                </div>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-emerald-400/70 group-hover:text-emerald-400 transition-colors">
                See results
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
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
              <div className="text-[40px] font-bold tracking-tight text-white mb-1">10</div>
              <div className="text-[12px] text-white/40">Minutes per day</div>
            </div>
            <div className="text-center">
              <div className="text-[40px] font-bold tracking-tight text-white mb-1">0</div>
              <div className="text-[12px] text-white/40">Cold calls</div>
            </div>
            <div className="text-center">
              <div className="text-[40px] font-bold tracking-tight text-white mb-1">∞</div>
              <div className="text-[12px] text-white/40">Leverage</div>
            </div>
            <div className="text-center">
              <div className="text-[40px] font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-300 mb-1">$25K+</div>
              <div className="text-[12px] text-white/40">Monthly potential</div>
            </div>
          </div>
        </div>
      </AnimatedSection>

      {/* Gradient divider */}
      <div className="relative h-px max-w-4xl mx-auto">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </div>

      {/* CTA */}
      <AnimatedSection className="px-6 py-24">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-[36px] font-bold tracking-[-0.02em] text-white mb-4">
            Stop selling. Start routing.
          </h2>
          <p className="text-[15px] text-white/40 mb-8">
            The connector model, systematized.
          </p>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => navigate('/flow')}
              className="group px-5 py-2.5 bg-white text-black text-[13px] font-medium rounded-md hover:bg-white/90 transition-colors flex items-center gap-2"
            >
              Get access
              <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
            <button
              onClick={() => navigate('/library?page=architecture')}
              className="group flex items-center gap-1.5 text-[13px] text-white/45 hover:text-white/75 transition-colors"
            >
              Read the manual
              <ArrowUpRight size={14} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
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
                <img src="/image.png" alt="" className="w-5 h-5 rounded opacity-70" />
                <span className="text-[13px] font-medium text-white/70">connector OS</span>
              </div>
              <p className="text-[12px] text-white/30 leading-relaxed">
                The infrastructure for connectors.
              </p>
            </div>

            {/* Product */}
            <div>
              <div className="text-[11px] text-white/40 uppercase tracking-wider mb-4">Product</div>
              <div className="space-y-2.5">
                <button onClick={() => navigate('/library?page=architecture')} className="block text-[13px] text-white/40 hover:text-white/70 transition-colors">
                  User's Manual
                </button>
                <button onClick={() => navigate('/flow')} className="block text-[13px] text-white/40 hover:text-white/70 transition-colors">
                  Get access
                </button>
              </div>
            </div>

            {/* Learn */}
            <div>
              <div className="text-[11px] text-white/40 uppercase tracking-wider mb-4">Learn</div>
              <div className="space-y-2.5">
                <button onClick={() => navigate('/library')} className="block text-[13px] text-white/40 hover:text-white/70 transition-colors">
                  Philosophy
                </button>
                <button onClick={() => navigate('/library')} className="block text-[13px] text-white/40 hover:text-white/70 transition-colors">
                  System docs
                </button>
              </div>
            </div>

            {/* System */}
            <div>
              <div className="text-[11px] text-white/40 uppercase tracking-wider mb-4">System</div>
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[13px] text-white/40">All systems operational</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="pt-6 border-t border-white/[0.04] flex items-center justify-between">
            <div className="text-[11px] text-white/20">
              © 2024 Connector OS
            </div>
            <a
              href="https://www.skool.com/ssmasters"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 opacity-40 hover:opacity-70 transition-opacity"
            >
              <img src="/ssm-logo.png" alt="SSM" className="w-4 h-4 rounded" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
