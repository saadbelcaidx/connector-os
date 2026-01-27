import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check, ChevronRight, ArrowRight, Database, Search, Mail, Sparkles,
  ExternalLink, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, X,
  Zap, Target, Users, Send, Trophy
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { useAuth } from './AuthContext';

// =============================================================================
// TYPES
// =============================================================================

interface StepStatus {
  dataSource: 'pending' | 'complete' | 'error';
  enrichment: 'pending' | 'complete' | 'error';
  outreach: 'pending' | 'complete' | 'error';
  ai: 'pending' | 'complete' | 'skipped';
}

interface OnboardingData {
  // Data Sources
  apifyToken: string;
  demandDatasetId: string;
  supplyDatasetId: string;
  // Enrichment
  enrichmentApiKey: string;
  anymailFinderApiKey: string;
  // Outreach
  instantlyApiKey: string;
  instantlyCampaignDemand: string;
  instantlyCampaignSupply: string;
  // AI
  aiProvider: 'openai' | 'azure' | 'anthropic';
  aiOpenaiApiKey: string;
  aiAzureApiKey: string;
  aiAzureEndpoint: string;
  aiAnthropicApiKey: string;
}

const INITIAL_DATA: OnboardingData = {
  apifyToken: '',
  demandDatasetId: '',
  supplyDatasetId: '',
  enrichmentApiKey: '',
  anymailFinderApiKey: '',
  instantlyApiKey: '',
  instantlyCampaignDemand: '',
  instantlyCampaignSupply: '',
  aiProvider: 'openai',
  aiOpenaiApiKey: '',
  aiAzureApiKey: '',
  aiAzureEndpoint: '',
  aiAnthropicApiKey: '',
};

// =============================================================================
// STEP COMPONENTS
// =============================================================================

const steps = [
  {
    id: 'welcome',
    title: 'Welcome',
    icon: Zap,
    description: 'Get set up in 5 minutes'
  },
  {
    id: 'dataSource',
    title: 'Data Sources',
    icon: Database,
    description: 'Where your signals come from'
  },
  {
    id: 'enrichment',
    title: 'Enrichment',
    icon: Search,
    description: 'Find decision-makers'
  },
  {
    id: 'outreach',
    title: 'Outreach',
    icon: Mail,
    description: 'Send your intros'
  },
  {
    id: 'ai',
    title: 'Personalization',
    icon: Sparkles,
    description: 'For custom intros'
  },
  {
    id: 'complete',
    title: 'Ready',
    icon: Trophy,
    description: "You're all set"
  },
];

