'use server';

import { createClient } from '@/utils/supabase/server';
import {
  MAX_BACKGROUNDS_PER_FOLDER,
  STATIC_DEFAULT_BACKGROUNDS,
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

export async function listUserBackgrounds(): Promise<{ items: BackgroundItem[]; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { items: [], error: 'Not authenticated' };
  }

  const items = await listStorageBackgrounds(supabase, `users/${user.id}`, 'user');
  return { items };
}

export async function deleteUserBackground(storagePath: string): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  const expectedPrefix = `users/${user.id}/`;
  if (!storagePath.startsWith(expectedPrefix)) {
    return { error: 'You can only delete your own backgrounds' };
  }

  const { error } = await supabase.storage.from('backgrounds').remove([storagePath]);
  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function getUserBackgroundCount(): Promise<number> {
  const { items } = await listUserBackgrounds();
  return items.length;
}

export async function uploadUserBackground(formData: FormData): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) {
    return { error: 'No file provided' };
  }

  const currentCount = await getUserBackgroundCount();
  if (currentCount >= MAX_BACKGROUNDS_PER_FOLDER) {
    return { error: `Your library is full (${MAX_BACKGROUNDS_PER_FOLDER}/${MAX_BACKGROUNDS_PER_FOLDER}). Delete one to upload more.` };
  }

  const ext = file.name.split('.').pop() || 'png';
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const filePath = `users/${user.id}/${fileName}`;

  const { error } = await supabase.storage
    .from('backgrounds')
    .upload(filePath, file);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
