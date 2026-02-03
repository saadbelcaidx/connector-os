-- ============================================================================
-- PLATFORM CONFIGS: Add subheadline column
--
-- Purpose: Allow members to customize both headline AND subheadline
-- so their platform shows THEIR branding, not Connector OS branding.
-- ============================================================================

-- Add subheadline column
ALTER TABLE platform_configs
ADD COLUMN IF NOT EXISTS subheadline TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN platform_configs.subheadline IS
  'Custom subheadline shown below the main headline. If null, no subheadline is shown.';

-- Update existing rows with a neutral default (optional)
-- Members can customize this in their platform config
UPDATE platform_configs
SET subheadline = 'Find strategic alignments instantly'
WHERE subheadline IS NULL;
