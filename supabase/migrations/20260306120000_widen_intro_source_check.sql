-- Widen intro_source CHECK to include ai-v2 and ai-v2-fulfillment
ALTER TABLE introductions DROP CONSTRAINT IF EXISTS introductions_intro_source_check;
ALTER TABLE introductions ADD CONSTRAINT introductions_intro_source_check
  CHECK (intro_source IN ('template', 'ai', 'ai-fallback', 'ai-v2', 'ai-v2-fulfillment'));
