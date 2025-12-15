/*
  # Add Per-Signal API Configuration Columns

  1. Changes
    - Add method, headers, body, and api_key columns for each signal type:
      - jobs_method, jobs_headers, jobs_body, jobs_api_key
      - funding_method, funding_headers, funding_body, funding_api_key
      - layoffs_method, layoffs_headers, layoffs_body, layoffs_api_key
      - hiring_method, hiring_headers, hiring_body, hiring_api_key
      - tech_method, tech_headers, tech_body, tech_api_key

  2. Purpose
    - Enable full per-signal API configuration flexibility
    - Support both GET and POST methods per signal
    - Allow custom headers (authorization, content-type, etc.)
    - Support custom request bodies for POST requests
    - Enable separate API keys per signal for different providers

  3. Benefits
    - Jobs API can use JSearch (GET + RapidAPI headers)
    - Funding can use Intellizence (POST + x-api-key)
    - Layoffs can use custom endpoint (GET + Bearer token)
    - Each signal can connect to different enterprise APIs
    - Maximum flexibility for operator's existing API contracts

  4. Default Values
    - Method: 'GET' (backward compatible)
    - Headers: {} (empty JSON object)
    - Body: {} (empty JSON object)
    - API Key: NULL (optional, can use shared key or custom per signal)

  5. Data Types
    - method: TEXT (stores 'GET', 'POST', 'PUT', 'PATCH', etc.)
    - headers: JSONB (stores structured header key-value pairs)
    - body: JSONB (stores structured request body)
    - api_key: TEXT (stores signal-specific API key, can be different from shared key)
*/

DO $$
BEGIN
  -- Jobs Signal Configuration
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'jobs_method'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN jobs_method text DEFAULT 'GET';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'jobs_headers'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN jobs_headers jsonb DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'jobs_body'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN jobs_body jsonb DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'jobs_api_key'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN jobs_api_key text DEFAULT '';
  END IF;

  -- Funding Signal Configuration
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'funding_method'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN funding_method text DEFAULT 'GET';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'funding_headers'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN funding_headers jsonb DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'funding_body'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN funding_body jsonb DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'funding_api_key'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN funding_api_key text DEFAULT '';
  END IF;

  -- Layoffs Signal Configuration
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'layoffs_method'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN layoffs_method text DEFAULT 'GET';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'layoffs_headers'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN layoffs_headers jsonb DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'layoffs_body'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN layoffs_body jsonb DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'layoffs_api_key'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN layoffs_api_key text DEFAULT '';
  END IF;

  -- Hiring Signal Configuration
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'hiring_method'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN hiring_method text DEFAULT 'GET';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'hiring_headers'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN hiring_headers jsonb DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'hiring_body'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN hiring_body jsonb DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'hiring_api_key'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN hiring_api_key text DEFAULT '';
  END IF;

  -- Tech Signal Configuration
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'tech_method'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN tech_method text DEFAULT 'GET';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'tech_headers'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN tech_headers jsonb DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'tech_body'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN tech_body jsonb DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'tech_api_key'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN tech_api_key text DEFAULT '';
  END IF;
END $$;
