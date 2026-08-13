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
