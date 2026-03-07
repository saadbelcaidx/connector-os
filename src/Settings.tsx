/**
 * SETTINGS — Premium Linear × Vercel design
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Database, Send, User, Shield, Check, Loader2, Key, LogOut, Eye, EyeOff, ExternalLink, Copy, ChevronLeft, Search, Mail, Zap, Calendar, ArrowUpRight, ArrowDownRight, Users, Briefcase, Sparkles, Bot, Cloud, Brain, BarChart3, Lightbulb, Target, TrendingUp, Upload, Download, X, Lock, Globe, Palette, Link } from 'lucide-react';
import { supabase } from './lib/supabase';
import { useAuth } from './AuthContext';
import Dock from './Dock';
import { InfoTip } from './components/InfoTip';
import { LearnMore, LearnMoreCard, LearnMoreList } from './components/LearnMore';
import type { AIConfig } from './services/AIService';
import CsvUpload from './components/CsvUpload';
import { RecentFlows } from './components/RecentFlows';
import { patchGuestSettings } from './utils/settingsCache';


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
  exaApiKey: string; // Platform Intelligence semantic search
  predictLeadsApiKey: string; // Platform Intelligence company intel
  predictLeadsApiToken: string;
  // Public Databases — ClinicalTrials.gov, FDA
  publicDatabaseSources: ('clinicaltrials' | 'fda')[];
  clinicalTrialsStatus: string; // RECRUITING, COMPLETED, etc.
  clinicalTrialsCondition: string; // Optional condition filter
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
  customVslDomain: string;
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
  // Market-level campaigns (pass-through — managed by Station, persisted here for DB round-trip)
  marketCampaigns: Record<string, { demandCampaignId: string; supplyCampaignId: string }>;
}

const DEFAULT_SETTINGS: Settings = {
  // CSV-ONLY: Apify settings removed (architectural decision locked)
  apolloApiKey: '',
  anymailApiKey: '',
  connectorAgentApiKey: '',
  exaApiKey: '',
  predictLeadsApiKey: '',
  predictLeadsApiToken: '',
  // Public Databases
  publicDatabaseSources: [],
  clinicalTrialsStatus: 'RECRUITING',
  clinicalTrialsCondition: '',
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
  customVslDomain: '',
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
  // Market campaigns (pass-through)
  marketCampaigns: {},
};

type Section = 'data' | 'outreach' | 'enrichment' | 'ai' | 'identity' | 'account';

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
    <div className="flex items-center justify-between py-3.5 last:border-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="flex items-center gap-3 flex-1 min-w-0 pr-6">
        {imageSrc ? (
          <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
            <img src={imageSrc} alt="" className="w-full h-full object-cover" />
          </div>
        ) : Icon && (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <Icon size={16} strokeWidth={1.5} className="text-white/40" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.70)' }}>{title}</span>
            {link && (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-mono transition-colors"
                style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.50)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; }}
              >
                {linkText || 'Get'}
                <ExternalLink size={10} />
              </a>
            )}
          </div>
          <p className="font-mono mt-0.5" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.30)' }}>{description}</p>
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
      className={`${width} font-mono text-white/80 placeholder:text-white/20 outline-none transition-all`}
      style={{ height: '32px', padding: '0 10px', fontSize: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px' }}
      onFocus={e => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; }}
      onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.06)'; }}
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

  const [section, setSection] = useState<Section>('outreach');
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

  // Model dropdown state
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

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

  // Computed: check if any AI API key is configured
  const hasAIKey = !!(
    (settings.aiProvider === 'openai' && settings.openaiApiKey) ||
    (settings.aiProvider === 'azure' && settings.azureApiKey) ||
    (settings.aiProvider === 'anthropic' && settings.claudeApiKey)
  );

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

  // Fire-and-forget: send CSV emails to backend for pattern learning
  const ingestPatternsFromCsv = (records: any[]) => {
    const apiKey = settings.connectorAgentApiKey;
    if (!apiKey) return;

    const patterns = records
      .filter((r: any) => r.email && r.firstName && r.lastName)
      .map((r: any) => ({ email: r.email, firstName: r.firstName, lastName: r.lastName }));

    if (patterns.length === 0) return;

    const apiUrl = import.meta.env.VITE_CONNECTOR_AGENT_API || 'https://api.connector-os.com';
    fetch(`${apiUrl}/api/patterns/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ patterns }),
    })
      .then(res => res.json())
      .then(data => console.log(`[Settings] Pattern ingestion: learned=${data.learned}, skipped=${data.skipped}`))
      .catch(err => console.warn('[Settings] Pattern ingestion failed (non-blocking):', err.message));
  };

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
          exaApiKey: data.exa_api_key || '',
          predictLeadsApiKey: data.predictleads_api_key || '',
          predictLeadsApiToken: data.predictleads_api_token || '',
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
          customVslDomain: (() => {
            const raw = data.custom_vsl_domain || '';
            // Auto-clear if a video URL was accidentally saved as custom domain
            if (raw.includes('http') || raw.includes('/') || raw.includes('loom.com') || raw.includes('youtube.com') || raw.includes('youtu.be')) return '';
            return raw;
          })(),
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
          // Market campaigns (pass-through from Station)
          marketCampaigns: data.market_campaigns || {},
        });
        // Cache outreach key to localStorage for Markets
        if (data.instantly_api_key) {
          localStorage.setItem('outreach_api_key', data.instantly_api_key);
        }
        // Cache all settings to guest_settings for downstream consumers
        // (readCurrentSendConfig, SendPage loadSenderConfig, etc.)
        patchGuestSettings({
          sendingProvider: data.sending_provider || 'instantly',
          instantlyApiKey: data.instantly_api_key || '',
          instantlyCampaignDemand: data.instantly_campaign_demand || '',
          instantlyCampaignSupply: data.instantly_campaign_supply || '',
          plusvibeApiKey: data.plusvibe_api_key || '',
          plusvibeWorkspaceId: data.plusvibe_workspace_id || '',
          plusvibeCampaignDemand: data.plusvibe_campaign_demand || '',
          plusvibeCampaignSupply: data.plusvibe_campaign_supply || '',
          operatorId: user!.id,
          senderName: data.sender_name || '',
          calendarLink: data.calendar_link || '',
          apolloApiKey: data.enrichment_api_key || '',
          anymailApiKey: data.anymail_finder_api_key || '',
          connectorAgentApiKey: data.connector_agent_api_key || '',
          aiProvider: aiParsed.aiProvider || 'openai',
          openaiApiKey: aiParsed.openaiApiKey || '',
          azureApiKey: aiParsed.azureApiKey || '',
          azureEndpoint: aiParsed.azureEndpoint || '',
          azureDeployment: aiParsed.azureDeployment || '',
          claudeApiKey: aiParsed.claudeApiKey || '',
          aiModel: aiParsed.aiModel || 'gpt-4o-mini',
          marketCampaigns: data.market_campaigns || {},
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

      // Always save Platform Intelligence keys to localStorage (for /p/* routes)
      localStorage.setItem('platform_keys', JSON.stringify({
        exaApiKey: settings.exaApiKey,
        apolloApiKey: settings.apolloApiKey,
        predictLeadsApiKey: settings.predictLeadsApiKey,
        predictLeadsApiToken: settings.predictLeadsApiToken,
      }));

      // Always save outreach key to localStorage (for Markets / PrebuiltIntelligence)
      if (settings.instantlyApiKey) {
        localStorage.setItem('outreach_api_key', settings.instantlyApiKey);
      }

      // Always cache to localStorage (read cache for downstream consumers)
      patchGuestSettings(settings as Record<string, unknown>);

      if (isGuest) {
        // Guest-only: no DB upsert needed — cache is the sole store
      } else {
        const { error: upsertError } = await supabase.from('operator_settings').upsert({
          user_id: user!.id,
          // AI config (persisted to DB so Msg Simulator can read it)
          ai_provider: settings.aiProvider || null,
          ai_openai_api_key: settings.openaiApiKey || null,
          ai_anthropic_api_key: settings.claudeApiKey || null,
          ai_azure_api_key: settings.azureApiKey || null,
          ai_azure_endpoint: settings.azureEndpoint || null,
          ai_azure_deployment: settings.azureDeployment || null,
          ai_model: settings.aiModel || null,
          // CSV-ONLY: Apify settings removed
          enrichment_api_key: settings.apolloApiKey,
          anymail_finder_api_key: settings.anymailApiKey,
          connector_agent_api_key: settings.connectorAgentApiKey,
          exa_api_key: settings.exaApiKey,
          predictleads_api_key: settings.predictLeadsApiKey,
          predictleads_api_token: settings.predictLeadsApiToken,
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
          custom_vsl_domain: (() => {
            const d = (settings.customVslDomain || '').trim();
            if (!d) return null;
            // Block video URLs saved as tracking domain
            if (d.includes('loom.com') || d.includes('youtube.com') || d.includes('youtu.be') || d.includes('/')) return null;
            return d.replace(/^https?:\/\//, '').replace(/\/$/, '');
          })(),
          // Targeting
          target_industries: settings.targetIndustries,
          // Pre-signal context (JSONB)
          pre_signal_context: settings.preSignalContext,
          // Market campaigns (pass-through — managed by Station)
          market_campaigns: settings.marketCampaigns,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

        if (upsertError) {
          console.error('[Settings] Upsert failed:', upsertError);
          throw upsertError;
        }

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
      alert('Settings failed to save. Check console for details.');
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
      <div className="h-screen bg-[#09090b] flex items-center justify-center">
        <Loader2 size={20} className="text-white/20 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#09090b] text-white flex">
      {/* Sidebar */}
      <div className="w-[200px] flex flex-col" style={{ borderRight: '1px solid rgba(255,255,255,0.04)' }}>
        {/* Back */}
        <button
          onClick={() => navigate('/station')}
          className="h-12 px-4 flex items-center gap-2 font-mono text-white/40 hover:text-white/70 transition-colors"
          style={{ fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'none', border: 'none', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'rgba(255,255,255,0.04)', cursor: 'pointer', outline: 'none' }}
        >
          <ChevronLeft size={14} />
          Station
        </button>

        {/* Nav */}
        <nav className="flex-1 py-2">
          {[
            { id: 'outreach' as Section, icon: Send, label: 'Routing' },
            { id: 'enrichment' as Section, icon: Search, label: 'Enrichment' },
            { id: 'ai' as Section, icon: Sparkles, label: 'Reasoning' },
            { id: 'identity' as Section, icon: User, label: 'Profile' },
            { id: 'account' as Section, icon: Shield, label: 'Account' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className="w-full flex items-center gap-3 px-4 py-2 font-mono transition-all"
              style={{
                fontSize: '12px',
                background: section === item.id ? 'rgba(255,255,255,0.04)' : 'transparent',
                color: section === item.id ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.30)',
                border: 'none',
                outline: 'none',
                cursor: 'pointer',
                borderLeft: section === item.id ? '2px solid rgba(255,255,255,0.10)' : '2px solid transparent',
              }}
              onMouseEnter={e => { if (section !== item.id) { e.currentTarget.style.color = 'rgba(255,255,255,0.50)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; } }}
              onMouseLeave={e => { if (section !== item.id) { e.currentTarget.style.color = 'rgba(255,255,255,0.30)'; e.currentTarget.style.background = 'transparent'; } }}
            >
              <item.icon size={14} strokeWidth={1.5} />
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Main */}
      <div className="flex-1 overflow-auto" style={{ scrollbarWidth: 'none' }}>
        <div className="max-w-[580px] mx-auto py-10 px-8 pb-32">
          {/* Page title */}
          <div className="flex items-center gap-2.5 mb-8">
            <span style={{ color: 'rgba(52,211,153,0.40)', fontSize: '8px', lineHeight: 1 }}>◆</span>
            <h1 className="font-mono" style={{ fontSize: '16px', color: 'rgba(255,255,255,0.60)', letterSpacing: '0.02em' }}>
              {section === 'outreach' && 'Routing'}
              {section === 'enrichment' && 'Enrichment'}
              {section === 'ai' && 'Reasoning'}
              {section === 'identity' && 'Profile'}
              {section === 'account' && 'Account'}
            </h1>
          </div>

          {/* DATA — discontinued: Station handles source selection now */}
          {false && section === 'data' && (
            <div className="space-y-8" style={{ animation: 'settings-fade-in 400ms ease-out' }}>

              {/* How it works - Progressive disclosure */}
              <div className="rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                    <Lightbulb size={16} strokeWidth={1.5} className="text-white/40" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-mono text-[12px] text-white/60 mb-1">How the system works</h3>
                    <p className="font-mono text-[11px] text-white/30 leading-relaxed">
                      Two data sources. One matching engine. The system connects timing with expertise.
                    </p>

                    <LearnMore title="Learn more">
                      <LearnMoreCard>
                        <div className="space-y-4">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Target size={14} className="text-blue-400/70" />
                              <span className="font-mono text-[11px] text-white/50">Demand</span>
                            </div>
                            <p className="font-mono text-[11px] text-white/30 leading-relaxed">
                              Companies showing timing signals — hiring, funding, expansion.
                              The system finds who needs help right now.
                            </p>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Users size={14} className="text-violet-400/70" />
                              <span className="font-mono text-[11px] text-white/50">Supply</span>
                            </div>
                            <p className="font-mono text-[11px] text-white/30 leading-relaxed">
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

              {/* Recent Flows — Resume saved sessions */}
              <RecentFlows className="rounded-xl bg-gradient-to-b from-white/[0.02] to-transparent border border-white/[0.06]" />

              {/* CSV Upload — Manual Data Source */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="font-mono text-[10px] uppercase tracking-widest text-white/25">Or upload your own</h2>
                </div>

                {/* Demand Card */}
                <div
                  className="p-5 transition-all duration-300 mb-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}
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
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08]">
                              <Check size={12} className="text-white/50" />
                              <span className="text-[11px] text-white/50">{demandCsvCount} records loaded</span>
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
                            // Learn domain patterns from emails in CSV (fire-and-forget)
                            ingestPatternsFromCsv(records);
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
                  className="transition-all duration-300" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}
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
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08]">
                              <Check size={12} className="text-white/50" />
                              <span className="text-[11px] text-white/50">{supplyCsvCount} records loaded</span>
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
                            // Learn domain patterns from emails in CSV (fire-and-forget)
                            ingestPatternsFromCsv(records);
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
                          <span className="text-white/20">→</span>
                          <span className="text-white/70 font-mono text-[11px]">Full Name</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-white/20">→</span>
                          <span className="text-white/70 font-mono text-[11px]">Company Name</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-white/20">→</span>
                          <span className="text-white/70 font-mono text-[11px]">Domain</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-white/20">→</span>
                          <span className="text-white/70 font-mono text-[11px]">Context</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-white/20">→</span>
                          <span className="text-white/70 font-mono text-[11px]">Signal</span>
                        </div>
                      </div>
                      <p className="text-white/30 text-[10px] mt-2">Download the template for the exact format.</p>
                    </div>
                  </LearnMoreCard>
                </LearnMore>
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

          {/* ENRICHMENT — separate section */}
          {section === 'enrichment' && (
            <div className="space-y-4" style={{ animation: 'settings-fade-in 400ms ease-out' }}>
              {/* Apollo */}
              <div className="transition-all duration-300" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}>
                <div className="flex items-start justify-between gap-6">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                      <Search size={16} strokeWidth={1.5} className="text-purple-400/70" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[12px] text-white/70">Apollo</span>
                        <InfoTip content="Primary enrichment. Looks up decision makers by company domain." />
                        <a href="https://get.apollo.io/8s76txc0otqj" target="_blank" rel="noopener noreferrer" className="text-[11px] font-mono text-white/30 hover:text-white/50 transition-colors">
                          Get Apollo →
                        </a>
                      </div>
                      <p className="font-mono text-[10px] text-white/25 mt-0.5">Find decision-maker emails</p>
                    </div>
                  </div>
                  <div className="w-[200px]">
                    <Input type="password" value={settings.apolloApiKey} onChange={(v) => setSettings({ ...settings, apolloApiKey: v })} placeholder="API key" />
                  </div>
                </div>
              </div>

              {/* Anymail Finder */}
              <div className="transition-all duration-300" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}>
                <div className="flex items-start justify-between gap-6">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                      <Mail size={16} strokeWidth={1.5} className="text-white/50" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[12px] text-white/70">Anymail Finder</span>
                        <InfoTip content="Fallback enrichment. Catches emails Apollo misses." />
                        <a href="https://anymailfinder.com/?via=os" target="_blank" rel="noopener noreferrer" className="font-mono text-[11px] text-white/30 hover:text-white/50 transition-colors">
                          Get Anymail →
                        </a>
                      </div>
                      <p className="font-mono text-[10px] text-white/25 mt-0.5">Backup when Apollo misses</p>
                    </div>
                  </div>
                  <div className="w-[200px]">
                    <Input type="password" value={settings.anymailApiKey} onChange={(v) => setSettings({ ...settings, anymailApiKey: v })} placeholder="Optional" />
                  </div>
                </div>
              </div>

              {/* Connector Agent */}
              <div className="transition-all duration-300" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}>
                <div className="flex items-start justify-between gap-6">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                      <Zap size={16} strokeWidth={1.5} className="text-violet-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[12px] text-white/70">Connector Agent</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wider bg-violet-500/10 text-violet-400/70 border border-violet-500/20">SSM</span>
                      </div>
                      <p className="font-mono text-[10px] text-white/25 mt-0.5">
                        SSM private · <a href="https://www.skool.com/ssmasters/" target="_blank" rel="noopener noreferrer" className="text-white/50 hover:text-white/70 transition-colors">Join SSM for access</a>
                      </p>
                    </div>
                  </div>
                  <div className="w-[200px]">
                    <Input type="password" value={settings.connectorAgentApiKey} onChange={(v) => setSettings({ ...settings, connectorAgentApiKey: v })} placeholder="ca_..." />
                  </div>
                </div>
              </div>

              {/* Exa */}
              <div className="transition-all duration-300" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}>
                <div className="flex items-start justify-between gap-6">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                      <Sparkles size={16} strokeWidth={1.5} className="text-cyan-400/70" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[12px] text-white/70">Exa</span>
                        <InfoTip content="Semantic search. Find companies by meaning, not keywords." />
                        <a href="https://exa.ai" target="_blank" rel="noopener noreferrer" className="text-[11px] text-white/30 hover:text-white/50 transition-colors">
                          Get key
                        </a>
                      </div>
                      <p className="font-mono text-[10px] text-white/25 mt-0.5">Semantic company search</p>
                    </div>
                  </div>
                  <div className="w-[200px]">
                    <Input type="password" value={settings.exaApiKey} onChange={(v) => setSettings({ ...settings, exaApiKey: v })} placeholder="sk-..." />
                  </div>
                </div>
              </div>

              {/* PredictLeads */}
              <div className="transition-all duration-300" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}>
                <div className="flex items-start justify-between gap-6">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                      <Database size={16} strokeWidth={1.5} className="text-violet-400/70" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[12px] text-white/70">PredictLeads</span>
                        <InfoTip content="Deep company intel — funding, news, jobs, competitors, tech stack." />
                        <a href="https://predictleads.com" target="_blank" rel="noopener noreferrer" className="text-[11px] text-white/30 hover:text-white/50 transition-colors">
                          Get keys
                        </a>
                      </div>
                      <p className="font-mono text-[10px] text-white/25 mt-0.5">Company intel and signals</p>
                    </div>
                  </div>
                  <div className="w-[200px] space-y-2">
                    <Input type="password" value={settings.predictLeadsApiKey} onChange={(v) => setSettings({ ...settings, predictLeadsApiKey: v })} placeholder="Key" />
                    <Input type="password" value={settings.predictLeadsApiToken} onChange={(v) => setSettings({ ...settings, predictLeadsApiToken: v })} placeholder="Token" />
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

          {/* OUTREACH — Routing only */}
          {section === 'outreach' && (
            <div className="space-y-8" style={{ animation: 'settings-fade-in 400ms ease-out' }}>

              {/* Routing Provider */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="font-mono text-[10px] uppercase tracking-widest text-white/25">Routing provider</h2>
                </div>
                <div className="rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 'instantly' as const, label: 'Instantly', desc: 'Email infra' },
                      { id: 'plusvibe' as const, label: 'Plusvibe', desc: 'Email infra' },
                    ].map((provider) => {
                      const active = settings.sendingProvider === provider.id;
                      return (
                        <button
                          key={provider.id}
                          onClick={() => setSettings({ ...settings, sendingProvider: provider.id })}
                          className="font-mono text-center transition-all"
                          style={{
                            padding: '14px',
                            borderRadius: '8px',
                            background: active ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                            border: active ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(255,255,255,0.04)',
                            cursor: 'pointer',
                            outline: 'none',
                            transform: 'scale(1)',
                          }}
                          onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'scale(1.01)'; } }}
                          onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)'; e.currentTarget.style.transform = 'scale(1)'; } }}
                          onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; }}
                          onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                        >
                          <div style={{ fontSize: '12px', color: active ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.45)' }}>
                            {provider.label}
                          </div>
                          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.20)', marginTop: '2px' }}>{provider.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Instantly */}
              {settings.sendingProvider === 'instantly' && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h2 className="font-mono text-[10px] uppercase tracking-widest text-white/25">Instantly</h2>
                  </div>

                  {/* API Key */}
                  <div className="p-5 transition-all duration-300 mb-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}>
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                          <Zap size={16} strokeWidth={1.5} className="text-white/40" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[12px] text-white/70">API Key</span>
                            <InfoTip content="Connects to your Instantly account. Routes intros through your campaigns." />
                            <a href="https://instantly.ai/?via=saadbelcaid" target="_blank" rel="noopener noreferrer" className="text-[11px] font-mono text-white/30 hover:text-white/50 transition-colors">
                              Get Instantly →
                            </a>
                          </div>
                          <p className="font-mono text-[10px] text-white/25 mt-0.5">Route intros via Instantly</p>
                        </div>
                      </div>
                      <div className="w-[200px]">
                        <Input type="password" value={settings.instantlyApiKey} onChange={(v) => setSettings({ ...settings, instantlyApiKey: v })} placeholder="API key" />
                      </div>
                    </div>
                  </div>

                </div>
              )}

              {/* Plusvibe */}
              {settings.sendingProvider === 'plusvibe' && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h2 className="font-mono text-[10px] uppercase tracking-widest text-white/25">Plusvibe</h2>
                  </div>

                  {/* API Key */}
                  <div className="p-5 transition-all duration-300 mb-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}>
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                          <Zap size={16} strokeWidth={1.5} className="text-violet-400/70" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[12px] text-white/70">API Key</span>
                            <InfoTip content="Connects to your Plusvibe account. Routes intros through your campaigns." />
                            <a href="https://plusvibe.com" target="_blank" rel="noopener noreferrer" className="text-[11px] font-mono text-white/30 hover:text-white/50 transition-colors">
                              Get Plusvibe →
                            </a>
                          </div>
                          <p className="font-mono text-[10px] text-white/25 mt-0.5">Route intros via Plusvibe</p>
                        </div>
                      </div>
                      <div className="w-[200px]">
                        <Input type="password" value={settings.plusvibeApiKey} onChange={(v) => setSettings({ ...settings, plusvibeApiKey: v })} placeholder="API key" />
                      </div>
                    </div>
                  </div>

                  {/* Workspace ID */}
                  <div className="p-5 transition-all duration-300 mb-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}>
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                          <Briefcase size={16} strokeWidth={1.5} className="text-white/50" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[12px] text-white/70">Workspace ID</span>
                            <InfoTip content="Your Plusvibe workspace identifier. Find it in your Plusvibe settings." />
                          </div>
                          <p className="font-mono text-[10px] text-white/25 mt-0.5">Your Plusvibe workspace</p>
                        </div>
                      </div>
                      <div className="w-[200px]">
                        <Input value={settings.plusvibeWorkspaceId} onChange={(v) => setSettings({ ...settings, plusvibeWorkspaceId: v })} placeholder="Workspace ID" />
                      </div>
                    </div>
                  </div>

                </div>
              )}

              {/* Webhooks */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="font-mono text-[10px] uppercase tracking-widest text-white/25">Webhooks</h2>
                </div>
                <div className="space-y-3">
                  {/* Instantly Webhook */}
                  <div className="transition-all duration-300" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}>
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                          <Send size={16} strokeWidth={1.5} className="text-white/50" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[12px] text-white/70">Instantly webhook</span>
                            <InfoTip content="Receives replies from Instantly. Add to: Settings → Webhooks → reply_received" />
                          </div>
                          <p className="font-mono text-[10px] text-white/25 mt-0.5">Add to Instantly → Webhooks → reply_received</p>
                        </div>
                      </div>
                      <button
                        onClick={copyWebhook}
                        className={`h-9 px-4 rounded-lg text-[12px] font-medium flex items-center gap-2 transition-all ${
                          copiedWebhook
                            ? 'bg-white/[0.04] text-white/50 border border-white/[0.12]'
                            : 'bg-white/[0.06] text-white/60 hover:text-white/90 hover:bg-white/[0.1]'
                        }`}
                      >
                        {copiedWebhook ? <Check size={14} /> : <Copy size={14} />}
                        {copiedWebhook ? 'Copied' : 'Copy URL'}
                      </button>
                    </div>
                  </div>

                  {/* PlusVibe Webhook */}
                  <div className="transition-all duration-300" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}>
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                          <Send size={16} strokeWidth={1.5} className="text-violet-400/70" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[12px] text-white/70">PlusVibe webhook</span>
                            <InfoTip content="Receives replies from PlusVibe. Add to: Workspace → Webhooks" />
                          </div>
                          <p className="font-mono text-[10px] text-white/25 mt-0.5">Add to PlusVibe → Workspace → Webhooks</p>
                        </div>
                      </div>
                      <button
                        onClick={copyPlusvibeWebhook}
                        className={`h-9 px-4 rounded-lg text-[12px] font-medium flex items-center gap-2 transition-all ${
                          copiedPlusvibeWebhook
                            ? 'bg-white/[0.04] text-white/50 border border-white/[0.12]'
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

              {/* Provider Selection */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="font-mono text-[10px] uppercase tracking-widest text-white/25">Provider</h2>
                </div>
                <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'openai', label: 'OpenAI', desc: 'GPT-4' },
                      { id: 'azure', label: 'Azure', desc: 'OpenAI' },
                      { id: 'anthropic', label: 'Claude', desc: 'Anthropic' },
                    ].map((provider) => {
                      const active = settings.aiProvider === provider.id;
                      return (
                        <button
                          key={provider.id}
                          onClick={() => setSettings({ ...settings, aiProvider: provider.id as any })}
                          className="font-mono text-center transition-all"
                          style={{
                            padding: '14px',
                            borderRadius: '8px',
                            background: active ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                            border: active ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(255,255,255,0.04)',
                            cursor: 'pointer',
                            outline: 'none',
                            transform: 'scale(1)',
                          }}
                          onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'scale(1.01)'; } }}
                          onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)'; e.currentTarget.style.transform = 'scale(1)'; } }}
                          onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; }}
                          onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                        >
                          <div style={{ fontSize: '12px', color: active ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.45)' }}>
                            {provider.label}
                          </div>
                          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.20)', marginTop: '2px' }}>{provider.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* OpenAI */}
              {settings.aiProvider === 'openai' && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h2 className="font-mono text-[10px] uppercase tracking-widest text-white/25">OpenAI</h2>
                  </div>

                  <div className="p-5 transition-all duration-300 mb-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}>
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                          <Key size={16} strokeWidth={1.5} className="text-white/40" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[12px] text-white/70">API Key</span>
                            <InfoTip content="Your OpenAI API key. Get one from the OpenAI platform." />
                            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-[11px] font-mono text-white/30 hover:text-white/50 transition-colors">
                              Get key →
                            </a>
                          </div>
                          <p className="font-mono text-[10px] text-white/25 mt-0.5">Your OpenAI API key</p>
                        </div>
                      </div>
                      <div className="w-[200px]">
                        <Input type="password" value={settings.openaiApiKey} onChange={(v) => setSettings({ ...settings, openaiApiKey: v })} placeholder="sk-..." />
                      </div>
                    </div>
                  </div>

                  <div className="transition-all duration-300" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}>
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                          <Bot size={16} strokeWidth={1.5} className="text-white/50" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[12px] text-white/70">Model</span>
                            <InfoTip content="GPT-4o Mini is fast and cost-effective. GPT-4o is more capable." />
                          </div>
                          <p className="font-mono text-[10px] text-white/25 mt-0.5">Which model to use</p>
                        </div>
                      </div>
                      <div className="w-[200px] relative">
                        <button
                          onClick={() => setModelDropdownOpen(v => !v)}
                          className="w-full font-mono text-[11px] text-left flex items-center justify-between px-3 transition-all"
                          style={{ height: '28px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '4px', outline: 'none', cursor: 'pointer', transform: 'scale(1)' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.transform = 'scale(1.01)'; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = 'scale(1)'; }}
                          onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; }}
                          onMouseUp={e => { e.currentTarget.style.transform = 'scale(1.01)'; }}
                        >
                          <span className="text-white/70">
                            {settings.aiModel === 'gpt-4o-mini' ? 'GPT-4o Mini' : settings.aiModel === 'gpt-4o' ? 'GPT-4o' : 'GPT-4 Turbo'}
                          </span>
                          <span className="text-white/20 ml-2">▾</span>
                        </button>
                        {modelDropdownOpen && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setModelDropdownOpen(false)} />
                            <div className="absolute top-full left-0 right-0 mt-0.5 z-50 max-h-48 overflow-y-auto" style={{ background: '#09090b', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '4px', scrollbarWidth: 'none' }}>
                              {[
                                { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
                                { value: 'gpt-4o', label: 'GPT-4o' },
                                { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
                              ].map(m => (
                                <button
                                  key={m.value}
                                  onClick={() => { setSettings({ ...settings, aiModel: m.value }); setModelDropdownOpen(false); }}
                                  className="w-full text-left px-2.5 py-1.5 font-mono text-[11px] transition-colors"
                                  style={{ background: settings.aiModel === m.value ? 'rgba(255,255,255,0.06)' : 'transparent', color: settings.aiModel === m.value ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.50)', border: 'none', outline: 'none', cursor: 'pointer' }}
                                  onMouseEnter={e => { if (settings.aiModel !== m.value) { e.currentTarget.style.color = 'rgba(255,255,255,0.80)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; } }}
                                  onMouseLeave={e => { if (settings.aiModel !== m.value) { e.currentTarget.style.color = 'rgba(255,255,255,0.50)'; e.currentTarget.style.background = 'transparent'; } }}
                                >
                                  {m.label}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Azure OpenAI */}
              {settings.aiProvider === 'azure' && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h2 className="font-mono text-[10px] uppercase tracking-widest text-white/25">Azure OpenAI</h2>
                  </div>

                  <div className="space-y-3">
                    <div className="transition-all duration-300" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}>
                      <div className="flex items-start justify-between gap-6">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                            <Key size={16} strokeWidth={1.5} className="text-blue-400/70" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[12px] text-white/70">API Key</span>
                              <InfoTip content="Your Azure OpenAI API key from the Azure Portal." />
                              <a href="https://portal.azure.com" target="_blank" rel="noopener noreferrer" className="text-[11px] font-mono text-white/30 hover:text-white/50 transition-colors">
                                Azure Portal →
                              </a>
                            </div>
                            <p className="font-mono text-[10px] text-white/25 mt-0.5">Azure OpenAI API key</p>
                          </div>
                        </div>
                        <div className="w-[200px]">
                          <Input type="password" value={settings.azureApiKey} onChange={(v) => setSettings({ ...settings, azureApiKey: v })} placeholder="API key" />
                        </div>
                      </div>
                    </div>

                    <div className="transition-all duration-300" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}>
                      <div className="flex items-start justify-between gap-6">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                            <Cloud size={16} strokeWidth={1.5} className="text-white/50" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[12px] text-white/70">Endpoint</span>
                              <InfoTip content="Your Azure OpenAI resource endpoint URL." />
                            </div>
                            <p className="font-mono text-[10px] text-white/25 mt-0.5">Your Azure endpoint URL</p>
                          </div>
                        </div>
                        <div className="w-[260px]">
                          <Input value={settings.azureEndpoint} onChange={(v) => setSettings({ ...settings, azureEndpoint: v })} placeholder="https://your-resource.openai.azure.com" width="w-full" />
                        </div>
                      </div>
                    </div>

                    <div className="transition-all duration-300" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}>
                      <div className="flex items-start justify-between gap-6">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                            <Bot size={16} strokeWidth={1.5} className="text-white/50" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[12px] text-white/70">Deployment</span>
                              <InfoTip content="The name of your model deployment in Azure." />
                            </div>
                            <p className="font-mono text-[10px] text-white/25 mt-0.5">Model deployment name</p>
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
                    <h2 className="font-mono text-[10px] uppercase tracking-widest text-white/25">Anthropic</h2>
                  </div>

                  <div className="p-5 transition-all duration-300 mb-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}>
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                          <Key size={16} strokeWidth={1.5} className="text-violet-400/70" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[12px] text-white/70">API Key</span>
                            <InfoTip content="Your Anthropic API key. Get one from the Anthropic Console." />
                            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-[11px] font-mono text-white/30 hover:text-white/50 transition-colors">
                              Get key →
                            </a>
                          </div>
                          <p className="font-mono text-[10px] text-white/25 mt-0.5">Your Anthropic API key</p>
                        </div>
                      </div>
                      <div className="w-[200px]">
                        <Input type="password" value={settings.claudeApiKey} onChange={(v) => setSettings({ ...settings, claudeApiKey: v })} placeholder="sk-ant-..." />
                      </div>
                    </div>
                  </div>

                  <div className="transition-all duration-300" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}>
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                          <Brain size={16} strokeWidth={1.5} className="text-white/50" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[12px] text-white/70">Model</span>
                            <InfoTip content="Haiku is fast and cost-effective. Sonnet is more capable." />
                          </div>
                          <p className="font-mono text-[10px] text-white/25 mt-0.5">Which Claude model to use</p>
                        </div>
                      </div>
                      <div className="w-[200px] relative">
                        <button
                          onClick={() => setModelDropdownOpen(v => !v)}
                          className="w-full font-mono text-[11px] text-left flex items-center justify-between px-3 transition-all"
                          style={{ height: '28px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '4px', outline: 'none', cursor: 'pointer', transform: 'scale(1)' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.transform = 'scale(1.01)'; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = 'scale(1)'; }}
                          onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; }}
                          onMouseUp={e => { e.currentTarget.style.transform = 'scale(1.01)'; }}
                        >
                          <span className="text-white/70">
                            {settings.aiModel === 'claude-haiku-4-5-20251001' ? 'Haiku 4.5' : 'Sonnet 4.6'}
                          </span>
                          <span className="text-white/20 ml-2">▾</span>
                        </button>
                        {modelDropdownOpen && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setModelDropdownOpen(false)} />
                            <div className="absolute top-full left-0 right-0 mt-0.5 z-50 max-h-48 overflow-y-auto" style={{ background: '#09090b', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '4px', scrollbarWidth: 'none' }}>
                              {[
                                { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
                                { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
                              ].map(m => (
                                <button
                                  key={m.value}
                                  onClick={() => { setSettings({ ...settings, aiModel: m.value }); setModelDropdownOpen(false); }}
                                  className="w-full text-left px-2.5 py-1.5 font-mono text-[11px] transition-colors"
                                  style={{ background: settings.aiModel === m.value ? 'rgba(255,255,255,0.06)' : 'transparent', color: settings.aiModel === m.value ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.50)', border: 'none', outline: 'none', cursor: 'pointer' }}
                                  onMouseEnter={e => { if (settings.aiModel !== m.value) { e.currentTarget.style.color = 'rgba(255,255,255,0.80)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; } }}
                                  onMouseLeave={e => { if (settings.aiModel !== m.value) { e.currentTarget.style.color = 'rgba(255,255,255,0.50)'; e.currentTarget.style.background = 'transparent'; } }}
                                >
                                  {m.label}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Enhance Intro Toggle */}

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

              {/* Profile Fields */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="font-mono text-[10px] uppercase tracking-widest text-white/25">Profile</h2>
                </div>

                <div className="p-5 transition-all duration-300 mb-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}>
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                        <User size={16} strokeWidth={1.5} className="text-blue-400/70" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[12px] text-white/70">Your name</span>
                          <InfoTip content="Used in email signatures and when introducing yourself." />
                        </div>
                        <p className="font-mono text-[10px] text-white/25 mt-0.5">Used in email signatures</p>
                      </div>
                    </div>
                    <div className="w-[200px]">
                      <Input value={settings.senderName} onChange={(v) => setSettings({ ...settings, senderName: v })} placeholder="Your name" />
                    </div>
                  </div>
                </div>

                <div className="p-5 transition-all duration-300 mb-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}>
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                        <Calendar size={16} strokeWidth={1.5} className="text-white/50" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[12px] text-white/70">Calendar link</span>
                          <InfoTip content="Shared when prospects want to schedule a call. Calendly, Cal.com, etc." />
                        </div>
                        <p className="font-mono text-[10px] text-white/25 mt-0.5">For scheduling calls</p>
                      </div>
                    </div>
                    <div className="w-[240px]">
                      <Input value={settings.calendarLink} onChange={(v) => setSettings({ ...settings, calendarLink: v })} placeholder="https://cal.com/you" width="w-full" />
                    </div>
                  </div>
                </div>

                <div className="transition-all duration-300" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}>
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                        <Zap size={16} strokeWidth={1.5} className="text-cyan-400/70" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[12px] text-white/70">Pre-Alignment VSL</span>
                          <InfoTip content="Auto-sent on positive replies. 3-5 min video explaining how you work. Loom or YouTube unlisted link." />
                        </div>
                        <p className="font-mono text-[10px] text-white/25 mt-0.5">Paste Loom or unlisted YouTube link</p>
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
                              <p className="text-[11px] text-white/50">
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

                {/* Tracking Domain — only show if VSL URL is set */}
                {settings.vslUrl && (
                  <div className="rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                        <Link size={16} strokeWidth={1.5} className="text-violet-400/70" />
                      </div>
                      <div>
                        <span className="font-mono text-[12px] text-white/60">Tracking Domain</span>
                        <p className="font-mono text-[10px] text-white/25 mt-0.5">Tracking links send from our server</p>
                        <p className="text-[11px] text-white/20 mt-1">Each reply gets a unique link — go.introrelay.com/[slug]</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* VSL Follow-ups — only show if VSL URL is set */}
                {settings.vslUrl && (
                  <div className="transition-all duration-300" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}>
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                          <TrendingUp size={16} strokeWidth={1.5} className="text-amber-400/70" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[12px] text-white/70">VSL Follow-ups</span>
                            <InfoTip content="Automatically follow up based on whether they watched the VSL. Watched = calendar link. Not watched = gentle nudge." />
                          </div>
                          <p className="font-mono text-[10px] text-white/25 mt-0.5">Behavior-aware routing</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => setSettings({ ...settings, vslFollowupsEnabled: !settings.vslFollowupsEnabled })}
                          className={`relative w-11 h-6 rounded-full transition-colors ${
                            settings.vslFollowupsEnabled ? 'bg-white/40' : 'bg-white/10'
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
                      <div className="mt-4 pt-4 grid grid-cols-2 gap-4" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        <div>
                          <label className="text-[11px] text-white/50 uppercase tracking-wider mb-1.5 block">Watched delay</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="1"
                              max="72"
                              value={settings.vslWatchedDelayHours}
                              onChange={(e) => setSettings({ ...settings, vslWatchedDelayHours: parseInt(e.target.value) || 24 })}
                              className="w-16 font-mono text-white/70 outline-none transition-all" style={{ height: '32px', padding: '0 8px', fontSize: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px' }}
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
                              className="w-16 font-mono text-white/70 outline-none transition-all" style={{ height: '32px', padding: '0 8px', fontSize: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px' }}
                            />
                            <span className="text-[12px] text-white/40">hours</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="transition-all duration-300" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}>
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                        <Briefcase size={16} strokeWidth={1.5} className="text-violet-400/70" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[12px] text-white/70">Industries</span>
                          <InfoTip content="Used when prospects ask 'what industries do you work with?' — reply-brain will use these instead of saying 'varies'." />
                        </div>
                        <p className="font-mono text-[10px] text-white/25 mt-0.5">Comma-separated list</p>
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
                <div className="rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '20px 24px' }}>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0">
                      <img src="/ssm-logo.png" alt="SSM" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-mono" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.70)' }}>SSM membership required</h3>
                      <p className="font-mono mt-1 mb-4" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.30)' }}>
                        Account creation is limited to community members. Join to unlock account features and save settings.
                      </p>
                      <a
                        href="https://www.skool.com/ssmasters"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 font-mono transition-all"
                        style={{ height: '32px', padding: '0 14px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)', fontSize: '11px', color: 'rgba(255,255,255,0.50)' }}
                      >
                        Join the community
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Session */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <h2 className="font-mono text-[10px] uppercase tracking-widest text-white/25">Session</h2>
                    </div>
                    <div className="rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                          <User size={16} strokeWidth={1.5} className="text-white/40" />
                        </div>
                        <div>
                          <span className="font-mono" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.50)' }}>Email</span>
                          <p className="font-mono mt-0.5" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.30)' }}>{user.email}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Security */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <h2 className="font-mono text-[10px] uppercase tracking-widest text-white/25">Security</h2>
                    </div>
                    <div className="transition-all duration-300" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '16px 20px' }}>
                      {!showPasswordForm ? (
                        <div className="flex items-start justify-between gap-6">
                          <div className="flex items-start gap-3 flex-1">
                            <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                              <Shield size={16} strokeWidth={1.5} className="text-white/50" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[12px] text-white/70">Password</span>
                                <InfoTip content="Change your account password. You'll need to sign in again after changing." />
                              </div>
                              <p className="font-mono text-[10px] text-white/25 mt-0.5">Change your password</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setShowPasswordForm(true)}
                            className="font-mono transition-all"
                            style={{ height: '30px', padding: '0 14px', fontSize: '11px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.50)', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', outline: 'none', transform: 'scale(1)' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.80)'; e.currentTarget.style.transform = 'scale(1.02)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.50)'; e.currentTarget.style.transform = 'scale(1)'; }}
                            onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; }}
                            onMouseUp={e => { e.currentTarget.style.transform = 'scale(1.02)'; }}
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
                                  className="w-full font-mono text-white/80 placeholder-white/20 outline-none transition-all" style={{ height: '32px', padding: '0 32px 0 10px', fontSize: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px' }}
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
                                className="w-full font-mono text-white/80 placeholder-white/20 outline-none transition-all" style={{ height: '32px', padding: '0 10px', fontSize: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px' }}
                              />
                              {passwordError && (
                                <p className="text-[12px] text-red-400">{passwordError}</p>
                              )}
                              <div className="flex gap-2">
                                <button
                                  onClick={handlePasswordChange}
                                  disabled={!newPassword || !confirmPassword || changingPassword}
                                  className="font-mono flex items-center gap-1.5 transition-all"
                                  style={{ height: '30px', padding: '0 14px', fontSize: '11px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.60)', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', outline: 'none', opacity: (!newPassword || !confirmPassword || changingPassword) ? 0.4 : 1 }}
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
                                  className="font-mono transition-colors"
                                  style={{ height: '30px', padding: '0 12px', fontSize: '11px', borderRadius: '6px', background: 'transparent', color: 'rgba(255,255,255,0.30)', border: 'none', cursor: 'pointer', outline: 'none' }}
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
                      className="flex items-center gap-2 font-mono transition-all"
                      style={{ height: '32px', padding: '0 14px', fontSize: '11px', borderRadius: '6px', background: 'transparent', color: 'rgba(255,255,255,0.25)', border: 'none', cursor: 'pointer', outline: 'none' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'rgba(248,113,113,0.70)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; }}
                    >
                      <LogOut size={14} />
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
          <div className="mt-10 pt-6" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <button
              onClick={save}
              disabled={saving}
              className="font-mono transition-all flex items-center gap-2"
              style={{
                height: '32px',
                padding: '0 18px',
                fontSize: '12px',
                borderRadius: '6px',
                background: saved ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.06)',
                color: saved ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.60)',
                border: '1px solid rgba(255,255,255,0.06)',
                cursor: saving ? 'not-allowed' : 'pointer',
                outline: 'none',
                opacity: saving ? 0.5 : 1,
                transform: 'scale(1)',
              }}
              onMouseEnter={e => { if (!saving && !saved) { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; e.currentTarget.style.transform = 'scale(1.02)'; } }}
              onMouseLeave={e => { if (!saving && !saved) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.60)'; e.currentTarget.style.transform = 'scale(1)'; } }}
              onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; }}
              onMouseUp={e => { e.currentTarget.style.transform = 'scale(1.02)'; }}
            >
              {saving ? (
                <Loader2 size={12} className="animate-spin" />
              ) : saved ? (
                <>
                  <Check size={12} />
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
