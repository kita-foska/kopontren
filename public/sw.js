// Kopontren PWA service worker
// Cache-first for immutable static assets, network-first for pages (offline fallback).
// v8: precache the critical PWA shell on install (icons stay available even
// mid-update), cache-first for /favicon.ico too.
const CACHE = 'kopontren-v8';
const PAGE_CACHE = 'kopontren-pages-v8';
const OFFLINE_FALLBACK = '/login';
const PRECACHE = ['/manifest.json', '/icon-192.png', '/favicon.ico'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
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
    url.pathname.startsWith('/_next/image') ||
    url.pathname.startsWith('/icon-') ||
    url.pathname.startsWith('/logo-') ||
    url.pathname === '/favicon.ico'
  ) {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(req).then((hit) =>
          hit ||
          fetch(req).then((res) => {
            // only cache real successes, never opaque (CORS) or error responses
            if (res.ok && res.type !== 'opaque') c.put(req, res.clone());
            return res;
          })
        )
      )
    );
    return;
  }
  // Pages & shell: network-first with offline fallback
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type !== 'opaque') {
          const copy = res.clone();
          caches.open(PAGE_CACHE).then((c) => c.put(req, copy));
        }
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
