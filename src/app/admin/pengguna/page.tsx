import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';

const PenggunaClient = lazy(
  () => import('@/components/admin/pengguna-client').then((m) => m.PenggunaClient),
  {
    loading: () => (
      <p className="text-sm text-slate-500 dark:text-slate-400">Memuat komponen…</p>
    ),
  }
);

export const dynamic = 'force-dynamic';

export default async function PenggunaPage() {
  const user = await currentUser();
  if (!user || user.role !== 'admin') redirect(user ? '/' : '/login');
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        Pengguna <span className="text-accent-500 dark:text-accent-300">& Akses</span>
      </h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Buat akun kasir, reset password, dan kelola akses. Pengurus membuat semua akun.
      </p>
      <PenggunaClient />
    </Shell>
  );
}
