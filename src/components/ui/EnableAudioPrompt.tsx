'use client';

import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import type { YouTubePlayerHandle } from '@/components/ui/YouTubePlayer';

export function EnableAudioPrompt({ roomId, ytPlayerRef }: { roomId: string; ytPlayerRef: React.RefObject<YouTubePlayerHandle | null> }) {
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
      // Attempt to play then pause to prime autoplay permissions
      if (ytPlayerRef?.current?.playVideo) {
        try {
          // don't await to avoid blocking if browser blocks; still a user gesture
          ytPlayerRef.current.playVideo();
        } catch {
          /* play may be blocked but the user gesture will allow it */
        }
        try { ytPlayerRef.current.pauseVideo(); } catch {}
      }
      if (typeof window !== 'undefined') sessionStorage.setItem(storageKey, '1');
    } finally {
      setVisible(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] pointer-events-auto">
      <div className="bg-cream border-2 border-ink px-4 py-3 rounded-2xl shadow-[4px_4px_0_var(--color-ink)] flex items-center gap-3">
        <div className="text-sm font-mono text-ink">Tap to enable audio for this room</div>
        <Button variant="primary" onClick={handleEnable} className="px-3 py-1">Enable</Button>
      </div>
    </div>
  );
}
