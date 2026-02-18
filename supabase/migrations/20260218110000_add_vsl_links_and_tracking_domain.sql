-- ============================================================================
-- VSL Custom Tracking Domain
--
-- 1. vsl_links  — short slugs for tracked VSL URLs (operator's custom domain)
-- 2. custom_vsl_domain — per-operator tracking domain (e.g. watch.yourbrand.co)
-- ============================================================================


-- ============================================================================
-- VSL_LINKS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS vsl_links (
  slug         TEXT        PRIMARY KEY,
  user_id      UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id  TEXT,
  lead_email   TEXT        NOT NULL,
  thread_id    TEXT,
  vsl_url      TEXT        NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vsl_links_slug    ON vsl_links(slug);
CREATE INDEX        IF NOT EXISTS idx_vsl_links_user    ON vsl_links(user_id);
CREATE INDEX        IF NOT EXISTS idx_vsl_links_thread  ON vsl_links(thread_id);
CREATE INDEX        IF NOT EXISTS idx_vsl_links_expires ON vsl_links(expires_at);

ALTER TABLE vsl_links ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'vsl_links' AND policyname = 'vsl_links_service'
  ) THEN
    CREATE POLICY vsl_links_service ON vsl_links
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ============================================================================
-- OPERATOR_SETTINGS — custom VSL tracking domain
-- ============================================================================

ALTER TABLE operator_settings
  ADD COLUMN IF NOT EXISTS custom_vsl_domain TEXT;
