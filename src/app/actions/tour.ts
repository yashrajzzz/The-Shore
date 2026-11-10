'use server'

import { createClient } from '@/utils/supabase/server'
import { toursSeen, type TourId } from '@/utils/tour'

// Records on the user's account that they finished (or skipped) a tour, so it
// is not shown again on later sign-ins or on other devices. Safe to call more
// than once: a tour that is already recorded is left untouched.
export async function markTourSeen(tour: TourId): Promise<{ error: string | null }> {
  if (tour !== 'lobby' && tour !== 'room') return { error: 'Unknown tour' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const seen = toursSeen(user)
  if (seen[tour]) return { error: null }

  const { error } = await supabase.auth.updateUser({
    data: { tours_seen: { ...seen, [tour]: new Date().toISOString() } },
  })
  return { error: error?.message ?? null }
}
