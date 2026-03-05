-- Compute full demand×supply similarity matrix in ONE query.
-- Replaces 193 sequential pgvector top-K queries with a single cross-join.
-- Results cached in Redis; this function only runs on cache miss.

CREATE OR REPLACE FUNCTION compute_similarity_matrix(
  p_job_id text,
  p_demand_keys text[],
  p_supply_keys text[]
)
RETURNS TABLE (demand_key text, supply_key text, cosine float)
LANGUAGE sql STABLE AS $$
  SELECT
    d.record_key AS demand_key,
    s.record_key AS supply_key,
    (1 - (d.embedding <=> s.embedding))::float AS cosine
  FROM signal_embeddings d
  CROSS JOIN signal_embeddings s
  WHERE d.record_key = ANY(p_demand_keys)
    AND d.job_id = p_job_id
    AND d.side = 'demand'
    AND s.record_key = ANY(p_supply_keys)
    AND s.job_id = p_job_id
    AND s.side = 'supply';
$$;
