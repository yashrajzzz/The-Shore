'use client';

import { useEffect, useState } from 'react';
import { ListMusic, Loader2, Plus } from 'lucide-react';
import { listPlaylists, addPlaylistToQueue } from '@/app/actions/playlists';
import { type Playlist } from '@/utils/playlists';

export function AddPlaylistToQueue({ roomId }: { roomId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [addedId, setAddedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      setIsLoading(true);
      listPlaylists().then((res) => {
        if (res.error) setError(res.error);
        setPlaylists(res.playlists);
        setIsLoading(false);
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen]);

  const handleAdd = async (playlist: Playlist) => {
    setAddingId(playlist.id);
    setError('');
    const res = await addPlaylistToQueue(roomId, playlist.id);
    setAddingId(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    setAddedId(playlist.id);
    setTimeout(() => setIsOpen(false), 900);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-center gap-1.5 bg-paper border-2 border-ink rounded-xl px-3 py-2 text-[11px] font-mono font-bold shadow-[2px_2px_0_var(--color-ink)] hover:translate-y-px hover:shadow-[1px_1px_0_var(--color-ink)] transition-all"
      >
        <ListMusic size={13} /> Add a Playlist to Queue
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-2 w-full bg-cream border-2 border-ink rounded-xl shadow-[3px_3px_0_var(--color-ink)] p-2 max-h-[280px] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 size={16} className="animate-spin text-ink-soft/50" />
            </div>
          ) : error && playlists.length === 0 ? (
            <div className="text-[10px] font-mono text-ink-soft text-center py-3 px-2">{error}</div>
          ) : playlists.length === 0 ? (
            <div className="text-[10px] font-mono text-ink-soft text-center py-3 px-2">
              No saved playlists yet — build one from the lobby.
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  onClick={() => handleAdd(playlist)}
                  disabled={addingId === playlist.id || playlist.song_count === 0}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-paper/70 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-mono font-bold truncate">{playlist.name}</div>
                    <div className="text-[9px] font-mono text-ink-soft">{playlist.song_count} songs</div>
                  </div>
                  {addingId === playlist.id ? (
                    <Loader2 size={13} className="animate-spin shrink-0" />
                  ) : addedId === playlist.id ? (
                    <span className="text-[9px] font-mono font-bold text-teal-deep shrink-0">Added!</span>
                  ) : (
                    <Plus size={13} className="shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
          {error && playlists.length > 0 && (
            <div className="text-[10px] font-mono text-ink-soft text-center py-1.5 px-2 border-t border-ink/10 mt-1">{error}</div>
          )}
        </div>
      )}
    </div>
  );
}
