/**
 * GetStarted.tsx
 *
 * Paul Graham-style mini-course landing page
 * URL: getstarted.connectoros.com (routes to /getstarted)
 *
 * Teaches the Connector loop:
 * Signal → Match → Enrich → Intro → Route → Reply → Deal → $$$
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

// ============================================================================
// TYPES
// ============================================================================

interface WinnerData {
  name: string;
  amount: string;
  story: string;
  image?: string;
}

// ============================================================================
// DATA
// ============================================================================

const LOOP_STEPS = [
  { id: 'signal', label: 'Signal', description: 'Find companies showing buying intent', icon: '◉' },
  { id: 'match', label: 'Match', description: 'Connect demand to supply', icon: '⟷' },
  { id: 'enrich', label: 'Enrich', description: 'Find the decision maker', icon: '◈' },
  { id: 'intro', label: 'Intro', description: 'Personalized first touch', icon: '✉' },
  { id: 'route', label: 'Route', description: 'Send to both sides', icon: '⤴' },
  { id: 'reply', label: 'Reply', description: 'Handle responses', icon: '↩' },
  { id: 'deal', label: 'Deal', description: 'Close the retainer', icon: '$' },
];

const THE_MATH = {
  contactsPerDay: 500,
  daysPerMonth: 20,
  replyRate: 0.02,
  introConversion: 0.10,
  closeRate: 0.25,
  feeRange: { min: 10000, max: 50000 },
};

const WINNERS: WinnerData[] = [
  { name: 'Alex', amount: '$47,000', story: 'First retainer in 3 weeks' },
  { name: 'Marcus', amount: '$156,000', story: '6 months, 4 clients' },
  { name: 'Sarah', amount: '$82,000', story: 'Left agency life behind' },
  { name: 'Dev', amount: '$210,000', story: 'From freelancer to connector' },
];

// ============================================================================
// COMPONENTS
// ============================================================================

/**
 * Animated loop diagram
 */
