/*
  # Add Piloterr Funding Fields

  Replaces Intellizence with Piloterr Crunchbase API for funding signals.

  New columns:
  - piloterr_api_key: API key for Piloterr
  - funding_days_since: Filter funding rounds by days since announcement
  - funding_investment_types: Array of investment types to filter
*/

ALTER TABLE operator_settings ADD COLUMN IF NOT EXISTS piloterr_api_key text DEFAULT '';
ALTER TABLE operator_settings ADD COLUMN IF NOT EXISTS funding_days_since integer DEFAULT 30;
ALTER TABLE operator_settings ADD COLUMN IF NOT EXISTS funding_investment_types text[] DEFAULT ARRAY['series_a', 'series_b']::text[];
