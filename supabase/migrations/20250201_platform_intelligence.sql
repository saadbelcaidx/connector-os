-- Platform Intelligence: Real-time company intelligence for live calls
-- Built like infrastructure, not a feature

-- ============================================================================
-- QUERIES TABLE: Cache and track all intelligence queries
-- ============================================================================
CREATE TABLE IF NOT EXISTS intelligence_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Query details
  query_text TEXT NOT NULL,
  query_hash TEXT NOT NULL, -- For cache lookup

  -- Context (optional)
  prospect_domain TEXT, -- Exclude from results
  operator_niche TEXT, -- For relevance scoring

  -- Results metadata
  result_count INTEGER DEFAULT 0,
  exa_request_id TEXT,

  -- Cost tracking
  cost_exa NUMERIC(10, 6) DEFAULT 0,
  cost_ai NUMERIC(10, 6) DEFAULT 0,
  cost_enrichment NUMERIC(10, 6) DEFAULT 0,
  cost_total NUMERIC(10, 6) GENERATED ALWAYS AS (cost_exa + cost_ai + cost_enrichment) STORED,

  -- Timing
  latency_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Cache TTL: 1 hour for same query
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '1 hour')
);

-- Index for cache lookups
CREATE INDEX idx_intelligence_queries_hash ON intelligence_queries(query_hash, user_id);
CREATE INDEX idx_intelligence_queries_expires ON intelligence_queries(expires_at);

-- ============================================================================
-- RESULTS TABLE: Extracted companies from queries
-- ============================================================================
CREATE TABLE IF NOT EXISTS intelligence_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id UUID REFERENCES intelligence_queries(id) ON DELETE CASCADE,

  -- Company identification
  company_name TEXT NOT NULL,
  company_domain TEXT, -- Extracted or inferred

  -- Signal data
  signal_type TEXT NOT NULL, -- 'funding', 'exec_change', 'hiring', 'acquisition', 'certification'
  signal_title TEXT NOT NULL, -- "Raised $17.5M Series A"
  signal_date DATE,
  signal_recency_days INTEGER,

  -- Source
  source_url TEXT NOT NULL,
  source_type TEXT NOT NULL, -- 'company_page', 'news', 'job_posting', 'press_release'
  source_title TEXT,

  -- Scoring
  match_score NUMERIC(5, 2), -- 0-100
  confidence NUMERIC(3, 2), -- 0-1

  -- Position in results
  rank INTEGER,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_intelligence_results_query ON intelligence_results(query_id);
CREATE INDEX idx_intelligence_results_domain ON intelligence_results(company_domain);

-- ============================================================================
-- CONTACTS TABLE: Enriched decision makers
-- ============================================================================
CREATE TABLE IF NOT EXISTS intelligence_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id UUID REFERENCES intelligence_results(id) ON DELETE CASCADE,

  -- Contact details
  full_name TEXT,
  first_name TEXT,
  last_name TEXT,
  title TEXT,
  email TEXT,
  linkedin_url TEXT,

  -- Enrichment source
  enrichment_source TEXT, -- 'apollo', 'anymail', 'manual'
  enrichment_status TEXT DEFAULT 'pending', -- 'pending', 'found', 'not_found', 'error'

  -- Seniority for filtering
  seniority_level TEXT, -- 'c_suite', 'vp', 'director', 'manager', 'other'

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_intelligence_contacts_result ON intelligence_contacts(result_id);
CREATE INDEX idx_intelligence_contacts_status ON intelligence_contacts(enrichment_status);

-- ============================================================================
-- OPERATOR SETTINGS: Add Exa API key column
-- ============================================================================
ALTER TABLE operator_settings
ADD COLUMN IF NOT EXISTS exa_api_key TEXT;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE intelligence_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_contacts ENABLE ROW LEVEL SECURITY;

-- Users can only see their own queries
CREATE POLICY "Users can view own queries" ON intelligence_queries
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own queries" ON intelligence_queries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Results visible if user owns the query
CREATE POLICY "Users can view own results" ON intelligence_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM intelligence_queries
      WHERE id = query_id AND user_id = auth.uid()
    )
  );

-- Contacts visible if user owns the query
CREATE POLICY "Users can view own contacts" ON intelligence_contacts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM intelligence_results r
      JOIN intelligence_queries q ON r.query_id = q.id
      WHERE r.id = result_id AND q.user_id = auth.uid()
    )
  );

-- ============================================================================
-- CACHE CLEANUP FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_expired_intelligence()
RETURNS void AS $$
BEGIN
  DELETE FROM intelligence_queries WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE intelligence_queries IS 'Cached intelligence queries for Platform real-time search';
COMMENT ON TABLE intelligence_results IS 'Extracted companies from Exa search results';
COMMENT ON TABLE intelligence_contacts IS 'Enriched decision maker contacts from Apollo/Anymail';
COMMENT ON COLUMN intelligence_queries.query_hash IS 'SHA256 hash for cache deduplication';
COMMENT ON COLUMN intelligence_results.signal_type IS 'funding|exec_change|hiring|acquisition|certification|expansion|partnership';
COMMENT ON COLUMN intelligence_results.source_type IS 'company_page|news|job_posting|press_release|report';
