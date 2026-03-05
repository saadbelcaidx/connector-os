CREATE TABLE IF NOT EXISTS mcp_market_analyses (
  market_id TEXT PRIMARY KEY,
  demand_summary TEXT NOT NULL,
  supply_summary TEXT NOT NULL,
  demand_segments JSONB NOT NULL DEFAULT '[]',
  supply_segments JSONB NOT NULL DEFAULT '[]',
  data_quality JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
