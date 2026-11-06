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
  { url: '/default-backgrounds/home.gif', source: 'default', name: 'Home Vibe' },
  { url: '/default-backgrounds/morning.gif', source: 'default', name: 'Morning Vibe' },
  { url: '/default-backgrounds/night.gif', source: 'default', name: 'Night Vibe' },
  { url: '/default-backgrounds/rainy.gif', source: 'default', name: 'Rainy Vibe' },
  { url: '/default-backgrounds/sunset.gif', source: 'default', name: 'Sunset Vibe' },
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
  'mobile-01.gif', 'mobile-02.gif', 'mobile-03.gif', 'mobile-04.jpg', 'mobile-05.gif', 'mobile-06.gif',
  'mobile-07.jpg', 'mobile-08.gif', 'mobile-09.gif', 'mobile-10.gif', 'mobile-11.gif', 'mobile-12.gif',
].map((file, i) => ({
  url: `/backgrounds/mobile/${file}`,
  source: 'default' as const,
  name: `Mobile ${String(i + 1).padStart(2, '0')}`,
}));

/** Landscape backgrounds bundled with the app (public/backgrounds/desktop). More can be added via the bucket's desktop/ folder. */
export const STATIC_LAPTOP_BACKGROUNDS: BackgroundItem[] = [
  ['fishing-cats-hut.gif', 'Fishing Cats Hut'],
  ['koi-pond.gif', 'Koi Pond'],
  ['cat-on-the-dock.gif', 'Cat On The Dock'],
  ['cat-on-a-leaf.gif', 'Cat On A Leaf'],
  ['cats-by-the-lake.gif', 'Cats By The Lake'],
  ['sword-in-the-meadow.gif', 'Sword In The Meadow'],
  ['laptop-in-the-park.gif', 'Laptop In The Park'],
  ['ivy-porch-bell.gif', 'Ivy Porch Bell'],
  ['autumn-tea-house.gif', 'Autumn Tea House'],
  ['harbor-bicycle.gif', 'Harbor Bicycle'],
  ['poster-wall.gif', 'Poster Wall'],
  ['dusk-vending-machine.gif', 'Dusk Vending Machine'],
  ['night-bridge.gif', 'Night Bridge'],
  ['window-fireworks.gif', 'Window Fireworks'],
  ['rooftop-view.gif', 'Rooftop View'],
].map(([file, name]) => ({
  url: `/backgrounds/desktop/${file}`,
  source: 'default' as const,
  name,
}));
