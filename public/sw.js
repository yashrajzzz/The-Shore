const CACHE_NAME = "the-shore-v2";
const PRECACHE_URLS = [
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Network-first for everything: this app is realtime (chat, playback sync),
// so stale cached HTML/JSON would actively break it. Cache is just an
// offline/flaky-network fallback, never the primary source.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/") || url.origin !== self.location.origin) {
    return;
  }
  // Never intercept heavy media / range requests: caching them doubles memory
  // use and makes video playback stutter. Let the browser handle them.
  if (
    request.headers.has("range") ||
    url.pathname.startsWith("/backgrounds/") ||
    url.pathname.startsWith("/default-backgrounds/") ||
    /\.(mp4|webm|gif|webp)$/i.test(url.pathname)
  ) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request))
  );
});
