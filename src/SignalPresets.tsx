import { useState } from 'react';
import { ArrowLeft, Copy, Check, Sparkles, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Dock from './Dock';
import { PRESET_PACKS, SignalPresetConfig, NichePreset } from './services/PresetsService';
import { supabase } from './lib/supabase';

interface PresetCardProps {
  title: string;
  config: SignalPresetConfig;
  onCopyJson: () => void;
  onApply: () => void;
  copied: boolean;
}

function PresetCard({ title, config, onCopyJson, onApply, copied, isApplying }: PresetCardProps & { isApplying: boolean }) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div
      className="relative bg-gradient-to-br from-[#0F0F0F] to-[#0A0A0A] border border-[#1C1C1C] rounded-xl p-5 transition-all duration-300 hover:border-[#26F7C7] hover:shadow-[0_0_30px_rgba(38,247,199,0.15)] group"
      onMouseEnter={() => setShowPreview(true)}
      onMouseLeave={() => setShowPreview(false)}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="text-[14px] font-semibold text-white mb-1">{title}</h4>
          <p className="text-[11px] text-white text-opacity-50">{config.provider}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded text-[10px] font-medium ${
            config.method === 'GET'
              ? 'bg-blue-500 bg-opacity-20 text-blue-400'
              : 'bg-purple-500 bg-opacity-20 text-purple-400'
          }`}>
            {config.method}
          </span>
        </div>
      </div>

      <p className="text-[11px] text-white text-opacity-60 mb-4 line-clamp-2">
        {config.description}
      </p>

      <div className="space-y-2 mb-4">
        <div className="text-[10px] text-white text-opacity-40">
          <span className="font-medium">URL:</span>
          <div className="bg-[#0A0A0A] border border-[#1C1C1C] rounded px-2 py-1 mt-1 font-mono text-[9px] break-all">
            {config.url}
          </div>
        </div>

        {Object.keys(config.headers).length > 0 && (
          <div className="text-[10px] text-white text-opacity-40">
            <span className="font-medium">Headers:</span>
            <div className="bg-[#0A0A0A] border border-[#1C1C1C] rounded px-2 py-1 mt-1 font-mono text-[9px]">
              {JSON.stringify(config.headers, null, 2)}
            </div>
          </div>
        )}

        {config.method === 'POST' && Object.keys(config.body).length > 0 && (
          <div className="text-[10px] text-white text-opacity-40">
            <span className="font-medium">Body:</span>
            <div className="bg-[#0A0A0A] border border-[#1C1C1C] rounded px-2 py-1 mt-1 font-mono text-[9px]">
              {JSON.stringify(config.body, null, 2)}
            </div>
          </div>
        )}
      </div>

      {showPreview && (
        <div className="absolute left-0 right-0 top-full mt-2 bg-[#0F0F0F] border border-[#26F7C7] rounded-xl p-4 z-50 shadow-[0_0_40px_rgba(38,247,199,0.25)] animate-[fadeIn_0.2s_ease-out]">
          <div className="space-y-3">
            <div>
              <p className="text-[10px] text-white text-opacity-50 mb-1">Expected Response:</p>
              <p className="text-[11px] text-white text-opacity-80 font-mono">{config.exampleResponse}</p>
            </div>
            <div>
              <p className="text-[10px] text-white text-opacity-50 mb-1">Format:</p>
              <p className="text-[9px] text-white text-opacity-60 font-mono bg-[#0A0A0A] p-2 rounded">
                {config.expectedFormat}
              </p>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-[#1C1C1C]">
              <div>
                <p className="text-[10px] text-white text-opacity-50">Cost: <span className="text-white text-opacity-80">{config.apiCost}</span></p>
                <p className="text-[10px] text-white text-opacity-50">Cooldown: <span className="text-white text-opacity-80">{config.cooldown}</span></p>
              </div>
            </div>
            {config.requiredFields.length > 0 && (
              <div>
                <p className="text-[10px] text-white text-opacity-50 mb-1">Required:</p>
                <ul className="text-[9px] text-white text-opacity-60 space-y-1">
                  {config.requiredFields.map((field, i) => (
                    <li key={i}>• {field}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onCopyJson}
          className="flex-1 flex items-center justify-center gap-2 bg-[#1C1C1C] hover:bg-[#252525] text-white text-opacity-80 hover:text-opacity-100 py-2 px-3 rounded-lg text-[11px] font-medium transition-all duration-200"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied!' : 'Copy JSON'}
        </button>
        <button
          onClick={onApply}
          disabled={isApplying}
          className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-[#26F7C7] to-[#1E9B7E] hover:from-[#1FD4A8] hover:to-[#177A5F] text-black py-2 px-3 rounded-lg text-[11px] font-semibold transition-all duration-200 shadow-[0_0_20px_rgba(38,247,199,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isApplying ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-black/40 border-t-transparent" />
              Applying…
            </>
          ) : (
            <>
              <Sparkles className="w-3 h-3" />
              Apply to Settings
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function SignalPresets() {
  const navigate = useNavigate();
  const [copiedSignal, setCopiedSignal] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [applyingSignal, setApplyingSignal] = useState<string | null>(null);

  const copyJsonConfig = (config: SignalPresetConfig, signalType: string) => {
    const jsonConfig = {
      url: config.url,
      method: config.method,
      headers: config.headers,
      body: config.body,
      apiKey: config.apiKey,
    };

    navigator.clipboard.writeText(JSON.stringify(jsonConfig, null, 2));
    setCopiedSignal(signalType);
    setTimeout(() => setCopiedSignal(null), 2000);
  };

  const applyPreset = async (config: SignalPresetConfig, signalType: 'jobs' | 'funding' | 'layoffs' | 'hiring' | 'tech', presetName: string) => {
    setApplyingSignal(signalType);

    try {
      const updateData: any = {};

      if (signalType === 'jobs') {
        updateData.jobs_api_url = config.url;
        updateData.jobs_method = config.method;
        updateData.jobs_headers = config.headers;
        updateData.jobs_body = config.body;
        updateData.jobs_api_key = config.apiKey;
      } else if (signalType === 'funding') {
        updateData.funding_api_url = config.url;
        updateData.funding_method = config.method;
        updateData.funding_headers = config.headers;
        updateData.funding_body = config.body;
        updateData.funding_api_key = config.apiKey;
      } else if (signalType === 'layoffs') {
        updateData.layoffs_api_url = config.url;
        updateData.layoffs_method = config.method;
        updateData.layoffs_headers = config.headers;
        updateData.layoffs_body = config.body;
        updateData.layoffs_api_key = config.apiKey;
      } else if (signalType === 'hiring') {
        updateData.hiring_api_url = config.url;
        updateData.hiring_method = config.method;
        updateData.hiring_headers = config.headers;
        updateData.hiring_body = config.body;
        updateData.hiring_api_key = config.apiKey;
      } else if (signalType === 'tech') {
        updateData.tech_api_url = config.url;
        updateData.tech_method = config.method;
        updateData.tech_headers = config.headers;
        updateData.tech_body = config.body;
        updateData.tech_api_key = config.apiKey;
      }

      updateData.updated_at = new Date().toISOString();

      const { error } = await supabase
        .from('operator_settings')
        .upsert(
          { user_id: 'default', ...updateData },
          { onConflict: 'user_id' }
        );

      if (error) throw error;

      setToast(`${signalType.charAt(0).toUpperCase() + signalType.slice(1)} preset applied!`);
      setTimeout(() => setToast(null), 3000);
    } catch (error) {
      console.error('Preset failed:', error);
      setToast('Could not apply preset. Try again.');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setApplyingSignal(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0E0E0E] to-[#0A0A0A] text-white px-8 py-12 pb-32">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/settings')}
            className="p-2 hover:bg-[#1C1C1C] rounded-lg transition-all duration-200"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-[32px] font-bold">Signal Presets Library</h1>
              <span className="bg-gradient-to-r from-[#26F7C7] to-[#1E9B7E] text-black text-[11px] font-bold px-3 py-1 rounded-full">
                V3.8
              </span>
            </div>
            <p className="text-[14px] text-white text-opacity-50">
              Pre-configured API settings for popular niches. One-click setup with enterprise providers.
            </p>
          </div>
        </div>

        <div className="space-y-12">
          {PRESET_PACKS.map((pack: NichePreset) => (
            <div key={pack.name} className="bg-[#0C0C0C] rounded-2xl p-8 border border-[#1C1C1C]">
              <div className="mb-6">
                <h2 className="text-[24px] font-bold text-white mb-2">{pack.name}</h2>
                <p className="text-[13px] text-white text-opacity-60">{pack.description}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <PresetCard
                  title="Job Postings"
                  config={pack.jobs}
                  copied={copiedSignal === `${pack.name}-jobs`}
                  onCopyJson={() => copyJsonConfig(pack.jobs, `${pack.name}-jobs`)}
                  onApply={() => applyPreset(pack.jobs, 'jobs', pack.name)}
                  isApplying={applyingSignal === 'jobs'}
                />

                <PresetCard
                  title="Funding Events"
                  config={pack.funding}
                  copied={copiedSignal === `${pack.name}-funding`}
                  onCopyJson={() => copyJsonConfig(pack.funding, `${pack.name}-funding`)}
                  onApply={() => applyPreset(pack.funding, 'funding', pack.name)}
                  isApplying={applyingSignal === 'funding'}
                />

                <PresetCard
                  title="Layoffs"
                  config={pack.layoffs}
                  copied={copiedSignal === `${pack.name}-layoffs`}
                  onCopyJson={() => copyJsonConfig(pack.layoffs, `${pack.name}-layoffs`)}
                  onApply={() => applyPreset(pack.layoffs, 'layoffs', pack.name)}
                  isApplying={applyingSignal === 'layoffs'}
                />

                <PresetCard
                  title="Hiring Velocity"
                  config={pack.hiring}
                  copied={copiedSignal === `${pack.name}-hiring`}
                  onCopyJson={() => copyJsonConfig(pack.hiring, `${pack.name}-hiring`)}
                  onApply={() => applyPreset(pack.hiring, 'hiring', pack.name)}
                  isApplying={applyingSignal === 'hiring'}
                />

                <PresetCard
                  title="Tech Stack Signals"
                  config={pack.tech}
                  copied={copiedSignal === `${pack.name}-tech`}
                  onCopyJson={() => copyJsonConfig(pack.tech, `${pack.name}-tech`)}
                  onApply={() => applyPreset(pack.tech, 'tech', pack.name)}
                  isApplying={applyingSignal === 'tech'}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 bg-gradient-to-br from-[#1C1C1C] to-[#0F0F0F] border border-[#26F7C7] border-opacity-30 rounded-2xl p-8">
          <div className="flex items-start gap-4">
            <ExternalLink className="w-6 h-6 text-[#26F7C7] flex-shrink-0 mt-1" />
            <div>
              <h3 className="text-[16px] font-semibold text-white mb-2">Need Custom API Support?</h3>
              <p className="text-[13px] text-white text-opacity-70 mb-4">
                These presets use popular enterprise APIs. If you need support for a different provider, you can:
              </p>
              <ul className="text-[12px] text-white text-opacity-60 space-y-2 mb-4">
                <li>• Manually configure any REST endpoint in Settings</li>
                <li>• Use the "Copy JSON Config" to see the format and modify it</li>
                <li>• Contact support for custom preset creation</li>
              </ul>
              <button
                onClick={() => navigate('/settings')}
                className="bg-[#26F7C7] hover:bg-[#1FD4A8] text-black px-6 py-2 rounded-lg text-[12px] font-semibold transition-all duration-200"
              >
                Go to Manual Settings
              </button>
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-8 right-8 bg-gradient-to-r from-[#26F7C7] to-[#1E9B7E] text-black px-6 py-4 rounded-xl shadow-[0_0_40px_rgba(38,247,199,0.4)] animate-[slideIn_0.3s_ease-out] flex items-center gap-3 z-50">
          <Check className="w-5 h-5" />
          <span className="font-semibold">{toast}</span>
        </div>
      )}

      <Dock />
    </div>
  );
}

export default SignalPresets;
