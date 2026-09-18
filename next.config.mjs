/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // keep the native libSQL driver out of the webpack bundle (native .node binary)
  serverExternalPackages: ['@libsql/client'],
  /**
   * Cache policy for small, rarely-changing route assets so repeat visits
   * and PWA installs do not re-fetch them every time. (Static chunks in
   * /_next/ are already content-hashed and cached immutably by the CDN +
   * service worker; these cover the non-hashed routes.)
   */
  async headers() {
    // NOTE: aset di /public tidak content-hash (berbeda dengan chunk /_next),
    // jadi TIDAK memakai "immutable" — max-age 1 hari agar ikon/manifest baru
    // setelah deploy tetap bisa muncul.
    return [
      {
        source: '/icon-192.png',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
      {
        source: '/icon-512.png',
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

