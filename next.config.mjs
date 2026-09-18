/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // keep the native libSQL driver out of the webpack bundle (native .node binary)
  serverExternalPackages: ['@libsql/client'],
  // gzip/br responses for static & HTML on self-hosted runs (Vercel already compresses)
  compress: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  // Cache-control policy (mobile: low-end phones should re-request nothing).
  // sw.js & manifest.json stay no-cache so PWA updates reach users on next visit.
  async headers() {
    return [
      // Content-hashed JS/CSS chunks: immutable for 1 year.
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      // PWA icons / logo / favicon: not content-hashed -> 1 month.
      {
        source: '/icon-180.png',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000' }],
      },
      {
        source: '/icon-192.png',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000' }],
      },
      {
        source: '/icon-512.png',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000' }],
      },
      {
        source: '/logo-kopontren.png',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000' }],
      },
      {
        source: '/favicon.ico',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000' }],
      },
      // Service worker & manifest: never cache, so PWA updates reach users
      // on their next visit (sw.js update flow depends on this).
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
      {
        source: '/manifest.json',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
    ];
  },
  // let next/image serve WebP on modern phones (PNG stays as automatic fallback)
  images: {
    formats: ['image/webp'],
    minimumCacheTTL: 60,
  },
};

export default nextConfig;

