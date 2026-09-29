import { redirect } from 'next/navigation';
import { canAccess, currentUser, roleHome } from '@/lib/auth';
import { Shell } from '@/components/shell';
import lazy from 'next/dynamic';
import { PageSkeleton } from '@/components/ui';

const RekonsiliasiClient = lazy(
  () => import('@/components/admin/rekonsiliasi-client').then((m) => m.RekonsiliasiClient),
  {
    loading: () => <PageSkeleton />,
  }
);

export const dynamic = 'force-dynamic';

export default async function RekonsiliasiPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  // Tier: laporan (admin, manajer, pengurus) — sama dgn /admin/laporan
  // & /api/neraca. HALAMAN READ-ONLY (flag-only): tidak ada aksi tulis
  // sama sekali di sini (keputusan P0-C3, anti dobel-sumber kebenaran).
  if (!canAccess(user, 'laporan')) redirect(roleHome(user.role));
  return (
    <Shell user={user}>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        Rekonsiliasi <span className="text-accent-500 dark:text-accent-300">Data</span>
      </h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Cek konsistensi finansial — flag-only, tanpa auto-fix: penjualan vs pembayaran, kas &amp;
        shif, stok &amp; retur, piutang/hutang, poin &amp; reward, konsinyasi.
      </p>
      <RekonsiliasiClient />
    </Shell>
  );
}
