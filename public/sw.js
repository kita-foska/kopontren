// Kopontren PWA service worker (v8)
// Strategy:
// - Immutable static assets (/_next/static, ikon, logo, gambar): cache-first
// - API GET data referensi aman (/api/products, /api/member-settings):
//   network-first dengan cache fallback (bisa dipakai offline; data bisnis
//   seperti /api/sales & /api/members TIDAK pernah di-cache)
// - Pages & shell: network-first dengan offline fallback
const CACHE = 'kopontren-v9';
const PAGE_CACHE = 'kopontren-pages-v7';
const API_CACHE = 'kopontren-api-v8';
const OFFLINE_FALLBACK = '/login';

// Aset kritis yang diprecache saat install agar shell tetap hidup offline.
const PRECACHE = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/logo-kopontren.svg',
];

// Endpoint GET yang AMAN di-cache: data referensi statis, bukan data
// per-pengguna. Data bisnis (sales, members, kas, shift) tetap
// network-only agar tidak pernah menyajikan angka basi.
const SAFE_API = ['/api/products', '/api/member-settings'];

// Network-first: selalu coba network; simpan respons 2xx ke cache sebagai
// fallback offline. Respons error / opaque tidak pernah di-cache.
function networkFirst(cacheName, req, fallback) {
  return fetch(req)
    .then((res) => {
      if (res.type === 'opaque' || res.status >= 400) return res;
      const copy = res.clone();
      caches.open(cacheName).then((c) => c.put(req, copy));
      return res;
    })
    .catch(() =>
      caches.match(req).then((hit) => hit || caches.match(fallback || OFFLINE_FALLBACK))
    );
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {}))))
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
            .filter(
              (k) =>
                k.startsWith('kopontren') && k !== CACHE && k !== PAGE_CACHE && k !== API_CACHE
            )
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
  // API: default network-only (data bisnis tak boleh pernah basi).
  // Hanya endpoint referensi statis yang boleh network-first + fallback cache.
  if (url.pathname.startsWith('/api/')) {
    if (SAFE_API.some((p) => url.pathname === p)) {
      e.respondWith(networkFirst(API_CACHE, req, null));
    }
    return;
  }
  // Aset statis immutable: cache-first
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icon-') ||
    url.pathname.startsWith('/logo-') ||
    url.pathname === '/manifest.json' ||
    /\.(svg|png|jpe?g|gif|webp|ico)$/i.test(url.pathname)
  ) {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(req).then((hit) => hit || fetch(req).then((res) => (c.put(req, res.clone()), res)))
      )
    );
    return;
  }
  // Pages & shell: network-first dengan offline fallback.
  // Hanya respons 2xx yang di-cache; halaman error & opaque tidak pernah
  // disimpan, jadi deploy yang rusak tidak bisa meracuni fallback offline.
  e.respondWith(networkFirst(PAGE_CACHE, req, OFFLINE_FALLBACK));
});

// ── Web Push: tampilkan notifikasi (ikon, judul, isi, link) ──
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = String(data.title || 'Kopontren');
  const options = {
    body: String(data.body || ''),
    icon: data.icon || '/icon-192.png',
    data: {
      link: (data.data && data.data.link) || '/admin/notifications',
      type: (data.data && data.data.type) || '',
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Klik notifikasi -> fokus jendela terkait / buka halaman tujuan.
self.addEventListener('notificationclick', (event) => {
  event.preventDefault();
  if (event.notification) event.notification.close();
  const link =
    (event.notification && event.notification.data && event.notification.data.link) ||
    '/admin/notifications';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes(link) && 'focus' in w) return w.focus();
      }
      return self.clients.openWindow(link);
    })
  );
});
