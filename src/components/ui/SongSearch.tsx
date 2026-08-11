'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { Search, Plus, Loader2, Music, X, Play, Pause } from 'lucide-react';

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
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function SongSearch({ onAddToQueue }: SongSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<iTunesResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addingTrackId, setAddingTrackId] = useState<number | null>(null);
  const [previewingTrackId, setPreviewingTrackId] = useState<number | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

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

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchItunes(value), 400);
  };

  const handlePreview = (track: iTunesResult) => {
    if (previewingTrackId === track.trackId) {
      // Stop preview
      audioRef.current?.pause();
      setPreviewingTrackId(null);
      return;
    }

    // Play preview
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(track.previewUrl);
    audio.volume = 0.5;
    audio.play();
    audio.onended = () => setPreviewingTrackId(null);
    audioRef.current = audio;
    setPreviewingTrackId(track.trackId);
  };

  const handleAdd = async (track: iTunesResult) => {
    setAddingTrackId(track.trackId);
    setError('');

    try {
      // Search YouTube for matching video
      const searchQuery = `${track.artistName} ${track.trackName}`;
      const ytRes = await fetch(`/api/youtube-search?q=${encodeURIComponent(searchQuery)}`);

      if (!ytRes.ok) {
        throw new Error('Could not find matching video');
      }

      const ytData = await ytRes.json();
      if (!ytData.results || ytData.results.length === 0) {
        throw new Error('No YouTube video found for this song');
      }

      const topResult = ytData.results[0];

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
        <div className="flex flex-col gap-1.5 max-h-[320px] overflow-y-auto pr-1 song-search-scroll">
          {results.map((track) => (
            <div
              key={track.trackId}
              className="flex items-center gap-2.5 bg-cream/60 border-[1.5px] border-ink/70 rounded-xl p-2 hover:bg-cream hover:border-ink transition-all group"
            >
              {/* Artwork + Preview */}
              <button
                onClick={() => handlePreview(track)}
                className="relative w-10 h-10 rounded-lg overflow-hidden border-[1.5px] border-ink/50 shrink-0 group/art"
              >
                <Image
                  src={track.artworkUrl100}
                  alt={track.trackName}
                  width={40}
                  height={40}
                  unoptimized
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-ink/0 group-hover/art:bg-ink/40 flex items-center justify-center transition-all">
                  {previewingTrackId === track.trackId ? (
                    <Pause size={14} className="text-paper opacity-0 group-hover/art:opacity-100 fill-current" />
                  ) : (
                    <Play size={14} className="text-paper opacity-0 group-hover/art:opacity-100 fill-current ml-0.5" />
                  )}
                </div>
                {previewingTrackId === track.trackId && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-coral animate-pulse" />
                )}
              </button>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-mono font-bold truncate leading-tight">
                  {track.trackName}
                </div>
                <div className="text-[9px] font-mono text-ink-soft truncate leading-tight mt-0.5">
                  {track.artistName} · {formatDuration(track.trackTimeMillis)}
                </div>
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
          ))}
        </div>
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
