/*
  # Add WHO Classification to Signal History

  1. Changes
    - Add `who_has_pressure_roles` field to signal_history table
      - Stores array of role titles that are under pressure based on signal type
      - Examples: ["CTO", "Head of Engineering", "VP People Ops"]
    
  2. Details
    - Field type: TEXT[] (PostgreSQL array of text)
    - Default: Empty array
    - Used by Operator OS Matching Engine V4.1 to classify which roles are under pressure
    - Classification based on signal type, company size, and metadata
    
  3. Classification Logic (applied in app layer)
    - Job postings surge → Engineering, People Ops leads
    - Funding events → CEO, COO, CRO based on round
    - Layoffs → CFO, COO, HR based on size
    - Hiring velocity → Operations, Engineering leads
    - Tech stack changes → CTO, VP Eng, DevOps
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signal_history' AND column_name = 'who_has_pressure_roles'
  ) THEN
    ALTER TABLE signal_history 
    ADD COLUMN who_has_pressure_roles TEXT[] DEFAULT '{}';
  END IF;
END $$;