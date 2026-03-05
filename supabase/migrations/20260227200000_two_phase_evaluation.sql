-- Two-Phase Evaluation: scoring (gpt-4.1-mini) → reasoning (gpt-4o, top 200)
-- Adds phase tracking to jobs, eval status to evaluations, shard type to shards,
-- and creates the complete_shard RPC with two-phase completion logic.

-- =============================================================================
-- PHASE TRACKING ON JOBS
-- =============================================================================

ALTER TABLE mcp_jobs
  ADD COLUMN IF NOT EXISTS scoring_status text
    DEFAULT 'pending' CHECK (scoring_status IN ('pending','scoring','complete'));

ALTER TABLE mcp_jobs
  ADD COLUMN IF NOT EXISTS reasoning_status text
    DEFAULT 'pending' CHECK (reasoning_status IN ('pending','reasoning','complete'));

-- =============================================================================
-- EVAL STATUS ON EVALUATIONS (scored vs reasoned)
-- =============================================================================

ALTER TABLE mcp_evaluations
  ADD COLUMN IF NOT EXISTS eval_status text
    DEFAULT 'reasoned' CHECK (eval_status IN ('scored','reasoned'));

-- Existing evaluations are fully reasoned (V5 legacy)
UPDATE mcp_evaluations SET eval_status = 'reasoned'
  WHERE eval_status IS NULL;

-- =============================================================================
-- SHARD TYPE ON SHARDS (scoring vs reasoning vs full)
-- =============================================================================

ALTER TABLE mcp_shards
  ADD COLUMN IF NOT EXISTS shard_type text
    DEFAULT 'full' CHECK (shard_type IN ('scoring','reasoning','full'));

-- =============================================================================
-- COMPLETE_SHARD RPC — Two-phase aware
--
-- Called by: mcp-evaluate-worker, mcp-score-worker
-- Atomically: marks shard complete, updates job progress,
--             triggers Phase 2 when all scoring shards done,
--             marks job complete when all reasoning shards done.
-- =============================================================================

CREATE OR REPLACE FUNCTION complete_shard(p_shard_id uuid, p_job_id text)
RETURNS TABLE(completed_pairs bigint, job_status text) AS $$
DECLARE
  v_shard_type text;
  v_remaining bigint;
  v_completed bigint;
  v_job_status text;
BEGIN
  -- Mark shard complete
  UPDATE mcp_shards
  SET status = 'complete', completed_at = now()
  WHERE id = p_shard_id
  RETURNING COALESCE(mcp_shards.shard_type, 'full') INTO v_shard_type;

  -- Count completed evaluations for this job
  SELECT count(*) INTO v_completed
  FROM mcp_evaluations
  WHERE job_id = p_job_id;

  -- Update job progress
  UPDATE mcp_jobs
  SET completed_pairs = v_completed
  WHERE job_id = p_job_id;

  -- Check remaining shards of same type
  SELECT count(*) INTO v_remaining
  FROM mcp_shards
  WHERE job_id = p_job_id
    AND COALESCE(shard_type, 'full') = v_shard_type
    AND status != 'complete';

  IF v_remaining = 0 THEN
    IF v_shard_type = 'scoring' THEN
      -- All scoring done → update status, trigger Phase 2
      UPDATE mcp_jobs
      SET scoring_status = 'complete'
      WHERE job_id = p_job_id;

      -- Trigger Phase 2 orchestrator via pg_net
      PERFORM net.http_post(
        url := 'https://dqqchgvwqrqnthnbrfkp.supabase.co/functions/v1/mcp-orchestrate-phase2',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object('jobId', p_job_id)
      );

      SELECT 'evaluating' INTO v_job_status;

    ELSIF v_shard_type = 'reasoning' THEN
      -- All reasoning done → job complete
      UPDATE mcp_jobs
      SET reasoning_status = 'complete',
          status = 'complete',
          completed_at = now()
      WHERE job_id = p_job_id;

      SELECT 'complete' INTO v_job_status;

    ELSE
      -- Legacy 'full' type → job complete
      UPDATE mcp_jobs
      SET status = 'complete',
          completed_at = now()
      WHERE job_id = p_job_id;

      SELECT 'complete' INTO v_job_status;
    END IF;
  ELSE
    SELECT status INTO v_job_status
    FROM mcp_jobs
    WHERE job_id = p_job_id;
  END IF;

  RETURN QUERY SELECT v_completed, v_job_status;
END;
$$ LANGUAGE plpgsql;
