import { redirect } from 'next/navigation';
import { currentUser, isManager } from '@/lib/auth';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';

const PosClient = lazy(() => import('@/components/pos-client').then((m) => m.PosClient), {
  loading: () => (
    <p className="text-sm text-slate-500 dark:text-slate-400">Memuat komponen…</p>
  ),
});

export const dynamic = 'force-dynamic';

export default async function KasirPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  // Pengurus is read-only: POS is inaccessible -> send back to dashboard.
  if (user.role === 'pengurus') redirect('/');
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        Kasir <span className="text-accent-500 dark:text-accent-300">POS</span>
      </h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Pilih produk, isi nama pembeli & metode bayar, lalu simpan. Transaksi otomatis berstatus
        menunggu laporan.
      </p>
      <PosClient admin={isManager(user)} cashier={user.display_name || user.username} />
    </Shell>
  );
}
