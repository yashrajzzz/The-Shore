'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createRoom(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  // Enforce Max 3 Rooms Rule
  const { count, error: countError } = await supabase
    .from('rooms')
    .select('*', { count: 'exact', head: true })
    .eq('created_by', user.id)

  if (countError) {
    return { error: 'Failed to check room limits' }
  }

  if (count && count >= 3) {
    return { error: 'You can only have up to 3 active rooms at a time.' }
  }

  const name = formData.get('name') as string
  const background_urls = formData.getAll('background_urls') as string[]

  if (!name || name.trim() === '') {
    return { error: 'Room name is required' }
  }

  const { data: room, error } = await supabase
    .from('rooms')
    .insert({
      name,
      background_urls: background_urls.length > 0 ? background_urls : [],
      created_by: user.id
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/lobby')
  return { success: true, room }
}

export async function updateRoomBackgrounds(roomId: string, background_urls: string[]) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  const { data: room, error: fetchError } = await supabase
    .from('rooms')
    .select('created_by')
    .eq('id', roomId)
    .single()

  if (fetchError || !room) {
    return { error: 'Room not found' }
  }

  if (room.created_by !== user.id) {
    return { error: 'Only the host can update backgrounds' }
  }

  const { error } = await supabase
    .from('rooms')
    .update({ background_urls })
    .eq('id', roomId)

  if (error) {
    return { error: error.message }
  }

  // No revalidatePath needed for lobby since background_urls aren't critical there,
  // but let's do it anyway just to be safe.
  revalidatePath('/lobby')
  return { success: true }
}

export async function addToQueue(
  roomId: string,
  song: {
    videoId: string;
    title: string;
    artist: string;
    artwork: string;
    duration: number;
  }
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Insert into queue with rich metadata
  const { error: insertError } = await supabase
    .from('queue')
    .insert({
      room_id: roomId,
      video_url: `https://www.youtube.com/watch?v=${song.videoId}`,
      video_id: song.videoId,
      title: song.title,
      artist: song.artist,
      artwork: song.artwork,
      duration_ms: song.duration,
      added_by: user.id
    });

  if (insertError) return { error: insertError.message }

  // If room is currently silent, trigger playNextSong automatically!
  const { data: room } = await supabase.from('rooms').select('current_song_url, is_playing').eq('id', roomId).single();
  
  if (room && (!room.current_song_url || !room.is_playing)) {
     await playNextSong(roomId);
  }

  return { success: true }
}

// Legacy support: add a raw YouTube URL to the queue (fallback)
export async function addUrlToQueue(roomId: string, videoUrl: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Extract video ID from URL
  const videoIdMatch = videoUrl.match(/(?:youtu\.be\/|v=)([^&\s]+)/);
  const videoId = videoIdMatch ? videoIdMatch[1] : null;

  // Fetch YouTube title using oEmbed
  let title = "Unknown Song";
  try {
    const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${videoUrl}&format=json`);
    if (oembedRes.ok) {
      const data = await oembedRes.json();
      title = data.title;
    }
  } catch (e) {
    console.error("Failed to fetch title", e);
  }

  // Insert into queue
  const { error: insertError } = await supabase
    .from('queue')
    .insert({
      room_id: roomId,
      video_url: videoUrl,
      video_id: videoId,
      title: title,
      added_by: user.id
    });

  if (insertError) return { error: insertError.message }

  // If room is currently silent, trigger playNextSong automatically!
  const { data: room } = await supabase.from('rooms').select('current_song_url, is_playing').eq('id', roomId).single();
  
  if (room && (!room.current_song_url || !room.is_playing)) {
     await playNextSong(roomId);
  }

  return { success: true }
}

type QueueRow = {
  id: string | number;
  video_url: string;
  video_id?: string | null;
  title: string;
  artist?: string | null;
  artwork?: string | null;
};

async function setAsCurrentSong(supabase: Awaited<ReturnType<typeof createClient>>, roomId: string, song: QueueRow) {
  await supabase.from('queue').delete().eq('id', song.id);

  await supabase.from('rooms').update({
    current_song_url: song.video_url,
    current_song_video_id: song.video_id || null,
    current_song_title: song.title,
    current_song_artist: song.artist || null,
    current_song_artwork: song.artwork || null,
    current_song_started_at: new Date().toISOString(),
    is_playing: true
  }).eq('id', roomId);
}

export async function playNextSong(roomId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Any authenticated user can advance to the next song

  // Get oldest item in queue
  const { data: nextSong, error: qError } = await supabase
    .from('queue')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (qError || !nextSong) {
    // Queue is empty, stop playing
    await supabase.from('rooms').update({
      current_song_url: null,
      current_song_video_id: null,
      current_song_title: null,
      current_song_artist: null,
      current_song_artwork: null,
      is_playing: false
    }).eq('id', roomId);
    return { success: true, message: 'Queue empty' };
  }

  await setAsCurrentSong(supabase, roomId, nextSong);

  return { success: true };
}

export async function playSongNow(roomId: string, queueItemId: string | number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Any authenticated user in the room can pick the next song to play
  const { data: song, error: qError } = await supabase
    .from('queue')
    .select('*')
    .eq('id', queueItemId)
    .eq('room_id', roomId)
    .single();

  if (qError || !song) return { error: 'Song not found in queue' }

  await setAsCurrentSong(supabase, roomId, song);

  return { success: true };
}

export async function removeFromQueue(roomId: string, queueItemId: string | number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('queue')
    .delete()
    .eq('id', queueItemId)
    .eq('room_id', roomId)

  if (error) return { error: error.message }
  return { success: true }
}

export async function setPlayPause(roomId: string, isPlaying: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Any authenticated user in the room can toggle playback.
  // Caller passes the desired state directly (derived from local room state,
  // which is already kept in sync via realtime) so this is a single atomic
  // write instead of a read-then-write race.
  const { error } = await supabase.from('rooms').update({
    is_playing: isPlaying
  }).eq('id', roomId)

  if (error) return { error: error.message }
  return { success: true, is_playing: isPlaying }
}

export async function sendMessage(roomId: string, content: string, messageId?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  if (!content.trim()) return { error: 'Message cannot be empty' }

  const { error } = await supabase
    .from('messages')
    .insert({
      id: messageId || undefined,
      room_id: roomId,
      user_id: user.id,
      user_email: user.email,
      content: content.trim()
    })

  if (error) return { error: error.message }
  return { success: true }
}

export async function destroyRoom(roomId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('rooms')
    .delete()
    .eq('id', roomId)

  if (error) return { error: error.message }
  
  revalidatePath('/lobby')
  return { success: true }
}
