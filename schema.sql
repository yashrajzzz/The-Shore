-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Drop existing table if it exists to forcefully rebuild it
DROP TABLE IF EXISTS public.rooms CASCADE;

-- Create the rooms table
CREATE TABLE public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    background_urls TEXT[] DEFAULT '{}',
    current_song_url TEXT,
    current_song_title TEXT,
    current_song_started_at TIMESTAMPTZ,
    is_playing BOOLEAN DEFAULT false,
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create the queue table
CREATE TABLE public.queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    video_url TEXT NOT NULL,
    title TEXT NOT NULL,
    added_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read rooms
CREATE POLICY "Rooms are visible to everyone" 
ON public.rooms FOR SELECT 
USING (true);

-- Policy: Anyone can read queue for any room
CREATE POLICY "Queue is visible to everyone"
ON public.queue FOR SELECT
USING (true);

-- Policy: Authenticated users can insert to queue
CREATE POLICY "Authenticated users can add to queue"
ON public.queue FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- Policy: Authenticated users can delete from queue (to pop songs)
CREATE POLICY "Authenticated users can delete from queue"
ON public.queue FOR DELETE
USING (auth.role() = 'authenticated');

-- Policy: Only authenticated users can insert rooms
CREATE POLICY "Authenticated users can create rooms" 
ON public.rooms FOR INSERT 
WITH CHECK (auth.uid() = created_by);

-- Policy: Authenticated users can update rooms
CREATE POLICY "Authenticated users can update rooms"
ON public.rooms FOR UPDATE
USING (auth.role() = 'authenticated');

-- Policy: Only creator can delete their room
CREATE POLICY "Users can delete their own rooms"
ON public.rooms FOR DELETE
USING (auth.uid() = created_by);

-- Setup Cron Job to delete abandoned rooms
-- Runs every 5 minutes
SELECT cron.schedule(
  'delete-abandoned-rooms',
  '*/5 * * * *',
  $$ DELETE FROM public.rooms WHERE last_active_at < NOW() - INTERVAL '30 minutes' $$
);

-- FORCE SCHEMA CACHE RELOAD
NOTIFY pgrst, 'reload schema';
