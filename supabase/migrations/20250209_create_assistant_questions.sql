-- Assistant Questions — logs every ConnectorAssistant Q&A for operator insights
CREATE TABLE assistant_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  question TEXT NOT NULL,
  answer TEXT,
  feedback TEXT CHECK (feedback IN ('up', 'down')),
  latency_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: users insert their own rows, operators read all
ALTER TABLE assistant_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own questions"
  ON assistant_questions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own feedback"
  ON assistant_questions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can read all"
  ON assistant_questions FOR SELECT
  TO authenticated
  USING (true);

-- Indexes for dashboard queries
CREATE INDEX idx_assistant_questions_created ON assistant_questions(created_at DESC);
CREATE INDEX idx_assistant_questions_feedback ON assistant_questions(feedback) WHERE feedback IS NOT NULL;
