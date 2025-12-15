import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Menu, X } from 'lucide-react';

function NeedPowerDoc() {
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
        'world-of-need',
        'world-of-power',
        'why-neither-sees',
        'bi-vision',
        'dual-perception'
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
                <button
                  onClick={() => navigate('/docs/initiation')}
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
                  Your Initiation
                </button>
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
                    Need & Power
                  </button>
                </div>
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
                Mystico Operator Doctrine
              </div>
              <h1 className="text-5xl font-bold mb-6 relative z-10" style={{ color: '#E5E5E5', lineHeight: '1.15' }}>
                The Two Worlds
              </h1>
              <p className="text-2xl relative z-10" style={{ color: '#A1A1A1', lineHeight: '1.3' }}>
                Need & Power — And Why You Stand Between Them
              </p>
            </div>

            <div style={{ lineHeight: '1.35', letterSpacing: '0.1px' }}>
              <section id="introduction" className="mb-16">
                <div style={{ color: 'rgba(255, 255, 255, 0.88)', fontSize: '15px' }}>
                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>In business, there are only two kinds of people:</p>

                  <ul className="list-disc pl-6 space-y-2" style={{ marginBottom: '16px' }}>
                    <li>People who need something</li>
                    <li>People who decide things</li>
                  </ul>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    Once you understand these two worlds, everything becomes easier.<br />
                    (It's how I made $182,585 last month working only ~4h a day)
                  </p>
                </div>
              </section>

              <section id="world-of-need" className="mb-16">
                <h2 className="text-3xl font-bold pb-3 mb-3" style={{
                  color: '#E5E5E5',
                  marginTop: '32px',
                  borderBottom: '0.7px solid transparent',
                  borderImage: 'linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(70,130,255,0.3) 50%, rgba(255,255,255,0.12) 100%) 1'
                }}>
                  I. The World of Need
                </h2>
                <div style={{ color: 'rgba(255, 255, 255, 0.88)', fontSize: '15px' }}>
                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>Service providers, creators, agencies, freelancers.</p>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>This world is full of people who are always looking for help.</p>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>They think:</p>

                  <div className="pl-[14px] border-l-2 my-6" style={{ borderColor: '#1A1A1A', fontSize: '15px', color: 'rgba(255, 255, 255, 0.8)' }}>
                    <p style={{ marginBottom: '8px' }}>"I need clients."</p>
                    <p style={{ marginBottom: '8px' }}>"I need money."</p>
                    <p>"I need someone to say yes."</p>
                  </div>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>They wake up scared they won't make enough this month.</p>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    I used to be here too — trying everything, working hard, but not getting far.<br />
                    Most people stay stuck in this world for years.
                  </p>
                </div>
              </section>

              <section id="world-of-power" className="mb-16">
                <h2 className="text-3xl font-bold pb-3 mb-3" style={{
                  color: '#E5E5E5',
                  marginTop: '32px',
                  borderBottom: '0.7px solid transparent',
                  borderImage: 'linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(70,130,255,0.3) 50%, rgba(255,255,255,0.12) 100%) 1'
                }}>
                  II. The World of Power
                </h2>
                <div style={{ color: 'rgba(255, 255, 255, 0.88)', fontSize: '15px' }}>
                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>Buyers, owners, executives, people with budgets.</p>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>These people think very differently.</p>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>They don't wake up wanting more offers.</p>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>They think:</p>

                  <div className="pl-[14px] border-l-2 my-6" style={{ borderColor: '#1A1A1A', fontSize: '15px', color: 'rgba(255, 255, 255, 0.8)' }}>
                    <p style={{ marginBottom: '8px' }}>"I need to fix this problem fast."</p>
                    <p style={{ marginBottom: '8px' }}>"I need someone I can trust."</p>
                    <p>"I don't want to waste time."</p>
                  </div>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    They get hundreds of emails.<br />
                    Too many people trying to sell them things.
                  </p>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    So they don't need more choices —<br />
                    they need the right person.
                  </p>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    One clear introduction can save them weeks.<br />
                    (This is why people happily pay me $10K–$25K just for making the right connection.)
                  </p>
                </div>
              </section>

              <section id="why-neither-sees" className="mb-16">
                <h2 className="text-3xl font-bold pb-3 mb-3" style={{
                  color: '#E5E5E5',
                  marginTop: '32px',
                  borderBottom: '0.7px solid transparent',
                  borderImage: 'linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(70,130,255,0.3) 50%, rgba(255,255,255,0.12) 100%) 1'
                }}>
                  III. Why Neither World Sees the Other Clearly
                </h2>
                <div style={{ color: 'rgba(255, 255, 255, 0.88)', fontSize: '15px' }}>
                  <h3 className="font-bold mb-3" style={{ color: '#E5E5E5', marginTop: '20px', fontSize: '23px' }}>
                    The world of Need can't see Power clearly
                  </h3>

                  <p style={{ marginBottom: '10px' }}>
                    They think buyers want long stories.<br />
                    They think buyers want fancy websites.<br />
                    They think buyers have time.
                  </p>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    But buyers only want one thing:<br />
                    "Can you solve my problem fast?"
                  </p>

                  <h3 className="font-bold mb-3" style={{ color: '#E5E5E5', marginTop: '20px', fontSize: '23px' }}>
                    The world of Power can't see Need clearly
                  </h3>

                  <p style={{ marginBottom: '10px' }}>
                    They think all service providers are the same.<br />
                    They can't tell who's skilled or who's just loud.
                  </p>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    Both sides misunderstand each other.<br />
                    And that's why nothing happens.
                  </p>
                </div>
              </section>

              <section id="bi-vision" className="mb-16">
                <h2 className="text-3xl font-bold pb-3 mb-3" style={{
                  color: '#E5E5E5',
                  marginTop: '32px',
                  borderBottom: '0.7px solid transparent',
                  borderImage: 'linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(70,130,255,0.3) 50%, rgba(255,255,255,0.12) 100%) 1'
                }}>
                  IV. Why Only the Operator Has Bi-Vision
                </h2>
                <div style={{ color: 'rgba(255, 255, 255, 0.88)', fontSize: '15px' }}>
                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>The Operator can see both sides at the same time.</p>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>He knows:</p>

                  <ul className="list-disc pl-6 space-y-2" style={{ marginBottom: '16px' }}>
                    <li>What the buyer urgently needs</li>
                    <li>What the provider can actually deliver</li>
                    <li>Who needs who, right now</li>
                    <li>And when to connect them</li>
                  </ul>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    This is called bi-vision —<br />
                    two kinds of sight at once.
                  </p>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    It's the reason I close deals without "selling."<br />
                    It's why I can make more than most agencies with only a few clients.<br />
                    It's why last month alone I brought in $182K+ without pressure.
                  </p>

                  <p className="font-semibold" style={{ color: '#E5E5E5', marginBottom: '16px' }}>Because the Operator sees things others don't.</p>
                </div>
              </section>

              <section id="dual-perception" className="mb-16">
                <h2 className="text-3xl font-bold pb-3 mb-3" style={{
                  color: '#E5E5E5',
                  marginTop: '32px',
                  borderBottom: '0.7px solid transparent',
                  borderImage: 'linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(70,130,255,0.3) 50%, rgba(255,255,255,0.12) 100%) 1'
                }}>
                  V. The Law of Dual Perception
                </h2>
                <div style={{ color: 'rgba(255, 255, 255, 0.88)', fontSize: '15px' }}>
                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>When you can see both worlds clearly, you become extremely valuable.</p>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>Dual perception means:</p>

                  <ul className="list-disc pl-6 space-y-2" style={{ marginBottom: '16px' }}>
                    <li>You understand the buyer's stress</li>
                    <li>You understand the provider's skills</li>
                    <li>You see the gap between them</li>
                    <li>And you bridge it</li>
                  </ul>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>This is the Operator's job:</p>

                  <div className="pl-[14px] border-l-2 my-6" style={{ borderColor: '#1A1A1A', fontSize: '15px', color: 'rgba(255, 255, 255, 0.8)' }}>
                    <p className="font-semibold" style={{ color: '#E5E5E5' }}>
                      To stand in the place the two worlds can't see…<br />
                      and connect them.
                    </p>
                  </div>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    Buyers trust you because you save them time.<br />
                    Providers trust you because you bring them work.<br />
                    You don't belong to either side.<br />
                    You move between both.
                  </p>

                  <p className="text-lg font-semibold" style={{ color: '#E5E5E5', marginTop: '32px' }}>
                    And that's why the model works —<br />
                    quietly, cleanly, and powerfully, and allowed me to take care of my family, live my best life making $2M/year working ~4h/day.
                  </p>
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
                { id: 'world-of-need', label: 'The World of Need' },
                { id: 'world-of-power', label: 'The World of Power' },
                { id: 'why-neither-sees', label: 'Why Neither Sees Clearly' },
                { id: 'bi-vision', label: 'Bi-Vision' },
                { id: 'dual-perception', label: 'The Law of Dual Perception' }
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

export default NeedPowerDoc;
