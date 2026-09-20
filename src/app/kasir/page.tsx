import { redirect } from 'next/navigation';
import { canAccess, currentUser, isManager } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { PosLazy } from '@/components/pos-lazy';

export const dynamic = 'force-dynamic';

export default async function KasirPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  // Tier: POS (admin, manajer, kasir).
  if (!canAccess(user, 'pos')) redirect('/');
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        Kasir <span className="text-accent-500 dark:text-accent-300">POS</span>
      </h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Pilih produk, isi nama pembeli & metode bayar, lalu simpan. Transaksi otomatis berstatus
        menunggu laporan.
      </p>
      <PosLazy admin={isManager(user)} cashier={user.display_name || user.username} />
    </Shell>
  );
}
