/*
  # Restore Plain Text API Keys for Working Configuration

  1. Changes
    - Restore all plain text API key columns to operator_settings
    - Remove any encrypted key columns that were added
    - Restore original working state before encryption attempts

  2. Restored Columns
    - signals_api_key
    - openai_api_key
    - azure_openai_key
    - claude_api_key
    - enrichment_api_key
    - jobs_api_key
    - funding_api_key
    - layoffs_api_key
    - hiring_api_key
    - tech_api_key
    - ai_openai_api_key
    - ai_azure_api_key
    - ai_claude_api_key

  3. Security
    - RLS policies still protect data access
    - Keys only accessible to authenticated users
*/

DO $$
BEGIN
  -- Remove encrypted columns if they exist
  ALTER TABLE operator_settings DROP COLUMN IF EXISTS apollo_api_key_encrypted;
  ALTER TABLE operator_settings DROP COLUMN IF EXISTS openai_api_key_encrypted;
  ALTER TABLE operator_settings DROP COLUMN IF EXISTS azure_openai_key_encrypted;
  ALTER TABLE operator_settings DROP COLUMN IF EXISTS claude_api_key_encrypted;
  ALTER TABLE operator_settings DROP COLUMN IF EXISTS rapidapi_key_encrypted;
  ALTER TABLE operator_settings DROP COLUMN IF EXISTS intellizence_key_encrypted;

  -- Restore plain text API key columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'signals_api_key'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN signals_api_key TEXT DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'openai_api_key'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN openai_api_key TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'azure_openai_key'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN azure_openai_key TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'claude_api_key'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN claude_api_key TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'enrichment_api_key'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN enrichment_api_key TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'jobs_api_key'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN jobs_api_key TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'funding_api_key'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN funding_api_key TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'layoffs_api_key'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN layoffs_api_key TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'hiring_api_key'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN hiring_api_key TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'tech_api_key'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN tech_api_key TEXT;
  END IF;

  -- Restore AI-specific API key columns (used by Settings.tsx)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'ai_openai_api_key'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN ai_openai_api_key TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'ai_azure_api_key'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN ai_azure_api_key TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'ai_claude_api_key'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN ai_claude_api_key TEXT;
  END IF;
END $$;

-- Remove encryption functions if they exist
DROP FUNCTION IF EXISTS encrypt_key(TEXT);
DROP FUNCTION IF EXISTS decrypt_key(TEXT);
