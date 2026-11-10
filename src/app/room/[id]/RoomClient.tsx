'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import NextImage from 'next/image';
import { createClient } from '@/utils/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { addToQueue, playNextSong, playSongNow, setPlayPause, sendMessage, removeFromQueue, destroyRoom, reorderQueue, moveQueueItem } from '@/app/actions/rooms';
import { setGlobalBackground, usePersonalBackground } from '@/components/ui/GlobalBackground';
import { BackgroundPicker } from '@/components/ui/BackgroundPicker';
import { MAX_BACKGROUNDS_PER_FOLDER } from '@/utils/backgrounds';
import { YouTubePlayer, YouTubePlayerHandle } from '@/components/ui/YouTubePlayer';
import { SongSearch } from '@/components/ui/SongSearch';
import { AddPlaylistToQueue } from '@/components/ui/AddPlaylistToQueue';
import { SongProgressBar } from '@/components/ui/SongProgressBar';
import { Image as ImageIcon, MessageSquare, LogOut, SkipBack, Play, Pause, SkipForward, X, Send, Plus, Loader2, Volume2, VolumeX } from 'lucide-react';
import { InviteModal } from '@/components/ui/InviteModal';
import { EnableAudioPrompt } from '@/components/ui/EnableAudioPrompt';
import { QueueList } from '@/components/ui/QueueList';
import { RoomClock } from '@/components/ui/RoomClock';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ShoreRunnerButton } from '@/components/ui/ShoreRunner';
import { RoomTour } from '@/components/ui/RoomTour';
import { useRoomTransition } from '@/components/ui/RoomTransition';

type Room = {
  id?: string;
  background_urls?: string[];
  created_by?: string;
  current_song_video_id?: string | null;
  current_song_url?: string | null;
  is_playing?: boolean;
  current_song_started_at?: string | number | null;
  current_song_title?: string;
  current_song_artist?: string;
  current_song_artwork?: string;
  current_queue_id?: string | number | null;
  [k: string]: unknown;
};

type AppUser = { id?: string; email?: string; display_name?: string };

