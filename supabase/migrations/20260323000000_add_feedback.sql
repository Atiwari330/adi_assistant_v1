-- Feedback categories for classifying what the AI got wrong
CREATE TYPE public.feedback_category AS ENUM (
  'priority_wrong',
  'action_type_wrong',
  'delegation_wrong',
  'missing_context',
  'not_an_item',
  'should_split',
  'other'
);

-- User feedback on action items for continuous system improvement
CREATE TABLE public.action_item_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_item_id  UUID NOT NULL REFERENCES public.action_items(id) ON DELETE CASCADE,
  category        public.feedback_category NOT NULL,
  comment         TEXT NOT NULL,
  resolved        BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.action_item_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own feedback"
  ON public.action_item_feedback FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_feedback_user_created
  ON public.action_item_feedback (user_id, created_at DESC);

CREATE INDEX idx_feedback_action_item
  ON public.action_item_feedback (action_item_id);

CREATE INDEX idx_feedback_unresolved
  ON public.action_item_feedback (user_id, created_at DESC)
  WHERE resolved = false;

-- Reuse existing updated_at trigger function
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.action_item_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime (optional, for future use)
ALTER PUBLICATION supabase_realtime ADD TABLE public.action_item_feedback;
