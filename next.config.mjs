/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // keep the native libSQL driver out of the webpack bundle (native .node binary)
  serverExternalPackages: ['@libsql/client'],
  // gzip/br responses for static & HTML on self-hosted runs (Vercel already compresses)
  compress: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  // let next/image serve WebP on modern phones (PNG stays as automatic fallback)
  images: {
    formats: ['image/webp'],
    minimumCacheTTL: 60,
  },
};

export default nextConfig;

