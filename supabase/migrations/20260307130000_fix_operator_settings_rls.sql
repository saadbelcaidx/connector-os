-- Fix: RLS policies used current_user (Postgres role name = "authenticated")
-- instead of auth.uid()::text (actual Supabase user UUID).
-- Result: authenticated users could never read/write their own settings.
-- Upsert silently failed, save appeared to work but DB never updated.

-- Drop broken policies
DROP POLICY IF EXISTS "Authenticated users can read own settings" ON operator_settings;
DROP POLICY IF EXISTS "Authenticated users can insert own settings" ON operator_settings;
DROP POLICY IF EXISTS "Authenticated users can update own settings" ON operator_settings;

-- Recreate with auth.uid()::text
CREATE POLICY "Authenticated users can read own settings"
  ON operator_settings
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::text OR user_id = 'default');

CREATE POLICY "Authenticated users can insert own settings"
  ON operator_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Authenticated users can update own settings"
  ON operator_settings
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid()::text OR user_id = 'default')
  WITH CHECK (user_id = auth.uid()::text OR user_id = 'default');
