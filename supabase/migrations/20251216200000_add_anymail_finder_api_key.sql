/*
  # Add Anymail Finder API Key

  Adds the anymail_finder_api_key column to operator_settings.
  Used as fallback when Apollo enrichment fails.
*/

ALTER TABLE operator_settings
ADD COLUMN IF NOT EXISTS anymail_finder_api_key text DEFAULT '';

COMMENT ON COLUMN operator_settings.anymail_finder_api_key IS 'Anymail Finder API key - fallback for email enrichment when Apollo fails';
