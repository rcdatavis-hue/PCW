// PCW Service Worker
// Handles: caching, share target, offline fallback

const CACHE = 'pcw-v0.8';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(['./manifest.json']))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // ── Share target: intercept POST to /share-target ──────────────────────────
  if (url.pathname.endsWith('/share-target') && e.request.method === 'POST') {
    e.respondWith((async () => {
      const formData = await e.request.formData();
      const file = formData.get('file');
      if (file) {
        // Send file to all open clients
        const clients = await self.clients.matchAll({ type: 'window' });
        for (const client of clients) {
          client.postMessage({ type: 'SHARE_TARGET', file });
        }
      }
      // Redirect to the app
      return Response.redirect('./index.html', 303);
    })());
    return;
  }

  // Always go to network for CDN resources
  if (url.hostname !== self.location.hostname) return;

  // index.html — network first (always get latest version)
  if (url.pathname === '/' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/PCW/')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // Everything else — cache first
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
