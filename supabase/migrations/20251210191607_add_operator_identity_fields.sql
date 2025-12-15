/*
  # Add Operator Identity Fields

  1. Changes
    - Add `operator_name` TEXT column to `operator_settings` table
    - Add `operator_company` TEXT column to `operator_settings` table

  2. Purpose
    - Separate operator identity (who YOU are) from connector database (who you introduce)
    - Support campaign mode routing (provider uses operator identity, connector uses third-party database)
*/

ALTER TABLE operator_settings
ADD COLUMN IF NOT EXISTS operator_name TEXT DEFAULT '';

ALTER TABLE operator_settings
ADD COLUMN IF NOT EXISTS operator_company TEXT DEFAULT '';
