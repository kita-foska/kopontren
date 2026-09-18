import { redirect } from 'next/navigation';
import { currentUser, isManager } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { BelanjaClient } from '@/components/admin/belanja-client';

export const dynamic = 'force-dynamic';

export default async function BelanjaPage() {
  const user = await currentUser();
  if (!user || !isManager(user)) redirect(user ? '/' : '/login');
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Belanja & Pengeluaran</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Stok masuk menambah stok & memperbarui HPP. Pengeluaran tercatat di pembukuan kas.
      </p>
      <BelanjaClient />
    </Shell>
  );
}
