/**
 * STRATEGIC ALIGNMENT PLATFORM
 * Real-time intelligence for live sales calls.
 * Design: Linear + Apple iOS — light, fast, "launching a rocket"
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Intelligence from './Intelligence';
import ErrorState from './ErrorState';
import type { PlatformConfig } from './types';
import type { AIProvider } from './IntelligenceService';

// CSS Keyframes
const injectStyles = () => {
  if (document.getElementById('platform-animations')) return;
  const style = document.createElement('style');
  style.id = 'platform-animations';
  style.textContent = `
    @keyframes platformFadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .platform-fade-in {
      animation: platformFadeIn 0.25s ease-out both;
    }
  `;
  document.head.appendChild(style);
};

type AppState = 'loading' | 'ready' | 'error';

export default function PlatformApp() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [state, setState] = useState<AppState>('loading');
  const [config, setConfig] = useState<PlatformConfig | null>(null);

  // API keys for Intelligence (multi-provider support)
  const [apiKeys, setApiKeys] = useState<{
    exaKey: string;
    apolloKey: string;
    aiProvider: AIProvider;
    aiKey: string;
    azureEndpoint?: string;
    azureDeployment?: string;
    predictLeadsKey?: string;
    predictLeadsToken?: string;
  }>({
    exaKey: '',
    apolloKey: '',
    aiProvider: 'openai',
    aiKey: '',
  });

  // Load API keys from localStorage (supports all AI providers)
  useEffect(() => {
    try {
      const guestSettings = localStorage.getItem('guest_settings');
      const aiSettingsStr = localStorage.getItem('ai_settings');
      const platformKeysStr = localStorage.getItem('platform_keys');

      let exaKey = '';
      let apolloKey = '';
      let aiProvider: AIProvider = 'openai';
      let aiKey = '';
      let azureEndpoint: string | undefined;
      let azureDeployment: string | undefined;
      let predictLeadsKey: string | undefined;
      let predictLeadsToken: string | undefined;

      // Priority 1: Load from platform_keys (set by Settings for all users)
      if (platformKeysStr) {
        const platformKeys = JSON.parse(platformKeysStr);
        exaKey = platformKeys.exaApiKey || '';
        apolloKey = platformKeys.apolloApiKey || '';
        predictLeadsKey = platformKeys.predictLeadsApiKey || '';
        predictLeadsToken = platformKeys.predictLeadsApiToken || '';
      }

      // Priority 2: Fall back to guest_settings (legacy support)
      if (!exaKey && guestSettings) {
        const parsed = JSON.parse(guestSettings);
        exaKey = parsed.exaApiKey || parsed.settings?.exaApiKey || '';
        apolloKey = apolloKey || parsed.apolloApiKey || parsed.settings?.apolloApiKey || '';
      }

      // Load AI config from ai_settings (where Settings.tsx saves for all users)
      if (aiSettingsStr) {
        const aiSettings = JSON.parse(aiSettingsStr);
        aiProvider = (aiSettings.aiProvider || 'openai') as AIProvider;

        // Get the key based on provider
        switch (aiProvider) {
          case 'openai':
            aiKey = aiSettings.openaiApiKey || '';
            break;
          case 'azure':
            aiKey = aiSettings.azureApiKey || '';
            azureEndpoint = aiSettings.azureEndpoint;
            azureDeployment = aiSettings.azureDeployment;
            break;
          case 'anthropic':
            aiKey = aiSettings.claudeApiKey || '';
            break;
        }
      }

      console.log('[PlatformApp] Loaded from localStorage:');
      console.log('[PlatformApp] apolloKey:', apolloKey ? `${apolloKey.slice(0,8)}...` : 'EMPTY');
      console.log('[PlatformApp] exaKey:', exaKey ? `${exaKey.slice(0,8)}...` : 'EMPTY');
      console.log('[PlatformApp] Setting apiKeys state with apolloKey:', !!apolloKey);
      setApiKeys({ exaKey, apolloKey, aiProvider, aiKey, azureEndpoint, azureDeployment, predictLeadsKey, predictLeadsToken });
    } catch (e) {
      console.error('Failed to load API keys:', e);
    }
  }, []);

  // Load platform config
  useEffect(() => {
    injectStyles();
    if (slug) loadConfig(slug);
  }, [slug]);

  const loadConfig = async (platformSlug: string) => {
    setState('loading');
    try {
      const { data, error } = await supabase
        .from('platform_configs')
        .select('id, slug, brand_name, logo_url, primary_color, headline, subheadline, cta_text')
        .eq('slug', platformSlug.toLowerCase())
        .eq('enabled', true)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) throw new Error('Not found');

      setConfig(data);
      setState('ready');
    } catch {
      setState('error');
    }
  };

  // Loading state
  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-[#08090a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-5 h-5 text-white/20 animate-spin" />
          <span className="text-[13px] text-white/30">Loading...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (state === 'error') {
    return (
      <div className="min-h-screen bg-[#08090a] flex items-center justify-center px-6">
        <div className="platform-fade-in">
          <ErrorState
            type="config_not_found"
            onSettings={() => navigate('/settings')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#08090a]">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[#08090a]/90 backdrop-blur-xl border-b border-white/[0.04]">
        <div className="max-w-4xl mx-auto h-12 px-4 flex items-center justify-center gap-2">
          {config?.logo_url ? (
            <img src={config.logo_url} alt="" className="h-5" />
          ) : (
            <div
              className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-semibold text-white/90"
              style={{ background: config?.primary_color || '#3b3b3b' }}
            >
              {config?.brand_name?.[0] || 'S'}
            </div>
          )}
          <span className="text-[14px] font-medium text-white/80">
            {config?.brand_name || 'Platform'}
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-5 py-12">
        <div className="platform-fade-in">
          {/* Header - Member's branding, NOT Connector OS */}
          <div className="text-center mb-10">
            <h1 className="text-[24px] font-semibold text-white/95 tracking-[-0.02em] mb-2">
              {config?.headline || 'Strategic Intelligence'}
            </h1>
            {config?.subheadline && (
              <p className="text-[15px] text-white/40 leading-relaxed">
                {config.subheadline}
              </p>
            )}
          </div>

          {/* Intelligence */}
          <Intelligence
            exaKey={apiKeys.exaKey}
            aiProvider={apiKeys.aiProvider}
            aiKey={apiKeys.aiKey}
            azureEndpoint={apiKeys.azureEndpoint}
            azureDeployment={apiKeys.azureDeployment}
            apolloKey={apiKeys.apolloKey}
            predictLeadsKey={apiKeys.predictLeadsKey}
            predictLeadsToken={apiKeys.predictLeadsToken}
          />
        </div>
      </main>
    </div>
  );
}
