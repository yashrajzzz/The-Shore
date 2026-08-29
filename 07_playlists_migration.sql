-- Migration 07: User playlists
-- Each user can save up to 5 playlists, each holding up to 50 songs
-- (enforced in the app layer, same pattern as the existing max-3-rooms and
-- max-5-backgrounds-per-folder checks). A saved playlist can be bulk-added
-- into any room's queue instead of picking songs one at a time.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.playlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.playlist_songs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    playlist_id UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
    video_id TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT,
    artwork TEXT,
    duration_ms INTEGER,
    position DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS playlists_user_id_idx ON public.playlists(user_id);
CREATE INDEX IF NOT EXISTS playlist_songs_playlist_id_idx ON public.playlist_songs(playlist_id);

ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_songs ENABLE ROW LEVEL SECURITY;

-- Playlists: only the owner can see or manage their own
DROP POLICY IF EXISTS "Users can view their own playlists" ON public.playlists;
CREATE POLICY "Users can view their own playlists"
ON public.playlists FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own playlists" ON public.playlists;
CREATE POLICY "Users can create their own playlists"
ON public.playlists FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can rename their own playlists" ON public.playlists;
CREATE POLICY "Users can rename their own playlists"
ON public.playlists FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own playlists" ON public.playlists;
CREATE POLICY "Users can delete their own playlists"
ON public.playlists FOR DELETE
USING (auth.uid() = user_id);

-- Playlist songs: visibility/management gated on ownership of the parent playlist
DROP POLICY IF EXISTS "Users can view songs in their own playlists" ON public.playlist_songs;
CREATE POLICY "Users can view songs in their own playlists"
ON public.playlist_songs FOR SELECT
USING (EXISTS (SELECT 1 FROM public.playlists p WHERE p.id = playlist_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can add songs to their own playlists" ON public.playlist_songs;
CREATE POLICY "Users can add songs to their own playlists"
ON public.playlist_songs FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.playlists p WHERE p.id = playlist_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can remove songs from their own playlists" ON public.playlist_songs;
CREATE POLICY "Users can remove songs from their own playlists"
ON public.playlist_songs FOR DELETE
USING (EXISTS (SELECT 1 FROM public.playlists p WHERE p.id = playlist_id AND p.user_id = auth.uid()));

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
