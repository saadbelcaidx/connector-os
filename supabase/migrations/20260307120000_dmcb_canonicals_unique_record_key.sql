-- Fix: dmcb_canonicals must have UNIQUE(record_key), not UNIQUE(record_key, job_id).
-- Old constraint allowed duplicate rows per record_key across DMCB runs.
-- This caused 412 rows for 7 keys, domain:null winning by volume, Intel button missing.

-- Step 1: Deduplicate — keep best row per record_key (domain first, then latest)
DELETE FROM dmcb_canonicals
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY record_key
             ORDER BY
               (canonical->>'domain') IS NOT NULL DESC,
               extracted_at DESC
           ) AS rn
    FROM dmcb_canonicals
  ) t
  WHERE rn > 1
);

-- Step 2: Drop old composite constraint
ALTER TABLE dmcb_canonicals
DROP CONSTRAINT IF EXISTS dmcb_canonicals_record_key_job_id_key;

-- Step 3: Add single-column unique constraint (also serves as index)
ALTER TABLE dmcb_canonicals
ADD CONSTRAINT dmcb_canonicals_record_key_key UNIQUE (record_key);