function LoopDiagram() {
  const [activeStep, setActiveStep] = useState(0);
  const [isAnimating, setIsAnimating] = useState(true);

  useEffect(() => {
    if (!isAnimating) return;
    const interval = setInterval(() => {
      setActiveStep(prev => (prev + 1) % LOOP_STEPS.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [isAnimating]);

  return (
    <div
      className="relative py-16"
      onMouseEnter={() => setIsAnimating(false)}
      onMouseLeave={() => setIsAnimating(true)}
    >
      {/* The loop visualization */}
      <div className="flex flex-wrap justify-center items-center gap-2 md:gap-4 max-w-4xl mx-auto">
        {LOOP_STEPS.map((step, index) => (
          <div key={step.id} className="flex items-center">
            {/* Step node */}
            <div
              className={`
                relative group cursor-pointer
                transition-all duration-500 ease-out
                ${activeStep === index ? 'scale-110' : 'scale-100 opacity-60 hover:opacity-100'}
              `}
              onClick={() => setActiveStep(index)}
            >
              {/* Glow effect */}
              <div className={`
                absolute inset-0 rounded-xl blur-xl transition-opacity duration-500
                ${activeStep === index ? 'opacity-40' : 'opacity-0'}
                ${index === LOOP_STEPS.length - 1 ? 'bg-emerald-500' : 'bg-white'}
              `} />

              {/* Node */}
              <div className={`
                relative px-4 py-3 md:px-6 md:py-4 rounded-xl border
                transition-all duration-300
                ${activeStep === index
                  ? index === LOOP_STEPS.length - 1
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                    : 'bg-white/10 border-white/30 text-white'
                  : 'bg-white/5 border-white/10 text-white/60'
                }
              `}>
                <div className="text-lg md:text-xl font-medium">{step.label}</div>

                {/* Tooltip on hover/active */}
                <div className={`
                  absolute left-1/2 -translate-x-1/2 top-full mt-3 px-3 py-2
                  bg-zinc-900 border border-white/10 rounded-lg
                  text-sm text-white/70 whitespace-nowrap
                  transition-all duration-300 z-10
                  ${activeStep === index ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}
                `}>
                  {step.description}
                </div>
              </div>
            </div>

            {/* Arrow between steps */}
            {index < LOOP_STEPS.length - 1 && (
              <div className={`
                mx-1 md:mx-2 text-lg transition-all duration-300
                ${activeStep === index ? 'text-white opacity-100' : 'text-white/30'}
              `}>
                →
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Feedback loop arrow */}
      <div className="mt-8 flex justify-center">
        <div className="flex items-center gap-3 text-white/40">
          <div className="w-16 md:w-32 h-px bg-gradient-to-r from-transparent to-white/20" />
          <span className="text-sm italic">learn what works</span>
          <div className="w-16 md:w-32 h-px bg-gradient-to-l from-transparent to-white/20" />
        </div>
      </div>

      {/* Loop back indicator */}
      <svg
        className="absolute left-1/2 -translate-x-1/2 bottom-0 w-[80%] max-w-2xl h-12 opacity-20"
        viewBox="0 0 400 40"
        fill="none"
      >
        <path
          d="M380 5 C 380 35, 20 35, 20 5"
          stroke="url(#loopGradient)"
          strokeWidth="1"
          strokeDasharray="4 4"
          fill="none"
        />
        <defs>
          <linearGradient id="loopGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#ffffff" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

/**
 * The Math section - animated numbers
 */
function TheMath() {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.3 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  const contacts = THE_MATH.contactsPerDay * THE_MATH.daysPerMonth;
  const replies = Math.round(contacts * THE_MATH.replyRate);
  const intros = Math.round(replies * THE_MATH.introConversion);
  const deals = Math.round(intros * THE_MATH.closeRate);
  const revenueMin = deals * THE_MATH.feeRange.min;
  const revenueMax = deals * THE_MATH.feeRange.max;

  const steps = [
    { label: 'contacts/month', value: contacts.toLocaleString(), suffix: '' },
    { label: 'reply rate', value: '2%', suffix: '' },
    { label: 'conversations', value: replies.toString(), suffix: '' },
    { label: 'convert to intros', value: '10%', suffix: '' },
    { label: 'warm intros', value: intros.toString(), suffix: '' },
    { label: 'close rate', value: '25%', suffix: '' },
    { label: 'deals', value: deals.toString(), suffix: '' },
    { label: 'connector fee', value: '$10k-$50k', suffix: '' },
  ];

  return (
    <div ref={ref} className="py-16">
      <h2 className="text-2xl md:text-3xl font-semibold text-white text-center mb-12">
        The math
      </h2>

      <div className="max-w-3xl mx-auto">
        {/* Flow of numbers */}
        <div className="space-y-4">
          {steps.map((step, index) => (
            <div
              key={step.label}
              className={`
                flex items-center justify-between px-6 py-4
                bg-white/[0.03] border border-white/[0.06] rounded-xl
                transition-all duration-700 ease-out
                ${isVisible
                  ? 'opacity-100 translate-x-0'
                  : 'opacity-0 -translate-x-8'
                }
              `}
              style={{ transitionDelay: `${index * 100}ms` }}
            >
              <span className="text-white/50">{step.label}</span>
              <span className={`
                text-xl font-mono font-semibold
                ${index === steps.length - 1 ? 'text-emerald-400' : 'text-white'}
              `}>
                {step.value}
              </span>
            </div>
          ))}
        </div>

        {/* Result */}
        <div className={`
          mt-8 p-8 rounded-2xl
          bg-gradient-to-br from-emerald-500/10 to-emerald-500/5
          border border-emerald-500/20
          text-center
          transition-all duration-1000 ease-out
          ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
        `}
        style={{ transitionDelay: '800ms' }}
        >
          <div className="text-white/60 mb-2">Monthly potential</div>
          <div className="text-4xl md:text-5xl font-bold text-emerald-400">
            ${(revenueMin / 1000).toFixed(0)}k – ${(revenueMax / 1000).toFixed(0)}k
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The Story section
 */
function TheStory() {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.2 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  const milestones = [
    { period: 'Before', amount: '$0', note: 'Banned on Upwork as automation freelancer' },
    { period: '6 months', amount: '$40,000', note: 'First retainers using this loop' },
    { period: '12 months', amount: '$123,000', note: 'Refined the system' },
    { period: 'Now', amount: '$186,000', note: 'Still the same loop' },
  ];

  return (
    <div ref={ref} className="py-16">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-semibold text-white text-center mb-4">
          I used this exact loop
        </h2>
        <p className="text-white/50 text-center mb-12">
          After getting banned on Upwork, I had zero relationships. Here's what happened.
        </p>

        {/* Timeline */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-white/20 via-emerald-500/50 to-emerald-500" />

          <div className="space-y-8">
            {milestones.map((milestone, index) => (
              <div
                key={milestone.period}
                className={`
                  relative pl-16 transition-all duration-700 ease-out
                  ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}
                `}
                style={{ transitionDelay: `${index * 200}ms` }}
              >
                {/* Dot */}
                <div className={`
                  absolute left-4 top-1 w-5 h-5 rounded-full border-2
                  ${index === milestones.length - 1
                    ? 'bg-emerald-500 border-emerald-400'
                    : 'bg-zinc-900 border-white/30'
                  }
                `} />

                {/* Content */}
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-white/40 text-sm">{milestone.period}</span>
                    <span className={`
                      text-2xl font-bold font-mono
                      ${index === milestones.length - 1 ? 'text-emerald-400' : 'text-white'}
                    `}>
                      {milestone.amount}
                    </span>
                  </div>
                  <p className="text-white/60">{milestone.note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Winners section
 */
function TheWinners() {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.2 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="py-16">
      <h2 className="text-2xl md:text-3xl font-semibold text-white text-center mb-4">
        Others running this loop
      </h2>
      <p className="text-white/50 text-center mb-12">
        Same system, different markets
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
        {WINNERS.map((winner, index) => (
          <div
            key={winner.name}
            className={`
              p-6 rounded-xl
              bg-white/[0.03] border border-white/[0.06]
              transition-all duration-700 ease-out
              ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
            `}
            style={{ transitionDelay: `${index * 150}ms` }}
          >
            <div className="flex items-center gap-4 mb-3">
              {/* Avatar placeholder */}
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center text-white/40 font-medium">
                {winner.name[0]}
              </div>
              <div>
                <div className="text-white font-medium">{winner.name}</div>
                <div className="text-emerald-400 font-mono font-bold">{winner.amount}</div>
              </div>
            </div>
            <p className="text-white/50 text-sm">{winner.story}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 7-Day breakdown teaser
 */
function SevenDays() {
  const days = [
    { day: 1, title: 'Signal', focus: 'Finding companies that need help now' },
    { day: 2, title: 'Match', focus: 'Connecting demand to supply' },
    { day: 3, title: 'Enrich', focus: 'Finding decision makers' },
    { day: 4, title: 'Intro', focus: 'First touch that gets replies' },
    { day: 5, title: 'Route', focus: 'Both sides, same time' },
    { day: 6, title: 'Reply', focus: 'Handling responses' },
    { day: 7, title: 'Deal', focus: 'Closing the retainer' },
  ];

  return (
    <div className="py-16">
      <h2 className="text-2xl md:text-3xl font-semibold text-white text-center mb-4">
        7 days to your first retainer
      </h2>
      <p className="text-white/50 text-center mb-12">
        One step per day. By day 7, you'll have the system running.
      </p>

      <div className="max-w-2xl mx-auto space-y-3">
        {days.map((day, index) => (
          <div
            key={day.day}
            className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] hover:border-white/[0.08] transition-all duration-300"
          >
            <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-white/40 font-mono text-sm">
              {day.day}
            </div>
            <div className="flex-1">
              <div className="text-white font-medium">{day.title}</div>
              <div className="text-white/40 text-sm">{day.focus}</div>
            </div>
            <div className="text-white/20">→</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function GetStarted() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#09090b] text-white overflow-x-hidden">
      {/* Background gradient orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-emerald-500/[0.03] blur-[120px]"
          style={{ transform: `translateY(${scrollY * 0.1}px)` }}
        />
        <div
          className="absolute bottom-[-30%] right-[-20%] w-[70%] h-[70%] rounded-full bg-blue-500/[0.02] blur-[150px]"
          style={{ transform: `translateY(${-scrollY * 0.05}px)` }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Header - Logo centered */}
        <header className="py-8 px-6">
          <div className="flex justify-center">
            <Link to="/" className="flex items-center gap-3 group">
              <img
                src="/image.png"
                alt="Connector OS"
                className="h-8 w-8 transition-transform duration-300 group-hover:scale-105"
              />
              <span className="text-white/80 font-medium tracking-tight">
                Connector OS
              </span>
            </Link>
          </div>
        </header>

        {/* Hero */}
        <section className="px-6 py-16 md:py-24">
          <div className="max-w-4xl mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.05] border border-white/[0.08] mb-8 animate-fade-in">
              <span className="text-emerald-400 text-sm">Free mini-course</span>
              <span className="text-white/30">·</span>
              <span className="text-white/50 text-sm">7 days</span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
              <span className="text-white">From zero relationships to</span>
              <br />
              <span className="bg-gradient-to-r from-emerald-400 to-emerald-300 bg-clip-text text-transparent">
                $10k retainer
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-xl md:text-2xl text-white/50 max-w-2xl mx-auto mb-12 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
              The exact 7-day plan I used after getting banned on Upwork.
              <br className="hidden md:block" />
              One loop. Works in any market.
            </p>
          </div>
        </section>

        {/* The Loop */}
        <section className="px-6 py-8">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-semibold text-white text-center mb-4">
              The loop
            </h2>
            <p className="text-white/50 text-center mb-8">
              Every connector runs this. The ones making money just do it better.
            </p>
            <LoopDiagram />
          </div>
        </section>

        {/* The Math */}
        <section className="px-6">
          <div className="max-w-5xl mx-auto">
            <TheMath />
          </div>
        </section>

        {/* The Story */}
        <section className="px-6">
          <div className="max-w-5xl mx-auto">
            <TheStory />
          </div>
        </section>

        {/* Winners */}
        <section className="px-6">
          <div className="max-w-5xl mx-auto">
            <TheWinners />
          </div>
        </section>

        {/* 7 Days */}
        <section className="px-6">
          <div className="max-w-5xl mx-auto">
            <SevenDays />
          </div>
        </section>

        {/* Footer */}
        <footer className="px-6 py-16 border-t border-white/[0.06]">
          <div className="max-w-5xl mx-auto text-center">
            <Link to="/" className="inline-flex items-center gap-2 text-white/40 hover:text-white/60 transition-colors">
              <img src="/image.png" alt="" className="h-5 w-5 opacity-50" />
              <span className="text-sm">Connector OS</span>
            </Link>
          </div>
        </footer>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.6s ease-out forwards;
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.8s ease-out forwards;
          opacity: 0;
        }
      `}</style>
    </div>
  );
}
