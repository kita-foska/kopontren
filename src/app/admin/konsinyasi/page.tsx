import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';

const KonsinyasiClient = lazy(
  () => import('@/components/admin/konsinyasi-client').then((m) => m.KonsinyasiClient),
  {
    loading: () => (
      <p className="text-sm text-slate-500 dark:text-slate-400">Memuat komponen…</p>
    ),
  }
);

export const dynamic = 'force-dynamic';

export default async function KonsinyasiPage() {
  const user = await currentUser();
  // Konsinyasi is admin-only (pengurus is read-only).
  if (!user || user.role !== 'admin') redirect(user ? '/' : '/login');
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Konsinyasi</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Barang titipan dari pemilik (mis. madu) yang dijual atas nama pondok. Catat penjualan,
        pengembalian, dan pembayaran kepada pemilik — pembayaran tercatat di pembukuan kas.
      </p>
      <KonsinyasiClient />
    </Shell>
  );
}