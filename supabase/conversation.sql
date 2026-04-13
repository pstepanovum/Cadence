-- Cloud: conversation module progress (RLS). Run after modules.sql.

CREATE TABLE IF NOT EXISTS public.conversation_progress (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_slug     text NOT NULL,
  best_score      smallint NOT NULL DEFAULT 0,
  last_score      smallint NOT NULL DEFAULT 0,
  passed          boolean NOT NULL DEFAULT false,
  completed_at    timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_slug)
);

ALTER TABLE public.conversation_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_select_conversation_progress" ON public.conversation_progress;
DROP POLICY IF EXISTS "owner_insert_conversation_progress" ON public.conversation_progress;
DROP POLICY IF EXISTS "owner_update_conversation_progress" ON public.conversation_progress;
DROP POLICY IF EXISTS "owner_delete_conversation_progress" ON public.conversation_progress;

CREATE POLICY "owner_select_conversation_progress"
  ON public.conversation_progress FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "owner_insert_conversation_progress"
  ON public.conversation_progress FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner_update_conversation_progress"
  ON public.conversation_progress FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "owner_delete_conversation_progress"
  ON public.conversation_progress FOR DELETE USING (user_id = auth.uid());
