'use client';

import { listCatalogBackgrounds, listUserBackgrounds } from '@/app/actions/backgrounds';
import type { BackgroundDevice, BackgroundItem } from '@/utils/backgrounds';

const TTL_MS = 5 * 60 * 1000;

type Entry<T> = { value: T | null; at: number; inFlight: Promise<T> | null };

function makeEntry<T>(): Entry<T> {
  return { value: null, at: 0, inFlight: null };
}

const catalogEntries: Record<BackgroundDevice, Entry<BackgroundItem[]>> = {
  desktop: makeEntry(),
  mobile: makeEntry(),
};
type UserLib = { items: BackgroundItem[]; error?: string };
const userEntries: Record<BackgroundDevice, Entry<UserLib>> = {
  desktop: makeEntry(),
  mobile: makeEntry(),
};

/** Shared "fresh cache or one in-flight fetch" logic so repeat opens never refetch. */
async function load<T>(entry: Entry<T>, fetcher: () => Promise<T>, force = false): Promise<T> {
  if (!force && entry.value && Date.now() - entry.at < TTL_MS) return entry.value;
  if (entry.inFlight) return entry.inFlight;
  entry.inFlight = fetcher()
    .then((v) => {
      entry.value = v;
      entry.at = Date.now();
      return v;
    })
    .finally(() => {
      entry.inFlight = null;
    });
  return entry.inFlight;
}

/** Cached copy regardless of freshness — for instant paint on remount. */
export function getCachedCatalog(device: BackgroundDevice): BackgroundItem[] | null {
  return catalogEntries[device].value;
}

export function getCachedUserLibrary(device: BackgroundDevice) {
  return userEntries[device].value;
}

export function getCatalog(device: BackgroundDevice, force = false) {
  return load(catalogEntries[device], () => listCatalogBackgrounds(device), force);
}

export function getUserLibrary(device: BackgroundDevice, force = false) {
  return load(userEntries[device], () => listUserBackgrounds(device), force);
}

/** Call after an upload/delete so the next read picks up the change. */
export function invalidateBackgroundLibrary(device?: BackgroundDevice) {
  if (device) userEntries[device].at = 0;
  else {
    userEntries.desktop.at = 0;
    userEntries.mobile.at = 0;
  }
}
