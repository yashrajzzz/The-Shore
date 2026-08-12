-- Migration 04: Consolidated Fix
-- Ensures all required columns exist on rooms & queue tables
-- Safe to run multiple times (uses IF NOT EXISTS).

-- rooms: rich song metadata
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS current_song_video_id TEXT;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS current_song_artist TEXT;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS current_song_artwork TEXT;

-- queue: rich song metadata
ALTER TABLE public.queue ADD COLUMN IF NOT EXISTS video_id TEXT;
ALTER TABLE public.queue ADD COLUMN IF NOT EXISTS artist TEXT;
ALTER TABLE public.queue ADD COLUMN IF NOT EXISTS artwork TEXT;
ALTER TABLE public.queue ADD COLUMN IF NOT EXISTS duration_ms INTEGER;

-- Ensure rooms & queue are in realtime publication
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
