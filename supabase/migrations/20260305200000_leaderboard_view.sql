-- =============================================================================
-- Leaderboard — Aggregate sends per operator from contact_send_ledger
-- No new table. View + RPC over existing data.
-- =============================================================================

CREATE OR REPLACE VIEW leaderboard_stats AS
SELECT
  operator_id,
  COUNT(*)::int AS total_sent,
  MIN(sent_at) AS first_sent_at,
  MAX(sent_at) AS last_sent_at,
  COUNT(*) FILTER (WHERE sent_at > NOW() - INTERVAL '7 days')::int AS sent_7d,
  COUNT(*) FILTER (WHERE sent_at > NOW() - INTERVAL '30 days')::int AS sent_30d
FROM contact_send_ledger
WHERE status = 'sent'
GROUP BY operator_id;

-- =============================================================================
-- RPC: get_leaderboard — aggregation + display name resolution in one call
-- SECURITY DEFINER bypasses RLS on operator_settings for name lookup.
-- Returns only aggregates — no emails, no PII.
-- =============================================================================

CREATE OR REPLACE FUNCTION get_leaderboard()
RETURNS TABLE(
  operator_id TEXT,
  display_name TEXT,
  total_sent INT,
  first_sent_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  sent_7d INT,
  sent_30d INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ls.operator_id,
    COALESCE(
      NULLIF(os.operator_name, ''),
      NULLIF(os.operator_company, ''),
      'Operator ' || LEFT(ls.operator_id, 6)
    ) AS display_name,
    ls.total_sent,
    ls.first_sent_at,
    ls.last_sent_at,
    ls.sent_7d,
    ls.sent_30d
  FROM leaderboard_stats ls
  LEFT JOIN operator_settings os ON os.user_id = ls.operator_id
  ORDER BY ls.total_sent DESC
  LIMIT 100;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
