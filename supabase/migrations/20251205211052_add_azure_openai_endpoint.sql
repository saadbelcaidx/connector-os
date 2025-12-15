/*
  # Add Azure OpenAI Endpoint Support

  1. Changes
    - Add `ai_azure_endpoint` column to `operator_settings` table
      - Stores the full Azure OpenAI endpoint URL for API calls
      - Optional field (NULL allowed)
      - Will be used in combination with ai_azure_api_key for Azure OpenAI support

  2. Purpose
    - Enable operators to configure Azure OpenAI as an alternative AI provider
    - Supports enterprise customers who prefer Azure-hosted AI services
    - Works alongside existing Claude and OpenAI configurations
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'ai_azure_endpoint'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN ai_azure_endpoint TEXT;
  END IF;
END $$;
