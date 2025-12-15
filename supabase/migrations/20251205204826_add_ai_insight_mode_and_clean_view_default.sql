/*
  # Add AI Insight Mode and Clean View Default Settings

  1. Changes
    - Add `ai_insight_mode` column to `operator_settings`
      - Text field with default 'template'
      - Allowed values: 'template', 'template_plus_ai', 'ai_only'
    - Add `ai_clean_view_default` column to `operator_settings`
      - Boolean field with default false
      - Controls whether signal cards start with AI Clean View enabled

  2. Notes
    - Uses IF NOT EXISTS for full backwards compatibility
    - Maintains V3.9.1 behavior by default (template insights, raw signal view)
    - No impact on existing records or functionality
*/

ALTER TABLE operator_settings
  ADD COLUMN IF NOT EXISTS ai_insight_mode TEXT DEFAULT 'template';

ALTER TABLE operator_settings
  ADD COLUMN IF NOT EXISTS ai_clean_view_default BOOLEAN DEFAULT FALSE;