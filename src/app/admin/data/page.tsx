import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';
import { PageSkeleton } from '@/components/ui';

const DataClient = lazy(
  () => import('@/components/admin/data-client').then((m) => m.DataClient),
  {
    loading: () => <PageSkeleton />,
  }
);

export const dynamic = 'force-dynamic';

export default async function DataPage() {
  const user = await currentUser();
  if (!user || user.role !== 'admin') redirect(user ? '/' : '/login');
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        Data & <span className="text-amber-500">Backup</span>
      </h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Cadangkan rutin (mis. tiap akhir bulan) ke folder / WhatsApp agar tidak kehilangan data.
      </p>
      <DataClient />
    </Shell>
  );
}
