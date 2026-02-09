-- ============================================================================
-- INTRODUCTION LEARNING VIEWS
--
-- Three views for understanding which intros convert best.
-- Data only — no algorithm changes.
-- ============================================================================

-- 1. Learning by tier — reply/meeting/win rates per match tier
CREATE OR REPLACE VIEW intro_learning_by_tier AS
SELECT
  operator_id,
  match_tier,
  COUNT(*) AS total_sent,
  COUNT(*) FILTER (WHERE status IN ('replied', 'meeting', 'closed_won', 'closed_lost')) AS total_replied,
  COUNT(*) FILTER (WHERE status IN ('meeting', 'closed_won')) AS total_meetings,
  COUNT(*) FILTER (WHERE status = 'closed_won') AS total_won,
  ROUND(
    COUNT(*) FILTER (WHERE status IN ('replied', 'meeting', 'closed_won', 'closed_lost'))::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS reply_rate_pct,
  ROUND(
    COUNT(*) FILTER (WHERE status IN ('meeting', 'closed_won'))::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS meeting_rate_pct,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'closed_won')::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS win_rate_pct
FROM introductions
WHERE match_tier IS NOT NULL
GROUP BY operator_id, match_tier
ORDER BY match_tier;

-- 2. Learning by pairing — rates per need+capability combination
CREATE OR REPLACE VIEW intro_learning_by_pairing AS
SELECT
  operator_id,
  need_category,
  capability_category,
  COUNT(*) AS total_sent,
  COUNT(*) FILTER (WHERE status IN ('replied', 'meeting', 'closed_won', 'closed_lost')) AS total_replied,
  COUNT(*) FILTER (WHERE status IN ('meeting', 'closed_won')) AS total_meetings,
  ROUND(
    COUNT(*) FILTER (WHERE status IN ('replied', 'meeting', 'closed_won', 'closed_lost'))::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS reply_rate_pct,
  ROUND(
    COUNT(*) FILTER (WHERE status IN ('meeting', 'closed_won'))::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS meeting_rate_pct
FROM introductions
WHERE need_category IS NOT NULL AND capability_category IS NOT NULL
GROUP BY operator_id, need_category, capability_category
HAVING COUNT(*) >= 3
ORDER BY reply_rate_pct DESC;

-- 3. Funnel — per-operator conversion funnel
CREATE OR REPLACE VIEW intro_funnel AS
SELECT
  operator_id,
  COUNT(*) AS total_sent,
  COUNT(*) FILTER (WHERE status IN ('replied', 'meeting', 'closed_won', 'closed_lost')) AS total_replied,
  COUNT(*) FILTER (WHERE status IN ('meeting', 'closed_won')) AS total_meetings,
  COUNT(*) FILTER (WHERE status = 'closed_won') AS total_won,
  ROUND(
    COUNT(*) FILTER (WHERE status IN ('replied', 'meeting', 'closed_won', 'closed_lost'))::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS reply_rate_pct,
  ROUND(
    COUNT(*) FILTER (WHERE status IN ('meeting', 'closed_won'))::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS meeting_rate_pct,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'closed_won')::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS win_rate_pct
FROM introductions
GROUP BY operator_id;
