'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { updateRoomBackgrounds, addToQueue, playNextSong, togglePlayPause, sendMessage } from '@/app/actions/rooms';
import { useRouter } from 'next/navigation';
import { setGlobalBackground } from '@/components/ui/GlobalBackground';
import { YouTubePlayer, YouTubePlayerHandle } from '@/components/ui/YouTubePlayer';
import { SongSearch } from '@/components/ui/SongSearch';
import Image from 'next/image';
import { Image as ImageIcon, Music, MessageSquare, LogOut, SkipBack, Play, Pause, SkipForward, X, Send, Plus } from 'lucide-react';
import { InviteModal } from '@/components/ui/InviteModal';
import { EnableAudioPrompt } from '@/components/ui/EnableAudioPrompt';

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
  [k: string]: unknown;
};

type AppUser = { id?: string; email?: string };

export default function RoomClient({ room: initialRoom, user }: { room: Room, user: AppUser }) {
  type Listener = { email?: string; is_host?: boolean; [k: string]: unknown };
  type QueueItem = { id?: string | number; artwork?: string; title?: string; artist?: string; [k:string]: unknown };
  type Message = { id?: string | number; user_id?: string; user_email?: string; content?: string; created_at?: string; [k:string]: unknown };
  const [activeTab, setActiveTab] = useState('listeners');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const router = useRouter();
  const ytPlayerRef = useRef<YouTubePlayerHandle>(null);

  // Settings State
  const [timerInterval, setTimerInterval] = useState(30000);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync State
  const [room, setRoom] = useState(initialRoom);
  const roomIdStr = String((initialRoom && (initialRoom as Room).id) ?? (initialRoom as Room).id ?? '');
  const userIdStr = String((user && (user as AppUser).id) ?? '');
  const userEmailStr = String((user && (user as AppUser).email) ?? '');
  const bgCount = Array.isArray(room.background_urls) ? room.background_urls.length : 0;
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
    supabase.from('queue').select('*').eq('room_id', roomIdStr).order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setQueue(data); });
    supabase.from('messages').select('*').eq('room_id', roomIdStr).order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => { if (data) setMessages(data.reverse()); });

    const roomSub = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomIdStr}` }, (payload: unknown) => {
        const p = payload as { new?: Record<string, unknown> };
        if (p.new) setRoom(p.new);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue', filter: `room_id=eq.${roomIdStr}` }, () => {
        supabase.from('queue').select('*').eq('room_id', roomIdStr).order('created_at', { ascending: true })
          .then(({ data }) => { if (data) setQueue(data); });
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
      .subscribe();

    const roomChannel = supabase.channel(`room:${room.id}`, { config: { presence: { key: (user as { id?: string }).id } } });
    roomChannel
      .on('presence', { event: 'sync' }, () => {
        const state = roomChannel.presenceState();
        const s = state as Record<string, unknown>;
        setListeners(Object.keys(s).map((key: string) => {
          const val = s[key];
          if (Array.isArray(val) && val.length > 0) return val[0] as unknown as Listener;
          return {} as Listener;
        }));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await roomChannel.track({ user_id: (user as { id?: string }).id, email: (user as { email?: string }).email, is_host: (room as { created_by?: string }).created_by === (user as { id?: string }).id, joined_at: new Date().toISOString() });
        }
      });

    return () => { supabase.removeChannel(roomSub); supabase.removeChannel(roomChannel); };
  }, [room.id, user.id, user.email, room.created_by]);

  useEffect(() => {
    if (Array.isArray(room.background_urls) && room.background_urls.length > 0) setGlobalBackground(room.background_urls as string[], timerInterval);
  }, [room.background_urls, timerInterval]);

  const handleTimerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value) * 1000;
    setTimerInterval(v);
    if (Array.isArray(room.background_urls)) setGlobalBackground(room.background_urls as string[], v);
  };

  const handleBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const currentUrls = room.background_urls || [];
    const remainingSlots = 5 - currentUrls.length;
    if (remainingSlots <= 0) { alert("You already have 5 backgrounds."); return; }
    const files = Array.from(e.target.files).slice(0, remainingSlots);
    setIsUploading(true);
    const supabase = createClient();
    const uploadedUrls: string[] = [];
    for (const file of files) {
      const filePath = `rooms/${Math.random()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage.from('backgrounds').upload(filePath, file);
      if (!uploadError) uploadedUrls.push(supabase.storage.from('backgrounds').getPublicUrl(filePath).data.publicUrl);
    }
    if (uploadedUrls.length > 0) {
      const newUrls = [...currentUrls, ...uploadedUrls];
      await updateRoomBackgrounds(roomIdStr, newUrls);
      setGlobalBackground(newUrls, timerInterval);
    }
    setIsUploading(false);
  };

  const handleDeleteBackground = async (idx: number) => {
    const newUrls = (room.background_urls || []).filter((_: unknown, i: number) => i !== idx);
    setRoom({ ...room, background_urls: newUrls });
    setGlobalBackground(newUrls, timerInterval);
    await updateRoomBackgrounds(roomIdStr, newUrls);
  };

  const handleAddToQueue = useCallback(async (song: { videoId: string; title: string; artist: string; artwork: string; duration: number }) => {
    await addToQueue(roomIdStr, song);
  }, [roomIdStr]);

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    const content = chatInput.trim();
    setChatInput('');
    const messageId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: messageId, room_id: roomIdStr, user_id: userIdStr, user_email: userEmailStr, content, created_at: new Date().toISOString() }]);
    const res = await sendMessage(roomIdStr, content, messageId);
    if (res?.error) { alert("Failed: " + res.error); setMessages(prev => prev.filter(m => m.id !== messageId)); }
  };

  const handleNextSong = async () => {
    if (isHost && ytPlayerRef.current) {
      try { ytPlayerRef.current.pauseVideo(); } catch {}
    }
    const res = await playNextSong(roomIdStr);
    if (res?.error) alert(res.error);
  };

  const handleTogglePlay = async () => {
    // Optimistically toggle local player for host to avoid relying solely on DB round-trip
    if (isHost && ytPlayerRef.current) {
      try {
        const state = ytPlayerRef.current.getPlayerState?.();
        if (state === 1) ytPlayerRef.current.pauseVideo();
        else ytPlayerRef.current.playVideo();
      } catch {
        // ignore
      }
    }

    const res = await togglePlayPause(roomIdStr);
    if (res?.error) alert(res.error);
  };

  const handleYTEnd = useCallback(() => { if (room.created_by === userIdStr) playNextSong(roomIdStr); }, [roomIdStr, room.created_by, userIdStr]);

  const currentVideoId = room.current_song_video_id || (typeof room.current_song_url === 'string' ? (room.current_song_url.match(/(?:youtu\.be\/|v=)([^&\s]+)/)?.[1]) : undefined) || null;
  const isHost = room.created_by === (user as AppUser).id;
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
      />

      {/* Enable audio prompt for listeners (non-hosts) */}
      {!isHost && (
        <EnableAudioPrompt roomId={roomIdStr} ytPlayerRef={ytPlayerRef} />
      )}

      {/* Top Bar */}
      <div className="flex justify-end p-6 pointer-events-auto shrink-0">
        <button onClick={() => setIsSidebarOpen(true)}
          className="w-12 h-12 bg-paper/60 backdrop-blur-md border-[2.5px] border-ink rounded-xl shadow-[4px_4px_0_var(--color-ink)] flex flex-col items-center justify-center gap-[3px] hover:bg-paper/90 transition-all hover:-translate-y-0.5 hover:shadow-[6px_6px_0_var(--color-ink)] z-[60]">
          <span className="w-5 h-[2.5px] bg-ink rounded-full"></span>
          <span className="w-5 h-[2.5px] bg-ink rounded-full"></span>
          <span className="w-5 h-[2.5px] bg-ink rounded-full"></span>
        </button>
      </div>

      {/* Center Now Playing */}
      <div className="flex-1 flex flex-col items-center justify-center pointer-events-auto px-4">
        {room.current_song_title ? (
          <div className="text-center bg-ink/20 backdrop-blur-sm border-2 border-ink/30 px-6 py-4 rounded-2xl drop-shadow-md">
            {room.current_song_artwork && (
            <Image src={room.current_song_artwork} alt="" width={80} height={80} unoptimized className="rounded-xl border-2 border-ink/30 mx-auto mb-3 shadow-lg object-cover" />
            )}
            <div className="text-[10px] text-paper uppercase tracking-widest font-mono font-bold mb-2">now playing</div>
            <div className="font-pixel text-4xl leading-snug text-paper max-w-2xl">{room.current_song_title}</div>
            {room.current_song_artist && (
              <div className="text-sm text-paper/70 font-mono mt-1">{room.current_song_artist}</div>
            )}
          </div>
        ) : (
          (bgCount === 0) && (
            <div className="bg-paper/40 backdrop-blur-xl border-2 border-ink p-8 rounded-2xl shadow-[6px_6px_0_var(--color-ink)] flex flex-col items-center max-w-sm text-center">
              <div className="mb-4"><ImageIcon size={48} className="text-ink/80" /></div>
              <h3 className="font-pixel text-xl text-ink mb-2">Set the Vibe!</h3>
              <p className="text-xs font-mono text-ink-soft mb-6">Upload a beautiful GIF or image for the background.</p>
              <button onClick={() => fileInputRef.current?.click()}
                className="bg-coral border-2 border-ink rounded-lg px-6 py-3 text-sm font-bold font-mono shadow-[3px_3px_0_var(--color-ink)] hover:translate-y-px hover:shadow-[2px_2px_0_var(--color-ink)] transition-all flex items-center gap-2">
                <Plus size={16} /> Add Background
              </button>
            </div>
          )
        )}
      </div>

      {/* Floating Player Bar */}
      <div className="p-8 flex justify-center pointer-events-auto shrink-0 z-[40]">
        <div className="bg-paper/40 backdrop-blur-xl border-[2.5px] border-ink rounded-full px-6 py-3 shadow-[6px_6px_0_var(--color-ink)] flex items-center gap-6">
          <div className="flex items-center gap-3">
            {room.current_song_artwork ? (
              <Image src={room.current_song_artwork} alt="" width={40} height={40} unoptimized className="rounded-full border-[2.5px] border-ink shrink-0 shadow-[2px_2px_0_var(--color-ink)] object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full border-[2.5px] border-ink bg-gradient-to-br from-coral to-teal-3 shrink-0 shadow-[2px_2px_0_var(--color-ink)]"></div>
            )}
            <div className="hidden sm:block">
              <b className="block text-sm font-mono font-bold drop-shadow-sm leading-tight text-ink max-w-[150px] truncate">
                {room.current_song_title || "Silence..."}
              </b>
              <span className="text-[10px] font-mono font-bold text-ink-soft/90 drop-shadow-sm">
                {room.current_song_artist || "Room Radio"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button className="w-9 h-9 rounded-full border-[2.5px] border-ink bg-paper flex items-center justify-center hover:bg-teal-1 text-xs shadow-[2px_2px_0_var(--color-ink)] opacity-50 cursor-not-allowed">
              <SkipBack size={16} />
            </button>
            <button onClick={isHost ? handleTogglePlay : undefined}
              disabled={!isHost}
              className="w-12 h-12 rounded-full border-[2.5px] border-ink bg-yellow flex items-center justify-center hover:bg-yellow/80 shadow-[3px_3px_0_var(--color-ink)] transition-transform hover:translate-y-px hover:shadow-[2px_2px_0_var(--color-ink)] disabled:opacity-60">
              {room.is_playing ? <Pause size={20} className="fill-current" /> : <Play size={20} className="fill-current ml-1" />}
            </button>
            <button onClick={handleNextSong} disabled={!isHost}
              className="w-9 h-9 rounded-full border-[2.5px] border-ink bg-paper flex items-center justify-center hover:bg-teal-1 text-xs shadow-[2px_2px_0_var(--color-ink)] transition-transform hover:translate-y-px hover:shadow-[1px_1px_0_var(--color-ink)] disabled:opacity-50">
              <SkipForward size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Sidebar Overlay */}
      {isSidebarOpen && <div className="fixed inset-0 z-[60] bg-ink/10 pointer-events-auto" onClick={() => setIsSidebarOpen(false)}></div>}

      {/* Sidebar Panel */}
      <div style={{ width: sidebarWidth }}
        className={`fixed top-0 right-0 bottom-0 bg-paper/70 backdrop-blur-2xl border-l-[3px] border-ink flex flex-col pointer-events-auto transition-transform duration-300 ease-out z-[70] ${isSidebarOpen ? 'translate-x-0 shadow-[-10px_0_30px_rgba(0,0,0,0.2)]' : 'translate-x-full'}`}>
        <div onMouseDown={() => { isResizing.current = true; document.body.style.cursor = 'col-resize'; }}
          className="absolute top-0 bottom-0 left-[-2px] w-2 cursor-col-resize hover:bg-coral/40 z-[80] transition-colors" />

        <div className="shrink-0 flex items-center justify-between px-6 py-5 border-b-[2.5px] border-ink bg-cream/50">
          <h2 className="font-pixel text-xl text-ink leading-none truncate max-w-[200px]">{String(room.name)}</h2>
          <button onClick={() => setIsSidebarOpen(false)} className="w-8 h-8 rounded-full border-2 border-ink bg-coral flex items-center justify-center font-bold text-xs shadow-[2px_2px_0_var(--color-ink)] hover:translate-y-px hover:shadow-[1px_1px_0_var(--color-ink)] shrink-0"><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b-[2.5px] border-ink bg-cream/50 shrink-0">
          {['listeners', 'queue', 'chat', 'settings'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 text-center py-3 text-[10px] uppercase font-mono border-r-[2.5px] border-ink last:border-r-0 transition-colors ${activeTab === tab ? 'bg-paper font-bold shadow-[inset_0_3px_0_var(--color-ink)]' : 'text-ink-soft hover:bg-paper/50'}`}>
              {tab === 'listeners' ? `${listeners.length} LI` : tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col">
          {activeTab === 'listeners' && (
            <div className="grid gap-3">
              {listeners.map((listener, idx) => (
                <div key={idx} className="flex items-center gap-3 border-2 border-ink rounded-xl p-3 bg-cream/80 shadow-[3px_3px_0_var(--color-ink)]">
                  <div className="w-10 h-10 rounded-full border-2 border-ink bg-coral flex items-center justify-center font-bold font-mono uppercase">
                    {listener.email?.[0] || '?'}
                  </div>
                  <div className="overflow-hidden">
                    <b className="text-xs block truncate font-mono">{(listener.email && typeof listener.email === 'string') ? listener.email.split('@')[0] : 'Anonymous'}</b>
                    <span className="text-[10px] text-ink-soft font-mono">{listener.is_host ? 'Host' : 'Listener'}</span>
                  </div>
                </div>
              ))}
              <div className="mt-4 flex justify-center">
                {/* Invite modal button */}
                <div>
                  {/* InviteModal renders its own button and modal */}
                  {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
                  {/* @ts-ignore */}
                  <InviteModal roomId={roomIdStr} roomName={String(room.name)} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'queue' && (
            <div className="flex-1 flex flex-col gap-4">
              <SongSearch onAddToQueue={handleAddToQueue} />
              {queue.length > 0 && (
                <>
                  <div className="text-[9px] uppercase tracking-widest font-mono text-ink-soft/60 font-bold border-t-[1.5px] border-ink/20 pt-3">Up Next · {queue.length} songs</div>
                  <div className="flex flex-col gap-1.5 overflow-y-auto pr-1">
                    {queue.map((item, idx) => (
                      <div key={(item.id ?? idx) as React.Key} className="bg-paper/50 border-[1.5px] border-ink/70 rounded-xl p-2 shadow-[2px_2px_0_var(--color-ink)] flex items-center gap-2.5">
                        {item.artwork ? (
                          <Image src={String(item.artwork)} alt="" width={32} height={32} unoptimized className="rounded-lg border-[1.5px] border-ink/40 object-cover shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-coral/20 flex items-center justify-center text-[10px] font-bold font-mono border-[1.5px] border-ink/20 shrink-0">{idx + 1}</div>
                        )}
                        <div className="flex-1 overflow-hidden">
                          <div className="text-[11px] font-mono font-bold truncate">{String(item.title)}</div>
                          {item.artist && <div className="text-[9px] font-mono text-ink-soft truncate">{String(item.artist)}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {messages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-xs font-mono text-ink-soft/70 gap-2">
                  <div className="mb-2"><MessageSquare size={32} className="opacity-50" /></div>
                  It&apos;s quiet here...
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-3">
                  {messages.map((msg, idx) => {
                    const isMe = msg.user_id === user.id;
                    const userEmailDisplay = (msg.user_email && typeof msg.user_email === 'string') ? msg.user_email.split('@')[0] : 'Anonymous';
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
                  className="flex-1 bg-paper border-2 border-ink rounded-full px-4 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-teal-2 shadow-[inset_2px_2px_0_rgba(0,0,0,0.05)]"
                  value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} />
                <button onClick={handleSendMessage} className="w-10 h-10 rounded-full bg-coral border-2 border-ink flex items-center justify-center text-sm shadow-[3px_3px_0_var(--color-ink)] hover:translate-y-px hover:translate-x-px hover:shadow-[2px_2px_0_var(--color-ink)] shrink-0">
                  <Send size={16} className="-ml-0.5 mt-0.5" />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="flex flex-col gap-6">
              <div className="bg-cream border-2 border-ink p-4 rounded-xl shadow-[3px_3px_0_var(--color-ink)]">
                <h3 className="font-pixel text-lg text-ink mb-2">Backgrounds</h3>
                <p className="text-[10px] font-mono text-ink-soft mb-3 leading-relaxed">Upload GIFs or videos. (Max 5)</p>
                {bgCount > 0 && (
                  <div className="grid grid-cols-5 gap-2 mb-4">
                    {Array.isArray(room.background_urls) && room.background_urls.map((url: string, idx: number) => (
                      <div key={idx} className="relative aspect-square rounded-md overflow-hidden border-[1.5px] border-ink shadow-[1px_1px_0_var(--color-ink)] bg-ink/10 group">
                        {url.endsWith('.mp4') || url.endsWith('.webm') ? (
                          <video src={url} className="w-full h-full object-cover" muted loop playsInline />
                        ) : (
                          <div className="relative w-full h-full">
                            <Image src={url} alt={`Background ${idx + 1}`} fill unoptimized className="object-cover" />
                          </div>
                        )}
                        <button onClick={() => handleDeleteBackground(idx)}
                          className="absolute top-0 right-0 w-5 h-5 bg-coral border-b-[1.5px] border-l-[1.5px] border-ink flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <X size={12} strokeWidth={3} />
                        </button>
                      </div>
                    ))}
                    {Array.from({ length: Math.max(0, 5 - bgCount) }).map((_, idx) => (
                      <div key={`e-${idx}`} className="aspect-square rounded-md border-[1.5px] border-ink/30 border-dashed bg-paper/30 flex items-center justify-center">
                        <span className="text-[10px] font-mono opacity-30">+</span>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || (bgCount >= 5)}
                  className="w-full bg-paper border-2 border-ink rounded-lg py-2 text-xs font-bold font-mono shadow-[2px_2px_0_var(--color-ink)] hover:translate-y-px hover:shadow-[1px_1px_0_var(--color-ink)] disabled:opacity-50">
                  {isUploading ? 'Uploading...' : bgCount >= 5 ? 'Max Reached' : 'Upload Backgrounds'}
                </button>
                <input type="file" ref={fileInputRef} onChange={handleBackgroundUpload} accept="image/*,video/mp4,video/webm" multiple className="hidden" />
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
              <div className="mt-auto pt-6 border-t-[2.5px] border-ink border-dashed">
                <button onClick={() => router.push('/lobby')}
                  className="w-full bg-coral border-2 border-ink rounded-xl py-3 text-sm font-bold font-mono shadow-[4px_4px_0_var(--color-ink)] hover:translate-y-0.5 hover:shadow-[2px_2px_0_var(--color-ink)] transition-all flex items-center justify-center gap-2 text-ink">
                  <LogOut size={16} /> Leave Room
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
