import { redirect } from 'next/navigation';
import { canAccess, currentUser, roleHome } from '@/lib/auth';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';
import { PageSkeleton } from '@/components/ui';

const KoperasiClient = lazy(
  () => import('@/components/admin/koperasi-client').then((m) => m.KoperasiClient),
  {
    loading: () => <PageSkeleton />,
  }
);

export const dynamic = 'force-dynamic';

export default async function KoperasiPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  // W4.3 (pola Q3 akad): baca = tier koperasi (admin+manajer) ATAU laporan
  // (termasuk pengurus, read-only). Tulis (anggota/setor/tarik/status/keluar)
  // hanya tier koperasi (admin+manajer; FEATURE_MATRIX W4.3).
  const canWrite = canAccess(user, 'koperasi');
  if (!canWrite && !canAccess(user, 'laporan')) redirect(roleHome(user.role));
  return (
    <Shell user={user}>
      <div className="print-area">
        <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
          Koperasi <span className="text-accent-500 dark:text-accent-300">Anggota</span>
        </h1>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Anggota, simpanan (pokok/wajib/sukarela, Sek.7.1/7.2; skema v24), dan rekap (2050/2060/2070
          + modal/SHU 30xx; distribusi SHU = W4.4). Anggota koperasi BUKAN member loyalty
          (Sek.7.3; dua entitas terpisah). Jurnal auto hanya saat GL aktif (D1).
          Pengurus: read-only (pola Q3 akad).
        </p>
        <KoperasiClient canWrite={canWrite} />
      </div>
    </Shell>
  );
}