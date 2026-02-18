-- ============================================================================
-- VSL Pre-Alignment System Tables
--
-- Tables:
--   replies            — Inbound reply log. Written by instantly-webhook.
--                        Postgres trigger (intro_reply_trigger) correlates to introductions.
--   vsl_events         — Click + watched events per lead/thread.
--   pending_followups  — Scheduled followups consumed by followup-dispatcher cron.
--
-- View:
--   vsl_engagement_by_thread — Aggregated click/watched per thread (used by ReplyTracker + Introductions).
-- ============================================================================


-- ============================================================================
-- REPLIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS replies (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  lead_email   TEXT        NOT NULL,
  from_email   TEXT,
  campaign_id  TEXT,
  thread_id    TEXT,
  direction    TEXT        DEFAULT 'inbound',
  reply_body   TEXT,
  stage        TEXT,
  replied_at   TIMESTAMPTZ DEFAULT NOW(),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_replies_thread  ON replies(thread_id);
CREATE INDEX IF NOT EXISTS idx_replies_user    ON replies(user_id);
CREATE INDEX IF NOT EXISTS idx_replies_created ON replies(created_at DESC);

ALTER TABLE replies ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'replies' AND policyname = 'replies_service_write'
  ) THEN
    CREATE POLICY replies_service_write ON replies
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'replies' AND policyname = 'replies_auth_read'
  ) THEN
    CREATE POLICY replies_auth_read ON replies
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;


-- ============================================================================
-- VSL_EVENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS vsl_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id   TEXT        NOT NULL,
  campaign_id TEXT,
  lead_email  TEXT,
  event_type  TEXT        NOT NULL CHECK (event_type IN ('click', 'watched')),
  vsl_url     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(thread_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_vsl_events_user   ON vsl_events(user_id);
CREATE INDEX IF NOT EXISTS idx_vsl_events_thread ON vsl_events(thread_id);

ALTER TABLE vsl_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'vsl_events' AND policyname = 'vsl_events_auth_read'
  ) THEN
    CREATE POLICY vsl_events_auth_read ON vsl_events
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;


-- ============================================================================
-- PENDING_FOLLOWUPS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS pending_followups (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id           TEXT        NOT NULL,
  campaign_id         TEXT,
  lead_email          TEXT        NOT NULL,
  original_email_id   TEXT,        -- Instantly email UUID for reply threading
  eaccount            TEXT,        -- Instantly sender mailbox (required by reply API)
  original_subject    TEXT,        -- Original email subject for Re: threading
  followup_type       TEXT        NOT NULL CHECK (followup_type IN ('watched', 'not_watched')),
  scheduled_at              TIMESTAMPTZ NOT NULL,
  sent                BOOLEAN     DEFAULT FALSE,
  sent_at             TIMESTAMPTZ,
  canceled           BOOLEAN     DEFAULT FALSE,
  canceled_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(thread_id, followup_type)
);

CREATE INDEX IF NOT EXISTS idx_followups_due    ON pending_followups(scheduled_at) WHERE sent = FALSE AND canceled = FALSE;
CREATE INDEX IF NOT EXISTS idx_followups_thread ON pending_followups(thread_id);

ALTER TABLE pending_followups ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pending_followups' AND policyname = 'followups_service'
  ) THEN
    CREATE POLICY followups_service ON pending_followups
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ============================================================================
-- VSL_ENGAGEMENT_BY_THREAD VIEW
-- Used by ReplyTracker and Introductions for real-time VSL engagement display.
-- ============================================================================

CREATE OR REPLACE VIEW vsl_engagement_by_thread AS
SELECT
  thread_id,
  user_id,
  MAX(CASE WHEN event_type = 'click'   THEN created_at END) AS clicked_at,
  MAX(CASE WHEN event_type = 'watched' THEN created_at END) AS watched_at,
  MAX(vsl_url) AS vsl_url
FROM vsl_events
GROUP BY thread_id, user_id;
