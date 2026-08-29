'use client';

import { listDefaultBackgrounds, listUserBackgrounds } from '@/app/actions/backgrounds';
import type { BackgroundItem } from '@/utils/backgrounds';

type Library = {
  defaults: BackgroundItem[];
  userItems: BackgroundItem[];
  userError?: string;
};

const TTL_MS = 5 * 60 * 1000;

let cached: Library | null = null;
let fetchedAt = 0;
let inFlight: Promise<Library> | null = null;

async function fetchLibrary(): Promise<Library> {
  const [defaultItems, userResult] = await Promise.all([
    listDefaultBackgrounds(),
    listUserBackgrounds(),
  ]);
  const lib: Library = { defaults: defaultItems, userItems: userResult.items, userError: userResult.error };
  cached = lib;
  fetchedAt = Date.now();
  return lib;
}

/** Cached copy if we have one, regardless of freshness — for instant paint on remount. */
export function getCachedLibrary(): Library | null {
  return cached;
}

/**
 * Resolves with the background library. Serves a fresh cache instantly with
 * no network call; a stale/missing cache triggers exactly one in-flight
 * fetch that concurrent callers share, so re-opening the picker repeatedly
 * doesn't fire duplicate requests.
 */
export async function getBackgroundLibrary(opts: { force?: boolean } = {}): Promise<Library> {
  if (!opts.force && cached && Date.now() - fetchedAt < TTL_MS) {
    return cached;
  }
  if (inFlight) return inFlight;

  inFlight = fetchLibrary().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Call after an upload/delete so the next read picks up the change. */
export function invalidateBackgroundLibrary() {
  fetchedAt = 0;
}
