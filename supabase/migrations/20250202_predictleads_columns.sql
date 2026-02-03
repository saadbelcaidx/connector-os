-- Add PredictLeads API credentials for Platform Intelligence PROFILE mode
ALTER TABLE operator_settings
ADD COLUMN IF NOT EXISTS predictleads_api_key TEXT,
ADD COLUMN IF NOT EXISTS predictleads_api_token TEXT;

-- Comment for clarity
COMMENT ON COLUMN operator_settings.predictleads_api_key IS 'PredictLeads API Key for company intel (PROFILE mode)';
COMMENT ON COLUMN operator_settings.predictleads_api_token IS 'PredictLeads API Token for company intel (PROFILE mode)';
