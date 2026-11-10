// Shared (server + client safe) helpers for the first-time-user tours.
//
// "Has this person seen the tour?" is stored on the ACCOUNT, in Supabase
// auth user_metadata: `tours_seen: { lobby: <iso>, room: <iso> }`. It never
// depends on logging in/out, the device, or localStorage, so a returning user
// is never shown a tour again, and a brand-new user always is.

export type TourId = 'lobby' | 'room';

type MetaUser = { user_metadata?: Record<string, unknown> | null } | null | undefined;

export function toursSeen(user: MetaUser): Partial<Record<TourId, string>> {
  const seen = user?.user_metadata?.tours_seen;
  return seen && typeof seen === 'object' ? (seen as Partial<Record<TourId, string>>) : {};
}

export function hasSeenTour(user: MetaUser, tour: TourId): boolean {
  return Boolean(toursSeen(user)[tour]);
}
