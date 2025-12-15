/*
  # Add JSON Body Fields for POST API Endpoints

  1. Changes
    - Add `funding_api_body` column to store JSON body for Funding Events POST requests
    - Add `layoffs_api_body` column to store JSON body for Layoffs POST requests
    - Add `tech_api_body` column to store JSON body for Tool/Tech Stack POST requests
    - Add `jobs_api_body` column to store JSON body for Jobs POST requests
    - Add `hiring_api_body` column to store JSON body for Hiring Velocity POST requests

  2. Purpose
    - Enable POST requests with custom JSON bodies for API endpoints
    - When body exists → POST request, when empty → GET request
    - Default prefill: { "limit": 10 } for structured APIs
    - Supports Intellizence API and other POST-based providers

  3. Security
    - JSON bodies stored as text (JSONB could be used for validation)
    - No sensitive data should be stored in bodies
    - API keys remain separate in signals_api_key field

  4. Notes
    - Empty body = GET request (current behavior)
    - Non-empty body = POST request with JSON payload
    - API key sent via "x-api-key" header for POST requests
    - Automatic POST mode detection for "api.intellizence.com" URLs
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'funding_api_body'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN funding_api_body text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'layoffs_api_body'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN layoffs_api_body text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'tech_api_body'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN tech_api_body text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'jobs_api_body'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN jobs_api_body text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'hiring_api_body'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN hiring_api_body text DEFAULT '';
  END IF;
END $$;
