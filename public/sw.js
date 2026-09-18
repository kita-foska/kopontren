// Kopontren PWA service worker
// Strategy: cache-first for immutable static assets, network-first for pages
// (offline fallback), network-only for /api (business data never cached).
const CACHE = 'kopontren-v7';
const PAGE_CACHE = 'kopontren-pages-v6';
const OFFLINE_FALLBACK = '/login';

self.addEventListener('install', (e) => {
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('kopontren') && k !== CACHE && k !== PAGE_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // API calls: network only (never cache business data)
  if (url.pathname.startsWith('/api/')) return;
  // Immutable static assets: cache-first
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icon-') ||
    url.pathname.startsWith('/logo-')
  ) {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(req).then((hit) => hit || fetch(req).then((res) => (c.put(req, res.clone()), res)))
      )
    );
    return;
  }
  // Pages & shell: network-first with offline fallback.
  // Only healthy (2xx) responses are cached; error pages & opaque responses
  // are never stored, so a bad deploy can never poison the offline fallback.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.type === 'opaque' || res.status >= 400) return res;
        const copy = res.clone();
        caches.open(PAGE_CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() =>
        caches.match(req).then(
          (hit) =>
            hit ||
            (url.pathname === '/' ? caches.match(OFFLINE_FALLBACK) : caches.match(OFFLINE_FALLBACK))
        )
      )
  );
});
