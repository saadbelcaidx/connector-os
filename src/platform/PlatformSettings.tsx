/**
 * PLATFORM SETTINGS
 *
 * Branding edit form for existing platform configs.
 * State machine: LOADING -> NO_CONFIG (redirect) -> HAS_CONFIG (show form)
 */

import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ChevronLeft, X, Image } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { getMyConfig, updateConfig } from '../services/PlatformConfigService';
import { supabase } from '../lib/supabase';
import Dock from '../Dock';
import type { PlatformConfig } from './types';

type PageState = 'loading' | 'no_config' | 'ready';

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_COLOR = '#3b82f6';

export default function PlatformSettings() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [pageState, setPageState] = useState<PageState>('loading');
  const [config, setConfig] = useState<PlatformConfig | null>(null);

  // Form fields
  const [brandName, setBrandName] = useState('');
  const [headline, setHeadline] = useState('');
  const [subheadline, setSubheadline] = useState('');
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_COLOR);

  // Logo
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [existingLogoUrl, setExistingLogoUrl] = useState<string | null>(null);
  const [removedLogo, setRemovedLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Save state
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load config
  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      setPageState('loading');
      return;
    }
    loadConfig();
  }, [user?.id, authLoading]);

  const loadConfig = async () => {
    if (!user?.id) return;
    try {
      const data = await getMyConfig(user.id);
      if (!data) {
        setPageState('no_config');
        return;
      }
      setConfig(data);
      setBrandName(data.brand_name || '');
      setHeadline(data.headline || '');
      setSubheadline(data.subheadline || '');
      setPrimaryColor(data.primary_color || DEFAULT_COLOR);
      setExistingLogoUrl(data.logo_url || null);
      setPageState('ready');
    } catch (err) {
      console.error('[PlatformSettings] Load failed:', err);
      setPageState('no_config');
    }
  };

  // Redirect if no config
  useEffect(() => {
    if (pageState === 'no_config') {
      navigate('/platform-dashboard', { replace: true });
    }
  }, [pageState, navigate]);

  // Upload logo to Supabase Storage
  const uploadLogo = async (file: File, userId: string): Promise<string | null> => {
    try {
      setUploadingLogo(true);
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const fileName = `${userId}-${Date.now()}.${ext}`;
      const filePath = `logos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('platform-logos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) {
        console.error('[PlatformSettings] Logo upload error:', uploadError);
        return null;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('platform-logos')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (err) {
      console.error('[PlatformSettings] Logo upload failed:', err);
      return null;
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be under 2MB');
      return;
    }

    setLogoFile(file);
    setRemovedLogo(false);

    const reader = new FileReader();
    reader.onload = (ev) => {
      setLogoPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    setRemovedLogo(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!config || !user?.id || saving) return;

    setSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    try {
      // Validate color
      const validColor = HEX_REGEX.test(primaryColor) ? primaryColor : DEFAULT_COLOR;

      // Build payload — only include changed fields
      const payload: Record<string, unknown> = {};

      if (brandName.trim() !== config.brand_name) {
        payload.brand_name = brandName.trim();
      }
      if (headline.trim() !== config.headline) {
        payload.headline = headline.trim();
      }
      if (subheadline.trim() !== (config.subheadline || '')) {
        payload.subheadline = subheadline.trim() || null;
      }
      if (validColor !== config.primary_color) {
        payload.primary_color = validColor;
      }

      // Handle logo: upload new, or remove existing
      if (logoFile) {
        const uploadedUrl = await uploadLogo(logoFile, user.id);
        if (!uploadedUrl) {
          setSaveError('Logo upload failed. Other changes were not saved.');
          setSaving(false);
          return;
        }
        payload.logo_url = uploadedUrl;
      } else if (removedLogo) {
        payload.logo_url = null;
      }

      // Nothing changed
      if (Object.keys(payload).length === 0) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
        setSaving(false);
        return;
      }

      const updated = await updateConfig(config.id, payload as any);
      setConfig(updated);
      setExistingLogoUrl(updated.logo_url || null);
      setLogoFile(null);
      setLogoPreview(null);
      setRemovedLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('[PlatformSettings] Save failed:', err);
      setSaveError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Current logo to display
  const displayLogo = logoPreview || (!removedLogo ? existingLogoUrl : null);

  // Loading
  if (authLoading || pageState === 'loading') {
    return (
      <div className="min-h-screen bg-[#08090a] flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-white/20 animate-spin" />
        <Dock />
      </div>
    );
  }

  // Ready — show form
  return (
    <div className="min-h-screen bg-[#08090a]">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[#08090a]/90 backdrop-blur-xl border-b border-white/[0.04]">
        <div className="max-w-xl mx-auto h-12 px-4 flex items-center">
          <div className="w-16">
            <button
              onClick={() => navigate(`/p/${config?.slug}`)}
              className="group -ml-2 h-8 px-2 flex items-center gap-0.5 text-[13px] text-white/40 hover:text-white/70"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
          </div>
          <div className="flex-1 text-center">
            <span className="text-[14px] font-medium text-white/80">Platform Settings</span>
          </div>
          <div className="w-16" />
        </div>
      </header>

      {/* Form */}
      <main className="max-w-sm mx-auto px-6 py-12">
        <div className="space-y-6">

          {/* Brand Name */}
          <div>
            <label className="block text-[12px] text-white/40 mb-1.5 uppercase tracking-wider">
              Brand name
            </label>
            <input
              type="text"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="Your Company Name"
              className="w-full h-10 px-3 rounded-lg bg-white/[0.03] border border-white/[0.08] text-white text-[14px] placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
            />
          </div>

          {/* Logo */}
          <div>
            <label className="block text-[12px] text-white/40 mb-1.5 uppercase tracking-wider">
              Logo
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
              disabled={saving}
            />
            {displayLogo ? (
              <div className="relative w-full h-24 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center overflow-hidden">
                <img
                  src={displayLogo}
                  alt="Logo preview"
                  className="max-h-16 max-w-[80%] object-contain"
                />
                <button
                  onClick={removeLogo}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70"
                  disabled={saving}
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-24 rounded-xl border border-dashed border-white/[0.12] flex flex-col items-center justify-center gap-2 hover:border-white/20 hover:bg-white/[0.02] transition-all"
                disabled={saving}
              >
                <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center">
                  <Image className="w-4 h-4 text-white/40" />
                </div>
                <span className="text-[12px] text-white/30">
                  Upload logo
                </span>
              </button>
            )}
          </div>

          {/* Headline */}
          <div>
            <label className="block text-[12px] text-white/40 mb-1.5 uppercase tracking-wider">
              Headline
            </label>
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="Strategic Intelligence"
              className="w-full h-10 px-3 rounded-lg bg-white/[0.03] border border-white/[0.08] text-white text-[14px] placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
            />
          </div>

          {/* Subheadline */}
          <div>
            <label className="block text-[12px] text-white/40 mb-1.5 uppercase tracking-wider">
              Subheadline
              <span className="text-white/20 ml-1 normal-case tracking-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={subheadline}
              onChange={(e) => setSubheadline(e.target.value)}
              placeholder="Real-time market intelligence for your sales calls"
              className="w-full h-10 px-3 rounded-lg bg-white/[0.03] border border-white/[0.08] text-white text-[14px] placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
            />
          </div>

          {/* Primary Color */}
          <div>
            <label className="block text-[12px] text-white/40 mb-1.5 uppercase tracking-wider">
              Primary color
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-10 h-10 rounded-lg border border-white/[0.08] bg-transparent cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0.5 [&::-webkit-color-swatch]:rounded"
              />
              <span className="text-[13px] text-white/50 font-mono">{primaryColor}</span>
            </div>
          </div>

          {/* Save Button */}
          <div className="pt-2">
            <button
              onClick={handleSave}
              disabled={saving || !brandName.trim()}
              className={`w-full h-11 rounded-xl flex items-center justify-center gap-2 text-[14px] font-medium transition-all ${
                !saving && brandName.trim()
                  ? 'bg-white text-black hover:scale-[1.01] active:scale-[0.99]'
                  : 'bg-white/[0.06] text-white/25 cursor-not-allowed'
              }`}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{uploadingLogo ? 'Uploading...' : 'Saving...'}</span>
                </>
              ) : (
                'Save changes'
              )}
            </button>
          </div>

          {/* Success message */}
          {saveSuccess && (
            <p className="text-[13px] text-emerald-400 text-center">
              Changes saved.
            </p>
          )}

          {/* Error message */}
          {saveError && (
            <p className="text-[13px] text-red-400 text-center">
              {saveError}
            </p>
          )}
        </div>
      </main>
      <Dock />
    </div>
  );
}
