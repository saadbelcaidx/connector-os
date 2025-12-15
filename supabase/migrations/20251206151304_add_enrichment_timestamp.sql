/*
  # Add Enrichment Timestamp for Caching

  1. Changes
    - Add `enriched_at` (timestamptz) to signal_history table
      - Tracks when person enrichment was performed
      - Used for caching logic (skip if enriched within 7 days)
      - Used for staleness detection (warn if > 30 days old)

  2. Purpose
    - Enable intelligent caching to reduce API calls
    - Avoid re-enriching same domain+titles repeatedly
    - Support staleness warnings in UI

  3. Notes
    - NULL means never enriched
    - Non-NULL means enrichment was attempted (even if no contact found)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signal_history' AND column_name = 'enriched_at'
  ) THEN
    ALTER TABLE signal_history
    ADD COLUMN enriched_at timestamptz;
  END IF;
END $$;
