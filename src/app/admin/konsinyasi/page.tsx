import { redirect } from 'next/navigation';
import { currentUser, isManager } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { KonsinyasiClient } from '@/components/admin/konsinyasi-client';

export const dynamic = 'force-dynamic';

export default async function KonsinyasiPage() {
  const user = await currentUser();
  if (!user || !isManager(user)) redirect(user ? '/' : '/login');
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