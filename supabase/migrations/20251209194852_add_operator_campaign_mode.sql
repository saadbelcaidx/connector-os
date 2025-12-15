/*
  # Add Campaign Mode Column

  1. Changes
    - Add `operator_campaign_mode` column to `operator_settings` table
    - Default value: 'pure_connector'
    - Allows operators to select their outreach style

  2. Campaign Modes
    - `pure_connector`: Reach both sides, focus on introductions
    - `solution_provider`: Reach demand only, focus on helping
    - `network_orchestrator`: Reach both sides with different messaging
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'operator_campaign_mode'
  ) THEN
    ALTER TABLE operator_settings 
    ADD COLUMN operator_campaign_mode TEXT DEFAULT 'pure_connector';
  END IF;
END $$;