// Password input component - Linear style
function PasswordInput({
  value,
  onChange,
  placeholder,
  className = ''
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full h-10 px-3 pr-10 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-white/[0.15] transition-colors ${className}`}
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 transition-colors"
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

// Input field component - Linear style
function InputField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  type = 'text',
  link,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: 'text' | 'password';
  link?: { text: string; url: string };
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[12px] font-medium text-white/70">{label}</div>
          {hint && <div className="text-[11px] text-white/35 mt-0.5">{hint}</div>}
        </div>
        {link && (
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-white/40 hover:text-white/60 transition-colors"
          >
            {link.text}
            <ExternalLink size={9} />
          </a>
        )}
      </div>
      {type === 'password' ? (
        <PasswordInput value={value} onChange={onChange} placeholder={placeholder} />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full h-10 px-3 rounded-lg bg-white/[0.03] border border-white/[0.08] text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-white/[0.15] transition-colors"
        />
      )}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function OnboardingWizard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<OnboardingData>(INITIAL_DATA);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);

  // Load existing settings on mount
  useEffect(() => {
    const loadExisting = async () => {
      if (!user?.id) {
        setLoadingExisting(false);
        return;
      }

      try {
        const { data: settings } = await supabase
          .from('operator_settings')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (settings) {
          setData({
            apifyToken: settings.apify_token || '',
            demandDatasetId: settings.demand_dataset_id || '',
            supplyDatasetId: settings.supply_dataset_id || '',
            enrichmentApiKey: settings.enrichment_api_key || '',
            anymailFinderApiKey: settings.anymail_finder_api_key || '',
            instantlyApiKey: settings.instantly_api_key || '',
            instantlyCampaignDemand: settings.instantly_campaign_demand || '',
            instantlyCampaignSupply: settings.instantly_campaign_supply || '',
            aiProvider: settings.ai_provider || 'openai',
            aiOpenaiApiKey: settings.ai_openai_api_key || '',
            aiAzureApiKey: settings.ai_azure_api_key || '',
            aiAzureEndpoint: settings.ai_azure_endpoint || '',
            aiAnthropicApiKey: settings.ai_anthropic_api_key || '',
          });

          // Don't auto-redirect - let users access setup even if configured
        }
      } catch (err) {
        console.error('Error loading settings:', err);
      } finally {
        setLoadingExisting(false);
      }
    };

    loadExisting();
  }, [user?.id, navigate]);

  // Save settings to database
  const saveSettings = async () => {
    if (!user?.id) return;

    setSaving(true);
    setError(null);

    try {
      const settingsData = {
        user_id: user.id,
        apify_token: data.apifyToken,
        demand_dataset_id: data.demandDatasetId,
        supply_dataset_id: data.supplyDatasetId,
        enrichment_api_key: data.enrichmentApiKey,
        anymail_finder_api_key: data.anymailFinderApiKey,
        instantly_api_key: data.instantlyApiKey,
        instantly_campaign_demand: data.instantlyCampaignDemand,
        instantly_campaign_supply: data.instantlyCampaignSupply,
        ai_provider: data.aiProvider,
        ai_openai_api_key: data.aiOpenaiApiKey,
        ai_azure_api_key: data.aiAzureApiKey,
        ai_azure_endpoint: data.aiAzureEndpoint,
        ai_anthropic_api_key: data.aiAnthropicApiKey,
        updated_at: new Date().toISOString(),
      };

      const { error: upsertError } = await supabase
        .from('operator_settings')
        .upsert(settingsData, { onConflict: 'user_id' });

      if (upsertError) throw upsertError;
    } catch (err) {
      console.error('Error saving settings:', err);
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Navigation helpers
  const nextStep = async () => {
    await saveSettings();
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const skipStep = async () => {
    await saveSettings();
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const finish = async () => {
    await saveSettings();
    navigate('/launcher');
  };

  // Check if current step is valid
  const isStepValid = () => {
    switch (steps[currentStep].id) {
      case 'welcome':
        return true;
      case 'dataSource':
        return true; // CSV upload happens in Settings after setup
      case 'enrichment':
        return data.enrichmentApiKey;
      case 'outreach':
        return data.instantlyApiKey && data.instantlyCampaignDemand;
      case 'ai':
        return true; // Optional
      case 'complete':
        return true;
      default:
        return true;
    }
  };

  // Loading state
  if (loadingExisting) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
      </div>
    );
  }

  // =============================================================================
  // RENDER STEPS
  // =============================================================================

  const renderStepContent = () => {
    switch (steps[currentStep].id) {
      case 'welcome':
        return (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-6">
              <Zap className="w-8 h-8 text-white/60" />
            </div>
            <h2 className="text-[24px] font-semibold text-white/90 mb-2">Welcome to Connector OS</h2>
            <p className="text-[14px] text-white/40 max-w-md mx-auto mb-8">
              Let's get you set up. This takes about 5 minutes.
            </p>

            <div className="grid grid-cols-4 gap-3 max-w-lg mx-auto mb-8">
              {[
                { icon: Database, label: 'Data', desc: 'CSV' },
                { icon: Search, label: 'Enrich', desc: 'Apollo' },
                { icon: Mail, label: 'Send', desc: 'Instantly' },
                { icon: Sparkles, label: 'Personal', desc: 'Optional' },
              ].map((item, i) => (
                <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <item.icon className="w-4 h-4 text-white/30 mx-auto mb-2" />
                  <div className="text-[11px] font-medium text-white/60">{item.label}</div>
                  <div className="text-[10px] text-white/30">{item.desc}</div>
                </div>
              ))}
            </div>

            <p className="text-[12px] text-white/30">
              Already set up?{' '}
              <button
                onClick={() => navigate('/settings')}
                className="text-white/50 hover:text-white/70 transition-colors"
              >
                Go to Settings
              </button>
            </p>
          </div>
        );

      case 'dataSource':
        return (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                <Database className="w-4 h-4 text-white/50" />
              </div>
              <div>
                <h2 className="text-[18px] font-semibold text-white/90">Data Sources</h2>
                <p className="text-[12px] text-white/40">Upload your CSV files</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] mb-6">
              <p className="text-[13px] text-white/50 m-0">
                <strong className="text-white/70">CSV format:</strong> Your files need these columns: <code className="text-white/60">Full Name, Company Name, Domain, Email, Context, Signal</code>
              </p>
              <div className="flex gap-3 mt-3">
                <a
                  href="/csv-template-demand.csv"
                  download
                  className="inline-flex items-center gap-1 text-[11px] text-white/40 hover:text-white/60 transition-colors"
                >
                  Download demand template <ExternalLink size={10} />
                </a>
                <a
                  href="/csv-template-supply.csv"
                  download
                  className="inline-flex items-center gap-1 text-[11px] text-white/40 hover:text-white/60 transition-colors"
                >
                  Download supply template <ExternalLink size={10} />
                </a>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div className="text-[12px] font-medium text-white/70 mb-1">Demand CSV</div>
                <div className="text-[11px] text-white/35 mb-3">Companies with needs (hiring, funding, expanding)</div>
                <p className="text-[12px] text-white/50">
                  Upload in <strong className="text-white/70">Settings → Data Sources</strong> after setup.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div className="text-[12px] font-medium text-white/70 mb-1">Supply CSV</div>
                <div className="text-[11px] text-white/35 mb-3">Providers who can help (recruiters, agencies, consultants)</div>
                <p className="text-[12px] text-white/50">
                  Upload in <strong className="text-white/70">Settings → Data Sources</strong> after setup.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] mt-6">
              <p className="text-[11px] text-white/40 m-0">
                <strong className="text-white/50">Signal column:</strong> The timing trigger — "Hiring 5 engineers", "Series B funding", "Needs deal flow"
              </p>
            </div>
          </div>
        );

      case 'enrichment':
        return (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                <Search className="w-4 h-4 text-white/50" />
              </div>
              <div>
                <h2 className="text-[18px] font-semibold text-white/90">Enrichment</h2>
                <p className="text-[12px] text-white/40">Find decision-maker emails</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] mb-6">
              <p className="text-[13px] text-white/50 m-0">
                <strong className="text-white/70">What is enrichment?</strong> When you see a company signal, you need to find WHO to contact. Apollo looks up emails for decision-makers.
              </p>
              <a
                href="https://apollo.io"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-white/40 hover:text-white/60 mt-2 transition-colors"
              >
                Create Apollo account <ExternalLink size={10} />
              </a>
            </div>

            <InputField
              label="Apollo API Key"
              hint="Found in Apollo → Settings → API Keys"
              value={data.enrichmentApiKey}
              onChange={(v) => setData({ ...data, enrichmentApiKey: v })}
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
              type="password"
              link={{ text: 'Get API key', url: 'https://app.apollo.io/#/settings/integrations/api' }}
            />

            <div className="pt-4 border-t border-white/[0.04]">
              <div className="text-[10px] text-white/30 uppercase tracking-wider mb-4">Fallback (Optional)</div>
              <InputField
                label="Anymail Finder API Key"
                hint="Backup email finder if Apollo misses"
                value={data.anymailFinderApiKey}
                onChange={(v) => setData({ ...data, anymailFinderApiKey: v })}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                type="password"
                link={{ text: 'Get API key', url: 'https://anymailfinder.com/api' }}
              />
            </div>
          </div>
        );

      case 'outreach':
        return (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                <Mail className="w-4 h-4 text-white/50" />
              </div>
              <div>
                <h2 className="text-[18px] font-semibold text-white/90">Outreach</h2>
                <p className="text-[12px] text-white/40">Send emails via Instantly</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] mb-6">
              <p className="text-[13px] text-white/50 m-0">
                <strong className="text-white/70">What is Instantly?</strong> It sends your intro emails. You'll need two campaigns: one for demand (companies) and one for supply (providers).
              </p>
              <a
                href="https://instantly.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-white/40 hover:text-white/60 mt-2 transition-colors"
              >
                Create Instantly account <ExternalLink size={10} />
              </a>
            </div>

            <InputField
              label="Instantly API Key"
              hint="Found in Instantly → Settings → API"
              value={data.instantlyApiKey}
              onChange={(v) => setData({ ...data, instantlyApiKey: v })}
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
              type="password"
              link={{ text: 'Get API key', url: 'https://app.instantly.ai/app/settings/integrations' }}
            />

            <div className="grid grid-cols-2 gap-4">
              <InputField
                label="Demand Campaign ID"
                hint="For companies that need help"
                value={data.instantlyCampaignDemand}
                onChange={(v) => setData({ ...data, instantlyCampaignDemand: v })}
                placeholder="campaign-uuid"
              />
              <InputField
                label="Supply Campaign ID"
                hint="For service providers"
                value={data.instantlyCampaignSupply}
                onChange={(v) => setData({ ...data, instantlyCampaignSupply: v })}
                placeholder="campaign-uuid"
              />
            </div>

            <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] mt-4">
              <p className="text-[11px] text-white/40 m-0">
                <strong className="text-white/50">Tip:</strong> Create two campaigns in Instantly first, then copy their IDs here.
              </p>
            </div>
          </div>
        );

      case 'ai':
        return (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white/50" />
              </div>
              <div>
                <h2 className="text-[18px] font-semibold text-white/90">Personalization</h2>
                <p className="text-[12px] text-white/40">Required for custom intros</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] mb-6">
              <p className="text-[13px] text-white/50 m-0">
                <strong className="text-white/70">Why?</strong> The system writes personalized intro messages based on the signal instead of generic templates.
              </p>
            </div>

            <div className="mb-6">
              <div className="text-[12px] font-medium text-white/60 mb-3">Choose Provider</div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'openai', label: 'OpenAI', desc: 'GPT-4o' },
                  { id: 'azure', label: 'Azure', desc: 'OpenAI' },
                  { id: 'anthropic', label: 'Claude', desc: 'Anthropic' },
                ].map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => setData({ ...data, aiProvider: provider.id as OnboardingData['aiProvider'] })}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      data.aiProvider === provider.id
                        ? 'bg-white/[0.06] border-white/[0.15]'
                        : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.1]'
                    }`}
                  >
                    <div className={`text-[12px] font-medium ${data.aiProvider === provider.id ? 'text-white/90' : 'text-white/60'}`}>
                      {provider.label}
                    </div>
                    <div className="text-[10px] text-white/30">{provider.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {data.aiProvider === 'openai' && (
              <InputField
                label="OpenAI API Key"
                value={data.aiOpenaiApiKey}
                onChange={(v) => setData({ ...data, aiOpenaiApiKey: v })}
                placeholder="sk-..."
                type="password"
                link={{ text: 'Get key', url: 'https://platform.openai.com/api-keys' }}
              />
            )}

            {data.aiProvider === 'azure' && (
              <>
                <InputField
                  label="Azure OpenAI Endpoint"
                  value={data.aiAzureEndpoint}
                  onChange={(v) => setData({ ...data, aiAzureEndpoint: v })}
                  placeholder="https://your-resource.openai.azure.com"
                />
                <InputField
                  label="Azure API Key"
                  value={data.aiAzureApiKey}
                  onChange={(v) => setData({ ...data, aiAzureApiKey: v })}
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
                  type="password"
                />
              </>
            )}

            {data.aiProvider === 'anthropic' && (
              <InputField
                label="Anthropic API Key"
                value={data.aiAnthropicApiKey}
                onChange={(v) => setData({ ...data, aiAnthropicApiKey: v })}
                placeholder="sk-ant-..."
                type="password"
                link={{ text: 'Get key', url: 'https://console.anthropic.com/settings/keys' }}
              />
            )}
          </div>
        );

      case 'complete':
        return (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8 text-white/60" />
            </div>
            <h2 className="text-[24px] font-semibold text-white/90 mb-2">You're all set</h2>
            <p className="text-[14px] text-white/40 max-w-md mx-auto mb-8">
              Connector OS is configured and ready.
            </p>

            <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto mb-6">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <Check className="w-4 h-4 text-white/50 mx-auto mb-1.5" />
                <div className="text-[10px] text-white/40">Data</div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <Check className="w-4 h-4 text-white/50 mx-auto mb-1.5" />
                <div className="text-[10px] text-white/40">Enrichment</div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <Check className="w-4 h-4 text-white/50 mx-auto mb-1.5" />
                <div className="text-[10px] text-white/40">Outreach</div>
              </div>
            </div>

            {/* The Flow - what happens next */}
            <div className="max-w-sm mx-auto mb-8 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <p className="text-[10px] text-white/30 uppercase tracking-wider mb-4 text-center">The flow</p>
              <div className="flex items-center justify-between gap-1">
                {[
                  { step: '1', label: 'Load' },
                  { step: '2', label: 'Match' },
                  { step: '3', label: 'Enrich' },
                  { step: '4', label: 'Send' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-[11px] font-medium text-white/50">
                        {item.step}
                      </div>
                      <span className="text-[9px] text-white/40 mt-1">{item.label}</span>
                    </div>
                    {i < 3 && (
                      <div className="w-4 h-px bg-white/[0.1] mb-4" />
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-white/25 mt-4 text-center">Your datasets → matched → enriched → sent.</p>
            </div>

            <div className="flex flex-col items-center gap-3">
              <button
                onClick={finish}
                className="flex items-center gap-2 h-11 px-6 rounded-xl bg-white text-black font-medium text-[13px] hover:bg-white/90 transition-colors"
              >
                Open Connector OS
                <ArrowRight size={16} />
              </button>
              <button
                onClick={() => navigate('/settings')}
                className="text-[12px] text-white/30 hover:text-white/50 transition-colors"
              >
                Or go to Settings
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // =============================================================================
  // MAIN RENDER
  // =============================================================================

  return (
    <div className="min-h-screen bg-[#09090b] flex">
      {/* Sidebar - Progress (Linear style) */}
      <aside className="w-64 border-r border-white/[0.04] p-5 flex flex-col">
        <div className="flex items-center gap-2.5 mb-8">
          <img src="/image.png" alt="Connector OS" className="w-6 h-6 rounded-lg" />
          <span className="text-[14px] font-medium text-white/80">Setup</span>
        </div>

        <nav className="flex-1">
          {steps.map((step, index) => {
            const isActive = index === currentStep;
            const isComplete = index < currentStep;
            const StepIcon = step.icon;

            return (
              <button
                key={step.id}
                onClick={() => index <= currentStep && setCurrentStep(index)}
                disabled={index > currentStep}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 transition-all text-left ${
                  isActive
                    ? 'bg-white/[0.04]'
                    : isComplete
                    ? 'hover:bg-white/[0.02]'
                    : 'opacity-30 cursor-not-allowed'
                }`}
              >
                <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                  isComplete
                    ? 'bg-white/[0.06] text-white/60'
                    : isActive
                    ? 'bg-white/[0.06] text-white/80'
                    : 'bg-white/[0.03] text-white/30'
                }`}>
                  {isComplete ? <Check size={14} /> : <StepIcon size={14} />}
                </div>
                <div>
                  <div className={`text-[12px] font-medium ${isActive ? 'text-white/90' : isComplete ? 'text-white/60' : 'text-white/30'}`}>
                    {step.title}
                  </div>
                  <div className="text-[10px] text-white/25">{step.description}</div>
                </div>
              </button>
            );
          })}
        </nav>

        <div className="pt-4 border-t border-white/[0.04]">
          <button
            onClick={() => navigate('/launcher')}
            className="text-[11px] text-white/25 hover:text-white/40 transition-colors"
          >
            Skip setup for now
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-xl mx-auto px-8 py-12">
            {renderStepContent()}
          </div>
        </div>

        {/* Footer Navigation */}
        {steps[currentStep].id !== 'welcome' && steps[currentStep].id !== 'complete' && (
          <footer className="border-t border-white/[0.06] px-8 py-4">
            <div className="max-w-xl mx-auto flex items-center justify-between">
              <button
                onClick={prevStep}
                className="flex items-center gap-2 text-[13px] text-white/50 hover:text-white/80 transition-colors"
              >
                Back
              </button>

              <div className="flex items-center gap-3">
                {error && (
                  <span className="text-[12px] text-red-400 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {error}
                  </span>
                )}

                <button
                  onClick={nextStep}
                  disabled={!isStepValid() || saving}
                  className="flex items-center gap-2 h-10 px-5 rounded-lg bg-white text-black font-medium text-[13px] hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <>
                      Continue
                      <ChevronRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </footer>
        )}

        {/* Welcome footer */}
        {steps[currentStep].id === 'welcome' && (
          <footer className="border-t border-white/[0.06] px-8 py-4">
            <div className="max-w-xl mx-auto flex justify-end">
              <button
                onClick={nextStep}
                className="flex items-center gap-2 h-11 px-6 rounded-lg bg-white text-black font-medium text-[14px] hover:bg-white/90 transition-colors"
              >
                Let's go
                <ArrowRight size={18} />
              </button>
            </div>
          </footer>
        )}
      </main>
    </div>
  );
}
