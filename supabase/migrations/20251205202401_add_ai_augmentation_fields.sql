/*
  # Add AI Augmentation Layer Configuration

  1. New Columns
    - `ai_openai_api_key` (text) - OpenAI API key for GPT models
    - `ai_azure_api_key` (text) - Azure OpenAI API key
    - `ai_claude_api_key` (text) - Anthropic Claude API key
    - `ai_model` (text, default: 'gpt-4.1-mini') - Selected AI model identifier
    - `ai_enable_rewrite` (boolean, default: true) - Toggle for AI rewriting suggested intro
    - `ai_enable_signal_cleaning` (boolean, default: true) - Toggle for AI cleaning API responses
    - `ai_enable_enrichment` (boolean, default: true) - Toggle for AI enriching signals with insights
    - `ai_enable_forecasting` (boolean, default: false) - Toggle for AI-assisted forecasting

  2. Changes
    - All columns added to `operator_settings` table with safe IF NOT EXISTS checks
    - Default values set for toggles and model selection
    - API keys stored as nullable text fields

  3. Security
    - API keys are sensitive and should be encrypted at application layer
    - Keys only accessible to authenticated users via RLS policies
*/

DO $$
BEGIN
  -- Add OpenAI API key column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'ai_openai_api_key'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN ai_openai_api_key TEXT;
  END IF;

  -- Add Azure OpenAI API key column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'ai_azure_api_key'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN ai_azure_api_key TEXT;
  END IF;

  -- Add Claude API key column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'ai_claude_api_key'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN ai_claude_api_key TEXT;
  END IF;

  -- Add AI model selector column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'ai_model'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN ai_model TEXT DEFAULT 'gpt-4.1-mini';
  END IF;

  -- Add AI rewrite toggle
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'ai_enable_rewrite'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN ai_enable_rewrite BOOLEAN DEFAULT true;
  END IF;

  -- Add AI signal cleaning toggle
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'ai_enable_signal_cleaning'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN ai_enable_signal_cleaning BOOLEAN DEFAULT true;
  END IF;

  -- Add AI enrichment toggle
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'ai_enable_enrichment'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN ai_enable_enrichment BOOLEAN DEFAULT true;
  END IF;

  -- Add AI forecasting toggle
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'ai_enable_forecasting'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN ai_enable_forecasting BOOLEAN DEFAULT false;
  END IF;
END $$;