export default function RoomClient({ room: initialRoom, user, tourUnseen = false }: { room: Room, user: AppUser, tourUnseen?: boolean }) {
  type Listener = { email?: string; display_name?: string; is_host?: boolean; [k: string]: unknown };
  type QueueItem = { id?: string | number; artwork?: string; title?: string; artist?: string; position?: number; [k:string]: unknown };
  type Message = { id?: string | number; user_id?: string; user_email?: string; user_display_name?: string; content?: string; created_at?: string; [k:string]: unknown };
  const [activeTab, setActiveTab] = useState('listeners');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const tourOpenSidebar = useCallback((tab: 'listeners' | 'queue' | 'chat' | 'backgrounds') => {
    setActiveTab(tab);
    setIsSidebarOpen(true);
  }, []);
  const tourCloseSidebar = useCallback(() => setIsSidebarOpen(false), []);
  // True while a search-result preview clip is playing locally. The room's
  // actual player is muted/paused underneath without touching shared
  // `room.is_playing`, so the UI must be told explicitly — otherwise the
  // Now Playing card and play/pause button keep showing/acting on the real
  // room state while the room is actually silent for this listener.
  const [isPreviewing, setIsPreviewing] = useState(false);
  const { exitRoom, revealCurrent } = useRoomTransition();
  // Covers a room reached without going through CreateRoomModal's enterRoom
  // (a shared invite link opened fresh, a plain lobby-card click, a browser
  // back/forward) with the same wave — welcoming rather than an abrupt
  // no-transition landing. No-ops if enterRoom already covered this navigation.
  useEffect(() => {
    revealCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ytPlayerRef = useRef<YouTubePlayerHandle>(null);
  // Personal volume (0-100): only affects this listener, remembered on this device.
  const [volume, setVolumeState] = useState(() => {
    try {
      const v = Number(localStorage.getItem('shore_volume'));
      return Number.isFinite(v) && localStorage.getItem('shore_volume') !== null ? Math.min(100, Math.max(0, v)) : 100;
    } catch {
      return 100;
    }
  });
  const lastVolumeRef = useRef(volume || 100);
  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    if (v > 0) lastVolumeRef.current = v;
    try { localStorage.setItem('shore_volume', String(v)); } catch { /* ignore */ }
  }, []);
  // Tracks the play/pause state the user last asked for, so rapid clicks
  // coalesce into a single in-flight request instead of flooding the server,
  // and so a realtime echo of an already-superseded state doesn't flicker the UI.
  const desiredPlayingRef = useRef<boolean | null>(null);
  const togglingPlayRef = useRef(false);
  // Used to broadcast play/pause instantly to other listeners instead of
  // waiting on the postgres_changes WAL round-trip, which can lag noticeably.
  const roomChannelRef = useRef<RealtimeChannel | null>(null);

  // Settings State
  // Backgrounds are personal (this device only), not shared by the host.
  const { urls: myBackgrounds, interval: timerInterval } = usePersonalBackground();

  // Sync State
  const [room, setRoom] = useState(initialRoom);
  const currentVideoId = room.current_song_video_id || (typeof room.current_song_url === 'string' ? (room.current_song_url.match(/(?:youtu\.be\/|v=)([^&\s]+)/)?.[1]) : undefined) || null;
  // YouTube player state (-1 unstarted, 1 playing, 2 paused, 3 buffering...)
  // plus a flag for the gap between asking the server for another song and
  // the new song arriving, so the UI says "loading" rather than looking idle.
  const [ytState, setYtState] = useState(-1);
  const [pendingSong, setPendingSong] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  // Reset when a different song arrives (adjusting state during render).
  const songKey = `${currentVideoId ?? ''}|${room.current_queue_id ?? ''}`;
  const [seenSongKey, setSeenSongKey] = useState(songKey);
  if (seenSongKey !== songKey) {
    setSeenSongKey(songKey);
    setYtState(-1);
    setPlaybackError(false);
    // A song actually arriving ends the wait; being cleared does not.
    if (currentVideoId) setPendingSong(false);
  }
  useEffect(() => {
    if (!pendingSong) return;
    const t = setTimeout(() => setPendingSong(false), 10000);
    return () => clearTimeout(t);
  }, [pendingSong]);
  const currentQueueIdRef = useRef<string | number | null>(null);
  useEffect(() => { currentQueueIdRef.current = (room.current_queue_id as string | number | null | undefined) ?? null; }, [room.current_queue_id]);
  const currentVideoIdRef = useRef<string | null>(currentVideoId);
  useEffect(() => { currentVideoIdRef.current = currentVideoId; }, [currentVideoId]);
  const roomIdStr = String((initialRoom && (initialRoom as Room).id) ?? (initialRoom as Room).id ?? '');
  const userIdStr = String((user && (user as AppUser).id) ?? '');
  const userEmailStr = String((user && (user as AppUser).email) ?? '');
  const userDisplayName = (user as AppUser).display_name || userEmailStr.split('@')[0] || 'Anonymous';
  // Stable ref for created_by — never changes for a given room, avoids
  // putting room.created_by in the realtime useEffect dep array which would
  // cause subscription churn on every room state update.
  const createdByRef = useRef(initialRoom.created_by);
  const bgCount = myBackgrounds.length;
  const [listeners, setListeners] = useState<Listener[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);

  // Chat State
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sidebar Resize State
  const [sidebarWidth, setSidebarWidth] = useState(360);
  const isResizing = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 300 && newWidth < 800) setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => { isResizing.current = false; document.body.style.cursor = 'default'; };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, activeTab]);

  // Realtime subscriptions
  useEffect(() => {
    const supabase = createClient();
    supabase.from('queue').select('*').eq('room_id', roomIdStr).order('position', { ascending: true })
      .then(({ data }: { data: QueueItem[] | null }) => { if (data) setQueue(data); });
    supabase.from('messages').select('*').eq('room_id', roomIdStr).order('created_at', { ascending: false }).limit(50)
      .then(({ data }: { data: Message[] | null }) => { if (data) setMessages(data.reverse()); });

    const roomSub = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomIdStr}` }, (payload: unknown) => {
        const p = payload as { new?: Record<string, unknown> };
        if (!p.new) return;
        const incoming = { ...p.new };
        if (desiredPlayingRef.current !== null) {
          const matchesIntent = p.new.is_playing === desiredPlayingRef.current;
          incoming.is_playing = desiredPlayingRef.current;
          if (matchesIntent && !togglingPlayRef.current) desiredPlayingRef.current = null;
        }
        setRoom(incoming);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'queue', filter: `room_id=eq.${roomIdStr}` }, (payload: unknown) => {
        const p = payload as { new?: QueueItem };
        if (!p.new) return;
        const newItem = p.new;
        setQueue(prev => {
          if (prev.some(item => item.id === newItem.id)) return prev;
          const next = [...prev, newItem];
          next.sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
          return next;
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'queue', filter: `room_id=eq.${roomIdStr}` }, (payload: unknown) => {
        const p = payload as { new?: QueueItem };
        if (!p.new) return;
        const updated = p.new;
        setQueue(prev => {
          const next = prev.map(item => (item.id === updated.id ? { ...item, ...updated } : item));
          next.sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
          return next;
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'queue', filter: `room_id=eq.${roomIdStr}` }, (payload: unknown) => {
        const p = payload as { old?: QueueItem };
        if (!p.old) return;
        const removedId = p.old.id;
        setQueue(prev => prev.filter(item => item.id !== removedId));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomIdStr}` }, (payload: unknown) => {
        const p = payload as { new?: Record<string, unknown> };
        if (!p.new) return;
        const newMsg = p.new as unknown as Message;
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'rooms', filter: `id=eq.${roomIdStr}` }, () => {
        exitRoom('/lobby', ['Room closed', 'by the host']);
      })
      .subscribe();

    const roomChannel = supabase.channel(`room:${room.id}`, {
      config: { presence: { key: (user as { id?: string }).id }, broadcast: { self: false } }
    });
    roomChannelRef.current = roomChannel;
    roomChannel
      .on('presence', { event: 'sync' }, () => {
        const state = roomChannel.presenceState();
        const s = state as Record<string, unknown>;
        const currentListeners = Object.keys(s).map((key: string) => {
          const val = s[key];
          if (Array.isArray(val) && val.length > 0) return val[0] as unknown as Listener;
          return {} as Listener;
        });
        
        setListeners(currentListeners);

        // NOTE: Removed automatic destroyRoom when host is briefly absent —
        // a network blip would destroy the room for everyone. The host
        // explicitly clicks "Leave Room" which calls destroyRoom instead.
      })
      .on('broadcast', { event: 'play_pause' }, (msg: unknown) => {
        const m = msg as { payload?: { is_playing?: boolean } };
        if (typeof m.payload?.is_playing !== 'boolean') return;
        // An external toggle just arrived — drop our own pending intent (if
        // any) so it doesn't fight with this update.
        desiredPlayingRef.current = null;
        setRoom(prev => ({ ...prev, is_playing: m.payload!.is_playing }));
      })
      .on('broadcast', { event: 'request_sync' }, () => {
        // If we are the host, reply with our current playback position
        if (createdByRef.current === userIdStr && ytPlayerRef.current) {
          const currentTime = ytPlayerRef.current.getCurrentTime();
          roomChannel.send({
            type: 'broadcast',
            event: 'sync_position',
            payload: { time: currentTime, videoId: currentVideoIdRef.current }
          });
        }
      })
      .on('broadcast', { event: 'sync_position' }, (msg: unknown) => {
        const m = msg as { payload?: { time?: number, videoId?: string } };
        // If we are a listener, sync to the host's position
        if (createdByRef.current !== userIdStr && typeof m.payload?.time === 'number' && ytPlayerRef.current) {
          ytPlayerRef.current.seekTo(m.payload.time);
        }
      })
      .on('broadcast', { event: 'seek' }, (msg: unknown) => {
        const m = msg as { payload?: { time?: number; startedAt?: string } };
        if (typeof m.payload?.time === 'number') {
          ytPlayerRef.current?.seekTo(m.payload.time);
          if (m.payload.startedAt) {
            setRoom(prev => ({ ...prev, current_song_started_at: m.payload!.startedAt }));
          }
        }
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await roomChannel.track({ user_id: userIdStr, email: userEmailStr, display_name: userDisplayName, is_host: createdByRef.current === userIdStr, joined_at: new Date().toISOString() });
          
          // Request sync from the host when we first join
          if (createdByRef.current !== userIdStr) {
            roomChannel.send({ type: 'broadcast', event: 'request_sync', payload: {} });
          }
        }
      });

    return () => {
      roomChannelRef.current = null;
      supabase.removeChannel(roomSub);
      supabase.removeChannel(roomChannel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomIdStr, userIdStr, userEmailStr]);

  const handleTimerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const ms = parseInt(e.target.value) * 1000;
    if (myBackgrounds.length > 0) setGlobalBackground(myBackgrounds, ms);
  };

  // Your own background: applies instantly, saved on this device only.
  const handleBackgroundSelectionChange = (urls: string[]) => {
    setGlobalBackground(urls, timerInterval);
  };

  const handleAddToQueue = useCallback(async (song: { videoId: string; title: string; artist: string; artwork: string; duration: number }) => {
    const res = await addToQueue(roomIdStr, song);
    if (res?.error) throw new Error(res.error);
    // Show it in the queue right away instead of waiting on the realtime echo.
    const item = res?.item as QueueItem | undefined;
    if (item) {
      setQueue(prev => {
        if (prev.some(q => q.id === item.id)) return prev;
        const next = [...prev, item];
        next.sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
        return next;
      });
    }
  }, [roomIdStr]);

  const handleRemoveFromQueue = useCallback(async (queueItemId: string | number) => {
    // Remove immediately, then put it back (at its original spot) if the
    // delete actually fails server-side, instead of leaving the local queue
    // silently out of sync with the DB.
    let removedItem: QueueItem | undefined;
    let removedIndex = -1;
    const wasCurrent = room.current_queue_id != null && String(room.current_queue_id) === String(queueItemId);
    if (wasCurrent) {
      // Removing the playing song: stop it right away; the server moves the
      // room on to the next queued song (or clears it if there is none).
      try { ytPlayerRef.current?.pauseVideo(); } catch {}
      const idx = queue.findIndex(item => item.id === queueItemId);
      const hasNext = idx !== -1 && idx < queue.length - 1;
      setPendingSong(hasNext);
      setRoom(prev => ({
        ...prev,
        current_song_started_at: null,
        current_song_video_id: null,
        current_song_url: null,
        current_song_title: undefined,
        current_song_artist: undefined,
        current_song_artwork: undefined,
        current_queue_id: null,
        ...(hasNext ? {} : { is_playing: false }),
      }));
    }
    setQueue(prev => {
      removedIndex = prev.findIndex(item => item.id === queueItemId);
      removedItem = prev.find(item => item.id === queueItemId);
      return prev.filter(item => item.id !== queueItemId);
    });

    const res = await removeFromQueue(roomIdStr, queueItemId);
    if (res?.error) {
      alert(res.error);
      setPendingSong(false);
      const itemToRestore = removedItem;
      const insertAt = removedIndex;
      if (itemToRestore) {
        setQueue(prev => {
          if (prev.some(item => item.id === queueItemId)) return prev;
          const next = [...prev];
          next.splice(Math.min(insertAt, next.length), 0, itemToRestore);
          return next;
        });
      }
    }
  }, [roomIdStr, room.current_queue_id, queue]);

  const handlePlaySongNow = useCallback(async (queueItemId: string | number) => {
    setPendingSong(true);
    const res = await playSongNow(roomIdStr, queueItemId);
    if (res?.error) { setPendingSong(false); alert(res.error); }
  }, [roomIdStr]);

  const handleReorderQueue = useCallback(async (orderedIds: (string | number)[], movedId: string | number) => {
    // Only the dragged song needs a new position: put it between its new
    // neighbours. One write instead of renumbering every row.
    const pos = (id: string | number | undefined) =>
      id === undefined ? undefined : Number(queue.find(q => q.id === id)?.position);
    const at = orderedIds.indexOf(movedId);
    const before = pos(orderedIds[at - 1]);
    const after = pos(orderedIds[at + 1]);
    let newPos: number;
    if (before !== undefined && after !== undefined) newPos = (before + after) / 2;
    else if (before !== undefined) newPos = before + 1;
    else if (after !== undefined) newPos = after - 1;
    else newPos = 1;

    // Neighbours too close for a double to split cleanly: renumber everything.
    const tooTight = before !== undefined && after !== undefined && Math.abs(after - before) < 1e-6;

    setQueue(prev => {
      const next = tooTight
        ? orderedIds.map((id, idx) => ({ ...(prev.find(q => q.id === id) as QueueItem), position: idx + 1 }))
        : prev.map(item => (item.id === movedId ? { ...item, position: newPos } : item));
      return next.sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
    });

    const res = tooTight
      ? await reorderQueue(roomIdStr, orderedIds)
      : await moveQueueItem(roomIdStr, movedId, newPos);
    if (res?.error) alert(res.error);
  }, [roomIdStr, queue]);

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    const content = chatInput.trim();
    setChatInput('');
    const messageId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: messageId, room_id: roomIdStr, user_id: userIdStr, user_email: userEmailStr, user_display_name: userDisplayName, content, created_at: new Date().toISOString() }]);
    const res = await sendMessage(roomIdStr, content, messageId);
    if (res?.error) { alert("Failed: " + res.error); setMessages(prev => prev.filter(m => m.id !== messageId)); }
  };

  const handleNextSong = useCallback(async () => {
    // Immediately clear the current song state so:
    // 1. performSync won't seek the new song using the old song's startedAt
    // 2. The UI instantly reflects "loading next song" instead of showing stale info
    if (ytPlayerRef.current) {
      try { ytPlayerRef.current.pauseVideo(); } catch {}
    }
    setRoom(prev => ({
      ...prev,
      current_song_started_at: null,
      current_song_video_id: null,
      current_song_title: undefined,
      current_song_artist: undefined,
      current_song_artwork: undefined,
    }));
    setPendingSong(true);
    const res = await playNextSong(roomIdStr);
    if (res?.error) alert(res.error);
    if (res?.error || res?.message) setPendingSong(false);
  }, [roomIdStr]);

  // Handle seek broadcast: when a user seeks the progress bar, update
  // current_song_started_at so all participants sync to the new position.
  const handleSeek = useCallback(async (seekTimeSeconds: number) => {
    // Compute a new started_at as if the song started `seekTimeSeconds` ago
    const newStartedAt = new Date(Date.now() - seekTimeSeconds * 1000).toISOString();
    // Optimistically update local state
    setRoom(prev => ({ ...prev, current_song_started_at: newStartedAt }));
    // Broadcast immediately so other listeners update instantly without waiting on DB WAL round-trip
    roomChannelRef.current?.send({
      type: 'broadcast',
      event: 'seek',
      payload: { time: seekTimeSeconds, startedAt: newStartedAt }
    });
    // Persist to DB so late-joiners pick it up via realtime
    const supabase = (await import('@/utils/supabase/client')).createClient();
    await supabase.from('rooms').update({ current_song_started_at: newStartedAt }).eq('id', roomIdStr);
  }, [roomIdStr]);

  const sendPlayPause = useCallback(async (initial: boolean): Promise<void> => {
    togglingPlayRef.current = true;
    let desired = initial;

    // Loop instead of one-request-per-click: if a newer click arrives while
    // a request is in flight, send its value next instead of firing a
    // separate overlapping request.
    for (;;) {
      // Broadcast immediately so other listeners update instantly instead of
      // waiting on the DB write + postgres_changes WAL round-trip below,
      // which can lag noticeably (hundreds of ms to a couple seconds).
      roomChannelRef.current?.send({ type: 'broadcast', event: 'play_pause', payload: { is_playing: desired } });

      const res = await setPlayPause(roomIdStr, desired);

      if (res?.error) {
        alert(res.error);
        desiredPlayingRef.current = null;
        togglingPlayRef.current = false;
        setRoom(prev => ({ ...prev, is_playing: !desired }));
        return;
      }

      if (desiredPlayingRef.current !== null && desiredPlayingRef.current !== desired) {
        desired = desiredPlayingRef.current;
        continue;
      }

      togglingPlayRef.current = false;
      return;
    }
  }, [roomIdStr]);

  const handleTogglePlay = useCallback(() => {
    // While previewing, the room's player is muted/paused locally without
    // touching shared state — don't let this (including hardware media
    // keys, which bypass the disabled button) flip the real room state.
    if (isPreviewing) return;
    const desiredPlaying = !room.is_playing;

    // Optimistically flip local room state so the icon and the player (which
    // reacts to the `playing` prop) respond instantly instead of waiting on
    // the realtime round-trip. The player itself is the single place that
    // issues playVideo/pauseVideo commands, so we don't also call the ref
    // here — doing both was a race that could leave the player fighting itself.
    desiredPlayingRef.current = desiredPlaying;
    setRoom(prev => ({ ...prev, is_playing: desiredPlaying }));

    if (togglingPlayRef.current) return;
    sendPlayPause(desiredPlaying);
  }, [room.is_playing, sendPlayPause, isPreviewing]);

  // Every listener's player fires "ended" at once; passing which song ended
  // lets the server apply only the first and ignore the rest.
  const handleYTEnd = useCallback(() => { playNextSong(roomIdStr, currentQueueIdRef.current); }, [roomIdStr]);

  // Codes 2/5/100/101/150: the video can't be played here (embedding disabled,
  // removed, private). Tell the room and have the host move on, instead of
  // leaving everyone stuck on a song that never starts.
  const handleYTError = useCallback((code: number) => {
    setPlaybackError(true);
    if (![100, 101, 150].includes(code)) return;
    if (createdByRef.current === userIdStr) playNextSong(roomIdStr, currentQueueIdRef.current);
  }, [roomIdStr, userIdStr]);

  // Media Session API for hardware media keys
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: room.current_song_title || 'Room Radio',
        artist: room.current_song_artist || 'Silence...',
        artwork: room.current_song_artwork ? [
          { src: room.current_song_artwork, sizes: '512x512', type: 'image/jpeg' }
        ] : []
      });

      navigator.mediaSession.setActionHandler('play', () => {
        if (!room.is_playing) handleTogglePlay();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        if (room.is_playing) handleTogglePlay();
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        handleNextSong();
      });
      navigator.mediaSession.setActionHandler('previoustrack', null);
    }
  }, [room.is_playing, room.current_song_title, room.current_song_artist, room.current_song_artwork, handleTogglePlay, handleNextSong]);


  // Loading = waiting on the server for the next song, or the player is still
  // fetching/buffering a song the room is supposed to be playing.
  const songLoading = !isPreviewing && !playbackError && (pendingSong || Boolean(currentVideoId && room.is_playing && (ytState === -1 || ytState === 3)));
  const isHost = room.created_by === (user as AppUser).id;
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const doLeave = async () => {
    setLeaving(true);
    // The host leaving closes the room for everyone.
    if (isHost) await destroyRoom(roomIdStr);
    exitRoom('/lobby');
  };
  const startedAtVal: string | null = room.current_song_started_at == null ? null : (typeof room.current_song_started_at === 'string' ? room.current_song_started_at : new Date(Number(room.current_song_started_at)).toISOString());

  return (
    <div className="flex-1 relative flex flex-col w-full h-full pointer-events-none overflow-hidden">
      {/* YouTube Player (hidden) */}
      <YouTubePlayer
        ref={ytPlayerRef}
        videoId={currentVideoId}
        playing={Boolean(room.is_playing)}
        startedAt={startedAtVal}
        onEnd={handleYTEnd}
        onStateChange={setYtState}
        onError={handleYTError}
        volume={volume}
      />

      {/* Enable audio prompt for listeners (non-hosts) */}
      {!isHost && (
        <EnableAudioPrompt roomId={roomIdStr} ytPlayerRef={ytPlayerRef} isPlaying={Boolean(room.is_playing)} />
      )}

      {/* Top Bar */}
      <div className="flex items-center justify-end sm:justify-between gap-3 px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] sm:p-6 pointer-events-auto shrink-0">
        <RoomClock />
        <div className="flex items-center gap-2.5 sm:gap-3">
        <button onClick={() => { setIsSidebarOpen(true); setActiveTab('backgrounds'); }}
          aria-label="Change background"
          title="Change background"
          className="h-11 sm:h-12 px-3 sm:px-4 bg-coral/90 backdrop-blur-md border-[2.5px] border-ink rounded-xl shadow-[3px_3px_0_var(--color-ink)] sm:shadow-[4px_4px_0_var(--color-ink)] flex items-center gap-2 font-mono text-xs font-bold hover:-translate-y-0.5 hover:shadow-[6px_6px_0_var(--color-ink)] transition-all z-[60]">
          <ImageIcon size={18} strokeWidth={2.25} />
          <span className="hidden sm:inline">Backgrounds</span>
        </button>
        <RoomTour initiallyUnseen={tourUnseen} openSidebar={tourOpenSidebar} closeSidebar={tourCloseSidebar} />
        <ShoreRunnerButton />
        <button onClick={() => (isHost ? setConfirmLeave(true) : doLeave())}
          data-tour="leave"
          aria-label="Leave room"
          title="Leave room"
          className="w-11 h-11 sm:w-12 sm:h-12 bg-paper/60 backdrop-blur-md border-[2.5px] border-ink rounded-xl shadow-[3px_3px_0_var(--color-ink)] sm:shadow-[4px_4px_0_var(--color-ink)] flex items-center justify-center hover:bg-coral/80 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_var(--color-ink)] transition-all z-[60]">
          <LogOut size={19} strokeWidth={2.25} />
        </button>
        <button onClick={() => setIsSidebarOpen(true)}
          data-tour="menu"
          aria-label="Open side panel"
          className="w-11 h-11 sm:w-12 sm:h-12 bg-paper/60 backdrop-blur-md border-[2.5px] border-ink rounded-xl shadow-[3px_3px_0_var(--color-ink)] sm:shadow-[4px_4px_0_var(--color-ink)] flex flex-col items-center justify-center gap-[3px] hover:bg-paper/90 transition-all hover:-translate-y-0.5 hover:shadow-[6px_6px_0_var(--color-ink)] z-[60]">
          <span className="w-5 h-[2.5px] bg-ink rounded-full"></span>
          <span className="w-5 h-[2.5px] bg-ink rounded-full"></span>
          <span className="w-5 h-[2.5px] bg-ink rounded-full"></span>
        </button>
        </div>
      </div>

      {/* Center Now Playing */}
      <div className="flex-1 flex flex-col items-center justify-center pointer-events-auto px-4">
        {!room.current_song_title && songLoading ? (
          <div className="text-center bg-ink/20 backdrop-blur-sm border-2 border-ink/30 px-6 py-4 rounded-2xl drop-shadow-md flex flex-col items-center gap-2" role="status">
            <Loader2 size={28} className="animate-spin text-paper" aria-hidden />
            <div className="text-[10px] text-paper uppercase tracking-widest font-mono font-bold">loading next song…</div>
          </div>
        ) : room.current_song_title ? (
          <div className="text-center bg-ink/20 backdrop-blur-sm border-2 border-ink/30 px-4 py-3 sm:px-6 sm:py-4 rounded-2xl drop-shadow-md max-w-full">
            {room.current_song_artwork && (
            <NextImage src={room.current_song_artwork} alt="" width={80} height={80} unoptimized className="rounded-xl border-2 border-ink/30 mx-auto mb-3 shadow-lg object-cover" />
            )}
            <div className="text-[10px] text-paper uppercase tracking-widest font-mono font-bold mb-2">
              {isPreviewing ? (
                <span className="text-coral">paused · previewing another song</span>
              ) : playbackError ? (
                <span className="text-coral">can&apos;t play this song here · skipping</span>
              ) : songLoading ? (
                <span className="inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" aria-hidden />loading…</span>
              ) : 'now playing'}
            </div>
            <div className={`font-pixel text-2xl sm:text-3xl md:text-4xl leading-snug max-w-2xl break-words ${isPreviewing ? 'text-paper/40' : 'text-paper'}`}>{room.current_song_title}</div>
            {room.current_song_artist && (
              <div className="text-sm text-paper/70 font-mono mt-1">{room.current_song_artist}</div>
            )}
          </div>
        ) : (
          (bgCount === 0) && (
            <div className="bg-paper/40 backdrop-blur-xl border-2 border-ink p-6 sm:p-8 rounded-2xl shadow-[6px_6px_0_var(--color-ink)] flex flex-col items-center max-w-sm text-center">
              <div className="mb-4"><ImageIcon size={48} className="text-ink/80" /></div>
              <h3 className="font-pixel text-xl text-ink mb-2">Set the Vibe!</h3>
              <p className="text-xs font-mono text-ink-soft mb-6">Pick your own background. Only you see it.</p>
              <button onClick={() => { setIsSidebarOpen(true); setActiveTab('backgrounds'); }}
                className="bg-coral border-2 border-ink rounded-lg px-6 py-3 text-sm font-bold font-mono shadow-[3px_3px_0_var(--color-ink)] hover:translate-y-px hover:shadow-[2px_2px_0_var(--color-ink)] transition-all flex items-center gap-2">
                <Plus size={16} /> Add Background
              </button>
            </div>
          )
        )}
      </div>

      {/* Floating Player Bar */}
      <div className="px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:p-8 flex justify-center pointer-events-auto shrink-0 z-[40]">
        <div data-tour="player" className="w-full sm:w-[380px] max-w-[420px] bg-paper/40 backdrop-blur-xl border-[2.5px] border-ink rounded-2xl px-4 sm:px-5 py-3.5 shadow-[6px_6px_0_var(--color-ink)] flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {room.current_song_artwork ? (
                <NextImage src={room.current_song_artwork} alt="" width={40} height={40} unoptimized className="rounded-full border-[2.5px] border-ink shrink-0 shadow-[2px_2px_0_var(--color-ink)] object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full border-[2.5px] border-ink bg-gradient-to-br from-coral to-teal-3 shrink-0 shadow-[2px_2px_0_var(--color-ink)]"></div>
              )}
              <div className="block min-w-0">
                <b className="block text-sm font-mono font-bold drop-shadow-sm leading-tight text-ink truncate">
                  {room.current_song_title || "Silence..."}
                </b>
                <span className="text-[10px] font-mono font-bold text-ink-soft/90 drop-shadow-sm truncate block">
                  {songLoading ? (
                    <span className="inline-flex items-center gap-1"><Loader2 size={10} className="animate-spin" aria-hidden />Loading song…</span>
                  ) : (room.current_song_artist || "Room Radio")}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button className="w-10 h-10 sm:w-9 sm:h-9 rounded-full border-[2.5px] border-ink bg-paper flex items-center justify-center hover:bg-teal-1 text-xs shadow-[2px_2px_0_var(--color-ink)] opacity-50 cursor-not-allowed">
                <SkipBack size={16} />
              </button>
              <button onClick={handleTogglePlay}
                disabled={isPreviewing}
                title={isPreviewing ? 'Stop the preview to control room playback' : undefined}
                className={`w-12 h-12 rounded-full border-[2.5px] border-ink bg-yellow flex items-center justify-center shadow-[3px_3px_0_var(--color-ink)] transition-transform ${isPreviewing ? 'opacity-40 cursor-not-allowed' : 'hover:bg-yellow/80 hover:translate-y-px hover:shadow-[2px_2px_0_var(--color-ink)]'}`}>
                {room.is_playing ? <Pause size={20} className="fill-current" /> : <Play size={20} className="fill-current ml-1" />}
              </button>
              <button onClick={handleNextSong}
                className="w-10 h-10 sm:w-9 sm:h-9 rounded-full border-[2.5px] border-ink bg-paper flex items-center justify-center hover:bg-teal-1 text-xs shadow-[2px_2px_0_var(--color-ink)] transition-transform hover:translate-y-px hover:shadow-[1px_1px_0_var(--color-ink)]">
                <SkipForward size={16} />
              </button>
            </div>
          </div>

          {/* Song Progress Visualizer */}
          {currentVideoId && (
            <SongProgressBar ytPlayerRef={ytPlayerRef} isPlaying={Boolean(room.is_playing)} onSeek={handleSeek} />
          )}

          {/* Volume (only for you) */}
          <div data-tour="volume" className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setVolume(volume === 0 ? lastVolumeRef.current : 0)}
              aria-label={volume === 0 ? 'Unmute' : 'Mute'}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink hover:bg-ink/10"
            >
              {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Volume"
              suppressHydrationWarning
              className="h-6 min-w-0 flex-1 accent-coral"
            />
          </div>
        </div>
      </div>

      {confirmLeave && (
        <ConfirmDialog
          title="Close the room?"
          message="You're the host, so leaving closes the room for everyone."
          confirmLabel="Close room"
          busy={leaving}
          onConfirm={doLeave}
          onCancel={() => setConfirmLeave(false)}
        />
      )}

      {/* Sidebar Overlay */}
      {isSidebarOpen && <div className="fixed inset-0 z-[60] bg-ink/10 pointer-events-auto" onClick={() => setIsSidebarOpen(false)}></div>}

      {/* Sidebar Panel */}
      <div style={{ ["--sb-w" as string]: `${sidebarWidth}px` }}
        className={`fixed top-0 right-0 h-dvh w-full sm:w-[var(--sb-w)] max-w-[100vw] sm:max-w-none bg-paper/70 backdrop-blur-2xl border-l-[3px] border-ink flex flex-col pointer-events-auto transition-transform duration-300 ease-out z-[70] will-change-transform ${isSidebarOpen ? 'translate-x-0 shadow-[-10px_0_30px_rgba(0,0,0,0.2)]' : 'translate-x-full'}`}>
        <div onMouseDown={() => { isResizing.current = true; document.body.style.cursor = 'col-resize'; }}
          className="hidden sm:block absolute top-0 bottom-0 left-[-2px] w-2 cursor-col-resize hover:bg-coral/40 z-[80] transition-colors" />

        <div className="shrink-0 flex items-center justify-between px-4 sm:px-6 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] sm:py-5 border-b-[2.5px] border-ink bg-cream/50">
          <h2 className="font-pixel text-xl text-ink leading-none truncate max-w-[60vw] sm:max-w-[200px]">{String(room.name)}</h2>
          <button onClick={() => setIsSidebarOpen(false)} className="w-10 h-10 sm:w-8 sm:h-8 rounded-full border-2 border-ink bg-coral flex items-center justify-center font-bold text-xs shadow-[2px_2px_0_var(--color-ink)] hover:translate-y-px hover:shadow-[1px_1px_0_var(--color-ink)] shrink-0"><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div data-tour="tabs" className="flex border-b-[2.5px] border-ink bg-cream/50 shrink-0">
          {['listeners', 'queue', 'chat', 'backgrounds'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} data-tour={`tab-${tab}`}
              className={`flex-1 min-w-0 text-center py-3.5 sm:py-3 ${tab === 'backgrounds' ? 'text-[9px]' : 'text-[10px]'} uppercase font-mono border-r-[2.5px] border-ink last:border-r-0 transition-colors ${activeTab === tab ? 'bg-paper font-bold shadow-[inset_0_3px_0_var(--color-ink)]' : 'text-ink-soft hover:bg-paper/50'}`}>
              {tab === 'listeners' ? `${listeners.length} LI` : tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
          {activeTab === 'listeners' && (
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {listeners.map((listener, idx) => (
                <div key={idx} className="flex items-center gap-3 border-2 border-ink rounded-xl p-3 bg-cream/80 shadow-[3px_3px_0_var(--color-ink)]">
                  <div className="w-10 h-10 rounded-full border-2 border-ink bg-coral flex items-center justify-center font-bold font-mono uppercase">
                    {(listener.display_name || listener.email)?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="overflow-hidden">
                    <b className="text-xs block truncate font-mono">{listener.display_name || ((listener.email && typeof listener.email === 'string') ? listener.email.split('@')[0] : 'Anonymous')}</b>
                    <span className="text-[10px] text-ink-soft font-mono">{listener.is_host ? 'Host' : 'Listener'}</span>
                  </div>
                </div>
              ))}
              <div className="mt-4 flex justify-center">
                {/* Invite modal button */}
                <div data-tour="invite">
                  {/* InviteModal renders its own button and modal */}
                  {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
                  {/* @ts-ignore */}
                  <InviteModal roomId={roomIdStr} roomName={String(room.name)} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'queue' && (
            // The search box's own results list can grow past what fits (up
            // to its internal 320px cap plus the input/hint above it) — this
            // whole tab scrolls as one region instead of splitting into a
            // shrink-0 search block + flex-1 queue list, so a tall result
            // set never gets silently clipped by the parent's overflow-hidden.
            <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden flex flex-col p-4 gap-4">
              <div data-tour="queue-search" className="shrink-0 flex flex-col gap-2">
                <AddPlaylistToQueue roomId={roomIdStr} />
                <SongSearch onAddToQueue={handleAddToQueue} ytPlayerRef={ytPlayerRef} isRoomPlaying={Boolean(room.is_playing)} onPreviewStateChange={setIsPreviewing} enablePlaylistSave />
              </div>
              {queue.length > 0 && (
                <>
                  <div className="shrink-0 text-[9px] uppercase tracking-widest font-mono text-ink-soft/60 font-bold border-t-[1.5px] border-ink/20 pt-3">Playlist · {queue.length} songs</div>
                  <div className="shrink-0 pr-1">
                    <QueueList
                      queue={queue}
                      currentQueueId={room.current_queue_id ?? undefined}
                      isPlaying={Boolean(room.is_playing)}
                      onPlay={handlePlaySongNow}
                      onRemove={handleRemoveFromQueue}
                      onReorder={handleReorderQueue}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="flex-1 flex flex-col overflow-hidden p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {messages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-xs font-mono text-ink-soft/70 gap-2">
                  <div className="mb-2"><MessageSquare size={32} className="opacity-50" /></div>
                  It&apos;s quiet here...
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-3">
                  {messages.map((msg, idx) => {
                    const isMe = msg.user_id === user.id;
                    // Resolve display name: optimistic local msg has it, otherwise look up from presence
                    const presenceName = listeners.find(l => (l as Record<string, unknown>).user_id === msg.user_id)?.display_name;
                    const userEmailDisplay = msg.user_display_name || presenceName || ((msg.user_email && typeof msg.user_email === 'string') ? msg.user_email.split('@')[0] : 'Anonymous');
                    return (
                      <div key={(msg.id ?? idx) as React.Key} className={`flex flex-col max-w-[85%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
                        <span className="text-[9px] font-mono text-ink-soft/60 mb-0.5 px-1">{userEmailDisplay}</span>
                        <div className={`px-3 py-2 rounded-xl text-xs font-mono shadow-[2px_2px_0_var(--color-ink)] border-[1.5px] border-ink break-words ${isMe ? 'bg-teal-2 text-ink rounded-tr-sm' : 'bg-paper text-ink rounded-tl-sm'}`}>
                          {String(msg.content)}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
              <div className="flex gap-2 mt-4 pt-4 border-t-[2.5px] border-ink border-dashed shrink-0">
                <input type="text" placeholder="Say something..."
                  className="flex-1 min-w-0 bg-paper border-2 border-ink rounded-full px-4 py-2.5 text-base sm:text-xs font-mono focus:outline-none focus:ring-2 focus:ring-teal-2 shadow-[inset_2px_2px_0_rgba(0,0,0,0.05)]"
                  value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} />
                <button onClick={handleSendMessage} className="w-11 h-11 sm:w-10 sm:h-10 rounded-full bg-coral border-2 border-ink flex items-center justify-center text-sm shadow-[3px_3px_0_var(--color-ink)] hover:translate-y-px hover:translate-x-px hover:shadow-[2px_2px_0_var(--color-ink)] shrink-0">
                  <Send size={16} className="-ml-0.5 mt-0.5" />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'backgrounds' && (
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
              <div className="bg-cream border-2 border-ink p-4 rounded-xl shadow-[3px_3px_0_var(--color-ink)]">
                <h3 className="font-pixel text-lg text-ink mb-2">My Background</h3>
                <p className="text-[10px] font-mono text-ink-soft mb-3 leading-relaxed">
                  Only you see this — everyone in the room picks their own. Up to {MAX_BACKGROUNDS_PER_FOLDER}.
                </p>
                <BackgroundPicker
                  selectedUrls={myBackgrounds}
                  onSelectionChange={handleBackgroundSelectionChange}
                  maxSelection={MAX_BACKGROUNDS_PER_FOLDER}
                  allowLibraryManagement
                  compact
                />
              </div>
              <div className="bg-cream border-2 border-ink p-4 rounded-xl shadow-[3px_3px_0_var(--color-ink)]">
                <h3 className="font-pixel text-lg text-ink mb-2">Slideshow Speed</h3>
                <p className="text-[10px] font-mono text-ink-soft mb-3">Currently {timerInterval / 1000}s</p>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono font-bold">5s</span>
                  <input type="range" min="5" max="60" step="5" value={timerInterval / 1000} onChange={handleTimerChange} className="flex-1 accent-coral" />
                  <span className="text-xs font-mono font-bold">60s</span>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
