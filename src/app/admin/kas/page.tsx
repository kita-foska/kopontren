import { redirect } from 'next/navigation';
import { currentUser, isManager } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { KasClient } from '@/components/admin/kas-client';

export const dynamic = 'force-dynamic';

export default async function KasPage() {
  const user = await currentUser();
  if (!user || !isManager(user)) redirect(user ? '/' : '/login');
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        Pembukuan <span className="text-accent-500 dark:text-accent-300">Kas</span>
      </h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Semua arus kas otomatis tercatat (penjualan, belanja, pengeluaran). Tambahkan jurnal
        manual untuk uang masuk/keluar di luar sistem.
      </p>
      <KasClient />
    </Shell>
  );
}
