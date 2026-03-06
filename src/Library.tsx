import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Database, Mail, Send,
  ChevronRight, Brain, Target, GitBranch, Layers,
  Compass, Eye, Sparkles, Users, Trophy, Play, Linkedin, ExternalLink,
  Rocket, Zap, Clock, Shield, MessageSquare, DollarSign, Flame,
  Hexagon, BarChart3
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
        <div className="p-6 rounded bg-white/[0.02] border border-white/[0.06] mb-8 text-center relative overflow-hidden">
          {/* Shimmer effect for "live" feeling */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_3s_infinite]" />
          <div className="relative">
            <div className="text-[40px] font-medium tracking-tight text-emerald-400/60 mb-2">
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
            <div key={i} className="group p-5 rounded bg-white/[0.02] border border-white/[0.06] hover:border-emerald-500/30 transition-all hover:scale-[1.02]">
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
                  <div className="text-[18px] font-medium text-emerald-400/60">{winner.amount}</div>
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
          className="block mt-6 p-5 rounded bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.15] transition-all hover:scale-[1.01] group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded overflow-hidden shrink-0">
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
    id: 'primitives',
    title: 'Primitives',
    icon: <Hexagon size={16} />,
    category: 'system',
    content: (
      <article>
        <p className="lead">
          Connector OS is built on six primitives. Each one exists because a simpler abstraction broke down as the system scaled — the same way Stripe replaced Charge with PaymentIntent when card-only assumptions stopped working for global payments.
        </p>

        {/* Philosophy Callout */}
        <div className="p-4 rounded bg-emerald-500/[0.04] border border-emerald-500/[0.12] mb-8">
          <p className="text-[11px] font-mono text-emerald-400/60 m-0 leading-[1.8]">
            The system does not use &ldquo;lead&rdquo;, &ldquo;campaign&rdquo;, or &ldquo;match&rdquo; as concepts. Those terms overload too many meanings. Instead, the six primitives below each represent exactly one thing, with a defined lifecycle and clear boundaries between them.
          </p>
        </div>

        {/* Dependency Chain Diagram */}
        <div className="my-8 p-6 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 text-center">
              <div className="w-12 h-12 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-2">
                <Zap size={20} className="text-white/50" />
              </div>
              <div className="text-[11px] text-white/50">Signal</div>
            </div>
            <div className="text-white/20">&rarr;</div>
            <div className="flex-1 text-center">
              <div className="w-12 h-12 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-2">
                <Users size={20} className="text-white/50" />
              </div>
              <div className="text-[11px] text-white/50">Party</div>
            </div>
            <div className="text-white/20">&rarr;</div>
            <div className="flex-1 text-center">
              <div className="w-12 h-12 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-2">
                <BarChart3 size={20} className="text-white/50" />
              </div>
              <div className="text-[11px] text-white/50">Evaluation</div>
            </div>
            <div className="text-white/20">&rarr;</div>
            <div className="flex-1 text-center">
              <div className="w-12 h-12 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-2">
                <Shield size={20} className="text-white/50" />
              </div>
              <div className="text-[11px] text-white/50">Commitment</div>
            </div>
            <div className="text-white/20">&rarr;</div>
            <div className="flex-1 text-center">
              <div className="w-12 h-12 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-2">
                <Send size={20} className="text-white/50" />
              </div>
              <div className="text-[11px] text-white/50">Introduction</div>
            </div>
            <div className="text-white/20">&rarr;</div>
            <div className="flex-1 text-center">
              <div className="w-12 h-12 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-2">
                <Target size={20} className="text-white/50" />
              </div>
              <div className="text-[11px] text-white/50">Outcome</div>
            </div>
          </div>
        </div>

        {/* ── SIGNAL ── */}
        <div className="mt-8 p-5 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={16} className="text-white/40" />
            <span className="text-[13px] font-mono font-medium text-white/80 uppercase tracking-[0.02em]">Signal</span>
          </div>

          <div className="mb-3">
            <div className="text-[9px] font-mono text-white/25 uppercase tracking-[0.08em] mb-1">What broke</div>
            <p className="text-[11px] font-mono text-white/45 leading-[1.8] m-0">
              Most tools in this space start with a list of companies. But a list of companies doesn&rsquo;t tell you anything about timing — whether something recently changed that makes a conversation relevant right now. Without that, you&rsquo;re just cold-calling a database.
            </p>
          </div>

          <div className="mb-3">
            <div className="text-[9px] font-mono text-white/25 uppercase tracking-[0.08em] mb-1">What it is</div>
            <p className="text-[11px] font-mono text-white/45 leading-[1.8] m-0">
              A signal is a detected unit of intent. It represents the fact that something happened — a funding round, a leadership change, a product launch — that shifts what a company needs or can offer. The system synthesizes each signal into a canonical intent object before anything downstream sees it.
            </p>
          </div>

          <div className="mb-3">
            <div className="text-[9px] font-mono text-white/25 uppercase tracking-[0.08em] mb-1">Lifecycle</div>
            <p className="text-[10px] font-mono text-white/45 m-0">
              <code>detected</code> &rarr; <code>synthesized</code> &rarr; <code>classified</code> &rarr; <code>consumed</code>
            </p>
          </div>

          <div className="bg-white/[0.01] border-l-2 border-white/[0.08] pl-4 py-2">
            <p className="text-[11px] font-mono text-white/50 italic m-0 leading-[1.8]">
              The system embeds the synthesized intent, not the raw company data. Embedding raw metadata produced ~30% similarity across pairs. Embedding AI-interpreted intent statements brought that to ~49% with 81 pairs above the 60% threshold. This is why signals exist as a separate primitive — the interpretation layer is where matching quality comes from.
            </p>
          </div>
        </div>

        {/* ── PARTY ── */}
        <div className="mt-8 p-5 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-2 mb-4">
            <Users size={16} className="text-white/40" />
            <span className="text-[13px] font-mono font-medium text-white/80 uppercase tracking-[0.02em]">Party</span>
          </div>

          <div className="mb-3">
            <div className="text-[9px] font-mono text-white/25 uppercase tracking-[0.08em] mb-1">What broke</div>
            <p className="text-[11px] font-mono text-white/45 leading-[1.8] m-0">
              CRM systems store companies as flat records. But in a two-sided market, the same company can appear on both sides depending on the context. And a company record without a contact, title, or enrichment context doesn&rsquo;t give the operator enough to act on.
            </p>
          </div>

          <div className="mb-3">
            <div className="text-[9px] font-mono text-white/25 uppercase tracking-[0.08em] mb-1">What it is</div>
            <p className="text-[11px] font-mono text-white/45 leading-[1.8] m-0">
              A party is a company or actor participating on either side of the market. The system treats demand and supply as roles, not fixed identities — the same party can be demand in one evaluation and supply in another. Parties are enriched with contact data, firmographics, and context before they enter the evaluation pipeline.
            </p>
          </div>

          <div className="mb-3">
            <div className="text-[9px] font-mono text-white/25 uppercase tracking-[0.08em] mb-1">Lifecycle</div>
            <p className="text-[10px] font-mono text-white/45 m-0">
              <code>identified</code> &rarr; <code>enriched</code> &rarr; <code>active</code> &rarr; <code>dormant</code>
            </p>
          </div>

          <div className="bg-white/[0.01] border-l-2 border-white/[0.08] pl-4 py-2">
            <p className="text-[11px] font-mono text-white/50 italic m-0 leading-[1.8]">
              The system stays neutral between sides. Both parties are equal participants. Neither is &ldquo;the client&rdquo; until a commitment is created — this is what allows the operator to work both sides of every market simultaneously.
            </p>
          </div>
        </div>

        {/* ── EVALUATION ── */}
        <div className="mt-8 p-5 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={16} className="text-white/40" />
            <span className="text-[13px] font-mono font-medium text-white/80 uppercase tracking-[0.02em]">Evaluation</span>
          </div>

          <div className="mb-3">
            <div className="text-[9px] font-mono text-white/25 uppercase tracking-[0.08em] mb-1">What broke</div>
            <p className="text-[11px] font-mono text-white/45 leading-[1.8] m-0">
              Traditional matching relies on keyword overlap or industry similarity. Two companies both being &ldquo;in healthcare&rdquo; is not a reason to connect them. Without structured reasoning about why a specific pair makes sense right now, the operator has to manually figure out the angle for every match — which doesn&rsquo;t scale.
            </p>
          </div>

          <div className="mb-3">
            <div className="text-[9px] font-mono text-white/25 uppercase tracking-[0.08em] mb-1">What it is</div>
            <p className="text-[11px] font-mono text-white/45 leading-[1.8] m-0">
              An evaluation is the system&rsquo;s structured assessment of a demand-supply pair. It contains scores across multiple dimensions, a classification (pass, marginal, quarantine), a suggested framing for the introduction, and written reasoning explaining why the pair works. It&rsquo;s a reasoning object, not a binary yes/no.
            </p>
          </div>

          <div className="mb-3">
            <div className="text-[9px] font-mono text-white/25 uppercase tracking-[0.08em] mb-1">Lifecycle</div>
            <p className="text-[10px] font-mono text-white/45 m-0">
              <code>proposed</code> &rarr; <code>scored</code> &rarr; <code>classified</code> &rarr; <code>approved</code> / <code>vetoed</code>
            </p>
          </div>

          <div className="bg-white/[0.01] border-l-2 border-white/[0.08] pl-4 py-2">
            <p className="text-[11px] font-mono text-white/50 italic m-0 leading-[1.8]">
              The evaluation layer proposes. The operator and infrastructure layer dispose. Evaluations never route introductions directly — they produce recommendations that the operator reviews and the commitment system gates. This separation is what prevents the AI from becoming a spam engine.
            </p>
          </div>
        </div>

        {/* ── COMMITMENT ── */}
        <div className="mt-8 p-5 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-2 mb-4">
            <Shield size={16} className="text-white/40" />
            <span className="text-[13px] font-mono font-medium text-white/80 uppercase tracking-[0.02em]">Commitment</span>
          </div>

          <div className="mb-3">
            <div className="text-[9px] font-mono text-white/25 uppercase tracking-[0.08em] mb-1">What broke</div>
            <p className="text-[11px] font-mono text-white/45 leading-[1.8] m-0">
              In most sales tools, a &ldquo;deal&rdquo; moves through pipeline stages — interested, qualified, proposal, closed. But these stages are internal labels that don&rsquo;t correspond to anything the counterparty has actually done. Until someone pays, the pipeline is a guess.
            </p>
          </div>

          <div className="mb-3">
            <div className="text-[9px] font-mono text-white/25 uppercase tracking-[0.08em] mb-1">What it is</div>
            <p className="text-[11px] font-mono text-white/45 leading-[1.8] m-0">
              A commitment is prepaid priority access to a market segment. It represents a concrete economic action — someone paid for a window of time and a number of credits within a specific segment. Committed parties get routing priority. Uncommitted parties can see anonymized market motion but don&rsquo;t receive introductions.
            </p>
          </div>

          <div className="mb-3">
            <div className="text-[9px] font-mono text-white/25 uppercase tracking-[0.08em] mb-1">Lifecycle</div>
            <p className="text-[10px] font-mono text-white/45 m-0">
              <code>reserved</code> &rarr; <code>active</code> &rarr; <code>consuming</code> &rarr; <code>exhausted</code> / <code>expired</code>
            </p>
          </div>

          <div className="bg-white/[0.01] border-l-2 border-white/[0.08] pl-4 py-2">
            <p className="text-[11px] font-mono text-white/50 italic m-0 leading-[1.8]">
              The product being sold is access and timing, not introductions. The commitment is the product. The introduction is the delivery mechanism. This distinction matters because both sides of the market can commit independently — there&rsquo;s no conflict because you&rsquo;re selling access to the operator&rsquo;s infrastructure, not exclusive representation.
            </p>
          </div>
        </div>

        {/* ── INTRODUCTION ── */}
        <div className="mt-8 p-5 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-2 mb-4">
            <Send size={16} className="text-white/40" />
            <span className="text-[13px] font-mono font-medium text-white/80 uppercase tracking-[0.02em]">Introduction</span>
          </div>

          <div className="mb-3">
            <div className="text-[9px] font-mono text-white/25 uppercase tracking-[0.08em] mb-1">What broke</div>
            <p className="text-[11px] font-mono text-white/45 leading-[1.8] m-0">
              Scaling outreach typically means template-based email sequences. But an introduction without match-specific context performs like cold outreach — the recipient has no reason to believe the message is relevant to their specific situation.
            </p>
          </div>

          <div className="mb-3">
            <div className="text-[9px] font-mono text-white/25 uppercase tracking-[0.08em] mb-1">What it is</div>
            <p className="text-[11px] font-mono text-white/45 leading-[1.8] m-0">
              An introduction is a routed connection between two parties. The operator writes one reference introduction by hand for their best match. The system analyzes the operator&rsquo;s voice, structure, and style, then reconstructs new introductions for each remaining match using that match&rsquo;s specific context — the signal, the framing, the reasoning from the evaluation.
            </p>
          </div>

          <div className="mb-3">
            <div className="text-[9px] font-mono text-white/25 uppercase tracking-[0.08em] mb-1">Lifecycle</div>
            <p className="text-[10px] font-mono text-white/45 m-0">
              <code>drafted</code> &rarr; <code>sent</code> &rarr; <code>delivered</code> &rarr; <code>replied</code> / <code>stale</code>
            </p>
          </div>

          <div className="bg-white/[0.01] border-l-2 border-white/[0.08] pl-4 py-2">
            <p className="text-[11px] font-mono text-white/50 italic m-0 leading-[1.8]">
              The compose engine separates style (reusable across matches) from context (specific to each pair). The operator&rsquo;s reference intro is the training data. The system doesn&rsquo;t generate from a template — it decomposes the reference and rebuilds per match. This is why the output sounds like the operator wrote each one individually.
            </p>
          </div>
        </div>

        {/* ── OUTCOME ── */}
        <div className="mt-8 p-5 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-2 mb-4">
            <Target size={16} className="text-white/40" />
            <span className="text-[13px] font-mono font-medium text-white/80 uppercase tracking-[0.02em]">Outcome</span>
          </div>

          <div className="mb-3">
            <div className="text-[9px] font-mono text-white/25 uppercase tracking-[0.08em] mb-1">What broke</div>
            <p className="text-[11px] font-mono text-white/45 leading-[1.8] m-0">
              Most platforms track whether an email was sent and whether it was opened. But send and open metrics don&rsquo;t tell you whether the introduction actually led to a conversation, a meeting, or revenue. Without outcome data flowing back into the system, there&rsquo;s no way to improve evaluation quality over time.
            </p>
          </div>

          <div className="mb-3">
            <div className="text-[9px] font-mono text-white/25 uppercase tracking-[0.08em] mb-1">What it is</div>
            <p className="text-[11px] font-mono text-white/45 leading-[1.8] m-0">
              An outcome is the result attached to an introduction — reply, meeting booked, deal closed, no response, or stale. Outcomes are tracked per side (demand replied, supply replied) and per stage. They feed back into evaluation calibration, overlay suggestions, and operator learning views.
            </p>
          </div>

          <div className="mb-3">
            <div className="text-[9px] font-mono text-white/25 uppercase tracking-[0.08em] mb-1">Lifecycle</div>
            <p className="text-[10px] font-mono text-white/45 m-0">
              <code>sent</code> &rarr; <code>replied</code> &rarr; <code>meeting</code> &rarr; <code>closed_won</code> / <code>closed_lost</code> / <code>stale</code>
            </p>
          </div>

          <div className="bg-white/[0.01] border-l-2 border-white/[0.08] pl-4 py-2">
            <p className="text-[11px] font-mono text-white/50 italic m-0 leading-[1.8]">
              The system maintains learning views that aggregate outcomes by match tier, by need/capability pairing, and by overlay configuration. When enough data accumulates (minimum 5 introductions per segment), the system can surface which segments convert better and suggest overlay adjustments. The feedback loop is what makes evaluations improve over time rather than staying static.
            </p>
          </div>
        </div>

        {/* The Pipeline */}
        <div className="mt-8 p-5 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="text-[9px] font-mono text-white/25 uppercase tracking-[0.08em] mb-3">The Pipeline</div>
          <p className="text-[10px] font-mono text-white/45 m-0 leading-[1.8]">
            <code>Raw</code> &rarr; <code>I Layer</code> <span className="text-white/25">(Signal + Party)</span> &rarr; <code>MCP</code> <span className="text-white/25">(Evaluation)</span> &rarr; <code>Commitment</code> &rarr; <code>Route</code> <span className="text-white/25">(Introduction)</span> &rarr; <code>Outcome</code> &rarr; <span className="text-white/25">feedback</span>
          </p>
        </div>

        {/* Closing */}
        <div className="p-5 rounded bg-white/[0.02] border border-white/[0.06] mt-8">
          <p className="text-[11px] font-mono text-white/45 italic m-0 leading-[1.8] text-center">
            Six clearly-defined primitives with predictable lifecycles are easier to reason about than two or three overloaded concepts that mean different things in different contexts. Every feature in the system is a function that takes one of these objects and moves it to its next state.
          </p>
        </div>
      </article>
    ),
  },
  {
    id: 'architecture',
    title: 'The System',
    icon: <Layers size={16} />,
    category: 'system',
    content: (
      <article>
        <p className="lead">
          Connector OS processes raw market data into scored, reasoned evaluations that tell you exactly which pairs to connect and why. Three layers do this: the I Layer synthesizes intent, MCP evaluates pairs, and Station gives you the controls.
        </p>

        {/* Pipeline Visual */}
        <div className="my-8 p-6 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 text-center">
              <div className="w-12 h-12 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-2">
                <Database size={20} className="text-white/50" />
              </div>
              <div className="text-[11px] text-white/50">Raw Input</div>
            </div>
            <div className="text-white/20">&rarr;</div>
            <div className="flex-1 text-center">
              <div className="w-12 h-12 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-2">
                <Brain size={20} className="text-white/50" />
              </div>
              <div className="text-[11px] text-white/50">I Layer</div>
            </div>
            <div className="text-white/20">&rarr;</div>
            <div className="flex-1 text-center">
              <div className="w-12 h-12 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-2">
                <BarChart3 size={20} className="text-white/50" />
              </div>
              <div className="text-[11px] text-white/50">MCP</div>
            </div>
            <div className="text-white/20">&rarr;</div>
            <div className="flex-1 text-center">
              <div className="w-12 h-12 rounded bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-2">
                <Target size={20} className="text-emerald-400/60" />
              </div>
              <div className="text-[11px] text-white/50">Station</div>
            </div>
          </div>
        </div>

        <h3>The I Layer</h3>
        <p>
          Raw company data enters the system from Apify datasets or Pre-Built Markets. The I Layer synthesizes each record into a canonical intent object — a structured statement of who the company is, what they want, and why the timing matters now. Nothing downstream ever sees raw data. The canonical is the source of truth.
        </p>
        <p>
          This matters because embedding raw metadata produces roughly 30% average similarity across pairs — noise matching noise. Embedding the AI-synthesized intent brings that to 49% with 81 pairs clearing the 60% threshold. The interpretation layer is where matching quality comes from.
        </p>

        <h3>MCP Evaluation</h3>
        <p>
          MCP takes every demand-supply pair and scores it across two dimensions: fit (how well the supply addresses the demand) and timing (how urgent the signal is). It generates written reasoning explaining why the pair works, a suggested framing for the introduction, and a classification — pass, marginal, or quarantine. One AI call per shard of up to 250 pairs, dispatched via QStash with automatic fallback across three providers.
        </p>

        <h3>Station</h3>
        <p>
          Station is the operator workspace. You select a market, trigger evaluation, and watch results stream in via Realtime subscriptions. Matches appear grouped by demand company with tier indicators. You review the reasoning, fetch company intelligence, compose introductions, and send — all from one continuous flow.
        </p>

        {/* Invariant Callout */}
        <div className="p-4 rounded bg-emerald-500/[0.04] border border-emerald-500/[0.12] mt-6">
          <p className="text-[11px] font-mono text-emerald-400/60 m-0 leading-[1.8]">
            Nothing raw touches MCP. Only I Layer canonical intent objects enter evaluation. If the system embeds raw company descriptions instead of synthesized intent, matching quality degrades. This invariant is enforced at the pipeline boundary.
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
          Five steps take you from raw market data to sent introductions. Each step produces an object the next step consumes. You control the gate between evaluation and send.
        </p>

        {/* The Complete Flow */}
        <div className="my-10 p-8 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center justify-between gap-2 mb-6">
            {[
              { num: '1', label: 'Market', desc: 'Pick sources' },
              { num: '2', label: 'Evaluate', desc: 'AI scores pairs' },
              { num: '3', label: 'Review', desc: 'Read reasoning' },
              { num: '4', label: 'Compose', desc: 'Write one, clone all' },
              { num: '5', label: 'Send', desc: 'Route intros' },
            ].map((step, i) => (
              <div key={i} className="flex-1 text-center">
                <div className="w-10 h-10 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-2">
                  <span className="text-[14px] font-medium text-white/80">{step.num}</span>
                </div>
                <div className="text-[11px] font-medium text-white/70">{step.label}</div>
                <div className="text-[10px] text-white/40 mt-1">{step.desc}</div>
              </div>
            ))}
          </div>
          <div className="h-1 rounded-full bg-white/[0.06]"/>
        </div>

        {/* Step 1 */}
        <h3>Step 1: Select a market</h3>
        <p>
          Open Station. You see two input methods: Pre-Built Markets, which pull live company data from Instantly SuperSearch, and Apify Datasets, which accept any structured scrape. Pick your demand source and supply source. The system accepts any combination.
        </p>
        <p>
          Click Analyze. The system runs diagnostics on your data — record counts, field completeness, signal distribution — before anything enters the pipeline. If your data has problems, you see them here, not three steps later.
        </p>

        {/* Step 2 */}
        <h3>Step 2: Run the evaluation</h3>
        <p>
          Click Run. The system creates every possible demand-supply pair, shards them into batches, and dispatches each shard to MCP for AI evaluation. A run with 30 demand and 68 supply companies produces 2,040 pairs. At current throughput, that completes in roughly 80 seconds.
        </p>
        <p>
          You navigate to the Runs page automatically. A progress bar shows pairs scored, estimated time remaining, and the current classification breakdown — how many pairs have passed, how many are marginal, how many quarantined.
        </p>

        {/* Live Progress Mock */}
        <div className="my-6 p-5 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-mono text-white/50">v5-1709823456</span>
            <span className="text-[11px] text-emerald-400/60">82 / 82 shards</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] mb-3">
            <div className="h-1.5 rounded-full bg-emerald-500/40" style={{ width: '100%' }} />
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center">
              <div className="text-[14px] font-medium text-emerald-400/60">248</div>
              <div className="text-[10px] text-white/30">Pass</div>
            </div>
            <div className="text-center">
              <div className="text-[14px] font-medium text-white/50">412</div>
              <div className="text-[10px] text-white/30">Marginal</div>
            </div>
            <div className="text-center">
              <div className="text-[14px] font-medium text-white/30">1,334</div>
              <div className="text-[10px] text-white/30">Quarantine</div>
            </div>
            <div className="text-center">
              <div className="text-[14px] font-medium text-white/20">46</div>
              <div className="text-[10px] text-white/30">Vetoed</div>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <h3>Step 3: Review matches</h3>
        <p>
          When the run completes, click into it. Matches appear grouped by demand company, sorted by combined score. Each match card shows the framing — a one-line pitch angle — the fit and timing scores, and the AI&rsquo;s classification. Expand any card to read the full reasoning: two to three sentences explaining why this specific pair works right now.
        </p>
        <p>
          You can fetch company intelligence inline — description, pain points, competitors, ICP — from the detail panel without leaving the page. This context helps you decide which pairs to route and which to skip.
        </p>

        {/* Match Card Mock */}
        <div className="my-6 p-4 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="text-[11px] text-white/60 italic mb-2">&ldquo;Acme&rsquo;s DevOps expansion aligns with Terminal&rsquo;s post-Series B placement track record&rdquo;</div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-[12px] text-white/70">Acme Corp</span>
            <span className="text-white/20">&rarr;</span>
            <span className="text-[12px] text-white/70">Terminal</span>
            <span className="ml-auto text-[11px] font-mono text-emerald-400/60">0.84</span>
          </div>
          <div className="flex gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400/60">PASS</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-white/[0.04] text-white/40">fit: 0.91</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-white/[0.04] text-white/40">timing: 0.73</span>
          </div>
        </div>

        {/* Step 4 */}
        <h3>Step 4: Compose introductions</h3>
        <p>
          Navigate to Send. Write one reference introduction by hand for your strongest match — the supply intro and the demand intro. The compose engine analyzes your voice, structure, and style, then generates new introductions for every remaining match using that match&rsquo;s specific context: the signal, the framing, and the reasoning from the evaluation.
        </p>
        <p>
          The system separates style from context. Your reference intro is the training data. The output sounds like you wrote each one individually because the AI decomposes your reference and rebuilds per pair — it does not fill a template.
        </p>

        {/* Step 5 */}
        <h3>Step 5: Send</h3>
        <p>
          Review the generated intros. Approve or edit any you want to adjust. Hit send. Introductions route through your configured sender — Instantly or PlusVibe — with your API keys and campaign IDs. The system never touches your sender credentials outside of the send action.
        </p>

        {/* Quick Reference */}
        <h3>Quick reference</h3>
        <div className="my-6">
          <table className="w-full text-[12px]">
            <thead>
              <tr>
                <th className="text-left p-3 bg-white/[0.02] border-b border-white/[0.06] text-white/40 font-medium">Step</th>
                <th className="text-left p-3 bg-white/[0.02] border-b border-white/[0.06] text-white/40 font-medium">What happens</th>
                <th className="text-left p-3 bg-white/[0.02] border-b border-white/[0.06] text-white/40 font-medium">Output</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-3 border-b border-white/[0.04] text-white/60">Market</td>
                <td className="p-3 border-b border-white/[0.04] text-white/50">Select demand + supply sources</td>
                <td className="p-3 border-b border-white/[0.04] text-white/40">Canonical intents</td>
              </tr>
              <tr>
                <td className="p-3 border-b border-white/[0.04] text-white/60">Evaluate</td>
                <td className="p-3 border-b border-white/[0.04] text-white/50">AI scores every pair</td>
                <td className="p-3 border-b border-white/[0.04] text-white/40">Scored evaluations</td>
              </tr>
              <tr>
                <td className="p-3 border-b border-white/[0.04] text-white/60">Review</td>
                <td className="p-3 border-b border-white/[0.04] text-white/50">Read reasoning, check intel</td>
                <td className="p-3 border-b border-white/[0.04] text-white/40">Approved pairs</td>
              </tr>
              <tr>
                <td className="p-3 border-b border-white/[0.04] text-white/60">Compose</td>
                <td className="p-3 border-b border-white/[0.04] text-white/50">Write one, system clones all</td>
                <td className="p-3 border-b border-white/[0.04] text-white/40">Draft intros</td>
              </tr>
              <tr>
                <td className="p-3 text-white/60">Send</td>
                <td className="p-3 text-white/50">Route through your sender</td>
                <td className="p-3 text-white/40">Delivered intros</td>
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
          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded bg-white/[0.04] flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/50">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="8.5" cy="7" r="4"/>
                  <path d="M20 8v6M23 11h-6"/>
                </svg>
              </div>
              <span className="text-[13px] font-medium text-white">Hiring</span>
            </div>
            <p className="text-[12px] text-white/50 m-0">Teams scaling, roles opening, urgency building</p>
          </div>

          <div className="p-4 rounded bg-emerald-500/[0.08] border border-emerald-500/20">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded bg-emerald-500/20 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400/60">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
              </div>
              <span className="text-[13px] font-medium text-white">Funding</span>
            </div>
            <p className="text-[12px] text-white/50 m-0">Capital raised means money to spend</p>
          </div>

          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded bg-white/[0.04] flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/50">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <span className="text-[13px] font-medium text-white">Leadership</span>
            </div>
            <p className="text-[12px] text-white/50 m-0">New executives bring new initiatives</p>
          </div>

          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded bg-white/[0.04] flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/50">
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
        <div className="my-8 p-5 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] text-white/40">Yesterday</span>
            <span className="text-[11px] text-white/50 font-medium">Today</span>
            <span className="text-[11px] text-emerald-400/60/80">Next month</span>
          </div>
          <div className="h-2 rounded-full bg-white/[0.06] relative">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white/40 rounded-full shadow-lg shadow-white/10"/>
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
          MCP evaluates every demand-supply pair across two dimensions — fit and timing — and produces written reasoning explaining why the pair works. You review the reasoning. The AI does not decide who gets introduced.
        </p>

        {/* Scoring Dimensions */}
        <h3>How pairs are scored</h3>
        <p>
          Each pair receives two scores between 0 and 1. <strong>Fit</strong> measures how well the supply&rsquo;s offering addresses the demand&rsquo;s need. <strong>Timing</strong> measures how urgent the signal is — whether the company is actively hiring, recently funded, or showing speculative early indicators.
        </p>
        <p>
          The combined score is computed server-side: <code>0.6 &times; fit + 0.4 &times; timing</code>. The server computes this, never the AI — arithmetic is not a language model&rsquo;s job.
        </p>

        <div className="grid grid-cols-2 gap-3 my-6">
          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06] text-center">
            <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Fit</div>
            <div className="text-[18px] font-medium text-white/70">0 &ndash; 1</div>
            <div className="text-[10px] text-white/30 mt-1">Does the supply solve what the demand needs?</div>
          </div>
          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06] text-center">
            <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Timing</div>
            <div className="text-[18px] font-medium text-white/70">0 &ndash; 1</div>
            <div className="text-[10px] text-white/30 mt-1">Is something happening right now that makes this urgent?</div>
          </div>
        </div>

        {/* Classification Tiers */}
        <h3>Classification</h3>
        <p>
          The combined score determines classification. These tiers control what the operator sees first, not what gets discarded — the system ranks, it does not gate.
        </p>

        <div className="grid grid-cols-4 gap-2 my-6">
          <div className="p-3 rounded bg-emerald-500/[0.08] border border-emerald-500/20 text-center">
            <div className="text-[13px] font-medium text-emerald-400/60">Pass</div>
            <div className="text-[11px] text-white/40 mt-1">&ge; 0.50</div>
            <div className="text-[10px] text-white/30 mt-2">Strong fit + timing</div>
          </div>
          <div className="p-3 rounded bg-white/[0.02] border border-white/[0.06] text-center">
            <div className="text-[13px] font-medium text-white/50">Marginal</div>
            <div className="text-[11px] text-white/40 mt-1">0.30 &ndash; 0.49</div>
            <div className="text-[10px] text-white/30 mt-2">Partial alignment</div>
          </div>
          <div className="p-3 rounded bg-white/[0.04] border border-white/[0.08] text-center">
            <div className="text-[13px] font-medium text-white/40">Quarantine</div>
            <div className="text-[11px] text-white/40 mt-1">&lt; 0.30</div>
            <div className="text-[10px] text-white/30 mt-2">Weak signal</div>
          </div>
          <div className="p-3 rounded bg-red-500/[0.06] border border-red-500/20 text-center">
            <div className="text-[13px] font-medium text-red-400/60">Vetoed</div>
            <div className="text-[11px] text-white/40 mt-1">Flagged</div>
            <div className="text-[10px] text-white/30 mt-2">Competitor or nonsensical</div>
          </div>
        </div>

        {/* Reasoning */}
        <h3>Reasoning</h3>
        <p>
          Every scored pair gets written reasoning — two to three sentences naming both companies and explaining the connection. It also gets a framing line: a 20-word-or-less pitch angle that becomes the opening of the introduction if you route the pair.
        </p>

        <div className="my-6 p-4 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="text-[9px] font-mono text-white/25 uppercase tracking-[0.08em] mb-2">Example reasoning</div>
          <p className="text-[11px] font-mono text-white/50 italic m-0 leading-[1.8]">
            &ldquo;Acme Corp is scaling its DevOps team with 8 open roles, suggesting infrastructure investment that typically follows Series B growth. Terminal specializes in placing senior engineers at exactly this stage. The timing aligns because Acme&rsquo;s hiring velocity has accelerated over the past 30 days.&rdquo;
          </p>
        </div>

        <div className="my-6 p-4 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="text-[9px] font-mono text-white/25 uppercase tracking-[0.08em] mb-2">Example framing</div>
          <p className="text-[11px] font-mono text-white/50 italic m-0">
            &ldquo;Acme&rsquo;s DevOps expansion aligns with Terminal&rsquo;s post-Series B placement track record&rdquo;
          </p>
        </div>

        {/* Infrastructure */}
        <h3>Infrastructure</h3>
        <p>
          MCP dispatches shards to QStash with parallelism of 10. The primary AI provider runs at roughly 2,900 tokens per second. If it fails, the system falls back to a second provider at 500 tokens per second, then to Azure GPT-4o. Retries happen at the queue level, not inside the scoring function — a failed shard gets redelivered by QStash, not retried in a loop.
        </p>
        <p>
          Results stream to the browser via Supabase Realtime. You do not poll. You do not refresh. Matches appear as they complete.
        </p>

        <div className="p-4 rounded bg-emerald-500/[0.04] border border-emerald-500/[0.12] mt-6">
          <p className="text-[11px] font-mono text-emerald-400/60 m-0 leading-[1.8]">
            The evaluation layer proposes. You dispose. Evaluations never route introductions directly — they produce recommendations. The separation between scoring and sending is what prevents the AI from becoming a spam engine.
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
          <div className="p-4 rounded bg-emerald-500/[0.08] border border-emerald-500/20 flex items-center gap-4">
            <div className="w-10 h-10 rounded bg-emerald-500/20 flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400/60">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-[13px] font-medium text-emerald-400/60">Positive</div>
              <div className="text-[12px] text-white/50">"Yes, I'm interested" → Auto follow-up sent</div>
            </div>
          </div>

          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06] flex items-center gap-4">
            <div className="w-10 h-10 rounded bg-white/[0.04] flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/50">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4M12 8h.01"/>
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-[13px] font-medium text-white/50">Needs Review</div>
              <div className="text-[12px] text-white/50">Questions, pricing, objections → Waiting for you</div>
            </div>
          </div>

          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06] flex items-center gap-4">
            <div className="w-10 h-10 rounded bg-white/10 flex items-center justify-center shrink-0">
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
          <div className="p-3 rounded bg-white/[0.02] border border-white/[0.06] text-[12px] text-white/40">
            ✗ "I'll check and get back to you"
          </div>
          <div className="p-3 rounded bg-white/[0.02] border border-white/[0.06] text-[12px] text-white/40">
            ✗ "They're ready to go"
          </div>
          <div className="p-3 rounded bg-white/[0.02] border border-white/[0.06] text-[12px] text-white/40">
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
          The compose engine turns one handwritten introduction into introductions for every remaining match. You write once. The system reconstructs per pair, using each match&rsquo;s specific signal, framing, and reasoning.
        </p>

        {/* How it works */}
        <h3>The reference intro</h3>
        <p>
          Pick your strongest match. Write the supply intro and the demand intro by hand — exactly how you would if you were sending one email to one person. This is the reference pair. The system treats it as training data.
        </p>

        {/* Reference → Clone visual */}
        <div className="my-8 p-6 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-[13px] font-medium text-emerald-400/60">1</div>
              <div className="flex-1">
                <div className="text-[13px] text-white/80">You write one perfect intro pair</div>
                <div className="text-[11px] text-white/40">Your voice, your structure, your judgment</div>
              </div>
            </div>
            <div className="ml-4 border-l border-white/[0.08] h-4"/>
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-[13px] font-medium text-white/50">2</div>
              <div className="flex-1">
                <div className="text-[13px] text-white/80">AI analyzes the reference</div>
                <div className="text-[11px] text-white/40">Infers voice, sentence rhythm, structural pattern</div>
              </div>
            </div>
            <div className="ml-4 border-l border-white/[0.08] h-4"/>
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-[13px] font-medium text-white/50">3</div>
              <div className="flex-1">
                <div className="text-[13px] text-white/80">Reconstructs per match</div>
                <div className="text-[11px] text-white/40">Same style + new context (signal, framing, reasoning)</div>
              </div>
            </div>
          </div>
        </div>

        <h3>Style vs context</h3>
        <p>
          The compose engine separates what&rsquo;s reusable from what&rsquo;s specific. Your sentence structure, tone, and rhythm are <strong>style</strong> — they transfer across every match. The signal, the company names, the framing line, and the reasoning are <strong>context</strong> — they change per pair. The AI does not fill a template. It decomposes the reference and rebuilds from context.
        </p>

        {/* Two modes */}
        <h3>Two modes</h3>
        <div className="grid grid-cols-2 gap-3 my-6">
          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[12px] font-medium text-white/70 mb-2">Market routing</div>
            <p className="text-[11px] text-white/40 m-0">
              Both sides are strangers. The system generates a supply intro and a demand intro for each pair. Both get outreach simultaneously.
            </p>
          </div>
          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[12px] font-medium text-white/70 mb-2">Fulfillment</div>
            <p className="text-[11px] text-white/40 m-0">
              One side is your paying client. The system generates demand-only intros. The client&rsquo;s name never appears in AI output — the prompt describes their capability generically.
            </p>
          </div>
        </div>

        <h3>Deduplication</h3>
        <p>
          In fulfillment mode, the same demand contact may appear across multiple supply matches. The compose engine deduplicates at three layers: by demand key at the prompt level (one AI call per unique contact), by draft mapping (the single output maps back to all evaluation IDs sharing that key), and by email at send time (one message per unique address).
        </p>

        <h3>Sending</h3>
        <p>
          Introductions route through your configured sender — Instantly or PlusVibe — using your API keys and campaign IDs. The system does not store or touch your sender credentials outside the send action. If a workspace or provider mismatch is detected between the run and the current session, the send is blocked with an error explaining exactly what doesn&rsquo;t match.
        </p>

        <div className="p-4 rounded bg-emerald-500/[0.04] border border-emerald-500/[0.12] mt-6">
          <p className="text-[11px] font-mono text-emerald-400/60 m-0 leading-[1.8]">
            The product being sold is access and timing. The introduction is the delivery mechanism. This distinction matters — both sides of the market can commit independently because you sell access to operator infrastructure, not exclusive representation.
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
        <div className="my-8 p-6 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded bg-white/[0.04] flex items-center justify-center">
              <span className="text-xl font-serif text-white/50">Ψ</span>
            </div>
            <div>
              <div className="text-[16px] font-medium text-white">Psyche</div>
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
            <span className="text-sm font-serif text-white/50">Ψ</span>
            The Seven Minds
          </h3>

          {/* Animated Pipeline Grid */}
          <div className="grid grid-cols-7 gap-2 mb-6">
            {/* Animus */}
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-2 relative">
                <span className="text-[11px] font-medium text-white/50">1</span>
                <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-2 h-[2px] bg-white/[0.06]" />
              </div>
              <span className="text-[10px] font-medium text-white/50">Animus</span>
              <span className="text-[9px] text-white/30">Creator</span>
            </div>
            {/* Ego */}
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mb-2 relative">
                <span className="text-[11px] font-medium text-emerald-400/60">2</span>
                <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-2 h-[2px] bg-emerald-500/30" />
              </div>
              <span className="text-[10px] font-medium text-emerald-400/60">Ego</span>
              <span className="text-[9px] text-white/30">Gatekeeper</span>
            </div>
            {/* Senex */}
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-2 relative">
                <span className="text-[11px] font-medium text-white/50">3</span>
                <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-2 h-[2px] bg-white/[0.06]" />
              </div>
              <span className="text-[10px] font-medium text-white/50">Senex</span>
              <span className="text-[9px] text-white/30">Elder</span>
            </div>
            {/* Shadow */}
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-2 relative">
                <span className="text-[11px] font-medium text-white/40">4</span>
                <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-2 h-[2px] bg-white/[0.06]" />
              </div>
              <span className="text-[10px] font-medium text-white/40">Shadow</span>
              <span className="text-[9px] text-white/30">Mirror</span>
            </div>
            {/* Anima */}
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-2 relative">
                <span className="text-[11px] font-medium text-white/50">5</span>
                <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-2 h-[2px] bg-white/[0.06]" />
              </div>
              <span className="text-[10px] font-medium text-white/50">Anima</span>
              <span className="text-[9px] text-white/30">Weaver</span>
            </div>
            {/* Magician */}
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-2 relative">
                <span className="text-[11px] font-medium text-white/50">6</span>
                <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-2 h-[2px] bg-white/[0.06]" />
              </div>
              <span className="text-[10px] font-medium text-white/50">Magician</span>
              <span className="text-[9px] text-white/30">Mover</span>
            </div>
            {/* Self */}
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded bg-white/20 border border-white/30 flex items-center justify-center mb-2">
                <span className="text-[11px] font-medium text-white">7</span>
              </div>
              <span className="text-[10px] font-medium text-white">Self</span>
              <span className="text-[9px] text-white/30">Whole</span>
            </div>
          </div>
        </div>

        {/* Layer Details */}
        <div className="my-8 space-y-3">
          <h3>What each mind does</h3>

          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded bg-white/[0.04] flex items-center justify-center text-[11px] font-medium text-white/50">1</span>
              <div className="flex-1">
                <div className="text-[13px] font-medium text-white">Animus — The Creator</div>
                <div className="text-[12px] text-white/50">Generates the initial reply. Classification, tone, personalization.</div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded bg-emerald-500/[0.06] border border-emerald-500/20">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded bg-emerald-500/20 flex items-center justify-center text-[11px] font-medium text-emerald-400/60">2</span>
              <div className="flex-1">
                <div className="text-[13px] font-medium text-white">Ego — The Gatekeeper</div>
                <div className="text-[12px] text-white/50">Quality check. Blocks anything that sounds desperate, generic, or salesy.</div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded bg-white/[0.04] flex items-center justify-center text-[11px] font-medium text-white/50">3</span>
              <div className="flex-1">
                <div className="text-[13px] font-medium text-white">Senex — The Elder</div>
                <div className="text-[12px] text-white/50">Doctrine guardian. Ensures leverage is maintained — never chase, never beg.</div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded bg-white/[0.04] flex items-center justify-center text-[11px] font-medium text-white/40">4</span>
              <div className="flex-1">
                <div className="text-[13px] font-medium text-white">Shadow — The Mirror</div>
                <div className="text-[12px] text-white/50">Red team. Finds how the reply could be misread, ignored, or deleted.</div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded bg-white/[0.04] flex items-center justify-center text-[11px] font-medium text-white/50">5</span>
              <div className="flex-1">
                <div className="text-[13px] font-medium text-white">Anima — The Weaver</div>
                <div className="text-[12px] text-white/50">Thread coherence. Checks that we're responding to what was actually said.</div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded bg-white/[0.04] flex items-center justify-center text-[11px] font-medium text-white/50">6</span>
              <div className="flex-1">
                <div className="text-[13px] font-medium text-white">Magician — The Mover</div>
                <div className="text-[12px] text-white/50">Deal momentum. Ensures every reply moves the conversation forward.</div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded bg-white/[0.06] border border-white/20">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded bg-white/20 flex items-center justify-center text-[11px] font-medium text-white">7</span>
              <div className="flex-1">
                <div className="text-[13px] font-medium text-white">Self — The Whole</div>
                <div className="text-[12px] text-white/50">Integration. If composite score is below threshold, Self rewrites until it's right.</div>
              </div>
            </div>
          </div>
        </div>

        {/* Self-Correction Explainer */}
        <div className="my-8 p-5 rounded bg-white/[0.02] border border-white/[0.06]">
          <h3 className="flex items-center gap-2 mt-0 mb-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400/60">
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
            <div className="p-3 rounded bg-white/[0.02] border border-white/[0.06] text-center">
              <div className="text-[11px] text-white/50">Leverage</div>
              <div className="text-[14px] font-medium text-white mt-1">0-10</div>
            </div>
            <div className="p-3 rounded bg-white/[0.02] border border-white/[0.06] text-center">
              <div className="text-[11px] text-white/50">Context</div>
              <div className="text-[14px] font-medium text-white mt-1">0-10</div>
            </div>
            <div className="p-3 rounded bg-white/[0.02] border border-white/[0.06] text-center">
              <div className="text-[11px] text-white/50">Momentum</div>
              <div className="text-[14px] font-medium text-white mt-1">0-10</div>
            </div>
            <div className="p-3 rounded bg-white/[0.08] border border-white/20 text-center">
              <div className="text-[11px] text-white/60">Composite</div>
              <div className="text-[14px] font-medium text-white mt-1">0-10</div>
            </div>
          </div>
        </div>

        {/* Tone Principles Visual */}
        <div className="my-8 grid grid-cols-3 gap-3">
          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06] text-center">
            <div className="w-10 h-10 rounded bg-white/[0.04] flex items-center justify-center mx-auto mb-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/50">
                <path d="M12 2l9 5v10l-9 5-9-5V7l9-5z"/>
              </svg>
            </div>
            <div className="text-[12px] font-medium text-white">Favor</div>
            <div className="text-[11px] text-white/40 mt-1">You're helping them</div>
          </div>

          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06] text-center">
            <div className="w-10 h-10 rounded bg-white/[0.04] flex items-center justify-center mx-auto mb-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/50">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                <path d="M22 4L12 14.01l-3-3"/>
              </svg>
            </div>
            <div className="text-[12px] font-medium text-white">Selective</div>
            <div className="text-[11px] text-white/40 mt-1">You filter, not chase</div>
          </div>

          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06] text-center">
            <div className="w-10 h-10 rounded bg-emerald-500/20 flex items-center justify-center mx-auto mb-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400/60">
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
          <div className="p-5 rounded bg-white/[0.02] border border-white/[0.06] mt-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] text-white/50 font-medium">Early</span>
              <span className="text-[11px] text-white/40">Message #5</span>
              <span className="text-[11px] text-white/30">Later</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06]"/>
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
        <div className="p-5 rounded bg-white/[0.02] border border-white/[0.06] mt-6">
          <p className="text-[14px] text-white/60 italic m-0 text-center">
            "The system just works. We don't show the machinery — only the magic."
          </p>
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
        <div className="my-8 p-6 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-[28px] font-medium text-emerald-400/60">$0</div>
              <div className="text-[11px] text-white/40">Starting point</div>
            </div>
            <div className="flex items-center justify-center">
              <div className="text-[20px] text-white/20">→</div>
            </div>
            <div>
              <div className="text-[28px] font-medium text-emerald-400/60">$10,000+</div>
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

        <div className="my-8 p-5 rounded bg-white/[0.02] border border-white/[0.06]">
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

        <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06] my-6">
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
            className="text-emerald-400/60 hover:text-emerald-400/60 underline underline-offset-4 transition-colors"
          >
            Go here now → The Ouroboros Loop
          </button>
        </p>

        {/* Progression Visual */}
        <div className="my-8 p-6 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="text-[10px] text-white/40 uppercase tracking-wider mb-4 text-center">The progression</div>
          <div className="flex items-center justify-between">
            <div className="text-center flex-1">
              <div className="text-[18px] font-medium text-white/60">$40K</div>
              <div className="text-[10px] text-white/30">Month 6</div>
            </div>
            <div className="text-white/20">→</div>
            <div className="text-center flex-1">
              <div className="text-[18px] font-medium text-white/70">$123K</div>
              <div className="text-[10px] text-white/30">Month 10</div>
            </div>
            <div className="text-white/20">→</div>
            <div className="text-center flex-1">
              <div className="text-[18px] font-medium text-white/80">$186K</div>
              <div className="text-[10px] text-white/30">Month 12</div>
            </div>
            <div className="text-white/20">→</div>
            <div className="text-center flex-1">
              <div className="text-[18px] font-medium text-emerald-400/60">$1M+</div>
              <div className="text-[10px] text-emerald-400/60/50">6 months later</div>
            </div>
          </div>
        </div>

        <h3>The money line</h3>
        <p>
          Here's what I want you to understand before we go further:
        </p>

        <div className="my-8 p-6 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="space-y-3 text-center">
            <div className="text-[15px] text-white/70">You don't get paid for the intro.</div>
            <div className="text-[15px] text-white/80">You get paid for the <strong className="text-white">ability</strong> to make intros whenever you want.</div>
            <div className="h-px bg-white/[0.08] my-4" />
            <div className="text-[13px] text-white/50">That ability = <span className="text-emerald-400/60">Distribution</span></div>
            <div className="text-[13px] text-white/50">Distribution = <span className="text-emerald-400/60">Monopoly</span></div>
            <div className="text-[13px] text-white/50">Monopoly = <span className="text-emerald-400/60">Wealth</span></div>
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

        <div className="my-8 p-5 rounded bg-white/[0.02] border border-white/[0.06]">
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

        <div className="my-8 p-6 rounded bg-white/[0.02] border border-white/[0.06]">
          <h4 className="mt-0 mb-4 text-[15px] text-white/50">The pattern</h4>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-white/[0.04] flex items-center justify-center text-[11px] text-white/50">1</div>
              <span className="text-[13px] text-white/60">You don't wait to feel confident</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-white/[0.04] flex items-center justify-center text-[11px] text-white/50">2</div>
              <span className="text-[13px] text-white/60">You act as confident</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-white/[0.04] flex items-center justify-center text-[11px] text-white/50">3</div>
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

        <div className="my-8 p-5 rounded bg-white/[0.02] border border-white/[0.06]">
          <p className="text-[14px] text-white/70 italic m-0 text-center">
            "You are already who you want to be. Your refusal to believe it is the only reason you do not see it."
          </p>
        </div>

        <h3>Fear and mastery</h3>
        <p>
          If you still have the doubt of "but I'm not ready" or "I don't have enough social proof" — that's just an excuse to stay comfortable. To avoid the fear.
        </p>

        <div className="my-8 p-6 rounded bg-white/[0.02] border border-white/[0.06]">
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
          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[11px] text-white/40 uppercase tracking-wider mb-2">Don't</div>
            <p className="text-[12px] text-white/50 m-0">"OMG I can't believe this happened!"</p>
            <p className="text-[11px] text-white/30 mt-2 m-0">This programs your brain to treat wins as exceptions.</p>
          </div>
          <div className="p-4 rounded bg-emerald-500/[0.06] border border-emerald-500/20">
            <div className="text-[11px] text-emerald-400/60/80 uppercase tracking-wider mb-2">Do</div>
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

        <div className="p-5 rounded bg-white/[0.02] border border-white/[0.06] mt-8">
          <p className="text-[13px] text-emerald-400/60/80 m-0 text-center">
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

        <div className="my-8 p-5 rounded bg-white/[0.02] border border-white/[0.06]">
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
        <div className="my-8 p-6 rounded bg-white/[0.02] border border-white/[0.06]">
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
              <div className="w-10 h-10 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-2">
                <span className="text-[12px] font-medium text-white/50">1</span>
              </div>
              <div className="text-[11px] text-white/60">Signal</div>
            </div>
            <div className="text-white/20">→</div>
            <div className="text-center flex-1">
              <div className="w-10 h-10 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-2">
                <span className="text-[12px] font-medium text-white/50">2</span>
              </div>
              <div className="text-[11px] text-white/60">Match</div>
            </div>
            <div className="text-white/20">→</div>
            <div className="text-center flex-1">
              <div className="w-10 h-10 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-2">
                <span className="text-[12px] font-medium text-white/50">3</span>
              </div>
              <div className="text-[11px] text-white/60">Enrich</div>
            </div>
            <div className="text-white/20">→</div>
            <div className="text-center flex-1">
              <div className="w-10 h-10 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-2">
                <span className="text-[12px] font-medium text-white/50">4</span>
              </div>
              <div className="text-[11px] text-white/60">Route</div>
            </div>
            <div className="text-white/20">→</div>
            <div className="text-center flex-1">
              <div className="w-10 h-10 rounded bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-2">
                <span className="text-[12px] font-medium text-emerald-400/60">5</span>
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
          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded bg-white/[0.04] flex items-center justify-center">
                <span className="text-[12px] font-medium text-white/50">1</span>
              </div>
              <span className="text-[14px] font-medium text-white">Signal</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-11">
              Noticing when people want something. On both sides: supply and demand.
            </p>

            {/* Restaurant Line Visual */}
            <div className="ml-11 mt-4 p-4 rounded bg-black/20 border border-white/[0.06]">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-1">
                  <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px]">👤</div>
                  <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px]">👤</div>
                  <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px]">👤</div>
                  <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px]">👤</div>
                  <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px]">👤</div>
                </div>
                <div className="text-white/20">→</div>
                <div className="w-8 h-8 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-[12px]">🍽️</div>
              </div>
              <p className="text-[11px] text-white/40 m-0 italic">
                If you see a line outside a restaurant, you don't ask people if they're hungry. The line already tells you. That's a signal.
              </p>
            </div>
          </div>

          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded bg-white/[0.04] flex items-center justify-center">
                <span className="text-[12px] font-medium text-white/50">2</span>
              </div>
              <span className="text-[14px] font-medium text-white">Match</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-11">
              Putting them together in the same room. Not the "best" match. Just a fit. Perfection is the enemy of closed deals.
            </p>
          </div>

          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded bg-white/[0.04] flex items-center justify-center">
                <span className="text-[12px] font-medium text-white/50">3</span>
              </div>
              <span className="text-[14px] font-medium text-white">Enrich</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-11">
              Getting the missing context: who they are, what they need, how to reach them. Finding their actual contact information.
            </p>
          </div>

          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded bg-white/[0.04] flex items-center justify-center">
                <span className="text-[12px] font-medium text-white/50">4</span>
              </div>
              <span className="text-[14px] font-medium text-white">Route</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-11">
              The intro. Getting paid. Stepping aside. Letting them take it from there.
            </p>
          </div>

          <div className="p-4 rounded bg-emerald-500/[0.06] border border-emerald-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded bg-emerald-500/20 flex items-center justify-center">
                <span className="text-[12px] font-medium text-emerald-400/60">5</span>
              </div>
              <span className="text-[14px] font-medium text-white">Deal</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-11">
              Money hits your account. Learn what worked. Feed it back into the loop. Repeat forever.
            </p>
          </div>
        </div>

        <div className="p-5 rounded bg-white/[0.02] border border-white/[0.06]">
          <p className="text-[13px] text-white/60 m-0 text-center">
            You do this & learn what works, and do it endlessly like the snake eating its tail. One day you'll wake up with millions in your bank account.
          </p>
        </div>

        <h3>Deep dives</h3>
        <p>
          I wrote about each step of this loop in detail:
        </p>
        <ul>
          <li><a href="/library?page=data-sources" className="text-emerald-400/60 hover:text-emerald-400/60">Signals</a> — Where they come from, how to read them</li>
          <li><a href="/library?page=matching-engine" className="text-emerald-400/60 hover:text-emerald-400/60">Matching</a> — How to pair demand with supply</li>
          <li><a href="/library?page=outbound" className="text-emerald-400/60 hover:text-emerald-400/60">Routing</a> — The intro mechanics</li>
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
        <div className="my-8 p-6 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded bg-white/[0.04] flex items-center justify-center">
              <span className="text-[14px] font-medium text-white/50">1</span>
            </div>
            <div>
              <div className="text-[16px] font-medium text-white">Signal Hunting</div>
              <div className="text-[11px] text-white/40">Find 150 companies that need something right now</div>
            </div>
          </div>

          <div className="space-y-3 mt-4">
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-white/30 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Set up your first Apify dataset (job postings, funding, leadership changes)</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-white/30 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Load it into Connector OS</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-white/30 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Understand the tier system: A (hot), B (warm), C (exploring)</span>
            </div>
          </div>

          <div className="mt-4 p-3 rounded bg-black/20 border border-white/[0.06]">
            <div className="text-[10px] text-white/50/80 uppercase tracking-wider mb-1">End of Day 1</div>
            <div className="text-[12px] text-white/50">You have a list of 150 companies bleeding.</div>
          </div>
        </div>

        {/* Day 2 */}
        <div className="my-8 p-6 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded bg-white/[0.04] flex items-center justify-center">
              <span className="text-[14px] font-medium text-white/50">2</span>
            </div>
            <div>
              <div className="text-[16px] font-medium text-white">Building Your Supply</div>
              <div className="text-[11px] text-white/40">Find 150 providers who solve what those companies need</div>
            </div>
          </div>

          <div className="space-y-3 mt-4">
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-white/30 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Identify who counts as supply (recruiters, agencies, consultants)</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-white/30 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Source from LinkedIn, Clutch, agency directories</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-white/30 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Pick your identity: Insider, Researcher, or Network Hub</span>
            </div>
          </div>

          <div className="mt-4 p-3 rounded bg-black/20 border border-white/[0.06]">
            <div className="text-[10px] text-white/50/80 uppercase tracking-wider mb-1">End of Day 2</div>
            <div className="text-[12px] text-white/50">You have demand AND supply. The loop can begin.</div>
          </div>

          <div className="mt-4 p-3 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[11px] text-white/50">
              <strong className="text-white/70">Deep dive:</strong> I wrote about the three connector identities <a href="/library?page=what-is-connector" className="text-white/50 hover:text-white/50">here</a>.
            </div>
          </div>
        </div>

        {/* Day 3 */}
        <div className="my-8 p-6 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded bg-white/[0.04] flex items-center justify-center">
              <span className="text-[14px] font-medium text-white/50">3</span>
            </div>
            <div>
              <div className="text-[16px] font-medium text-white">First Matches</div>
              <div className="text-[11px] text-white/40">Match 150 demand companies to supply partners</div>
            </div>
          </div>

          <div className="space-y-3 mt-4">
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-white/30 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Use the matching engine to pair demand → supply</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-white/30 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Rule: ONE supply per demand (you're the gatekeeper)</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-white/30 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Enrich to find decision-makers</span>
            </div>
          </div>

          <div className="mt-4 p-3 rounded bg-black/20 border border-white/[0.06]">
            <div className="text-[10px] text-white/50/80 uppercase tracking-wider mb-1">End of Day 3</div>
            <div className="text-[12px] text-white/50">150 matched pairs, enriched, ready to send.</div>
          </div>
        </div>

        {/* Day 4 */}
        <div className="my-8 p-6 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded bg-white/[0.04] flex items-center justify-center">
              <span className="text-[14px] font-medium text-white/50">4</span>
            </div>
            <div>
              <div className="text-[16px] font-medium text-white">First Intros Go Out</div>
              <div className="text-[11px] text-white/40">Send 150 intros (300 messages — 150 demand + 150 supply)</div>
            </div>
          </div>

          <div className="space-y-3 mt-4">
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-white/40 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Dual intro format: hit both sides at the same time</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-white/40 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Voice: warm but not eager, brief but not cold</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-white/40 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Never say "they're ready" or "waiting on them"</span>
            </div>
          </div>

          <div className="mt-4 p-3 rounded bg-black/20 border border-white/[0.06]">
            <div className="text-[10px] text-white/50 uppercase tracking-wider mb-1">End of Day 4</div>
            <div className="text-[12px] text-white/50">300 messages in the world. The loop is live.</div>
          </div>
        </div>

        {/* Day 5 */}
        <div className="my-8 p-6 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded bg-white/10 flex items-center justify-center">
              <span className="text-[14px] font-medium text-white/60">5</span>
            </div>
            <div>
              <div className="text-[16px] font-medium text-white">The Silence</div>
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

          <div className="mt-4 p-3 rounded bg-black/20 border border-white/[0.06]">
            <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">End of Day 5</div>
            <div className="text-[12px] text-white/50">You've added 150 more signals. Pipeline is building.</div>
          </div>
        </div>

        {/* Day 6 */}
        <div className="my-8 p-6 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded bg-white/[0.04] flex items-center justify-center">
              <span className="text-[14px] font-medium text-white/50">6</span>
            </div>
            <div>
              <div className="text-[16px] font-medium text-white">Handling Replies</div>
              <div className="text-[11px] text-white/40">Respond to whoever replied — correctly</div>
            </div>
          </div>

          <div className="space-y-3 mt-4">
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-white/30 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Positive reply → move toward the intro</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-white/30 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Questions → answer without revealing position</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-white/30 mt-2 shrink-0" />
              <span className="text-[13px] text-white/60">Negative → archive, move on, no hard feelings</span>
            </div>
          </div>

          <div className="mt-4 p-3 rounded bg-black/20 border border-white/[0.06]">
            <div className="text-[10px] text-white/50/80 uppercase tracking-wider mb-1">End of Day 6</div>
            <div className="text-[12px] text-white/50">Active conversations. Timing is forming.</div>
          </div>

          <div className="mt-4 p-3 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[11px] text-white/50">
              <strong className="text-white/70">The doctrine:</strong> Interest ≠ readiness. <a href="/library?page=initiation" className="text-white/50 hover:text-white/60">Read more</a>.
            </div>
          </div>
        </div>

        {/* Day 7 */}
        <div className="my-8 p-6 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded bg-emerald-500/20 flex items-center justify-center">
              <span className="text-[14px] font-medium text-emerald-400/60">7</span>
            </div>
            <div>
              <div className="text-[16px] font-medium text-white">The Close</div>
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

          <div className="mt-4 p-3 rounded bg-emerald-500/[0.12] border border-emerald-500/30">
            <div className="text-[10px] text-emerald-400/60/80 uppercase tracking-wider mb-1">End of Day 7</div>
            <div className="text-[12px] text-emerald-400/60/80">One intro made. One deal in motion. The loop continues.</div>
          </div>
        </div>

        {/* The Math */}
        <h3>The math</h3>

        <div className="my-6 p-5 rounded bg-white/[0.02] border border-white/[0.06]">
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
              <span className="text-emerald-400/60 font-medium">= $24,000-$30,000/month</span>
            </div>
          </div>
          <p className="text-[11px] text-white/40 mt-3 mb-0 text-center">Plus commission on the back end from supply.</p>
        </div>

        {/* Money Model */}
        <h3>How you get paid</h3>
        <p>Both sides pay. Neither knows what the other paid.</p>

        <div className="my-6 grid grid-cols-2 gap-4">
          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[11px] text-white/50/80 uppercase tracking-wider mb-2">Demand pays</div>
            <div className="text-[14px] font-medium text-white mb-1">Retainer (upfront)</div>
            <div className="text-[12px] text-white/50">For curation — you filtered 100 providers down to 1.</div>
          </div>
          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[11px] text-white/50/80 uppercase tracking-wider mb-2">Supply pays</div>
            <div className="text-[14px] font-medium text-white mb-1">Access fee + Commission</div>
            <div className="text-[12px] text-white/50">For access + % when deal closes. They're earning from your intro.</div>
          </div>
        </div>

        <div className="p-5 rounded bg-white/[0.02] border border-white/[0.06]">
          <p className="text-[13px] text-emerald-400/60/80 m-0 text-center">
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
        <div className="my-8 p-6 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="w-14 h-14 rounded bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-3">
                <span className="text-[20px]">📄</span>
              </div>
              <div className="text-[13px] font-medium text-white">The Contract</div>
              <div className="text-[11px] text-white/40">Locks you in legally</div>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-3">
                <span className="text-[20px]">🎯</span>
              </div>
              <div className="text-[13px] font-medium text-white">The Script</div>
              <div className="text-[11px] text-white/40">Controls who gets what</div>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-3">
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

        <div className="my-8 p-5 rounded bg-white/[0.02] border border-white/[0.06]">
          <p className="text-[13px] text-white/70 m-0">
            <strong className="text-white">The mindset shift:</strong> If you're asking "how do I make sure they don't cut me out?" — you're still thinking like a freelancer. Freelancers worry about getting cut out. Distribution owners don't. Because you don't sell the intro. You sell the system that creates intros. And you can't bypass the system.
          </p>
        </div>

        <h3>1. The Contract</h3>
        <p>
          This locks your position legally. Don't skip it — if you do, clients can go around you and you have no leverage.
        </p>

        <div className="my-6 p-4 rounded bg-white/[0.02] border border-white/[0.06]">
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

        <div className="p-4 rounded bg-emerald-500/[0.06] border border-emerald-500/20 my-6">
          <div className="text-[11px] text-white/50">
            <strong className="text-white/70">Watch the full breakdown:</strong> I made a video walking through the exact contract setup, Stripe integration, and the 48-hour expiry trick. <span className="text-emerald-400/60">[YouTube link]</span>
          </div>
        </div>

        <h3>2. The Script (5 Qualification Questions)</h3>
        <p>
          The contract protects you legally. The script protects you when you're talking to them. If you don't control the conversation, you lose control of the deal.
        </p>

        <div className="my-6 space-y-3">
          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-white/[0.04] flex items-center justify-center text-[11px] text-white/50 font-medium">1</div>
              <span className="text-[13px] font-medium text-white">Capacity Check</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">"If I introduce you to someone this week, what's your actual capacity to take on work right now?"</p>
          </div>

          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-white/[0.04] flex items-center justify-center text-[11px] text-white/50 font-medium">2</div>
              <span className="text-[13px] font-medium text-white">Failure Mode Check</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">"In the past 90 days, what's gone wrong with the vendors you've tried?"</p>
          </div>

          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-white/[0.04] flex items-center justify-center text-[11px] text-white/50 font-medium">3</div>
              <span className="text-[13px] font-medium text-white">Money Check</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">"What's the financial impact when this problem isn't solved fast?"</p>
          </div>

          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-white/[0.04] flex items-center justify-center text-[11px] text-white/50 font-medium">4</div>
              <span className="text-[13px] font-medium text-white">Decision-Maker Check</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">"Who besides you needs to approve moving forward once I make the intro?"</p>
          </div>

          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-white/[0.04] flex items-center justify-center text-[11px] text-white/50 font-medium">5</div>
              <span className="text-[13px] font-medium text-white">Fit Check</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">"Describe your ideal partner in one sentence — what must they have or avoid?"</p>
          </div>
        </div>

        <h4>The Operator Frame</h4>
        <p>After they answer, you say:</p>
        <div className="my-4 p-4 rounded bg-white/[0.02] border border-white/[0.06]">
          <p className="text-[13px] text-white/80 m-0 italic">
            "Based on what you told me, I can introduce you — but I don't do one-off intros. I run a system that creates opportunities every single month. One intro solves today's problem. The system solves every month's problem from today forward."
          </p>
        </div>
        <p className="text-[13px] text-white/50">
          This is where the retainer becomes logical, not a pitch.
        </p>

        <h4>The Close</h4>
        <div className="my-4 p-4 rounded bg-emerald-500/[0.08] border border-emerald-500/20">
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

        <div className="my-6 p-4 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="text-[11px] text-white/40 uppercase tracking-wider mb-3">Four tabs</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded bg-black/20 border border-white/[0.06]">
              <div className="text-[12px] font-medium text-white mb-1">Active Intros</div>
              <div className="text-[11px] text-white/40">Track every introduction, status, revenue potential</div>
            </div>
            <div className="p-3 rounded bg-black/20 border border-white/[0.06]">
              <div className="text-[12px] font-medium text-white mb-1">New Signals</div>
              <div className="text-[11px] text-white/40">Fresh opportunities scraped this week</div>
            </div>
            <div className="p-3 rounded bg-black/20 border border-white/[0.06]">
              <div className="text-[12px] font-medium text-white mb-1">Revenue Tracking</div>
              <div className="text-[11px] text-white/40">Setup fees, commissions, monthly totals</div>
            </div>
            <div className="p-3 rounded bg-black/20 border border-white/[0.06]">
              <div className="text-[12px] font-medium text-white mb-1">Client List</div>
              <div className="text-[11px] text-white/40">Active retainers, status, next actions</div>
            </div>
          </div>
        </div>

        <h4>Monday Morning Ritual (30-45 min)</h4>
        <div className="my-4 space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-white/[0.04] flex items-center justify-center text-[10px] text-white/50">1</div>
            <span className="text-[13px] text-white/60">Scrape new signals from LinkedIn, Apollo, Crunchbase</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-white/[0.04] flex items-center justify-center text-[10px] text-white/50">2</div>
            <span className="text-[13px] text-white/60">Qualify urgent ones, reach out to qualified signals</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-white/[0.04] flex items-center justify-center text-[10px] text-white/50">3</div>
            <span className="text-[13px] text-white/60">Send weekly updates to retainer clients</span>
          </div>
        </div>

        <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06] my-6">
          <div className="text-[11px] text-white/50">
            <strong className="text-white/70">Watch the full breakdown:</strong> I made a video walking through the exact dashboard setup, weekly workflow, and SOPs. <span className="text-white/50">[YouTube link]</span>
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

        <div className="my-8 p-6 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="space-y-4">
            {/* Layer 1 */}
            <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded bg-white/[0.04] flex items-center justify-center">
                  <span className="text-[12px] font-medium text-white/50">1</span>
                </div>
                <span className="text-[14px] font-medium text-white">Data they don't have</span>
              </div>
              <p className="text-[12px] text-white/50 m-0 ml-11">
                Every week you scrape new companies hiring. New agencies looking for clients. Track who needs what right now. Map both sides. They don't see the whole picture. You do.
              </p>
            </div>

            {/* Layer 2 */}
            <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded bg-white/[0.04] flex items-center justify-center">
                  <span className="text-[12px] font-medium text-white/50">2</span>
                </div>
                <span className="text-[14px] font-medium text-white">Filtering they can't do</span>
              </div>
              <p className="text-[12px] text-white/50 m-0 ml-11">
                You check both sides: Are they serious or just looking? Can they actually deliver or pay? Do they move fast or waste time? Are they the right match? They can't do this themselves. They don't even know what makes a good match.
              </p>
            </div>

            {/* Layer 3 */}
            <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded bg-white/[0.04] flex items-center justify-center">
                  <span className="text-[12px] font-medium text-white/50">3</span>
                </div>
                <span className="text-[14px] font-medium text-white">If you stop paying, the flow stops</span>
              </div>
              <p className="text-[12px] text-white/50 m-0 ml-11">
                The most important part. One intro is fine, but if you want new opportunities every week, you need the system running. If you pause, the flow pauses. People don't fear losing you — they fear losing the flow.
              </p>
            </div>

            {/* Layer 4 */}
            <div className="p-4 rounded bg-emerald-500/[0.06] border border-emerald-500/20">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded bg-emerald-500/20 flex items-center justify-center">
                  <span className="text-[12px] font-medium text-emerald-400/60">4</span>
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

        <div className="my-6 p-5 rounded bg-white/[0.02] border border-white/[0.06]">
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

        <div className="p-5 rounded bg-white/[0.02] border border-white/[0.06] mt-8">
          <p className="text-[14px] text-emerald-400/60/90 m-0 text-center font-medium">
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
          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-white/[0.04] flex items-center justify-center text-[10px] text-white/50 font-medium">1</div>
              <span className="text-[13px] font-medium text-white">Limit booking windows</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              Only allow booking 24-48 hours forward, never weeks out. If people can book 2 weeks out, close rate drops 80%. A tight window makes them think "this must be important — he's in demand."
            </p>
          </div>

          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-white/[0.04] flex items-center justify-center text-[10px] text-white/50 font-medium">2</div>
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
          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-white/[0.04] flex items-center justify-center text-[10px] text-white/50 font-medium">3</div>
              <span className="text-[13px] font-medium text-white">Compression technique</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              Senior people hate long explanations. When they ask "how does this work?" — don't explain the whole system. Say: "Sure — 20 seconds: signals, outbound, intros, deals. Done. Now tell me what part you care about and I'll zoom in."
            </p>
          </div>

          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-white/[0.04] flex items-center justify-center text-[10px] text-white/50 font-medium">4</div>
              <span className="text-[13px] font-medium text-white">"I don't need you" micro frame</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              Decision makers test your dependency. When they say "why should we do this now?" — you say: "You shouldn't. Unless you want intros without adding headcount. If not, totally fine." Power expects power. They don't want someone begging.
            </p>
          </div>

          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-white/[0.04] flex items-center justify-center text-[10px] text-white/50 font-medium">5</div>
              <span className="text-[13px] font-medium text-white">"Here's the part you'll push back on"</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              People with money trust people who reveal weak points. Say: "There's one part you're probably going to push back on — the ramp-up window. It takes 2-3 weeks before data becomes predictable. I want you to be aware of that upfront." Preempt the objection → they stop imagining you're hiding things.
            </p>
          </div>

          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-white/[0.04] flex items-center justify-center text-[10px] text-white/50 font-medium">6</div>
              <span className="text-[13px] font-medium text-white">Mutual evaluation frame</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              When they ask aggressive questions like "How many clients like us have you done?" — don't justify. Say: "Happy to share, but before I go there — I want to make sure the way you work fits the way I build systems. What's your internal bandwidth like right now?" Flips the energy. They feel evaluated too. Executives love that.
            </p>
          </div>

          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-white/[0.04] flex items-center justify-center text-[10px] text-white/50 font-medium">7</div>
              <span className="text-[13px] font-medium text-white">Non-pedestal posture</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              Never speak like you're starstruck. If they say "We've been in business 22 years" — you say: "Nice. That means your data is clean and predictable. Makes my job easier." Respect without worship. This is how you stay high level.
            </p>
          </div>

          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-white/[0.04] flex items-center justify-center text-[10px] text-white/50 font-medium">8</div>
              <span className="text-[13px] font-medium text-white">"You're right" pattern break</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              When they hit you with a big objection like "I don't know if this will work for us" — don't push back. Say: "You're right. That's why the first two weeks are structured to test fit, not scale." Disarms them instantly.
            </p>
          </div>

          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-white/[0.04] flex items-center justify-center text-[10px] text-white/50 font-medium">9</div>
              <span className="text-[13px] font-medium text-white">Predict their fear before they speak</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              If selling to VP/founder level, say: "Here's what this tends to break for companies your size: bandwidth." When you predict their fear before they speak it, they think "he's seen our movie before." Instant authority.
            </p>
          </div>

          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-white/[0.04] flex items-center justify-center text-[10px] text-white/50 font-medium">10</div>
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
          <div className="p-4 rounded bg-emerald-500/[0.06] border border-emerald-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] text-emerald-400/60 font-medium">11</div>
              <span className="text-[13px] font-medium text-white">Anchor early, price late</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              Early in the call mention: "Most companies in this space make $50,000-$100,000 per placement." Now when you reveal your pricing, they're comparing your fee to industry value, not their wallet.
            </p>
          </div>

          <div className="p-4 rounded bg-emerald-500/[0.06] border border-emerald-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] text-emerald-400/60 font-medium">12</div>
              <span className="text-[13px] font-medium text-white">Deadline disguised as logistics</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              Don't say "spots are limited." Say: "If you want to start this month, it needs to be by Thursday to get the system built in time." Deadline disguised as logistics.
            </p>
          </div>

          <div className="p-4 rounded bg-emerald-500/[0.06] border border-emerald-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] text-emerald-400/60 font-medium">13</div>
              <span className="text-[13px] font-medium text-white">Add signal hack</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              Before any offer, list the exact signals you found in their business. They see you as prepared, intelligent, thoughtful, already working with them. Makes the close feel half done.
            </p>
          </div>

          <div className="p-4 rounded bg-emerald-500/[0.06] border border-emerald-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] text-emerald-400/60 font-medium">14</div>
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
          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-white/[0.04] flex items-center justify-center text-[10px] text-white/50 font-medium">15</div>
              <span className="text-[13px] font-medium text-white">Never use freelancer buttons</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              Don't use "Send Invoice" or "Get Approval." Use "Activate Access" or "Go Live." Money language matters less than commitment language.
            </p>
          </div>

          <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 rounded-full bg-white/[0.04] flex items-center justify-center text-[10px] text-white/50 font-medium">16</div>
              <span className="text-[13px] font-medium text-white">Identity flip after payment</span>
            </div>
            <p className="text-[12px] text-white/50 m-0 ml-9">
              After payment, never treat them like a prospect again. No "thanks for your interest." Your message should say: "You're in. Here's what happens next." Identity shift = less refunds, less objections later, easier upsells.
            </p>
          </div>
        </div>

        <div className="p-5 rounded bg-white/[0.02] border border-white/[0.06] mt-8">
          <p className="text-[14px] text-white/70 italic m-0 text-center">
            "Deals don't die because people say no. They die in the gaps you never designed. Your job as an operator: remove the gaps. Remove the friction. Let money move while the yes is still alive."
          </p>
        </div>

        <div className="p-4 rounded bg-emerald-500/[0.06] border border-emerald-500/20 my-6">
          <div className="text-[11px] text-white/50">
            <strong className="text-white/70">Watch the full breakdown:</strong> I made a video walking through all 16 hacks with real examples. <a href="https://www.youtube.com/watch?v=COoN1mm8NMw" target="_blank" rel="noopener noreferrer" className="text-emerald-400/60 hover:text-emerald-400/60">Watch here →</a>
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
              <div className="absolute -inset-3 rounded bg-white/[0.02] animate-pulse" style={{ animationDuration: '3s' }} />
              <div className="relative p-5 rounded bg-white/[0.02] border border-white/[0.06] text-center w-32">
                <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-3">
                  <Users size={20} className="text-white/50" />
                </div>
                <div className="text-[12px] font-medium text-white/80">Person A</div>
                <div className="text-[10px] text-white/50/60 mt-1">has a problem</div>
              </div>
            </div>

            {/* Connector (You) in the middle */}
            <div className="relative flex flex-col items-center">
              {/* Arrow from A */}
              <div className="absolute -left-6 top-1/2 -translate-y-1/2 w-6 h-px bg-white/[0.1]">
                <div className="absolute top-0 left-0 w-2 h-px bg-white/60 animate-[shimmer_1.5s_infinite]" />
              </div>
              {/* Arrow to B */}
              <div className="absolute -right-6 top-1/2 -translate-y-1/2 w-6 h-px bg-white/[0.1]">
                <div className="absolute top-0 right-0 w-2 h-px bg-white/60 animate-[shimmer_1.5s_infinite]" style={{ animationDelay: '0.5s' }} />
              </div>

              <div className="relative">
                <div className="absolute -inset-4 rounded-full bg-white/[0.04] animate-ping" style={{ animationDuration: '2.5s' }} />
                <div className="relative w-16 h-16 rounded-full bg-white/[0.04] border border-white/[0.1] flex items-center justify-center">
                  <div className="text-[11px] text-white/60 font-medium">YOU</div>
                </div>
              </div>
              <div className="text-[10px] text-white/50/60 mt-2">fix both</div>
            </div>

            {/* Person B */}
            <div className="relative">
              <div className="absolute -inset-3 rounded bg-emerald-500/10 animate-pulse" style={{ animationDuration: '3s', animationDelay: '0.5s' }} />
              <div className="relative p-5 rounded bg-emerald-500/[0.06] border border-emerald-500/20 text-center w-32">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-3">
                  <Users size={20} className="text-emerald-400/60" />
                </div>
                <div className="text-[12px] font-medium text-white/80">Person B</div>
                <div className="text-[10px] text-emerald-400/60/60 mt-1">has a problem</div>
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
              <div className="w-32 h-20 rounded bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                <div className="text-center">
                  <div className="text-[10px] text-white/30 uppercase tracking-wider">Regular</div>
                  <div className="text-[11px] text-white/40 mt-1">Wait in line</div>
                </div>
              </div>
            </div>
            {/* VIP ticket (highlighted) */}
            <div className="relative z-10 w-48 h-28 rounded bg-white/[0.04] border border-white/[0.1] flex items-center justify-center overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_3s_infinite]" />
              <div className="text-center relative z-10">
                <div className="text-[12px] text-white/50 uppercase tracking-wider font-medium">VIP Access</div>
                <div className="text-[20px] font-medium text-white/80 mt-1">Front of line</div>
                <div className="text-[10px] text-white/40 mt-1">First to opportunities</div>
              </div>
            </div>
            {/* Arrow */}
            <div className="absolute -right-16 top-10 flex items-center gap-2">
              <div className="w-8 h-px bg-white/[0.1]" />
              <div className="text-[10px] text-white/50/60">UPFRONT</div>
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
          <div className="relative group p-4 rounded bg-emerald-500/[0.06] border border-emerald-500/20 text-center">
            <div className="absolute inset-0 rounded bg-emerald-500/10 animate-pulse opacity-50" style={{ animationDuration: '4s' }} />
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-3">
                <span className="text-[18px] font-medium text-emerald-400/60">1</span>
              </div>
              <div className="text-[12px] font-medium text-white/80">First shot</div>
              <div className="text-[11px] text-white/40 mt-1">Talk to customers first</div>
            </div>
          </div>
          <div className="relative group p-4 rounded bg-white/[0.02] border border-white/[0.06] text-center">
            <div className="absolute inset-0 rounded bg-white/[0.02] animate-pulse opacity-50" style={{ animationDuration: '4s', animationDelay: '0.5s' }} />
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-white/[0.04] flex items-center justify-center mx-auto mb-3">
                <span className="text-[18px] font-medium text-white/50">2</span>
              </div>
              <div className="text-[12px] font-medium text-white/80">Pre-filtered</div>
              <div className="text-[11px] text-white/40 mt-1">No bullshit leads</div>
            </div>
          </div>
          <div className="relative group p-4 rounded bg-white/[0.02] border border-white/[0.06] text-center">
            <div className="absolute inset-0 rounded bg-white/[0.02] animate-pulse opacity-50" style={{ animationDuration: '4s', animationDelay: '1s' }} />
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-white/[0.04] flex items-center justify-center mx-auto mb-3">
                <span className="text-[18px] font-medium text-white/50">3</span>
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
        <div className="my-8 p-6 rounded bg-white/[0.02] border border-white/[0.06] relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_4s_infinite]" />
          <div className="relative flex items-center justify-center gap-8">
            <div className="text-center">
              <div className="relative">
                <div className="absolute -inset-2 rounded-full bg-white/[0.04] animate-ping" style={{ animationDuration: '3s' }} />
                <div className="relative w-14 h-14 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-2">
                  <Target size={22} className="text-white/50" />
                </div>
              </div>
              <div className="text-[11px] text-white/50 uppercase tracking-wider">Upfront</div>
              <div className="text-[10px] text-white/40">Start the hunt</div>
            </div>
            <div className="flex flex-col items-center">
              <div className="relative w-20">
                <div className="h-px bg-white/[0.06]" />
                <div className="absolute top-0 left-0 w-4 h-px bg-white/60 animate-[moveRight_2s_infinite]" />
              </div>
              <div className="text-[10px] text-white/30 mt-1">+ % on success</div>
            </div>
            <div className="text-center">
              <div className="relative">
                <div className="absolute -inset-2 rounded-full bg-emerald-500/20 animate-pulse" style={{ animationDuration: '2s' }} />
                <div className="relative w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-2">
                  <DollarSign size={22} className="text-emerald-400/60" />
                </div>
              </div>
              <div className="text-[11px] text-emerald-400/60/80 uppercase tracking-wider">Bounty</div>
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
            <div className="absolute inset-0 rounded-full border border-white/[0.06] animate-pulse" />
            <div className="absolute inset-4 rounded-full border border-white/[0.04]" />

            {/* Demand side */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4">
              <div className="w-20 h-20 rounded-full bg-white/[0.02] border border-white/[0.08] flex items-center justify-center">
                <div className="text-center">
                  <div className="text-[10px] text-white/50/80 uppercase tracking-wider">Demand</div>
                  <div className="text-[9px] text-white/30">floating</div>
                </div>
              </div>
            </div>

            {/* Supply side */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4">
              <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-[10px] text-emerald-400/60/80 uppercase tracking-wider">Supply</div>
                  <div className="text-[9px] text-white/30">floating</div>
                </div>
              </div>
            </div>

            {/* Center - The Connector (Axis Mundi) */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative">
                <div className="absolute -inset-4 rounded-full bg-white/[0.04] animate-ping" style={{ animationDuration: '3s' }} />
                <div className="w-16 h-16 rounded-full bg-white/[0.04] border border-white/[0.1] flex items-center justify-center relative z-10">
                  <div className="text-center">
                    <div className="text-[10px] text-white/60 font-medium">YOU</div>
                    <div className="text-[8px] text-white/40">axis mundi</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Connection lines */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-32 h-px bg-white/[0.06]" />
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
        <div className="my-8 p-6 rounded bg-white/[0.02] border border-white/[0.06] relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_5s_infinite]" />
          <div className="relative">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-white/30 animate-pulse" />
              <div className="text-[11px] text-white/50/60 uppercase tracking-wider">The brain</div>
            </div>

            {/* Many-to-one flow */}
            <div className="flex items-center justify-center gap-6 mb-6">
              {/* Demands */}
              <div className="space-y-2">
                <div className="px-3 py-1.5 rounded bg-white/[0.02] border border-white/[0.06] text-[11px] text-white/50 animate-pulse" style={{ animationDuration: '3s' }}>Demand A</div>
                <div className="px-3 py-1.5 rounded bg-white/[0.02] border border-white/[0.06] text-[11px] text-white/50 animate-pulse" style={{ animationDuration: '3s', animationDelay: '0.3s' }}>Demand B</div>
                <div className="px-3 py-1.5 rounded bg-white/[0.02] border border-white/[0.06] text-[11px] text-white/50 animate-pulse" style={{ animationDuration: '3s', animationDelay: '0.6s' }}>Demand C</div>
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
                <div className="absolute -inset-3 rounded bg-emerald-500/10 animate-ping" style={{ animationDuration: '3s' }} />
                <div className="relative px-5 py-4 rounded bg-emerald-500/10 border border-emerald-500/30">
                  <div className="text-[13px] text-emerald-400/60 font-medium">1 Message</div>
                  <div className="text-[10px] text-white/40">to Supply X</div>
                </div>
              </div>
            </div>

            {/* Example message */}
            <div className="p-3 rounded bg-white/[0.04] border border-white/[0.08] mb-4 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/3 to-transparent -translate-x-full animate-[shimmer_3s_infinite]" />
              <p className="text-[12px] text-white/50 m-0 font-mono relative">
                'Hey, I'm seeing companies like Acme doing [signal]. Want access?'
              </p>
            </div>

            <div className="text-center">
              <div className="inline-block px-4 py-2 rounded-full bg-white/[0.02] border border-white/[0.06]">
                <span className="text-[11px] text-white/50">Matching: many-to-many</span>
                <span className="text-[11px] text-white/30 mx-2">→</span>
                <span className="text-[11px] text-emerald-400/60">Messaging: one-to-one</span>
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
            <div className="absolute -inset-2 bg-white/[0.02] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative flex items-center gap-6 p-5 rounded bg-white/[0.02] border border-white/[0.06]">
              <div className="shrink-0">
                <div className="w-14 h-14 rounded-full bg-white/[0.02] border border-white/[0.08] flex items-center justify-center">
                  <div className="text-[11px] text-white/50 font-medium uppercase tracking-wider">Demand</div>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-8">
                <div>
                  <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">What you say</div>
                  <div className="text-[14px] text-white/80 font-medium">"I know someone"</div>
                </div>
                <div className="relative">
                  <div className="absolute -inset-2 bg-white/[0.02] rounded animate-pulse" style={{ animationDuration: '3s' }} />
                  <div className="relative">
                    <div className="text-[10px] text-white/50/60 uppercase tracking-wider mb-1">What you hold</div>
                    <div className="text-[14px] text-white/50 font-medium">Who the provider is</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Supply Row */}
          <div className="relative group">
            <div className="absolute -inset-2 bg-white/[0.02] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative flex items-center gap-6 p-5 rounded bg-emerald-500/[0.04] border border-emerald-500/20">
              <div className="shrink-0">
                <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                  <div className="text-[11px] text-emerald-400/60 font-medium uppercase tracking-wider">Supply</div>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-8">
                <div>
                  <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">What you say</div>
                  <div className="text-[14px] text-white/80 font-medium">"Companies like Acme"</div>
                </div>
                <div className="relative">
                  <div className="absolute -inset-2 bg-emerald-500/10 rounded animate-pulse" style={{ animationDuration: '3s' }} />
                  <div className="relative">
                    <div className="text-[10px] text-emerald-400/60/60 uppercase tracking-wider mb-1">What you hold</div>
                    <div className="text-[14px] text-emerald-400/60 font-medium">The full list of 20 companies</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <h3>When they reply yes</h3>

        <div className="space-y-4 my-8">
          <div className="relative group">
            <div className="absolute -inset-1 rounded bg-emerald-500/20 animate-pulse opacity-50" style={{ animationDuration: '3s' }} />
            <div className="relative p-5 rounded bg-emerald-500/[0.06] border border-emerald-500/20">
              <div className="flex items-center gap-4">
                <div className="shrink-0 w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                  <span className="text-[11px] text-emerald-400/60 font-medium">D</span>
                </div>
                <div>
                  <p className="text-[13px] text-white/80 m-0">
                    <strong className="text-emerald-400/60">"Yes, intro me"</strong>
                  </p>
                  <p className="text-[12px] text-white/50 mt-1 mb-0">→ NOW you reveal the provider → They can't go around you</p>
                </div>
              </div>
            </div>
          </div>
          <div className="relative group">
            <div className="absolute -inset-1 rounded bg-white/[0.04] animate-pulse opacity-50" style={{ animationDuration: '3s', animationDelay: '0.5s' }} />
            <div className="relative p-5 rounded bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center gap-4">
                <div className="shrink-0 w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                  <span className="text-[11px] text-white/50 font-medium">S</span>
                </div>
                <div>
                  <p className="text-[13px] text-white/80 m-0">
                    <strong className="text-white/50">"Yes, interested"</strong>
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
          <div className="absolute -inset-4 bg-white/[0.01] rounded" />
          <div className="relative p-8 rounded border border-white/[0.04] bg-[#0a0a0c]">
            <div className="absolute top-4 left-4 w-8 h-8 border-l border-t border-white/[0.06]" />
            <div className="absolute bottom-4 right-4 w-8 h-8 border-r border-b border-white/[0.06]" />

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
        <div className="p-6 rounded bg-white/[0.02] border border-white/[0.06] my-8">
          <div className="text-[11px] text-white/40 uppercase tracking-wider mb-2 text-center">One deal breakdown</div>
          <div className="text-[12px] text-white/40 text-center mb-6">What you make when you connect a recruiter to a hiring company</div>

          <div className="grid grid-cols-2 gap-6">
            <div className="p-5 rounded bg-emerald-500/[0.06] border border-emerald-500/20 text-center">
              <div className="text-[10px] text-emerald-400/60/60 uppercase tracking-wider mb-2">Supply pays you</div>
              <div className="text-[28px] font-medium text-emerald-400/60">$15K</div>
              <div className="text-[11px] text-white/50 mt-2">access fee (upfront)</div>
              <div className="text-[10px] text-white/30 mt-1">for VIP access to your deal flow</div>
            </div>
            <div className="p-5 rounded bg-white/[0.02] border border-white/[0.06] text-center">
              <div className="text-[10px] text-white/50/60 uppercase tracking-wider mb-2">Demand pays you</div>
              <div className="text-[28px] font-medium text-white/50">$15K</div>
              <div className="text-[11px] text-white/50 mt-2">finder's fee + % of deal</div>
              <div className="text-[10px] text-white/30 mt-1">for finding them the right provider</div>
            </div>
          </div>

          <div className="flex justify-center my-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-px bg-emerald-500/30" />
              <div className="text-[11px] text-white/40">+</div>
              <div className="w-12 h-px bg-white/[0.06]" />
            </div>
          </div>

          <div className="p-4 rounded bg-white/[0.04] border border-white/[0.08] text-center">
            <div className="text-[11px] text-white/40 uppercase tracking-wider mb-1">Your total from one intro</div>
            <div className="text-[32px] font-medium text-white/90">$30K</div>
            <div className="text-[11px] text-white/40">before any % kicks in</div>
          </div>

          <div className="mt-6 p-4 rounded bg-white/[0.02] border border-white/[0.06] text-center">
            <div className="text-[11px] text-white/40 uppercase tracking-wider mb-2">But wait — there's upside</div>
            <div className="text-[12px] text-white/50">If the deal closes and the client stays...</div>
            <div className="text-[12px] text-white/50 mt-1">Average B2B LTV: <span className="text-white/70 font-medium">$800K</span></div>
            <div className="text-[13px] text-white/70 mt-2">Your % of that = <span className="text-white/50 font-medium">generational wealth</span></div>
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
        <div className="my-8 p-6 rounded bg-white/[0.02] border border-white/[0.06]">
          <div className="text-center mb-6">
            <div className="text-[11px] text-white/50/60 uppercase tracking-wider mb-2">The Activation Math</div>
          </div>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <div className="text-center">
              <div className="text-[36px] font-medium text-white/50">1</div>
              <div className="text-[11px] text-white/40">Partner</div>
            </div>
            <div className="text-[24px] text-white/20">×</div>
            <div className="text-center">
              <div className="text-[36px] font-medium text-white/50">500</div>
              <div className="text-[11px] text-white/40">Signals</div>
            </div>
            <div className="text-[24px] text-white/20">=</div>
            <div className="text-center">
              <div className="text-[36px] font-medium text-emerald-400/60">500</div>
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
        <div className="p-4 rounded bg-white/[0.02] border border-white/[0.06] my-6">
          <ul className="space-y-2 text-[13px] text-white/60 list-none p-0 m-0">
            <li className="flex items-start gap-2">
              <span className="text-white/40/60">✗</span>
              <span>Manually search for companies that might need them</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-white/40/60">✗</span>
              <span>Write individual intros one by one</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-white/40/60">✗</span>
              <span>Hope the timing is right</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-white/40/60">✗</span>
              <span>Send 10-20 per day if you're fast</span>
            </li>
          </ul>
        </div>

        <h3>The new way (Fulfillment Mode)</h3>
        <div className="p-4 rounded bg-emerald-500/[0.06] border border-emerald-500/20 my-6">
          <ul className="space-y-2 text-[13px] text-white/60 list-none p-0 m-0">
            <li className="flex items-start gap-2">
              <span className="text-emerald-400/60">✓</span>
              <span>Upload your partner as a 1-row CSV</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400/60">✓</span>
              <span>Load hundreds of demand signals</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400/60">✓</span>
              <span>System matches ALL demand to your partner</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400/60">✓</span>
              <span>Generate 500 personalized intros in minutes</span>
            </li>
          </ul>
        </div>

        <h3>Step-by-step: Activate a partner</h3>

        {/* Step 1 */}
        <div className="p-5 rounded bg-white/[0.02] border border-white/[0.06] my-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-white/[0.04] flex items-center justify-center text-[14px] font-medium text-white/50">1</div>
            <div className="text-[15px] font-medium text-white/90">Upload your partner</div>
          </div>
          <p className="text-[13px] text-white/60 mb-4">
            Go to Settings → Data Sources → Supply. Download the template, fill in your partner's info.
          </p>

          {/* CSV Format */}
          <div className="p-4 rounded bg-black/40 border border-white/[0.06] mb-4">
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
                <span className="text-white/50/60 font-mono">Service Description</span>
                <span className="text-white/40">— Put everything here: what they do, ICP, differentiators, case studies. The system uses this for intros.</span>
              </div>
              <div className="flex items-start gap-2 text-[12px]">
                <span className="text-white/50/60 font-mono">Email</span>
                <span className="text-white/40">— Leave blank. They're your client. You don't send to them via Instantly.</span>
              </div>
              <div className="flex items-start gap-2 text-[12px]">
                <span className="text-white/50/60 font-mono">Domain</span>
                <span className="text-white/40">— Their real domain. Used for matching and deduplication.</span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded bg-white/[0.02] border border-white/[0.06]">
            <p className="text-[11px] text-white/40 m-0">
              <strong className="text-white/50/90">Key insight:</strong> The more detail you put in Service Description, the better the intros. Include ICP, differentiators, proof points. This is what the system uses to pitch them.
            </p>
          </div>
        </div>

        {/* Step 2 */}
        <div className="p-5 rounded bg-white/[0.02] border border-white/[0.06] my-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-white/[0.04] flex items-center justify-center text-[14px] font-medium text-white/50">2</div>
            <div className="text-[15px] font-medium text-white/90">Load demand signals</div>
          </div>
          <p className="text-[13px] text-white/60 mb-3">
            Two options:
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[12px] font-medium text-white/70 mb-1">Apify Dataset</div>
              <div className="text-[11px] text-white/40">Paste your dataset ID. Thousands of companies with live signals.</div>
            </div>
            <div className="p-3 rounded bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[12px] font-medium text-white/70 mb-1">CSV Upload</div>
              <div className="text-[11px] text-white/40">Your own list. Companies you've researched. Warm leads.</div>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="p-5 rounded bg-white/[0.02] border border-white/[0.06] my-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-white/[0.04] flex items-center justify-center text-[14px] font-medium text-white/50">3</div>
            <div className="text-[15px] font-medium text-white/90">Go to Flow</div>
          </div>
          <p className="text-[13px] text-white/60">
            Open Flow. The system loads your 1 supply partner and all your demand signals. Every demand company gets matched to your partner. No manual work.
          </p>
        </div>

        {/* Step 4 */}
        <div className="p-5 rounded bg-white/[0.02] border border-white/[0.06] my-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-[14px] font-medium text-emerald-400/60">4</div>
            <div className="text-[15px] font-medium text-white/90">Generate and send</div>
          </div>
          <p className="text-[13px] text-white/60 mb-3">
            Enrich contacts. Generate intros. Every intro pitches your partner to a company that needs them right now:
          </p>
          <div className="p-4 rounded bg-emerald-500/[0.04] border border-emerald-500/20">
            <p className="text-[12px] text-white/50 italic m-0">
              "Hey [Name] — noticed [Company] is scaling the engineering team. I know someone who places senior engineers in Series B+ companies. Worth an intro?"
            </p>
          </div>
        </div>

        <h3>The reverse: Find providers for a client</h3>
        <p>
          Works both directions. If you land a client who needs help, flip the model:
        </p>

        <div className="p-5 rounded bg-white/[0.02] border border-white/[0.06] my-6">
          <div className="grid grid-cols-4 gap-2 text-center text-[12px]">
            <div className="p-3 rounded bg-white/[0.04]">
              <div className="text-white/50 font-medium">1. Upload client</div>
              <div className="text-[10px] text-white/40 mt-1">as Demand (1 row)</div>
            </div>
            <div className="p-3 rounded bg-white/[0.04]">
              <div className="text-white/50 font-medium">2. Load providers</div>
              <div className="text-[10px] text-white/40 mt-1">as Supply (many)</div>
            </div>
            <div className="p-3 rounded bg-white/[0.04]">
              <div className="text-white/50 font-medium">3. Match</div>
              <div className="text-[10px] text-white/40 mt-1">all to your client</div>
            </div>
            <div className="p-3 rounded bg-white/[0.04]">
              <div className="text-white/50 font-medium">4. Send</div>
              <div className="text-[10px] text-white/40 mt-1">pitch each provider</div>
            </div>
          </div>
        </div>

        <h3>Why this prints money</h3>
        <div className="p-6 rounded bg-white/[0.02] border border-white/[0.06] my-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="text-white/50">→</div>
              <div>
                <div className="text-[13px] text-white/80 font-medium">Speed</div>
                <div className="text-[12px] text-white/50">500 intros in the time it takes to write 5 manually</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="text-white/50">→</div>
              <div>
                <div className="text-[13px] text-white/80 font-medium">Timing</div>
                <div className="text-[12px] text-white/50">Every intro hits companies showing live signals — they need help now</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="text-white/50">→</div>
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

        <div className="p-6 rounded bg-white/[0.03] border border-white/[0.08] my-6">
          <div className="grid grid-cols-2 gap-6 text-center">
            <div>
              <div className="text-[10px] text-white/40 uppercase tracking-wider mb-2">You collected</div>
              <div className="text-[28px] font-medium text-emerald-400/60">$45K</div>
              <div className="text-[11px] text-white/40 mt-1">$15K access + $30K (20% of 3 × $50K)</div>
            </div>
            <div>
              <div className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Time spent</div>
              <div className="text-[28px] font-medium text-white/80">&lt;1hr</div>
              <div className="text-[11px] text-white/40 mt-1">Upload, load, generate, send</div>
            </div>
          </div>
        </div>

        <p className="text-center my-8">
          <a
            href="/flow"
            className="inline-flex items-center gap-2 px-6 py-3 rounded bg-white text-black font-medium text-[14px] hover:bg-white/90 transition-colors no-underline"
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
            className="flex items-center gap-1.5 font-mono text-[10px] text-white/25 hover:text-white/50 transition-colors"
          >
            ← Back
          </button>
        </div>

        <div className="px-4 py-6 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
              <BookOpen size={14} className="text-white/40" />
            </div>
            <div>
              <div className="font-mono text-[12px] font-medium text-white/80">OS Library</div>
              <div className="font-mono text-[9px] text-white/25 uppercase tracking-widest">Docs & Philosophy</div>
            </div>
          </div>
        </div>

        <nav className="library-sidebar flex-1 overflow-y-auto py-4">
          {getstartedSections.length > 0 && (
            <div className="px-4 mb-6">
              <div className="font-mono text-[9px] font-medium text-emerald-400/60/50 uppercase tracking-widest mb-3">
                Get Started
              </div>
              {getstartedSections.map(section => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded font-mono text-[11px] transition-colors mb-0.5 ${
                    activeSection === section.id
                      ? 'bg-white/[0.06] text-white/80'
                      : 'text-white/40 hover:text-white/60 hover:bg-white/[0.03]'
                  }`}
                >
                  <span className={activeSection === section.id ? 'text-white/60' : 'text-white/25'}>
                    {section.icon}
                  </span>
                  {section.title}
                </button>
              ))}
            </div>
          )}

          <div className="px-4 mb-6">
            <div className="font-mono text-[9px] font-medium text-white/20 uppercase tracking-widest mb-3">
              Philosophy
            </div>
            {philosophySections.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded font-mono text-[11px] transition-colors mb-0.5 ${
                  activeSection === section.id
                    ? 'bg-white/[0.06] text-white/80'
                    : 'text-white/40 hover:text-white/60 hover:bg-white/[0.03]'
                }`}
              >
                <span className={activeSection === section.id ? 'text-white/60' : 'text-white/25'}>
                  {section.icon}
                </span>
                {section.title}
              </button>
            ))}
          </div>

          <div className="px-4">
            <div className="font-mono text-[9px] font-medium text-white/20 uppercase tracking-widest mb-3">
              System
            </div>
            {systemSections.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded font-mono text-[11px] transition-colors mb-0.5 ${
                  activeSection === section.id
                    ? 'bg-white/[0.06] text-white/80'
                    : 'text-white/40 hover:text-white/60 hover:bg-white/[0.03]'
                }`}
              >
                <span className={activeSection === section.id ? 'text-white/60' : 'text-white/25'}>
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
            <img src="/ssm-logo.png" alt="SSM" className="w-5 h-5" style={{ borderRadius: '2px' }} />
            <span className="font-mono text-[10px] text-white/30">SSM Community</span>
          </a>
        </div>
      </aside>

      {/* Content */}
      <main className="library-main flex-1 ml-64 overflow-y-auto">
        <div className="max-w-[640px] px-12 py-12">
          {currentSection && (
            <>
              <div className="flex items-center gap-1.5 font-mono text-[9px] text-white/25 uppercase tracking-widest mb-6">
                <span>
                  {currentSection.category === 'philosophy' ? 'Philosophy' : currentSection.category === 'getstarted' ? 'Get Started' : 'System'}
                </span>
                <span className="text-white/10">{'>'}</span>
                <span className="text-white/40">{currentSection.title}</span>
              </div>

              <h1 className="font-mono text-[22px] font-medium text-white/90 tracking-[-0.02em] mb-8">
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
          color: rgba(255, 255, 255, 0.45);
          font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
          font-size: 11px;
          line-height: 1.8;
        }

        .docs-content .lead {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.50);
          margin-bottom: 24px;
          line-height: 1.7;
        }

        .docs-content .placeholder {
          padding: 16px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px dashed rgba(255, 255, 255, 0.06);
          border-radius: 2px;
          color: rgba(255, 255, 255, 0.20);
          font-style: italic;
          margin: 16px 0;
          font-size: 10px;
        }

        .docs-content h3 {
          font-size: 13px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.80);
          margin-top: 32px;
          margin-bottom: 12px;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }

        .docs-content h4 {
          font-size: 11px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.60);
          margin-top: 24px;
          margin-bottom: 10px;
          letter-spacing: 0.02em;
          text-transform: uppercase;
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
          color: rgba(255, 255, 255, 0.65);
          font-weight: 500;
        }

        .docs-content em {
          color: rgba(255, 255, 255, 0.50);
        }

        .docs-content code {
          background: rgba(255, 255, 255, 0.03);
          padding: 1px 5px;
          border-radius: 2px;
          font-size: 10px;
          color: rgba(255, 255, 255, 0.50);
        }

        .docs-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 16px 0;
          font-size: 10px;
        }

        .docs-content th {
          text-align: left;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.02);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.25);
          font-weight: 500;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .docs-content td {
          padding: 8px 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          color: rgba(255, 255, 255, 0.40);
        }

        .docs-content pre {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 2px;
          padding: 12px 16px;
          font-size: 10px;
          line-height: 1.6;
          color: rgba(255, 255, 255, 0.40);
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
          border-radius: 2px;
        }

        .docs-content .card-red {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .docs-content .card-green {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .docs-content .card-title {
          font-size: 9px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.25);
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .docs-content .card-red ul, .docs-content .card-green ul {
          margin: 0;
          padding-left: 14px;
          font-size: 10px;
        }

        .docs-content .card-red li {
          color: rgba(255, 255, 255, 0.35);
          margin-bottom: 4px;
        }

        .docs-content .card-green li {
          color: rgba(255, 255, 255, 0.45);
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
          border-radius: 2px;
          padding: 20px 16px;
          text-align: center;
        }

        .docs-content .feature-icon {
          color: rgba(255, 255, 255, 0.30);
          margin-bottom: 12px;
          display: flex;
          justify-content: center;
        }

        .docs-content .feature-title {
          font-size: 11px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.60);
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .docs-content .feature-desc {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.30);
          line-height: 1.6;
        }

        .docs-content .highlight-box {
          background: rgba(255, 255, 255, 0.02);
          border-left: 2px solid rgba(255, 255, 255, 0.12);
          padding: 12px 16px;
          margin: 20px 0;
          border-radius: 0;
        }

        .docs-content .highlight-box p {
          margin: 0;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.60);
        }

        .docs-content .closing {
          margin-top: 28px;
          color: rgba(255, 255, 255, 0.35);
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
