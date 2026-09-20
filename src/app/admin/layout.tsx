import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Layout /admin/* hanya memastikan login; guard role per-halaman memakai
 * canAccess(user, 'fitur') sesuai matriks permission (src/lib/auth.ts).
 * Contoh: /admin/produk = tier 'stock' (termasuk gudang), /admin/laporan =
 * tier 'laporan' (termasuk pengurus).
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect('/login');
  return <>{children}</>;
}
