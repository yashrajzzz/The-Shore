export const MAX_BACKGROUNDS_PER_FOLDER = 5;

export const BACKGROUND_ACCEPT = 'image/*,video/mp4,video/webm';

export type BackgroundItem = {
  url: string;
  path?: string;
  source: 'default' | 'user';
  name?: string;
};

/** Built-in defaults served from /public/default-backgrounds/ (max 5). */
export const STATIC_DEFAULT_BACKGROUNDS: BackgroundItem[] = [
  { url: '/default-backgrounds/home.mp4', source: 'default', name: 'Home Vibe' },
  { url: '/default-backgrounds/morning.mp4', source: 'default', name: 'Morning Vibe' },
  { url: '/default-backgrounds/night.mp4', source: 'default', name: 'Night Vibe' },
  { url: '/default-backgrounds/rainy.mp4', source: 'default', name: 'Rainy Vibe' },
  { url: '/default-backgrounds/sunset.mp4', source: 'default', name: 'Sunset Vibe' },
];

export function userBackgroundPath(userId: string, fileName: string) {
  return `users/${userId}/${fileName}`;
}

export function isVideoBackground(url: string) {
  const lower = url.toLowerCase();
  return lower.endsWith('.mp4') || lower.endsWith('.webm');
}

/** Admin-curated catalogs live in the `backgrounds` bucket under desktop/ and mobile/. */
export type BackgroundDevice = 'desktop' | 'mobile';

/** How many catalog thumbnails to show before "Load more". */
export const CATALOG_PAGE_SIZE = 18;

export const CATALOG_MAX_FILES = 1000;

const MEDIA_EXT = /\.(png|jpe?g|gif|webp|avif|mp4|webm)$/i;
export function isBackgroundMedia(fileName: string) {
  return MEDIA_EXT.test(fileName);
}

/** GIFs and videos count as "Animated"; everything else is a static image. */
export function isAnimatedBackground(url: string) {
  return /\.(gif|mp4|webm)(\?|#|$)/i.test(url);
}

/** Portrait backgrounds bundled with the app (public/backgrounds/mobile). More can be added via the bucket's mobile/ folder. */
export const STATIC_MOBILE_BACKGROUNDS: BackgroundItem[] = [
  'mobile-01.mp4', 'mobile-02.mp4', 'mobile-03.mp4', 'mobile-04.jpg', 'mobile-05.mp4', 'mobile-06.mp4',
  'mobile-07.jpg', 'mobile-08.mp4', 'mobile-09.mp4', 'mobile-10.mp4', 'mobile-11.mp4', 'mobile-12.mp4',
].map((file, i) => ({
  url: `/backgrounds/mobile/${file}`,
  source: 'default' as const,
  name: `Mobile ${String(i + 1).padStart(2, '0')}`,
}));

/** Landscape backgrounds bundled with the app (public/backgrounds/desktop). More can be added via the bucket's desktop/ folder. */
export const STATIC_LAPTOP_BACKGROUNDS: BackgroundItem[] = [
  ['fishing-cats-hut.mp4', 'Fishing Cats Hut'],
  ['cat-on-the-dock.mp4', 'Cat On The Dock'],
  ['cats-by-the-lake.mp4', 'Cats By The Lake'],
  ['laptop-in-the-park.mp4', 'Laptop In The Park'],
  ['ivy-porch-bell.mp4', 'Ivy Porch Bell'],
  ['autumn-tea-house.mp4', 'Autumn Tea House'],
  ['harbor-bicycle.mp4', 'Harbor Bicycle'],
  ['night-bridge.mp4', 'Night Bridge'],
].map(([file, name]) => ({
  url: `/backgrounds/desktop/${file}`,
  source: 'default' as const,
  name,
}));

/**
 * Tiny still preview (webp) for bundled video backgrounds, so pickers show a
 * 10KB image instead of downloading the video. Uploaded videos have none.
 */
export function backgroundPoster(url: string): string | undefined {
  if (!/^\/(backgrounds|default-backgrounds)\/.+\.mp4$/i.test(url)) return undefined;
  return url.replace(/\.mp4$/i, '.webp');
}

/** Bundled GIFs were converted to MP4; map old saved URLs to the new files. */
export function migrateLegacyBackgroundUrl(url: string): string {
  return /^\/(backgrounds|default-backgrounds)\/.+\.gif$/i.test(url) ? url.replace(/\.gif$/i, '.mp4') : url;
}
