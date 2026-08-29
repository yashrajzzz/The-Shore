'use client';

import { useState } from 'react';
import Image from 'next/image';
import { GripVertical, Pause, Play, X, ListPlus, Loader2, Check } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { listPlaylists, addSongToPlaylist } from '@/app/actions/playlists';
import { MAX_SONGS_PER_PLAYLIST, type Playlist } from '@/utils/playlists';

type QueueItem = { id?: string | number; video_id?: string; artwork?: string; title?: string; artist?: string; duration_ms?: number; position?: number; [k: string]: unknown };

function QueueRow({
  item,
  idx,
  isCurrent,
  isPlaying,
  onPlay,
  onRemove,
}: {
  item: QueueItem;
  idx: number;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: (id: string | number) => void;
  onRemove: (id: string | number) => void;
}) {
  const id = item.id as string | number;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  // "Save to playlist" popover state, mirroring the same pattern used in
  // SongSearch — lazy-loads the user's playlists on first open.
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [savingPlaylistId, setSavingPlaylistId] = useState<string | null>(null);
  const [savedPlaylistId, setSavedPlaylistId] = useState<string | null>(null);
  const [playlistError, setPlaylistError] = useState('');

  const togglePlaylistPicker = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPlaylistError('');
    setIsPickerOpen(prev => {
      const next = !prev;
      if (next && playlists === null) {
        setIsLoadingPlaylists(true);
        listPlaylists().then((res) => {
          if (res.error) setPlaylistError(res.error);
          setPlaylists(res.playlists);
          setIsLoadingPlaylists(false);
        });
      }
      return next;
    });
  };

  const handleSaveToPlaylist = async (e: React.MouseEvent, playlist: Playlist) => {
    e.stopPropagation();
    if (!item.video_id) {
      setPlaylistError('This song can’t be saved (missing video info)');
      return;
    }
    setSavingPlaylistId(playlist.id);
    setPlaylistError('');
    try {
      const res = await addSongToPlaylist(playlist.id, {
        videoId: item.video_id,
        title: String(item.title ?? ''),
        artist: String(item.artist ?? ''),
        artwork: String(item.artwork ?? ''),
        duration: Number(item.duration_ms ?? 0),
      });
      if (res.error) {
        setPlaylistError(res.error);
        return;
      }
      setPlaylists(prev => prev?.map(p => p.id === playlist.id ? { ...p, song_count: p.song_count + 1 } : p) ?? prev);
      setSavedPlaylistId(playlist.id);
      setTimeout(() => setIsPickerOpen(false), 800);
    } catch (err: unknown) {
      setPlaylistError((err as Error)?.message || 'Failed to save song');
    } finally {
      setSavingPlaylistId(null);
    }
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onPlay(id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onPlay(id); }}
      className={`relative group border-[1.5px] border-ink/70 rounded-xl p-2 shadow-[2px_2px_0_var(--color-ink)] flex items-center gap-2.5 cursor-pointer transition-colors min-w-0 max-w-full ${isCurrent ? 'bg-coral/15' : 'bg-paper/50 hover:bg-coral/5'}`}
      title={isCurrent ? 'Now playing' : 'Play now'}
    >
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 p-1 -ml-1 text-ink-soft/40 hover:text-ink-soft cursor-grab active:cursor-grabbing touch-none"
        aria-label="Drag to reorder"
      >
        <GripVertical size={14} />
      </button>

      {item.artwork ? (
        <div className="relative w-8 h-8 shrink-0">
          <Image src={String(item.artwork)} alt="" width={32} height={32} unoptimized className="rounded-lg border-[1.5px] border-ink/40 object-cover w-full h-full" />
          <div className={`absolute inset-0 rounded-lg flex items-center justify-center transition-colors ${isCurrent ? 'bg-ink/40' : 'bg-ink/0 group-hover:bg-ink/40'}`}>
            {isCurrent ? (
              isPlaying
                ? <Pause size={12} className="text-paper" fill="currentColor" />
                : <Play size={12} className="text-paper" fill="currentColor" />
            ) : (
              <Play size={12} className="text-paper opacity-0 group-hover:opacity-100 transition-opacity" fill="currentColor" />
            )}
          </div>
        </div>
      ) : (
        <div className="w-8 h-8 rounded-lg bg-coral/20 flex items-center justify-center text-[10px] font-bold font-mono border-[1.5px] border-ink/20 shrink-0">{idx + 1}</div>
      )}
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className={`text-[11px] font-mono font-bold truncate ${isCurrent ? 'text-coral' : ''}`}>{String(item.title)}</div>
        {item.artist && <div className="text-[9px] font-mono text-ink-soft truncate">{String(item.artist)}</div>}
      </div>
      <button
        onClick={togglePlaylistPicker}
        title="Save to a playlist"
        className="shrink-0 p-1 rounded-lg text-ink-soft/60 hover:text-teal-deep hover:bg-teal-2/20 transition-colors"
        aria-label="Save to playlist"
      >
        <ListPlus size={14} />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(id); }}
        className="shrink-0 p-1 rounded-lg text-ink-soft/60 hover:text-coral hover:bg-coral/10 transition-colors"
        aria-label="Remove from queue"
      >
        <X size={14} />
      </button>

      {isPickerOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full mt-1 z-30 w-56 bg-paper border-2 border-ink rounded-xl shadow-[3px_3px_0_var(--color-ink)] p-2 max-h-[200px] overflow-y-auto"
        >
          {isLoadingPlaylists ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 size={16} className="animate-spin text-ink-soft/50" />
            </div>
          ) : !playlists || playlists.length === 0 ? (
            <div className="text-[10px] font-mono text-ink-soft text-center py-3 px-2">
              No playlists yet — create one from the lobby.
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {playlists.map((playlist) => {
                const isSaved = savedPlaylistId === playlist.id;
                const isFull = playlist.song_count >= MAX_SONGS_PER_PLAYLIST;
                return (
                  <button
                    key={playlist.id}
                    onClick={(e) => handleSaveToPlaylist(e, playlist)}
                    disabled={savingPlaylistId === playlist.id || isFull}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-cream transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-mono font-bold truncate">{playlist.name}</div>
                      <div className="text-[9px] font-mono text-ink-soft">{isFull ? 'Full' : `${playlist.song_count}/${MAX_SONGS_PER_PLAYLIST} songs`}</div>
                    </div>
                    {savingPlaylistId === playlist.id ? (
                      <Loader2 size={12} className="animate-spin shrink-0" />
                    ) : isSaved ? (
                      <Check size={12} className="text-teal-deep shrink-0" strokeWidth={3} />
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
          {playlistError && (
            <div className="text-[9px] font-mono text-ink-soft text-center py-1.5 px-2 border-t border-ink/10 mt-1">{playlistError}</div>
          )}
        </div>
      )}
    </div>
  );
}

import { restrictToVerticalAxis, restrictToFirstScrollableAncestor } from '@dnd-kit/modifiers';

export function QueueList({
  queue,
  currentQueueId,
  isPlaying,
  onPlay,
  onRemove,
  onReorder,
}: {
  queue: QueueItem[];
  currentQueueId?: string | number;
  isPlaying?: boolean;
  onPlay: (id: string | number) => void;
  onRemove: (id: string | number) => void;
  onReorder: (orderedIds: (string | number)[]) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = queue.findIndex(item => item.id === active.id);
    const newIndex = queue.findIndex(item => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(queue, oldIndex, newIndex);
    onReorder(reordered.map(item => item.id as string | number));
  };

  return (
    <DndContext 
      sensors={sensors} 
      collisionDetection={closestCenter} 
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
    >
      <SortableContext items={queue.map(item => item.id as string | number)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-1.5 min-w-0 overflow-x-hidden">
          {queue.map((item, idx) => (
            <QueueRow
              key={(item.id ?? idx) as React.Key}
              item={item}
              idx={idx}
              isCurrent={item.id === currentQueueId}
              isPlaying={Boolean(isPlaying)}
              onPlay={onPlay}
              onRemove={onRemove}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
