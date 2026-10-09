import { redirect } from 'next/navigation';
import { canAccess, currentUser, roleHome } from '@/lib/auth';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';
import { PageSkeleton } from '@/components/ui';

const PersetujuanClient = lazy(
  () => import('@/components/admin/persetujuan-client').then((m) => m.PersetujuanClient),
  {
    loading: () => <PageSkeleton />,
  }
);

export const dynamic = 'force-dynamic';

export default async function PersetujuanPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  // P2/Q62: tier admin (matriks FEATURE_MATRIX 'approvals' = ['admin']);
  // guard-fail -> role-aware (member -> /member; role internal -> /).
  if (!canAccess(user, 'approvals')) redirect(roleHome(user.role));
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        Alur <span className="text-accent-500 dark:text-accent-300">Persetujuan</span>
      </h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Tindakan besar menunggu keputusan: buat akun admin, ubah peran, aktif/nonaktifkan
        pengguna, jurnal pembalik, hapus jurnal kas. Dua orang: pemohon tidak memutus
        permintaannya sendiri.
      </p>
      <PersetujuanClient />
    </Shell>
  );
}