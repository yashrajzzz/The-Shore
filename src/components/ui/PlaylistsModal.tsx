'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { ListMusic, Plus, Trash2, ChevronLeft, Music, Loader2 } from 'lucide-react';
import { Window } from './Window';
import { Button } from './Button';
import { SongSearch } from './SongSearch';
import {
  listPlaylists,
  createPlaylist,
  deletePlaylist,
  getPlaylistSongs,
  addSongToPlaylist,
  removeSongFromPlaylist,
} from '@/app/actions/playlists';
import { MAX_PLAYLISTS, MAX_SONGS_PER_PLAYLIST, type Playlist, type PlaylistSong } from '@/utils/playlists';

function formatDuration(ms: number | null): string {
  if (!ms) return '';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function PlaylistDetail({ playlist, onBack, onSongCountChange }: {
  playlist: Playlist;
  onBack: () => void;
  onSongCountChange: (count: number) => void;
}) {
  const [songs, setSongs] = useState<PlaylistSong[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    const res = await getPlaylistSongs(playlist.id);
    if (res.error) setError(res.error);
    setSongs(res.songs);
    setIsLoading(false);
  }, [playlist.id]);

  useEffect(() => {
    const timer = setTimeout(() => { load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  // Keep the parent's song_count in sync with whatever `songs` actually is,
  // instead of every mutation below separately computing and reporting a
  // count — one source of truth, no stale-closure math.
  useEffect(() => {
    onSongCountChange(songs.length);
  }, [songs.length, onSongCountChange]);

  // Renders the song in the list the instant + is clicked, using the
  // metadata search already has (everything but the resolved videoId) — the
  // user shouldn't have to watch the YouTube lookup + DB write finish before
  // seeing their song land. `handleAdd` below swaps this placeholder out for
  // the real row (or removes it) once that background work settles.
  const handleOptimisticAdd = useCallback((song: { tempId: string; title: string; artist: string; artwork: string; duration: number }) => {
    setSongs(prev => [...prev, {
      id: song.tempId,
      video_id: '',
      title: song.title,
      artist: song.artist,
      artwork: song.artwork,
      duration_ms: song.duration,
      position: prev.length + 1,
    }]);
  }, []);

  const handleOptimisticAddFailed = useCallback((tempId: string) => {
    setSongs(prev => prev.filter(s => s.id !== tempId));
  }, []);

  const handleAdd = useCallback(async (song: { videoId: string; title: string; artist: string; artwork: string; duration: number; tempId?: string }) => {
    // Thrown errors surface in SongSearch's own error banner next to the add
    // button it just clicked — no need to duplicate that here. SongSearch
    // also calls onOptimisticAddFailed on its own to clean up the placeholder.
    const res = await addSongToPlaylist(playlist.id, song);
    if (res.error) throw new Error(res.error);
    if (res.song) {
      setSongs(prev => song.tempId
        ? prev.map(s => (s.id === song.tempId ? res.song! : s))
        : [...prev, res.song!]);
    } else if (!song.tempId) {
      // Server didn't hand back the inserted row for some reason — fall
      // back to a full reload so state doesn't silently drift. (If there was
      // a tempId, the optimistic placeholder already reflects the song.)
      await load();
    }
  }, [playlist.id, load]);

  const handleRemove = useCallback(async (songId: string) => {
    // Remove immediately, same as add — but unlike a fresh add there's real
    // data to lose here, so if the delete actually fails on the server we
    // put the row back (at its original spot) instead of leaving the UI
    // silently out of sync with the DB.
    let removedSong: PlaylistSong | undefined;
    let removedIndex = -1;
    setSongs(prev => {
      removedIndex = prev.findIndex(s => s.id === songId);
      removedSong = prev.find(s => s.id === songId);
      return prev.filter(s => s.id !== songId);
    });

    const res = await removeSongFromPlaylist(playlist.id, songId);
    if (res.error) {
      setError(res.error);
      const songToRestore = removedSong;
      const insertAt = removedIndex;
      if (songToRestore) {
        setSongs(prev => {
          if (prev.some(s => s.id === songId)) return prev;
          const next = [...prev];
          next.splice(Math.min(insertAt, next.length), 0, songToRestore);
          return next;
        });
      }
    }
  }, [playlist.id]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 flex items-center gap-2 pb-4 border-b-[1.5px] border-ink/10 mb-4">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-full border-2 border-ink bg-paper flex items-center justify-center shadow-[2px_2px_0_var(--color-ink)] hover:translate-y-px hover:shadow-[1px_1px_0_var(--color-ink)] transition-all shrink-0"
        >
          <ChevronLeft size={16} />
        </button>
        <h3 className="font-pixel text-xl truncate">{playlist.name}</h3>
        <span className="ml-auto text-[10px] font-mono text-ink-soft shrink-0">{songs.length}/{MAX_SONGS_PER_PLAYLIST}</span>
      </div>

      {songs.length >= MAX_SONGS_PER_PLAYLIST && (
        <div className="bg-pink/60 border-[1.5px] border-ink rounded-lg px-3 py-2 text-[10px] font-mono text-center mb-4 shrink-0">
          This playlist is full. Remove a song to add another.
        </div>
      )}

      {error && (
        <div className="bg-pink border-2 border-ink p-2 rounded text-xs text-center mb-4 shrink-0">{error}</div>
      )}

      <div className="flex-1 min-h-0 min-w-0 flex flex-col sm:flex-row gap-4 sm:gap-6">
        {/* Left Column: Search */}
        <div className="flex-1 min-w-0 flex flex-col min-h-[240px] sm:min-h-0 border-b-[1.5px] sm:border-b-0 sm:border-r-[1.5px] border-ink/10 pb-4 sm:pb-0 sm:pr-6">
          {songs.length < MAX_SONGS_PER_PLAYLIST && (
            <SongSearch
              onAddToQueue={handleAdd}
              onOptimisticAdd={handleOptimisticAdd}
              onOptimisticAddFailed={handleOptimisticAddFailed}
              scrollContainer={true}
            />
          )}
        </div>

        {/* Right Column: Playlist Songs */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto pr-2 playlist-scroll pb-2">
            {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={18} className="animate-spin text-ink-soft/50" />
          </div>
        ) : songs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-[10px] font-mono text-ink-soft/50 gap-1.5">
            <Music size={20} className="opacity-30" />
            <span>No songs yet — search above to add some</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {songs.map((song) => (
              <div key={song.id} className="flex items-center gap-2.5 bg-cream/60 border-[1.5px] border-ink/70 rounded-xl p-2">
                {song.artwork ? (
                  <Image src={song.artwork} alt={song.title} width={36} height={36} unoptimized className="w-9 h-9 rounded-lg object-cover border-[1.5px] border-ink/50 shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-paper border-[1.5px] border-ink/50 flex items-center justify-center shrink-0">
                    <Music size={14} className="text-ink-soft/50" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-mono font-bold truncate leading-tight">{song.title}</div>
                  <div className="text-[9px] font-mono text-ink-soft truncate leading-tight mt-0.5">
                    {song.artist} {song.duration_ms ? `· ${formatDuration(song.duration_ms)}` : ''}
                  </div>
                </div>
                <button
                  onClick={() => handleRemove(song.id)}
                  className="w-7 h-7 rounded-lg border-[1.5px] border-ink bg-paper flex items-center justify-center hover:bg-pink/60 transition-all shrink-0"
                  title="Remove from playlist"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PlaylistsModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const res = await listPlaylists();
    if (res.error) setError(res.error);
    setPlaylists(res.playlists);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => { load(); }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setIsCreating(true);
    setError('');
    const res = await createPlaylist(newName);
    setIsCreating(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setNewName('');
    await load();
  };

  const handleDelete = async (playlistId: string) => {
    if (!confirm('Delete this playlist? This cannot be undone.')) return;
    setPlaylists(prev => prev.filter(p => p.id !== playlistId));
    const res = await deletePlaylist(playlistId);
    if (res?.error) {
      setError(res.error);
      await load();
    }
  };

  // Stable identity (only changes when switching playlists) — PlaylistDetail's
  // `load` useCallback depends on this, and an inline arrow here would give it
  // a new reference every render. Since `load` calls this, which calls
  // setPlaylists here, which re-renders this component and would otherwise
  // recreate the inline arrow, that was an infinite fetch/re-render loop
  // (throttled only by the DB round-trip), visible as periodic flicker.
  const activePlaylistId = activePlaylist?.id;
  const handleSongCountChange = useCallback((count: number) => {
    setPlaylists(prev => prev.map(p => p.id === activePlaylistId ? { ...p, song_count: count } : p));
  }, [activePlaylistId]);

  return (
    <>
      <Button variant="secondary" className="px-6 py-2" onClick={() => setIsOpen(true)}>
        <ListMusic size={12} className="mr-1.5" /> My Playlists
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-ink/30 backdrop-blur-[2px] p-4 sm:p-6 overflow-hidden">
          <div className={`w-full flex flex-col min-h-0 max-h-full transition-all duration-300 ${activePlaylist ? 'max-w-[800px]' : 'max-w-md'}`}>
            <Window 
              title={activePlaylist ? 'Playlist' : 'My Playlists'} 
              onClose={() => setIsOpen(false)}
              className="flex-1 min-h-0"
            >
              <div className="p-6 h-full flex flex-col min-h-0">
                {activePlaylist ? (
                  <PlaylistDetail
                    playlist={activePlaylist}
                    onBack={() => { setActivePlaylist(null); load(); }}
                    onSongCountChange={handleSongCountChange}
                  />
                ) : (
                  <div className="flex flex-col gap-4">
                    <form onSubmit={handleCreate} className="flex gap-2">
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="e.g. Late Night Drive"
                        maxLength={32}
                        disabled={playlists.length >= MAX_PLAYLISTS}
                        className="flex-1 bg-paper border-[2px] border-ink rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-2 disabled:opacity-50"
                      />
                      <Button
                        type="submit"
                        variant="primary"
                        className="px-3"
                        disabled={isCreating || !newName.trim() || playlists.length >= MAX_PLAYLISTS}
                      >
                        {isCreating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} strokeWidth={3} />}
                      </Button>
                    </form>

                    {playlists.length >= MAX_PLAYLISTS && (
                      <p className="text-[10px] font-mono text-ink-soft text-center -mt-2">
                        You&apos;ve hit the {MAX_PLAYLISTS}-playlist limit. Delete one to make room.
                      </p>
                    )}

                    {error && (
                      <div className="bg-pink border-2 border-ink p-2 rounded text-xs text-center">{error}</div>
                    )}

                    {isLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 size={20} className="animate-spin text-ink-soft/50" />
                      </div>
                    ) : playlists.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-xs font-mono text-ink-soft/60 gap-2">
                        <ListMusic size={24} className="opacity-30" />
                        <span>No playlists yet — create one above</span>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5 max-h-[320px] overflow-y-auto pr-1">
                        {playlists.map((playlist) => (
                          <div
                            key={playlist.id}
                            className="flex items-center gap-2.5 bg-cream/60 border-[1.5px] border-ink/70 rounded-xl p-3 cursor-pointer hover:bg-cream hover:border-ink transition-all group"
                            onClick={() => setActivePlaylist(playlist)}
                          >
                            <div className="w-9 h-9 rounded-lg bg-paper border-[1.5px] border-ink/50 flex items-center justify-center shrink-0">
                              <ListMusic size={14} className="text-ink-soft/60" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[12px] font-mono font-bold truncate leading-tight">{playlist.name}</div>
                              <div className="text-[9px] font-mono text-ink-soft truncate leading-tight mt-0.5">
                                {playlist.song_count}/{MAX_SONGS_PER_PLAYLIST} songs
                              </div>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(playlist.id); }}
                              className="w-7 h-7 rounded-lg border-[1.5px] border-ink bg-paper flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-pink/60 transition-all shrink-0"
                              title="Delete playlist"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <Button type="button" variant="secondary" className="w-full py-2" onClick={() => setIsOpen(false)}>
                      Close
                    </Button>
                  </div>
                )}
              </div>
            </Window>
          </div>
        </div>
      )}
    </>
  );
}
