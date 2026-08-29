'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { nextQueuePosition, playNextSong } from './rooms'
import { MAX_PLAYLISTS, MAX_SONGS_PER_PLAYLIST, type Playlist, type PlaylistSong } from '@/utils/playlists'

export async function listPlaylists(): Promise<{ playlists: Playlist[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { playlists: [], error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('playlists')
    .select('id, name, created_at, playlist_songs(count)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return { playlists: [], error: error.message }

  const playlists: Playlist[] = (data || []).map((p) => {
    const row = p as unknown as { id: string; name: string; created_at: string; playlist_songs: { count: number }[] }
    return {
      id: row.id,
      name: row.name,
      created_at: row.created_at,
      song_count: row.playlist_songs?.[0]?.count ?? 0,
    }
  })

  return { playlists }
}

export async function createPlaylist(name: string): Promise<{ playlist?: { id: string; name: string }; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  if (!name || !name.trim()) return { error: 'Playlist name is required' }

  const { count, error: countError } = await supabase
    .from('playlists')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if (countError) return { error: 'Failed to check playlist limits' }
  if (count !== null && count >= MAX_PLAYLISTS) {
    return { error: `You can only have up to ${MAX_PLAYLISTS} playlists.` }
  }

  const { data: playlist, error } = await supabase
    .from('playlists')
    .insert({ user_id: user.id, name: name.trim() })
    .select('id, name')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/lobby')
  return { playlist }
}

export async function deletePlaylist(playlistId: string): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('playlists')
    .delete()
    .eq('id', playlistId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/lobby')
  return { success: true }
}

export async function getPlaylistSongs(playlistId: string): Promise<{ songs: PlaylistSong[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { songs: [], error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('playlist_songs')
    .select('id, video_id, title, artist, artwork, duration_ms, position')
    .eq('playlist_id', playlistId)
    .order('position', { ascending: true })

  if (error) return { songs: [], error: error.message }
  return { songs: (data as PlaylistSong[]) || [] }
}

export async function addSongToPlaylist(
  playlistId: string,
  song: { videoId: string; title: string; artist: string; artwork: string; duration: number }
): Promise<{ success?: boolean; song?: PlaylistSong; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: playlist, error: fetchError } = await supabase
    .from('playlists')
    .select('user_id')
    .eq('id', playlistId)
    .single()

  if (fetchError || !playlist) return { error: 'Playlist not found' }
  if (playlist.user_id !== user.id) return { error: 'Not your playlist' }

  const { count, error: countError } = await supabase
    .from('playlist_songs')
    .select('*', { count: 'exact', head: true })
    .eq('playlist_id', playlistId)

  if (countError) return { error: 'Failed to check playlist size' }
  if (count !== null && count >= MAX_SONGS_PER_PLAYLIST) {
    return { error: `This playlist is full (${MAX_SONGS_PER_PLAYLIST}/${MAX_SONGS_PER_PLAYLIST}).` }
  }

  const { data: lastSong } = await supabase
    .from('playlist_songs')
    .select('position')
    .eq('playlist_id', playlistId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const position = (lastSong?.position ?? 0) + 1

  const { data: inserted, error } = await supabase
    .from('playlist_songs')
    .insert({
      playlist_id: playlistId,
      video_id: song.videoId,
      title: song.title,
      artist: song.artist,
      artwork: song.artwork,
      duration_ms: song.duration,
      position,
    })
    .select('id, video_id, title, artist, artwork, duration_ms, position')
    .single()

  if (error) return { error: error.message }
  return { success: true, song: inserted as PlaylistSong }
}

export async function removeSongFromPlaylist(playlistId: string, songId: string): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('playlist_songs')
    .delete()
    .eq('id', songId)
    .eq('playlist_id', playlistId)

  if (error) return { error: error.message }
  return { success: true }
}

export async function addPlaylistToQueue(roomId: string, playlistId: string): Promise<{ success?: boolean; added?: number; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: playlist, error: plError } = await supabase
    .from('playlists')
    .select('user_id')
    .eq('id', playlistId)
    .single()

  if (plError || !playlist) return { error: 'Playlist not found' }
  if (playlist.user_id !== user.id) return { error: 'Not your playlist' }

  const { data: songs, error: songsError } = await supabase
    .from('playlist_songs')
    .select('video_id, title, artist, artwork, duration_ms')
    .eq('playlist_id', playlistId)
    .order('position', { ascending: true })

  if (songsError) return { error: songsError.message }
  if (!songs || songs.length === 0) return { error: 'Playlist is empty' }

  let position = await nextQueuePosition(supabase, roomId)

  const rows = songs.map((s) => ({
    room_id: roomId,
    video_url: `https://www.youtube.com/watch?v=${s.video_id}`,
    video_id: s.video_id,
    title: s.title,
    artist: s.artist,
    artwork: s.artwork,
    duration_ms: s.duration_ms,
    added_by: user.id,
    position: position++,
  }))

  const { error: insertError } = await supabase.from('queue').insert(rows)
  if (insertError) return { error: insertError.message }

  // If the room is currently silent, kick off playback — same behavior as
  // adding a single song via addToQueue.
  const { data: room } = await supabase.from('rooms').select('current_song_url').eq('id', roomId).single()
  if (room && !room.current_song_url) {
    await playNextSong(roomId)
  }

  return { success: true, added: rows.length }
}
