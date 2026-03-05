-- V4: Database as job queue — mcp_shards + pg_cron worker

-- Durable shard queue
CREATE TABLE IF NOT EXISTS mcp_shards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT NOT NULL,
  shard_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  pairs JSONB NOT NULL,
  pair_count INTEGER NOT NULL,
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(job_id, shard_index)
);

-- Partial index for fast claim queries
CREATE INDEX IF NOT EXISTS idx_mcp_shards_claim
  ON mcp_shards(status, job_id)
  WHERE status = 'pending';

-- Partial index for stale recovery
CREATE INDEX IF NOT EXISTS idx_mcp_shards_stale
  ON mcp_shards(status, claimed_at)
  WHERE status = 'processing';

-- Enable Realtime on shards for progress tracking
ALTER PUBLICATION supabase_realtime ADD TABLE mcp_shards;

-- Atomic shard claiming with FOR UPDATE SKIP LOCKED
CREATE OR REPLACE FUNCTION claim_shards(p_limit INTEGER DEFAULT 5)
RETURNS SETOF mcp_shards AS $$
  UPDATE mcp_shards
  SET status = 'processing', claimed_at = now()
  WHERE id IN (
    SELECT id FROM mcp_shards
    WHERE status = 'pending'
    ORDER BY shard_index
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *
$$ LANGUAGE sql;

-- Stale recovery: reset shards stuck in processing > 60s
CREATE OR REPLACE FUNCTION recover_stale_shards()
RETURNS INTEGER AS $$
  WITH recovered AS (
    UPDATE mcp_shards
    SET status = 'pending', claimed_at = NULL
    WHERE status = 'processing'
      AND claimed_at < now() - interval '60 seconds'
    RETURNING id
  )
  SELECT count(*)::INTEGER FROM recovered
$$ LANGUAGE sql;

-- Enable pg_cron and pg_net (must be enabled in Supabase dashboard first)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule worker to run every 2 seconds
SELECT cron.schedule(
  'mcp-worker-tick',
  '2 seconds',
  $$SELECT net.http_post(
    url := 'https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/mcp-worker',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcWNoZ3Z3cXJxbnRobmJyZmtwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxMjQ1ODgsImV4cCI6MjA4MDcwMDU4OH0.9tv6zJupBQ1wK5RrssE73hLK7pTVYx0aaVtJHce1Fvg"}'::jsonb,
    body := '{}'::jsonb
  )$$
);
