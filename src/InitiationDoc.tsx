import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Menu, X } from 'lucide-react';

function InitiationDoc() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const sections = [
        'introduction',
        'operator-principles',
        'dual-path',
        'forthinking',
        'mystic-knowing',
        'equilibrium',
        'note-from-saad'
      ];

      for (const section of sections) {
        const element = document.getElementById(section);
        if (element) {
          const rect = element.getBoundingClientRect();
          if (rect.top <= 100 && rect.bottom >= 100) {
            setActiveSection(section);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const top = element.getBoundingClientRect().top + window.pageYOffset - 80;
      window.scrollTo({ top, behavior: 'smooth' });
    }
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-black text-white" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style>{`
        html {
          scroll-behavior: smooth;
          scroll-padding-top: 100px;
        }

        @media (prefers-reduced-motion: no-preference) {
          html {
            scroll-behavior: smooth;
          }
        }

        h1, h2, h3, h4 {
          scroll-margin-top: 90px;
        }

        h1, h2 {
          letter-spacing: 0.3px;
        }
      `}</style>
      <div className="fixed top-0 left-0 right-0 h-16 bg-black border-b z-40" style={{ borderColor: '#1A1A1A' }}>
        <div className="h-full px-6 flex items-center justify-between max-w-[1800px] mx-auto">
          <button
            onClick={() => navigate('/library')}
            className="flex items-center gap-2 text-sm transition-colors"
            style={{ color: '#A1A1A1' }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#E5E5E5'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#A1A1A1'}
          >
            <ChevronLeft size={18} />
            <span>Back to Library</span>
          </button>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden"
            style={{ color: '#A1A1A1' }}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      <div className="flex max-w-[1800px] mx-auto pt-16">
        <aside
          className={`fixed lg:sticky top-16 left-0 h-[calc(100vh-4rem)] w-64 border-r overflow-y-auto z-30 bg-black transition-transform lg:translate-x-0 ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          style={{
            borderColor: '#1A1A1A',
            boxShadow: 'inset -2px 0 6px rgba(0, 0, 0, 0.5)'
          }}
        >
          <nav className="p-6">
            <div className="mb-6">
              <div className="text-xs font-semibold uppercase mb-3" style={{ color: '#666', letterSpacing: '0.2px' }}>
                Mental Models
              </div>
              <div className="space-y-0">
                <div className="relative">
                  <div
                    className="absolute left-0 top-0 bottom-0 w-[2px]"
                    style={{ backgroundColor: '#2AAAF9' }}
                  />
                  <button
                    onClick={() => scrollToSection('introduction')}
                    className="block w-full text-left transition-colors"
                    style={{
                      fontSize: '14px',
                      fontWeight: 300,
                      paddingTop: '6px',
                      paddingBottom: '6px',
                      paddingLeft: '12px',
                      color: '#E5E5E5',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
                    }}
                  >
                    Your Initiation
                  </button>
                </div>
                <button
                  onClick={() => navigate('/docs/need-power')}
                  className="block w-full text-left transition-colors"
                  style={{
                    fontSize: '14px',
                    fontWeight: 300,
                    paddingTop: '6px',
                    paddingBottom: '6px',
                    color: '#A1A1A1',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'rgba(111, 175, 246, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#A1A1A1';
                  }}
                >
                  Need & Power
                </button>
              </div>
            </div>
          </nav>
        </aside>

        <main className="flex-1 min-w-0">
          <article className="px-6 lg:px-[52px] py-16 mx-auto" style={{ maxWidth: '760px' }}>
            <div className="mb-8 relative" style={{ paddingTop: '24px' }}>
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'radial-gradient(circle at 50% 0%, rgba(50, 120, 255, 0.06) 0%, transparent 52%)',
                  width: '100%',
                  height: '180px',
                  top: '-20px'
                }}
              />
              <div
                className="inline-block px-3 py-1 rounded-full text-[11px] font-semibold uppercase mb-6 relative z-10"
                style={{
                  color: '#2AAAF9',
                  backgroundColor: 'rgba(42, 170, 249, 0.1)',
                  border: '1px solid rgba(42, 170, 249, 0.2)',
                  letterSpacing: '0.2px'
                }}
              >
                Mystico Operator Prologue
              </div>
              <h1 className="text-5xl font-bold mb-6 relative z-10" style={{ color: '#E5E5E5', lineHeight: '1.15' }}>
                🔱 Your Initiation
              </h1>
            </div>

            <div style={{ lineHeight: '1.35', letterSpacing: '0.1px' }}>
              <section id="introduction" className="mb-16">
                <h2 className="text-3xl font-bold pb-3 mb-3" style={{
                  color: '#E5E5E5',
                  marginTop: '32px',
                  borderBottom: '0.7px solid transparent',
                  borderImage: 'linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(70,130,255,0.3) 50%, rgba(255,255,255,0.12) 100%) 1'
                }}>
                  Introduction
                </h2>
                <div style={{ color: 'rgba(255, 255, 255, 0.88)', fontSize: '15px' }}>
                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>Hey reader…<br />or should I say — <em>operator</em>?</p>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    Before you learn the Connector model,<br />
                    before you understand dealflow, demand, signals, matching—<br />
                    before you step into the architecture of <em>who needs who</em>…
                  </p>

                  <p className="font-semibold" style={{ color: '#E5E5E5', marginBottom: '16px' }}>
                    You must first understand your place in the cosmos.
                  </p>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>And here's the truth nobody ever told you:</p>

                  <div className="pl-[14px] border-l-2 my-6" style={{ borderColor: '#1A1A1A', fontSize: '15px', color: 'rgba(255, 255, 255, 0.8)' }}>
                    <p className="font-semibold text-lg" style={{ color: '#E5E5E5' }}>
                      You are the Axis Mundi.<br />
                      The pillar between worlds.<br />
                      The midpoint where all forces intersect.
                    </p>
                  </div>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>Most people live on one side or the other:</p>

                  <ul className="list-disc pl-6 space-y-2" style={{ marginBottom: '16px' }}>
                    <li>those who need work</li>
                    <li>and those who give work</li>
                  </ul>

                  <p className="font-semibold" style={{ color: '#E5E5E5', marginBottom: '16px' }}>
                    You belong to neither.<br />
                    You stand in the center.
                  </p>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    You are the mountain at the heart of the world —<br />
                    the still point where both currents converge.
                  </p>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>Because you are not <em>in</em> the market.<br />You are <em>above</em> it.</p>

                  <div className="bg-black rounded-lg p-6 my-6" style={{ border: '1px solid #1A1A1A' }}>
                    <p className="mb-3">The seeker is blind because he craves.</p>
                    <p className="mb-3">The buyer is blind because he protects.</p>
                    <p className="font-semibold" style={{ color: '#E5E5E5' }}>
                      The operator sees both, because he stands between them.
                    </p>
                  </div>

                  <p className="text-lg font-semibold" style={{ color: '#E5E5E5', marginTop: '32px', marginBottom: '16px' }}>This is the first transformation.</p>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    Before you write a single line of connector copy,<br />
                    Before you build any system,<br />
                    Before you close a single deal…
                  </p>

                  <p className="font-semibold" style={{ color: '#E5E5E5', marginBottom: '16px' }}>You must accept:</p>

                  <div className="text-center my-6 text-lg font-semibold italic" style={{
                    color: '#5BCBFF',
                    letterSpacing: '0.4px',
                    textShadow: '0 0 12px rgba(80, 180, 255, 0.28)',
                    transform: 'skewX(-3deg)',
                    lineHeight: '1.8'
                  }}>
                    <p style={{ marginBottom: '4px' }}>You are the axis.</p>
                    <p style={{ marginBottom: '4px' }}>You are the bridge.</p>
                    <p>You are the center through which the flow moves.</p>
                  </div>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    Only then does the doctrine open.<br />
                    Only then does the market reveal its symbolic language.
                  </p>

                  <p className="text-lg font-semibold" style={{ color: '#E5E5E5', marginTop: '32px' }}>
                    Welcome, operator.<br />
                    Step onto the mountain.<br />
                    This is where the doctrine begins.
                  </p>
                </div>
              </section>

              <section id="operator-principles" className="mb-16">
                <h2 className="text-3xl font-bold pb-3 mb-3" style={{
                  color: '#E5E5E5',
                  marginTop: '32px',
                  borderBottom: '0.7px solid transparent',
                  borderImage: 'linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(70,130,255,0.3) 50%, rgba(255,255,255,0.12) 100%) 1'
                }}>
                  Operator Principles
                </h2>
                <div style={{ color: 'rgba(255, 255, 255, 0.88)', fontSize: '15px' }}>
                  <p className="text-lg font-semibold" style={{ color: 'rgba(255, 255, 255, 0.92)', marginBottom: '16px' }}>
                    An operator is not made.<br />
                    He is remembered.
                  </p>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>He blends two forms of knowing:</p>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    <strong style={{ color: '#E5E5E5' }}>Forthinking</strong> — the cold, Mungerian logic that sees consequences before they appear.
                  </p>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    <strong style={{ color: '#E5E5E5' }}>Mystic Knowing</strong> — the silent intelligence within you, carried long before you had words for it.
                  </p>

                  <div className="bg-black rounded-lg p-6 my-6" style={{ border: '1px solid #1A1A1A' }}>
                    <p className="font-semibold mb-3" style={{ color: '#E5E5E5' }}>If you're reading this now, it means one thing:</p>
                    <p>
                      You didn't stumble into this.<br />
                      You walked into it consciously.
                    </p>
                  </div>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    Every person carries an inner pattern —<br />
                    a blueprint beneath personality,<br />
                    a destiny beneath career,<br />
                    an architecture beneath choices.
                  </p>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    Most never meet it.<br />
                    But you did.
                  </p>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>You found the edge of yourself — and stepped through.</p>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    And that's why this doctrine resonates.<br />
                    It's not teaching you something new.<br />
                    It's reminding you of something ancient.
                  </p>

                  <div className="pl-[14px] border-l-2 my-6" style={{ borderColor: '#1A1A1A', fontSize: '15px', color: 'rgba(255, 255, 255, 0.8)' }}>
                    <p className="font-semibold" style={{ color: '#E5E5E5' }}>
                      Operators don't learn the flow —<br />
                      they recognize it.
                    </p>
                  </div>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    The skill was dormant.<br />
                    The perception sleeping.<br />
                    The pattern waiting.
                  </p>

                  <p className="font-semibold" style={{ color: '#E5E5E5', marginBottom: '16px' }}>
                    Now it stirs.<br />
                    Now it wakes.<br />
                    Now it speaks.
                  </p>

                  <p className="text-lg font-semibold" style={{ color: '#E5E5E5', marginTop: '32px' }}>
                    You're not <em>becoming</em> an operator.<br />
                    You're <em>returning</em> to the one you were meant to be.
                  </p>
                </div>
              </section>

              <section id="dual-path" className="mb-16">
                <h2 className="text-3xl font-bold pb-3 mb-3" style={{
                  color: '#E5E5E5',
                  marginTop: '32px',
                  borderBottom: '0.7px solid transparent',
                  borderImage: 'linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(70,130,255,0.3) 50%, rgba(255,255,255,0.12) 100%) 1'
                }}>
                  The Dual Path of the Operator
                </h2>
                <div style={{ color: 'rgba(255, 255, 255, 0.88)', fontSize: '15px' }}>
                  <p style={{ marginBottom: '10px' }}>Every operator walks with two forces inside him:</p>

                  <ul className="list-disc pl-6 space-y-2" style={{ marginBottom: '10px' }}>
                    <li>the cold clarity of foresight</li>
                    <li>the mystic certainty of inner vision</li>
                  </ul>

                  <div className="text-center my-6 space-y-2">
                    <p>Without one, he is blind.</p>
                    <p>Without the other, he is powerless.</p>
                    <p className="font-semibold text-lg" style={{ color: '#E5E5E5' }}>With both, he becomes inevitable.</p>
                  </div>
                </div>
              </section>

              <section id="forthinking" className="mb-16">
                <h3 className="font-bold mb-3" style={{ color: '#E5E5E5', marginTop: '20px', fontSize: '23px' }}>
                  I. Forthinking — The Rational Blade
                </h3>
                <div style={{ color: 'rgba(255, 255, 255, 0.88)', fontSize: '15px' }}>
                  <p style={{ marginBottom: '10px' }}>
                    Forthinking is the operator's mental arsenal —<br />
                    the inner blade that cuts through illusion.
                  </p>

                  <p className="font-semibold" style={{ color: '#E5E5E5', marginTop: '32px', marginBottom: '10px' }}>It includes:</p>

                  <div className="space-y-6" style={{ marginTop: '10px' }}>
                    <div>
                      <h4 className="text-lg font-semibold mb-3" style={{ color: '#E5E5E5' }}>1. First-Principle Thinking</h4>
                      <p>
                        Strip problems to the bone.<br />
                        No assumptions.<br />
                        No borrowed beliefs.<br />
                        Only truth.
                      </p>
                    </div>

                    <div>
                      <h4 className="text-lg font-semibold mb-3" style={{ color: '#E5E5E5' }}>2. Inversion</h4>
                      <p>
                        The question isn't <em>How do I win?</em><br />
                        It's <em>How do I avoid losing?</em>
                      </p>
                      <p className="mt-3">Remove failure → success emerges.</p>
                    </div>

                    <div>
                      <h4 className="text-lg font-semibold mb-3" style={{ color: '#E5E5E5' }}>3. Confirmation Bias Awareness</h4>
                      <p>
                        The operator interrogates his own mind.<br />
                        He assumes he is the one most capable of deceiving himself.
                      </p>
                    </div>

                    <div>
                      <h4 className="text-lg font-semibold mb-3" style={{ color: '#E5E5E5' }}>4. Antifragile Blitzscaling</h4>
                      <p>
                        Chaos sharpens him.<br />
                        Pressure feeds him.<br />
                        Volatility expands him.
                      </p>
                      <p className="mt-3 italic">Like fire — stronger in the wind.</p>
                    </div>

                    <div>
                      <h4 className="text-lg font-semibold mb-3" style={{ color: '#E5E5E5' }}>5. Long-Term Vision</h4>
                      <p>
                        He plants seeds he may never harvest.<br />
                        He thinks in decades, not days.
                      </p>
                    </div>

                    <div>
                      <h4 className="text-lg font-semibold mb-3" style={{ color: '#E5E5E5' }}>6. Infinite-Player Mentality</h4>
                      <p>
                        He plays to keep playing, not to "win once."<br />
                        His competition burns out.<br />
                        He compounds.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section id="mystic-knowing" className="mb-16">
                <h3 className="font-bold mb-3" style={{ color: '#E5E5E5', marginTop: '20px', fontSize: '23px' }}>
                  II. Mystic Knowing — The Inner Oracle
                </h3>
                <div style={{ color: 'rgba(255, 255, 255, 0.88)', fontSize: '15px' }}>
                  <p style={{ marginBottom: '10px' }}>
                    If forthinking is the blade,<br />
                    mystic knowing is the breath.
                  </p>

                  <p style={{ marginBottom: '10px' }}>
                    This is the operator's intuitive intelligence —<br />
                    the one that speaks from beyond time.
                  </p>

                  <p style={{ marginBottom: '10px' }}>
                    Here, he doesn't hope.<br />
                    He doesn't fantasize.<br />
                    He inhabits the future.
                  </p>

                  <div className="bg-black rounded-lg p-6 my-6" style={{ border: '1px solid #1A1A1A' }}>
                    <p className="mb-3">
                      He imagines a state —<br />
                      then moves into it internally<br />
                      until it becomes inevitable externally.
                    </p>
                  </div>

                  <p className="italic" style={{ marginBottom: '10px' }}>Neville Goddard once wrote:</p>

                  <div className="pl-[14px] border-l-2 my-6" style={{ borderColor: '#1A1A1A', fontSize: '15px', color: 'rgba(255, 255, 255, 0.8)' }}>
                    <p className="italic" style={{ color: '#E5E5E5' }}>
                      "Assume the feeling of the wish fulfilled,<br />
                      and it will harden into fact."
                    </p>
                  </div>

                  <p style={{ marginBottom: '10px' }}>The operator uses this as inner alchemy:</p>

                  <ol className="list-decimal pl-6 space-y-2 my-6">
                    <li>form the image</li>
                    <li>breathe life into it</li>
                    <li>live inside it</li>
                    <li>let the nervous system adapt</li>
                    <li>let the world reorganize accordingly</li>
                  </ol>

                  <p className="font-semibold text-lg" style={{ color: '#E5E5E5', marginTop: '32px' }}>
                    Mystic knowing is identity crystallized ahead of time.
                  </p>
                </div>
              </section>

              <section id="equilibrium" className="mb-16">
                <h3 className="font-bold mb-3" style={{ color: '#E5E5E5', marginTop: '20px', fontSize: '23px' }}>
                  III. The Equilibrium — The Operator's Axis
                </h3>
                <div style={{ color: 'rgba(255, 255, 255, 0.88)', fontSize: '15px' }}>
                  <p style={{ marginBottom: '10px' }}>
                    The operator is the Axis Mundi —<br />
                    the midpoint where logic and mysticism merge.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
                    <div className="p-4 rounded-lg" style={{ backgroundColor: 'rgba(42, 170, 249, 0.05)', border: '1px solid #1A1A1A' }}>
                      <p className="font-semibold mb-2" style={{ color: 'rgba(78, 182, 255, 0.92)' }}>Forthinking</p>
                      <p className="text-sm">gives him discipline.</p>
                    </div>
                    <div className="p-4 rounded-lg" style={{ backgroundColor: 'rgba(42, 170, 249, 0.05)', border: '1px solid #1A1A1A' }}>
                      <p className="font-semibold mb-2" style={{ color: 'rgba(78, 182, 255, 0.92)' }}>Mystic Knowing</p>
                      <p className="text-sm">gives him destiny.</p>
                    </div>
                  </div>

                  <p className="font-semibold" style={{ color: '#E5E5E5', marginTop: '32px', marginBottom: '10px' }}>When both are integrated:</p>

                  <ul className="list-disc pl-6 space-y-2" style={{ marginBottom: '10px' }}>
                    <li>his logic becomes prophetic</li>
                    <li>his intuition becomes structured</li>
                    <li>his vision becomes executable</li>
                    <li>his strategy becomes inevitable</li>
                  </ul>

                  <div className="text-center my-6 p-6 rounded-lg" style={{ backgroundColor: 'rgba(42, 170, 249, 0.05)', border: '1px solid #1A1A1A' }}>
                    <p className="mb-2">The world calls it luck.</p>
                    <p className="font-semibold text-lg" style={{ color: '#E5E5E5' }}>He knows it as alignment.</p>
                  </div>
                </div>
              </section>

              <section id="note-from-saad" className="mb-16">
                <h2 className="text-3xl font-bold pb-3 mb-3" style={{
                  color: '#E5E5E5',
                  marginTop: '32px',
                  borderBottom: '0.7px solid transparent',
                  borderImage: 'linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(70,130,255,0.3) 50%, rgba(255,255,255,0.12) 100%) 1'
                }}>
                  Note from Saad
                </h2>
                <div style={{ color: 'rgba(255, 255, 255, 0.88)', fontSize: '15px' }}>
                  <p style={{ marginBottom: '10px' }}>
                    You'll go through life winning in ways others don't understand —<br />
                    not because you hide it,<br />
                    but because they expect explanations instead of patterns.
                  </p>

                  <p style={{ marginBottom: '10px' }}>
                    Operators think in images, not instructions.<br />
                    In signals, not sentences.
                  </p>

                  <p style={{ marginBottom: '10px' }}>
                    If you're reading this…<br />
                    you finally have language for something you've always felt.
                  </p>

                  <div className="pt-6 border-t" style={{ borderColor: '#1A1A1A', marginTop: '32px' }}>
                    <p className="italic" style={{ marginBottom: '10px' }}>
                      I speak in images by nature.<br />
                      But I've tried my best to translate my world into yours.
                    </p>
                    <p className="mt-4 font-semibold" style={{ color: '#E5E5E5' }}>— Writer</p>
                  </div>
                </div>
              </section>
            </div>
          </article>
        </main>

        <aside className="hidden xl:block sticky top-16 h-[calc(100vh-4rem)] border-l overflow-y-auto" style={{
          borderColor: '#1A1A1A',
          width: '244px',
          maskImage: 'linear-gradient(to bottom, black calc(100% - 40px), transparent 100%)'
        }}>
          <nav className="p-6">
            <div className="text-xs font-semibold uppercase mb-4" style={{ color: '#666', letterSpacing: '0.2px' }}>
              On This Page
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { id: 'introduction', label: 'Introduction' },
                { id: 'operator-principles', label: 'Operator Principles' },
                { id: 'dual-path', label: 'The Dual Path' },
                { id: 'forthinking', label: 'Forthinking' },
                { id: 'mystic-knowing', label: 'Mystic Knowing' },
                { id: 'equilibrium', label: 'The Equilibrium' },
                { id: 'note-from-saad', label: 'Note from Saad' }
              ].map(section => (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className="block w-full text-left transition-colors"
                  style={{
                    fontSize: '12.5px',
                    lineHeight: '1.33',
                    color: activeSection === section.id ? '#2AAAF9' : '#666',
                    fontWeight: activeSection === section.id ? 500 : 400
                  }}
                >
                  {section.label}
                </button>
              ))}
            </div>
          </nav>
        </aside>
      </div>
    </div>
  );
}

export default InitiationDoc;
