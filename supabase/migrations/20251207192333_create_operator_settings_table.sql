/*
  # Create Operator Settings Table

  1. New Tables
    - `operator_settings`
      - `id` (uuid, primary key) - Unique identifier
      - `user_id` (text, unique) - User identifier (default: 'default')
      - `signals_api_key` (text) - Main Signals API key
      - `jobs_api_url` (text) - Jobs API endpoint URL
      - `jobs_method` (text) - HTTP method for jobs API
      - `jobs_headers` (jsonb) - Custom headers for jobs API
      - `jobs_body` (jsonb) - Request body for jobs API
      - `jobs_api_key` (text) - Signal-specific API key for jobs
      - `jobs_api_body` (text) - Deprecated legacy field
      - `job_api_urls` (text[]) - Multiple job API sources
      - `enable_multi_source_jobs` (boolean) - Enable multi-source job fetching
      - `job_role_filter` (text) - Filter jobs by role keywords
      - `job_industry_filter` (text) - Filter jobs by industry
      - `funding_api_url` (text) - Funding API endpoint URL
      - `funding_method` (text) - HTTP method for funding API
      - `funding_headers` (jsonb) - Custom headers for funding API
      - `funding_body` (jsonb) - Request body for funding API
      - `funding_api_key` (text) - Signal-specific API key for funding
      - `funding_api_body` (text) - Legacy field
      - `layoffs_api_url` (text) - Layoffs API endpoint URL
      - `layoffs_method` (text) - HTTP method for layoffs API
      - `layoffs_headers` (jsonb) - Custom headers for layoffs API
      - `layoffs_body` (jsonb) - Request body for layoffs API
      - `layoffs_api_key` (text) - Signal-specific API key for layoffs
      - `layoffs_api_body` (text) - Legacy field
      - `hiring_api_url` (text) - Hiring velocity API endpoint URL
      - `hiring_method` (text) - HTTP method for hiring API
      - `hiring_headers` (jsonb) - Custom headers for hiring API
      - `hiring_body` (jsonb) - Request body for hiring API
      - `hiring_api_key` (text) - Signal-specific API key for hiring
      - `hiring_api_body` (text) - Legacy field
      - `tech_api_url` (text) - Tech stack API endpoint URL
      - `tech_method` (text) - HTTP method for tech API
      - `tech_headers` (jsonb) - Custom headers for tech API
      - `tech_body` (jsonb) - Request body for tech API
      - `tech_api_key` (text) - Signal-specific API key for tech
      - `tech_api_body` (text) - Legacy field
      - `services_delivered` (text[]) - Array of services offered
      - `ideal_client` (text) - Target client description
      - `average_deal_size` (numeric) - Average deal size in dollars
      - `geography_served` (text) - Geographic regions served
      - `capacity` (numeric) - Number of clients capacity
      - `niche_expertise` (text[]) - Array of niche areas
      - `email_alerts_enabled` (boolean) - Enable email notifications
      - `alert_email` (text) - Email address for alerts
      - `ai_openai_api_key` (text) - OpenAI API key
      - `ai_azure_api_key` (text) - Azure OpenAI API key
      - `ai_azure_endpoint` (text) - Azure OpenAI endpoint URL
      - `ai_claude_api_key` (text) - Claude API key
      - `ai_model` (text) - Selected AI model
      - `ai_enable_rewrite` (boolean) - Enable AI intro rewriting
      - `ai_enable_signal_cleaning` (boolean) - Enable AI signal cleaning
      - `ai_enable_enrichment` (boolean) - Enable AI business insights
      - `ai_enable_forecasting` (boolean) - Enable AI forecasting
      - `ai_insight_mode` (text) - AI insight mode: template, template_plus_ai, ai_only
      - `ai_clean_view_default` (boolean) - Default to clean view
      - `enrichment_provider` (text) - Contact enrichment provider
      - `enrichment_api_key` (text) - Enrichment API key
      - `enrichment_endpoint_url` (text) - Enrichment endpoint URL
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp

  2. Security
    - Enable RLS on `operator_settings` table
    - Allow anonymous users to read/write default settings (user_id='default')
    - Allow authenticated users to read/write their own settings

  3. Notes
    - This table stores all operator configuration for APIs, provider metadata, and AI settings
    - Default row with user_id='default' allows anonymous usage
    - All API keys stored as plain text for client-side use
*/

