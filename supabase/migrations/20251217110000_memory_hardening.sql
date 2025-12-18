-- Memory Hardening Migration
-- Adds indexes to improve cache query performance

-- Add index on signal_history for faster lookups by domain
CREATE INDEX IF NOT EXISTS idx_signal_history_domain
ON signal_history(company_domain);

-- Add composite index for common query pattern (domain + created_at for recent signals)
CREATE INDEX IF NOT EXISTS idx_signal_history_domain_created
ON signal_history(company_domain, created_at DESC);

-- Add index on enriched_at for cache freshness checks (if column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signal_history' AND column_name = 'enriched_at'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_signal_history_enriched_at
    ON signal_history(enriched_at)
    WHERE enriched_at IS NOT NULL;
  END IF;
END $$;
