-- =============================================================================
-- STRATEGIC ALIGNMENT PLATFORM — DATABASE SCHEMA
-- Version: 1.0
-- Date: February 2025
-- Access: SSM-gated (Super Seat Membership required)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. PLATFORM CONFIGURATIONS
-- Member branding, slug, and settings
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS platform_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,              -- URL path: /platform/{slug}
  brand_name TEXT NOT NULL,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#3b82f6',
  background_color TEXT DEFAULT '#000000',
  headline TEXT DEFAULT 'Identify strategic alignments',
  cta_text TEXT DEFAULT 'Analyze',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Slug validation constraint
ALTER TABLE platform_configs
ADD CONSTRAINT platform_configs_slug_format
CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$');

-- Index for fast slug lookups
CREATE INDEX IF NOT EXISTS idx_platform_configs_slug ON platform_configs(slug);
CREATE INDEX IF NOT EXISTS idx_platform_configs_user ON platform_configs(user_id);

-- -----------------------------------------------------------------------------
-- 2. PLATFORM ANALYTICS
-- Engagement intelligence tracking
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS platform_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_config_id UUID REFERENCES platform_configs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,               -- 'platform_accessed', 'search_executed', etc.
  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_platform_analytics_config ON platform_analytics(platform_config_id);
CREATE INDEX IF NOT EXISTS idx_platform_analytics_date ON platform_analytics(created_at);
CREATE INDEX IF NOT EXISTS idx_platform_analytics_type ON platform_analytics(event_type);

-- -----------------------------------------------------------------------------
-- 3. PLATFORM RATE LIMITS
-- 100 searches per day per user enforcement
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS platform_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  search_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_platform_rate_limits_user_date ON platform_rate_limits(user_id, date);

-- Rate limit check function
CREATE OR REPLACE FUNCTION check_platform_rate_limit(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_count INTEGER;
  v_limit INTEGER := 100; -- 100 searches per day
BEGIN
  SELECT search_count INTO v_count
  FROM platform_rate_limits
  WHERE user_id = p_user_id AND date = CURRENT_DATE;

  IF v_count IS NULL THEN
    -- First search of the day
    INSERT INTO platform_rate_limits (user_id, date, search_count)
    VALUES (p_user_id, CURRENT_DATE, 1);
    RETURN TRUE;
  ELSIF v_count < v_limit THEN
    -- Under limit, increment
    UPDATE platform_rate_limits
    SET search_count = search_count + 1
    WHERE user_id = p_user_id AND date = CURRENT_DATE;
    RETURN TRUE;
  ELSE
    -- Over limit
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (SSM-GATED)
-- Only SSM members can access platform features
-- -----------------------------------------------------------------------------

ALTER TABLE platform_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_rate_limits ENABLE ROW LEVEL SECURITY;

-- Policy: Only SSM-approved users can manage their own configs
CREATE POLICY "platform_configs_ssm_only" ON platform_configs
  FOR ALL USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM ssm_access
      WHERE ssm_access.email = (SELECT email FROM auth.users WHERE id = auth.uid())
      AND ssm_access.status = 'approved'
    )
  );

-- Policy: Users can view their own analytics
CREATE POLICY "platform_analytics_owner" ON platform_analytics
  FOR SELECT USING (
    platform_config_id IN (
      SELECT id FROM platform_configs WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can manage their own rate limits
CREATE POLICY "platform_rate_limits_owner" ON platform_rate_limits
  FOR ALL USING (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 5. SIGNAL SOURCE TABLES
-- Pre-populated with live signal data
-- -----------------------------------------------------------------------------

-- Clinical Trials (from ClinicalTrials.gov)
CREATE TABLE IF NOT EXISTS clinical_trials_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  domain TEXT,
  contact_name TEXT,
  contact_title TEXT,
  trial_phase TEXT,                       -- 'Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'
  trial_status TEXT,                      -- 'Recruiting', 'Active', 'Completed'
  condition TEXT,
  intervention TEXT,
  start_date DATE,
  nct_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinical_company ON clinical_trials_companies(company);
CREATE INDEX IF NOT EXISTS idx_clinical_domain ON clinical_trials_companies(domain);
CREATE INDEX IF NOT EXISTS idx_clinical_phase ON clinical_trials_companies(trial_phase);

-- NIH Grants (from NIH Reporter API)
CREATE TABLE IF NOT EXISTS nih_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization TEXT NOT NULL,
  domain TEXT,
  pi_name TEXT,                           -- Principal Investigator
  pi_title TEXT,
  award_amount DECIMAL(15,2),
  award_date DATE,
  project_title TEXT,
  activity_code TEXT,                     -- R01, R21, etc.
  institute TEXT,                         -- NCI, NIMH, etc.
  project_number TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nih_org ON nih_grants(organization);
CREATE INDEX IF NOT EXISTS idx_nih_domain ON nih_grants(domain);
CREATE INDEX IF NOT EXISTS idx_nih_amount ON nih_grants(award_amount);

-- Recently Funded Startups
CREATE TABLE IF NOT EXISTS funded_startups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  domain TEXT,
  funding_round TEXT,                     -- 'Seed', 'Series A', 'Series B', etc.
  amount DECIMAL(15,2),
  funding_date DATE,
  ceo_name TEXT,
  ceo_title TEXT DEFAULT 'CEO',
  investors JSONB,
  industry TEXT,
  employee_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_funded_company ON funded_startups(company);
CREATE INDEX IF NOT EXISTS idx_funded_domain ON funded_startups(domain);
CREATE INDEX IF NOT EXISTS idx_funded_round ON funded_startups(funding_round);

-- Federal Contracts (from SAM.gov)
CREATE TABLE IF NOT EXISTS federal_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  domain TEXT,
  contact_name TEXT,
  contact_title TEXT,
  contract_value DECIMAL(15,2),
  agency TEXT,                            -- 'DOD', 'HHS', 'NASA', etc.
  contract_type TEXT,
  award_date DATE,
  naics_code TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_federal_company ON federal_contracts(company);
CREATE INDEX IF NOT EXISTS idx_federal_domain ON federal_contracts(domain);
CREATE INDEX IF NOT EXISTS idx_federal_agency ON federal_contracts(agency);

-- Job Signals (Hiring Activity)
CREATE TABLE IF NOT EXISTS job_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  domain TEXT,
  job_title TEXT,
  department TEXT,                        -- 'Engineering', 'Sales', 'Marketing', etc.
  seniority TEXT,                         -- 'Executive', 'Director', 'Manager', 'IC'
  location TEXT,
  posted_date DATE,
  job_url TEXT,
  hiring_manager TEXT,
  hiring_manager_title TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_company ON job_signals(company);
CREATE INDEX IF NOT EXISTS idx_jobs_domain ON job_signals(domain);
CREATE INDEX IF NOT EXISTS idx_jobs_department ON job_signals(department);

-- -----------------------------------------------------------------------------
-- 6. UPDATED_AT TRIGGER
-- Auto-update timestamp on modifications
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_platform_configs_updated_at
  BEFORE UPDATE ON platform_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clinical_trials_updated_at
  BEFORE UPDATE ON clinical_trials_companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_nih_grants_updated_at
  BEFORE UPDATE ON nih_grants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_funded_startups_updated_at
  BEFORE UPDATE ON funded_startups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_federal_contracts_updated_at
  BEFORE UPDATE ON federal_contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_job_signals_updated_at
  BEFORE UPDATE ON job_signals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- END OF MIGRATION
-- -----------------------------------------------------------------------------
