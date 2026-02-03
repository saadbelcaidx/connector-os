-- =============================================================================
-- REMOVE RATE LIMITING FROM PLATFORM
-- Reason: Users use own Apollo keys (their cost), real usage is 2-10 searches/day
-- =============================================================================

DROP TABLE IF EXISTS platform_rate_limits CASCADE;

-- Keep platform_analytics for tracking only
