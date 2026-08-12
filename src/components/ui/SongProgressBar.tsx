'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { YouTubePlayerHandle } from '@/components/ui/YouTubePlayer';

interface SongProgressBarProps {
  ytPlayerRef: React.RefObject<YouTubePlayerHandle | null>;
  isPlaying: boolean;
  isHost: boolean;
  compact?: boolean;
}

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function SongProgressBar({ ytPlayerRef, isPlaying, isHost, compact = false }: SongProgressBarProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekTime, setSeekTime] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollProgress = useCallback(() => {
    if (isSeeking) return;
    try {
      const player = ytPlayerRef.current;
      if (!player) return;

      const t = player.getCurrentTime?.() || 0;
      const d = player.getDuration?.() || 0;

      if (d > 0) {
        setCurrentTime(t);
        setDuration(d);
      }
    } catch {
      // player not ready
    }
  }, [ytPlayerRef, isSeeking]);

  useEffect(() => {
    // Poll every 500ms when playing, every 1500ms when paused
    const rate = isPlaying ? 500 : 1500;
    intervalRef.current = setInterval(pollProgress, rate);
    // Initial poll
    pollProgress();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pollProgress, isPlaying]);

  const handleSeek = useCallback((clientX: number) => {
    if (!barRef.current || duration <= 0) return;
    const rect = barRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newTime = ratio * duration;
    setSeekTime(newTime);
    return newTime;
  }, [duration]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isHost) return;
    setIsSeeking(true);
    handleSeek(e.clientX);
  }, [isHost, handleSeek]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isSeeking) return;
    handleSeek(e.clientX);
  }, [isSeeking, handleSeek]);

  const handleMouseUp = useCallback(() => {
    if (!isSeeking) return;
    setIsSeeking(false);
    try {
      ytPlayerRef.current?.seekTo?.(seekTime);
      setCurrentTime(seekTime);
    } catch {
      // ignore
    }
  }, [isSeeking, seekTime, ytPlayerRef]);

  useEffect(() => {
    if (isSeeking) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isSeeking, handleMouseMove, handleMouseUp]);

  const progress = duration > 0 ? ((isSeeking ? seekTime : currentTime) / duration) * 100 : 0;

  if (duration <= 0) return null;

  if (compact) {
    return (
      <div className="w-full h-1 bg-ink/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-coral to-teal-3 rounded-full transition-[width] duration-500 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 w-full select-none">
      {/* Elapsed time */}
      <span className="text-[10px] font-mono font-bold text-ink-soft/80 tabular-nums w-[36px] text-right shrink-0">
        {formatTime(isSeeking ? seekTime : currentTime)}
      </span>

      {/* Progress bar */}
      <div
        ref={barRef}
        className={`relative flex-1 h-[6px] bg-ink/10 rounded-full overflow-hidden group ${isHost ? 'cursor-pointer' : 'cursor-default'}`}
        onMouseDown={handleMouseDown}
      >
        {/* Track fill */}
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-coral via-coral-deep to-teal-3 rounded-full"
          style={{
            width: `${progress}%`,
            transition: isSeeking ? 'none' : 'width 0.5s linear',
          }}
        />

        {/* Scrubber handle (host only) */}
        {isHost && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-paper border-[2px] border-ink shadow-[1px_1px_0_var(--color-ink)] opacity-0 group-hover:opacity-100 transition-opacity"
            style={{
              left: `calc(${progress}% - 6px)`,
              transition: isSeeking ? 'none' : 'left 0.5s linear',
            }}
          />
        )}

        {/* Animated glow at the progress point */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-paper shadow-[0_0_6px_rgba(239,169,143,0.8)]"
          style={{
            left: `calc(${progress}% - 3px)`,
            transition: isSeeking ? 'none' : 'left 0.5s linear',
          }}
        />
      </div>

      {/* Total duration */}
      <span className="text-[10px] font-mono font-bold text-ink-soft/80 tabular-nums w-[36px] shrink-0">
        {formatTime(duration)}
      </span>
    </div>
  );
}
