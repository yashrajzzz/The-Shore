'use client';
import { useState, useEffect } from 'react';

export const setGlobalBackground = (urls: string | string[], interval: number = 30000) => {
  const urlArray = Array.isArray(urls) ? urls : [urls];
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('backgroundChange', { detail: { urls: urlArray, interval } }));
    localStorage.setItem('shore_bg', JSON.stringify({ urls: urlArray, interval }));
  }
};

export function GlobalBackground() {
  const [bgUrls, setBgUrls] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem('shore_bg');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && parsed.urls) return parsed.urls;
      return [];
    } catch {
      return [saved];
    }
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [timerInterval, setTimerInterval] = useState<number>(() => {
    if (typeof window === 'undefined') return 30000;
    const saved = localStorage.getItem('shore_bg');
    if (!saved) return 30000;
    try {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.interval) return parsed.interval;
      return 30000;
    } catch {
      return 30000;
    }
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ urls: string[]; interval?: number }>;
      if (ce?.detail) {
        setBgUrls(Array.isArray(ce.detail.urls) ? ce.detail.urls : [String(ce.detail.urls)]);
        if (ce.detail.interval) setTimerInterval(ce.detail.interval);
        setCurrentIndex(0);
      }
    };
    window.addEventListener('backgroundChange', handler);
    return () => window.removeEventListener('backgroundChange', handler);
  }, []);

  // Timer for Slideshow
  useEffect(() => {
    if (bgUrls.length <= 1) return;
    
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % bgUrls.length);
    }, timerInterval);

    return () => clearInterval(interval);
  }, [bgUrls, timerInterval]);

  if (bgUrls.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[-1] overflow-hidden bg-ink">
      {bgUrls.map((url, index) => {
        const isVideo = url.toLowerCase().endsWith('.mp4') || url.toLowerCase().endsWith('.webm');
        const isActive = index === currentIndex;

        return (
          <div 
            key={url + index}
            className={`absolute inset-0 transition-opacity duration-1000 ${isActive ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
          >
            {isVideo ? (
              <video 
                src={url} 
                autoPlay 
                loop 
                muted 
                playsInline
                className="w-full h-full object-cover"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <div 
                className="w-full h-full bg-cover bg-no-repeat bg-center"
                style={{ backgroundImage: `url('${url}')`, imageRendering: 'pixelated' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
