-- Cadence — destructive wipe of app tables in `public` on the linked cloud database.
-- Does not remove auth.users, Storage, or Supabase system schemas.
-- Used by: pnpm db:cloud --clear | db:cloud:clear (wipe only, no seed)
-- Full public wipe: cloud_clear_force.sql + pnpm db:cloud --clear-force

DROP TABLE IF EXISTS public.lesson_attempts CASCADE;
DROP TABLE IF EXISTS public.lesson_sessions CASCADE;
DROP TABLE IF EXISTS public.user_progress CASCADE;
DROP TABLE IF EXISTS public.conversation_progress CASCADE;
DROP TABLE IF EXISTS public.lesson_words CASCADE;
DROP TABLE IF EXISTS public.lessons CASCADE;
DROP TABLE IF EXISTS public.modules CASCADE;
