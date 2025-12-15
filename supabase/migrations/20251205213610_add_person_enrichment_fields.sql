/*
  # Add Person Enrichment Fields to Signal History

  1. Changes
    - Add person enrichment fields to signal_history table
      - `person_name` (TEXT): Full name of the identified contact
      - `person_email` (TEXT): Email address of the contact
      - `person_linkedin` (TEXT): LinkedIn profile URL
      - `person_title` (TEXT): Current job title of the contact
      - `target_titles` (TEXT[]): Array of titles to search for based on WHO classification
    
  2. Purpose
    - Store enriched contact data from WHO → PERSON pipeline
    - Enable personalized outreach with actual contact information
    - Track which titles were targeted for each signal
    
  3. Operator OS V4.2 Feature
    - Converts pressure-based role classification into actionable contacts
    - Automatically fetches person data based on company + target titles
    - Maintains backwards compatibility when enrichment unavailable
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signal_history' AND column_name = 'person_name'
  ) THEN
    ALTER TABLE signal_history 
    ADD COLUMN person_name TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signal_history' AND column_name = 'person_email'
  ) THEN
    ALTER TABLE signal_history 
    ADD COLUMN person_email TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signal_history' AND column_name = 'person_linkedin'
  ) THEN
    ALTER TABLE signal_history 
    ADD COLUMN person_linkedin TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signal_history' AND column_name = 'person_title'
  ) THEN
    ALTER TABLE signal_history 
    ADD COLUMN person_title TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signal_history' AND column_name = 'target_titles'
  ) THEN
    ALTER TABLE signal_history 
    ADD COLUMN target_titles TEXT[] DEFAULT '{}';
  END IF;
END $$;