import { redirect } from 'next/navigation';
import { canAccess, currentUser } from '@/lib/auth';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';

const AuditClient = lazy(
  () => import('@/components/admin/audit-client').then((m) => m.AuditClient),
  {
    loading: () => (
      <p className="text-sm text-slate-500 dark:text-slate-400">Memuat komponen…</p>
    ),
  }
);

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  // Tier: audit (admin, pengurus read-only; purge log tetap admin).
  if (!canAccess(user, 'audit')) redirect('/');
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        Audit <span className="text-accent-500 dark:text-accent-300">Trail</span>
      </h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Riwayat perubahan penting: produk, transaksi, kas, pengguna, dan pengaturan.
      </p>
      <AuditClient />
    </Shell>
  );
}
