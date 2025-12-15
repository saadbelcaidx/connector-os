/*
  # Add API Endpoint URL Configuration Fields
  
  1. Changes
    - Add `jobs_api_url` column to store Job Postings API endpoint
    - Add `funding_api_url` column to store Funding Events API endpoint
    - Add `layoffs_api_url` column to store Layoffs API endpoint
    - Add `hiring_api_url` column to store Hiring Velocity API endpoint
    - Add `tech_api_url` column to store Tool/Tech Stack API endpoint
  
  2. Purpose
    - Enable provider-agnostic signal fetching by allowing operators to configure custom API endpoints
    - Each signal type can have its own dedicated API endpoint
    - All fields are optional - if not configured, the system falls back to mock data
  
  3. Notes
    - These URLs work together with the existing `signals_api_key` field
    - The API key is used as the default Authorization header for all endpoints
    - Operators can gradually plug in real providers by configuring individual endpoints
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'jobs_api_url'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN jobs_api_url text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'funding_api_url'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN funding_api_url text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'layoffs_api_url'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN layoffs_api_url text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'hiring_api_url'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN hiring_api_url text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'tech_api_url'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN tech_api_url text DEFAULT '';
  END IF;
END $$;
