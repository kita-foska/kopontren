import { redirect } from 'next/navigation';
import { canAccess, currentUser } from '@/lib/auth';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';
import { PageSkeleton } from '@/components/ui';

const BelanjaClient = lazy(
  () => import('@/components/admin/belanja-client').then((m) => m.BelanjaClient),
  {
    loading: () => <PageSkeleton />,
  }
);

export const dynamic = 'force-dynamic';

export default async function BelanjaPage() {
  const user = await currentUser();
  // Tier: supplier (admin, manajer, pembelian).
  if (!user || !canAccess(user, 'supplier')) redirect(user ? '/' : '/login');
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        Belanja &{' '}
        <span className="text-accent-500 dark:text-accent-300">Pengeluaran</span>
      </h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Stok masuk menambah stok & memperbarui HPP. Pengeluaran tercatat di pembukuan kas.
      </p>
      <BelanjaClient />
    </Shell>
  );
}
