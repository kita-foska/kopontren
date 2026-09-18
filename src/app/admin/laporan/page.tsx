import { redirect } from 'next/navigation';
import { currentUser, isManager } from '@/lib/auth';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';
import { PageSkeleton } from '@/components/ui';

const LaporanAdminClient = lazy(
  () => import('@/components/admin/laporan-admin-client').then((m) => m.LaporanAdminClient),
  {
    loading: () => <PageSkeleton />,
  }
);

export const dynamic = 'force-dynamic';

export default async function LaporanAdminPage() {
  const user = await currentUser();
  if (!user || !isManager(user)) redirect(user ? '/' : '/login');
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        Laporan <span className="text-accent-500 dark:text-accent-300">Pengurus</span>
      </h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Rekapitulasi penjualan, laba kotor, kas, dan unduhan CSV untuk arsip.
      </p>
      <LaporanAdminClient />
    </Shell>
  );
}
