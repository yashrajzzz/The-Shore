-- Migration: Add richer song metadata columns
-- Run this in your Supabase SQL Editor

-- Add new columns to rooms table
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS current_song_video_id TEXT;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS current_song_artist TEXT;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS current_song_artwork TEXT;

-- Add new columns to queue table
ALTER TABLE public.queue ADD COLUMN IF NOT EXISTS video_id TEXT;
ALTER TABLE public.queue ADD COLUMN IF NOT EXISTS artist TEXT;
ALTER TABLE public.queue ADD COLUMN IF NOT EXISTS artwork TEXT;
ALTER TABLE public.queue ADD COLUMN IF NOT EXISTS duration_ms INTEGER;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
