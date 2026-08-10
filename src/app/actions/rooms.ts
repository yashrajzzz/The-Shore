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

export async function addToQueue(roomId: string, videoUrl: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

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

export async function playNextSong(roomId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Must be host
  const { data: room } = await supabase.from('rooms').select('created_by').eq('id', roomId).single()
  if (!room || room.created_by !== user.id) return { error: 'Only host can skip songs' }

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
      current_song_title: null,
      is_playing: false
    }).eq('id', roomId);
    return { success: true, message: 'Queue empty' };
  }

  // Delete it from queue
  await supabase.from('queue').delete().eq('id', nextSong.id);

  // Set as playing in room
  await supabase.from('rooms').update({
    current_song_url: nextSong.video_url,
    current_song_title: nextSong.title,
    current_song_started_at: new Date().toISOString(),
    is_playing: true
  }).eq('id', roomId);

  return { success: true };
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
