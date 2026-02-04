/**
 * PLATFORM CONFIG SERVICE
 *
 * CRUD operations for platform configurations.
 * SSM-gated: Only SSM members can access.
 */

import { supabase } from '../lib/supabase';
import type { PlatformConfig } from '../platform/types';
import { RESERVED_SLUGS } from '../platform/constants';

// =============================================================================
// TYPES
// =============================================================================

interface CreateConfigInput {
  slug: string;
  brand_name: string;
  logo_url?: string;
  primary_color?: string;
  headline?: string;
  cta_text?: string;
}

interface UpdateConfigInput {
  brand_name?: string;
  logo_url?: string;
  primary_color?: string;
  headline?: string;
  subheadline?: string;
  cta_text?: string;
  enabled?: boolean;
}

interface SlugCheckResult {
  available: boolean;
  reason?: 'reserved' | 'taken' | 'invalid_format';
  suggestions?: string[];
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate slug format.
 * Rules: 3-30 chars, alphanumeric + hyphens, no leading/trailing hyphens
 */
export function isValidSlug(slug: string): boolean {
  const pattern = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
  return pattern.test(slug.toLowerCase());
}

/**
 * Check if slug is available.
 */
export async function checkSlugAvailability(slug: string): Promise<SlugCheckResult> {
  const normalized = slug.toLowerCase().trim();

  // Check format
  if (!isValidSlug(normalized)) {
    return {
      available: false,
      reason: 'invalid_format',
    };
  }

  // Check reserved words
  if (RESERVED_SLUGS.includes(normalized)) {
    return {
      available: false,
      reason: 'reserved',
      suggestions: await generateSlugSuggestions(normalized),
    };
  }

  // Check database
  const { data, error } = await supabase
    .from('platform_configs')
    .select('id')
    .eq('slug', normalized)
    .maybeSingle();

  if (error) {
    console.error('[PlatformConfig] Slug check error:', error);
    throw new Error('Unable to verify slug availability');
  }

  if (data) {
    return {
      available: false,
      reason: 'taken',
      suggestions: await generateSlugSuggestions(normalized),
    };
  }

  return { available: true };
}

/**
 * Generate alternative slug suggestions.
 */
async function generateSlugSuggestions(base: string): Promise<string[]> {
  const variations = [
    `${base}-co`,
    `${base}-group`,
    `${base}-partners`,
    `the-${base}`,
    `${base}-hq`,
  ];

  const available: string[] = [];

  for (const v of variations) {
    if (!isValidSlug(v)) continue;

    const { data } = await supabase
      .from('platform_configs')
      .select('id')
      .eq('slug', v)
      .maybeSingle();

    if (!data && !RESERVED_SLUGS.includes(v)) {
      available.push(v);
      if (available.length >= 3) break;
    }
  }

  return available;
}

// =============================================================================
// CRUD OPERATIONS
// =============================================================================

/**
 * Get platform config by slug.
 */
export async function getConfigBySlug(slug: string): Promise<PlatformConfig | null> {
  const { data, error } = await supabase
    .from('platform_configs')
    .select('*')
    .eq('slug', slug.toLowerCase())
    .eq('enabled', true)
    .maybeSingle();

  if (error) {
    console.error('[PlatformConfig] Get by slug error:', error);
    return null;
  }

  return data;
}

/**
 * Get platform config for current user.
 * @param userId - Optional user ID (pass from context to avoid race condition)
 */
export async function getMyConfig(userId?: string): Promise<PlatformConfig | null> {
  let uid = userId;

  // If no userId passed, try to get from supabase auth
  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser();
    uid = user?.id;
  }

  if (!uid) {
    console.error('[PlatformConfig] No authenticated user');
    return null;
  }

  const { data, error } = await supabase
    .from('platform_configs')
    .select('*')
    .eq('user_id', uid)
    .maybeSingle();

  if (error) {
    console.error('[PlatformConfig] Get my config error:', error);
    return null;
  }

  return data;
}

/**
 * Create new platform config.
 * @param input - Config data (slug, brand_name, etc.)
 * @param userId - Optional user ID (pass from context to avoid race condition)
 */
export async function createConfig(input: CreateConfigInput, userId?: string): Promise<PlatformConfig> {
  let uid = userId;

  // If no userId passed, try to get from supabase auth
  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser();
    uid = user?.id;
  }

  if (!uid) {
    throw new Error('Authentication required');
  }

  // Validate slug
  const slugCheck = await checkSlugAvailability(input.slug);
  if (!slugCheck.available) {
    throw new Error(`Slug unavailable: ${slugCheck.reason}`);
  }

  const { data, error } = await supabase
    .from('platform_configs')
    .insert({
      user_id: uid,
      slug: input.slug.toLowerCase(),
      brand_name: input.brand_name,
      logo_url: input.logo_url || null,
      primary_color: input.primary_color || '#3b82f6',
      headline: input.headline || 'Identify strategic alignments',
      cta_text: input.cta_text || 'Analyze',
    })
    .select()
    .single();

  if (error) {
    console.error('[PlatformConfig] Create error:', error);
    throw new Error('Failed to create platform configuration');
  }

  return data;
}

/**
 * Update existing platform config.
 */
export async function updateConfig(
  configId: string,
  input: UpdateConfigInput
): Promise<PlatformConfig> {
  const { data, error } = await supabase
    .from('platform_configs')
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq('id', configId)
    .select()
    .single();

  if (error) {
    console.error('[PlatformConfig] Update error:', error);
    throw new Error('Failed to update platform configuration');
  }

  return data;
}

/**
 * Delete platform config.
 */
export async function deleteConfig(configId: string): Promise<void> {
  const { error } = await supabase
    .from('platform_configs')
    .delete()
    .eq('id', configId);

  if (error) {
    console.error('[PlatformConfig] Delete error:', error);
    throw new Error('Failed to delete platform configuration');
  }
}

// =============================================================================
// ANALYTICS
// =============================================================================

/**
 * Log analytics event.
 */
export async function logAnalyticsEvent(
  configId: string,
  eventType: string,
  eventData: Record<string, unknown> = {}
): Promise<void> {
  try {
    await supabase.from('platform_analytics').insert({
      platform_config_id: configId,
      event_type: eventType,
      event_data: eventData,
    });
  } catch (error) {
    // Fire and forget - don't block UX
    console.warn('[PlatformConfig] Analytics log error:', error);
  }
}
