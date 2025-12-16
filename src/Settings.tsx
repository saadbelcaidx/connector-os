import { useState, useEffect } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Dock from './Dock';
import { createClient } from '@supabase/supabase-js';
import type { ConnectorProfile } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface OperatorSettings {
  // Signal APIs - Demand
  jobsApiKey: string;
  jobsQueryUrl: string;  // Apify dataset URL for demand (jobs)
  // Signal APIs - Supply (NEW)
  supplyQueryUrl: string;  // Apify dataset URL for supply discovery
  // Signal APIs - Other
  fundingApiKey: string;
  fundingQueryUrl: string;
  layoffsApiKey: string;
  layoffsQueryUrl: string;
  hiringApiKey: string;
  hiringQueryUrl: string;
  techApiKey: string;
  techQueryUrl: string;
  // Contact & AI
  aiProvider: 'openai' | 'azure' | 'anthropic' | 'none';
  aiOpenaiApiKey: string;
  aiAzureApiKey: string;
  aiAzureEndpoint: string;
  aiAnthropicApiKey: string;
  enrichmentApiKey: string;
  // Work Owner Search
  workOwnerDepartments: string;
  workOwnerKeywords: string;
  // Delivery
  instantlyApiKey: string;
  instantlyCampaignDemand: string;
  instantlyCampaignSupply: string;
}

