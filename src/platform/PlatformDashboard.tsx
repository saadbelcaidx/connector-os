/**
 * PLATFORM DASHBOARD
 *
 * State machine:
 * 1. LOADING: authLoading=true OR loading=true
 * 2. NO_USER: authLoading=false, user=null (shouldn't happen behind PrivateRoute)
 * 3. NO_CONFIG: user exists, config=null → show setup form
 * 4. HAS_CONFIG: user exists, config exists → AUTO-REDIRECT to /platform/:slug
 */

import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ChevronLeft, Sparkles, Upload, X, Image } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { getMyConfig, createConfig, checkSlugAvailability } from '../services/PlatformConfigService';
import { supabase } from '../lib/supabase';
import Dock from '../Dock';
import type { PlatformConfig } from './types';

export default function PlatformDashboard() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [brandName, setBrandName] = useState('');

  // Logo upload state
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load config when user is available
  useEffect(() => {
    if (authLoading) return;

    if (!user?.id) {
      setLoading(false);
      return;
    }

    loadConfig();
  }, [user?.id, authLoading]);

  // AUTO-REDIRECT: If user has config, go directly to their platform
  useEffect(() => {
    if (!loading && config?.slug) {
      navigate(`/platform/${config.slug}`, { replace: true });
    }
  }, [loading, config, navigate]);

  const loadConfig = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      const data = await getMyConfig(user.id);
      setConfig(data);
    } catch (err) {
      console.error('[PlatformDashboard] Load failed:', err);
    } finally {
      setLoading(false);
    }
  };

  // Generate unique slug with collision handling
  const generateUniqueSlug = async (name: string): Promise<string> => {
    let baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 25); // Leave room for suffix

    // Ensure minimum length
    if (baseSlug.length < 3) {
      baseSlug = baseSlug + '-platform';
    }

    // Check availability
    const check = await checkSlugAvailability(baseSlug);
    if (check.available) {
      return baseSlug;
    }

    // If taken, append random suffix
    const suffix = Math.random().toString(36).slice(2, 6);
    return `${baseSlug}-${suffix}`;
  };

  // Upload logo to Supabase Storage
  const uploadLogo = async (file: File, userId: string): Promise<string | null> => {
    try {
      setUploadingLogo(true);

      // Generate unique filename
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const fileName = `${userId}-${Date.now()}.${ext}`;
      const filePath = `logos/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('platform-logos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) {
        console.error('[PlatformDashboard] Logo upload error:', uploadError);
        return null;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('platform-logos')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (err) {
      console.error('[PlatformDashboard] Logo upload failed:', err);
      return null;
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be under 2MB');
      return;
    }

    setLogoFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setLogoPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCreate = async () => {
    if (!user?.id) {
      console.error('[PlatformDashboard] No user');
      return;
    }
    if (!brandName.trim()) {
      console.error('[PlatformDashboard] No brand name');
      return;
    }

    // Prevent double submission
    if (creating) return;

    setCreating(true);
    try {
      // Generate unique slug
      const slug = await generateUniqueSlug(brandName.trim());

      // Upload logo if provided
      let logoUrl: string | undefined;
      if (logoFile) {
        const uploaded = await uploadLogo(logoFile, user.id);
        if (uploaded) {
          logoUrl = uploaded;
        }
      }

      // Create config with defaults
      const newConfig = await createConfig({
        slug,
        brand_name: brandName.trim(),
        logo_url: logoUrl,
        primary_color: '#3b82f6',
        headline: 'Strategic Intelligence',
      }, user.id);

      // Redirect to platform (useEffect will handle this when config is set)
      setConfig(newConfig);
    } catch (err) {
      console.error('[PlatformDashboard] Create failed:', err);
      alert('Failed to create platform. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  // STATE 1: Loading
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#08090a] flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-white/20 animate-spin" />
        <Dock />
      </div>
    );
  }

  // STATE 2: No user (shouldn't happen behind PrivateRoute)
  if (!user) {
    return (
      <div className="min-h-screen bg-[#08090a] flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/50 mb-4">Authentication required</p>
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-2 bg-white text-black rounded-lg"
          >
            Login
          </button>
        </div>
        <Dock />
      </div>
    );
  }

  // STATE 3: No config - show setup form
  // (STATE 4 is handled by auto-redirect useEffect)
  if (!config) {
    return (
      <div className="min-h-screen bg-[#08090a]">
        <Header onBack={() => navigate('/launcher')} />

        <main className="flex-1 flex items-center justify-center px-6 py-20">
          <div className="text-center max-w-sm w-full">
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 flex items-center justify-center mx-auto mb-6">
              <Sparkles className="w-6 h-6 text-cyan-400" />
            </div>
            <h2 className="text-[18px] font-semibold text-white/90 mb-2">
              Create Your Platform
            </h2>
            <p className="text-[14px] text-white/40 mb-8">
              Your branded intelligence portal.
            </p>

            <div className="space-y-4">
              {/* Brand Name Input */}
              <div>
                <input
                  type="text"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="Your Company Name"
                  className="w-full h-12 px-4 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white text-center placeholder:text-white/25 focus:outline-none focus:border-white/20"
                  onKeyDown={(e) => e.key === 'Enter' && !creating && brandName.trim() && handleCreate()}
                  disabled={creating}
                />
              </div>

              {/* Logo Upload */}
              <div className="relative">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={creating}
                />

                {logoPreview ? (
                  <div className="relative w-full h-24 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center overflow-hidden">
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      className="max-h-16 max-w-[80%] object-contain"
                    />
                    <button
                      onClick={removeLogo}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70"
                      disabled={creating}
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-24 rounded-xl border border-dashed border-white/[0.12] flex flex-col items-center justify-center gap-2 hover:border-white/20 hover:bg-white/[0.02] transition-all"
                    disabled={creating}
                  >
                    <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center">
                      {uploadingLogo ? (
                        <Loader2 className="w-4 h-4 text-white/40 animate-spin" />
                      ) : (
                        <Image className="w-4 h-4 text-white/40" />
                      )}
                    </div>
                    <span className="text-[12px] text-white/30">
                      Upload logo (optional)
                    </span>
                  </button>
                )}
              </div>

              {/* Create Button */}
              <button
                onClick={handleCreate}
                disabled={!brandName.trim() || creating}
                className={`w-full h-12 rounded-xl flex items-center justify-center gap-2 text-[15px] font-medium transition-all ${
                  brandName.trim() && !creating
                    ? 'bg-white text-black hover:scale-[1.01] active:scale-[0.99]'
                    : 'bg-white/[0.06] text-white/25 cursor-not-allowed'
                }`}
              >
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{uploadingLogo ? 'Uploading...' : 'Creating...'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Create Platform
                  </>
                )}
              </button>
            </div>
          </div>
        </main>
        <Dock />
      </div>
    );
  }

  // STATE 4: Has config - auto-redirect handles this
  // Show loading while redirect happens
  return (
    <div className="min-h-screen bg-[#08090a] flex items-center justify-center">
      <Loader2 className="w-5 h-5 text-white/20 animate-spin" />
      <Dock />
    </div>
  );
}

// Simple header component
function Header({ onBack }: { onBack: () => void }) {
  return (
    <header className="sticky top-0 z-20 bg-[#08090a]/90 backdrop-blur-xl border-b border-white/[0.04]">
      <div className="max-w-xl mx-auto h-12 px-4 flex items-center">
        <div className="w-16">
          <button
            onClick={onBack}
            className="group -ml-2 h-8 px-2 flex items-center gap-0.5 text-[13px] text-white/40 hover:text-white/70"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400/70" />
          <span className="text-[14px] font-medium text-white/80">Platform</span>
        </div>
        <div className="w-16" />
      </div>
    </header>
  );
}
