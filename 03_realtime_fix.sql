-- Migration 03: Fix realtime sync for rooms & queue
--
-- Without this, RoomClient.tsx's postgres_changes subscriptions for the
-- `rooms` and `queue` tables never fire, because those tables were never
-- added to the `supabase_realtime` publication (only `messages` was, in
-- 01_chat_migration.sql). This breaks live sync of now-playing state and
-- the shared queue between listeners in the same room.
--
-- Safe to run multiple times.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'rooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'queue'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.queue;
  END IF;
END $$;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