// Compact input component
function Input({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="text-[9px] uppercase tracking-wider text-white/40 mb-1 block">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full h-8 bg-black/40 text-white text-[11px] px-2.5 rounded-md border border-white/10 hover:border-white/20 focus:border-blue-500/50 focus:outline-none transition-colors ${mono ? 'font-mono' : ''}`}
      />
    </div>
  );
}

// Apify Signal Card - URL only, no API key needed
function ApifySignalCard({
  title,
  subtitle,
  datasetUrl,
  onUrlChange,
  urlPlaceholder,
  helpText,
}: {
  title: string;
  subtitle?: string;
  datasetUrl: string;
  onUrlChange: (val: string) => void;
  urlPlaceholder: string;
  helpText?: string;
}) {
  const isLive = !!datasetUrl;

  return (
    <div className="bg-[#111] rounded-lg border border-white/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-[11px] font-medium text-white/90">{title}</h2>
          <div className="text-[8px] text-white/30 mt-0.5">{subtitle || 'Apify Dataset'}</div>
        </div>
        <div className={`text-[8px] px-1.5 py-0.5 rounded ${
          isLive
            ? 'bg-white/[0.08] text-white/70'
            : 'bg-white/5 text-white/30'
        }`}>
          {isLive ? 'Ready' : 'Not Configured'}
        </div>
      </div>
      <div className="space-y-2">
        <Input
          label="Apify Dataset URL"
          value={datasetUrl}
          onChange={onUrlChange}
          placeholder={urlPlaceholder}
          mono
        />
        <div className="text-[8px] text-white/30 mt-1">
          {helpText || 'Works with any Apify scraper'}
        </div>
      </div>
    </div>
  );
}

// Signal card component
function SignalCard({
  title,
  provider,
  apiKey,
  queryUrl,
  onApiKeyChange,
  onQueryUrlChange,
  urlPlaceholder,
}: {
  title: string;
  provider: string;
  apiKey: string;
  queryUrl: string;
  onApiKeyChange: (val: string) => void;
  onQueryUrlChange: (val: string) => void;
  urlPlaceholder: string;
}) {
  const isLive = !!apiKey && !!queryUrl;
  const needsUrl = !!apiKey && !queryUrl;

  return (
    <div className="bg-[#111] rounded-lg border border-white/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-[11px] font-medium text-white/90">{title}</h2>
          <div className="text-[8px] text-white/30 mt-0.5">{provider}</div>
        </div>
        <div className={`text-[8px] px-1.5 py-0.5 rounded ${
          isLive
            ? 'bg-white/[0.08] text-white/70'
            : needsUrl
            ? 'bg-white/[0.06] text-white/50'
            : 'bg-white/5 text-white/30'
        }`}>
          {isLive ? 'Live' : needsUrl ? 'URL Required' : 'Not Configured'}
        </div>
      </div>
      <div className="space-y-2">
        <Input
          label="API Key"
          value={apiKey}
          onChange={onApiKeyChange}
          placeholder="Your API key"
          type="password"
        />
        <Input
          label="Query URL"
          value={queryUrl}
          onChange={onQueryUrlChange}
          placeholder={urlPlaceholder}
          mono
        />
      </div>
    </div>
  );
}

function Settings() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<OperatorSettings>({
    jobsApiKey: '',
    jobsQueryUrl: '',
    supplyQueryUrl: '',  // Supply discovery URL
    fundingApiKey: '',
    fundingQueryUrl: '',
    layoffsApiKey: '',
    layoffsQueryUrl: '',
    hiringApiKey: '',
    hiringQueryUrl: '',
    techApiKey: '',
    techQueryUrl: '',
    aiProvider: 'none' as const,
    aiOpenaiApiKey: '',
    aiAzureApiKey: '',
    aiAzureEndpoint: '',
    aiAnthropicApiKey: '',
    enrichmentApiKey: '',
    workOwnerDepartments: '',
    workOwnerKeywords: '',
    instantlyApiKey: '',
    instantlyCampaignDemand: '',
    instantlyCampaignSupply: '',
  });
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectorProfile, setConnectorProfile] = useState<ConnectorProfile>({
    full_name: '',
    email: '',
    company_name: '',
    services_offered: [],
    industries_served: [],
    solves_for_roles: [],
    pain_points_solved: [],
    ideal_company_size: '50-200',
    geography: []
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('operator_settings')
        .select('*')
        .eq('user_id', 'default')
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings({
          jobsApiKey: data.jobs_api_key || '',
          jobsQueryUrl: data.jobs_api_url || '',
          supplyQueryUrl: data.supply_api_url || '',
          fundingApiKey: data.funding_api_key || '',
          fundingQueryUrl: data.funding_api_url || '',
          layoffsApiKey: data.layoffs_api_key || '',
          layoffsQueryUrl: data.layoffs_api_url || '',
          hiringApiKey: data.hiring_api_key || '',
          hiringQueryUrl: data.hiring_api_url || '',
          techApiKey: data.tech_api_key || '',
          techQueryUrl: data.tech_api_url || '',
          aiProvider: data.ai_provider || 'none',
          aiOpenaiApiKey: data.ai_openai_api_key || '',
          aiAzureApiKey: data.ai_azure_api_key || '',
          aiAzureEndpoint: data.ai_azure_endpoint || '',
          aiAnthropicApiKey: data.ai_anthropic_api_key || '',
          enrichmentApiKey: data.enrichment_api_key || '',
          workOwnerDepartments: data.work_owner_departments || '',
          workOwnerKeywords: data.work_owner_keywords || '',
          instantlyApiKey: data.instantly_api_key || '',
          instantlyCampaignDemand: data.instantly_campaign_demand || '',
          instantlyCampaignSupply: data.instantly_campaign_supply || '',
        });

        const rawProfile = (data.connector_profile ?? {}) as Partial<ConnectorProfile>;
        setConnectorProfile({
          full_name: rawProfile.full_name ?? '',
          email: rawProfile.email ?? '',
          company_name: rawProfile.company_name ?? '',
          services_offered: rawProfile.services_offered ?? [],
          industries_served: rawProfile.industries_served ?? [],
          solves_for_roles: rawProfile.solves_for_roles ?? [],
          pain_points_solved: rawProfile.pain_points_solved ?? [],
          ideal_company_size: rawProfile.ideal_company_size ?? '50-200',
          geography: rawProfile.geography ?? []
        });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setError(null);

    try {
      const { error } = await supabase
        .from('operator_settings')
        .upsert(
          {
            user_id: 'default',
            // Jobs (Demand)
            jobs_api_key: settings.jobsApiKey,
            jobs_api_url: settings.jobsQueryUrl,
            // Supply Discovery
            supply_api_url: settings.supplyQueryUrl,
            // Funding
            funding_api_key: settings.fundingApiKey,
            funding_api_url: settings.fundingQueryUrl,
            // Layoffs
            layoffs_api_key: settings.layoffsApiKey,
            layoffs_api_url: settings.layoffsQueryUrl,
            // Hiring
            hiring_api_key: settings.hiringApiKey,
            hiring_api_url: settings.hiringQueryUrl,
            // Tech
            tech_api_key: settings.techApiKey,
            tech_api_url: settings.techQueryUrl,
            // AI
            ai_provider: settings.aiProvider,
            ai_openai_api_key: settings.aiOpenaiApiKey,
            ai_azure_api_key: settings.aiAzureApiKey,
            ai_azure_endpoint: settings.aiAzureEndpoint,
            ai_anthropic_api_key: settings.aiAnthropicApiKey,
            // Enrichment
            enrichment_api_key: settings.enrichmentApiKey,
            enrichment_provider: 'apollo',
            // Work Owner Search
            work_owner_departments: settings.workOwnerDepartments,
            work_owner_keywords: settings.workOwnerKeywords,
            // Instantly
            instantly_api_key: settings.instantlyApiKey,
            instantly_campaign_demand: settings.instantlyCampaignDemand,
            instantly_campaign_supply: settings.instantlyCampaignSupply,
            // Profile
            connector_profile: connectorProfile,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

      if (error) throw error;

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err: any) {
      console.error('Error saving settings:', err);
      setError(`Failed to save: ${err.message || 'Unknown error'}`);
    }
  };

  // Status checks
  const jobsLive = !!settings.jobsQueryUrl;  // Apify only needs URL, no API key
  const fundingLive = !!settings.fundingApiKey && !!settings.fundingQueryUrl;
  const layoffsLive = !!settings.layoffsApiKey && !!settings.layoffsQueryUrl;
  const hiringLive = !!settings.hiringApiKey && !!settings.hiringQueryUrl;
  const techLive = !!settings.techApiKey && !!settings.techQueryUrl;
  const contactsReady = !!settings.enrichmentApiKey;
  const deliveryReady = !!settings.instantlyApiKey && !!settings.instantlyCampaignDemand;

  const liveCount = [jobsLive, fundingLive, layoffsLive, hiringLive, techLive].filter(Boolean).length;

  if (loading) {
    return (
      <div className="h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-white/40 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#0A0A0A] text-white overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/5 flex-shrink-0">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/launcher')}
              className="text-white/40 hover:text-white/70 transition-colors"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 className="text-[14px] font-medium text-white">Connect Your APIs</h1>
              <p className="text-[10px] text-white/40">Connector OS is free. Bring your own API access.</p>
            </div>
          </div>

          {/* Status Summary */}
          <div className="flex items-center gap-4 text-[9px]">
            <span className="text-white/30">{liveCount}/5 signals</span>
            <div className={`flex items-center gap-1 ${contactsReady ? 'text-white/70' : 'text-white/30'}`}>
              <div className={`w-1 h-1 rounded-full ${contactsReady ? 'bg-white/70' : 'bg-white/20'}`} />
              Apollo
            </div>
            <div className={`flex items-center gap-1 ${deliveryReady ? 'text-white/70' : 'text-white/30'}`}>
              <div className={`w-1 h-1 rounded-full ${deliveryReady ? 'bg-white/70' : 'bg-white/20'}`} />
              Instantly
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 px-6 py-4 overflow-auto">
        <div className="max-w-[1400px] mx-auto">
          {/* Signals Grid - 3 columns */}
          <div className="mb-4">
            <div className="text-[9px] uppercase tracking-wider text-white/30 mb-2">Signal Sources</div>
            <div className="grid grid-cols-3 gap-3">
              <ApifySignalCard
                title="Demand (Jobs)"
                subtitle="Companies hiring"
                datasetUrl={settings.jobsQueryUrl}
                onUrlChange={(val) => setSettings({ ...settings, jobsQueryUrl: val })}
                urlPlaceholder="https://api.apify.com/v2/datasets/DATASET_ID/items?format=json"
                helpText="LinkedIn, Indeed, Wellfound job scrapers"
              />
              <ApifySignalCard
                title="Supply (Providers)"
                subtitle="Service providers"
                datasetUrl={settings.supplyQueryUrl}
                onUrlChange={(val) => setSettings({ ...settings, supplyQueryUrl: val })}
                urlPlaceholder="https://api.apify.com/v2/datasets/DATASET_ID/items?format=json"
                helpText="Clutch, G2, agency directory scrapers"
              />
              <SignalCard
                title="Funding"
                provider="Piloterr (Crunchbase)"
                apiKey={settings.fundingApiKey}
                queryUrl={settings.fundingQueryUrl}
                onApiKeyChange={(val) => setSettings({ ...settings, fundingApiKey: val })}
                onQueryUrlChange={(val) => setSettings({ ...settings, fundingQueryUrl: val })}
                urlPlaceholder="https://piloterr.com/api/v2/crunchbase/funding_rounds?..."
              />
              <SignalCard
                title="Layoffs"
                provider="Intellizence / Custom"
                apiKey={settings.layoffsApiKey}
                queryUrl={settings.layoffsQueryUrl}
                onApiKeyChange={(val) => setSettings({ ...settings, layoffsApiKey: val })}
                onQueryUrlChange={(val) => setSettings({ ...settings, layoffsQueryUrl: val })}
                urlPlaceholder="https://api.intellizence.com/v1/layoffs?..."
              />
              <SignalCard
                title="Hiring Velocity"
                provider="Custom API"
                apiKey={settings.hiringApiKey}
                queryUrl={settings.hiringQueryUrl}
                onApiKeyChange={(val) => setSettings({ ...settings, hiringApiKey: val })}
                onQueryUrlChange={(val) => setSettings({ ...settings, hiringQueryUrl: val })}
                urlPlaceholder="https://your-api.com/hiring?..."
              />
              <SignalCard
                title="Tech Stack"
                provider="BuiltWith / Custom"
                apiKey={settings.techApiKey}
                queryUrl={settings.techQueryUrl}
                onApiKeyChange={(val) => setSettings({ ...settings, techApiKey: val })}
                onQueryUrlChange={(val) => setSettings({ ...settings, techQueryUrl: val })}
                urlPlaceholder="https://api.builtwith.com/v1/lookup?..."
              />

              {/* Contact & Delivery in same row */}
              <div className="bg-[#111] rounded-lg border border-white/5 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-[11px] font-medium text-white/90">Contact Enrichment</h2>
                    <div className="text-[8px] text-white/30 mt-0.5">Apollo for finding contacts</div>
                  </div>
                  <div className={`text-[8px] px-1.5 py-0.5 rounded ${settings.enrichmentApiKey ? 'bg-white/[0.08] text-white/70' : 'bg-white/5 text-white/30'}`}>
                    {settings.enrichmentApiKey ? 'Ready' : 'Not Configured'}
                  </div>
                </div>
                <Input
                  label="Apollo API Key"
                  value={settings.enrichmentApiKey}
                  onChange={(val) => setSettings({ ...settings, enrichmentApiKey: val })}
                  placeholder="Your Apollo key"
                  type="password"
                />
              </div>

              {/* AI Provider */}
              <div className="bg-[#111] rounded-lg border border-white/5 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-[11px] font-medium text-white/90">AI Provider</h2>
                    <div className="text-[8px] text-white/30 mt-0.5">For intro generation</div>
                  </div>
                  <div className={`text-[8px] px-1.5 py-0.5 rounded ${settings.aiProvider !== 'none' ? 'bg-white/[0.08] text-white/70' : 'bg-white/5 text-white/30'}`}>
                    {settings.aiProvider !== 'none' ? settings.aiProvider.toUpperCase() : 'Not Configured'}
                  </div>
                </div>
                <div className="space-y-3">
                  {/* Provider Selection */}
                  <div>
                    <label className="text-[9px] uppercase tracking-wider text-white/40 mb-1.5 block">Provider</label>
                    <div className="flex gap-1.5">
                      {(['none', 'openai', 'azure', 'anthropic'] as const).map((provider) => (
                        <button
                          key={provider}
                          onClick={() => setSettings({ ...settings, aiProvider: provider })}
                          className={`px-2.5 py-1 text-[10px] rounded border transition-all ${
                            settings.aiProvider === provider
                              ? 'border-white/30 bg-white/[0.08] text-white/80'
                              : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10'
                          }`}
                        >
                          {provider === 'none' ? 'None' : provider === 'openai' ? 'OpenAI' : provider === 'azure' ? 'Azure' : 'Anthropic'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* OpenAI Fields */}
                  {settings.aiProvider === 'openai' && (
                    <Input
                      label="OpenAI API Key"
                      value={settings.aiOpenaiApiKey}
                      onChange={(val) => setSettings({ ...settings, aiOpenaiApiKey: val })}
                      placeholder="sk-..."
                      type="password"
                    />
                  )}

                  {/* Azure Fields */}
                  {settings.aiProvider === 'azure' && (
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        label="Azure OpenAI Key"
                        value={settings.aiAzureApiKey}
                        onChange={(val) => setSettings({ ...settings, aiAzureApiKey: val })}
                        placeholder="Your Azure key"
                        type="password"
                      />
                      <Input
                        label="Azure Endpoint"
                        value={settings.aiAzureEndpoint}
                        onChange={(val) => setSettings({ ...settings, aiAzureEndpoint: val })}
                        placeholder="https://your-resource.openai.azure.com"
                      />
                    </div>
                  )}

                  {/* Anthropic Fields */}
                  {settings.aiProvider === 'anthropic' && (
                    <Input
                      label="Anthropic API Key"
                      value={settings.aiAnthropicApiKey}
                      onChange={(val) => setSettings({ ...settings, aiAnthropicApiKey: val })}
                      placeholder="sk-ant-..."
                      type="password"
                    />
                  )}

                  {settings.aiProvider === 'none' && (
                    <div className="text-[10px] text-white/40 bg-white/5 px-3 py-2 rounded">
                      AI is optional. Without it, intros use simple templates.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Work Owner Targeting */}
          <div className="mb-4">
            <div className="text-[9px] uppercase tracking-wider text-white/30 mb-2">Work Owner Targeting</div>
            <div className="bg-[#111] rounded-lg border border-white/5 p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-[11px] font-medium text-white/90">Find the Right Person</h2>
                </div>
              </div>
              <div className="text-[10px] text-white/50 mb-3 leading-relaxed">
                We look inside people's job descriptions to find who actually does the work.
                Example: "own the forecast", "build headcount model". Those are your people.
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] uppercase tracking-wider text-white/40 mb-1 block">
                    Departments
                  </label>
                  <textarea
                    value={settings.workOwnerDepartments}
                    onChange={(e) => setSettings({ ...settings, workOwnerDepartments: e.target.value })}
                    placeholder="finance, fp&a, operations, strategy"
                    rows={2}
                    className="w-full bg-black/40 text-white text-[11px] px-2.5 py-2 rounded-md border border-white/10 hover:border-white/20 focus:border-blue-500/50 focus:outline-none transition-colors resize-none"
                  />
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-wider text-white/40 mb-1 block">
                    Keywords
                  </label>
                  <textarea
                    value={settings.workOwnerKeywords}
                    onChange={(e) => setSettings({ ...settings, workOwnerKeywords: e.target.value })}
                    placeholder="forecast, financial model, budget, variance"
                    rows={2}
                    className="w-full bg-black/40 text-white text-[11px] px-2.5 py-2 rounded-md border border-white/10 hover:border-white/20 focus:border-blue-500/50 focus:outline-none transition-colors resize-none"
                  />
                </div>
              </div>
            </div>
          </div>


          {/* Delivery Row */}
          <div>
            <div className="text-[9px] uppercase tracking-wider text-white/30 mb-2">Delivery Pipeline</div>
            <div className="bg-[#111] rounded-lg border border-white/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-[11px] font-medium text-white/90">Instantly.ai</h2>
                  <div className="text-[8px] text-white/30 mt-0.5">Signal → Demand → Interest → Supply</div>
                </div>
                <div className={`text-[8px] px-1.5 py-0.5 rounded ${deliveryReady ? 'bg-white/[0.08] text-white/70' : 'bg-white/5 text-white/30'}`}>
                  {deliveryReady ? 'Ready' : 'Setup Required'}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input
                  label="Instantly API Key"
                  value={settings.instantlyApiKey}
                  onChange={(val) => setSettings({ ...settings, instantlyApiKey: val })}
                  placeholder="Your Instantly key"
                  type="password"
                />
                <Input
                  label="Demand Campaign ID"
                  value={settings.instantlyCampaignDemand}
                  onChange={(val) => setSettings({ ...settings, instantlyCampaignDemand: val })}
                  placeholder="Companies that need help"
                />
                <Input
                  label="Supply Campaign ID"
                  value={settings.instantlyCampaignSupply}
                  onChange={(val) => setSettings({ ...settings, instantlyCampaignSupply: val })}
                  placeholder="Providers you connect"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Action Bar */}
      <div className="px-6 py-3 border-t border-white/5 flex-shrink-0">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <div className="text-[9px] text-white/30">
            {error && <span className="text-white/50">{error}</span>}
            {!error && 'URLs used verbatim • No query modification'}
          </div>
          <button
            onClick={saveSettings}
            className={`px-4 py-1.5 rounded-md text-[11px] font-medium transition-all ${
              saveSuccess
                ? 'bg-white/20 text-white/80 border border-white/30'
                : 'bg-white text-black hover:bg-white/90'
            }`}
          >
            {saveSuccess ? (
              <span className="flex items-center gap-1.5">
                <Check size={12} />
                Saved
              </span>
            ) : (
              'Save Settings'
            )}
          </button>
        </div>
      </div>

      <Dock />
    </div>
  );
}

export default Settings;
