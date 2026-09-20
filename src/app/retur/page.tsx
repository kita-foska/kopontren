import { redirect } from 'next/navigation';
import { canAccess, currentUser } from '@/lib/auth';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';

const ReturClient = lazy(
  () => import('@/components/retur-client').then((m) => m.ReturClient),
  {
    loading: () => (
      <p className="text-sm text-slate-500 dark:text-slate-400">Memuat komponen…</p>
    ),
  }
);

export const dynamic = 'force-dynamic';

export default async function ReturPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  // Tier: retur ikut POS (admin, manajer, kasir). Kasir hanya transaksi sendiri (API).
  if (!canAccess(user, 'pos')) redirect('/');
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        Retur <span className="text-accent-500 dark:text-accent-300">Penjualan</span>
      </h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Kembalikan barang ke stok dari transaksi tertentu. Bila diberi refund, otomatis tercatat
        di jurnal kas keluar.
      </p>
      <ReturClient />
    </Shell>
  );
}
