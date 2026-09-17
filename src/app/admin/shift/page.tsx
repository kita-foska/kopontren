import { redirect } from 'next/navigation';
import { currentUser, isManager } from '@/lib/auth';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';

const ShiftClient = lazy(
  () => import('@/components/admin/shift-client').then((m) => m.ShiftClient),
  {
    loading: () => (
      <p className="text-sm text-slate-500 dark:text-slate-400">Memuat komponen…</p>
    ),
  }
);

export const dynamic = 'force-dynamic';

export default async function ShiftPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  // Riwayat shift: admin (semua kasir) & kasir (shift sendiri). Pengurus tidak.
  if (!isManager(user) && user.role !== 'kasir') redirect('/');
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        Shift & <span className="text-accent-500 dark:text-accent-300">Rekap Kasir</span>
      </h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Buka/tutup shift kasir, lihat riwayat rekap per metode bayar, dan tandai setor kas.
      </p>
      <ShiftClient isAdmin={user.role === 'admin'} />
    </Shell>
  );
}
