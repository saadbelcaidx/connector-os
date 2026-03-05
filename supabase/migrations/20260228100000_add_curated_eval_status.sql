-- Expand eval_status CHECK to include 'curated' for the curation layer.
-- The original CHECK was added inline (unnamed), so we look up the auto-generated name.
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE rel.relname = 'mcp_evaluations'
    AND nsp.nspname = 'public'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%eval_status%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE mcp_evaluations DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE mcp_evaluations
  ADD CONSTRAINT mcp_evaluations_eval_status_check
  CHECK (eval_status IN ('scored', 'reasoned', 'curated'));
