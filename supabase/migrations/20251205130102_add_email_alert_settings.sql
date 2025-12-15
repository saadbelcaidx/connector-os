/*
  # Add Email Alert Settings

  1. Changes
    - Add `email_alerts_enabled` column to operator_settings
    - Add `alert_email` column to store notification email address
    - Both fields default to appropriate values

  2. Notes
    - Users can enable email alerts when pressure rises
    - Email address optional (can use system default or user profile email)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'email_alerts_enabled'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN email_alerts_enabled boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'alert_email'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN alert_email text;
  END IF;
END $$;
