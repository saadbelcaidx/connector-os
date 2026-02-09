-- ============================================================================
-- INTRODUCTIONS TABLE
--
-- First-class object tracking the lifecycle of every introduction.
-- From match → send → reply → meeting → outcome.
--
-- DATA FLOW:
-- 1. Flow.tsx batch send completes → createIntroductionsBatch() inserts rows
-- 2. Reply webhook → replies INSERT trigger → auto-updates intro status
-- 3. Operator → /introductions dashboard → marks meetings/outcomes
-- 4. Learning views → which tiers/pairings convert best
-- ============================================================================

CREATE TABLE introductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES auth.users(id),

  -- The pair
  demand_domain TEXT NOT NULL,
  demand_company TEXT,
  demand_contact_email TEXT,
  demand_contact_name TEXT,
  demand_contact_title TEXT,
  supply_domain TEXT NOT NULL,
  supply_company TEXT,
  supply_contact_email TEXT,
  supply_contact_name TEXT,
  supply_contact_title TEXT,

  -- Match reasoning
  match_score INTEGER,
  match_tier TEXT CHECK (match_tier IN ('strong', 'good', 'open')),
  match_tier_reason TEXT,
  match_reasons JSONB DEFAULT '[]',
  need_category TEXT,
  capability_category TEXT,

  -- What was sent
  demand_intro_text TEXT,
  supply_intro_text TEXT,
  intro_source TEXT CHECK (intro_source IN ('template', 'ai', 'ai-fallback')),

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN (
    'prepared', 'sent', 'delivered', 'replied', 'meeting',
    'closed_won', 'closed_lost', 'stale'
  )),

  -- Engagement
  demand_replied_at TIMESTAMPTZ,
  supply_replied_at TIMESTAMPTZ,
  demand_reply_stage TEXT,
  supply_reply_stage TEXT,
  first_reply_at TIMESTAMPTZ,

  -- Outcome
  meeting_booked_at TIMESTAMPTZ,
  outcome_at TIMESTAMPTZ,
  outcome_notes TEXT,
  deal_value NUMERIC,

  -- Linking
  thread_id TEXT,
  demand_campaign_id TEXT,
  supply_campaign_id TEXT,
  demand_lead_id TEXT,
  supply_lead_id TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_introductions_operator ON introductions(operator_id);
CREATE INDEX idx_introductions_status ON introductions(operator_id, status);
CREATE INDEX idx_introductions_thread ON introductions(thread_id);
CREATE INDEX idx_introductions_created ON introductions(operator_id, created_at DESC);

-- RLS
ALTER TABLE introductions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own" ON introductions FOR SELECT USING (auth.uid() = operator_id);
CREATE POLICY "Users insert own" ON introductions FOR INSERT WITH CHECK (auth.uid() = operator_id);
CREATE POLICY "Users update own" ON introductions FOR UPDATE USING (auth.uid() = operator_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_introductions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER introductions_updated_at
  BEFORE UPDATE ON introductions
  FOR EACH ROW EXECUTE FUNCTION update_introductions_updated_at();
