-- Add work owner search settings to operator_settings table
ALTER TABLE operator_settings
  ADD COLUMN IF NOT EXISTS work_owner_departments text DEFAULT '',
  ADD COLUMN IF NOT EXISTS work_owner_keywords    text DEFAULT '';
