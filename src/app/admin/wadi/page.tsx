import { redirect } from 'next/navigation';
import { currentUser, isManager } from '@/lib/auth';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';
import { PageSkeleton } from '@/components/ui';

const WadiClient = lazy(
  () => import('@/components/admin/wadi-client').then((m) => m.WadiClient),
  { loading: () => <PageSkeleton /> }
);

export const dynamic = 'force-dynamic';

export default async function WadiPage() {
  const user = await currentUser();
  if (!user || !isManager(user)) redirect(user ? '/' : '/login');
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        <span className="text-accent-500 dark:text-accent-300">Wadi'ah</span>
      </h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Dana titipan santri (wadi'ah) -- dhana + terpisah, tanpa imbal
        hasil. Setor dan tarik kapan saja (COA 2100).
      </p>
      <WadiClient />
    </Shell>
  );
}