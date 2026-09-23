'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { YouTubePlayerHandle } from '@/components/ui/YouTubePlayer';

interface SongProgressBarProps {
  ytPlayerRef: React.RefObject<YouTubePlayerHandle | null>;
  isPlaying: boolean;
  compact?: boolean;
  /** Called when the user finishes seeking — broadcasts the new position to room */
  onSeek?: (seekTimeSeconds: number) => void;
}

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function SongProgressBar({ ytPlayerRef, isPlaying, compact = false, onSeek }: SongProgressBarProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekTime, setSeekTime] = useState(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tracks the time we just seeked to, so we can ignore stale getCurrentTime()
  // reports from the YouTube iframe while it is buffering the new position.
  const lastSeekTargetRef = useRef<number | null>(null);
  const justSeekedAtRef = useRef(0);

  const pollProgress = useCallback(() => {
    if (isSeeking) return;
    try {
      const player = ytPlayerRef.current;
      if (!player) return;

      const t = player.getCurrentTime?.() || 0;
      const d = player.getDuration?.() || 0;

      if (d > 0) {
        if (lastSeekTargetRef.current !== null) {
          const timeSinceSeek = Date.now() - justSeekedAtRef.current;
          const dist = Math.abs(t - lastSeekTargetRef.current);
          // If the player's reported time is still more than 3 seconds away from our
          // target, and we seeked less than 4 seconds ago, it's likely still buffering
          // the seek (or hasn't processed it yet). Ignore the stale time so the scrubber
          // doesn't flash back to the pre-seek position.
          if (dist > 3 && timeSinceSeek < 4000) {
            return;
          } else {
            // It caught up to the seek (or we timed out waiting)
            lastSeekTargetRef.current = null;
          }
        }

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

  const handlePointerMoveLocal = useCallback((e: React.PointerEvent) => {
    if (isSeeking || duration <= 0 || !barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverTime(ratio * duration);
  }, [duration, isSeeking]);

  const handlePointerLeaveLocal = useCallback(() => {
    setHoverTime(null);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsSeeking(true);
    setHoverTime(null);
    handleSeek(e.clientX);
  }, [handleSeek]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsSeeking(true);
    setHoverTime(null);
    handleSeek(e.touches[0].clientX);
  }, [handleSeek]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isSeeking) return;
    handleSeek(e.clientX);
  }, [isSeeking, handleSeek]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isSeeking) return;
    handleSeek(e.touches[0].clientX);
  }, [isSeeking, handleSeek]);

  const handleSeekEnd = useCallback(() => {
    if (!isSeeking) return;
    setIsSeeking(false);
    try {
      justSeekedAtRef.current = Date.now();
      lastSeekTargetRef.current = seekTime;
      ytPlayerRef.current?.seekTo?.(seekTime);
      setCurrentTime(seekTime);
      // Broadcast the seek to other room participants
      onSeek?.(seekTime);
    } catch {
      // ignore
    }
  }, [isSeeking, seekTime, ytPlayerRef, onSeek]);

  useEffect(() => {
    if (isSeeking) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleSeekEnd);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleSeekEnd);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleSeekEnd);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleSeekEnd);
      };
    }
  }, [isSeeking, handleMouseMove, handleTouchMove, handleSeekEnd]);

  const progress = duration > 0 ? ((isSeeking ? seekTime : currentTime) / duration) * 100 : 0;
  const hasDuration = duration > 0;

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
        {hasDuration ? formatTime(isSeeking ? seekTime : currentTime) : '0:00'}
      </span>

      {/* Progress bar */}
      <div
        ref={barRef}
        className={`relative flex-1 h-[6px] bg-ink/10 rounded-full overflow-visible group touch-none ${hasDuration ? 'cursor-pointer' : 'cursor-default opacity-60'}`}
        onMouseDown={hasDuration ? handleMouseDown : undefined}
        onTouchStart={hasDuration ? handleTouchStart : undefined}
        onPointerMove={hasDuration ? handlePointerMoveLocal : undefined}
        onPointerLeave={hasDuration ? handlePointerLeaveLocal : undefined}
      >
        {/* Track fill */}
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-coral via-coral-deep to-teal-3 rounded-full"
          style={{
            width: `${progress}%`,
            transition: isSeeking ? 'none' : 'width 0.5s linear',
          }}
        />

        {/* Scrubber handle */}
        {hasDuration && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-paper border-[2px] border-ink shadow-[1px_1px_0_var(--color-ink)] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
            style={{
              left: `calc(${progress}% - 6px)`,
              transition: isSeeking ? 'none' : 'left 0.5s linear',
            }}
          />
        )}

        {/* Animated glow at the progress point */}
        {hasDuration && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-paper shadow-[0_0_6px_rgba(239,169,143,0.8)]"
            style={{
              left: `calc(${progress}% - 3px)`,
              transition: isSeeking ? 'none' : 'left 0.5s linear',
            }}
          />
        )}

        {/* Live timestamp bubble — follows the drag position so you can see
            exactly where you're about to seek to, instead of only finding
            out after releasing. */}
        {isSeeking && (
          <div
            className="absolute bottom-full mb-2.5 -translate-x-1/2 px-2 py-1 rounded-md border-2 border-ink bg-ink text-paper text-[10px] font-mono font-bold tabular-nums shadow-[2px_2px_0_var(--color-coral)] pointer-events-none whitespace-nowrap"
            style={{ left: `${progress}%` }}
          >
            {formatTime(seekTime)}
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-[4px] border-x-transparent border-t-[5px] border-t-ink" />
          </div>
        )}

        {/* Hover timestamp bubble — follows the mouse position so you can see
            exactly where you're about to seek to before clicking. */}
        {!isSeeking && hoverTime !== null && (
          <div
            className="absolute bottom-full mb-2.5 -translate-x-1/2 px-2 py-1 rounded-md border-2 border-ink bg-ink text-paper text-[10px] font-mono font-bold tabular-nums shadow-[2px_2px_0_var(--color-coral)] pointer-events-none whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `${(hoverTime / duration) * 100}%` }}
          >
            {formatTime(hoverTime)}
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-[4px] border-x-transparent border-t-[5px] border-t-ink" />
          </div>
        )}
      </div>

      {/* Total duration */}
      <span className="text-[10px] font-mono font-bold text-ink-soft/80 tabular-nums w-[36px] shrink-0">
        {hasDuration ? formatTime(duration) : '0:00'}
      </span>
    </div>
  );
}
