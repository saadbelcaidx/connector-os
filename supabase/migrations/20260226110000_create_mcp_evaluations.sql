-- MCP Evaluations table — stores AI pair evaluation results
-- Schema from spec section 7, step 2

CREATE TABLE mcp_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eval_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  demand_key TEXT NOT NULL,
  supply_key TEXT NOT NULL,
  scores JSONB NOT NULL,
  vetoed BOOLEAN DEFAULT false,
  veto_reason TEXT,
  risks JSONB,
  framing TEXT,
  reasoning TEXT,
  evaluated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(eval_id, job_id)
);

CREATE INDEX idx_mcp_evaluations_job ON mcp_evaluations(job_id);
