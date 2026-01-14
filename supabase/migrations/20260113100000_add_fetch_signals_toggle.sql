-- Add fetch_signals toggle to operator_settings
-- Controls whether to call org_enrich for B2B Contacts datasets
-- Default: false (no additional API calls)

ALTER TABLE operator_settings
ADD COLUMN IF NOT EXISTS fetch_signals BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN operator_settings.fetch_signals IS 'Fetch company signals (funding, employees, tech) for B2B Contacts datasets';