CREATE TABLE IF NOT EXISTS operator_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text UNIQUE NOT NULL DEFAULT 'default',
  signals_api_key text DEFAULT '',
  jobs_api_url text DEFAULT '',
  jobs_method text DEFAULT 'GET',
  jobs_headers jsonb DEFAULT '{}'::jsonb,
  jobs_body jsonb DEFAULT '{}'::jsonb,
  jobs_api_key text DEFAULT '',
  jobs_api_body text DEFAULT '',
  job_api_urls text[] DEFAULT ARRAY[]::text[],
  enable_multi_source_jobs boolean DEFAULT false,
  job_role_filter text DEFAULT '',
  job_industry_filter text DEFAULT '',
  funding_api_url text DEFAULT '',
  funding_method text DEFAULT 'GET',
  funding_headers jsonb DEFAULT '{}'::jsonb,
  funding_body jsonb DEFAULT '{}'::jsonb,
  funding_api_key text DEFAULT '',
  funding_api_body text DEFAULT '',
  layoffs_api_url text DEFAULT '',
  layoffs_method text DEFAULT 'GET',
  layoffs_headers jsonb DEFAULT '{}'::jsonb,
  layoffs_body jsonb DEFAULT '{}'::jsonb,
  layoffs_api_key text DEFAULT '',
  layoffs_api_body text DEFAULT '',
  hiring_api_url text DEFAULT '',
  hiring_method text DEFAULT 'GET',
  hiring_headers jsonb DEFAULT '{}'::jsonb,
  hiring_body jsonb DEFAULT '{}'::jsonb,
  hiring_api_key text DEFAULT '',
  hiring_api_body text DEFAULT '',
  tech_api_url text DEFAULT '',
  tech_method text DEFAULT 'GET',
  tech_headers jsonb DEFAULT '{}'::jsonb,
  tech_body jsonb DEFAULT '{}'::jsonb,
  tech_api_key text DEFAULT '',
  tech_api_body text DEFAULT '',
  services_delivered text[] DEFAULT ARRAY[]::text[],
  ideal_client text DEFAULT '',
  average_deal_size numeric DEFAULT 0,
  geography_served text DEFAULT '',
  capacity numeric DEFAULT 0,
  niche_expertise text[] DEFAULT ARRAY[]::text[],
  email_alerts_enabled boolean DEFAULT false,
  alert_email text DEFAULT '',
  ai_openai_api_key text DEFAULT '',
  ai_azure_api_key text DEFAULT '',
  ai_azure_endpoint text DEFAULT '',
  ai_claude_api_key text DEFAULT '',
  ai_model text DEFAULT 'gpt-4.1-mini',
  ai_enable_rewrite boolean DEFAULT true,
  ai_enable_signal_cleaning boolean DEFAULT true,
  ai_enable_enrichment boolean DEFAULT true,
  ai_enable_forecasting boolean DEFAULT false,
  ai_insight_mode text DEFAULT 'template',
  ai_clean_view_default boolean DEFAULT false,
  enrichment_provider text DEFAULT 'none',
  enrichment_api_key text DEFAULT '',
  enrichment_endpoint_url text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE operator_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anonymous users can read default settings"
  ON operator_settings
  FOR SELECT
  TO anon
  USING (user_id = 'default');

CREATE POLICY "Anonymous users can insert default settings"
  ON operator_settings
  FOR INSERT
  TO anon
  WITH CHECK (user_id = 'default');

CREATE POLICY "Anonymous users can update default settings"
  ON operator_settings
  FOR UPDATE
  TO anon
  USING (user_id = 'default')
  WITH CHECK (user_id = 'default');

CREATE POLICY "Authenticated users can read own settings"
  ON operator_settings
  FOR SELECT
  TO authenticated
  USING (user_id = current_user OR user_id = 'default');

CREATE POLICY "Authenticated users can insert own settings"
  ON operator_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = current_user);

CREATE POLICY "Authenticated users can update own settings"
  ON operator_settings
  FOR UPDATE
  TO authenticated
  USING (user_id = current_user OR user_id = 'default')
  WITH CHECK (user_id = current_user OR user_id = 'default');

CREATE INDEX IF NOT EXISTS idx_operator_settings_user_id 
  ON operator_settings(user_id);

INSERT INTO operator_settings (user_id) 
VALUES ('default')
ON CONFLICT (user_id) DO NOTHING;
