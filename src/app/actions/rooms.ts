'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { MAX_BACKGROUNDS_PER_FOLDER } from '@/utils/backgrounds'

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

  if (background_urls.length > MAX_BACKGROUNDS_PER_FOLDER) {
    return { error: `You can only set up to ${MAX_BACKGROUNDS_PER_FOLDER} backgrounds per room.` }
  }

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

  if (background_urls.length > MAX_BACKGROUNDS_PER_FOLDER) {
    return { error: `You can only set up to ${MAX_BACKGROUNDS_PER_FOLDER} backgrounds per room.` }
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

  const position = await nextQueuePosition(supabase, roomId)

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
      added_by: user.id,
      position
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

  const position = await nextQueuePosition(supabase, roomId)

  // Insert into queue
  const { error: insertError } = await supabase
    .from('queue')
    .insert({
      room_id: roomId,
      video_url: videoUrl,
      video_id: videoId,
      title: title,
      added_by: user.id,
      position
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
  position?: number | null;
};

async function nextQueuePosition(supabase: Awaited<ReturnType<typeof createClient>>, roomId: string): Promise<number> {
  const { data } = await supabase
    .from('queue')
    .select('position')
    .eq('room_id', roomId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.position ?? 0) + 1;
}

async function setAsCurrentSong(supabase: Awaited<ReturnType<typeof createClient>>, roomId: string, song: QueueRow) {
  // Songs stay in the queue permanently (playlist-style) — we just point
  // current_queue_id at whichever row is playing so playNextSong knows
  // where to resume from, and so replaying an already-played song is just
  // "point here again" rather than needing to re-insert it.
  await supabase.from('rooms').update({
    current_song_url: song.video_url,
    current_song_video_id: song.video_id || null,
    current_song_title: song.title,
    current_song_artist: song.artist || null,
    current_song_artwork: song.artwork || null,
    current_song_started_at: new Date().toISOString(),
    current_queue_id: song.id,
    is_playing: true
  }).eq('id', roomId);
}

export async function playNextSong(roomId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Any authenticated user can advance to the next song

  const { data: room } = await supabase
    .from('rooms')
    .select('current_queue_id')
    .eq('id', roomId)
    .single();

  let currentPosition: number | null = null;
  if (room?.current_queue_id) {
    const { data: currentItem } = await supabase
      .from('queue')
      .select('position')
      .eq('id', room.current_queue_id)
      .maybeSingle();
    currentPosition = currentItem?.position ?? null;
  }

  // Find the next item in queue order after the currently playing one
  // (or the very first item, if nothing has played yet).
  let query = supabase
    .from('queue')
    .select('*')
    .eq('room_id', roomId)
    .order('position', { ascending: true })
    .limit(1);

  if (currentPosition !== null) {
    query = query.gt('position', currentPosition);
  }

  const { data: nextSong, error: qError } = await query.maybeSingle();

  if (qError || !nextSong) {
    // Reached the end of the queue — stop playing but leave the last song
    // and the queue itself in place, like a playlist that's finished.
    await supabase.from('rooms').update({ is_playing: false }).eq('id', roomId);
    return { success: true, message: 'End of queue' };
  }

  await setAsCurrentSong(supabase, roomId, nextSong);

  return { success: true };
}

export async function reorderQueue(roomId: string, orderedIds: (string | number)[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const updates = orderedIds.map((id, index) =>
    supabase.from('queue').update({ position: index + 1 }).eq('id', id).eq('room_id', roomId)
  );

  const results = await Promise.all(updates);
  const failed = results.find(r => r.error);
  if (failed?.error) return { error: failed.error.message };

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
