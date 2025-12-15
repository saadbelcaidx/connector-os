/*
  # Add Dual-Campaign Connector System

  1. Changes to operator_settings table
    - Add `instantly_campaign_demand` (text) - campaign ID for companies with pressure
    - Add `instantly_campaign_supply` (text) - campaign ID for providers/solutions

  2. New Tables
    - `connector_sends`
      - `id` (uuid, primary key)
      - `user_id` (text) - operator who initiated send
      - `send_type` (text) - 'DEMAND' or 'SUPPLY'
      - `campaign_id` (text) - Instantly campaign ID
      - `company_name` (text) - company name
      - `company_domain` (text) - company domain
      - `contact_email` (text) - contact email address
      - `contact_name` (text) - contact name
      - `contact_title` (text) - contact title
      - `intro_text` (text) - generated intro text
      - `signal_metadata` (jsonb) - signal data that triggered send
      - `instantly_status` (text) - sent, opened, replied, booked
      - `instantly_lead_id` (text) - Instantly lead ID for status sync
      - `sent_at` (timestamptz) - when sent to Instantly
      - `last_status_check` (timestamptz) - last time status was synced
      - `created_at` (timestamptz)

  3. Security
    - Enable RLS on `connector_sends` table
    - Add policy for authenticated users to read/write their own sends

  4. Notes
    - This transforms Connector OS into a true dual-sided market-maker
    - Tracks both demand (companies with needs) and supply (providers) separately
    - Enables ROI visibility and status tracking
*/

-- Add dual campaign fields to operator_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'instantly_campaign_demand'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN instantly_campaign_demand text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operator_settings' AND column_name = 'instantly_campaign_supply'
  ) THEN
    ALTER TABLE operator_settings ADD COLUMN instantly_campaign_supply text;
  END IF;
END $$;

-- Create connector_sends table
CREATE TABLE IF NOT EXISTS connector_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'default',
  send_type text NOT NULL CHECK (send_type IN ('DEMAND', 'SUPPLY')),
  campaign_id text NOT NULL,
  company_name text NOT NULL,
  company_domain text,
  contact_email text NOT NULL,
  contact_name text,
  contact_title text,
  intro_text text,
  signal_metadata jsonb DEFAULT '{}'::jsonb,
  instantly_status text DEFAULT 'sent',
  instantly_lead_id text,
  sent_at timestamptz DEFAULT now(),
  last_status_check timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE connector_sends ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own sends
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'connector_sends' 
    AND policyname = 'Users can view own sends'
  ) THEN
    CREATE POLICY "Users can view own sends"
      ON connector_sends
      FOR SELECT
      TO authenticated
      USING (user_id = auth.jwt()->>'sub' OR user_id = 'default');
  END IF;
END $$;

-- Policy: Users can insert their own sends
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'connector_sends' 
    AND policyname = 'Users can create sends'
  ) THEN
    CREATE POLICY "Users can create sends"
      ON connector_sends
      FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.jwt()->>'sub' OR user_id = 'default');
  END IF;
END $$;

-- Policy: Users can update their own sends
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'connector_sends' 
    AND policyname = 'Users can update own sends'
  ) THEN
    CREATE POLICY "Users can update own sends"
      ON connector_sends
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.jwt()->>'sub' OR user_id = 'default')
      WITH CHECK (user_id = auth.jwt()->>'sub' OR user_id = 'default');
  END IF;
END $$;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_connector_sends_user_id ON connector_sends(user_id);
CREATE INDEX IF NOT EXISTS idx_connector_sends_created_at ON connector_sends(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_connector_sends_send_type ON connector_sends(send_type);
CREATE INDEX IF NOT EXISTS idx_connector_sends_instantly_status ON connector_sends(instantly_status);
