export const MAX_PLAYLISTS = 5
export const MAX_SONGS_PER_PLAYLIST = 50

export type Playlist = {
  id: string
  name: string
  created_at: string
  song_count: number
}

export type PlaylistSong = {
  id: string
  video_id: string
  title: string
  artist: string | null
  artwork: string | null
  duration_ms: number | null
  position: number
}
