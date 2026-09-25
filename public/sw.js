// Kopontren PWA service worker (v11)
// Strategy:
// - Immutable static assets (/_next/static, ikon, logo, gambar): cache-first
// - SEMUA /api/*: NETWORK-ONLY (tidak pernah diintercept/di-cache) — data
//   bisnis & auth tidak boleh pernah basi; respon no-store tidak disimpan
//   ke cache. (Sebelumnya /api/products & /api/member-settings di-cache
//   network-first; dihapus total karena respon basi di cache adalah
//   penyebab bug "0 request" saat SW lama masih aktif.)
// - Pages & shell: network-first dengan offline fallback (hanya respons 2xx
//   & tanpa header no-store yang disimpan; no-cache tetap boleh disimpan
//   sebagai fallback offline karena online-nya selalu network-first).
// SW-BUILD marker di-stamp ulang setiap build oleh scripts/inject-sw-version.mjs
// → konten file berubah → browser mendeteksi SW baru → install + skipWaiting
// + clientsClaim → cache lama di-purge saat activate.
// SW-BUILD:21629fd85d09
const CACHE = 'kopontren-v11';
const PAGE_CACHE = 'kopontren-pages-v8';
const OFFLINE_FALLBACK = '/login';

// Aset kritis yang diprecache saat install agar shell tetap hidup offline.
const PRECACHE = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/logo-kopontren.svg',
];

// Network-first: selalu coba network; simpan respons 2xx ke cache sebagai
// fallback offline. Respons error / opaque / no-store tidak pernah di-cache.
function networkFirst(cacheName, req, fallback) {
  return fetch(req)
    .then((res) => {
      if (res.type === 'opaque' || res.status >= 400) return res;
      const cc = (res.headers.get('cache-control') || '').toLowerCase();
      if (cc.includes('no-store')) return res; // jangan pernah simpan no-store
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
                k.startsWith('kopontren') && k !== CACHE && k !== PAGE_CACHE
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
  // API: SELALU network-only — tidak diintercept, tidak di-cache.
  // (Sebelumnya /api/products & /api/member-settings di-cache; dihapus
  // karena cache API basi + SW lama adalah sumber bug "0 request".)
  if (url.pathname.startsWith('/api/')) return;
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
