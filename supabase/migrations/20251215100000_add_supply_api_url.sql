/*
  # Add Supply API URL field

  Adds the supply_api_url column to operator_settings for dynamic supply discovery.

  This enables two-sided marketplace discovery:
  - jobs_api_url: Discovers DEMAND companies (companies hiring)
  - supply_api_url: Discovers SUPPLY companies (agencies, staffing, service providers)

  Both sides are now discovered dynamically from Apify datasets.
*/

ALTER TABLE operator_settings
ADD COLUMN IF NOT EXISTS supply_api_url text DEFAULT '';

COMMENT ON COLUMN operator_settings.supply_api_url IS 'Apify dataset URL for discovering supply-side companies (agencies, staffing firms, service providers)';
