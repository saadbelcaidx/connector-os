import { useState, useEffect } from 'react';
import { ArrowLeft, Briefcase, TrendingUp, AlertTriangle, Users, Zap, Target, Loader2, Radio } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Dock from './Dock';

interface ProviderInputs {
  servicesDelivered: string[];
  idealClient: string;
  averageDealSize: number;
  geographyServed: string;
  capacity: number;
  nicheExpertise: string[];
  apiKey: string;
}

interface SignalData {
  value: string;
  isLive: boolean;
  lastUpdated?: string;
}

interface SignalsState {
  jobs: SignalData;
  funding: SignalData;
  layoffs: SignalData;
  hiringVelocity: SignalData;
  toolAdoption: SignalData;
  loading: boolean;
  error: string | null;
}

const serviceOptions = [
  'SaaS Implementation',
  'Sales Ops',
  'RevOps',
  'Cybersecurity',
  'Cloud Migration',
  'AI/ML Integration',
  'DevOps',
  'Data Engineering',
];

const nicheOptions = [
  'FinTech',
  'HealthTech',
  'Climate Tech',
  'B2B SaaS',
  'Enterprise',
  'SMB',
  'E-commerce',
  'MarTech',
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function InputField({
  label,
  value,
  onChange,
  isDollar = false,
  placeholder = '',
}: {
  label: string;
  value: string | number;
  onChange: (val: string | number) => void;
  isDollar?: boolean;
  placeholder?: string;
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isDollar) {
      const rawValue = e.target.value.replace(/,/g, '');
      const numericValue = Number(rawValue);
      if (!isNaN(numericValue)) {
        onChange(numericValue);
      }
    } else {
      onChange(e.target.value);
    }
  };

  return (
    <div className="mb-3.5">
      <label className="flex items-center text-[13px] font-normal text-white text-opacity-65 mb-1.5">
        {label}
      </label>
      <div className="relative">
        {isDollar && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white text-[15px]">$</span>
        )}
        <input
          type="text"
          value={isDollar ? new Intl.NumberFormat('en-US').format(value as number) : value}
          onChange={handleChange}
          placeholder={placeholder}
          className={`w-full h-[38px] bg-[#0F0F0F] text-white text-[15px] ${isDollar ? 'pl-7' : 'pl-3'} pr-3 rounded-lg border border-[#1C1C1C] hover:border-[#262626] focus:border-[#3A9CFF] focus:outline-none transition-all duration-150`}
        />
      </div>
    </div>
  );
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (val: string[]) => void;
}) {
  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter(s => s !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  return (
    <div className="mb-3.5">
      <label className="flex items-center text-[13px] font-normal text-white text-opacity-65 mb-1.5">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map(option => (
          <button
            key={option}
            onClick={() => toggleOption(option)}
            className={`px-3 py-1.5 text-[12px] rounded-lg transition-all duration-150 ${
              selected.includes(option)
                ? 'bg-[#3A9CFF] bg-opacity-20 text-[#3A9CFF] border border-[#3A9CFF]'
                : 'bg-[#0F0F0F] text-white text-opacity-60 border border-[#1C1C1C] hover:border-[#262626]'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function SignalBlock({
  icon: Icon,
  label,
  value,
  isLive,
  loading
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  isLive: boolean;
  loading?: boolean;
}) {
  return (
    <div
      className="flex items-start gap-3 p-3 rounded-lg mb-2 relative"
      style={{
        background: 'rgba(14, 165, 233, 0.04)',
        border: '1px solid rgba(14, 165, 233, 0.15)',
      }}
    >
      <div
        className="p-1.5 rounded"
        style={{
          background: 'rgba(14, 165, 233, 0.12)',
        }}
      >
        {loading ? (
          <Loader2 size={14} style={{ color: '#3A9CFF', strokeWidth: 2 }} className="animate-spin" />
        ) : (
          <Icon size={14} style={{ color: '#3A9CFF', strokeWidth: 2 }} />
        )}
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-0.5">
          <div className="text-[11px] text-white text-opacity-50 uppercase tracking-wide">{label}</div>
          {isLive ? (
            <div className="flex items-center gap-1">
              <Radio size={8} style={{ color: '#26F7C7' }} />
              <span className="text-[9px] text-[#26F7C7] uppercase tracking-wider font-semibold">Live</span>
            </div>
          ) : (
            <span className="text-[9px] text-white text-opacity-30 uppercase tracking-wider">Mock</span>
          )}
        </div>
        <div className="text-[13px] text-white text-opacity-85">{value}</div>
      </div>
    </div>
  );
}

function OutputRow({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[#1C1C1C] last:border-0">
      <span className="text-[13px] text-white text-opacity-60">{label}</span>
      <span className={`text-[14px] font-medium ${highlight ? 'text-[#26F7C7]' : 'text-white text-opacity-90'}`}>
        {value}
      </span>
    </div>
  );
}

function MatchingEngine() {
  const navigate = useNavigate();

  const [provider, setProvider] = useState<ProviderInputs>({
    servicesDelivered: ['SaaS Implementation', 'Sales Ops'],
    idealClient: 'Series A/B SaaS companies scaling GTM',
    averageDealSize: 75000,
    geographyServed: 'North America',
    capacity: 3,
    nicheExpertise: ['B2B SaaS', 'FinTech'],
    apiKey: '',
  });

  const [signals, setSignals] = useState<SignalsState>({
    jobs: {
      value: '241 new roles in SaaS sales this week',
      isLive: false,
    },
    funding: {
      value: '17 Series A/B raises in past 10 days',
      isLive: false,
    },
    layoffs: {
      value: '3,200 layoffs across tech/security',
      isLive: false,
    },
    hiringVelocity: {
      value: '↑ 22% in climate tech this month',
      isLive: false,
    },
    toolAdoption: {
      value: 'HubSpot → Salesforce migrations up 11%',
      isLive: false,
    },
    loading: false,
    error: null,
  });

  // TODO: Integrate real EXA API for web-wide signal intelligence
  // TODO: Integrate PDL (People Data Labs) for hiring signals
  // TODO: Integrate Apollo.io for company signals and funding data
  // TODO: Integrate Layoffs.fyi API or Warn Tracker for layoff signals
  // TODO: Add G2/Capterra API for tool adoption trends
  // TODO: Add dealflow timeline visualization (graph)

  const fetchSignals = async (apiKey: string) => {
    if (!apiKey || apiKey.trim() === '') {
      return;
    }

    setSignals(prev => ({ ...prev, loading: true, error: null }));

    try {
      const endpoints = {
        jobs: 'https://api.example.com/signals/jobs',
        funding: 'https://api.example.com/signals/funding',
        layoffs: 'https://api.example.com/signals/layoffs',
        hiringVelocity: 'https://api.example.com/signals/hiring-velocity',
        toolAdoption: 'https://api.example.com/signals/tool-adoption',
      };

      const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };

      const [jobsRes, fundingRes, layoffsRes, hiringRes, toolRes] = await Promise.allSettled([
        fetch(endpoints.jobs, { headers }),
        fetch(endpoints.funding, { headers }),
        fetch(endpoints.layoffs, { headers }),
        fetch(endpoints.hiringVelocity, { headers }),
        fetch(endpoints.toolAdoption, { headers }),
      ]);

      const newSignals: Partial<SignalsState> = {};

      if (jobsRes.status === 'fulfilled' && jobsRes.value.ok) {
        const data = await jobsRes.value.json();
        newSignals.jobs = {
          value: data.summary || data.value,
          isLive: true,
          lastUpdated: new Date().toISOString(),
        };
      }

      if (fundingRes.status === 'fulfilled' && fundingRes.value.ok) {
        const data = await fundingRes.value.json();
        newSignals.funding = {
          value: data.summary || data.value,
          isLive: true,
          lastUpdated: new Date().toISOString(),
        };
      }

      if (layoffsRes.status === 'fulfilled' && layoffsRes.value.ok) {
        const data = await layoffsRes.value.json();
        newSignals.layoffs = {
          value: data.summary || data.value,
          isLive: true,
          lastUpdated: new Date().toISOString(),
        };
      }

      if (hiringRes.status === 'fulfilled' && hiringRes.value.ok) {
        const data = await hiringRes.value.json();
        newSignals.hiringVelocity = {
          value: data.summary || data.value,
          isLive: true,
          lastUpdated: new Date().toISOString(),
        };
      }

      if (toolRes.status === 'fulfilled' && toolRes.value.ok) {
        const data = await toolRes.value.json();
        newSignals.toolAdoption = {
          value: data.summary || data.value,
          isLive: true,
          lastUpdated: new Date().toISOString(),
        };
      }

      setSignals(prev => ({
        ...prev,
        ...newSignals,
        loading: false,
      }));
    } catch (error) {
      setSignals(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch signals',
      }));
    }
  };

  useEffect(() => {
    if (provider.apiKey && provider.apiKey.trim() !== '') {
      const debounceTimer = setTimeout(() => {
        fetchSignals(provider.apiKey);
      }, 500);

      return () => clearTimeout(debounceTimer);
    }
  }, [provider.apiKey]);

  const calculateMatching = () => {
    const windowStatus = provider.capacity > 0 ? 'OPEN' : 'CLOSED';
    const dealValueEstimate = provider.averageDealSize * 1.1;
    const probabilityOfClose = 62;
    const exactAngle = 'Pressure-based introduction';
    const introTemplate = `Hey {{buyer}}, saw you're scaling {{signal}}. Just connected with someone who built exactly this system at [comparable co]. They're taking on 1-2 more — window's tight. Worth 20 minutes?`;
    const suggestedTimeline = 'Reach out within 48 hours';
    const whoHasPressure = 'Series A SaaS companies hiring 5+ GTM roles in Q1';
    const whoCanSolve = provider.idealClient || 'Provider matching your profile';

    return {
      windowStatus,
      dealValueEstimate,
      probabilityOfClose,
      exactAngle,
      introTemplate,
      suggestedTimeline,
      whoHasPressure,
      whoCanSolve,
    };
  };

  const result = calculateMatching();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0E0E0E] to-[#0A0A0A] text-white px-8 py-12">
      <div className="max-w-[1400px] mx-auto">
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
          <h1 className="text-[32px] font-medium text-white mb-1.5">Matching Engine V2</h1>
          <p className="text-[17px] font-light text-white text-opacity-75">Who has pressure. Who can solve it. When to move.</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mt-8">
          <div>
            <div
              className="bg-[#0C0C0C] rounded-[10px] p-5 border border-[#1C1C1C] transition-all duration-150 hover:scale-[1.005]"
              style={{
                boxShadow: '0 0 8px rgba(14, 165, 233, 0.08)',
              }}
            >
              <div className="flex items-center gap-2 mb-5 pb-3 border-b border-[#3A9CFF] border-opacity-20">
                <Briefcase size={18} style={{ color: '#3A9CFF', strokeWidth: 1.5 }} />
                <h3 className="text-[13px] font-normal text-[#3A9CFF] text-opacity-80 uppercase tracking-[0.15em]">
                  Provider Capabilities
                </h3>
              </div>

              <InputField
                label="Signals API Key"
                value={provider.apiKey}
                onChange={(val) => setProvider({ ...provider, apiKey: val as string })}
                placeholder="Enter your signals API key"
              />

              <div className="mb-4 pb-4 border-b border-[#1C1C1C]">
                <div className="text-[11px] text-white text-opacity-40 italic">
                  Add your API key to enable live market signals. Using mock data until configured.
                </div>
              </div>

              <MultiSelect
                label="Services Delivered"
                options={serviceOptions}
                selected={provider.servicesDelivered}
                onChange={(val) => setProvider({ ...provider, servicesDelivered: val })}
              />

              <InputField
                label="Ideal Client Type"
                value={provider.idealClient}
                onChange={(val) => setProvider({ ...provider, idealClient: val as string })}
                placeholder="e.g., Series A SaaS companies"
              />

              <InputField
                label="Average Deal Size"
                value={provider.averageDealSize}
                onChange={(val) => setProvider({ ...provider, averageDealSize: val as number })}
                isDollar={true}
              />

              <InputField
                label="Geography Served"
                value={provider.geographyServed}
                onChange={(val) => setProvider({ ...provider, geographyServed: val as string })}
                placeholder="e.g., North America, EMEA"
              />

              <InputField
                label="Capacity (# of clients)"
                value={provider.capacity}
                onChange={(val) => setProvider({ ...provider, capacity: Number(val) || 0 })}
              />

              <MultiSelect
                label="Niche Expertise"
                options={nicheOptions}
                selected={provider.nicheExpertise}
                onChange={(val) => setProvider({ ...provider, nicheExpertise: val })}
              />
            </div>
          </div>

          <div>
            <div
              className="bg-[#0C0C0C] rounded-[10px] p-5 border border-[#1C1C1C] transition-all duration-150 relative"
              style={{
                boxShadow: '0 0 12px rgba(14, 165, 233, 0.12)',
              }}
            >
              <div
                className="absolute inset-0 rounded-[10px] pointer-events-none"
                style={{
                  background: 'radial-gradient(circle at 50% 50%, rgba(14, 165, 233, 0.06) 0%, transparent 70%)',
                }}
              />

              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-5 pb-3 border-b border-[#3A9CFF] border-opacity-20">
                  <Target size={18} style={{ color: '#3A9CFF', strokeWidth: 1.5 }} />
                  <h3 className="text-[13px] font-normal text-[#3A9CFF] text-opacity-80 uppercase tracking-[0.15em]">
                    Market Signals
                  </h3>
                </div>

                {signals.error && (
                  <div className="mb-4 p-3 bg-red-500 bg-opacity-10 border border-red-500 rounded-lg">
                    <div className="text-[11px] text-red-400">{signals.error}</div>
                  </div>
                )}

                <div className="text-[11px] text-white text-opacity-40 mb-4 italic">
                  {provider.apiKey ? 'Live signal ingestion active' : 'Using mock data. Add API key to enable live signals.'}
                </div>

                <SignalBlock
                  icon={Users}
                  label="Job Postings"
                  value={signals.jobs.value}
                  isLive={signals.jobs.isLive}
                  loading={signals.loading}
                />

                <SignalBlock
                  icon={TrendingUp}
                  label="Funding Events"
                  value={signals.funding.value}
                  isLive={signals.funding.isLive}
                  loading={signals.loading}
                />

                <SignalBlock
                  icon={AlertTriangle}
                  label="Layoffs"
                  value={signals.layoffs.value}
                  isLive={signals.layoffs.isLive}
                  loading={signals.loading}
                />

                <SignalBlock
                  icon={Zap}
                  label="Hiring Velocity"
                  value={signals.hiringVelocity.value}
                  isLive={signals.hiringVelocity.isLive}
                  loading={signals.loading}
                />

                <SignalBlock
                  icon={Briefcase}
                  label="Tool Adoption"
                  value={signals.toolAdoption.value}
                  isLive={signals.toolAdoption.isLive}
                  loading={signals.loading}
                />
              </div>
            </div>
          </div>

          <div>
            <div
              className="bg-[#0C0C0C] rounded-[10px] p-5 border border-[#1C1C1C] transition-all duration-150 hover:scale-[1.005]"
              style={{
                boxShadow: '0 0 8px rgba(14, 165, 233, 0.08)',
              }}
            >
              <div className="flex items-center gap-2 mb-5 pb-3 border-b border-[#26F7C7] border-opacity-20">
                <div
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{
                    background: '#26F7C7',
                    boxShadow: '0 0 8px rgba(38, 247, 199, 0.4)',
                  }}
                />
                <h3 className="text-[13px] font-normal text-[#26F7C7] text-opacity-80 uppercase tracking-[0.15em]">
                  Matching Engine Result
                </h3>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="text-[11px] text-white text-opacity-50 uppercase tracking-wide mb-2">Who has pressure</div>
                  <div className="text-[13px] text-white text-opacity-85 bg-[#0F0F0F] p-3 rounded-lg border border-[#1C1C1C]">
                    {result.whoHasPressure}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-white text-opacity-50 uppercase tracking-wide mb-2">Who can solve it</div>
                  <div className="text-[13px] text-white text-opacity-85 bg-[#0F0F0F] p-3 rounded-lg border border-[#1C1C1C]">
                    {result.whoCanSolve}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] text-white text-opacity-50 uppercase tracking-wide mb-2">Window Status</div>
                    <div
                      className={`text-[14px] font-bold p-2 rounded-lg text-center ${
                        result.windowStatus === 'OPEN'
                          ? 'bg-[#26F7C7] bg-opacity-10 text-[#26F7C7] border border-[#26F7C7]'
                          : 'bg-red-500 bg-opacity-10 text-red-400 border border-red-500'
                      }`}
                    >
                      {result.windowStatus}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] text-white text-opacity-50 uppercase tracking-wide mb-2">Probability</div>
                    <div className="text-[14px] font-bold p-2 rounded-lg text-center bg-[#3A9CFF] bg-opacity-10 text-[#3A9CFF] border border-[#3A9CFF]">
                      {result.probabilityOfClose}%
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#1C1C1C]">
                  <OutputRow label="Deal Value Estimate" value={formatCurrency(result.dealValueEstimate)} highlight />
                  <OutputRow label="Exact Connector Angle" value={result.exactAngle} />
                  <OutputRow label="Suggested Timeline" value={result.suggestedTimeline} />
                </div>

                <div>
                  <div className="text-[11px] text-white text-opacity-50 uppercase tracking-wide mb-2">Intro Template</div>
                  <textarea
                    readOnly
                    value={result.introTemplate}
                    className="w-full h-24 bg-[#0F0F0F] text-white text-[13px] p-3 rounded-lg border border-[#1C1C1C] focus:border-[#3A9CFF] focus:outline-none transition-all duration-150 resize-none"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <div className="text-[11px] text-white text-opacity-40 italic">
            V2 with API ingestion framework. Signals update dynamically with valid API key.
          </div>
        </div>
      </div>

      <div className="fixed bottom-6 right-6 text-[11px] text-white opacity-60 font-light">
        Matching Engine V2 • Connector OS
      </div>

      <Dock />
    </div>
  );
}

export default MatchingEngine;
