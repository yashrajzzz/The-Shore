-- Migration 01: Add Chat Messages Table

-- Drop it if it exists so we can recreate it with correct types
DROP TABLE IF EXISTS public.messages;

-- Create the messages table
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read messages in any room
CREATE POLICY "Messages are visible to everyone"
ON public.messages FOR SELECT
USING (true);

-- Policy: Authenticated users can insert messages
CREATE POLICY "Authenticated users can send messages"
ON public.messages FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- ENABLE REALTIME FOR MESSAGES
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- FORCE SCHEMA CACHE RELOAD
NOTIFY pgrst, 'reload schema';
