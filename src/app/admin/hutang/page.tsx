import { redirect } from 'next/navigation';
import { currentUser, isAdmin } from '@/lib/auth';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';

const HutangClient = lazy(
  () => import('@/components/admin/hutang-client').then((m) => m.HutangClient),
  {
    loading: () => (
      <p className="text-sm text-slate-500 dark:text-slate-400">Memuat komponen…</p>
    ),
  }
);

export const dynamic = 'force-dynamic';

export default async function HutangPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  // Layout /admin sudah menjamin admin/pengurus (isManager).
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        Hutang <span className="text-accent-500 dark:text-accent-300">Supplier</span>
      </h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Catat utang dagang ke supplier & bayar cicilan — setiap pembayaran otomatis
        tercatat sebagai kas keluar. Otomatis menjadi lunas saat sisa = 0.
      </p>
      <HutangClient admin={isAdmin(user)} />
    </Shell>
  );
}
