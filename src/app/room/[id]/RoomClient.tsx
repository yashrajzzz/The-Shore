'use client';
import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { updateRoomBackgrounds, addToQueue, playNextSong, sendMessage } from '@/app/actions/rooms';
import { useRouter } from 'next/navigation';
import { setGlobalBackground } from '@/components/ui/GlobalBackground';
import dynamic from 'next/dynamic';
import { Image as ImageIcon, Music, MessageSquare, LogOut, SkipBack, Play, Pause, SkipForward, X, Send, Plus } from 'lucide-react';

const ReactPlayer = dynamic(() => import('react-player'), { ssr: false }) as any;

export default function RoomClient({ room: initialRoom, user }: { room: any, user: any }) {
  const [activeTab, setActiveTab] = useState('listeners');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const router = useRouter();
  const playerRef = useRef<any>(null);
  const [hasSeeked, setHasSeeked] = useState(false);
  
  // Settings State
  const [timerInterval, setTimerInterval] = useState(30000);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync State
  const [room, setRoom] = useState(initialRoom);
  const [listeners, setListeners] = useState<any[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [queueInput, setQueueInput] = useState('');
  
  // Chat State
  const [messages, setMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sidebar Resize State
  const [sidebarWidth, setSidebarWidth] = useState(360);
  const isResizing = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 300 && newWidth < 800) {
        setSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = 'default';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTab]);

  // Realtime
  useEffect(() => {
    const supabase = createClient();
    
    // Fetch initial queue
    supabase.from('queue').select('*').eq('room_id', room.id).order('created_at', { ascending: true })
      .then(({ data }) => { if (data) setQueue(data); });

    // Fetch initial chat messages (last 50)
    supabase.from('messages').select('*').eq('room_id', room.id).order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => { if (data) setMessages(data.reverse()); });

    // DB Sync
    const roomSub = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` }, (payload) => {
        setRoom(payload.new);
        setHasSeeked(false); // Reset seek when song changes
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue', filter: `room_id=eq.${room.id}` }, () => {
        // Just refetch the queue when it changes to keep order correct
        supabase.from('queue').select('*').eq('room_id', room.id).order('created_at', { ascending: true })
          .then(({ data }) => { if (data) setQueue(data); });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${room.id}` }, (payload) => {
        setMessages(prev => {
          // Prevent duplicates from optimistic updates
          if (prev.some(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
      })
      .subscribe();

    // Presence
    const roomChannel = supabase.channel(`room:${room.id}`, {
      config: { presence: { key: user.id } },
    });

    roomChannel
      .on('presence', { event: 'sync' }, () => {
        const state = roomChannel.presenceState();
        const activeUsers = Object.keys(state).map(key => state[key][0]);
        setListeners(activeUsers);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await roomChannel.track({
            user_id: user.id,
            email: user.email,
            is_host: room.created_by === user.id,
            joined_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(roomSub);
      supabase.removeChannel(roomChannel);
    };
  }, [room.id, user.id, user.email, room.created_by]);

  useEffect(() => {
    if (room.background_urls && room.background_urls.length > 0) {
      setGlobalBackground(room.background_urls, timerInterval);
    }
  }, [room.background_urls, timerInterval]);

  const handleTimerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newInterval = parseInt(e.target.value) * 1000;
    setTimerInterval(newInterval);
    if (room.background_urls) {
      setGlobalBackground(room.background_urls, newInterval);
    }
  };

  const handleBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const currentUrls = room.background_urls || [];
    const remainingSlots = 5 - currentUrls.length;
    if (remainingSlots <= 0) {
      alert("You already have 5 backgrounds. Please delete one first.");
      return;
    }

    const files = Array.from(e.target.files).slice(0, remainingSlots);
    setIsUploading(true);
    
    const supabase = createClient();
    const uploadedUrls: string[] = [];
    
    for (const file of files) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `rooms/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('backgrounds')
        .upload(filePath, file);

      if (!uploadError) {
        const { data } = supabase.storage
          .from('backgrounds')
          .getPublicUrl(filePath);
        uploadedUrls.push(data.publicUrl);
      }
    }

    if (uploadedUrls.length > 0) {
      const newUrls = [...currentUrls, ...uploadedUrls];
      await updateRoomBackgrounds(room.id, newUrls);
      setGlobalBackground(newUrls, timerInterval);
    }
    
    setIsUploading(false);
  };

  const handleDeleteBackground = async (indexToDelete: number) => {
    const currentUrls = room.background_urls || [];
    const newUrls = currentUrls.filter((_: any, idx: number) => idx !== indexToDelete);
    
    // Update local state optimistically
    setRoom({ ...room, background_urls: newUrls });
    setGlobalBackground(newUrls, timerInterval);

    // Update DB
    await updateRoomBackgrounds(room.id, newUrls);
  };

  const handleAddQueue = async () => {
    if (!queueInput.trim()) return;
    const url = queueInput.trim();
    setQueueInput('');
    await addToQueue(room.id, url);
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    const content = chatInput.trim();
    setChatInput('');
    
    // Optimistic Update for instant UI
    const messageId = crypto.randomUUID();
    const tempMsg = {
      id: messageId,
      room_id: room.id,
      user_id: user.id,
      user_email: user.email,
      content,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempMsg]);

    const res = await sendMessage(room.id, content, messageId);
    if (res?.error) {
      alert("Failed to send message: " + res.error);
      setMessages(prev => prev.filter(m => m.id !== messageId));
    }
  };

  const handleNextSong = async () => {
    if (room.created_by !== user.id) return;
    await playNextSong(room.id);
  };

  const handleReady = () => {
    if (!hasSeeked && room.current_song_started_at) {
      const startedAt = new Date(room.current_song_started_at).getTime();
      const now = Date.now();
      const diffSeconds = (now - startedAt) / 1000;
      if (diffSeconds > 0 && playerRef.current) {
        playerRef.current.seekTo(diffSeconds, 'seconds');
        setHasSeeked(true);
      }
    }
  };

  return (
    <div className="flex-1 relative flex flex-col w-full h-full pointer-events-none overflow-hidden">
      
      {/* Hidden Music Player */}
      <div className="absolute top-0 left-0 w-0 h-0 overflow-hidden opacity-0 pointer-events-none">
        {room.current_song_url && (
          <ReactPlayer 
            ref={playerRef}
            url={room.current_song_url} 
            playing={room.is_playing} 
            width="0" 
            height="0" 
            volume={1}
            onReady={handleReady}
            onEnded={handleNextSong}
          />
        )}
      </div>

      {/* Top Bar Area */}
      <div className="flex justify-end p-6 pointer-events-auto shrink-0">
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="w-12 h-12 bg-paper/60 backdrop-blur-md border-[2.5px] border-ink rounded-xl shadow-[4px_4px_0_var(--color-ink)] flex flex-col items-center justify-center gap-[3px] hover:bg-paper/90 transition-all hover:-translate-y-0.5 hover:shadow-[6px_6px_0_var(--color-ink)] z-[60]"
        >
          <span className="w-5 h-[2.5px] bg-ink rounded-full"></span>
          <span className="w-5 h-[2.5px] bg-ink rounded-full"></span>
          <span className="w-5 h-[2.5px] bg-ink rounded-full"></span>
        </button>
      </div>

      {/* Main Empty Frame (Visualizer space) */}
      <div className="flex-1 flex flex-col items-center justify-center pointer-events-auto px-4">
         {room.current_song_title ? (
           <div className="text-center bg-ink/20 backdrop-blur-sm border-2 border-ink/30 px-6 py-4 rounded-2xl drop-shadow-md transition-opacity">
              <div className="text-[10px] text-paper uppercase tracking-widest font-mono font-bold mb-2">now playing</div>
              <div className="font-pixel text-4xl leading-snug text-paper max-w-2xl">
                {room.current_song_title}
              </div>
           </div>
         ) : (
           (!room.background_urls || room.background_urls.length === 0) && (
             <div className="bg-paper/40 backdrop-blur-xl border-2 border-ink p-8 rounded-2xl shadow-[6px_6px_0_var(--color-ink)] flex flex-col items-center max-w-sm text-center">
               <div className="mb-4"><ImageIcon size={48} className="text-ink/80" /></div>
               <h3 className="font-pixel text-xl text-ink mb-2">Set the Vibe!</h3>
               <p className="text-xs font-mono text-ink-soft mb-6">
                 Your room needs some scenery. Upload a beautiful GIF or image to play in the background while you listen.
               </p>
               <button 
                 onClick={() => fileInputRef.current?.click()}
                 className="bg-coral border-2 border-ink rounded-lg px-6 py-3 text-sm font-bold font-mono shadow-[3px_3px_0_var(--color-ink)] hover:translate-y-px hover:shadow-[2px_2px_0_var(--color-ink)] transition-all flex items-center gap-2"
               >
                 <Plus size={16} /> Add Background
               </button>
             </div>
           )
         )}
      </div>

      {/* Floating Player (Bottom Center) */}
      <div className="p-8 flex justify-center pointer-events-auto shrink-0 z-[40]">
        <div className="bg-paper/40 backdrop-blur-xl border-[2.5px] border-ink rounded-full px-6 py-3 shadow-[6px_6px_0_var(--color-ink)] flex items-center gap-6">
           
           <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-full border-[2.5px] border-ink bg-gradient-to-br from-coral to-teal-3 shrink-0 shadow-[2px_2px_0_var(--color-ink)]"></div>
             <div className="hidden sm:block">
               <b className="block text-sm font-mono font-bold drop-shadow-sm leading-tight text-ink max-w-[150px] truncate">
                 {room.current_song_title || "Silence..."}
               </b>
               <span className="text-[10px] font-mono font-bold text-ink-soft/90 drop-shadow-sm">Room Radio</span>
             </div>
           </div>

           <div className="flex items-center gap-3">
             <button className="w-9 h-9 rounded-full border-[2.5px] border-ink bg-paper flex items-center justify-center hover:bg-teal-1 text-xs shadow-[2px_2px_0_var(--color-ink)] transition-transform hover:translate-y-px hover:shadow-[1px_1px_0_var(--color-ink)] opacity-50 cursor-not-allowed"><SkipBack size={16} /></button>
             <button className="w-12 h-12 rounded-full border-[2.5px] border-ink bg-yellow flex items-center justify-center hover:bg-yellow/80 shadow-[3px_3px_0_var(--color-ink)] transition-transform hover:translate-y-px hover:shadow-[2px_2px_0_var(--color-ink)]">
               {room.is_playing ? <Pause size={20} className="fill-current" /> : <Play size={20} className="fill-current ml-1" />}
             </button>
             <button onClick={handleNextSong} disabled={room.created_by !== user.id} className="w-9 h-9 rounded-full border-[2.5px] border-ink bg-paper flex items-center justify-center hover:bg-teal-1 text-xs shadow-[2px_2px_0_var(--color-ink)] transition-transform hover:translate-y-px hover:shadow-[1px_1px_0_var(--color-ink)] disabled:opacity-50"><SkipForward size={16} /></button>
           </div>
        </div>
      </div>

      {/* Slide-out Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-[60] bg-ink/10 pointer-events-auto" onClick={() => setIsSidebarOpen(false)}></div>
      )}

      {/* Slide-out Sidebar Panel */}
      <div 
        style={{ width: sidebarWidth }}
        className={`fixed top-0 right-0 bottom-0 bg-paper/70 backdrop-blur-2xl border-l-[3px] border-ink flex flex-col pointer-events-auto transition-transform duration-300 ease-out z-[70] ${isSidebarOpen ? 'translate-x-0 shadow-[-10px_0_30px_rgba(0,0,0,0.2)]' : 'translate-x-full'}`}
      >
        {/* Drag Handle */}
        <div 
          onMouseDown={() => {
            isResizing.current = true;
            document.body.style.cursor = 'col-resize';
          }}
          className="absolute top-0 bottom-0 left-[-2px] w-2 cursor-col-resize hover:bg-coral/40 z-[80] transition-colors"
        />

        <div className="shrink-0 flex items-center justify-between px-6 py-5 border-b-[2.5px] border-ink bg-cream/50">
           <h2 className="font-pixel text-xl text-ink leading-none truncate max-w-[200px]">{room.name}</h2>
           <button onClick={() => setIsSidebarOpen(false)} className="w-8 h-8 rounded-full border-2 border-ink bg-coral flex items-center justify-center font-bold text-xs shadow-[2px_2px_0_var(--color-ink)] hover:translate-y-px hover:shadow-[1px_1px_0_var(--color-ink)] shrink-0"><X size={16} /></button>
        </div>
        
        {/* Tabs */}
        <div className="flex border-b-[2.5px] border-ink bg-cream/50 shrink-0">
          {['listeners', 'queue', 'chat', 'settings'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 text-center py-3 text-[10px] uppercase font-mono border-r-[2.5px] border-ink last:border-r-0 transition-colors ${activeTab === tab ? 'bg-paper font-bold shadow-[inset_0_3px_0_var(--color-ink)]' : 'text-ink-soft hover:bg-paper/50'}`}
            >
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
                       <b className="text-xs block truncate font-mono">{listener.email?.split('@')[0] || 'Anonymous'}</b>
                       <span className="text-[10px] text-ink-soft font-mono">
                         {listener.is_host ? 'Host' : 'Listener'}
                       </span>
                     </div>
                  </div>
                ))}
                
                <div className="mt-4 flex justify-center">
                  <button className="border-2 border-ink bg-teal-2 rounded-full px-6 py-2 text-xs font-bold font-mono shadow-[3px_3px_0_var(--color-ink)] hover:translate-y-px hover:translate-x-px hover:shadow-[2px_2px_0_var(--color-ink)] transition-all">
                    + Invite Friends
                  </button>
                </div>
             </div>
           )}
           
           {activeTab === 'queue' && (
             <div className="flex-1 flex flex-col">
               <div className="flex gap-2 mb-4">
                 <input 
                   type="text" 
                   placeholder="Paste a YouTube URL..." 
                   className="flex-1 bg-paper border-2 border-ink rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-teal-2 shadow-[inset_2px_2px_0_rgba(0,0,0,0.05)]"
                   value={queueInput}
                   onChange={e => setQueueInput(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && handleAddQueue()}
                 />
                 <button onClick={handleAddQueue} className="bg-yellow border-2 border-ink rounded-lg px-4 py-2 text-xs font-bold font-mono shadow-[3px_3px_0_var(--color-ink)] hover:translate-y-px hover:translate-x-px hover:shadow-[2px_2px_0_var(--color-ink)]">Add</button>
               </div>
               
               {queue.length === 0 ? (
                 <div className="flex-1 flex flex-col items-center justify-center text-xs font-mono text-ink-soft/70 gap-2">
                   <div className="mb-2"><Music size={32} className="opacity-50" /></div>
                   Queue is empty.
                 </div>
               ) : (
                 <div className="flex-1 flex flex-col gap-2 overflow-y-auto pr-2">
                   {queue.map((item, idx) => (
                     <div key={item.id} className="bg-paper/50 border-2 border-ink rounded-lg p-2 shadow-[2px_2px_0_var(--color-ink)] flex items-center gap-3">
                       <div className="w-6 h-6 rounded bg-coral/20 flex items-center justify-center text-[10px] font-bold font-mono border border-ink/20">{idx + 1}</div>
                       <div className="flex-1 overflow-hidden">
                         <div className="text-xs font-mono font-bold truncate" title={item.title}>{item.title}</div>
                       </div>
                     </div>
                   ))}
                 </div>
               )}
             </div>
           )}
           
           {activeTab === 'chat' && (
             <div className="flex-1 flex flex-col overflow-hidden">
               
               {messages.length === 0 ? (
                 <div className="flex-1 flex flex-col items-center justify-center text-xs font-mono text-ink-soft/70 gap-2">
                   <div className="mb-2"><MessageSquare size={32} className="opacity-50" /></div>
                   It's quiet here...
                 </div>
               ) : (
                 <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-3">
                   {messages.map((msg) => {
                     const isMe = msg.user_id === user.id;
                     return (
                       <div key={msg.id} className={`flex flex-col max-w-[85%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
                         <span className="text-[9px] font-mono text-ink-soft/60 mb-0.5 px-1">{msg.user_email.split('@')[0]}</span>
                         <div className={`px-3 py-2 rounded-xl text-xs font-mono shadow-[2px_2px_0_var(--color-ink)] border-[1.5px] border-ink break-words ${isMe ? 'bg-teal-2 text-ink rounded-tr-sm' : 'bg-paper text-ink rounded-tl-sm'}`}>
                           {msg.content}
                         </div>
                       </div>
                     );
                   })}
                   <div ref={messagesEndRef} />
                 </div>
               )}

               <div className="flex gap-2 mt-4 pt-4 border-t-[2.5px] border-ink border-dashed shrink-0">
                 <input 
                   type="text" 
                   placeholder="Say something..." 
                   className="flex-1 bg-paper border-2 border-ink rounded-full px-4 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-teal-2 shadow-[inset_2px_2px_0_rgba(0,0,0,0.05)]"
                   value={chatInput}
                   onChange={e => setChatInput(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                 />
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
                 <p className="text-[10px] font-mono text-ink-soft mb-3 leading-relaxed">
                   Upload new GIFs or videos. This will replace the current backgrounds for everyone. (Max 5)
                 </p>
                 
                 {/* Existing Backgrounds Grid */}
                 {room.background_urls && room.background_urls.length > 0 && (
                   <div className="grid grid-cols-5 gap-2 mb-4">
                     {room.background_urls.map((url: string, idx: number) => (
                       <div key={idx} className="relative aspect-square rounded-md overflow-hidden border-[1.5px] border-ink shadow-[1px_1px_0_var(--color-ink)] bg-ink/10 group">
                         {url.endsWith('.mp4') || url.endsWith('.webm') ? (
                           <video src={url} className="w-full h-full object-cover" muted loop playsInline />
                         ) : (
                           <img src={url} alt={`Background ${idx + 1}`} className="w-full h-full object-cover" />
                         )}
                         <button 
                           onClick={() => handleDeleteBackground(idx)}
                           className="absolute top-0 right-0 w-5 h-5 bg-coral border-b-[1.5px] border-l-[1.5px] border-ink flex items-center justify-center shadow-[-1px_1px_0_var(--color-ink)] transition-opacity opacity-0 group-hover:opacity-100 hover:bg-coral-deep"
                         >
                           <X size={12} strokeWidth={3} />
                         </button>
                       </div>
                     ))}
                     {/* Empty Slots */}
                     {Array.from({ length: Math.max(0, 5 - room.background_urls.length) }).map((_, idx) => (
                       <div key={`empty-${idx}`} className="aspect-square rounded-md border-[1.5px] border-ink/30 border-dashed bg-paper/30 flex items-center justify-center">
                         <span className="text-[10px] font-mono opacity-30">+</span>
                       </div>
                     ))}
                   </div>
                 )}

                 <button 
                   onClick={() => fileInputRef.current?.click()}
                   disabled={isUploading || (room.background_urls && room.background_urls.length >= 5)}
                   className="w-full bg-paper border-2 border-ink rounded-lg py-2 text-xs font-bold font-mono shadow-[2px_2px_0_var(--color-ink)] hover:translate-y-px hover:shadow-[1px_1px_0_var(--color-ink)] disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                   {isUploading ? 'Uploading...' : (room.background_urls && room.background_urls.length >= 5) ? 'Max Capacity Reached' : 'Upload New Backgrounds'}
                 </button>
                 <input type="file" ref={fileInputRef} onChange={handleBackgroundUpload} accept="image/*,video/mp4,video/webm" multiple className="hidden" />
               </div>

               <div className="bg-cream border-2 border-ink p-4 rounded-xl shadow-[3px_3px_0_var(--color-ink)]">
                 <h3 className="font-pixel text-lg text-ink mb-2">Slideshow Speed</h3>
                 <p className="text-[10px] font-mono text-ink-soft mb-3 leading-relaxed">
                   How fast should the backgrounds change? (Currently {timerInterval / 1000}s)
                 </p>
                 <div className="flex items-center gap-3">
                   <span className="text-xs font-mono font-bold">5s</span>
                   <input type="range" min="5" max="60" step="5" value={timerInterval / 1000} onChange={handleTimerChange} className="flex-1 accent-coral" />
                   <span className="text-xs font-mono font-bold">60s</span>
                 </div>
               </div>

               <div className="mt-auto pt-6 border-t-[2.5px] border-ink border-dashed">
                 <button 
                   onClick={() => router.push('/lobby')}
                   className="w-full bg-coral border-2 border-ink rounded-xl py-3 text-sm font-bold font-mono shadow-[4px_4px_0_var(--color-ink)] hover:translate-y-0.5 hover:shadow-[2px_2px_0_var(--color-ink)] transition-all flex items-center justify-center gap-2 text-ink"
                 >
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
