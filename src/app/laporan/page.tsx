import { redirect } from 'next/navigation';
import { canAccess, currentUser, isManager } from '@/lib/auth';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';
import { PageSkeleton } from '@/components/ui';

const LaporanClient = lazy(
  () => import('@/components/laporan-client').then((m) => m.LaporanClient),
  {
    loading: () => <PageSkeleton />,
  }
);

export const dynamic = 'force-dynamic';

export default async function LaporanPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  // Tier: laporan (admin, manajer, pengurus). Kasir memakai rekap di Shift.
  if (!canAccess(user, 'laporan')) redirect('/');
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        Laporan & <span className="text-accent-500 dark:text-accent-300">Rekap</span>
      </h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Daftar transaksi, tandai sudah/belum dilapor, dan kirim rekap ke WhatsApp pengurus.
      </p>
      <LaporanClient admin={isManager(user)} />
    </Shell>
  );
}
