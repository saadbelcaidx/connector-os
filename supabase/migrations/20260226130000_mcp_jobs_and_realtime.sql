-- MCP Jobs table + Realtime enablement
-- Production architecture: server-side orchestration

-- Job tracking for server-side MCP evaluation
CREATE TABLE IF NOT EXISTS mcp_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','embedding','retrieving',
                      'evaluating','complete','failed','aborted')),
  total_pairs INTEGER,
  completed_pairs INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  config JSONB NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_jobs_status ON mcp_jobs(status);

-- Add similarity + rank columns to mcp_evaluations (worker writes these)
ALTER TABLE mcp_evaluations
  ADD COLUMN IF NOT EXISTS similarity FLOAT;

ALTER TABLE mcp_evaluations
  ADD COLUMN IF NOT EXISTS rank INTEGER;

-- Enable Realtime on evaluation results + job tracking
-- Browser subscribes filtered by job_id, gets live updates
ALTER PUBLICATION supabase_realtime ADD TABLE mcp_evaluations;
ALTER PUBLICATION supabase_realtime ADD TABLE mcp_jobs;
