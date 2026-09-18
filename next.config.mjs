/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // keep the native libSQL driver out of the webpack bundle (native .node binary)
  serverExternalPackages: ['@libsql/client'],
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
   *   NOTE: kalau ikon/logo diganti, tambahkan version query (?v=2) di URL
   *   pemakai untuk bust cache immutable.
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
        source: '/:path*.(svg|jpg|jpeg|png|gif|ico|webp)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/manifest.json',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
    ];
  },
};

export default nextConfig;

