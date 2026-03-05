-- MCP Evaluation V2: Embedding infrastructure + evaluation schema upgrades
-- Enables: pgvector, signal_embeddings table, top-K retrieval RPC,
--          classification/readiness columns on mcp_evaluations

-- =============================================================================
-- PGVECTOR EXTENSION
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- SIGNAL EMBEDDINGS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS signal_embeddings (
  record_key TEXT NOT NULL,
  job_id TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('demand', 'supply')),
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (record_key, job_id)
);

CREATE INDEX IF NOT EXISTS idx_signal_embeddings_job_side
  ON signal_embeddings(job_id, side);

-- =============================================================================
-- TOP-K RETRIEVAL RPC
-- For each demand embedding, find the K nearest supply embeddings
-- =============================================================================

CREATE OR REPLACE FUNCTION match_supply_for_demand(
  demand_key text,
  match_job_id text,
  match_count int DEFAULT 30
)
RETURNS TABLE (supply_key text, similarity float)
LANGUAGE plpgsql
AS $$
DECLARE
  demand_emb vector(1536);
BEGIN
  SELECT embedding INTO demand_emb
  FROM signal_embeddings
  WHERE record_key = demand_key AND job_id = match_job_id;

  IF demand_emb IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT se.record_key AS supply_key,
         1 - (se.embedding <=> demand_emb)::float AS similarity
  FROM signal_embeddings se
  WHERE se.job_id = match_job_id AND se.side = 'supply'
  ORDER BY se.embedding <=> demand_emb
  LIMIT match_count;
END;
$$;

-- =============================================================================
-- MCP EVALUATIONS: ADD CLASSIFICATION + READINESS
-- =============================================================================

ALTER TABLE mcp_evaluations
  ADD COLUMN IF NOT EXISTS classification TEXT
  CHECK (classification IN ('PASS', 'MARGINAL', 'QUARANTINE', 'HARD_DROP'));

ALTER TABLE mcp_evaluations
  ADD COLUMN IF NOT EXISTS readiness TEXT
  CHECK (readiness IN ('READY', 'WARMING', 'NOT_YET'));

CREATE INDEX IF NOT EXISTS idx_mcp_evaluations_classification
  ON mcp_evaluations(job_id, classification);
