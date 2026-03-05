-- Overlay tracking columns on introductions
-- Connects every intro to the exact overlay config used at send time

ALTER TABLE introductions
  ADD COLUMN IF NOT EXISTS overlay_client_id TEXT,
  ADD COLUMN IF NOT EXISTS overlay_version INTEGER,
  ADD COLUMN IF NOT EXISTS overlay_client_name TEXT,
  ADD COLUMN IF NOT EXISTS overlay_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_introductions_overlay
  ON introductions(operator_id, overlay_client_id, overlay_hash);

-- Learning view: per-overlay-config performance metrics
-- Groups by overlay_hash (config truth), not version number (display label)
-- HAVING >= 5: reply rates on 2 samples is noise theatre
CREATE OR REPLACE VIEW intro_learning_by_overlay AS
SELECT
  operator_id,
  overlay_client_id,
  overlay_hash,
  MAX(overlay_version) AS overlay_version,
  MAX(overlay_client_name) AS overlay_client_name,
  COUNT(*) AS total_sent,
  COUNT(*) FILTER (WHERE status IN ('replied','meeting','closed_won','closed_lost')) AS total_replied,
  COUNT(*) FILTER (WHERE status IN ('meeting','closed_won')) AS total_meetings,
  COUNT(*) FILTER (WHERE status = 'closed_won') AS total_won,
  COALESCE(SUM(deal_value) FILTER (WHERE status = 'closed_won'), 0) AS total_deal_value,
  ROUND(
    COUNT(*) FILTER (WHERE status IN ('replied','meeting','closed_won','closed_lost'))::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS reply_rate_pct,
  ROUND(
    COUNT(*) FILTER (WHERE status IN ('meeting','closed_won'))::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS meeting_rate_pct,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'closed_won')::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS win_rate_pct,
  ROUND(
    COALESCE(AVG(deal_value) FILTER (WHERE status = 'closed_won'), 0)::numeric, 0
  ) AS avg_deal_value
FROM introductions
WHERE overlay_client_id IS NOT NULL AND overlay_hash IS NOT NULL
GROUP BY operator_id, overlay_client_id, overlay_hash
HAVING COUNT(*) >= 5
ORDER BY MAX(overlay_version) DESC;
