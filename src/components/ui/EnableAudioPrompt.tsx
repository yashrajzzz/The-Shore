'use client';

import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import type { YouTubePlayerHandle } from '@/components/ui/YouTubePlayer';

export function EnableAudioPrompt({ roomId, ytPlayerRef, isPlaying = false }: { roomId: string; ytPlayerRef: React.RefObject<YouTubePlayerHandle | null>; isPlaying?: boolean }) {
  const storageKey = `shore_audio_enabled_${roomId}`;

  // Start hidden to match SSR output; show on client if sessionStorage says so
  const [visible, setVisible] = useState<boolean>(false);

  useEffect(() => {
    if (window.sessionStorage.getItem(storageKey)) return;

    const frame = window.requestAnimationFrame(() => {
      setVisible(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [storageKey]);

  const handleEnable = async () => {
    try {
      const player = ytPlayerRef?.current;
      if (player) {
        if (isPlaying) {
          try {
            player.unMute();
            player.playVideo();
            player.resync();
          } catch {}
        } else {
          try {
            player.playVideo();
          } catch {}
          try {
            player.pauseVideo();
          } catch {}
        }
      }
      if (typeof window !== 'undefined') sessionStorage.setItem(storageKey, '1');
    } finally {
      setVisible(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] pointer-events-auto w-[calc(100vw-2rem)] max-w-sm">
      <div className="bg-cream border-2 border-ink px-4 py-3 rounded-2xl shadow-[4px_4px_0_var(--color-ink)] flex flex-wrap items-center justify-center gap-3">
        <div className="text-sm font-mono text-ink text-center">Tap to enable audio for this room</div>
        <Button variant="primary" onClick={handleEnable} className="px-3 py-1">Enable</Button>
      </div>
    </div>
  );
}
