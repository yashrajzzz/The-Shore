'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

export function FullscreenToggleButton() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  // useSyncExternalStore keeps SSR and the first client render identical
  // (unsupported), then switches to the real value — avoids a hydration mismatch.
  const isSupported = useSyncExternalStore(
    () => () => {},
    () => Boolean(document.fullscreenEnabled || document.documentElement?.requestFullscreen),
    () => false,
  );

  useEffect(() => {
    const handleChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  if (!isSupported) return null;

  const handleToggle = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Fullscreen can be denied (e.g. no user-gesture context, iframe
      // without allowfullscreen, or browser policy) — fail silently rather
      // than surface a jarring error for a purely cosmetic feature.
    }
  };

  // Mobile-first: on phones/touch devices this floating button only covers
  // content (and the browser / installed PWA is already effectively
  // full-screen), so it is hidden there and only shown on larger,
  // pointer-driven screens.
  return (
    <div className="group fixed bottom-6 left-6 z-50 hidden md:block pointer-coarse:hidden">
      <div className="pointer-events-none absolute bottom-full left-0 mb-3 whitespace-nowrap rounded-md border-2 border-ink bg-ink px-2.5 py-1.5 font-mono text-[10px] font-bold text-paper opacity-0 shadow-[2px_2px_0_var(--color-coral)] transition-all duration-150 group-hover:opacity-100">
        {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
      </div>
      <button
        onClick={handleToggle}
        className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-ink bg-teal-3 shadow-[4px_4px_0_var(--color-ink)] transition-transform duration-200 ease-[cubic-bezier(.34,1.56,.64,1)] hover:-translate-y-1.5 hover:scale-110 hover:-rotate-3 hover:shadow-[6px_6px_0_var(--color-ink)] active:scale-95 active:rotate-0"
        title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
        aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
      >
        {isFullscreen ? <Minimize2 size={26} strokeWidth={2.25} /> : <Maximize2 size={26} strokeWidth={2.25} />}
      </button>
    </div>
  );
}
