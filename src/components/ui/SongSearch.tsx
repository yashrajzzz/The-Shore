'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { Search, Plus, Loader2, Music, X, Play, Pause } from 'lucide-react';
import type { YouTubePlayerHandle } from '@/components/ui/YouTubePlayer';

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
  }) => Promise<void>;
  ytPlayerRef?: React.RefObject<YouTubePlayerHandle | null>;
  isRoomPlaying?: boolean;
  // Lets the parent know a private preview is active, so it can show that
  // clearly on the main Now Playing UI and disable the shared play/pause
  // control instead of letting it silently flip the real room state.
  onPreviewStateChange?: (isPreviewing: boolean) => void;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function SongSearch({ onAddToQueue, ytPlayerRef, isRoomPlaying, onPreviewStateChange }: SongSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<iTunesResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addingTrackId, setAddingTrackId] = useState<number | null>(null);
  const [previewingTrackId, setPreviewingTrackId] = useState<number | null>(null);
  // 0-1 progress through the current preview clip, driving the ring around
  // its artwork so it's unmistakably a private, time-limited preview rather
  // than the room's actual Now Playing.
  const [previewProgress, setPreviewProgress] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
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

  const handleAdd = async (track: iTunesResult) => {
    setAddingTrackId(track.trackId);
    setError('');

    try {
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

      if (!topResult) {
        throw new Error('Could not find matching video');
      }

      await onAddToQueue({
        videoId: topResult.videoId,
        title: track.trackName,
        artist: track.artistName,
        artwork: track.artworkUrl100,
        duration: track.trackTimeMillis,
      });
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to add song');
    } finally {
      setAddingTrackId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Search Input */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft/60"
        />
        <input
          type="text"
          placeholder="Search for a song..."
          value={query}
          onChange={handleInputChange}
          className="w-full bg-paper border-2 border-ink rounded-xl pl-9 pr-8 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-teal-2 shadow-[inset_2px_2px_0_rgba(0,0,0,0.05)]"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setResults([]);
              setHasSearched(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-ink/10 flex items-center justify-center hover:bg-ink/20"
          >
            <X size={10} />
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-pink/60 border-[1.5px] border-ink rounded-lg px-3 py-2 text-[10px] font-mono text-ink text-center">
          {error}
        </div>
      )}

      {/* Loading */}
      {isSearching && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-ink-soft/50" />
        </div>
      )}

      {/* Results */}
      {!isSearching && results.length > 0 && (
        <>
          <div className="text-[9px] font-mono text-ink-soft/60 px-0.5 -mb-1">
            Tap artwork to preview privately (only you) · tap + to add to the room
          </div>
          <div className="flex flex-col gap-1.5 max-h-[320px] min-w-0 overflow-y-auto overflow-x-hidden pr-1 song-search-scroll">
          {results.map((track) => {
            const isPreviewing = previewingTrackId === track.trackId;
            return (
            <div
              key={track.trackId}
              className={`flex items-center gap-2.5 border-[1.5px] rounded-xl p-2 transition-all group min-w-0 max-w-full ${isPreviewing ? 'bg-coral/10 border-coral' : 'bg-cream/60 border-ink/70 hover:bg-cream hover:border-ink'}`}
            >
              {/* Artwork + Preview */}
              <button
                onClick={() => handlePreview(track)}
                title={isPreviewing ? 'Stop preview' : 'Preview 30s clip (only you can hear this)'}
                className="relative w-10 h-10 shrink-0 group/art"
              >
                <div className="absolute inset-0 rounded-lg overflow-hidden border-[1.5px] border-ink/50">
                  <Image
                    src={track.artworkUrl100}
                    alt={track.trackName}
                    width={40}
                    height={40}
                    unoptimized
                    className="w-full h-full object-cover"
                  />
                  <div className={`absolute inset-0 flex items-center justify-center transition-all ${isPreviewing ? 'bg-ink/50' : 'bg-ink/0 group-hover/art:bg-ink/40'}`}>
                    {isPreviewing ? (
                      <Pause size={14} className="text-paper fill-current" />
                    ) : (
                      <Play size={14} className="text-paper opacity-0 group-hover/art:opacity-100 fill-current ml-0.5" />
                    )}
                  </div>
                </div>
                {/* Ring fills over the 30s clip so it reads as a running preview timer, not the room's Now Playing */}
                {isPreviewing && (
                  <svg viewBox="0 0 40 40" className="absolute -inset-1 w-[calc(100%+8px)] h-[calc(100%+8px)] -rotate-90 pointer-events-none">
                    <circle cx="20" cy="20" r="18.5" fill="none" stroke="var(--color-ink)" strokeOpacity="0.12" strokeWidth="2.5" />
                    <circle
                      cx="20" cy="20" r="18.5" fill="none" stroke="var(--color-coral)" strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 18.5}
                      strokeDashoffset={2 * Math.PI * 18.5 * (1 - previewProgress)}
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
                    Previewing privately… (won&apos;t play in room)
                  </div>
                ) : (
                  <div className="text-[9px] font-mono text-ink-soft truncate leading-tight mt-0.5">
                    {track.artistName} · {formatDuration(track.trackTimeMillis)}
                  </div>
                )}
              </div>

              {/* Add Button */}
              <button
                onClick={() => handleAdd(track)}
                disabled={addingTrackId === track.trackId}
                className="w-7 h-7 rounded-lg border-[1.5px] border-ink bg-teal-2 flex items-center justify-center shadow-[2px_2px_0_var(--color-ink)] hover:translate-y-px hover:shadow-[1px_1px_0_var(--color-ink)] transition-all disabled:opacity-50 disabled:cursor-wait shrink-0"
              >
                {addingTrackId === track.trackId ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Plus size={14} strokeWidth={3} />
                )}
              </button>
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

      {/* Initial State */}
      {!isSearching && !hasSearched && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 text-[10px] font-mono text-ink-soft/50 gap-1.5">
          <Music size={24} className="opacity-30" />
          <span>Search any song to add it</span>
        </div>
      )}
    </div>
  );
}
