/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // keep the native libSQL driver out of the webpack bundle (native .node binary)
  serverExternalPackages: ['@libsql/client', 'web-push'],
  // Kompressi di edge (gzip/brotli). Explicit agar jelas di production.
  compress: true,
  // Sembunyikan header "X-Powered-By: Next.js"
  poweredByHeader: false,
  // Jangan emit source-map di production (keamanan + bundle lebih kecil)
  productionBrowserSourceMaps: false,
  /**
   * Cache policy untuk route assets (aset di /public TIDAK content-hash,
   * berbeda dengan chunk /_next yang sudah immutable via content-hash):
   * - /sw.js: max-age=0 + must-revalidate → browser selalu revalidate saat
   *   navigasi berikutnya, jadi update service worker tidak stuck di cache.
   * - Gambar (svg/jpg/jpeg/png/gif/ico/webp): 1 tahun immutable.
   *   Pengecualian: ikon PWA & logo & favicon (aturan di bawah) → 1 hari,
   *   agar ganti ikon/logo setelah deploy sampai ke user tanpa perlu ?v=N.
   *   NOTE: untuk ikon yang sudah terkunci immutable di cache user lama,
   *   tambahkan version query (?v=2) di URL pemakai untuk bust cache.
   * - /manifest.json: 1 hari, agar icon PWA baru setelah deploy tetap bisa
   *   muncul.
   */
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
      {
        // API: jangan pernah di-cache (browser/CDN) — data bisnis & auth
        // harus selalu fresh. Service worker juga tidak intercept /api/*.
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
      {
        source: '/:path*.(svg|jpg|jpeg|png|gif|ico|webp)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        // Ikon PWA & logo & favicon: 1 hari (boleh di-revalidate), BUKAN
        // immutable setahun — supaya ikon/logo baru setelah deploy bisa
        // sampai ke user tanpa harus menambah ?v=N di URL pemakai.
        // Pakai source EXACT (bukan pola wildcard) agar 100% lolos validasi
        // routing Vercel; query string tidak memengaruhi pencocokan source
        // (Vercel match based on path), jadi '?v=2' tetap dapat header ini.
        source: '/icon-180.png',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
      {
        source: '/icon-192.png',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
      {
        source: '/icon-512.png',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
      {
        source: '/logo-kopontren.svg',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
      {
        source: '/favicon.ico',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
      {
        source: '/manifest.json',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
    ];
  },
};

export default nextConfig;

