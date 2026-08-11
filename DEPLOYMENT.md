# Deploying The Shore

## 1. Music search & playback — how it works (free, no quota limits)

- **Search + metadata**: iTunes Search API (`/api/itunes`) — official, free, unlimited, no key required. Gives title, artist, artwork, and a 30s preview.
- **Video matching**: `/api/youtube-search` races several public Invidious instances (no API key, no quota), falling back to direct YouTube HTML scraping if all Invidious instances are down.
- **Playback**: the official YouTube IFrame Player API (`YouTubePlayer.tsx`) — this is the embedded player, same as any site embedding a YouTube video. It's within YouTube's Terms of Service since no audio stream is extracted or downloaded.

This is already the best free/unlimited combination available — no API keys, no daily caps, no billing. The only soft spot is that public Invidious instances occasionally go down or rate-limit; the code already handles that by racing 5 instances in parallel and falling back to scraping. If you ever see search reliability issues, the fix is adding/rotating more Invidious instances in `src/app/api/youtube-search/route.ts`, not changing the overall approach.

## 2. Supabase setup (fresh project)

Run these SQL files **in this exact order** in the Supabase SQL Editor:

1. `schema.sql` — creates `rooms` + `queue` tables, RLS policies, abandoned-room cleanup cron
2. `01_chat_migration.sql` — creates `messages` table + realtime
3. `02_itunes_migration.sql` — adds song metadata columns (artist/artwork/video_id/etc.)
4. `03_realtime_fix.sql` — **required fix**: adds `rooms` and `queue` to the realtime publication (this was missing, and without it other listeners never see now-playing/queue updates live)
5. `storage.sql` — creates the public `backgrounds` storage bucket for room background uploads

> Note: `schema.sql` uses the `pg_cron` extension. On Supabase's free tier this is usually available, but if the `CREATE EXTENSION pg_cron` line errors, enable "pg_cron" under Database → Extensions in the dashboard first, then re-run.

## 3. Environment variables

Set these in Vercel (Project Settings → Environment Variables) — same names as `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

No YouTube API key, no music API key needed — that's the point of this setup.

## 4. Deploy to Vercel

```bash
npm install -g vercel   # if you don't have it
vercel                  # first deploy, follow prompts
vercel --prod           # promote to production
```

Or connect the GitHub repo directly in the Vercel dashboard and it will build on every push (uses the existing `.github/workflows/ci.yml` for lint/build checks on PRs).

## 5. Before going live — housekeeping

- `test-signup.mjs` / `update-admin.mjs` / `check-messages.mjs` are local dev scripts (not part of the deployed app — Vercel won't run them), but they reference a `SUPABASE_SERVICE_ROLE_KEY` and create a hardcoded test admin account (`admin@roomamp.local` / `password123`). Don't run these against production, and delete that test user from Supabase Auth if it was ever created there.
- Never put `SUPABASE_SERVICE_ROLE_KEY` in `NEXT_PUBLIC_*` env vars or in anything shipped to the client — it's only for the local admin scripts.
