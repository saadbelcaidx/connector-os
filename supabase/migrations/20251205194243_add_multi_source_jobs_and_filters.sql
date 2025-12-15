/*
  # Add Multi-Source Jobs and Filter Support

  1. New Columns
    - `job_api_urls` (text[]) - Array of job API endpoint URLs for multi-source support
    - `enable_multi_source_jobs` (boolean) - Toggle to enable multiple job sources
    - `job_role_filter` (text) - Optional filter for specific job roles (e.g., "sales", "developer")
    - `job_industry_filter` (text) - Optional filter for specific industries (e.g., "SaaS", "biotech")
  
  2. Changes
    - Add new columns to `operator_settings` table
    - Set appropriate defaults
    - Maintain backward compatibility with existing single job_api_url field
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'job_api_urls'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN job_api_urls text[] DEFAULT '{}';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'enable_multi_source_jobs'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN enable_multi_source_jobs boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'job_role_filter'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN job_role_filter text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'job_industry_filter'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN job_industry_filter text DEFAULT '';
  END IF;
END $$;