/*
  # Add Instantly.ai Configuration Fields

  1. Changes
    - Add `instantly_api_key` column to store Instantly API key
    - Add `instantly_campaign_id` column to store Instantly campaign ID

  2. Purpose
    - Enable automatic lead creation in Instantly.ai when contacts are ready
    - Store configuration for Instantly integration

  3. Notes
    - Fields are optional - integration only active when both are configured
    - API key stored as plain text for client-side use
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'instantly_api_key'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN instantly_api_key text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'instantly_campaign_id'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN instantly_campaign_id text DEFAULT '';
  END IF;
END $$;
