// PCW Service Worker
// Strategy:
//   index.html  → network-first (always try to get latest, fall back to cache)
//   everything else → cache-first (icons, manifest — rarely change)

const CACHE = 'pcw-v0.7';

self.addEventListener('install', e => {
  // Cache shell assets immediately, but do NOT cache index.html here —
  // network-first means we always want the freshest copy
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(['./manifest.json']))
  );
  // Take over immediately without waiting for old SW to release
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Clear any old caches from previous versions
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always go to network for CDN resources (React, fonts, etc.)
  if (url.hostname !== self.location.hostname) return;

  // index.html — network first, fall back to cache
  // This ensures users always get the latest version when online
  if (url.pathname === '/' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/PCW/')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          // Update cache with fresh copy
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => {
          // Offline fallback — serve cached version
          return caches.match(e.request).then(cached => {
            if (cached) return cached;
            return caches.match('./index.html'); // try root match
          });
        })
    );
    return;
  }

  // Everything else (icons, manifest) — cache first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
