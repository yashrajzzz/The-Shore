-- Migration 06: Playlist-style queue
-- Songs no longer get deleted from the queue when they start playing.
-- Adds ordering (position) and tracks which queue row is "now playing"
-- so the app can advance through the list without removing rows, and so
-- clicking any row (played or not) can replay it.
-- Safe to run multiple times.

-- queue: explicit ordering, independent of created_at
ALTER TABLE public.queue ADD COLUMN IF NOT EXISTS position DOUBLE PRECISION;

-- Backfill position from insertion order for existing rows that predate this column
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY room_id ORDER BY created_at ASC) AS rn
  FROM public.queue
  WHERE position IS NULL
)
UPDATE public.queue q
SET position = ordered.rn
FROM ordered
WHERE q.id = ordered.id;

ALTER TABLE public.queue ALTER COLUMN position SET DEFAULT 0;

-- rooms: track which queue row is currently playing (instead of inferring
-- it from a row's mere presence, since rows now stay in the table forever)
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS current_queue_id UUID REFERENCES public.queue(id) ON DELETE SET NULL;

-- Allow authenticated users to update queue rows (needed to persist reorder
-- and to null out current_queue_id references via the FK above)
DROP POLICY IF EXISTS "Authenticated users can update queue" ON public.queue;
CREATE POLICY "Authenticated users can update queue"
ON public.queue FOR UPDATE
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
