/*
  # Add Person Pressure Profile Field

  1. Changes
    - Add person pressure profiling field to signal_history table
      - `person_pressure_profile` (TEXT): 1-2 sentence psychological pressure description
    
  2. Purpose
    - Store computed pressure narratives for each person based on WHO role + signal type
    - Enable highly personalized outreach that speaks to actual pressure, not generic role pressure
    - Power elite-level intros that demonstrate deep understanding of recipient's situation
    
  3. Operator OS V4.3 Feature
    - Transforms WHO+SIGNAL into precise pressure statements
    - Examples:
      - "Delivery throughput is behind expectations. Hiring velocity is lagging while roadmap commitments remain fixed."
      - "Board pressure rising post-funding. Need to show immediate execution on growth promises."
    - Injected into AI rewrites for maximum psychological precision
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'signal_history' AND column_name = 'person_pressure_profile'
  ) THEN
    ALTER TABLE signal_history 
    ADD COLUMN person_pressure_profile TEXT;
  END IF;
END $$;