'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { isVideoBackground, backgroundPoster, migrateLegacyBackgroundUrl } from '@/utils/backgrounds';

/**
 * Backgrounds are always the viewer's own choice — never the room host's.
 * The pick is saved ONLY in this browser (localStorage key `shore_bg`): no
 * account involved, it never leaves the device. So a phone and a laptop in
 * the same room each show their own background.
 */
type Layer = { urls: string[]; interval: number };

const STORAGE_KEY = 'shore_bg';
const DEFAULT_INTERVAL = 30000;
const EMPTY: Layer = { urls: [], interval: DEFAULT_INTERVAL };

let personal: Layer = EMPTY;
let loaded = false;
// Snapshot must be referentially stable between changes (useSyncExternalStore).
let snapshot: Layer = EMPTY;
const listeners = new Set<() => void>();

function recompute() {
  snapshot = personal;
  listeners.forEach((l) => l());
}

function loadPersonal() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const parsed = JSON.parse(saved);
    const urls: unknown = Array.isArray(parsed) ? parsed : parsed?.urls;
    if (Array.isArray(urls)) {
      personal = {
        urls: urls.filter((u): u is string => typeof u === 'string').map(migrateLegacyBackgroundUrl),
        interval: Number(parsed?.interval) > 0 ? Number(parsed.interval) : DEFAULT_INTERVAL,
      };
      snapshot = personal;
    }
  } catch {
    // Corrupt / blocked storage: just start with no background.
  }
}

function subscribe(cb: () => void) {
  loadPersonal();
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function getSnapshot(): Layer {
  loadPersonal();
  return snapshot;
}

/** Set (and remember on this device) the user's own background. */
export const setGlobalBackground = (urls: string | string[], interval: number = DEFAULT_INTERVAL) => {
  if (typeof window === 'undefined') return;
  loadPersonal();
  const urlArray = Array.isArray(urls) ? urls : [urls];
  personal = { urls: urlArray, interval };
  try {
    if (urlArray.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(personal));
  } catch {
    // Storage full/blocked — background still applies for this session.
  }
  recompute();
};

/** Drop one URL from the live background (e.g. after its file was deleted). */
export const removePersonalBackground = (url: string) => {
  loadPersonal();
  if (!personal.urls.includes(url)) return;
  setGlobalBackground(personal.urls.filter((u) => u !== url), personal.interval);
};

/** Read the saved personal background (for pre-selecting in the picker). */
export const getPersonalBackgroundUrls = (): string[] => {
  loadPersonal();
  return personal.urls;
};

/** Live view of this device's own background pick (for pickers / settings UI). */
export function usePersonalBackground(): Layer {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

const FADE_MS = 1000;

export function GlobalBackground() {
  const { urls, interval } = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const urlsKey = urls.join('|');

  // Only the current slide and the one fading out are mounted — mounting
  // every GIF/video at once made phones stutter.
  const [slide, setSlide] = useState<{ key: string; cur: number; prev: number | null }>({ key: urlsKey, cur: 0, prev: null });

  // Restart from the first slide only when the actual set of images changes
  // (not when just the slideshow speed changes).
  if (slide.key !== urlsKey) setSlide({ key: urlsKey, cur: 0, prev: null });

  const count = urls.length;
  const cur = Math.min(slide.cur, Math.max(count - 1, 0));

  useEffect(() => {
    if (count <= 1) return;
    const t = setInterval(() => {
      setSlide((s) => ({ key: s.key, prev: s.cur, cur: (s.cur + 1) % count }));
    }, interval);
    return () => clearInterval(t);
  }, [count, interval, urlsKey]);

  // Drop the faded-out slide after the crossfade.
  useEffect(() => {
    if (slide.prev === null) return;
    const t = setTimeout(() => setSlide((s) => (s.prev === null ? s : { ...s, prev: null })), FADE_MS + 100);
    return () => clearTimeout(t);
  }, [slide.prev, slide.cur]);

  // Warm the next image so the crossfade doesn't flash while it downloads.
  const preloaded = useRef(new Set<string>());
  useEffect(() => {
    if (count <= 1) return;
    const next = urls[(cur + 1) % count];
    if (!next || isVideoBackground(next) || preloaded.current.has(next)) return;
    preloaded.current.add(next);
    const img = new window.Image();
    img.src = next;
  }, [cur, count, urls]);

  if (count === 0) return null;

  const visible = [slide.prev, cur].filter((i): i is number => i !== null && i < count);

  return (
    <div className="fixed inset-0 z-[-1] overflow-hidden bg-ink">
      {visible.map((index) => {
        const url = urls[index];
        const isActive = index === cur;
        return (
          <div
            key={`${url}-${index}`}
            className="absolute inset-0 bg-ink"
            style={{
              zIndex: isActive ? 2 : 1,
              animation: isActive && slide.prev !== null ? `bg-fade-in ${FADE_MS}ms ease-in-out both` : undefined,
            }}
          >
            {isVideoBackground(url) ? (
              <video
                src={url}
                poster={backgroundPoster(url)}
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                disablePictureInPicture
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full bg-cover bg-no-repeat bg-center"
                style={{ backgroundImage: `url("${url}")` }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
