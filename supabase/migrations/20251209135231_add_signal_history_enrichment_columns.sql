/*
  # Add enrichment columns to signal_history

  1. Changes to signal_history table
    - Add `who_has_pressure_roles` (text array) - roles that indicate pressure
    - Add `target_titles` (text array) - targeted job titles
    - Add `person_name` (text, nullable) - enriched person name
    - Add `person_email` (text, nullable) - enriched person email
    - Add `person_title` (text, nullable) - enriched person title
    - Add `person_linkedin` (text, nullable) - enriched person LinkedIn URL
    - Add `person_pressure_profile` (jsonb, nullable) - person pressure profile data
    - Add `company_domain` (text, nullable) - company domain for tracking

  2. Notes
    - All new columns are nullable to support existing records
    - Uses idempotent checks to prevent errors on re-run
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signal_history' AND column_name = 'who_has_pressure_roles'
  ) THEN
    ALTER TABLE signal_history ADD COLUMN who_has_pressure_roles text[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signal_history' AND column_name = 'target_titles'
  ) THEN
    ALTER TABLE signal_history ADD COLUMN target_titles text[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signal_history' AND column_name = 'person_name'
  ) THEN
    ALTER TABLE signal_history ADD COLUMN person_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signal_history' AND column_name = 'person_email'
  ) THEN
    ALTER TABLE signal_history ADD COLUMN person_email text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signal_history' AND column_name = 'person_title'
  ) THEN
    ALTER TABLE signal_history ADD COLUMN person_title text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signal_history' AND column_name = 'person_linkedin'
  ) THEN
    ALTER TABLE signal_history ADD COLUMN person_linkedin text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signal_history' AND column_name = 'person_pressure_profile'
  ) THEN
    ALTER TABLE signal_history ADD COLUMN person_pressure_profile jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signal_history' AND column_name = 'company_domain'
  ) THEN
    ALTER TABLE signal_history ADD COLUMN company_domain text;
  END IF;
END $$;
