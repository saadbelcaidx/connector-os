import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Database, Mail, Send,
  ChevronRight, Brain, Target, GitBranch, Layers,
  Compass, Eye, Sparkles, Users, Trophy, Play, Linkedin, ExternalLink,
  Rocket, Zap, Clock, Shield, MessageSquare, DollarSign, Flame
} from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

interface DocSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  category: 'philosophy' | 'system' | 'getstarted';
  content: React.ReactNode;
}

// =============================================================================
// ANIMATED COUNTER COMPONENT
// =============================================================================

function AnimatedCounter({ target, duration = 2000 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    if (hasAnimated) return;

    const startTime = Date.now();
    const startValue = 0;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function for smooth deceleration
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentValue = Math.floor(startValue + (target - startValue) * easeOut);

      setCount(currentValue);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setHasAnimated(true);
      }
    };

    // Small delay before starting animation
    const timeout = setTimeout(() => {
      requestAnimationFrame(animate);
    }, 300);

    return () => clearTimeout(timeout);
  }, [target, duration, hasAnimated]);

  return (
    <span>${count.toLocaleString()}</span>
  );
}

// =============================================================================
// DOCUMENTATION CONTENT
// =============================================================================

const sections: DocSection[] = [
  // ---------------------------------------------------------------------------
  // PHILOSOPHY
  // ---------------------------------------------------------------------------
  {
    id: 'foundations',
    title: 'Connector Foundations',
    icon: <Sparkles size={16} />,
    category: 'philosophy',
    content: (
      <article>
        <p className="lead">
          This playbook will show you how the smartest growth people in the world actually make real money — without selling anything. If you apply what's inside, you can start making $25K–$50K within a few months by just placing yourself between two sides of a market and getting paid by both, (yes both!). Do it at scale and make millions. The path to get there won't be easy. But, by the time you finish reading this, it will be clear.
        </p>

        <h3>$0 - $2M/yr</h3>
        <p>
          As a connector, you have incredible power to grow a business from zero to $2 million in revenue, using just a laptop and internet connection.
        </p>
        <p>
          It's so simple in concept: you just find someone who has a big problem, find someone who can fix it, and introduce them to each other. One introduction can change your life.
        </p>
        <p>
          There's no magic trick or shortcut here. Getting strangers to respond, catching people at the exact right moment generating millions in sales, It takes reps. It takes judgment. But it's definitely achievable with the right approach. I know this firsthand - I have used these exact tactics to achieve $48,000 alone in 6 months as a one-man agency, then scaled to $186,505 with 93% margins, with no hiring or bloated teams.
        </p>

        <h3>Why you may consider listening to me</h3>
        <p>
          I started from scratch - working as a bouncer just trying to make some living. After teaching myself to code, I jumped into freelancing, but still struggled to pay the bills. Then one day, I got banned from Upwork. No warning. Just gone.
        </p>
        <p>
          I had several weeks of real despair after that. I remember walking through the city of Limassol, the sun on my face, listening to Carl Jung — The Red Book. (I'm writing its continuation now by the way— The Yellow Book, finishing Jung's work.)
        </p>
        <p>
          What followed wasn't a breakthrough. It was repetition. Long walks. Long thinking. Then building alone, without telling anyone what I was doing.
        </p>
        <p>
          Those systems now generate just over $2M a year while I work about four hours a day. My goal now is to help people do the same and understand that you don't need to be a genius to make millions of dollars — you just need the right tools and guidance.
        </p>
      </article>
    ),
  },
  {
    id: 'winners',
    title: 'Wall of Winners',
    icon: <Trophy size={16} />,
    category: 'philosophy',
    content: (
      <article>
        <p className="lead">
          $826,745 in cash collected by SSM members. Real people. Real results. No fluff.
        </p>

        {/* Disclaimer - fun but premium */}
        <div className="flex items-center gap-2 mb-6 text-[12px] text-white/40">
          <span className="text-[14px]">👀</span>
          <span>We'd need a longer page to show all the wins. Here's a taste.</span>
        </div>

        {/* Total collected banner - Animated with live effect */}
        <div className="p-6 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 mb-8 text-center relative overflow-hidden">
          {/* Shimmer effect for "live" feeling */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-400/10 to-transparent -translate-x-full animate-[shimmer_3s_infinite]" />
          <div className="relative">
            <div className="text-[40px] font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-300 mb-2">
              <AnimatedCounter target={826745} duration={2500} />
            </div>
            <div className="flex items-center justify-center gap-2">
              <div className="relative flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <div className="absolute w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              </div>
              <div className="text-[13px] text-white/50 uppercase tracking-wider flex items-center gap-2">
                <span>Live · Cash collected by</span>
                <a
                  href="https://www.skool.com/ssmasters"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                >
                  <img src="/ssm-logo.png" alt="SSM" className="w-4 h-4 rounded" />
                  <span className="text-white/70">SSM</span>
                </a>
                <span>members</span>
              </div>
            </div>
          </div>
        </div>

        {/* Winners grid */}
        <div className="grid grid-cols-2 gap-4">
          {[
            { name: 'Aarón N.', amount: '€43,000', image: '/winners/aaron.jfif', note: '19 years old', linkedin: 'https://www.linkedin.com/in/aar%C3%B3n-nogueira-bb72692b0' },
            { name: 'John C.', amount: '$13,974', image: '/winners/john.jpg', note: 'and more...', linkedin: 'https://www.linkedin.com/in/john-caesar/' },
            { name: 'Max O.', amount: '$11,331', image: '/winners/max.jfif', note: 'and more...', linkedin: 'https://www.linkedin.com/in/max-ochocinski/' },
            { name: 'Joshua D.', amount: '$6,000', image: '/winners/joshua.jpg', note: 'and more...', linkedin: 'https://www.linkedin.com/in/josh-debayo/' },
          ].map((winner, i) => (
            <div key={i} className="group p-5 rounded-xl bg-gradient-to-br from-emerald-500/[0.08] to-emerald-500/[0.02] border border-emerald-500/20 hover:border-emerald-500/30 transition-all hover:scale-[1.02]">
              <div className="flex items-center gap-4">
                {/* Photo */}
                <div className="relative">
                  <div className="w-14 h-14 rounded-full bg-white/[0.04] border-2 border-emerald-500/30 flex items-center justify-center overflow-hidden shrink-0">
                    <img src={winner.image} alt={winner.name} className="w-full h-full object-cover" />
                  </div>
                  {/* LinkedIn badge */}
                  <a
                    href={winner.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#0A66C2] border-2 border-[#0A0A0A] flex items-center justify-center hover:scale-110 transition-transform"
                    title={`${winner.name}'s LinkedIn`}
                  >
                    <Linkedin size={12} className="text-white" />
                  </a>
                </div>
                {/* Info */}
                <div className="flex-1">
                  <div className="text-[14px] font-medium text-white/90">{winner.name}</div>
                  <div className="text-[18px] font-bold text-emerald-400">{winner.amount}</div>
                  <div className="text-[11px] text-white/40 italic">{winner.note}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* SSM CTA Card */}
        <a
          href="https://www.skool.com/ssmasters"
          target="_blank"
          rel="noopener noreferrer"
          className="block mt-6 p-5 rounded-xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/[0.08] hover:border-white/[0.15] transition-all hover:scale-[1.01] group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0">
                <img src="/ssm-logo.png" alt="SSM" className="w-full h-full object-cover" />
              </div>
              <div>
                <div className="text-[14px] font-medium text-white/90">Want to see all wins?</div>
                <div className="text-[12px] text-white/50">Join the SSM community — hundreds of results posted</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[13px] text-white/40 group-hover:text-white/70 transition-colors">
              <span>Visit SSM</span>
              <ExternalLink size={14} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
          </div>
        </a>

        <h3>These aren't testimonials</h3>
        <p>
          No one wrote a paragraph saying how great the system is. These are bank statements. Invoice screenshots. Stripe dashboards. LinkedIn profiles. Real money that hit real accounts.
        </p>
        <p>
          The connector model works. The only question is whether you'll apply it.
        </p>
      </article>
    ),
  },
  {
    id: 'initiation',
    title: 'Your Initiation',
    icon: <Compass size={16} />,
    category: 'philosophy',
    content: (
      <article>
        <p className="lead">
          Before you learn the Connector model, before you understand dealflow, demand, signals, matching — you must first understand your place in the cosmos.
        </p>

        <h3>You are the Axis Mundi</h3>
        <p>
          You are the pillar between worlds. The midpoint where all forces intersect.
        </p>
        <p>
          Most people live on one side or the other: those who need work, and those who give work. You belong to neither. You stand in the center.
        </p>
        <p>
          You are the mountain at the heart of the world — the still point where both currents converge. Because you are not in the market. You are above it.
        </p>
        <p>
          The seeker is blind because he craves. The buyer is blind because he protects. The operator sees both, because he stands between them.
        </p>

        <h3>The first transformation</h3>
        <p>
          Before you write a single line of connector copy, before you build any system, before you close a single deal — you must accept:
        </p>
        <ul>
          <li>You are the axis.</li>
          <li>You are the bridge.</li>
          <li>You are the center through which the flow moves.</li>
        </ul>
        <p>
          Only then does the doctrine open. Only then does the market reveal its symbolic language.
        </p>

        <h3>Operator principles</h3>
        <p>
          An operator is not made. He is remembered. He blends two forms of knowing:
        </p>
        <ul>
          <li><strong>Forthinking</strong> — the cold, Mungerian logic that sees consequences before they appear.</li>
          <li><strong>Mystic Knowing</strong> — the silent intelligence within you, carried long before you had words for it.</li>
        </ul>
        <p>
          Every person carries an inner pattern — a blueprint beneath personality, a destiny beneath career, an architecture beneath choices. Most never meet it. But you did. You found the edge of yourself — and stepped through.
        </p>

        <h3>The dual path</h3>
        <p>
          Every operator walks with two forces inside him: the cold clarity of foresight, and the mystic certainty of inner vision. Without one, he is blind. Without the other, he is powerless. With both, he becomes inevitable.
        </p>

        <h4>I. Forthinking — the rational blade</h4>
        <ul>
          <li><strong>First-Principle Thinking.</strong> Strip problems to the bone. No assumptions. No borrowed beliefs. Only truth.</li>
          <li><strong>Inversion.</strong> The question isn't "How do I win?" It's "How do I avoid losing?" Remove failure → success emerges.</li>
          <li><strong>Confirmation Bias Awareness.</strong> The operator interrogates his own mind. He assumes he is the one most capable of deceiving himself.</li>
          <li><strong>Long-Term Vision.</strong> He plants seeds he may never harvest. He thinks in decades, not days.</li>
          <li><strong>Infinite-Player Mentality.</strong> He plays to keep playing, not to "win once." His competition burns out. He compounds.</li>
        </ul>

        <h4>II. Mystic knowing — the inner oracle</h4>
        <p>
          If forthinking is the blade, mystic knowing is the breath. This is the operator's intuitive intelligence — the one that speaks from beyond time.
        </p>
        <p>
          Here, he doesn't hope. He doesn't fantasize. He inhabits the future. He imagines a state — then moves into it internally until it becomes inevitable externally.
        </p>

        <h3>The equilibrium</h3>
        <p>
          The operator is the Axis Mundi — the midpoint where logic and mysticism merge.
        </p>
        <ul>
          <li>Forthinking gives him discipline.</li>
          <li>Mystic Knowing gives him destiny.</li>
        </ul>
        <p>
          When both are integrated: his logic becomes prophetic, his intuition becomes structured, his vision becomes executable, his strategy becomes inevitable.
        </p>
        <p>
          The world calls it luck. He knows it as alignment.
        </p>
      </article>
    ),
  },
  {
    id: 'understanding-need',
    title: 'Need & Power',
    icon: <Eye size={16} />,
    category: 'philosophy',
    content: (
      <article>
        <p className="lead">
          In business, there are only two kinds of people: people who need something, and people who decide things. Once you understand these two worlds, everything becomes easier.
        </p>

        <h3>I. The World of Need</h3>
        <p>
          Service providers, creators, agencies, freelancers. This world is full of people who are always looking for help.
        </p>
        <p>They think:</p>
        <ul>
          <li>"I need clients."</li>
          <li>"I need money."</li>
          <li>"I need someone to say yes."</li>
        </ul>
        <p>
          They wake up scared they won't make enough this month. Most people stay stuck in this world for years.
        </p>

        <h3>II. The World of Power</h3>
        <p>
          Buyers, owners, executives, people with budgets. These people think very differently. They don't wake up wanting more offers.
        </p>
        <p>They think:</p>
        <ul>
          <li>"I need to fix this problem fast."</li>
          <li>"I need someone I can trust."</li>
          <li>"I don't want to waste time."</li>
        </ul>
        <p>
          They get hundreds of emails. Too many people trying to sell them things. So they don't need more choices — they need the right person. One clear introduction can save them weeks.
        </p>

        <h3>III. Why Neither World Sees the Other Clearly</h3>
        <p><strong>The world of Need can't see Power clearly.</strong></p>
        <p>
          They think buyers want long stories. They think buyers want fancy websites. They think buyers have time. But buyers only want one thing: "Can you solve my problem fast?"
        </p>
        <p><strong>The world of Power can't see Need clearly.</strong></p>
        <p>
          They think all service providers are the same. They can't tell who's skilled or who's just loud. Both sides misunderstand each other. And that's why nothing happens.
        </p>

        <h3>IV. Why Only the Operator Has Bi-Vision</h3>
        <p>
          The Operator can see both sides at the same time. He knows:
        </p>
        <ul>
          <li>What the buyer urgently needs</li>
          <li>What the provider can actually deliver</li>
          <li>Who needs who, right now</li>
          <li>And when to connect them</li>
        </ul>
        <p>
          This is called <strong>bi-vision</strong> — two kinds of sight at once. It's the reason you close deals without "selling." Because the Operator sees things others don't.
        </p>

        <h3>V. The Law of Dual Perception</h3>
        <p>
          When you can see both worlds clearly, you become extremely valuable. Dual perception means:
        </p>
        <ul>
          <li>You understand the buyer's stress</li>
          <li>You understand the provider's skills</li>
          <li>You see the gap between them</li>
          <li>And you bridge it</li>
        </ul>
        <p>
          This is the Operator's job: to stand in the place the two worlds can't see — and connect them.
        </p>
        <p>
          Buyers trust you because you save them time. Providers trust you because you bring them work. You don't belong to either side. You move between both. And that's why the model works — quietly, cleanly, and powerfully.
        </p>
      </article>
    ),
  },
  {
    id: 'what-is-connector',
    title: 'What Is a Connector?',
    icon: <Users size={16} />,
    category: 'philosophy',
    content: (
      <article>
        <p className="lead">
          A connector is someone who brings together two parties who need each other but haven't found each other yet. Think of yourself as a bridge - you help people cross over to opportunities they couldn't reach on their own.
        </p>

        <p>In business terms, you're the person who:</p>
        <ul>
          <li>Knows what both sides need</li>
          <li>Speaks both sides' language</li>
          <li>Makes introductions that create value</li>
          <li>Gets paid for making successful connections</li>
        </ul>

        <h3>The power you hold</h3>
        <p>
          Most people try to sell services directly. This is the traditional commoditized lead gen/AI agencies go for, but it's weak positioning. This puts you in a crowded marketplace where you're competing on price, skills, or experience.
        </p>
        <p>But as a connector, you:</p>
        <ul>
          <li>Avoid direct competition</li>
          <li>Create value through relationships, not just services</li>
          <li>Build a business that's harder to copy (1:1)</li>
          <li>Can charge for outcomes, not just time</li>
        </ul>
        <p>
          <em>Example: Think of a real estate agent. They don't own houses or build them. They connect buyers with sellers and take a fee for making successful matches.</em>
        </p>

        <h3>The psychology of connection</h3>
        <p><strong>Why B2B businesses trust connectors:</strong></p>
        <p>
          People naturally trust recommendations from a third party more than direct sales pitches. When you position yourself as a connector:
        </p>
        <ul>
          <li>You appear less biased (you're not selling your own service)</li>
          <li>You create a "recommendation shield" (it feels like advice, not selling)</li>
          <li>You trigger reciprocity (you're helping both sides)</li>
          <li>You reduce perceived risk (you've pre-vetted both parties)</li>
        </ul>

        <h3>The "borrowed authority" principle</h3>
        <p>As a connector, you can borrow credibility from both sides of the relationship:</p>
        <ul>
          <li><strong>When talking to Service Providers:</strong> "I know exactly what clients are looking for"</li>
          <li><strong>When talking to Clients:</strong> "I know which service providers deliver results"</li>
        </ul>
        <p>This borrowed authority makes people more likely to listen to you than if you were selling your own services.</p>

        <h3>The three personalities</h3>
        <p>
          Depending on the market, you have to pick your mythic identity. You don't just "exist" — you embody a role that people project meaning onto.
        </p>
        <ul>
          <li><strong>The Insider</strong> — "I've worked in this industry and know all the players"</li>
          <li><strong>The Researcher</strong> — "I've done the hard work of finding and vetting the best options"</li>
          <li><strong>The Network Hub</strong> — "I maintain relationships with the top providers in this space"</li>
        </ul>

        <h3>Creating your connector story</h3>
        <p>
          People need to understand why you're in a position to make valuable connections. You need a story that explains:
        </p>
        <ul>
          <li>How you gained special knowledge about this market</li>
          <li>Why you're motivated to help make these connections</li>
          <li>What unique value you bring to the relationship</li>
          <li>Why both sides should trust your judgment</li>
        </ul>
        <p>
          Pick one of the three personalities above. Build your story around it. That's your positioning.
        </p>
      </article>
    ),
  },
  {
    id: 'what-is-connector-os',
    title: 'What is Connector OS',
    icon: <Layers size={16} />,
    category: 'philosophy',
    content: (
      <article>
        <p className="lead">
          ConnectorOS is the connector infrastructure.
        </p>

        <h3>It does three things automatically</h3>
        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon"><Database size={18} /></div>
            <div className="feature-title">Detects need</div>
            <div className="feature-desc">Finds companies that need something</div>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><Users size={18} /></div>
            <div className="feature-title">Finds matching supply</div>
            <div className="feature-desc">Finds people or companies who already solve that exact problem</div>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><Target size={18} /></div>
            <div className="feature-title">Lets you control the intro</div>
            <div className="feature-desc">You decide when — or if — the two sides meet. Without them seeing each other</div>
          </div>
        </div>

        <p>
          In simpler terms: it shows you who's bleeding, shows you who has the bandage, and lets you charge for the system that creates those introductions.
        </p>
        <p>
          Normally: demand chases supply, supply begs demand, everyone competes and nobody has leverage. You sit above this game.
        </p>

        <h3>Do you hit demand or supply first?</h3>
        <div className="highlight-box">
          <p><strong>Neither. You hit both. Whoever replies first reveals timing.</strong></p>
        </div>
        <p>
          You are never selling. You are routing interest.
        </p>
        <ul>
          <li>If demand replies first → you line up supply</li>
          <li>If supply replies first → you line up demand</li>
          <li>If neither replies → nothing breaks, you rotate</li>
        </ul>
        <p>
          You are never exposed, chasing or stuck. Which gives you the power to charge for:
        </p>
        <ul>
          <li>Access fees</li>
          <li>Retainers</li>
          <li>Commissions</li>
        </ul>
        <p>
          For both sides. Because you didn't create the problem. You didn't create the solution. You controlled the meeting.
        </p>
      </article>
    ),
  },
  {
    id: 'how-to-fail',
    title: 'How To Fail',
    icon: <Target size={16} />,
    category: 'philosophy',
    content: (
      <article>
        <p className="lead">
          If you wanted to guarantee failure as a connector, here's what you'd do.
        </p>

        <h3>1. Hop between tools</h3>
        <p>
          Jump from tool to tool, looking for the magic solution. Blame the software. Never stick with one approach long enough to see compounding. Restart every few months.
        </p>
        <p>
          This is like the farmer who plants corn, digs it up after two weeks to check if it's growing, plants wheat instead, then digs that up too. He starves wondering why nothing works. The tools aren't broken. The compounding never started.
        </p>

        <h3>2. Sell instead of route</h3>
        <p>
          Position yourself as a vendor. Compete on price. Send volume instead of being selective. Let them compare you to cheaper alternatives. Become a commodity.
        </p>
        <p>
          The moment you say "I have leads for you," you become a pipe. Pipes get replaced by cheaper pipes. But the person who says "I might know someone, if the timing is right" — that person has leverage. One is begging. The other is filtering. The market pays filters. It commoditizes pipes.
        </p>

        <h3>3. Talk instead of observe</h3>
        <p>
          Pitch before you understand. Fill silence with words. Ignore timing signals. Act when you're ready, not when they're ready. Treat every lead the same.
        </p>
        <p>
          Watch a bad poker player. He bets when he's excited, not when the cards are right. He talks himself into hands. He sees what he wants to see. The good player waits. He watches patterns. He folds twenty hands to win one big pot. Connectors who talk too much are bad poker players with good intentions.
        </p>

        <p className="closing">
          Now avoid those.
        </p>
      </article>
    ),
  },

  // ---------------------------------------------------------------------------
  // SYSTEM DOCUMENTATION
  // ---------------------------------------------------------------------------
  {
    id: 'architecture',
    title: 'The System',
    icon: <Layers size={16} />,
    category: 'system',
    content: (
      <article>
        <p className="lead">
          Connector OS is infrastructure. It runs continuously, watching for signals, surfacing matches, waiting for your decision.
        </p>

        {/* System Flow Visual */}
        <div className="my-8 p-6 rounded-2xl bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/[0.08]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 text-center">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center mx-auto mb-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <div className="text-[11px] text-white/50">Load</div>
            </div>
            <div className="text-white/20">→</div>
            <div className="flex-1 text-center">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center mx-auto mb-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                </svg>
              </div>
              <div className="text-[11px] text-white/50">Match</div>
            </div>
            <div className="text-white/20">→</div>
            <div className="flex-1 text-center">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center mx-auto mb-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan-400">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.3-4.3"/>
                </svg>
              </div>
              <div className="text-[11px] text-white/50">Enrich</div>
            </div>
            <div className="text-white/20">→</div>
            <div className="flex-1 text-center">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                </svg>
              </div>
              <div className="text-[11px] text-white/50">Send</div>
            </div>
          </div>
        </div>

        <h3>What happens when you open it</h3>
        <p>
          Signals have already been collected. Matches have already been scored. The system has done the work before you arrived. You're not searching — you're scanning what's already been prepared.
        </p>

        <h3>What you don't see</h3>
        <p>
          Behind the interface, pressure is being detected across thousands of data points. Companies hiring. Funding announced. Leadership changes. Expansion signals. The system reads these patterns and inverts them: who has the need, who has the solution.
        </p>

        <h3>What you control</h3>
        <p>
          Timing. You decide when — or if — the intro happens. The system surfaces the opportunity. You control the gate. That's where leverage lives.
        </p>

        <div className="p-5 rounded-xl bg-gradient-to-br from-white/[0.03] to-transparent border border-white/[0.06] mt-6">
          <p className="text-[14px] text-white/60 italic m-0 text-center">
            "The connector doesn't chase. The connector routes."
          </p>
        </div>
      </article>
    ),
  },
  {
    id: 'operator-workflow',
    title: 'Operator Workflow',
    icon: <Play size={16} />,
    category: 'system',
    content: (
      <article>
        <p className="lead">
          The complete operator workflow. From signal to connection. Every decision point mapped.
        </p>

        {/* The Complete Flow */}
        <div className="my-10 p-8 rounded-2xl bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/[0.08]">
          <h3 className="mt-0 mb-6 text-center text-[18px]">The complete flow</h3>
          <div className="flex items-center justify-between gap-2 mb-6">
            {[
              { num: '1', label: 'Load', color: 'blue', desc: 'Datasets load' },
              { num: '2', label: 'Match', color: 'purple', desc: 'Supply matched' },
              { num: '3', label: 'Enrich', color: 'cyan', desc: 'Find contacts' },
              { num: '4', label: 'Send', color: 'emerald', desc: 'Both get intro' },
            ].map((step, i) => (
              <div key={i} className="flex-1 text-center">
                <div className={`w-10 h-10 rounded-xl bg-${step.color}-500/20 border border-${step.color}-500/30 flex items-center justify-center mx-auto mb-2`}>
                  <span className="text-[14px] font-bold text-white/80">{step.num}</span>
                </div>
                <div className="text-[11px] font-medium text-white/70">{step.label}</div>
                <div className="text-[10px] text-white/40 mt-1">{step.desc}</div>
              </div>
            ))}
          </div>
          <div className="h-1 rounded-full bg-gradient-to-r from-blue-500/40 via-purple-500/40 via-cyan-500/40 to-emerald-500/40"/>
        </div>

        {/* Step 1: The Interface */}
        <h3>Step 1: The matching engine interface</h3>
        <p>
          When you open the matching engine, you see two panels:
        </p>

        <div className="my-6 grid grid-cols-2 gap-4">
          <div className="p-5 rounded-xl bg-blue-500/[0.08] border border-blue-500/20">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <span className="text-[16px]">🏢</span>
              </div>
              <span className="text-[14px] font-medium text-white">Left Panel: DEMAND</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 mb-3">
              Companies with signals. These are loaded from your Apify demand dataset.
            </p>
            <ul className="text-[12px] text-white/40 m-0 pl-4 space-y-1">
              <li>Company name & domain</li>
              <li>Signal type (hiring, funding, etc.)</li>
              <li>Job titles being hired</li>
              <li>Signal summary</li>
            </ul>
          </div>

          <div className="p-5 rounded-xl bg-purple-500/[0.08] border border-purple-500/20">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <span className="text-[16px]">👤</span>
              </div>
              <span className="text-[14px] font-medium text-white">Right Panel: SUPPLY</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 mb-3">
              Providers who can help. Matched based on what the demand company needs.
            </p>
            <ul className="text-[12px] text-white/40 m-0 pl-4 space-y-1">
              <li>Provider name & specialty</li>
              <li>Match score</li>
              <li>What they solve</li>
              <li>Their decision-maker</li>
            </ul>
          </div>
        </div>

        {/* Visual: The Two Panels */}
        <div className="my-8 p-6 rounded-2xl bg-black/40 border border-white/[0.08]">
          <div className="grid grid-cols-2 gap-6">
            {/* Left panel mock */}
            <div className="space-y-2">
              <div className="text-[10px] text-blue-400/80 uppercase tracking-wider mb-3">Demand Companies</div>
              {[
                { name: 'TechCorp', signal: 'Hiring 5 engineers', status: 'ready' },
                { name: 'ScaleUp Inc', signal: 'Series B funding', status: 'pending' },
                { name: 'GrowthCo', signal: '3 DevOps roles', status: 'ready' },
              ].map((item, i) => (
                <div key={i} className={`p-3 rounded-lg ${i === 0 ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-white/[0.02] border border-white/[0.06]'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-white/80">{item.name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${item.status === 'ready' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white/40'}`}>
                      {item.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-white/40 mt-1">{item.signal}</div>
                </div>
              ))}
            </div>

            {/* Right panel mock */}
            <div className="space-y-2">
              <div className="text-[10px] text-purple-400/80 uppercase tracking-wider mb-3">Matched Supply</div>
              {[
                { name: 'Toptal', match: '92%', specialty: 'Senior engineers' },
                { name: 'Andela', match: '87%', specialty: 'Remote dev teams' },
                { name: 'Terminal', match: '84%', specialty: 'Engineering talent' },
              ].map((item, i) => (
                <div key={i} className={`p-3 rounded-lg ${i === 0 ? 'bg-purple-500/10 border border-purple-500/30' : 'bg-white/[0.02] border border-white/[0.06]'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-white/80">{item.name}</span>
                    <span className="text-[11px] text-purple-400 font-medium">{item.match}</span>
                  </div>
                  <div className="text-[11px] text-white/40 mt-1">{item.specialty}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="text-[11px] text-white/30 text-center mt-4">
            ↑ Click a demand company on the left, supply options appear on the right
          </div>
        </div>

        {/* Step 2: You Pick the Match */}
        <h3>Step 2: You pick the supply</h3>
        <p>
          When you click a demand company, the system shows matched supply providers. <strong>You pick ONE.</strong>
        </p>

        <div className="my-6 p-5 rounded-xl bg-gradient-to-r from-blue-500/[0.08] via-purple-500/[0.08] to-purple-500/[0.08] border border-white/[0.08]">
          <div className="flex items-center justify-center gap-8">
            <div className="text-center">
              <div className="w-14 h-14 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center mx-auto mb-2">
                <span className="text-[24px]">🏢</span>
              </div>
              <div className="text-[12px] text-white/70">TechCorp</div>
              <div className="text-[10px] text-white/40">Hiring 5 engineers</div>
            </div>

            <div className="flex flex-col items-center">
              <div className="text-[20px] text-white/30 mb-2">→</div>
              <div className="px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.1]">
                <div className="text-[11px] text-white/60 font-medium">You decide</div>
              </div>
              <div className="text-[20px] text-white/30 mt-2">→</div>
            </div>

            <div className="text-center">
              <div className="w-14 h-14 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center mx-auto mb-2">
                <span className="text-[24px]">👤</span>
              </div>
              <div className="text-[12px] text-white/70">Toptal</div>
              <div className="text-[10px] text-white/40">92% match</div>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-amber-500/[0.08] border border-amber-500/20 my-6">
          <div className="flex items-center gap-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400 shrink-0">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
            <p className="text-[13px] text-white/70 m-0">
              <strong>Why one supply per demand?</strong> Sending to multiple providers for the same deal creates confusion and removes your leverage. You're the gatekeeper — you choose who gets the opportunity.
            </p>
          </div>
        </div>

        {/* Step 3: Enrichment */}
        <h3>Step 3: Enrichment (find the decision-maker)</h3>
        <p>
          Before you can send, you need the decision-maker's email. Click "Enrich" and the system finds them.
        </p>

        <div className="my-6 p-5 rounded-xl bg-gradient-to-br from-cyan-500/[0.08] to-cyan-500/[0.02] border border-cyan-500/20">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan-400">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35"/>
              </svg>
            </div>
            <div>
              <div className="text-[14px] font-medium text-white">Enrichment Process</div>
              <div className="text-[12px] text-white/50">Apollo → Anymail Finder → Verified email</div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-black/20 border border-white/[0.06] text-center">
              <div className="text-[18px] mb-1">🏢</div>
              <div className="text-[10px] text-white/40">Domain</div>
              <div className="text-[11px] text-white/70">techcorp.com</div>
            </div>
            <div className="p-3 rounded-lg bg-black/20 border border-white/[0.06] text-center">
              <div className="text-[18px] mb-1">🔍</div>
              <div className="text-[10px] text-white/40">Finding</div>
              <div className="text-[11px] text-white/70">VP Engineering</div>
            </div>
            <div className="p-3 rounded-lg bg-black/20 border border-white/[0.06] text-center">
              <div className="text-[18px] mb-1">👤</div>
              <div className="text-[10px] text-white/40">Found</div>
              <div className="text-[11px] text-white/70">John Smith</div>
            </div>
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-center">
              <div className="text-[18px] mb-1">✉️</div>
              <div className="text-[10px] text-emerald-400/70">Email</div>
              <div className="text-[11px] text-emerald-400">j.smith@...</div>
            </div>
          </div>
        </div>

        {/* Step 4: Send */}
        <h3>Step 4: Send (dual intro)</h3>
        <p>
          Once enriched, you can send. The system generates <strong>two canonical intros</strong> — one for each side. Every intro follows the same structure, enforced by 169 tests.
        </p>

        <div className="my-6 grid grid-cols-2 gap-4">
          <div className="p-5 rounded-xl bg-blue-500/[0.08] border border-blue-500/20">
            <div className="text-[12px] font-medium text-blue-400 mb-3">→ TO DEMAND</div>
            <div className="p-3 rounded-lg bg-black/30 border border-white/[0.06] text-[12px] text-white/60 font-mono">
              Hey John — quick relevance check. I'm connecting biotech companies with teams in the same space. TechCorp came up as a clean fit. I can make the intro if it's useful — if not, no worries.
            </div>
            <div className="text-[11px] text-white/40 mt-3">Sent to the decision-maker at the company with the signal</div>
          </div>

          <div className="p-5 rounded-xl bg-purple-500/[0.08] border border-purple-500/20">
            <div className="text-[12px] font-medium text-purple-400 mb-3">→ TO SUPPLY</div>
            <div className="p-3 rounded-lg bg-black/30 border border-white/[0.06] text-[12px] text-white/60 font-mono">
              Hey Sarah — got a lead. TechCorp is scaling their engineering team. John Smith is running point. Worth a look?
            </div>
            <div className="text-[11px] text-white/40 mt-3">Sent to the provider who can fulfill the need</div>
          </div>
        </div>

        {/* Copy doctrine callout */}
        <div className="my-6 p-4 rounded-xl bg-violet-500/[0.06] border border-violet-500/20">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-violet-400">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div>
              <div className="text-[13px] font-medium text-white/80 mb-1">Copy infrastructure</div>
              <p className="text-[12px] text-white/50 m-0">
                No timing claims without evidence. No "moving fast" without presignal data. The system makes zero claims it can't prove. One file. 169 tests. Zero divergence.
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-gradient-to-br from-emerald-500/[0.08] to-emerald-500/[0.02] border border-emerald-500/20 my-6">
          <p className="text-[13px] text-emerald-400/80 m-0 text-center">
            <strong>Whoever replies first reveals timing.</strong> You route based on who's ready.
          </p>
        </div>

        {/* Daily Limits */}
        <h3>Sending limits & control</h3>
        <p>
          You control how much you send. Set your own daily target and batch size.
        </p>

        <div className="my-6 p-6 rounded-2xl bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/[0.08]">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
              <div className="text-[11px] text-white/40 uppercase tracking-wider mb-2">Daily target</div>
              <div className="text-[24px] font-bold text-white/80">50 – 1,000</div>
              <div className="text-[11px] text-white/40 mt-1">You set the goal</div>
            </div>
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
              <div className="text-[11px] text-white/40 uppercase tracking-wider mb-2">Batch size</div>
              <div className="text-[24px] font-bold text-white/80">1 – 500</div>
              <div className="text-[11px] text-white/40 mt-1">Per send action</div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
              <span className="text-[12px] text-white/60">You pick which matches to send</span>
            </div>
            <div className="flex items-center gap-3">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
              <span className="text-[12px] text-white/60">Adjust batch size up or down anytime</span>
            </div>
            <div className="flex items-center gap-3">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
              <span className="text-[12px] text-white/60">Only approved matches go out</span>
            </div>
            <div className="flex items-center gap-3">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
              <span className="text-[12px] text-white/60">Skip days if needed — no pressure</span>
            </div>
          </div>
        </div>

        {/* Real Scenarios */}
        <h3>Real scenarios</h3>

        {/* Scenario 1 */}
        <div className="my-6 p-6 rounded-2xl bg-gradient-to-br from-blue-500/[0.06] to-blue-500/[0.02] border border-blue-500/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <span className="text-[14px]">1️⃣</span>
            </div>
            <div className="text-[14px] font-medium text-white">Scenario: Hiring Signal</div>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] text-blue-400 font-medium shrink-0 mt-0.5">1</div>
              <div>
                <div className="text-[12px] text-white/70">Signal appears: "Acme Corp hiring 8 DevOps engineers"</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] text-blue-400 font-medium shrink-0 mt-0.5">2</div>
              <div>
                <div className="text-[12px] text-white/70">You click it. Supply shows: Terminal (91%), Andela (88%), Toptal (85%)</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] text-blue-400 font-medium shrink-0 mt-0.5">3</div>
              <div>
                <div className="text-[12px] text-white/70">You pick Terminal (best for DevOps)</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] text-blue-400 font-medium shrink-0 mt-0.5">4</div>
              <div>
                <div className="text-[12px] text-white/70">Click Enrich → System finds VP of Eng: "Mike Chen, mike@acmecorp.com"</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] text-emerald-400 font-medium shrink-0 mt-0.5">5</div>
              <div>
                <div className="text-[12px] text-white/70">Click Send → Two intros go out</div>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-black/20 border border-white/[0.06]">
            <div className="text-[11px] text-white/40">Outcome:</div>
            <div className="text-[12px] text-white/60 mt-1">Mike replies "interested, let's talk" → You connect him with Terminal → Deal closes</div>
          </div>
        </div>

        {/* Scenario 2 */}
        <div className="my-6 p-6 rounded-2xl bg-gradient-to-br from-emerald-500/[0.06] to-emerald-500/[0.02] border border-emerald-500/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <span className="text-[14px]">2️⃣</span>
            </div>
            <div className="text-[14px] font-medium text-white">Scenario: Funding Signal</div>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] text-emerald-400 font-medium shrink-0 mt-0.5">1</div>
              <div>
                <div className="text-[12px] text-white/70">Signal: "Startup XYZ raised $15M Series A"</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] text-emerald-400 font-medium shrink-0 mt-0.5">2</div>
              <div>
                <div className="text-[12px] text-white/70">Funding = they'll need to hire fast</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] text-emerald-400 font-medium shrink-0 mt-0.5">3</div>
              <div>
                <div className="text-[12px] text-white/70">You match them with a recruiting partner who scales startups post-funding</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] text-emerald-400 font-medium shrink-0 mt-0.5">4</div>
              <div>
                <div className="text-[12px] text-white/70">Enrich → Find CEO's email → Send</div>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-black/20 border border-white/[0.06]">
            <div className="text-[11px] text-white/40">Outcome:</div>
            <div className="text-[12px] text-white/60 mt-1">CEO replies "perfect timing, we're about to start hiring" → You make the intro → Commission earned</div>
          </div>
        </div>

        {/* Scenario 3: Neither replies */}
        <div className="my-6 p-6 rounded-2xl bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/[0.08]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
              <span className="text-[14px]">3️⃣</span>
            </div>
            <div className="text-[14px] font-medium text-white">Scenario: Neither Replies</div>
          </div>

          <p className="text-[12px] text-white/50 mb-4">
            Not every send converts. That's expected. Here's what happens:
          </p>

          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-black/20 border border-white/[0.06] text-center">
              <div className="text-[11px] text-white/40 mb-1">You sent</div>
              <div className="text-[14px] text-white/60">2 intros</div>
            </div>
            <div className="p-3 rounded-lg bg-black/20 border border-white/[0.06] text-center">
              <div className="text-[11px] text-white/40 mb-1">No reply</div>
              <div className="text-[14px] text-white/60">Move on</div>
            </div>
            <div className="p-3 rounded-lg bg-black/20 border border-white/[0.06] text-center">
              <div className="text-[11px] text-white/40 mb-1">You lost</div>
              <div className="text-[14px] text-white/60">Nothing</div>
            </div>
          </div>

          <p className="text-[12px] text-white/40 mt-4 mb-0">
            No exposure. No chasing. No wasted time. Just rotate to the next signal.
          </p>
        </div>

        {/* The Doctrine Reminder */}
        <div className="my-8 p-6 rounded-2xl bg-gradient-to-br from-amber-500/[0.08] to-amber-500/[0.02] border border-amber-500/20">
          <h3 className="mt-0 mb-4 text-[16px] text-amber-400/90">Remember the doctrine</h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400 shrink-0 mt-0.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <div className="text-[13px] text-white/60">
                <strong className="text-white/80">Interest ≠ Readiness.</strong> Just because they reply doesn't mean they're ready. You control when they meet.
              </div>
            </div>
            <div className="flex items-start gap-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400 shrink-0 mt-0.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <div className="text-[13px] text-white/60">
                <strong className="text-white/80">Never reveal position.</strong> Don't say "they're ready" or "just waiting on you." You route when timing aligns.
              </div>
            </div>
            <div className="flex items-start gap-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400 shrink-0 mt-0.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <div className="text-[13px] text-white/60">
                <strong className="text-white/80">You're the axis.</strong> Both sides need you. You're not selling — you're connecting potential when timing agrees.
              </div>
            </div>
          </div>
        </div>

        {/* Quick Reference */}
        <h3>Quick reference</h3>
        <div className="my-6">
          <table className="w-full text-[12px]">
            <thead>
              <tr>
                <th className="text-left p-3 bg-white/[0.02] border-b border-white/[0.06] text-white/40 font-medium">Action</th>
                <th className="text-left p-3 bg-white/[0.02] border-b border-white/[0.06] text-white/40 font-medium">What happens</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-3 border-b border-white/[0.04] text-white/60">Click demand company</td>
                <td className="p-3 border-b border-white/[0.04] text-white/50">Supply options appear on right</td>
              </tr>
              <tr>
                <td className="p-3 border-b border-white/[0.04] text-white/60">Select supply</td>
                <td className="p-3 border-b border-white/[0.04] text-white/50">Match is created</td>
              </tr>
              <tr>
                <td className="p-3 border-b border-white/[0.04] text-white/60">Click Enrich</td>
                <td className="p-3 border-b border-white/[0.04] text-white/50">System finds decision-maker email</td>
              </tr>
              <tr>
                <td className="p-3 border-b border-white/[0.04] text-white/60">Click Send</td>
                <td className="p-3 border-b border-white/[0.04] text-white/50">Two intros go out (demand + supply)</td>
              </tr>
              <tr>
                <td className="p-3 border-b border-white/[0.04] text-white/60">Reply comes in</td>
                <td className="p-3 border-b border-white/[0.04] text-white/50">System classifies → you decide next step</td>
              </tr>
              <tr>
                <td className="p-3 text-white/60">Both interested</td>
                <td className="p-3 text-white/50">You make the intro → deal closes</td>
              </tr>
            </tbody>
          </table>
        </div>

      </article>
    ),
  },
  {
    id: 'data-sources',
    title: 'Signals',
    icon: <Database size={16} />,
    category: 'system',
    content: (
      <article>
        <p className="lead">
          The system watches. Companies announce things every day — hiring, funding, expansion. Most people miss it. You won't.
        </p>

        {/* Signal Types Visual */}
        <div className="grid grid-cols-2 gap-3 my-8">
          <div className="p-4 rounded-xl bg-blue-500/[0.08] border border-blue-500/20">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="8.5" cy="7" r="4"/>
                  <path d="M20 8v6M23 11h-6"/>
                </svg>
              </div>
              <span className="text-[13px] font-medium text-white">Hiring</span>
            </div>
            <p className="text-[12px] text-white/50 m-0">Teams scaling, roles opening, urgency building</p>
          </div>

          <div className="p-4 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/20">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
              </div>
              <span className="text-[13px] font-medium text-white">Funding</span>
            </div>
            <p className="text-[12px] text-white/50 m-0">Capital raised means money to spend</p>
          </div>

          <div className="p-4 rounded-xl bg-purple-500/[0.08] border border-purple-500/20">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <span className="text-[13px] font-medium text-white">Leadership</span>
            </div>
            <p className="text-[12px] text-white/50 m-0">New executives bring new initiatives</p>
          </div>

          <div className="p-4 rounded-xl bg-amber-500/[0.08] border border-amber-500/20">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400">
                  <path d="M23 6l-9.5 9.5-5-5L1 18"/>
                  <path d="M17 6h6v6"/>
                </svg>
              </div>
              <span className="text-[13px] font-medium text-white">Growth</span>
            </div>
            <p className="text-[12px] text-white/50 m-0">Expansion signals before announcements</p>
          </div>
        </div>

        <h3>Where signals come from</h3>
        <p>
          Job boards. LinkedIn. Funding databases. The system pulls from sources you'd never have time to monitor manually. It processes thousands of records and extracts what matters: who needs something right now.
        </p>

        {/* Timing Visual */}
        <div className="my-8 p-5 rounded-xl bg-gradient-to-r from-red-500/[0.08] via-amber-500/[0.08] to-emerald-500/[0.08] border border-white/[0.08]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] text-red-400/80">Yesterday</span>
            <span className="text-[11px] text-amber-400/80 font-medium">Today</span>
            <span className="text-[11px] text-emerald-400/80">Next month</span>
          </div>
          <div className="h-2 rounded-full bg-gradient-to-r from-red-500/20 via-amber-500/40 to-emerald-500/20 relative">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-amber-400 rounded-full shadow-lg shadow-amber-500/50"/>
          </div>
          <p className="text-[12px] text-white/50 text-center mt-3 mb-0">
            The window is narrow. The system catches it while it's open.
          </p>
        </div>
      </article>
    ),
  },
  {
    id: 'matching-engine',
    title: 'Matching',
    icon: <GitBranch size={16} />,
    category: 'system',
    content: (
      <article>
        <p className="lead">
          For every need, there's someone who solves it. The system finds both. You decide if they meet.
        </p>

        {/* Matching Flow Visual */}
        <div className="my-8 p-6 rounded-2xl bg-gradient-to-br from-purple-500/[0.08] to-purple-500/[0.02] border border-purple-500/20">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="w-16 h-16 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center mx-auto mb-3">
                <span className="text-[24px]">🏢</span>
              </div>
              <div className="text-[13px] font-medium text-white text-center">Demand</div>
              <div className="text-[11px] text-white/40 text-center">Has a need</div>
            </div>

            <div className="flex-1 flex flex-col items-center px-4">
              <div className="w-full h-px bg-gradient-to-r from-blue-500/50 via-purple-500 to-emerald-500/50 mb-3"/>
              <div className="px-4 py-2 rounded-xl bg-purple-500/20 border border-purple-500/30">
                <div className="text-[12px] font-medium text-purple-300">Match Score</div>
                <div className="text-[18px] font-bold text-white text-center">87%</div>
              </div>
              <div className="w-full h-px bg-gradient-to-r from-blue-500/50 via-purple-500 to-emerald-500/50 mt-3"/>
            </div>

            <div className="flex-1">
              <div className="w-16 h-16 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-3">
                <span className="text-[24px]">👤</span>
              </div>
              <div className="text-[13px] font-medium text-white text-center">Supply</div>
              <div className="text-[11px] text-white/40 text-center">Solves it</div>
            </div>
          </div>
        </div>

        {/* Scoring Factors - matches SignalQualityScorer */}
        <div className="grid grid-cols-4 gap-2 my-6">
          <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] text-center">
            <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Persistence</div>
            <div className="text-[13px] text-white/70">0-30</div>
            <div className="text-[10px] text-white/30 mt-1">How long unfilled</div>
          </div>
          <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] text-center">
            <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Density</div>
            <div className="text-[13px] text-white/70">0-30</div>
            <div className="text-[10px] text-white/30 mt-1">Signal volume</div>
          </div>
          <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] text-center">
            <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Velocity</div>
            <div className="text-[13px] text-white/70">0-20</div>
            <div className="text-[10px] text-white/30 mt-1">Accelerating</div>
          </div>
          <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] text-center">
            <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Stacking</div>
            <div className="text-[13px] text-white/70">0-20</div>
            <div className="text-[10px] text-white/30 mt-1">Multiple types</div>
          </div>
        </div>

        {/* Signal Quality Tiers */}
        <div className="my-8">
          <h3>Signal quality tiers</h3>
          <p className="text-[13px] text-white/50">
            Every signal gets scored based on persistence, density, velocity, and stacking. Higher scores mean stronger timing.
          </p>

          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="p-4 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/20 text-center">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center mx-auto mb-2">
                <span className="text-emerald-400 font-bold text-[14px]">A</span>
              </div>
              <div className="text-[13px] font-medium text-emerald-300">Strong</div>
              <div className="text-[11px] text-white/40 mt-1">Score 70+</div>
              <div className="text-[11px] text-white/30 mt-2">Multiple indicators, timing is now</div>
            </div>

            <div className="p-4 rounded-xl bg-blue-500/[0.08] border border-blue-500/20 text-center">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center mx-auto mb-2">
                <span className="text-blue-400 font-bold text-[14px]">B</span>
              </div>
              <div className="text-[13px] font-medium text-blue-300">Good</div>
              <div className="text-[11px] text-white/40 mt-1">Score 45-69</div>
              <div className="text-[11px] text-white/30 mt-2">Solid indicators, momentum forming</div>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-center">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center mx-auto mb-2">
                <span className="text-white/60 font-bold text-[14px]">C</span>
              </div>
              <div className="text-[13px] font-medium text-white/60">Medium</div>
              <div className="text-[11px] text-white/40 mt-1">Score &lt;45</div>
              <div className="text-[11px] text-white/30 mt-2">Early signs, worth exploring</div>
            </div>
          </div>

          <p className="text-[12px] text-white/40 mt-4 text-center">
            Reach out to all three tiers — timing varies, potential doesn't.
          </p>
        </div>

        <h3>What you decide</h3>
        <p>
          The system suggests. You approve. Some matches are obvious — route them immediately. Some need judgment — wait, gather more context, or skip entirely. You control the gate.
        </p>

        <div className="p-5 rounded-xl bg-gradient-to-br from-emerald-500/[0.08] to-transparent border border-emerald-500/20 mt-6">
          <p className="text-[13px] text-emerald-400/80 m-0 text-center">
            No other tool connects demand to supply with timing. This is the difference.
          </p>
        </div>
      </article>
    ),
  },
  {
    id: 'inbound',
    title: 'Replies',
    icon: <Mail size={16} />,
    category: 'system',
    content: (
      <article>
        <p className="lead">
          You send. They reply. The system handles what comes next — or waits for you to decide.
        </p>

        {/* Reply Classification Visual */}
        <div className="my-8 space-y-3">
          <div className="p-4 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/20 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-[13px] font-medium text-emerald-300">Positive</div>
              <div className="text-[12px] text-white/50">"Yes, I'm interested" → Auto follow-up sent</div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-amber-500/[0.08] border border-amber-500/20 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4M12 8h.01"/>
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-[13px] font-medium text-amber-300">Needs Review</div>
              <div className="text-[12px] text-white/50">Questions, pricing, objections → Waiting for you</div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/40">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-[13px] font-medium text-white/50">Negative</div>
              <div className="text-[12px] text-white/40">Not interested → Archived, move on</div>
            </div>
          </div>
        </div>

        <h3>What the system never says</h3>
        <div className="grid grid-cols-1 gap-2 mt-4">
          <div className="p-3 rounded-lg bg-red-500/[0.06] border border-red-500/20 text-[12px] text-red-300/70">
            ✗ "I'll check and get back to you"
          </div>
          <div className="p-3 rounded-lg bg-red-500/[0.06] border border-red-500/20 text-[12px] text-red-300/70">
            ✗ "They're ready to go"
          </div>
          <div className="p-3 rounded-lg bg-red-500/[0.06] border border-red-500/20 text-[12px] text-red-300/70">
            ✗ "Just waiting on the other side"
          </div>
        </div>
        <p className="text-[13px] text-white/50 mt-3">
          These phrases reveal position. The system protects yours.
        </p>
      </article>
    ),
  },
  {
    id: 'outbound',
    title: 'Routing',
    icon: <Send size={16} />,
    category: 'system',
    content: (
      <article>
        <p className="lead">
          One click. The intro goes. You're not selling — you're routing interest to where it belongs.
        </p>

        {/* Routing Steps Visual */}
        <div className="my-8 p-6 rounded-2xl bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/[0.08]">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-[13px] font-medium text-blue-400">1</div>
              <div className="flex-1">
                <div className="text-[13px] text-white/80">Match appears</div>
                <div className="text-[11px] text-white/40">Scored and ready</div>
              </div>
            </div>
            <div className="ml-4 border-l border-white/[0.08] h-4"/>
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-[13px] font-medium text-purple-400">2</div>
              <div className="flex-1">
                <div className="text-[13px] text-white/80">You approve</div>
                <div className="text-[11px] text-white/40">One click</div>
              </div>
            </div>
            <div className="ml-4 border-l border-white/[0.08] h-4"/>
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-[13px] font-medium text-amber-400">3</div>
              <div className="flex-1">
                <div className="text-[13px] text-white/80">System enriches</div>
                <div className="text-[11px] text-white/40">Decision-maker found</div>
              </div>
            </div>
            <div className="ml-4 border-l border-white/[0.08] h-4"/>
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-[13px] font-medium text-emerald-400">4</div>
              <div className="flex-1">
                <div className="text-[13px] text-white/80">Intro sent</div>
                <div className="text-[11px] text-white/40">You move on</div>
              </div>
            </div>
          </div>
        </div>

        <h3>What you write</h3>
        <p>
          Nothing — unless you want to. The system generates intros based on the match. Specific to the signal. Specific to the person. Not templates. Not mail merge. Contextual.
        </p>

        <div className="p-5 rounded-xl bg-gradient-to-br from-white/[0.03] to-transparent border border-white/[0.06] mt-6">
          <p className="text-[14px] text-white/60 italic m-0 text-center">
            "The intro is the product. Everything else is delivery."
          </p>
        </div>
      </article>
    ),
  },
  {
    id: 'reply-brain',
    title: 'Voice',
    icon: <Brain size={16} />,
    category: 'system',
    content: (
      <article>
        <p className="lead">
          When the system speaks, it sounds like you. Warm but not eager. Brief but not cold. Always protecting your position.
        </p>

        {/* Psyche Header */}
        <div className="my-8 p-6 rounded-2xl bg-gradient-to-br from-violet-500/[0.12] to-violet-500/[0.02] border border-violet-500/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center">
              <span className="text-xl font-serif text-violet-400">Ψ</span>
            </div>
            <div>
              <div className="text-[16px] font-semibold text-white">Psyche</div>
              <div className="text-[12px] text-white/50">The seven minds</div>
            </div>
          </div>
          <p className="text-[13px] text-white/60 m-0">
            Enterprise-grade • 7 systems • Zero embarrassment. Paste any reply you've received. The system analyzes, validates, and generates — passing through seven layers of judgment before you see the output.
          </p>
        </div>

        {/* The Seven Minds Pipeline */}
        <div className="my-8">
          <h3 className="flex items-center gap-2 mb-6">
            <span className="text-sm font-serif text-violet-400">Ψ</span>
            The Seven Minds
          </h3>

          {/* Animated Pipeline Grid */}
          <div className="grid grid-cols-7 gap-2 mb-6">
            {/* Animus */}
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center mb-2 relative">
                <span className="text-[11px] font-bold text-violet-400">1</span>
                <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-2 h-[2px] bg-violet-500/30" />
              </div>
              <span className="text-[10px] font-semibold text-violet-400">Animus</span>
              <span className="text-[9px] text-white/30">Creator</span>
            </div>
            {/* Ego */}
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mb-2 relative">
                <span className="text-[11px] font-bold text-emerald-400">2</span>
                <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-2 h-[2px] bg-emerald-500/30" />
              </div>
              <span className="text-[10px] font-semibold text-emerald-400">Ego</span>
              <span className="text-[9px] text-white/30">Gatekeeper</span>
            </div>
            {/* Senex */}
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mb-2 relative">
                <span className="text-[11px] font-bold text-amber-400">3</span>
                <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-2 h-[2px] bg-amber-500/30" />
              </div>
              <span className="text-[10px] font-semibold text-amber-400">Senex</span>
              <span className="text-[9px] text-white/30">Elder</span>
            </div>
            {/* Shadow */}
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center mb-2 relative">
                <span className="text-[11px] font-bold text-red-400">4</span>
                <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-2 h-[2px] bg-red-500/30" />
              </div>
              <span className="text-[10px] font-semibold text-red-400">Shadow</span>
              <span className="text-[9px] text-white/30">Mirror</span>
            </div>
            {/* Anima */}
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center mb-2 relative">
                <span className="text-[11px] font-bold text-cyan-400">5</span>
                <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-2 h-[2px] bg-cyan-500/30" />
              </div>
              <span className="text-[10px] font-semibold text-cyan-400">Anima</span>
              <span className="text-[9px] text-white/30">Weaver</span>
            </div>
            {/* Magician */}
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded-xl bg-fuchsia-500/20 border border-fuchsia-500/30 flex items-center justify-center mb-2 relative">
                <span className="text-[11px] font-bold text-fuchsia-400">6</span>
                <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-2 h-[2px] bg-fuchsia-500/30" />
              </div>
              <span className="text-[10px] font-semibold text-fuchsia-400">Magician</span>
              <span className="text-[9px] text-white/30">Mover</span>
            </div>
            {/* Self */}
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center mb-2">
                <span className="text-[11px] font-bold text-white">7</span>
              </div>
              <span className="text-[10px] font-semibold text-white">Self</span>
              <span className="text-[9px] text-white/30">Whole</span>
            </div>
          </div>
        </div>

        {/* Layer Details */}
        <div className="my-8 space-y-3">
          <h3>What each mind does</h3>

          <div className="p-4 rounded-xl bg-violet-500/[0.06] border border-violet-500/20">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center text-[11px] font-bold text-violet-400">1</span>
              <div className="flex-1">
                <div className="text-[13px] font-medium text-white">Animus — The Creator</div>
                <div className="text-[12px] text-white/50">Generates the initial reply. Classification, tone, personalization.</div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-[11px] font-bold text-emerald-400">2</span>
              <div className="flex-1">
                <div className="text-[13px] font-medium text-white">Ego — The Gatekeeper</div>
                <div className="text-[12px] text-white/50">Quality check. Blocks anything that sounds desperate, generic, or salesy.</div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-[11px] font-bold text-amber-400">3</span>
              <div className="flex-1">
                <div className="text-[13px] font-medium text-white">Senex — The Elder</div>
                <div className="text-[12px] text-white/50">Doctrine guardian. Ensures leverage is maintained — never chase, never beg.</div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-red-500/[0.06] border border-red-500/20">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center text-[11px] font-bold text-red-400">4</span>
              <div className="flex-1">
                <div className="text-[13px] font-medium text-white">Shadow — The Mirror</div>
                <div className="text-[12px] text-white/50">Red team. Finds how the reply could be misread, ignored, or deleted.</div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-cyan-500/[0.06] border border-cyan-500/20">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center text-[11px] font-bold text-cyan-400">5</span>
              <div className="flex-1">
                <div className="text-[13px] font-medium text-white">Anima — The Weaver</div>
                <div className="text-[12px] text-white/50">Thread coherence. Checks that we're responding to what was actually said.</div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-fuchsia-500/[0.06] border border-fuchsia-500/20">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-fuchsia-500/20 flex items-center justify-center text-[11px] font-bold text-fuchsia-400">6</span>
              <div className="flex-1">
                <div className="text-[13px] font-medium text-white">Magician — The Mover</div>
                <div className="text-[12px] text-white/50">Deal momentum. Ensures every reply moves the conversation forward.</div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white/[0.06] border border-white/20">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-[11px] font-bold text-white">7</span>
              <div className="flex-1">
                <div className="text-[13px] font-medium text-white">Self — The Whole</div>
                <div className="text-[12px] text-white/50">Integration. If composite score is below threshold, Self rewrites until it's right.</div>
              </div>
            </div>
          </div>
        </div>

        {/* Self-Correction Explainer */}
        <div className="my-8 p-5 rounded-xl bg-gradient-to-br from-white/[0.04] to-transparent border border-white/[0.08]">
          <h3 className="flex items-center gap-2 mt-0 mb-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
              <path d="M21 12a9 9 0 0 0-9-9 9 9 0 0 0-9 9 9 9 0 0 0 9 9"/>
              <path d="M21 12l-4 4 4 4"/>
            </svg>
            Self-Correction Loop
          </h3>
          <p className="text-[13px] text-white/50 mb-4">
            The final layer checks the composite score. If it's below 7/10, the system automatically rewrites —
            incorporating all feedback from previous layers. Up to 2 correction rounds before output.
          </p>
          <div className="grid grid-cols-4 gap-2">
            <div className="p-3 rounded-lg bg-amber-500/[0.08] border border-amber-500/20 text-center">
              <div className="text-[11px] text-amber-400">Leverage</div>
              <div className="text-[14px] font-semibold text-white mt-1">0-10</div>
            </div>
            <div className="p-3 rounded-lg bg-cyan-500/[0.08] border border-cyan-500/20 text-center">
              <div className="text-[11px] text-cyan-400">Context</div>
              <div className="text-[14px] font-semibold text-white mt-1">0-10</div>
            </div>
            <div className="p-3 rounded-lg bg-fuchsia-500/[0.08] border border-fuchsia-500/20 text-center">
              <div className="text-[11px] text-fuchsia-400">Momentum</div>
              <div className="text-[14px] font-semibold text-white mt-1">0-10</div>
            </div>
            <div className="p-3 rounded-lg bg-white/[0.08] border border-white/20 text-center">
              <div className="text-[11px] text-white/60">Composite</div>
              <div className="text-[14px] font-semibold text-white mt-1">0-10</div>
            </div>
          </div>
        </div>

        {/* Tone Principles Visual */}
        <div className="my-8 grid grid-cols-3 gap-3">
          <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500/[0.08] to-blue-500/[0.02] border border-blue-500/20 text-center">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center mx-auto mb-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400">
                <path d="M12 2l9 5v10l-9 5-9-5V7l9-5z"/>
              </svg>
            </div>
            <div className="text-[12px] font-medium text-white">Favor</div>
            <div className="text-[11px] text-white/40 mt-1">You're helping them</div>
          </div>

          <div className="p-4 rounded-xl bg-gradient-to-br from-purple-500/[0.08] to-purple-500/[0.02] border border-purple-500/20 text-center">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center mx-auto mb-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                <path d="M22 4L12 14.01l-3-3"/>
              </svg>
            </div>
            <div className="text-[12px] font-medium text-white">Selective</div>
            <div className="text-[11px] text-white/40 mt-1">You filter, not chase</div>
          </div>

          <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/[0.08] to-emerald-500/[0.02] border border-emerald-500/20 text-center">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center mx-auto mb-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div className="text-[12px] font-medium text-white">Protected</div>
            <div className="text-[11px] text-white/40 mt-1">Never reveals position</div>
          </div>
        </div>

        {/* Energy Decay Visual */}
        <div className="my-8">
          <h3>Energy Decay</h3>
          <div className="p-5 rounded-xl bg-gradient-to-r from-amber-500/[0.12] via-amber-500/[0.06] to-white/[0.02] border border-white/[0.08] mt-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] text-amber-400/80 font-medium">Early</span>
              <span className="text-[11px] text-white/40">Message #5</span>
              <span className="text-[11px] text-white/30">Later</span>
            </div>
            <div className="h-1.5 rounded-full bg-gradient-to-r from-amber-500/60 via-amber-500/30 to-white/10"/>
            <div className="flex justify-between mt-3">
              <span className="text-[11px] text-white/50">Warm, explanatory</span>
              <span className="text-[11px] text-white/30">Efficient, just next step</span>
            </div>
          </div>
          <p className="text-[13px] text-white/50 mt-3">
            If it's going nowhere, the system offers an exit. No desperation. No chasing.
          </p>
        </div>

        {/* Philosophy Note */}
        <div className="p-5 rounded-xl bg-gradient-to-br from-white/[0.03] to-transparent border border-white/[0.06] mt-6">
          <p className="text-[14px] text-white/60 italic m-0 text-center">
            "The system just works. We don't show the machinery — only the magic."
          </p>
        </div>
      </article>
    ),
  },
  {
    id: 'faq',
    title: 'FAQ',
    icon: <Compass size={16} />,
    category: 'system',
    content: (
      <article>
        <p className="lead">
          Common questions, answered. Everything you need to know about how the system works.
        </p>

        {/* Token Protection Visual */}
        <div className="my-8 p-6 rounded-2xl bg-gradient-to-br from-emerald-500/[0.08] to-emerald-500/[0.02] border border-emerald-500/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-white m-0">Token Protection</h3>
              <p className="text-[13px] text-white/50 m-0">Your credits are safe. Always.</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="p-3 rounded-xl bg-black/20 border border-white/[0.06] text-center">
              <div className="text-[11px] text-emerald-400/80 uppercase tracking-wider mb-1">Memory</div>
              <div className="text-[13px] text-white/70">Instant</div>
            </div>
            <div className="p-3 rounded-xl bg-black/20 border border-white/[0.06] text-center">
              <div className="text-[11px] text-emerald-400/80 uppercase tracking-wider mb-1">Local</div>
              <div className="text-[13px] text-white/70">30 min</div>
            </div>
            <div className="p-3 rounded-xl bg-black/20 border border-white/[0.06] text-center">
              <div className="text-[11px] text-emerald-400/80 uppercase tracking-wider mb-1">Database</div>
              <div className="text-[13px] text-white/70">Forever</div>
            </div>
          </div>

          <p className="text-[13px] text-white/50 mt-4 mb-0">
            Navigate away, close the browser, come back tomorrow. Your enriched data stays. No duplicate charges.
          </p>
        </div>

        {/* Demand vs Supply Visual */}
        <div className="my-8">
          <h3 className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400">
              <circle cx="12" cy="12" r="10"/>
              <path d="M16 12l-4-4-4 4M12 16V8"/>
            </svg>
            Demand vs Supply
          </h3>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="p-4 rounded-xl bg-blue-500/[0.08] border border-blue-500/20">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                  </svg>
                </div>
                <span className="text-[14px] font-medium text-white">Demand</span>
              </div>
              <p className="text-[12px] text-white/50 m-0">
                Companies with a need. Hiring, funding, expanding, scaling. You reach the decision-maker.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-purple-500/[0.08] border border-purple-500/20">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
                <span className="text-[14px] font-medium text-white">Supply</span>
              </div>
              <p className="text-[12px] text-white/50 m-0">
                Providers who fulfill needs. Agencies, consultants, vendors. You connect them to opportunity.
              </p>
            </div>
          </div>
        </div>

        {/* Common Messages */}
        <div className="my-8">
          <h3 className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
            Message Guide
          </h3>

          <div className="space-y-3 mt-4">
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-start gap-4">
              <div className="px-2 py-1 rounded-md bg-amber-500/10 text-amber-400 text-[11px] font-medium whitespace-nowrap">
                No providers
              </div>
              <div>
                <p className="text-[13px] text-white/70 m-0">Your supply doesn't match this category. Add providers who serve this vertical.</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-start gap-4">
              <div className="px-2 py-1 rounded-md bg-amber-500/10 text-amber-400 text-[11px] font-medium whitespace-nowrap">
                No supply
              </div>
              <div>
                <p className="text-[13px] text-white/70 m-0">No Supply dataset uploaded. Go to Settings → Data Sources.</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-start gap-4">
              <div className="px-2 py-1 rounded-md bg-white/10 text-white/50 text-[11px] font-medium whitespace-nowrap">
                Not enriched
              </div>
              <div>
                <p className="text-[13px] text-white/70 m-0">Click "Enrich" to find the decision-maker at this company.</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-start gap-4">
              <div className="px-2 py-1 rounded-md bg-white/10 text-white/50 text-[11px] font-medium whitespace-nowrap">
                Waiting for data
              </div>
              <div>
                <p className="text-[13px] text-white/70 m-0">No Demand dataset configured. Go to Settings → Data Sources.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Dual Send Visual */}
        <div className="my-8 p-6 rounded-2xl bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/[0.08]">
          <h3 className="flex items-center gap-2 mt-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/60">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
            Dual Send
          </h3>

          <div className="flex items-center justify-center gap-4 my-6">
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center mx-auto mb-2">
                <span className="text-[18px]">🏢</span>
              </div>
              <div className="text-[11px] text-white/50">Demand</div>
            </div>

            <div className="flex-1 flex items-center justify-center">
              <div className="h-px bg-gradient-to-r from-blue-500/50 via-white/20 to-purple-500/50 flex-1"/>
              <div className="px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.1] text-[11px] text-white/60 mx-2">
                You
              </div>
              <div className="h-px bg-gradient-to-r from-purple-500/50 via-white/20 to-blue-500/50 flex-1"/>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center mx-auto mb-2">
                <span className="text-[18px]">👤</span>
              </div>
              <div className="text-[11px] text-white/50">Supply</div>
            </div>
          </div>

          <p className="text-[13px] text-white/50 text-center m-0">
            Both sides get outreach. Whoever replies first reveals timing. You control the connection.
          </p>
        </div>

        {/* Background Enrichment */}
        <div className="my-8">
          <h3 className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan-400">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
            Background Processing
          </h3>

          <div className="p-4 rounded-xl bg-cyan-500/[0.06] border border-cyan-500/20 mt-4">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"/>
              <span className="text-[13px] text-white/70">Enrichment runs in the background while you work.</span>
            </div>
            <p className="text-[12px] text-white/40 mt-2 mb-0">
              Close the tab, grab coffee, come back. Completed work is saved. In-progress work resumes.
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="my-8">
          <h3 className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/60">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Account & Access
          </h3>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[13px] font-medium text-white mb-1">Reset Password</div>
              <p className="text-[12px] text-white/40 m-0">
                Logged in: Settings → Account<br/>
                Logged out: "Forgot password?" on login
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[13px] font-medium text-white mb-1">Request Access</div>
              <p className="text-[12px] text-white/40 m-0">
                SSM members: auto-approved<br/>
                Others: reviewed by Saad
              </p>
            </div>
          </div>
        </div>

      </article>
    ),
  },

  // ---------------------------------------------------------------------------
  // GET STARTED - The 7-Day Playbook
  // ---------------------------------------------------------------------------
  {
    id: 'start-here',
    title: 'Start Here',
    icon: <Rocket size={16} />,
    category: 'getstarted',
    content: (
      <article>
        <p className="lead">
          From zero momentum to your first $10,000 retainer — the exact 7-day plan.
        </p>

        {/* Hero Stats */}
        <div className="my-8 p-6 rounded-2xl bg-gradient-to-br from-emerald-500/[0.12] to-emerald-500/[0.02] border border-emerald-500/20">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-[28px] font-bold text-emerald-400">$0</div>
              <div className="text-[11px] text-white/40">Starting point</div>
            </div>
            <div className="flex items-center justify-center">
              <div className="text-[20px] text-white/20">→</div>
            </div>
            <div>
              <div className="text-[28px] font-bold text-emerald-400">$10,000+</div>
              <div className="text-[11px] text-white/40">First retainer</div>
            </div>
          </div>
        </div>

        <p>
          There are only a few growth levers that could take someone from $0 to $2M/MRR in a matter of months. There are even fewer that could be done with nothing but an internet connection and a laptop — and essentially no budget.
        </p>
        <p>
          Being a connector is one such lever.
        </p>

        <h3>The moment everything changes</h3>
        <p>
          Within seconds of this very moment — without selling anything or banging your head against the wall trying to invent an "irreversible offer" like most gurus tell you to — you could connect two people who already need each other and get paid for that connection from both sides.
        </p>
        <p>
          Could be a company that's been trying to hire a role for months, could be introducing a founder to Naval Ravikant. Or route a $10M check to the right operator.
        </p>
        <p>
          A few minutes from now, that intro could land. A week from now, you could be in rooms you didn't have language for six days ago.
        </p>

        <div className="my-8 p-5 rounded-xl bg-gradient-to-br from-white/[0.04] to-transparent border border-white/[0.08]">
          <p className="text-[14px] text-white/70 italic m-0 text-center">
            "Contrary to popular belief, this doesn't happen linearly. It happens exponentially. There are years where nothing happens — and then there are weeks, even days, where everything happens all at once."
          </p>
        </div>

        <h3>Why you already know this works</h3>
        <p>
          As you're reading this, you already know being a connector works. Instinctively. If you know someone who wants something, and someone who has it, value appears the moment you introduce them. Creating money out of thin air.
        </p>
        <p>
          Entire companies have been built on nothing but connections and referrals.
        </p>

        <div className="p-4 rounded-xl bg-amber-500/[0.08] border border-amber-500/20 my-6">
          <p className="text-[13px] text-white/70 m-0 italic">
            "People have spent millions of words explaining something humans already do naturally."
          </p>
        </div>

        <p>And yet, almost no one makes money from it.</p>

        <h3>Why I built this</h3>
        <p>
          I started myoProcess after eating a ban on Upwork, with nothing but grit and unholy amounts of caffeine, virtually no budget. If I were to go that route again, being a connector is the first thing I'd do to generate a ton of traction and revenue for my business.
        </p>
        <p>
          Because it works.
        </p>

        <p>
          Now, here is your first piece of good news my dear operator — if you are reading this, then you are already in the top 10 percent. Most people get books and then never read them. Watch YouTube videos but never really take action. I can also throw out a spoiler: the further you get in the manual, the bigger the nuggets become. Just watch. This manual delivers.
        </p>

        <p className="text-center my-6">
          You're finished with Section 1.{' '}
          <button
            onClick={() => {
              const section = document.getElementById('ouroboros-loop');
              if (section) section.scrollIntoView({ behavior: 'smooth' });
            }}
            className="text-emerald-400 hover:text-emerald-300 underline underline-offset-4 transition-colors"
          >
            Go here now → The Ouroboros Loop
          </button>
        </p>

        {/* Progression Visual */}
        <div className="my-8 p-6 rounded-2xl bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/[0.08]">
          <div className="text-[10px] text-white/40 uppercase tracking-wider mb-4 text-center">The progression</div>
          <div className="flex items-center justify-between">
            <div className="text-center flex-1">
              <div className="text-[18px] font-bold text-white/60">$40K</div>
              <div className="text-[10px] text-white/30">Month 6</div>
            </div>
            <div className="text-white/20">→</div>
            <div className="text-center flex-1">
              <div className="text-[18px] font-bold text-white/70">$123K</div>
              <div className="text-[10px] text-white/30">Month 10</div>
            </div>
            <div className="text-white/20">→</div>
            <div className="text-center flex-1">
              <div className="text-[18px] font-bold text-white/80">$186K</div>
              <div className="text-[10px] text-white/30">Month 12</div>
            </div>
            <div className="text-white/20">→</div>
            <div className="text-center flex-1">
              <div className="text-[18px] font-bold text-emerald-400">$1M+</div>
              <div className="text-[10px] text-emerald-400/50">6 months later</div>
            </div>
          </div>
        </div>

        <h3>The money line</h3>
        <p>
          Here's what I want you to understand before we go further:
        </p>

        <div className="my-8 p-6 rounded-2xl bg-gradient-to-br from-emerald-500/[0.08] to-emerald-500/[0.02] border border-emerald-500/20">
          <div className="space-y-3 text-center">
            <div className="text-[15px] text-white/70">You don't get paid for the intro.</div>
            <div className="text-[15px] text-white/80">You get paid for the <strong className="text-white">ability</strong> to make intros whenever you want.</div>
            <div className="h-px bg-white/[0.08] my-4" />
            <div className="text-[13px] text-white/50">That ability = <span className="text-emerald-400">Distribution</span></div>
            <div className="text-[13px] text-white/50">Distribution = <span className="text-emerald-400">Monopoly</span></div>
            <div className="text-[13px] text-white/50">Monopoly = <span className="text-emerald-400">Wealth</span></div>
          </div>
        </div>

        <p>
          When you finally understand that, nobody can cut you out. Ever.
        </p>

        <h3>What's next</h3>
        <p>
          The following sections will show you exactly how to go from zero to your first $10,000 deal in 7 days. Not theory. The exact loop, the exact script, the exact protection stack.
        </p>
        <p>
          Let's begin.
        </p>
      </article>
    ),
  },
  {
    id: 'operator-confidence',
    title: '$100,000 Confidence',
    icon: <Flame size={16} />,
    category: 'getstarted',
    content: (
      <article>
        <p className="lead">
          Confidence is genetic. It's already in you. You just reclaim it.
        </p>

        <h3>The real unlock</h3>
        <p>
          Here's something I've noticed in everyone who's printing cash: they genuinely believe, deep in their soul, that they deserve it. Like it's supposed to be theirs. They just take it. No questions asked.
        </p>
        <p>
          So why do you second-guess whether you deserve $10,000 for facilitating a deal that could make someone millions?
        </p>

        <div className="my-8 p-5 rounded-xl bg-amber-500/[0.08] border border-amber-500/20">
          <p className="text-[13px] text-white/70 m-0">
            Some of the dumbest people on earth are printing cash right now — selling bath water, selling bottled air, selling rocks. And you're hesitating to ask for $10,000 for connecting two parties who both benefit?
          </p>
        </div>

        <h3>Familiarity with power</h3>
        <p>
          A member once asked me: "How do you get this cold operator confidence where you don't flinch or feel awkward?"
        </p>
        <p>
          The answer is simple: <strong>familiarity with power</strong>.
        </p>
        <p>
          If you feel awkward about a $50,000 deal, it's just because you're not familiar with operating at that level yet. You flinch because you've never touched $50,000 in your bare hands from a single deal. It's just status anxiety — not being in rooms with people who move that kind of money.
        </p>
        <p>
          I had this too. I was a bouncer. Then a freelancer doing $500 gigs on random automations. Then controlling and routing deals for million-dollar companies.
        </p>

        <div className="my-8 p-6 rounded-2xl bg-gradient-to-br from-violet-500/[0.08] to-violet-500/[0.02] border border-violet-500/20">
          <h4 className="mt-0 mb-4 text-[15px] text-violet-300">The pattern</h4>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center text-[11px] text-violet-400">1</div>
              <span className="text-[13px] text-white/60">You don't wait to feel confident</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center text-[11px] text-violet-400">2</div>
              <span className="text-[13px] text-white/60">You act as confident</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center text-[11px] text-violet-400">3</div>
              <span className="text-[13px] text-white/60">Confidence gets downloaded during the act</span>
            </div>
          </div>
        </div>

        <h3>The collective unconscious</h3>
        <p>
          Confidence isn't something you build. It's already in you. Anyone can tap into it.
        </p>
        <p>
          You walk into the room and your brain goes: "Okay, we're doing this now. I remember this." And it catches up.
        </p>

        <div className="my-8 p-5 rounded-xl bg-gradient-to-br from-white/[0.04] to-transparent border border-white/[0.08]">
          <p className="text-[14px] text-white/70 italic m-0 text-center">
            "You are already who you want to be. Your refusal to believe it is the only reason you do not see it."
          </p>
        </div>

        <h3>Fear and mastery</h3>
        <p>
          If you still have the doubt of "but I'm not ready" or "I don't have enough social proof" — that's just an excuse to stay comfortable. To avoid the fear.
        </p>

        <div className="my-8 p-6 rounded-2xl bg-gradient-to-br from-amber-500/[0.08] to-amber-500/[0.02] border border-amber-500/20">
          <p className="text-[14px] text-white/80 m-0 text-center italic">
            "He who denies fear becomes its slave. He who acknowledges his fear holds it gently in his palm — lives in its presence. He has fear, but fear does not have him."
          </p>
        </div>

        <h3>Stay cold after winning</h3>
        <p>
          Here's the final unlock — the ultimate non-attachment teaching:
        </p>
        <p>
          After you close that huge deal and you become this new person, <strong>never lean into it</strong>. Never treat it like something crazy that just happened. Don't overreact.
        </p>
        <p>
          You should be like: "Oh, it's working. Of course it is." And you move on.
        </p>

        <div className="my-8 grid grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-red-500/[0.06] border border-red-500/20">
            <div className="text-[11px] text-red-400/80 uppercase tracking-wider mb-2">Don't</div>
            <p className="text-[12px] text-white/50 m-0">"OMG I can't believe this happened!"</p>
            <p className="text-[11px] text-white/30 mt-2 m-0">This programs your brain to treat wins as exceptions.</p>
          </div>
          <div className="p-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20">
            <div className="text-[11px] text-emerald-400/80 uppercase tracking-wider mb-2">Do</div>
            <p className="text-[12px] text-white/50 m-0">"Of course. This is just how it works."</p>
            <p className="text-[11px] text-white/30 mt-2 m-0">This programs your brain to expect this as normal.</p>
          </div>
        </div>

        <p>
          When you celebrate too hard, you're unconsciously saying: "This is rare. This is special. This doesn't happen all the time." And your brain absorbs that.
        </p>
        <p>
          But when you stay cold — that's how we make $100,000 the baseline, not the goal.
        </p>

        <h3>The frequency</h3>
        <p>
          Confidence is a frequency. A transmission. When you walk into a room and you're nervous about asking for $10,000, you're really saying: "I don't believe I'm worth this." And the other person feels that.
        </p>
        <p>
          But when you walk in like — "Yeah, that $10,000 is what it's worth. Take it or leave it." That's power. And humans respond to that.
        </p>

        <div className="p-5 rounded-xl bg-gradient-to-br from-emerald-500/[0.08] to-transparent border border-emerald-500/20 mt-8">
          <p className="text-[13px] text-emerald-400/80 m-0 text-center">
            Get into the room. Name the price. Do it scared if you have to. But do it. Every time you do, you're updating the system. The $100,000 confidence shows up automatically — because it's already yours.
          </p>
        </div>
      </article>
    ),
  },
  {
    id: 'ouroboros-loop',
    title: 'The Ouroboros Loop',
    icon: <Zap size={16} />,
    category: 'getstarted',
    content: (
      <article>
        <p className="lead">
          The same loop I used to close $10,000 retainers after getting banned on Upwork. The same loop that took me to $40,000, $123,000, $186,000. It doesn't care where you start.
        </p>

        <h3>Why timing wins</h3>
        <p>
          The internet sucks on a very regular basis. Spam, noise, content you don't care about, ragebait, fighting, people putting a gun to your head to buy something you don't want. That's how almost everyone operates.
        </p>
        <p>
          Most of this fails because it ignores something important: <strong>timing</strong>.
        </p>

        <div className="my-8 p-5 rounded-xl bg-gradient-to-br from-amber-500/[0.08] to-amber-500/[0.02] border border-amber-500/20">
          <p className="text-[13px] text-white/60 m-0">
            Think about this: you're exhausted, halfway through eating a tasty plate of Chicken Alfredo pasta, about to crash. Then someone asks you to "hop on a quick call" or "take a look at something" or "do them a small favor."
          </p>
          <p className="text-[13px] text-white/60 mt-3 mb-0">
            Even if it's reasonable, you're gonna be annoyed. Not because of what they asked — but because of <strong className="text-white">when</strong> they asked.
          </p>
        </div>

        <p>
          Their message didn't suck. The timing did. People don't resist messages. They resist messages that arrive at the wrong moment.
        </p>
        <p>
          So how do you know when? You don't guess. You use a loop.
        </p>

        <h3>The Ouroboros</h3>

        {/* Visual Loop */}
        <div className="my-8 p-6 rounded-2xl bg-gradient-to-br from-emerald-500/[0.08] to-emerald-500/[0.02] border border-emerald-500/20">
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-3 relative">
              <svg viewBox="0 0 100 100" className="w-full h-full">
                <defs>
                  <linearGradient id="ouroborosGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
                    <stop offset="50%" stopColor="#6366f1" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.8" />
                  </linearGradient>
                </defs>
                <circle cx="50" cy="50" r="35" fill="none" stroke="url(#ouroborosGradient)" strokeWidth="3" strokeDasharray="8 4" className="animate-[spin_20s_linear_infinite]" />
                <circle cx="50" cy="50" r="25" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                <text x="50" y="56" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="20" fontFamily="serif">∞</text>
              </svg>
            </div>
            <div className="text-[11px] text-white/40 uppercase tracking-wider">The eternal loop</div>
          </div>

          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="text-center flex-1">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center mx-auto mb-2">
                <span className="text-[12px] font-bold text-blue-400">1</span>
              </div>
              <div className="text-[11px] text-white/60">Signal</div>
            </div>
            <div className="text-white/20">→</div>
            <div className="text-center flex-1">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center mx-auto mb-2">
                <span className="text-[12px] font-bold text-purple-400">2</span>
              </div>
              <div className="text-[11px] text-white/60">Match</div>
            </div>
            <div className="text-white/20">→</div>
            <div className="text-center flex-1">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center mx-auto mb-2">
                <span className="text-[12px] font-bold text-cyan-400">3</span>
              </div>
              <div className="text-[11px] text-white/60">Enrich</div>
            </div>
            <div className="text-white/20">→</div>
            <div className="text-center flex-1">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mx-auto mb-2">
                <span className="text-[12px] font-bold text-amber-400">4</span>
              </div>
              <div className="text-[11px] text-white/60">Route</div>
            </div>
            <div className="text-white/20">→</div>
            <div className="text-center flex-1">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-2">
                <span className="text-[12px] font-bold text-emerald-400">5</span>
              </div>
              <div className="text-[11px] text-white/60">Deal</div>
            </div>
          </div>

          <div className="text-center text-[11px] text-white/40">
            ↑ Learn what works, repeat ↺
          </div>
        </div>

        <p>
          In ancient symbolism, the Ouroboros is the snake eating its own tail — an image of eternity. No beginning. No end. Only continuation.
        </p>
        <p>
          The loop continues to work whether you're at $0, $10,000/month, or $100,000/month. The loop doesn't give a damn.
        </p>

        <h3>Breaking it down</h3>

        <div className="space-y-4 my-8">
          <div className="p-4 rounded-xl bg-blue-500/[0.06] border border-blue-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <span className="text-[12px] font-bold text-blue-400">1</span>
              </div>
              <span className="text-[14px] font-medium text-white">Signal</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-11">
              Noticing when people want something. On both sides: supply and demand.
            </p>

            {/* Restaurant Line Visual */}
            <div className="ml-11 mt-4 p-4 rounded-lg bg-black/20 border border-white/[0.06]">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-1">
                  <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px]">👤</div>
                  <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px]">👤</div>
                  <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px]">👤</div>
                  <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px]">👤</div>
                  <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px]">👤</div>
                </div>
                <div className="text-white/20">→</div>
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-[12px]">🍽️</div>
              </div>
              <p className="text-[11px] text-white/40 m-0 italic">
                If you see a line outside a restaurant, you don't ask people if they're hungry. The line already tells you. That's a signal.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-purple-500/[0.06] border border-purple-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <span className="text-[12px] font-bold text-purple-400">2</span>
              </div>
              <span className="text-[14px] font-medium text-white">Match</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-11">
              Putting them together in the same room. Not the "best" match. Just a fit. Perfection is the enemy of closed deals.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-cyan-500/[0.06] border border-cyan-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                <span className="text-[12px] font-bold text-cyan-400">3</span>
              </div>
              <span className="text-[14px] font-medium text-white">Enrich</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-11">
              Getting the missing context: who they are, what they need, how to reach them. Finding their actual contact information.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <span className="text-[12px] font-bold text-amber-400">4</span>
              </div>
              <span className="text-[14px] font-medium text-white">Route</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-11">
              The intro. Getting paid. Stepping aside. Letting them take it from there.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <span className="text-[12px] font-bold text-emerald-400">5</span>
              </div>
              <span className="text-[14px] font-medium text-white">Deal</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-11">
              Money hits your account. Learn what worked. Feed it back into the loop. Repeat forever.
            </p>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-gradient-to-br from-white/[0.04] to-transparent border border-white/[0.08]">
          <p className="text-[13px] text-white/60 m-0 text-center">
            You do this & learn what works, and do it endlessly like the snake eating its tail. One day you'll wake up with millions in your bank account.
          </p>
        </div>

        <h3>Deep dives</h3>
        <p>
          I wrote about each step of this loop in detail:
        </p>
        <ul>
          <li><a href="/library?page=data-sources" className="text-emerald-400 hover:text-emerald-300">Signals</a> — Where they come from, how to read them</li>
          <li><a href="/library?page=matching-engine" className="text-emerald-400 hover:text-emerald-300">Matching</a> — How to pair demand with supply</li>
          <li><a href="/library?page=outbound" className="text-emerald-400 hover:text-emerald-300">Routing</a> — The intro mechanics</li>
        </ul>
      </article>
    ),
  },
  {
    id: 'day-1-to-7',
    title: 'The 7 Days',
    icon: <Clock size={16} />,
    category: 'getstarted',
    content: (
      <article>
        <p className="lead">
          The exact 7-day execution plan. From zero signals to your first retainer. No fluff, just moves.
        </p>

        {/* Day 1 */}
        <div className="my-8 p-6 rounded-2xl bg-gradient-to-br from-blue-500/[0.08] to-blue-500/[0.02] border border-blue-500/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <span className="text-[14px] font-bold text-blue-400">1</span>
            </div>
            <div>
              <div className="text-[16px] font-semibold text-white">Signal Hunting</div>
              <div className="text-[11px] text-white/40">Find 150 companies that need something right now</div>
            </div>
          </div>

          <div className="space-y-3 mt-4">
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Set up your first Apify dataset (job postings, funding, leadership changes)</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Load it into Connector OS</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Understand the tier system: A (hot), B (warm), C (exploring)</span>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-black/20 border border-white/[0.06]">
            <div className="text-[10px] text-blue-400/80 uppercase tracking-wider mb-1">End of Day 1</div>
            <div className="text-[12px] text-white/50">You have a list of 150 companies bleeding.</div>
          </div>
        </div>

        {/* Day 2 */}
        <div className="my-8 p-6 rounded-2xl bg-gradient-to-br from-purple-500/[0.08] to-purple-500/[0.02] border border-purple-500/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <span className="text-[14px] font-bold text-purple-400">2</span>
            </div>
            <div>
              <div className="text-[16px] font-semibold text-white">Building Your Supply</div>
              <div className="text-[11px] text-white/40">Find 150 providers who solve what those companies need</div>
            </div>
          </div>

          <div className="space-y-3 mt-4">
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Identify who counts as supply (recruiters, agencies, consultants)</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Source from LinkedIn, Clutch, agency directories</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Pick your identity: Insider, Researcher, or Network Hub</span>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-black/20 border border-white/[0.06]">
            <div className="text-[10px] text-purple-400/80 uppercase tracking-wider mb-1">End of Day 2</div>
            <div className="text-[12px] text-white/50">You have demand AND supply. The loop can begin.</div>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-purple-500/[0.08] border border-purple-500/20">
            <div className="text-[11px] text-white/50">
              <strong className="text-white/70">Deep dive:</strong> I wrote about the three connector identities <a href="/library?page=what-is-connector" className="text-purple-400 hover:text-purple-300">here</a>.
            </div>
          </div>
        </div>

        {/* Day 3 */}
        <div className="my-8 p-6 rounded-2xl bg-gradient-to-br from-cyan-500/[0.08] to-cyan-500/[0.02] border border-cyan-500/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
              <span className="text-[14px] font-bold text-cyan-400">3</span>
            </div>
            <div>
              <div className="text-[16px] font-semibold text-white">First Matches</div>
              <div className="text-[11px] text-white/40">Match 150 demand companies to supply partners</div>
            </div>
          </div>

          <div className="space-y-3 mt-4">
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Use the matching engine to pair demand → supply</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Rule: ONE supply per demand (you're the gatekeeper)</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Enrich to find decision-makers</span>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-black/20 border border-white/[0.06]">
            <div className="text-[10px] text-cyan-400/80 uppercase tracking-wider mb-1">End of Day 3</div>
            <div className="text-[12px] text-white/50">150 matched pairs, enriched, ready to send.</div>
          </div>
        </div>

        {/* Day 4 */}
        <div className="my-8 p-6 rounded-2xl bg-gradient-to-br from-amber-500/[0.08] to-amber-500/[0.02] border border-amber-500/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <span className="text-[14px] font-bold text-amber-400">4</span>
            </div>
            <div>
              <div className="text-[16px] font-semibold text-white">First Intros Go Out</div>
              <div className="text-[11px] text-white/40">Send 150 intros (300 messages — 150 demand + 150 supply)</div>
            </div>
          </div>

          <div className="space-y-3 mt-4">
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Dual intro format: hit both sides at the same time</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Voice: warm but not eager, brief but not cold</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Never say "they're ready" or "waiting on them"</span>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-black/20 border border-white/[0.06]">
            <div className="text-[10px] text-amber-400/80 uppercase tracking-wider mb-1">End of Day 4</div>
            <div className="text-[12px] text-white/50">300 messages in the world. The loop is live.</div>
          </div>
        </div>

        {/* Day 5 */}
        <div className="my-8 p-6 rounded-2xl bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/[0.08]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <span className="text-[14px] font-bold text-white/60">5</span>
            </div>
            <div>
              <div className="text-[16px] font-semibold text-white">The Silence</div>
              <div className="text-[11px] text-white/40">Understand what's happening while you wait</div>
            </div>
          </div>

          <div className="space-y-3 mt-4">
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-white/40 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Most won't reply. That's expected.</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-white/40 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">The ones who reply fast = timing is right</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-white/40 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Stack more signals while you wait (loop continues)</span>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-black/20 border border-white/[0.06]">
            <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">End of Day 5</div>
            <div className="text-[12px] text-white/50">You've added 150 more signals. Pipeline is building.</div>
          </div>
        </div>

        {/* Day 6 */}
        <div className="my-8 p-6 rounded-2xl bg-gradient-to-br from-fuchsia-500/[0.08] to-fuchsia-500/[0.02] border border-fuchsia-500/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-fuchsia-500/20 flex items-center justify-center">
              <span className="text-[14px] font-bold text-fuchsia-400">6</span>
            </div>
            <div>
              <div className="text-[16px] font-semibold text-white">Handling Replies</div>
              <div className="text-[11px] text-white/40">Respond to whoever replied — correctly</div>
            </div>
          </div>

          <div className="space-y-3 mt-4">
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Positive reply → move toward the intro</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Questions → answer without revealing position</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Negative → archive, move on, no hard feelings</span>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-black/20 border border-white/[0.06]">
            <div className="text-[10px] text-fuchsia-400/80 uppercase tracking-wider mb-1">End of Day 6</div>
            <div className="text-[12px] text-white/50">Active conversations. Timing is forming.</div>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-fuchsia-500/[0.08] border border-fuchsia-500/20">
            <div className="text-[11px] text-white/50">
              <strong className="text-white/70">The doctrine:</strong> Interest ≠ readiness. <a href="/library?page=initiation" className="text-fuchsia-400 hover:text-fuchsia-300">Read more</a>.
            </div>
          </div>
        </div>

        {/* Day 7 */}
        <div className="my-8 p-6 rounded-2xl bg-gradient-to-br from-emerald-500/[0.12] to-emerald-500/[0.02] border border-emerald-500/30">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <span className="text-[14px] font-bold text-emerald-400">7</span>
            </div>
            <div>
              <div className="text-[16px] font-semibold text-white">The Close</div>
              <div className="text-[11px] text-white/40">Make one real introduction</div>
            </div>
          </div>

          <div className="space-y-3 mt-4">
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Both sides showed interest → NOW you connect them</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Frame the intro (you're helping both sides)</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Get paid: retainer + commission structure</span>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-emerald-500/[0.12] border border-emerald-500/30">
            <div className="text-[10px] text-emerald-400/80 uppercase tracking-wider mb-1">End of Day 7</div>
            <div className="text-[12px] text-emerald-300/80">One intro made. One deal in motion. The loop continues.</div>
          </div>
        </div>

        {/* The Math */}
        <h3>The math</h3>

        <div className="my-6 p-5 rounded-xl bg-gradient-to-br from-emerald-500/[0.12] to-emerald-500/[0.02] border border-emerald-500/20">
          <div className="space-y-2 text-[13px]">
            <div className="flex justify-between text-white/60">
              <span>300 messages/day × 20 days</span>
              <span className="text-white/80">= 6,000/month</span>
            </div>
            <div className="flex justify-between text-white/60">
              <span>2% reply rate</span>
              <span className="text-white/80">= 120 replies</span>
            </div>
            <div className="flex justify-between text-white/60">
              <span>10% convert to intros</span>
              <span className="text-white/80">= 12 warm intros</span>
            </div>
            <div className="flex justify-between text-white/60">
              <span>25% close</span>
              <span className="text-white/80">= 3 deals</span>
            </div>
            <div className="h-px bg-white/[0.1] my-3" />
            <div className="flex justify-between text-white">
              <span>$8,000-$10,000 retainer × 3</span>
              <span className="text-emerald-400 font-semibold">= $24,000-$30,000/month</span>
            </div>
          </div>
          <p className="text-[11px] text-white/40 mt-3 mb-0 text-center">Plus commission on the back end from supply.</p>
        </div>

        {/* Money Model */}
        <h3>How you get paid</h3>
        <p>Both sides pay. Neither knows what the other paid.</p>

        <div className="my-6 grid grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-blue-500/[0.08] border border-blue-500/20">
            <div className="text-[11px] text-blue-400/80 uppercase tracking-wider mb-2">Demand pays</div>
            <div className="text-[14px] font-medium text-white mb-1">Retainer (upfront)</div>
            <div className="text-[12px] text-white/50">For curation — you filtered 100 providers down to 1.</div>
          </div>
          <div className="p-4 rounded-xl bg-purple-500/[0.08] border border-purple-500/20">
            <div className="text-[11px] text-purple-400/80 uppercase tracking-wider mb-2">Supply pays</div>
            <div className="text-[14px] font-medium text-white mb-1">Access fee + Commission</div>
            <div className="text-[12px] text-white/50">For access + % when deal closes. They're earning from your intro.</div>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-gradient-to-br from-emerald-500/[0.08] to-transparent border border-emerald-500/20">
          <p className="text-[13px] text-emerald-400/80 m-0 text-center">
            Upfront from both — small. The real money comes from Supply when the deal closes. You brought them the bag. They share.
          </p>
        </div>
      </article>
    ),
  },
  {
    id: 'protection-stack',
    title: 'The Protection Stack',
    icon: <Shield size={16} />,
    category: 'getstarted',
    content: (
      <article>
        <p className="lead">
          Three things that make it impossible to cut you out. These made me over $1 million in 6 months working 4 hours a day.
        </p>

        {/* The Three Locks Visual */}
        <div className="my-8 p-6 rounded-2xl bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/[0.08]">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="w-14 h-14 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-3">
                <span className="text-[20px]">📄</span>
              </div>
              <div className="text-[13px] font-medium text-white">The Contract</div>
              <div className="text-[11px] text-white/40">Locks you in legally</div>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mx-auto mb-3">
                <span className="text-[20px]">🎯</span>
              </div>
              <div className="text-[13px] font-medium text-white">The Script</div>
              <div className="text-[11px] text-white/40">Controls who gets what</div>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center mx-auto mb-3">
                <span className="text-[20px]">📊</span>
              </div>
              <div className="text-[13px] font-medium text-white">The Dashboard</div>
              <div className="text-[11px] text-white/40">Shows the system is working</div>
            </div>
          </div>
        </div>

        <p>
          If you have these three, they can't bypass you or cut you out. Not legally, not operationally, and not economically.
        </p>

        <div className="my-8 p-5 rounded-xl bg-amber-500/[0.08] border border-amber-500/20">
          <p className="text-[13px] text-white/70 m-0">
            <strong className="text-white">The mindset shift:</strong> If you're asking "how do I make sure they don't cut me out?" — you're still thinking like a freelancer. Freelancers worry about getting cut out. Distribution owners don't. Because you don't sell the intro. You sell the system that creates intros. And you can't bypass the system.
          </p>
        </div>

        <h3>1. The Contract</h3>
        <p>
          This locks your position legally. Don't skip it — if you do, clients can go around you and you have no leverage.
        </p>

        <div className="my-6 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <div className="text-[11px] text-white/40 uppercase tracking-wider mb-3">Key clauses</div>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60"><strong className="text-white/80">Flow mechanism:</strong> "If payment stops, the flow stops."</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60"><strong className="text-white/80">Non-circumvention:</strong> 12 months after termination, they can't bypass you.</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60"><strong className="text-white/80">Minimum term:</strong> 6-month retainer.</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60"><strong className="text-white/80">48-hour expiry:</strong> Creates urgency. No "let me think about it for 2 weeks."</span>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20 my-6">
          <div className="text-[11px] text-white/50">
            <strong className="text-white/70">Watch the full breakdown:</strong> I made a video walking through the exact contract setup, Stripe integration, and the 48-hour expiry trick. <span className="text-emerald-400">[YouTube link]</span>
          </div>
        </div>

        <h3>2. The Script (5 Qualification Questions)</h3>
        <p>
          The contract protects you legally. The script protects you when you're talking to them. If you don't control the conversation, you lose control of the deal.
        </p>

        <div className="my-6 space-y-3">
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-[11px] text-amber-400 font-bold">1</div>
              <span className="text-[13px] font-medium text-white">Capacity Check</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">"If I introduce you to someone this week, what's your actual capacity to take on work right now?"</p>
          </div>

          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-[11px] text-amber-400 font-bold">2</div>
              <span className="text-[13px] font-medium text-white">Failure Mode Check</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">"In the past 90 days, what's gone wrong with the vendors you've tried?"</p>
          </div>

          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-[11px] text-amber-400 font-bold">3</div>
              <span className="text-[13px] font-medium text-white">Money Check</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">"What's the financial impact when this problem isn't solved fast?"</p>
          </div>

          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-[11px] text-amber-400 font-bold">4</div>
              <span className="text-[13px] font-medium text-white">Decision-Maker Check</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">"Who besides you needs to approve moving forward once I make the intro?"</p>
          </div>

          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-[11px] text-amber-400 font-bold">5</div>
              <span className="text-[13px] font-medium text-white">Fit Check</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">"Describe your ideal partner in one sentence — what must they have or avoid?"</p>
          </div>
        </div>

        <h4>The Operator Frame</h4>
        <p>After they answer, you say:</p>
        <div className="my-4 p-4 rounded-xl bg-gradient-to-br from-amber-500/[0.08] to-amber-500/[0.02] border border-amber-500/20">
          <p className="text-[13px] text-white/80 m-0 italic">
            "Based on what you told me, I can introduce you — but I don't do one-off intros. I run a system that creates opportunities every single month. One intro solves today's problem. The system solves every month's problem from today forward."
          </p>
        </div>
        <p className="text-[13px] text-white/50">
          This is where the retainer becomes logical, not a pitch.
        </p>

        <h4>The Close</h4>
        <div className="my-4 p-4 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/20">
          <p className="text-[13px] text-white/80 m-0 italic">
            "If I create the system that brings you consistent opportunities, do you want to be one of the partners I prioritize?"
          </p>
        </div>
        <p className="text-[13px] text-white/50">
          This frames you as a distribution owner, makes them apply to work with you, reverses the pressure, and positions you above the market.
        </p>

        <h3>3. The Dashboard</h3>
        <p>
          The contract locks you in. The script controls the conversation. The dashboard shows them the system is actually working every single month.
        </p>
        <p>
          Without this, they don't see the value. They think you got lucky one time. But when you send them this every Monday, they see new opportunities coming in. They see the flow growing. They see they can't do this themselves.
        </p>

        <div className="my-6 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <div className="text-[11px] text-white/40 uppercase tracking-wider mb-3">Four tabs</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-black/20 border border-white/[0.06]">
              <div className="text-[12px] font-medium text-white mb-1">Active Intros</div>
              <div className="text-[11px] text-white/40">Track every introduction, status, revenue potential</div>
            </div>
            <div className="p-3 rounded-lg bg-black/20 border border-white/[0.06]">
              <div className="text-[12px] font-medium text-white mb-1">New Signals</div>
              <div className="text-[11px] text-white/40">Fresh opportunities scraped this week</div>
            </div>
            <div className="p-3 rounded-lg bg-black/20 border border-white/[0.06]">
              <div className="text-[12px] font-medium text-white mb-1">Revenue Tracking</div>
              <div className="text-[11px] text-white/40">Setup fees, commissions, monthly totals</div>
            </div>
            <div className="p-3 rounded-lg bg-black/20 border border-white/[0.06]">
              <div className="text-[12px] font-medium text-white mb-1">Client List</div>
              <div className="text-[11px] text-white/40">Active retainers, status, next actions</div>
            </div>
          </div>
        </div>

        <h4>Monday Morning Ritual (30-45 min)</h4>
        <div className="my-4 space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] text-blue-400">1</div>
            <span className="text-[13px] text-white/60">Scrape new signals from LinkedIn, Apollo, Crunchbase</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] text-blue-400">2</div>
            <span className="text-[13px] text-white/60">Qualify urgent ones, reach out to qualified signals</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] text-blue-400">3</div>
            <span className="text-[13px] text-white/60">Send weekly updates to retainer clients</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-blue-500/[0.06] border border-blue-500/20 my-6">
          <div className="text-[11px] text-white/50">
            <strong className="text-white/70">Watch the full breakdown:</strong> I made a video walking through the exact dashboard setup, weekly workflow, and SOPs. <span className="text-blue-400">[YouTube link]</span>
          </div>
        </div>
      </article>
    ),
  },
  {
    id: 'four-layers',
    title: 'The Four Layers',
    icon: <Layers size={16} />,
    category: 'getstarted',
    content: (
      <article>
        <p className="lead">
          Why nobody can cut you out. You either do the work, or you control who gets the work. The first group gets replaced. The second group gets paid forever.
        </p>

        <div className="my-8 p-6 rounded-2xl bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/[0.08]">
          <div className="space-y-4">
            {/* Layer 1 */}
            <div className="p-4 rounded-xl bg-blue-500/[0.06] border border-blue-500/20">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <span className="text-[12px] font-bold text-blue-400">1</span>
                </div>
                <span className="text-[14px] font-medium text-white">Data they don't have</span>
              </div>
              <p className="text-[12px] text-white/50 m-0 ml-11">
                Every week you scrape new companies hiring. New agencies looking for clients. Track who needs what right now. Map both sides. They don't see the whole picture. You do.
              </p>
            </div>

            {/* Layer 2 */}
            <div className="p-4 rounded-xl bg-purple-500/[0.06] border border-purple-500/20">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <span className="text-[12px] font-bold text-purple-400">2</span>
                </div>
                <span className="text-[14px] font-medium text-white">Filtering they can't do</span>
              </div>
              <p className="text-[12px] text-white/50 m-0 ml-11">
                You check both sides: Are they serious or just looking? Can they actually deliver or pay? Do they move fast or waste time? Are they the right match? They can't do this themselves. They don't even know what makes a good match.
              </p>
            </div>

            {/* Layer 3 */}
            <div className="p-4 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                  <span className="text-[12px] font-bold text-amber-400">3</span>
                </div>
                <span className="text-[14px] font-medium text-white">If you stop paying, the flow stops</span>
              </div>
              <p className="text-[12px] text-white/50 m-0 ml-11">
                The most important part. One intro is fine, but if you want new opportunities every week, you need the system running. If you pause, the flow pauses. People don't fear losing you — they fear losing the flow.
              </p>
            </div>

            {/* Layer 4 */}
            <div className="p-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <span className="text-[12px] font-bold text-emerald-400">4</span>
                </div>
                <span className="text-[14px] font-medium text-white">Weekly compounding</span>
              </div>
              <p className="text-[12px] text-white/50 m-0 ml-11">
                Every Monday your system finds new buyers, new sellers, spots new signals, grows the map. This makes you impossible to replace. They can't cut out the thing that's always finding new opportunities.
              </p>
            </div>
          </div>
        </div>

        <h3>How you actually say this</h3>
        <p>
          You can't just be like "Hey, don't cut me out." Instead, you frame it as the natural way the system works:
        </p>

        <div className="my-6 p-5 rounded-xl bg-gradient-to-br from-white/[0.04] to-transparent border border-white/[0.08]">
          <p className="text-[13px] text-white/80 m-0 italic">
            "Look, one intro is fine — but that's not what gets you your goals. Your goals require a system that creates new opportunities every single month. And the only reason that works is because I control the flow. Cutting me out removes the part that actually makes you money. So it's in your best interest to keep the system running."
          </p>
        </div>

        <p>
          Simple. Clean. No fear. Because you're speaking from leverage.
        </p>

        <h3>The Netflix analogy</h3>
        <p>
          It's like trying to bypass Netflix's recommendation algorithm. You don't know how it picks what to show you. You just see the result. Same thing here.
        </p>

        <div className="p-5 rounded-xl bg-gradient-to-br from-emerald-500/[0.08] to-transparent border border-emerald-500/20 mt-8">
          <p className="text-[14px] text-emerald-400/90 m-0 text-center font-medium">
            You are the algorithm. And you can't bypass the algorithm.
          </p>
        </div>

        <h3>Why this works</h3>
        <p>
          Clients don't cut out distribution owners. They cut out freelancers. Because:
        </p>
        <ul>
          <li>Freelancers do the work</li>
          <li>Operators control who gets the work</li>
        </ul>
        <p>
          People replace the person doing the work. They don't replace the person giving them opportunities. Because if they lose you, they lose:
        </p>
        <ul>
          <li>Fast intros when they need them</li>
          <li>New opportunities every month</li>
          <li>First access to the best deals</li>
          <li>Momentum</li>
        </ul>
        <p>
          And losing momentum costs them way more than paying you.
        </p>
      </article>
    ),
  },
  {
    id: 'trench-hacks',
    title: 'Trench Hacks',
    icon: <MessageSquare size={16} />,
    category: 'getstarted',
    content: (
      <article>
        <p className="lead">
          16 small hacks that add 50-70% more closes. Stuff you only learn after 100+ deals.
        </p>

        <p>
          These are the little things nobody talks about because they don't even know they're doing them. But they quietly double your show-up rate and cash collected.
        </p>

        {/* Pre-Call Hacks */}
        <h3>Pre-Call Hacks</h3>

        <div className="space-y-3 my-6">
          <div className="p-4 rounded-xl bg-blue-500/[0.06] border border-blue-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] text-blue-400 font-bold">1</div>
              <span className="text-[13px] font-medium text-white">Limit booking windows</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              Only allow booking 24-48 hours forward, never weeks out. If people can book 2 weeks out, close rate drops 80%. A tight window makes them think "this must be important — he's in demand."
            </p>
          </div>

          <div className="p-4 rounded-xl bg-blue-500/[0.06] border border-blue-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] text-blue-400 font-bold">2</div>
              <span className="text-[13px] font-medium text-white">Uber communicate before kickoff</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              Send confirmation + 24hr reminder + 2hr reminder + 5min reminder. At least one message should be human: "Hey [name], looking forward to meeting you. I'll be the one walking you through how we hit [their goal]."
            </p>
          </div>
        </div>

        {/* Communication Hacks */}
        <h3>Communication Hacks (On-Call)</h3>

        <div className="space-y-3 my-6">
          <div className="p-4 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px] text-amber-400 font-bold">3</div>
              <span className="text-[13px] font-medium text-white">Compression technique</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              Senior people hate long explanations. When they ask "how does this work?" — don't explain the whole system. Say: "Sure — 20 seconds: signals, outbound, intros, deals. Done. Now tell me what part you care about and I'll zoom in."
            </p>
          </div>

          <div className="p-4 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px] text-amber-400 font-bold">4</div>
              <span className="text-[13px] font-medium text-white">"I don't need you" micro frame</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              Decision makers test your dependency. When they say "why should we do this now?" — you say: "You shouldn't. Unless you want intros without adding headcount. If not, totally fine." Power expects power. They don't want someone begging.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px] text-amber-400 font-bold">5</div>
              <span className="text-[13px] font-medium text-white">"Here's the part you'll push back on"</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              People with money trust people who reveal weak points. Say: "There's one part you're probably going to push back on — the ramp-up window. It takes 2-3 weeks before data becomes predictable. I want you to be aware of that upfront." Preempt the objection → they stop imagining you're hiding things.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px] text-amber-400 font-bold">6</div>
              <span className="text-[13px] font-medium text-white">Mutual evaluation frame</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              When they ask aggressive questions like "How many clients like us have you done?" — don't justify. Say: "Happy to share, but before I go there — I want to make sure the way you work fits the way I build systems. What's your internal bandwidth like right now?" Flips the energy. They feel evaluated too. Executives love that.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px] text-amber-400 font-bold">7</div>
              <span className="text-[13px] font-medium text-white">Non-pedestal posture</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              Never speak like you're starstruck. If they say "We've been in business 22 years" — you say: "Nice. That means your data is clean and predictable. Makes my job easier." Respect without worship. This is how you stay high level.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px] text-amber-400 font-bold">8</div>
              <span className="text-[13px] font-medium text-white">"You're right" pattern break</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              When they hit you with a big objection like "I don't know if this will work for us" — don't push back. Say: "You're right. That's why the first two weeks are structured to test fit, not scale." Disarms them instantly.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px] text-amber-400 font-bold">9</div>
              <span className="text-[13px] font-medium text-white">Predict their fear before they speak</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              If selling to VP/founder level, say: "Here's what this tends to break for companies your size: bandwidth." When you predict their fear before they speak it, they think "he's seen our movie before." Instant authority.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px] text-amber-400 font-bold">10</div>
              <span className="text-[13px] font-medium text-white">Risk math, not guarantees</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              Old school execs don't care about "crazy guarantees." They care about certainty and risk distribution. Say: "I'm not asking you to believe projections. I'm asking you to believe in risk math. Worst case you're down X. Best case you're up 50-100x. To me that's rational." Executives buy arguments, not promises.
            </p>
          </div>
        </div>

        {/* Closing Hacks */}
        <h3>Closing Hacks</h3>

        <div className="space-y-3 my-6">
          <div className="p-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] text-emerald-400 font-bold">11</div>
              <span className="text-[13px] font-medium text-white">Anchor early, price late</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              Early in the call mention: "Most companies in this space make $50,000-$100,000 per placement." Now when you reveal your pricing, they're comparing your fee to industry value, not their wallet.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] text-emerald-400 font-bold">12</div>
              <span className="text-[13px] font-medium text-white">Deadline disguised as logistics</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              Don't say "spots are limited." Say: "If you want to start this month, it needs to be by Thursday to get the system built in time." Deadline disguised as logistics.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] text-emerald-400 font-bold">13</div>
              <span className="text-[13px] font-medium text-white">Add signal hack</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              Before any offer, list the exact signals you found in their business. They see you as prepared, intelligent, thoughtful, already working with them. Makes the close feel half done.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] text-emerald-400 font-bold">14</div>
              <span className="text-[13px] font-medium text-white">Two-option deco</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              Don't ask "Do you want to work with me?" Ask: "Which version do you want — hands-off or done-for-you?" People say yes by default because the brain compares A vs B, not yes vs no.
            </p>
          </div>
        </div>

        {/* Post-Payment Hacks */}
        <h3>Post-Payment Hacks</h3>

        <div className="space-y-3 my-6">
          <div className="p-4 rounded-xl bg-purple-500/[0.06] border border-purple-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-[10px] text-purple-400 font-bold">15</div>
              <span className="text-[13px] font-medium text-white">Never use freelancer buttons</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              Don't use "Send Invoice" or "Get Approval." Use "Activate Access" or "Go Live." Money language matters less than commitment language.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-purple-500/[0.06] border border-purple-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-[10px] text-purple-400 font-bold">16</div>
              <span className="text-[13px] font-medium text-white">Identity flip after payment</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              After payment, never treat them like a prospect again. No "thanks for your interest." Your message should say: "You're in. Here's what happens next." Identity shift = less refunds, less objections later, easier upsells.
            </p>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-gradient-to-br from-white/[0.04] to-transparent border border-white/[0.08] mt-8">
          <p className="text-[14px] text-white/70 italic m-0 text-center">
            "Deals don't die because people say no. They die in the gaps you never designed. Your job as an operator: remove the gaps. Remove the friction. Let money move while the yes is still alive."
          </p>
        </div>

        <div className="p-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20 my-6">
          <div className="text-[11px] text-white/50">
            <strong className="text-white/70">Watch the full breakdown:</strong> I made a video walking through all 16 hacks with real examples. <a href="https://www.youtube.com/watch?v=COoN1mm8NMw" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300">Watch here →</a>
          </div>
        </div>
      </article>
    ),
  },
  {
    id: 'get-paid',
    title: 'Get Paid',
    icon: <DollarSign size={16} />,
    category: 'getstarted',
    content: (
      <article>
        <p className="lead">
          How to structure dual pricing without anyone feeling double-charged
        </p>

        <p className="text-[13px] text-white/70">
          As a connector, you're charging both supply and demand for different problems, meaning essentially you're helping two people.
        </p>

        {/* Person A / Person B Visual - Animated */}
        <div className="my-10 flex justify-center">
          <div className="relative flex items-center gap-6">
            {/* Person A */}
            <div className="relative">
              <div className="absolute -inset-3 rounded-2xl bg-blue-500/10 animate-pulse" style={{ animationDuration: '3s' }} />
              <div className="relative p-5 rounded-xl bg-blue-500/[0.06] border border-blue-500/20 text-center w-32">
                <div className="w-12 h-12 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center mx-auto mb-3">
                  <Users size={20} className="text-blue-400" />
                </div>
                <div className="text-[12px] font-medium text-white/80">Person A</div>
                <div className="text-[10px] text-blue-400/60 mt-1">has a problem</div>
              </div>
            </div>

            {/* Connector (You) in the middle */}
            <div className="relative flex flex-col items-center">
              {/* Arrow from A */}
              <div className="absolute -left-6 top-1/2 -translate-y-1/2 w-6 h-px bg-gradient-to-r from-blue-500/50 to-purple-500/50">
                <div className="absolute top-0 left-0 w-2 h-px bg-white/60 animate-[shimmer_1.5s_infinite]" />
              </div>
              {/* Arrow to B */}
              <div className="absolute -right-6 top-1/2 -translate-y-1/2 w-6 h-px bg-gradient-to-r from-purple-500/50 to-emerald-500/50">
                <div className="absolute top-0 right-0 w-2 h-px bg-white/60 animate-[shimmer_1.5s_infinite]" style={{ animationDelay: '0.5s' }} />
              </div>

              <div className="relative">
                <div className="absolute -inset-4 rounded-full bg-purple-500/20 animate-ping" style={{ animationDuration: '2.5s' }} />
                <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-purple-500/30 to-violet-500/20 border border-purple-500/40 flex items-center justify-center">
                  <div className="text-[11px] text-purple-300 font-medium">YOU</div>
                </div>
              </div>
              <div className="text-[10px] text-purple-400/60 mt-2">fix both</div>
            </div>

            {/* Person B */}
            <div className="relative">
              <div className="absolute -inset-3 rounded-2xl bg-emerald-500/10 animate-pulse" style={{ animationDuration: '3s', animationDelay: '0.5s' }} />
              <div className="relative p-5 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20 text-center w-32">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-3">
                  <Users size={20} className="text-emerald-400" />
                </div>
                <div className="text-[12px] font-medium text-white/80">Person B</div>
                <div className="text-[10px] text-emerald-400/60 mt-1">has a problem</div>
              </div>
            </div>
          </div>
        </div>

        <p className="text-[13px] text-white/70 text-center">
          Person A has a problem. Person B also has a problem. You fix both problems. Then both people pay you. Because you made their life easier, obviously.
        </p>

        <p className="text-[13px] text-white/70">
          On the supply side, they pay for something called access, and it's gonna be upfront.
        </p>

        <h3>What is access?</h3>

        {/* VIP Ticket Visual */}
        <div className="my-8 flex justify-center">
          <div className="relative">
            {/* Regular ticket (faded) */}
            <div className="absolute -left-24 top-8 opacity-30">
              <div className="w-32 h-20 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                <div className="text-center">
                  <div className="text-[10px] text-white/30 uppercase tracking-wider">Regular</div>
                  <div className="text-[11px] text-white/40 mt-1">Wait in line</div>
                </div>
              </div>
            </div>
            {/* VIP ticket (highlighted) */}
            <div className="relative z-10 w-48 h-28 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/10 border border-violet-500/30 flex items-center justify-center overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-violet-400/10 to-transparent -translate-x-full animate-[shimmer_3s_infinite]" />
              <div className="text-center relative z-10">
                <div className="text-[12px] text-violet-400 uppercase tracking-wider font-medium">VIP Access</div>
                <div className="text-[20px] font-bold text-white/80 mt-1">Front of line</div>
                <div className="text-[10px] text-white/40 mt-1">First to opportunities</div>
              </div>
            </div>
            {/* Arrow */}
            <div className="absolute -right-16 top-10 flex items-center gap-2">
              <div className="w-8 h-px bg-gradient-to-r from-violet-500/50 to-transparent" />
              <div className="text-[10px] text-violet-400/60">UPFRONT</div>
            </div>
          </div>
        </div>

        <p className="text-[13px] text-white/70">
          Well, access just means like, you get to be in the room when opportunities show up, and the best way to describe it is think about it like a VIP ticket to a concert, right? Regular ticket, you wait in line like everyone else. VIP ticket, you go straight to the front, like a boss. The supply side pays for the VIP ticket to go straight to the front. And they do this upfront which means they pay you money before they even get a customer, like before anything happens.
        </p>

        <h3>What does access get them?</h3>

        <p className="text-[13px] text-white/70">
          So what does that access actually get them? Well, three things...
        </p>

        {/* Three Benefits Visual - Animated */}
        <div className="grid grid-cols-3 gap-4 my-8">
          <div className="relative group p-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20 text-center">
            <div className="absolute inset-0 rounded-xl bg-emerald-500/10 animate-pulse opacity-50" style={{ animationDuration: '4s' }} />
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-3">
                <span className="text-[18px] font-bold text-emerald-400">1</span>
              </div>
              <div className="text-[12px] font-medium text-white/80">First shot</div>
              <div className="text-[11px] text-white/40 mt-1">Talk to customers first</div>
            </div>
          </div>
          <div className="relative group p-4 rounded-xl bg-blue-500/[0.06] border border-blue-500/20 text-center">
            <div className="absolute inset-0 rounded-xl bg-blue-500/10 animate-pulse opacity-50" style={{ animationDuration: '4s', animationDelay: '0.5s' }} />
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center mx-auto mb-3">
                <span className="text-[18px] font-bold text-blue-400">2</span>
              </div>
              <div className="text-[12px] font-medium text-white/80">Pre-filtered</div>
              <div className="text-[11px] text-white/40 mt-1">No bullshit leads</div>
            </div>
          </div>
          <div className="relative group p-4 rounded-xl bg-purple-500/[0.06] border border-purple-500/20 text-center">
            <div className="absolute inset-0 rounded-xl bg-purple-500/10 animate-pulse opacity-50" style={{ animationDuration: '4s', animationDelay: '1s' }} />
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center mx-auto mb-3">
                <span className="text-[18px] font-bold text-purple-400">3</span>
              </div>
              <div className="text-[12px] font-medium text-white/80">No CAC</div>
              <div className="text-[11px] text-white/40 mt-1">Skip ads, SDRs, marketing</div>
            </div>
          </div>
        </div>

        <p className="text-[13px] text-white/70">
          One, when a good customer shows up, they get to talk to them first. For example: a big company needs marketing help, you have 5 agencies that could help them, so they pay you to get the first shot and they talk to them before anyone else which means higher chance of them actually winning the deal. Another thing, is by default you've already done the work, you already filtered out the bullshit ones, or should I say, Connector OS did the work for you, so they are already saving so much time because now they don't have to find customers themselves. No need to hire sales people who cold call strangers and no need to pay freaking Facebook/Google to show their stuff.
        </p>
        <p className="text-[13px] text-white/70">
          With you they skip all that because marketing costs money. SDRs cost money and also ads cost money especially in 2026, I believe there's some crazy updates with Meta nowadays, so paying you now is obviously peanuts compared to them doing all that forever.
        </p>

        <h3>What does demand pay for?</h3>

        <p className="text-[13px] text-white/70">
          Now on the demand side, same thing, they also pay too.
        </p>
        <p className="text-[13px] text-white/70">
          But what are they actually paying you for? Well, good question dear viewer.
        </p>
        <p className="text-[13px] text-white/70">
          Well, think about it, they're going to pay the supply side for the actual service anyway. Right, but what are they paying for?
        </p>
        <p className="text-[13px] text-white/70">
          Well, they are paying you because you find the RIGHT supply, faster; and it's a warm intro. There's also your time finding/vetting the right supply. Your ability to make a warm intro that actually gets responded to, all that costs money, and it's certainly not cheap, and they could make millions out of it. That's why I keep saying you guys have insane power and crazy leverage, but you just don't know it. But now you know, tattoo this literally in your brain, it's gonna make everything so easy.
        </p>

        {/* Bounty Hunter Visual - Animated */}
        <div className="my-8 p-6 rounded-xl bg-gradient-to-br from-amber-500/[0.08] to-transparent border border-amber-500/20 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-400/5 to-transparent -translate-x-full animate-[shimmer_4s_infinite]" />
          <div className="relative flex items-center justify-center gap-8">
            <div className="text-center">
              <div className="relative">
                <div className="absolute -inset-2 rounded-full bg-amber-500/20 animate-ping" style={{ animationDuration: '3s' }} />
                <div className="relative w-14 h-14 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mx-auto mb-2">
                  <Target size={22} className="text-amber-400" />
                </div>
              </div>
              <div className="text-[11px] text-amber-400/80 uppercase tracking-wider">Upfront</div>
              <div className="text-[10px] text-white/40">Start the hunt</div>
            </div>
            <div className="flex flex-col items-center">
              <div className="relative w-20">
                <div className="h-px bg-gradient-to-r from-amber-500/50 to-emerald-500/50" />
                <div className="absolute top-0 left-0 w-4 h-px bg-white/60 animate-[moveRight_2s_infinite]" />
              </div>
              <div className="text-[10px] text-white/30 mt-1">+ % on success</div>
            </div>
            <div className="text-center">
              <div className="relative">
                <div className="absolute -inset-2 rounded-full bg-emerald-500/20 animate-pulse" style={{ animationDuration: '2s' }} />
                <div className="relative w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-2">
                  <DollarSign size={22} className="text-emerald-400" />
                </div>
              </div>
              <div className="text-[11px] text-emerald-400/80 uppercase tracking-wider">Bounty</div>
              <div className="text-[10px] text-white/40">Found the guy</div>
            </div>
          </div>
        </div>

        <p className="text-[13px] text-white/70">
          So they pay you upfront, okay, and also a % of each closed deal. Think about it like them hiring a bounty hunter, which is you. They pay you first to start looking, upfront. Then they pay you more if you actually find the guy. If nothing happens, they only paid upfront. If something does happen, they're happy to pay because the alternative was way worse anyway.
        </p>

        <h3>The cosmic truth</h3>

        <p className="text-[14px] text-white/80 font-medium">
          Now something very important you guys need to understand.
        </p>
        <p className="text-[13px] text-white/70">
          You're not executing matches. You're creating optionality on both sides and waiting for intent to reveal itself.
        </p>
        <p className="text-[13px] text-white/70">
          Meaning: You're not forcing deals. You're holding both sides until they're ready to move.
        </p>
        <p className="text-[13px] text-white/70">
          Like the unit of work isn't demand times supply. It's demand goes to the connector, the connector goes to supply. You're in the middle. You're the holder.
        </p>

        {/* Axis Mundi Visual - Cosmic */}
        <div className="my-10 flex justify-center">
          <div className="relative w-64 h-64">
            {/* Outer ring - pulsing */}
            <div className="absolute inset-0 rounded-full border border-purple-500/20 animate-pulse" />
            <div className="absolute inset-4 rounded-full border border-purple-500/10" />

            {/* Demand side */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4">
              <div className="w-20 h-20 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-[10px] text-blue-400/80 uppercase tracking-wider">Demand</div>
                  <div className="text-[9px] text-white/30">floating</div>
                </div>
              </div>
            </div>

            {/* Supply side */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4">
              <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-[10px] text-emerald-400/80 uppercase tracking-wider">Supply</div>
                  <div className="text-[9px] text-white/30">floating</div>
                </div>
              </div>
            </div>

            {/* Center - The Connector (Axis Mundi) */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative">
                <div className="absolute -inset-4 rounded-full bg-purple-500/20 animate-ping" style={{ animationDuration: '3s' }} />
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500/30 to-violet-500/20 border border-purple-500/40 flex items-center justify-center relative z-10">
                  <div className="text-center">
                    <div className="text-[10px] text-purple-300 font-medium">YOU</div>
                    <div className="text-[8px] text-white/40">axis mundi</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Connection lines */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-32 h-px bg-gradient-to-r from-blue-500/30 via-purple-500/50 to-emerald-500/30" />
            </div>
          </div>
        </div>

        <p className="text-[14px] text-white/90 font-medium text-center">
          The holder of opposites. The axis mundi. The center point.
        </p>

        <p className="text-[13px] text-white/70">
          Without you, the circle doesn't close. Without you, supply never finds demand. Demand never finds supply. They're just floating in space, never connecting.
        </p>
        <p className="text-[13px] text-white/70">
          But when you're there, holding both sides, you become the inevitable bridge. You're not pushing anything. You're just... there. And because you're there, the connection becomes possible.
        </p>
        <p className="text-[13px] text-white/70">
          It's like gravity. You don't force it. You just create the field. And when both sides are ready, they move toward each other. Through you.
        </p>

        <h3>How Connector OS protects you</h3>

        <p className="text-[13px] text-white/70">
          And since a lot of you guys are using Connector OS, you saved so many million dollar deals, because a lot of people think, well, a supplier can work with multiple demands. Well, yes of course, but the same supply shouldn't get hammered with 50 DMs or 50 messages.
        </p>
        <p className="text-[13px] text-white/70">
          Because here's what Connector OS actually does.
        </p>

        {/* Brain Computation Visual - Animated */}
        <div className="my-8 p-6 rounded-xl bg-gradient-to-br from-cyan-500/[0.06] to-transparent border border-cyan-500/20 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/5 to-transparent -translate-x-full animate-[shimmer_5s_infinite]" />
          <div className="relative">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <div className="text-[11px] text-cyan-400/60 uppercase tracking-wider">The brain</div>
            </div>

            {/* Many-to-one flow */}
            <div className="flex items-center justify-center gap-6 mb-6">
              {/* Demands */}
              <div className="space-y-2">
                <div className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-400 animate-pulse" style={{ animationDuration: '3s' }}>Demand A</div>
                <div className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-400 animate-pulse" style={{ animationDuration: '3s', animationDelay: '0.3s' }}>Demand B</div>
                <div className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-400 animate-pulse" style={{ animationDuration: '3s', animationDelay: '0.6s' }}>Demand C</div>
                <div className="text-[10px] text-white/30 text-center">...20 total</div>
              </div>

              {/* Arrows converging - animated */}
              <div className="flex flex-col items-center gap-1">
                <svg width="50" height="70" viewBox="0 0 50 70" fill="none">
                  <path d="M5 10 L40 35" stroke="rgba(59,130,246,0.3)" strokeWidth="1.5">
                    <animate attributeName="stroke-opacity" values="0.2;0.6;0.2" dur="2s" repeatCount="indefinite" />
                  </path>
                  <path d="M5 35 L40 35" stroke="rgba(59,130,246,0.4)" strokeWidth="1.5">
                    <animate attributeName="stroke-opacity" values="0.3;0.7;0.3" dur="2s" repeatCount="indefinite" begin="0.3s" />
                  </path>
                  <path d="M5 60 L40 35" stroke="rgba(59,130,246,0.3)" strokeWidth="1.5">
                    <animate attributeName="stroke-opacity" values="0.2;0.6;0.2" dur="2s" repeatCount="indefinite" begin="0.6s" />
                  </path>
                  <circle cx="42" cy="35" r="4" fill="rgba(6,182,212,0.8)">
                    <animate attributeName="r" values="3;5;3" dur="1.5s" repeatCount="indefinite" />
                  </circle>
                </svg>
              </div>

              {/* Single output */}
              <div className="text-center relative">
                <div className="absolute -inset-3 rounded-xl bg-emerald-500/10 animate-ping" style={{ animationDuration: '3s' }} />
                <div className="relative px-5 py-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                  <div className="text-[13px] text-emerald-400 font-medium">1 Message</div>
                  <div className="text-[10px] text-white/40">to Supply X</div>
                </div>
              </div>
            </div>

            {/* Example message */}
            <div className="p-3 rounded-lg bg-white/[0.04] border border-white/[0.08] mb-4 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_3s_infinite]" />
              <p className="text-[12px] text-white/50 m-0 font-mono relative">
                'Hey, I'm seeing companies like Acme doing [signal]. Want access?'
              </p>
            </div>

            <div className="text-center">
              <div className="inline-block px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20">
                <span className="text-[11px] text-cyan-400">Matching: many-to-many</span>
                <span className="text-[11px] text-white/30 mx-2">→</span>
                <span className="text-[11px] text-emerald-400">Messaging: one-to-one</span>
              </div>
            </div>
          </div>
        </div>

        <p className="text-[13px] text-white/70">
          The brain computes everything — Demand A matches Supply X, Demand B matches Supply X, Demand C matches Supply X — it sees all 20 matches. But when it's time to send? One DM. One message to Supply X.
        </p>
        <p className="text-[13px] text-white/70">
          That's it. They don't know there's 20 behind you. They just know there's interest. Plural. Mysterious. When they reply YES — then you reveal the list. Or drip them one by one. Their appetite, at your pace.
        </p>
        <p className="text-[13px] text-white/70">
          Matching is many-to-many. Messaging is one-to-one. The system enforces the doctrine. You literally can't flood. You can't leak. The leverage is baked into the code, inside Connector OS.
        </p>
        <p className="text-[13px] text-white/70">
          That's how I do it, and that's how you do it too as a 7-figure connector. This is how you print money, those crazy 10-15k deals. This is the actual doctrine.
        </p>

        <h3>The leverage table</h3>

        <p className="text-[13px] text-white/70">Now here's the leverage table:</p>
        <p className="text-[13px] text-white/70">Here's what you're actually doing:</p>

        {/* Leverage Table - Animated */}
        <div className="my-10 space-y-6">
          {/* Demand Row */}
          <div className="relative group">
            <div className="absolute -inset-2 bg-gradient-to-r from-blue-500/10 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative flex items-center gap-6 p-5 rounded-xl bg-blue-500/[0.04] border border-blue-500/20">
              <div className="shrink-0">
                <div className="w-14 h-14 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
                  <div className="text-[11px] text-blue-400 font-medium uppercase tracking-wider">Demand</div>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-8">
                <div>
                  <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">What you say</div>
                  <div className="text-[14px] text-white/80 font-medium">"I know someone"</div>
                </div>
                <div className="relative">
                  <div className="absolute -inset-2 bg-blue-500/10 rounded-lg animate-pulse" style={{ animationDuration: '3s' }} />
                  <div className="relative">
                    <div className="text-[10px] text-blue-400/60 uppercase tracking-wider mb-1">What you hold</div>
                    <div className="text-[14px] text-blue-300 font-medium">Who the provider is</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Supply Row */}
          <div className="relative group">
            <div className="absolute -inset-2 bg-gradient-to-r from-emerald-500/10 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative flex items-center gap-6 p-5 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/20">
              <div className="shrink-0">
                <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                  <div className="text-[11px] text-emerald-400 font-medium uppercase tracking-wider">Supply</div>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-8">
                <div>
                  <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">What you say</div>
                  <div className="text-[14px] text-white/80 font-medium">"Companies like Acme"</div>
                </div>
                <div className="relative">
                  <div className="absolute -inset-2 bg-emerald-500/10 rounded-lg animate-pulse" style={{ animationDuration: '3s' }} />
                  <div className="relative">
                    <div className="text-[10px] text-emerald-400/60 uppercase tracking-wider mb-1">What you hold</div>
                    <div className="text-[14px] text-emerald-300 font-medium">The full list of 20 companies</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <h3>When they reply yes</h3>

        <div className="space-y-4 my-8">
          <div className="relative group">
            <div className="absolute -inset-1 rounded-xl bg-emerald-500/20 animate-pulse opacity-50" style={{ animationDuration: '3s' }} />
            <div className="relative p-5 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20">
              <div className="flex items-center gap-4">
                <div className="shrink-0 w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                  <span className="text-[11px] text-emerald-400 font-medium">D</span>
                </div>
                <div>
                  <p className="text-[13px] text-white/80 m-0">
                    <strong className="text-emerald-400">"Yes, intro me"</strong>
                  </p>
                  <p className="text-[12px] text-white/50 mt-1 mb-0">→ NOW you reveal the provider → They can't go around you</p>
                </div>
              </div>
            </div>
          </div>
          <div className="relative group">
            <div className="absolute -inset-1 rounded-xl bg-blue-500/20 animate-pulse opacity-50" style={{ animationDuration: '3s', animationDelay: '0.5s' }} />
            <div className="relative p-5 rounded-xl bg-blue-500/[0.06] border border-blue-500/20">
              <div className="flex items-center gap-4">
                <div className="shrink-0 w-12 h-12 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                  <span className="text-[11px] text-blue-400 font-medium">S</span>
                </div>
                <div>
                  <p className="text-[13px] text-white/80 m-0">
                    <strong className="text-blue-400">"Yes, interested"</strong>
                  </p>
                  <p className="text-[12px] text-white/50 mt-1 mb-0">→ NOW you reveal the 20 companies → They can't go around you</p>
                  <p className="text-[11px] text-white/30 mt-1 mb-0">or drip them one by one</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p>
          This preserves: leverage, trust, scarcity, connector positioning
        </p>

        <h3>The doctrine</h3>

        {/* Mystical letter style */}
        <div className="my-8 relative">
          <div className="absolute -inset-4 bg-gradient-to-b from-purple-500/[0.03] via-transparent to-purple-500/[0.03] rounded-2xl" />
          <div className="relative p-8 rounded-xl border border-purple-500/10 bg-[#0a0a0c]">
            <div className="absolute top-4 left-4 w-8 h-8 border-l border-t border-purple-500/20" />
            <div className="absolute bottom-4 right-4 w-8 h-8 border-r border-b border-purple-500/20" />

            <p className="text-[15px] text-white/80 italic leading-relaxed m-0">
              A connector never floods supply with matches. They offer access, then reveal details after intent.
            </p>
            <p className="text-[14px] text-white/60 italic leading-relaxed mt-4 mb-0">
              You're the gatekeeper. They have to go through you. You reveal information incrementally. You control the deal flow. Like a damn bouncer.
            </p>
            <p className="text-[14px] text-white/60 italic leading-relaxed mt-4 mb-0">
              And that's the whole model. Matching is many-to-many. Messaging is one-to-one. They offer access, then reveal details after the intent, after the green light.
            </p>
            <p className="text-[15px] text-white/90 font-medium mt-6 mb-0 text-center">
              That's not copywriting. That's not cold email, that's market structure. That's leverage. That's how people who route millions do it.
            </p>
          </div>
        </div>

        <h3>The mental model</h3>

        <p className="text-[13px] text-white/70">
          Now recap, the mental model is: you get paid from both sides.
        </p>
        <p className="text-[13px] text-white/70">
          Because if you think about it, you're not selling. You're saving, you shortcut both. That's worth money.
        </p>

        {/* Visual: One deal breakdown */}
        <div className="p-6 rounded-xl bg-gradient-to-br from-amber-500/[0.08] to-transparent border border-amber-500/20 my-8">
          <div className="text-[11px] text-amber-400/60 uppercase tracking-wider mb-2 text-center">One deal breakdown</div>
          <div className="text-[12px] text-white/40 text-center mb-6">What you make when you connect a recruiter to a hiring company</div>

          <div className="grid grid-cols-2 gap-6">
            <div className="p-5 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20 text-center">
              <div className="text-[10px] text-emerald-400/60 uppercase tracking-wider mb-2">Supply pays you</div>
              <div className="text-[28px] font-bold text-emerald-400">$15K</div>
              <div className="text-[11px] text-white/50 mt-2">access fee (upfront)</div>
              <div className="text-[10px] text-white/30 mt-1">for VIP access to your deal flow</div>
            </div>
            <div className="p-5 rounded-xl bg-blue-500/[0.06] border border-blue-500/20 text-center">
              <div className="text-[10px] text-blue-400/60 uppercase tracking-wider mb-2">Demand pays you</div>
              <div className="text-[28px] font-bold text-blue-400">$15K</div>
              <div className="text-[11px] text-white/50 mt-2">finder's fee + % of deal</div>
              <div className="text-[10px] text-white/30 mt-1">for finding them the right provider</div>
            </div>
          </div>

          <div className="flex justify-center my-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-px bg-emerald-500/30" />
              <div className="text-[11px] text-white/40">+</div>
              <div className="w-12 h-px bg-blue-500/30" />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-center">
            <div className="text-[11px] text-white/40 uppercase tracking-wider mb-1">Your total from one intro</div>
            <div className="text-[32px] font-bold text-white/90">$30K</div>
            <div className="text-[11px] text-white/40">before any % kicks in</div>
          </div>

          <div className="mt-6 p-4 rounded-lg bg-amber-500/[0.06] border border-amber-500/20 text-center">
            <div className="text-[11px] text-amber-400/60 uppercase tracking-wider mb-2">But wait — there's upside</div>
            <div className="text-[12px] text-white/50">If the deal closes and the client stays...</div>
            <div className="text-[12px] text-white/50 mt-1">Average B2B LTV: <span className="text-white/70 font-medium">$800K</span></div>
            <div className="text-[13px] text-white/70 mt-2">Your % of that = <span className="text-amber-400 font-medium">generational wealth</span></div>
          </div>
        </div>

      </article>
    ),
  },

  // ---------------------------------------------------------------------------
  // FULFILLMENT MODE - Activate Partners at Scale
  // ---------------------------------------------------------------------------
  {
    id: 'fulfillment-mode',
    title: 'Fulfillment Mode',
    icon: <Zap size={16} />,
    category: 'getstarted',
    content: (
      <article>
        <p className="lead">
          Close one partner. Activate them with hundreds of opportunities. This is how you turn a single relationship into a revenue machine.
        </p>

        {/* Hero Visual - The Math */}
        <div className="my-8 p-6 rounded-2xl bg-gradient-to-br from-violet-500/[0.12] to-blue-500/[0.05] border border-violet-500/20">
          <div className="text-center mb-6">
            <div className="text-[11px] text-violet-400/60 uppercase tracking-wider mb-2">The Activation Math</div>
          </div>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <div className="text-center">
              <div className="text-[36px] font-bold text-violet-400">1</div>
              <div className="text-[11px] text-white/40">Partner</div>
            </div>
            <div className="text-[24px] text-white/20">×</div>
            <div className="text-center">
              <div className="text-[36px] font-bold text-blue-400">500</div>
              <div className="text-[11px] text-white/40">Signals</div>
            </div>
            <div className="text-[24px] text-white/20">=</div>
            <div className="text-center">
              <div className="text-[36px] font-bold text-emerald-400">500</div>
              <div className="text-[11px] text-white/40">Intros</div>
            </div>
          </div>
        </div>

        <h3>The situation</h3>
        <p>
          You just closed a partner. A recruiting agency. A consulting firm. A service provider. They're good at what they do — but they don't have deal flow. They need clients.
        </p>
        <p>
          You have signal access. You can see which companies are hiring, scaling, raising, struggling. You can see who needs help right now.
        </p>
        <p>
          The question: how do you activate this partner with opportunities?
        </p>

        <h3>The old way (slow, manual, doesn't scale)</h3>
        <div className="p-4 rounded-xl bg-red-500/[0.06] border border-red-500/20 my-6">
          <ul className="space-y-2 text-[13px] text-white/60 list-none p-0 m-0">
            <li className="flex items-start gap-2">
              <span className="text-red-400/60">✗</span>
              <span>Manually search for companies that might need them</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-400/60">✗</span>
              <span>Write individual intros one by one</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-400/60">✗</span>
              <span>Hope the timing is right</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-400/60">✗</span>
              <span>Send 10-20 per day if you're fast</span>
            </li>
          </ul>
        </div>

        <h3>The new way (Fulfillment Mode)</h3>
        <div className="p-4 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20 my-6">
          <ul className="space-y-2 text-[13px] text-white/60 list-none p-0 m-0">
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span>
              <span>Upload your partner as a 1-row CSV</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span>
              <span>Load hundreds of demand signals</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span>
              <span>System matches ALL demand to your partner</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span>
              <span>Generate 500 personalized intros in minutes</span>
            </li>
          </ul>
        </div>

        <h3>Step-by-step: Activate a partner</h3>

        {/* Step 1 */}
        <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.06] my-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center text-[14px] font-semibold text-violet-400">1</div>
            <div className="text-[15px] font-medium text-white/90">Upload your partner</div>
          </div>
          <p className="text-[13px] text-white/60 mb-4">
            Go to Settings → Data Sources → Supply. Download the template, fill in your partner's info.
          </p>

          {/* CSV Format */}
          <div className="p-4 rounded-xl bg-black/40 border border-white/[0.06] mb-4">
            <div className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Required headers</div>
            <div className="font-mono text-[11px] text-white/50 mb-4">
              Full Name,Company Name,Domain,Service Description,LinkedIn URL,Email,Target Industries
            </div>
            <div className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Example row</div>
            <div className="font-mono text-[10px] text-white/40 leading-relaxed">
              Alex Brown,Certus Recruitment,certusrecruitment.com,"Tech recruitment agency placing GTM and IT roles for SaaS companies. 16 days avg fill time vs industry 60-90 days. ICP: Founders, CROs, VPs Sales at SaaS (11-1000 employees).",https://linkedin.com/in/alexbrown,,SaaS
            </div>
          </div>

          {/* Field Guide */}
          <div className="space-y-2 mb-4">
            <div className="text-[11px] text-white/30 uppercase tracking-wider">What goes where</div>
            <div className="grid gap-2">
              <div className="flex items-start gap-2 text-[12px]">
                <span className="text-violet-400/60 font-mono">Service Description</span>
                <span className="text-white/40">— Put everything here: what they do, ICP, differentiators, case studies. The system uses this for intros.</span>
              </div>
              <div className="flex items-start gap-2 text-[12px]">
                <span className="text-violet-400/60 font-mono">Email</span>
                <span className="text-white/40">— Leave blank. They're your client. You don't send to them via Instantly.</span>
              </div>
              <div className="flex items-start gap-2 text-[12px]">
                <span className="text-violet-400/60 font-mono">Domain</span>
                <span className="text-white/40">— Their real domain. Used for matching and deduplication.</span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-amber-500/[0.06] border border-amber-500/20">
            <p className="text-[11px] text-amber-200/70 m-0">
              <strong className="text-amber-300/90">Key insight:</strong> The more detail you put in Service Description, the better the intros. Include ICP, differentiators, proof points. This is what the system uses to pitch them.
            </p>
          </div>
        </div>

        {/* Step 2 */}
        <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.06] my-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-[14px] font-semibold text-blue-400">2</div>
            <div className="text-[15px] font-medium text-white/90">Load demand signals</div>
          </div>
          <p className="text-[13px] text-white/60 mb-3">
            Two options:
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[12px] font-medium text-white/70 mb-1">Apify Dataset</div>
              <div className="text-[11px] text-white/40">Paste your dataset ID. Thousands of companies with live signals.</div>
            </div>
            <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[12px] font-medium text-white/70 mb-1">CSV Upload</div>
              <div className="text-[11px] text-white/40">Your own list. Companies you've researched. Warm leads.</div>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.06] my-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-[14px] font-semibold text-cyan-400">3</div>
            <div className="text-[15px] font-medium text-white/90">Go to Flow</div>
          </div>
          <p className="text-[13px] text-white/60">
            Open Flow. The system loads your 1 supply partner and all your demand signals. Every demand company gets matched to your partner. No manual work.
          </p>
        </div>

        {/* Step 4 */}
        <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.06] my-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-[14px] font-semibold text-emerald-400">4</div>
            <div className="text-[15px] font-medium text-white/90">Generate and send</div>
          </div>
          <p className="text-[13px] text-white/60 mb-3">
            Enrich contacts. Generate intros. Every intro pitches your partner to a company that needs them right now:
          </p>
          <div className="p-4 rounded-lg bg-emerald-500/[0.04] border border-emerald-500/20">
            <p className="text-[12px] text-white/50 italic m-0">
              "Hey [Name] — noticed [Company] is scaling the engineering team. I know someone who places senior engineers in Series B+ companies. Worth an intro?"
            </p>
          </div>
        </div>

        <h3>The reverse: Find providers for a client</h3>
        <p>
          Works both directions. If you land a client who needs help, flip the model:
        </p>

        <div className="p-5 rounded-xl bg-blue-500/[0.06] border border-blue-500/20 my-6">
          <div className="grid grid-cols-4 gap-2 text-center text-[12px]">
            <div className="p-3 rounded-lg bg-white/[0.04]">
              <div className="text-blue-400 font-medium">1. Upload client</div>
              <div className="text-[10px] text-white/40 mt-1">as Demand (1 row)</div>
            </div>
            <div className="p-3 rounded-lg bg-white/[0.04]">
              <div className="text-blue-400 font-medium">2. Load providers</div>
              <div className="text-[10px] text-white/40 mt-1">as Supply (many)</div>
            </div>
            <div className="p-3 rounded-lg bg-white/[0.04]">
              <div className="text-blue-400 font-medium">3. Match</div>
              <div className="text-[10px] text-white/40 mt-1">all to your client</div>
            </div>
            <div className="p-3 rounded-lg bg-white/[0.04]">
              <div className="text-blue-400 font-medium">4. Send</div>
              <div className="text-[10px] text-white/40 mt-1">pitch each provider</div>
            </div>
          </div>
        </div>

        <h3>Why this prints money</h3>
        <div className="p-6 rounded-xl bg-gradient-to-br from-amber-500/[0.08] to-transparent border border-amber-500/20 my-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="text-amber-400">→</div>
              <div>
                <div className="text-[13px] text-white/80 font-medium">Speed</div>
                <div className="text-[12px] text-white/50">500 intros in the time it takes to write 5 manually</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="text-amber-400">→</div>
              <div>
                <div className="text-[13px] text-white/80 font-medium">Timing</div>
                <div className="text-[12px] text-white/50">Every intro hits companies showing live signals — they need help now</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="text-amber-400">→</div>
              <div>
                <div className="text-[13px] text-white/80 font-medium">Leverage</div>
                <div className="text-[12px] text-white/50">Your partner pays you for access. Demand pays you for the intro. Both sides.</div>
              </div>
            </div>
          </div>
        </div>

        <h3>The scenario</h3>
        <p>
          You sign a recruiting agency for $15K upfront (access fee to your deal flow). You load 500 companies hiring. Generate 500 intros. 2% reply. 10 conversations. 3 close. Each placement: $50K fee. Your cut: 20%.
        </p>

        <div className="p-6 rounded-xl bg-white/[0.03] border border-white/[0.08] my-6">
          <div className="grid grid-cols-2 gap-6 text-center">
            <div>
              <div className="text-[10px] text-white/40 uppercase tracking-wider mb-2">You collected</div>
              <div className="text-[28px] font-bold text-emerald-400">$45K</div>
              <div className="text-[11px] text-white/40 mt-1">$15K access + $30K (20% of 3 × $50K)</div>
            </div>
            <div>
              <div className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Time spent</div>
              <div className="text-[28px] font-bold text-white/80">&lt;1hr</div>
              <div className="text-[11px] text-white/40 mt-1">Upload, load, generate, send</div>
            </div>
          </div>
        </div>

        <p className="text-center my-8">
          <a
            href="/flow"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-black font-medium text-[14px] hover:bg-white/90 transition-colors no-underline"
          >
            Open Flow →
          </a>
        </p>

      </article>
    ),
  },
];

// =============================================================================
// COMPONENT
// =============================================================================

export default function Library() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeSection, setActiveSection] = useState('foundations');

  // Handle URL query param for direct navigation
  useEffect(() => {
    const page = searchParams.get('page');
    if (page && sections.some(s => s.id === page)) {
      setActiveSection(page);
    }
  }, [searchParams]);

  const getstartedSections = sections.filter(s => s.category === 'getstarted');
  const philosophySections = sections.filter(s => s.category === 'philosophy');
  const systemSections = sections.filter(s => s.category === 'system');
  const currentSection = sections.find(s => s.id === activeSection);

  return (
    <div className="min-h-screen bg-[#09090b] flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/[0.06] flex flex-col fixed h-screen">
        <div className="p-4 border-b border-white/[0.06]">
          <button
            onClick={() => navigate('/launcher')}
            className="flex items-center gap-2 text-white/40 hover:text-white/70 transition-colors text-[13px]"
          >
            <ArrowLeft size={14} />
            Back
          </button>
        </div>

        <div className="px-4 py-6 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
              <BookOpen size={16} className="text-white/60" />
            </div>
            <div>
              <div className="text-[14px] font-medium text-white">OS Library</div>
              <div className="text-[11px] text-white/35">Docs & Philosophy</div>
            </div>
          </div>
        </div>

        <nav className="library-sidebar flex-1 overflow-y-auto py-4">
          {getstartedSections.length > 0 && (
            <div className="px-4 mb-6">
              <div className="text-[10px] font-medium text-emerald-400/60 uppercase tracking-wider mb-3">
                Get Started
              </div>
              {getstartedSections.map(section => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors mb-0.5 ${
                    activeSection === section.id
                      ? 'bg-emerald-500/[0.12] text-emerald-300'
                      : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                  }`}
                >
                  <span className={activeSection === section.id ? 'text-emerald-400/70' : 'text-white/35'}>
                    {section.icon}
                  </span>
                  {section.title}
                </button>
              ))}
            </div>
          )}

          <div className="px-4 mb-6">
            <div className="text-[10px] font-medium text-white/25 uppercase tracking-wider mb-3">
              Philosophy
            </div>
            {philosophySections.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors mb-0.5 ${
                  activeSection === section.id
                    ? 'bg-white/[0.08] text-white'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                }`}
              >
                <span className={activeSection === section.id ? 'text-white/70' : 'text-white/35'}>
                  {section.icon}
                </span>
                {section.title}
              </button>
            ))}
          </div>

          <div className="px-4">
            <div className="text-[10px] font-medium text-white/25 uppercase tracking-wider mb-3">
              System
            </div>
            {systemSections.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors mb-0.5 ${
                  activeSection === section.id
                    ? 'bg-white/[0.08] text-white'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                }`}
              >
                <span className={activeSection === section.id ? 'text-white/70' : 'text-white/35'}>
                  {section.icon}
                </span>
                {section.title}
              </button>
            ))}
          </div>
        </nav>

        <div className="p-4 border-t border-white/[0.06]">
          <a
            href="https://www.skool.com/ssmasters"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 opacity-40 hover:opacity-70 transition-opacity"
          >
            <img src="/ssm-logo.png" alt="SSM" className="w-5 h-5 rounded" />
            <span className="text-[11px] text-white/60">SSM Community</span>
          </a>
        </div>
      </aside>

      {/* Content */}
      <main className="library-main flex-1 ml-64 overflow-y-auto">
        <div className="max-w-[640px] px-12 py-12">
          {currentSection && (
            <>
              <div className="flex items-center gap-1.5 text-[11px] text-white/30 mb-6">
                <span className={currentSection.category === 'getstarted' ? 'text-emerald-400/60' : ''}>
                  {currentSection.category === 'philosophy' ? 'Philosophy' : currentSection.category === 'getstarted' ? 'Get Started' : 'System'}
                </span>
                <ChevronRight size={10} />
                <span className={currentSection.category === 'getstarted' ? 'text-emerald-300/70' : 'text-white/45'}>{currentSection.title}</span>
              </div>

              <h1 className="text-[28px] font-bold text-white tracking-[-0.02em] mb-8">
                {currentSection.title}
              </h1>

              <div className="docs-content">
                {currentSection.content}
              </div>
            </>
          )}
        </div>
      </main>

      <style>{`
        /* Shimmer animation for live counter */
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }

        /* Linear-style thin scrollbars */
        .library-sidebar::-webkit-scrollbar {
          width: 6px;
        }
        .library-sidebar::-webkit-scrollbar-track {
          background: transparent;
        }
        .library-sidebar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.08);
          border-radius: 3px;
        }
        .library-sidebar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.15);
        }
        .library-main::-webkit-scrollbar {
          width: 6px;
        }
        .library-main::-webkit-scrollbar-track {
          background: transparent;
        }
        .library-main::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.08);
          border-radius: 3px;
        }
        .library-main::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.15);
        }

        .docs-content article {
          color: rgba(255, 255, 255, 0.55);
          font-size: 13px;
          line-height: 1.7;
        }

        .docs-content .lead {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.65);
          margin-bottom: 24px;
          line-height: 1.6;
        }

        .docs-content .placeholder {
          padding: 16px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px dashed rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          color: rgba(255, 255, 255, 0.25);
          font-style: italic;
          margin: 16px 0;
          font-size: 12px;
        }

        .docs-content h3 {
          font-size: 17px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.95);
          margin-top: 32px;
          margin-bottom: 12px;
          letter-spacing: -0.01em;
        }

        .docs-content h4 {
          font-size: 14px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.8);
          margin-top: 24px;
          margin-bottom: 10px;
        }

        .docs-content p {
          margin-bottom: 12px;
        }

        .docs-content ul, .docs-content ol {
          margin-bottom: 14px;
          padding-left: 18px;
        }

        .docs-content li {
          margin-bottom: 6px;
        }

        .docs-content strong {
          color: rgba(255, 255, 255, 0.8);
          font-weight: 500;
        }

        .docs-content em {
          color: rgba(255, 255, 255, 0.6);
        }

        .docs-content code {
          background: rgba(255, 255, 255, 0.04);
          padding: 1px 5px;
          border-radius: 3px;
          font-size: 11px;
          font-family: 'SF Mono', 'Fira Code', monospace;
          color: rgba(255, 255, 255, 0.6);
        }

        .docs-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 16px 0;
          font-size: 12px;
        }

        .docs-content th {
          text-align: left;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.02);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.35);
          font-weight: 500;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .docs-content td {
          padding: 8px 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          color: rgba(255, 255, 255, 0.55);
        }

        .docs-content pre {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 6px;
          padding: 12px 16px;
          font-family: 'SF Mono', 'Fira Code', monospace;
          font-size: 11px;
          line-height: 1.5;
          color: rgba(255, 255, 255, 0.55);
          overflow-x: auto;
          margin: 16px 0;
          white-space: pre;
        }

        .docs-content .grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin: 16px 0;
        }

        .docs-content .card-red, .docs-content .card-green {
          padding: 12px;
          border-radius: 6px;
        }

        .docs-content .card-red {
          background: rgba(239, 68, 68, 0.06);
          border: 1px solid rgba(239, 68, 68, 0.15);
        }

        .docs-content .card-green {
          background: rgba(34, 197, 94, 0.06);
          border: 1px solid rgba(34, 197, 94, 0.15);
        }

        .docs-content .card-title {
          font-size: 10px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.4);
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .docs-content .card-red ul, .docs-content .card-green ul {
          margin: 0;
          padding-left: 14px;
          font-size: 12px;
        }

        .docs-content .card-red li {
          color: rgba(239, 68, 68, 0.7);
          margin-bottom: 4px;
        }

        .docs-content .card-green li {
          color: rgba(34, 197, 94, 0.7);
          margin-bottom: 4px;
        }

        .docs-content .feature-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin: 24px 0;
        }

        .docs-content .feature-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 10px;
          padding: 24px 20px;
          text-align: center;
        }

        .docs-content .feature-icon {
          color: rgba(255, 255, 255, 0.4);
          margin-bottom: 16px;
          display: flex;
          justify-content: center;
        }

        .docs-content .feature-title {
          font-size: 13px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
          margin-bottom: 8px;
        }

        .docs-content .feature-desc {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.4);
          line-height: 1.5;
        }

        .docs-content .highlight-box {
          background: rgba(255, 255, 255, 0.03);
          border-left: 3px solid rgba(255, 255, 255, 0.3);
          padding: 16px 20px;
          margin: 20px 0;
          border-radius: 0 6px 6px 0;
        }

        .docs-content .highlight-box p {
          margin: 0;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.8);
        }

        .docs-content .closing {
          margin-top: 28px;
          color: rgba(255, 255, 255, 0.5);
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
