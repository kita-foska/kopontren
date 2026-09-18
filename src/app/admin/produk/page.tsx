import { redirect } from 'next/navigation';
import { currentUser, isManager } from '@/lib/auth';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';
import { PageSkeleton } from '@/components/ui';

const ProdukClient = lazy(
  () => import('@/components/admin/produk-client').then((m) => m.ProdukClient),
  {
    loading: () => <PageSkeleton />,
  }
);

export const dynamic = 'force-dynamic';

export default async function ProdukPage() {
  const user = await currentUser();
  if (!user || !isManager(user)) redirect(user ? '/' : '/login');
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Produk & Stok</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Kelola katalog, harga jual, HPP, dan stok. Perubahan stok cepat langsung di tabel.
      </p>
      <ProdukClient />
    </Shell>
  );
}
