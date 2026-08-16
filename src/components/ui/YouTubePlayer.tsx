'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useImperativeHandle, forwardRef, useState, useCallback } from 'react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
    __ytApiLoaded?: boolean;
    __ytApiLoading?: boolean;
    __ytApiCallbacks?: (() => void)[];
  }
}

export interface YouTubePlayerHandle {
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  unMute: () => void;
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  resync: () => void;
}

interface YouTubePlayerProps {
  videoId: string | null;
  playing: boolean;
  onReady?: () => void;
  onEnd?: () => void;
  onStateChange?: (state: number) => void;
  onSyncReady?: (player: YouTubePlayerHandle) => void;
  startedAt?: string | null; // ISO timestamp for sync
}

function loadYTApi(): Promise<void> {
  return new Promise((resolve) => {
    if (window.__ytApiLoaded && window.YT?.Player) {
      resolve();
      return;
    }

    if (!window.__ytApiCallbacks) {
      window.__ytApiCallbacks = [];
    }
    window.__ytApiCallbacks.push(resolve);

    if (window.__ytApiLoading) return;
    window.__ytApiLoading = true;

    window.onYouTubeIframeAPIReady = () => {
      window.__ytApiLoaded = true;
      window.__ytApiLoading = false;
      const callbacks = window.__ytApiCallbacks || [];
      window.__ytApiCallbacks = [];
      callbacks.forEach((cb) => cb());
    };

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScript = document.getElementsByTagName('script')[0];
    firstScript.parentNode?.insertBefore(tag, firstScript);
  });
}

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  function YouTubePlayer({ videoId, playing, onReady, onEnd, onStateChange, onSyncReady, startedAt }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<any>(null);
    const currentVideoIdRef = useRef<string | null>(null);
    const [isApiReady, setIsApiReady] = useState(false);
    const playingRef = useRef(playing);
    useEffect(() => { playingRef.current = playing; }, [playing]);
    // Guards against seekTo() being ignored when called too early (before the
    // player has actually started buffering) — see performSync below.
    const hasSyncedPlaybackRef = useRef(false);

    // Expose imperative handle
    useImperativeHandle(ref, () => ({
      playVideo: () => playerRef.current?.playVideo?.(),
      pauseVideo: () => playerRef.current?.pauseVideo?.(),
      mute: () => playerRef.current?.mute?.(),
      unMute: () => playerRef.current?.unMute?.(),
      seekTo: (seconds: number) => playerRef.current?.seekTo?.(seconds, true),
      getCurrentTime: () => playerRef.current?.getCurrentTime?.() || 0,
      getDuration: () => playerRef.current?.getDuration?.() || 0,
      getPlayerState: () => playerRef.current?.getPlayerState?.() ?? -1,
      resync: () => performSync(),
    }));

    // Load YouTube IFrame API
    useEffect(() => {
      loadYTApi().then(() => setIsApiReady(true));
    }, []);

    // Sync seek for late-joiners
    const performSync = useCallback(() => {
      if (!startedAt || !playerRef.current) return;

      const startTime = new Date(startedAt).getTime();
      const now = Date.now();
      const diffSeconds = (now - startTime) / 1000;

      if (diffSeconds > 0 && diffSeconds < 7200) {
        // Only sync if within 2 hours and player supports seekTo
        if (typeof playerRef.current?.seekTo === 'function') {
          playerRef.current.seekTo(diffSeconds, true);
          // YouTube's seekTo() unconditionally resumes playback even if the
          // video was paused, so re-assert the intended state right after.
          if (!playingRef.current) playerRef.current?.pauseVideo?.();
        }
      }
    }, [startedAt]);

    // The onReady/onStateChange handlers below are bound once, when the
    // YT.Player is first constructed, and are reused for every subsequent
    // track via loadVideoById(). Without this ref, they'd keep calling the
    // performSync closure captured at creation time — permanently bound to
    // the very first song's startedAt — instead of the current track's.
    const performSyncRef = useRef(performSync);
    useEffect(() => { performSyncRef.current = performSync; }, [performSync]);

    // Create/update player when API is ready and videoId changes
    useEffect(() => {
      if (!isApiReady || !containerRef.current) return;

      if (!videoId) {
        // No video to play - destroy player if exists
        if (playerRef.current) {
          playerRef.current.destroy();
          playerRef.current = null;
          currentVideoIdRef.current = null;
        }
        return;
      }

      if (playerRef.current && currentVideoIdRef.current === videoId) {
        // Same video, just toggle play/pause
        return;
      }
 
      // Different video or first load - create or load new video
      if (playerRef.current) {
        currentVideoIdRef.current = videoId;
        hasSyncedPlaybackRef.current = false;
        playerRef.current.loadVideoById(videoId);
        // If the room is currently playing, ensure the loaded video starts
        try {
          if (playing) {
            playerRef.current.playVideo();
          }
        } catch {
          // ignore if player not ready
        }
        return;
      }

      // Create new player
      // Need a fresh div for YT.Player
      const playerDiv = document.createElement('div');
      playerDiv.id = 'yt-player-' + Date.now();
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(playerDiv);

      currentVideoIdRef.current = videoId;
      hasSyncedPlaybackRef.current = false;

      playerRef.current = new window.YT.Player(playerDiv.id, {
        height: '1',
        width: '1',
        videoId: videoId,
        playerVars: {
          autoplay: playing ? 1 : 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: any) => {
            // Best-effort sync position for late-joiners. YouTube can silently
            // ignore seekTo() called this early (before any buffering has
            // happened), so this is backed up by the onStateChange handler below.
            performSyncRef.current();

            if (playing) {
              event.target.playVideo();
            }

            const handle: YouTubePlayerHandle = {
              playVideo: () => event.target.playVideo(),
              pauseVideo: () => event.target.pauseVideo(),
              mute: () => event.target.mute(),
              unMute: () => event.target.unMute(),
              seekTo: (s: number) => event.target.seekTo(s, true),
              getCurrentTime: () => event.target.getCurrentTime() || 0,
              getDuration: () => event.target.getDuration() || 0,
              getPlayerState: () => event.target.getPlayerState() ?? -1,
              resync: () => performSyncRef.current(),
            };
            onSyncReady?.(handle);
            onReady?.();
          },
          onStateChange: (event: any) => {
            onStateChange?.(event.data);

            // First time this video actually starts playing (e.g. once a
            // late-joiner's browser allows playback, or after an autoplay
            // block is cleared by the "enable audio" gesture), re-run the
            // sync — seekTo() reliably takes effect once playback has begun.
            if (event.data === 1 && !hasSyncedPlaybackRef.current) {
              hasSyncedPlaybackRef.current = true;
              performSyncRef.current();
            }

            // YT.PlayerState.ENDED === 0
            if (event.data === 0) {
              onEnd?.();
            }
          },
          onError: (event: any) => {
            console.error('YouTube Player Error:', event.data);
          },
        },
      });
    }, [isApiReady, videoId, playing, onReady, onEnd, onStateChange, onSyncReady, performSync]);

    // Handle play/pause changes
    useEffect(() => {
      if (!playerRef.current || !currentVideoIdRef.current) return;

      try {
        const state = playerRef.current.getPlayerState?.();
        if (state === undefined || state === null) return;

        if (playing && state !== 1) {
          playerRef.current.playVideo();
        } else if (!playing && state === 1) {
          playerRef.current.pauseVideo();
        }
      } catch {
        // Player might not be ready yet
      }
    }, [playing]);

    // Re-sync when startedAt changes (new song loaded by another user)
    useEffect(() => {
      if (startedAt && playerRef.current) {
        performSync();
      }
    }, [startedAt, performSync]);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        if (playerRef.current) {
          try {
            playerRef.current.destroy();
          } catch {
            // ignore cleanup errors
          }
          playerRef.current = null;
        }
      };
    }, []);

    return (
      <div
        ref={containerRef}
        className="absolute top-0 left-0 w-0 h-0 overflow-hidden opacity-0 pointer-events-none"
        aria-hidden="true"
      />
    );
  }
);
