/*
  # Create Operator Notifications Table
  
  1. New Tables
    - `operator_notifications`
      - `id` (uuid, primary key) - Unique identifier for each notification
      - `user_id` (text) - User identifier (default: 'default' for public console)
      - `created_at` (timestamptz) - When the notification was created
      - `type` (text) - Type of alert (e.g., 'pressure_rising', 'funding_spike', 'layoffs_increase')
      - `message` (text) - Human-readable notification message
      - `signal_strength` (integer) - Signal strength at time of alert
      - `momentum` (integer) - Momentum score at time of alert
      - `forecast` (text) - Pressure forecast at time of alert
      - `read` (boolean) - Whether the notification has been read
  
  2. Security
    - Enable RLS on `operator_notifications` table
    - Add policy for public console mode (all users can read/write their notifications)
  
  3. Indexes
    - Index on `user_id` for fast filtering
    - Index on `created_at` for sorting
    - Index on `read` for unread count queries
*/

CREATE TABLE IF NOT EXISTS operator_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT 'default',
  created_at timestamptz DEFAULT now(),
  type text NOT NULL,
  message text NOT NULL,
  signal_strength integer DEFAULT 0,
  momentum integer DEFAULT 0,
  forecast text DEFAULT 'stable',
  read boolean DEFAULT false
);

ALTER TABLE operator_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON operator_notifications
  FOR SELECT
  TO public
  USING (user_id = 'default');

CREATE POLICY "Users can insert own notifications"
  ON operator_notifications
  FOR INSERT
  TO public
  WITH CHECK (user_id = 'default');

CREATE POLICY "Users can update own notifications"
  ON operator_notifications
  FOR UPDATE
  TO public
  USING (user_id = 'default')
  WITH CHECK (user_id = 'default');

CREATE POLICY "Users can delete own notifications"
  ON operator_notifications
  FOR DELETE
  TO public
  USING (user_id = 'default');

CREATE INDEX IF NOT EXISTS idx_operator_notifications_user_id 
  ON operator_notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_operator_notifications_created_at 
  ON operator_notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operator_notifications_read 
  ON operator_notifications(read);
