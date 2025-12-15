/*
  # Add Jobs Search Query and Target Roles Fields

  1. Changes
    - Add `jobs_search_query` column for configurable job search keywords
    - Add `jobs_target_roles` column for filtering job results by role titles

  2. Purpose
    - Allow operators to configure custom job search queries instead of hardcoded "sales roles"
    - Enable role-based filtering of job results

  3. Notes
    - Default values are empty strings
    - These fields control the JSearch API query parameter and result filtering
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'jobs_search_query'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN jobs_search_query text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'jobs_target_roles'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN jobs_target_roles text DEFAULT '';
  END IF;
END $$;
