/*
  # Add Signal History Table for V3 Predictions

  1. New Tables
    - `signal_history`
      - `id` (uuid, primary key) - Unique identifier
      - `user_id` (text) - User identifier for multi-tenant support
      - `signal_strength` (numeric) - Computed signal strength score (0-100)
      - `jobs_count` (numeric) - Parsed job postings count
      - `funding_amount` (numeric) - Parsed funding events count
      - `layoffs_count` (numeric) - Parsed layoffs count
      - `hiring_velocity` (numeric) - Parsed hiring velocity score
      - `tool_adoption` (numeric) - Parsed tool adoption score
      - `momentum_score` (numeric) - Computed momentum between data points
      - `pressure_forecast` (text) - Prediction result: rising, stable, falling
      - `created_at` (timestamptz) - Timestamp for trend analysis

  2. Security
    - Enable RLS on `signal_history` table
    - Add policy for users to read their own signal history
    - Add policy for users to insert their own signal history

  3. Notes
    - This table stores time-series data for predictive analysis
    - 7-day moving average will use the last 7 records
    - Momentum score computed as delta between consecutive signal strengths
*/

CREATE TABLE IF NOT EXISTS signal_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'default',
  signal_strength numeric NOT NULL DEFAULT 0,
  jobs_count numeric DEFAULT 0,
  funding_amount numeric DEFAULT 0,
  layoffs_count numeric DEFAULT 0,
  hiring_velocity numeric DEFAULT 0,
  tool_adoption numeric DEFAULT 0,
  momentum_score numeric DEFAULT 0,
  pressure_forecast text DEFAULT 'stable',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE signal_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own signal history"
  ON signal_history
  FOR SELECT
  TO authenticated
  USING (user_id = current_user);

CREATE POLICY "Anonymous users can read default signal history"
  ON signal_history
  FOR SELECT
  TO anon
  USING (user_id = 'default');

CREATE POLICY "Users can insert own signal history"
  ON signal_history
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = current_user);

CREATE POLICY "Anonymous users can insert default signal history"
  ON signal_history
  FOR INSERT
  TO anon
  WITH CHECK (user_id = 'default');

CREATE INDEX IF NOT EXISTS idx_signal_history_user_created 
  ON signal_history(user_id, created_at DESC);
