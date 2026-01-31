-- Add enhance_intro toggle to operator_settings
-- When true: use IntroAI (verbose, personalized)
-- When false: use Composer (template, fast)
-- Default: false (user must opt-in to AI)

ALTER TABLE operator_settings
ADD COLUMN IF NOT EXISTS enhance_intro BOOLEAN DEFAULT false;

-- Comment for documentation
COMMENT ON COLUMN operator_settings.enhance_intro IS 'When true, use AI-enhanced intros (IntroAI). When false, use template intros (Composer).';
