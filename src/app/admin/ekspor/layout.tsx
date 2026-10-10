import type { Metadata } from 'next';

/**
 * P3d -- layout rute /admin/ekspor: metadata (ID, admin). Login guard +
 * role tier tetap di /admin/layout.tsx + page.tsx (isAdmin, admin-only).
 */
export const metadata: Metadata = {
  title: 'Ekspor',
  description: 'Pusat ekspor administrasi: unduh CSV modul & cetak laporan formal.',
};

export default function EksporLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}