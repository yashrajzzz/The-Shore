import { createBrowserClient } from '@supabase/ssr'

let client: ReturnType<typeof createBrowserClient> | undefined

// Reuse a single browser client so only one GoTrueClient (and its auto-refresh
// timer) exists per tab. Creating a fresh client on every call spins up
// competing refresh timers that race to rotate the same refresh token -
// whichever loses gets an "Already Used" error and signs the session out,
// which shows up as random logouts.
export function createClient() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return client
}
