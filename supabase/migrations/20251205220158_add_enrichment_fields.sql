/*
  # Add Person Enrichment Fields

  1. Changes to operator_settings
    - `enrichment_provider` (text) - Which provider to use: apollo, pdl, ssm, or none
    - `enrichment_api_key` (text) - API key for the enrichment provider
    - `enrichment_endpoint_url` (text) - Custom endpoint URL for SSM provider

  2. Changes to signal_history
    - `enriched_person_name` (text) - Name of the enriched contact
    - `enriched_person_title` (text) - Title of the enriched contact
    - `enriched_person_email` (text) - Email of the enriched contact
    - `enriched_person_linkedin` (text) - LinkedIn URL of the enriched contact
    - `enriched_person_confidence` (integer) - Confidence score from enrichment provider
    - `target_titles` (text[]) - Array of titles that were targeted for enrichment

  3. Security
    - No RLS changes needed, existing policies cover new fields

  Note: All fields are optional and won't break existing functionality
*/

ALTER TABLE operator_settings
ADD COLUMN IF NOT EXISTS enrichment_provider TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS enrichment_api_key TEXT,
ADD COLUMN IF NOT EXISTS enrichment_endpoint_url TEXT;

ALTER TABLE signal_history
ADD COLUMN IF NOT EXISTS enriched_person_name TEXT,
ADD COLUMN IF NOT EXISTS enriched_person_title TEXT,
ADD COLUMN IF NOT EXISTS enriched_person_email TEXT,
ADD COLUMN IF NOT EXISTS enriched_person_linkedin TEXT,
ADD COLUMN IF NOT EXISTS enriched_person_confidence INTEGER,
ADD COLUMN IF NOT EXISTS target_titles TEXT[];