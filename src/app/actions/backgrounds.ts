'use server';

import { createClient } from '@/utils/supabase/server';
import {
  CATALOG_MAX_FILES,
  MAX_BACKGROUNDS_PER_FOLDER,
  STATIC_DEFAULT_BACKGROUNDS,
  STATIC_LAPTOP_BACKGROUNDS,
  STATIC_MOBILE_BACKGROUNDS,
  isBackgroundMedia,
  type BackgroundDevice,
  type BackgroundItem,
} from '@/utils/backgrounds';

async function listStorageBackgrounds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  prefix: string,
  source: 'default' | 'user'
): Promise<BackgroundItem[]> {
  const { data, error } = await supabase.storage
    .from('backgrounds')
    .list(prefix, { limit: MAX_BACKGROUNDS_PER_FOLDER, sortBy: { column: 'created_at', order: 'asc' } });

  if (error || !data) return [];

  return data
    .filter((file) => file.name && !file.name.startsWith('.'))
    .slice(0, MAX_BACKGROUNDS_PER_FOLDER)
    .map((file) => {
      const path = `${prefix}/${file.name}`;
      const { data: urlData } = supabase.storage.from('backgrounds').getPublicUrl(path);
      return {
        url: urlData.publicUrl,
        path,
        source,
        name: file.name,
      };
    });
}

export async function listDefaultBackgrounds(): Promise<BackgroundItem[]> {
  const supabase = await createClient();
  const storageDefaults = await listStorageBackgrounds(supabase, 'defaults', 'default');

  const seen = new Set<string>();
  const merged: BackgroundItem[] = [];

  for (const item of [...STATIC_DEFAULT_BACKGROUNDS, ...storageDefaults]) {
    if (seen.has(item.url) || merged.length >= MAX_BACKGROUNDS_PER_FOLDER) continue;
    seen.add(item.url);
    merged.push(item);
  }

  return merged;
}

/**
 * The big curated catalog for a device type. Files are dropped into the
 * `backgrounds` bucket under `desktop/` or `mobile/` (via the Supabase
 * dashboard) and show up here automatically, no redeploy needed.
 * Bundled built-in sets (public/backgrounds/mobile, public/default-backgrounds) are listed first.
 */
export async function listCatalogBackgrounds(device: BackgroundDevice): Promise<BackgroundItem[]> {
  if (device !== 'desktop' && device !== 'mobile') return [];
  const supabase = await createClient();

  const { data, error } = await supabase.storage
    .from('backgrounds')
    .list(device, { limit: CATALOG_MAX_FILES, sortBy: { column: 'name', order: 'asc' } });

  const fromStorage: BackgroundItem[] = error || !data
    ? []
    : data
        .filter((f) => f.name && !f.name.startsWith('.') && isBackgroundMedia(f.name))
        .map((f) => {
          const path = `${device}/${f.name}`;
          const { data: urlData } = supabase.storage.from('backgrounds').getPublicUrl(path);
          return {
            url: urlData.publicUrl,
            path,
            source: 'default' as const,
            name: f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
          };
        });

  const base = device === 'desktop' ? [...STATIC_DEFAULT_BACKGROUNDS, ...STATIC_LAPTOP_BACKGROUNDS] : STATIC_MOBILE_BACKGROUNDS;
  const seen = new Set<string>();
  return [...base, ...fromStorage].filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

export async function listUserBackgrounds(
  device: BackgroundDevice = 'desktop'
): Promise<{ items: BackgroundItem[]; error?: string }> {
  if (device !== 'desktop' && device !== 'mobile') return { items: [], error: 'Invalid device' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { items: [], error: 'Not authenticated' };
  }

  // Each device has its own 5-slot library: users/{uid}/desktop and users/{uid}/mobile.
  const items = await listStorageBackgrounds(supabase, `users/${user.id}/${device}`, 'user');

  // Older uploads lived directly in users/{uid}/ — treat them as laptop ones.
  if (device === 'desktop') {
    const { data: legacy } = await supabase.storage
      .from('backgrounds')
      .list(`users/${user.id}`, { limit: 100 });
    for (const file of legacy ?? []) {
      if (!file.id || !file.name || file.name.startsWith('.') || !isBackgroundMedia(file.name)) continue;
      const path = `users/${user.id}/${file.name}`;
      const { data: urlData } = supabase.storage.from('backgrounds').getPublicUrl(path);
      items.push({ url: urlData.publicUrl, path, source: 'user', name: file.name });
    }
  }

  return { items: items.slice(0, MAX_BACKGROUNDS_PER_FOLDER) };
}

export async function deleteUserBackground(storagePath: string): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  const expectedPrefix = `users/${user.id}/`;
  if (!storagePath.startsWith(expectedPrefix) || storagePath.includes('..')) {
    return { error: 'You can only delete your own backgrounds' };
  }

  const { error } = await supabase.storage.from('backgrounds').remove([storagePath]);
  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function uploadUserBackground(formData: FormData): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  const device = formData.get('device');
  if (device !== 'desktop' && device !== 'mobile') {
    return { error: 'Invalid device type' };
  }

  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) {
    return { error: 'No file provided' };
  }
  if (!isBackgroundMedia(file.name)) {
    return { error: 'Unsupported file type' };
  }

  const { items } = await listUserBackgrounds(device);
  if (items.length >= MAX_BACKGROUNDS_PER_FOLDER) {
    return { error: `Your ${device === 'mobile' ? 'mobile' : 'laptop'} library is full (${MAX_BACKGROUNDS_PER_FOLDER}/${MAX_BACKGROUNDS_PER_FOLDER}). Delete one to upload more.` };
  }

  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const filePath = `users/${user.id}/${device}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from('backgrounds')
    .upload(filePath, file);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
