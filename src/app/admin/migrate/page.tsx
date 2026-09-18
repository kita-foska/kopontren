import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';
import { PageSkeleton } from '@/components/ui';

const MigrateClient = lazy(
  () => import('@/components/admin/migrate-client').then((m) => m.MigrateClient),
  {
    loading: () => <PageSkeleton />,
  }
);

export const dynamic = 'force-dynamic';

/**
 * /admin/migrate — import produk dari file CSV/Excel (hanya ADMIN).
 * Halaman tipis: otorisasi di sini; upload/preview/progress di client.
 */
export default async function MigratePage() {
  const user = await currentUser();
  if (!user || user.role !== 'admin') redirect(user ? '/' : '/login');
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        Import Data <span className="text-accent-500 dark:text-accent-300">Produk (CSV)</span>
      </h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Unggah file CSV produk (kolom: <code>name, category, unit, base_price, cost_price, stock, barcode</code>).
        Duplikat diperlakukan sebagai <b>update</b> (upsert berdasarkan barcode), bukan baris baru.
      </p>
      <MigrateClient />
    </Shell>
  );
}
