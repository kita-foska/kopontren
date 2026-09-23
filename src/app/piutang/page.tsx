import { redirect } from 'next/navigation';
import { canAccess, currentUser } from '@/lib/auth';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';
import { PageSkeleton } from '@/components/ui';

const PiutangClient = lazy(
  () => import('@/components/piutang-client').then((m) => m.PiutangClient),
  {
    loading: () => <PageSkeleton />,
  }
);

export const dynamic = 'force-dynamic';

export default async function PiutangPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  // Tier: piutang (admin, manajer, kasir). Pengurus read-only: tidak ada menu piutang.
  if (!canAccess(user, 'piutang')) redirect('/');
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        Piutang <span className="text-accent-500 dark:text-accent-300">Pelanggan</span>
      </h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Catat piutang pelanggan yang belum lunas & terima pembayaran cicilannya. Otomatis
        menjadi lunas saat sisa = 0.
      </p>
      <PiutangClient admin={canAccess(user, 'piutang')} />
    </Shell>
  );
}
