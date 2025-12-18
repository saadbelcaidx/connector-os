-- Contact Memory Enrichment Cache Migration
-- Stores enriched contact data to avoid redundant API calls

-- Add missing contact enrichment fields to signal_history
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signal_history' AND column_name = 'person_confidence'
  ) THEN
    ALTER TABLE signal_history ADD COLUMN person_confidence INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signal_history' AND column_name = 'enrichment_provider'
  ) THEN
    ALTER TABLE signal_history ADD COLUMN enrichment_provider TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signal_history' AND column_name = 'enrichment_cost_cents'
  ) THEN
    ALTER TABLE signal_history ADD COLUMN enrichment_cost_cents INTEGER DEFAULT 0;
  END IF;
END $$;

-- Create dedicated contact cache table for cross-signal reuse
CREATE TABLE IF NOT EXISTS contact_enrichment_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  company_name TEXT,
  person_name TEXT,
  person_email TEXT,
  person_title TEXT,
  person_linkedin TEXT,
  confidence INTEGER,
  provider TEXT,
  cost_cents INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

-- Unique constraint on domain to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_cache_domain
ON contact_enrichment_cache(domain);

-- Index for expiration cleanup
CREATE INDEX IF NOT EXISTS idx_contact_cache_expires
ON contact_enrichment_cache(expires_at);

-- Index for provider analytics
CREATE INDEX IF NOT EXISTS idx_contact_cache_provider
ON contact_enrichment_cache(provider);

-- Enable RLS
ALTER TABLE contact_enrichment_cache ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users
CREATE POLICY "contact_cache_auth_policy"
ON contact_enrichment_cache
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Also allow anon for development
CREATE POLICY "contact_cache_anon_policy"
ON contact_enrichment_cache
FOR ALL
TO anon
USING (true)
WITH CHECK (true);
