-- DMCB Canonicals — per-record AI extraction results
-- System of record for resume/idempotency. useJobRunner writes here.
-- IndexedDB = cursor only. This table = truth.

CREATE TABLE IF NOT EXISTS dmcb_canonicals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_key TEXT NOT NULL,
  job_id TEXT NOT NULL,
  canonical JSONB NOT NULL,
  extracted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(record_key, job_id)
);

CREATE INDEX idx_dmcb_canonicals_job ON dmcb_canonicals(job_id);
