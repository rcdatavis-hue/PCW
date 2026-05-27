// PCW Service Worker — caches the app shell for offline use and fast repeat loads
const CACHE = 'pcw-v0.7';

// Files to cache on install
const SHELL = [
  './index.html',
  './manifest.json'
];

// Install: cache the app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL))
  );
  self.skipWaiting();
});

// Activate: delete old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: serve from cache, fall back to network
// CDN resources (fonts, React, Babel) always fetched fresh — only the app shell is cached
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always go to network for CDN resources
  if (url.hostname !== self.location.hostname) {
    return; // let the browser handle it normally
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        // Cache any same-origin responses (e.g. icons)
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
