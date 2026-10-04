import { redirect } from 'next/navigation';
import { canAccess, currentUser } from '@/lib/auth';
import { roleHome } from '@/lib/features';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';
import { PageSkeleton, TermTip } from '@/components/ui';

const GLClient = lazy(
  () => import('@/components/admin/gl-client').then((m) => m.GLClient),
  {
    loading: () => <PageSkeleton />,
  }
);

export const dynamic = 'force-dynamic';

export default async function GLPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  // Tier: laporan (admin, manajer, pengurus) - sama dgn /admin/rekonsiliasi
  // & /api/neraca. Halaman READ-ONLY: tulis jurnal / pembalikan hanya di
  // /admin/jurnal (tier admin).
  if (!canAccess(user, 'laporan')) redirect(roleHome(user.role));
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        <TermTip
          term="GL"
          tip="General Ledger (GL) = buku besar utama yang memuat semua akun dan mutasinya."
        >
          General Ledger{' '}
          <span className="text-accent-500 dark:text-accent-300">(GL)</span>
        </TermTip>
      </h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        <TermTip tip="Saldo kumulatif tiap akun buku sampai tanggal terpilih; potret posisi harta dan kewajiban toko.">
          Neraca
        </TermTip>{' '}
        saldo kumulatif per akun{' '}
        <TermTip tip="COA (Chart of Accounts) = daftar kode akun buku yang dipakai aplikasi (grup SAK-EP).">
          COA
        </TermTip>{' '}
        (grup SAK-EP) dan daftar mutasi jurnal.
        Read-only: jurnal manual dan pembalikan ada di halaman Jurnal (admin).
      </p>
      <GLClient />
    </Shell>
  );
}
