'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { Search, Plus, Loader2, Music, X, Play, Pause, ListPlus, Check } from 'lucide-react';
import type { YouTubePlayerHandle } from '@/components/ui/YouTubePlayer';
import { listPlaylists, addSongToPlaylist } from '@/app/actions/playlists';
import { MAX_SONGS_PER_PLAYLIST, type Playlist } from '@/utils/playlists';

interface iTunesResult {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl100: string;
  previewUrl: string;
  trackTimeMillis: number;
}

interface SongSearchProps {
  onAddToQueue: (song: {
    videoId: string;
    title: string;
    artist: string;
    artwork: string;
    duration: number;
    tempId?: string;
  }) => Promise<void>;
  ytPlayerRef?: React.RefObject<YouTubePlayerHandle | null>;
  isRoomPlaying?: boolean;
  // Lets the parent know a private preview is active, so it can show that
  // clearly on the main Now Playing UI and disable the shared play/pause
  // control instead of letting it silently flip the real room state.
  onPreviewStateChange?: (isPreviewing: boolean) => void;
  // Shows a second "save to playlist" action per result, for using this
  // search from inside a room (as opposed to from the playlist editor
  // itself, where every add already IS a playlist save).
  enablePlaylistSave?: boolean;
  // If false, the results list will not have a fixed max-height or scrollbar,
  // allowing a parent scrolling container (like a Window) to handle it cleanly.
  scrollContainer?: boolean;
  // Fires synchronously the instant + is clicked, before the YouTube video-ID
  // lookup even starts, with everything the parent needs to render a
  // placeholder row right away (only the resolved videoId is missing yet).
  // `tempId` correlates this with the eventual onAddToQueue call so the
  // parent can swap the placeholder for the real row once it lands.
  onOptimisticAdd?: (song: { tempId: string; title: string; artist: string; artwork: string; duration: number }) => void;
  // Fires if the background lookup/add ends up failing, so the parent can
  // remove the placeholder it added via onOptimisticAdd.
  onOptimisticAddFailed?: (tempId: string) => void;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function SongSearch({
  onAddToQueue,
  ytPlayerRef,
  isRoomPlaying,
  onPreviewStateChange,
  enablePlaylistSave,
  scrollContainer = true,
  onOptimisticAdd,
  onOptimisticAddFailed,
}: SongSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<iTunesResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  // Tracks shown as "added" the instant + is clicked, before the YouTube
  // video-ID lookup + DB write (the actual slow part, a few seconds) even
  // finishes — nobody's about to hit play on a song they just searched for,
  // so there's no reason to make them stare at a spinner for it. Rolled back
  // only if the background work ends up failing.
  const [addedTrackIds, setAddedTrackIds] = useState<Set<number>>(new Set());
  const [previewingTrackId, setPreviewingTrackId] = useState<number | null>(null);
  // 0-1 progress through the current preview clip, driving the ring around
  // its artwork so it's unmistakably a private, time-limited preview rather
  // than the room's actual Now Playing.
  const [previewProgress, setPreviewProgress] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Monotonic counter for generating unique optimistic-add tempIds without
  // calling an impure global (Date.now/crypto.randomUUID) during render.
  const tempIdCounterRef = useRef(0);

  // "Save to playlist" popover state — which result's picker is open, the
  // user's playlists (lazy-loaded once on first open), and per-action
  // loading/feedback so the parent search UI doesn't need to know about any
  // of this.
  const [playlistPickerFor, setPlaylistPickerFor] = useState<number | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [savingPlaylistId, setSavingPlaylistId] = useState<string | null>(null);
  const [savedInto, setSavedInto] = useState<{ trackId: number; playlistId: string } | null>(null);
  const [playlistError, setPlaylistError] = useState('');
  // Avoids re-resolving the same track's YouTube video ID if it's already
  // been looked up (e.g. added to the queue, then also saved to a playlist).
  const resolvedVideoRef = useRef<Map<number, string>>(new Map());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRafRef = useRef<number | null>(null);
  const isRoomPlayingRef = useRef(isRoomPlaying);
  useEffect(() => { isRoomPlayingRef.current = isRoomPlaying; }, [isRoomPlaying]);

  const stopProgressLoop = useCallback(() => {
    if (progressRafRef.current !== null) {
      cancelAnimationFrame(progressRafRef.current);
      progressRafRef.current = null;
    }
    setPreviewProgress(0);
  }, []);

  const startProgressLoop = useCallback(() => {
    const tick = () => {
      const audio = audioRef.current;
      if (!audio || audio.paused) return;
      const duration = audio.duration || 30;
      setPreviewProgress(Math.min(1, audio.currentTime / duration));
      progressRafRef.current = requestAnimationFrame(tick);
    };
    progressRafRef.current = requestAnimationFrame(tick);
  }, []);

  const resumeRoomPlayback = useCallback(() => {
    try { ytPlayerRef?.current?.unMute(); } catch { /* ignore */ }
    if (isRoomPlayingRef.current) {
      try { ytPlayerRef?.current?.playVideo(); } catch { /* ignore */ }
    }
  }, [ytPlayerRef]);

  // Let the parent (main Now Playing UI, play/pause button) know whenever a
  // private preview starts or stops, so it isn't left showing/acting as if
  // the room's own song is playing while it's actually muted underneath.
  useEffect(() => {
    onPreviewStateChange?.(previewingTrackId !== null);
  }, [previewingTrackId, onPreviewStateChange]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      stopProgressLoop();
      onPreviewStateChange?.(false);
      if (audioRef.current) {
        const wasPreviewing = !audioRef.current.paused;
        audioRef.current.pause();
        audioRef.current = null;
        if (wasPreviewing) resumeRoomPlayback();
      }
    };
  }, [resumeRoomPlayback, stopProgressLoop, onPreviewStateChange]);

  const searchItunes = useCallback(async (term: string) => {
    if (!term.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setError('');

    try {
      const res = await fetch(`/api/itunes?q=${encodeURIComponent(term)}&limit=12`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setResults(data.results || []);
      setHasSearched(true);
    } catch {
      setError('Search failed. Please try again.');
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setIsFocused(true);
    setError(''); // Clear any stale error from a previous add/search attempt

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchItunes(value), 400);
  };

  const handlePreview = (track: iTunesResult) => {
    if (previewingTrackId === track.trackId) {
      // Stop preview
      audioRef.current?.pause();
      stopProgressLoop();
      setPreviewingTrackId(null);
      resumeRoomPlayback();
      return;
    }

    // Pause AND mute the room's playback locally so the preview clip and the
    // room's song can never be heard together. Muting is the real guarantee
    // here — pauseVideo() is sent to the YouTube iframe asynchronously (it's
    // cross-origin postMessage) so there can be a brief window where it's
    // still audibly playing; mute() takes effect immediately.
    try { ytPlayerRef?.current?.mute(); } catch { /* ignore */ }
    try { ytPlayerRef?.current?.pauseVideo(); } catch { /* ignore */ }

    // Play preview
    if (audioRef.current) {
      audioRef.current.pause();
    }
    stopProgressLoop();
    const audio = new Audio(track.previewUrl);
    audio.volume = 0.5;
    audio.play();
    audio.addEventListener('playing', startProgressLoop, { once: true });
    audio.onended = () => {
      stopProgressLoop();
      setPreviewingTrackId(null);
      resumeRoomPlayback();
    };
    audioRef.current = audio;
    setPreviewingTrackId(track.trackId);
  };

  const resolveVideoId = async (track: iTunesResult): Promise<string> => {
    const cached = resolvedVideoRef.current.get(track.trackId);
    if (cached) return cached;

    const queryCandidates = [
      `${track.artistName} ${track.trackName}`,
      track.trackName,
    ].filter((q, i, arr) => q.trim() && arr.indexOf(q) === i);

    let topResult: { videoId: string } | null = null;
    for (const searchQuery of queryCandidates) {
      const ytRes = await fetch(`/api/youtube-search?q=${encodeURIComponent(searchQuery)}`);
      if (!ytRes.ok) continue;
      const ytData = await ytRes.json();
      if (ytData.results?.length > 0) {
        topResult = ytData.results[0];
        break;
      }
    }

    if (!topResult) throw new Error('Could not find matching video');
    resolvedVideoRef.current.set(track.trackId, topResult.videoId);
    return topResult.videoId;
  };

  const handleAdd = (track: iTunesResult) => {
    if (addedTrackIds.has(track.trackId)) return;

    // Flip to "added" immediately — the lookup + write below happen in the
    // background. Only undo it if that background work actually fails.
    setAddedTrackIds(prev => new Set(prev).add(track.trackId));
    setError('');

    const tempId = `temp-${track.trackId}-${tempIdCounterRef.current++}`;
    onOptimisticAdd?.({
      tempId,
      title: track.trackName,
      artist: track.artistName,
      artwork: track.artworkUrl100,
      duration: track.trackTimeMillis,
    });

    (async () => {
      try {
        const videoId = await resolveVideoId(track);
        await onAddToQueue({
          videoId,
          title: track.trackName,
          artist: track.artistName,
          artwork: track.artworkUrl100,
          duration: track.trackTimeMillis,
          tempId,
        });
      } catch (err: unknown) {
        setAddedTrackIds(prev => {
          const next = new Set(prev);
          next.delete(track.trackId);
          return next;
        });
        setError((err as Error)?.message || 'Failed to add song');
        onOptimisticAddFailed?.(tempId);
      }
    })();
  };

  const togglePlaylistPicker = (track: iTunesResult) => {
    setPlaylistError('');
    if (playlistPickerFor === track.trackId) {
      setPlaylistPickerFor(null);
      return;
    }
    setPlaylistPickerFor(track.trackId);
    if (playlists === null) {
      setIsLoadingPlaylists(true);
      listPlaylists().then((res) => {
        if (res.error) setPlaylistError(res.error);
        setPlaylists(res.playlists);
        setIsLoadingPlaylists(false);
      });
    }
  };

  const handleSaveToPlaylist = async (track: iTunesResult, playlist: Playlist) => {
    setSavingPlaylistId(playlist.id);
    setPlaylistError('');
    try {
      const videoId = await resolveVideoId(track);
      const res = await addSongToPlaylist(playlist.id, {
        videoId,
        title: track.trackName,
        artist: track.artistName,
        artwork: track.artworkUrl100,
        duration: track.trackTimeMillis,
      });
      if (res.error) {
        setPlaylistError(res.error);
        return;
      }
      setPlaylists((prev) => prev?.map((p) => p.id === playlist.id ? { ...p, song_count: p.song_count + 1 } : p) ?? prev);
      setSavedInto({ trackId: track.trackId, playlistId: playlist.id });
      setTimeout(() => setPlaylistPickerFor(null), 800);
    } catch (err: unknown) {
      setPlaylistError((err as Error)?.message || 'Failed to save song');
    } finally {
      setSavingPlaylistId(null);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-3 w-full">
      {/* Search Input */}
      <div className="relative shrink-0">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft/60"
        />
        <input
          type="text"
          placeholder="Search for a song..."
          value={query}
          onChange={handleInputChange}
          className="w-full bg-paper border-[2px] border-ink rounded-xl pl-9 pr-8 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-2 shadow-[inset_2px_2px_0_rgba(0,0,0,0.05)] transition-shadow"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setResults([]);
              setHasSearched(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-ink/10 flex items-center justify-center hover:bg-ink/20 transition-colors"
          >
            <X size={10} />
          </button>
        )}
      </div>

      {/* Search Results */}
      {(query.trim() || hasSearched || isSearching) && (
        <div className={`flex flex-col gap-2 ${scrollContainer ? 'flex-1 min-h-0 overflow-y-auto pr-2 song-search-scroll' : ''}`}>
          {/* Error */}
          {error && (
            <div className="bg-pink/60 border-[1.5px] border-ink rounded-lg px-3 py-2 text-[10px] font-mono text-ink text-center">
              {error}
            </div>
          )}

          {/* Loading */}
          {isSearching && (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={18} className="animate-spin text-ink-soft/50" />
            </div>
          )}

          {/* Results */}
          {!isSearching && results.length > 0 && (
            <>
              <div className="text-[9px] font-mono text-ink-soft/60 px-1 -mb-1">
                Tap artwork to preview privately (only you) · tap + to add
              </div>
              <div className="flex flex-col gap-1.5 min-w-0 pb-1">
                {results.map((track) => {
                  const isPreviewing = previewingTrackId === track.trackId;
                  return (
                    <div
                      key={track.trackId}
                      className={`relative flex items-center gap-2.5 border-[1.5px] rounded-xl p-2 transition-all group min-w-0 max-w-full ${isPreviewing ? 'bg-coral/10 border-coral' : 'bg-cream/60 border-ink/70 hover:bg-cream hover:border-ink'}`}
                    >
                      {/* Artwork + Preview */}
                      <button
                        onClick={() => handlePreview(track)}
                        title={isPreviewing ? 'Stop preview' : 'Preview 30s clip (only you can hear this)'}
                        className="relative w-9 h-9 shrink-0 group/art"
                      >
                        <div className="absolute inset-0 rounded-lg overflow-hidden border-[1.5px] border-ink/50">
                          <Image
                            src={track.artworkUrl100}
                            alt={track.trackName}
                            width={36}
                            height={36}
                            unoptimized
                            className="w-full h-full object-cover"
                          />
                          <div className={`absolute inset-0 flex items-center justify-center transition-all ${isPreviewing ? 'bg-ink/50' : 'bg-ink/0 group-hover/art:bg-ink/40'}`}>
                            {isPreviewing ? (
                              <Pause size={12} className="text-paper fill-current" />
                            ) : (
                              <Play size={12} className="text-paper opacity-0 group-hover/art:opacity-100 fill-current ml-0.5" />
                            )}
                          </div>
                        </div>
                        {isPreviewing && (
                          <svg viewBox="0 0 36 36" className="absolute -inset-1 w-[calc(100%+8px)] h-[calc(100%+8px)] -rotate-90 pointer-events-none">
                            <circle cx="18" cy="18" r="16.5" fill="none" stroke="var(--color-ink)" strokeOpacity="0.12" strokeWidth="2.5" />
                            <circle
                              cx="18" cy="18" r="16.5" fill="none" stroke="var(--color-coral)" strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeDasharray={2 * Math.PI * 16.5}
                              strokeDashoffset={2 * Math.PI * 16.5 * (1 - previewProgress)}
                              style={{ transition: 'stroke-dashoffset 100ms linear' }}
                            />
                          </svg>
                        )}
                      </button>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-mono font-bold truncate leading-tight">
                          {track.trackName}
                        </div>
                        {isPreviewing ? (
                          <div className="text-[9px] font-mono text-coral font-bold truncate leading-tight mt-0.5 animate-pulse">
                            Previewing privately…
                          </div>
                        ) : (
                          <div className="text-[9px] font-mono text-ink-soft truncate leading-tight mt-0.5">
                            {track.artistName} · {formatDuration(track.trackTimeMillis)}
                          </div>
                        )}
                      </div>

                      {/* Save to Playlist */}
                      {enablePlaylistSave && (
                        <button
                          onClick={() => togglePlaylistPicker(track)}
                          title="Save to a playlist"
                          className="w-7 h-7 rounded-lg border-[1.5px] border-ink bg-paper flex items-center justify-center shadow-[2px_2px_0_var(--color-ink)] hover:translate-y-px hover:shadow-[1px_1px_0_var(--color-ink)] transition-all shrink-0"
                        >
                          <ListPlus size={13} />
                        </button>
                      )}

                      {/* Add Button */}
                      <button
                        onClick={() => handleAdd(track)}
                        disabled={addedTrackIds.has(track.trackId)}
                        title={addedTrackIds.has(track.trackId) ? 'Added' : undefined}
                        className={`w-7 h-7 rounded-lg border-[1.5px] border-ink flex items-center justify-center transition-all shrink-0 bg-teal-2 ${addedTrackIds.has(track.trackId) ? 'cursor-default' : 'shadow-[2px_2px_0_var(--color-ink)] hover:translate-y-px hover:shadow-[1px_1px_0_var(--color-ink)]'}`}
                      >
                        {addedTrackIds.has(track.trackId) ? (
                          <Check size={14} strokeWidth={3} />
                        ) : (
                          <Plus size={14} strokeWidth={3} />
                        )}
                      </button>

                      {/* Playlist picker popover */}
                      {enablePlaylistSave && playlistPickerFor === track.trackId && (
                        <div className="absolute right-0 top-full mt-1 z-30 w-56 bg-paper border-2 border-ink rounded-xl shadow-[3px_3px_0_var(--color-ink)] p-2 max-h-[200px] overflow-y-auto">
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
                                const isSaved = savedInto?.trackId === track.trackId && savedInto?.playlistId === playlist.id;
                                const isFull = playlist.song_count >= MAX_SONGS_PER_PLAYLIST;
                                return (
                                  <button
                                    key={playlist.id}
                                    onClick={() => handleSaveToPlaylist(track, playlist)}
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
                })}
              </div>
            </>
          )}

          {/* Empty State */}
          {!isSearching && hasSearched && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-6 text-xs font-mono text-ink-soft/60 gap-1">
              <Music size={20} className="opacity-40" />
              <span>No results found</span>
            </div>
          )}
        </div>
      )}
      
      {/* Initial State */}
      {!isSearching && !hasSearched && results.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center py-10 text-[10px] font-mono text-ink-soft/50 gap-2 border-[1.5px] border-dashed border-ink/20 rounded-xl">
          <Music size={24} className="opacity-30" />
          <span>Search any song to add it</span>
        </div>
      )}
    </div>
  );
}
