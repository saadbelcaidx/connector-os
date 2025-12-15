/*
  # Operator OS V4 - Auth and Access Control System

  1. New Tables
    - `users`
      - `id` (uuid, primary key) - Unique user identifier
      - `username` (text, unique) - Username for login
      - `password_hash` (text) - Hashed password (bcrypt)
      - `email` (text) - User email
      - `tier` (text) - Access tier: FREE, CORE, ADVANCED, OPERATOR
      - `is_admin` (boolean) - Admin access flag
      - `created_at` (timestamptz) - Account creation timestamp
      - `last_login` (timestamptz) - Last login timestamp

    - `usage_logs`
      - `id` (uuid, primary key) - Unique log identifier
      - `user_id` (uuid, foreign key) - Reference to users table
      - `tool_name` (text) - Name of tool used (e.g., "Matching Engine V3")
      - `signal_strength` (numeric) - Computed signal strength
      - `pressure_forecast` (text) - Prediction result
      - `momentum_score` (numeric) - Momentum calculation
      - `intro_generated` (boolean) - Whether intro template was generated
      - `metadata` (jsonb) - Additional data
      - `created_at` (timestamptz) - Log timestamp

  2. Security
    - Enable RLS on all tables
    - Users can read their own user record
    - Users can read their own usage logs
    - Admins can read all records
    - Only admins can modify user tiers
    - Usage logs are insert-only for authenticated users

  3. Access Tiers
    - FREE: Calculator + Library
    - CORE: + Matching Engine V1 + Mental Models
    - ADVANCED: + Matching Engine V3 + Forecasting + Suggested Intro
    - OPERATOR: All features + Background Sync + Alerts

  4. Default Admin Account
    - Creates a default admin user for initial setup
    - Password should be changed immediately after deployment
*/

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  email text,
  tier text NOT NULL DEFAULT 'FREE',
  is_admin boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  last_login timestamptz
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own record"
  ON users
  FOR SELECT
  TO authenticated
  USING (id = (current_setting('app.user_id', true))::uuid);

CREATE POLICY "Admins can read all users"
  ON users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (current_setting('app.user_id', true))::uuid
      AND is_admin = true
    )
  );

CREATE POLICY "Admins can update user tiers"
  ON users
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (current_setting('app.user_id', true))::uuid
      AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (current_setting('app.user_id', true))::uuid
      AND is_admin = true
    )
  );

CREATE POLICY "Anonymous can check username exists"
  ON users
  FOR SELECT
  TO anon
  USING (true);

CREATE TABLE IF NOT EXISTS usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  signal_strength numeric DEFAULT 0,
  pressure_forecast text,
  momentum_score numeric DEFAULT 0,
  intro_generated boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own logs"
  ON usage_logs
  FOR SELECT
  TO authenticated
  USING (user_id = (current_setting('app.user_id', true))::uuid);

CREATE POLICY "Admins can read all logs"
  ON usage_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = (current_setting('app.user_id', true))::uuid
      AND is_admin = true
    )
  );

CREATE POLICY "Users can insert own logs"
  ON usage_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (current_setting('app.user_id', true))::uuid);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_created 
  ON usage_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_logs_tool 
  ON usage_logs(tool_name, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin') THEN
    INSERT INTO users (username, password_hash, email, tier, is_admin)
    VALUES (
      'admin',
      '$2a$10$rQ8YZ8PZXqK3wK3wK3wK3uO3wK3wK3wK3wK3wK3wK3wK3wK3wK3wK',
      'admin@operatoros.dev',
      'OPERATOR',
      true
    );
  END IF;
END $$;
