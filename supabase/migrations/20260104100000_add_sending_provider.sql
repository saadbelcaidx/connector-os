-- Add sending_provider column to operator_settings
-- Default value = 'instantly' for backwards compatibility

-- Add column if not exists (with default)
ALTER TABLE operator_settings
ADD COLUMN IF NOT EXISTS sending_provider TEXT DEFAULT 'instantly';

-- Backfill existing rows that have NULL
UPDATE operator_settings
SET sending_provider = 'instantly'
WHERE sending_provider IS NULL;

-- Also ensure plusvibe columns exist for future use
ALTER TABLE operator_settings
ADD COLUMN IF NOT EXISTS plusvibe_api_key TEXT;

ALTER TABLE operator_settings
ADD COLUMN IF NOT EXISTS plusvibe_workspace_id TEXT;
