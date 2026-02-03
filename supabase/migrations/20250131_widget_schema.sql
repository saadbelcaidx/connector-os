-- =============================================================================
-- WHITE LABEL WIDGET SCHEMA
-- Migration: 20250131_widget_schema.sql
--
-- Creates tables for widget configuration, analytics, and supply data storage.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. WIDGET CONFIGURATIONS TABLE
-- Stores operator's widget branding, settings, and subdomain.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS widget_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Subdomain (unique identifier for widget URL)
  subdomain TEXT UNIQUE NOT NULL,

  -- Branding
  company_name TEXT NOT NULL,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#3b82f6',
  background_color TEXT DEFAULT '#000000',

  -- Copy
  headline TEXT DEFAULT 'Find your strategic partners',
  cta_text TEXT DEFAULT 'Analyze Fit',

  -- Status
  enabled BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Subdomain validation constraint
-- 3-30 chars, alphanumeric + hyphens, no leading/trailing hyphens
ALTER TABLE widget_configs
ADD CONSTRAINT widget_configs_subdomain_format
CHECK (subdomain ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$');

-- Reserved subdomains constraint
ALTER TABLE widget_configs
ADD CONSTRAINT widget_configs_subdomain_reserved
CHECK (subdomain NOT IN ('www', 'api', 'app', 'admin', 'help', 'support', 'widget', 'test', 'demo', 'staging'));

-- Index for fast subdomain lookups
CREATE INDEX IF NOT EXISTS idx_widget_configs_subdomain ON widget_configs(subdomain);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_widget_configs_user_id ON widget_configs(user_id);

-- -----------------------------------------------------------------------------
-- 2. WIDGET ANALYTICS TABLE
-- Tracks widget events (views, simulations, match clicks).
-- Fire-and-forget — never blocks UX.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS widget_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_id UUID REFERENCES widget_configs(id) ON DELETE CASCADE,

  -- Event data
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'simulate', 'match_shown', 'match_clicked')),
  event_data JSONB,

  -- Visitor info
  visitor_domain TEXT,              -- Company domain they searched
  matches_count INTEGER,            -- Number of matches returned

  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for analytics queries by widget
CREATE INDEX IF NOT EXISTS idx_widget_analytics_widget_id ON widget_analytics(widget_id);

-- Index for time-based analytics
CREATE INDEX IF NOT EXISTS idx_widget_analytics_created_at ON widget_analytics(created_at);

-- Index for event type filtering
CREATE INDEX IF NOT EXISTS idx_widget_analytics_event_type ON widget_analytics(event_type);

-- -----------------------------------------------------------------------------
-- 3. SUPPLY DATA COLUMN
-- Add widget supply data to operator_settings (JSONB array of supply records).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'widget_supply_data'
  ) THEN
    ALTER TABLE operator_settings
    ADD COLUMN widget_supply_data JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS)
-- Users can only access their own widget configs.
-- -----------------------------------------------------------------------------

-- Enable RLS on widget_configs
ALTER TABLE widget_configs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can SELECT their own configs
CREATE POLICY "Users can view own widget configs"
  ON widget_configs
  FOR SELECT
  USING (user_id = auth.uid());

-- Policy: Users can INSERT their own configs
CREATE POLICY "Users can create widget configs"
  ON widget_configs
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Policy: Users can UPDATE their own configs
CREATE POLICY "Users can update own widget configs"
  ON widget_configs
  FOR UPDATE
  USING (user_id = auth.uid());

-- Policy: Users can DELETE their own configs
CREATE POLICY "Users can delete own widget configs"
  ON widget_configs
  FOR DELETE
  USING (user_id = auth.uid());

-- Public read policy for widget embedding (visitors need to load config)
CREATE POLICY "Anyone can view enabled widget configs by subdomain"
  ON widget_configs
  FOR SELECT
  USING (enabled = true);

-- Enable RLS on widget_analytics
ALTER TABLE widget_analytics ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can INSERT analytics (fire-and-forget from widget)
CREATE POLICY "Anyone can insert widget analytics"
  ON widget_analytics
  FOR INSERT
  WITH CHECK (true);

-- Policy: Users can view analytics for their own widgets
CREATE POLICY "Users can view own widget analytics"
  ON widget_analytics
  FOR SELECT
  USING (
    widget_id IN (
      SELECT id FROM widget_configs WHERE user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 5. UPDATED_AT TRIGGER
-- Auto-update updated_at timestamp on widget_configs changes.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_widget_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_widget_configs_updated_at ON widget_configs;

CREATE TRIGGER trigger_widget_configs_updated_at
  BEFORE UPDATE ON widget_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_widget_configs_updated_at();

-- -----------------------------------------------------------------------------
-- 6. RATE LIMITING TABLE (Optional — can use in-memory if preferred)
-- Tracks simulation counts per widget for rate limiting.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS widget_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_id UUID REFERENCES widget_configs(id) ON DELETE CASCADE,
  hour_bucket TIMESTAMP WITH TIME ZONE NOT NULL,  -- Truncated to hour
  simulation_count INTEGER DEFAULT 0,

  UNIQUE(widget_id, hour_bucket)
);

-- Index for rate limit lookups
CREATE INDEX IF NOT EXISTS idx_widget_rate_limits_lookup
  ON widget_rate_limits(widget_id, hour_bucket);

-- Cleanup old rate limit records (keep only last 24 hours)
-- Run this as a cron job or on-demand
CREATE OR REPLACE FUNCTION cleanup_widget_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM widget_rate_limits
  WHERE hour_bucket < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
