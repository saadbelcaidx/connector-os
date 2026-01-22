/**
 * SETTINGS — Premium Linear × Vercel design
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Database, Send, User, Shield, Check, Loader2, Key, LogOut, Eye, EyeOff, ExternalLink, Copy, ChevronLeft, Search, Mail, Zap, Calendar, ArrowUpRight, ArrowDownRight, Users, Briefcase, Sparkles, Bot, Cloud, Brain, BarChart3, Lightbulb, Target, TrendingUp, Upload, Download } from 'lucide-react';
import { supabase } from './lib/supabase';
import { useAuth } from './AuthContext';
import Dock from './Dock';
import { InfoTip } from './components/InfoTip';
import { LearnMore, LearnMoreCard, LearnMoreList } from './components/LearnMore';
import type { AIConfig } from './services/AIService';
import CsvUpload from './components/CsvUpload';

// =============================================================================
// TYPES
// =============================================================================

// Pre-signal context entry for a single entity (keyed by domain)
interface PreSignalContextEntry {
  text: string;
  source?: 'linkedin' | 'news' | 'prior_convo' | 'job_post' | 'other';
  updatedAt: string;
}

interface Settings {
  // CSV-ONLY: Apify settings removed (architectural decision locked)
  apolloApiKey: string;
  anymailApiKey: string;
  connectorAgentApiKey: string;
  // Sending provider
  sendingProvider: 'instantly' | 'plusvibe';
  instantlyApiKey: string;
  instantlyCampaignDemand: string;
  instantlyCampaignSupply: string;
  plusvibeApiKey: string;
  plusvibeWorkspaceId: string;
  plusvibeCampaignDemand: string;
  plusvibeCampaignSupply: string;
  senderName: string;
  calendarLink: string;
  vslUrl: string;
  vslFollowupsEnabled: boolean;
  vslWatchedDelayHours: number;
  vslNotWatchedDelayHours: number;
  // Targeting (for reply-brain)
  targetIndustries: string[];
  // AI (3 providers: OpenAI, Azure, Claude)
  aiProvider: 'openai' | 'azure' | 'anthropic';
  openaiApiKey: string;
  azureApiKey: string;
  azureEndpoint: string;
  azureDeployment: string;
  claudeApiKey: string;
  aiModel: string;
  // Pre-signal context (operator-written, keyed by domain)
  preSignalContext: Record<string, PreSignalContextEntry>;
  // Signals toggle — fetch company signals for B2B Contacts (default false)
  fetchSignals: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  // CSV-ONLY: Apify settings removed (architectural decision locked)
  apolloApiKey: '',
  anymailApiKey: '',
  connectorAgentApiKey: '',
  // Sending provider
  sendingProvider: 'instantly',
  instantlyApiKey: '',
  instantlyCampaignDemand: '',
  instantlyCampaignSupply: '',
  plusvibeApiKey: '',
  plusvibeWorkspaceId: '',
  plusvibeCampaignDemand: '',
  plusvibeCampaignSupply: '',
  senderName: '',
  calendarLink: '',
  vslUrl: '',
  vslFollowupsEnabled: false,
  vslWatchedDelayHours: 24,
  vslNotWatchedDelayHours: 48,
  // Targeting
  targetIndustries: [],
  // AI
  aiProvider: 'openai',
  openaiApiKey: '',
  azureApiKey: '',
  azureEndpoint: '',
  azureDeployment: '',
  claudeApiKey: '',
  aiModel: 'gpt-4o-mini',
  // Pre-signal context
  preSignalContext: {},
  // Signals toggle (default off)
  fetchSignals: false,
};

type Section = 'data' | 'outreach' | 'ai' | 'identity' | 'account';

// =============================================================================
// VSL URL VALIDATION
// =============================================================================

function validateVslUrl(url: string): { valid: boolean; provider: 'loom' | 'youtube' | null; error?: string } {
  if (!url) return { valid: true, provider: null };

  // Loom: loom.com/share/* or loom.com/embed/*
  if (/loom\.com\/(share|embed)\/[a-f0-9]+/i.test(url)) {
    return { valid: true, provider: 'loom' };
  }

  // YouTube: youtube.com/watch?v=VIDEO_ID or youtu.be/VIDEO_ID
  if (/youtube\.com\/watch\?v=[a-zA-Z0-9_-]{11}/.test(url) || /youtu\.be\/[a-zA-Z0-9_-]{11}/.test(url)) {
    return { valid: true, provider: 'youtube' };
  }

  // Invalid format
  return {
    valid: false,
    provider: null,
    error: 'Invalid URL. Use Loom (loom.com/share/...) or YouTube (youtube.com/watch?v=... or youtu.be/...)'
  };
}

// =============================================================================
// COMPONENTS
// =============================================================================

// Setting row - Linear style: icon + title+desc left, control right
function Row({
  title,
  description,
  children,
  link,
  linkText,
  icon: Icon,
  imageSrc,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  link?: string;
  linkText?: string;
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  imageSrc?: string;
}) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-white/[0.06] last:border-0">
      <div className="flex items-center gap-3 flex-1 min-w-0 pr-6">
        {imageSrc ? (
          <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
            <img src={imageSrc} alt="" className="w-full h-full object-cover" />
          </div>
        ) : Icon && (
          <div className="w-8 h-8 rounded-lg bg-[#1E2030] flex items-center justify-center flex-shrink-0">
            <Icon size={16} strokeWidth={1.5} className="text-[#B8C0E0]" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[14px] text-[#CAD3F5]">{title}</span>
            {link && (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[12px] text-[#B7BDF8]/60 hover:text-[#B7BDF8] transition-colors"
              >
                {linkText || 'Get'}
                <ExternalLink size={10} />
              </a>
            )}
          </div>
          <p className="text-[13px] text-[#B8C0E0]/50 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="flex-shrink-0">
        {children}
      </div>
    </div>
  );
}

// Compact input
function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  width = 'w-[200px]'
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  width?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${width} h-8 px-3 rounded-md bg-white/[0.06] border border-white/[0.08] text-[13px] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-white/20 transition-all`}
    />
  );
}

// =============================================================================
// MAIN
// =============================================================================

export default function Settings() {
  const navigate = useNavigate();
  const { user, runtimeMode, setPassword, signOut } = useAuth();
  const isGuest = runtimeMode === 'guest';

  const [section, setSection] = useState<Section>('data');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Password
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  // Webhook URLs
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedPlusvibeWebhook, setCopiedPlusvibeWebhook] = useState(false);
  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instantly-webhook`;
  const plusvibeWebhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/plusvibe-webhook`;

  const copyWebhook = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 1500);
  };

  const copyPlusvibeWebhook = async () => {
    await navigator.clipboard.writeText(plusvibeWebhookUrl);
    setCopiedPlusvibeWebhook(true);
    setTimeout(() => setCopiedPlusvibeWebhook(false), 1500);
  };

  // CSV Upload State (Phase 1-3)
  const [showDemandCsv, setShowDemandCsv] = useState(false);
  const [showSupplyCsv, setShowSupplyCsv] = useState(false);

  // Track CSV data existence for persistent feedback
  const [demandCsvCount, setDemandCsvCount] = useState<number>(0);
  const [supplyCsvCount, setSupplyCsvCount] = useState<number>(0);

  // Check localStorage for existing CSV data on mount
  useEffect(() => {
    try {
      const demandData = localStorage.getItem('csv_demand_data');
      if (demandData) {
        const parsed = JSON.parse(demandData);
        setDemandCsvCount(Array.isArray(parsed) ? parsed.length : 0);
      }
      const supplyData = localStorage.getItem('csv_supply_data');
      if (supplyData) {
        const parsed = JSON.parse(supplyData);
        setSupplyCsvCount(Array.isArray(parsed) ? parsed.length : 0);
      }
    } catch (e) {
      console.error('[Settings] Error reading CSV data from localStorage:', e);
    }
  }, []);

  // Load
  useEffect(() => { load(); }, [isGuest]);

  const load = async () => {
    try {
      if (isGuest) {
        const cached = localStorage.getItem('guest_settings');
        if (cached) {
          const { settings: s } = JSON.parse(cached);
          if (s) setSettings(s);
        }
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('operator_settings')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();

      // Load AI settings from localStorage (sensitive keys, not stored in DB)
      const aiSettings = localStorage.getItem('ai_settings');
      const aiParsed = aiSettings ? JSON.parse(aiSettings) : {};

      if (data) {
        setSettings({
          // CSV-ONLY: Apify settings removed
          apolloApiKey: data.enrichment_api_key || '',
          anymailApiKey: data.anymail_finder_api_key || '',
          connectorAgentApiKey: data.connector_agent_api_key || '',
          fetchSignals: data.fetch_signals === true,
          // Sending provider
          sendingProvider: data.sending_provider || 'instantly',
          instantlyApiKey: data.instantly_api_key || '',
          instantlyCampaignDemand: data.instantly_campaign_demand || '',
          instantlyCampaignSupply: data.instantly_campaign_supply || '',
          plusvibeApiKey: data.plusvibe_api_key || '',
          plusvibeWorkspaceId: data.plusvibe_workspace_id || '',
          plusvibeCampaignDemand: data.plusvibe_campaign_demand || '',
          plusvibeCampaignSupply: data.plusvibe_campaign_supply || '',
          senderName: data.sender_name || '',
          calendarLink: data.calendar_link || '',
          vslUrl: data.vsl_url || '',
          vslFollowupsEnabled: data.vsl_followups_enabled || false,
          vslWatchedDelayHours: data.vsl_watched_delay_hours || 24,
          vslNotWatchedDelayHours: data.vsl_not_watched_delay_hours || 48,
          // Targeting
          targetIndustries: data.target_industries || [],
          // AI from localStorage
          aiProvider: aiParsed.aiProvider || 'openai',
          openaiApiKey: aiParsed.openaiApiKey || '',
          azureApiKey: aiParsed.azureApiKey || '',
          azureEndpoint: aiParsed.azureEndpoint || '',
          azureDeployment: aiParsed.azureDeployment || '',
          claudeApiKey: aiParsed.claudeApiKey || '',
          aiModel: aiParsed.aiModel || 'gpt-4o-mini',
          // Pre-signal context (JSONB from DB, defaults to empty)
          preSignalContext: data.pre_signal_context || {},
        });
      } else {
        // No DB data, just load AI settings
        setSettings(prev => ({
          ...prev,
          aiProvider: aiParsed.aiProvider || 'openai',
          openaiApiKey: aiParsed.openaiApiKey || '',
          azureApiKey: aiParsed.azureApiKey || '',
          azureEndpoint: aiParsed.azureEndpoint || '',
          azureDeployment: aiParsed.azureDeployment || '',
          claudeApiKey: aiParsed.claudeApiKey || '',
          aiModel: aiParsed.aiModel || 'gpt-4o-mini',
        }));
      }
    } catch (e) {
      console.error('[Settings] Load error:', e);
    }
    setLoading(false);
  };

  // Save
  const save = async () => {
    // Validate VSL URL before saving
    if (settings.vslUrl) {
      const vslValidation = validateVslUrl(settings.vslUrl);
      if (!vslValidation.valid) {
        console.error('[Settings] Invalid VSL URL, blocking save');
        return;
      }
    }

    setSaving(true);
    try {
      // Always save AI settings to localStorage (sensitive keys)
      localStorage.setItem('ai_settings', JSON.stringify({
        aiProvider: settings.aiProvider,
        openaiApiKey: settings.openaiApiKey,
        azureApiKey: settings.azureApiKey,
        azureEndpoint: settings.azureEndpoint,
        azureDeployment: settings.azureDeployment,
        claudeApiKey: settings.claudeApiKey,
        aiModel: settings.aiModel,
      }));

      if (isGuest) {
        localStorage.setItem('guest_settings', JSON.stringify({ settings }));
      } else {
        await supabase.from('operator_settings').upsert({
          user_id: user!.id,
          // CSV-ONLY: Apify settings removed
          enrichment_api_key: settings.apolloApiKey,
          anymail_finder_api_key: settings.anymailApiKey,
          connector_agent_api_key: settings.connectorAgentApiKey,
          fetch_signals: settings.fetchSignals,
          // Sending provider (always sent)
          sending_provider: settings.sendingProvider,
          // Instantly fields (always persist - campaign IDs are configuration)
          instantly_api_key: settings.instantlyApiKey,
          instantly_campaign_demand: settings.instantlyCampaignDemand,
          instantly_campaign_supply: settings.instantlyCampaignSupply,
          // Plusvibe campaign IDs (always persist - campaign IDs are configuration)
          plusvibe_campaign_demand: settings.plusvibeCampaignDemand,
          plusvibe_campaign_supply: settings.plusvibeCampaignSupply,
          // Plusvibe credentials (only when provider = plusvibe)
          ...(settings.sendingProvider === 'plusvibe' ? {
            plusvibe_api_key: settings.plusvibeApiKey,
            plusvibe_workspace_id: settings.plusvibeWorkspaceId,
          } : {}),
          sender_name: settings.senderName,
          calendar_link: settings.calendarLink,
          vsl_url: settings.vslUrl,
          vsl_followups_enabled: settings.vslFollowupsEnabled,
          vsl_watched_delay_hours: settings.vslWatchedDelayHours,
          vsl_not_watched_delay_hours: settings.vslNotWatchedDelayHours,
          // Targeting
          target_industries: settings.targetIndustries,
          // Pre-signal context (JSONB)
          pre_signal_context: settings.preSignalContext,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

        // Register campaigns to user_campaigns for multi-tenant webhook lookup
        const campaignsToRegister: { campaign_id: string; provider: string; campaign_name: string }[] = [];

        // Instantly campaigns
        if (settings.instantlyCampaignDemand) {
          campaignsToRegister.push({
            campaign_id: settings.instantlyCampaignDemand,
            provider: 'instantly',
            campaign_name: 'Demand Campaign',
          });
        }
        if (settings.instantlyCampaignSupply) {
          campaignsToRegister.push({
            campaign_id: settings.instantlyCampaignSupply,
            provider: 'instantly',
            campaign_name: 'Supply Campaign',
          });
        }

        // PlusVibe campaigns
        if (settings.plusvibeCampaignDemand) {
          campaignsToRegister.push({
            campaign_id: settings.plusvibeCampaignDemand,
            provider: 'plusvibe',
            campaign_name: 'Demand Campaign',
          });
        }
        if (settings.plusvibeCampaignSupply) {
          campaignsToRegister.push({
            campaign_id: settings.plusvibeCampaignSupply,
            provider: 'plusvibe',
            campaign_name: 'Supply Campaign',
          });
        }

        // Upsert each campaign (ignore duplicates)
        for (const campaign of campaignsToRegister) {
          await supabase.from('user_campaigns').upsert({
            user_id: user!.id,
            campaign_id: campaign.campaign_id,
            provider: campaign.provider,
            campaign_name: campaign.campaign_name,
          }, { onConflict: 'campaign_id' });
        }
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('[Settings] Save error:', e);
    }
    setSaving(false);
  };

  const handlePasswordChange = async () => {
    setPasswordError(null);
    if (newPassword.length < 6) {
      setPasswordError('Min 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords don\'t match');
      return;
    }
    setChangingPassword(true);
    const result = await setPassword(newPassword);
    if (result.error) {
      setPasswordError(result.error);
    } else {
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordForm(false);
    }
    setChangingPassword(false);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="h-screen bg-[#0e0e10] flex items-center justify-center">
        <Loader2 size={20} className="text-white/20 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#0e0e10] text-white flex">
      {/* Sidebar */}
      <div className="w-[200px] border-r border-white/[0.06] flex flex-col">
        {/* Back */}
        <button
          onClick={() => navigate('/flow')}
          className="h-12 px-4 flex items-center gap-2 text-[13px] text-white/50 hover:text-white/80 transition-colors border-b border-white/[0.06]"
        >
          <ChevronLeft size={16} />
          Back to app
        </button>

        {/* Nav */}
        <nav className="flex-1 py-2">
          {[
            { id: 'data' as Section, icon: Database, label: 'Data' },
            { id: 'outreach' as Section, icon: Send, label: 'Sending' },
            { id: 'ai' as Section, icon: Sparkles, label: 'Personalization' },
            { id: 'identity' as Section, icon: User, label: 'Profile' },
            { id: 'account' as Section, icon: Shield, label: 'Account' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-2 text-[13px] transition-colors ${
                section === item.id
                  ? 'bg-white/[0.08] text-white'
                  : 'text-white/50 hover:text-white/70 hover:bg-white/[0.04]'
              }`}
            >
              <item.icon size={16} strokeWidth={1.5} />
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Main */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-[600px] mx-auto py-12 px-8 pb-32">
          {/* Page title */}
          <h1 className="text-[28px] font-semibold text-white mb-8">
            {section === 'data' && 'Data'}
            {section === 'outreach' && 'Sending'}
            {section === 'ai' && 'Personalization'}
            {section === 'identity' && 'Profile'}
            {section === 'account' && 'Account'}
          </h1>

          {/* DATA */}
          {section === 'data' && (
            <div className="space-y-8" style={{ animation: 'settings-fade-in 400ms ease-out' }}>

              {/* How it works - Progressive disclosure */}
              <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-transparent border border-white/[0.06]">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                    <Lightbulb size={16} strokeWidth={1.5} className="text-emerald-400/70" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-[13px] font-medium text-white/90 mb-1">How the system works</h3>
                    <p className="text-[12px] text-white/50 leading-relaxed">
                      Two data sources. One matching engine. The system connects timing with expertise.
                    </p>

                    <LearnMore title="Learn more">
                      <LearnMoreCard>
                        <div className="space-y-4">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Target size={14} className="text-blue-400/70" />
                              <span className="text-[12px] font-medium text-white/80">Demand</span>
                            </div>
                            <p className="text-[12px] text-white/50 leading-relaxed">
                              Companies showing timing signals — hiring, funding, expansion.
                              The system finds who needs help right now.
                            </p>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Users size={14} className="text-violet-400/70" />
                              <span className="text-[12px] font-medium text-white/80">Supply</span>
                            </div>
                            <p className="text-[12px] text-white/50 leading-relaxed">
                              People who monetize that timing — recruiters, consultants, agencies.
                              The system matches them to demand.
                            </p>
                          </div>
                          <div className="pt-2 border-t border-white/[0.06]">
                            <p className="text-[11px] text-white/40">
                              Both scrapers work for either side. The difference is who you scrape, not which tool you use.
                            </p>
                          </div>
                        </div>
                      </LearnMoreCard>
                    </LearnMore>

                    <LearnMore title="Path to $10,000/month">
                      <LearnMoreCard>
                        <div className="space-y-3">
                          <LearnMoreList items={[
                            "Route 300-500 contacts daily (both sides combined)",
                            "Use timing signals — not random companies",
                            "Reply within hours, not days",
                            "One facilitated intro per week at $2,500 = $10,000/month"
                          ]} />
                          <div className="pt-3 border-t border-white/[0.06]">
                            <p className="text-[11px] text-white/40">
                              The money is in match quality. Better signals = better intros = better replies.
                            </p>
                          </div>
                        </div>
                      </LearnMoreCard>
                    </LearnMore>
                  </div>
                </div>
              </div>

              {/* CSV Upload — Single Source of Truth */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-[11px] font-medium uppercase tracking-wider text-white/30">Data source</h2>
                </div>

                {/* Demand Card */}
                <div
                  className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1] mb-3"
                  style={{ animationDelay: '50ms' }}
                >
                  {/* Header row */}
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                      <Target size={16} strokeWidth={1.5} className="text-blue-400/70" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-white/90">Demand CSV</span>
                        <InfoTip content="Companies showing timing signals. Required: Company Name, Signal. Optional: Full Name, Email, Domain, Context." />
                      </div>
                      <p className="text-[12px] text-white/40 mt-0.5">Companies with timing signals</p>
                    </div>
                  </div>

                  {/* LearnMore - below the header row */}
                  <div className="ml-11 mt-1">
                    <LearnMore title="What counts as demand?">
                      <LearnMoreCard>
                        <LearnMoreList items={[
                          "Job postings (hiring signals)",
                          "Funding announcements (budget signals)",
                          "Growth indicators (expansion signals)",
                          "Any company activity that implies a need"
                        ]} />
                      </LearnMoreCard>
                    </LearnMore>
                  </div>

                  {/* CSV Upload Option */}
                  <div className="ml-11 mt-3 pt-3 border-t border-white/[0.04]">
                    {!showDemandCsv ? (
                      <div className="flex items-center gap-3">
                        {/* Show success badge when CSV data exists */}
                        {demandCsvCount > 0 ? (
                          <>
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/[0.08] border border-emerald-500/[0.15]">
                              <Check size={12} className="text-emerald-400" />
                              <span className="text-[11px] text-emerald-400">{demandCsvCount} records loaded</span>
                            </div>
                            <button
                              onClick={() => setShowDemandCsv(true)}
                              className="text-[10px] text-white/30 hover:text-white/50 transition-colors"
                            >
                              Replace
                            </button>
                            <button
                              onClick={() => {
                                localStorage.removeItem('csv_demand_data');
                                setDemandCsvCount(0);
                              }}
                              className="text-[10px] text-white/30 hover:text-red-400/70 transition-colors"
                            >
                              Clear
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => setShowDemandCsv(true)}
                              className="flex items-center gap-1.5 text-[11px] text-blue-400/70 hover:text-blue-400 transition-colors"
                            >
                              <Upload size={12} />
                              <span>Upload CSV</span>
                            </button>
                            <a
                              href="/csv-template-demand.csv"
                              download="demand-template.csv"
                              className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/50 transition-colors"
                            >
                              <Download size={10} />
                              <span>Template</span>
                            </a>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-white/50">Upload demand CSV</span>
                          <div className="flex items-center gap-2">
                            <a
                              href="/csv-template-demand.csv"
                              download="demand-template.csv"
                              className="text-[10px] text-white/30 hover:text-white/50"
                            >
                              Template
                            </a>
                            <button
                              onClick={() => setShowDemandCsv(false)}
                              className="text-[10px] text-white/30 hover:text-white/50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                        <CsvUpload
                          side="demand"
                          onNormalized={(records) => {
                            // Store to localStorage for Flow.tsx to read
                            localStorage.setItem('csv_demand_data', JSON.stringify(records));
                            console.log('[Settings] Stored CSV demand data:', records.length, 'records');
                            // Update count for persistent UI feedback
                            setDemandCsvCount(records.length);
                            // Don't immediately hide - let the CsvUpload show its success state
                            // User can click Cancel or navigate away when ready
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Supply Card */}
                <div
                  className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1]"
                  style={{ animationDelay: '100ms' }}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                      <Users size={16} strokeWidth={1.5} className="text-violet-400/70" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-white/90">Supply CSV</span>
                        <InfoTip content="Service providers who fulfill demand. Required: Company Name, Signal. Optional: Full Name, Email, Domain, Context." />
                      </div>
                      <p className="text-[12px] text-white/40 mt-0.5">Providers who monetize demand signals</p>

                      <LearnMore title="What counts as supply?">
                        <LearnMoreCard>
                          <LearnMoreList items={[
                            "Recruiters (place candidates)",
                            "Consultants (solve problems)",
                            "Agencies (provide services)",
                            "Anyone who monetizes demand signals"
                          ]} />
                        </LearnMoreCard>
                      </LearnMore>
                    </div>
                  </div>

                  {/* CSV Upload Option */}
                  <div className="ml-11 mt-3 pt-3 border-t border-white/[0.04]">
                    {!showSupplyCsv ? (
                      <div className="flex items-center gap-3">
                        {/* Show success badge when CSV data exists */}
                        {supplyCsvCount > 0 ? (
                          <>
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/[0.08] border border-emerald-500/[0.15]">
                              <Check size={12} className="text-emerald-400" />
                              <span className="text-[11px] text-emerald-400">{supplyCsvCount} records loaded</span>
                            </div>
                            <button
                              onClick={() => setShowSupplyCsv(true)}
                              className="text-[10px] text-white/30 hover:text-white/50 transition-colors"
                            >
                              Replace
                            </button>
                            <button
                              onClick={() => {
                                localStorage.removeItem('csv_supply_data');
                                setSupplyCsvCount(0);
                              }}
                              className="text-[10px] text-white/30 hover:text-red-400/70 transition-colors"
                            >
                              Clear
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => setShowSupplyCsv(true)}
                              className="flex items-center gap-1.5 text-[11px] text-violet-400/70 hover:text-violet-400 transition-colors"
                            >
                              <Upload size={12} />
                              <span>Upload CSV</span>
                            </button>
                            <a
                              href="/csv-template-supply.csv"
                              download="supply-template.csv"
                              className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/50 transition-colors"
                            >
                              <Download size={10} />
                              <span>Template</span>
                            </a>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-white/50">Upload supply CSV</span>
                          <div className="flex items-center gap-2">
                            <a
                              href="/csv-template-supply.csv"
                              download="supply-template.csv"
                              className="text-[10px] text-white/30 hover:text-white/50"
                            >
                              Template
                            </a>
                            <button
                              onClick={() => setShowSupplyCsv(false)}
                              className="text-[10px] text-white/30 hover:text-white/50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                        <CsvUpload
                          side="supply"
                          onNormalized={(records) => {
                            // Store to localStorage for Flow.tsx to read
                            localStorage.setItem('csv_supply_data', JSON.stringify(records));
                            console.log('[Settings] Stored CSV supply data:', records.length, 'records');
                            // Update count for persistent UI feedback
                            setSupplyCsvCount(records.length);
                            // Don't immediately hide - let the CsvUpload show its success state
                            // User can click Cancel or navigate away when ready
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* CSV Format Info */}
              <div className="ml-0">
                <LearnMore title="CSV format">
                  <LearnMoreCard>
                    <div className="space-y-3 text-[12px] text-white/60">
                      <p className="text-white/40 text-[11px]">Required columns for all CSV uploads:</p>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-400/60">→</span>
                          <span className="text-white/70 font-mono text-[11px]">Full Name</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-400/60">→</span>
                          <span className="text-white/70 font-mono text-[11px]">Company Name</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-400/60">→</span>
                          <span className="text-white/70 font-mono text-[11px]">Domain</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-400/60">→</span>
                          <span className="text-white/70 font-mono text-[11px]">Context</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-400/60">→</span>
                          <span className="text-white/70 font-mono text-[11px]">Signal</span>
                        </div>
                      </div>
                      <p className="text-white/30 text-[10px] mt-2">Download the template for the exact format.</p>
                    </div>
                  </LearnMoreCard>
                </LearnMore>
              </div>

              {/* Best Practices */}
              <div className="p-4 rounded-xl border border-dashed border-white/[0.08] bg-white/[0.01]">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp size={14} className="text-white/30" />
                  <span className="text-[11px] font-medium uppercase tracking-wider text-white/30">Best practices</span>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <p className="text-[11px] text-white/40 flex items-start gap-2">
                    <span className="text-emerald-400/50">✓</span>
                    Use demand with timing signals
                  </p>
                  <p className="text-[11px] text-white/40 flex items-start gap-2">
                    <span className="text-emerald-400/50">✓</span>
                    Supply with verified emails saves cost
                  </p>
                  <p className="text-[11px] text-white/40 flex items-start gap-2">
                    <span className="text-emerald-400/50">✓</span>
                    Let the system match categories
                  </p>
                  <p className="text-[11px] text-white/40 flex items-start gap-2">
                    <span className="text-emerald-400/50">✓</span>
                    Richer data = richer intros
                  </p>
                </div>
              </div>

              <style>{`
                @keyframes settings-fade-in {
                  from {
                    opacity: 0;
                    transform: translateY(8px);
                  }
                  to {
                    opacity: 1;
                    transform: translateY(0);
                  }
                }
              `}</style>
            </div>
          )}

          {/* OUTREACH */}
          {section === 'outreach' && (
            <div className="space-y-8" style={{ animation: 'settings-fade-in 400ms ease-out' }}>

              {/* How enrichment works */}
              <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-transparent border border-white/[0.06]">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                    <Search size={16} strokeWidth={1.5} className="text-purple-400/70" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-[13px] font-medium text-white/90 mb-1">How enrichment works</h3>
                    <p className="text-[12px] text-white/50 leading-relaxed">
                      The system finds decision makers at companies showing timing signals. Apollo does the lookup, Anymail catches any misses.
                    </p>

                    <LearnMore title="Learn more">
                      <LearnMoreCard>
                        <LearnMoreList items={[
                          "Demand datasets often don't have contact info — just company signals",
                          "Apollo looks up decision makers by domain and seniority",
                          "Anymail Finder catches emails Apollo misses",
                          "SSM Verify is exclusive to community members"
                        ]} />
                      </LearnMoreCard>
                    </LearnMore>
                  </div>
                </div>
              </div>

              {/* Enrichment */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-[11px] font-medium uppercase tracking-wider text-white/30">Enrichment</h2>
                </div>

                {/* Apollo */}
                <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1] mb-3">
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                        <Search size={16} strokeWidth={1.5} className="text-purple-400/70" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-white/90">Apollo</span>
                          <InfoTip content="Primary enrichment. Looks up decision makers by company domain." />
                          <a href="https://get.apollo.io/8s76txc0otqj" target="_blank" rel="noopener noreferrer" className="text-[11px] text-emerald-400/70 hover:text-emerald-400 transition-colors">
                            Get Apollo →
                          </a>
                        </div>
                        <p className="text-[12px] text-white/40 mt-0.5">Find decision-maker emails</p>
                      </div>
                    </div>
                    <div className="w-[200px]">
                      <Input type="password" value={settings.apolloApiKey} onChange={(v) => setSettings({ ...settings, apolloApiKey: v })} placeholder="API key" />
                    </div>
                  </div>
                </div>

                {/* Anymail Finder */}
                <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1] mb-3">
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                        <Mail size={16} strokeWidth={1.5} className="text-white/50" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-white/90">Anymail Finder</span>
                          <InfoTip content="Fallback enrichment. Catches emails Apollo misses." />
                          <a href="https://anymailfinder.com/?via=os" target="_blank" rel="noopener noreferrer" className="text-[11px] text-emerald-400/70 hover:text-emerald-400 transition-colors">
                            Get Anymail →
                          </a>
                        </div>
                        <p className="text-[12px] text-white/40 mt-0.5">Backup when Apollo misses</p>
                      </div>
                    </div>
                    <div className="w-[200px]">
                      <Input type="password" value={settings.anymailApiKey} onChange={(v) => setSettings({ ...settings, anymailApiKey: v })} placeholder="Optional" />
                    </div>
                  </div>
                </div>

                {/* Connector Agent */}
                <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1] mb-3">
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                        <Zap size={16} strokeWidth={1.5} className="text-violet-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-white/90">Connector Agent</span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wider bg-violet-500/10 text-violet-400/70 border border-violet-500/20">SSM</span>
                        </div>
                        <p className="text-[12px] text-white/40 mt-0.5">
                          SSM private · <a href="https://www.skool.com/ssmasters/" target="_blank" rel="noopener noreferrer" className="text-white/50 hover:text-white/70 transition-colors">Join SSM for access</a>
                        </p>
                      </div>
                    </div>
                    <div className="w-[200px]">
                      <Input type="password" value={settings.connectorAgentApiKey} onChange={(v) => setSettings({ ...settings, connectorAgentApiKey: v })} placeholder="ca_..." />
                    </div>
                  </div>
                </div>

                {/* Company Signals Toggle */}
                <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1]">
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                        <Sparkles size={16} strokeWidth={1.5} className="text-amber-400/70" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-white/90">Company Signals</span>
                          <InfoTip content="Fetch funding, employees, and tech stack for B2B Contacts. One extra Apollo call per verified domain." />
                        </div>
                        <p className="text-[12px] text-white/40 mt-0.5">Optional metadata for verified contacts</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSettings({ ...settings, fetchSignals: !settings.fetchSignals })}
                      className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                        settings.fetchSignals ? 'bg-amber-500/70' : 'bg-white/[0.08]'
                      }`}
                    >
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                        settings.fetchSignals ? 'left-6' : 'left-1'
                      }`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Sending Provider */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-[11px] font-medium uppercase tracking-wider text-white/30">Sending provider</h2>
                </div>
                <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06]">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 'instantly' as const, label: 'Instantly', desc: 'Email infra', color: 'emerald' },
                      { id: 'plusvibe' as const, label: 'Plusvibe', desc: 'Email infra', color: 'violet' },
                    ].map((provider) => (
                      <button
                        key={provider.id}
                        onClick={() => setSettings({ ...settings, sendingProvider: provider.id })}
                        className={`p-4 rounded-xl text-center transition-all duration-200 ${
                          settings.sendingProvider === provider.id
                            ? `bg-${provider.color}-500/10 border-${provider.color}-500/30 border`
                            : 'bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12]'
                        }`}
                      >
                        <div className={`text-[13px] font-medium ${settings.sendingProvider === provider.id ? 'text-white' : 'text-white/70'}`}>
                          {provider.label}
                        </div>
                        <div className="text-[11px] text-white/40">{provider.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Instantly */}
              {settings.sendingProvider === 'instantly' && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h2 className="text-[11px] font-medium uppercase tracking-wider text-white/30">Instantly</h2>
                  </div>

                  {/* API Key */}
                  <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1] mb-3">
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                          <Zap size={16} strokeWidth={1.5} className="text-emerald-400/70" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium text-white/90">API Key</span>
                            <InfoTip content="Connects to your Instantly account. Sends intros through your campaigns." />
                            <a href="https://instantly.ai/?via=saadbelcaid" target="_blank" rel="noopener noreferrer" className="text-[11px] text-emerald-400/70 hover:text-emerald-400 transition-colors">
                              Get Instantly →
                            </a>
                          </div>
                          <p className="text-[12px] text-white/40 mt-0.5">Send emails via Instantly</p>
                        </div>
                      </div>
                      <div className="w-[200px]">
                        <Input type="password" value={settings.instantlyApiKey} onChange={(v) => setSettings({ ...settings, instantlyApiKey: v })} placeholder="API key" />
                      </div>
                    </div>
                  </div>

                  {/* Campaigns */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1]">
                      <div className="flex items-center gap-2 mb-2">
                        <ArrowUpRight size={14} className="text-blue-400/70" />
                        <span className="text-[12px] font-medium text-white/80">Demand campaign</span>
                        <InfoTip content="Intros sent to companies with timing signals go here." />
                      </div>
                      <Input value={settings.instantlyCampaignDemand} onChange={(v) => setSettings({ ...settings, instantlyCampaignDemand: v })} placeholder="Campaign ID" width="w-full" />
                    </div>
                    <div className="p-4 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1]">
                      <div className="flex items-center gap-2 mb-2">
                        <ArrowDownRight size={14} className="text-violet-400/70" />
                        <span className="text-[12px] font-medium text-white/80">Supply campaign</span>
                        <InfoTip content="Intros sent to service providers go here." />
                      </div>
                      <Input value={settings.instantlyCampaignSupply} onChange={(v) => setSettings({ ...settings, instantlyCampaignSupply: v })} placeholder="Campaign ID" width="w-full" />
                    </div>
                  </div>
                </div>
              )}

              {/* Plusvibe */}
              {settings.sendingProvider === 'plusvibe' && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h2 className="text-[11px] font-medium uppercase tracking-wider text-white/30">Plusvibe</h2>
                  </div>

                  {/* API Key */}
                  <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1] mb-3">
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                          <Zap size={16} strokeWidth={1.5} className="text-violet-400/70" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium text-white/90">API Key</span>
                            <InfoTip content="Connects to your Plusvibe account. Sends intros through your campaigns." />
                            <a href="https://plusvibe.com" target="_blank" rel="noopener noreferrer" className="text-[11px] text-emerald-400/70 hover:text-emerald-400 transition-colors">
                              Get Plusvibe →
                            </a>
                          </div>
                          <p className="text-[12px] text-white/40 mt-0.5">Send emails via Plusvibe</p>
                        </div>
                      </div>
                      <div className="w-[200px]">
                        <Input type="password" value={settings.plusvibeApiKey} onChange={(v) => setSettings({ ...settings, plusvibeApiKey: v })} placeholder="API key" />
                      </div>
                    </div>
                  </div>

                  {/* Workspace ID */}
                  <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1] mb-3">
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                          <Briefcase size={16} strokeWidth={1.5} className="text-white/50" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium text-white/90">Workspace ID</span>
                            <InfoTip content="Your Plusvibe workspace identifier. Find it in your Plusvibe settings." />
                          </div>
                          <p className="text-[12px] text-white/40 mt-0.5">Your Plusvibe workspace</p>
                        </div>
                      </div>
                      <div className="w-[200px]">
                        <Input value={settings.plusvibeWorkspaceId} onChange={(v) => setSettings({ ...settings, plusvibeWorkspaceId: v })} placeholder="Workspace ID" />
                      </div>
                    </div>
                  </div>

                  {/* Campaigns */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1]">
                      <div className="flex items-center gap-2 mb-2">
                        <ArrowUpRight size={14} className="text-blue-400/70" />
                        <span className="text-[12px] font-medium text-white/80">Demand campaign</span>
                        <InfoTip content="Intros sent to companies with timing signals go here." />
                      </div>
                      <Input value={settings.plusvibeCampaignDemand} onChange={(v) => setSettings({ ...settings, plusvibeCampaignDemand: v })} placeholder="Campaign ID" width="w-full" />
                    </div>
                    <div className="p-4 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1]">
                      <div className="flex items-center gap-2 mb-2">
                        <ArrowDownRight size={14} className="text-violet-400/70" />
                        <span className="text-[12px] font-medium text-white/80">Supply campaign</span>
                        <InfoTip content="Intros sent to service providers go here." />
                      </div>
                      <Input value={settings.plusvibeCampaignSupply} onChange={(v) => setSettings({ ...settings, plusvibeCampaignSupply: v })} placeholder="Campaign ID" width="w-full" />
                    </div>
                  </div>
                </div>
              )}

              {/* Webhooks */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-[11px] font-medium uppercase tracking-wider text-white/30">Webhooks</h2>
                </div>
                <div className="space-y-3">
                  {/* Instantly Webhook */}
                  <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1]">
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                          <Send size={16} strokeWidth={1.5} className="text-white/50" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium text-white/90">Instantly webhook</span>
                            <InfoTip content="Receives replies from Instantly. Add to: Settings → Webhooks → reply_received" />
                          </div>
                          <p className="text-[12px] text-white/40 mt-0.5">Add to Instantly → Webhooks → reply_received</p>
                        </div>
                      </div>
                      <button
                        onClick={copyWebhook}
                        className={`h-9 px-4 rounded-lg text-[12px] font-medium flex items-center gap-2 transition-all ${
                          copiedWebhook
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-white/[0.06] text-white/60 hover:text-white/90 hover:bg-white/[0.1]'
                        }`}
                      >
                        {copiedWebhook ? <Check size={14} /> : <Copy size={14} />}
                        {copiedWebhook ? 'Copied' : 'Copy URL'}
                      </button>
                    </div>
                  </div>

                  {/* PlusVibe Webhook */}
                  <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1]">
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                          <Send size={16} strokeWidth={1.5} className="text-violet-400/70" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium text-white/90">PlusVibe webhook</span>
                            <InfoTip content="Receives replies from PlusVibe. Add to: Workspace → Webhooks" />
                          </div>
                          <p className="text-[12px] text-white/40 mt-0.5">Add to PlusVibe → Workspace → Webhooks</p>
                        </div>
                      </div>
                      <button
                        onClick={copyPlusvibeWebhook}
                        className={`h-9 px-4 rounded-lg text-[12px] font-medium flex items-center gap-2 transition-all ${
                          copiedPlusvibeWebhook
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-white/[0.06] text-white/60 hover:text-white/90 hover:bg-white/[0.1]'
                        }`}
                      >
                        {copiedPlusvibeWebhook ? <Check size={14} /> : <Copy size={14} />}
                        {copiedPlusvibeWebhook ? 'Copied' : 'Copy URL'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <style>{`
                @keyframes settings-fade-in {
                  from { opacity: 0; transform: translateY(8px); }
                  to { opacity: 1; transform: translateY(0); }
                }
              `}</style>
            </div>
          )}

          {/* AI */}
          {section === 'ai' && (
            <div className="space-y-8" style={{ animation: 'settings-fade-in 400ms ease-out' }}>

              {/* How personalization works */}
              <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-transparent border border-white/[0.06]">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                    <Sparkles size={16} strokeWidth={1.5} className="text-amber-400/70" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-[13px] font-medium text-white/90 mb-1">How personalization works</h3>
                    <p className="text-[12px] text-white/50 leading-relaxed">
                      The system generates personalized intros based on timing signals. Better intros = better replies = more deals.
                    </p>

                    <LearnMore title="Learn more">
                      <LearnMoreCard>
                        <LearnMoreList items={[
                          "Each intro is written from the signal data — not generic templates",
                          "The system mentions specific details: role count, funding stage, team growth",
                          "Optional but recommended — significantly improves response rates",
                          "Costs are minimal compared to deal value (~$0.01/intro)"
                        ]} />
                      </LearnMoreCard>
                    </LearnMore>
                  </div>
                </div>
              </div>

              {/* Provider Selection */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-[11px] font-medium uppercase tracking-wider text-white/30">Provider</h2>
                </div>
                <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06]">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'openai', label: 'OpenAI', desc: 'GPT-4', color: 'emerald' },
                      { id: 'azure', label: 'Azure', desc: 'OpenAI', color: 'blue' },
                      { id: 'anthropic', label: 'Claude', desc: 'Anthropic', color: 'violet' },
                    ].map((provider) => (
                      <button
                        key={provider.id}
                        onClick={() => setSettings({ ...settings, aiProvider: provider.id as any })}
                        className={`p-4 rounded-xl text-center transition-all duration-200 ${
                          settings.aiProvider === provider.id
                            ? `bg-${provider.color}-500/10 border-${provider.color}-500/30 border`
                            : 'bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12]'
                        }`}
                      >
                        <div className={`text-[13px] font-medium ${settings.aiProvider === provider.id ? 'text-white' : 'text-white/70'}`}>
                          {provider.label}
                        </div>
                        <div className="text-[11px] text-white/40">{provider.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* OpenAI */}
              {settings.aiProvider === 'openai' && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h2 className="text-[11px] font-medium uppercase tracking-wider text-white/30">OpenAI</h2>
                  </div>

                  <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1] mb-3">
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                          <Key size={16} strokeWidth={1.5} className="text-emerald-400/70" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium text-white/90">API Key</span>
                            <InfoTip content="Your OpenAI API key. Get one from the OpenAI platform." />
                            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-[11px] text-emerald-400/70 hover:text-emerald-400 transition-colors">
                              Get key →
                            </a>
                          </div>
                          <p className="text-[12px] text-white/40 mt-0.5">Your OpenAI API key</p>
                        </div>
                      </div>
                      <div className="w-[200px]">
                        <Input type="password" value={settings.openaiApiKey} onChange={(v) => setSettings({ ...settings, openaiApiKey: v })} placeholder="sk-..." />
                      </div>
                    </div>
                  </div>

                  <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1]">
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                          <Bot size={16} strokeWidth={1.5} className="text-white/50" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium text-white/90">Model</span>
                            <InfoTip content="GPT-4o Mini is fast and cost-effective. GPT-4o is more capable." />
                          </div>
                          <p className="text-[12px] text-white/40 mt-0.5">Which model to use</p>
                        </div>
                      </div>
                      <div className="w-[200px] relative">
                        <select
                          value={settings.aiModel}
                          onChange={(e) => setSettings({ ...settings, aiModel: e.target.value })}
                          className="w-full h-9 pl-3 pr-8 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13px] text-white/90 appearance-none cursor-pointer transition-all duration-200 hover:bg-white/[0.06] hover:border-white/[0.12] focus:outline-none focus:border-white/20 focus:ring-1 focus:ring-white/10"
                          style={{ colorScheme: 'dark' }}
                        >
                          <option value="gpt-4o-mini">GPT-4o Mini (Fast)</option>
                          <option value="gpt-4o">GPT-4o (Best)</option>
                          <option value="gpt-4-turbo">GPT-4 Turbo</option>
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-white/40">
                            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Azure OpenAI */}
              {settings.aiProvider === 'azure' && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h2 className="text-[11px] font-medium uppercase tracking-wider text-white/30">Azure OpenAI</h2>
                  </div>

                  <div className="space-y-3">
                    <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1]">
                      <div className="flex items-start justify-between gap-6">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                            <Key size={16} strokeWidth={1.5} className="text-blue-400/70" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-medium text-white/90">API Key</span>
                              <InfoTip content="Your Azure OpenAI API key from the Azure Portal." />
                              <a href="https://portal.azure.com" target="_blank" rel="noopener noreferrer" className="text-[11px] text-emerald-400/70 hover:text-emerald-400 transition-colors">
                                Azure Portal →
                              </a>
                            </div>
                            <p className="text-[12px] text-white/40 mt-0.5">Azure OpenAI API key</p>
                          </div>
                        </div>
                        <div className="w-[200px]">
                          <Input type="password" value={settings.azureApiKey} onChange={(v) => setSettings({ ...settings, azureApiKey: v })} placeholder="API key" />
                        </div>
                      </div>
                    </div>

                    <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1]">
                      <div className="flex items-start justify-between gap-6">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                            <Cloud size={16} strokeWidth={1.5} className="text-white/50" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-medium text-white/90">Endpoint</span>
                              <InfoTip content="Your Azure OpenAI resource endpoint URL." />
                            </div>
                            <p className="text-[12px] text-white/40 mt-0.5">Your Azure endpoint URL</p>
                          </div>
                        </div>
                        <div className="w-[260px]">
                          <Input value={settings.azureEndpoint} onChange={(v) => setSettings({ ...settings, azureEndpoint: v })} placeholder="https://your-resource.openai.azure.com" width="w-full" />
                        </div>
                      </div>
                    </div>

                    <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1]">
                      <div className="flex items-start justify-between gap-6">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                            <Bot size={16} strokeWidth={1.5} className="text-white/50" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-medium text-white/90">Deployment</span>
                              <InfoTip content="The name of your model deployment in Azure." />
                            </div>
                            <p className="text-[12px] text-white/40 mt-0.5">Model deployment name</p>
                          </div>
                        </div>
                        <div className="w-[200px]">
                          <Input value={settings.azureDeployment} onChange={(v) => setSettings({ ...settings, azureDeployment: v })} placeholder="gpt-4o-mini" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Anthropic Claude */}
              {settings.aiProvider === 'anthropic' && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h2 className="text-[11px] font-medium uppercase tracking-wider text-white/30">Anthropic</h2>
                  </div>

                  <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1] mb-3">
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                          <Key size={16} strokeWidth={1.5} className="text-violet-400/70" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium text-white/90">API Key</span>
                            <InfoTip content="Your Anthropic API key. Get one from the Anthropic Console." />
                            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-[11px] text-emerald-400/70 hover:text-emerald-400 transition-colors">
                              Get key →
                            </a>
                          </div>
                          <p className="text-[12px] text-white/40 mt-0.5">Your Anthropic API key</p>
                        </div>
                      </div>
                      <div className="w-[200px]">
                        <Input type="password" value={settings.claudeApiKey} onChange={(v) => setSettings({ ...settings, claudeApiKey: v })} placeholder="sk-ant-..." />
                      </div>
                    </div>
                  </div>

                  <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1]">
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                          <Brain size={16} strokeWidth={1.5} className="text-white/50" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium text-white/90">Model</span>
                            <InfoTip content="Haiku is fast and cost-effective. Sonnet is more capable." />
                          </div>
                          <p className="text-[12px] text-white/40 mt-0.5">Which Claude model to use</p>
                        </div>
                      </div>
                      <div className="w-[200px] relative">
                        <select
                          value={settings.aiModel}
                          onChange={(e) => setSettings({ ...settings, aiModel: e.target.value })}
                          className="w-full h-9 pl-3 pr-8 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13px] text-white/90 appearance-none cursor-pointer transition-all duration-200 hover:bg-white/[0.06] hover:border-white/[0.12] focus:outline-none focus:border-white/20 focus:ring-1 focus:ring-white/10"
                          style={{ colorScheme: 'dark' }}
                        >
                          <option value="claude-3-haiku-20240307">Claude 3 Haiku (Fast)</option>
                          <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet (Best)</option>
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-white/40">
                            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <style>{`
                @keyframes settings-fade-in {
                  from { opacity: 0; transform: translateY(8px); }
                  to { opacity: 1; transform: translateY(0); }
                }
              `}</style>
            </div>
          )}

          {/* IDENTITY */}
          {section === 'identity' && (
            <div className="space-y-8" style={{ animation: 'settings-fade-in 400ms ease-out' }}>

              {/* How profile works */}
              <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-transparent border border-white/[0.06]">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <User size={16} strokeWidth={1.5} className="text-blue-400/70" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-[13px] font-medium text-white/90 mb-1">Your connector profile</h3>
                    <p className="text-[12px] text-white/50 leading-relaxed">
                      How you appear in outreach. Your name and calendar link are used when generating intros and scheduling calls.
                    </p>

                    <LearnMore title="Learn more">
                      <LearnMoreCard>
                        <LearnMoreList items={[
                          "Your name appears in email signatures and intros",
                          "Calendar link is shared when prospects reply with interest",
                          "Keep it professional — this is how they'll know you"
                        ]} />
                      </LearnMoreCard>
                    </LearnMore>
                  </div>
                </div>
              </div>

              {/* Profile Fields */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-[11px] font-medium uppercase tracking-wider text-white/30">Profile</h2>
                </div>

                <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1] mb-3">
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                        <User size={16} strokeWidth={1.5} className="text-blue-400/70" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-white/90">Your name</span>
                          <InfoTip content="Used in email signatures and when introducing yourself." />
                        </div>
                        <p className="text-[12px] text-white/40 mt-0.5">Used in email signatures</p>
                      </div>
                    </div>
                    <div className="w-[200px]">
                      <Input value={settings.senderName} onChange={(v) => setSettings({ ...settings, senderName: v })} placeholder="Your name" />
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1] mb-3">
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                        <Calendar size={16} strokeWidth={1.5} className="text-white/50" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-white/90">Calendar link</span>
                          <InfoTip content="Shared when prospects want to schedule a call. Calendly, Cal.com, etc." />
                        </div>
                        <p className="text-[12px] text-white/40 mt-0.5">For scheduling calls</p>
                      </div>
                    </div>
                    <div className="w-[240px]">
                      <Input value={settings.calendarLink} onChange={(v) => setSettings({ ...settings, calendarLink: v })} placeholder="https://cal.com/you" width="w-full" />
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1]">
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                        <Zap size={16} strokeWidth={1.5} className="text-cyan-400/70" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-white/90">Pre-Alignment VSL</span>
                          <InfoTip content="Auto-sent on positive replies. 3-5 min video explaining how you work. Loom or YouTube unlisted link." />
                        </div>
                        <p className="text-[12px] text-white/40 mt-0.5">Auto-injected on interest</p>
                      </div>
                    </div>
                    <div className="w-[280px]">
                      <div className="space-y-1.5">
                        <Input
                          value={settings.vslUrl}
                          onChange={(v) => setSettings({ ...settings, vslUrl: v })}
                          placeholder="https://loom.com/share/... or youtu.be/..."
                          width="w-full"
                        />
                        {settings.vslUrl && (() => {
                          const validation = validateVslUrl(settings.vslUrl);
                          if (!validation.valid) {
                            return <p className="text-[11px] text-red-400">{validation.error}</p>;
                          }
                          if (validation.provider) {
                            return (
                              <p className="text-[11px] text-emerald-400/80">
                                Detected: {validation.provider === 'loom' ? 'Loom' : 'YouTube'}
                              </p>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* VSL Follow-ups — only show if VSL URL is set */}
                {settings.vslUrl && (
                  <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1]">
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                          <TrendingUp size={16} strokeWidth={1.5} className="text-amber-400/70" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium text-white/90">VSL Follow-ups</span>
                            <InfoTip content="Automatically follow up based on whether they watched the VSL. Watched = calendar link. Not watched = gentle nudge." />
                          </div>
                          <p className="text-[12px] text-white/40 mt-0.5">Behavior-aware routing</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => setSettings({ ...settings, vslFollowupsEnabled: !settings.vslFollowupsEnabled })}
                          className={`relative w-11 h-6 rounded-full transition-colors ${
                            settings.vslFollowupsEnabled ? 'bg-emerald-500/80' : 'bg-white/10'
                          }`}
                        >
                          <div
                            className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                              settings.vslFollowupsEnabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                    {settings.vslFollowupsEnabled && (
                      <div className="mt-4 pt-4 border-t border-white/[0.06] grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[11px] text-white/50 uppercase tracking-wider mb-1.5 block">Watched delay</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="1"
                              max="72"
                              value={settings.vslWatchedDelayHours}
                              onChange={(e) => setSettings({ ...settings, vslWatchedDelayHours: parseInt(e.target.value) || 24 })}
                              className="w-16 h-8 px-2 text-[13px] bg-white/[0.04] border border-white/[0.08] rounded-lg text-white/90 focus:outline-none focus:border-white/20"
                            />
                            <span className="text-[12px] text-white/40">hours</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] text-white/50 uppercase tracking-wider mb-1.5 block">Not watched delay</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="1"
                              max="168"
                              value={settings.vslNotWatchedDelayHours}
                              onChange={(e) => setSettings({ ...settings, vslNotWatchedDelayHours: parseInt(e.target.value) || 48 })}
                              className="w-16 h-8 px-2 text-[13px] bg-white/[0.04] border border-white/[0.08] rounded-lg text-white/90 focus:outline-none focus:border-white/20"
                            />
                            <span className="text-[12px] text-white/40">hours</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1]">
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                        <Briefcase size={16} strokeWidth={1.5} className="text-violet-400/70" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-white/90">Industries</span>
                          <InfoTip content="Used when prospects ask 'what industries do you work with?' — reply-brain will use these instead of saying 'varies'." />
                        </div>
                        <p className="text-[12px] text-white/40 mt-0.5">Comma-separated list</p>
                      </div>
                    </div>
                    <div className="w-[280px]">
                      <Input
                        value={(settings.targetIndustries || []).join(', ')}
                        onChange={(v) => setSettings({
                          ...settings,
                          targetIndustries: v.split(',').map(s => s.trim()).filter(Boolean)
                        })}
                        placeholder="SaaS, FinTech, Healthcare"
                        width="w-full"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <style>{`
                @keyframes settings-fade-in {
                  from { opacity: 0; transform: translateY(8px); }
                  to { opacity: 1; transform: translateY(0); }
                }
              `}</style>
            </div>
          )}

          {/* ACCOUNT */}
          {section === 'account' && (
            <div className="space-y-8" style={{ animation: 'settings-fade-in 400ms ease-out' }}>
              {!user ? (
                <div className="p-6 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06]">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0">
                      <img src="/ssm-logo.png" alt="SSM" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-[15px] font-medium text-white/90 mb-1">SSM membership required</h3>
                      <p className="text-[13px] text-white/50 mb-4">
                        Account creation is limited to community members. Join to unlock account features, save settings, and access exclusive tools.
                      </p>
                      <a
                        href="https://www.skool.com/ssmasters"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-white/[0.08] text-[13px] font-medium text-white/70 hover:text-white hover:bg-white/[0.12] transition-all"
                      >
                        Join the community
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Session */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <h2 className="text-[11px] font-medium uppercase tracking-wider text-white/30">Session</h2>
                    </div>
                    <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06]">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                          <User size={16} strokeWidth={1.5} className="text-emerald-400/70" />
                        </div>
                        <div>
                          <span className="text-[13px] font-medium text-white/90">Email</span>
                          <p className="text-[12px] text-white/50 mt-0.5">{user.email}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Security */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <h2 className="text-[11px] font-medium uppercase tracking-wider text-white/30">Security</h2>
                    </div>
                    <div className="p-5 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:border-white/[0.1]">
                      {!showPasswordForm ? (
                        <div className="flex items-start justify-between gap-6">
                          <div className="flex items-start gap-3 flex-1">
                            <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                              <Shield size={16} strokeWidth={1.5} className="text-white/50" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] font-medium text-white/90">Password</span>
                                <InfoTip content="Change your account password. You'll need to sign in again after changing." />
                              </div>
                              <p className="text-[12px] text-white/40 mt-0.5">Change your password</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setShowPasswordForm(true)}
                            className="h-9 px-4 rounded-lg text-[12px] font-medium bg-white/[0.06] text-white/60 hover:text-white/90 hover:bg-white/[0.1] transition-all"
                          >
                            Change
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                              <Shield size={16} strokeWidth={1.5} className="text-white/50" />
                            </div>
                            <div className="flex-1 space-y-3">
                              <div className="relative">
                                <input
                                  type={showPasswords ? 'text' : 'password'}
                                  value={newPassword}
                                  onChange={(e) => setNewPassword(e.target.value)}
                                  placeholder="New password"
                                  className="w-full h-9 px-3 pr-10 rounded-lg bg-white/[0.06] border border-white/[0.08] text-[13px] text-white placeholder-white/30 focus:outline-none focus:border-white/20 transition-all"
                                />
                                <button
                                  onClick={() => setShowPasswords(!showPasswords)}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/50 transition-colors"
                                >
                                  {showPasswords ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                              </div>
                              <input
                                type={showPasswords ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Confirm password"
                                className="w-full h-9 px-3 rounded-lg bg-white/[0.06] border border-white/[0.08] text-[13px] text-white placeholder-white/30 focus:outline-none focus:border-white/20 transition-all"
                              />
                              {passwordError && (
                                <p className="text-[12px] text-red-400">{passwordError}</p>
                              )}
                              <div className="flex gap-2">
                                <button
                                  onClick={handlePasswordChange}
                                  disabled={!newPassword || !confirmPassword || changingPassword}
                                  className="h-9 px-4 rounded-lg text-[12px] font-medium bg-white text-black hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-all"
                                >
                                  {changingPassword ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                  Update
                                </button>
                                <button
                                  onClick={() => {
                                    setShowPasswordForm(false);
                                    setNewPassword('');
                                    setConfirmPassword('');
                                    setPasswordError(null);
                                  }}
                                  className="h-9 px-4 rounded-lg text-[12px] text-white/50 hover:text-white/70 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sign Out */}
                  <div>
                    <button
                      onClick={handleSignOut}
                      className="flex items-center gap-2 h-10 px-4 rounded-lg text-[13px] text-red-400/70 hover:text-red-400 hover:bg-red-500/[0.08] transition-all"
                    >
                      <LogOut size={16} />
                      Sign out
                    </button>
                  </div>
                </>
              )}

              <style>{`
                @keyframes settings-fade-in {
                  from { opacity: 0; transform: translateY(8px); }
                  to { opacity: 1; transform: translateY(0); }
                }
              `}</style>
            </div>
          )}

          {/* Save button */}
          <div className="mt-10 pt-6 border-t border-white/[0.06]">
            <button
              onClick={save}
              disabled={saving}
              className={`h-9 px-5 rounded-md text-[13px] font-medium transition-all flex items-center gap-2 ${
                saved
                  ? 'bg-purple-500/10 text-purple-400'
                  : 'bg-white text-black hover:bg-white/90'
              }`}
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : saved ? (
                <>
                  <Check size={14} />
                  Saved
                </>
              ) : (
                'Save changes'
              )}
            </button>
          </div>
        </div>
      </div>

      <Dock />
    </div>
  );
}
