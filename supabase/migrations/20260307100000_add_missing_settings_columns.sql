-- Add columns referenced by Settings.tsx upsert but missing from operator_settings
-- Root cause: columns were added to the code but never migrated to the DB
ALTER TABLE operator_settings
ADD COLUMN IF NOT EXISTS ai_provider TEXT,
ADD COLUMN IF NOT EXISTS ai_anthropic_api_key TEXT,
ADD COLUMN IF NOT EXISTS connector_agent_api_key TEXT,
ADD COLUMN IF NOT EXISTS sender_name TEXT,
ADD COLUMN IF NOT EXISTS calendar_link TEXT,
ADD COLUMN IF NOT EXISTS pre_signal_context JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS target_industries TEXT,
ADD COLUMN IF NOT EXISTS plusvibe_campaign_demand TEXT,
ADD COLUMN IF NOT EXISTS plusvibe_campaign_supply TEXT;
