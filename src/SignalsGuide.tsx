import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Menu, X } from 'lucide-react';

function SignalsGuide() {
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
        'what-signals-are',
        'why-own-apis',
        'where-to-get-apis',
        'how-to-setup',
        'what-os-expects',
        'starter-presets',
        'what-happens-after',
        'youre-done'
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
                Documentation
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
                    Signals & API Guide
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
                Operator OS Documentation
              </div>
              <h1 className="text-5xl font-bold mb-6 relative z-10" style={{ color: '#E5E5E5', lineHeight: '1.15' }}>
                How to use Connector Matching Engine
              </h1>
            </div>

            <div style={{ lineHeight: '1.35', letterSpacing: '0.1px' }}>
              <section id="introduction" className="mb-16">
                <div style={{ color: 'rgba(255, 255, 255, 0.88)', fontSize: '15px' }}>
                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    The Matching Engine works only when you give it signals.
                  </p>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    Signals are just information from the internet that tells the OS what companies are doing.
                  </p>

                  <p className="font-semibold" style={{ color: '#E5E5E5', marginBottom: '16px' }}>
                    This page teaches you how to set it up step by step.
                  </p>
                </div>
              </section>

              <section id="what-signals-are" className="mb-16">
                <h2 className="text-3xl font-bold pb-3 mb-3" style={{
                  color: '#E5E5E5',
                  marginTop: '32px',
                  borderBottom: '0.7px solid transparent',
                  borderImage: 'linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(70,130,255,0.3) 50%, rgba(255,255,255,0.12) 100%) 1'
                }}>
                  1. What Signals Are
                </h2>
                <div style={{ color: 'rgba(255, 255, 255, 0.88)', fontSize: '15px' }}>
                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    Signals tell the OS what's happening in a company.
                  </p>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    The OS uses 5 kinds:
                  </p>

                  <ul className="list-disc pl-6 space-y-2" style={{ marginBottom: '16px' }}>
                    <li><strong style={{ color: '#E5E5E5' }}>Job Postings</strong> – Are they hiring more people?</li>
                    <li><strong style={{ color: '#E5E5E5' }}>Funding</strong> – Did they raise money?</li>
                    <li><strong style={{ color: '#E5E5E5' }}>Layoffs</strong> – Did they let people go?</li>
                    <li><strong style={{ color: '#E5E5E5' }}>Hiring Speed</strong> – Are they hiring fast or slow?</li>
                    <li><strong style={{ color: '#E5E5E5' }}>Tools They Use</strong> – Did they add or remove software?</li>
                  </ul>

                  <p className="font-semibold" style={{ color: '#E5E5E5' }}>
                    More signals = smarter results.
                  </p>
                </div>
              </section>

              <section id="why-own-apis" className="mb-16">
                <h2 className="text-3xl font-bold pb-3 mb-3" style={{
                  color: '#E5E5E5',
                  marginTop: '32px',
                  borderBottom: '0.7px solid transparent',
                  borderImage: 'linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(70,130,255,0.3) 50%, rgba(255,255,255,0.12) 100%) 1'
                }}>
                  2. Why You Need Your Own APIs
                </h2>
                <div style={{ color: 'rgba(255, 255, 255, 0.88)', fontSize: '15px' }}>
                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    The OS does not provide data.<br />
                    You bring your own data sources (APIs).
                  </p>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    This is good because:
                  </p>

                  <ul className="list-disc pl-6 space-y-2" style={{ marginBottom: '16px' }}>
                    <li>You choose the data</li>
                    <li>You control the cost</li>
                    <li>Every user can customize their OS</li>
                    <li>The OS works with almost any API</li>
                  </ul>

                  <div className="bg-black rounded-lg p-6 my-6" style={{ border: '1px solid #1A1A1A' }}>
                    <p style={{ marginBottom: '10px', color: 'rgba(255, 255, 255, 0.92)' }}>
                      Think of it like the OS is a brain.
                    </p>
                    <p className="font-semibold" style={{ color: '#E5E5E5' }}>
                      You plug in the eyes.
                    </p>
                  </div>
                </div>
              </section>

              <section id="where-to-get-apis" className="mb-16">
                <h2 className="text-3xl font-bold pb-3 mb-3" style={{
                  color: '#E5E5E5',
                  marginTop: '32px',
                  borderBottom: '0.7px solid transparent',
                  borderImage: 'linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(70,130,255,0.3) 50%, rgba(255,255,255,0.12) 100%) 1'
                }}>
                  3. Where to Get APIs (Simple List)
                </h2>
                <div style={{ color: 'rgba(255, 255, 255, 0.88)', fontSize: '15px' }}>
                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    You only need a link (URL) that gives JSON data.
                  </p>

                  <div className="space-y-8" style={{ marginTop: '24px' }}>
                    <div>
                      <h3 className="font-bold mb-3" style={{ color: '#E5E5E5', fontSize: '19px' }}>
                        Job Posting APIs
                      </h3>
                      <ul className="list-disc pl-6 space-y-2" style={{ color: 'rgba(255, 255, 255, 0.88)' }}>
                        <li>Greenhouse</li>
                        <li>Ashby</li>
                        <li>Lever</li>
                        <li>Indeed API</li>
                        <li>RemoteOK</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="font-bold mb-3" style={{ color: '#E5E5E5', fontSize: '19px' }}>
                        Funding APIs
                      </h3>
                      <ul className="list-disc pl-6 space-y-2" style={{ color: 'rgba(255, 255, 255, 0.88)' }}>
                        <li>Crunchbase</li>
                        <li>Clearbit</li>
                        <li>Any funding-event API</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="font-bold mb-3" style={{ color: '#E5E5E5', fontSize: '19px' }}>
                        Layoff APIs
                      </h3>
                      <ul className="list-disc pl-6 space-y-2" style={{ color: 'rgba(255, 255, 255, 0.88)' }}>
                        <li>layoffs.fyi</li>
                        <li>Any news feed returning JSON</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="font-bold mb-3" style={{ color: '#E5E5E5', fontSize: '19px' }}>
                        Hiring Speed APIs
                      </h3>
                      <ul className="list-disc pl-6 space-y-2" style={{ color: 'rgba(255, 255, 255, 0.88)' }}>
                        <li>LinkedIn Talent Insights</li>
                        <li>Ashby</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="font-bold mb-3" style={{ color: '#E5E5E5', fontSize: '19px' }}>
                        Tech Stack APIs
                      </h3>
                      <ul className="list-disc pl-6 space-y-2" style={{ color: 'rgba(255, 255, 255, 0.88)' }}>
                        <li>BuiltWith</li>
                        <li>Wappalyzer</li>
                      </ul>
                    </div>
                  </div>

                  <p style={{ marginTop: '24px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    You can start with only one.
                  </p>
                </div>
              </section>

              <section id="how-to-setup" className="mb-16">
                <h2 className="text-3xl font-bold pb-3 mb-3" style={{
                  color: '#E5E5E5',
                  marginTop: '32px',
                  borderBottom: '0.7px solid transparent',
                  borderImage: 'linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(70,130,255,0.3) 50%, rgba(255,255,255,0.12) 100%) 1'
                }}>
                  4. How to Set It Up (Easy Steps)
                </h2>
                <div style={{ color: 'rgba(255, 255, 255, 0.88)', fontSize: '15px' }}>
                  <ol className="list-decimal pl-6 space-y-3" style={{ marginBottom: '16px' }}>
                    <li>Go to <strong style={{ color: '#E5E5E5' }}>Settings → API Endpoints</strong></li>
                    <li>Pick a signal you want to connect (Jobs, Funding, Layoffs, etc.)</li>
                    <li>Paste the API URL into the box</li>
                    <li>If the API needs a key, paste it into <strong style={{ color: '#E5E5E5' }}>Signals API Key</strong></li>
                    <li>Click <strong style={{ color: '#E5E5E5' }}>Save</strong></li>
                    <li>Go to <strong style={{ color: '#E5E5E5' }}>Matching Engine</strong> and look for the <span style={{ color: '#10B981' }}>LIVE</span> badge</li>
                  </ol>

                  <div className="bg-black rounded-lg p-6 my-6" style={{ border: '1px solid #1A1A1A' }}>
                    <p style={{ marginBottom: '10px', color: 'rgba(255, 255, 255, 0.92)' }}>
                      If you see <span className="font-semibold" style={{ color: '#10B981' }}>LIVE</span>, it's working.
                    </p>
                    <p style={{ color: 'rgba(255, 255, 255, 0.92)' }}>
                      If you see <span className="font-semibold" style={{ color: '#EAB308' }}>MOCK</span>, the OS is using sample data.
                    </p>
                  </div>
                </div>
              </section>

              <section id="what-os-expects" className="mb-16">
                <h2 className="text-3xl font-bold pb-3 mb-3" style={{
                  color: '#E5E5E5',
                  marginTop: '32px',
                  borderBottom: '0.7px solid transparent',
                  borderImage: 'linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(70,130,255,0.3) 50%, rgba(255,255,255,0.12) 100%) 1'
                }}>
                  5. What the OS Expects From Your API
                </h2>
                <div style={{ color: 'rgba(255, 255, 255, 0.88)', fontSize: '15px' }}>
                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    Your API only needs to return a simple JSON object.
                  </p>

                  <p style={{ marginBottom: '12px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    <strong style={{ color: '#E5E5E5' }}>Example 1:</strong>
                  </p>

                  <div className="bg-black rounded-lg p-4 my-6" style={{ border: '1px solid #1A1A1A' }}>
                    <pre className="text-sm" style={{ color: '#2AAAF9', fontFamily: 'monospace' }}>
{`{
  "summary": "240 new jobs posted this week"
}`}
                    </pre>
                  </div>

                  <p style={{ marginBottom: '12px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    <strong style={{ color: '#E5E5E5' }}>Example 2:</strong>
                  </p>

                  <div className="bg-black rounded-lg p-4 my-6" style={{ border: '1px solid #1A1A1A' }}>
                    <pre className="text-sm" style={{ color: '#2AAAF9', fontFamily: 'monospace' }}>
{`{
  "value": "Company raised $20M"
}`}
                    </pre>
                  </div>

                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    If your API uses different words, the OS still works.
                  </p>

                  <p style={{ marginBottom: '12px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    The OS looks for:
                  </p>

                  <ul className="list-disc pl-6 space-y-2" style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.88)' }}>
                    <li><code style={{ color: '#2AAAF9' }}>summary</code></li>
                    <li><code style={{ color: '#2AAAF9' }}>value</code></li>
                    <li><code style={{ color: '#2AAAF9' }}>message</code></li>
                  </ul>

                  <p style={{ color: 'rgba(255, 255, 255, 0.92)' }}>
                    If none exist, it uses fallback text.
                  </p>
                </div>
              </section>

              <section id="starter-presets" className="mb-16">
                <h2 className="text-3xl font-bold pb-3 mb-3" style={{
                  color: '#E5E5E5',
                  marginTop: '32px',
                  borderBottom: '0.7px solid transparent',
                  borderImage: 'linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(70,130,255,0.3) 50%, rgba(255,255,255,0.12) 100%) 1'
                }}>
                  6. Starter Presets (Use These If You're Lost)
                </h2>
                <div style={{ color: 'rgba(255, 255, 255, 0.88)', fontSize: '15px' }}>
                  <div className="space-y-6" style={{ marginTop: '24px' }}>
                    <div className="bg-black rounded-lg p-6" style={{ border: '1px solid #1A1A1A' }}>
                      <h3 className="font-bold mb-4" style={{ color: '#E5E5E5', fontSize: '19px' }}>
                        For SaaS Agencies
                      </h3>
                      <ul className="list-disc pl-6 space-y-2" style={{ color: 'rgba(255, 255, 255, 0.88)' }}>
                        <li>Jobs → Greenhouse</li>
                        <li>Funding → Crunchbase</li>
                        <li>Layoffs → layoffs.fyi</li>
                        <li>Tech → BuiltWith</li>
                      </ul>
                    </div>

                    <div className="bg-black rounded-lg p-6" style={{ border: '1px solid #1A1A1A' }}>
                      <h3 className="font-bold mb-4" style={{ color: '#E5E5E5', fontSize: '19px' }}>
                        For Logistics
                      </h3>
                      <ul className="list-disc pl-6 space-y-2" style={{ color: 'rgba(255, 255, 255, 0.88)' }}>
                        <li>Jobs → Indeed</li>
                        <li>Layoffs → news feeds</li>
                        <li>Funding → Crunchbase</li>
                      </ul>
                    </div>

                    <div className="bg-black rounded-lg p-6" style={{ border: '1px solid #1A1A1A' }}>
                      <h3 className="font-bold mb-4" style={{ color: '#E5E5E5', fontSize: '19px' }}>
                        For Biotech
                      </h3>
                      <ul className="list-disc pl-6 space-y-2" style={{ color: 'rgba(255, 255, 255, 0.88)' }}>
                        <li>Jobs → Workday</li>
                        <li>Funding → bio-funding APIs</li>
                        <li>Layoffs → industry feeds</li>
                      </ul>
                    </div>

                    <div className="bg-black rounded-lg p-6" style={{ border: '1px solid #1A1A1A' }}>
                      <h3 className="font-bold mb-4" style={{ color: '#E5E5E5', fontSize: '19px' }}>
                        For General Agencies
                      </h3>
                      <ul className="list-disc pl-6 space-y-2" style={{ color: 'rgba(255, 255, 255, 0.88)' }}>
                        <li>Jobs → Greenhouse</li>
                        <li>Funding → Crunchbase</li>
                        <li>Layoffs → layoffs.fyi</li>
                        <li>Tech → BuiltWith</li>
                      </ul>
                    </div>
                  </div>

                  <p style={{ marginTop: '24px', marginBottom: '10px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    Just choose one preset.
                  </p>
                  <p className="font-semibold" style={{ color: '#E5E5E5' }}>
                    You don't need all five.
                  </p>
                </div>
              </section>

              <section id="what-happens-after" className="mb-16">
                <h2 className="text-3xl font-bold pb-3 mb-3" style={{
                  color: '#E5E5E5',
                  marginTop: '32px',
                  borderBottom: '0.7px solid transparent',
                  borderImage: 'linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(70,130,255,0.3) 50%, rgba(255,255,255,0.12) 100%) 1'
                }}>
                  7. What Happens After Setup
                </h2>
                <div style={{ color: 'rgba(255, 255, 255, 0.88)', fontSize: '15px' }}>
                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    Once your APIs are connected, the OS will:
                  </p>

                  <ul className="list-disc pl-6 space-y-2" style={{ marginBottom: '16px' }}>
                    <li>Refresh signals every 15 minutes</li>
                    <li>Compute signal strength (0–100)</li>
                    <li>Show trends (rising, stable, falling)</li>
                    <li>Give you a simple explanation</li>
                    <li>Create alerts when something important happens</li>
                    <li>Suggest an intro angle for outreach</li>
                  </ul>

                  <p className="font-semibold" style={{ color: '#E5E5E5' }}>
                    Everything happens inside the Matching Engine.
                  </p>
                </div>
              </section>

              <section id="youre-done" className="mb-16">
                <h2 className="text-3xl font-bold pb-3 mb-3" style={{
                  color: '#E5E5E5',
                  marginTop: '32px',
                  borderBottom: '0.7px solid transparent',
                  borderImage: 'linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(70,130,255,0.3) 50%, rgba(255,255,255,0.12) 100%) 1'
                }}>
                  8. You're Done
                </h2>
                <div style={{ color: 'rgba(255, 255, 255, 0.88)', fontSize: '15px' }}>
                  <p style={{ marginBottom: '16px', color: 'rgba(255, 255, 255, 0.92)' }}>
                    You only:
                  </p>

                  <ol className="list-decimal pl-6 space-y-2" style={{ marginBottom: '16px' }}>
                    <li>Paste an API URL</li>
                    <li>Save</li>
                    <li>Watch the OS update automatically</li>
                  </ol>

                  <div className="text-center my-8 p-6 rounded-lg" style={{ backgroundColor: 'rgba(42, 170, 249, 0.05)', border: '1px solid #1A1A1A' }}>
                    <p className="text-lg font-semibold" style={{ color: '#E5E5E5' }}>
                      That's it. The Operator Radar is now live.
                    </p>
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
                { id: 'what-signals-are', label: 'What Signals Are' },
                { id: 'why-own-apis', label: 'Why Your Own APIs' },
                { id: 'where-to-get-apis', label: 'Where to Get APIs' },
                { id: 'how-to-setup', label: 'How to Set It Up' },
                { id: 'what-os-expects', label: 'What OS Expects' },
                { id: 'starter-presets', label: 'Starter Presets' },
                { id: 'what-happens-after', label: 'What Happens After' },
                { id: 'youre-done', label: "You're Done" }
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

export default SignalsGuide;
